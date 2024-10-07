const config = require('../config.js');
const { isModuleInstalled } = require('./util.js');
const { isWhitelist } = require('./whitelist.js');

/**
 * Handles incoming messages and forwards them to the appropriate plugins.
 *
 * This asynchronous function is intended to process messages received by the bot.
 * It will manage and route the messages to the relevant plugins for further handling.
 * The actual implementation of how messages are processed and forwarded to plugins 
 * should be completed within this function.
 *
 * @param {Object} m - The message object that contains the details of the incoming message.
 * @param {Array} plugins - An array of plugin functions or objects that will handle the message.
 */
async function message(m, plugins) {
    if (m.cmd && m.quoted && bot.sessions.get(m.quoted.key.id)) {
        const sessions = bot.sessions.get(m.quoted.key.id);
        const opt = m.cmd.match(/^\d+/);

        if (!opt || opt[0] < 1 || opt[0] > sessions.length) {
            return m.reply(m.sender.user.startsWith('62') ? `Kamu tidak memasukkan nilai yang valid.` : `You don't enter valid value.`);
        }

        try {
            await m.reply('⏱️');
            await sessions[Number(opt[0])-1]();
            await m.reply('');
        } catch (e) {
            await m.reply(`Error: ${e.message}`);
            await m.reply('❌');
        }
        return;
    }

    if (!m.prefix) return;
    if (!await isWhitelist(m.sender.user)) {
        if (!m.isGroup) m.reply(config.whitelistMsg);
        return;
    }
    
    for (let plugin of plugins) {
		plugins = plugins.filter(x => x != plugin);
		try {
			plugin = require(plugin);
			plugins.push(plugin);
		} catch (e) {
			log.error(`Failed loading plugin: ${e}`);
		}
	}

    if (isModuleInstalled('bot-plugins')) plugins = plugins.concat(require('bot-plugins'));
    plugins = plugins.filter(p => !!Object.keys(p).length);
    const administrator = !!config.administrator.find(x => x == m.sender.user);

    for (let plugin of plugins) {
        if (![plugin?.name, ...plugin?.alias].includes(m.cmd)) continue;
        bot.sendPresenceUpdate('composing', m.chat.toString());
        if (plugin.admin && !administrator) return m.reply(m.sender.user.startsWith('62') ? '⚠️ Fitur ini hanya untuk administrator!' : '⚠️ This feature only for administrator!');
        if (plugin.gconly && !m.isGroup) return m.reply(m.sender.user.startsWith('62') ? '⚠️ Fitur ini hanya dapat digunakan di dalam grup!' : '⚠️ This feature only can used inside group chat!');
        if (plugin.gcadmin && !m.isGroupAdmin) return m.reply(m.sender.user.startsWith('62') ? '⚠️ Fitur Ini hanya tersedia untuk admin grup!' : '⚠️ This feature is only available for the group admin!');
        try {
            await m.reply('⏱️');
            await plugin.run(m, plugins);
            await m.reply('');
        } catch (e) {
            await m.reply('❌');
            await m.reply(`Error: ${e.message}`);
            log.error(`Error executing plugin: ${e}`);
        }
        return;
    }
}

module.exports = { message }