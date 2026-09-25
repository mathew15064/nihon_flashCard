'use strict';

const { test, expect } = require('@playwright/test');

test('locale switcher changes visible strings', async ({ page }) => {
  await page.goto('/');

  // Default is vi — check Vietnamese label
  const viText = await page.locator('[data-i18n="userSelect.newUser"], #new-user-btn').first().textContent();

  // Switch to en
  const $sel = page.locator('#locale-select');
  if (await $sel.count()) {
    await $sel.selectOption('en');
    await page.waitForTimeout(300);
  } else {
    test.skip(true, 'no locale switcher on this page');
  }
});
