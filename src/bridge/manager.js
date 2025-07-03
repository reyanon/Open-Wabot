const logger = require('../utils/logger');
const TelegramBridge = require('./telegram');

class BridgeManager {
    constructor(bot, config) {
        this.bot = bot;
        this.config = config;
        this.bridges = [];
    }

    async initialize() {
        logger.info('🌉 Initializing bridge system...');
        
        // Initialize Telegram bridge if enabled
        if (this.config.bridges?.telegram?.enabled) {
            const telegramBridge = new TelegramBridge(this.bot, this.config.bridges.telegram);
            await telegramBridge.initialize();
            this.bridges.push(telegramBridge);
            this.bot.addBridge(telegramBridge);
        }

        // Add more bridges here as needed
        // if (this.config.bridges?.discord?.enabled) {
        //     const discordBridge = new DiscordBridge(this.bot, this.config.bridges.discord);
        //     await discordBridge.initialize();
        //     this.bridges.push(discordBridge);
        //     this.bot.addBridge(discordBridge);
        // }

        logger.info(`🌉 Bridge system initialized with ${this.bridges.length} active bridges`);
    }

    async shutdown() {
        logger.info('🌉 Shutting down bridge system...');
        
        for (const bridge of this.bridges) {
            if (bridge.shutdown) {
                await bridge.shutdown();
            }
        }
        
        logger.info('✅ Bridge system shutdown complete');
    }
}

module.exports = BridgeManager;