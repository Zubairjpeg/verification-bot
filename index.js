/**
 * MapleStory Kain Verification Bot
 *
 * A Discord bot that verifies MapleStory players by analyzing screenshots
 * using OCR and parsing MapleRanks bot responses.
 *
 * Requirements for verification:
 * - Class: Kain
 * - Level: 240+
 */

require('dotenv').config();

const {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
} = require('discord.js');

// Import modules
const config = require('./src/config');
const ocr = require('./src/ocr');
const verifier = require('./src/verifier');
const logger = require('./src/logger');
const utils = require('./src/utils');
const commands = require('./src/commands');

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
});

/**
 * Handle verification from a screenshot
 * @param {Object} message - Discord message with attachment
 * @param {Object} attachment - Image attachment
 */
async function handleScreenshotVerification(message, attachment) {
  const { member, author } = message;

  // Validate attachment
  const validation = verifier.validateAttachment(attachment);
  if (!validation.valid) {
    await utils.safeReact(message, '❌');
    await utils.safeReply(message, validation.reason);
    return;
  }

  // Check if already verified
  if (utils.isAlreadyVerified(member)) {
    await utils.safeReact(message, '⚠️');
    await utils.safeReply(message, config.MESSAGES.FAIL_ALREADY_VERIFIED);
    return;
  }

  // Check cooldown
  const cooldown = utils.checkCooldown(author.id);
  if (cooldown.onCooldown) {
    const remaining = utils.formatCooldownTime(cooldown.remainingTime);
    await utils.safeReact(message, '⏳');
    await utils.safeReply(message, config.MESSAGES.FAIL_COOLDOWN(remaining));
    return;
  }

  // Set cooldown
  utils.setCooldown(author.id);

  // React with processing emoji
  await utils.safeReact(message, '🔄');

  try {
    // Perform OCR verification
    const result = await verifier.verifyFromScreenshot(attachment.url);

    // Update stats
    utils.updateStats('ocr');
    utils.updateStats(result.success ? 'success' : 'failure');

    if (result.success) {
      // Assign role
      await member.roles.add(config.VERIFIED_ROLE_ID);
      utils.addToVerifiedCache(author.id);

      // React and reply
      await message.reactions.removeAll().catch(() => {});
      await utils.safeReact(message, '✅');

      const successEmbed = new EmbedBuilder()
        .setColor(config.COLORS.SUCCESS)
        .setTitle('✅ Verification Successful!')
        .setDescription(
          `Welcome to the Kain community, ${author}!\n\n` +
          `**Detected:** Level ${result.detectedLevel} ${result.detectedClass}`
        )
        .setTimestamp();

      await utils.safeReply(message, { embeds: [successEmbed] });

      // DM user
      await utils.safeDM(author, config.MESSAGES.SUCCESS);
    } else {
      // Failed verification
      await message.reactions.removeAll().catch(() => {});
      await utils.safeReact(message, '❌');

      const failEmbed = new EmbedBuilder()
        .setColor(config.COLORS.ERROR)
        .setTitle('❌ Verification Failed')
        .setDescription(result.reason)
        .addFields([
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
        ])
        .setFooter({ text: 'Use /verify help for instructions' })
        .setTimestamp();

      await utils.safeReply(message, { embeds: [failEmbed] });
    }

    // Log the attempt
    await logger.logVerification({
      user: author,
      result,
      method: 'screenshot_ocr',
      imageUrl: attachment.url,
    });
  } catch (error) {
    console.error('Screenshot verification error:', error);
    await message.reactions.removeAll().catch(() => {});
    await utils.safeReact(message, '⚠️');
    await utils.safeReply(message, config.MESSAGES.FAIL_GENERIC);
    await logger.logError('Screenshot verification', error, author);
  }
}

/**
 * Handle verification from MapleRanks bot response
 * @param {Object} message - MapleRanks bot message
 */
