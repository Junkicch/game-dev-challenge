import { test, expect } from '@playwright/test';
import { boot, startMatch, snap, teleport, setState, errorCollector } from './helpers';

test.describe('08.6 match end and clean restart', () => {
  test('the clock reaching zero ends the match with reason timeUp', async ({ page }) => {
    const errors = errorCollector(page);
    await boot(page);
    await startMatch(page);
    await teleport(page, 640, 600, -Math.PI / 2);
    await setState(page, 'state.timeRemainingMs = 150;');
    await page.waitForFunction(() => (window as any).__pirateBattle.simulation.getState().phase === 'ended', null, { timeout: 8000 });
    const s = await snap(page);
    expect(s.endReason).toBe('timeUp');
    expect(s.time).toBe(0);
    expect(s.projectiles).toBe(0);
    expect(errors).toEqual([]);
  });

  test('nothing advances after the match ends', async ({ page }) => {
    await boot(page);
    await startMatch(page);
    await teleport(page, 640, 600, -Math.PI / 2);
    await setState(page, 'state.timeRemainingMs = 150;');
    await page.waitForFunction(() => (window as any).__pirateBattle.simulation.getState().phase === 'ended', null, { timeout: 8000 });
    const t1 = await snap(page);
    await page.waitForTimeout(900);
    const t2 = await snap(page);
    expect(t2.elapsed).toBe(t1.elapsed);
    expect(t2.score).toBe(t1.score);
  });

  test('input is ignored after the match ends', async ({ page }) => {
    await boot(page);
    await startMatch(page);
    await teleport(page, 640, 600, -Math.PI / 2);
    await setState(page, 'state.timeRemainingMs = 150;');
    await page.waitForFunction(() => (window as any).__pirateBattle.simulation.getState().phase === 'ended', null, { timeout: 8000 });
    const before = await snap(page);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(500);
    await page.keyboard.up('KeyW');
    const after = await snap(page);
    expect(after.pos.y).toBe(before.pos.y);
  });

  test('hull reaching zero ends the match with reason playerDead', async ({ page }) => {
    await boot(page);
    await startMatch(page);
    await teleport(page, 640, 600, -Math.PI / 2);
    await setState(page, `state.player.health = 1; state.player.invulnerableMs = 0; state.spawnTimerMs = 1;`);
    await page.waitForFunction(() => (window as any).__pirateBattle.simulation.getState().enemies.length > 0, null, { timeout: 6000 });
    await setState(page, `
      const enemy = state.enemies[0];
      state.enemies.length = 1;
      enemy.kind = 'chaser';
      enemy.health = 100;
      enemy.position.x = state.player.position.x + 40;
      enemy.position.y = state.player.position.y;
    `);
    await page.waitForFunction(() => (window as any).__pirateBattle.simulation.getState().phase === 'ended', null, { timeout: 8000 });
    const s = await snap(page);
    expect(s.endReason).toBe('playerDead');
    expect(s.alive).toBe(false);
    expect(s.hp).toBe(0);
  });

  test('Play again restores a clean running match', async ({ page }) => {
    await boot(page);
    await startMatch(page);
    await teleport(page, 640, 600, -Math.PI / 2);
    await setState(page, `state.player.health = 10; state.score = 7; state.timeRemainingMs = 150;`);
    await page.waitForFunction(() => (window as any).__pirateBattle.simulation.getState().phase === 'ended', null, { timeout: 8000 });
    await page.getByRole('button', { name: 'Play again' }).click();
    const r = await snap(page);
    expect(r.phase).toBe('running');
    expect(r.score).toBe(0);
    expect(r.hp).toBe(100);
    expect(r.alive).toBe(true);
    expect(Math.abs(r.time - 120000)).toBeLessThan(3000);
    expect(r.elapsed).toBeLessThan(5000); // generous: snapshot round-trips on slow renderers
    expect(r.enemies.length).toBe(0);
    expect(r.projectiles).toBe(0);
    expect(r.endReason).toBeNull();
  });
});