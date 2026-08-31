# Player 1 — Meadow's Edge (first-time player; onboarding & first-hour UX lens)

Playthrough of https://chata-games.github.io/forest-rescue/?p1 as a player who has never seen the
game. Every observation below traces to a screenshot I took or an action I performed in my own tab.
Seven full attempts, all ended in defeat (detail in the session log; the root cause turns out to be
a hard bug, not tuning).

## Session log

1. Loaded the start screen. The title, mascot art and one-line how-to ("Plant defenders on fairy
   rings beside the trail... Tap mana flowers for bonus mana") read well. But the in-game HUD
   (mana 100, "Wave 1 / 8", hearts, pause button) is already visible on the start screen, and a card
   at the bottom of the page is half cut off. Clicked Campaign.
2. Campaign map. Pretty painted map, but it contains TWO sets of numbered markers: wooden coins
   baked into the art (1, 2, 4, 5, 6, 9, 10) AND white circular UI buttons (1–10). As a first-timer
   I could not tell which were clickable; there is a duplicate "1", "4", "5" and "6". The HUD is
   still overlaid on this screen too. Clicked the white marker 1 at normalized (0.12, 0.72).
3. Level loaded: 157 mana, 5 hearts, "Wave 1" banner already up — the level starts playing
   immediately, no prep phase. I could see the tan trail, dashed fairy rings, and two defender cards
   (Sprig Sentinel 50, Thornvine Bramble 35). A stray gray rectangle floats near the trail and never
   moves (visible in every screenshot of every run).
4. Clicked a fairy ring with no card selected: nothing happened. No hint, no highlight, no menu.
5. Spent ~40 s reading the screen and level file. During that time wave 1 (3 loggers) walked the
   entire map and reached the Heartwood: hearts went 5 → 2 before I made a single move. Mana meanwhile
   climbed 157 → 399 with no visible source.
6. Clicked the Thornvine Bramble card (gold border appeared = selected, I assumed) and clicked
   several rings: nothing ever happened, no feedback of any kind.
7. **Defeat #1** during wave 2 — "The Heartwood was breached." I never successfully planted anything.
   I found Pause; its overlay covers the middle of the map, and planting while paused does nothing
   (clicks are swallowed).
8. Replay → **defeat #2**, again mid-fumbling in wave 2. (Later, from the source: Thornvine is an
   on-path-only blocker and Sprig is beside-path-only; every mismatched click is silently dropped.)
9. Replay #3 with the pairing figured out: Sprig on beside-path rings, Thornvine on the single
   on-path ring. Plants finally worked (mana dropped, green burst, sprites appeared — the units look
   charming: purple flowering sprigs, a bramble tangle sitting right on the trail). But the bramble
   died to the first logger in ~6–10 s and the logger strolled past its corpse.
10. Replays #4 and #5 with 4 Sprigs plus bramble replants: wave 1 leaked **exactly 3 of 3 loggers
    every single time** (hearts 5 → 2 every time), game over in wave 2 every time. I never saw a
    projectile or a kill. The Sprigs show a static green streak underneath even when no enemy is near —
    idle decoration, not shots.
11. Speed check across two timed screenshots: the lead logger moved ~132 screen px in ~5 s ≈ 45
    world px/s, matching its stated speed 42. No speed bug — my earlier feeling of "enemies
    teleporting" was my own command latency while the game runs in real time.
12. Final strategic attempt — gate-loaded defense (2 Sprigs + Bramble clustered on the bottom-left
    rings near the Heartwood, the classic "kill at the gate" setup). Wave 1 still leaked 3/3. In the
    last screenshot three Sprigs were firing range of loggers standing ON the Heartwood, at
    point-blank, and the loggers crossed alive.
