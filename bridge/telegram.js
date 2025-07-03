const TelegramBot = require('node-telegram-bot-api');

class TelegramBridge {
    constructor(bot, config) {
        this.bot = bot;
        this.config = config;
        this.name = 'Telegram';
        this.telegramBot = null;
    }

    async initialize() {
        if (!this.config.botToken || this.config.botToken.includes('YOUR_BOT_TOKEN')) {
            log.warn('⚠️ Telegram token not configured');
            return;
        }

        try {
            this.telegramBot = new TelegramBot(this.config.botToken, { polling: true });
            
            this.telegramBot.on('message', async (msg) => {
                if (msg.text && this.config.chatId) {
                    await this.bot.sendMessage(this.config.chatId + '@s.whatsapp.net', { text: msg.text });
                }
            });

            log.info('✅ Telegram bridge ready');
        } catch (error) {
            log.error('❌ Telegram bridge failed:', error);
        }
    }

    onMessage(m) {
        if (this.telegramBot && this.config.chatId && m.body) {
            this.telegramBot.sendMessage(this.config.chatId, `${m.sender.user}: ${m.body}`);
        }
    }

    onCall(call) {
        if (this.telegramBot && this.config.chatId) {
            this.telegramBot.sendMessage(this.config.chatId, `📞 Call from ${call.from}`);
        }
    }

    onConnected() {
        if (this.telegramBot && this.config.chatId) {
            this.telegramBot.sendMessage(this.config.chatId, '✅ WhatsApp Connected!');
        }
    }

    async shutdown() {
        if (this.telegramBot) {
            await this.telegramBot.stopPolling();
        }
    }
}

module.exports = { TelegramBridge };