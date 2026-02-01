/**
 * Verification Module for MapleStory Kain Verification Bot
 * Handles verification logic for screenshots and MapleRanks bot responses
 */

const config = require('./config');
const ocr = require('./ocr');

/**
 * Verification result structure
 * @typedef {Object} VerificationResult
 * @property {boolean} success - Whether verification passed
 * @property {string} reason - Reason for result
 * @property {string|null} detectedClass - Detected class name
 * @property {number|null} detectedLevel - Detected level
 * @property {string} method - Verification method used
 * @property {number} [confidence] - OCR confidence (for screenshots)
 */

/**
 * Check if detected data meets verification requirements
 * @param {string|null} detectedClass - Detected class
 * @param {number|null} detectedLevel - Detected level
 * @returns {{success: boolean, reason: string}}
 */
function checkRequirements(detectedClass, detectedLevel) {
  // Check class
  if (!detectedClass) {
    return {
      success: false,
      reason: config.MESSAGES.FAIL_NO_CLASS,
    };
  }

  if (detectedClass.toLowerCase() !== config.REQUIRED_CLASS.toLowerCase()) {
    return {
      success: false,
      reason: config.MESSAGES.FAIL_WRONG_CLASS,
    };
  }

  // Check level
  if (detectedLevel === null || detectedLevel === undefined) {
    return {
      success: false,
      reason: config.MESSAGES.FAIL_NO_LEVEL,
    };
  }

  if (detectedLevel < config.REQUIRED_LEVEL) {
    return {
      success: false,
      reason: config.MESSAGES.FAIL_LOW_LEVEL(detectedLevel),
    };
  }

  return {
    success: true,
    reason: config.MESSAGES.SUCCESS,
  };
}

/**
 * Verify from a screenshot using OCR
 * @param {string} imageUrl - URL of the screenshot
 * @returns {Promise<VerificationResult>}
 */
async function verifyFromScreenshot(imageUrl) {
  try {
    const result = await ocr.processScreenshot(imageUrl);

    const { success, reason } = checkRequirements(result.class, result.level);

    return {
      success,
      reason,
      detectedClass: result.class,
      detectedLevel: result.level,
      method: 'screenshot_ocr',
      confidence: result.confidence,
      rawText: result.rawText,
    };
  } catch (error) {
    console.error('Screenshot verification error:', error);
    return {
      success: false,
      reason: config.MESSAGES.FAIL_OCR_ERROR,
      detectedClass: null,
      detectedLevel: null,
      method: 'screenshot_ocr',
      error: error.message,
    };
  }
}

/**
 * Parse MapleRanks bot embed to extract character info
 * @param {Object} embed - Discord embed object
 * @returns {{class: string|null, level: number|null, name: string|null}}
 */
function parseMapleRanksEmbed(embed) {
  const result = {
    class: null,
    level: null,
    name: null,
  };

  // MapleRanks embeds typically have fields with Job and Level
  if (embed.fields && Array.isArray(embed.fields)) {
    for (const field of embed.fields) {
      const fieldName = field.name?.toLowerCase() || '';
      const fieldValue = field.value?.toLowerCase() || '';

      // Check for job/class field
      if (fieldName.includes('job') || fieldName.includes('class')) {
        if (fieldValue.includes('kain')) {
          result.class = 'kain';
        }
      }

      // Check for level field
      if (fieldName.includes('level') || fieldName.includes('lv')) {
        const levelMatch = fieldValue.match(/(\d+)/);
        if (levelMatch) {
          result.level = parseInt(levelMatch[1], 10);
        }
      }

      // Check for name field
      if (fieldName.includes('name') || fieldName.includes('ign')) {
        result.name = field.value;
      }
    }
  }

  // Also check embed description and title
  const textContent = [
    embed.description || '',
    embed.title || '',
  ].join(' ').toLowerCase();

  // If class not found in fields, check text content
  if (!result.class && textContent.includes('kain')) {
    result.class = 'kain';
  }

  // If level not found in fields, search in text content
  if (!result.level) {
    const levelPatterns = [
      /level[:\s]*(\d+)/i,
      /lv\.?\s*(\d+)/i,
    ];

    for (const pattern of levelPatterns) {
      const match = textContent.match(pattern);
      if (match) {
        result.level = parseInt(match[1], 10);
        break;
      }
    }
  }

  return result;
}

