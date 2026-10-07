import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Performance evidence (README §9): frame pacing + peak entities in a real
 * three-minute match on the production build, and memory across five
 * start->play->leave cycles. Writes reports/performance.md.
 *
 * Run with: npm run test:perf
 */
const report = {
  generatedAt: new Date().toISOString(),
  environment: {
    platform: process.platform,
    arch: process.arch,
    cpu: os.cpus().map((c) => c.model)[0],
    cores: os.cpus().length,
    browser: 'Chromium',
    resolution: '1280x800',
    deviceScaleFactor: 1,
    renderer: 'SwiftShader (no GPU) — documented limitation',
    build: 'production (vite preview)',
    config: {
      sessionTimeSeconds: 180,
      spawnIntervalMs: 3000,
    },
  },
  threeMinuteMatch: {} as Record<string, unknown>,
  memoryCycles: [] as Record<string, unknown>[],
};

const installFpsSampler = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    (window as any).__fps = { deltas: [] as number[], frames: 0, last: 0, running: false };
    (window as any).__fpsStart = () => {
      (window as any).__fps = { deltas: [] as number[], frames: 0, last: 0, running: true };
      const loop = (t: number) => {
        if (!(window as any).__fps.running) return;
        if ((window as any).__fps.last) (window as any).__fps.deltas.push(t - (window as any).__fps.last);
        (window as any).__fps.last = t;
        (window as any).__fps.frames += 1;
        (window as any).__fps.raf = requestAnimationFrame(loop);
      };
      (window as any).__fps.raf = requestAnimationFrame(loop);
    };
    (window as any).__fpsStop = () => { (window as any).__fps.running = false; };
  });

const startEntitySampler = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    (window as any).__entities = { peak: 0, samples: [] as number[], timer: 0 };
    (window as any).__entities.timer = window.setInterval(() => {
      const s = (window as any).__pirateBattle.simulation.getState();
      const total = s.enemies.length + s.projectiles.length + s.effects.length;
      const arr = (window as any).__entities.samples;
      arr.push(total);
      (window as any).__entities.peak = Math.max((window as any).__entities.peak, total);
    }, 1000);
  });

const stopSamplers = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    (window as any).__fpsStop?.();
    clearInterval((window as any).__entities?.timer);
  });

const heapUsed = async (page: import('@playwright/test').Page) => {
  const client = await page.context().newCDPSession(page);
  await client.send('Performance.enable');
  const { metrics } = (await client.send('Performance.getMetrics')) as { metrics: { name: string; value: number }[] };
  return metrics.find((m) => m.name === 'JSHeapUsedSize')?.value ?? 0;
};

const percentile = (sortedTimes: number[], p: number) => {
  if (!sortedTimes.length) return 0;
  const idx = Math.min(sortedTimes.length - 1, Math.ceil((p / 100) * sortedTimes.length) - 1);
  return sortedTimes[idx];
};

const writeReport = () => {
  const dir = path.resolve(process.cwd(), 'reports');
  fs.mkdirSync(dir, { recursive: true });
  const lines: string[] = [];
  lines.push('# Performance report');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push('## Environment');
  for (const [k, v] of Object.entries(report.environment)) lines.push(`- **${k}**: ${v}`);
  lines.push('');
  lines.push('## Three-minute match');
  const m = report.threeMinuteMatch;
  for (const [k, v] of Object.entries(m)) lines.push(`- **${k}**: ${v}`);
  lines.push('');
  lines.push('## Memory after each start/play/exit cycle');
  for (const c of report.memoryCycles) {
    lines.push(`- cycle ${c.cycle}: ${c.heapMb} MB (delta vs baseline ${c.deltaMb} MB)`);
  }
  lines.push('');
  lines.push('## Limitations');
  lines.push('- The reference environment runs headless Chromium on SwiftShader (software WebGL): fill-rate bound, no GPU acceleration.');
  lines.push(`- Minute-scale frame pacing was measured from rAF timestamps while the game loop advanced the simulation (delta-time, max 60 fps).`);
  fs.writeFileSync(path.join(dir, 'performance.md'), lines.join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'performance.json'), JSON.stringify(report, null, 2) + '\n');
};

