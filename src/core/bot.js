const { default: makeWASocket, DisconnectReason, jidDecode } = require('baileys');
const { loadAuthState } = require('./session');
const { serialize } = require('./serializer');
const { handleMessage } = require('./handler');
const { scanPlugins } = require('../utils/plugin-loader');
const logger = require('../utils/logger');
const { getVersion } = require('../utils/helpers');

class NexusBot {
    constructor(config) {
        this.config = config;
        this.sock = null;
        this.plugins = [];
        this.sessions = new Map();
        this.initialized = false;
        this.version = getVersion(false);
        this.bridges = [];
    }

    async start() {
        try {
            await this.connect();
            await this.loadPlugins();
            logger.info('🤖 Nexus Bot core started successfully');
        } catch (error) {
            logger.error('❌ Failed to start bot core:', error);
            throw error;
        }
    }

    async connect() {
        const { state, saveCreds } = await loadAuthState(this.config);

        this.sock = makeWASocket({
            version: this.version,
            auth: state,
            logger: logger.child({ module: 'baileys' }),
            syncFullHistory: false,
            markOnlineOnConnect: true,
            printQRInTerminal: !this.config.usePairing,
            shouldSyncHistoryMessage: () => false,
            getMessage: key => this.getMessage(key.remoteJid, key.id)?.message
        });

        // Handle pairing if needed
        if (!this.sock.authState.creds.me && this.config.usePairing) {
            await this.handlePairing();
        }

        // Set up event handlers
        this.sock.ev.on('creds.update', saveCreds);
        this.sock.ev.on('connection.update', this.handleConnectionUpdate.bind(this));
        this.sock.ev.on('messages.upsert', this.handleMessagesUpsert.bind(this));
        this.sock.ev.on('groups.upsert', this.handleGroupsUpsert.bind(this));
        this.sock.ev.on('group-participants.update', this.handleGroupParticipantsUpdate.bind(this));

        // Handle calls
        this.sock.ws.on('CB:call', this.handleCall.bind(this));

        // Decode JID utility
        this.sock.decodeJID = function decodeJID(jid) {
            if (typeof jid !== 'string') return;
            let d = jidDecode(jid) || {};
            d.toString = function toString() {
                return d.user && d.server ? `${d.user}@${d.server}` : '';
            };
            return d;
        };
    }

    async handlePairing() {
        async function pair() {
            logger.info(`Pairing code: ${await this.sock.requestPairingCode(this.config.botNumber)}`);
            await this.delay(600000); // Wait for 10 minutes
            if (!this.sock.authState.creds.registered) pair(); // Repeat pairing if not registered
        }

        logger.info('Preparing pairing code...');
        await this.delay(5000); // Wait for 5 seconds before starting pairing
        await pair.call(this);
    }

    async handleConnectionUpdate(update) {
        const { connection, lastDisconnect, qr } = update;
        
        if (lastDisconnect === 'undefined' && qr !== 'undefined') {
            const { generate } = require('qrcode-terminal');
            generate(qr, { small: true });
        }

        switch (connection) {
            case 'connecting':
                logger.warn('Connecting to WhatsApp...');
                break;
            case 'open':
                logger.info('✅ Connected to WhatsApp!');
                if (!this.initialized) {
                    await this.initializeAfterConnection();
                    this.initialized = true;
                }
                // Notify bridges
                this.bridges.forEach(bridge => {
                    if (bridge.onWhatsAppConnected) {
                        bridge.onWhatsAppConnected();
                    }
                });
                break;
            case 'close':
                await this.handleDisconnection(lastDisconnect);
                break;
        }
    }

    async handleDisconnection(lastDisconnect) {
        const error = lastDisconnect?.error?.output;
        if (error?.statusCode === DisconnectReason.loggedOut) {
            logger.error('❌ Disconnected: Logged out!');
            try {
                process.send('unauthorized');
            } catch {
                process.exit(1);
            }
            return;
        } else if (error?.statusCode === 405) {
            this.version = await getVersion(true);
        }
        
        logger.error(`❌ Disconnected: ${error?.message || error?.payload?.message || JSON.stringify(error)}`);
        await this.connect(); // Attempt to reconnect
    }

    async initializeAfterConnection() {
        // Initialize group metadata and other post-connection tasks
        try {
            const groupsM = await this.sock.groupFetchAllParticipating();
            // Store group metadata logic here
            logger.info('📊 Group metadata initialized');
        } catch (error) {
            logger.error('❌ Failed to initialize after connection:', error);
        }
    }

    async handleMessagesUpsert(msg) {
        if (msg.type === 'append') return;
        
        for (let m of msg.messages) {
            // Store message logic here
            m = serialize(m, this);
            if (!m) continue;
            
            // Handle status updates
            if (m.key.remoteJid === 'status@broadcast' && this.config.autoReadSW) {
                await this.sock.readMessages([m.key]);
                continue;
            }

            if (m.broadcast) continue;
            
            // Auto read messages
            if (this.config.autoReadMSG) {
                await this.sock.readMessages([m.key]);
            }

            logger.info(`📨 Received ${m.type} from ${m.sender.user}, at ${m.isGroup ? 'group ' : ''}${m.chat.user}${m.body ? '\nMessage: ' + m.body : ''}`);
            
            // Handle message through core handler
            await handleMessage(m, this.plugins, this);
            
            // Notify bridges
            this.bridges.forEach(bridge => {
                if (bridge.onMessage) {
                    bridge.onMessage(m, m.body);
                }
            });
        }
    }

    async handleGroupsUpsert(groups) {
        logger.debug('Groups upsert:', groups);
        // Handle group updates
    }

    async handleGroupParticipantsUpdate(update) {
        logger.debug('Group participants update:', update);
        // Handle group participant updates
    }

    async handleCall(call) {
        call.id = call.content[0].attrs['call-id'];
        call.from = call.content[0].attrs['call-creator'];
        
        if (call.content[0].tag === 'offer' && this.config.antiCall) {
            await this.sock.rejectCall(call.id, call.from);
        }
        
        // Notify bridges
        this.bridges.forEach(bridge => {
            if (bridge.onCall) {
                bridge.onCall(call);
            }
        });
    }

    async loadPlugins() {
        try {
            this.plugins = await scanPlugins('./plugins');
            logger.info(`🔌 Loaded ${this.plugins.length} plugins`);
        } catch (error) {
            logger.error('❌ Failed to load plugins:', error);
        }
    }

    async sendMessage(jid, content, options = {}) {
        if (!this.sock) throw new Error('Bot not connected');
        return await this.sock.sendMessage(jid, content, options);
    }

    getMessage(jid, id) {
        // Implement message retrieval logic
        return {};
    }

    addBridge(bridge) {
        this.bridges.push(bridge);
        logger.info(`🌉 Bridge added: ${bridge.constructor.name}`);
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async shutdown() {
        logger.info('🛑 Shutting down bot core...');
        if (this.sock) {
            this.sock.end();
        }
        logger.info('✅ Bot core shutdown complete');
    }
}

async function createBot(config) {
    return new NexusBot(config);
}

module.exports = { createBot, NexusBot };