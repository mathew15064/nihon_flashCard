'use strict';

const jsonFile = require('../utils/json-file');
const { currentMonthKey } = require('../utils/date');

function monthFile(monthKey) {
  return `learning/users/{userId}/history/${monthKey}.json`;
}

async function appendEvent(userId, event) {
  const path = monthFile(currentMonthKey()).replace('{userId}', userId);
  let events = jsonFile.read(path, []);
  events.push(event);
  return jsonFile.write(path, events);
}

function getMonthEvents(userId, monthKey) {
  return jsonFile.read(monthFile(monthKey).replace('{userId}', userId), []);
}

function listMonths(userId) {
  return jsonFile
    .listFiles(`learning/users/${userId}/history`, /^\d{4}-\d{2}\.json$/)
    .map((f) => f.replace('.json', ''));
}

function hasAnyHistory(userId) {
  return jsonFile.exists(`learning/users/${userId}/history`);
}

module.exports = { appendEvent, getMonthEvents, hasAnyHistory, listMonths };
