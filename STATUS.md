# Status (written by the implementation agent)

Last update: Sun Oct 25, 4:25 AM CDT. Deployed build: `8abd535` on https://throwhands.tech.

## Since 4:05 AM
- **Camera fixes from review rounds 7 and 8:**
  - the camera never clips into a fighter (it stays 1.3 m clear, 1.8–2 m in slow motion; checked frame by frame on the KO)
  - the slow-motion camera stays on your side and eases in and out
  - the camera orbits wider during your own strike, so the fist landing is visible
  - the Brawl camera looks ahead instead of diving overhead
  - the energy blast gets the slow-motion side camera
  - tumbles are limited near the fence, so bodies don't pass through it
- **Movement and contact:** fighting distance 1.3 m; wrists straight in the gloves. Fist-to-target is now 0.3–8 cm on average across scenes.
- **Grappling** (4:10/4:13 AM), still behind `?grapple=1` and **not in the demo video**:
  - **Watch:** https://throwhands.tech/media/review/clinch.mp4 and https://throwhands.tech/media/review/throw.mp4 (real renderer, scripted bot grab, clinch knees, Shoulder Throw).
  - **`?debug=1`:** a corner overlay showing per-arm extension, elbow and speed, the movement input, the grab reach-and-pull state ("waiting for pull (0.32 s left)", "arms held >0.5 s → blast"), the last actions, and grab cancels.
  - **Drill mode** has GRAB and SHOULDER THROW prompts when `&grapple=1` is set (`?research=1&drills=1&grapple=1`).
  - **In progress (parallel agent):** the jab hold for two-arm reaches and the blast hold/cancel, plus real grab/throw clips (seoi-nage uchikomi, clinch entries) to measure recall.
- **Round 9** of the review loop is being scored now. The full e2e suite is running against production.

## 3:15 to 4:05 AM (all deployed)
1. **Pose rate** (3:08/3:22 AM, highest priority). This server's Chromium runs on its *integrated* Intel UHD GPU, a good stand-in for the user's laptop. Measured with a real clip as the camera in a practice match:

   | Setup | Pose fps |
   |---|---|
   | Pose alone (bare pose page) | 17 |
   | Game with the GPU idle | 16 at 60 fps render; 17.4 capped at 30; 19.5 capped at 24 without bloom |
   | Game with another GPU load running | **7.4** uncapped (the user sees 6.9); **18** capped at 30 fps; 20.4 at 20 fps |
   | Research recording on | 12.4 with VP9, 14.4 with H.264 |

   - **Fix 1: automatic quality step-down.** If pose stays under 18 fps for 3 s, rendering is capped at 30 fps. If it is still under 15, the cap drops to 24 fps and bloom turns off. `?quality=0/1/2` forces a level.
   - **Fix 2: research recording** prefers H.264 at 1 Mbps.
   - **Planner/user:** please check the pose fps in the camera preview on the laptop now. Expect at least 15 to 18.
2. **Camera** (rounds 6 and 7):
   - **Default view:** your behind angle, kept inside the cage. It orbits smoothly around the fight when it would leave the cage, or when your fighter would hide the opponent. There are no side flips, and it cuts only when you teleport (round start, respawn). `?cam=free` keeps the old unclamped view for comparison.
   - **Measured:** cage in line of sight about 0% in every scene; opponent visible 84–93% (cage_far 72%).
   - **See-through removed:** it showed the inner surfaces (the 3:26 AM correction).
3. **Fights look right:**
   - fighters keep 0.95 m apart
   - the KO is a tumble into a limp lying pose
   - the super uppercut dips and rises, then slams the opponent into the fence at chest height
   - launched fighters tumble instead of hanging in a seated pose
   - walking backward walks (no reverse jog) at 70% speed
   - a compact guard bubble; a Brawl chase camera with a "you" marker
   - fist-to-target mostly under 10 cm
