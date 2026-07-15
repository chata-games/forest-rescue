import { test, expect } from '@playwright/test';
import { TURBO, enterFromTrail, type FrApi } from './helpers';

// Responsive + accessible battle shell (issue #24). The complete command surface
// stays readable and operable across the Preferred landscape layout, the Compact
// portrait layout, after rotation, after backgrounding, and on desktop.
//
// Driven through the real DOM (the `data-layout` attribute the shell reflects, the
// semantic controls, and the coordinate-stable debug seam) — no Phaser internals
// are asserted (AC6). Desktop Chromium cannot truly rotate or background a tab, so
// those browser events are dispatched directly to exercise the same handlers a
// device fires.

test.describe('Responsive and accessible battle shell (issue #24)', () => {
  test('square-or-wider viewports use the Preferred layout; taller ones reflow (AC1)', async ({ page }) => {
    await page.goto('/');
    // Landscape (default desktop): the Preferred battle layout.
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.locator('body')).toHaveAttribute('data-layout', 'landscape');
    // A taller viewport reflows to the Compact portrait layout (aspect-driven, not
    // device-orientation-driven, so a desktop window behaves like a phone).
    await page.setViewportSize({ width: 414, height: 896 });
    await expect(page.locator('body')).toHaveAttribute('data-layout', 'portrait');
    // Square counts as square-or-wider → Preferred.
    await page.setViewportSize({ width: 800, height: 800 });
    await expect(page.locator('body')).toHaveAttribute('data-layout', 'landscape');
  });

  test('portrait keeps every HUD control at the full-size 48px target (AC1/AC5)', async ({ page }) => {
    await enterFromTrail(page, '?layout=portrait');
    // Dismiss the portrait recommendation so it does not cover the HUD.
    await page.click('#portraitAdviceKeep');

    const sizes = await page.locator('#battleRoot .hud button').evaluateAll((els) =>
      els.map((e) => ({ w: (e as HTMLElement).offsetWidth, h: (e as HTMLElement).offsetHeight })),
    );
    expect(sizes.length).toBeGreaterThan(0);
    for (const s of sizes) {
      expect(Math.min(s.w, s.h)).toBeGreaterThanOrEqual(48);
    }
  });

  test('entering in portrait offers a once-per-session sideways tip with a Play-in-portrait action (AC2)', async ({ page }) => {
    await enterFromTrail(page, '?layout=portrait');
    await expect(page.locator('#portraitAdvice')).toBeVisible();
    await expect(page.locator('#portraitAdviceTitle')).toHaveText('Best played sideways');
    await expect(page.locator('#portraitAdviceKeep')).toHaveText('Play in portrait');

    // Dismiss and keep playing in portrait.
    await page.click('#portraitAdviceKeep');
    await expect(page.locator('#portraitAdvice')).toBeHidden();
    await expect(page.locator('#battleRoot')).toBeVisible();

    // Once per session: re-entering the level (via a confirmed restart) does not
    // show it again in the same page session.
    await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.start());
    await page.waitForTimeout(150);
    await page.click('#pauseBtn');
    await page.click('#restartBtn');
    await page.click('#pauseConfirmYes');
    await expect(page.locator('#battleRoot')).toBeVisible();
    await expect(page.locator('#portraitAdvice')).toBeHidden();
  });

  test('rotation freezes the simulation and resumes only via Resume (AC3)', async ({ page }) => {
    await enterFromTrail(page, `?god=1&turbo=${TURBO}`);
    await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.start());
    await page.waitForTimeout(200);
    // A device rotation pauses a running battle (the Phaser scene cancels in-flight
    // gestures on the same event — not asserted here per AC6).
    await page.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
    await expect(page.locator('#pauseOverlay')).toBeVisible();
    // The simulation is frozen: Mana does not change while the rotation-pause holds.
    const mana = Number(await page.locator('#manaValue').textContent());
    await page.waitForTimeout(300);
    expect(Number(await page.locator('#manaValue').textContent())).toBe(mana);
    // Rotation never auto-resumes — only an explicit Resume does.
    await page.click('#resumeBtn');
    await expect(page.locator('#pauseOverlay')).toBeHidden();
  });

  test('backgrounding auto-pauses and never auto-resumes (AC4)', async ({ page }) => {
    await enterFromTrail(page, `?god=1&turbo=${TURBO}`);
    await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.start());
    await page.waitForTimeout(200);
    // Hide the tab: the battle auto-pauses.
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.locator('#pauseOverlay')).toBeVisible();
    // Returning to the tab does NOT auto-resume — combat waits for explicit Resume.
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.locator('#pauseOverlay')).toBeVisible();
    await page.click('#resumeBtn');
    await expect(page.locator('#pauseOverlay')).toBeHidden();
  });

  test('desktop keeps the Preferred layout and the Layout toggle reflows it (desktop/AC1)', async ({ page }) => {
    await enterFromTrail(page, `?god=1&turbo=${TURBO}`);
    await expect(page.locator('body')).toHaveAttribute('data-layout', 'landscape');
    // The Layout button forces the Compact portrait layout on a wide desktop.
    await page.click('#layoutBtn');
    await expect(page.locator('body')).toHaveAttribute('data-layout', 'portrait');
    await page.click('#layoutBtn');
    await expect(page.locator('body')).toHaveAttribute('data-layout', 'landscape');
  });

  test('HUD controls are keyboard-operable with semantic naming (AC5)', async ({ page }) => {
    await enterFromTrail(page, `?god=1&turbo=${TURBO}`);
    await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.start());
    await page.waitForTimeout(150);
    // The pause control is focusable and reachable by keyboard.
    await page.locator('#pauseBtn').focus();
    await expect(page.locator('#pauseBtn')).toBeFocused();
    // 'p' is keyboard parity for Pause and opens the Planning Pause menu.
    await page.keyboard.press('p');
    await expect(page.locator('#pauseOverlay')).toBeVisible();
    // Resume is the focused primary action on open.
    await expect(page.locator('#resumeBtn')).toBeFocused();
    await page.click('#resumeBtn');
    await expect(page.locator('#pauseOverlay')).toBeHidden();

    // Icon / symbolic controls carry accessible names (non-color redundancy).
    const labels = await page.locator('#battleRoot .hud button').evaluateAll((els) =>
      els.map((e) => ({
        name: (e as HTMLElement).getAttribute('aria-label') ?? '',
        text: (e as HTMLElement).textContent ?? '',
      })),
    );
    for (const l of labels) {
      expect((l.name + l.text).trim().length).toBeGreaterThan(0);
    }
  });
});
