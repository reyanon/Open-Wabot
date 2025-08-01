const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');
const mime = require('mime-types');
const { downloadContentFromMessage } = require('baileys');
const ffmpeg = require('fluent-ffmpeg');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const { DatabaseModule } = require('../modules/database');

class TelegramBridge {
    constructor(bot, config) {
        this.bot = bot;
        this.config = config;
        this.name = 'Telegram';
        this.telegramBot = null;
        this.chatMappings = new Map();
        this.userMappings = new Map();
        this.contactMappings = new Map();
        this.profilePicCache = new Map();
        this.tempDir = path.join(__dirname, '../temp');
        this.isProcessing = false;
        this.activeCallNotifications = new Map();
        this.statusMessageIds = new Map();
        this.presenceTimeout = null;
        this.botChatId = null;
        this.db = null;
        this.messageQueue = new Map();
        this.lastPresenceUpdate = new Map();
    }

    async initialize() {
        const token = this.config.botToken;
        const chatId = this.config.chatId;
        
        if (!token || token.includes('YOUR_BOT_TOKEN') || !chatId || chatId.includes('YOUR_CHAT_ID')) {
            log.warn('⚠️ Telegram bot token or chat ID not configured');
            return;
        }

        try {
            // Initialize database module
            this.db = new DatabaseModule('telegram_bridge');
            await this.db.initialize();
            
            await fs.ensureDir(this.tempDir);
            
            this.telegramBot = new TelegramBot(token, { 
                polling: true,
                onlyFirstMatch: true
            });
            
            await this.setupTelegramHandlers();
            await this.loadMappingsFromDb();
            
            // Wait for WhatsApp to be ready before syncing
            if (this.bot?.sock?.user) {
                await this.syncContacts();
                await this.updateTopicNames();
            }
            
            log.info('✅ Advanced Telegram bridge initialized');
        } catch (error) {
            log.error('❌ Failed to initialize Telegram bridge:', error);
        }
    }

    async loadMappingsFromDb() {
        try {
            const mappings = await this.db.find({});
            
            for (const mapping of mappings) {
                switch (mapping.type) {
                    case 'chat':
                        this.chatMappings.set(mapping.data.whatsappJid, mapping.data.telegramTopicId);
                        break;
                    case 'user':
                        this.userMappings.set(mapping.data.whatsappId, {
                            name: mapping.data.name,
                            phone: mapping.data.phone,
                            firstSeen: mapping.data.firstSeen,
                            messageCount: mapping.data.messageCount || 0
                        });
                        break;
                    case 'contact':
                        this.contactMappings.set(mapping.data.phone, mapping.data.name);
                        break;
                }
            }
            
            log.info(`📊 Loaded mappings: ${this.chatMappings.size} chats, ${this.userMappings.size} users, ${this.contactMappings.size} contacts`);
        } catch (error) {
            log.error('❌ Failed to load mappings:', error);
        }
    }

    async saveChatMapping(whatsappJid, telegramTopicId) {
        try {
            await this.db.upsert(
                { type: 'chat', 'data.whatsappJid': whatsappJid },
                { 
                    type: 'chat',
                    data: { 
                        whatsappJid, 
                        telegramTopicId, 
                        createdAt: new Date(),
                        lastActivity: new Date()
                    } 
                }
            );
            this.chatMappings.set(whatsappJid, telegramTopicId);
            log.debug(`✅ Saved chat mapping: ${whatsappJid} -> ${telegramTopicId}`);
        } catch (error) {
            log.error('❌ Failed to save chat mapping:', error);
        }
    }

    async saveUserMapping(whatsappId, userData) {
        try {
            await this.db.upsert(
                { type: 'user', 'data.whatsappId': whatsappId },
                { 
                    type: 'user',
                    data: { 
                        whatsappId,
                        name: userData.name,
                        phone: userData.phone,
                        firstSeen: userData.firstSeen,
                        messageCount: userData.messageCount || 0,
                        lastSeen: new Date()
                    } 
                }
            );
            this.userMappings.set(whatsappId, userData);
            log.debug(`✅ Saved user mapping: ${whatsappId} (${userData.name || userData.phone})`);
        } catch (error) {
            log.error('❌ Failed to save user mapping:', error);
        }
    }

    async saveContactMapping(phone, name) {
        try {
            await this.db.upsert(
                { type: 'contact', 'data.phone': phone },
                { 
                    type: 'contact',
                    data: { 
                        phone, 
                        name, 
                        updatedAt: new Date() 
                    } 
                }
            );
            this.contactMappings.set(phone, name);
            log.debug(`✅ Saved contact mapping: ${phone} -> ${name}`);
        } catch (error) {
            log.error('❌ Failed to save contact mapping:', error);
        }
    }

    async syncContacts() {
        try {
            if (!this.bot?.sock?.user) {
                log.warn('⚠️ WhatsApp not connected, skipping contact sync');
                return;
            }
            
            log.info('📞 Syncing contacts from WhatsApp...');
            
            // Get contacts from WhatsApp store 
            const contacts = this.bot.sock.store?.contacts || {};
            const contactEntries = Object.entries(contacts);
            
            log.debug(`🔍 Found ${contactEntries.length} contacts in WhatsApp store`);
            
            let syncedCount = 0;
            
            for (const [jid, contact] of contactEntries) {
                if (!jid || jid === 'status@broadcast' || !contact) continue;
                
                const phone = jid.split('@')[0];
                let contactName = null;
                
                // Extract name from contact 
                if (contact.name) {
                    contactName = contact.name;
                } else if (contact.notify) {
                    contactName = contact.notify;
                } else if (contact.verifiedName) {
                    contactName = contact.verifiedName;
                }
                
                if (contactName && contactName !== phone) {
                    const existingName = this.contactMappings.get(phone);
                    if (existingName !== contactName) {
                        await this.saveContactMapping(phone, contactName);
                        syncedCount++;
                        log.debug(`📞 Synced contact: ${phone} -> ${contactName}`);
                    }
                }
            }
            
            log.info(`✅ Synced ${syncedCount} new/updated contacts (Total: ${this.contactMappings.size})`);
            await this.logToTelegram('✅ Contact Sync Complete', `Synced ${syncedCount} new/updated contacts. Total: ${this.contactMappings.size}`);
            
        } catch (error) {
            log.error('❌ Failed to sync contacts:', error);
            await this.logToTelegram('❌ Contact Sync Failed', `Error: ${error.message}`);
        }
    }

