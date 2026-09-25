'use strict';

const express = require('express');
const controller = require('../controllers/history.controller');

const router = express.Router();

router.get('/:userId/months', controller.listMonths);
router.get('/:userId', controller.getHistory);

module.exports = router;