13. Forensics: in `src/entities/defender.js`, `DefenderEntity` initializes `cooldown = 0.45`, checks
    `if (... || this.cooldown > 0) return;` before firing, and **never decrements cooldown anywhere**
    (the legacy mode `legacy-lane.js` has the missing `this.cooldown -= dt;` line). Result: defenders
    never fire, not even once. The live site serves `src/` directly, so the deployed game has this bug.
    This matches all behavioral evidence: 7 runs, zero kills ever observed, hearts always 5 → 2 in
    wave 1 (all 3 loggers leak), mana growing unexplained (it is just the 5.2/s passive income
    accumulating during my long turns).
14. Final state: 7 defeats, never saw wave 3. Last HUD seen: "Wave 2 / 8". The level, as deployed,
    is unwinnable — no defender ever deals damage.

## Graphical observations

1. **HUD bleeds onto menu screens.** [img: player-1-start-screen.png] What I saw: mana, "Wave 1 / 8",
   hearts, sound and pause buttons rendered above the title screen and the campaign map, before any
   gameplay exists. -> It makes the menus feel like a debug overlay and suggests the game is "already
   running" before you start; it also advertises "Wave 1/8" before the player knows what a wave is.
   -> Scope the HUD to the game screen (or grey it out on menus).
2. **Campaign map has two sets of numbered markers.** [img: player-1-campaign-map.png] What I saw:
   wooden number coins painted into the map art (1, 2, 4, 5, 6, 9, 10) plus white circular UI buttons
   with the same numbers in different positions. -> A first-time player cannot tell which set is
   interactive; I first aimed at a painted coin. -> Remove numbers from the background art or add a
   hover/press state and a soft pulse to the real buttons.
3. **Cut-off card at the bottom of the start screen.** [img: player-1-start-screen.png] What I saw:
   a rounded card sliver ("Magic Tree"?) peeking from the bottom edge, clipped mid-height.
   `scrollHeight == innerHeight`, so it cannot even be scrolled into view. -> Reads as a layout bug.
   -> Either fit it or hide it.
4. **Unexplained gray rectangle on the battlefield.** What I saw: a flat gray box near the top of the
   trail at the same spot in every run (world ≈ 860×220). -> Looks like a missing/placeholder sprite;
   players will report it as a glitch. -> Replace with a proper decoration or remove.
5. **Mana flowers are ambiguous.** What I saw: bright cyan shapes over the meadow — a crisp plus/cross,
   a crescent, a half-disc. Only the plus clearly reads "flower". -> The briefing says "tap mana
   flowers" but half the shapes look like UI glyphs. -> Give flowers one consistent sprite with a
   gentle pulse.
6. **No direction indicator on damage.** What I saw: hearts ticked from 5 to 2 while I was reading the
   screen; the only signal was the heart icons changing. -> I never saw *where* the breach happened.
   -> Flash the Heartwood bar and add a brief directional ripple from the leak point.
7. **Delight:** the painted campaign map, the purple flowering Sprig sprites, the bramble tangle
   sitting on the trail, and loggers trudging with backpacks are genuinely charming. The Game Over /
   Paused panels are clean and readable. The bones of the presentation are good.

## Play-technical observations

1. **Defenders never fire (game-breaking).** What happened: across 7 attempts with every placement
   strategy (front-loaded, mid chokepoint, gate-loaded), wave 1 leaked exactly 3/3 loggers every time
   and I never saw one projectile or one kill; three Sprigs at point-blank range let loggers cross
   alive. Root cause in `src/entities/defender.js`: `cooldown` is initialized to 0.45 and set to
   `cooldownMax` after firing, but never decremented (`legacy-lane.js` has `this.cooldown -= dt;`;
   the tower-defense defender does not), so the `cooldown > 0` gate returns forever. -> The level is
   unwinnable; all balance tuning downstream of this is meaningless. -> Add the missing decrement
   (and a unit test asserting a defender kills a stationary dummy enemy).
