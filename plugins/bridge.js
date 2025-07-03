module.exports = {
    name: 'bridge',
    alias: ['br'],
    category: 'admin',
    admin: true,
    run: async (m, plugins) => {
        if (!m.text) {
            return m.reply(`🌉 *Bridge Manager*

*Available Commands:*
• ${m.prefix}bridge status - Show bridge status
• ${m.prefix}bridge sync - Sync contacts (Telegram)
• ${m.prefix}bridge restart - Restart bridges

*Current Bridges:*
${global.bot.bridges.map(b => `• ${b.name}: ${b.telegramBot ? '✅ Active' : '❌ Inactive'}`).join('\n') || '• No bridges active'}`);
        }

        const [action] = m.text.split(' ');

        switch (action.toLowerCase()) {
            case 'status':
                let status = `🌉 *Bridge Status*\n\n`;
                for (const bridge of global.bot.bridges) {
                    status += `*${bridge.name}:*\n`;
                    if (bridge.name === 'Telegram') {
                        status += `• Bot: ${bridge.telegramBot ? '✅ Connected' : '❌ Disconnected'}\n`;
                        status += `• Chats: ${bridge.chatMappings?.size || 0}\n`;
                        status += `• Contacts: ${bridge.contactMappings?.size || 0}\n`;
                        status += `• Users: ${bridge.userMappings?.size || 0}\n`;
                    }
                    status += '\n';
                }
                await m.reply(status);
                break;

            case 'sync':
                const telegramBridge = global.bot.bridges.find(b => b.name === 'Telegram');
                if (telegramBridge) {
                    await m.reply('🔄 Syncing contacts...');
                    await telegramBridge.syncContacts();
                    await telegramBridge.updateTopicNames();
                    await m.reply('✅ Contact sync completed!');
                } else {
                    await m.reply('❌ Telegram bridge not found');
                }
                break;

            case 'restart':
                await m.reply('🔄 Restarting bridges...');
                // Restart bridges logic here
                await m.reply('✅ Bridges restarted!');
                break;

            default:
                await m.reply('❌ Unknown action. Use: status, sync, or restart');
        }
    }
};