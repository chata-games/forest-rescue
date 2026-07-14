# Battlefield composition prototype

> **THROWAWAY PROTOTYPE.** Three battlefield visual-composition systems, switchable with `?variant=`, rendered on the same exact 844 × 390 phone stage. This answers which system can preserve the painterly concept-art quality while keeping the trail, fairy rings, units, effects, and hit regions data-driven and legible. It is not revamp implementation code.

## Run

```sh
npm run prototype:composition
```

Open `http://localhost:4174/` and use the bottom switcher or the left/right arrow keys:

- `?variant=plate` — one painted scene plate with programmatic geometry registered over it.
- `?variant=tiles` — material cells and sprite layers assembled entirely at runtime.
- `?variant=hybrid` — painterly base material plus spline masks, sprites, and programmatic effects.

Use **Inspect geometry** to reveal the shared route centerline, ring hit regions, unit footprints, and hazard region. The inspection state is shareable with `&inspect=1`.

## Evaluation question

Which approach keeps the phone-scale battlefield painterly and immediately readable without coupling art production to gameplay coordinates?
