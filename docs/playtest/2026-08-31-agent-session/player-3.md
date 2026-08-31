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

## Debate round 1

Process note: no prior debate sections exist in any report — this is the first round — so no
critique has been aimed at my list yet. I use the Defenses slot for pre-rebuttals to the
objections I expect, including one concession against my own data.

### Critiques

1. **P1 #2 — prep phase as a fixed 15–20s skippable countdown.** Disagree with the mechanism,
   agree with the diagnosis. A mandatory countdown taxes every retry, and my session lived on the
   retry loop: 5 restarts at ~1–2s each is why five defeats in 12 minutes stayed tolerable. A
   first-timer running 7+ attempts would sit through minutes of pure dead air. A "Start Wave"
   button with an early-call mana bonus gives newcomers unlimited planning time and veterans zero
   waiting; a fixed clock is the strictly worse shape. P2's variant (hold wave 1 until first
   placement or Start) is closer to right.
2. **P1 #3 — tint all rings red/green when a card is selected.** Disagree with the red half. From
   the clarity-in-chaos seat: mid-wave, tinting every ring red means the whole battlefield pulses
   red and green exactly when the player most needs to read enemy positions — I spent attempts
   3–5 hunting rings while borers crossed, and painting the map in alert colors makes that worse.
   Tint valid targets green only, leave invalid rings unstyled, and spend the shake + floating
   reason on the explicit failed tap. Feedback on the failed action teaches; feedback on every
   frame clutters.
3. **P2 #5b — gate waves on field clear.** Disagree, and this is my sharpest objection in the
   round. Field-clear gating deletes time pressure from the genre: once the next wave only comes
   when the field is clean, there is no overlap to manage, no "spend now or bank for wave 3" call,
   and late waves become untimed puzzles with infinite setup. That is a shallower game wearing
   this one's art. P2's own evidence (counter advances 3s after last *spawn*, waves visibly
   overlap) indicts the *signal*, not the *pressure*: a visible "next wave in Ns" timer plus a
   start gate keeps the clock honest and readable without removing it. Also flagging scope: this
   bundles an unrelated UI fix (card bar) with a design decision (pacing); they should be tracked
   separately because one is a bug and the other changes the game.
4. **P2 #1 — effort estimate "M-L if logic."** Miscalibrated. P1's forensics show the logic fix is
   one missing line (`cooldown -= dt`, present in `legacy-lane.js`). Three independent sessions of
   "towers do nothing" reducing to a one-line decrement means logic is effort S; only the
   feedback layer (HP bars, projectiles) is M. This matters for sequencing: the ship-stopper is
   also the cheapest item on the board.
5. **P1 #5 — explain units at point of use.** Right idea, incomplete for the first-hour lens it
   comes from. Card text and ring glyphs explain what a unit *is*; P1's own run log ("I never saw
   a projectile or a kill") shows the missing lesson is what a unit *did*. Enemy HP bars and
   floating kill income are how a newcomer learns cause and effect — without them, post-fix
   players will still report "my tower did nothing" whenever DPS is low. Merge this with combat
   feedback into one package rather than two lists.

### Defenses

- **Conceding my #5 (opening-triangle retune).** My "towers fire but wave 1 still leaks" data is
  contaminated. P1 traced DefenderEntity never decrementing cooldown — a shared class, so Boulder
  Pass has it too. What I recorded as my choke Sprig "visibly firing (green beam)" was almost
  certainly the idle green streak P1 describes under every sentinel, not a shot. My borer-HP vs
  tower-DPS reasoning was measured against towers that deal zero damage, so the tuning claim is
  unsupported until the bug is fixed. Revised: fix firing first, then re-measure the opener with a
  scripted fast build; tune only what the re-measure indicts. I keep the Thornvine-visibility half
  — placement verification is independent of DPS.
- **Standing by #2/#3 (canvas overflow, build bar).** P2 reproduced the resize break on 7/7 runs
  at 940px; I reproduced it on every Replay; it also ate my hearts/wave HUD cluster and made
  pause/mute unreachable for P2. Not graphical polish — it decides whether the game exists on a
  laptop.
- **Standing by #1 (start gate).** P1 lost 3 hearts while reading the screen on Meadow's Edge, P2
  lost a whole run to reading on Mushroom Hollow, I lost attempts on Boulder Pass. Three lenses,
  three levels, one structural hole — that is not tuning, it is missing scaffolding.

### Revised Top 5

1. **Fix the defender firing bug** (+ regression test: a defender must kill a dummy dummy in N
   seconds). Changed: new entry at #1 — P1's forensics explain my leaks and P2's zero kills, and
   it is the cheapest ship-stopper available.
2. **Clamp canvas/wrap to the viewport** on level entry and resize. Unchanged at #2; reproduced
   independently by all three players on three levels.
3. **Wave-start gate: "Start Wave" button between waves**, early-call mana bonus, no forced
   countdown. Changed: was my #1; kept the mechanism, switched from timer to button after weighing
   the cost to the instant-retry loop.
4. **Make the build bar fit normal windows** (wrap to two rows or scroll with a visible
   affordance). Was #3; P2's cut-off-card evidence (cheapest unit invisible at 940px) confirms
   priority over any new content.
5. **Combat verifiability + tower info**: enemy HP bars, kill/damage feedback, select-tower →
   range ring + one-line stats, card tooltips. Changed: replaces "retune opening triangle", which
   is demoted to post-fix measurement; Thornvine sprite visibility folded in here.

### Stance

The group's real priorities are converging fast — make defenders fight, make the level fit the
window, give players time to plan — and I back all three; my one live objection is to field-clear
wave gating, which must stay a visible timer, not a stopped clock.

## Debate round 2

### Critiques

