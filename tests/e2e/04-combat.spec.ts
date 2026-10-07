import { test, expect } from '@playwright/test';
import {
  boot, startMatch, snap, teleport, setState, spawnEnemy,
  watchEffects, waitSeen, seen, watchBullets, bullets, bulletSpawns, tapAction,
  errorCollector,
} from './helpers';
import { sleep } from './helpers';

test.describe('08.4 weapons, damage, cooldown and score without duplication', () => {
  test('front shot spawns exactly one projectile', async ({ page }) => {
    await boot(page);
    await startMatch(page);
    await teleport(page, 640, 400, 0);
    await watchBullets(page);
    await tapAction(page, 'fireFront');
    await page.waitForFunction(() => (window as any).__spawnedBullets === 1, null, { timeout: 3000 });
    await sleep(300); // no accidental double fire before the cooldown ends
    expect(await bullets(page)).toBe(1);
  });

  test('left and right broadsides spawn three projectiles each', async ({ page }) => {
    await boot(page);
    await startMatch(page);
    await teleport(page, 640, 400, 0);
    await watchBullets(page);
    await tapAction(page, 'fireLeft');
    await page.waitForFunction(() => (window as any).__spawnedBullets >= 3, null, { timeout: 3000 });
    expect(await bullets(page)).toBe(3);

    await tapAction(page, 'fireRight');
    await page.waitForFunction(() => (window as any).__spawnedBullets >= 6, null, { timeout: 3000 });
    expect(await bullets(page)).toBe(6);
  });

  test('broadsides leave on the correct side of the ship', async ({ page }) => {
    await boot(page);
    await startMatch(page);
    await teleport(page, 800, 520, 0); // heading east: port is north, starboard south
    await watchBullets(page);

    await tapAction(page, 'fireLeft');
    await page.waitForFunction(() => (window as any).__spawnedBullets >= 3, null, { timeout: 3000 });
    await tapAction(page, 'fireRight');
    await page.waitForFunction(() => (window as any).__spawnedBullets >= 6, null, { timeout: 3000 });

    // directions are recorded synchronously at spawn: a slow RAF poll must not
    // race the 400px range of a broadside
    const player = (await bulletSpawns(page)).filter((s: any) => s.owner === 'player');
    expect(player.length).toBe(6);
    expect(player.filter((s: any) => s.vy < 0).length).toBe(3); // port side faces north
    expect(player.filter((s: any) => s.vy > 0).length).toBe(3); // starboard faces south
  });

  test('firing is gated by the weapon cooldown', async ({ page }) => {
    await boot(page);
    await startMatch(page);
    await teleport(page, 640, 400, 0);
    await watchBullets(page);
    // While a cooldown is active the press must not spawn anything, even if a
    // slow frame lets wall-clock time outrun the sim-time cooldown.
    await setState(page, 'state.player.cooldowns.front = 1e9;');
    await tapAction(page, 'fireFront');
    await sleep(250);
    expect(await bullets(page)).toBe(0);
    await setState(page, 'state.player.cooldowns.front = 0;');
    await tapAction(page, 'fireFront');
    await page.waitForFunction(() => (window as any).__spawnedBullets === 1, null, { timeout: 3000 });
    await sleep(200);
    expect(await bullets(page)).toBe(1);
  });

  test('a chaser ram deals damage without scoring', async ({ page }) => {
    const errors = errorCollector(page);
    await boot(page);
    await startMatch(page);
    await spawnEnemy(page, 'chaser', 720, 655, 40);
    await page.waitForFunction(() => (window as any).__pirateBattle.simulation.getState().player.health < 100, null, { timeout: 6000 });
    const s = await snap(page);
    expect(s.hp).toBeLessThan(100);
    expect(s.enemies.length).toBe(0); // self-destruct, no wreck
    expect(s.score).toBe(0);          // ram never awards points
    expect(errors).toEqual([]);
  });

  test('a kill by the player awards exactly one point and removes the enemy', async ({ page }) => {
    const errors = errorCollector(page);
    await boot(page);
    await startMatch(page);
    await teleport(page, 800, 520, -Math.PI / 2); // x=800 is an open corridor, undisturbed by islands
    await setState(page, 'state.player.health = 100; state.player.invulnerableMs = 0; state.score = 0;');
    // a frozen shooter directly ahead on the corridor: the front shot cannot
    // be deflected by island geometry, whatever the frame rate
    await spawnEnemy(page, 'shooter', 800, 320, 10, 1e9);
    await tapAction(page, 'fireFront');
    // exactly one point, awarded once
    await page.waitForFunction(() => (window as any).__pirateBattle.simulation.getState().score === 1, null, { timeout: 10_000 });
    await sleep(400);
    const s = await snap(page);
    expect(s.score).toBe(1);
    expect(s.enemies.length).toBe(0);
    expect(errors).toEqual([]);
  });

  test('destroyed enemy leaves an explosion effect', async ({ page }) => {
    await boot(page);
    await startMatch(page);
    await teleport(page, 800, 520, -Math.PI / 2); // x=800 is an open corridor, undisturbed by islands
    await setState(page, 'state.player.health = 100; state.player.invulnerableMs = 0;');
    await spawnEnemy(page, 'shooter', 800, 320, 10, 1e9); // frozen AI: it must die, not shoot
    await watchEffects(page);
    await tapAction(page, 'fireFront');
    await waitSeen(page, 'explosion', 10_000);
    expect((await seen(page)).includes('explosion')).toBe(true);
  });
});