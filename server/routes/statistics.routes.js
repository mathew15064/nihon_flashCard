'use strict';

const express = require('express');
const controller = require('../controllers/statistics.controller');

const router = express.Router();

router.get('/:userId', controller.getDashboard);

module.exports = router;
