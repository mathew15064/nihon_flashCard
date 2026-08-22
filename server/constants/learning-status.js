'use strict';

const LEARNING_STATUS = {
  NEW: 'new',
  LEARNING: 'learning',
  REVIEW: 'review',
  MASTERED: 'mastered'
};

const ALL_LEARNING_STATUS = Object.values(LEARNING_STATUS);

module.exports = { LEARNING_STATUS, ALL_LEARNING_STATUS };
