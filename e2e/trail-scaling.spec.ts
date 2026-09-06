import { test, expect } from '@playwright/test';
import campaign from '../levels/campaign.json' with { type: 'json' };

test('level rings keep the map scale and disc centres after a resize', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.trail-node').first()).toBeVisible();
  let referenceRatio: number | undefined;
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1920, height: 928 },
    { width: 2560, height: 1080 },
    { width: 844, height: 390 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const geometry = await page.locator('#trailMap').evaluate((map) => {
      const bounds = map.getBoundingClientRect();
      return Array.from(map.querySelectorAll<HTMLElement>('.trail-node'), (node) => {
        const target = node.getBoundingClientRect();
        const ring = getComputedStyle(node, '::before');
        return {
          id: node.dataset.level,
          x: (target.x + target.width / 2 - bounds.x) / bounds.width,
          y: (target.y + target.height / 2 - bounds.y) / bounds.height,
          width: target.width,
          height: target.height,
          ratio: parseFloat(ring.width) / bounds.width,
        };
      });
    });
    referenceRatio ??= geometry[0].ratio;
    for (const node of geometry) {
      expect.soft(node.ratio, `ring scale at ${viewport.width}x${viewport.height}`).toBeCloseTo(referenceRatio, 4);
      const level = campaign.levels.find((level) => level.id === node.id)!;
      expect.soft(node.x, `${node.id} horizontal centre`).toBeCloseTo(level.mapPosition.x, 4);
      expect.soft(node.y, `${node.id} vertical centre`).toBeCloseTo(level.mapPosition.y, 4);
      expect.soft(node.width).toBeGreaterThanOrEqual(48);
      expect.soft(node.height).toBeGreaterThanOrEqual(48);
    }
  }
});
