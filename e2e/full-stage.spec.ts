import { test, expect } from '@playwright/test';
import { enterFromTrail, type FrApi } from './helpers';

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 844, height: 280 },
  { width: 390, height: 700 },
]) {
  test(`full battlefield and pointer controls at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await enterFromTrail(page, '?level=02-old-stump-crossroads');
    await expect(page.locator('#storyPanel')).toBeVisible();
    await expect(page.locator('#tutorialHint')).toBeHidden();
    await page.click('#storySkip');
    if (await page.locator('#portraitAdvice').isVisible()) await page.click('#portraitAdviceKeep');
    if (await page.locator('#tutorialHint').isVisible()) await page.click('#tutorialSkip');

    if (viewport.width > viewport.height && viewport.height <= 520) await page.click('#mapZoomBtn');

    const canvas = page.locator('#game-root canvas');
    await expect.poll(async () => {
      const r = await canvas.boundingBox();
      return r && { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
    }).toEqual({ x: 0, y: 0, ...viewport });

    const targets = await page.evaluate(() => {
      const api = (window as unknown as { fr: FrApi }).fr;
      const camera = api.battleViewport();
      return api.ringCenters().map((r) => ({
        id: r.id, x: r.x * camera.zoom + camera.offsetX, y: r.y * camera.zoom + camera.offsetY,
      }));
    });
    expect(targets.length).toBeGreaterThan(0);
    for (const ring of targets) {
      expect(ring.x).toBeGreaterThan(0);
      expect(ring.x).toBeLessThan(viewport.width);
      expect(ring.y).toBeGreaterThan(0);
      expect(ring.y).toBeLessThan(viewport.height);
    }
    const blockedRings = await page.evaluate((rings) => rings.filter((r) =>
      document.elementFromPoint(r.x, r.y)?.tagName !== 'CANVAS'), targets);
    expect(blockedRings).toEqual([]);
    // The scheduler can place flowers anywhere on its 8 by 4 lattice.
    // Floating controls must leave each candidate reachable.
    const blockedFlowers = await page.evaluate(() => {
      const c = (window as unknown as { fr: FrApi }).fr.battleViewport();
      const blocked: { x: number; y: number; tag: string | undefined }[] = [];
      for (let row = 0; row < 4; row++) for (let col = 0; col < 8; col++) {
        const x = Math.round(48 + col * ((1536 - 96) / 7)) * c.zoom + c.offsetX;
        const y = Math.round(48 + row * ((1024 - 96) / 3)) * c.zoom + c.offsetY;
        const tag = document.elementFromPoint(x, y)?.tagName;
        if (tag !== 'CANVAS') blocked.push({ x, y, tag });
      }
      return blocked;
    });
    expect(blockedFlowers).toEqual([]);
    const target = await page.evaluate((rings) => rings.find((r) =>
      !r.id.includes('onpath') && document.elementFromPoint(r.x, r.y)?.tagName === 'CANVAS'), targets);
    expect(target).toBeDefined();
    const before = Number(await page.locator('#manaValue').textContent());
    await page.mouse.click(target!.x, target!.y);
    await expect(page.locator('#manaValue')).toHaveText(String(before - 50));
    await page.mouse.click(target!.x, target!.y);
    await expect(page.locator('#cpTitle')).toHaveText('Sprig Sentinel');
    await expect(page.locator('#contextPanel')).toBeVisible();
    await page.click('#cpRemoveBtn');
    await expect(page.locator('#cpConfirm')).toBeVisible();
    await page.click('#cpCancelBtn');
    await expect(page.locator('#cpConfirm')).toBeHidden();
    await page.click('#cpClose');
    await expect(page.locator('#contextPanel')).toBeHidden();

    await page.locator('#wavePreviewDetails summary').click();
    await expect(page.locator('#wavePreviewBody')).toBeVisible();
    await expect(page.locator('#wavePreviewBody')).toContainText('Wave 1');
    await page.locator('#wavePreviewDetails summary').click();
    await expect(page.locator('#wavePreviewBody')).toBeHidden();
    await page.click('#startBtn');
    await page.click('#pauseBtn');
    await expect(page.locator('#pauseOverlay')).toBeVisible();
    await page.click('#resumeBtn');
    await expect(page.locator('#pauseOverlay')).toBeHidden();
    await page.setViewportSize({ width: viewport.width + 30, height: viewport.height + 40 });
    await expect.poll(async () => {
      const r = await canvas.boundingBox();
      return r && { width: Math.round(r.width), height: Math.round(r.height) };
    }).toEqual({ width: viewport.width + 30, height: viewport.height + 40 });
  });
}

test('phone close view pans without spending mana and can restore the full map', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 844, height: 330 });
  await enterFromTrail(page, '?level=02-old-stump-crossroads');
  await page.click('#storySkip');
  if (await page.locator('#tutorialHint').isVisible()) await page.click('#tutorialSkip');
  const view = () => page.evaluate(() => (window as unknown as { fr: FrApi }).fr.battleViewport());
  await expect(page.locator('#mapZoomBtn')).toHaveText('Full map');
  const close = await view();
  await page.click('#mapZoomBtn');
  const full = await view();
  expect(close.zoom).toBeCloseTo(full.zoom * 2);
  await page.click('#mapZoomBtn');
  // Find empty ground, with room for a horizontal drag, away from ring hit areas.
  const ground = await page.evaluate(() => {
    const api = (window as unknown as { fr: FrApi }).fr;
    const c = api.battleViewport();
    const rings = api.ringCenters();
    for (let y = 90; y < 230; y += 20) for (let x = 250; x < 550; x += 20) {
      if (document.elementFromPoint(x, y)?.tagName !== 'CANVAS') continue;
      if (rings.every((r) => Math.hypot(r.x * c.zoom + c.offsetX - x, r.y * c.zoom + c.offsetY - y) > 60)) return { x, y };
    }
    throw new Error('No empty ground for pan');
  });
  const mana = await page.locator('#manaValue').textContent();
  await page.mouse.move(ground.x, ground.y);
  await page.mouse.down();
  await page.mouse.move(ground.x + 100, ground.y, { steps: 10 });
  await page.mouse.up();
  const moved = await view();
  expect(moved.offsetX).toBeGreaterThan(close.offsetX + 80);
  expect(moved.zoom).toBeCloseTo(close.zoom);
  await expect(page.locator('#manaValue')).toHaveText(mana!);
  const target = await page.evaluate(() => {
    const api = (window as unknown as { fr: FrApi }).fr;
    const c = api.battleViewport();
    return api.ringCenters().filter((r) => !r.id.includes('onpath')).map((r) => ({
      x: r.x * c.zoom + c.offsetX, y: r.y * c.zoom + c.offsetY,
    })).find((r) => document.elementFromPoint(r.x, r.y)?.tagName === 'CANVAS');
  });
  expect(target).toBeDefined();
  await page.mouse.click(target!.x, target!.y);
  await expect(page.locator('#manaValue')).toHaveText(String(Number(mana) - 50));
  await page.screenshot({ path: testInfo.outputPath('phone-zoom.png') });
  await page.click('#mapZoomBtn');
  expect(await view()).toEqual(full);
  await page.setViewportSize({ width: 390, height: 700 });
  await expect(page.locator('#mapZoomBtn')).toBeHidden();
  await expect(page.locator('#mapDragHint')).toBeHidden();
  expect(errors).toEqual([]);
});
