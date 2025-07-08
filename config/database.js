const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'bird_learning.db');
const db = new sqlite3.Database(dbPath);

// Initialize database tables
const init = () => {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Users table
            db.run(`
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Birds table
            db.run(`
                CREATE TABLE IF NOT EXISTS birds (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    scientific_name TEXT UNIQUE NOT NULL,
                    german_name TEXT,
                    english_name TEXT,
                    image_urls TEXT, -- JSON string
                    sound_urls TEXT, -- JSON string
                    species_code TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // User birds (spaced repetition data)
            db.run(`
                CREATE TABLE IF NOT EXISTS user_birds (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    bird_id INTEGER NOT NULL,
                    level INTEGER DEFAULT 1, -- Spaced repetition level (1-5)
                    correct_count INTEGER DEFAULT 0,
                    wrong_count INTEGER DEFAULT 0,
                    last_practiced DATETIME,
                    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users (id),
                    FOREIGN KEY (bird_id) REFERENCES birds (id),
                    UNIQUE(user_id, bird_id)
                )
            `);

            // Learning sessions for analytics
            db.run(`
                CREATE TABLE IF NOT EXISTS learning_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    game_type TEXT NOT NULL, -- 'memory' or 'name'
                    bird_id INTEGER NOT NULL,
                    correct BOOLEAN NOT NULL,
                    response_time INTEGER, -- milliseconds
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users (id),
                    FOREIGN KEY (bird_id) REFERENCES birds (id)
                )
            `);

            // Predefined bird lists
            db.run(`
                CREATE TABLE IF NOT EXISTS bird_lists (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    description TEXT,
                    bird_ids TEXT NOT NULL, -- JSON array of bird IDs
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Insert default bird lists
            db.run(`
                INSERT OR IGNORE INTO bird_lists (name, description, bird_ids) 
                VALUES 
                ('Häufige Gartenvögel', 'Die 20 häufigsten Vögel in deutschen Gärten', '[]'),
                ('Häufige Waldvögel', 'Typische Bewohner deutscher Wälder', '[]'),
                ('Wasservögel', 'Enten, Gänse und andere Wasservögel', '[]'),
                ('Singvögel', 'Melodische Sänger unserer Heimat', '[]'),
                ('Greifvögel', 'Adler, Falken und Bussarde', '[]')
            `);

            console.log('✅ Database tables initialized successfully');
            resolve();
        });

        db.on('error', (err) => {
            console.error('❌ Database error:', err);
            reject(err);
        });
    });
};

// Database utility functions
const dbUtils = {
    // Run a query that doesn't return data
    run: (sql, params = []) => {
        return new Promise((resolve, reject) => {
            db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, changes: this.changes });
            });
        });
    },

    // Get a single row
    get: (sql, params = []) => {
        return new Promise((resolve, reject) => {
            db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    },

    // Get all rows
    all: (sql, params = []) => {
        return new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
};

module.exports = {
    init,
    db,
    ...dbUtils
};