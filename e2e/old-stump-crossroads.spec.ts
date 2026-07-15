import { test, expect } from '@playwright/test';
import { TURBO, enterFromTrail, place, type FrApi } from './helpers';

// Old Stump Crossroads — the second campaign level (issue #34, PRD #18). It
// teaches divided attention (split pressure) with two logging roads that merge
// at the Heartwood, where Surveyors and Chainsaw Brutes press from both gates.
// These specs drive the browser wiring for the level's delivery: the pre-battle
// story beat (AC4), the split-pressure tutorial that surfaces in the planning
// phase and never overlays active defense (AC4), and the cumulative Loadout pool
// that includes the level's Wisp Willow reward (AC3). The level's two-road
// merge geometry and balance are verified deterministically by the
// authoring-contract validation (tools/levelgen/rules.mjs) and the outcome-band
// simulation (crossroads-cheapest clean-win vs crossroads-defensive-gate loss),
// not here.

const FR = (): FrApi => (window as unknown as { fr: FrApi }).fr;

const LEVEL = '02-old-stump-crossroads';

test.describe('Old Stump Crossroads — split-pressure level (issue #34)', () => {
  test('the crossroads loads with its pre-battle story beat (AC4)', async ({ page }) => {
    await enterFromTrail(page, `?level=${LEVEL}&turbo=${TURBO}`);

    await expect(page.locator('#levelName')).toHaveText('Old Stump Crossroads');

    // The pre-battle story beat appears on entry, readable and skippable.
    await expect(page.locator('#storyPanel')).toBeVisible();
    const pre = await page.evaluate(() => FR().storyFor('02-old-stump-crossroads', 'pre'));
    expect(pre).not.toBeNull();
    await expect(page.locator('#storyTitle')).toHaveText(pre!.title);
    await page.click('#storySkip');
    await expect(page.locator('#storyPanel')).toBeHidden();
  });

  test('teaches the split-pressure concept in the planning phase, without interrupting defense (AC4)', async ({ page }) => {
    await enterFromTrail(page, `?level=${LEVEL}&turbo=${TURBO}`);
    await page.click('#storySkip');

    // The split-pressure tutorial concept resolves for this level's learning goal.
    const steps = await page.evaluate(() => FR().tutorialSteps());
    expect(steps).toContain('split-pressure');

    // The tip surfaces one concept at a time in the planning phase only.
    await expect(page.locator('#tutorialHint')).toBeVisible();
    await expect(page.locator('#tutorialAdvance')).toBeVisible();

    // The moment a wave is running, the tip is gone — defense is never interrupted.
    // (Surveyors and Chainsaw Brutes now resolve, so the wave spawns cleanly.)
    const ringIds = await page.evaluate(() => FR().ringIds());
    for (const id of ringIds) await place(page, id, id.includes('onpath') ? 'thornvine-bramble' : 'sprig-sentinel');
    await page.evaluate(() => FR().start());
    await expect(page.locator('#tutorialHint')).toBeHidden();
  });

  test('the cumulative Loadout pool includes the Wisp Willow reward (AC3)', async ({ page }) => {
    await enterFromTrail(page, `?level=${LEVEL}&turbo=${TURBO}`);
    await page.click('#storySkip');

    // The level's own reward is "immediately available" alongside everything
    // unlocked earlier, so Wisp Willow is selectable in the crossroads Loadout
    // pool before the battle is won.
    const pool = await page.evaluate(() => FR().loadoutPool().map((i) => i.id));
    expect(pool).toContain('wisp-willow');
    expect(pool).toContain('sprig-sentinel');
    expect(pool).toContain('thornvine-bramble');
  });
});
