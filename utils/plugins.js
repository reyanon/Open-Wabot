const fs = require('fs');
const path = require('path');

function scanDir(dir) {
    const files = [];
    if (!fs.existsSync(dir)) return files;

    const items = fs.readdirSync(dir);
    for (const item of items) {
        const fullPath = path.join(dir, item);
        if (fs.statSync(fullPath).isDirectory()) {
            files.push(...scanDir(fullPath));
        } else if (item.endsWith('.js')) {
            files.push(fullPath);
        }
    }
    return files;
}

async function loadPlugins(pluginDir) {
    const plugins = [];
    const files = scanDir(pluginDir);

    for (const file of files) {
        try {
            delete require.cache[require.resolve(file)];
            const plugin = require(file);
            
            if (plugin && plugin.name && plugin.run) {
                plugins.push(plugin);
                log.debug(`✅ Loaded: ${plugin.name}`);
            }
        } catch (error) {
            log.error(`❌ Failed to load ${file}:`, error);
        }
    }

    return plugins;
}

module.exports = { loadPlugins, scanDir };