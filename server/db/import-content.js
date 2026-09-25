'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getDb } = require('./connection');

const CONTENT_DIR = path.join(__dirname, '..', '..', 'data', 'content');
const FILES = {
  hiragana: 'hiragana.json',
  katakana: 'katakana.json',
  kanji: 'kanji.json',
  vocabulary: 'vocabulary.json'
};

function rowFields(type, item) {
  const lesson = item.lesson != null ? item.lesson : null;
  const category = item.category || null;
  const jlpt = item.jlpt || null;
  return { lesson, category, jlpt };
}

function importContentIfEmpty() {
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) AS n FROM content').get().n;
  if (count > 0) return { imported: 0, skipped: true };

  let imported = 0;
  const now = new Date().toISOString();
  const stmt = db.prepare(
    'INSERT INTO content (id, content_type, data, lesson, category, jlpt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );

  for (const [type, filename] of Object.entries(FILES)) {
    const full = path.join(CONTENT_DIR, filename);
    if (!fs.existsSync(full)) continue;
    let items;
    try {
      items = JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch (err) {
      console.error(`[import] skip ${filename}: ${err.message}`);
      continue;
    }
    for (const item of items) {
      const { lesson, category, jlpt } = rowFields(type, item);
      stmt.run(item.id, type, JSON.stringify(item), lesson, category, jlpt, now, now);
      imported += 1;
    }
  }
  return { imported, skipped: false };
}

module.exports = { importContentIfEmpty };
