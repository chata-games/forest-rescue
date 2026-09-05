# Forest Rescue: Heartwood

Tower-defense evolution of Forest Rescue. Defend the Heartwood grove against ChopCo with fairy-ring defenders on compiled spline paths.

## Play

Use Node.js 22 or later:

```bash
npm ci
npm run dev:app
```

Open [the local app](http://localhost:4173). To test the production files, run
`npm run build:app` and `npm run serve`, then open [the built app](http://localhost:8341).

The Phaser app contains the seven authored campaign levels. Use
`?level=01-meadows-edge` to open a level directly, or `?preview=1` for the
level geometry overlay.

## GitHub Pages

Play at https://chata-games.github.io/forest-rescue/. For the first deployment, set **Settings → Pages → Source** to **GitHub Actions**.

The deploy workflow builds the Phaser app and publishes `dist/app/` as the site root. The old app is not part of the deployed artifact.

### Playing sideways on an iPhone

iPhone browsers do not rotate while **Portrait Orientation Lock** is on. A web page cannot change this setting. Use **Rotate the screen** in the "Best played sideways" tip or **Sideways** under Pause → Settings. The app remembers the setting and uses it when the viewport is in portrait orientation.

## Level pipeline

Levels are authored as **LevelIntent** (creative brief) and compiled to **CompiledLevel** (geometry, rings, waves):

```bash
npm run author          # validate + compile all intents
npm run validate        # schema check
npm run simulate        # bot playtests
npm run preview         # PNG debug map
```

Same seed + compiler version → identical compiled output. CI fails if compiled files drift.

## Architecture

- `app/` — Phaser scene, DOM controls, and TypeScript battle simulation
- `src/` — shared terrain renderer, content, and level tooling modules
- `levels/intents/` — LLM-authored level briefs
- `levels/compiled/` — deterministic compiler output
- `tools/levelgen/` — compile, validate, preview
- `tools/simulation/` — heuristic bots
- `assets/catalog.json` — sprite manifest with provenance

See [CONTEXT.md](CONTEXT.md) and [docs/adr/001-level-intent-compiled-split.md](docs/adr/001-level-intent-compiled-split.md).

## Asset generation

ImageGen via Codex (`~/.claude/skills/codex-imagegen/imagegen.sh`). Prompts in `assets/prompts/`. Post-process:

```bash
node tools/assets/process.mjs
node tools/assets/build-atlas.mjs
```

## Tests

```bash
npm test               # domain and UI projection tests
npm run test:node      # compiler and asset checks
npm run test:e2e       # browser journeys
npm run typecheck
```

## Follow-up work

Design prompts for the campaign: [docs/prompts/](docs/prompts/)
