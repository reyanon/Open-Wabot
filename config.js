module.exports = {
    // Bot Configuration
    botName: "Nexus Bot",
    botNumber: "1234567890", // Your WhatsApp number
    
    // Admin Configuration
    administrator: ["1234567890"], // Admin phone numbers
    
    // Features
    debug: false,
    antiCall: true,
    usePairing: false,
    autoReadMSG: true,
    autoReadSW: true,
    
    // Command Prefixes
    prefixes: ["!", ".", "#", "$"],
    
    // Session Storage
    session: {
        type: "local" // local, mongodb, firebase
    },
    
    // Whitelist System
    whitelist: false,
    whitelistMsg: "You are not authorized to use this bot.",
    whitelistUsr: [],
    
    // Bridge System
    bridges: {
        telegram: {
            enabled: false,
            botToken: "YOUR_BOT_TOKEN",
            chatId: "YOUR_CHAT_ID",
            logChannel: "YOUR_LOG_CHANNEL", // Optional
            features: {
                readReceipts: true,
                callLogs: true,
                statusUpdates: true
            }
        }
    },
    
    // Database Configuration
    database: {
        mongodb: {
            url: process.env.MONGODB_URL || "mongodb://localhost:27017/nexus_bot",
            options: {
                useNewUrlParser: true,
                useUnifiedTopology: true
            }
        }
    }
};