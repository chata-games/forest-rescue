# Player 3 — Boulder Pass (veteran tower-defense tactician)

Persona lens: I judge fairness under pressure, tactical depth, honesty of difficulty, and
battlefield readability when it gets busy. I played Boulder Pass (07-boulder-pass) in real
time via trusted browser input. Result: **5 defeats in ~12 minutes, 4 of them at Wave 2 / 10,
never past Wave 2.**

## Session log

1. Start screen → clicked **Campaign**. Map loaded; clicked my marker at normalized (0.9, 0.55)
   (level 7, "Boulder Pass"). First load rendered at my window size (940×763).
2. While I was reading the level layout and HUD for the first time (~40s), the level
   **auto-started**: by my first HUD read it was already **Wave 2 / 10 with 3 hearts gone** and
   I had zero towers. The first screenshot shows the boss excavator idling at the trail spawn
   from second zero.
3. I selected Mossback Golem and clicked the gate fairy ring — too late: **Game Over
   ("The Heartwood was breached")** at Wave 2 / 10. Defeat 1, no tower ever placed.
4. Clicked **Replay**. Immediately the battlefield broke: the world now rendered only in a
   ~230px strip on the right edge of the window; ~75% of the screen was empty green
   ([player-3-broken-layout-after-replay.png]). Diagnosed live: after Replay the canvas width
   snaps from 924px to 2296px (the page's overflowing layout width), so the 1536×1024 world is
   letterboxed inside a canvas wider than the window — the spawn half of the map was literally
   off-screen. I "maximized the window" (emulated 2360px viewport) to keep playing. While the
   view was broken, wave 1 + wave 2 walked through: **Defeat 2 at Wave 2 / 10.**
5. Attempt 3, wide window: Replay → immediately clicked Pause (a real player would). Pause
   blocks all canvas clicks — you cannot build while paused (the overlay swallows clicks).
   Resumed, then placed Sprig Sentinel @ chokepoint ring-53, Thornvine Bramble @ long-range
   ring-60, Sprig Sentinel @ gate ring-99 within ~6 seconds of resume. Wave 1's three
   tunnel-borers still all reached the goal; hearts 5 → 2, then wave 2's first leaks ended it:
   **Defeat 3 at Wave 2 / 10.**
6. Attempt 4: same opener but fastest possible order (Thornvine @ ring-53 first — cheapest,
   most central; Sprig @ gate; Thornvine @ ring-60), then collected both mana flowers (+25
   each) and added Mossback Golem @ gate ring-87. My choke Sprig visibly fired (green beam)
   and the Golem landed — wave 1's borers *still* leaked 3 hearts, wave 2 finished me:
   **Defeat 4 at Wave 2 / 10**, despite banking 256 mana by the end (see
   [player-3-wave1-towers-firing.png] — borers already deep in my half while towers fire).
7. Attempt 5 (final): opener down in under 5 seconds, clicked a placed tower to look for a
   range circle / stats / sell-upgrade UI — **nothing, towers cannot be inspected**. Collected
   flowers, attempted Golem @ ring-87 again. Same outcome: **Defeat 5 at Wave 2 / 10**, with
   256 mana unspent in the bank.
8. Checked HUD between every step (`mana/wave/hearts` + `window.__errs`): **zero JS errors all
   session**. Restart-loop time from Replay click to first possible build: ~2s — this part is
   fast and friction-free.

What the losses had in common: wave 1's three tunnel-borers leak ~3 hearts **even with 3–4
towers placed inside the first 6 seconds on the role-appropriate rings** (chokepoint,
long-range, gate). Tower kill income is generous (mana balloons to 250+), but it arrives only
after the leaks that already cost the run.

## Graphical observations

- **The battlefield is a bare grid, not a "Boulder Pass"** [player-3-first-load-bare-grid.png]
  → Ground is a flat brown tile grid with dark grout lines; "decorations" are flat pink/purple/
  olive circles; the biome named *Boulder Pass* contains no boulders. Compared to the lush,
  painted campaign map, the level reads as an untextured debug scene. This also hurts play:
  the eye has no texture to anchor positions on. → Suggestion: reuse the campaign map's art
  direction at field scale — scatter actual boulder/debris props, break up the grid, tint
  ground by biome. Effort M, impact H.
- **Fairy rings are nearly invisible** [player-3-first-load-bare-grid.png, faint dashed
  circles ~40px at ~15% contrast] → The single most important UI element — where you may build
  — is a faint dashed circle that disappears against the brown grid and the yellow trail.
  First-time players will not find the gate rings in time (I knew the coordinates from the
  level file and still had to hunt for them). → Suggestion: strong halo/glyph on empty rings,
  brighten on pulse; highlight rings when a card is selected (show all valid drop targets).
  Effort S, impact H.
- **Thornvine Bramble's placed sprite is effectively invisible** → I bought 1–3 Thornvines per
  attempt on confirmed rings (mana deducted) and could not locate a single one in any
  screenshot — it presumably sits flat on the ground in the same brown/olive palette. You
  cannot verify your own build or count your towers mid-fight. → Suggestion: distinct silhouette
  + one-shot placement flash + subtle persistent outline. Effort S, impact M.
- **Readability under pressure is actually decent where it counts** [player-3-wave1-towers-
  firing.png] → Sprig Sentinels (green creatures), their green beam projectiles, and the
  bulldozer enemies all read clearly at a glance; the "Wave 1" flag at the spawn is a nice
  orientation aid. Genuine delight: I could always tell where my Sentinels were and what they
  were shooting. → Keep this clarity level as more effects get added. —
- **HUD disappears on narrow windows** [player-3-first-load-bare-grid.png: only back arrow,
  level name, mana visible; hearts/wave cluster missing entirely] → On my 940px window the
  wave counter and hearts were pushed off-screen by the same overflow bug that broke the
  canvas — I played attempt 1–2 without seeing my hearts at all. → Same root fix as the
  layout overflow (below). Effort S (same fix), impact H.

## Play-technical observations

- **No prep phase: the level fires wave 1 at you ~1.5s after load** → delayBefore on wave 1 is
  1.5s and there is no "Start wave" gate; first leaks arrive ~30s later. Every loss in my
  session traces to this: a player reading the toolbar or admiring the map has already lost
  3 hearts before their first click. 5/5 of my defeats died at Wave 2. For a level with
  `estimatedDifficulty: 0.94`, deleting the planning phase makes the difficulty feel
  *dishonest* — you lose to the clock, not to tactics. → Suggestion: add a wave-start gate
  ("Start" button between waves, bonus mana for early call like Kingdom Rush) or at minimum a
  15–20s grace countdown before wave 1. Effort S–M, impact H.
- **Canvas resizes to the page's overflow width on Replay, pushing half the map off-screen**
  [player-3-broken-layout-after-replay.png] → Live-diagnosed: before Replay the canvas is
  924px wide (fits my 940px window); after Replay its width snaps to 2296px — the width of
  `canvasWrap`, which itself overflows the viewport. The world is then centered in a canvas
  wider than the window, so the left ~75% of the screen is empty green and the trail spawn is
  at x≈1900, invisible. Any window narrower than ~2300px gets a partially blind game exactly
  when it restarts. I had to emulate a 2360px window to continue playing at all.
  → Suggestion: size canvas (and `canvasWrap`) to the visible viewport with a `resize`
  listener; clamp, don't overflow. Effort S, impact H (blocker on laptops).
- **Half the build bar is unreachable on a normal window** → The toolbar lays 8 cards out in a
  row (scrollWidth 2296px, `overflowX: visible`): on my 940px window only Mossback Golem,
  Sprig Sentinel and Thornvine Bramble were reachable; Wisp Willow was half-cut and Dewdrop
  Nymph, Firefly Beacon, Mushroom Shaman and the Cleansing Rain spell were fully off-screen
  with no scroll affordance. I played five attempts without ever being able to evaluate half
  the kit. → Suggestion: wrap cards to two rows or make the bar horizontally scrollable with
  a visible affordance. Effort S, impact H.
- **Zero tower information: no tooltips, no range, no inspection, no sell/upgrade** → Cards
  show only name+cost; clicking a placed tower does nothing (no range circle, stats panel,
  sell, or upgrade — tested repeatedly, including on camera in attempt 5). I bought every
  tower blind: I still do not know what Wisp Willow or Firefly Beacon does, whether Mossback
  Golem blocks, or what my towers' range is — and there is no way for any player to find out
  in-game. For a tactician this is the depth-killer: tactics need numbers. → Suggestion:
  select a placed tower → range ring + stats + sell/refund; hover/first-click on a card →
  one-line description + range preview ghost. Effort M, impact H.
- **Pause is a dead button during the phase it would help most** → The Paused overlay swallows
  canvas clicks, so you cannot build or rearrange while paused. Most TDs allow building while
  paused precisely so players can plan under pressure; here Pause only helps you *watch* a
  loss happen. → Suggestion: allow placement while paused (and it then doubles as a
  first-wave planning tool). Effort S, impact M.
- **DPS/economy mismatch: mana piles up past the point it can save you** → By Game Over I
  typically held 250+ mana (kill + wave income) — more than enough for 2 more towers — but the
  leaks that ended the run had already happened. Meanwhile 3–4 towers placed in the first 6
  seconds could not kill wave 1's three borers. Killing power arrives too late and too slowly
  relative to borer speed/HP on a 1697px path. → Suggestion: retune the opening triangle
  (borer HP/speed vs Sprig/Thornvine DPS vs starting mana 145) so that a fast, correct opener
  clears wave 1 with 0–1 leaks; or make early kill income arrive *during* the wave that
  matters. Effort M, impact H.
- **Waves 2–9 are the same wave with a faster clock** → Per the compiled level: waves 2–9 are
  each 5–6 tunnel-borers, only spawnInterval shrinks (1.34 → 0.92). No composition change, no
  new threat to tactically react to until the excavator at wave 10. I never got there, but the
  roadmap is flat. → Suggestion: vary composition (fast/slow/armored mixes) from wave 3–4 so
  mid-waves ask different placement questions. Effort M, impact M.
- **Restart loop is fast and clean** → Replay → new run in ~1–2s, mana/hearts reset, no errors
  in `window.__errs` across the whole session. Dying 5 times was tolerable *because* retries
  are instant. → Keep this. —

## Top 5 suggestions

1. **Add a wave-start gate / prep phase** — play-technical. Evidence: 5/5 defeats, 4 at Wave 2,
     first leaks ~30s after load with no tower possible in time; wave-1 `delayBefore` is 1.5s.
     Proposal: "Start Wave" button between waves (+ optional early-call mana bonus); ≥15s grace
     before wave 1. Impact **H**, effort **S–M**.
2. **Fix the canvas/wrap overflow so the level fits the window** — graphical/play-technical.
     Evidence: [player-3-broken-layout-after-replay.png] — canvas width snaps 924→2296 on
     Replay; spawn half of map off-screen below ~2300px window; HUD (hearts/wave) also
     clipped at 940px. Proposal: clamp canvas + wrap to viewport, listen for resize.
     Impact **H**, effort **S**.
3. **Make the build bar usable on normal windows** — play-technical. Evidence: scrollWidth
     2296 vs 940 window; 4.5 of 8 cards unreachable, no scroll affordance. Proposal: wrap to
     two rows or scroll with arrows/fade. Impact **H**, effort **S**.
4. **Give towers information: select → range ring + stats + sell; card tooltips** —
     play-technical. Evidence: clicking placed towers does nothing; cards carry no stats; I
     bought every tower blind and still can't name what Wisp Willow does. Proposal: selection
     UI with range ring and refund; first-touch tooltip on cards. Impact **H**, effort **M**.
5. **Retune the wave-1 opening triangle and show placed towers clearly** — play-technical +
     graphical. Evidence: 3–4 towers in 6s on role-correct rings still leak 3 hearts; 250+
     mana banked at Game Over; Thornvine placed sprite unfindable in any screenshot.
     Proposal: lower borer HP/speed or raise early tower DPS so a correct opener holds wave 1
     to ≤1 leak; distinct Thornvine sprite + placement flash. Impact **H**, effort **M**.

## Verdict

Boulder Pass is not playable today for anyone on a laptop-sized window: after the first Replay
the canvas overflow bug hides half the level and most of the build bar, and even with the
window forced wide, the absent prep phase plus a mistuned wave 1 means a fast, role-correct
opener still loses by Wave 2 — five times out of five. The bones are good (instant retries,
readable defenders/beams/enemies, clean HUD, zero JS errors); add a start-wave gate, clamp the
layout to the viewport, and let players see tower ranges, and this becomes a legitimately
challenging mid-campaign level instead of a coin-flip against the clock.
