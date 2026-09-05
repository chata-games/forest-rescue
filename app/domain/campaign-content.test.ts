import { describe, expect, it } from 'vitest';
import manifestRaw from '../../levels/campaign.json';
import level01Raw from '../../levels/compiled/01-meadows-edge.json';
import level02Raw from '../../levels/compiled/02-old-stump-crossroads.json';
import level03Raw from '../../levels/compiled/03-whispering-river.json';
import level04Raw from '../../levels/compiled/04-mushroom-hollow.json';
import level05Raw from '../../levels/compiled/05-sawmill-clearing.json';
import level06Raw from '../../levels/compiled/06-ashfall-scar.json';
import level07Raw from '../../levels/compiled/07-boulder-pass.json';
import { BattleState } from './battle';
import type { CampaignManifest } from './campaign';
import { DEFENDERS, SPELLS, getDefender, getEnemy, getSpell } from './content';
import { buildPool } from './loadout';
import type { CompiledLevel } from './types';

const manifest = manifestRaw as CampaignManifest;
const levels = [
  level01Raw,
  level02Raw,
  level03Raw,
  level04Raw,
  level05Raw,
  level06Raw,
  level07Raw,
] as CompiledLevel[];

describe('shipped campaign content', () => {
  it.each(levels)('$id spawns every authored enemy type', (level) => {
    const battle = new BattleState({ level });
    battle.start();

    // One large step makes every scheduled spawn due. BattleState resolves the
    // catalogue before it moves or removes enemies, so an unknown type throws.
    expect(() => battle.tick(10_000)).not.toThrow();

    for (const wave of level.waves) {
      for (const group of wave.enemies) expect(getEnemy(group.type)).not.toBeNull();
    }
  });

  it('resolves every defender and spell reward in campaign order', () => {
    const unlocked: string[] = [];

    for (const level of manifest.levels) {
      unlocked.push(...(level.unlocks ?? []));
      if (level.spellUnlock) unlocked.push(level.spellUnlock);

      for (const id of level.unlocks ?? []) expect(getDefender(id)).not.toBeNull();
      if (level.spellUnlock) expect(getSpell(level.spellUnlock)).not.toBeNull();

      const pool = buildPool({
        levelOrder: unlocked.length,
        availableIds: unlocked,
        catalog: { defenders: DEFENDERS, spells: SPELLS },
      });
      expect(pool.map((item) => item.id)).toEqual([...new Set(unlocked)]);
    }
  });
});