async function handleMapleRanksVerification(message) {
  const channel = message.channel;

  // Find the user who triggered the MapleRanks lookup
  const requester = await utils.findMapleRanksRequester(message, channel);

  if (!requester) {
    console.log('Could not find MapleRanks requester, skipping...');
    return;
  }

  // Check if already verified
  if (utils.isAlreadyVerified(requester)) {
    return; // Silently skip if already verified
  }

  // Check cooldown
  const cooldown = utils.checkCooldown(requester.id);
  if (cooldown.onCooldown) {
    return; // Silently skip if on cooldown
  }

  // Set cooldown
  utils.setCooldown(requester.id);

  try {
    // Parse MapleRanks response
    const result = verifier.verifyFromMapleRanks(message);

    // Update stats
    utils.updateStats('mapleranks');
    utils.updateStats(result.success ? 'success' : 'failure');

    if (result.success) {
      // Assign role
      await requester.roles.add(config.VERIFIED_ROLE_ID);
      utils.addToVerifiedCache(requester.id);

      // React to the MapleRanks message
      await utils.safeReact(message, '✅');

      // Send verification confirmation
      const successEmbed = new EmbedBuilder()
        .setColor(config.COLORS.SUCCESS)
        .setTitle('✅ Verification Successful!')
        .setDescription(
          `${requester} has been verified via MapleRanks!\n\n` +
          `**Detected:** Level ${result.detectedLevel} ${result.detectedClass}` +
          (result.characterName ? `\n**Character:** ${result.characterName}` : '')
        )
        .setTimestamp();

      await channel.send({ embeds: [successEmbed] });

      // DM user
      await utils.safeDM(requester.user, config.MESSAGES.SUCCESS);
    } else {
      // Only notify if we detected something but it didn't meet requirements
      if (result.detectedClass || result.detectedLevel) {
        const failEmbed = new EmbedBuilder()
          .setColor(config.COLORS.ERROR)
          .setTitle('❌ Verification Failed')
          .setDescription(`${requester}, ${result.reason}`)
          .setFooter({ text: 'Use /verify help for instructions' })
          .setTimestamp();

        await channel.send({ embeds: [failEmbed] });
      }
    }

    // Log the attempt
    await logger.logVerification({
      user: requester.user,
      result,
      method: 'mapleranks_bot',
    });
  } catch (error) {
    console.error('MapleRanks verification error:', error);
    await logger.logError('MapleRanks verification', error, requester?.user);
  }
}

// Event: Bot ready
client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`📌 Verification Channel: ${config.VERIFICATION_CHANNEL_ID}`);
  console.log(`📌 Logs Channel: ${config.LOGS_CHANNEL_ID}`);
  console.log(`📌 Verified Role: ${config.VERIFIED_ROLE_ID}`);

  // Initialize logger
  await logger.init(client);

  // Initialize OCR worker
  await ocr.initWorker();

  // Register slash commands
  await commands.registerCommands(client);

  // Log startup
  await logger.logStartup();

  // Set activity
  client.user.setActivity('/verify help', { type: 0 });
});

// Event: Message created
client.on('messageCreate', async (message) => {
  // Only process messages in verification channel
  if (message.channel.id !== config.VERIFICATION_CHANNEL_ID) {
    return;
  }

  // Debug: Log all bot messages to find MapleRanks bot ID
  if (message.author.bot) {
    console.log(`[DEBUG] Bot message from: ${message.author.username} (ID: ${message.author.id})`);
    console.log(`[DEBUG] Expected MapleRanks ID: ${config.MAPLERANKS_BOT_ID}`);
    console.log(`[DEBUG] Has embeds: ${message.embeds?.length > 0}`);
  }

  // Handle MapleRanks bot messages
  if (verifier.isMapleRanksMessage(message)) {
    console.log('[MapleRanks] Detected MapleRanks message, processing...');
    await handleMapleRanksVerification(message);
    return;
  }

  // Ignore other bot messages
  if (message.author.bot) {
    return;
  }

  // Check for image attachments
  const imageAttachment = message.attachments.find((att) => {
    const contentType = att.contentType?.toLowerCase() || '';
    const url = att.url.toLowerCase();
    return (
      config.ALLOWED_IMAGE_TYPES.some((type) => contentType.includes(type.split('/')[1])) ||
      config.ALLOWED_EXTENSIONS.some((ext) => url.includes(ext))
    );
  });

  if (imageAttachment) {
    await handleScreenshotVerification(message, imageAttachment);
  }
});

// Event: Interaction created (slash commands)
client.on('interactionCreate', async (interaction) => {
  await commands.handleInteraction(interaction);
});

// Event: Error handling
client.on('error', (error) => {
  console.error('Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down...');
  await ocr.cleanup();
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down...');
  await ocr.cleanup();
  client.destroy();
  process.exit(0);
});

// Login
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('❌ DISCORD_TOKEN not found in environment variables!');
  process.exit(1);
}

client.login(token);

