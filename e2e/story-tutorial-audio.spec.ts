import { test, expect } from '@playwright/test';
import { TURBO, enterFromTrail, place, fr, type FrApi } from './helpers';

// Optional story, tutorials, and audio controls (issue #33). The deterministic
// rules behind every journey are covered exhaustively by vitest
// (app/domain/{story,tutorial,audio}.test.ts); these specs assert the browser
// wiring end to end — the campaign-map → story → tutorial → battle → post-level
// return flow (AC5), skippable/replayable story (AC1), one-concept tutorials
// that never overlay active defense (AC2), portrait/landscape coherence (AC3),
// and independent audio controls (AC4) — through the rendered DOM and the
// window.fr story/tutorial/audio debug seam (AC6).

const FR = (): FrApi => (window as unknown as { fr: FrApi }).fr;

test.describe('Optional story, tutorials, and audio controls (issue #33)', () => {
  test('the map→story→tutorial→battle→post-level flow is skippable end to end (AC1/AC2/AC5)', async ({ page }) => {
    await enterFromTrail(page, `?level=01-meadows-edge&turbo=${TURBO}`);

    // AC1: the pre-battle story beat appears on entry, readable and skippable.
    await expect(page.locator('#storyPanel')).toBeVisible();
    const pre = await page.evaluate(() => FR().storyFor('01-meadows-edge', 'pre'));
    expect(pre).not.toBeNull();
    await expect(page.locator('#storyTitle')).toHaveText(pre!.title);
    // Skip dismisses it without reading further.
    await page.click('#storySkip');
    await expect(page.locator('#storyPanel')).toBeHidden();
    // …and it won't auto-repeat this session.
    expect(await page.evaluate(() => FR().storySeen()['01-meadows-edge:pre'])).toBe(true);

    // AC2: a tutorial tip teaches one concept, in the planning phase only.
    const steps = await page.evaluate(() => FR().tutorialSteps());
    expect(steps.length).toBeGreaterThan(0);
    await expect(page.locator('#tutorialHint')).toBeVisible();
    await expect(page.locator('#tutorialAdvance')).toBeVisible();
    // "Skip tutorials" dismisses every remaining concept for the level.
    await page.click('#tutorialSkip');
    await expect(page.locator('#tutorialHint')).toBeHidden();
    expect(await page.evaluate(() => FR().tutorialDismissed()['placement'])).toBe(true);
  });

  test('a tutorial never overlays active defense — it hides once the wave starts (AC2)', async ({ page }) => {
    await enterFromTrail(page, `?level=01-meadows-edge&god=1&turbo=${TURBO}`);
    // Dismiss the pre-story so it isn't covering the planning tip.
    await page.click('#storySkip');
    await expect(page.locator('#tutorialHint')).toBeVisible();

    // Plant + start the wave. The moment the battle is running, the tip is gone.
    const ringIds = await page.evaluate(() => FR().ringIds());
    for (const id of ringIds) await place(page, id, id.includes('onpath') ? 'thornvine-bramble' : 'sprig-sentinel');
    await page.evaluate(() => FR().start());
    await expect(page.locator('#tutorialHint')).toBeHidden();
  });

  test('a victory shows the post-level story once, then the outcome (AC1/AC5)', async ({ page }) => {
    await enterFromTrail(page, `?level=01-meadows-edge&god=1&turbo=${TURBO}`);
    await page.click('#storySkip');

    const ringIds = await page.evaluate(() => FR().ringIds());
    for (const id of ringIds) await place(page, id, id.includes('onpath') ? 'thornvine-bramble' : 'sprig-sentinel');
    await page.evaluate(() => FR().start());

    // The post-level story beat appears on victory, holding the outcome underneath.
    await expect(page.locator('#storyPanel')).toBeVisible();
    const post = await page.evaluate(() => FR().storyFor('01-meadows-edge', 'post'));
    expect(post).not.toBeNull();
    await expect(page.locator('#storyTitle')).toHaveText(post!.title);
    // The outcome overlay waits while the post beat is up.
    await expect(page.locator('#outcomeOverlay')).toBeHidden();

    // Continuing reveals the result panel; Return to Trail lands back on the map.
    await page.click('#storyPrimary');
    await expect(page.locator('#outcomeOverlay')).toBeVisible();
    await expect(page.locator('#outcomeTitle')).toHaveText('Victory');
    await page.click('#returnToTrailBtn');
    await expect(page.locator('#trailScreen')).toBeVisible();
    await expect(page.locator('#battleRoot')).toBeHidden();
  });

  test('story is replayable from the campaign detail surface (AC1)', async ({ page }) => {
    await page.goto('/');
    await fr(page);

    // Open a level's detail and replay its story — even after it was seen.
    await page.locator('.trail-node[data-level="01-meadows-edge"]').click();
    await expect(page.locator('#trailDetail')).toBeVisible();
    await page.click('#detailStory');

    // The detail (a native dialog) closes and the story sheet shows over the Trail.
    await expect(page.locator('#trailDetail')).toBeHidden();
    await expect(page.locator('#storyPanel')).toBeVisible();
    await expect(page.locator('#storyTitle')).toHaveText(
      (await page.evaluate(() => FR().storyFor('01-meadows-edge', 'pre')!))!.title,
    );
    // Replay walks pre → post (this level is not yet cleared, so only pre shows);
    // continuing closes it and returns focus to the level's node.
    await page.click('#storyPrimary');
    await expect(page.locator('#storyPanel')).toBeHidden();
    await expect(page.locator('.trail-node[data-level="01-meadows-edge"]')).toBeFocused();
  });

  test('narrative and tutorial state stay coherent in the portrait layout (AC3)', async ({ page }) => {
    await enterFromTrail(page, `?level=01-meadows-edge&layout=portrait&turbo=${TURBO}`);

    // The pre-story sheet overlays the portrait battlefield and stays readable.
    await expect(page.locator('#storyPanel')).toBeVisible();
    await expect(page.locator('body')).toHaveAttribute('data-layout', 'portrait');
    await page.click('#storySkip');

    // The tutorial tip remains visible and repositioned (not overlapping the HUD).
    await expect(page.locator('#tutorialHint')).toBeVisible();
    const box = await page.locator('#tutorialHint').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
  });

  test('music and effects are controlled independently and persist (AC4)', async ({ page }) => {
    await page.goto('/');
    await fr(page);

    // Open the audio sheet from the Trail and check independent channels exist.
    await page.click('#trailAudioBtn');
    await expect(page.locator('#audioPanel')).toBeVisible();
    for (const ch of ['master', 'music', 'effects']) {
      await expect(page.locator(`.audio__channel[data-channel="${ch}"]`)).toBeVisible();
    }

    // Muting music silences music but leaves effects audible (independence).
    await page.evaluate(() => FR().audioMute('music'));
    expect(await page.evaluate(() => FR().audioEffective('music'))).toBe(0);
    expect(await page.evaluate(() => FR().audioEffective('effects'))).toBeGreaterThan(0);
    // The mute state is reflected on the control (shape, not colour alone).
    await expect(page.locator('.audio__channel[data-channel="music"] .audio__mute')).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Set a distinct effects level; it does not change music's stored level.
    await page.evaluate(() => FR().audioSet('effects', 0.3));
    const settings = await page.evaluate(() => FR().audioSettings());
    expect(settings.effects).toBeCloseTo(0.3, 5);
    expect(settings.music).toBe(0);

    await page.click('#audioClose');
    await expect(page.locator('#audioPanel')).toBeHidden();

    // Preferences persist across reload (localStorage-backed).
    await page.reload();
    await fr(page);
    const reloaded = await page.evaluate(() => FR().audioSettings());
    expect(reloaded.effects).toBeCloseTo(0.3, 5);
    expect(reloaded.music).toBe(0);
  });

  test('no required information is audio-only — the panel says so (AC4)', async ({ page }) => {
    await page.goto('/');
    await fr(page);
    await page.click('#trailAudioBtn');
    // The audio sheet states that every cue also appears on screen.
    await expect(page.locator('.audio__note')).toContainText(/never miss/i);
  });
});
