# Nexus Bot

Advanced WhatsApp bot with modular architecture and bridge system.

## 🌟 Features

- **Clean Architecture**: Separated core, utils, and bridge systems
- **Plugin System**: Easy to extend with custom plugins
- **Bridge System**: Connect to Telegram, Discord, and more
- **Session Management**: Local, MongoDB, and Firebase support
- **Auto-restart**: Built-in process management
- **Whitelist System**: Control bot access

## 🚀 Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/nexus-bot/nexus-bot.git
   cd nexus-bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Setup the bot**
   ```bash
   npm run setup
   ```

4. **Configure the bot**
   Edit `config.js` with your settings

5. **Start the bot**
   ```bash
   npm start
   ```

## 📁 Project Structure

```
nexus-bot/
├── src/
│   ├── core/           # Core bot functionality (DO NOT MODIFY)
│   ├── utils/          # Utility functions
│   ├── bridge/         # Bridge system for external platforms
│   └── config/         # Configuration management
├── plugins/            # Bot plugins
│   ├── admin/          # Admin-only plugins
│   ├── info/           # Information plugins
│   ├── tools/          # Utility tools
│   ├── downloader/     # Download plugins
│   └── custom/         # Your custom plugins
├── data/               # Session and cache data
└── scripts/            # Setup and maintenance scripts
```

## 🔌 Plugin Development

Create a new plugin in the appropriate category folder:

```javascript
module.exports = {
    admin: false,           // Admin only?
    gconly: false,          // Group only?
    gcadmin: false,         // Group admin only?
    name: 'example',        // Plugin name
    alias: ['ex', 'demo'],  // Alternative names
    category: 'tools',      // Plugin category
    run: async (m, plugins) => {
        await m.reply('Hello from plugin!');
    }
};
```

## 🌉 Bridge System

The bridge system allows connecting to external platforms:

### Telegram Bridge
1. Create a Telegram bot via @BotFather
2. Get your chat ID
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

### Adding Custom Bridges
1. Create a new bridge in `src/bridge/`
2. Implement the bridge interface
3. Register in `src/bridge/manager.js`

## 📝 Configuration

Key configuration options in `config.js`:

- `botName`: Your bot's name
- `botNumber`: WhatsApp number
- `administrator`: Admin phone numbers
- `prefixes`: Command prefixes
- `session`: Session storage type
- `bridges`: External platform configurations

## 🛠️ Advanced Usage

### Session Types
- **Local**: File-based storage (default)
- **MongoDB**: Database storage
- **Firebase**: Cloud storage

### Whitelist System
Control who can use your bot:
```javascript
whitelist: true,
whitelistUsr: ["1234567890"]
```

## 📄 License

GPL-3.0-or-later

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📞 Support

- GitHub Issues: Report bugs and request features
- Documentation: Check the wiki for detailed guides

---

**Note**: The `src/core/` directory contains the bot's core functionality and should not be modified. Use the plugin system and bridges for customization.