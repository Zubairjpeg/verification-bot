# MapleStory Kain Verification Bot

A production-ready Discord bot that verifies MapleStory players using OCR (Optical Character Recognition) and MapleRanks bot message parsing. The bot automatically assigns a verified role to users who prove they have a Kain character at level 240 or higher.

## Features

- **Screenshot Verification (OCR)**: Analyze user-uploaded screenshots of character pages or legion system
- **MapleRanks Bot Integration**: Automatically parse MapleRanks bot responses for verification
- **Anti-Abuse Measures**: Cooldowns, file validation, and duplicate verification prevention
- **Admin Commands**: Manual override, unverify, cooldown clearing, and statistics
- **Detailed Logging**: All verification attempts logged to a dedicated channel
- **Slash Commands**: Modern Discord slash command interface

## Requirements

- Node.js 18.0.0 or higher
- Discord Bot Token with the following permissions:
  - Send Messages
  - Embed Links
  - Add Reactions
  - Manage Roles
  - Read Message History
  - View Channels
- Intents enabled:
  - Server Members Intent
  - Message Content Intent

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd verification-bot
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

Copy the example environment file and add your Discord bot token:

```bash
cp .env.example .env
```

Edit `.env` and add your bot token:

```
DISCORD_TOKEN=your_actual_bot_token_here
```

### 4. Configure Discord IDs (Optional)

The Discord channel and role IDs are hardcoded in `src/config.js`. If you need to change them:

```javascript
// src/config.js
module.exports = {
  VERIFIED_ROLE_ID: '1174862374411456582',      // Role to assign on verification
  VERIFICATION_CHANNEL_ID: '1174861449055711324', // Channel to monitor
  LOGS_CHANNEL_ID: '1466774617992466598',        // Channel for logs
  // ...
};
```

### 5. Start the Bot

```bash
npm start
```

For development with auto-reload:

```bash
npm run dev
```

## Usage

### User Verification Methods

#### Method 1: Screenshot Upload

1. Go to the verification channel
2. Upload a screenshot showing:
   - Your character's class (Kain)
   - Your character's level (240+)
3. The bot will analyze the image and verify you automatically

Accepted screenshots:
- Character info page (shows class and level)
- Legion system page (shows character details)

#### Method 2: MapleRanks Bot

1. Go to the verification channel
2. Use the MapleRanks command: `/mr [your character name]`
3. The bot will parse the MapleRanks response and verify you automatically

### Slash Commands

| Command | Description |
|---------|-------------|
| `/verify help` | Show verification instructions |
| `/verify status` | Check your verification status |
| `/verify stats` | View verification statistics (Admin) |
| `/verify override @user [reason]` | Manually verify a user (Admin) |
| `/verify unverify @user` | Remove verification from a user (Admin) |
| `/verify cooldown @user` | Clear cooldown for a user (Admin) |

## Project Structure

```
verification-bot/
├── index.js           # Main entry point
├── package.json       # Dependencies and scripts
├── .env.example       # Environment template
├── .env               # Your environment variables (not in git)
├── README.md          # This file
└── src/
    ├── config.js      # Configuration and constants
    ├── ocr.js         # OCR processing with image preprocessing
    ├── verifier.js    # Verification logic
    ├── logger.js      # Discord logging utilities
    ├── commands.js    # Slash commands
    └── utils.js       # Cooldowns and anti-abuse utilities
```

## Verification Requirements

A user is verified when both conditions are met:
- **Class**: Kain
- **Level**: 240 or higher

## Anti-Abuse Features

- **5-minute cooldown** between verification attempts per user
- **File size limit**: 10MB maximum
- **Accepted formats**: PNG, JPG, JPEG, WebP only
- **Already verified check**: Prevents duplicate verifications
- **Verified users cache**: Improves performance

## Log Output

All verification attempts are logged to the configured logs channel with:
- User tag and ID
- Timestamp
- Verification method (OCR/MapleRanks)
- Result (Approved/Rejected)
- Detected class and level
- Screenshot URL (if applicable)
- OCR confidence score (for screenshots)

### Example Log Embed

```
✅ Verification Approved
User: ExampleUser#1234 has been verified!

Method: Screenshot (OCR)
Detected Class: kain
Detected Level: 260
OCR Confidence: 87.5%
Screenshot: [View Image]

User ID: 123456789012345678
```

## Testing

### Testing Screenshot Verification

1. Prepare a screenshot showing a Kain character at level 240+
2. Upload to the verification channel
3. The bot should:
   - React with processing emoji
   - Analyze the image
   - React with result (success/fail)
   - Reply with verification result
   - Log the attempt

### Testing MapleRanks Integration

1. Use `/mr [kain character name]` in the verification channel
2. Wait for MapleRanks bot to respond
3. The verification bot should:
   - Detect the MapleRanks response
   - Parse the character data
   - Verify if requirements are met
   - Log the attempt

### Testing Admin Commands

1. Use `/verify override @user` to manually verify someone
2. Use `/verify stats` to view verification statistics
3. Use `/verify unverify @user` to remove verification
4. Use `/verify cooldown @user` to clear a user's cooldown

## Deployment

### Using PM2 (Recommended)

```bash
# Install PM2 globally
npm install -g pm2

# Start the bot
pm2 start index.js --name "kain-verification-bot"

# Enable startup on system boot
pm2 startup
pm2 save

# View logs
pm2 logs kain-verification-bot

# Restart
pm2 restart kain-verification-bot
```

### Using Docker

Create a `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

CMD ["node", "index.js"]
```

Build and run:

```bash
docker build -t kain-verification-bot .
docker run -d --name verification-bot --env-file .env kain-verification-bot
```

### Using systemd

Create `/etc/systemd/system/verification-bot.service`:

```ini
[Unit]
Description=MapleStory Kain Verification Bot
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/verification-bot
ExecStart=/usr/bin/node index.js
Restart=on-failure
RestartSec=10
EnvironmentFile=/path/to/verification-bot/.env

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable verification-bot
sudo systemctl start verification-bot
```

## Troubleshooting

### Bot not responding to screenshots

1. Check that the bot has the `MESSAGE_CONTENT` intent enabled
2. Verify the `VERIFICATION_CHANNEL_ID` is correct
3. Ensure the bot has permission to read messages in the channel

### OCR not detecting text

1. Make sure the screenshot is clear and high resolution
2. Try increasing contrast or using a different screenshot
3. Check the OCR confidence in the logs

### Role assignment failing

1. Verify the `VERIFIED_ROLE_ID` exists
2. Ensure the bot's role is higher than the verified role
3. Check the bot has `Manage Roles` permission

### MapleRanks integration not working

1. Verify the `MAPLERANKS_BOT_ID` in config.js matches the actual bot
2. Ensure MapleRanks bot is in the server
3. Check that both bots can access the verification channel

## License

MIT License - See LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## Support

For issues and feature requests, please open an issue on GitHub.
