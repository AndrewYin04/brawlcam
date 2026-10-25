# Status (written by the implementation agent)

Last update: Sun Oct 25, 12:05 AM CDT.

## Deployed URL
- **https://throwhands.tech** once DNS points here. **Vultr server IP for DNS: `144.202.71.213`** (A records for `throwhands.tech` and `www.throwhands.tech`; IPv6 `2001:19f0:6400:2445:5400:06ff:fef0:b3b0` optional). Caddy already serves both names and will fetch a certificate as soon as DNS resolves.
- Live now (same server): **https://144-202-71-213.sslip.io**
  - Practice: https://144-202-71-213.sslip.io/?mode=practice
  - Pose check page: https://144-202-71-213.sslip.io/spike.html
  - Health: https://144-202-71-213.sslip.io/api/health

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
1. **Merge PR #1: https://github.com/AndrewYin04/throwhands/pull/1** (all work so far, pushed from a fork). Then **GitHub write access:** The server's `gh` login is `andrewyin-builds`, which has read-only access to `AndrewYin04/throwhands`: every push since 8:30 PM fails with `remote: Permission to AndrewYin04/throwhands.git denied to andrewyin-builds.` (403). No invitation is pending. Please add `andrewyin-builds` as a collaborator with **Write** access, or tell me which account to push as. About 15 commits are waiting locally (including this file, `submission/devpost.md` for the soft submission, README, TESTING.md).
   - Until then, the Devpost draft is on the server at `/home/agent/projects/brawlcam/submission/devpost.md`.
2. **DNS for throwhands.tech**: public DNS currently answers `127.0.0.1` for both names. They need A records `throwhands.tech` and `www.throwhands.tech` -> `144.202.71.213`. Deploys add the names to Caddy automatically once DNS resolves here (earlier attempts while DNS was wrong got Let's Encrypt to rate-limit the name for about an hour; Caddy also tries ZeroSSL).
3. **Upload the demo video** as a GitHub release asset and to YouTube: https://144-202-71-213.sslip.io/media/throwhands-demo.mp4
4. **Real webcam + real phone check** (spec 9.3: a path counts as done only when both agents' runs pass). On https://144-202-71-213.sslip.io:
   - Laptop Chrome: Practice vs Bot. Does the fighter mirror your arms and head? Do jabs, hooks, uppercuts register? Block (both forearms up in front of the face)? Shield (cross arms in an X above your head, with a full meter)? Report misses and false triggers in REVIEW.md.
   - Phone (iOS Safari and/or Android Chrome, landscape): same, plus pose fps shown in the camera preview corner, and whether the GPU delegate crashes on iOS (WebKit bug 321693).
   - Online: laptop creates a room, phone joins by code; play one round.

## Requests for user
- Same as planner request 1 if the planner cannot change repo collaborators.
