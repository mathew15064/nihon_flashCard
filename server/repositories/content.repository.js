'use strict';

const { getDb } = require('../db/connection');
const { CONTENT_TYPES } = require('../constants/content-types');

const VALID = new Set(Object.values(CONTENT_TYPES));

function assertValidType(contentType) {
  if (!VALID.has(contentType)) {
    const err = new Error('INVALID_CONTENT_TYPE: ' + contentType);
    err.code = 'INVALID_CONTENT_TYPE';
    err.status = 400;
    throw err;
  }
}

function rowToItem(row) {
  if (!row) return null;
  try { return JSON.parse(row.data); }
  catch (_) { return null; }
}

function getAll(contentType) {
  assertValidType(contentType);
  return getDb()
    .prepare('SELECT * FROM content WHERE content_type = ? ORDER BY id')
    .all(contentType)
    .map(rowToItem)
    .filter(Boolean);
}

function findById(contentType, id) {
  assertValidType(contentType);
  const row = getDb()
    .prepare('SELECT * FROM content WHERE content_type = ? AND id = ?')
    .get(contentType, id);
  return rowToItem(row);
}

function insert(contentType, item) {
  assertValidType(contentType);
  const now = new Date().toISOString();
  getDb().prepare(
    'INSERT INTO content (id, content_type, data, lesson, category, jlpt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    item.id,
    contentType,
    JSON.stringify(item),
    item.lesson != null ? item.lesson : null,
    item.category || null,
    item.jlpt || null,
    now,
    now
  );
  return item;
}

function updateFields(contentType, id, patch) {
  assertValidType(contentType);
  const current = findById(contentType, id);
  if (!current) return null;
  const merged = { ...current, ...patch };
  const now = new Date().toISOString();
  getDb().prepare(
    'UPDATE content SET data = ?, lesson = ?, category = ?, jlpt = ?, updated_at = ? WHERE content_type = ? AND id = ?'
  ).run(
    JSON.stringify(merged),
    merged.lesson != null ? merged.lesson : null,
    merged.category || null,
    merged.jlpt || null,
    now,
    contentType,
    id
  );
  return merged;
}

function remove(contentType, id) {
  assertValidType(contentType);
  const info = getDb()
    .prepare('DELETE FROM content WHERE content_type = ? AND id = ?')
    .run(contentType, id);
  return { id, deleted: info.changes > 0 };
}

module.exports = {
  getAll,
  findById,
  insert,
  updateFields,
  remove,
  assertValidType
};
