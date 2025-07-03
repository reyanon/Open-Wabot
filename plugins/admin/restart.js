module.exports = {
    admin: true,
    name: 'restart',
    alias: ['reboot'],
    category: 'admin',
    run: async (m) => {
        await m.reply('🔄 Restarting bot...');
        
        setTimeout(() => {
            process.send('restart');
        }, 2000);
    }
};