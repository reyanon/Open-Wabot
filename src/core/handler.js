const { isWhitelist } = require('../utils/whitelist');
const logger = require('../utils/logger');

async function handleMessage(m, plugins, bot) {
    // Handle session replies
    if (m.cmd && m.quoted && bot.sessions.get(m.quoted.key.id)) {
        const sessions = bot.sessions.get(m.quoted.key.id);
        const opt = m.cmd.match(/^\d+/);

        if (!opt || opt[0] < 1 || opt[0] > sessions.length) {
            return m.reply(m.sender.user.startsWith('62') ? 
                'Kamu tidak memasukkan nilai yang valid.' : 
                'You don\'t enter valid value.');
        }

        try {
            await m.reply('⏱️');
            await sessions[Number(opt[0]) - 1]();
            await m.reply('✅');
        } catch (e) {
            await m.reply(`Error: ${e.message}`);
            await m.reply('❌');
        }
        return;
    }

    if (!m.prefix) return;
    
    // Check whitelist
    if (!await isWhitelist(m.sender.user, bot.config)) {
        if (!m.isGroup) m.reply(bot.config.whitelistMsg);
        return;
    }

    // Load and filter plugins
    plugins = plugins.filter(p => !!Object.keys(p).length);
    const administrator = !!bot.config.administrator.find(x => x == m.sender.user);

    // Find and execute plugin
    for (let plugin of plugins) {
        if (![plugin?.name, ...plugin?.alias].includes(m.cmd)) continue;
        
        // Send typing indicator
        if (bot.sock) {
            bot.sock.sendPresenceUpdate('composing', m.chat.toString());
        }
        
        // Check permissions
        if (plugin.admin && !administrator) {
            return m.reply(m.sender.user.startsWith('62') ? 
                '⚠️ Fitur ini hanya untuk administrator!' : 
                '⚠️ This feature only for administrator!');
        }
        
        if (plugin.gconly && !m.isGroup) {
            return m.reply(m.sender.user.startsWith('62') ? 
                '⚠️ Fitur ini hanya dapat digunakan di dalam grup!' : 
                '⚠️ This feature only can used inside group chat!');
        }
        
        if (plugin.gcadmin && !m.isGroupAdmin) {
            return m.reply(m.sender.user.startsWith('62') ? 
                '⚠️ Fitur Ini hanya tersedia untuk admin grup!' : 
                '⚠️ This feature is only available for the group admin!');
        }

        try {
            await m.reply('⏱️');
            await plugin.run(m, plugins);
            await m.reply('✅');
        } catch (e) {
            await m.reply('❌');
            await m.reply(`Error: ${e.message}`);
            logger.error(`Error executing plugin: ${e}`);
        }
        return;
    }
}

module.exports = { handleMessage };