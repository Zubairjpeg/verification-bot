/**
 * Configuration file for MapleStory Kain Verification Bot
 * Contains all constants, settings, and hardcoded IDs
 */

module.exports = {
  // Discord IDs (hardcoded as per requirements)
  VERIFIED_ROLE_ID: '1174862374411456582',
  VERIFICATION_CHANNEL_ID: '1174861449055711324',
  LOGS_CHANNEL_ID: '1466774617992466598',

  // Verification requirements
  REQUIRED_CLASS: 'kain',
  REQUIRED_LEVEL: 240,

  // MapleRanks bot ID (official MapleRanks Discord bot)
  MAPLERANKS_BOT_ID: '571433717834711040',

  // Anti-abuse settings
  COOLDOWN_MS: 5 * 60 * 1000, // 5 minutes in milliseconds
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_IMAGE_TYPES: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'],
  ALLOWED_EXTENSIONS: ['.png', '.jpg', '.jpeg', '.webp'],

  // OCR settings
  OCR_LANGUAGE: 'eng',

  // Image preprocessing settings
  IMAGE_PREPROCESSING: {
    maxWidth: 2000,
    maxHeight: 2000,
    grayscale: true,
    contrast: 1.5,
    brightness: 1.1,
  },

  // Keywords for OCR detection
  CLASS_KEYWORDS: ['kain'],
  LEVEL_KEYWORDS: ['lv', 'lv.', 'level', 'lvl'],

  // Regex patterns for level extraction
  LEVEL_PATTERNS: [
    /lv\.?\s*(\d{2,3})/gi,
    /level\s*[:\s]*(\d{2,3})/gi,
    /lvl\.?\s*(\d{2,3})/gi,
    /(\d{3})\s*(?:lv|level)/gi,
  ],

  // Embed colors
  COLORS: {
    SUCCESS: 0x00FF00,
    ERROR: 0xFF0000,
    WARNING: 0xFFAA00,
    INFO: 0x0099FF,
  },

  // Messages
  MESSAGES: {
    SUCCESS: '✅ Verification successful! You have been assigned the Verified role.',
    FAIL_NO_CLASS: '❌ Verification failed: Could not detect class.',
    FAIL_WRONG_CLASS: '❌ Verification failed: Class must be Kain.',
    FAIL_NO_LEVEL: '❌ Verification failed: Could not detect level.',
    FAIL_LOW_LEVEL: (detected) => `❌ Verification failed: Level must be 240+ (Detected: ${detected}).`,
    FAIL_ALREADY_VERIFIED: '⚠️ You are already verified!',
    FAIL_COOLDOWN: (remaining) => `⏳ Please wait ${remaining} before trying again.`,
    FAIL_INVALID_IMAGE: '❌ Invalid image format. Please upload a PNG or JPG image under 10MB.',
    FAIL_OCR_ERROR: '⚠️ Could not read your image. Please ensure it\'s clear and try again.',
    FAIL_GENERIC: '⚠️ Something went wrong during verification. Please try again later.',
  },
};
