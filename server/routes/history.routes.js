'use strict';

const express = require('express');
const historyService = require('../services/history.service');
const { CONTENT_TYPES } = require('../constants/content-types');

const router = express.Router();

router.get('/:userId/months', (req, res) => {
  try {
    if (!require('../repositories/user.repository').findById(req.params.userId)) {
      return res.locals.sendError(404, 'USER_NOT_FOUND', 'User not found');
    }
    res.locals.sendSuccess(historyService.listAvailableMonths(req.params.userId));
  } catch (err) {
    console.error(err);
    res.locals.sendError(500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.get('/:userId', (req, res) => {
  try {
    const result = historyService.getHistory(req.params.userId, req.query);
    res.locals.sendSuccess(result.items, 200, {
      months: result.months,
      total: result.total,
      page: result.page,
      limit: result.limit
    });
  } catch (err) {
    if (err.code && err.status) {
      res.locals.sendError(err.status, err.code, err.message);
    } else {
      console.error(err);
      res.locals.sendError(500, 'INTERNAL_ERROR', 'Internal server error');
    }
  }
});

module.exports = router;
