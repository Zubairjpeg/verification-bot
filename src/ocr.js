/**
 * OCR Module for MapleStory Screenshot Processing
 * Uses Tesseract.js with multiple preprocessing strategies for game UI text
 */

const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const https = require('https');
const http = require('http');
const config = require('./config');

// Tesseract worker instance (reused for performance)
let worker = null;

/**
 * Initialize Tesseract worker with optimized settings for game text
 */
async function initWorker() {
  if (worker) return worker;

  worker = await Tesseract.createWorker(config.OCR_LANGUAGE);

  // Set parameters optimized for game UI text
  await worker.setParameters({
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.:',
    tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT, // Better for scattered text
  });

  console.log('✅ Tesseract worker initialized');
  return worker;
}

/**
 * Download image from URL to buffer
 * @param {string} url - Image URL
 * @returns {Promise<Buffer>} Image buffer
 */
async function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    protocol.get(url, (response) => {
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
    }).on('error', reject);
  });
}

/**
 * Create multiple preprocessed versions of the image for better OCR
 * @param {Buffer} imageBuffer - Raw image buffer
 * @returns {Promise<Buffer[]>} Array of processed image buffers
 */
async function createPreprocessedVariants(imageBuffer) {
  const variants = [];

  // Get original image
  const original = sharp(imageBuffer);
  const metadata = await original.metadata();

  // Variant 1: High contrast grayscale
  const variant1 = await sharp(imageBuffer)
    .resize(Math.min(metadata.width * 2, 3000)) // Upscale for better OCR
    .grayscale()
    .linear(2.0, -128) // High contrast
    .sharpen({ sigma: 2 })
    .png()
    .toBuffer();
  variants.push(variant1);

  // Variant 2: Threshold (black/white) - good for outlined text
  const variant2 = await sharp(imageBuffer)
    .resize(Math.min(metadata.width * 2, 3000))
    .grayscale()
    .threshold(180) // Convert to pure black/white
    .png()
    .toBuffer();
  variants.push(variant2);

  // Variant 3: Inverted threshold - catches light text on dark backgrounds
  const variant3 = await sharp(imageBuffer)
    .resize(Math.min(metadata.width * 2, 3000))
    .grayscale()
    .threshold(100)
    .negate() // Invert colors
    .png()
    .toBuffer();
  variants.push(variant3);

  // Variant 4: Enhanced with normalize
  const variant4 = await sharp(imageBuffer)
    .resize(Math.min(metadata.width * 2, 3000))
    .grayscale()
    .normalize()
    .linear(1.8, -50)
    .sharpen({ sigma: 1.5 })
    .png()
    .toBuffer();
  variants.push(variant4);

  // Variant 5: Extract specific color ranges (for yellow level badge)
  // Yellow text: high R, high G, low B
  const variant5 = await sharp(imageBuffer)
    .resize(Math.min(metadata.width * 2, 3000))
    .recomb([
      [0.5, 0.5, -0.5],  // Enhance yellow/orange
      [0.5, 0.5, -0.5],
      [0.5, 0.5, -0.5],
    ])
    .grayscale()
    .normalize()
    .threshold(150)
    .png()
    .toBuffer();
  variants.push(variant5);

  return variants;
}

/**
 * Extract text from a single image buffer
 * @param {Buffer} imageBuffer - Processed image buffer
 * @returns {Promise<{text: string, confidence: number}>}
 */
async function ocrSingleImage(imageBuffer) {
  await initWorker();
  const { data } = await worker.recognize(imageBuffer);
  return {
    text: data.text,
    confidence: data.confidence,
  };
}

/**
 * Extract text using multiple preprocessing strategies
 * @param {string} imageUrl - URL of the image to process
 * @returns {Promise<{text: string, confidence: number, allTexts: string[]}>}
 */
async function extractText(imageUrl) {
  try {
    await initWorker();

    // Download image
    const rawImage = await downloadImage(imageUrl);

    // Create multiple preprocessed variants
    const variants = await createPreprocessedVariants(rawImage);

    // Run OCR on all variants
    const results = [];
    for (const variant of variants) {
      try {
        const result = await ocrSingleImage(variant);
        results.push(result);
      } catch (e) {
        console.error('OCR variant failed:', e.message);
      }
    }

    // Combine all text for parsing
    const allTexts = results.map(r => r.text);
    const combinedText = allTexts.join('\n');

    // Use best confidence
    const bestConfidence = Math.max(...results.map(r => r.confidence), 0);

    return {
      text: combinedText,
      confidence: bestConfidence,
      allTexts,
    };
  } catch (error) {
    console.error('OCR extraction error:', error);
    throw new Error(`OCR failed: ${error.message}`);
  }
}

