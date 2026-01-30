require('dotenv').config();
const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js');
const Tesseract = require('tesseract.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

const VERIFIED_ROLE_ID = process.env.VERIFIED_ROLE_ID;
const VERIFY_CHANNEL_ID = process.env.VERIFY_CHANNEL_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const JOB_REQUIRED = 'kain';
const LEVEL_REQUIRED = 240;

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

async function safeDM(user, content) {
  try {
    await user.send(content);
  } catch {
    console.log(`❌ Could not DM user ${user.tag}`);
  }
}

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.channel.id !== VERIFY_CHANNEL_ID) return;
  if (!message.attachments || message.attachments.size === 0) return;

  const image = message.attachments.first().url;
  const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);

  try {
    const { data: { text } } = await Tesseract.recognize(image, 'eng');
    const lower = text.toLowerCase();

    const jobMatch = lower.includes(JOB_REQUIRED.toLowerCase());
    const levelMatch = lower.match(/(?:lv\.?|level)[\s:]*?(\d{2,3})/i);
    const level = levelMatch ? parseInt(levelMatch[1]) : null;

    if (jobMatch && level && level >= LEVEL_REQUIRED) {
      await message.member.roles.add(VERIFIED_ROLE_ID);
      await safeDM(message.author, `✅ You’ve been verified as a level ${level} ${JOB_REQUIRED}! Welcome.`);
      await message.react('✅');
      await logChannel.send(`✅ Verified ${message.author.tag} (Level ${level} ${JOB_REQUIRED}) via screenshot`);
    } else {
      await message.react('❌');
      await safeDM(message.author, `❌ Unable to verify. Make sure your image clearly shows "${JOB_REQUIRED}" and a level ≥ ${LEVEL_REQUIRED}.`);
      await logChannel.send(`❌ Verification failed for ${message.author.tag}. Detected job/level did not meet requirements.`);
    }
  } catch (err) {
    console.error('OCR Error:', err);
    await message.react('⚠️');
    await safeDM(message.author, '⚠️ Something went wrong while reading your image. Please try again later.');
    await logChannel.send(`❌ Error during verification for ${message.author.tag}: ${err.message}`);
  }
});

client.login(process.env.DISCORD_TOKEN);
