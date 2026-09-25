'use strict';

const { createApp } = require('./app');
const { initDb } = require('./db/init');

const PORT = process.env.PORT || 3005;

const result = initDb();
if (result && result.imported > 0) {
  console.log(`Imported ${result.imported} content items into SQLite`);
}

const app = createApp();

app.listen(PORT, () => {
  console.log(`Japanese Flashcard server running at http://localhost:${PORT}`);
});
