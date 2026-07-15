import { test, expect } from '@playwright/test';
import { fr, type FrApi } from './helpers';

// Loadout rules and the complete map-to-Loadout-to-battle journey (issue #21).
// Drives the real DOM Loadout step and asserts the observable state through both
// the rendered controls and the window.fr debug seam. Mirrors the tracer-bullet
// / Trail specs; the engine-independent rules themselves are covered by the
// vitest suite (app/domain/loadout.test.ts).

test.describe('Loadout assembly (issue #21)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.clear();
      } catch {
        /* ignore */
      }
    });
  });

  test('the Trail detail Enter opens the Loadout step with a valid starter (AC3/AC6)', async ({ page }) => {
    await page.goto('/');
    await page.locator('.trail-node[data-level="01-meadows-edge"]').click();
    await page.locator('#detailEnter').click();

    // Enter leads into the Loadout step, not the battlefield.
    await expect(page.locator('#loadoutScreen')).toBeVisible();
    await expect(page.locator('#battleRoot')).toBeHidden();

    // The starter Loadout is pre-filled and ready to start.
    await fr(page);
    const slots = await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.loadoutSlots());
    expect(slots.some((s) => s !== null)).toBe(true);
    await expect(page.locator('#loadoutStart')).toBeEnabled();
  });

  test('capacity is one slot at level 1, two at level 2, four at level 5 (AC2)', async ({ page }) => {
    for (const [level, capacity] of [
      ['01-meadows-edge', 1],
      ['02-old-stump-crossroads', 2],
      ['05-sawmill-clearing', 4],
    ] as const) {
      await page.goto(`/?level=${level}`);
      await fr(page);
      const got = await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.loadoutCapacity());
      expect(got).toBe(capacity);
    }
  });

  test('Start is disabled while every slot is empty and enabled once one is filled (AC4)', async ({ page }) => {
    await page.goto('/?level=01-meadows-edge');
    await fr(page);

    // Clear the pre-filled starter slot: Start must disable.
    await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.loadoutClear(0));
    await expect(page.locator('#loadoutStart')).toBeDisabled();
    expect(await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.loadoutCanStart())).toBe(false);

    // Refill it: Start becomes available again.
    await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.loadoutFill('sprig-sentinel'));
    await expect(page.locator('#loadoutStart')).toBeEnabled();
    expect(await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.loadoutCanStart())).toBe(true);
  });

  test('a slot accepts either a Defender or a Guardian spell (AC1)', async ({ page }) => {
    // Level 5 unlocks Root Snare; capacity 4 holds Defenders and the spell.
    await page.goto('/?level=05-sawmill-clearing');
    await fr(page);

    const pool = await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.loadoutPool());
    const ids = pool.map((p) => p.id);
    expect(ids).toContain('sprig-sentinel'); // a Defender
    expect(ids).toContain('root-snare'); // a Guardian spell
    expect(pool.map((p) => p.kind)).toEqual(expect.arrayContaining(['defender', 'spell']));

    // Loading the spell places it in a slot.
    await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.loadoutFill('root-snare'));
    const slots = await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.loadoutSlots());
    expect(slots.some((s) => s?.id === 'root-snare' && s.kind === 'spell')).toBe(true);
  });

  test('completion rewards are available for the next Loadout (AC3)', async ({ page }) => {
    // Reaching level 5 means everything unlocked through level 5 is in the pool,
    // including Root Snare (level 5's own reward).
    await page.goto('/?level=05-sawmill-clearing');
    await fr(page);
    const pool = await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.loadoutPool());
    expect(pool.map((p) => p.id)).toContain('root-snare');
  });

  test('advice is explanatory and never blocks Start (AC5)', async ({ page }) => {
    await page.goto('/?level=01-meadows-edge');
    await fr(page);

    // A recommendation is shown for the starter; it does not disable Start.
    const advice = await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.loadoutAdvice());
    expect(advice.recommendation).not.toBeNull();
    await expect(page.locator('#loadoutStart')).toBeEnabled();
    await expect(page.locator('#loadoutAdvice')).toBeVisible();
  });

  test('Start Battle mounts the battlefield with the chosen Loadout (AC6)', async ({ page }) => {
    await page.goto('/?level=01-meadows-edge');
    await fr(page);
    await page.locator('#loadoutStart').click();

    await expect(page.locator('#loadoutScreen')).toBeHidden();
    await expect(page.locator('#battleRoot')).toBeVisible();
    await expect(page.locator('#game-root canvas')).toBeVisible();

    // The loaded Defender is the placement tool brought into battle.
    await expect(page.locator('.tool[data-defender="sprig-sentinel"]')).toBeVisible();
  });

  test('Back returns from the Loadout step to the Trail (AC6)', async ({ page }) => {
    await page.goto('/?level=01-meadows-edge');
    await fr(page);
    await expect(page.locator('#loadoutScreen')).toBeVisible();

    await page.locator('#loadoutBack').click();
    await expect(page.locator('#trailScreen')).toBeVisible();
    await expect(page.locator('#loadoutScreen')).toBeHidden();
  });
});