    async updateTopicNames() {
        try {
            const chatId = this.config.chatId;
            if (!chatId || chatId.includes('YOUR_CHAT_ID')) {
                log.error('❌ Invalid telegram.chatId for updating topic names');
                return;
            }
            
            log.info('📝 Updating Telegram topic names...');
            let updatedCount = 0;
            
            for (const [jid, topicId] of this.chatMappings.entries()) {
                if (!jid.endsWith('@g.us') && jid !== 'status@broadcast' && jid !== 'call@broadcast') {
                    const phone = jid.split('@')[0];
                    const contactName = this.contactMappings.get(phone) || `+${phone}`;
                    
                    try {
                        await this.telegramBot.editForumTopic(chatId, topicId, {
                            name: contactName
                        });
                        log.debug(`📝 Updated topic name for ${phone} to ${contactName}`);
                        updatedCount++;
                    } catch (error) {
                        log.error(`❌ Failed to update topic ${topicId} for ${phone}:`, error);
                    }
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
            
            log.info(`✅ Updated ${updatedCount} topic names`);
            await this.logToTelegram('✅ Topic Names Updated', `Updated ${updatedCount} topic names.`);
        } catch (error) {
            log.error('❌ Failed to update topic names:', error);
            await this.logToTelegram('❌ Topic Names Update Failed', `Error: ${error.message}`);
        }
    }

    async setReaction(chatId, messageId, emoji) {
        try {
            const token = this.config.botToken;
            await axios.post(`https://api.telegram.org/bot${token}/setMessageReaction`, {
                chat_id: chatId,
                message_id: messageId,
                reaction: [{ type: 'emoji', emoji }]
            });
        } catch (err) {
            log.debug('❌ Failed to set reaction:', err?.response?.data?.description || err.message);
        }
    }

    async setupTelegramHandlers() {
        this.telegramBot.on('message', this.wrapHandler(async (msg) => {
            if (msg.chat.type === 'private') {
                this.botChatId = msg.chat.id;
                // Handle private commands here
            } else if (msg.chat.type === 'supergroup' && msg.is_topic_message) {
                await this.handleTelegramMessage(msg);
            }
        }));

        this.telegramBot.on('polling_error', (error) => {
            log.error('Telegram polling error:', error);
        });

        this.telegramBot.on('error', (error) => {
            log.error('Telegram bot error:', error);
        });

        log.info('📱 Telegram message handlers set up');
    }

    wrapHandler(handler) {
        return async (...args) => {
            try {
                await handler(...args);
            } catch (error) {
                log.error('❌ Unhandled error in Telegram handler:', error);
            }
        };
    }

    async logToTelegram(title, message) {
        if (!this.telegramBot) return;

        const logChannel = this.config.logChannel;
        if (!logChannel || logChannel.includes('YOUR_LOG_CHANNEL')) {
            log.debug('Telegram log channel not configured');
            return;
        }

        try {
            const logMessage = `🤖 *${title}*\n\n${message}\n\n⏰ ${new Date().toLocaleString()}`;
            
            await this.telegramBot.sendMessage(logChannel, logMessage, {
                parse_mode: 'Markdown'
            });
        } catch (error) {
            log.debug('Could not send log to Telegram:', error.message);
        }
    }

    // Bridge event handlers
    onMessage(m) {
        if (this.telegramBot && this.config.chatId && m.body) {
            this.syncMessage(m, m.body);
        }
    }

    onCall(call) {
        if (this.telegramBot && this.config.chatId) {
            this.handleCallNotification(call);
        }
    }

    onConnected() {
        if (this.telegramBot && this.config.chatId) {
            this.syncWhatsAppConnection();
        }
    }

    async syncMessage(whatsappMsg, text) {
        if (!this.telegramBot || !this.config.enabled) return;

        const sender = whatsappMsg.key.remoteJid;
        const participant = whatsappMsg.key.participant || sender;
        const isFromMe = whatsappMsg.key.fromMe;
        
        if (isFromMe) {
            const existingTopicId = this.chatMappings.get(sender);
            if (existingTopicId) {
                await this.syncOutgoingMessage(whatsappMsg, text, existingTopicId, sender);
            }
            return;
        }
        
        await this.createUserMapping(participant, whatsappMsg);
        const topicId = await this.getOrCreateTopic(sender, whatsappMsg);
        
        if (whatsappMsg.message?.ptvMessage || (whatsappMsg.message?.videoMessage?.ptv)) {
            await this.handleWhatsAppMedia(whatsappMsg, 'video_note', topicId);
        } else if (whatsappMsg.message?.imageMessage) {
            await this.handleWhatsAppMedia(whatsappMsg, 'image', topicId);
        } else if (whatsappMsg.message?.videoMessage) {
            await this.handleWhatsAppMedia(whatsappMsg, 'video', topicId);
        } else if (whatsappMsg.message?.audioMessage) {
            await this.handleWhatsAppMedia(whatsappMsg, 'audio', topicId);
        } else if (whatsappMsg.message?.documentMessage) {
            await this.handleWhatsAppMedia(whatsappMsg, 'document', topicId);
        } else if (whatsappMsg.message?.stickerMessage) {
            await this.handleWhatsAppMedia(whatsappMsg, 'sticker', topicId);
        } else if (whatsappMsg.message?.locationMessage) { 
            await this.handleWhatsAppLocation(whatsappMsg, topicId);
        } else if (whatsappMsg.message?.contactMessage) { 
            await this.handleWhatsAppContact(whatsappMsg, topicId);
        } else if (text) {
            let messageText = text;
            if (sender.endsWith('@g.us') && participant !== sender) {
                const senderPhone = participant.split('@')[0];
                const senderName = this.contactMappings.get(senderPhone) || senderPhone;
                messageText = `👤 ${senderName}:\n${text}`;
            }
            
            const messageId = await this.sendSimpleMessage(topicId, messageText, sender);
            
            if (sender === 'status@broadcast') {
                this.statusMessageIds.set(messageId, whatsappMsg.key);
            }
        }

        if (whatsappMsg.key?.id && this.config.features?.readReceipts !== false) {
            this.queueMessageForReadReceipt(sender, whatsappMsg.key);
        }
    }

    async syncOutgoingMessage(whatsappMsg, text, topicId, sender) {
        try {
            if (whatsappMsg.message?.ptvMessage || (whatsappMsg.message?.videoMessage?.ptv)) {
                await this.handleWhatsAppMedia(whatsappMsg, 'video_note', topicId, true);
            } else if (whatsappMsg.message?.imageMessage) {
                await this.handleWhatsAppMedia(whatsappMsg, 'image', topicId, true);
            } else if (whatsappMsg.message?.videoMessage) {
                await this.handleWhatsAppMedia(whatsappMsg, 'video', topicId, true);
            } else if (whatsappMsg.message?.audioMessage) {
                await this.handleWhatsAppMedia(whatsappMsg, 'audio', topicId, true);
            } else if (whatsappMsg.message?.documentMessage) {
                await this.handleWhatsAppMedia(whatsappMsg, 'document', topicId, true);
            } else if (whatsappMsg.message?.stickerMessage) {
                await this.handleWhatsAppMedia(whatsappMsg, 'sticker', topicId, true);
            } else if (whatsappMsg.message?.locationMessage) { 
                await this.handleWhatsAppLocation(whatsappMsg, topicId, true);
            } else if (whatsappMsg.message?.contactMessage) { 
                await this.handleWhatsAppContact(whatsappMsg, topicId, true);
            } else if (text) {
                const messageText = `📤 You: ${text}`;
                await this.sendSimpleMessage(topicId, messageText, sender);
            }
        } catch (error) {
            log.error('❌ Failed to sync outgoing message:', error);
        }
    }

    queueMessageForReadReceipt(chatJid, messageKey) {
        if (!this.config.features?.readReceipts) return;
        
        if (!this.messageQueue.has(chatJid)) {
            this.messageQueue.set(chatJid, []);
        }
        
        this.messageQueue.get(chatJid).push(messageKey);
        
        setTimeout(() => {
            this.processReadReceipts(chatJid);
        }, 2000);
    }

    async processReadReceipts(chatJid) {
        try {
            const messages = this.messageQueue.get(chatJid);
            if (!messages || messages.length === 0) return;
            
            if (this.bot?.sock) {
                await this.bot.sock.readMessages(messages);
                log.debug(`📖 Marked ${messages.length} messages as read in ${chatJid}`);
            }
            
            this.messageQueue.set(chatJid, []);
        } catch (error) {
            log.debug('Failed to send read receipts:', error);
        }
    }

    async createUserMapping(participant, whatsappMsg) {
        if (this.userMappings.has(participant)) {
            const userData = this.userMappings.get(participant);
            userData.messageCount = (userData.messageCount || 0) + 1;
            await this.saveUserMapping(participant, userData);
            return;
        }

        let userName = null;
        let userPhone = participant.split('@')[0];
        
        try {
            if (this.contactMappings.has(userPhone)) {
                userName = this.contactMappings.get(userPhone);
            }
        } catch (error) {
            log.debug('Could not fetch contact info:', error);
        }

        const userData = {
            name: userName,
            phone: userPhone,
            firstSeen: new Date(),
            messageCount: 1
        };

        await this.saveUserMapping(participant, userData);
        log.debug(`👤 Created user mapping: ${userName || userPhone} (${userPhone})`);
    }

    async getOrCreateTopic(chatJid, whatsappMsg) {
        if (this.chatMappings.has(chatJid)) {
            return this.chatMappings.get(chatJid);
        }

        const chatId = this.config.chatId;
        if (!chatId || chatId.includes('YOUR_CHAT_ID')) {
            log.error('❌ Telegram chat ID not configured');
            return null;
        }

        try {
            const isGroup = chatJid.endsWith('@g.us');
            const isStatus = chatJid === 'status@broadcast';
            const isCall = chatJid === 'call@broadcast';
            
            let topicName;
            let iconColor = 0x7ABA3C;
            
            if (isStatus) {
                topicName = `📊 Status Updates`;
                iconColor = 0xFF6B35;
            } else if (isCall) {
                topicName = `📞 Call Logs`;
                iconColor = 0xFF4757;
            } else if (isGroup) {
                try {
                    const groupMeta = await this.bot.sock.groupMetadata(chatJid);
                    topicName = `${groupMeta.subject}`;
                } catch (error) {
                    topicName = `Group Chat`;
                    log.debug(`Could not fetch group metadata for ${chatJid}:`, error);
                }
                iconColor = 0x6FB9F0;
            } else {
                const phone = chatJid.split('@')[0];
                const contactName = this.contactMappings.get(phone) || `+${phone}`;
                topicName = contactName;
            }

            const topic = await this.telegramBot.createForumTopic(chatId, topicName, {
                icon_color: iconColor
            });

            await this.saveChatMapping(chatJid, topic.message_thread_id);
            log.info(`🆕 Created Telegram topic: ${topicName} (ID: ${topic.message_thread_id}) for ${chatJid}`);
            
            if (!isStatus && !isCall) {
                await this.sendWelcomeMessage(topic.message_thread_id, chatJid, isGroup, whatsappMsg);
            }
            
            return topic.message_thread_id;
        } catch (error) {
            log.error('❌ Failed to create Telegram topic:', error);
            return null;
        }
    }

    async sendWelcomeMessage(topicId, jid, isGroup, whatsappMsg) {
        try {
            const chatId = this.config.chatId;
            const phone = jid.split('@')[0];
            const contactName = this.contactMappings.get(phone) || `+${phone}`;
            const participant = whatsappMsg.key.participant || jid;
            const userInfo = this.userMappings.get(participant);
            const handleName = whatsappMsg.pushName || userInfo?.name || 'Unknown';
            
            let welcomeText = '';
            
            if (isGroup) {
                try {
                    const groupMeta = await this.bot.sock.groupMetadata(jid);
                    welcomeText = `🏷️ **Group Information**\n\n` +
                                 `📝 **Name:** ${groupMeta.subject}\n` +
                                 `👥 **Participants:** ${groupMeta.participants.length}\n` +
                                 `🆔 **Group ID:** \`${jid}\`\n` +
                                 `📅 **Created:** ${new Date(groupMeta.creation * 1000).toLocaleDateString()}\n\n` +
                                 `💬 Messages from this group will appear here`;
                } catch (error) {
                    welcomeText = `🏷️ **Group Chat**\n\n💬 Messages from this group will appear here`;
                    log.debug(`Could not fetch group metadata for ${jid}:`, error);
                }
            } else {
                welcomeText = `👤 **Contact Information**\n\n` +
                             `📝 **Name:** ${contactName}\n` +
                             `📱 **Phone:** +${phone}\n` +
                             `🖐️ **Handle:** ${handleName}\n` +
                             `🆔 **WhatsApp ID:** \`${jid}\`\n` +
                             `📅 **First Contact:** ${new Date().toLocaleDateString()}\n\n` +
                             `💬 Messages with this contact will appear here`;
            }

            const sentMessage = await this.telegramBot.sendMessage(chatId, welcomeText, {
                message_thread_id: topicId,
                parse_mode: 'Markdown'
            });

            await this.telegramBot.pinChatMessage(chatId, sentMessage.message_id);
            await this.sendProfilePicture(topicId, jid, false);

        } catch (error) {
            log.error('❌ Failed to send welcome message:', error);
        }
    }

    async sendProfilePicture(topicId, jid, isUpdate = false) {
        try {
            const profilePicUrl = await this.bot.sock.profilePictureUrl(jid, 'image');
            
            if (profilePicUrl) {
                const caption = isUpdate ? '📸 Profile picture updated' : '📸 Profile Picture';
                
                await this.telegramBot.sendPhoto(this.config.chatId, profilePicUrl, {
                    message_thread_id: topicId,
                    caption: caption
                });
                
                this.profilePicCache.set(jid, profilePicUrl);
            }
        } catch (error) {
            log.debug('Could not send profile picture:', error);
        }
    }

    async handleCallNotification(callEvent) {
        if (!this.telegramBot || !this.config.features?.callLogs) return;

        const callerId = callEvent.from;
        const callKey = `${callerId}_${callEvent.id}`;

        if (this.activeCallNotifications.has(callKey)) return;
        
        this.activeCallNotifications.set(callKey, true);
        setTimeout(() => {
            this.activeCallNotifications.delete(callKey);
        }, 30000);

        try {
            const phone = callerId.split('@')[0];
            const callerName = this.contactMappings.get(phone) || `+${phone}`;
            
            const topicId = await this.getOrCreateTopic('call@broadcast', {
                key: { remoteJid: 'call@broadcast', participant: callerId }
            });

            if (!topicId) {
                log.error('❌ Could not create call topic');
                return;
            }

            const callMessage = `📞 **Incoming Call**\n\n` +
                               `👤 **From:** ${callerName}\n` +
                               `📱 **Number:** +${phone}\n` +
                               `⏰ **Time:** ${new Date().toLocaleString()}\n` +
                               `📋 **Status:** ${callEvent.status || 'Incoming'}`;

            await this.telegramBot.sendMessage(this.config.chatId, callMessage, {
                message_thread_id: topicId,
                parse_mode: 'Markdown'
            });

            log.info(`📞 Sent call notification from ${callerName}`);
        } catch (error) {
            log.error('❌ Error handling call notification:', error);
        }
    }

    async handleWhatsAppMedia(whatsappMsg, mediaType, topicId, isOutgoing = false) {
        try {
            log.info(`📥 Processing ${mediaType} from WhatsApp`);
            
            let mediaMessage;
            let fileName = `media_${Date.now()}`;
            let caption = this.extractText(whatsappMsg);
            
            switch (mediaType) {
                case 'image':
                    mediaMessage = whatsappMsg.message.imageMessage;
                    fileName += '.jpg';
                    break;
                case 'video':
                    mediaMessage = whatsappMsg.message.videoMessage;
                    fileName += '.mp4';
                    break;
                case 'video_note':
                    mediaMessage = whatsappMsg.message.ptvMessage || whatsappMsg.message.videoMessage;
                    fileName += '.mp4';
                    break;
                case 'audio':
                    mediaMessage = whatsappMsg.message.audioMessage;
                    fileName += '.ogg';
                    break;
                case 'document':
                    mediaMessage = whatsappMsg.message.documentMessage;
                    fileName = mediaMessage.fileName || `document_${Date.now()}`;
                    break;
                case 'sticker':
                    mediaMessage = whatsappMsg.message.stickerMessage;
                    fileName += '.webp';
                    break;
            }

            if (!mediaMessage) {
                log.error(`❌ No media message found for ${mediaType}`);
                return;
            }

            log.info(`📥 Downloading ${mediaType} from WhatsApp: ${fileName}`);

            const downloadType = mediaType === 'sticker' ? 'sticker' : 
                                mediaType === 'video_note' ? 'video' : 
                                mediaType;
            
            const stream = await downloadContentFromMessage(mediaMessage, downloadType);
            
            if (!stream) {
                log.error(`❌ Failed to get stream for ${mediaType}`);
                return;
            }
            
            const buffer = await this.streamToBuffer(stream);
            
            if (!buffer || buffer.length === 0) {
                log.error(`❌ Empty buffer for ${mediaType}`);
                return;
            }
            
            const filePath = path.join(this.tempDir, fileName);
            await fs.writeFile(filePath, buffer);

            log.info(`💾 Saved ${mediaType} to: ${filePath} (${buffer.length} bytes)`);

            const sender = whatsappMsg.key.remoteJid;
            const participant = whatsappMsg.key.participant || sender;
            
            if (isOutgoing) {
                caption = caption ? `📤 You: ${caption}` : '📤 You sent media';
            } else if (sender.endsWith('@g.us') && participant !== sender) {
                const senderPhone = participant.split('@')[0];
                const senderName = this.contactMappings.get(senderPhone) || senderPhone;
                caption = `👤 ${senderName}:\n${caption || ''}`;
            }

            const chatId = this.config.chatId;
            
            switch (mediaType) {
                case 'image':
                    await this.telegramBot.sendPhoto(chatId, filePath, {
                        message_thread_id: topicId,
                        caption: caption
                    });
                    break;
                    
                case 'video':
                    if (mediaMessage.gifPlayback) {
                        await this.telegramBot.sendAnimation(chatId, filePath, {
                            message_thread_id: topicId,
                            caption: caption
                        });
                    } else {
                        await this.telegramBot.sendVideo(chatId, filePath, {
                            message_thread_id: topicId,
                            caption: caption
                        });
                    }
                    break;

                case 'video_note':
                    const videoNotePath = await this.convertToVideoNote(filePath);
                    await this.telegramBot.sendVideoNote(chatId, videoNotePath, {
                        message_thread_id: topicId
                    });
                    if (caption) {
                        await this.telegramBot.sendMessage(chatId, caption, {
                            message_thread_id: topicId
                        });
                    }
                    if (videoNotePath !== filePath) {
                        await fs.unlink(videoNotePath).catch(() => {});
                    }
                    break;
                    
                case 'audio':
                    if (mediaMessage.ptt) {
                        await this.telegramBot.sendVoice(chatId, filePath, {
                            message_thread_id: topicId,
                            caption: caption
                        });
                    } else {
                        await this.telegramBot.sendAudio(chatId, filePath, {
                            message_thread_id: topicId,
                            caption: caption,
                            title: mediaMessage.title || 'Audio'
                        });
                    }
                    break;
                    
                case 'document':
                    await this.telegramBot.sendDocument(chatId, filePath, {
                        message_thread_id: topicId,
                        caption: caption
                    });
                    break;
                    
                case 'sticker':
                    try {
                        await this.telegramBot.sendSticker(chatId, filePath, {
                            message_thread_id: topicId
                        });
                    } catch (stickerError) {
                        log.debug('Failed to send as sticker, converting to PNG:', stickerError);
                        const pngPath = filePath.replace('.webp', '.png');
                        await sharp(filePath).png().toFile(pngPath);
                        
                        await this.telegramBot.sendPhoto(chatId, pngPath, {
                            message_thread_id: topicId,
                            caption: caption || 'Sticker'
                        });
                        await fs.unlink(pngPath).catch(() => {});
                    }
                    break;
            }

            log.info(`✅ Successfully sent ${mediaType} to Telegram`);
            await fs.unlink(filePath).catch(() => {});
            
        } catch (error) {
            log.error(`❌ Failed to handle WhatsApp ${mediaType}:`, error);
        }
    }

    async convertToVideoNote(inputPath) {
        return new Promise((resolve, reject) => {
            const outputPath = inputPath.replace('.mp4', '_note.mp4');
            
            ffmpeg(inputPath)
                .videoFilter('scale=240:240:force_original_aspect_ratio=increase,crop=240:240')
                .duration(60)
                .format('mp4')
                .on('end', () => {
                    log.debug('Video note conversion completed');
                    resolve(outputPath);
                })
                .on('error', (err) => {
                    log.debug('Video note conversion failed:', err);
                    resolve(inputPath);
                })
                .save(outputPath);
        });
    }

    async handleWhatsAppLocation(whatsappMsg, topicId, isOutgoing = false) {
        try {
            const locationMessage = whatsappMsg.message.locationMessage;
            
            const sender = whatsappMsg.key.remoteJid;
            const participant = whatsappMsg.key.participant || sender;
            let caption = '';
            
            if (isOutgoing) {
                caption = '📤 You shared location';
            } else if (sender.endsWith('@g.us') && participant !== sender) {
                const senderPhone = participant.split('@')[0];
                const senderName = this.contactMappings.get(senderPhone) || senderPhone;
                caption = `👤 ${senderName} shared location`;
            }
            
            await this.telegramBot.sendLocation(this.config.chatId, 
                locationMessage.degreesLatitude, 
                locationMessage.degreesLongitude, {
                    message_thread_id: topicId
                });
                
            if (caption) {
                await this.telegramBot.sendMessage(this.config.chatId, caption, {
                    message_thread_id: topicId
                });
            }
        } catch (error) {
            log.error('❌ Failed to handle WhatsApp location message:', error);
        }
    }

    async handleWhatsAppContact(whatsappMsg, topicId, isOutgoing = false) {
        try {
            const contactMessage = whatsappMsg.message.contactMessage;
            const displayName = contactMessage.displayName || 'Unknown Contact';

            const sender = whatsappMsg.key.remoteJid;
            const participant = whatsappMsg.key.participant || sender;
            let caption = `📇 Contact: ${displayName}`;
            
            if (isOutgoing) {
                caption = `📤 You shared contact: ${displayName}`;
            } else if (sender.endsWith('@g.us') && participant !== sender) {
                const senderPhone = participant.split('@')[0];
                const senderName = this.contactMappings.get(senderPhone) || senderPhone;
                caption = `👤 ${senderName} shared contact: ${displayName}`;
            }

            const phoneNumber = contactMessage.vcard.match(/TEL.*:(.*)/)?.[1] || '';
            await this.telegramBot.sendContact(this.config.chatId, phoneNumber, displayName, {
                message_thread_id: topicId
            });

        } catch (error) {
            log.error('❌ Failed to handle WhatsApp contact message:', error);
        }
    }

    async handleTelegramMessage(msg) {
        try {
            const topicId = msg.message_thread_id;
            const whatsappJid = this.findWhatsAppJidByTopic(topicId);
            
            if (!whatsappJid) {
                log.warn('⚠️ Could not find WhatsApp chat for Telegram message');
                return;
            }

            await this.sendPresence(whatsappJid, true);

            if (msg.photo) {
                await this.handleTelegramMedia(msg, 'photo');
            } else if (msg.video) {
                await this.handleTelegramMedia(msg, 'video');
            } else if (msg.animation) {
                await this.handleTelegramMedia(msg, 'animation');
            } else if (msg.video_note) {
                await this.handleTelegramMedia(msg, 'video_note');
            } else if (msg.voice) {
                await this.handleTelegramMedia(msg, 'voice');
            } else if (msg.audio) {
                await this.handleTelegramMedia(msg, 'audio');
            } else if (msg.document) {
                await this.handleTelegramMedia(msg, 'document');
            } else if (msg.sticker) {
                await this.handleTelegramMedia(msg, 'sticker');
            } else if (msg.location) {
                await this.handleTelegramLocation(msg);
            } else if (msg.contact) {
                await this.handleTelegramContact(msg);
            } else if (msg.text) {
                if (whatsappJid === 'status@broadcast' && msg.reply_to_message) {
                    await this.handleStatusReply(msg);
                    return;
                }

                const messageOptions = { text: msg.text };
                
                if (msg.entities && msg.entities.some(entity => entity.type === 'spoiler')) {
                    messageOptions.text = `🫥 ${msg.text}`;
                }

                const sendResult = await this.bot.sendMessage(whatsappJid, messageOptions);
                
                if (sendResult?.key?.id) {
                    await this.setReaction(msg.chat.id, msg.message_id, '👍');
                    
                    setTimeout(async () => {
                        await this.markAsRead(whatsappJid, [sendResult.key]);
                    }, 1000);
                }
            }

            setTimeout(async () => {
                await this.sendPresence(whatsappJid, false);
            }, 2000);

        } catch (error) {
            log.error('❌ Failed to handle Telegram message:', error);
            await this.setReaction(msg.chat.id, msg.message_id, '❌');
        }
    }

    async handleTelegramMedia(msg, mediaType) {
        try {
            const topicId = msg.message_thread_id;
            const whatsappJid = this.findWhatsAppJidByTopic(topicId);
            
            if (!whatsappJid) {
                log.warn('⚠️ Could not find WhatsApp chat for Telegram media');
                return;
            }

            await this.sendPresence(whatsappJid, false);

            let fileId, fileName, caption = msg.caption || '';
            
            switch (mediaType) {
                case 'photo':
                    fileId = msg.photo[msg.photo.length - 1].file_id;
                    fileName = `photo_${Date.now()}.jpg`;
                    break;
                case 'video':
                    fileId = msg.video.file_id;
                    fileName = `video_${Date.now()}.mp4`;
                    break;
                case 'animation':
                    fileId = msg.animation.file_id;
                    fileName = `animation_${Date.now()}.mp4`;
                    break;
                case 'video_note':
                    fileId = msg.video_note.file_id;
                    fileName = `video_note_${Date.now()}.mp4`;
                    break;
                case 'voice':
                    fileId = msg.voice.file_id;
                    fileName = `voice_${Date.now()}.ogg`;
                    break;
                case 'audio':
                    fileId = msg.audio.file_id;
                    fileName = msg.audio.file_name || `audio_${Date.now()}.mp3`;
                    break;
                case 'document':
                    fileId = msg.document.file_id;
                    fileName = msg.document.file_name || `document_${Date.now()}`;
                    break;
                case 'sticker':
                    fileId = msg.sticker.file_id;
                    fileName = `sticker_${Date.now()}.webp`;
                    break;
            }

            log.info(`📥 Downloading ${mediaType} from Telegram: ${fileName}`);

            const fileLink = await this.telegramBot.getFileLink(fileId);
            const response = await axios.get(fileLink, { responseType: 'arraybuffer' });
            const buffer = Buffer.from(response.data);
            
            const filePath = path.join(this.tempDir, fileName);
            await fs.writeFile(filePath, buffer);

            log.info(`💾 Saved ${mediaType} to: ${filePath} (${buffer.length} bytes)`);

            let sendResult;
            let messageOptions = {};

            const hasMediaSpoiler = msg.has_media_spoiler || 
                (msg.caption_entities && msg.caption_entities.some(entity => entity.type === 'spoiler'));

            switch (mediaType) {
                case 'photo':
                    messageOptions = {
                        image: fs.readFileSync(filePath),
                        caption: caption,
                        viewOnce: hasMediaSpoiler
                    };
                    break;
                    
                case 'video':
                    messageOptions = {
                        video: fs.readFileSync(filePath),
                        caption: caption,
                        viewOnce: hasMediaSpoiler
                    };
                    break;

                case 'video_note':
                    messageOptions = {
                        video: fs.readFileSync(filePath),
                        caption: caption,
                        ptv: true,
                        viewOnce: hasMediaSpoiler
                    };
                    break;

                case 'animation':
                    messageOptions = {
                        video: fs.readFileSync(filePath),
                        caption: caption,
                        gifPlayback: true,
                        viewOnce: hasMediaSpoiler
                    };
                    break;
                    
                case 'voice':
                    messageOptions = {
                        audio: fs.readFileSync(filePath),
                        ptt: true,
                        mimetype: 'audio/ogg; codecs=opus'
                    };
                    break;
                    
                case 'audio':
                    messageOptions = {
                        audio: fs.readFileSync(filePath),
                        mimetype: mime.lookup(fileName) || 'audio/mp3',
                        fileName: fileName,
                        caption: caption
                    };
                    break;
                    
                case 'document':
                    messageOptions = {
                        document: fs.readFileSync(filePath),
                        fileName: fileName,
                        mimetype: mime.lookup(fileName) || 'application/octet-stream',
                        caption: caption
                    };
                    break;
                    
                case 'sticker':
                    await this.handleTelegramSticker(msg);
                    return;
            }

            sendResult = await this.bot.sendMessage(whatsappJid, messageOptions);

            await fs.unlink(filePath).catch(() => {});
            
            if (sendResult?.key?.id) {
                log.info(`✅ Successfully sent ${mediaType} to WhatsApp`);
                await this.setReaction(msg.chat.id, msg.message_id, '👍');
                
                setTimeout(async () => {
                    await this.markAsRead(whatsappJid, [sendResult.key]);
                }, 1000);
            } else {
                log.warn(`⚠️ Failed to send ${mediaType} to WhatsApp - no message ID`);
                await this.setReaction(msg.chat.id, msg.message_id, '❌');
            }

        } catch (error) {
            log.error(`❌ Failed to handle Telegram ${mediaType}:`, error);
            await this.setReaction(msg.chat.id, msg.message_id, '❌');
        }
    }

    async handleTelegramSticker(msg) {
        const topicId = msg.message_thread_id;
        const whatsappJid = this.findWhatsAppJidByTopic(topicId);
        const chatId = msg.chat.id;

        if (!whatsappJid) {
            log.warn('⚠️ Could not find WhatsApp chat for Telegram sticker');
            return;
        }

        try {
            await this.sendPresence(whatsappJid, 'composing');

            const fileId = msg.sticker.file_id;
            const fileLink = await this.telegramBot.getFileLink(fileId);
            const stickerBuffer = (await axios.get(fileLink, { responseType: 'arraybuffer' })).data;
            const fileName = `sticker_${Date.now()}`;
            const inputPath = path.join(this.tempDir, `${fileName}.webp`);
            await fs.writeFile(inputPath, stickerBuffer);

            let outputBuffer;

            const isAnimated = msg.sticker.is_animated || msg.sticker.is_video;

            if (isAnimated) {
                const animatedPath = await this.convertAnimatedSticker(inputPath);
                if (animatedPath) {
                    outputBuffer = await fs.readFile(animatedPath);
                    await fs.unlink(animatedPath).catch(() => {});
                } else {
                    throw new Error('Animated sticker conversion failed');
                }
            } else {
                const sticker = new Sticker(stickerBuffer, {
                    type: StickerTypes.FULL,
                    pack: 'Telegram Stickers',
                    author: 'BridgeBot',
                    quality: 100
                });
                outputBuffer = await sticker.toBuffer();
            }

            const result = await this.bot.sendMessage(whatsappJid, {
                sticker: outputBuffer
            });

            await fs.unlink(inputPath).catch(() => {});

            if (result?.key?.id) {
                log.info('✅ Sticker sent to WhatsApp');
                await this.setReaction(chatId, msg.message_id, '👍');
            } else {
                throw new Error('Sticker sent but no confirmation');
            }
        } catch (err) {
            log.error('❌ Failed to send sticker to WhatsApp:', err);
            await this.setReaction(chatId, msg.message_id, '❌');

            const fallbackPath = path.join(this.tempDir, `fallback_${Date.now()}.png`);
            await sharp(stickerBuffer).resize(512, 512).png().toFile(fallbackPath);
            await this.telegramBot.sendPhoto(chatId, fallbackPath, {
                message_thread_id: topicId,
                caption: 'Sticker (fallback)'
            });
            await fs.unlink(fallbackPath).catch(() => {});
        }
    }

    async convertAnimatedSticker(inputPath) {
        const outputPath = inputPath.replace('.webp', '-converted.webp');

        return new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .outputOptions([
                    '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
                    '-loop', '0',
                    '-an',
                    '-vsync', '0'
                ])
                .outputFormat('webp')
                .on('end', () => resolve(outputPath))
                .on('error', (err) => {
                    log.debug('Animated sticker conversion failed:', err.message);
                    resolve(null);
                })
                .save(outputPath);
        });
    }

