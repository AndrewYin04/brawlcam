# Status (written by the implementation agent)

Last update: Sun Oct 25, 1:50 AM CDT.

## Since 12:05 AM
- **Pushing directly to `AndrewYin04/throwhands` main** (switched `gh` to the AndrewYin04 account; the fork/PR workaround is gone).
- **https://throwhands.tech is live** (Let's Encrypt cert). `www.throwhands.tech` has a Caddy redirect block to the apex, but its certificate is blocked: one of the four authoritative nameservers (`tech-domains.mars.orderbox-dns.com`) still answers `127.0.0.1` for `www`, so Let's Encrypt validation fails about one time in four and Caddy keeps retrying. **Planner: please re-save the `www` A record (144.202.71.213) at the registrar so all four nameservers agree.**
- **New renderer (build 4e7b98e, deployed)**: KayKit (CC0) toon characters with a locomotion state machine (idle/walk/run/strafe/back driven by real ground speed), live pose layered on chest/head/arms, authored punch/kick/hit/knockdown/get-up clips, tumble in the air, outlines. Floating sky stage, 1v1 ring-outs with damage-scaled knockback, hit-stop, sparks, flash, KO streak, bloom. `?classic` keeps the old VRM renderer.
- **Bug fixed: shield while stunned** (holding X with a full meter now fires even during hit-stun; `tests/unit/shield-while-stunned.ts`).
- **Bug fixed: leaderboard duplicate names**, reproduced first (`tests/unit/leaderboard-dup.ts` failed, now passes): players who share a nickname get a short tag (`Andrew #3f2a`).
- Calibration "too close" guidance fixed (says step back when your head leaves the frame).

## Review loop (spec section 11), log in [REVIEW-SELF.md](REVIEW-SELF.md)
| Item | R1 motion | R1 visual | R2 motion | R2 visual |
|---|---|---|---|---|
| 1 Walk/run legs, no drift | 1 | 1 | 2 | 2 |
| 2 Torso/head human | 1 | 2 | 1 | 2 |
| 3 Attacks readable | 2 | 2 | 1 | 1 |
| 4 Hit reactions / tumble | 1 | 2 | 1 | 3 |
| 5 Glows only when active | 1 | 1 | 2 | 2 |
| 6 Effects readable | 1 | 1 | 1 | 1 |
| 7 Stage / lighting | 2 | 2 | 3 | 2 |
| 8 Camera / framing | 2 | 3 | 2 | 2 |
| 9 Silhouettes | 2 | 1 | 2 | 2 |

R1 = old VRM build, R2 = build 4e7b98e. Measured: walk drift went from 89/89 frames to 11/89; frozen torso/head frames went from up to 32 to 0; foot slide is still 3 to 6 cm (target under 1 cm). Round 2 highs: the chibi helmet hides the opponent and the punches from behind; knockdowns are a stiff plank that snaps upright; full-screen flashes and the KO pillar wash out the frame; block looks like idle; no visible energy-blast projectile; the KO scene never KOs. Several of these go away with the 1:35 AM direction (human proportions, octagon, no ring-out pillar).

## Working on now (1:35 AM direction, in its order)
1. **Movement teaching** (in progress). Root cause of "idk how to move forward and backward": the 1v1 *duel assist* overrides forward/back whenever the step signal is weaker than 0.2, and pulls you back to 1.3 m as soon as you return to neutral, so stepping seems to do nothing. Fix: tutorial, HUD indicator, torso-lean forward/back, and no assist override while you are stepping.
2. Human-proportioned characters (searching for openly licensed rigged humans now) + visible contact (fist reaches the target on the hit frame, measured).
3. UFC octagon with a cage, cage bounce, HP-only KOs, Brawl HP + respawn.
4. Credits in the footer and README.

## Movement controls today (exact thresholds, `shared/gestures.ts` TUNING)
- **Strafe:** lean your shoulders sideways relative to your hips. Dead zone 3.5 cm, full speed at 10 cm.
- **Forward / back:** step toward or away from the camera. Measured as the change in your shoulder width in the image against calibration: dead zone 8%, full speed at 20% (about 25 cm and 60 cm of travel at 2 m from the camera).
- Movement is ignored on frames where you strike or block.
- **Duel assist** (1v1 only): when the forward/back signal is under 0.2, the game walks you back to 1.3 m from the opponent. This is what hid stepping.
- Move speed 2.4 m/s (half while blocking). You stop at 0.85 m from the opponent.
- `?move=point` prototype: hold one arm straight and still for 0.3 s to walk in that direction.

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
1. Re-save the `www.throwhands.tech` A record at the registrar (one nameserver still answers 127.0.0.1), see above.
2. (Done: write access and DNS for the apex.)
3. **Upload the demo video** as a GitHub release asset and to YouTube: https://144-202-71-213.sslip.io/media/throwhands-demo.mp4
4. **Real webcam + real phone check** (spec 9.3: a path counts as done only when both agents' runs pass). On https://144-202-71-213.sslip.io:
   - Laptop Chrome: Practice vs Bot. Does the fighter mirror your arms and head? Do jabs, hooks, uppercuts register? Block (both forearms up in front of the face)? Shield (cross arms in an X above your head, with a full meter)? Report misses and false triggers in REVIEW.md.
   - Phone (iOS Safari and/or Android Chrome, landscape): same, plus pose fps shown in the camera preview corner, and whether the GPU delegate crashes on iOS (WebKit bug 321693).
   - Online: laptop creates a room, phone joins by code; play one round.

## Requests for user
- Same as planner request 1 if the planner cannot change repo collaborators.
