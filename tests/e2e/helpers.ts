import { type Page } from '@playwright/test';

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Waits for the result dialog's registration row to reach `recorded`.
 * A slow mock response can outlast the app's single auto-retry (3s axios
 * budget), during which the row shows its manual "Retry registration" button;
 * this clicks it whenever it appears, keeping the test's assertion against the
 * app's designed recovery path instead of racing the mock's latency.
 */
export const awaitRecorded = async (page: Page, timeout = 25_000) => {
  const started = Date.now();
  await page.waitForSelector('.registration', { timeout });
  while (Date.now() - started < timeout) {
    const recorded = await page.locator('.registration--recorded').count();
    if (recorded > 0) return;
    const retry = await page.locator('button:has-text("Retry registration")').count();
    if (retry > 0) {
      await page.locator('button:has-text("Retry registration")').click();
    }
    await sleep(300);
  }
  throw new Error('registration never reached "recorded"');
};

/** Snapshot of the live simulation + renderer (mirrors what the HUD reads). */
export const snap = (page: Page) =>
  page.evaluate(() => {
    const api = (window as any).__pirateBattle;
    const s = api.simulation.getState();
    void api.renderer.ships.size;
    return {
      phase: s.phase as string,
      time: s.timeRemainingMs as number,
      elapsed: s.elapsedMs as number,
      score: s.score as number,
      hp: s.player.health as number,
      alive: s.player.alive as boolean,
      pos: s.player.position,
      heading: s.player.heading as number,
      vel: s.player.velocity,
      enemies: s.enemies.map((e: any) => ({
        kind: e.kind,
        hp: e.health,
        x: e.position.x,
        y: e.position.y,
      })),
      projectiles: s.projectiles.length as number,
      effects: s.effects.map((e: any) => e.kind) as string[],
      endReason: s.endReason as string | null,
      fwdDown: api.input.isDown('forward') as boolean,
      renderer: {
        ships: api.renderer.ships.size,
        projectiles: api.renderer.projectiles.size,
        effects: api.renderer.effects.size,
      },
      config: {
        sessionTimeSeconds: api.simulation.config.sessionTimeSeconds,
        spawnMs: api.simulation.config.enemySpawn.intervalMs,
        minSpawn: api.simulation.config.enemySpawn.minSpawnDistanceFromPlayer,
      },
    } as {
      phase: string;
      time: number;
      elapsed: number;
      score: number;
      hp: number;
      alive: boolean;
      pos: { x: number; y: number };
      heading: number;
      vel: { x: number; y: number };
      enemies: { kind: string; hp: number; x: number; y: number }[];
      projectiles: number;
      effects: string[];
      endReason: string | null;
      fwdDown: boolean;
      renderer: { ships: number; projectiles: number; effects: number };
      config: { sessionTimeSeconds: number; spawnMs: number; minSpawn: number };
    };
  });

/** Run arbitrary code against the live simulation state (test only). */
export const setState = (page: Page, code: string) =>
  page.evaluate(
    (body) => {
      const api = (window as any).__pirateBattle;
      new Function('sim', 'state', 'api', body)(api.simulation, api.simulation.getState(), api);
    },
    code
  );

/** Clear the arena and place the ship somewhere deterministic. */
export const teleport = (page: Page, x: number, y: number, heading = 0) =>
  setState(
    page,
    `
      state.player.position.x = ${x};
      state.player.position.y = ${y};
      state.player.heading = ${heading};
      state.player.velocity.x = 0;
      state.player.velocity.y = 0;
      state.enemies.length = 0;
      state.projectiles.length = 0;
      state.effects.length = 0;
      state.spawnTimerMs = 1e9;
    `
  );

// ------------------------------------------------------------------ boot
export const boot = async (page: Page, query = '') => {
  await page.goto(`/${query}`, { waitUntil: 'load' });
  await page.waitForSelector('button:has-text("Play")', { timeout: 30_000 });
};

/** Start a match from the main menu and wait until it is running. */
export const startMatch = async (page: Page) => {
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForSelector('button:has-text("Start match")', { timeout: 45_000 });
  await page.getByRole('button', { name: 'Start match' }).click();
  await page.waitForFunction(
    () => (window as any).__pirateBattle?.simulation.getPhase() === 'running',
    null,
    { timeout: 45_000 }
  );
};

/** Force the clock near zero and wait for the natural end of the match. */
export const endMatch = async (page: Page, ms = 120) => {
  await page.evaluate((t) => {
    (window as any).__pirateBattle.simulation.getState().timeRemainingMs = t;
  }, ms);
  await page.waitForFunction(
    () => (window as any).__pirateBattle?.simulation.getPhase() === 'ended',
    null,
    { timeout: 10_000 }
  );
};

