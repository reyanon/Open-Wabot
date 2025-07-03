const { downloadMediaMessage } = require('baileys');
const { generateID } = require('../utils/helpers');
const emoji = require('emoji-regex');

function getMessageType(content) {
    if (!content) return '';
    return Object.keys(content).find(k => !/^(senderKeyDistributionMessage|messageContextInfo)$/.test(k)) || '';
}

function parseMention(text) {
    if (typeof text === 'string') {
       let matches = text.matchAll(/@([0-9]{5,16}|0)/g);
       if (matches !== null) {
          return [...matches].map(v => v[1] + '@s.whatsapp.net') || [];
       }
    }
    return [];
}

function serialize(rmsg, bot) {
    if (!rmsg.message || !rmsg.key || rmsg.status === 1) return;

    let m = {
        id: rmsg.key.id,
        name: rmsg.key.fromMe ? bot.sock.user.name : rmsg.pushName,
        chat: bot.sock.decodeJID(rmsg.key.remoteJid),
        sender: bot.sock.decodeJID(rmsg.key.fromMe ? bot.sock.user.id : rmsg.key.participant || rmsg.key.remoteJid),
        fromMe: rmsg.key.fromMe,
        broadcast: rmsg.broadcast || rmsg.key.remoteJid.endsWith('@newsletter'),
        timestamp: rmsg.messageTimestamp?.low || rmsg.messageTimestamp?.high || rmsg.messageTimestamp || Math.floor(Date.now() / 1000)
    };

    m.isGroup = m.chat.server === 'g.us';
    
    if (m.isGroup) {
        // Add group metadata logic here
        m.isGroupAdmin = false; // Implement group admin check
        m.isGroupSuperAdmin = false; // Implement super admin check
        m.isBotAdmin = false; // Implement bot admin check
    }

    let edited = rmsg.message.editedMessage?.message?.protocolMessage;
    let msg = edited?.editedMessage || rmsg.message;
    msg = msg.documentWithCaptionMessage?.message || msg;
    m.type = getMessageType(msg);
    msg = m.type == 'conversation' ? msg : msg[m.type];
    if (!msg) return;

    m.body = msg.conversation || msg.text || msg.caption;
    
    if (m.body) {
        m.prefix = bot.config.prefixes.find(p => m.body.startsWith(p));
        let body = m.body.slice(m.prefix?.length).trim();
        m.cmd = body.split(/[\s\n]+/)[0].toLowerCase();
        m.text = body.slice(m.cmd.length).trim();
        m.url = (body.match(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi) || [])[0] || '';
    }

    m.mimetype = msg.mimetype || 'text/plain';
    m.download = async function download() { 
        return (msg.mimetype || msg.thumbnailDirectPath) ? 
            await downloadMediaMessage(rmsg, 'buffer', { reuploadRequest: bot.sock.updateMediaMessage }) : 
            Buffer.from(m.body, 'utf-8');
    };

    m.key = rmsg.key;
    m.message = rmsg.message;
    
    // Handle quoted messages
    let ctx = msg.contextInfo;
    if (ctx?.quotedMessage) {
        m.contextInfo = ctx;
        m.quoted = {
            key: {
                id: ctx.stanzaId,
                remoteJid: ctx.remoteJid || m.chat.toString(),
                participant: ctx.participant
            },
        };
        // Add quoted message processing logic here
    }

    // Add reply function
    m.reply = async function reply(...contents) {
        let msg = {};
        let opt = {
            quoted: rmsg,
            getUrlInfo: false,
            ephemeralExpiration: m.expiration,
            messageId: generateID(24, 'NXS_')
        };

        for (let content of contents) {
            switch (true) {
                case (typeof content === 'string'):
                    const emojies = content.match(emoji());
                    if (msg.image || msg.video || msg.document) {
                        msg.caption = msg.caption ? msg.caption + ' ' + content : content;
                    } else if (!msg.audio && !msg.sticker) {
                        if (contents.length === 1 && emojies && emojies[0].length === content.length) {
                            msg.react = {
                                text: content,
                                key: m.key
                            };
                            continue;
                        } else {
                            if (!content) continue;
                            msg.text = msg.text ? msg.text + ' ' + content : content;
                        }
                    }

                    let mentions = parseMention(content);
                    if (mentions) {
                        msg.mentions = msg.mentions?.length > 0 ? msg.mentions.concat(mentions) : mentions;
                    }
                    break;

                case (Buffer.isBuffer(content)):
                    const { fileTypeFromBuffer } = await import('file-type');
                    let mime, ext;
                    try {
                        ({ mime, ext } = await fileTypeFromBuffer(content));
                    } catch {
                        [mime, ext] = ['text/plain', 'txt'];
                    }

                    if (msg.text) {
                        msg.caption = msg.text;
                        delete msg.text;
                    }

                    if (mime === 'image/webp') {
                        delete msg.caption;
                        msg.sticker = content;
                    } else if (mime.startsWith('image')) {
                        msg.image = content;
                    } else if (mime.startsWith('video')) {
                        msg.video = content;
                    } else if (mime.startsWith('audio')) {
                        msg.audio = content;
                        msg.mimetype = 'audio/mpeg';
                    } else {
                        msg.mimetype = mime;
                        msg.document = content;
                        msg.fileName = `${generateID(12, 'NXS_')}.${ext}`;
                    }
                    break;

                case (typeof content === 'object'):
                    msg = Object.assign(msg, content);
                    break;

                default:
                    throw new Error('Unsupported content type');
            }
        }

        let hasMsg = Object.values(msg).some(v => v);
        if (!hasMsg) return;
        
        return bot.sock.sendMessage(m.chat.toString(), msg, opt);
    };

    return m;
}

module.exports = { serialize };