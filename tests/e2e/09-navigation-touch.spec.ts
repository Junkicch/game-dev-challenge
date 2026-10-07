import { test, expect } from '@playwright/test';
import { boot, startMatch, finishMatch, text, errorCollector } from './helpers';

const isMobile = () => test.info().project.name === 'mobile';

test.describe('08.9 abandon, repeated navigation and touch controls', () => {
  test('navigation between menu and match can be repeated', async ({ page }) => {
    const errors = errorCollector(page);
    await boot(page);
    for (let i = 0; i < 2; i += 1) {
      await startMatch(page);
      expect(await page.locator('canvas').count()).toBeGreaterThan(0);
      await page.keyboard.press('KeyP');
      await page.getByRole('button', { name: 'Main menu' }).click();
      await page.waitForSelector('button:has-text("Play")', { timeout: 15_000 });
      expect(await page.locator('canvas').count()).toBe(0); // canvas released
    }
    expect(errors).toEqual([]);
  });

  test('leaving the match unmounts the game (no test hook, no canvas)', async ({ page }) => {
    await boot(page);
    await startMatch(page);
    await page.keyboard.press('KeyP');
    await page.getByRole('button', { name: 'Main menu' }).click();
    await page.waitForSelector('button:has-text("Play")');
    const hook = await page.evaluate(() => (window as any).__pirateBattle ?? null);
    expect(hook).toBeNull();
  });

  test('finishing a match and returning to the menu shows the menu card', async ({ page }) => {
    await boot(page);
    await finishMatch(page);
    await page.getByRole('button', { name: 'Main menu' }).click();
    await page.waitForSelector('button:has-text("Play")');
    expect(await text(page, '.menu__panel')).toContain('Last match');
  });

  test('desktop hides the touch pads, mobile shows the six pads', async ({ page }) => {
    await boot(page);
    await startMatch(page);
    if (isMobile()) {
      const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
      expect(coarse).toBe(true);
      expect(await page.isVisible('.touch-controls')).toBe(true);
      expect(await page.locator('.touch-pad').count()).toBe(6);
      const clusters = await page.evaluate(() => ({
        left: [...document.querySelectorAll('.touch-controls__cluster--left .touch-pad')].map((b) => b.getAttribute('aria-label')),
        right: [...document.querySelectorAll('.touch-controls__cluster--right .touch-pad')].map((b) => b.getAttribute('aria-label')),
      }));
      expect(clusters.left).toEqual(['Turn left', 'Move forward', 'Turn right']);
      expect(clusters.right).toEqual(['Fire broadside left', 'Fire forward', 'Fire broadside right']);
    } else {
      // The pads are rendered but hidden via `@media (pointer: coarse)`.
      expect(await page.evaluate(() => getComputedStyle(document.querySelector('.touch-controls')!).display)).toBe('none');
      expect(await page.isVisible('.touch-controls')).toBe(false);
    }
  });

  test('mobile multi-touch drives input and releases per finger', async ({ page }) => {
    test.skip(!isMobile(), 'touch pads only render on coarse pointers');
    await boot(page);
    await startMatch(page);
    const pointer = (selector: string, type: string, pointerId: number) =>
      page.evaluate(
        ({ selector, type, pointerId }) => {
          const el = document.querySelector(selector) as HTMLElement;
          const rect = el.getBoundingClientRect();
          el.dispatchEvent(
            new PointerEvent(type, {
              pointerId,
              pointerType: 'touch',
              isPrimary: pointerId === 1,
              bubbles: true,
              cancelable: true,
              clientX: rect.left + rect.width / 2,
              clientY: rect.top + rect.height / 2,
            })
          );
        },
        { selector, type, pointerId }
      );
    const held = () =>
      page.evaluate(() => ({
        forward: (window as any).__pirateBattle.input.isDown('forward'),
        fireFront: (window as any).__pirateBattle.input.isDown('fireFront'),
      }));

    const forward = '.touch-controls__cluster--left .touch-pad:nth-child(2)';
    const fire = '.touch-controls__cluster--right .touch-pad:nth-child(2)';

    await pointer(forward, 'pointerdown', 1);
    expect((await held()).forward).toBe(true);
    await pointer(fire, 'pointerdown', 2);
    let h = await held();
    expect(h.forward && h.fireFront).toBe(true); // two fingers at once
    await pointer(forward, 'pointerup', 1);
    h = await held();
    expect(h.forward).toBe(false);
    expect(h.fireFront).toBe(true); // releasing one finger keeps the other
    await pointer(fire, 'pointerup', 2);
    h = await held();
    expect(h.fireFront).toBe(false);
  });

  test('portrait shows the rotate hint', async ({ page }) => {
    test.skip(!isMobile(), 'rotate hint only applies to coarse-pointer portrait');
    await boot(page);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.isVisible('.rotate-hint')).toBe(true);
    await page.setViewportSize({ width: 844, height: 390 });
    expect(await page.isVisible('.rotate-hint')).toBe(false);
  });
});