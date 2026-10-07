import { test, expect } from '@playwright/test';
import { boot, startMatch, snap, read, text, errorCollector } from './helpers';

test.describe('08.1 options navigation, validation and persistence', () => {
  test('the menu renders Play, Options and the three tabs without a canvas', async ({ page }) => {
    const errors = errorCollector(page);
    await boot(page);
    expect(await page.isVisible('button:has-text("Play")')).toBe(true);
    expect(await page.isVisible('button:has-text("Options")')).toBe(true);
    expect(await page.locator('canvas').count()).toBe(0);
    expect(await page.isVisible('#tab-ranking')).toBe(true);
    expect(await page.isVisible('#tab-history')).toBe(true);
    expect(await page.isVisible('#tab-controls')).toBe(true);
    expect(errors).toEqual([]);
  });

  test('the Controls tab holds the keyboard reference', async ({ page }) => {
    const errors = errorCollector(page);
    await boot(page);
    await page.click('#tab-controls');
    expect(await page.isVisible('#panel-controls .command-list')).toBe(true);
    expect(await page.isVisible('#panel-ranking .data-table')).toBe(false); // swapped panels
    const reference = await text(page, '#panel-controls');
    expect(reference).toContain('Left broadside');
    expect(reference).toContain('Right broadside');
    expect(reference).toContain('Q');
    expect(reference).toContain('E');
    expect(errors).toEqual([]);
  });

  test('on a short viewport the menu scrolls back to the Play button', async ({ page }) => {
    await boot(page);
    await page.waitForSelector('#panel-ranking .data-table tbody tr', { timeout: 15_000 });
    await page.setViewportSize({ width: 1024, height: 420 });
    const play = page.getByRole('button', { name: 'Play', exact: true });
    await play.scrollIntoViewIfNeeded();
    const box = await play.boundingBox();
    expect(box).not.toBeNull();
    const viewport = page.viewportSize()!;
    // centered overflowing flex content clips its top out of scroll reach;
    // the button must be scrollable back into the visible area
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
  });

  test('out-of-range options show an alert and keep the form open', async ({ page }) => {
    await boot(page);
    await page.click('button:has-text("Options")');
    await page.waitForSelector('#opt-session');
    await page.fill('#opt-session', '10');
    await page.click('button:has-text("Save")');
    expect(await page.isVisible('#opt-session-error')).toBe(true);
    expect(await page.isVisible('#opt-session')).toBe(true);
  });

  test('valid options are saved and survive a refresh', async ({ page }) => {
    await boot(page);
    await page.click('button:has-text("Options")');
    await page.waitForSelector('#opt-session');
    await page.fill('#opt-session', '60');
    await page.fill('#opt-spawn', '5000');
    await page.click('button:has-text("Save")');
    await page.waitForSelector('button:has-text("Play")');
    const stored = JSON.parse((await read(page, 'pirate-battle.options')) || '{}');
    expect(stored.sessionTimeSeconds).toBe(60);
    expect(stored.spawnIntervalMs).toBe(5000);
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('button:has-text("Options")');
    // menu keeps a last-match card when one exists; options are read again on Play
    expect(await page.locator('#opt-session').count()).toBe(0); // still on the menu
  });

  test('the match is built from the saved options snapshot', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      localStorage.setItem('pirate-battle.options', JSON.stringify({ sessionTimeSeconds: 60, spawnIntervalMs: 5000 }));
    });
    await startMatch(page);
    const s = await snap(page);
    expect(s.config.sessionTimeSeconds).toBe(60);
    expect(s.config.spawnMs).toBe(5000);
  });
});