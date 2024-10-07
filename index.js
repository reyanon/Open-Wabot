const pino = require('pino');
const pretty = require('pino-pretty');
const config = require('./config.js');
const { generate } = require('qrcode-terminal');
const { stringify, scanDir, getVersion } = require('./src/util.js');
const { serialize } = require('./src/serializer.js');
const { message } = require('./src/handler.js');
const { loadAuthState } = require('./src/session.js');

const {
    getMessage,
    saveMessage,
    saveAllGroupMetadata,
    updateGroupMetadata,
    removeGroupMetadata
} = require('./src/store.js');

const {
    default: newClient,
    DisconnectReason,
    jidDecode,
} = require('baileys');

let initialized = false;
let version = getVersion(false);

// Create a logger with configuration based on debug settings
global.log = pino(pretty({
    colorize: true,
    minimumLevel: config.debug ? 'trace' : 'info', // Set the minimum log level
    sync: true,
}));

async function connect() {
    const { state, saveCreds } = await loadAuthState();

    // Create WhatsApp client
    global.bot = newClient({
        version,
        auth: state,
        logger: pino(pretty({
            colorize: true,
            minimumLevel: config.debug ? 'trace' : 'error', // Set the minimum log level
            sync: true,
        })),
        syncFullHistory: false,
        markOnlineOnConnect: true,
        printQRInTerminal: !config.usePairing, // Display QR in terminal if not using pairing
        shouldSyncHistoryMessage: () => false,
        getMessage: key => getMessage(key.remoteJid, key.id).message
    });
    bot.sessions = new Map();

    // Start pairing if the bot isn't registered and QR is not used
    if (!bot.authState.creds.me && config.usePairing) {
        async function pair() {
            log.info(`Pairing code: ${await bot.requestPairingCode(config.botNumber)}`);
            await delay(600000); // Wait for 10 minutes
            if (!bot.authState.creds.registered) pair(); // Repeat pairing if not registered
        }

        log.info('Preparing code');
        await delay(5000); // Wait for 5 seconds before starting pairing
        pair();
    }

    // Save credentials when there are updates
    bot.ev.on('creds.update', saveCreds);

    // Manage connection updates
    bot.ev.on('connection.update', async update => {
        const { connection, lastDisconnect, qr } = update;
        if (lastDisconnect === 'undefined' && qr !== 'undefined') generate(qr, { small: true }); // Generate QR code if available

        switch (connection) {
            case 'connecting':
                log.warn('Connecting...');
                break;
            case 'open':
                log.info('Connected!');

                // Saving all group metadata after connected
                if (!initialized) {
                    const groupsM = await bot.groupFetchAllParticipating();
                    saveAllGroupMetadata(groupsM);
                    initialized = true;
                }
                break;
            case 'close':
                const error = lastDisconnect?.error?.output;
                if (error?.statusCode === DisconnectReason.loggedOut) {
                    log.error('Disconnected: Logged out!');
                    try {
                        process.send('unauthorized'); // Send unauthorized signal to parent process
                    } catch {
                        process.exit(1); // Stopping process with error
                        // I do not handle logout the same as in the controller because users
                        // running this app without a controller may use PM2 or a panel. When
                        // the session is deleted and the bot restarts, it will request a new
                        // QR code or login code. This can cause spam if not handled promptly
                        // by the administrator.

                        // I chose to terminate with code 1 so the bot is considered crashed.
                        // When restarted by PM2, it will crash again due to the old session,
                        // causing PM2 to stop the restart cycle, considering the app erroneous.
                    }
                    return;
                } else if (error?.statusCode === 405) version = await getVersion(true);
                log.error(`Disconnected: ${error?.message || error?.payload?.message || stringify(error)}`);
                connect(); // Attempt to reconnect
                break;
        }
    });

    // Manage incoming calls
    bot.ws.on('CB:call', call => {
        call.id = call.content[0].attrs['call-id'];
        call.from = call.content[0].attrs['call-creator'];
        if (call.content[0].tag === 'offer' && config.antiCall) {
            bot.rejectCall(call.id, call.from); // Reject call if antiCall is enabled
        }
    });

    // Handle group metadata update
    bot.ev.on('groups.upsert', async groups => {
        if (config.debug) console.log('group upsert', stringify(groups));
        for (const group of groups) {
            updateGroupMetadata(group);
        }
    })

    // Handle group participant update
    bot.ev.on('group-participants.update', async g => {
        if (config.debug) console.log('group update', stringify(g));
        if (g.action === 'remove' && g.participants.includes(bot.decodeJID(bot.user.id).toString())) {
            removeGroupMetadata(g.id);
            return
        }
        const group = await bot.groupMetadata(g.id);
        updateGroupMetadata(group);
    });

    // Manage incoming messages
    bot.ev.on('messages.upsert', async msg => {
        if (msg.type === 'append') return;
        for (let m of msg.messages) {
            saveMessage(m);
            m = serialize(m);
            if (!m) continue;
            if (m.key.remoteJid === 'status@broadcast' && config.autoReadSW) {
                await bot.readMessages([m.key]);
                continue;
            }

            if (m.broadcast) continue;
            if (config.autoReadMSG) {
                await bot.readMessages([m.key]);
            }

            log.info(`Received ${m.type} from ${m.sender.user}, at ${m.isGroup ? 'group ' : ''}${m.chat.user}${m.body ? '\nMessage: ' + m.body : ''}`)
            if (config.debug) console.log('message upsert', stringify(m));
            let plugins = scanDir('./plugins');
            message(m, plugins);
        }
    });

    // Decode JID
    bot.decodeJID = function decodeJID(jid) {
        if (typeof jid !== 'string') return;
        let d = jidDecode(jid) || {};
        d.toString = function toString() {
            return d.user && d.server ? `${d.user}@${d.server}` : '';
        };
        return d;
    };
}

// Start the connection to WhatsApp
connect();
