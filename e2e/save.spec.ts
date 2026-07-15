import { test, expect } from '@playwright/test';
import { fr, type FrApi } from './helpers';

// Persist / migrate / recover journeys for the campaign save (issue #27).
// Each test seeds localStorage BEFORE the app boots (via addInitScript) so the
// real boot-time load/migrate/recover path runs, then asserts the observable
// result through the rendered Trail, the one-time notice banner, and the
// window.fr save debug seam (AC6). The engine-independent rules for every
// journey are covered exhaustively by the vitest suite (app/domain/save.test.ts);
// these specs assert the browser wiring end to end.

// The localStorage key the production shell reads/writes (see app/main.ts) is
// 'heartwood-trail-v1'; it is inlined into the addInitScript callback below
// because that callback is serialized and cannot close over Node-side bindings.

/** Seed localStorage with a raw save value before the app boots. */
async function seedSave(page: import('@playwright/test').Page, raw: string): Promise<void> {
  await page.addInitScript((value) => {
    try {
      // The localStorage key the production shell reads (app/main.ts).
      window.localStorage.setItem('heartwood-trail-v1', value);
    } catch {
      /* ignore */
    }
  }, raw);
}

test.describe('Campaign save: persist, migrate, recover (issue #27)', () => {
  test('reload: a valid save restores cleared levels and best stars with no notice', async ({ page }) => {
    // A current-shape save: Meadow's Edge cleared with 2 stars.
    await seedSave(
      page,
      JSON.stringify({
        schemaVersion: 2,
        contentEpoch: 'heartwood-v1',
        campaignId: 'heartwood-v1',
        progress: { '01-meadows-edge': { cleared: true, stars: 2 } },
        unlocks: ['sprig-sentinel', 'thornvine-bramble'],
        loadouts: { '01-meadows-edge': [{ kind: 'defender', id: 'sprig-sentinel' }] },
      }),
    );

    await page.goto('/');
    await fr(page);

    // Progress is restored and reflected on the Trail (AC1).
    const state = await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.saveState());
    expect(state.progress['01-meadows-edge']).toEqual({ cleared: true, stars: 2 });
    expect(state.contentEpoch).toBe('heartwood-v1');
    await expect(page.locator('.trail-node[data-level="01-meadows-edge"]')).toHaveAttribute(
      'data-status',
      'cleared',
    );
    // The next level is now the current destination.
    await expect(page.locator('.trail-node[data-level="02-old-stump-crossroads"]')).toHaveAttribute(
      'data-status',
      'current',
    );

    // A clean reload shows no recovery notice.
    await expect(page.locator('#saveNotice')).toBeHidden();
    expect(await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.saveNotice())).toBeNull();

    // Persisted Loadout survives: re-opening the level restores the saved slot.
    await page.locator('.trail-node[data-level="01-meadows-edge"]').click();
    await page.locator('#detailEnter').click();
    const slots = await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.loadoutSlots());
    expect(slots.some((s) => s?.id === 'sprig-sentinel')).toBe(true);
  });

  test('compatible migration: a legacy v1 save (levels only) preserves progress with no notice (AC2)', async ({ page }) => {
    // The pre-issue-#27 shape: { schemaVersion: 1, levels: CampaignProgress }.
    await seedSave(
      page,
      JSON.stringify({
        schemaVersion: 1,
        levels: { '01-meadows-edge': { cleared: true, stars: 3 } },
      }),
    );

    await page.goto('/');
    await fr(page);

    // Progress migrates through v1 → v2 intact.
    const state = await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.saveState());
    expect(state.schemaVersion).toBe(2);
    expect(state.progress['01-meadows-edge']).toEqual({ cleared: true, stars: 3 });
    await expect(page.locator('.trail-node[data-level="01-meadows-edge"]')).toHaveAttribute(
      'data-status',
      'cleared',
    );
    // A routine migration is silent — no scary notice.
    await expect(page.locator('#saveNotice')).toBeHidden();
  });

  test('incompatible epoch: an old-epoch save archives progress, starts fresh, and shows a one-time notice (AC3)', async ({ page }) => {
    const raw = JSON.stringify({
      schemaVersion: 2,
      contentEpoch: 'long-gone-epoch',
      campaignId: 'heartwood-v1',
      progress: { '06-ashfall-scar': { cleared: true, stars: 3 } },
      unlocks: [],
      loadouts: {},
    });
    await seedSave(page, raw);

    await page.goto('/');
    await fr(page);

    // Progress is reset to a fresh campaign…
    const state = await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.saveState());
    expect(state.progress).toEqual({});
    await expect(page.locator('.trail-node[data-level="01-meadows-edge"]')).toHaveAttribute(
      'data-status',
      'current',
    );
    // …a plain-language notice is shown…
    await expect(page.locator('#saveNotice')).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.saveNotice()?.kind)).toBe('epoch');
    // …and the raw value was archived for diagnostics (AC4).
    expect(await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.saveArchiveRaw())).toBe(raw);
  });

  test('corruption: unparseable data starts a fresh campaign, explains recovery, and preserves the raw value (AC4)', async ({ page }) => {
    const raw = '{ not valid json;;;';
    await seedSave(page, raw);

    await page.goto('/');
    await fr(page);

    // A safe fresh campaign starts.
    const state = await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.saveState());
    expect(state.progress).toEqual({});
    // Recovery is explained without trapping the player (dismissable, non-modal).
    await expect(page.locator('#saveNotice')).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.saveNotice()?.kind)).toBe('corrupted');
    // The raw value is preserved for diagnostics.
    expect(await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.saveArchiveRaw())).toBe(raw);

    // Dismissing the notice clears it without affecting the fresh campaign.
    await page.locator('#saveNoticeClose').click();
    await expect(page.locator('#saveNotice')).toBeHidden();
  });

  test('the debug seam can drive a recovery journey live (AC6)', async ({ page }) => {
    await page.goto('/');
    await fr(page);

    // Inject a corrupt save at runtime: the shell recovers and re-renders.
    await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.injectSaveRaw('{ broken'));
    expect(await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.saveNotice()?.kind)).toBe('corrupted');
    await expect(page.locator('#saveNotice')).toBeVisible();

    // Re-injecting a clean valid save clears the notice and loads the progress.
    await page.evaluate(
      () =>
        (window as unknown as { fr: FrApi }).fr.injectSaveRaw(
          JSON.stringify({
            schemaVersion: 2,
            contentEpoch: 'heartwood-v1',
            campaignId: 'heartwood-v1',
            progress: { '01-meadows-edge': { cleared: true, stars: 1 } },
            unlocks: [],
            loadouts: {},
          }),
        ),
    );
    expect(await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.saveNotice())).toBeNull();
    await expect(page.locator('.trail-node[data-level="01-meadows-edge"]')).toHaveAttribute(
      'data-status',
      'cleared',
    );
  });
});
