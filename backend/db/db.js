const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

// Uses Node's built-in SQLite (no native compilation required - avoids the
// better-sqlite3/node-gyp/Visual-Studio pain on Windows). Requires Node 22.5+.

const DB_PATH = path.join(__dirname, 'honeychain.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
db.exec(schema);

// better-sqlite3 ships a `db.transaction(fn)` helper; node:sqlite doesn't, so
// we provide a tiny compatible shim (used in routes/hives.js and db/seed.js).
db.transaction = function (fn) {
  return function (...args) {
    db.exec('BEGIN');
    try {
      const result = fn(...args);
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };
};

module.exports = db;
