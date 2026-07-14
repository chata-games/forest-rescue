# Level 4: Mushroom Hollow — Agent Prompt

Implement Mushroom Hollow (level 4) for Forest Rescue: Heartwood.

## Goal

Add a playable compiled level with the **darkness** level modifier: defenders see only near glow sources; light placement is the puzzle.

## LevelIntent template

```json
{
  "schemaVersion": 1,
  "id": "04-mushroom-hollow",
  "name": "Mushroom Hollow",
  "seed": "heartwood-mushroom-v1",
  "biome": "mushroom-hollow",
  "learningGoal": "light-management",
  "topology": { "archetype": "single-s-curve", "entrances": 1, "exits": 1 },
  "targets": { "pathLength": 1900, "pathDensity": 0.4, "ringCount": 9, "difficulty": 0.42, "durationMinutes": 10 },
  "constraints": { "pathWidth": 92, "minimumTurnRadius": 110, "minimumParallelGap": 170 },
  "waves": { "count": 10, "allowedEnemies": ["logger", "poacher"], "budgetCurve": "moderate" },
  "unlocks": ["firefly-beacon", "mushroom-shaman"],
  "levelModifiers": ["darkness"],
  "landmarks": ["glow-mushroom-cluster"]
}
```

## Schema extensions

Add to `level-intent.schema.json` and compiler if missing:
- `levelModifiers: ["darkness"]` — render/sim hook
- `biome: "mushroom-hollow"` in `biomes.js`

## Engine work

1. `src/rendering/battlefield.js` — darkness vignette mask; Firefly Beacon reveals radius
2. `src/content/defenders.js` — Firefly Beacon, Mushroom Shaman stats
3. `src/content/enemies.js` — Poacher (cloaked) stats
4. Poacher steals mana flowers — sim + runtime hook

## ImageGen assets

- `firefly-beacon-idle.png`, `mushroom-shaman-idle.png`, `poacher-idle.png`
- Biome materials: bioluminescent mushroom floor, night palette board

## Simulation pass criteria

- `cheapest-dps` bot win rate 40–80% without Firefly
- `best-coverage` bot win rate > 60% with Firefly placement

## Commands

```bash
npm run author
node tools/simulation/run.mjs levels/compiled/04-mushroom-hollow.json
```
