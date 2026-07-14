# Forest Rescue: Heartwood — Level Authoring Rules

Agents authoring campaign levels must follow these rules.

## Write only LevelIntent files

- Edit files in `levels/intents/*.json` only.
- Never hand-edit `levels/compiled/*.json`.

## Workflow after every change

```bash
cd forest-rescue
npm run author
npm run simulate -- levels/compiled/<id>.json
npm run preview -- levels/compiled/<id>.json
```

Or step by step:

```bash
node tools/levelgen/validate.mjs levels/intents/<id>.json
node tools/levelgen/compile.mjs levels/intents/<id>.json
node tools/levelgen/validate.mjs levels/compiled/<id>.json
node tools/simulation/run.mjs levels/compiled/<id>.json
```

## If compile fails

Revise intent `targets` or `constraints` — relax pathLength, ringCount, or difficulty targets. Do not add coordinates to the intent.

## If simulation fails win-rate bands

Adjust `waves.budgetCurve`, `waves.allowedEnemies`, or `targets.difficulty`. Recompile and re-simulate.

## Context bundle for LLM sessions

Read before authoring:

1. `docs/tower-defense-concept/index.html` — campaign bible
2. `schemas/level-intent.schema.json` — intent schema
3. `src/content/defenders.js` — defender stats
4. `src/content/enemies.js` — enemy threat costs
5. `src/content/biomes.js` — biome IDs
6. Prior level `metrics` in `levels/compiled/*.json`

## Topology archetypes

| Archetype | Use for |
|-----------|---------|
| single-s-curve | Tutorial, gentle intro |
| two-path-merge | Split pressure |
| river-crossings | Water + air lanes |
| fork-and-rejoin | Hazard routing |
| switchbacks | Long path, elevation feel |
| three-way-siege | Endurance |
| spiral-boss | Final boss |
| short-boss-assault | Boss rush |
| elevated-paths | Air-dominant (L8+) |

## ImageGen

Use `~/.claude/skills/codex-imagegen/imagegen.sh` for assets only — never level geometry.
