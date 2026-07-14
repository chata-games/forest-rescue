# Level 6: Ashfall Scar — Agent Prompt

Implement Ashfall Scar (level 6) for Forest Rescue: Heartwood.

## Goal

Add a playable compiled level with the **fire-spread** level modifier: fire propagates between adjacent fairy rings unless doused (Dewdrop Nymph, Cleansing Rain spell).

## LevelIntent template

```json
{
  "schemaVersion": 1,
  "id": "06-ashfall-scar",
  "name": "Ashfall Scar",
  "seed": "heartwood-ashfall-v1",
  "biome": "ashfall-scar",
  "learningGoal": "fire-management",
  "topology": { "archetype": "fork-and-rejoin", "entrances": 1, "exits": 1 },
  "targets": { "pathLength": 1800, "pathDensity": 0.4, "ringCount": 9, "difficulty": 0.52, "durationMinutes": 10 },
  "constraints": { "pathWidth": 92, "minimumTurnRadius": 110, "minimumParallelGap": 160 },
  "waves": { "count": 10, "allowedEnemies": ["arsonist", "diesel-hauler"], "budgetCurve": "moderate" },
  "unlocks": [],
  "levelModifiers": ["fire-spread"],
  "spellUnlock": "cleansing-rain",
  "landmarks": []
}
```

## Schema extensions

Add to `level-intent.schema.json` and compiler if missing:
- `levelModifiers: ["fire-spread"]` — render/sim hook
- `biome: "ashfall-scar"` in `biomes.js`

## Engine work

1. `src/level/fire.js` — ring burn state, adjacency propagation, douse API
2. `src/content/enemies.js` — Arsonist (ignites rings), Diesel Hauler (smoke aura −30% defender range)
3. `src/content/spells.js` — Cleansing Rain (AoE douse)
4. `src/content/defenders.js` — Dewdrop Nymph douses fire on hit
5. `src/rendering/battlefield.js` — burning ring particles (code-generated)

## ImageGen assets

- `arsonist-idle.png`, `diesel-hauler-idle.png`
- Biome material: `ashfall-floor.png` (charred ash tile)

## Simulation pass criteria

- `cheapest-dps` bot win rate ≤ 35% without fire counterplay
- `upgrade-first` bot win rate ≥ 60% with dewdrops and Cleansing Rain

## Commands

```bash
npm run author
node tools/simulation/run.mjs levels/compiled/06-ashfall-scar.json
```