4. **Audio** (3:15/3:20 AM):
   - **"I don't hear it":** audio was only resumed when you picked a mode from the menu, so opening a link straight into a match left it suspended. It now resumes on the first tap or key anywhere. The e2e test checks that the context is running, the voice bus is up, and calls played: 9 calls in 26 s on production.
   - **Directions read aloud:**
     - All 48 stock calls were transcribed with ElevenLabs speech-to-text: **0 say more than their line**. The check is `tests/tools/check-calls.ts`, so the leak came from the live Gemini TTS lines (the role-play prompt).
     - Both Gemini TTS models are now out of free-tier quota (429), so I couldn't re-verify a fix. Live AI lines are therefore **captions only**, and spoken commentary comes from the verified stock calls. 8 new calls ("THE SUPER IS READY!", fillers like "KEEP THOSE HANDS UP!") keep at least 4 spoken lines a minute: a 60 s practice match had 10.
     - The server prompt now uses the documented short form ("Say excitedly: …"), behind `?livevoice=1` / `LIVE_TTS=1`.
   - **Crowd that sounds like wind:** replaced with real crowd audio from ElevenLabs sound effects (20 s seamless arena bed, 3 roars, 2 "ooh"s, a gasp, a chant), ducked about 8 dB under each call.
   - **ElevenLabs quota:** 4,499 / 10,000 used, within the 50% rule at each step.
5. **Research mode:**
   - Recordings auto-save on Quit/Menu and on page close, and checkpoint every 2 minutes.
   - A big "Stop & save files" button, and a toast after saving.
   - The e2e test passes on production.
6. **Grappling** (2:50 AM item B) is merged **behind `?grapple=1`**:
   - grab (reach and pull), a 3 s clinch with knees and escapes, and the Shoulder Throw super
   - bots use them
   - 0 false grab/throw triggers on all 37 real clips; the existing detection is unchanged (eval-gestures identical)
   - **Open question for the planner:** the reach of a grab can also read as a jab, and once in 4 synthetic throws at 15 fps as a palm. With a full meter that palm fires the energy blast first. Real grab clips are needed to measure it.
   - Paired clinch/throw animation is not done yet, so it stays flagged.
7. **Leaderboard:**
   - Four real online matches were played through the real UI and server between clip-driven players named Maya, Leo, Priya and Sam, so the board shows genuinely played matches.
   - An agent's test run had added "E2E Dup" players to production. They were removed with `tests/tools/cleanup-test-data.ts` (64 test players, 32 matches).
8. **Demo-video-v2** is prepared: new shots, script, VO, cards and UI captures, with the game's own announcer calls mixed in at the frames they fired. The final render happens after the freeze.

## Working on now
1. Guided research drills (stand still, big punches standing still, movement prompts), so the user can record clean data.
2. Review round 8.
3. Demo-video-v2 render.

## 2:45 to 3:15 AM (all deployed)
1. **Bug fixed: a big punch moved the player backward** (2:50 AM item A), reproduced first in `tests/unit/punch-no-move.ts` on real clips of people throwing hooks, uppercuts and knees in place.
   - **Before:** up to 61 cm of input-driven movement around a strike.
   - **After:** 4.2 cm at worst (target under 5 cm).
   - **Root cause:** the wind-up, twist and lean-back before a strike is *detected* fed the step and lean signals, so the fighter moved.
   - **Fix:**
     - movement is gated from strike onset (a hand moving fast) until 0.35 s after it, and 0.65 s after a detected strike
     - shoulder width is ignored when the torso twists past 35°
     - forward/back intent must last 0.2 s
     - leaning back needs 8.5 cm (leaning in still 5.5 cm)
   - Lean, step and strafe tests still pass.
2. **Camera modes** (2:45 AM). Both use cage fading: every post, pad, rail or chain-link panel between the camera and a fighter fades to 8%, and your fighter turns see-through (outline hidden) when it covers the opponent. The posts are now lit steel with colored pads, not flat black.

   | Mode | Scene | Cage in line of sight (faded) | Opponent upper body visible | Camera jumps over 0.3 m |
   |---|---|---|---|---|
   | **`?cam=behind` (default)** | idle | 0% | 100% | 0 |
   | | jab (moving fight) | 68% | 58% | 0 |
   | | your back to the fence | 93% | 66% | 6 |
   | | opponent on the far fence | 68% | 66% | 5 |
   | | corner | 96% | 87% | 5 |
   | **`?cam=inside`** | idle | 0% | 100% | 0 |
   | | jab | 0% | 100% | 2 |
   | | your back to the fence | 0% | 97% | 3 |
   | | opponent on the far fence | 0.1% | 68% | 3 |
   | | corner | 0% | 100% | 0 |

   Screenshots: [behind](docs/screens/cam-behind-near-cage.jpg), [inside](docs/screens/cam-inside-near-cage.jpg).
   - In `behind`, the cage numbers are rays that would hit the cage; those parts fade, so they don't hide the fighters.
   - **My recommendation is `inside`**: it never looks through the cage and keeps the opponent visible. Behind stays the default until the user picks.
