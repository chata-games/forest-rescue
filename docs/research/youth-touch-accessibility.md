# Youth-friendly touch and accessibility criteria

**Status:** decision research for Forest Rescue  
**Audience:** players roughly 8–14  
**Platform:** static web game on GitHub Pages  
**Reviewed:** 2026-07-14

## Decision

Forest Rescue should adopt **WCAG 2.2 Level AA as its accessibility baseline** and a stricter project target for touch, comprehension, feedback, and performance. A polished game for children should not merely scrape past the 24 CSS-pixel WCAG minimum: its normal interactive targets should be at least 48 CSS pixels, every drag should have a tap alternative, all critical information should be redundant across color/shape/text or audio/visual channels, and teaching should be brief, replayable, and independent from battle difficulty.

The planned landscape-first presentation is compatible with this direction, but a **blocking rotate-device screen is not compatible with WCAG 2.2 AA** unless landscape is essential. W3C explicitly identifies asking a user to reorient as a failure, and “essential” means the functionality cannot be achieved another conforming way—not that landscape is more comfortable. Forest Rescue can be made top-down or compact in portrait, so the defensible solution is:

- recommend landscape and optimize it for two-thumb play;
- keep menus, the campaign map, and settings fully usable in either orientation;
- offer a compact but complete portrait battlefield, with an optional “Best played in landscape” advisory that can be dismissed;
- preserve the battle and clear any active pointer gesture when orientation changes.

If the project intentionally keeps a blocking landscape gate, it must record that as a known exception and must not claim WCAG 2.2 AA conformance. See [WCAG 2.2 SC 1.3.4][wcag-orientation], its [understanding document][orientation], and W3C failure [F100][f100].

## How to read these criteria

- **AA requirement** means normative when the project claims WCAG 2.2 Level AA. The linked WCAG Recommendation is normative; W3C “Understanding” pages explain it but are informative.
- **Legal condition** means a law or rule can apply when its jurisdiction and triggering facts apply. This report is product guidance, not legal advice.
- **Project requirement** is a recommended Forest Rescue acceptance criterion, often stricter than WCAG.

WCAG conformance applies to the whole page and complete processes, not just the DOM surrounding a canvas. A canvas or game engine is not an accessibility exception.

## Acceptance criteria

### 1. Touch targets, spacing, and direct manipulation

#### AA requirements

- Every pointer target contains at least a **24 × 24 CSS-pixel** target, or meets one of the tightly defined exceptions in SC 2.5.8. Do not use the spacing exception as the normal toolbar design. ([SC 2.5.8][wcag-target-min])
- Every custom drag operation has an equivalent **single-pointer operation without dragging**. For tower placement, “select defender, then tap a valid ring” is the primary accessible path; drag-to-place may be an optional shortcut. ([SC 2.5.7][dragging])
- Path gestures and multipoint gestures have simple single-pointer alternatives. No action may require a swipe shape, pinch, or two simultaneous fingers. ([SC 2.5.1][pointer-gestures])
- Activations complete on `pointerup`/`click`, or can be aborted/undone. Moving off a target before release cancels it. ([SC 2.5.2][pointer-cancellation])

#### Project requirements

- Normal controls, cards, campaign nodes, fairy rings, pause/settings buttons, and dialog actions have a measured hit area of at least **48 × 48 CSS pixels** at every supported viewport and render scale. This exceeds WCAG’s 44 × 44 enhanced target and aligns with Android’s 48 dp guidance and Apple’s 44 pt default control size. ([WCAG SC 2.5.5][target-enhanced], [Android][android-target], [Apple][apple-accessibility])
- Keep at least **8 CSS pixels of clear space between adjacent hit regions**. Prefer 12 pixels around destructive, frequently used, or edge-adjacent controls. Visual art may be smaller than the hit region, but debug builds must be able to render the true hit bounds.
- Scaling the battlefield never scales CSS hit regions below their minimum. Hit-testing is derived from level/UI data, not from baked pixels in background art.
- Campaign markers, trail stops, fairy rings, towers, and other selectable world objects are programmatic interactive objects with a visible focus/selection treatment. If map geography forces overlap, provide an equivalent 48-pixel list or carousel of destinations.
- The landscape control layout supports two-thumb ergonomics, but never requires two hands. Frequent controls live in the lower/outer reach zones; pause, cancel, and confirm remain reachable without covering the active target.
- A placement begins with an explicit defender selection. One release creates at most one tower. Holding or sliding a finger never repeats purchases or placements.
- Pointer handling uses Pointer Events, pointer capture where needed, and explicit handling for `pointercancel`, `lostpointercapture`, page visibility loss, and orientation change. Every cancellation returns to a stable pre-gesture state. `touch-action` is limited to the game surface; browser zoom/scroll is not disabled for menus and reading screens. ([Pointer Events][pointer-events])
- Every irreversible action has confirmation or immediate undo. Tower placement and upgrades expose an undo/sell route whose consequence is stated before confirmation.
- Acceptance is tested with target-bound overlays at 640 × 360, 667 × 375, 844 × 390, 1024 × 768, and 1366 × 768 CSS pixels, at DPR 1, 2, and 3.