/**
 * Parse OCR text to extract class and level information
 * Enhanced patterns for MapleStory game text
 * @param {string} text - Raw OCR text
 * @returns {{class: string|null, level: number|null, rawText: string}}
 */
function parseOCRText(text) {
  // Normalize text: lowercase, remove extra spaces, handle common OCR errors
  const normalizedText = text
    .toLowerCase()
    .replace(/[|!1l]/g, (m) => {
      // Context-sensitive replacement for common OCR misreads
      return m;
    })
    .replace(/\s+/g, ' ')
    .trim();

  const result = {
    class: null,
    level: null,
    rawText: text,
  };

  // Enhanced class detection with common OCR misreads
  const classPatterns = [
    /\bkain\b/i,
    /\bkam\b/i,      // OCR misread
    /\bkaln\b/i,     // OCR misread
    /\bkaim\b/i,     // OCR misread
    /\bkajn\b/i,     // OCR misread
    /\bka[il1]n\b/i, // OCR misread with 1/l/i
  ];

  for (const pattern of classPatterns) {
    if (pattern.test(normalizedText)) {
      result.class = 'kain';
      break;
    }
  }

  // Enhanced level extraction patterns
  const levelPatterns = [
    /lv\.?\s*(\d{2,3})/gi,          // Lv.260, Lv 260
    /lv[:\s]*(\d{2,3})/gi,          // Lv:260
    /level\s*[:\s]*(\d{2,3})/gi,    // Level 260
    /lvl\.?\s*(\d{2,3})/gi,         // Lvl.260
    /[il1]v\.?\s*(\d{2,3})/gi,      // OCR misread: 1v.260, iv.260
    /(\d{3})\s*(?:lv|level)/gi,     // 260 Lv
    /(?:^|\s)(\d{3})(?:\s|$)/gm,    // Standalone 3-digit on its own line
  ];

  const levels = [];

  for (const pattern of levelPatterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(normalizedText)) !== null) {
      const level = parseInt(match[1], 10);
      if (level >= 200 && level <= 300) {
        levels.push(level);
      }
    }
  }

  // Also scan for any 3-digit numbers in valid range
  const allNumbers = normalizedText.match(/\d{3}/g) || [];
  for (const numStr of allNumbers) {
    const num = parseInt(numStr, 10);
    if (num >= 200 && num <= 300) {
      levels.push(num);
    }
  }

  // Take the highest valid level (most likely the character level)
  if (levels.length > 0) {
    result.level = Math.max(...levels);
  }

  // Debug output
  console.log('[OCR Debug] Normalized text sample:', normalizedText.substring(0, 500));
  console.log('[OCR Debug] Found levels:', levels);
  console.log('[OCR Debug] Class detected:', result.class);

  return result;
}

/**
 * Process image and extract MapleStory character info
 * @param {string} imageUrl - URL of the screenshot
 * @returns {Promise<{class: string|null, level: number|null, confidence: number, rawText: string}>}
 */
async function processScreenshot(imageUrl) {
  const { text, confidence, allTexts } = await extractText(imageUrl);
  const parsed = parseOCRText(text);

  // If first pass failed, try parsing each variant's text individually
  if (!parsed.class || !parsed.level) {
    for (const variantText of allTexts) {
      const variantParsed = parseOCRText(variantText);
      if (!parsed.class && variantParsed.class) {
        parsed.class = variantParsed.class;
      }
      if (!parsed.level && variantParsed.level) {
        parsed.level = variantParsed.level;
      }
      if (parsed.class && parsed.level) break;
    }
  }

  return {
    ...parsed,
    confidence,
  };
}

/**
 * Cleanup Tesseract worker
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
  extractText,
  parseOCRText,
  processScreenshot,
  cleanup,
  createPreprocessedVariants,
  downloadImage,
};
