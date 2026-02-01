/**
 * Utility Module for MapleStory Kain Verification Bot
 * Handles cooldowns, anti-abuse measures, and general utilities
 */

const config = require('./config');

// Store cooldowns: Map<userId, timestamp>
const cooldowns = new Map();

// Store verified users cache: Set<userId>
const verifiedUsersCache = new Set();

// Verification statistics
const stats = {
  totalAttempts: 0,
  successfulVerifications: 0,
  failedVerifications: 0,
  ocrVerifications: 0,
  mapleRanksVerifications: 0,
  startTime: Date.now(),
};

/**
 * Check if user is on cooldown
 * @param {string} userId - Discord user ID
 * @returns {{onCooldown: boolean, remainingTime: number}}
 */
function checkCooldown(userId) {
  const lastAttempt = cooldowns.get(userId);

  if (!lastAttempt) {
    return { onCooldown: false, remainingTime: 0 };
  }

  const elapsed = Date.now() - lastAttempt;
  const remaining = config.COOLDOWN_MS - elapsed;

  if (remaining <= 0) {
    cooldowns.delete(userId);
    return { onCooldown: false, remainingTime: 0 };
  }

  return { onCooldown: true, remainingTime: remaining };
}

/**
 * Set cooldown for a user
 * @param {string} userId - Discord user ID
 */
function setCooldown(userId) {
  cooldowns.set(userId, Date.now());
}

/**
 * Clear cooldown for a user (admin use)
 * @param {string} userId - Discord user ID
 */
function clearCooldown(userId) {
  cooldowns.delete(userId);
}

/**
 * Format remaining cooldown time for display
 * @param {number} remainingMs - Remaining time in milliseconds
 * @returns {string}
 */
function formatCooldownTime(remainingMs) {
  const seconds = Math.ceil(remainingMs / 1000);
  if (seconds < 60) {
    return `${seconds} second${seconds !== 1 ? 's' : ''}`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
}

/**
 * Check if user is already verified
 * @param {Object} member - Discord guild member
 * @returns {boolean}
 */
function isAlreadyVerified(member) {
  // Check cache first
  if (verifiedUsersCache.has(member.id)) {
    return true;
  }

  // Check roles
  const hasRole = member.roles.cache.has(config.VERIFIED_ROLE_ID);
  if (hasRole) {
    verifiedUsersCache.add(member.id);
  }
  return hasRole;
}

/**
 * Add user to verified cache
 * @param {string} userId - Discord user ID
 */
function addToVerifiedCache(userId) {
  verifiedUsersCache.add(userId);
}

/**
 * Remove user from verified cache
 * @param {string} userId - Discord user ID
 */
function removeFromVerifiedCache(userId) {
  verifiedUsersCache.delete(userId);
}

/**
 * Update statistics
 * @param {string} type - Stat type to update
 */
function updateStats(type) {
  stats.totalAttempts++;

  switch (type) {
    case 'success':
      stats.successfulVerifications++;
      break;
    case 'failure':
      stats.failedVerifications++;
      break;
    case 'ocr':
      stats.ocrVerifications++;
      break;
    case 'mapleranks':
      stats.mapleRanksVerifications++;
      break;
  }
}

/**
 * Get current statistics
 * @returns {Object}
 */
function getStats() {
  const uptime = Date.now() - stats.startTime;
  return {
    ...stats,
    uptimeMs: uptime,
    uptimeFormatted: formatUptime(uptime),
    successRate: stats.totalAttempts > 0
      ? ((stats.successfulVerifications / stats.totalAttempts) * 100).toFixed(1)
      : '0.0',
    verifiedCacheSize: verifiedUsersCache.size,
    activeCooldowns: cooldowns.size,
  };
}

/**
 * Format uptime for display
 * @param {number} ms - Uptime in milliseconds
 * @returns {string}
 */
function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Find the user who triggered a MapleRanks lookup
 * by checking recent messages in the channel
 * @param {Object} message - MapleRanks bot message
 * @param {Object} channel - Discord channel
 * @returns {Promise<Object|null>} Discord member or null
 */
async function findMapleRanksRequester(message, channel) {
  try {
    // Fetch recent messages before the bot response
    const messages = await channel.messages.fetch({
      limit: 10,
      before: message.id,
    });

    // Look for a user message with MapleRanks command
    const mapleRanksCommands = ['/mr', '/mrp', '/mrr', '/mrx', '/mreta', '/mrll', '/mrlp'];

    for (const [, msg] of messages) {
      if (msg.author.bot) continue;

      const content = msg.content.toLowerCase().trim();

      // Check if message contains a MapleRanks command
      for (const cmd of mapleRanksCommands) {
        if (content.startsWith(cmd)) {
          return msg.member;
        }
      }

      // Also check for slash command interactions
      if (msg.interaction && msg.interaction.commandName?.startsWith('mr')) {
        return msg.member;
      }
    }

    // If message is a reply to an interaction, try to get that user
    if (message.interaction && message.interaction.user) {
      const guild = channel.guild;
      return await guild.members.fetch(message.interaction.user.id);
    }

    return null;
  } catch (error) {
    console.error('Error finding MapleRanks requester:', error);
    return null;
  }
}

/**
 * Safe DM send with error handling
 * @param {Object} user - Discord user
 * @param {string|Object} content - Message content or options
 * @returns {Promise<boolean>} Whether DM was sent successfully
 */
async function safeDM(user, content) {
  try {
    await user.send(content);
    return true;
  } catch (error) {
    console.log(`❌ Could not DM user ${user.tag}: ${error.message}`);
    return false;
  }
}

/**
 * Safe message reply with error handling
 * @param {Object} message - Discord message
 * @param {string|Object} content - Reply content or options
 * @returns {Promise<Object|null>} Sent message or null
 */
async function safeReply(message, content) {
  try {
    return await message.reply(content);
  } catch (error) {
    console.error(`❌ Could not reply to message: ${error.message}`);
    // Try to send in channel instead
    try {
      return await message.channel.send(content);
    } catch (channelError) {
      console.error(`❌ Could not send to channel: ${channelError.message}`);
      return null;
    }
  }
}

/**
 * Safe reaction add with error handling
 * @param {Object} message - Discord message
 * @param {string} emoji - Emoji to react with
 * @returns {Promise<boolean>}
 */
async function safeReact(message, emoji) {
  try {
    await message.react(emoji);
    return true;
  } catch (error) {
    console.error(`❌ Could not add reaction: ${error.message}`);
    return false;
  }
}

/**
 * Clean up old cooldowns (call periodically)
 */
function cleanupCooldowns() {
  const now = Date.now();
  for (const [userId, timestamp] of cooldowns) {
    if (now - timestamp > config.COOLDOWN_MS) {
      cooldowns.delete(userId);
    }
  }
}

// Cleanup cooldowns every 5 minutes
setInterval(cleanupCooldowns, 5 * 60 * 1000);

module.exports = {
  checkCooldown,
  setCooldown,
  clearCooldown,
  formatCooldownTime,
  isAlreadyVerified,
  addToVerifiedCache,
  removeFromVerifiedCache,
  updateStats,
  getStats,
  formatUptime,
  findMapleRanksRequester,
  safeDM,
  safeReply,
  safeReact,
  cleanupCooldowns,
};
