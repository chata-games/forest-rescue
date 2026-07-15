import { test, expect } from '@playwright/test';

// First-launch Trail journey (issue #20 acceptance criterion 6) and the
// accessible-campaign-map contract (criteria 1–5). The campaign starts on the
// Trail: route, nodes, state, labels, and hit regions all render from the
// campaign manifest; generated art supplies scenery only.

const MANIFEST_ORDER = [
  '01-meadows-edge',
  '02-old-stump-crossroads',
  '03-whispering-river',
  '04-mushroom-hollow',
  '05-sawmill-clearing',
  '06-ashfall-scar',
  '07-boulder-pass',
];

// A fresh first launch: no saved progress, so only the first level is current.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });
});

test.describe('Trail campaign map', () => {
  test('opens on the Trail and presents every level in manifest order', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('#trailScreen')).toBeVisible();
    await expect(page.locator('#battleRoot')).toBeHidden();

    const nodes = page.locator('.trail-node');
    await expect(nodes).toHaveCount(MANIFEST_ORDER.length);

    const order = await nodes.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.level));
    expect(order).toEqual(MANIFEST_ORDER);
  });

  test('derives cleared/current/locked state from a fresh campaign', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('.trail-node[data-level="01-meadows-edge"]')).toHaveAttribute(
      'data-status',
      'current',
    );
    for (const id of MANIFEST_ORDER.slice(1)) {
      await expect(page.locator(`.trail-node[data-level="${id}"]`)).toHaveAttribute(
        'data-status',
        'locked',
      );
    }
  });

  test('every node is a semantic control with a 48x48 target and a state label', async ({ page }) => {
    await page.goto('/');

    const labels = await page.locator('.trail-node').evaluateAll((els) =>
      els.map((e) => ({
        label: (e as HTMLElement).ariaLabel ?? '',
        width: (e as HTMLElement).offsetWidth,
        height: (e as HTMLElement).offsetHeight,
      })),
    );

    expect(labels.length).toBe(MANIFEST_ORDER.length);
    for (const l of labels) {
      expect(l.width).toBeGreaterThanOrEqual(48);
      expect(l.height).toBeGreaterThanOrEqual(48);
      // Accessible state description: current/cleared/locked wording.
      expect(/Available|Cleared|Locked/.test(l.label)).toBe(true);
    }
    // The route polyline is rendered from the manifest positions.
    const points = await page.locator('.route__line').getAttribute('points');
    expect(points?.trim().length ?? 0).toBeGreaterThan(0);
  });

  test('keyboard traverses nodes in campaign order', async ({ page }) => {
    await page.goto('/');

    const first = page.locator('.trail-node[data-level="01-meadows-edge"]');
    await first.focus();
    await expect(first).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.trail-node[data-level="02-old-stump-crossroads"]')).toBeFocused();
  });

  test('a locked node opens its requirement with the Enter action disabled', async ({ page }) => {
    await page.goto('/');

    // Locked nodes stay selectable.
    await page.locator('.trail-node[data-level="03-whispering-river"]').click();
    await expect(page.locator('#trailDetail')).toBeVisible();
    await expect(page.locator('#detailEnter')).toBeDisabled();
    await expect(page.locator('#detailUnlock')).toBeVisible();
    await expect(page.locator('#detailUnlock')).toContainText('Old Stump Crossroads');

    await page.locator('#detailBack').click();
    await expect(page.locator('#trailDetail')).toBeHidden();
  });

  test('a first-launch journey enters Meadow\'s Edge from the Trail', async ({ page }) => {
    await page.goto('/');

    // Selecting the available node opens the compact detail surface.
    await page.locator('.trail-node[data-level="01-meadows-edge"]').click();
    await expect(page.locator('#trailDetail')).toBeVisible();
    await expect(page.locator('#detailEnter')).toBeEnabled();
    await expect(page.locator('#detailTitle')).toHaveText("Meadow's Edge");

    // Enter leads into the pre-battle flow: the Phaser battlefield mounts.
    await page.locator('#detailEnter').click();
    await expect(page.locator('#trailScreen')).toBeHidden();
    await expect(page.locator('#battleRoot')).toBeVisible();
    await expect(page.locator('#levelName')).toHaveText("Meadow's Edge");
    await expect(page.locator('#game-root canvas')).toBeVisible();
  });
});
