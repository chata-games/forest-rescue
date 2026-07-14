# Level 10: Heart of the Forest — Agent Prompt

Final boss The Terraformer; `spiral-boss`; boss-advances-map; Heartwood Pulse ability.

## LevelIntent

- `topology.archetype`: `spiral-boss`
- `bossId`: `the-terraformer`
- `levelModifiers`: `["boss-advances-map", "heartwood-pulse"]`
- 3-phase boss with Seed of Light exposed windows

## Engine

Boss advances along spiral for entire level; disables rings in radius.
Heartwood Pulse: tap charged Heartwood for radiant burst (player ability).
Terraformer spawns crews between phases.

## ImageGen

Use existing `boss-terraformer.png` as reference; phased damaged sprites.

## Simulation

Mastery check: only `upgrade-first` + spell timing bots win > 25%.
