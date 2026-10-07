import { test, expect } from '@playwright/test';
import { boot, errorCollector } from './helpers';

test.describe('08.2 asset loading, failure and retry', () => {
  test('assets load and the match is ready to start', async ({ page }) => {
    const errors = errorCollector(page);
    await boot(page);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForSelector('button:has-text("Start match")', { timeout: 30_000 });
    expect(await page.locator('canvas').count()).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  // The asset loader decodes in a worker, so a page route cannot force one of
  // its fetches to fail. Instead the loader consults window.__pirateBattleAssetsError
  // (a documented test hook): any matching entry throws, and the app then shows
  // the same Retry UI a real network failure would.
  test('a failed asset shows an error with a Retry button', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      (window as any).__pirateBattleAssetsError = 'ship_1.png';
    });
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    const alert = page.locator('.pixi-status[role="alert"]');
    await alert.waitFor({ state: 'visible', timeout: 30_000 });
    expect(await alert.textContent()).toContain('ship_1.png');
    expect(await alert.locator('button', { hasText: 'Retry' }).isVisible()).toBe(true);
  });

  test('retrying recovers and starts the match', async ({ page }) => {
    const errors = errorCollector(page);
    await boot(page);
    await page.evaluate(() => {
      (window as any).__pirateBattleAssetsError = 'ship_1.png';
    });
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.locator('.pixi-status[role="alert"]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.evaluate(() => {
      delete (window as any).__pirateBattleAssetsError;
    });
    await page.locator('.pixi-status button', { hasText: 'Retry' }).click();
    await page.waitForSelector('button:has-text("Start match")', { timeout: 30_000 });
    await page.getByRole('button', { name: 'Start match' }).click();
    await page.waitForFunction(
      () => (window as any).__pirateBattle?.simulation.getPhase() === 'running',
      null,
      { timeout: 20_000 }
    );
    expect(errors).toEqual([]);
  });
});