    async handleTelegramLocation(msg) {
        try {
            const topicId = msg.message_thread_id;
            const whatsappJid = this.findWhatsAppJidByTopic(topicId);

            if (!whatsappJid) {
                log.warn('⚠️ Could not find WhatsApp chat for Telegram location');
                return;
            }

            await this.sendPresence(whatsappJid, false);

            const sendResult = await this.bot.sendMessage(whatsappJid, { 
                location: { 
                    degreesLatitude: msg.location.latitude, 
                    degreesLongitude: msg.location.longitude
                } 
            });

            if (sendResult?.key?.id) {
                await this.setReaction(msg.chat.id, msg.message_id, '👍');
                setTimeout(async () => {
                    await this.markAsRead(whatsappJid, [sendResult.key]);
                }, 1000);
            }
        } catch (error) {
            log.error('❌ Failed to handle Telegram location message:', error);
            await this.setReaction(msg.chat.id, msg.message_id, '❌');
        }
    }

    async handleTelegramContact(msg) {
        try {
            const topicId = msg.message_thread_id;
            const whatsappJid = this.findWhatsAppJidByTopic(topicId);

            if (!whatsappJid) {
                log.warn('⚠️ Could not find WhatsApp chat for Telegram contact');
                return;
            }

            await this.sendPresence(whatsappJid, false);

            const firstName = msg.contact.first_name || '';
            const lastName = msg.contact.last_name || '';
            const phoneNumber = msg.contact.phone_number || '';
            const displayName = `${firstName} ${lastName}`.trim() || phoneNumber;

            const vcard = `BEGIN:VCARD\nVERSION:3.0\nN:${lastName};${firstName};;;\nFN:${displayName}\nTEL;TYPE=CELL:${phoneNumber}\nEND:VCARD`;

            const sendResult = await this.bot.sendMessage(whatsappJid, { 
                contacts: { 
                    displayName: displayName, 
                    contacts: [{ vcard: vcard }]
                } 
            });

            if (sendResult?.key?.id) {
                await this.setReaction(msg.chat.id, msg.message_id, '👍');
                setTimeout(async () => {
                    await this.markAsRead(whatsappJid, [sendResult.key]);
                }, 1000);
            }
        } catch (error) {
            log.error('❌ Failed to handle Telegram contact message:', error);
            await this.setReaction(msg.chat.id, msg.message_id, '❌');
        }
    }

