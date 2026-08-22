'use strict';

const jsonFile = require('../utils/json-file');
const { nowIso } = require('../utils/date');

function userDir(userId) {
  return `learning/users/${userId}`;
}

function getProgress(userId) {
  const data = jsonFile.read(`${userDir(userId)}/progress.json`, null);
  if (!data) {
    return { userId, updatedAt: nowIso(), cards: {} };
  }
  return data;
}

function saveProgress(userId, progress) {
  progress.updatedAt = nowIso();
  return jsonFile.write(`${userDir(userId)}/progress.json`, progress);
}

function getCard(progress, cardId) {
  return progress.cards[cardId] || null;
}

function upsertCard(progress, card) {
  progress.cards[card.cardId] = card;
}

module.exports = { getProgress, saveProgress, getCard, upsertCard, userDir };
