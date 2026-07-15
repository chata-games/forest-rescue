import { expect, type Page } from '@playwright/test';

// Shared Playwright helpers for the production app. The campaign now starts on
// the Trail map; both the launch-to-outcome tracer bullet (issue #19) and the
// first-launch Trail journey (issue #20) enter their level through it.

export const TURBO = '16'; // sim speed-up so a full battle resolves in a few seconds

export interface FrLoadoutItem {
  kind: 'defender' | 'spell';
  id: string;
  name: string;
}

export interface FrLoadoutSlot {
  kind: 'defender' | 'spell';
  id: string;
}

export interface FrApi {
  placeOnRing(ringId: string): void;
  inspectRing(ringId: string): void;
  upgradeRing(ringId: string): { ok: true; cost: number; tier: number } | { ok: false; reason: string } | null;
  removeRing(ringId: string): { ok: true; refund: number } | { ok: false; reason: string } | null;
  selectDefender(typeId: string): void;
  start(): void;
  ringIds(): string[];
  // Loadout seam (issue #21): observable during the pre-battle Loadout step.
  loadoutCapacity(): number;
  loadoutPool(): FrLoadoutItem[];
  loadoutSlots(): (FrLoadoutSlot | null)[];
  loadoutCanStart(): boolean;
  loadoutAdvice(): { recommendation: string | null; warnings: string[] };
  loadoutFill(id: string): void;
  loadoutClear(index: number): void;
  loadoutStart(): void;
}

/**
 * Wait for the debug API to be wired. It is attached when the Loadout step opens
 * (issue #21), so callers that need a mounted battle should also await the
 * battle view directly (see enterFromTrail).
 */
export async function fr(page: Page): Promise<void> {
  await page.waitForFunction(() => !!(window as unknown as { fr?: unknown }).fr, undefined, { timeout: 30_000 });
}

/**
 * Navigate from the campaign Trail through the Loadout step into a level and
 * wait for the battle to mount. The detail Enter action opens the Loadout
 * screen; Start Battle (with the pre-filled starter Loadout) mounts the
 * battlefield (issue #21 AC6).
 */
export async function enterFromTrail(page: Page, search: string, levelId = '01-meadows-edge'): Promise<void> {
  await page.goto(`/${search}`);
  // The Trail is the first-launch view; every level node is a semantic control.
  await page.locator(`.trail-node[data-level="${levelId}"]`).click();
  await expect(page.locator('#trailDetail')).toBeVisible();
  await page.locator('#detailEnter').click();
  // Enter leads into the Loadout step, then Start Battle mounts the battlefield.
  await expect(page.locator('#loadoutScreen')).toBeVisible();
  await page.locator('#loadoutStart').click();
  await expect(page.locator('#battleRoot')).toBeVisible();
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
