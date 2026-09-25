'use strict';

const contentRepository = require('../repositories/content.repository');
const userRepository = require('../repositories/user.repository');
const historyRepository = require('../repositories/history.repository');
const progressRepository = require('../repositories/progress.repository');
const { CONTENT_TYPES, ALL_CONTENT_TYPES } = require('../constants/content-types');
const { contentId } = require('../utils/id-generator');
const imageService = require('./image/image.service');

const KANA_TYPES = ['basic', 'dakuten', 'handakuten', 'combination'];
const JLPT_LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'];

function fail(status, code, message) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  throw err;
}

const validationError = (m) => fail(400, 'VALIDATION_ERROR', m);

function assertType(contentType) {
  if (!ALL_CONTENT_TYPES.includes(contentType)) {
    fail(400, 'INVALID_CONTENT_TYPE', 'Unknown content type: ' + contentType);
  }
}

/* ---------------- validation ---------------- */

function validate(contentType, data, { partial } = {}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    validationError('Request body must be a JSON object');
  }

  const out = {};

  if (contentType === CONTENT_TYPES.HIRAGANA || contentType === CONTENT_TYPES.KATAKANA) {
    requireField(data, partial, 'character');
    if (data.character !== undefined) out.character = String(data.character).trim();
    if (data.romaji !== undefined) out.romaji = String(data.romaji).trim();
    if (data.type !== undefined && data.type !== '') {
      if (!KANA_TYPES.includes(data.type)) {
        validationError(`type must be one of: ${KANA_TYPES.join(', ')}`);
      }
      out.type = data.type;
    }
  } else if (contentType === CONTENT_TYPES.KANJI) {
    requireField(data, partial, 'kanji');
    if (data.kanji !== undefined) out.kanji = String(data.kanji).trim();
    for (const f of ['onyomi', 'kunyomi']) {
      if (data[f] !== undefined) out[f] = toStringArray(data[f]);
    }
    if (data.meanings !== undefined) out.meanings = toStringArray(data.meanings);
    if (data.jlpt !== undefined && data.jlpt !== '') {
      if (!JLPT_LEVELS.includes(data.jlpt)) {
        validationError(`jlpt must be one of: ${JLPT_LEVELS.join(', ')}`);
      }
      out.jlpt = data.jlpt;
    }
    if (data.lesson !== undefined && data.lesson !== '') out.lesson = toLesson(data.lesson);
    if (data.examples !== undefined) out.examples = data.examples;
  } else if (contentType === CONTENT_TYPES.VOCABULARY) {
    requireField(data, partial, 'word');
    requireField(data, partial, 'meaning');
    if (data.word !== undefined) out.word = String(data.word).trim();
    if (data.reading !== undefined) out.reading = String(data.reading).trim();
    if (data.romanization !== undefined) out.romanization = String(data.romanization).trim();
    if (data.meaning !== undefined) out.meaning = String(data.meaning).trim();
    if (data.meaningVi !== undefined) out.meaningVi = String(data.meaningVi).trim();
    if (data.lesson !== undefined && data.lesson !== '') out.lesson = toLesson(data.lesson);
    if (data.category !== undefined) out.category = String(data.category).trim();
    if (data.examples !== undefined) out.examples = data.examples;
    if (data.notes !== undefined) out.notes = String(data.notes);
    if (data.image !== undefined) {
      // Optional illustrative image; null clears it. Metadata validated
      // (http/https only) by the image service — provider-agnostic.
      out.image = imageService.normalizeImageMetadata(data.image);
    }
  }

  return out;
}

function requireField(data, partial, field) {
  if (partial && data[field] === undefined) return;
  const value = data[field];
  if (value === undefined || value === null || !String(value).trim()) {
    validationError(`Field "${field}" is required`);
  }
}

