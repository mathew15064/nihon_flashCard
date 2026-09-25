'use strict';

const { defineConfig, devices } = require('@playwright/test');

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
    command: 'PORT=3999 node server/server.js',
    url: 'http://localhost:3999/api/health',
    reuseExistingServer: false,
    timeout: 10000
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});
