const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || './data/panel.db';

// Pastikan direktori data ada
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

function init() {
  // Enable WAL mode untuk performa lebih baik
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Tabel users
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      port_assigned INTEGER UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_active INTEGER DEFAULT 1
    )
  `);

  // Tabel apps
  db.exec(`
    CREATE TABLE IF NOT EXISTS apps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'nodejs',
      status TEXT DEFAULT 'stopped',
      port INTEGER NOT NULL,
      app_dir TEXT,
      start_command TEXT DEFAULT 'node index.js',
      pm2_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Tabel domains
  db.exec(`
    CREATE TABLE IF NOT EXISTS domains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      app_id INTEGER NOT NULL,
      domain TEXT UNIQUE NOT NULL,
      type TEXT DEFAULT 'subdomain',
      ssl_enabled INTEGER DEFAULT 0,
      nginx_config_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
    )
  `);

  // Tabel port counter untuk auto-assign
  db.exec(`
    CREATE TABLE IF NOT EXISTS port_counter (
      id INTEGER PRIMARY KEY,
      next_port INTEGER DEFAULT 3001
    )
  `);

  // Init port counter jika belum ada
  const counter = db.prepare('SELECT id FROM port_counter WHERE id = 1').get();
  if (!counter) {
    db.prepare('INSERT INTO port_counter (id, next_port) VALUES (1, 3001)').run();
  }

  console.log('✅ Database initialized');
}

// Ambil port berikutnya dan increment
function getNextPort() {
  const row = db.prepare('SELECT next_port FROM port_counter WHERE id = 1').get();
  const port = row.next_port;
  db.prepare('UPDATE port_counter SET next_port = next_port + 1 WHERE id = 1').run();
  return port;
}

module.exports = { db, init, getNextPort };
