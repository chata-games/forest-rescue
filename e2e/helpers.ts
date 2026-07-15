import { expect, type Page } from '@playwright/test';

// Shared Playwright helpers for the production app. The campaign now starts on
// the Trail map; both the launch-to-outcome tracer bullet (issue #19) and the
// first-launch Trail journey (issue #20) enter their level through it.

export const TURBO = '16'; // sim speed-up so a full battle resolves in a few seconds

export interface FrApi {
  placeOnRing(ringId: string): void;
  inspectRing(ringId: string): void;
  upgradeRing(ringId: string): { ok: true; cost: number; tier: number } | { ok: false; reason: string } | null;
  removeRing(ringId: string): { ok: true; refund: number } | { ok: false; reason: string } | null;
  selectDefender(typeId: string): void;
  start(): void;
  ringIds(): string[];
}

/** Wait for the debug battle API to be wired (i.e. a level has been entered). */
export async function fr(page: Page): Promise<void> {
  await page.waitForFunction(() => !!(window as unknown as { fr?: unknown }).fr, undefined, { timeout: 30_000 });
}

/** Navigate from the campaign Trail into a level and wait for the battle to mount. */
export async function enterFromTrail(page: Page, search: string, levelId = '01-meadows-edge'): Promise<void> {
  await page.goto(`/${search}`);
  // The Trail is the first-launch view; every level node is a semantic control.
  await page.locator(`.trail-node[data-level="${levelId}"]`).click();
  await expect(page.locator('#trailDetail')).toBeVisible();
  await page.locator('#detailEnter').click();
  await fr(page);
}

export async function place(page: Page, ringId: string, type: string): Promise<void> {
  await page.evaluate(
    ({ r, t }) => {
      const api = (window as unknown as { fr: FrApi }).fr;
      api.selectDefender(t);
      api.placeOnRing(r);
    },
    { r: ringId, t: type },
  );
}
