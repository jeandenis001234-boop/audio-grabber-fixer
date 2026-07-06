const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(path.join(dbDir, 'fbdown.db'));
db.pragma('journal_mode = WAL');

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS downloads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      format TEXT NOT NULL,
      quality TEXT,
      ip TEXT,
      user_agent TEXT,
      status TEXT DEFAULT 'started',
      file_size INTEGER,
      duration_ms INTEGER,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_downloads_created ON downloads(created_at);
    CREATE INDEX IF NOT EXISTS idx_downloads_ip ON downloads(ip);

    CREATE TABLE IF NOT EXISTS blacklist_ips (
      ip TEXT PRIMARY KEY,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME
    );
  `);

  // Bootstrap admin depuis .env si vide
  const count = db.prepare('SELECT COUNT(*) AS c FROM admin_users').get().c;
  if (count === 0 && process.env.ADMIN_PASSWORD_HASH) {
    db.prepare(
      'INSERT INTO admin_users (username, email, password_hash, role) VALUES (?, ?, ?, ?)'
    ).run(
      process.env.ADMIN_USERNAME || 'admin',
      process.env.ADMIN_EMAIL || '',
      process.env.ADMIN_PASSWORD_HASH,
      'superadmin'
    );
  }
}

module.exports = { db, initDb };
