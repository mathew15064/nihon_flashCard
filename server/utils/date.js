'use strict';

function nowIso() {
  return new Date().toISOString();
}

function currentMonthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

function addMinutes(minutes, from = new Date()) {
  return new Date(from.getTime() + minutes * 60000).toISOString();
}

function addDays(days, from = new Date()) {
  return new Date(from.getTime() + days * 86400000).toISOString();
}

function isSameUtcDay(a, b) {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function pad(n) {
  return String(n).padStart(2, '0');
}

module.exports = { nowIso, currentMonthKey, addMinutes, addDays, isSameUtcDay };
