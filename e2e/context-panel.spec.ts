import { test, expect } from '@playwright/test';
import { TURBO, enterFromTrail, place, type FrApi } from './helpers';

// Modeless Defender management (issue #30). A Defender is planted via the
// coordinate-stable debug seam, then the real context-panel controls (Upgrade,
// Remove + inline Confirm) are driven through the DOM and the observable HUD +
// panel state is asserted. Undo is exercised through the real Undo control.

async function mana(page: import('@playwright/test').Page): Promise<number> {
  return Number(await page.locator('#manaValue').textContent());
}

test.describe('Inspect / upgrade / remove modelessly (issue #30)', () => {
  test('inspecting an occupied ring opens the panel and keeps the tool selected (AC1)', async ({ page }) => {
    await enterFromTrail(page, `?god=1&turbo=${TURBO}`);
    const ringIds = await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.ringIds());
    const ring = ringIds.find((id) => !id.includes('onpath'))!;
    await place(page, ring, 'sprig-sentinel');

    // The selected tool is the just-planted Sprig Sentinel.
    await expect(page.locator('.tool[data-defender="sprig-sentinel"]')).toHaveAttribute('aria-pressed', 'true');

    await page.evaluate((r) => (window as unknown as { fr: FrApi }).fr.inspectRing(r), ring);

    // The modeless panel opens with the Defender's name and tier ladder.
    await expect(page.locator('#contextPanel')).toBeVisible();
    await expect(page.locator('#cpTitle')).toHaveText('Sprig Sentinel');
    await expect(page.locator('#cpTier')).toHaveText('Tier 1 of 3');
    // ...and the selected placement tool is retained.
    await expect(page.locator('.tool[data-defender="sprig-sentinel"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('upgrade previews the cost and commits through a dedicated action (AC3)', async ({ page }) => {
    await enterFromTrail(page, `?god=1&turbo=${TURBO}`);
    const ringIds = await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.ringIds());
    const ring = ringIds.find((id) => !id.includes('onpath'))!;
    await place(page, ring, 'sprig-sentinel');
    await page.evaluate((r) => (window as unknown as { fr: FrApi }).fr.inspectRing(r), ring);

    // The preview names the exact cost and the damage delta.
    await expect(page.locator('#cpUpgradeSummary')).toContainText('45 mana');
    await expect(page.locator('#cpUpgradeDetail')).toContainText('Damage 35 → 55');

    const before = await mana(page);
    await page.click('#cpUpgradeBtn');

    // Commit spends exactly the previewed cost and advances the tier ladder.
    expect(await mana(page)).toBe(before - 45);
    await expect(page.locator('#cpTier')).toHaveText('Tier 2 of 3');
  });

  test('remove requires inline confirmation, shows the refund, and frees the ring (AC4)', async ({ page }) => {
    await enterFromTrail(page, `?god=1&turbo=${TURBO}`);
    const ringIds = await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.ringIds());
    const ring = ringIds.find((id) => !id.includes('onpath'))!;
    await place(page, ring, 'sprig-sentinel'); // 50 mana -> refund round(50*0.7)=35
    await page.evaluate((r) => (window as unknown as { fr: FrApi }).fr.inspectRing(r), ring);

    await expect(page.locator('#cpRemoveSummary')).toContainText('35 mana refunded');

    // Remove arms an inline confirmation rather than committing immediately.
    await page.click('#cpRemoveBtn');
    await expect(page.locator('#cpConfirm')).toBeVisible();

    const before = await mana(page);
    await page.click('#cpConfirmBtn');
    expect(await mana(page)).toBe(before + 35);
    // The ring is freed and the panel dismisses.
    await expect(page.locator('#contextPanel')).toBeHidden();
  });

  test('undo restores a removed Defender through the real control (AC5)', async ({ page }) => {
    await enterFromTrail(page, `?god=1&turbo=${TURBO}`);
    const ringIds = await page.evaluate(() => (window as unknown as { fr: FrApi }).fr.ringIds());
    const ring = ringIds.find((id) => !id.includes('onpath'))!;
    await place(page, ring, 'sprig-sentinel');
    await page.evaluate((r) => (window as unknown as { fr: FrApi }).fr.inspectRing(r), ring);
    await page.click('#cpRemoveBtn');
    await page.click('#cpConfirmBtn');

    const afterRemove = await mana(page);
    // The Undo control lights up (removal is within the 4-second window).
    await expect(page.locator('#undoBtn')).toBeEnabled();
    await page.click('#undoBtn');

    // The Defender is replanted and the refund is clawed back.
    expect(await mana(page)).toBe(afterRemove - 35);
    await expect(page.locator('#hint')).toContainText(/Restored defender/);
  });
});
