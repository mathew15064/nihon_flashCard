'use strict';

const express = require('express');
const statisticsService = require('../services/statistics.service');

const router = express.Router();

router.get('/:userId', (req, res) => {
  try {
    res.locals.sendSuccess(statisticsService.getDashboard(req.params.userId));
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
