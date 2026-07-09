# Forest Rescue

Save the magic jungle! A mobile-first 2D lane-defense web game: loggers and bulldozers
march in from the cleared farmland on the right — plant magical defender trees to stop
them before they reach the jungle heart.

## Play

No build step, no dependencies. Either:

- open `index.html` directly in a browser, or
- run `node serve.js` and open http://localhost:8341

## How to play

- Tap (or drag across) a grid cell to plant a **Magic Tree** (50 mana).
- Trees shoot magic orbs at enemies in their lane.
- Mana regenerates over time; tap glowing **mana flowers** for +25 bonus mana.
- **Loggers** chop trees; **Bulldozers** (wave 3+) are slow but tough and crush them.
- Every enemy that slips past the left edge costs one of 5 jungle hearts.
- Survive all 8 waves to save the jungle.

Touch-first controls (pointer events, large targets), responsive portrait/landscape,
works on phones, tablets, and desktop.

## Tech

- `index.html` / `styles.css` / `game.js` — vanilla ES6, HTML5 canvas, fixed-timestep loop,
  DPR-aware rendering, WebAudio-generated sound effects (mute toggle included).
- `assets/` — art generated with gpt-image via Codex CLI (`assets/raw/` holds the originals),
  sprites chroma-keyed to transparency with ImageMagick.
- If any asset file is missing, the game falls back to drawn shapes and stays fully playable.
