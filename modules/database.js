const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

class DatabaseModule {
    constructor(collectionName = 'default') {
        this.client = null;
        this.db = null;
        this.collection = null;
        this.collectionName = collectionName;
        this.isConnected = false;
    }

    async initialize() {
        try {
            // Try to connect to MongoDB first
            await this.connectMongoDB();
            log.info(`✅ Database module initialized with MongoDB (${this.collectionName})`);
        } catch (error) {
            // Fallback to local JSON storage
            log.warn('⚠️ MongoDB not available, using local storage');
            await this.initializeLocalStorage();
            log.info(`✅ Database module initialized with local storage (${this.collectionName})`);
        }
    }

    async connectMongoDB() {
        // Try to get MongoDB URL from environment or config
        const mongoUrl = process.env.MONGODB_URL || 
                        process.env.MONGO_URL || 
                        'mongodb://localhost:27017/nexus_bot';

        this.client = new MongoClient(mongoUrl);
        await this.client.connect();
        
        // Test connection
        await this.client.db().admin().ping();
        
        this.db = this.client.db();
        this.collection = this.db.collection(this.collectionName);
        this.isConnected = true;
        
        // Create indexes for better performance
        await this.createIndexes();
    }

    async initializeLocalStorage() {
        this.localStoragePath = path.join(__dirname, '../data/db');
        this.localFile = path.join(this.localStoragePath, `${this.collectionName}.json`);
        
        // Ensure directory exists
        if (!fs.existsSync(this.localStoragePath)) {
            fs.mkdirSync(this.localStoragePath, { recursive: true });
        }
        
        // Initialize file if it doesn't exist
        if (!fs.existsSync(this.localFile)) {
            fs.writeFileSync(this.localFile, JSON.stringify([]));
        }
        
        this.isConnected = false; // Mark as local storage
    }

    async createIndexes() {
        if (!this.isConnected || !this.collection) return;
        
        try {
            // Create common indexes based on collection name
            switch (this.collectionName) {
                case 'telegram_bridge':
                    await this.collection.createIndex({ type: 1, 'data.whatsappJid': 1 }, { 
                        unique: true, 
                        partialFilterExpression: { type: 'chat' } 
                    });
                    await this.collection.createIndex({ type: 1, 'data.whatsappId': 1 }, { 
                        unique: true, 
                        partialFilterExpression: { type: 'user' } 
                    });
                    await this.collection.createIndex({ type: 1, 'data.phone': 1 }, { 
                        unique: true, 
                        partialFilterExpression: { type: 'contact' } 
                    });
                    break;
                default:
                    await this.collection.createIndex({ createdAt: 1 });
                    break;
            }
            log.debug(`📊 Created indexes for ${this.collectionName}`);
        } catch (error) {
            log.debug('Could not create indexes:', error.message);
        }
    }

    async find(query = {}, options = {}) {
        if (this.isConnected && this.collection) {
            // MongoDB
            const cursor = this.collection.find(query, options);
            return await cursor.toArray();
        } else {
            // Local storage
            const data = this.readLocalData();
            return this.filterLocalData(data, query);
        }
    }

    async findOne(query = {}) {
        if (this.isConnected && this.collection) {
            // MongoDB
            return await this.collection.findOne(query);
        } else {
            // Local storage
            const data = this.readLocalData();
            const filtered = this.filterLocalData(data, query);
            return filtered.length > 0 ? filtered[0] : null;
        }
    }

    async insertOne(document) {
        document.createdAt = new Date();
        document.updatedAt = new Date();
        
        if (this.isConnected && this.collection) {
            // MongoDB
            const result = await this.collection.insertOne(document);
            return { insertedId: result.insertedId, ...document };
        } else {
            // Local storage
            const data = this.readLocalData();
            document._id = this.generateId();
            data.push(document);
            this.writeLocalData(data);
            return document;
        }
    }

    async updateOne(filter, update, options = {}) {
        update.$set = update.$set || {};
        update.$set.updatedAt = new Date();
        
        if (this.isConnected && this.collection) {
            // MongoDB
            return await this.collection.updateOne(filter, update, options);
        } else {
            // Local storage
            const data = this.readLocalData();
            const index = data.findIndex(item => this.matchesFilter(item, filter));
            
            if (index !== -1) {
                // Apply update
                if (update.$set) {
                    Object.assign(data[index], update.$set);
                }
                this.writeLocalData(data);
                return { matchedCount: 1, modifiedCount: 1 };
            } else if (options.upsert) {
                // Insert new document
                const newDoc = { ...filter, ...update.$set };
                return await this.insertOne(newDoc);
            }
            
            return { matchedCount: 0, modifiedCount: 0 };
        }
    }

    async upsert(filter, document) {
        return await this.updateOne(filter, { $set: document }, { upsert: true });
    }

    async deleteOne(filter) {
        if (this.isConnected && this.collection) {
            // MongoDB
            return await this.collection.deleteOne(filter);
        } else {
            // Local storage
            const data = this.readLocalData();
            const index = data.findIndex(item => this.matchesFilter(item, filter));
            
            if (index !== -1) {
                data.splice(index, 1);
                this.writeLocalData(data);
                return { deletedCount: 1 };
            }
            
            return { deletedCount: 0 };
        }
    }

    async deleteMany(filter) {
        if (this.isConnected && this.collection) {
            // MongoDB
            return await this.collection.deleteMany(filter);
        } else {
            // Local storage
            const data = this.readLocalData();
            const originalLength = data.length;
            const filtered = data.filter(item => !this.matchesFilter(item, filter));
            this.writeLocalData(filtered);
            return { deletedCount: originalLength - filtered.length };
        }
    }

    async count(filter = {}) {
        if (this.isConnected && this.collection) {
            // MongoDB
            return await this.collection.countDocuments(filter);
        } else {
            // Local storage
            const data = this.readLocalData();
            return this.filterLocalData(data, filter).length;
        }
    }

    // Local storage helper methods
    readLocalData() {
        try {
            const content = fs.readFileSync(this.localFile, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            log.error('Failed to read local data:', error);
            return [];
        }
    }

    writeLocalData(data) {
        try {
            fs.writeFileSync(this.localFile, JSON.stringify(data, null, 2));
        } catch (error) {
            log.error('Failed to write local data:', error);
        }
    }

    filterLocalData(data, query) {
        if (Object.keys(query).length === 0) return data;
        
        return data.filter(item => this.matchesFilter(item, query));
    }

    matchesFilter(item, filter) {
        for (const [key, value] of Object.entries(filter)) {
            if (key.includes('.')) {
                // Handle nested properties like 'data.phone'
                const keys = key.split('.');
                let current = item;
                for (const k of keys) {
                    if (current && typeof current === 'object') {
                        current = current[k];
                    } else {
                        current = undefined;
                        break;
                    }
                }
                if (current !== value) return false;
            } else {
                if (item[key] !== value) return false;
            }
        }
        return true;
    }

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    async close() {
        if (this.client) {
            await this.client.close();
            log.info(`📊 Database connection closed (${this.collectionName})`);
        }
    }

    // Static method to get bot's main database
    static async getBotDatabase() {
        const db = new DatabaseModule('bot_data');
        await db.initialize();
        return db;
    }

    // Static method to create module-specific database
    static async createModule(moduleName) {
        const db = new DatabaseModule(moduleName);
        await db.initialize();
        return db;
    }
}

module.exports = { DatabaseModule };