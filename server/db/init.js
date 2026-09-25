'use strict';

const { applySchema } = require('./schema');
const { importContentIfEmpty } = require('./import-content');

function initDb() {
  applySchema();
  const result = importContentIfEmpty();
  return result;
}

module.exports = { initDb };