    async handleStatusReply(msg) {
        try {
            const originalStatusKey = this.statusMessageIds.get(msg.reply_to_message.message_id);
            if (!originalStatusKey) {
                await this.telegramBot.sendMessage(msg.chat.id, '❌ Cannot find original status message to reply to', {
                    message_thread_id: msg.message_thread_id
                });
                return;
            }

            const statusJid = originalStatusKey.participant || originalStatusKey.remoteJid;
            await this.bot.sendMessage(statusJid, { text: msg.text });

            await this.setReaction(msg.chat.id, msg.message_id, '✅');
            
        } catch (error) {
            log.error('❌ Failed to handle status reply:', error);
            await this.setReaction(msg.chat.id, msg.message_id, '❌');
        }
    }

    async sendPresence(jid, isTyping = true) {
        try {
            if (!this.bot?.sock) return;
            
            const now = Date.now();
            const lastUpdate = this.lastPresenceUpdate.get(jid) || 0;
            
            if (now - lastUpdate < 1000) return;
            
            this.lastPresenceUpdate.set(jid, now);
            
            if (isTyping) {
                await this.bot.sock.sendPresenceUpdate('composing', jid);
                
                if (this.presenceTimeout) {
                    clearTimeout(this.presenceTimeout);
                }
                
                this.presenceTimeout = setTimeout(async () => {
                    try {
                        await this.bot.sock.sendPresenceUpdate('paused', jid);
                    } catch (error) {
                        log.debug('Failed to send paused presence:', error);
                    }
                }, 3000);
            } else {
                await this.bot.sock.sendPresenceUpdate('available', jid);
            }
            
            log.debug(`👁️ Sent presence update: ${isTyping ? 'typing' : 'available'} to ${jid}`);
            
        } catch (error) {
            log.debug('Failed to send presence:', error);
        }
    }