### 2. Typography and reading

#### AA requirements

- Normal text and images of text reach **4.5:1 contrast** against their actual worst-case background; large text reaches 3:1. Do not assume a translucent panel always has the same background. ([SC 1.4.3][wcag-contrast])
- Text can be enlarged to **200%** without clipped content, overlap, or lost functionality. ([SC 1.4.4][resize-text])
- User text-spacing overrides—line height 1.5, paragraph spacing 2, letter spacing 0.12 em, and word spacing 0.16 em—do not lose content or functionality. ([SC 1.4.12][wcag-text-spacing])
- Essential instructions and control labels are live HTML text, not text baked into a bitmap. ([SC 1.4.5][wcag-images-text])

#### Project requirements

- Default gameplay labels and instructions are at least **16 CSS pixels**; primary action labels are at least 18 pixels; headings are at least 24 pixels. Fourteen-pixel text is allowed only for nonessential secondary metadata and must still pass contrast and zoom tests.
- Body/instruction text uses at least **1.4 line height**, left alignment, no full justification, no long all-caps passages, and a readable width of at most about 60 characters.
- Use short, literal sentences and familiar words. Introduce one new term at a time, pair a new icon with its text label until learned, and explain game-specific terms in context. W3C cognitive guidance recommends easy words, short sentences/blocks, clear images, and unambiguous formatting. ([W3C COGA][coga])
- A reading instruction remains until dismissed or the requested action is completed. Story text can be paused, skipped, and replayed; no child must read against an expiring timer.
- Verify every supported screen at browser zoom 200%, OS large text where available, and the WCAG text-spacing override. Canvas-only labels do not count as passing these checks.

### 3. Color, graphics, and focus

#### AA requirements

- Color is never the only way to convey action, state, team, danger, path validity, selection, health, or targetability. ([SC 1.4.1][use-of-color])
- Visual information needed to identify controls, states, focus, paths, ranges, and meaningful graphical objects reaches **3:1 contrast** against adjacent colors. ([SC 1.4.11][non-text-contrast])
- Keyboard focus is visible and is not entirely hidden by HUDs, dialogs, tooltips, or the rotation advisory. ([SC 2.4.7][focus-visible], [SC 2.4.11][focus-not-obscured])

#### Project requirements

- Pair every functional color with at least one of: shape, pattern, outline, icon, position, or text. Examples:
  - valid placement: green **plus** a check and solid ring;
  - invalid placement: red **plus** a cross and hatched ring;
  - aerial enemy: altitude/shadow treatment **plus** a wing badge and accessible label;
  - locked campaign node: desaturation **plus** lock icon and “Locked” text;
  - selected defender: color change **plus** raised border/checkmark.
- Use a high-contrast silhouette/halo behind small characters and projectiles where painterly terrain would swallow them. Decorative richness may not obscure trails, enemies, interactive nodes, attack ranges, or resource numbers.
- Focus and selection indicators use a persistent two-color or otherwise background-independent outline at least 2 CSS pixels thick. Focus is not indicated by glow alone.
- Check functional screens with deuteranopia, protanopia, tritanopia, grayscale, increased contrast, and forced-colors emulation. Automated checks are supplemented by visual inspection because meaningful canvas graphics require human judgment.
- Terrain backgrounds contain no baked-in clickable nodes, paths, labels, or state. Those layers remain programmatic so their contrast, hit area, selection, focus, and locked/completed states can adapt independently.

### 4. Orientation and responsive layout

#### AA requirement

- View and operation are not restricted to one display orientation unless that orientation is genuinely essential. A blocking “rotate your device” overlay fails SC 1.3.4 when a conforming portrait presentation is feasible. ([SC 1.3.4][wcag-orientation], [F100][f100])

