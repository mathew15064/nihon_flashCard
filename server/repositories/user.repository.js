'use strict';

const { getDb } = require('../db/connection');

function rowToUser(r) {
  if (!r) return null;
  return {
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    createdAt: r.created_at,
    lastActiveAt: r.last_active_at,
    status: r.status
  };
}

function getAll() {
  return getDb().prepare('SELECT * FROM users ORDER BY id').all().map(rowToUser);
}

function findById(id) {
  return rowToUser(getDb().prepare('SELECT * FROM users WHERE id = ?').get(id));
}

function findByUsername(username) {
  return rowToUser(
    getDb().prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(String(username))
  );
}

function insert(user) {
  getDb().prepare(
    'INSERT INTO users (id, username, display_name, status, created_at, last_active_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(user.id, user.username, user.displayName, user.status, user.createdAt, user.lastActiveAt);
  return user;
}

function updateFields(id, patch) {
  const fields = [];
  const values = [];
  if (patch.displayName !== undefined) { fields.push('display_name = ?'); values.push(patch.displayName); }
  if (patch.status !== undefined) { fields.push('status = ?'); values.push(patch.status); }
  if (patch.lastActiveAt !== undefined) { fields.push('last_active_at = ?'); values.push(patch.lastActiveAt); }
  if (!fields.length) return findById(id);
  values.push(id);
  getDb().prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return findById(id);
}

function remove(id) {
  getDb().prepare('DELETE FROM users WHERE id = ?').run(id);
  return { id };
}

function learningDataExists(userId) {
  const db = getDb();
  const p = db.prepare('SELECT 1 FROM progress WHERE user_id = ? LIMIT 1').get(userId);
  const h = db.prepare('SELECT 1 FROM history WHERE user_id = ? LIMIT 1').get(userId);
  return Boolean(p || h);
}

module.exports = {
  getAll,
  findById,
  findByUsername,
  insert,
  updateFields,
  remove,
  learningDataExists
};
