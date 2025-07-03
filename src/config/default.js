module.exports = {
    // Debug mode configuration
    debug: false,

    // Anti-call feature configuration
    antiCall: true,

    // Pairing mode configuration
    usePairing: false,

    // Auto read configuration
    autoReadMSG: true,
    autoReadSW: true,

    // Prefix configuration
    prefixes: ["!", ">", "$", ".", "-", "+", "?", "#", "@", "/", "&", ",", "nx!"],

    // Session configuration
    session: {
        type: "local",  // Options: "mongodb", "firebase", "local"
        url: "mongodb://username:password@host:port/database?options"
    },

    // Bot information
    botName: "Nexus Bot",
    botNumber: "6285176765422",

    // Administrators list
    administrator: [
        "6281654976901",
        "6285175023755"
    ],

    // Whitelist configuration
    whitelist: false,
    whitelistSrv: "",
    whitelistMsg: "Sorry, the bot is in whitelist mode. Please contact admin to get access.",
    whitelistUsr: [
        "6285176765422"
    ],

    // Bridge system configuration
    bridges: {
        telegram: {
            enabled: false,
            botToken: "YOUR_BOT_TOKEN",
            chatId: "YOUR_CHAT_ID",
            logChannel: "YOUR_LOG_CHANNEL",
            features: {
                readReceipts: true,
                callLogs: true,
                statusUpdates: true
            }
        }
    }
};