module.exports = {
    admin: false,
    name: 'ping',
    alias: ['latency', 'p'],
    category: 'info',
    run: async (m) => {
        const start = Date.now();
        const msg = await m.reply('🏓 Pinging...');
        const latency = Date.now() - start;
        
        await m.reply(`🏓 *Pong!*\n📊 Latency: ${latency}ms`);
    }
};