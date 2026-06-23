import { test, expect } from '@playwright/test';

test('capture mobile portrait selection', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('http://localhost:5173');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'mobile_portrait_selection.png' });
});

test('capture mobile portrait game', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('http://localhost:5173');
  await page.click('text=Nature');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'mobile_portrait_game.png' });
});

test('capture mobile landscape game', async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await page.goto('http://localhost:5173');
  await page.click('text=Nature');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'mobile_landscape_game.png' });
});
