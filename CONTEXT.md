# Forest Rescue: Heartwood — Domain Context

## Game identity

**Forest Rescue: Heartwood** evolves the original lane-defense prototype into a campaign tower-defense game. The player is the **Guardian**, defending the **Heartwood** — the magical heart of the forest — against ChopCo Industries.

## Ubiquitous language

| Term | Meaning |
|------|---------|
| **Heartwood** | The grove gate enemies must reach; losing hearts = damage to the forest |
| **Hearts** | Jungle health (5 per level); stars awarded by hearts remaining |
| **Mana** | Currency for placing defenders; regenerates over time |
| **Mana flowers** | Tap-to-collect bonus mana spawns |
| **Fairy ring** | A build spot beside the enemy trail where defenders are planted |
| **Trail / path** | The spline enemies follow from entrance to Heartwood |
| **Defender** | A forest ally planted on a ring (formerly "Magic Tree") |
| **Ring** | Circular placement zone with a strategic role |
| **Wave** | A scripted group of enemies with spawn timing |
| **LevelIntent** | LLM-authored creative brief + targets; never contains coordinates |
| **CompiledLevel** | Deterministic compiler output with geometry, rings, waves, metrics |
| **Biome** | Visual and hazard theme for a level region |
| **Unlock** | Defender or spell made available after completing a level |

## Architecture boundaries

- **Intent** describes *what* a level should teach and feel like.
- **Compiler** produces *exact* geometry, rings, decorations, and waves from a seed.
- **ImageGen** produces reusable art components — never gameplay geometry.
- **Renderer** composes levels from catalog assets and compiled data.

## Campaign structure

10 levels across 3 acts. First vertical slice: levels 1–3 (Meadow's Edge, Old Stump Crossroads, Whispering River).

## Technical constraints

- Browser runtime: vanilla ES modules, Canvas 2D, no npm dependencies.
- Dev tools: Node.js for compile, validate, asset processing, simulation.
- Logical battlefield: 1536 × 1024 world units, scaled to canvas.
- Fixed timestep: 1/60 second.

## Related documents

- [Tower defense concept](docs/tower-defense-concept/index.html)
- [ADR-001: Level intent vs compiled split](docs/adr/001-level-intent-compiled-split.md)
