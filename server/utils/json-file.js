'use strict';

const fs = require('fs');
const path = require('path');

const DATA_ROOT = path.join(__dirname, '..', '..', 'data');

function resolveSafe(relativePath) {
  const full = path.resolve(DATA_ROOT, relativePath);
  if (!full.startsWith(DATA_ROOT + path.sep) && full !== DATA_ROOT) {
    throw new Error('INVALID_PATH');
  }
  return full;
}

function exists(relativePath) {
  return fs.existsSync(resolveSafe(relativePath));
}

function ensureDirectory(relativeDir) {
  fs.mkdirSync(resolveSafe(relativeDir), { recursive: true });
}

function read(relativePath, defaultValue) {
  const full = resolveSafe(relativePath);
  if (!fs.existsSync(full)) {
    if (arguments.length > 1) return defaultValue;
    throw new Error('FILE_NOT_FOUND: ' + relativePath);
  }
  try {
    return JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (err) {
    throw new Error('CORRUPTED_JSON_FILE: ' + relativePath);
  }
}

const writeQueues = new Map();

function write(relativePath, value) {
  JSON.stringify(value);

  const queued = writeQueues.get(relativePath) || Promise.resolve();
  const next = queued
    .then(() => atomicWrite(relativePath, value))
    .catch((err) => {
      writeQueues.delete(relativePath);
      throw err;
    })
    .then(() => {
      if (writeQueues.get(relativePath) === next) writeQueues.delete(relativePath);
    });
  writeQueues.set(relativePath, next);
  return next;
}

function atomicWrite(relativePath, value) {
  const full = resolveSafe(relativePath);
  ensureDirectory(path.dirname(relativePath));
  const tmp = full + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, full);
}

module.exports = { exists, read, write, ensureDirectory };
