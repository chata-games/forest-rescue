import { test, expect, type Page } from '@playwright/test';
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
//
// The optional pre-battle story beat (issue #33) opens on a level's first entry
// and takes precedence over the portrait tip, so these journeys skip it, and the
// ones that need the tip re-enter the level (a confirmed restart) to see it.

async function enterBattle(page: Page, search: string): Promise<void> {
  await enterFromTrail(page, search);
  if (await page.locator('#storyPanel').isVisible()) {
    await page.click('#storySkip');
    await expect(page.locator('#storyPanel')).toBeHidden();
  }
}

/** Re-enter the current level through a confirmed restart from the Planning Pause. */
async function reenterLevel(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.start());
  await page.waitForTimeout(150);
  await page.click('#pauseBtn');
  await page.click('#restartBtn');
  await page.click('#pauseConfirmYes');
  await expect(page.locator('#battleRoot')).toBeVisible();
}

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
    await enterBattle(page, '?layout=portrait');
    // The tip shows on the entry after the story beat; dismiss it so it does not
    // cover the HUD.
    await reenterLevel(page);
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
    await enterBattle(page, '?layout=portrait');
    // The story beat took the first entry; the tip shows on the next one.
    await reenterLevel(page);
    await expect(page.locator('#portraitAdvice')).toBeVisible();
    await expect(page.locator('#portraitAdviceTitle')).toHaveText('Best played sideways');
    await expect(page.locator('#portraitAdviceKeep')).toHaveText('Play in portrait');

    // Dismiss and keep playing in portrait.
    await page.click('#portraitAdviceKeep');
    await expect(page.locator('#portraitAdvice')).toBeHidden();
    await expect(page.locator('#battleRoot')).toBeVisible();

    // Once per session: re-entering the level (via a confirmed restart) does not
    // show it again in the same page session.
    await reenterLevel(page);
    await expect(page.locator('#portraitAdvice')).toBeHidden();
  });

  test('rotation freezes the simulation and resumes only via Resume (AC3)', async ({ page }) => {
    await enterBattle(page, `?god=1&turbo=${TURBO}`);
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
    await enterBattle(page, `?god=1&turbo=${TURBO}`);
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
    await enterBattle(page, `?god=1&turbo=${TURBO}`);
    await expect(page.locator('body')).toHaveAttribute('data-layout', 'landscape');
    // The Layout button forces the Compact portrait layout on a wide desktop.
    await page.click('#layoutBtn');
    await expect(page.locator('body')).toHaveAttribute('data-layout', 'portrait');
    await page.click('#layoutBtn');
    await expect(page.locator('body')).toHaveAttribute('data-layout', 'landscape');
  });

  test('Sideways mode rotates the battle frame for a portrait browser and maps taps onto rings (RP-eqbawv)', async ({ page }) => {
    // An iPhone whose browser stays portrait (Portrait Orientation Lock on).
    await page.setViewportSize({ width: 414, height: 896 });
    await enterBattle(page, `?god=1&turbo=${TURBO}`);
    // Portrait entry (after the story beat) offers the tip; "Rotate the screen"
    // turns Sideways mode on.
    await reenterLevel(page);
    await expect(page.locator('#portraitAdvice')).toBeVisible();
    await expect(page.locator('#portraitAdviceBody')).toContainText('Portrait Orientation Lock');
    await page.click('#portraitAdviceRotate');
    await expect(page.locator('#portraitAdvice')).toBeHidden();
    await expect(page.locator('body')).toHaveAttribute('data-sideways', 'true');
    // The rotated frame is laid out landscape (the Preferred layout) yet covers
    // exactly the portrait viewport on screen.
    await expect(page.locator('body')).toHaveAttribute('data-layout', 'landscape');
    const frame = await page.locator('#battleRoot').evaluate((el) => {
      const r = el.getBoundingClientRect();
      const h = el as HTMLElement;
      return { screenW: Math.round(r.width), screenH: Math.round(r.height), layoutW: h.offsetWidth, layoutH: h.offsetHeight };
    });
    expect(frame).toEqual({ screenW: 414, screenH: 896, layoutW: 896, layoutH: 414 });

    // A real tap at the on-screen position of a ring reaches that ring: the
    // Phaser pointer mapping undoes the rotation. The first tap plants the
    // selected Defender; the second tap on the now-occupied ring inspects it.
    // The tutorial tip is dismissed first, and the ring is one whose screen point
    // is not covered by the wave-preview panel.
    if (await page.locator('#tutorialHint').isVisible()) await page.click('#tutorialSkip');
    const rings = await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.ringCenters());
    const box = await page.locator('#game-root canvas').boundingBox();
    expect(box).not.toBeNull();
    // World (1536x1024) → canvas layout: FIT keeps the aspect, and the rotated
    // canvas's screen height is its layout width. Layout → screen: the frame's top
    // edge runs along the screen's right edge.
    const scale = box!.height / 1536;
    const points = rings
      .filter((r) => !r.id.includes('onpath'))
      .map((r) => ({ id: r.id, sx: box!.x + (box!.width - r.y * scale), sy: box!.y + r.x * scale }));
    const target = await page.evaluate(
      (pts) => pts.find((p) => document.elementFromPoint(p.sx, p.sy)?.tagName === 'CANVAS') ?? null,
      points,
    );
    expect(target).not.toBeNull();
    await page.mouse.click(target!.sx, target!.sy);
    await page.waitForTimeout(100);
    await page.mouse.click(target!.sx, target!.sy);
    await expect(page.locator('#contextPanel')).toBeVisible();
    await page.click('#cpClose');

    // The Pause settings toggle turns Sideways off again; the frame returns to
    // the Compact portrait layout. (Pause opens once the wave is running.)
    await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.start());
    await page.waitForTimeout(150);
    await page.click('#pauseBtn');
    await page.click('#settingsBtn');
    await expect(page.locator('#pauseSidewaysBtn')).toHaveText('Sideways: On');
    await page.click('#pauseSidewaysBtn');
    await expect(page.locator('#pauseSidewaysBtn')).toHaveText('Sideways: Off');
    await expect(page.locator('body')).toHaveAttribute('data-sideways', 'false');
    await expect(page.locator('body')).toHaveAttribute('data-layout', 'portrait');
  });

  test('HUD controls are keyboard-operable with semantic naming (AC5)', async ({ page }) => {
    await enterBattle(page, `?god=1&turbo=${TURBO}`);
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
