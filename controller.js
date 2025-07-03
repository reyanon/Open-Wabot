const { spawn } = require('child_process');
const args = ['index.js', ...process.argv.slice(2)];

let restart = false;
let crashCount = 0;
const MAX_CRASHES = 3;

function start() {
    const bot = spawn(process.argv[0], args, {
        env: { ...process.env, IS_CHILD: true },
        stdio: ['inherit', 'inherit', 'inherit', 'ipc']
    });

    bot.on('message', async msg => {
        if (msg === 'restart') {
            console.log('🔄 Restart signal received...');
            restart = true;
            bot.kill();
        }
    });

    bot.on('close', code => {
        if (restart) {
            console.log('🔄 Restarting bot...');
            restart = false;
            crashCount = 0;
            start();
            return;
        }

        crashCount++;
        console.log(`❌ Bot crashed (${crashCount}/${MAX_CRASHES})`);

        if (crashCount >= MAX_CRASHES) {
            console.log('💀 Too many crashes, stopping...');
            process.exit(1);
        } else {
            console.log('🔄 Restarting in 5 seconds...');
            setTimeout(start, 5000);
        }
    });
}

start();