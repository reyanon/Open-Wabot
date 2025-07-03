const { downloadMediaMessage } = require('baileys');

function serialize(msg, bot) {
    if (!msg.message || !msg.key) return;

    const m = {
        key: msg.key,
        message: msg.message,
        id: msg.key.id,
        chat: bot.sock.decodeJID(msg.key.remoteJid),
        sender: bot.sock.decodeJID(msg.key.fromMe ? bot.sock.user.id : msg.key.participant || msg.key.remoteJid),
        fromMe: msg.key.fromMe,
        isGroup: msg.key.remoteJid.endsWith('@g.us'),
        timestamp: msg.messageTimestamp || Date.now()
    };

    // Extract message content
    const content = msg.message.conversation || 
                   msg.message.extendedTextMessage?.text || 
                   msg.message.imageMessage?.caption || 
                   msg.message.videoMessage?.caption || '';

    m.body = content;
    m.type = Object.keys(msg.message)[0];

    // Parse command
    if (m.body) {
        m.prefix = bot.config.prefixes.find(p => m.body.startsWith(p));
        if (m.prefix) {
            const body = m.body.slice(m.prefix.length).trim();
            m.cmd = body.split(' ')[0].toLowerCase();
            m.text = body.slice(m.cmd.length).trim();
        }
    }

    // Download function
    m.download = async () => {
        const msgType = Object.keys(msg.message)[0];
        if (['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'].includes(msgType)) {
            return await downloadMediaMessage(msg, 'buffer');
        }
        return Buffer.from(m.body || '', 'utf-8');
    };

    // Reply function
    m.reply = async (content) => {
        const message = typeof content === 'string' ? { text: content } : content;
        return await bot.sock.sendMessage(m.chat.toString(), message, { quoted: msg });
    };

    return m;
}

module.exports = { serialize };