/**
 * Parse MapleRanks bot message (both embed and text)
 * @param {Object} message - Discord message object
 * @returns {{class: string|null, level: number|null, name: string|null}}
 */
function parseMapleRanksMessage(message) {
  let result = {
    class: null,
    level: null,
    name: null,
  };

  // Check embeds first
  if (message.embeds && message.embeds.length > 0) {
    for (const embed of message.embeds) {
      const embedResult = parseMapleRanksEmbed(embed);
      if (embedResult.class) result.class = embedResult.class;
      if (embedResult.level) result.level = embedResult.level;
      if (embedResult.name) result.name = embedResult.name;
    }
  }

  // Also parse message content if present
  if (message.content) {
    const content = message.content.toLowerCase();

    if (!result.class && content.includes('kain')) {
      result.class = 'kain';
    }

    if (!result.level) {
      const levelMatch = content.match(/(?:level|lv\.?)\s*[:\s]*(\d+)/i);
      if (levelMatch) {
        result.level = parseInt(levelMatch[1], 10);
      }
    }
  }

  return result;
}

/**
 * Verify from MapleRanks bot response
 * @param {Object} message - MapleRanks bot message
 * @returns {VerificationResult}
 */
function verifyFromMapleRanks(message) {
  try {
    const parsed = parseMapleRanksMessage(message);
    const { success, reason } = checkRequirements(parsed.class, parsed.level);

    return {
      success,
      reason,
      detectedClass: parsed.class,
      detectedLevel: parsed.level,
      method: 'mapleranks_bot',
      characterName: parsed.name,
    };
  } catch (error) {
    console.error('MapleRanks parsing error:', error);
    return {
      success: false,
      reason: config.MESSAGES.FAIL_GENERIC,
      detectedClass: null,
      detectedLevel: null,
      method: 'mapleranks_bot',
      error: error.message,
    };
  }
}

/**
 * Check if a message is from MapleRanks bot
 * @param {Object} message - Discord message
 * @returns {boolean}
 */
function isMapleRanksMessage(message) {
  return message.author?.id === config.MAPLERANKS_BOT_ID;
}

/**
 * Validate image attachment
 * @param {Object} attachment - Discord attachment
 * @returns {{valid: boolean, reason: string|null}}
 */
function validateAttachment(attachment) {
  // Check file size
  if (attachment.size > config.MAX_FILE_SIZE) {
    return {
      valid: false,
      reason: `File too large. Maximum size is ${config.MAX_FILE_SIZE / (1024 * 1024)}MB.`,
    };
  }

  // Check content type
  const contentType = attachment.contentType?.toLowerCase();
  if (contentType && !config.ALLOWED_IMAGE_TYPES.includes(contentType)) {
    return {
      valid: false,
      reason: config.MESSAGES.FAIL_INVALID_IMAGE,
    };
  }

  // Check file extension
  const url = attachment.url.toLowerCase();
  const hasValidExtension = config.ALLOWED_EXTENSIONS.some((ext) => url.includes(ext));
  if (!hasValidExtension && !contentType) {
    return {
      valid: false,
      reason: config.MESSAGES.FAIL_INVALID_IMAGE,
    };
  }

  return { valid: true, reason: null };
}

module.exports = {
  verifyFromScreenshot,
  verifyFromMapleRanks,
  isMapleRanksMessage,
  parseMapleRanksEmbed,
  parseMapleRanksMessage,
  checkRequirements,
  validateAttachment,
};
