# Modules System

This directory contains modular components that can be used throughout the bot.

## Available Modules

### DatabaseModule (`database.js`)
A unified database interface that supports both MongoDB and local JSON storage.

**Features:**
- Automatic fallback to local storage if MongoDB is unavailable
- MongoDB-compatible API for local storage
- Automatic indexing for better performance
- Collection-specific optimizations

**Usage:**
```javascript
const { DatabaseModule } = require('./modules/database');

// Create a module-specific database
const db = new DatabaseModule('my_module');
await db.initialize();

// Use MongoDB-like operations
await db.insertOne({ name: 'test', value: 123 });
const results = await db.find({ name: 'test' });
await db.updateOne({ name: 'test' }, { $set: { value: 456 } });
```

**Methods:**
- `find(query, options)` - Find documents
- `findOne(query)` - Find single document
- `insertOne(document)` - Insert document
- `updateOne(filter, update, options)` - Update document
- `upsert(filter, document)` - Insert or update
- `deleteOne(filter)` - Delete single document
- `deleteMany(filter)` - Delete multiple documents
- `count(filter)` - Count documents
- `close()` - Close connection

## Creating New Modules

1. Create a new file in the `modules/` directory
2. Export a class or functions
3. Use the DatabaseModule for data persistence if needed
4. Import and use in your bridge or plugin

Example:
```javascript
// modules/my-module.js
const { DatabaseModule } = require('./database');

class MyModule {
    constructor() {
        this.db = new DatabaseModule('my_module');
    }
    
    async initialize() {
        await this.db.initialize();
    }
    
    async doSomething() {
        // Your module logic here
    }
}

module.exports = { MyModule };
```

## Database Collections

The system automatically creates collections based on module names:
- `telegram_bridge` - Telegram bridge data
- `bot_data` - Main bot data
- `user_sessions` - User session data
- Custom collections for your modules

Each collection gets appropriate indexes for optimal performance.