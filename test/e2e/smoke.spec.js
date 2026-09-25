'use strict';

const { test, expect } = require('@playwright/test');

test('user selection page loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('Japanese Flashcard');
  await expect(page.locator('#user-list')).toBeVisible();
});

test('create user → dashboard', async ({ page }) => {
  await page.goto('/');
  await page.click('#new-user-btn');
  await page.fill('#username-input', `e2e_${Date.now()}`);
  await page.fill('#displayname-input', 'E2E Tester');
  await page.click('#new-user-form button[type="submit"]');
  await page.waitForURL('**/pages/dashboard.html');
  await expect(page.locator('#current-user')).toContainText('E2E Tester');
});
