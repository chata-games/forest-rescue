# Act 2–3 Asset Pack — Agent Prompt

Generate and freeze remaining campaign art (levels 4–10).

## Defenders (idle each)

Mushroom Shaman, Firefly Beacon, Mossback Golem, Faefox Archer, Hive Hollow, Grove Matriarch

## Enemies

Poacher, Arsonist, Diesel Hauler, Tunnel Borer, Excavator, Sprayer Rig, Foreman

## Bosses

The Grinder (L5), Iron Canopy Crawler (L8), The Terraformer (L10) — idle + damaged

## Biome materials

mushroom-hollow, sawmill, ashfall-scar, boulder-pass, canopy-highway, long-night, heartwood-root

## Workflow

For each asset:
1. Read prompt in `assets/prompts/<id>.md`
2. Run `imagegen.sh` with reference pack (guardian, towers-1/2, enemies-1/2, gameplay-mockup, palette-board)
3. `node tools/assets/process.mjs`
4. Validate 64px preview in `assets/previews/`
5. `node tools/assets/build-atlas.mjs`

## Reference pack path

`assets/source/palette-board.png` (generate once, freeze)
