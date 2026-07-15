import { test, expect } from '@playwright/test';
import { TURBO, enterFromTrail, fr, place, type FrApi } from './helpers';

// Loss-retry + Guidance journeys for Meadow's Edge (issue #23). A loss must not
// take control: it offers Try Again (→ pre-level Loadout, selections preserved)
// and Return to Map, plus opt-in "How could I improve?" coaching. Guidance
// defaults on, fades after a first clear, is independently toggleable, and both
// the Guidance preference and the retry Loadout survive reload (AC1/AC3/AC4/AC5/
// AC6). The deterministic Guidance/coaching rules are covered by the vitest suite
// (app/domain/guidance.test.ts); these specs assert the browser wiring end to end.

test.beforeEach(async ({ page }) => {
  // A fresh first launch: no saved progress, guidance at its default.
  await page.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });
});

/** Enter Meadow's Edge and let it resolve to a defeat by defending nothing. */
async function loseLevel(page: import('@playwright/test').Page): Promise<void> {
  await enterFromTrail(page, `?turbo=${TURBO}`);
  // Start with an empty battlefield: enemies walk the path and reach the Heartwood.
  await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.start());
  await expect(page.locator('#outcomeTitle')).toHaveText('Defeat', { timeout: 30_000 });
}

/** Enter Meadow's Edge and win it with full fairy-ring coverage. */
async function winLevel(page: import('@playwright/test').Page): Promise<void> {
  await enterFromTrail(page, `?god=1&turbo=${TURBO}`);
  const ringIds = await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.ringIds());
  for (const id of ringIds) {
    await place(page, id, id.includes('onpath') ? 'thornvine-bramble' : 'sprig-sentinel');
  }
  await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.start());
  await expect(page.locator('#outcomeTitle')).toHaveText('Victory', { timeout: 30_000 });
}

test.describe('Loss retries without taking control (issue #23)', () => {
  test('a loss offers Try Again and Return to Map, not Play Again (AC3)', async ({ page }) => {
    await loseLevel(page);
    await expect(page.locator('#replayBtn')).toHaveText('Try Again');
    await expect(page.locator('#returnToTrailBtn')).toHaveText('Return to Map');
  });

  test('Try Again returns to the pre-level Loadout with selections preserved (AC4)', async ({ page }) => {
    await loseLevel(page);
    // The starter Loadout (a single Sprig Sentinel for level 1) is what was used.
    await page.locator('#replayBtn').click();
    await expect(page.locator('#loadoutScreen')).toBeVisible();
    const slots = await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.loadoutSlots());
    expect(slots.some((s) => s?.id === 'sprig-sentinel')).toBe(true);
    // The Guardian may restart immediately or change the Loadout: Start is armed.
    await expect(page.locator('#loadoutStart')).toBeEnabled();
  });

  test('opt-in coaching gives non-blocking advice from the loss (AC5)', async ({ page }) => {
    await loseLevel(page);
    await expect(page.locator('#coachingBtn')).toBeVisible();
    // Coaching is opt-in: the advice panel stays hidden until requested.
    await expect(page.locator('#coachingPanel')).toBeHidden();
    await page.locator('#coachingBtn').click();
    await expect(page.locator('#coachingPanel')).toBeVisible();
    const tips = await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.coaching());
    expect(tips.length).toBeGreaterThan(0);
  });

  test('the retry Loadout survives reload (AC6)', async ({ page }) => {
    await loseLevel(page);
    // The Loadout used in the lost attempt was persisted on Start Battle.
    const before = await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.saveRaw());
    await page.reload();
    await enterFromTrail(page, `?turbo=${TURBO}`);
    const slots = await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.loadoutSlots());
    expect(slots.some((s) => s?.id === 'sprig-sentinel')).toBe(true);
    // And the raw save still carries it (the retry state crossed the boundary).
    expect(before).toContain('sprig-sentinel');
  });
});

test.describe('Guidance defaults, fades, and persists (issue #23)', () => {
  test('guidance is on at full intensity for a new Guardian (AC1)', async ({ page }) => {
    await page.goto('/');
    await fr(page);
    const g = await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.guidance());
    expect(g.enabled).toBe(true);
    expect(g.level).toBe(3);
  });

  test('guidance fades after a first successful completion (AC1)', async ({ page }) => {
    await winLevel(page);
    const g = await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.guidance());
    expect(g.level).toBe(2);
  });

  test('the Guidance preference is independently toggleable and persists (AC1/AC6)', async ({ page }) => {
    await page.goto('/');
    await fr(page);
    await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.setGuidance(false));
    expect(await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.guidance().enabled)).toBe(false);
    await page.reload();
    await fr(page);
    // The opt-out survived reload through the versioned save.
    expect(await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.guidance().enabled)).toBe(false);
  });
});