2. **No preparation phase.** What happened: wave 1 engages ~2 s after the level screen appears
   (`nextWaveTimer: 2`, `delayBefore: 1.5`); in run 1 I lost 3 of 5 hearts before my first successful
   interaction, purely while reading the screen. -> A first-time player's opening 30 seconds are
   spent losing, which teaches nothing except panic. -> Add a "Start wave" button or a 15–20 s prep
   countdown (skippable for veterans), and show "next wave in N s" between waves (the current gap is
   a silent 3 s).
3. **Every rejection is silent.** What happened: (a) clicking a ring with no legal defender →
   nothing; (b) planting a beside-path defender on the on-path ring (and vice versa) → nothing;
   (c) planting without enough mana (start budget 157 = 2 Sprigs + 1 Bramble) → nothing; (d) planting
   while paused → nothing. I burned three full attempts on these invisible rules. -> Distinguish
   "bug" from "rule" is impossible for a newcomer. -> Shake + red flash + a floating reason
   ("Needs an open-path ring", "Not enough mana"); when a card is selected, tint compatible rings
   green and incompatible ones red.
4. **Defender roles are never explained.** What happened: nothing on the cards says Thornvine Bramble
   is a 0-damage blocker that may ONLY sit on the single on-path ring, or that Sprig is a shooter for
   beside-path rings; I only learned this from the source. -> The level's one on-path ring makes
   Thornvine placement a hidden-information puzzle. -> One-line card descriptions plus a small
   path/grove glyph on each ring matching card compatibility.
5. **Economy is opaque.** What happened: mana climbed 157 → 399 → 600 across my early failures with
   nothing built and no flowers tapped (it is 5.2/s passive plus 8/kill, but nothing on screen says
   so). -> Players cannot make cost decisions if income is invisible. -> A small "≈5/s" readout on
   the mana counter and floating "+8" on kills.
