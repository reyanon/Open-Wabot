const pino = require('pino');
const path = require('path');
const { rmSync, existsSync, mkdirSync } = require('fs');
const { isModuleInstalled } = require('../utils/helpers');

async function loadAuthState(config) {
    const dataDir = path.join(__dirname, '../../data');
    mkdirSync(dataDir, { recursive: true });

    // Check session type and load appropriate handler
    if (isModuleInstalled('baileys-mongodb') && config.session.type === 'mongodb') {
        return await loadMongoSession(config);
    } else if (isModuleInstalled('baileys-firebase') && config.session.type === 'firebase') {
        return await loadFirebaseSession(config);
    } else {
        return await loadLocalSession(config);
    }
}

async function loadMongoSession(config) {
    const { useMongoAuthState } = require('baileys-mongodb');
    return await useMongoAuthState(config.session.url, {
        tableName: 'nexus-bot',
        session: 'session'
    });
}

async function loadFirebaseSession(config) {
    const { useFireAuthState } = require('baileys-firebase');
    return await useFireAuthState({
        tableName: 'nexus-bot',
        session: 'session'
    });
}

async function loadLocalSession(config) {
    const { useMultiFileAuthState } = require('baileys');
    const sessionDir = path.join(__dirname, '../../data/session');
    
    const session = await useMultiFileAuthState(sessionDir);
    
    // Add removeCreds function to session
    session.removeCreds = async () => {
        rmSync(sessionDir, { recursive: true, force: true });
    };
    
    return session;
}

module.exports = { loadAuthState };