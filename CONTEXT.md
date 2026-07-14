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
| **Selected Defender** | The Defender chosen for repeated placement on compatible empty Fairy rings |
| **Inspected Defender** | A planted Defender whose details and contextual actions are currently shown |
| **Context Panel** | The modeless view of an Inspected Defender's details and available actions |
| **Remove Defender** | The action that frees a Fairy ring and returns 70% of all mana invested in its Defender, rounded to the nearest whole mana |
| **Selected Guardian spell** | The Guardian spell currently waiting for a battlefield target |
| **Planning Pause** | A frozen battle state in which the Guardian may inspect waves and manage Defenders but may not cast spells or collect mana flowers |
| **Ring** | Circular placement zone with a strategic role |
| **Wave** | A scripted group of enemies with spawn timing |
| **LevelIntent** | LLM-authored creative brief + targets; never contains coordinates |
| **CompiledLevel** | Deterministic compiler output with geometry, rings, waves, metrics |
| **Biome** | Visual and hazard theme for a level region |
| **Unlock** | Defender or spell made available after completing a level |
| **Loadout** | The limited set of unlocked defenders and Guardian spells chosen before a level and available during that battle |
| **Challenge** | The selected battle difficulty, which changes how hard a level is to defeat |
| **Guidance** | The independently selected amount of loadout advice, warnings, and strategic coaching shown to the player |
| **Preferred battle layout** | The landscape presentation optimized for two-thumb play; recommended but never required |
| **Compact portrait layout** | The fully playable portrait presentation: the complete battlefield scales down uniformly to fit while the HUD reflows with full-size controls |

## Architecture boundaries

- **Intent** describes *what* a level should teach and feel like.
- **Compiler** produces *exact* geometry, rings, decorations, and waves from a seed.
- **ImageGen** produces reusable art components — never gameplay geometry.
- **Renderer** composes levels from catalog assets and compiled data.

## Campaign structure

The first release is a 10-level Heartwood campaign across 3 acts. Later campaigns may expand the game toward a much larger level catalog; that expansion is a design horizon, not first-release scope.

## Technical constraints

- Browser game deployed through GitHub Pages.
- Landscape-first touch gameplay on phones and tablets, with desktop support.
- Build tooling, TypeScript, and third-party libraries are allowed when they provide proven building blocks and reduce bespoke engine work.

## Related documents

- [Tower defense concept](docs/tower-defense-concept/index.html)
- [ADR-001: Level intent vs compiled split](docs/adr/001-level-intent-compiled-split.md)
