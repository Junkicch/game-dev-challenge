import { test, expect } from '@playwright/test';
import { boot, finishMatch, text, read, awaitRecorded, errorCollector } from './helpers';

test.describe('08.8 result screen and persistence', () => {
  test('a finished match renders the result dialog with its data', async ({ page }) => {
    const errors = errorCollector(page);
    await boot(page);
    await finishMatch(page);
    await awaitRecorded(page);
    const result = await text(page, '.results');
    expect(result).toContain('Score');
    expect(result).toContain('Time played');
    expect(result).toContain('Hull');
    expect(result).toContain('Recorded in ranking and history');
    expect(await page.isVisible('button:has-text("Play again")')).toBe(true);
    expect(await page.isVisible('button:has-text("Main menu")')).toBe(true);
    expect(errors).toEqual([]);
  });

  test('the last result is persisted across a refresh', async ({ page }) => {
    const errors = errorCollector(page);
    await boot(page);
    await finishMatch(page);
    await awaitRecorded(page);
    const stored = JSON.parse((await read(page, 'pirate-battle.last-result')) || '{}');
    expect(stored.endReason).toBe('timeUp');
    expect(typeof stored.score).toBe('number');
    expect(stored.endedAt).toBeGreaterThan(0);

    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('button:has-text("Play")');
    const card = await text(page, '.menu__panel');
    expect(card).toContain('Last match');
    expect(errors).toEqual([]);
  });

  test('abandoning a match does not replace the stored last result', async ({ page }) => {
    const errors = errorCollector(page);
    await boot(page);
    await finishMatch(page);
    await awaitRecorded(page);
    const original = await read(page, 'pirate-battle.last-result');
    await page.getByRole('button', { name: 'Play again' }).click();
    await page.keyboard.press('KeyP'); // pause
    await page.getByRole('button', { name: 'Main menu' }).click();
    await page.waitForSelector('button:has-text("Play")');
    const after = await read(page, 'pirate-battle.last-result');
    expect(after).toBe(original); // 'abandoned' never replaces a finished match
    expect(errors).toEqual([]);
  });
});