3. **Commentator** (2:35 AM item 4):
   - **Stock calls:** 40 pre-rendered, high-energy calls (ElevenLabs `eleven_v3`, voice "Charlie", shouting delivery) play instantly on round start, KO, guard break, cage slam, supers, counters, combos, low HP and the result. Limit: one call per 2.2 s and 8 per minute.
   - **AI lines:** Gemini lines are captions unless the budget allows. Voiced lines use the full `gemini-3.8-flash-tts` with a director prompt per moment (shouting for a KO, rising disbelief for a guard break).
   - **No more flat voice:** the browser `speechSynthesis` voice is removed.
   - **Crowd:** a synthesized crowd bed, roars on big hits, an "ooh" on blocked heavy hits, a chant at low HP, and a round sting.
   - **Volume:** separate commentator and crowd sliders behind the 🔊 button; the popover closes on click-away or after 3 s.
   - **e2e** (`tests/e2e/commentary.spec.ts`): 7 calls in 24 s matched the events (round 1, cage slam, KO, round 2, combo, KO, result), with 0 browser-voice calls.
   - **ElevenLabs quota:** free tier, **1,309 / 10,000 characters used** (8,691 left). The calls used 1,024. The demo-video voiceover will stay inside the 50% rule.
4. **The user's look preference applied:** fighters are back to plain, with no added hair, headgear, tops or pants.
5. **HUD:**
   - arena banners are now low LED boards, no longer behind the HUD bars
   - hints sit under the timer, apart from the commentary caption
   - long names truncate inside their bar
   - checked at 1280×720, 1920×1080 and 844×390
6. **Opt-in pose streams:** columnar storage (one smallint column per coordinate) compresses 3.4×, to **5.9 MB per player-hour** (19.7 MB uncompressed). That is about 102 player-hours under the 600 MB guard. Plain arrays reached only 1.7×.

## 1:50 AM to 2:45 AM (all deployed)
1. **Movement you can find** (acd2f05, 5936250). Root cause of "idk how to move forward and backward", reproduced in `tests/unit/move-forward-back.ts`: the 1v1 duel assist overrode any forward/back signal under 0.2 and walked you back to range as soon as you stopped, and a 12 cm lean only produced 0.13. Fixed:
   - **Lean** toward/away from the camera now advances/retreats (works at a laptop). A **rotation-corrected step** still works.
   - **Step sideways to strafe** (2:00 AM item), combined with leaning. Edge warning ("Step back to the center") and clamp within 10% of the frame edge, plus a home marker in the camera preview.
   - The assist never overrides or undoes your movement; it only walks you back in after 1.5 s without forward/back input.
   - **Tutorial** after calibration: 4 direction tiles with live fill bars (15 s), then a defend stage for guard and Iron Wall (10 s). There is an in-match movement indicator and a bigger menu line.
2. **Human-proportioned fighters + visible contact** (78659ed):
   - Quaternius Universal Base Characters + Universal Animation Library, CC0 (license files in `web/public/characters/`). About 1.8 m tall, 7.5 heads, arm span about equal to height.
   - Guard-up locomotion; the hips turn toward the travel direction.
   - Two-bone IK lands the fist/foot on the target, with a step-in lunge. The impact plays on the contact frame at the fist, and the KO lands with the punch.
   - Fighting range is now arm's length.
   - Per-fighter looks so Brawl fighters are distinct: tank top / rash guard / fight pants, hair or headgear, light/dark skin, heavy/lean builds.
3. **Guard redesign** (1:50 AM item):
   - Guard meter: drains 20/s while held, extra per blocked hit, refills 25/s after 0.5 s with the arms down. Blocked hits do 10%.
   - At 0 the guard breaks: glass shatter and sound, 2 s dizzy with stars. It restarts at 30.
   - **Iron Wall** (X above the face, full meter): 2.5 s unbreakable gold bubble that counters the first attacker.
   - Bots guard and sometimes get broken.
   - Tests: `tests/unit/guard-meter.ts` (48 checks), `bot-guard.ts`, and an e2e guard break: blocked hits did 1 HP while the guard went 84 → 35 → 15, it broke, then a jab landed for 9.
