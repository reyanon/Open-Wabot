/*
 * This script runs the bot as a child process, automatically restarting
 * it if it crashes. It's a handy alternative to pm2 or nodemon for 
 * environments where you can't install global dependencies, like on 
 * non-root free VPS or Pterodactyl VMs.
 *
 * You can still run the bot normally without using this script.
 */

const { execSync: run, spawn } = require('child_process');
const args = ['index.js', ...process.argv.slice(2)];
const { loadAuthState } = require('./src/session.js');

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
            bot.kill(); // Kill the current process
        }

        switch (msg) {
            case 'restart':
                handleRestart();
                break;
            case 'unauthorized':
                let s = await loadAuthState();
                await s.removeCreds()
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