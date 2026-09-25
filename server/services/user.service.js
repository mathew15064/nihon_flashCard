'use strict';

const userRepository = require('../repositories/user.repository');
const { nextUserId } = require('../utils/id-generator');
const { nowIso } = require('../utils/date');

function listUsers(filters = {}) {
  let users = userRepository.getAll();
  if (filters.status) {
    users = users.filter((u) => u.status === filters.status);
  }
  return users;
}

function getUser(id) {
  const user = userRepository.findById(id);
  if (!user) {
    const err = new Error('User not found');
    err.code = 'USER_NOT_FOUND';
    err.status = 404;
    throw err;
  }
  return user;
}

function createUser({ username, displayName }) {
  if (!username || typeof username !== 'string' || !username.trim()) {
    validationError('Username is required');
  }
  const name = username.trim();
  if (name.length > 50) {
    validationError('Username must be at most 50 characters');
  }
  if (userRepository.findByUsername(name)) {
    const err = new Error('Username already taken');
    err.code = 'USERNAME_TAKEN';
    err.status = 409;
    throw err;
  }

  const now = nowIso();
  const user = {
    id: nextUserId(userRepository.getAll()),
    username: name,
    displayName: (displayName && String(displayName).trim()) || name,
    createdAt: now,
    lastActiveAt: now,
    status: 'active'
  };

  userRepository.insert(user);
  return user;
}

function updateUser(id, patch = {}) {
  const user = getUser(id);
  const toUpdate = {};

  if (patch.displayName !== undefined) {
    if (typeof patch.displayName !== 'string' || !patch.displayName.trim()) {
      validationError('displayName must be a non-empty string');
    }
    toUpdate.displayName = patch.displayName.trim();
  }
  if (patch.status !== undefined) {
    if (!['active', 'inactive'].includes(patch.status)) {
      validationError('status must be active or inactive');
    }
    toUpdate.status = patch.status;
  }

  return userRepository.updateFields(id, toUpdate);
}

function touchActivity(id) {
  getUser(id);
  return userRepository.updateFields(id, { lastActiveAt: nowIso() });
}

function deleteUser(id, { force } = {}) {
  getUser(id);
  if (userRepository.learningDataExists(id) && !force) {
    const err = new Error(
      'User has learning data; delete requires force=true and archives it'
    );
    err.code = 'USER_HAS_LEARNING_DATA';
    err.status = 409;
    throw err;
  }
  userRepository.remove(id);
  return { id };
}

function validationError(message) {
  const err = new Error(message);
  err.code = 'VALIDATION_ERROR';
  err.status = 400;
  throw err;
}

module.exports = { listUsers, getUser, createUser, updateUser, touchActivity, deleteUser };
