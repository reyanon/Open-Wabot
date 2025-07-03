const pino = require('pino');
const pretty = require('pino-pretty');

const logger = pino(pretty({
    colorize: true,
    minimumLevel: process.env.DEBUG === 'true' ? 'trace' : 'info',
    sync: true,
    translateTime: 'SYS:standard'
}));

module.exports = logger;