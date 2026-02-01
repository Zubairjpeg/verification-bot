/**
 * Commands Module for MapleStory Kain Verification Bot
 * Handles slash commands and command registration
 */

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require('discord.js');
const config = require('./config');
const utils = require('./utils');
const logger = require('./logger');

/**
 * Define slash commands
 */
const commands = [
  // /verify help command
  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verification commands for MapleStory Kain players')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('help')
        .setDescription('Show verification help and instructions')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('status')
        .setDescription('Check your verification status')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('stats')
        .setDescription('Show verification statistics (Admin only)')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('override')
        .setDescription('Manually verify a user (Admin only)')
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('User to verify')
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('reason')
            .setDescription('Reason for manual verification')
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('unverify')
        .setDescription('Remove verification from a user (Admin only)')
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('User to unverify')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('cooldown')
        .setDescription('Clear cooldown for a user (Admin only)')
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('User to clear cooldown for')
            .setRequired(true)
        )
    ),
];

/**
 * Register commands with Discord
 * @param {Object} client - Discord client
 */
async function registerCommands(client) {
  try {
    console.log('🔄 Registering slash commands...');

    const commandData = commands.map((cmd) => cmd.toJSON());

    // Register globally (or use guild-specific for testing)
    await client.application.commands.set(commandData);

    console.log(`✅ Registered ${commands.length} slash command(s)`);
  } catch (error) {
    console.error('❌ Failed to register commands:', error);
  }
}

/**
 * Handle /verify help
 * @param {Object} interaction - Discord interaction
 */
async function handleHelp(interaction) {
  const embed = new EmbedBuilder()
    .setColor(config.COLORS.INFO)
    .setTitle('📋 Kain Verification Help')
    .setDescription(
      'Welcome to the Kain class Discord verification system! ' +
      'To get verified, you need to prove you have a **Kain** character at **level 240 or higher**.'
    )
    .addFields([
      {
        name: '📷 Method 1: Screenshot',
        value:
          `Post a screenshot in <#${config.VERIFICATION_CHANNEL_ID}> showing:\n` +
          '• Your character\'s class (Kain)\n' +
          '• Your character\'s level (240+)\n\n' +
          'Accepted screenshots:\n' +
          '• Character info page\n' +
          '• Legion system page',
        inline: false,
      },
      {
        name: '🤖 Method 2: MapleRanks Bot',
        value:
          `Use the MapleRanks bot command in <#${config.VERIFICATION_CHANNEL_ID}>:\n` +
          '`/mr [your character name]`\n\n' +
          'The bot will automatically verify you if the MapleRanks response shows a Kain at level 240+.',
        inline: false,
      },
      {
        name: '⚙️ Requirements',
        value:
          `• Class: **${config.REQUIRED_CLASS.charAt(0).toUpperCase() + config.REQUIRED_CLASS.slice(1)}**\n` +
          `• Level: **${config.REQUIRED_LEVEL}+**`,
        inline: true,
      },
      {
        name: '⏳ Cooldown',
        value: `${config.COOLDOWN_MS / 60000} minutes between attempts`,
        inline: true,
      },
      {
        name: '💡 Tips',
        value:
          '• Make sure your screenshot is clear and readable\n' +
          '• Use PNG or JPG format\n' +
          '• File size must be under 10MB\n' +
          '• Ensure the class name and level are visible',
        inline: false,
      },
    ])
    .setFooter({ text: 'If you have issues, contact a moderator.' });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

/**
 * Handle /verify status
 * @param {Object} interaction - Discord interaction
 */
async function handleStatus(interaction) {
  const member = interaction.member;
  const isVerified = utils.isAlreadyVerified(member);
  const cooldown = utils.checkCooldown(member.id);

  const embed = new EmbedBuilder()
    .setColor(isVerified ? config.COLORS.SUCCESS : config.COLORS.INFO)
    .setTitle('📊 Your Verification Status')
    .addFields([
      {
        name: 'Verified',
        value: isVerified ? '✅ Yes' : '❌ No',
        inline: true,
      },
      {
        name: 'Cooldown',
        value: cooldown.onCooldown
          ? `⏳ ${utils.formatCooldownTime(cooldown.remainingTime)}`
          : '✅ Ready',
        inline: true,
      },
    ]);

  if (!isVerified) {
    embed.setDescription(
      `Use \`/verify help\` to learn how to get verified in <#${config.VERIFICATION_CHANNEL_ID}>`
    );
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

/**
 * Handle /verify stats (Admin)
 * @param {Object} interaction - Discord interaction
 */
async function handleStats(interaction) {
  // Check admin permissions
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content: '❌ You need Administrator permission to use this command.',
      ephemeral: true,
    });
  }

  const stats = utils.getStats();

  const embed = new EmbedBuilder()
    .setColor(config.COLORS.INFO)
    .setTitle('📈 Verification Statistics')
    .addFields([
      {
        name: 'Total Attempts',
        value: stats.totalAttempts.toString(),
        inline: true,
      },
      {
        name: 'Successful',
        value: stats.successfulVerifications.toString(),
        inline: true,
      },
      {
        name: 'Failed',
        value: stats.failedVerifications.toString(),
        inline: true,
      },
      {
        name: 'Success Rate',
        value: `${stats.successRate}%`,
        inline: true,
      },
      {
        name: 'OCR Verifications',
        value: stats.ocrVerifications.toString(),
        inline: true,
      },
      {
        name: 'MapleRanks Verifications',
        value: stats.mapleRanksVerifications.toString(),
        inline: true,
      },
      {
        name: 'Uptime',
        value: stats.uptimeFormatted,
        inline: true,
      },
      {
        name: 'Active Cooldowns',
        value: stats.activeCooldowns.toString(),
        inline: true,
      },
      {
        name: 'Verified Users Cached',
        value: stats.verifiedCacheSize.toString(),
        inline: true,
      },
    ])
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

/**
 * Handle /verify override (Admin)
 * @param {Object} interaction - Discord interaction
 */
async function handleOverride(interaction) {
  // Check admin permissions
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content: '❌ You need Administrator permission to use this command.',
      ephemeral: true,
    });
  }

  const targetUser = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason') || 'Admin override';

  try {
    const targetMember = await interaction.guild.members.fetch(targetUser.id);

    // Check if already verified
    if (utils.isAlreadyVerified(targetMember)) {
      return interaction.reply({
        content: `⚠️ ${targetUser.tag} is already verified.`,
        ephemeral: true,
      });
    }

    // Add role
    await targetMember.roles.add(config.VERIFIED_ROLE_ID);
    utils.addToVerifiedCache(targetUser.id);

    // Log the action
    await logger.logAdminAction(interaction.user, targetUser, `Manual verification: ${reason}`);

    await interaction.reply({
      content: `✅ Successfully verified ${targetUser.tag}.\nReason: ${reason}`,
      ephemeral: true,
    });

    // Try to DM the user
    await utils.safeDM(targetUser, {
      embeds: [
        new EmbedBuilder()
          .setColor(config.COLORS.SUCCESS)
          .setTitle('✅ You have been verified!')
          .setDescription(`An admin has manually verified you.\n**Reason:** ${reason}`)
          .setTimestamp(),
      ],
    });
  } catch (error) {
    console.error('Override error:', error);
    await interaction.reply({
      content: `❌ Failed to verify user: ${error.message}`,
      ephemeral: true,
    });
  }
}

