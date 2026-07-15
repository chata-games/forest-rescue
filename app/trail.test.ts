import { describe, it, expect } from 'vitest';
import {
  nodeAriaLabel,
  routePoints,
  rewardName,
  renderTrail,
  renderDetail,
  type TrailElements,
  type DetailElements,
} from './trail';
import type { TrailNode } from './domain/campaign';

function node(partial: Partial<TrailNode>): TrailNode {
  return {
    id: '01-meadows',
    name: "Meadow's Edge",
    order: 1,
    actId: 'act-1',
    actTitle: 'First Sprouts',
    position: { x: 0.1, y: 0.8 },
    status: 'current',
    enterable: true,
    stars: 0,
    biome: 'meadow-edge',
    waveCount: 8,
    unlocks: ['sprig-sentinel'],
    spellUnlock: null,
    bossId: null,
    unlockRequirement: null,
    stateDescription: 'Available. The next level on the Trail.',
    ...partial,
  };
}

function trailEls(count: number): TrailElements {
  return {
    nodes: Array.from({ length: count }, () => ({
      textContent: '',
      ariaLabel: '',
      dataset: {},
      style: { left: '', top: '' },
    })),
    route: { points: '' },
  };
}

function detailEls(): DetailElements {
  return {
    title: { textContent: '' },
    blurb: { textContent: '' },
    meta: { textContent: '' },
    rewards: { textContent: '' },
    unlock: { textContent: '', hidden: true },
    enterBtn: { disabled: false, textContent: '' },
  };
}

describe('Trail node rendering', () => {
  it('builds an accessible label with the level name and state description', () => {
    const label = nodeAriaLabel(node({}));
    expect(label).toContain("Meadow's Edge");
    expect(label).toContain('Available');
  });

  it('marks the node element with its derived status and position', () => {
    const els = trailEls(1);
    renderTrail([node({ position: { x: 0.12, y: 0.72 } })], els);
    expect(els.nodes[0].dataset.status).toBe('current');
    expect(els.nodes[0].style.left).toBe('12%');
    expect(els.nodes[0].style.top).toBe('72%');
    expect(els.nodes[0].ariaLabel).toContain("Meadow's Edge");
  });

  it('renders a locked node selectable (not disabled) but flagged locked', () => {
    const els = trailEls(1);
    renderTrail(
      [node({ status: 'locked', enterable: false, stateDescription: 'Locked. Clear Old Stump Crossroads to unlock this level.' })],
      els,
    );
    expect(els.nodes[0].dataset.status).toBe('locked');
    // The node control stays selectable so the requirement can be shown; the
    // Enter action (in the detail surface) is what stays disabled.
    expect(els.nodes[0].ariaLabel).toContain('Locked');
  });

  it('derives the route polyline points from node positions, in order', () => {
    const nodes = [
      node({ position: { x: 0.1, y: 0.8 } }),
      node({ id: '02', order: 2, position: { x: 0.4, y: 0.5 } }),
      node({ id: '03', order: 3, position: { x: 0.9, y: 0.3 } }),
    ];
    expect(routePoints(nodes)).toBe('10,80 40,50 90,30');
  });

  it('pretty-prints reward ids as Guardian-facing names', () => {
    expect(rewardName('sprig-sentinel')).toBe('Sprig Sentinel');
    expect(rewardName('root-snare')).toBe('Root Snare');
    expect(rewardName('wisp-willow')).toBe('Wisp Willow');
  });
});

describe('Trail detail surface', () => {
  it('shows the level name, biome, wave count, and rewards for an available level', () => {
    const els = detailEls();
    renderDetail(node({ unlocks: ['sprig-sentinel'], spellUnlock: 'root-snare' }), els);
    expect(els.title.textContent).toBe("Meadow's Edge");
    expect(els.meta.textContent).toContain('meadow-edge');
    expect(els.meta.textContent).toContain('8');
    expect(els.rewards.textContent).toContain('Sprig Sentinel');
    expect(els.rewards.textContent).toContain('Root Snare');
    expect(els.enterBtn.disabled).toBe(false);
    expect(els.enterBtn.textContent).toBe('Enter');
    expect(els.unlock.hidden).toBe(true);
  });

  it('keeps the Enter action disabled and shows the requirement for a locked level', () => {
    const els = detailEls();
    renderDetail(
      node({
        status: 'locked',
        enterable: false,
        unlockRequirement: 'Clear Old Stump Crossroads to unlock this level.',
      }),
      els,
    );
    expect(els.enterBtn.disabled).toBe(true);
    expect(els.unlock.hidden).toBe(false);
    expect(els.unlock.textContent).toContain('Old Stump Crossroads');
  });

  it('shows the best star result for a cleared level', () => {
    const els = detailEls();
    renderDetail(
      node({ status: 'cleared', enterable: true, stars: 2, stateDescription: 'Cleared. Best result: 2 of 3 stars. Replay available.' }),
      els,
    );
    expect(els.meta.textContent).toContain('2');
    expect(els.enterBtn.disabled).toBe(false);
    expect(els.enterBtn.textContent).toBe('Replay');
  });
});
