import { test, expect } from '@playwright/test';
import {
  boot, setScenario, setSeed, setLatency,
  text, rows, goToPage,
  errorCollector,
} from './helpers';

test.describe('08.10 ranking/history querying, pagination, loading, empty and error', () => {
  test('ranking renders fixtures, is paginated and pages back cleanly', async ({ page }) => {
    await boot(page);
    await page.waitForSelector('#panel-ranking .data-table tbody tr', { timeout: 15_000 });
    expect(await rows(page, 'panel-ranking')).toBe(5);
    expect(await text(page, '#panel-ranking')).toContain('Page 1 of 3');
    const firstRow = await text(page, '#panel-ranking .data-table tbody tr:first-child');
    await goToPage(page, 'panel-ranking', 2);
    expect(await text(page, '#panel-ranking .data-table tbody tr:first-child')).not.toBe(firstRow);
    await goToPage(page, 'panel-ranking', 1);
    expect(await text(page, '#panel-ranking .data-table tbody tr:first-child')).toBe(firstRow);
  });

  test('loading state appears while the endpoint answers slowly', async ({ page }) => {
    const errors = errorCollector(page);
    await boot(page);
    await setScenario(page, 'slow');
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('button:has-text("Play")', { timeout: 30_000 });
    expect(await text(page, '#panel-ranking')).toContain('Loading ranking');
    await page.waitForSelector('#panel-ranking .data-table tbody tr', { timeout: 15_000 });
    expect(errors).toEqual([]);
  });

  test('empty scenario shows the empty states', async ({ page }) => {
    await boot(page);
    await setScenario(page, 'empty');
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('button:has-text("Play")', { timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector('#panel-ranking')?.textContent.includes('No rankings to show yet.'), null, { timeout: 10_000 });
    expect(await text(page, '#panel-ranking')).toContain('No rankings to show yet.');
    expect(await text(page, '#panel-history')).toContain('No matches recorded yet.');
  });

  test('multi-page provides five ranking pages and three history pages', async ({ page }) => {
    await boot(page);
    await setScenario(page, 'multi-page');
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('button:has-text("Play")', { timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector('#panel-ranking')?.textContent.includes('Page 1 of'), null, { timeout: 10_000 });
    expect(await text(page, '#panel-ranking')).toContain('Page 1 of 5');
    expect(await text(page, '#panel-history')).toContain('Page 1 of 3');
  });

  test('history keeps every match regardless of the configuration', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => localStorage.setItem('pirate-battle.options', JSON.stringify({ sessionTimeSeconds: 90, spawnIntervalMs: 3000 })));
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('button:has-text("Play")', { timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector('#panel-history')?.textContent.includes('recorded match'), null, { timeout: 10_000 });
    expect(await text(page, '#panel-history')).toContain('recorded match');
  });

  test('a timeout surfaces an error, retry keeps it and recovery clears it', async ({ page }) => {
    const errors = errorCollector(page);
    await boot(page);
    await setScenario(page, 'timeout');
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('button:has-text("Play")', { timeout: 30_000 });
    // the timeout scenario outlives the client budget, so the panel reports an error
    await page.waitForSelector('#panel-ranking .tabs__state--error', { timeout: 25_000 });
    expect(await text(page, '#panel-ranking')).toMatch(/timeout|request/i);
    // retry against a fast-failing endpoint keeps the error visible
    await setScenario(page, 'server-error');
    await page.click('#panel-ranking button:has-text("Retry")');
    await page.waitForSelector('#panel-ranking .tabs__state--error', { timeout: 15_000 });
    // recovery shows the data afterwards. Depending on the query's own
    // refetch policy the panel may already be back with rows; if not, the
    // Retry button is still there to press.
    await setScenario(page, 'success');
    const retry = page.locator('#panel-ranking button:has-text("Retry")');
    if (await retry.count()) await retry.click();
    await page.waitForSelector('#panel-ranking .data-table tbody tr', { timeout: 15_000 });
    expect(errors).toEqual([]);
  });

  test('a failing refresh keeps the loaded rows on screen', async ({ page }) => {
    await boot(page);
    await page.waitForSelector('#panel-ranking .data-table tbody tr', { timeout: 15_000 });
    const before = await text(page, '#panel-ranking .data-table tbody tr:first-child');
    await setScenario(page, 'server-error');
    await page.waitForFunction(() => document.querySelector('#panel-ranking .tabs__banner')?.textContent.includes('Could not refresh'), null, { timeout: 15_000 });
    expect(await rows(page, 'panel-ranking')).toBe(5);
    expect(await text(page, '#panel-ranking .data-table tbody tr:first-child')).toBe(before);
    await setScenario(page, 'success');
  });

  test('variable-latency scenario, seed and latency knobs are respected', async ({ page }) => {
    await boot(page);
    await setScenario(page, 'variable-latency');
    await setSeed(page, 42);
    await setLatency(page, 0);
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('button:has-text("Play")', { timeout: 30_000 });
    const state = await page.evaluate(() => ({
      scenario: (window as any).__pirateBattleNet.getScenario(),
      seed: (window as any).__pirateBattleNet.getSeed(),
      latency: (window as any).__pirateBattleNet.getLatencyOverride(),
    }));
    expect(state.scenario).toBe('variable-latency');
    expect(state.seed).toBe(42);
    expect(state.latency).toBe(0);
    await page.waitForSelector('#panel-ranking .data-table tbody tr', { timeout: 5000 });
  });
});