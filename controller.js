/*
 * Nexus Bot Controller
 * Manages the bot process with automatic restart capabilities
 */

const { execSync: run, spawn } = require('child_process');
const args = ['src/index.js', ...process.argv.slice(2)];
const { loadAuthState } = require('./src/core/session.js');

let restart = false;
let crashTimestamps = [];
const MAX_CRASHES = 3;
const TIME_WINDOW = 60000; // 60 seconds

function start() {
    const bot = spawn(process.argv[0], args, {
        env: { ...process.env, IS_CHILD: true },
        stdio: ['inherit', 'inherit', 'inherit', 'ipc']
    });

    // Handle messages from the bot
    bot.on('message', async msg => {
        function handleRestart() {
            console.log('Restart signal received. Stopping process...');
            restart = true;
            bot.kill();
        }

        switch (msg) {
            case 'restart':
                handleRestart();
                break;
            case 'unauthorized':
                let s = await loadAuthState({ session: { type: 'local' } });
                await s.removeCreds();
                handleRestart();
                break;
        }
    });

    // Handle the process exit
    bot.on('close', code => {
        if (restart) {
            console.log('Process stopped. Restarting bot...');
            restart = false;
            start();
            return;
        }

        console.log(`Bot process exited with code ${code}.`);
        crashTimestamps.push(Date.now());

        // Remove timestamps older than TIME_WINDOW
        crashTimestamps = crashTimestamps.filter(timestamp => Date.now() - timestamp < TIME_WINDOW);

        if (crashTimestamps.length >= MAX_CRASHES) {
            console.log(`Bot crashed ${MAX_CRASHES} times in a short period. Stopping restarts.`);
            process.exit(1);
        } else {
            console.log(`Bot has crashed ${crashTimestamps.length} times. Restarting bot...`);
            start();
        }
    });
}

start();