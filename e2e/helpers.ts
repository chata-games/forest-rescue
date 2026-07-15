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

export interface FrSaveNotice {
  kind: 'epoch' | 'corrupted';
  message: string;
}

export interface FrGuidance {
  enabled: boolean;
  level: number;
}

export interface FrSaveState {
  schemaVersion: number;
  contentEpoch: string;
  campaignId: string;
  progress: Record<string, { cleared: boolean; stars: number }>;
  unlocks: string[];
  loadouts: Record<string, (FrLoadoutSlot | null)[]>;
  guidance: FrGuidance;
}

export interface FrApi {
  placeOnRing(ringId: string): void;
  inspectRing(ringId: string): void;
  upgradeRing(ringId: string): { ok: true; cost: number; tier: number } | { ok: false; reason: string } | null;
  removeRing(ringId: string): { ok: true; refund: number } | { ok: false; reason: string } | null;
  selectDefender(typeId: string): void;
  start(): void;
  pause(): void;
  resume(): void;
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
  // Save seam (issue #27 AC6): observable reload/migration/epoch/corruption journeys.
  saveState(): FrSaveState;
  saveRaw(): string | null;
  saveArchiveRaw(): string | null;
  contentEpoch(): string;
  saveNotice(): FrSaveNotice | null;
  injectSaveRaw(raw: string | null): void;
  clearSave(): void;
  // Story / tutorial / audio seam (issue #33 AC6).
  storyFor(levelId: string, kind: 'pre' | 'post'): { title: string; body: string } | null;
  storySeen(): Record<string, boolean>;
  storyReplay(levelId: string): void;
  tutorialSteps(): string[];
  tutorialDismissed(): Record<string, boolean>;
  tutorialReset(): void;
  audioSettings(): { master: number; music: number; effects: number };
  audioEffective(channel: 'master' | 'music' | 'effects'): number;
  audioSet(channel: 'master' | 'music' | 'effects', value: number): void;
  audioMute(channel: 'master' | 'music' | 'effects'): void;
  // Guidance + retry seam (issue #23 AC6).
  guidance(): FrGuidance;
  setGuidance(enabled: boolean): FrGuidance;
  coaching(): string[];
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
 *
 * When the URL carries `?level=`, the app boots straight into that level's
 * Loadout step (the Trail is hidden), so the map navigation is skipped and the
 * journey starts from Start Battle — entering exactly the level the URL names.
 */
export async function enterFromTrail(page: Page, search: string, levelId = '01-meadows-edge'): Promise<void> {
  await page.goto(`/${search}`);
  if (await page.locator('#loadoutScreen').isVisible()) {
    // Booted into the Loadout step via ?level=: Start straight from it.
    await page.locator('#loadoutStart').click();
  } else {
    // The Trail is the first-launch view; every level node is a semantic control.
    await page.locator(`.trail-node[data-level="${levelId}"]`).click();
    await expect(page.locator('#trailDetail')).toBeVisible();
    await page.locator('#detailEnter').click();
    // Enter leads into the Loadout step, then Start Battle mounts the battlefield.
    await expect(page.locator('#loadoutScreen')).toBeVisible();
    await page.locator('#loadoutStart').click();
  }
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
