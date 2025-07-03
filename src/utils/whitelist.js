const fs = require('fs');
const path = require('path');
const axios = require('axios');

const whitelistFilePath = path.join(__dirname, '../../data', 'whitelist.json');
let whitelist = {};

function addWhitelist(user, expiration) {
    const now = Date.now();
    if (whitelist[user] && whitelist[user] > now) {
        whitelist[user] += expiration;
    } else {
        whitelist[user] = expiration + now;
    }
    fs.writeFileSync(whitelistFilePath, JSON.stringify(whitelist, null, 0), 'utf8');
}

async function isWhitelist(user, config) {
    if (!config.whitelist) return true;
    if (config.administrator.find(x => x == user)) return true;
    if (config.whitelistUsr.find(x => x == user)) return true;

    if (config.whitelistSrv) {
        try {
            const body = { user };
            const { data } = await axios.post(config.whitelistSrv, body, { validateStatus: () => true });
            if (data?.whitelisted) return true;
        } catch (error) {
            // Ignore server errors
        }
    }

    let expTimestamp = whitelist[user];
    return (expTimestamp && expTimestamp > Date.now());
}

// Load whitelist on startup
if (fs.existsSync(whitelistFilePath)) {
    try {
        Object.assign(whitelist, JSON.parse(fs.readFileSync(whitelistFilePath)));
    } catch (error) {
        // Ignore JSON parse errors
    }
}

module.exports = { isWhitelist, addWhitelist };