/** Play -> finish a match (used by registration / result tests). */
export const finishMatch = async (page: Page) => {
  await startMatch(page);
  await endMatch(page);
};

// ------------------------------------------------------------ network api
export const resetNet = (page: Page) =>
  page.evaluate(() => {
    (window as any).__pirateBattleNet?.reset();
    localStorage.removeItem('pirate-battle.pending-registrations');
  });

export const setScenario = (page: Page, id: string) =>
  page.evaluate((s) => (window as any).__pirateBattleNet?.setScenario(s), id);

export const getScenario = (page: Page) =>
  page.evaluate(() => (window as any).__pirateBattleNet?.getScenario() ?? null);

export const setSeed = (page: Page, seed: number) =>
  page.evaluate((s) => (window as any).__pirateBattleNet?.setSeed(s), seed);

export const getSeed = (page: Page) =>
  page.evaluate(() => (window as any).__pirateBattleNet?.getSeed() ?? null);

export const setLatency = (page: Page, ms: number) =>
  page.evaluate((v) => (window as any).__pirateBattleNet?.setLatency(v), ms);

export const getRequestCount = (page: Page) =>
  page.evaluate(() => (window as any).__pirateBattleNet?.getRequestCount() ?? 0);

// ---------------------------------------------------------------- storage
export const read = (page: Page, key: string) =>
  page.evaluate((k) => localStorage.getItem(k), key);

export const records = async (page: Page) =>
  JSON.parse((await read(page, 'pirate-battle.records')) || '[]') as Record<string, unknown>[];

export const queue = async (page: Page) =>
  JSON.parse((await read(page, 'pirate-battle.pending-registrations')) || '[]') as {
    id: string;
    attempts: number;
  }[];

// --------------------------------------------------------------- console
/**
 * Collects page errors. "Failed to load resource" browser logs are expected
 * whenever a network scenario fails on purpose, so those are ignored; any real
 * console.error / uncaught exception is kept.
 */
export const errorCollector = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) {
      errors.push(m.text());
    }
  });
  return errors;
};

