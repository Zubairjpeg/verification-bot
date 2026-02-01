/**
 * OCR Module for MapleStory Screenshot Processing
 * Supports Google Cloud Vision (recommended) and Tesseract.js (fallback)
 */

const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const https = require('https');
const http = require('http');
const config = require('./config');

// Tesseract worker instance
let worker = null;

/**
 * Initialize Tesseract worker
 */
async function initWorker() {
  if (worker) return worker;

  worker = await Tesseract.createWorker(config.OCR_LANGUAGE);
  await worker.setParameters({
    tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT,
  });

  console.log('✅ Tesseract worker initialized');
  return worker;
}

/**
 * Download image from URL to buffer
 */
async function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    const request = protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        return downloadImage(response.headers.location).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        return reject(new Error(`Failed to download image: ${response.statusCode}`));
      }

      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    });

    request.on('error', reject);
    request.setTimeout(30000, () => {
      request.destroy();
      reject(new Error('Image download timeout'));
    });
  });
}

/**
 * Call Google Cloud Vision API for OCR
 */
async function googleVisionOCR(imageBuffer) {
  const apiKey = process.env.GOOGLE_CLOUD_API_KEY;
  if (!apiKey) {
    console.log('[Google Vision] No API key configured');
    return null;
  }

  console.log('[Google Vision] API key found, making request...');
  const base64Image = imageBuffer.toString('base64');

  const requestBody = JSON.stringify({
    requests: [{
      image: { content: base64Image },
      features: [{ type: 'TEXT_DETECTION', maxResults: 10 }],
    }],
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'vision.googleapis.com',
      path: `/v1/images:annotate?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);

          // Log any errors from Google Vision
          if (response.error) {
            console.error('[Google Vision] API Error:', response.error.message);
            resolve(null);
            return;
          }

          if (response.responses?.[0]?.error) {
            console.error('[Google Vision] Response Error:', response.responses[0].error.message);
            resolve(null);
            return;
          }

          // Get the text
          const fullText = response.responses?.[0]?.fullTextAnnotation?.text;
          const textAnnotation = response.responses?.[0]?.textAnnotations?.[0]?.description;

          if (fullText) {
            console.log('[Google Vision] Success! Found text:', fullText.substring(0, 100));
            resolve({
              text: fullText,
              confidence: 95,
            });
          } else if (textAnnotation) {
            console.log('[Google Vision] Success (annotations)! Found text:', textAnnotation.substring(0, 100));
            resolve({
              text: textAnnotation,
              confidence: 95,
            });
          } else {
            console.log('[Google Vision] No text found in image');
            console.log('[Google Vision] Full response:', JSON.stringify(response).substring(0, 500));
            resolve(null);
          }
        } catch (e) {
          console.error('[Google Vision] Parse error:', e.message);
          reject(e);
        }
      });
    });

    req.on('error', (e) => {
      console.error('[Google Vision] Request error:', e.message);
      reject(e);
    });

    req.write(requestBody);
    req.end();
  });
}

/**
 * Create preprocessed image variants for Tesseract
 */
async function createPreprocessedVariants(imageBuffer) {
  const variants = [];
  const metadata = await sharp(imageBuffer).metadata();
  const scale = Math.min(2, 3000 / metadata.width);

  // Variant 1: High contrast
  variants.push(await sharp(imageBuffer)
    .resize(Math.round(metadata.width * scale))
    .grayscale()
    .linear(2.5, -180)
    .sharpen({ sigma: 2 })
    .png()
    .toBuffer());

  // Variant 2: Threshold black/white
  variants.push(await sharp(imageBuffer)
    .resize(Math.round(metadata.width * scale))
    .grayscale()
    .threshold(160)
    .png()
    .toBuffer());

  // Variant 3: Inverted for light text
  variants.push(await sharp(imageBuffer)
    .resize(Math.round(metadata.width * scale))
    .grayscale()
    .threshold(120)
    .negate()
    .png()
    .toBuffer());

  // Variant 4: Moderate processing
  variants.push(await sharp(imageBuffer)
    .resize(Math.round(metadata.width * scale))
    .grayscale()
    .normalize()
    .linear(1.5, -30)
    .png()
    .toBuffer());

  return variants;
}

/**
 * Run Tesseract OCR on image variants
 */
async function tesseractOCR(imageBuffer) {
  await initWorker();

  const variants = await createPreprocessedVariants(imageBuffer);
  const results = [];

  for (const variant of variants) {
    try {
      const { data } = await worker.recognize(variant);
      results.push({ text: data.text, confidence: data.confidence });
    } catch (e) {
      console.error('Tesseract variant failed:', e.message);
    }
  }

  if (results.length === 0) {
    return { text: '', confidence: 0 };
  }

  // Combine all text
  const combinedText = results.map(r => r.text).join('\n');
  const bestConfidence = Math.max(...results.map(r => r.confidence));

  return { text: combinedText, confidence: bestConfidence };
}

/**
 * Parse OCR text to extract class and level
 */
function parseOCRText(text) {
  // Log the FULL raw text for debugging
  console.log('[OCR Parse] Full raw text:\n---\n' + text + '\n---');

  // Multiple normalization approaches
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const noSpaces = text.toLowerCase().replace(/\s+/g, '');
  const lettersAndNumbers = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ');

  const result = {
    class: null,
    level: null,
    rawText: text,
  };

  // Class detection - check all text variants
  const classPatterns = [
    /kain/i,
    /ka[il1!|]n/i,  // OCR variations
    /kam/i,
    /kaln/i,
  ];

  const allText = normalized + ' ' + noSpaces + ' ' + lettersAndNumbers;
  for (const pattern of classPatterns) {
    if (pattern.test(allText)) {
      result.class = 'kain';
      break;
    }
  }

  // Level detection - very aggressive patterns
  const levels = [];

  // Pattern 1: Lv followed by numbers (with anything in between)
  const lvPatterns = [
    /lv[^0-9]*(\d{3})/gi,       // Lv.264, Lv 264, Lv:264, etc
    /lv[^0-9]*(\d{2})/gi,       // Lv.64 (in case leading 2 is missed)
    /level[^0-9]*(\d{2,3})/gi,  // Level 264
  ];

  for (const pattern of lvPatterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(allText)) !== null) {
      let level = parseInt(match[1], 10);
      // If it's 2 digits and 60-99, assume it's 260-299
      if (level >= 40 && level <= 99) {
        level = 200 + level;
      }
      if (level >= 200 && level <= 300) {
        levels.push(level);
        console.log('[OCR Parse] Found level via pattern:', level, 'from match:', match[0]);
      }
    }
  }

  // Pattern 2: Any 3-digit number in range 200-300
  const threeDigitMatches = text.match(/\d{3}/g) || [];
  for (const numStr of threeDigitMatches) {
    const num = parseInt(numStr, 10);
    if (num >= 200 && num <= 300) {
      levels.push(num);
      console.log('[OCR Parse] Found 3-digit level:', num);
    }
  }

  // Pattern 3: Look for "2" followed by "6" followed by digits (for 260+)
  const twoSixPattern = /2\s*6\s*(\d)/g;
  let match;
  while ((match = twoSixPattern.exec(text)) !== null) {
    const level = parseInt('26' + match[1], 10);
    if (level >= 260 && level <= 269) {
      levels.push(level);
      console.log('[OCR Parse] Found 26x level:', level);
    }
  }

  if (levels.length > 0) {
    result.level = Math.max(...levels);
  }

  console.log('[OCR Parse] All found levels:', levels);
  console.log('[OCR Parse] Final - Class:', result.class, '| Level:', result.level);

  return result;
}

/**
 * Main function to process screenshot
 */
async function processScreenshot(imageUrl) {
  console.log('[OCR] Processing:', imageUrl);

  // Download image
  const imageBuffer = await downloadImage(imageUrl);
  console.log('[OCR] Downloaded image:', imageBuffer.length, 'bytes');

  let ocrResult = null;
  let method = 'tesseract';

  // Try Google Cloud Vision first (if API key is set)
  if (process.env.GOOGLE_CLOUD_API_KEY) {
    try {
      console.log('[OCR] Trying Google Cloud Vision...');
      ocrResult = await googleVisionOCR(imageBuffer);
      if (ocrResult) {
        method = 'google_vision';
        console.log('[OCR] Google Vision succeeded');
      }
    } catch (e) {
      console.error('[OCR] Google Vision failed:', e.message);
    }
  }

  // Fallback to Tesseract
  if (!ocrResult) {
    console.log('[OCR] Using Tesseract...');
    ocrResult = await tesseractOCR(imageBuffer);
  }

  console.log('[OCR] Confidence:', ocrResult.confidence, '| Method:', method);

  // Parse the text
  const parsed = parseOCRText(ocrResult.text);

  return {
    ...parsed,
    confidence: ocrResult.confidence,
    method,
  };
}

/**
 * Cleanup
 */
async function cleanup() {
  if (worker) {
    await worker.terminate();
    worker = null;
    console.log('✅ Tesseract worker terminated');
  }
}

module.exports = {
  initWorker,
  processScreenshot,
  parseOCRText,
  cleanup,
  downloadImage,
  googleVisionOCR,
  tesseractOCR,
};