    async markAsRead(jid, messageKeys) {
        try {
            if (!this.bot?.sock || !messageKeys.length) return;
            
            await this.bot.sock.readMessages(messageKeys);
            log.debug(`📖 Marked ${messageKeys.length} messages as read in ${jid}`);
        } catch (error) {
            log.debug('Failed to mark messages as read:', error);
        }
    }

    async sendSimpleMessage(topicId, text, sender) {
        if (!topicId) return null;

        const chatId = this.config.chatId;
        
        try {
            let messageText = text;
            if (sender === 'status@broadcast') {
                const participant = text.split('\n')[0];
                const phone = participant.split('@')[0];
                const contactName = this.contactMappings.get(phone) || phone;
                messageText = `📱 Status from ${contactName}\n\n${text}`;
            }

            const sentMessage = await this.telegramBot.sendMessage(chatId, messageText, {
                message_thread_id: topicId
            });

            return sentMessage.message_id;
        } catch (error) {
            log.error('❌ Failed to send message to Telegram:', error);
            return null;
        }
    }

    async streamToBuffer(stream) {
        const chunks = [];
        for await (const chunk of stream) {
            chunks.push(chunk);
        }
        return Buffer.concat(chunks);
    }

    findWhatsAppJidByTopic(topicId) {
        for (const [jid, topic] of this.chatMappings.entries()) {
            if (topic === topicId) {
                return jid;
            }
        }
        return null;
    }

