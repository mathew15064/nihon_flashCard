'use strict';

const jsonFile = require('../utils/json-file');
const { CONTENT_TYPES } = require('../constants/content-types');

const FILES = {
  [CONTENT_TYPES.HIRAGANA]: 'content/hiragana.json',
  [CONTENT_TYPES.KATAKANA]: 'content/katakana.json',
  [CONTENT_TYPES.KANJI]: 'content/kanji.json',
  [CONTENT_TYPES.VOCABULARY]: 'content/vocabulary.json'
};

function assertValidType(contentType) {
  if (!FILES[contentType]) {
    throw new Error('INVALID_CONTENT_TYPE: ' + contentType);
  }
}

function getAll(contentType) {
  assertValidType(contentType);
  return jsonFile.read(FILES[contentType], []);
}

function saveAll(contentType, items) {
  assertValidType(contentType);
  return jsonFile.write(FILES[contentType], items);
}

function findById(contentType, id) {
  return getAll(contentType).find((item) => item.id === id) || null;
}

module.exports = { getAll, saveAll, findById };
