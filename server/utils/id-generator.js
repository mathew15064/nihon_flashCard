'use strict';

const jsonFile = require('./json-file');

function nextId(collection, prefix) {
  let max = 0;
  for (const item of collection) {
    const match = /^([a-z]+)_(\d+)$/.exec(item.id);
    if (match && match[1] + '_' === prefix) {
      max = Math.max(max, parseInt(match[2], 10));
    }
  }
  return `${prefix}${pad(max + 1)}`;
}

function nextUserId(users) {
  return nextId(users, 'user_');
}

function contentId(contentType, items) {
  return nextId(items, `${contentType}_`);
}

function pad(n) {
  return String(n).padStart(3, '0');
}

module.exports = { nextUserId, contentId };
