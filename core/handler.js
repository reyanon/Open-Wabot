async function handleMessage(m, plugins, bot) {
    // Handle session replies
    if (m.cmd && m.quoted && bot.sessions.has(m.quoted.key.id)) {
        const sessions = bot.sessions.get(m.quoted.key.id);
        const choice = parseInt(m.cmd);
        
        if (choice > 0 && choice <= sessions.length) {
            try {
                await sessions[choice - 1]();
            } catch (error) {
                await m.reply(`Error: ${error.message}`);
            }
        }
        return;
    }

    if (!m.prefix) return;

    // Check admin
    const isAdmin = bot.config.administrator.includes(m.sender.user);

    // Find plugin
    const plugin = plugins.find(p => 
        p.name === m.cmd || (p.alias && p.alias.includes(m.cmd))
    );

    if (!plugin) return;

    // Check permissions
    if (plugin.admin && !isAdmin) {
        return m.reply('⚠️ Admin only command!');
    }

    if (plugin.gconly && !m.isGroup) {
        return m.reply('⚠️ Group only command!');
    }

    // Execute plugin
    try {
        await plugin.run(m, plugins);
    } catch (error) {
        log.error('Plugin error:', error);
        await m.reply(`❌ Error: ${error.message}`);
    }
}

module.exports = { handleMessage };