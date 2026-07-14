# Elder Trials — Agent Prompt

Star-gated remixed challenge variants after campaign completion.

## Scope

- Unlock when player has 3★ on a campaign level
- Runtime variant compiler: same intent, different seed pool + harder `targets`
- No new art required; reuse compiled biome + catalog

## Implementation

1. `levels/intents/elder/` — variant intents referencing base level id
2. `tools/levelgen/compile-elder.mjs` — bump difficulty targets 25%, new seed suffix
3. Campaign UI: shimmer marker on 3★ levels
4. Store elder stars separately in localStorage

## Pass criteria

Variant win rate 20–50% lower than base level for same bot.
