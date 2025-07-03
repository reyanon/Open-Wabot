const fs = require('fs');
const path = require('path');
const check = require('syntax-error');
const logger = require('./logger');

function scanDir(dir, list = []) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const files = fs.readdirSync(dir);

    for (let file of files) {
        file = path.resolve(dir, file);
        let stat = fs.statSync(file);
        stat.isDirectory() ? scanDir(file, list) : list.push(file);
    }
    return list;
}

async function scanPlugins(pluginDir) {
    const plugins = [];
    const pluginFiles = scanDir(pluginDir);
    
    for (const file of pluginFiles) {
        if (!file.endsWith('.js')) continue;
        
        try {
            // Clear require cache
            delete require.cache[require.resolve(file)];
            
            // Load plugin
            const plugin = require(file);
            
            // Validate plugin structure
            if (plugin && typeof plugin === 'object' && plugin.name && plugin.run) {
                plugins.push(plugin);
                logger.debug(`✅ Loaded plugin: ${plugin.name}`);
            } else {
                logger.warn(`⚠️ Invalid plugin structure: ${file}`);
            }
        } catch (error) {
            logger.error(`❌ Failed to load plugin ${file}:`, error);
        }
    }
    
    return plugins;
}

module.exports = { scanDir, scanPlugins };