4. **UFC-style octagon** (1:35 AM item):
   - 8 m across in 1v1, 9.8 m in Brawl.
   - Chain-link cage 1.8 m high, padded posts, canvas mat with the logo, overhead light, crowd silhouettes, stadium lights.
   - **No ring-outs**: knockback (still growing with damage taken) slams fighters into the cage and they bounce off, with a panel shake and a heavy spark.
   - HP-only KOs in 1v1; Brawl KOs at 0 HP with a 3 s respawn.
   - The teeter and edge warning are removed. The camera stays inside the cage.
   - Tests: `tests/unit/octagon-cage.ts`. Knockback is 0.24 / 0.43 / 0.61 m at 0 / 60 / 120 damage taken; a cage slam bounces back 1.3 m; walking stops at the fence; HP KO ends the round; Brawl respawn after 3.07 s.
5. **Research recording mode** (2:16 AM item 1), at `https://throwhands.tech/?research=1`:
   - A consent screen every session; nothing starts until the box is ticked.
   - Records the camera video locally only (MediaRecorder), plus a JSONL with one line per frame: 33 world + 33 image landmarks with visibility, actions with scores, move input, game events, markers.
   - Marker keys: Space = missed, F = false fire, 1–9 = "I just did move N".
   - The landmark stream (no video) goes to the Tiger hypertable `research_frames` (compression, `segmentby` session_id). Both files download on "Stop & save files".
   - e2e on production: 2 files (1.2 MB webm, 283 KB jsonl), 131 frames and 3 markers stored server-side. Declining records nothing.
   - Scoring tool: `npx tsx tests/tools/research-score.ts [--replay] file.jsonl`.
6. **Credits**: the site footer and README now credit Quaternius (CC0). Seed-san is credited for `?classic` only.

## Review loop (spec section 11), details in [REVIEW-SELF.md](REVIEW-SELF.md)
| Item | R2 motion | R2 visual | R3 motion | R3 visual |
|---|---|---|---|---|
| 1 Walk/run legs, no drift | 2 | 2 | 2 | 2 |
| 2 Torso/head human | 1 | 2 | 3 | 3 |
| 3 Attacks readable | 1 | 1 | 2 | 2 |
| 4 Hit reactions / tumble | 1 | 3 | 2 | 3 |
| 5 Glows only when active | 2 | 2 | 2 | 2 |
| 6 Effects readable | 1 | 1 | 2 | 1 |
| 7 Stage / lighting | 3 | 2 | 4 | 3 |
| 8 Camera / framing | 2 | 2 | 1 | 1 |
| 9 Silhouettes | 2 | 2 | 2 | 1 |
| Strikes connect (new) | – | – | 2 | 1 |

R3 = build f9b725c (first octagon build). Its highs were:
- the camera clipping through the cage
- a KO'd fighter standing and then T-posing
- the Iron Wall never shown
- bot strikes registering from 1.4 m away
- white spark bursts
- identical bald fighters
- the Brawl board over the HUD

All of these are fixed in 72bc4f4, with the measured numbers below. Round 4 is being captured now.

**Fist-to-target distance on the contact frame** (target under 10 cm):

| Scene | R3 mean / max | After the fixes |
|---|---|---|
| jab | 1.9 cm | same |
| hook | 5.9 / 17.9 cm | same |
| uppercut | 4.5 cm | same |
| bot strikes (getting_hit) | 30 / 138 cm | 6.7 / 22 cm |
| guard_break | 20.7 / 113 cm | 4.3 / 15 cm |
| knockback | 60 cm | 9.4 cm |
| brawl8 | – | 2.6 / 8 cm over 22 hits |

The cause of the misses was the tumble pivoting at the feet, which swung the head 1 m+ away.

**Still below target:** planted-foot slide is 3–10 cm per frame against a 1 cm target, worst during lunges and jogging.

## Movement controls now (exact thresholds, `shared/gestures.ts`)
- **Strafe** is the sum of two inputs:
  - step sideways: hip center x in the image against the calibrated spot, in calibrated shoulder widths; dead zone 0.3, full speed 0.9
  - lean shoulders over hips: dead zone 3.5 cm, full 10 cm
