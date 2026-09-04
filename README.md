# Forest Rescue: Heartwood

Tower-defense evolution of Forest Rescue. Defend the Heartwood grove against ChopCo with fairy-ring defenders on compiled spline paths.

## Play

Requires the dev server (ES modules + level JSON):

```bash
cd forest-rescue
npm install
npm run serve
```

Open http://localhost:8341

- **Campaign** — levels 1–3 vertical slice
- **Classic lane mode** — http://localhost:8341/?mode=legacy
- **Debug overlays** — add `?debug=1`
- **Direct level** — `?level=01-meadows-edge`

## GitHub Pages

Play at https://chata-games.github.io/forest-rescue/. For the first deployment, set **Settings → Pages → Source** to **GitHub Actions**.

The deploy workflow also builds the Phaser battle stack (`app/`, `npm run build:app`) into `dist/app/`, so the new build is live at https://chata-games.github.io/forest-rescue/dist/app/ and linked from the start screen.

### Playing sideways on an iPhone

iPhone browsers (Safari and Chrome, both WebKit) do not rotate while **Portrait Orientation Lock** is on, and a web page cannot lock or request an orientation there. Both the legacy page and the Phaser app have a **Sideways mode** that rotates the game 90 degrees inside the portrait browser: the start screen's **Rotate screen** toggle and the HUD ⟳ button on the legacy page; **Rotate the screen** in the "Best played sideways" tip and the **Sideways** toggle under Pause → Settings in the app. The preference is remembered; it only takes effect while the viewport is actually portrait.

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

- `src/` — ES module game engine (browser, no runtime npm deps)
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
npm test
```

## Follow-up work

Ready-to-use agent prompts for levels 4–10: [docs/prompts/](docs/prompts/)
