module.exports = {
    name: 'restart',
    alias: ['reboot'],
    category: 'admin',
    admin: true,
    run: async (m) => {
        await m.reply('🔄 Restarting...');
        setTimeout(() => process.send('restart'), 1000);
    }
};