- **Forward/back** is the larger of two inputs:
  - lean the torso toward/away from the camera: shoulders vs hips against the calibrated stance; dead zone 5.5 cm, full 12 cm
  - step: rotation-corrected shoulder width in the image; dead zone 10%, full 22%
- Both are smoothed over 0.15 s and ignored while striking, blocking, and for 0.3 s after a strike.
- **Detection:**
  - Lean in 12 cm: full forward input, 0.41 m advanced.
  - Real side-to-side footwork (shadow_fighterD): strafe in the stepped direction on 88% of frames, 0 wrong-direction frames.
  - Standing in guard: 0% movement input.
  - Mirroring checked: stepping to your own left moves your fighter screen-left.

## Deployed URL
- **https://throwhands.tech** (also https://144-202-71-213.sslip.io). Practice: https://throwhands.tech/?mode=practice · Health: https://throwhands.tech/api/health · Pitch: https://throwhands.tech/pitch/

## Vultr (cost limits, spec section 10)
- Exactly one instance: id `7b48fd52-b976-484c-adbe-95ab42f98a5d`, plan `vc2-1c-1gb` ($5.00/month), region `dfw`, Ubuntu 24.04, IP 144.202.71.213. Nothing else created.
- Why not cheaper: `vc2-1c-0.5gb-free` only in sea/fra/mia, `vc2-1c-0.5gb-v6` ($2.50) IPv6-only, `vc2-1c-0.5gb` ($3.50) only in ewr. Dallas is ~5 ms from Austin.

## Demo video
- **Final cut ready: https://144-202-71-213.sslip.io/media/throwhands-demo.mp4** (2:27, 1280x720, H.264/AAC, 42.6 MB, loudness -16 LUFS, burned-in captions). On the server: `/home/agent/projects/brawlcam/video/out/throwhands-demo.mp4`.
- Follows Meta's required structure: problem and human connection, working demo, how AI is integrated, tools/harnesses. Hook: a real punch and the slow-motion super uppercut in the first 6 s.
- Made with code: gameplay rendered by the real game in a frame-stepped record mode (fighters driven by saved pose landmarks; no third-party footage appears), UI captured from the live site, HTML title cards, ElevenLabs voiceover (narration checked with a Gemini transcription), ffmpeg assembly (`video/`).
- **GitHub release asset:** https://github.com/andrewyin-builds/throwhands/releases/tag/demo-video-v1 (on the fork, because this account cannot create releases on `AndrewYin04/throwhands`). Please also attach it to a release on the main repo and upload it to YouTube for Devpost.

## Meta spend
- Server-side estimate at `/api/health` (`ai.metaSpendUsd`); cap $20 (then fallbacks). About $0.05 so far. Live smoke calls so far tonight: 8.

