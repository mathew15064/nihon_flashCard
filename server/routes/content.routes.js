'use strict';

const express = require('express');
const { makeContentController } = require('../controllers/content.controller');

function makeContentRoutes(contentType) {
  const controller = makeContentController(contentType);
  const router = express.Router();

  router.get('/', controller.list);
  router.get('/random', controller.random);
  router.post('/', controller.create);
  router.get('/:id', controller.get);
  router.put('/:id', controller.update);
  router.delete('/:id', controller.remove);

  return router;
}

module.exports = { makeContentRoutes };