**Of Player 2:**

1. **#3, field-clear wave gating. Objection maintained.** P2 kept field-clear gating in their
   revised #3 after both other players pushed back. My evidence: my entire session ran on the
   clock. Wave 2 arriving while wave 1 still walked is what killed me five times, and the 1-2s
   retry loop is the only reason five defeats in 12 minutes stayed tolerable. Remove the clock
   and Boulder Pass's waves 2 through 9, identical borers where only the spawn interval shrinks,
   become untimed placement puzzles with no decision left in them. P2's own data indicts the
   missing signal, not the pressure: the counter advanced 3s after the last spawn with no timer
   shown anywhere. That is a readability bug, fixed by a visible "next wave in Ns" countdown,
   not by stopping time.
2. **#1, per-level kill regression test. Right test, wrong justification.** P2 widened test scope
   to every level "because P3's beams contradict my dead air". My beams were a misread of the
   idle sprite, so that evidence is gone and I have retracted it. Keep the per-level tests anyway,
   for a reason that survives: ring and trail range sanity. A level whose rings sit out of range
   of its own trail would still produce zero kills after the cooldown fix, and only a per-level
   scripted kill catches that. My ring-60 "long-range" Thornvine on Boulder Pass is exactly the
   configuration such a test would check.
3. **#5, "flowers that don't respond". Overgeneralized from one level.** P2's four failed taps
   were all on Mushroom Hollow. On Boulder Pass I collected both flowers for +25 each in attempt
   4 with plain taps, and again in attempt 5. So the interaction works somewhere, which makes
   this a per-level config or hitbox bug, possibly entangled with P2's own shift-calibrated
   tapping on a broken canvas. Fix the failing level's data, not the mechanic. The income readout
   and floating +8 I support without reservation; my Game Over screens froze 250+ mana of
   unconvertible income, and that is waste a player can feel.

**Of Player 1:**

4. **#2, "first placement is an acceptable gate". Prefer the explicit button.** P1 merged my
   Start-button gate with P2's spawn-on-first-placement as equally acceptable. From my seat they
   are not equal. My opener puts tower 1 down inside 5 seconds, so first-placement gating
   launches wave 1 at tower 1 of 4 and hands the rest of my prep to the borer walk time, which I
   know is not enough because a 4-tower opener still lost. A Start button costs a veteran about
   1s per wave, gives a novice unlimited reading, and leaves no ambiguity about what counts as a
   placement. P1's "next wave in Ns" indicator between waves is right, and I have folded it into
   my list.
5. **#4, red/green ring tinting. The concession proves the point; finish it.** P1 scoped the tint
   to card-selected only, which concedes that a permanently painted map is noise. But mid-wave is
   exactly when cards get selected, so the busiest moments still get a red and green battlefield.
   On Meadow's Edge, Thornvine has exactly one legal ring: green on one ring pops, red on eight
   rings floods. I spent attempts 3 through 5 hunting rings while borers crossed, and what I
   needed was the valid target standing out, not the invalid ones shouting. Green-only highlight
   on legal rings, plus shake and a floating reason on the failed tap. That teaches on the
   mistake instead of painting every frame.

### Defenses

- **Opening-triangle retune (critiqued by P1 and P2 in round 1). Concession stands, now
  hardened.** My "choke Sprig visibly firing" was the static idle streak. The honest reading of
  my own screenshot is borers crossing my half untouched while decorative sprites glowed. The
  retune claim is withdrawn until this protocol runs: fix the decrement, script a 6-second
  role-correct opener on Boulder Pass, and retune borer HP or early tower DPS only if wave 1
  still leaks 2+ hearts against that opener.
- **Sell/refund (both P1 and P2 cut it). Full concession.** I dropped it in round 1 and I will
  not bring it back. Repositioning only matters when builds can be wrong, and in five defeats I
  never once wanted to move a tower. I wanted to know what I had bought. Refund is a real
  question after combat works, not before.
- **Early-call mana bonus (P1's caution). Conceded to the backlog.** My own runs are the
  evidence: I died banking 256+ mana. Surplus mana was never my binding constraint, so the bonus
  optimizes a resource my failures did not lack. Ship the gate first; add a flat, small bonus
  once players know what mana buys.
- **The firing-bug omission P1 flagged in round 1. Resolved.** It has been my #1 since round 1's
  revision.

### Revised Top 5

1. **Fix the defender firing bug**, with an entity-level dummy-kill test plus per-level scripted
   kills as ring/trail range sanity. Changed: test rationale rewritten. My beam misread is out;
   range sanity is in.
2. **Clamp canvas and build bar to the viewport** on level entry and window resize. Changed:
   absorbed my old #4, build bar fit, here per P2's same-overflow-root argument, which frees a
   slot.
3. **Wave-start gate: explicit "Start Wave" button plus a visible "next wave in Ns" timer
   between waves.** Changed: early-call bonus deferred to the backlog; P2's field-clear gating
   rejected and replaced by the timer.
4. **Placement legibility: green-only valid-ring highlight while a card is selected, shake plus
   floating reason on rejected taps, distinct Thornvine silhouette.** Changed: new standalone
   entry in the freed slot; the red tint is rejected on clarity grounds.
5. **Combat verifiability and tower info: enemy HP bars, kill and damage feedback, select-tower
   range ring with one-line stats, card tooltips.** Changed: sell/refund formally cut; content
   otherwise stable.

### Stance

The group's four pillars are right: fix combat, fit the window, gate wave 1, make the game talk
back. I'm on board, with three conditions: the wave clock stays visible and running, ring tints
go green-only, and the post-fix re-measure must push past wave 2, because all three of us died
before wave 3 and nobody has seen the back half of any of these levels.

