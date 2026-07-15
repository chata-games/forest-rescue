import { test, expect } from '@playwright/test';
import { TURBO, enterFromTrail, place, type FrApi } from './helpers';

// Completion, scoring, unlock, and replay journey for Meadow's Edge (issue #29).
// Enters from the Trail, wins, and exercises the result flow at the
// campaign/application boundary: the combined star result is shown, Return to
// Trail lands on a Trail where the next level is freshly unlocked, and Play
// Again re-enters the same level. Mirrors the tracer-bullet victory path; the
// best-result-preservation rule is covered by the engine-independent
// domain tests (app/domain/scoring.test.ts).

test.beforeEach(async ({ page }) => {
  // A fresh first launch: no saved progress, so only Meadow's Edge is current.
  await page.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });
});

test.describe("Meadow's Edge completion, scoring, and unlock", () => {
  test('a victory shows the star result, unlocks the next level, and replays in place', async ({ page }) => {
    await enterFromTrail(page, `?god=1&turbo=${TURBO}`);

    // Full fairy-ring coverage defends the Heartwood (same loadout as the
    // tracer bullet): every beside-path ring + the on-path chokepoint.
    const ringIds = await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.ringIds());
    for (const id of ringIds) {
      await place(page, id, id.includes('onpath') ? 'thornvine-bramble' : 'sprig-sentinel');
    }
    await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.start());

    // Victory: the combined star result is rendered in the outcome overlay.
    await expect(page.locator('#outcomeTitle')).toHaveText('Victory', { timeout: 30_000 });
    await expect(page.locator('#outcomeStars')).toContainText('★');

    // Return to Trail: the next level is now unlocked (current), and the
    // cleared level is enterable for replay.
    await page.click('#returnToTrailBtn');
    await expect(page.locator('#trailScreen')).toBeVisible();
    await expect(page.locator('.trail-node[data-level="01-meadows-edge"]')).toHaveAttribute(
      'data-status',
      'cleared',
    );
    await expect(page.locator('.trail-node[data-level="02-old-stump-crossroads"]')).toHaveAttribute(
      'data-status',
      'current',
    );

    // Re-enter the cleared level and Play Again rebuilds it in place.
    await page.locator('.trail-node[data-level="01-meadows-edge"]').click();
    await expect(page.locator('#detailEnter')).toBeEnabled();
    await page.locator('#detailEnter').click();
    await expect(page.locator('#battleRoot')).toBeVisible();
  });
});
