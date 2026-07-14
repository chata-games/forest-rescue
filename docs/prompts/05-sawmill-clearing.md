# Level 5: Sawmill Clearing — Agent Prompt

Implement boss level 5 with **The Grinder** and Root Snare spell unlock.

## LevelIntent

- `topology.archetype`: `short-boss-assault`
- `bossId`: `the-grinder`
- `spellUnlock`: `root-snare`
- `waveOverrides`: final wave scripted boss; anti-bramble lesson
- `waves.count`: 10 + boss phase

## Engine work

1. Boss entity with phases, sawblade shrapnel, eats brambles
2. `waveOverrides` in intent schema — compiler emits scripted boss wave
3. Guardian spell: Root Snare (45 mana, 25s cd) — root snare AoE

## ImageGen

- `the-grinder-idle.png`, `the-grinder-damaged.png`
- Sawmill landmark debris, industrial biome materials

## Simulation

Boss level: win rate 30–60% for `upgrade-first` bot; fail CI if > 90% (too easy).
