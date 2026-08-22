'use strict';

const jsonFile = require('../utils/json-file');

const USERS_FILE = 'users.json';
const LEARNING_ROOT = 'learning/users';

function getAll() {
  return jsonFile.read(USERS_FILE, []);
}

function saveAll(users) {
  return jsonFile.write(USERS_FILE, users);
}

function findById(id) {
  return getAll().find((u) => u.id === id) || null;
}

function findByUsername(username) {
  const needle = String(username).toLowerCase();
  return getAll().find((u) => u.username.toLowerCase() === needle) || null;
}

function learningDirectoryExists(userId) {
  return jsonFile.exists(`${LEARNING_ROOT}/${userId}`);
}

module.exports = {
  getAll,
  saveAll,
  findById,
  findByUsername,
  learningDirectoryExists
};
