'use strict';

const express = require('express');
const controller = require('../controllers/image.controller');

const router = express.Router();

router.get('/search', controller.search);

module.exports = router;
