const { default: makeWASocket, DisconnectReason, jidDecode } = require('baileys');
const { generate } = require('qrcode-terminal'); // Add this import
const { loadSession } = require('./session');
const { serialize } = require('./serializer');
const { handleMessage } = require('./handler');
const log = require('pino')(); // or whatever logger you're using

class NexusBot {
    constructor(config) {
        this.config = config;
        this.sock = null;
        this.plugins = [];
        this.sessions = new Map();
        this.bridges = [];
    }

    async connect() {
        const { state, saveCreds } = await loadSession(this.config);

        this.sock = makeWASocket({
            auth: state,
            printQRInTerminal: !this.config.usePairing,
            logger: log.child({ module: 'baileys' }),
            markOnlineOnConnect: true,
            syncFullHistory: false
        });

        // Pairing mode
        if (!this.sock.authState.creds.me && this.config.usePairing) {
            await this.handlePairing();
        }

        // Event handlers
        this.sock.ev.on('creds.update', saveCreds);
        this.sock.ev.on('connection.update', this.onConnectionUpdate.bind(this));
        this.sock.ev.on('messages.upsert', this.onMessage.bind(this));
        
        // Call handler
        this.sock.ws.on('CB:call', this.onCall.bind(this));

        // Utility functions
        this.sock.decodeJID = (jid) => {
            if (!jid) return;
            const decoded = jidDecode(jid) || {};
            decoded.toString = () => decoded.user && decoded.server ? `${decoded.user}@${decoded.server}` : '';
            return decoded;
        };
    }

    async handlePairing() {
        const requestCode = async () => {
            const code = await this.sock.requestPairingCode(this.config.botNumber);
            log.info(`📱 Pairing code: ${code}`);
            setTimeout(() => {
                if (!this.sock.authState.creds.registered) requestCode();
            }, 60000);
        };
        await requestCode();
    }

    async onConnectionUpdate(update) {
        const { connection, lastDisconnect, qr } = update;

        if (qr) generate(qr, { small: true });

        switch (connection) {
            case 'connecting':
                log.info('🔄 Connecting to WhatsApp...');
                break;
            case 'open':
                log.info('✅ Connected to WhatsApp!');
                this.notifyBridges('connected');
                break;
            case 'close':
                await this.handleDisconnect(lastDisconnect);
                break;
        }
    }

    async handleDisconnect(lastDisconnect) {
        const reason = lastDisconnect?.error?.output?.statusCode;
        
        if (reason === DisconnectReason.loggedOut) {
            log.error('❌ Logged out from WhatsApp');
            process.exit(1);
        } else {
            log.warn('⚠️ Connection lost, reconnecting...');
            await this.connect();
        }
    }

    async onMessage(msg) {
        if (msg.type === 'append') return;

        for (let m of msg.messages) {
            m = serialize(m, this);
            if (!m) continue;

            // Auto read
            if (this.config.autoReadMSG) {
                await this.sock.readMessages([m.key]);
            }

            // Status updates
            if (m.key.remoteJid === 'status@broadcast' && this.config.autoReadSW) {
                await this.sock.readMessages([m.key]);
                continue;
            }

            log.info(`📨 ${m.type} from ${m.sender.user}`);

            // Handle message
            await handleMessage(m, this.plugins, this);

            // Notify bridges
            this.notifyBridges('message', m);
        }
    }

    async onCall(call) {
        call.id = call.content[0].attrs['call-id'];
        call.from = call.content[0].attrs['call-creator'];
        
        if (call.content[0].tag === 'offer' && this.config.antiCall) {
            await this.sock.rejectCall(call.id, call.from);
            log.info(`📞 Rejected call from ${call.from}`);
        }

        this.notifyBridges('call', call);
    }

    addBridge(bridge) {
        this.bridges.push(bridge);
        log.info(`🌉 Bridge added: ${bridge.name}`);
    }

    notifyBridges(event, data) {
        this.bridges.forEach(bridge => {
            if (bridge[`on${event.charAt(0).toUpperCase() + event.slice(1)}`]) {
                bridge[`on${event.charAt(0).toUpperCase() + event.slice(1)}`](data);
            }
        });
    }

    async sendMessage(jid, content, options = {}) {
        return await this.sock.sendMessage(jid, content, options);
    }
}

async function createBot(config) {
    return new NexusBot(config);
}

module.exports = { createBot, NexusBot };
