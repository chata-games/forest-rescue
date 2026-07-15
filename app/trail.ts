// Pure Trail rendering for the semantic campaign-map shell.
//
// Mirrors hud.ts: this is the exact transformation the browser applies to turn a
// resolved Trail (from domain/campaign) into the semantic DOM/CSS Trail map —
// node positions, accessible labels, the route polyline, and the compact detail
// surface. Kept free of Phaser and DOM globals so it unit-tests with plain stub
// elements. Generated campaign art supplies scenery only; every route line,
// node, state, label, and hit region is projected here from the manifest.

import type { TrailNode } from './domain/campaign';

/** Minimal structural shape renderTrail touches — real HTMLElements satisfy this. */
export interface NodeElement {
  textContent: string | null;
  ariaLabel: string | null;
  /** Mirrors DOMStringMap: present properties are strings, absent ones undefined. */
  dataset: Record<string, string | undefined>;
  style: { left: string; top: string };
}

export interface TrailElements {
  /** One element per Trail node, in campaign order. */
  nodes: NodeElement[];
  /** The SVG route polyline connecting node centers. */
  route: { points: string | null };
}

export interface DetailElements {
  title: { textContent: string | null };
  blurb: { textContent: string | null };
  meta: { textContent: string | null };
  rewards: { textContent: string | null };
  unlock: { textContent: string | null; hidden: boolean | string };
  enterBtn: { disabled: boolean; textContent: string | null };
}

/** Percent string for a 0..1 coordinate, clamped and rounded. */
function percent(v: number): string {
  const clamped = Math.max(0, Math.min(1, v));
  return `${Math.round(clamped * 100)}%`;
}

/** Accessible label combining the level name and its derived state description. */
export function nodeAriaLabel(node: TrailNode): string {
  return `Level ${node.order}: ${node.name}. ${node.stateDescription}`;
}

/** SVG polyline points string joining node centers, in campaign order. */
export function routePoints(nodes: TrailNode[]): string {
  return nodes
    .map((n) => `${Math.round(n.position.x * 100)},${Math.round(n.position.y * 100)}`)
    .join(' ');
}

/** Pretty-print a stable reward id (defender or spell) as a Guardian-facing name. */
export function rewardName(id: string): string {
  return id
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Project the resolved Trail onto the semantic node controls and route line. */
export function renderTrail(nodes: TrailNode[], els: TrailElements): void {
  els.route.points = routePoints(nodes);
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const el = els.nodes[i];
    if (!el) continue;
    el.dataset.status = node.status;
    el.style.left = percent(node.position.x);
    el.style.top = percent(node.position.y);
    el.ariaLabel = nodeAriaLabel(node);
    el.textContent = String(node.order);
  }
}

/** Project a selected node onto the compact detail surface. */
export function renderDetail(node: TrailNode, els: DetailElements): void {
  els.title.textContent = node.name;
  els.blurb.textContent = `A ${node.biome || 'forest'} encounter in ${node.actTitle}.`;

  const starsLine = node.status === 'cleared' ? ` · best ${node.stars}★` : '';
  els.meta.textContent = `${node.actTitle} · ${node.biome} · ${node.waveCount} waves${starsLine}`;

  const rewardNames = node.unlocks.map(rewardName);
  if (node.spellUnlock) rewardNames.push(rewardName(node.spellUnlock));
  els.rewards.textContent = rewardNames.length
    ? `Unlocks: ${rewardNames.join(', ')}`
    : 'No new rewards';

  const locked = !node.enterable;
  els.unlock.hidden = !locked;
  els.unlock.textContent = node.unlockRequirement ?? '';

  els.enterBtn.disabled = locked;
  els.enterBtn.textContent = node.status === 'cleared' ? 'Replay' : 'Enter';
}
