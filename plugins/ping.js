module.exports = {
    name: 'ping',
    alias: ['p'],
    category: 'info',
    run: async (m) => {
        const start = Date.now();
        await m.reply('🏓 Pong!');
        const latency = Date.now() - start;
        await m.reply(`⚡ ${latency}ms`);
    }
};