// logger.js - Simple SQLite logger for inbound/outbound messages
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Database file located at project root for sharing with FastAPI
const dbPath = path.resolve(__dirname, '..', 'whatsapp_logs.db');
const db = new sqlite3.Database(dbPath);

// Ensure table exists
const initSql = `
CREATE TABLE IF NOT EXISTS whatsapp_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT,
  direction TEXT CHECK(direction IN ('inbound','outbound')),
  status TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  raw TEXT
);`;

db.run(initSql);

/**
 * Log a message record.
 * @param {Object} param0
 * @param {string} param0.message_id
 * @param {string} param0.direction
 * @param {string} param0.status
 * @param {Object} param0.raw
 */
function logMessage({ message_id, direction, status, raw }) {
  return new Promise((resolve, reject) => {
    const sql = `INSERT INTO whatsapp_logs (message_id, direction, status, raw) VALUES (?,?,?,?)`;
    db.run(sql, [message_id, direction, status, JSON.stringify(raw)], function (err) {
      if (err) reject(err);
      else resolve(this.lastID);
    });
  });
}

module.exports = { logMessage, db };
