# Phaser mobile device proof

> **THROWAWAY PROTOTYPE.** This branch answers whether Phaser 4.1.0, strict TypeScript, Vite, semantic DOM/CSS, and an engine-independent diagnostic model survive Forest Rescue's target mobile lifecycle. It is not revamp implementation code.

## Run

```sh
npm run prototype:mobile
```

Open the printed network URL on one recent iPhone/iPad in Safari and one recent Android device in Chrome. Keep each device in landscape for the 60-second performance run.

## Device checklist

1. Hold one thumb on each highlighted half until **Maximum** reads `2`.
2. Keep a thumb down, rotate to portrait, then back to landscape. Confirm the field still responds and **Cancellation** or **Recovered** advances.
3. Background the browser, return, tap **Resume audio + beep**, and confirm the beep is audible.
4. Tap **Start 60s performance run** and leave the page visible until the result appears.
5. Tap **Copy device report** and paste the JSON into the Wayfinder ticket.

The performance recommendation is average frame rate at least 50 fps, p95 frame time at most 25 ms, and frames over 25 ms at most 5%. The report preserves raw measurements so the decision can override that recommendation.

## Automated checks

```sh
npm run prototype:mobile:test
npm run prototype:mobile:build
npm run prototype:mobile:e2e
```

Automated browser checks prove the WebGL scene, Phaser atlas parser, representative 184-object workload, semantic shell, portrait layout, strict compilation, and relative-base production build. Real iOS Safari and Android Chrome remain the authority for multi-touch cancellation, audio lifecycle, and sustained device performance.
