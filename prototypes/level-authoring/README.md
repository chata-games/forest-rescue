# PROTOTYPE — Level authoring loop

This throwaway prototype asks whether one author-owned `LevelIntent`, a separate campaign manifest, and two-speed feedback make a practical level-authoring model: every save performs structural and catalog validation, deterministic compilation, acceptance checks, and a geometry preview; slower bot simulations run only when requested. It deliberately does not decide campaign progression, Loadout, Challenge, or Guidance rules.

Run it from the repository root:

```sh
npm run prototype:authoring
```

Keep the TUI open and edit either:

- `prototypes/level-authoring/canopy-crossing.level.json`
- `prototypes/level-authoring/heartwood-v1.campaign.json`

Every save replaces the terminal frame with the current source summary, validation result, compiled metrics, target checks, and an ASCII battlefield preview. Press `s` to run the slower acceptance simulations, `r` to reload, and `q` to quit.

For a non-interactive proof:

```sh
npm run prototype:authoring -- --once --simulate
```

The prototype tests these boundaries:

- A `LevelIntent` has a stable semantic ID and contains no coordinates.
- Campaign membership and ordering live in a separate manifest; total and position are derived from `levelIds.length`.
- Fast checks run on every save; simulations are explicit and report scenario-level expectations.
- The compiler owns geometry, fairy-ring placement, exact waves, and metrics.
- The ASCII preview proves that authoring feedback can be generated from compiled data without coupling gameplay geometry to artwork.

The production preview should use the chosen phone-scale Phaser renderer with geometry overlays; the ASCII view exists only to make this logic prototype cheap to run and easy to inspect.
