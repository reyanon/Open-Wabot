const pino = require('pino');
const path = require('path');
const { rmSync, existsSync, mkdirSync } = require('fs');
const pretty = require('pino-pretty');
const { isModuleInstalled } = require('./util.js');
const { debug, session } = require('../config.js');

let loadAuthState;
mkdirSync(path.join(__dirname, '..', 'data'), { recursive: true });

// Initialize logging with pino and pino-pretty
const log = global.log || pino(pretty({
    colorize: true,
    minimumLevel: debug ? 'trace' : 'info',
    sync: true,
}));

// Check if 'baileys-mongodb' is installed and sessions.mongodb is configured
if (isModuleInstalled('baileys-mongodb') && session.type == 'mongodb') {
    // Use MongoDB for session management
    loadAuthState = async function loadAuthState() {
        log.info("Using MongoDB session");
        const { useMongoAuthState } = require('baileys-mongodb');
        return await useMongoAuthState(session.url, {
            tableName: 'open-wabot',
            session: 'session'
        });
    };
} else if (isModuleInstalled('baileys-firebase') && existsSync('fireSession.json') && session.type == 'firebase') {
    // Use Firebase for session management
    loadAuthState = async function loadAuthState() {
        log.info("Using firebase session");
        const { useFireAuthState } = require('baileys-firebase');
        return await useFireAuthState({
            tableName: 'open-wabot',
            session: 'session'
        });
    };
} else {
    // Use local file system for session management
    const sessionDir = path.join(__dirname, '..', 'data', 'session');
    loadAuthState = async function loadAuthState() {
        log.info("Using local session");
        const { useMultiFileAuthState } = require('baileys');
        const session = await useMultiFileAuthState(sessionDir);
        // Add removeCreds function to session to delete session directory
        session.removeCreds = async () => {
            rmSync(sessionDir, { recursive: true, force: true });
        };
        return session;
    };
}

// If this file is run directly, remove the session credentials
if (require.main === module) {
    (async () => {
        try {
            const { removeCreds } = await loadAuthState();
            log.warn('Removing session');
            await removeCreds();
            log.info('Success');
        } catch (err) {
            log.error(err);
        }
    })();
}

module.exports = {
    loadAuthState
};