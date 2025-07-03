class BridgeManager {
    constructor(bot, config) {
        this.bot = bot;
        this.config = config;
        this.bridges = [];
    }

    async initialize() {
        log.info('🌉 Initializing bridges...');

        // Telegram bridge
        if (this.config.bridges?.telegram?.enabled) {
            const { TelegramBridge } = require('./telegram');
            const bridge = new TelegramBridge(this.bot, this.config.bridges.telegram);
            await bridge.initialize();
            this.bot.addBridge(bridge);
            this.bridges.push(bridge);
        }

        log.info(`🌉 ${this.bridges.length} bridges initialized`);
    }

    async shutdown() {
        for (const bridge of this.bridges) {
            if (bridge.shutdown) await bridge.shutdown();
        }
    }
}

module.exports = { BridgeManager };