import { test, expect, type Page } from '@playwright/test';

// Production launch-to-outcome tracer bullet (issue #19 acceptance criterion 6).
// Each scenario launches the real Vite-served Phaser app, plants Defenders,
// starts the scripted waves, and asserts the deterministic battle outcome the
// engine-independent BattleState predicts for that loadout.

const TURBO = '16'; // sim speed-up so a full battle resolves in a few seconds

interface FrApi {
  placeOnRing(ringId: string): void;
  selectDefender(typeId: string): void;
  start(): void;
  ringIds(): string[];
}

async function fr(page: Page): Promise<void> {
  await page.waitForFunction(() => !!(window as unknown as { fr?: unknown }).fr, undefined, { timeout: 30_000 });
}

async function place(page: Page, ringId: string, type: string): Promise<void> {
  await page.evaluate(
    ({ r, t }) => {
      const api = (window as unknown as { fr: FrApi }).fr;
      api.selectDefender(t);
      api.placeOnRing(r);
    },
    { r: ringId, t: type },
  );
}

test.describe("Meadow's Edge launch-to-outcome", () => {
  test('honest loadout is overrun → Defeat', async ({ page }) => {
    await page.goto(`/?turbo=${TURBO}`);
    await fr(page);

    // The level loaded from its CompiledLevel.
    await expect(page.locator('#levelName')).toHaveText("Meadow's Edge");

    // Plant the three Sprig Sentinels 150 starting Mana affords (150 / 50).
    const ringIds = await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.ringIds());
    for (const id of ringIds.slice(0, 3)) await place(page, id, 'sprig-sentinel');

    // HUD reflects Mana spent on placement (150 - 150 = 0).
    await expect(page.locator('#manaValue')).toHaveText('0');

    // Start the scripted waves via the real DOM control.
    await page.click('#startBtn');

    // Deterministic outcome: the tutorial loadout cannot hold 42 Loggers.
    await expect(page.locator('#outcomeTitle')).toHaveText('Defeat', { timeout: 30_000 });
    await expect(page.locator('#outcomeOverlay')).toBeVisible();
  });

  test('full fairy-ring coverage defends the Heartwood → Victory', async ({ page }) => {
    await page.goto(`/?god=1&turbo=${TURBO}`);
    await fr(page);

    const ringIds = await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.ringIds());
    // Sprig Sentinels on every beside-path ring plus a Thornvine Bramble on the
    // on-path chokepoint — the configuration the domain resolves to a win.
    for (const id of ringIds) {
      await place(page, id, id.includes('onpath') ? 'thornvine-bramble' : 'sprig-sentinel');
    }
    await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.start());

    await expect(page.locator('#outcomeTitle')).toHaveText('Victory', { timeout: 30_000 });
    await expect(page.locator('#heartsValue')).toContainText('♥♥♥♥♥');
  });
});
