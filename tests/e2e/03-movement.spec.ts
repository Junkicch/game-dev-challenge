import { test, expect } from '@playwright/test';
import { boot, startMatch, snap, teleport, waitSeen, watchBullets, watchEffects, bullets, tapAction, errorCollector } from './helpers';

test.describe('08.3 start, movement, arena limits and island collision', () => {
  test('match starts running with a full-health player and a renderer ship', async ({ page }) => {
    const errors = errorCollector(page);
    await boot(page);
    await startMatch(page);
    const s = await snap(page);
    expect(s.phase).toBe('running');
    expect(s.hp).toBe(100);
    expect(s.alive).toBe(true);
    expect(s.renderer.ships).toBeGreaterThanOrEqual(1);
    expect(errors).toEqual([]);
  });

  test('W moves the ship forward in the facing direction', async ({ page }) => {
    await boot(page);
    await startMatch(page);
    // heading -π/2 faces up; the x=800 lane is open water all the way to the
    // top, so holding W must push the ship significantly towards y=0.
    await teleport(page, 800, 600, -Math.PI / 2);
    await page.keyboard.down('KeyW');
    await page.waitForFunction(
      () => (window as any).__pirateBattle.simulation.getState().player.position.y < 500,
      null,
      { timeout: 6000 }
    );
    await page.keyboard.up('KeyW');
  });

  test('D turns the ship right (heading increases)', async ({ page }) => {
    await boot(page);
    await startMatch(page);
    await teleport(page, 640, 600, -Math.PI / 2);
    const s0 = await snap(page);
    await page.keyboard.down('KeyD');
    await page.waitForFunction(
      (h) => (window as any).__pirateBattle.simulation.getState().player.heading > h,
      s0.heading + 0.2,
      { timeout: 4000 }
    );
    await page.keyboard.up('KeyD');
  });

  test('the ship cannot leave the top boundary of the arena', async ({ page }) => {
    await boot(page);
    await startMatch(page);
    await teleport(page, 640, 120, -Math.PI / 2);
    await page.keyboard.down('KeyW');
    await page.waitForFunction(
      () => (window as any).__pirateBattle.simulation.getState().player.position.y <= 45,
      null,
      { timeout: 6000 }
    );
    await page.waitForTimeout(800);
    await page.keyboard.up('KeyW');
    const s = await snap(page);
    expect(s.pos.y).toBeGreaterThanOrEqual(29.5);
    expect(s.pos.y).toBeLessThanOrEqual(40);
    expect(s.alive).toBe(true);
  });

  test('the ship cannot leave the left boundary of the arena', async ({ page }) => {
    await boot(page);
    await startMatch(page);
    await teleport(page, 120, 600, Math.PI);
    await page.keyboard.down('KeyW');
    await page.waitForFunction(
      () => (window as any).__pirateBattle.simulation.getState().player.position.x <= 40,
      null,
      { timeout: 6000 }
    );
    await page.waitForTimeout(800);
    await page.keyboard.up('KeyW');
    const s = await snap(page);
    expect(s.pos.x).toBeGreaterThanOrEqual(29.5);
    expect(s.pos.x).toBeLessThanOrEqual(45);
    expect(s.alive).toBe(true);
  });

  test('a projectile that leaves the arena is cleaned up', async ({ page }) => {
    await boot(page);
    await startMatch(page);
    await teleport(page, 800, 220, -Math.PI / 2); // open lane north; the top wall is ~190px away
    await watchBullets(page);
    await tapAction(page, 'fireFront');
    await page.waitForFunction(() => (window as any).__spawnedBullets >= 1, null, { timeout: 8000 });
    // 500px/s to the wall is < 0.5s; lifetime would keep it ~1.5s.
    await page.waitForFunction(
      () => (window as any).__pirateBattle.simulation.getState().projectiles.length === 0,
      null,
      { timeout: 1200 }
    );
    expect(await bullets(page)).toBe(1);
  });

  test('an island blocks the ship', async ({ page }) => {
    await boot(page);
    await startMatch(page);
    await teleport(page, 640, 470, -Math.PI / 2);
    await page.keyboard.down('KeyW');
    await page.waitForFunction(
      () => (window as any).__pirateBattle.simulation.getState().player.position.y <= 445,
      null,
      { timeout: 6000 }
    );
    await page.waitForTimeout(1500);
    await page.keyboard.up('KeyW');
    const s = await snap(page);
    expect(s.pos.y).toBeGreaterThanOrEqual(419);
    expect(s.pos.y).toBeLessThanOrEqual(465);
    expect(s.alive).toBe(true);
  });

  test('a projectile is destroyed by an island with a splash effect', async ({ page }) => {
    const errors = errorCollector(page);
    await boot(page);
    await startMatch(page);
    await teleport(page, 640, 470, -Math.PI / 2); // the shot hits island 3 just above
    await watchEffects(page);
    await watchBullets(page);
    await page.evaluate(() => {
      const api = (window as any).__pirateBattle;
      api.simulation.getState().effects.length = 0;
      (window as any).__seenEffects.clear();
    });
    await tapAction(page, 'fireFront');
    await waitSeen(page, 'splash', 10_000);
    expect(await bullets(page)).toBe(1);
    const s = await snap(page);
    expect(s.projectiles).toBe(0);
    expect(errors).toEqual([]);
  });
});