const { useMultiFileAuthState } = require('baileys');
const { rmSync, mkdirSync } = require('fs');
const path = require('path');

async function loadSession(config) {
    const sessionDir = path.join(__dirname, '../data/session');
    mkdirSync(sessionDir, { recursive: true });

    const session = await useMultiFileAuthState(sessionDir);
    
    // Add clear function
    session.removeCreds = () => {
        rmSync(sessionDir, { recursive: true, force: true });
    };

    return session;
}

module.exports = { loadSession };