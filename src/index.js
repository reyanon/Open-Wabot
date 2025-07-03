const { createBot } = require('./core/bot');
const { loadConfig } = require('./config');
const logger = require('./utils/logger');
const BridgeManager = require('./bridge/manager');

async function startNexusBot() {
    try {
        logger.info('🚀 Starting Nexus Bot...');
        
        // Load configuration
        const config = await loadConfig();
        
        // Create bot instance
        const bot = await createBot(config);
        
        // Initialize bridge system
        const bridgeManager = new BridgeManager(bot, config);
        await bridgeManager.initialize();
        
        // Start the bot
        await bot.start();
        
        logger.info('✅ Nexus Bot started successfully!');
        
        // Handle graceful shutdown
        process.on('SIGINT', async () => {
            logger.info('🛑 Shutting down Nexus Bot...');
            await bridgeManager.shutdown();
            await bot.shutdown();
            process.exit(0);
        });
        
    } catch (error) {
        logger.error('❌ Failed to start Nexus Bot:', error);
        process.exit(1);
    }
}

// Start the bot if this file is run directly
if (require.main === module) {
    startNexusBot();
}

module.exports = { startNexusBot };