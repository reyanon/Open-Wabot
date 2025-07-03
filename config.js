module.exports = {
    // Bot Configuration
    botName: "Nexus Bot",
    botNumber: "923417033005", // Your WhatsApp number
    
    // Admin Configuration
    administrator: ["923417033005"], // Admin phone numbers
    
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
            enabled: true,
            botToken: "7580382614:AAH30PW6TFmgRzbC7HUXIHQ35GpndbJOIEI",
            chatId: "-1002287300661",
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
            url: "mongodb+srv://itxelijah07:ivp8FYGsbVfjQOkj@cluster0.wh25x.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0",
            options: {
                useNewUrlParser: true,
                useUnifiedTopology: true
            }
        }
    }
};
