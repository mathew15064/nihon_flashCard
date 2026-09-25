'use strict';

const { defineConfig, devices } = require('@playwright/test');
const fs = require('node:fs');

const E2E_DB = '/tmp/jf-e2e.db';

// Fresh DB every run
for (const suffix of ['', '-wal', '-shm']) {
  try { fs.rmSync(E2E_DB + suffix, { force: true }); } catch (_) {}
}

module.exports = defineConfig({
  testDir: './test/e2e',
  timeout: 15000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3999',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: `DB_PATH=${E2E_DB} PORT=3999 node server/server.js`,
    url: 'http://localhost:3999/api/health',
    reuseExistingServer: false,
    timeout: 10000
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});
