# Nexus Bot

Clean and minimal WhatsApp bot with modular architecture.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Setup bot
npm run setup

# Configure bot (edit config.js)
# Add your WhatsApp number and admin numbers

# Start bot
npm start
```

## 📁 Structure

```
nexus-bot/
├── core/           # Core bot functionality (DON'T TOUCH)
├── utils/          # Utility functions
├── bridge/         # Bridge system (Telegram, Discord, etc.)
├── plugins/        # Bot plugins
├── data/           # Session and cache data
├── config.js       # Bot configuration
└── index.js        # Main entry point
```

## 🔌 Plugin Development

Create a new file in `plugins/` folder:

```javascript
module.exports = {
    name: 'example',
    alias: ['ex'],
    category: 'tools',
    admin: false,        // Admin only?
    gconly: false,       // Group only?
    run: async (m, plugins) => {
        await m.reply('Hello World!');
    }
};
```

## 🌉 Bridge System

The bridge system allows connecting to external platforms like Telegram.

### Telegram Bridge
1. Create bot via @BotFather
2. Get bot token and chat ID
3. Configure in `config.js`:
```javascript
bridges: {
    telegram: {
        enabled: true,
        botToken: "YOUR_BOT_TOKEN",
        chatId: "YOUR_CHAT_ID"
    }
}
```

## 📝 Configuration

Edit `config.js`:
- `botNumber`: Your WhatsApp number
- `administrator`: Admin phone numbers
- `prefixes`: Command prefixes
- `bridges`: External platform configs

## 🛠️ Commands

- `npm start` - Start with auto-restart
- `npm run dev` - Start without auto-restart
- `npm run clear` - Clear session data

## 📄 License

MIT License