/**
 * Handle /verify unverify (Admin)
 * @param {Object} interaction - Discord interaction
 */
async function handleUnverify(interaction) {
  // Check admin permissions
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content: '❌ You need Administrator permission to use this command.',
      ephemeral: true,
    });
  }

  const targetUser = interaction.options.getUser('user');

  try {
    const targetMember = await interaction.guild.members.fetch(targetUser.id);

    // Check if verified
    if (!targetMember.roles.cache.has(config.VERIFIED_ROLE_ID)) {
      return interaction.reply({
        content: `⚠️ ${targetUser.tag} is not verified.`,
        ephemeral: true,
      });
    }

    // Remove role
    await targetMember.roles.remove(config.VERIFIED_ROLE_ID);
    utils.removeFromVerifiedCache(targetUser.id);

    // Log the action
    await logger.logAdminAction(interaction.user, targetUser, 'Removed verification');

    await interaction.reply({
      content: `✅ Successfully removed verification from ${targetUser.tag}.`,
      ephemeral: true,
    });
  } catch (error) {
    console.error('Unverify error:', error);
    await interaction.reply({
      content: `❌ Failed to unverify user: ${error.message}`,
      ephemeral: true,
    });
  }
}

/**
 * Handle /verify cooldown (Admin)
 * @param {Object} interaction - Discord interaction
 */
async function handleCooldown(interaction) {
  // Check admin permissions
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content: '❌ You need Administrator permission to use this command.',
      ephemeral: true,
    });
  }

  const targetUser = interaction.options.getUser('user');

  utils.clearCooldown(targetUser.id);

  // Log the action
  await logger.logAdminAction(interaction.user, targetUser, 'Cleared verification cooldown');

  await interaction.reply({
    content: `✅ Cleared cooldown for ${targetUser.tag}.`,
    ephemeral: true,
  });
}

/**
 * Handle interaction (main handler)
 * @param {Object} interaction - Discord interaction
 */
async function handleInteraction(interaction) {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName !== 'verify') return;

  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'help':
      await handleHelp(interaction);
      break;
    case 'status':
      await handleStatus(interaction);
      break;
    case 'stats':
      await handleStats(interaction);
      break;
    case 'override':
      await handleOverride(interaction);
      break;
    case 'unverify':
      await handleUnverify(interaction);
      break;
    case 'cooldown':
      await handleCooldown(interaction);
      break;
    default:
      await interaction.reply({
        content: '❌ Unknown subcommand.',
        ephemeral: true,
      });
  }
}

module.exports = {
  commands,
  registerCommands,
  handleInteraction,
  handleHelp,
  handleStatus,
  handleStats,
  handleOverride,
  handleUnverify,
  handleCooldown,
};
