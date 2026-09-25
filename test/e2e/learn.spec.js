'use strict';

const { test, expect } = require('@playwright/test');

async function pickUser(page) {
  await page.goto('/');
  await page.click('#new-user-btn');
  await page.fill('#username-input', `lrn_e2e_${Date.now()}`);
  await page.fill('#displayname-input', 'Learn Tester');
  await page.click('#new-user-form button[type="submit"]');
  await page.waitForURL('**/pages/dashboard.html');
}

test('learn page shows a flashcard and reveals answer', async ({ page }) => {
  await pickUser(page);
  await page.goto('/pages/learn.html');
  await expect(page.locator('#card-front')).toBeVisible({ timeout: 8000 });

  const frontText = await page.locator('#card-front').textContent();
  expect(frontText && frontText.length).toBeGreaterThan(0);

  await page.click('#card');
  await expect(page.locator('#card-back')).toBeVisible();
  await expect(page.locator('#correct-btn')).toBeEnabled();
  await expect(page.locator('#wrong-btn')).toBeEnabled();
});

test('learn page: clicking Correct advances to next card', async ({ page }) => {
  await pickUser(page);
  await page.goto('/pages/learn.html');
  await expect(page.locator('#card-front')).toBeVisible({ timeout: 8000 });

  const firstFront = await page.locator('#card-front').textContent();
  await page.click('#card');
  await page.click('#correct-btn');

  await expect
    .poll(async () => page.locator('#card-front').textContent(), { timeout: 8000 })
    .not.toBe(firstFront);
});