function toStringArray(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value.split(/[,、]/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function toLesson(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) validationError('lesson must be an integer >= 1');
  return n;
}

/* ---------------- queries ---------------- */

function searchMatches(contentType, item, needle) {
  let fields;
  if (contentType === CONTENT_TYPES.KANJI) {
    fields = [item.kanji, ...(item.onyomi || []), ...(item.kunyomi || []), ...(item.meanings || [])];
  } else if (contentType === CONTENT_TYPES.VOCABULARY) {
    fields = [item.word, item.reading, item.romanization, item.meaning, item.meaningVi, item.category];
  } else {
    fields = [item.character, item.romaji];
  }
  return fields.some((f) => f && String(f).toLowerCase().includes(needle));
}

function list(contentType, query = {}) {
  assertType(contentType);
  let items = contentRepository.getAll(contentType);

  if (query.search) {
    const needle = String(query.search).toLowerCase();
    items = items.filter((i) => searchMatches(contentType, i, needle));
  }
  if (query.type) items = items.filter((i) => i.type === query.type);
  if (query.jlpt) items = items.filter((i) => i.jlpt === query.jlpt);
  if (query.lesson) items = items.filter((i) => String(i.lesson) === String(query.lesson));
  if (query.category) {
    items = items.filter(
      (i) => i.category && i.category.toLowerCase() === String(query.category).toLowerCase()
    );
  }

  const total = items.length;

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limitRaw = parseInt(query.limit, 10);
  const limit = Math.min(Math.max(1, limitRaw || 100), 500);

  const start = (page - 1) * limit;
  return {
    total,
    page,
    limit,
    items: items.slice(start, start + limit)
  };
}

function getById(contentType, id) {
  assertType(contentType);
  const item = contentRepository.findById(contentType, id);
  if (!item) fail(404, 'CONTENT_NOT_FOUND', `${contentType} not found: ${id}`);
  return item;
}

function create(contentType, body) {
  assertType(contentType);
  const fields = validate(contentType, body);
  const items = contentRepository.getAll(contentType);
  const item = {
    id: contentId(contentType, items),
    ...fields
  };
  items.push(item);
  contentRepository.saveAll(contentType, items);
  return item;
}

function update(contentType, id, body) {
  assertType(contentType);
  const items = contentRepository.getAll(contentType);
  const item = items.find((i) => i.id === id);
  if (!item) fail(404, 'CONTENT_NOT_FOUND', `${contentType} not found: ${id}`);
  const fields = validate(contentType, body, { partial: true });
  Object.assign(item, fields);
  contentRepository.saveAll(contentType, items);
  return item;
}

function findReferences(cardId) {
  const referencing = [];
  for (const user of userRepository.getAll()) {
    try {
      const progress = progressRepository.getProgress(user.id);
      if (progress.cards[cardId]) {
        referencing.push(user.id);
        continue;
      }
      for (const month of historyRepository.listMonths(user.id)) {
        if (historyRepository.getMonthEvents(user.id, month).some((e) => e.cardId === cardId)) {
          referencing.push(user.id);
          break;
        }
      }
    } catch (err) {
      /* skip unreadable user data */
    }
  }
  return [...new Set(referencing)];
}

function remove(contentType, id) {
  assertType(contentType);
  const items = contentRepository.getAll(contentType);
  const index = items.findIndex((i) => i.id === id);
  if (index === -1) fail(404, 'CONTENT_NOT_FOUND', `${contentType} not found: ${id}`);
  const referencing = findReferences(id);
  if (referencing.length) {
    fail(409, 'CONTENT_IN_USE', `Card is used by ${referencing.length} user(s); deletion blocked`);
  }
  items.splice(index, 1);
  contentRepository.saveAll(contentType, items);
  return { id };
}

function random(contentType, count = 10) {
  assertType(contentType);
  const items = contentRepository.getAll(contentType);
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return { total: items.length, items: shuffled.slice(0, Math.max(1, Math.min(count, 100))) };
}

module.exports = { list, getById, create, update, remove, random, assertType };
