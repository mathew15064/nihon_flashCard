'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const DEFAULT_DB_PATH = path.join(__dirname, '..', '..', 'data', 'app.db');

let db = null;

function getDbPath() {
  return process.env.DB_PATH || DEFAULT_DB_PATH;
}

function getDb() {
  if (db) return db;
  const dbPath = getDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

function closeDb() {
  if (db) {
    try { db.close(); } catch (_) {}
    db = null;
  }
}

module.exports = { getDb, getDbPath, closeDb };