## What works (with evidence)
All game paths below were run end to end on the deployed server through the real UI, with real people's movement from video clips as the webcam. Details, commands, and output excerpts: [TESTING.md](TESTING.md).
- **Practice vs bot**: won by KO, lost by KO, won on time, drawn round, rematch, quit mid-round: all PASS (`npx playwright test practice`, 5 passed).
- **Online 1v1**: full best-of-3 between fighter A's and fighter B's clips: `{"samples":1715,"mismatches":0,"p95ArrivalSkewMs":49,"aHits":30,"bHits":30,"winner":2,"elo_delta":{"1":-16,"2":16}}`. Plus join by code, invalid code, spectator, ninth refused, host/guest disconnect, reconnect, 200 ms latency, phone viewports: 8 passed (`npx playwright test online2`).
- **Local 2-player**: two real clips side by side: each person controls their own fighter (`byPlayer [33,25]`); leave/return handled. Identity assignment: 0 swaps in 1,943 two-person frames with detection order shuffled every frame.
- **First load**: camera allowed / denied (clear message + retry) / no device (message + demo mode) / HTTPS redirect / Slow 3G (progress bar, menu after 183 s) / phone viewports: PASS. **Calibration**: completes in 2.8 s; too close / too far guidance: PASS.
- **Fighter Forge (Meta)**: live through the deployed page: Muse Spark text 2.3 s, Muse Image card, total 12.9 s, card colors tint the suit.
- **Tiger Data**: hypertables + continuous aggregates (real-time), Elo updates, `/api/leaderboard` returns Elo, wins, KOs, fastest punch, damage/min. TLS verified against Timescale's CA.
- **Gemini**: commentator (server-side for online rooms, client-side for local), `gemini-3.5-flash-lite` text + `gemini-3.8-flash-lite-tts` speech, verified live; browser speech fallback; mute.
- **Gesture accuracy** (labeled clips, ±300 ms): jab 6/6 with 0 false positives on the clear jab clip at 30, 15, and 10 fps; block 75% recall; X shield 100% precision / 80% recall; knee 100%; kick 83% recall. Full table and what is below target: TESTING.md.
- **Movement choice (spec P0)**: lean left/right to strafe, step toward/away (shoulder width in the image) to move forward/back, plus a duel assist that keeps you at punching range when you stand still. Hand-pointing was not prototyped yet.
- **Submission**: `submission/devpost.md` (updated 11:50 PM, no unverified claims left), `submission/judging.md` (2-min and 60-s scripts, Q&A), `submission/pitch/index.html` (deck, also served at https://144-202-71-213.sslip.io/pitch/), `submission/devto.md` (DEV.to draft).
- **Safari/WebKit**: works (main-thread pose fallback when the worker has no WebGL; camera video always laid out). Firefox: shows a clear message where WebGL is unavailable; gameplay unverified (headless Firefox here has no WebGL).
- **Movement (spec P0 decision)**: kept lean-to-strafe + step-to-advance as the default. Hand-pointing is prototyped behind `?move=point` (hold one arm straight and still for 0.3 s; sideways = strafe, forward = advance); on labeled jab and guard clips it never triggers falsely, but it takes an arm away from punching, so leaning stays the default. Please try both on a real webcam if time allows.

## Known bugs / below target
- Gesture targets (85% recall / 90% precision) are not met for every move; see TESTING.md. Pro shadowboxing clips (small, distant, sideways punches) are the weak spot.
- Headless testing uses capsule stand-ins (`?lowgfx`) because the VRM model renders at ~7 fps on the CPU-only server; the VRM look is verified with screenshots, and real GPUs are not affected.
- Meta's API intermittently answered `404 model_not_found` for `muse-spark-1.3` and `muse-image-1.0` around 9:15 PM (and returned no models to the VM over IPv6). Mitigated: IPv4-pinned client, fallback to `muse-spark-1.2`, image retries, house-fighter fallback.

## Cuts made
None so far.

## Requests for planner
1. **DNS, checked 2:17 AM:** for the apex `throwhands.tech`, nameservers `tech-domains.mars` and `tech-domains.mercury` answer **127.0.0.1**; venus and earth answer 144.202.71.213. `www` is correct on all four, and https://www.throwhands.tech now 301-redirects to the apex. Please contact the registrar about the apex record.
2. **Real-webcam check of the new movement:** step left/right and lean left/right, lean toward/away. Does your fighter go the way you expect on screen? Then try the tutorial.
3. **Research recordings:** play with `?research=1`, press the marker keys, and copy the downloaded `.webm` and `.jsonl` to the server. I will score them with `tests/tools/research-score.ts`.
4. **License note:** quaternius.com/license.html now shows a newer "Quaternius Asset License" (2026-08-28) that restricts redistributing assets. The zips we downloaded today carry CC0 text (included in the repo), and that license's section 7 says changes are not retroactive.
3. **Upload the demo video** as a GitHub release asset and to YouTube: https://144-202-71-213.sslip.io/media/throwhands-demo.mp4
4. **Real webcam + real phone check** (spec 9.3: a path counts as done only when both agents' runs pass). On https://144-202-71-213.sslip.io:
   - Laptop Chrome: Practice vs Bot. Does the fighter mirror your arms and head? Do jabs, hooks, uppercuts register? Block (both forearms up in front of the face)? Shield (cross arms in an X above your head, with a full meter)? Report misses and false triggers in REVIEW.md.
   - Phone (iOS Safari and/or Android Chrome, landscape): same, plus pose fps shown in the camera preview corner, and whether the GPU delegate crashes on iOS (WebKit bug 321693).
   - Online: laptop creates a room, phone joins by code; play one round.

## Requests for user
- Same as planner request 1 if the planner cannot change repo collaborators.
