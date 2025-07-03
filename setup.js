const fs = require('fs');
const path = require('path');

console.log('🚀 Setting up Nexus Bot...');

// Create directories
const dirs = ['data', 'plugins'];
dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`📁 Created: ${dir}/`);
    }
});

console.log('✅ Setup complete!');
console.log('📝 Edit config.js to configure your bot');
console.log('🚀 Run: npm start');