    extractText(msg) {
        return msg.message?.conversation ||
               msg.message?.extendedTextMessage?.text ||
               msg.message?.imageMessage?.caption ||
               msg.message?.videoMessage?.caption ||
               msg.message?.documentMessage?.caption ||
               msg.message?.audioMessage?.caption ||
               '';
    }

    async syncWhatsAppConnection() {
        if (!this.telegramBot) return;

        await this.logToTelegram('🤖 WhatsApp Bot Connected', 
            `✅ Bot: Nexus Bot v2.0.0\n` +
            `📱 WhatsApp: Connected\n` +
            `🔗 Telegram Bridge: Active\n` +
            `📞 Contacts: ${this.contactMappings.size} synced\n` +
            `🚀 Ready to bridge messages!`);

        if (this.botChatId) {
            // Handle start command if needed
        }
    }

    async shutdown() {
        log.info('🛑 Shutting down Telegram bridge...');
        
        if (this.presenceTimeout) {
            clearTimeout(this.presenceTimeout);
        }
        
        if (this.telegramBot) {
            try {
                await this.telegramBot.stopPolling();
                log.info('📱 Telegram bot polling stopped.');
            } catch (error) {
                log.debug('Error stopping Telegram polling:', error);
            }
        }
        
        try {
            await fs.emptyDir(this.tempDir);
            log.info('🧹 Temp directory cleaned.');
        } catch (error) {
            log.debug('Could not clean temp directory:', error);
        }
        
        if (this.db) {
            await this.db.close();
        }
        
        log.info('✅ Telegram bridge shutdown complete.');
    }
}

module.exports = { TelegramBridge };