#### Project requirements

- Landscape is the canonical and recommended battlefield composition, designed first at **640 × 360 CSS pixels** and then enhanced for larger screens.
- Portrait remains fully operable. It may use a top-down path, compact/reflowed HUD, drawer-based loadout, or different camera framing, but it exposes the same actions and information. A dismissible recommendation may explain that landscape gives more battlefield space.
- Campaign, loadout, settings, help, pause, and post-battle screens work without an orientation advisory in both portrait and landscape.
- Rotation during play preserves wave, entities, health, mana, cooldowns, loadout, pause state, and selected object. Active pointer gestures are canceled before layout changes; no purchase or placement fires during rotation.
- Layout includes `safe-area-inset-*` plus at least 8 pixels around controls and never places essential actions under notches, rounded corners, browser chrome, or home indicators.
- Resizing desktop/tablet windows is live and lossless; no reload is required.

### 5. Motion, timing, and audio

#### AA requirements

- Content does not flash more than three times in any one-second period unless it is below the WCAG general and red-flash thresholds. Prefer no rapid flashes at all. ([SC 2.3.1][wcag-flash])
- Automatically moving/blinking/scrolling content lasting more than five seconds in parallel with other content can be paused, stopped, or hidden unless essential. ([SC 2.2.2][pause-stop-hide])
- Content-set time limits can be disabled, adjusted over the required range, or extended unless a documented real-time/essential exception applies. Tutorial reading and menus have no time limits. ([SC 2.2.1][timing-adjustable])
- Automatically playing audio longer than three seconds has pause/stop or independent volume control. ([SC 1.4.2][audio-control])
- Prerecorded audio-only story has a transcript; synchronized prerecorded video has captions, including meaningful non-speech sound. ([SC 1.2.1][wcag-audio-only], [SC 1.2.2][wcag-captions])

#### Project requirements

- Audio starts only after a deliberate user gesture. Settings always expose master mute plus separate music, effects, and voice controls; values persist locally.
- No critical event is audio-only. Offscreen attacks, low Heartwood health, wave starts, cooldown completion, and errors also have visible/text cues. Likewise, essential visual cues have an optional sound or spoken equivalent. Apple specifically recommends augmenting audio cues with visual cues. ([Apple accessibility][apple-accessibility])
- Respect `prefers-reduced-motion` on first launch and provide an in-game **Reduced motion** override. Reduced mode removes screen shake, parallax, rapid zoom, large flashes, sustained oscillation, and nonessential particle travel; it replaces motion with short fades, static outlines, or state changes without hiding information. ([Media Queries 5][media-queries], [Apple motion][apple-motion])
- Pause is a persistent 48-pixel control and `Escape` shortcut. Pausing freezes simulation, timers, spawning, and damage while leaving settings/help operable. Backgrounding the page auto-pauses; returning never resumes combat without an explicit action.
- Tutorials pause the battle while explanatory text is visible. Every cinematic and dialogue sequence is skippable and replayable.
- Challenge may alter wave pressure, but reading speed and UI response windows do not become difficulty mechanics. If a reaction timer is essential, communicate it visually and audibly and offer slower simulation in the easier Challenge setting.

### 6. Onboarding, guidance, and failure coaching

These are project requirements informed by W3C cognitive guidance; they are not direct WCAG prescriptions for game balance.

- **Challenge** and **Guidance** are separate settings, explained before the first level and changeable later without erasing progress:
  - Challenge: Easy / Normal / Hard changes battle balance.
  - Guidance: Coach / Warnings / None changes strategic help only.
- Recommended first-run defaults are **Normal Challenge + Coach Guidance**. Do not call an accessibility or guidance option “baby mode.”
- Coach Guidance highlights recommended loadout choices, explains critical gaps before play, and gives specific post-loss coaching. Warnings Guidance states critical gaps without highlighting recommended choices. None gives no strategy warnings or hints. All three retain accessibility cues, control instructions, and error messages; “no hints” never disables accessibility.
- Teach in the live interface, one concept at a time: show the goal, let the player perform it, acknowledge success, then continue. The player can skip and replay every tutorial from a consistently placed Help entry.
- The first occurrence of a mechanic gives a short text label, visual demonstration, and safe practice opportunity. Do not introduce a new enemy counter only after it has caused an unavoidable loss.
- Pre-level loadout feedback says what capability is missing and why it matters. It never blocks “Play anyway.”
- A loss screen contains, in this order:
  1. neutral outcome (“The Heartwood was overwhelmed”);
  2. one or two observable causes (“Flying beetles passed three ground-only defenders”);
  3. one concrete next action (“Add a defender with the Wing icon”);
  4. large **Retry** and **Change loadout** actions.
