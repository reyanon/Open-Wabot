module.exports = {
    name: 'menu',
    alias: ['help', 'm'],
    category: 'info',
    run: async (m, plugins) => {
        let text = `🤖 *Nexus Bot Menu*\n\nHi *${m.pushName || 'User'}*!\n\n`;
        
        const categories = {};
        plugins.forEach(plugin => {
            const cat = plugin.category || 'other';
            if (!categories[cat]) categories[cat] = [];
            categories[cat].push(plugin.name);
        });

        Object.keys(categories).sort().forEach(cat => {
            text += `*${cat.toUpperCase()}*\n`;
            categories[cat].forEach(name => {
                text += `• ${name}\n`;
            });
            text += '\n';
        });

        text += `Total: ${plugins.length} plugins`;
        await m.reply(text);
    }
};