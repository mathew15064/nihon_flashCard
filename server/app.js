'use strict';

const path = require('path');
const express = require('express');

const usersRoutes = require('./routes/users.routes');
const learningRoutes = require('./routes/learning.routes');
const historyRoutes = require('./routes/history.routes');
const statisticsRoutes = require('./routes/statistics.routes');
const quizRoutes = require('./routes/quiz.routes');
const { makeContentRoutes } = require('./routes/content.routes');
const { CONTENT_TYPES } = require('./constants/content-types');

function createApp() {
  const app = express();

  app.use(express.json());

  app.use((req, res, next) => {
    res.locals.sendSuccess = (data, status = 200, meta) => {
      const payload = { success: true, data };
      if (meta) payload.meta = meta;
      return res.status(status).json(payload);
    };
    res.locals.sendError = (status, code, message) =>
      res.status(status).json({ success: false, error: { code, message } });
    next();
  });

  app.use('/api/users', usersRoutes);
  app.use('/api/learning', learningRoutes);
  app.use('/api/history', historyRoutes);
  app.use('/api/statistics', statisticsRoutes);
  app.use('/api/quiz', quizRoutes);

  for (const contentType of Object.values(CONTENT_TYPES)) {
    app.use(`/api/${contentType}`, makeContentRoutes(contentType));
  }

  app.get('/api/health', (req, res) => {
    res.locals.sendSuccess({ status: 'ok' });
  });

  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use('/api', (req, res) => {
    res.locals.sendError(404, 'NOT_FOUND', 'API endpoint not found');
  });

  app.use((err, req, res, next) => {
    console.error(err);
    const message =
      err instanceof SyntaxError && err.status === 400
        ? 'Invalid JSON body'
        : 'Internal server error';
    res.locals.sendError(500, 'INTERNAL_ERROR', message);
  });

  return app;
}

module.exports = { createApp };