6. **Bramble is a 6-second speed bump.** What happened: the 180 hp bramble died to one logger in
   ~6–10 s in every run, repeatedly; replanting it mid-wave was the only interaction that visibly
   did anything (because nothing else can fire — see #1). -> Even post-fix, a blocker that trades
   35 mana for ~6 s against one unit feels bad. -> Consider more HP or a contact slow.
7. **Pause blocks planning instead of enabling it.** What happened: the Paused overlay covers the
   map's mid-section and swallows canvas clicks, so the classic "pause and plan" move is impossible.
   -> Let players plant while paused (or shrink the overlay to a corner banner).
8. **A note on perceived pacing.** I initially recorded enemies "teleporting" and waves "resolving in
   seconds"; a controlled two-screenshot measurement showed loggers moving at their stated 42 px/s.
   The distortion was my own turn latency, not the engine. Real-time pace is reasonable for humans —
   but the loop does clamp `dt` at 0.08 s, so long tab-switches are handled safely. Good.

## Top 5 suggestions

1. **Fix the defender firing bug** — play-technical — Evidence: 7/7 defeats in waves 1–2, zero kills
   or projectiles ever observed, hearts 5→2 in wave 1 every run; missing `cooldown -= dt` in
   `src/entities/defender.js` (present in `legacy-lane.js`). — Proposal: decrement cooldown (and add
   a regression test: a defender must kill a dummy in N seconds). — Impact H, effort S.
2. **Add a prep phase / "start wave" control** — play-technical — Evidence: wave 1 engaged ~2 s after
   level load; I lost 3 hearts before my first plant in run 1. — Proposal: 15–20 s skippable prep
   countdown plus a visible "next wave in N s" indicator between waves. — Impact H, effort S/M.
3. **Make rejections speak; show ring compatibility** — play-technical — Evidence: three early
   attempts produced zero feedback across wrong-ring-type, no-mana and paused planting; the
   on-path-only rule for Thornvine is invisible. — Proposal: red/green ring tinting on card select,
   shake + floating reason text on failure. — Impact H, effort M.
4. **Scope the HUD to gameplay and de-duplicate campaign markers** — graphical — Evidence: HUD
   visible on start screen and campaign map [player-1-start-screen.png]; painted number coins
   duplicate the white UI buttons [player-1-campaign-map.png]. — Proposal: hide HUD on menus; remove
   numbers from the map art or visually distinguish buttons (pulse, hover, checkmark on completion).
   — Impact M, effort S/M.
5. **Explain units at point of use** — play-technical — Evidence: no card descriptions; discovered
   Thornvine's on-path-only blocker role only from source; one legal on-path ring in the level.
   — Proposal: one-line descriptions on cards, compatibility glyph on rings, plus a mana-rate readout
   to make the economy legible. — Impact M, effort S.

## Verdict

Not fun today — Meadow's Edge is unwinnable as deployed because defenders never fire a single shot,
so every strategy converges on the same wave-2 defeat; I ended 0 for 7. Setting the bug aside, the
opening seconds still punish newcomers (instant wave 1, silent failures, unexplained defender roles),
which is exactly the wrong first impression. The underlying design — fairy-ring placement, an
on-path blocker lane, mana flowers, charming sprites and a gorgeous campaign map — is genuinely
promising; with the one-line firing fix, a prep phase and honest feedback on rejected actions, this
could be a great first level.

## Debate round 1

### Critiques

**Of Player 2 (Mushroom Hollow):**

1. **#1 "Make defenders actually fight, or show that they do" — agree with the finding, disagree
   with the effort estimate and the remedy bundle.** P2 prices the logic branch at "large effort";
   it is one missing line. I re-verified today: `src/entities/defender.js` initializes
   `cooldown = 0.45`, gates firing on `cooldown > 0`, sets it to max after firing, and never
   decrements it — the decrement exists only in `legacy-lane.js:97`. Their proposed bundle
   (projectiles + hit flashes + enemy HP bars + floating damage) also over-shoots the first-hour
   need. From my play: I never needed damage numbers to know something was wrong — I needed
   *anything to happen at all*. Projectiles plus a death poof make combat verifiable by eye; HP
   bars and floating damage are optimizer polish that can wait.
2. **#5 "Gate waves on field clear" — disagree with the structural half.** In 7 runs I never once
   experienced wave overlap as my problem — I died to silent rejections and instant wave 1, and my
   run ended at wave 2 before overlap could matter. Field-clear gating redesigns pacing for every
   player to solve a readability problem that P2's own cheaper alternative ("Wave 2 incoming" +
   timer) already fixes. As written it's a taste change dressed as a bug fix, and it makes the
   game slower for veterans.
3. **#4 "One line of stats per card (damage / rate / range)" — partial disagreement on emphasis.**
   Numbers are the second coat of paint. In my runs 1–3 what would have saved me was not
   "damage 12 / rate 0.8s" but knowing Thornvine is an on-path-only blocker and Sprig a
   beside-path shooter — a role sentence plus visible ring compatibility. I had no mental model
   for stats to attach to; P2's optimizer lens assumes one. Keep stats on the roadmap, rank role
   text first.

**Of Player 3 (Boulder Pass):**

4. **#5 "Retune the wave-1 opening triangle" — disagree; this is my strongest objection in the
   round.** The evidence chain ("3–4 towers in 6s on role-correct rings still leak 3 hearts",
   "my choke Sprig visibly fired (green beam)") is confounded: defenders never fire on the
   deployed build, and there is **no beam rendering anywhere in `src/`** — the only projectile
   code sits behind the cooldown gate that never opens. What P3 saw as a beam is the static green
   streak baked into the `sprig-sentinel-idle` sprite, which I documented sitting under Sprigs
   with no enemy anywhere near. P2's controlled run 6 (poachers passing a sentinel untouched, no
   projectile, no HP change) corroborates. Tuning borer HP vs tower DPS now is tuning in the
   dark: with inert shooters, *every* opener leaks, so the data can't tell you what the correct
   opener should achieve. Fix the firing bug, re-measure, retune only if wave 1 still leaks. P3's
   top 5 also omits the never-fire bug entirely, which for their lens (difficulty honesty) is the
   difference between "hard level" and "broken level".
