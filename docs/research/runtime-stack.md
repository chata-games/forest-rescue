# Forest Rescue web-game runtime and rendering stack

**Decision date:** 2026-07-14  
**Status:** Recommended, subject to the proof gate below

## Decision

Use **Phaser 4.1.x + strict TypeScript + Vite** for the Forest Rescue revamp.
Render the battlefield and campaign-map composition in Phaser/WebGL, while
keeping responsive menus, settings, loadout selection, the rotate-device gate,
and other text-heavy controls in semantic HTML/CSS. Use **Vitest** for headless
domain and content-pipeline tests and **Playwright** for real-browser touch,
orientation, visual, and deployment smoke tests.

Pin the exact Phaser version accepted by the proof rather than using a floating
range. Phaser 4.1.0 is the current stable release in this research snapshot, but
Phaser 4 itself only reached stable in April 2026 and replaced its rendering
pipeline; that recency is the main risk to retire before the full rebuild.
Phaser's official release history and changelog document both the April releases
and the new renderer ([releases](https://github.com/phaserjs/phaser/releases),
[Phaser 4.0 changelog](https://github.com/phaserjs/phaser/blob/master/changelog/v4/4.0/CHANGELOG-v4.0.0.md)).

Treat **WebGL as a runtime requirement**. Phaser 4 deprecates its Canvas renderer,
and its advanced effects have no Canvas equivalents
([Phaser 4.0 changelog](https://github.com/phaserjs/phaser/blob/master/changelog/v4/4.0/CHANGELOG-v4.0.0.md),
[game-object effects](https://docs.phaser.io/phaser/concepts/gameobjects)). Show a
friendly unsupported-device screen if WebGL initialization fails; do not carry a
second custom Canvas renderer through the codebase.

## Context and non-negotiables

This choice is for a landscape, touch-first, painterly 2D tower-defense game for
ages 8–14. Version one has ten levels but its content model should later support
roughly one hundred. Level geometry, routes, build rings, campaign nodes, and hit
areas must remain data-driven and programmatic rather than baked into background
images. The project explicitly prefers established building blocks over a bespoke
engine and permits TypeScript, dependencies, and a build step. It deploys as a
static GitHub Pages project.

The existing intent/compiled-level split remains a useful boundary even though
its implementation is open to replacement: creative level data is validated and
compiled separately from the runtime that presents it
([ADR-001](../adr/001-level-intent-compiled-split.md)). The runtime decision should
not pull simulation or balance rules into Phaser scene classes.

## Decision rubric

Scores are 1 (poor) to 5 (excellent). Weighted totals are decision aids, not
synthetic benchmarks. No candidate receives performance credit it has not proved
on the target phones.

| Criterion | Weight | Phaser 4.1 | PixiJS 8 | Custom Canvas 2D |
|---|---:|---:|---:|---:|
| Complete game building blocks; least bespoke engine work | 25% | 5.0 | 2.5 | 1.0 |
| Two-thumb input, hit testing, scaling, and mobile ergonomics | 20% | 4.5 | 4.5 | 3.0 |
| Painterly 2D composition, animation, particles, and effects | 15% | 4.5 | 5.0 | 3.0 |
| Data-driven architecture and headless-test seam | 15% | 4.0 | 4.0 | 5.0 |
| Maturity, browser reach, and adoption risk | 10% | 3.5 | 4.0 | 5.0 |
| TypeScript/build/test/Pages fit | 10% | 5.0 | 5.0 | 5.0 |
| Footprint and dependency simplicity | 5% | 3.0 | 4.0 | 5.0 |
| **Weighted total** | **100%** | **88.5** | **79.5** | **66.0** |

Phaser wins because framework completeness is unusually valuable here. Forest
Rescue needs scenes, cameras, scaling, input, loading, animation, tweens, audio,
particles, and rendering. PixiJS is the stronger renderer in isolation, but using
it would make the team assemble or write several of those game systems. Custom
Canvas would repeat the current project's core problem: every improvement to the
game competes with maintaining a home-grown engine.

## Candidate analysis

### Phaser 4.1

Phaser is the only candidate of the three that supplies the whole browser-game
runtime rather than primarily drawing primitives. Each Phaser scene owns a
display list, update loop, cameras, input, and loader, and multiple scenes may run
together—for example, a battle with a UI overlay
([Scene API](https://docs.phaser.io/api-documentation/class/scene)). It also has
built-in tweens, pooled particles, texture management, animation, atlases, and
audio
([tweens](https://docs.phaser.io/phaser/concepts/tweens),
[particles](https://docs.phaser.io/phaser/concepts/gameobjects/particles),
[loader](https://docs.phaser.io/phaser/concepts/loader),
[audio](https://docs.phaser.io/phaser/concepts/audio)). Those are directly useful
for readable placement feedback, forest magic, enemy motion, impact effects, and
campaign transitions without adding a library for each concern.

The input system unifies mouse and touch as pointers, supports multiple active
pointers, draggable objects, custom hit areas, pointer-to-camera coordinates,
and input debug rendering
([input](https://docs.phaser.io/phaser/concepts/input)). That is a strong fit for
large invisible tap regions around small art, two-thumb interaction, drag
cancellation tests, and the same gameplay on touch and desktop. The scale manager
provides aspect-preserving fit/expand modes, centering, viewport information,
resize events, fullscreen, and orientation handling
([scale manager](https://docs.phaser.io/phaser/concepts/scale-manager)). This does
not design the mobile controls for us, but it removes low-level coordinate and
canvas-resize plumbing.

Programmatic trails are a first-class fit. Phaser paths combine line, Bezier,
ellipse, and spline curves, can be sampled by distance, and can drive followers
or custom movement
([Path](https://docs.phaser.io/api-documentation/class/curves-path),
[Spline](https://docs.phaser.io/api-documentation/class/curves-spline)). Graphics
objects draw and stroke paths and primitive shapes
([Graphics](https://docs.phaser.io/api-documentation/class/gameobjects-graphics)).
Therefore ImageGen can supply terrain-only backgrounds and reusable props while
compiled data supplies route geometry, route styling, rings, campaign nodes, and
large interactive hit shapes. Nothing important needs to be inferred from pixels.

Phaser also has an official Vite/TypeScript project template that produces a
static `dist` directory
([template](https://github.com/phaserjs/template-vite-ts)). Use it as a reference,
not verbatim: create a minimal local Vite setup and omit the template's optional
telemetry script.

The costs are a larger and coarser-grained runtime than PixiJS, a framework-shaped
scene lifecycle, and the recency of Phaser 4's renderer. Its package exposes an
ESM build and TypeScript declarations, but not Pixi-style granular renderer
subpaths
([Phaser 4.1 package metadata](https://raw.githubusercontent.com/phaserjs/phaser/v4.1.0/package.json)).
Do not import Phaser from domain, simulation, compiler, or content-schema modules;
otherwise fast unit tests and a later renderer change become unnecessarily hard.

### PixiJS 8 plus supporting libraries

PixiJS 8 is a high-quality retained-mode renderer. Its architecture includes a
scene graph, renderer, asset system, and ticker
([architecture](https://pixijs.com/8.x/guides/concepts/architecture)). It provides
promise-based asset manifests and bundles
([assets](https://pixijs.com/8.x/guides/components/assets)), a unified DOM-like
mouse/touch pointer model with custom hit areas
([events](https://pixijs.com/8.x/guides/components/events)), and an opt-in DOM
accessibility overlay
([accessibility](https://pixijs.com/8.x/guides/components/accessibility)). Its
modular extension architecture and rendering focus make it the best candidate if
custom rendering control and bundle composition dominate all other criteria.

For Forest Rescue, however, PixiJS would still need at least:

- an audio library such as `@pixi/sound`;
- a scene/state lifecycle and transitions;
- game-camera behavior or another viewport library;
- tween/timeline conventions;
- a consistent particle/effect abstraction; and
- more application-owned loading, pause/resume, and teardown policy.

The official PixiJS ecosystem separates these concerns, and tilemap support lives
in PixiJS Userland rather than core
([ecosystem](https://pixijs.com/8.x/guides/getting-started/ecosystem),
[Userland tilemap](https://github.com/pixijs-userland/tilemap),
[`@pixi/sound`](https://github.com/pixijs/sound)). Forest Rescue does not require
tilemap physics, but this separation illustrates the tradeoff: PixiJS deliberately
offers renderer primitives, leaving game-runtime composition to us.

PixiJS is also not a Canvas-fallback answer. Its production recommendation is
WebGL; WebGPU is still maturing and Canvas is listed as coming soon
([renderers](https://pixijs.com/8.x/guides/components/renderers)). It therefore
does not materially improve the target-browser decision. Choose PixiJS only if
the proof finds a blocking Phaser 4 issue or later requirements demand renderer
control that outweighs owning the missing game systems.

### Custom Canvas 2D baseline

Canvas 2D is broadly available and capable of game graphics
([Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)). Native
Pointer Events unify finger, pen, and mouse and support multiple simultaneous
pointers, cancellation, and pointer capture
([Pointer Events](https://www.w3.org/TR/pointerevents3/),
[multi-touch guide](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events/Multi-touch_interaction)).
`requestAnimationFrame` supplies repaint scheduling but leaves time-step behavior
to the application
([requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)).
Web Audio is powerful, but applications still handle user-gesture unlocking,
cross-browser behavior, loading, mixing, and controls
([Web Audio best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices)).

Those primitives are enough to build Forest Rescue, but not enough to avoid
building its engine. Scene graphs, z-order, transforms, cameras, asset lifecycles,
sprite animation, tweens, particles, filters, spatial hit testing, audio policy,
and teardown would all remain project code. This baseline has the smallest vendor
risk and best raw test seam, but directly contradicts the goal of reusing
established game building blocks. Reject it as the production runtime.

## Recommended architecture

The framework should be an outer rendering/input adapter, not the game's domain
model:

```text
validated level/content data
          |
          v
pure TypeScript domain + deterministic simulation
          |
          v
Phaser presentation adapter ---- semantic HTML/CSS shell
 (battlefield/map/effects)       (menus/loadout/settings/rotate gate)
```

Recommended concrete stack:

- **Runtime:** Phaser 4.1.x, exact version pinned after proof; WebGL renderer.
- **Language:** TypeScript with `strict`, `noUncheckedIndexedAccess`, and no
  implicit engine types leaking into domain contracts. TypeScript's strict-null
  checking makes missing data explicit before runtime
  ([TypeScript basics](https://www.typescriptlang.org/docs/handbook/2/basic-types.html)).
- **Build:** Vite 8 with `base: '/forest-rescue/'`, static `dist` output, and
  content/assets addressed through Vite-safe URLs. Vite's first-party Pages guide
  requires the repository base path and an Actions build/deploy workflow
  ([Vite Pages deployment](https://vite.dev/guide/static-deploy.html#github-pages)).
- **Content validation:** JSON Schema plus Ajv (already used by the repository),
  with generated or hand-maintained TypeScript types checked against fixtures.
  Keep authoring/compilation/simulation independent of Phaser.
- **Unit and simulation tests:** Vitest 4 under Node for deterministic rules,
  geometry, compiler, balance, save migrations, and content validation. Vitest is
  Vite-powered and shares its transform/config model
  ([Vitest guide](https://vitest.dev/guide/)).
- **Browser tests:** Playwright on Chromium and WebKit projects, including
  landscape phone/tablet viewports, touch-enabled device profiles, screenshots,
  and traces on failure. Playwright device emulation includes viewport, screen,
  user agent, and `hasTouch`
  ([emulation](https://playwright.dev/docs/emulation)); it can retain screenshots,
  videos, and traces
  ([test options](https://playwright.dev/docs/test-use-options)).
- **UI:** framework-free semantic HTML/CSS over or beside the canvas. Do not add
  React merely to render a small set of game screens. Use Phaser objects for
  spatial battlefield/map interaction and DOM controls for text-heavy flows.
- **Physics:** none initially. The existing spline/path, targeting, and spatial
  query domain is a better match than a general collision solver. Add a physics
  subsystem only when a concrete mechanic needs it.

For content expansion, one scene class must not equal one level. A small set of
generic scenes—boot/preload, campaign, loadout, battle, results—should consume
validated level definitions. Load assets in bundles by shared core, act/biome,
and level so adding levels does not increase first-load cost linearly. Keep route
coordinates and campaign-node coordinates in data; background art contains no
click targets or authoritative paths.

## Smallest proof before permanent adoption

Build one disposable vertical slice, not a production level. It should use current
representative art and one compiled route, and it should prove only the risky
boundaries:

1. **Programmatic composition:** terrain-only background; a stroked spline trail;
   three large invisible-hit-area fairy rings; one clickable campaign node; a
   defender, enemies, projectiles, particles, and a range preview.
2. **Two-thumb input:** configure at least two active pointers; hold or drag a
   control with one thumb while tapping/placing with the other. Verify
   `pointerupoutside`, cancellation, and no repeated accidental placements.
3. **Responsive landscape:** run at representative small-phone, large-phone,
   tablet, and desktop landscape sizes with safe-area insets. Rotate to portrait,
   show the blocking rotate gate, rotate back, and preserve the exact battle state.
4. **Lifecycle/audio:** background and foreground the page on iOS Safari and
   Android Chrome. Audio must unlock after a gesture, suspend cleanly, and resume
   without duplicate loops or a dead context.
5. **Representative load:** exercise the expected upper-bound mix of defenders,
   enemies, projectiles, route graphics, and effects for several minutes. Record
   frame-time and memory evidence on at least one real iOS device and one real
   Android device; do not accept desktop emulation as the performance proof.
6. **Architecture seam:** run one deterministic battle simulation in Vitest with
   no DOM, Canvas, WebGL, or Phaser globals. The Phaser scene renders snapshots of
   domain state and sends typed commands back.
7. **Production path:** `vite build`, serve `dist` under `/forest-rescue/`, and run
   Playwright Chromium/WebKit smoke tests against that base path. Verify all JSON,
   atlases, audio, and lazy asset bundles load without root-relative 404s.

**Go** if both real phones complete the interaction, orientation, lifecycle, and
representative-load checks without a Phaser-level blocker, and the headless seam
remains clean. Small game-specific adapters and normal device-specific workarounds
are acceptable. **Stop and run the same proof on PixiJS 8** if Phaser 4 loses
input, render state, or audio across ordinary mobile lifecycle transitions, has a
repeatable performance defect at representative load, or forces domain rules into
scene/game-object inheritance to remain testable.

## Consequences

The project gains mature game systems and can spend its custom code budget on
Forest Rescue's actual differentiators: touch ergonomics, level design, teaching,
counterplay, art direction, and content tooling. The cost is accepting WebGL,
shipping a larger runtime than a renderer-only solution, and managing a recently
rewritten Phaser renderer. The proof gate makes that trade explicit instead of
discovering it after ten levels have been rebuilt.
