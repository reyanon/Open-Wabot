const { loadSession } = require('./core/session');

async function clearSession() {
    try {
        console.log('🗑️ Clearing session...');
        const { removeCreds } = await loadSession({ session: { type: 'local' } });
        removeCreds();
        console.log('✅ Session cleared!');
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

clearSession();