- Repeated losses may offer a recommended loadout or replayable lesson, but never silently lower Challenge, shame the player, remove earned progress, or imply they are bad at the game.
- Success feedback identifies the strategy that worked, not only a star count. Failure and success text is concise, age-appropriate, and available until dismissed.
- Help has the same location and identity on all screens. Controls, glossary, enemy traits, defender traits, Challenge, and Guidance are reviewable outside combat. W3C recommends familiar design, clear language, and easy-to-find help for cognitive accessibility. ([W3C COGA][coga], [SC 3.2.6][consistent-help])

### 7. Keyboard, assistive technology, and input alternatives

#### AA requirements

- All functionality is operable through a keyboard interface without individual-keystroke timing, with no keyboard trap. ([SC 2.1.1][keyboard], [SC 2.1.2][no-trap])
- Every custom component exposes a programmatic name, role, value/state, and operable action. Status changes important to play are exposed without moving focus. ([SC 4.1.2][name-role-value], [SC 4.1.3][status-messages])
- Non-text content has an equivalent text alternative appropriate to its purpose. ([SC 1.1.1][non-text])

#### Project requirements

- Use semantic HTML for all menus, cards, dialogs, settings, campaign nodes, and HUD actions. If the engine renders controls to canvas, maintain a synchronized DOM interaction layer rather than a separate, stale accessibility tree.
- Keyboard flow covers the complete campaign path: choose level, build loadout, start, pause, select defender/spell/tower, select valid world target, place/upgrade/sell/cancel, inspect status, finish, retry, and return to map.
- Default commands are discoverable and remappable where practical: `Tab`/`Shift+Tab` move controls, arrow keys move spatially between rings/nodes, `Enter`/`Space` activate, and `Escape` cancels or pauses. Do not rely on letter shortcuts alone.
- Accessible names include decisive state without verbosity, for example “North ring, empty, beside upper path” or “Bramble Archer, 50 mana, attacks ground and air.” Rapid enemy movement is summarized; do not flood live regions with every tick or hit.
- Wave start, paused/resumed, mana shortfall, invalid placement, Heartwood danger, victory, and defeat are exposed as concise status messages. Routine combat animation is not announced.
- Hover has no unique functionality. Tooltips also appear on focus and can be dismissed, hovered, and kept visible as required by SC 1.4.13. ([SC 1.4.13][hover-focus])
- Touch, mouse, pen, and keyboard remain usable in the same session; detecting one input does not disable another. Gamepad support is optional for v1, not a substitute for keyboard access.
- Run manual critical-path checks with VoiceOver + Safari on iOS/iPadOS, TalkBack + Chrome on Android, and keyboard-only desktop. A screen-reader user must at minimum be able to navigate the entire shell and command the battle through the DOM layer; this cannot be certified by an automated checker alone.

### 8. Performance and device support

Core Web Vitals are project performance targets rather than WCAG requirements. Google defines “good” field thresholds at the 75th percentile as LCP ≤2.5 seconds, INP ≤200 ms, and CLS ≤0.1. ([LCP][lcp], [INP][inp], [CLS][cls])

#### Project requirements

- At launch, support:
  - current and previous major iOS/iPadOS Safari;
  - current and previous major Android Chrome;
  - current and previous stable desktop Chrome, Edge, Firefox, and Safari.
