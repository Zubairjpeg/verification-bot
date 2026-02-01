/**
 * OCR Module for MapleStory Screenshot Processing
 * Uses Tesseract.js with Sharp preprocessing for improved accuracy
 */

const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const https = require('https');
const http = require('http');
const config = require('./config');

// Tesseract worker instance (reused for performance)
let worker = null;

/**
 * Initialize Tesseract worker
 */
async function initWorker() {
  if (worker) return worker;

  worker = await Tesseract.createWorker(config.OCR_LANGUAGE);
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
        // Follow redirect
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
 * Preprocess image for better OCR accuracy
 * @param {Buffer} imageBuffer - Raw image buffer
 * @returns {Promise<Buffer>} Processed image buffer
 */
async function preprocessImage(imageBuffer) {
  const { maxWidth, maxHeight, grayscale, contrast, brightness } = config.IMAGE_PREPROCESSING;

  let pipeline = sharp(imageBuffer);

  // Get image metadata
  const metadata = await pipeline.metadata();

  // Resize if too large (preserving aspect ratio)
  if (metadata.width > maxWidth || metadata.height > maxHeight) {
    pipeline = pipeline.resize(maxWidth, maxHeight, {
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  // Convert to grayscale for better OCR
  if (grayscale) {
    pipeline = pipeline.grayscale();
  }

  // Adjust contrast and brightness
  pipeline = pipeline.linear(contrast, brightness * 10 - 10);

  // Normalize and sharpen
  pipeline = pipeline
    .normalize()
    .sharpen({ sigma: 1.5 });

  // Output as PNG for consistent processing
  return pipeline.png().toBuffer();
}

/**
 * Extract text from image using OCR
 * @param {string} imageUrl - URL of the image to process
 * @returns {Promise<{text: string, confidence: number}>} Extracted text and confidence
 */
async function extractText(imageUrl) {
  try {
    // Ensure worker is initialized
    await initWorker();

    // Download and preprocess image
    const rawImage = await downloadImage(imageUrl);
    const processedImage = await preprocessImage(rawImage);

    // Perform OCR
    const { data } = await worker.recognize(processedImage);

    return {
      text: data.text,
      confidence: data.confidence,
    };
  } catch (error) {
    console.error('OCR extraction error:', error);
    throw new Error(`OCR failed: ${error.message}`);
  }
}

/**
 * Parse OCR text to extract class and level information
 * @param {string} text - Raw OCR text
 * @returns {{class: string|null, level: number|null, rawText: string}}
 */
function parseOCRText(text) {
  const normalizedText = text.toLowerCase().trim();
  const result = {
    class: null,
    level: null,
    rawText: text,
  };

  // Detect class
  for (const keyword of config.CLASS_KEYWORDS) {
    if (normalizedText.includes(keyword.toLowerCase())) {
      result.class = keyword;
      break;
    }
  }

  // Extract level using multiple patterns
  const levels = [];
  for (const pattern of config.LEVEL_PATTERNS) {
    // Reset regex state
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(normalizedText)) !== null) {
      const level = parseInt(match[1], 10);
      if (level >= 1 && level <= 300) {
        levels.push(level);
      }
    }
  }

  // Also try to find standalone 3-digit numbers that could be levels
  const standaloneNumbers = normalizedText.match(/\b(\d{3})\b/g);
  if (standaloneNumbers) {
    for (const numStr of standaloneNumbers) {
      const num = parseInt(numStr, 10);
      if (num >= 200 && num <= 300) {
        levels.push(num);
      }
    }
  }

  // Take the highest valid level found (most likely the actual level)
  if (levels.length > 0) {
    result.level = Math.max(...levels);
  }

  return result;
}

/**
 * Process image and extract MapleStory character info
 * @param {string} imageUrl - URL of the screenshot
 * @returns {Promise<{class: string|null, level: number|null, confidence: number, rawText: string}>}
 */
async function processScreenshot(imageUrl) {
  const { text, confidence } = await extractText(imageUrl);
  const parsed = parseOCRText(text);

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
  preprocessImage,
  downloadImage,
};
