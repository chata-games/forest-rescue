import { test, expect } from '@playwright/test';
import { TURBO, enterFromTrail, place, type FrApi } from './helpers';

// Planning Pause (issue #32): the Guardian pauses a running battle to inspect
// waves and reconfigure Defenders. The pause menu offers Resume/Settings/
// confirmed Restart/confirmed Exit (AC5); spells and Mana flowers are locked
// while paused (AC4); the wave preview shows the current + upcoming wave (AC1).
//
// Driven through the real DOM controls and the coordinate-stable debug seam; the
// domain + HUD projectors own all the safety logic (vitest-gated).

test.describe('Preview waves and plan while paused (issue #32)', () => {
  test('shows the wave preview while planning, before Start (AC1)', async ({ page }) => {
    await enterFromTrail(page, `?god=1&turbo=${TURBO}`);
    // Before Start, the corner wave-preview panel is visible with wave 1.
    await expect(page.locator('#wavePreview')).toBeVisible();
    await expect(page.locator('#wavePreviewBody')).toContainText(/Wave 1/);
    await expect(page.locator('#wavePreviewBody')).toContainText(/Logger/);
  });

  test('pause opens the menu, freezes the battle, and offers Resume (AC2/AC5)', async ({ page }) => {
    await enterFromTrail(page, `?god=1&turbo=${TURBO}`);
    await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.start());
    // Let the wave run a moment, then pause through the real control.
    await page.waitForTimeout(200);
    await page.click('#pauseBtn');

    await expect(page.locator('#pauseOverlay')).toBeVisible();
    await expect(page.locator('#resumeBtn')).toBeVisible();
    // The wave preview is mirrored inside the pause overlay.
    await expect(page.locator('#pauseWavePreview')).toContainText(/Wave/);

    // Capture Mana while paused, then resume and confirm the freeze held.
    const manaWhilePaused = await Number(await page.locator('#manaValue').textContent());
    await page.waitForTimeout(300);
    expect(await Number(await page.locator('#manaValue').textContent())).toBe(manaWhilePaused);

    await page.click('#resumeBtn');
    await expect(page.locator('#pauseOverlay')).toBeHidden();
  });

  test('spells and Mana flowers stay locked while paused (AC4)', async ({ page }) => {
    await enterFromTrail(page, `?god=1&turbo=${TURBO}&level=05-sawmill-clearing`);
    await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.start());
    await page.waitForTimeout(200);
    await page.click('#pauseBtn');

    // Every spell toolbar button is disabled while paused, and reports Paused.
    const spellButtons = page.locator('.spell');
    const count = await spellButtons.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(spellButtons.nth(i)).toBeDisabled();
    }
    await expect(page.locator('.spell__state').first()).toHaveText('Paused');

    await page.click('#resumeBtn');
    // After resume, spells are selectable again (Root Snare is unlocked by level 5).
    await expect(spellButtons.first()).toBeEnabled();
  });

  test('Restart and Exit each require confirmation (AC5)', async ({ page }) => {
    await enterFromTrail(page, `?god=1&turbo=${TURBO}`);
    await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.start());
    await page.waitForTimeout(200);
    await page.click('#pauseBtn');

    // Restart arms a confirmation, not an immediate restart.
    await page.click('#restartBtn');
    await expect(page.locator('#pauseConfirm')).toBeVisible();
    await page.click('#pauseConfirmNo');
    await expect(page.locator('#pauseConfirm')).toBeHidden();
    // Still in the paused battle after cancelling.
    await expect(page.locator('#pauseOverlay')).toBeVisible();

    // Exit confirmed returns to the campaign Trail.
    await page.click('#exitBtn');
    await page.click('#pauseConfirmYes');
    await expect(page.locator('#trailScreen')).toBeVisible();
  });

  test('Defender placement and inspection stay available while paused (AC3)', async ({ page }) => {
    await enterFromTrail(page, `?god=1&turbo=${TURBO}`);
    const ringIds = await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.ringIds());
    const ring = ringIds.find((id) => !id.includes('onpath'))!;
    await place(page, ring, 'sprig-sentinel');
    await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.start());
    await page.waitForTimeout(200);
    await page.click('#pauseBtn');

    // Inspecting while paused opens the modeless panel (management is unaffected).
    await page.evaluate((r) => (window as unknown as { fr: FrApi }).fr.inspectRing(r), ring);
    await expect(page.locator('#contextPanel')).toBeVisible();
    await expect(page.locator('#cpTitle')).toHaveText('Sprig Sentinel');
  });
});
