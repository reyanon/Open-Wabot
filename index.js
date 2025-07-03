const pino = require('pino');
const pretty = require('pino-pretty');
const config = require('./config');
const { generate } = require('qrcode-terminal');

// Core modules
const { createBot } = require('./core/bot');
const { loadPlugins } = require('./utils/plugins');
const { BridgeManager } = require('./bridge/manager');

// Global logger
global.log = pino(pretty({
    colorize: true,
    minimumLevel: config.debug ? 'trace' : 'info',
    sync: true,
}));

async function startBot() {
    try {
        log.info('🚀 Starting Nexus Bot...');
        
        // Create bot instance
        const bot = await createBot(config);
        
        // Load plugins
        const plugins = await loadPlugins('./plugins');
        bot.plugins = plugins;
        log.info(`🔌 Loaded ${plugins.length} plugins`);
        
        // Initialize bridges
        const bridgeManager = new BridgeManager(bot, config);
        await bridgeManager.initialize();
        
        // Start bot
        await bot.connect();
        
        log.info('✅ Nexus Bot started successfully!');
        
    } catch (error) {
        log.error('❌ Failed to start bot:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    log.info('🛑 Shutting down...');
    process.exit(0);
});

startBot();