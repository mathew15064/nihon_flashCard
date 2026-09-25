'use strict';

const { test, expect } = require('@playwright/test');

async function pickUser(page) {
  await page.goto('/');
  await page.click('#new-user-btn');
  await page.fill('#username-input', `rev_e2e_${Date.now()}`);
  await page.fill('#displayname-input', 'Review Tester');
  await page.click('#new-user-form button[type="submit"]');
  await page.waitForURL('**/pages/dashboard.html');
}

test('review page loads and shows either card or done panel', async ({ page }) => {
  await pickUser(page);
  await page.goto('/pages/review.html');

  // Wait for either a card or the empty/done state
  await expect
    .poll(async () => {
      const cardVisible = await page.locator('#card').isVisible();
      const doneVisible = await page.locator('#done-panel').isVisible();
      return cardVisible || doneVisible;
    }, { timeout: 8000 })
    .toBe(true);
});
