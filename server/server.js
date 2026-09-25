'use strict';

const { createApp } = require('./app');

const PORT = process.env.PORT || 3005;

const app = createApp();

app.listen(PORT, () => {
  console.log(`Japanese Flashcard server running at http://localhost:${PORT}`);
});
