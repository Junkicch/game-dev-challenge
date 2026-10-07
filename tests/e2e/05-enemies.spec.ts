import { test, expect } from '@playwright/test';
import { boot, startMatch, snap, teleport, setState, spawnEnemy, watchBullets, watchEnemySpawns, bullets, errorCollector } from './helpers';

test.describe('08.5 enemy behaviour and spawn cadence', () => {
  test('enemies spawn away from the player', async ({ page }) => {
    const errors = errorCollector(page);
    await boot(page);
    await startMatch(page);
    await teleport(page, 640, 600, -Math.PI / 2);
    await watchEnemySpawns(page);
    await setState(page, 'state.player.health = 100; state.player.invulnerableMs = 0; state.spawnTimerMs = 1;');
    // The spawn sitter is 250px (config minSpawnDistanceFromPlayer); assert on
    // the position at push time — the enemy starts sailing the moment it
    // spawns, so a late live-position read would race its approach.
    await page.waitForFunction(() => (window as any).__spawnPositions.length > 0, null, { timeout: 6000 });
    const dists = await page.evaluate(() => {
      const p = (window as any).__pirateBattle.simulation.getState().player.position;
      return (window as any).__spawnPositions.map((sp: any) => Math.hypot(sp.x - p.x, sp.y - p.y));
    });
    expect(dists.every((d: number) => d >= 200)).toBe(true);
    expect(errors).toEqual([]);
  });

  test('the spawn timer resets to the configured interval after a spawn', async ({ page }) => {
    await boot(page);
    await startMatch(page);
    await teleport(page, 640, 600, -Math.PI / 2);
    await watchEnemySpawns(page);
    await setState(page, 'state.spawnTimerMs = 1;'); // a spawn will fire on the next tick
    // The timer is read in the same synchronous frame the enemy is pushed,
    // after `spawning.ts` has added the 3000ms interval back onto it.
    await page.waitForFunction(() => (window as any).__timerAtSpawn !== undefined, null, { timeout: 6000 });
    const timer = await page.evaluate(() => (window as any).__timerAtSpawn);
    expect(timer).toBeGreaterThan(0);
    expect(timer).toBeLessThanOrEqual(3000); // restored into (0, interval], not left near zero
  });

  test('a chaser sails toward the player', async ({ page }) => {
    await boot(page);
    await startMatch(page);
    await teleport(page, 640, 600, -Math.PI / 2);
    await spawnEnemy(page, 'chaser', 900, 600, 40);
    await page.waitForFunction(
      () => (window as any).__pirateBattle.simulation.getState().enemies[0].position.x < 760,
      null,
      { timeout: 6000 }
    );
    expect(true).toBe(true);
  });

  test('a shooter stops inside its range and opens fire', async ({ page }) => {
    const errors = errorCollector(page);
    await boot(page);
    await startMatch(page);
    await teleport(page, 640, 600, -Math.PI / 2);
    await spawnEnemy(page, 'shooter', 820, 600, 60);
    // Shooter stays around its stopDistance (220px) from the player.
    await page.waitForFunction(
      () => Math.abs((window as any).__pirateBattle.simulation.getState().enemies[0].position.x - 640) <= 240,
      null,
      { timeout: 8000 }
    );
    // And fires a projectile at the player once aligned.
    await watchBullets(page);
    await page.waitForFunction(() => (window as any).__spawnedBullets >= 1, null, { timeout: 8000 });
    expect(await bullets(page)).toBeGreaterThanOrEqual(1);
    const s = await snap(page);
    expect(errors).toEqual([]);
    void s;
  });
});