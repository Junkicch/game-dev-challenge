import { test, expect } from '@playwright/test';
import { boot, startMatch, teleport, finishMatch, awaitRecorded } from './helpers';

const fontsReady = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.fonts.ready.then(() => true));

test.describe('visual regression (baselines versioned per project)', () => {
  test('main menu', async ({ page }) => {
    await boot(page);
    await page.waitForSelector('#panel-ranking .data-table tbody tr', { timeout: 15_000 });
    await fontsReady(page);
    await expect(page.locator('.menu__panel').first()).toHaveScreenshot('menu.png');
  });

  test('arena in a stable state', async ({ page }) => {
    await boot(page);
    await startMatch(page);
    await teleport(page, 640, 400, -Math.PI / 2);
    await page.keyboard.press('KeyP'); // freeze the simulation
    await page.waitForFunction(() => (window as any).__pirateBattle?.simulation.getPhase() === 'paused', null, { timeout: 5000 });
    await page.waitForTimeout(700); // let effects/transients settle
    await expect(page.locator('.pixi-stage canvas').first()).toHaveScreenshot('arena.png');
  });

  test('result screen', async ({ page }) => {
    await boot(page);
    await finishMatch(page);
    await awaitRecorded(page);
    await fontsReady(page);
    await expect(page.locator('.panel[aria-label="Match result"]')).toHaveScreenshot('result.png');
  });
});