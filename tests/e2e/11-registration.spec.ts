import { test, expect } from '@playwright/test';
import {
  boot, finishMatch, setScenario, text, rows, queue, records, awaitRecorded, errorCollector,
} from './helpers';

test.describe('08.11 match registration and pending recovery', () => {
  test('one match produces exactly one record with full data', async ({ page }) => {
    const errors = errorCollector(page);
    await boot(page);
    await finishMatch(page);
    await awaitRecorded(page);
    expect(await text(page, '.registration')).toContain('Recorded in ranking and history');
    const stored = await records(page);
    expect(stored.length).toBe(1);
    const r = stored[0] as any;
    expect(typeof r.id).toBe('string');
    expect(typeof r.playerId).toBe('string');
    expect(typeof r.date).toBe('string');
    expect(typeof r.score).toBe('number');
    expect(typeof r.durationMs).toBe('number');
    expect(r.endReason).toBe('timeUp');
    expect(r.config).toBeTruthy();
    expect(await queue(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('both tabs update after a registration', async ({ page }) => {
    await boot(page);
    await finishMatch(page);
    await awaitRecorded(page);
    await page.getByRole('button', { name: 'Main menu' }).click();
    await page.waitForSelector('button:has-text("Play")');
    await page.click('#tab-history');
    await page.waitForFunction(() => document.querySelector('#panel-history')?.textContent.includes('1 recorded match'), null, { timeout: 10_000 });
    await page.click('#tab-ranking');
    await page.waitForSelector('#panel-ranking .data-table tbody tr', { timeout: 10_000 });
    expect(await rows(page, 'panel-ranking')).toBeGreaterThanOrEqual(1);
  });

  test('pending registrations survive a refresh and register on recovery', async ({ page }) => {
    const errors = errorCollector(page);
    await boot(page);
    await setScenario(page, 'network-error');
    await finishMatch(page);
    await page.waitForFunction(
      () => {
        const dd = document.querySelector('.registration');
        return !!dd && !dd.classList.contains('registration--recorded');
      },
      null,
      { timeout: 10_000 }
    );
    expect((await queue(page)).length).toBe(1);

    // a new match can start while one is still pending
    await page.getByRole('button', { name: 'Play again' }).click();
    await page.waitForFunction(() => (window as any).__pirateBattle?.simulation.getPhase() === 'running', null, { timeout: 20_000 });
    await page.waitForTimeout(200);

    // refresh: the pending registration is still there
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('button:has-text("Play")', { timeout: 30_000 });
    expect((await queue(page)).length).toBe(1);
    expect(await page.isVisible('.menu__pending')).toBe(true);

    // recovery registers every pending match, exactly once
    await setScenario(page, 'success');
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('button:has-text("Play")', { timeout: 30_000 });
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('pirate-battle.records') || '[]').length === 1, null, { timeout: 15_000 });
    // the success handler must also drain the pending queue (it may lag a
    // beat behind the records write under load, so wait rather than assert)
    await page.waitForFunction(
      () => JSON.parse(localStorage.getItem('pirate-battle.pending-registrations') || '[]').length === 0,
      null,
      { timeout: 15_000 }
    );
    expect(await queue(page)).toEqual([]);
    const stored = await records(page);
    expect(stored.length).toBe(1);
    await page.click('#tab-history');
    await page.waitForFunction(() => document.querySelector('#panel-history')?.textContent.includes('1 recorded match'), null, { timeout: 10_000 });
    expect(errors).toEqual([]);
  });

  test('a network failure never blocks the game', async ({ page }) => {
    await boot(page);
    await setScenario(page, 'network-error');
    await finishMatch(page);
    await page.waitForFunction(
      () => {
        const dd = document.querySelector('.registration');
        return !!dd && !dd.classList.contains('registration--recorded');
      },
      null,
      { timeout: 10_000 }
    );
    expect(await text(page, '.registration')).toMatch(/Registering|failed/i);
    // the result screen still offers to leave or replay
    expect(await page.isVisible('button:has-text("Play again")')).toBe(true);
    expect(await page.isVisible('button:has-text("Main menu")')).toBe(true);
  });
});