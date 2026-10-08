import { test, expect } from '@playwright/test';
import { boot, startMatch, endMatch, setState, teleport, awaitRecorded } from './helpers';

const fontsReady = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.fonts.ready.then(() => true));

test.describe('visual regression (baselines versioned per project)', () => {
  test('main menu', async ({ page }) => {
    await boot(page);
    await page.waitForSelector('#panel-ranking .data-table tbody tr', { timeout: 15_000 });
    await fontsReady(page);
    // Viewport shot: `.shell` is an opaque fixed layer, so the frame is fully
    // deterministic and covers the panel against its background.
    await expect(page).toHaveScreenshot('menu.png');
  });

  test('arena in a stable state', async ({ page }) => {
    await boot(page);
    await startMatch(page);
    await teleport(page, 640, 400, -Math.PI / 2);
    // Pin the clock: keeps the HUD timer, the wave phase and the spawn schedule
    // identical across runs before freezing.
    await setState(page, 'state.elapsedMs = 0; state.timeRemainingMs = 107_000;');
    await page.keyboard.press('KeyP'); // freeze the simulation
    await page.waitForFunction(() => (window as any).__pirateBattle?.simulation.getPhase() === 'paused', null, { timeout: 5000 });
    await page.locator('.overlay').evaluateAll((els) => {
      els.forEach((el) => ((el as HTMLElement).style.visibility = 'hidden'));
    }); // the pause dialog would cover the ships
    await page.waitForTimeout(700); // let effects/transients settle
    await expect(page.locator('.pixi-stage canvas').first()).toHaveScreenshot('arena.png');
  });

  test('result screen', async ({ page }) => {
    await boot(page);
    await startMatch(page);
    // Rewind the spawn/elapsed clock so the frame cannot pick up an enemy or
    // a drifting ship before the match ends.
    await setState(page, 'state.elapsedMs = 0;');
    await endMatch(page);
    await awaitRecorded(page);
    await fontsReady(page);
    const timeValue = page.locator('.panel[aria-label="Match result"] .results dd').nth(1);
    await expect(page.locator('.panel[aria-label="Match result"]')).toHaveScreenshot('result.png', {
      mask: [timeValue],
    });
  });
});
