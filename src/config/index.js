const path = require('path');
const fs = require('fs');

async function loadConfig() {
    const configPath = path.join(__dirname, '../../config.js');
    const defaultConfigPath = path.join(__dirname, 'default.js');
    
    // Check if config.js exists, if not create from default
    if (!fs.existsSync(configPath)) {
        const defaultConfig = require(defaultConfigPath);
        fs.writeFileSync(configPath, `module.exports = ${JSON.stringify(defaultConfig, null, 4)};`);
        console.log('📝 Created config.js from default configuration');
    }
    
    // Load and return config
    delete require.cache[require.resolve(configPath)];
    return require(configPath);
}

module.exports = { loadConfig };