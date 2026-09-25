'use strict';

const { test, expect } = require('@playwright/test');

async function pickUser(page) {
  await page.goto('/');
  await page.click('#new-user-btn');
  await page.fill('#username-input', `q_e2e_${Date.now()}`);
  await page.fill('#displayname-input', 'Quiz Tester');
  await page.click('#new-user-form button[type="submit"]');
  await page.waitForURL('**/pages/dashboard.html');
}

test('quiz config renders and starts', async ({ page }) => {
  await pickUser(page);
  await page.goto('/pages/quiz.html');

  await expect(page.locator('#config-view')).toBeVisible();
  await expect(page.locator('#start-btn')).toBeVisible();

  await page.click('#start-btn');
  await expect(page.locator('#play-view')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#question-prompt')).not.toBeEmpty();
});
