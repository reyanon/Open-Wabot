const fs = require('fs');
const path = require('path');
const { loadConfig } = require('../src/config');

async function setup() {
    console.log('🚀 Setting up Nexus Bot...');
    
    // Create necessary directories
    const dirs = ['data', 'plugins/admin', 'plugins/info', 'plugins/tools', 'plugins/downloader', 'plugins/custom'];
    
    for (const dir of dirs) {
        const dirPath = path.join(__dirname, '..', dir);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
            console.log(`📁 Created directory: ${dir}`);
        }
    }
    
    // Load config (this will create config.js if it doesn't exist)
    await loadConfig();
    
    console.log('✅ Nexus Bot setup complete!');
    console.log('📝 Please edit config.js to configure your bot');
    console.log('🚀 Run "npm start" to start the bot');
}

setup().catch(console.error);