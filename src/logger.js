/**
 * Logger Module for MapleStory Kain Verification Bot
 * Handles logging to Discord channel and console
 */

const { EmbedBuilder } = require('discord.js');
const config = require('./config');

// Store client reference
let client = null;
let logsChannel = null;

/**
 * Initialize logger with Discord client
 * @param {Object} discordClient - Discord.js client instance
 */
async function init(discordClient) {
  client = discordClient;
  try {
    logsChannel = await client.channels.fetch(config.LOGS_CHANNEL_ID);
    console.log(`✅ Logs channel initialized: #${logsChannel.name}`);
  } catch (error) {
    console.error('❌ Failed to fetch logs channel:', error.message);
  }
}

/**
 * Create a verification log embed
 * @param {Object} options - Log options
 * @returns {EmbedBuilder}
 */
function createLogEmbed(options) {
  const {
    user,
    result,
    method,
    imageUrl,
    timestamp = new Date(),
  } = options;

  const embed = new EmbedBuilder()
    .setTimestamp(timestamp)
    .setFooter({ text: `User ID: ${user.id}` });

  if (result.success) {
    embed
      .setColor(config.COLORS.SUCCESS)
      .setTitle('✅ Verification Approved')
      .setDescription(`**${user.tag}** has been verified!`);
  } else {
    embed
      .setColor(config.COLORS.ERROR)
      .setTitle('❌ Verification Rejected')
      .setDescription(`**${user.tag}** failed verification`);
  }

  // Add fields
  embed.addFields([
    {
      name: 'Method',
      value: formatMethod(method),
      inline: true,
    },
    {
      name: 'Detected Class',
      value: result.detectedClass || 'Not detected',
      inline: true,
    },
    {
      name: 'Detected Level',
      value: result.detectedLevel?.toString() || 'Not detected',
      inline: true,
    },
  ]);

  if (!result.success) {
    embed.addFields([
      {
        name: 'Reason',
        value: result.reason,
        inline: false,
      },
    ]);
  }

  if (result.confidence !== undefined) {
    embed.addFields([
      {
        name: 'OCR Confidence',
        value: `${result.confidence.toFixed(1)}%`,
        inline: true,
      },
    ]);
  }

  if (result.characterName) {
    embed.addFields([
      {
        name: 'Character Name',
        value: result.characterName,
        inline: true,
      },
    ]);
  }

  if (imageUrl) {
    embed.setThumbnail(imageUrl);
    embed.addFields([
      {
        name: 'Screenshot',
        value: `[View Image](${imageUrl})`,
        inline: false,
      },
    ]);
  }

  return embed;
}

/**
 * Format verification method for display
 * @param {string} method - Method identifier
 * @returns {string}
 */
function formatMethod(method) {
  const methods = {
    screenshot_ocr: '📷 Screenshot (OCR)',
    mapleranks_bot: '🤖 MapleRanks Bot',
    admin_override: '👑 Admin Override',
  };
  return methods[method] || method;
}

/**
 * Log verification attempt to Discord
 * @param {Object} options - Log options
 */
async function logVerification(options) {
  const { user, result, method, imageUrl } = options;

  // Console log
  const status = result.success ? '✅ APPROVED' : '❌ REJECTED';
  console.log(
    `[VERIFICATION] ${status} | User: ${user.tag} (${user.id}) | ` +
    `Method: ${method} | Class: ${result.detectedClass} | Level: ${result.detectedLevel}`
  );

  // Discord log
  if (logsChannel) {
    try {
      const embed = createLogEmbed(options);
      await logsChannel.send({ embeds: [embed] });
    } catch (error) {
      console.error('❌ Failed to send log to Discord:', error.message);
    }
  }
}

/**
 * Log an error
 * @param {string} context - Error context
 * @param {Error} error - Error object
 * @param {Object} [user] - Optional user object
 */
async function logError(context, error, user = null) {
  console.error(`[ERROR] ${context}:`, error);

  if (logsChannel) {
    try {
      const embed = new EmbedBuilder()
        .setColor(config.COLORS.WARNING)
        .setTitle('⚠️ Error Occurred')
        .setDescription(`**Context:** ${context}`)
        .addFields([
          {
            name: 'Error',
            value: error.message || String(error),
            inline: false,
          },
        ])
        .setTimestamp();

      if (user) {
        embed.addFields([
          {
            name: 'User',
            value: `${user.tag} (${user.id})`,
            inline: true,
          },
        ]);
      }

      await logsChannel.send({ embeds: [embed] });
    } catch (sendError) {
      console.error('❌ Failed to send error log to Discord:', sendError.message);
    }
  }
}

/**
 * Log admin action
 * @param {Object} admin - Admin user
 * @param {Object} target - Target user
 * @param {string} action - Action performed
 */
async function logAdminAction(admin, target, action) {
  console.log(`[ADMIN] ${admin.tag} performed ${action} on ${target.tag}`);

  if (logsChannel) {
    try {
      const embed = new EmbedBuilder()
        .setColor(config.COLORS.INFO)
        .setTitle('👑 Admin Action')
        .addFields([
          {
            name: 'Admin',
            value: `${admin.tag} (${admin.id})`,
            inline: true,
          },
          {
            name: 'Target',
            value: `${target.tag} (${target.id})`,
            inline: true,
          },
          {
            name: 'Action',
            value: action,
            inline: false,
          },
        ])
        .setTimestamp();

      await logsChannel.send({ embeds: [embed] });
    } catch (error) {
      console.error('❌ Failed to send admin log to Discord:', error.message);
    }
  }
}

/**
 * Log bot startup
 */
async function logStartup() {
  console.log('✅ Bot started successfully');

  if (logsChannel) {
    try {
      const embed = new EmbedBuilder()
        .setColor(config.COLORS.INFO)
        .setTitle('🤖 Bot Started')
        .setDescription('Verification bot is now online and ready!')
        .addFields([
          {
            name: 'Required Class',
            value: config.REQUIRED_CLASS,
            inline: true,
          },
          {
            name: 'Required Level',
            value: config.REQUIRED_LEVEL.toString(),
            inline: true,
          },
        ])
        .setTimestamp();

      await logsChannel.send({ embeds: [embed] });
    } catch (error) {
      console.error('❌ Failed to send startup log:', error.message);
    }
  }
}

module.exports = {
  init,
  logVerification,
  logError,
  logAdminAction,
  logStartup,
  createLogEmbed,
  formatMethod,
};
