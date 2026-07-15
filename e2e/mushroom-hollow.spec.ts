import { test, expect } from '@playwright/test';
import { TURBO, enterFromTrail, place, type FrApi } from './helpers';

// Mushroom Hollow (level 4) journey (issue #36). The level ships the darkness
// modifier: visibility outside fairy-ring and Defender light is reduced, the
// Poacher preys on Mana flowers and slips past blockers, and a Firefly Beacon
// pushes the dark back so Defenders can strike. Completing it unlocks the
// Firefly Beacon and Mushroom Shaman. The deterministic darkness / Poacher /
// beacon rules are covered by the engine-independent domain tests
// (app/domain/light.test.ts, app/domain/battle-darkness.test.ts); this spec
// drives the browser journey through the same shell seam.

// The two rings whose Beacon glow lights the gate + mid-path chokepoints — the
// winning coverage for a dark trail (see battle-darkness.test.ts winnability).
const BEACON_RINGS = new Set(['ring-97', 'ring-55']);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });
});

test.describe('Mushroom Hollow darkness + light', () => {
  test('the level is dark and glow is observable, and a Beacon lights the trail', async ({ page }) => {
    await enterFromTrail(page, `?level=04-mushroom-hollow&god=1&turbo=${TURBO}`);

    // The darkness modifier is surfaced: the badge is shown and the seam reports it.
    await expect(page.locator('#darknessBadge')).toBeVisible();
    const dark = await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.darkness());
    expect(dark).toBe(true);

    // Every fairy ring already sheds glow; no Beacon is planted yet.
    const glowBefore = await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.glow());
    expect(glowBefore.some((s) => s.kind === 'ring')).toBe(true);
    expect(glowBefore.some((s) => s.kind === 'beacon')).toBe(false);

    // Plant a Firefly Beacon on a gate ring: it becomes a live glow source.
    await place(page, 'ring-97', 'firefly-beacon');
    const glowAfter = await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.glow());
    expect(glowAfter.some((s) => s.kind === 'beacon')).toBe(true);
  });

  test('lighting the chokepoints clears the wave and unlocks the Beacon + Shaman', async ({ page }) => {
    await enterFromTrail(page, `?level=04-mushroom-hollow&god=1&turbo=${TURBO}`);

    const ringIds = await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.ringIds());
    // Firefly Beacons on the gate + mid-path rings light the trail; Sprigs hold
    // the lit ground. (The Mushroom Shaman is unlocked by completion below.)
    for (const id of ringIds) {
      if (id.includes('onpath')) continue;
      await place(page, id, BEACON_RINGS.has(id) ? 'firefly-beacon' : 'sprig-sentinel');
    }
    await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.start());

    // Victory: the dark trail is held.
    await expect(page.locator('#outcomeTitle')).toHaveText('Victory', { timeout: 30_000 });

    // Completion records the Firefly Beacon + Mushroom Shaman as earned unlocks.
    const unlocks = await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.saveState().unlocks);
    expect(unlocks).toEqual(expect.arrayContaining(['firefly-beacon', 'mushroom-shaman']));
  });
});
