import { test, expect } from '@playwright/test';
import { boot, startMatch, snap, teleport, setState, errorCollector } from './helpers';
import { sleep } from './helpers';

test.describe('08.7 pause, focus loss and resume', () => {
  test('P pauses the match and freezes the clock', async ({ page }) => {
    const errors = errorCollector(page);
    await boot(page);
    await startMatch(page);
    await teleport(page, 640, 600, -Math.PI / 2);
    await setState(page, 'state.spawnTimerMs = 1e9; state.enemies.length = 0;');
    await page.keyboard.press('KeyP');
    const p1 = await snap(page);
    expect(p1.phase).toBe('paused');
    await sleep(700);
    const p2 = await snap(page);
    expect(p2.time).toBe(p1.time);
    expect(p2.elapsed).toBe(p1.elapsed);
    expect(errors).toEqual([]);
  });

  test('held keys do nothing while paused', async ({ page }) => {
    await boot(page);
    await startMatch(page);
    await teleport(page, 640, 600, -Math.PI / 2);
    await page.keyboard.press('KeyP');
    await page.keyboard.down('KeyW');
    await sleep(500);
    const p3 = await snap(page);
    expect(p3.pos.y).toBe(600);
    await page.keyboard.up('KeyW');
  });

  test('resuming suppresses an input that was held across the pause', async ({ page }) => {
    await boot(page);
    await startMatch(page);
    await teleport(page, 640, 600, -Math.PI / 2);
    await page.keyboard.press('KeyP');
    await page.keyboard.down('KeyW');
    await sleep(300);
    await page.getByRole('button', { name: 'Resume' }).click();
    const p4 = await snap(page);
    expect(p4.phase).toBe('running');
    expect(p4.fwdDown).toBe(false); // latch suppressed on resume
    await sleep(600);
    const p5 = await snap(page);
    expect(p5.pos.y).toBe(600); // no movement from the held key
    await page.keyboard.up('KeyW');
  });

  test('losing window focus pauses a running match and resume works', async ({ page }) => {
    await boot(page);
    await startMatch(page);
    await teleport(page, 640, 600, -Math.PI / 2);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    const bl = await snap(page);
    expect(bl.phase).toBe('paused');
    await page.getByRole('button', { name: 'Resume' }).click();
    const bl2 = await snap(page);
    expect(bl2.phase).toBe('running');
  });
});