- Maintain a checked-in browser support policy and make the build fail when the selected engine/library or syntax exceeds it without an explicit decision.
- Functional viewport baseline is 640 × 360 CSS pixels in landscape and 360 × 640 in portrait, with coarse pointer and no hover. Enhance through tablet and desktop; do not create a separate desktop-only interaction model.
- Test on at least one approximately four-to-six-year-old small iPhone-class device and one similarly aged 4 GB Android device, not only emulators and flagship hardware.
- On representative older devices, the level-10 stress scene sustains **30 fps or better**, p95 frame time is at most 33 ms over a 60-second wave, input never causes multi-placement, and no visible freeze exceeds 200 ms. Target 60 fps on current devices. A 60 Hz frame provides 16.7 ms total and roughly 10 ms for application work. ([web.dev rendering][rendering])
- Menu and HUD interactions produce visible acknowledgement within 100 ms in lab checks and meet INP ≤200 ms in available field data. Because v1 deliberately has no analytics, use repeatable lab traces and do not pretend they are field percentiles.
- The entry screen meets LCP ≤2.5 s and CLS ≤0.1 in a repeatable mobile Lighthouse/WebPageTest profile. Reserve dimensions for art and fonts; UI does not jump when assets arrive.
- Initial shell plus first visible screen is no more than **2 MiB compressed**. Each level’s additional compressed art/audio budget is no more than **4 MiB** and loads on demand with progress, cancel/retry, and a clear error state. Later levels do not block first interaction.
- Repeatedly entering/exiting three levels does not continuously grow active textures, audio nodes, listeners, or entity counts and does not trigger a browser reload/crash. Background tabs stop rendering and simulation.
- All production assets are self-hosted with the static build. Missing/failed optional art degrades to an intentional functional representation; it never leaves an invisible hit target or blocks progress.
- The release test matrix covers touch-only, keyboard-only, screen reader shell/battle commands, reduced motion, muted audio, 200% zoom, orientation change mid-wave, interruption/background-resume, slow load, and offline-after-load failure behavior.

### 9. Privacy for a child-directed static game

#### Legal conditions

- COPPA applies to covered operators of child-directed online services under 13 that collect personal information; “collection” can include passive tracking through a persistent identifier and third-party plug-ins. Covered collection triggers notice, parental-consent, access/deletion, minimization, security, and retention duties, subject to specific exceptions. ([FTC COPPA Rule][coppa-rule], [FTC FAQ][coppa-faq])
- GDPR requires purpose limitation, data minimization, storage limitation, and privacy by design/default when personal data is processed. Consent-based information-society services offered directly to children use the Article 8 age threshold; Czech law sets independent child consent at **15**. ([GDPR Articles 5, 8, and 25][gdpr], [Czech DPA][czech-dpa])

The absence of accounts or a backend substantially reduces risk, but it does not automatically prove that no data is collected: analytics, CDN requests, embedded media, crash reporters, fonts, plug-ins, and hosting logs can still create disclosures or identifiers.

#### Project requirements

- V1 collects **no name, email, age/birth date, location, contacts, photos, voice, chat, user-generated content, device fingerprint, advertising identifier, or cross-site identifier**.
- V1 includes no advertising, analytics, telemetry, session replay, social SDK, remote font, third-party embed, or runtime CDN. Image-generation inputs are development assets only; finished assets are checked in and self-hosted.
- At runtime, browser network tests allow only same-origin static game requests and documented GitHub Pages hosting behavior. CI fails on an unexpected host. Audit transitive dependencies for runtime network calls before release.
- Progress, settings, and accessibility preferences are stored only in first-party local browser storage, use no user-entered identifier, and are never transmitted. Provide a clearly labelled **Reset local progress and settings** action with confirmation.
- Publish a short, child-readable privacy notice and a parent/developer detail section. State exactly what local keys are stored, that clearing site data removes them, that the game sends no gameplay/profile data, and that GitHub Pages supplies the hosting infrastructure. Do not say “we collect nothing” without accounting for hosting requests/logs.
- Do not add an age gate merely to avoid child-directed status; an age gate itself creates data and does not change the game’s evident audience. The safest v1 design is data minimization, not collection plus consent UX.
- Any future proposal for telemetry, crash reporting, accounts, cloud saves, social/multiplayer features, user-created content, ads, or remote embeds reopens privacy architecture and legal review **before implementation**. Do not treat a generic consent banner as sufficient.

## Release gate

A level or shared UI change is not done until all applicable checks below pass:

1. Automated WCAG checks pass on the HTML shell, menus, dialogs, HUD controls, and DOM interaction layer; contrast of meaningful canvas content is manually checked.
2. Target-bound debug overlay proves 48 × 48 CSS-pixel targets and spacing at every baseline viewport.
3. The entire critical path works touch-only and keyboard-only; drag actions also work by tap selection.
4. VoiceOver/Safari and TalkBack/Chrome can operate the shell and synchronized battle command layer without live-region spam.
5. 200% zoom, text-spacing overrides, reduced motion, mute, color-vision simulations, and forced colors do not hide information or actions.
6. Rotation/resizing during an active pointer and mid-wave preserves state and causes no placement or purchase.
7. Older-device stress and load budgets pass; the network log contains no unexpected host.
8. Guidance behavior matches Coach / Warnings / None while accessibility feedback remains present in every mode.
9. A human review confirms that polished art has not reduced gameplay readability or baked interaction/state into backgrounds.

