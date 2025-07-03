const TelegramBot = require('node-telegram-bot-api');
const logger = require('../utils/logger');
const fs = require('fs-extra');
const path = require('path');

class TelegramBridge {
    constructor(bot, config) {
        this.bot = bot;
        this.config = config;
        this.telegramBot = null;
        this.chatMappings = new Map();
        this.tempDir = path.join(__dirname, '../../temp');
    }

    async initialize() {
        if (!this.config.botToken || this.config.botToken.includes('YOUR_BOT_TOKEN')) {
            logger.warn('⚠️ Telegram bot token not configured');
            return;
        }

        try {
            await fs.ensureDir(this.tempDir);
            
            this.telegramBot = new TelegramBot(this.config.botToken, { 
                polling: true,
                onlyFirstMatch: true
            });
            
            await this.setupHandlers();
            
            logger.info('✅ Telegram bridge initialized');
        } catch (error) {
            logger.error('❌ Failed to initialize Telegram bridge:', error);
        }
    }

    async setupHandlers() {
        this.telegramBot.on('message', async (msg) => {
            if (msg.chat.type === 'supergroup' && msg.is_topic_message) {
                await this.handleTelegramMessage(msg);
            }
        });

        this.telegramBot.on('polling_error', (error) => {
            logger.error('Telegram polling error:', error);
        });
    }

    async handleTelegramMessage(msg) {
        try {
            const topicId = msg.message_thread_id;
            const whatsappJid = this.findWhatsAppJidByTopic(topicId);
            
            if (!whatsappJid) {
                logger.warn('⚠️ Could not find WhatsApp chat for Telegram message');
                return;
            }

            if (msg.text) {
                const sendResult = await this.bot.sendMessage(whatsappJid, { text: msg.text });
                
                if (sendResult?.key?.id) {
                    await this.setReaction(msg.chat.id, msg.message_id, '👍');
                }
            }
        } catch (error) {
            logger.error('❌ Failed to handle Telegram message:', error);
            await this.setReaction(msg.chat.id, msg.message_id, '❌');
        }
    }

    async setReaction(chatId, messageId, emoji) {
        try {
            const token = this.config.botToken;
            const axios = require('axios');
            await axios.post(`https://api.telegram.org/bot${token}/setMessageReaction`, {
                chat_id: chatId,
                message_id: messageId,
                reaction: [{ type: 'emoji', emoji }]
            });
        } catch (err) {
            logger.debug('❌ Failed to set reaction:', err?.response?.data?.description || err.message);
        }
    }

    findWhatsAppJidByTopic(topicId) {
        for (const [jid, topic] of this.chatMappings.entries()) {
            if (topic === topicId) {
                return jid;
            }
        }
        return null;
    }

    // Bridge interface methods
    onMessage(message, text) {
        // Handle incoming WhatsApp messages
        if (this.telegramBot && this.config.chatId) {
            this.syncMessage(message, text);
        }
    }

    onCall(call) {
        // Handle incoming calls
        if (this.telegramBot && this.config.features.callLogs) {
            this.handleCallNotification(call);
        }
    }

    onWhatsAppConnected() {
        // Handle WhatsApp connection
        if (this.telegramBot) {
            this.syncWhatsAppConnection();
        }
    }

    async syncMessage(whatsappMsg, text) {
        // Implement message syncing logic here
        // This is a simplified version - you can expand based on your needs
        try {
            if (text && this.config.chatId) {
                await this.telegramBot.sendMessage(this.config.chatId, text);
            }
        } catch (error) {
            logger.error('❌ Failed to sync message to Telegram:', error);
        }
    }

    async handleCallNotification(call) {
        // Implement call notification logic
        try {
            if (this.config.chatId) {
                const message = `📞 Incoming call from ${call.from}`;
                await this.telegramBot.sendMessage(this.config.chatId, message);
            }
        } catch (error) {
            logger.error('❌ Failed to send call notification:', error);
        }
    }

    async syncWhatsAppConnection() {
        try {
            if (this.config.chatId) {
                const message = '✅ WhatsApp Bot Connected and Ready!';
                await this.telegramBot.sendMessage(this.config.chatId, message);
            }
        } catch (error) {
            logger.error('❌ Failed to sync connection status:', error);
        }
    }

    async shutdown() {
        logger.info('🛑 Shutting down Telegram bridge...');
        
        if (this.telegramBot) {
            try {
                await this.telegramBot.stopPolling();
                logger.info('📱 Telegram bot polling stopped');
            } catch (error) {
                logger.debug('Error stopping Telegram polling:', error);
            }
        }
        
        try {
            await fs.emptyDir(this.tempDir);
            logger.info('🧹 Temp directory cleaned');
        } catch (error) {
            logger.debug('Could not clean temp directory:', error);
        }
        
        logger.info('✅ Telegram bridge shutdown complete');
    }
}

module.exports = TelegramBridge;