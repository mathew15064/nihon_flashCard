'use strict';

const CONTENT_TYPES = {
  HIRAGANA: 'hiragana',
  KATAKANA: 'katakana',
  KANJI: 'kanji',
  VOCABULARY: 'vocabulary'
};

const ALL_CONTENT_TYPES = Object.values(CONTENT_TYPES);

module.exports = { CONTENT_TYPES, ALL_CONTENT_TYPES };
