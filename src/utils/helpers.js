const { randomBytes } = require('crypto');
const cheerio = require('cheerio');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

// Global delay function
global.delay = int => new Promise(resolve => setTimeout(resolve, int));

function generateID(length = 32, prefix = '') {
    let id = prefix;
    id += randomBytes(Math.floor((length - id.length) / 2)).toString('hex');
    while (id.length < length) id += '0';
    return id.toUpperCase();
}

function getVersion(getnew) {
    const verdata = path.join(__dirname, '../../data', 'version.json');
    
    if (getnew) {
        return (async () => {
            try {
                const response = await axios.get('https://wppconnect.io/whatsapp-versions');
                const $ = cheerio.load(response.data);

                const versionInfo = $('.card__header h3').filter(function() {
                    const text = $(this).text();
                    return text.includes('stable') && text.includes('current');
                }).text().split(' ')[0];

                const version = versionInfo.split('.');
                await fs.writeFileSync(verdata, JSON.stringify(version), 'utf-8');
                return version;
            } catch (error) {
                console.error('Error fetching version:', error);
                return ['2', '3000', '1015910634-alpha'];
            }
        })();
    }

    if (fs.existsSync(verdata)) return require(verdata);
    return ['2', '3000', '1015910634-alpha'];
}

function isModuleInstalled(name) {
    try {
        require.resolve(name);
        return true;
    } catch {
        const modulePath = path.resolve('node_modules', name);
        return fs.existsSync(modulePath);
    }
}

function stringify(obj) {
    return JSON.stringify(obj, (key, value) => value === undefined ? null : value, 2);
}

module.exports = {
    generateID,
    getVersion,
    isModuleInstalled,
    stringify
};