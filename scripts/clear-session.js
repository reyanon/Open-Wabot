const { loadAuthState } = require('../src/core/session');

async function clearSession() {
    try {
        console.log('🗑️ Clearing session...');
        const { removeCreds } = await loadAuthState({ session: { type: 'local' } });
        await removeCreds();
        console.log('✅ Session cleared successfully');
    } catch (error) {
        console.error('❌ Failed to clear session:', error);
    }
}

clearSession();