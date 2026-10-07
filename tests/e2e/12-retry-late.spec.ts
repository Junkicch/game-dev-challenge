import { test, expect } from '@playwright/test';
import {
  boot, finishMatch, setScenario, text, rows, records, queue,
  waitPage, goToPage, awaitRecorded, errorCollector,
} from './helpers';
import { sleep } from './helpers';

test.describe('08.12 retries without duplication and late answers', () => {
  test('a slow registration is confirmed without duplicating the record', async ({ page }) => {
    const errors = errorCollector(page);
    await boot(page);
    await setScenario(page, 'register-timeout');
    await finishMatch(page);
    await page.waitForSelector('.registration', { timeout: 10_000 });
    expect(await text(page, '.registration')).toContain('Registering');
    await awaitRecorded(page, 40_000); // the mock may outlast the auto-retry window
    await sleep(1500); // let any extra retry settle
    expect((await records(page)).length).toBe(1);
    expect(await queue(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('an out-of-order slow answer never overwrites the newer page', async ({ page }) => {
    await boot(page);
    await setScenario(page, 'out-of-order');
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('button:has-text("Play")', { timeout: 30_000 });
    await page.waitForSelector('#panel-ranking .data-table tbody tr', { timeout: 15_000 });
    const page1 = await text(page, '#panel-ranking .data-table tbody tr:first-child td:nth-child(1)');
    expect(page1).toBe('1');
    // page 2 is the slow odd page (1500ms); page 3 answers fast (120ms)
    await page.click('#panel-ranking .pager button:has-text("Next")');
    await page.click('#panel-ranking .pager button:has-text("Next")');
    await waitPage(page, 'panel-ranking', 3);
    // 12 records in the fixtures: page 3 is rows 11-12
    expect(await rows(page, 'panel-ranking')).toBe(2);
    // the slow page-2 answer must not replace the page we requested
    await sleep(2000);
    expect(await text(page, '#panel-ranking .data-table tbody tr:first-child td:nth-child(1)')).toBe('11');
    expect(await text(page, '#panel-ranking .pager__status')).toContain('Page 3');
    // going back to page 2 shows the requested page (now final)
    await goToPage(page, 'panel-ranking', 2);
    expect(await text(page, '#panel-ranking .data-table tbody tr:first-child td:nth-child(1)')).toBe('6');
  });
});