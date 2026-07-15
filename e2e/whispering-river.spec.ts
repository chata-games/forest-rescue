import { test, expect } from '@playwright/test';
import { TURBO, enterFromTrail, place, type FrApi } from './helpers';

// Whispering River — the third campaign level (issue #35, PRD #18). It teaches
// air coverage by contrasting a winding ground trail with a direct Buzzsaw Drone
// air lane. These specs drive the browser wiring for the level's delivery: the
// pre-battle story beat (AC4), the air-coverage tutorial that surfaces in the
// planning phase and never overlays active defense (AC4), and the cumulative
// Loadout pool that includes the level's Dewdrop Nymph reward (AC3). The level's
// air-lane geometry and balance trade-off are verified deterministically by the
// authoring-contract validation (tools/levelgen/rules.mjs) and the outcome-band
// simulation (river-cheapest hard-win vs river-antiair clean-win), not here.

const FR = (): FrApi => (window as unknown as { fr: FrApi }).fr;

const LEVEL = '03-whispering-river';

test.describe('Whispering River — air-coverage level (issue #35)', () => {
  test('the river loads with its pre-battle story beat (AC4)', async ({ page }) => {
    await enterFromTrail(page, `?level=${LEVEL}&turbo=${TURBO}`);

    await expect(page.locator('#levelName')).toHaveText('Whispering River');

    // The pre-battle story beat appears on entry, readable and skippable.
    await expect(page.locator('#storyPanel')).toBeVisible();
    const pre = await page.evaluate(() => FR().storyFor('03-whispering-river', 'pre'));
    expect(pre).not.toBeNull();
    await expect(page.locator('#storyTitle')).toHaveText(pre!.title);
    await page.click('#storySkip');
    await expect(page.locator('#storyPanel')).toBeHidden();
  });

  test('teaches the air-coverage concept in the planning phase, without interrupting defense (AC4)', async ({ page }) => {
    await enterFromTrail(page, `?level=${LEVEL}&turbo=${TURBO}`);
    await page.click('#storySkip');

    // The air-coverage tutorial concept resolves for this level's learning goal.
    const steps = await page.evaluate(() => FR().tutorialSteps());
    expect(steps).toContain('air-coverage');

    // The tip surfaces one concept at a time in the planning phase only.
    await expect(page.locator('#tutorialHint')).toBeVisible();
    await expect(page.locator('#tutorialAdvance')).toBeVisible();

    // The moment a wave is running, the tip is gone — defense is never interrupted.
    const ringIds = await page.evaluate(() => FR().ringIds());
    for (const id of ringIds) await place(page, id, id.includes('onpath') ? 'thornvine-bramble' : 'sprig-sentinel');
    await page.evaluate(() => FR().start());
    await expect(page.locator('#tutorialHint')).toBeHidden();
  });

  test('the cumulative Loadout pool includes the Dewdrop Nymph reward (AC3)', async ({ page }) => {
    await enterFromTrail(page, `?level=${LEVEL}&turbo=${TURBO}`);
    await page.click('#storySkip');

    // The level's own reward is "immediately available" alongside everything
    // unlocked earlier, so Dewdrop Nymph (and the anti-air Wisp Willow) are
    // selectable in the river's Loadout pool before the battle is won.
    const pool = await page.evaluate(() => FR().loadoutPool().map((i) => i.id));
    expect(pool).toContain('dewdrop-nymph');
    expect(pool).toContain('wisp-willow');
  });
});