## Primary sources

- [W3C Web Content Accessibility Guidelines (WCAG) 2.2][wcag]
- [W3C Making Content Usable for People with Cognitive and Learning Disabilities][coga]
- [W3C Pointer Events][pointer-events]
- [W3C Media Queries Level 5 user preference features][media-queries]
- [Apple Human Interface Guidelines: Accessibility][apple-accessibility] and [Motion][apple-motion]
- [Android Developers: app accessibility and 48 dp targets][android-target]
- [Google web.dev: LCP][lcp], [INP][inp], [CLS][cls], and [rendering performance][rendering]
- [US FTC: current COPPA Rule][coppa-rule] and [COPPA FAQ][coppa-faq]
- [EU GDPR consolidated text][gdpr] and [Czech Data Protection Authority guidance][czech-dpa]

[wcag]: https://www.w3.org/TR/WCAG22/
[wcag-orientation]: https://www.w3.org/TR/WCAG22/#orientation
[orientation]: https://www.w3.org/WAI/WCAG22/Understanding/orientation.html
[f100]: https://www.w3.org/WAI/WCAG22/Techniques/failures/F100
[wcag-target-min]: https://www.w3.org/TR/WCAG22/#target-size-minimum
[dragging]: https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html
[pointer-gestures]: https://www.w3.org/WAI/WCAG22/Understanding/pointer-gestures.html
[pointer-cancellation]: https://www.w3.org/WAI/WCAG22/Understanding/pointer-cancellation.html
[target-enhanced]: https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html
[android-target]: https://developer.android.com/guide/topics/ui/accessibility/views/apps-views
[apple-accessibility]: https://developer.apple.com/design/human-interface-guidelines/accessibility
[pointer-events]: https://www.w3.org/TR/pointerevents3/
[wcag-contrast]: https://www.w3.org/TR/WCAG22/#contrast-minimum
[resize-text]: https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html
[wcag-text-spacing]: https://www.w3.org/TR/WCAG22/#text-spacing
[wcag-images-text]: https://www.w3.org/TR/WCAG22/#images-of-text
[coga]: https://www.w3.org/TR/coga-usable/
[use-of-color]: https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html
[non-text-contrast]: https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
[focus-visible]: https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html
[focus-not-obscured]: https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html
[wcag-flash]: https://www.w3.org/TR/WCAG22/#three-flashes-or-below-threshold
[pause-stop-hide]: https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html
[timing-adjustable]: https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html
[audio-control]: https://www.w3.org/WAI/WCAG22/Understanding/audio-control.html
[wcag-audio-only]: https://www.w3.org/TR/WCAG22/#audio-only-and-video-only-prerecorded
[wcag-captions]: https://www.w3.org/TR/WCAG22/#captions-prerecorded
[media-queries]: https://www.w3.org/TR/mediaqueries-5/#user-preference
[apple-motion]: https://developer.apple.com/design/human-interface-guidelines/motion
[consistent-help]: https://www.w3.org/WAI/WCAG22/Understanding/consistent-help.html
[keyboard]: https://www.w3.org/TR/WCAG22/#keyboard
[no-trap]: https://www.w3.org/TR/WCAG22/#no-keyboard-trap
[name-role-value]: https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html
[status-messages]: https://www.w3.org/TR/WCAG22/#status-messages
[non-text]: https://www.w3.org/TR/WCAG22/#non-text-content
[hover-focus]: https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html
[lcp]: https://web.dev/articles/lcp
[inp]: https://web.dev/articles/inp
[cls]: https://web.dev/articles/cls
[rendering]: https://web.dev/articles/rendering-performance
[coppa-rule]: https://www.ftc.gov/legal-library/browse/rules/childrens-online-privacy-protection-rule-coppa
[coppa-faq]: https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions
[gdpr]: https://eur-lex.europa.eu/eli/reg/2016/679/
[czech-dpa]: https://uoou.gov.cz/verejnost/zakladni-prirucka-k-ochrane-udaju