5. **#4 "Select → range ring + stats + sell/refund" — partially disagree on scope.** Sell/upgrade
   is a tactician's feature. Across 7 defeats I never once wanted to sell a tower; I wanted to
   know what I had bought. The first-hour critical 20% is a range ghost during placement and a
   one-line role description — full selection UI is more interface a newcomer must learn in a
   game whose current tutorial is one sentence on a start screen. Defer sell/stats to a later
   level's unlock, not the first hour.
6. **#1 early-call mana bonus — light caution only.** The Kingdom Rush pattern is proven and the
   gate itself is exactly right (all three of us lost hearts to a level that starts acting before
   we do). But the bonus is a second mechanic to teach in minute one; ship the gate, layer the
   bonus once players know what mana is for.

Credit where due: P3's fairy-ring invisibility observation matches my own hunt for buildable
rings, and their live diagnosis of the canvas overflow (924→2296 px on Replay) explains the
broken layout P2 suffered through 7 runs. I under-ranked layout in my original list because my
window never triggered it — that was luck of viewport size, not evidence the bug is minor.
Conceding below.

### Defenses

This is round 1; no critiques of my suggestions exist yet, so I'll defend the two most attackable
against the objections I expect:

- **Prep phase (my #2)** — expected objection: "tune wave 1 slower instead of adding a mode".
  Rebuttal from evidence: the failure is not tuning, it's that the game acts before the player
  has committed to acting. I lost 3 of 5 hearts while reading the screen; P2 lost run 1 entirely
  to reading; P3 loaded into wave 2 mid-read. Three lenses, one shared first-30-seconds failure.
  A slower wave 1 still starts without consent. I'll accept either gate (explicit Start, or P2's
  "spawn only after first placement") — revising my wording accordingly — and I keep the
  skippable countdown plus a between-waves "incoming" timer.
- **Ring compatibility tinting (my #3)** — expected objection: "red/green everywhere is
  hand-holding and visual noise". Rebuttal: three of my seven attempts died to silent mismatches
  (wrong ring type, no mana, planting while paused) with zero feedback, and I could not tell the
  game's rules from its bugs — I concluded the game was broken, which was also true. A first-time
  player has no other channel for learning placement legality. Conceding one refinement: tint
  only while a card is selected, so the map stays clean the rest of the time.
- My #1 (firing bug) needs no defense: both other players corroborate the symptom, and the root
  cause survived re-verification today.

### Revised Top 5

1. **Fix the defender firing bug** — unchanged at #1; corroborated by P2's controlled run, and
   root cause re-verified in source today. One line + a regression test.
2. **Start-wave gate + "next wave in Ns" indicator** — was my #2; now wording merges P2's
   first-placement alternative as an acceptable gate, and defers P3's early-call mana bonus.
3. **Clamp canvas/layout to viewport (entry + resize)** — NEW, conceded up from a sub-point of
   my old #4: P2 reproduced it 7×, P3 diagnosed it live, and it also explains the unreachable
   pause/mute buttons and clipped HUD/card bar I saw as separate symptoms.
4. **Make rejections speak + compatibility tint while a card is selected** — was my #3, narrowed
   by my own concession above.
5. **Explain units at point of use: one-line role text, range ghost on placement, mana-rate
   readout** — was my #5; narrowed from P2's numeric stat lines to role-first text, and from
   P3's select/sell panel to a placement-time range ghost; both heavier UIs explicitly deferred.

Changes vs last round: layout clamp enters at #3 (concession), role text replaces stat tables,
wave-gate wording merged across P2/P3 variants, and field-clear wave restructuring rejected.

### Stance

The group's four shared pillars (fix combat, gate wave 1, clamp layout, make the game talk back)
are the right spine and I'm fully on board — my open objections are to building optimizer
furniture (stat panels, sell UI) and restructuring wave pacing before those pillars land.

