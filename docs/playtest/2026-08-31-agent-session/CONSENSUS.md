# Agent playtest consensus — 3 players, 2 debate round(s)

## Method

Three agents played the game by sight in real time, one level each, through the live deployment
(`chata-games.github.io/forest-rescue`): Player 1 on Meadow's Edge (level 1) with a first-time
player lens, Player 2 on Mushroom Hollow (level 4) with an efficiency-optimizer lens, Player 3 on
Boulder Pass (level 7) with a veteran tower-defense tactician lens. Each wrote an independent
report, then the three debated for two rounds: round 1 critiqued and revised, round 2 settled the
remaining disputes and converged.

Headline shared result: **19 runs, 19 defeats, zero kills observed by any player on any level.**
All three traced the same root cause (see play-technical #1): defenders never fire, so every
balance observation this session was measured against zero DPS. Everything below survived the
debate; items dropped or deferred by consensus (fixed prep countdown, field-clear wave gating,
early-call mana bonus, sell/refund, campaign-marker dedup, pre-fix retuning) are left out.

## Final improvement list

### Graphical

1. **Fit the game to any window** — Fix the card-bar overflow first (root cause: cards at
   `min-width: min(280px, 92vw)` in a non-wrapping flex row — 8 × 280 + 7 × 8 = 2296px, the
   overflow width all three players measured): wrap cards to two rows or cap the game-screen
   grid track with `minmax(0, 1fr)`. Second, clamp the canvas/wrap to the viewport on level
   entry and window resize (canvas currently snaps 924→2296px on Replay, pushing half the map,
   the spawn-side rings and pause/mute off-screen). Third, hide or reset the HUD behind menu
   overlays (stale "Wave 1 / 8" is hardcoded markup in `index.html`). One root overflow ate
   rings, cards, buttons and HUD clusters on all three levels. Evidence: all three players,
   all levels; P2 reproduced on 7/7 runs at 940px, P3 diagnosed the 2296px snap live. Impact:
   H. Effort: S–M (toolbar and canvas halves are S). Risk: canvas sizing changes shift the
   screen↔world mapping — re-verify placement taps and pause/mute reachability after.

2. **Make placed defenders readable** — Distinct silhouette plus a subtle persistent outline on
   every placed defender (Thornvine's placed sprite was unfindable in any of P3's screenshots;
   P2 could not distinguish 2–3px sentinels from ring glow in dark Mushroom Hollow), plus a
   one-shot placement flash so the player can verify what they just bought. Evidence: P3
   (Boulder Pass, kept through both rounds), P2 (graphical obs #5, related). Impact: M.
   Effort: S. Risk: the outline must not read as a selection highlight.

### Play-technical

1. **Fix the defender firing bug, with a visible shot and a kill test** — Add the missing
   `this.cooldown -= dt` in `src/entities/defender.js` (initialized 0.45, gated on
   `cooldown > 0`, never decremented; the decrement exists only in `legacy-lane.js:97`).
   Add a regression test asserting a defender kills a stationary dummy within N seconds. Ship
   a minimal feedback rider with it — projectile or beam plus a death poof — so the fix is
   verifiable by eye, not only by assertion. Evidence: P1 found the root cause in source after
   7 sterile runs; P2's controlled run 6 (poachers passing a sentinel untouched) corroborates;
   P3's contradicting "green beam" was retracted as the idle sprite streak. Impact: H. Effort:
   S. Risk: the one-line fix flips every level from zero DPS to real DPS — no tuning until the
   re-measure below runs.

2. **Gate wave 1 behind an explicit Start-Wave button; show "next wave in Ns" between waves** —
   Wave 1 currently engages ~1.5–2s after level load; all three players lost hearts or whole
   runs while reading the screen. The button is the agreed mechanism (unlimited prep for
   novices, ~1s per wave for veterans, retry loop stays instant). The visible between-wave
   timer fixes the real readability gap (counter advancing 3s after last spawn with no signal)
   without stopping the clock. Explicitly rejected in debate: fixed countdown (taxes retries),
   first-placement auto-start (starts the clock on a blind click), field-clear gating (P2
   withdrew it; deletes genre time pressure). Impact: H. Effort: S. Risk: minimal; make sure
   the gate also applies after Replay.

3. **Make rejected actions speak** — Green-only highlight of valid rings while a card is
   selected (red tint rejected on mid-wave readability grounds); shake plus a floating reason
   on every rejected plant ("Needs an open-path ring", "Not enough mana") — today all four
   rejection cases (wrong ring type, no mana, paused, no selection) are silent, and P1 burned
   three of seven attempts unable to tell rule from bug; floating "+8" on kills so income is
   visible. Evidence: P1 (Meadow's Edge, 3 attempts lost), P2 (silent Thornvine placement),
   P3 (green-only amendment, adopted by P1). Impact: H. Effort: M. Risk: any always-on or
   red tinting reintroduces the map noise P3 objected to — keep it selection-scoped.

4. **First-minute literacy: role text first, numbers second** — One-line role description on
   every card (Thornvine is an on-path-only blocker; Sprig is a beside-path shooter — P1
   learned this from source, not the game), a range ghost at placement, and a mana-rate
   readout (~5/s) on the counter. Stat lines (damage/rate/range) come after role text — P2
   conceded the ordering; sell/refund and tap-to-inspect stay out. Evidence: P1 (#5 both
   rounds), P2 (#4 ship order, role-first conceded), P3 (tooltips reduced to role text).
   Impact: M. Effort: S–M. Risk: card-bar space is tight until the layout fix lands; keep
   role lines short.

5. **Fix mana flower taps** — Generous hitbox (current radius is `f.r * 1.4` with `r = 22`,
   ~31 world px tap target on an 8.5s despawn), a pickup burst on success, and one
   consistent, gently pulsing flower sprite (current plus/crescent/half-disc glyphs read as
   UI). Audit the per-level divergence: P3 collected both Boulder Pass flowers twice; P2 went
   0-for-4 on Mushroom Hollow — could be per-level data, not just the shared hitbox. Evidence:
   P1's code forensics, P2's four dead taps, P3's working counter-example. Impact: M. Effort:
   S. Risk: a shared-only fix would mask a per-level data bug — check both.

6. **Post-fix re-measure before any wave-1 retuning** — Every HP/DPS number this session was
   measured against inert defenders. Protocol agreed by all three: land the firing fix, script
   a fast role-correct opener (towers on chokepoint/long-range/gate rings within ~6s) per
   level, and retune borer HP, tower DPS or starting mana only if wave 1 still leaks ≥2 hearts
   against that opener. Evidence: P3 conceded their retune claim; P1 and P2 demanded the
   re-measure. Impact: H. Effort: M. Risk: tuning before this lands calibrates against a
   broken meter and moves again under you.

7. **Game Over summary** — Show wave reached, enemies leaked, and mana banked on the defeat
   modal (P2's modal froze an idle 593 behind nothing; P3 died banking 256+). Uncontested in
   debate; cheap and it makes every future loss readable. Impact: L. Effort: S. Risk: none
   worth naming (read-only modal additions).

## Quick wins

Impact ≥ M, effort S — do these first:

1. **Fix the defender firing bug** (`cooldown -= dt` + dummy-kill regression test + visible shot)
2. **Fit the game to any window** (card-bar wrap, canvas clamp, HUD scoped to gameplay)
3. **Start-Wave gate + "next wave in Ns" timer**
4. **One-line role text on every defender card**
5. **Fix mana flower taps** (generous hitbox + pickup burst)
6. **Distinct placed-defender silhouette (Thornvine) + placement flash**

## Unresolved

- **Enemy HP bars** — P1: optimizer polish that defers behind role text and kill feedback;
  P2 + P3: decision infrastructure (P2 needed a 3-run controlled experiment to detect zero
  DPS) that belongs in the first post-fix iteration.
- **Per-level regression sweep** — P1: single dummy-kill test now, per-level fixtures are
  over-engineered for this stage; P2 + P3: per-level scripted kills (and flower-pickup asserts)
  are the only check that catches rings sitting out of range of their own trail.
- **Tap-to-inspect on placed towers** (range ring + stats panel) — P3: tactics need tap-time
  numbers; P1 + P2: defer, nothing survived long enough to inspect and the first hour should
  not add UI.