// ------------------------------------------------------------------ text
export const text = async (page: Page, selector: string) =>
  ((await page.textContent(selector).catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();

export const rows = (page: Page, panel: string) =>
  page.locator(`#${panel} .data-table tbody tr`).count();

export const PAGE_SIZE = 5;

/** Wait until the table really renders the first row of page n. */
export const waitPage = async (page: Page, panel: string, n: number) => {
  const expected = String((n - 1) * PAGE_SIZE + 1);
  await page.waitForFunction(
    ({ p, e }) =>
      document.querySelector(`#${p} .data-table tbody tr:first-child td`)?.textContent.trim() === e,
    { p: panel, e: expected },
    { timeout: 15_000 }
  );
};

export const goToPage = async (page: Page, panel: string, n: number) => {
  for (let guard = 0; guard < 20; guard += 1) {
    const current = Number((await text(page, `#${panel} .pager__status`)).match(/Page (\d+)/)?.[1] ?? 1);
    if (current === n) break;
    await page.click(`#${panel} .pager button:has-text("${n > current ? 'Next' : 'Previous'}")`);
  }
  await waitPage(page, panel, n);
};

export const lastPageOf = async (page: Page, panel: string) => {
  const status = await text(page, `#${panel} .pager__status`);
  return Number(status.match(/of (\d+)/)?.[1] ?? 1);
};

// ----------------------------------------------------------------- effects
/**
 * Records every effect kind at the moment it is created — a polled snapshot
 * misses short-lived effects (muzzle only lives ~140 ms).
 */
export const watchEffects = (page: Page) =>
  page.evaluate(() => {
    const api = (window as any).__pirateBattle;
    (window as any).__seenEffects = new Set<string>();
    (window as any).__splashHits = [] as { x: number; y: number }[];
    const effects = api.simulation.getState().effects;
    const original = effects.push.bind(effects);
    effects.push = (...items: unknown[]) => {
      for (const item of items as any[]) {
        (window as any).__seenEffects.add(item.kind);
        if (item.kind === 'splash') (window as any).__splashHits.push(item.position);
      }
      return original(...items);
    };
  });

export const seen = (page: Page, clear = false) =>
  page.evaluate((willClear) => {
    const list = [...((window as any).__seenEffects as Set<string> ?? [])];
    if (willClear) (window as any).__seenEffects.clear();
    return list;
  }, clear);

// -------------------------------------------------------------- bullets
/**
 * Counts every projectile ever spawned, so weapon behaviour can be asserted
 * without racing a bullet's short flight time.
 *
 * The simulation replaces `state.projectiles` every tick
 * (`state.projectiles = state.projectiles.filter(...)`), so patching the
 * array's `push` directly would be discarded on the next tick. Instead the
 * `projectiles` property is trapped: the setter re-patches the push of every
 * replacement, so every spawn is counted regardless of how short-lived the
 * projectile is.
 */
export const watchBullets = (page: Page) =>
  page.evaluate(() => {
    (window as any).__spawnedBullets = 0;
    (window as any).__bulletSpawns = [];
    const state = (window as any).__pirateBattle.simulation.getState();
    let current: unknown[] = [];
    Object.defineProperty(state, 'projectiles', {
      configurable: true,
      get: () => current,
      set: (next: unknown[]) => {
        const original = next.push.bind(next);
        next.push = (...items: unknown[]) => {
          (window as any).__spawnedBullets += items.length;
          // direction is only observable while the projectile lives; record
          // it synchronously at spawn so slow polls cannot race the range limit
          for (const p of items as any[]) {
            (window as any).__bulletSpawns.push({
              owner: p.owner,
              vx: p.velocity.x,
              vy: p.velocity.y,
            });
          }
          return original(...items);
        };
        current = next;
      },
    });
    state.projectiles = state.projectiles; // arm the trap on the live array
  });

export const bulletSpawns = (page: Page) =>
  page.evaluate(() => (window as any).__bulletSpawns ?? []);

export const bullets = (page: Page) =>
  page.evaluate(() => (window as any).__spawnedBullets ?? 0);

/**
 * Fires a weapon through the input API in a single synchronous task, i.e. the
 * press is latched and released before the simulation can step again. This is
 * immune to slow frames that would make a CDP tap look like a held key — the
 * game fires again while a key stays down and its cooldown elapses.
 */
export const tapAction = (page: Page, action: string) =>
  page.evaluate((act) => {
    const api = (window as any).__pirateBattle;
    api.input.setAction(act, true);
    api.input.setAction(act, false);
  }, action);

// -------------------------------------------------------------- spawns
/**
 * Records `spawnTimerMs` at the exact moment an enemy is pushed, so the reset
 * cadence can be asserted without racing a slow frame. Like projectiles, the
 * enemies array is replaced every tick, so the property is trapped too.
 */
export const watchEnemySpawns = (page: Page) =>
  page.evaluate(() => {
    (window as any).__timerAtSpawn = undefined;
    (window as any).__spawnPositions = [];
    const state = (window as any).__pirateBattle.simulation.getState();
    let current: unknown[] = [];
    Object.defineProperty(state, 'enemies', {
      configurable: true,
      get: () => current,
      set: (next: unknown[]) => {
        const original = next.push.bind(next);
        next.push = (...items: unknown[]) => {
          (window as any).__timerAtSpawn = state.spawnTimerMs;
          for (const e of items as any[]) {
            (window as any).__spawnPositions.push({ x: e.position.x, y: e.position.y });
          }
          return original(...items);
        };
        current = next;
      },
    });
    state.enemies = state.enemies; // arm the trap on the live array
  });

// -------------------------------------------------------------- enemies
/** Push a fully-formed enemy and freeze further spawns (deterministic). */
export const spawnEnemy = (
  page: Page,
  kind: 'chaser' | 'shooter',
  x: number,
  y: number,
  health = 40,
  attackTimerMs = 0
) =>
  setState(
    page,
    `
      state.enemies.length = 0;
      state.enemies.push({
        id: 0,
        kind: '${kind}',
        alive: true,
        position: { x: ${x}, y: ${y} },
        velocity: { x: 0, y: 0 },
        heading: Math.atan2(state.player.position.y - ${y}, state.player.position.x - ${x}),
        health: ${health},
        maxHealth: ${health},
        radius: 27,
        invulnerableMs: 0,
        cooldowns: { front: 0, left: 0, right: 0 },
        attackTimerMs: ${attackTimerMs},
        hitFlashMs: 0,
        avoidSide: 0,
      });
      state.spawnTimerMs = 1e9;
    `
  );

export const waitSeen = (page: Page, kind: string, timeout = 5000) =>
  page.waitForFunction(
    (k) => (window as any).__seenEffects?.has(k),
    kind,
    { timeout }
  );

export const clearSeen = (page: Page) =>
  page.evaluate(() => (window as any).__seenEffects?.clear());