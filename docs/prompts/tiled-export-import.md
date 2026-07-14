# Tiled Export/Import — Agent Prompt

Optional Tiled integration for inspection and human overrides.

## Export (`tools/tiled/export.mjs`)

CompiledLevel → Tiled JSON:
- Object layer: rings with custom properties `role`, `placement`
- Polyline layer: path samples
- Tile layers: optional baked preview (not canonical)

## Import (`tools/tiled/import-overrides.mjs`)

`levels/overrides/<id>.tiled.json` → merge ring position tweaks into recompile.
Never replace path samples from Tiled — only `overrides/` ring nudges.

## ADR

Document in `docs/adr/002-tiled-optional-overrides.md`.