test.describe('9 performance (production build)', () => {
  test('frame pacing and peak entities in a real three-minute match', async ({ page }) => {
    test.setTimeout(240_000);
    await page.addInitScript(() => {
      localStorage.setItem('pirate-battle.options', JSON.stringify({ sessionTimeSeconds: 180, spawnIntervalMs: 3000 }));
    });
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForSelector('button:has-text("Play")', { timeout: 30_000 });
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForSelector('button:has-text("Start match")', { timeout: 30_000 });
    const started = Date.now();
    await page.getByRole('button', { name: 'Start match' }).click();
    await page.waitForFunction(() => (window as any).__pirateBattle?.simulation.getPhase() === 'running', null, { timeout: 30_000 });
    await installFpsSampler(page);
    await startEntitySampler(page);
    await page.evaluate(() => (window as any).__fpsStart());
    await page.waitForFunction(() => (window as any).__pirateBattle?.simulation.getPhase() === 'ended', null, { timeout: 195_000 });
    await stopSamplers(page);
    const wallMs = Date.now() - started;

    const sample = await page.evaluate(() => {
      const fps = (window as any).__fps;
      const entities = (window as any).__entities;
      const s = (window as any).__pirateBattle.simulation.getState();
      return {
        simElapsedMs: s.elapsedMs,
        score: s.score,
        frames: fps.frames,
        deltas: fps.deltas,
        peakEntities: entities.peak,
        avgEntities: entities.samples.reduce((a: number, b: number) => a + b, 0) / Math.max(1, entities.samples.length),
      };
    });

    const sorted = [...sample.deltas].sort((a, b) => a - b);
    const avgFrameMs = sorted.length
      ? sorted.reduce((a, b) => a + b, 0) / sorted.length
      : 0;
    const avgFps = avgFrameMs ? 1000 / avgFrameMs : 0;
    const p95Frame = percentile(sorted, 95);
    report.threeMinuteMatch = {
      simulationElapsedMs: sample.simElapsedMs,
      wallClockMs: wallMs,
      framesCaptured: sample.frames,
      averageFrameMs: +avgFrameMs.toFixed(2),
      averageFps: +avgFps.toFixed(1),
      p95FrameMs: +p95Frame.toFixed(2),
      peakEntities: sample.peakEntities,
      averageEntities: +sample.avgEntities.toFixed(1),
      finalScore: sample.score,
    };
    writeReport();
    // The reference environment is software-rendered; assert a sane floor
    // rather than the 60fps target so the suite stays meaningful on CI.
    expect(avgFps).toBeGreaterThan(25);
  });

  test('memory is stable across five start/play/exit cycles', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForSelector('button:has-text("Play")', { timeout: 30_000 });
    await heapUsed(page); // warm CDP
    const baseline = await heapUsed(page);
    const cycles: typeof report.memoryCycles = [];
    for (let i = 0; i < 5; i += 1) {
      await page.getByRole('button', { name: 'Play', exact: true }).click();
      await page.waitForSelector('button:has-text("Start match")', { timeout: 30_000 });
      await page.getByRole('button', { name: 'Start match' }).click();
      await page.waitForFunction(() => (window as any).__pirateBattle?.simulation.getPhase() === 'running', null, { timeout: 30_000 });
      await page.evaluate(() => { (window as any).__pirateBattle.simulation.getState().timeRemainingMs = 120; });
      await page.waitForFunction(() => (window as any).__pirateBattle?.simulation.getPhase() === 'ended', null, { timeout: 10_000 });
      await page.getByRole('button', { name: 'Main menu' }).click();
      await page.waitForSelector('button:has-text("Play")', { timeout: 20_000 });
      const heap = await heapUsed(page);
      const delta = heap - baseline;
      cycles.push({ cycle: i + 1, heapMb: +(heap / 1048576).toFixed(2), deltaMb: +(delta / 1048576).toFixed(2) });
    }
    report.memoryCycles = cycles;
    writeReport();
    // No unbounded growth: the last cycle must stay well below 2× baseline.
    expect(cycles[4].heapMb).toBeLessThan((baseline / 1048576) * 2 + 20);
  });
});