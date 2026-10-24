/goal Build, deploy, test, and package Brawlcam (working name) for HackTX 2026 so it wins the most valuable prizes it can. Brawlcam is a webcam-controlled 3D fighting game that runs in the browser. Deliver a working deployed game, a demo video file, and all submission text by 10:15 AM CDT Sunday, October 25, 2026. The full spec is at the end of this prompt and in `SPEC.md` in the repo.

# 1. Context

HackTX 2026 is a 24-hour college hackathon at UT Austin. Hacking ends at 11:30 AM CDT on Sunday, October 25. Judges try projects live from 2:00 to 5:00 PM Sunday. Event rules that affect your work:

- **All code must be written during the hacking period**, which started at 11:30 AM Saturday. Open-source libraries are allowed. Pre-written project code is not.
- **The repo and the demo video must be public** and stay public, or the prize is reassigned.
- **AI coding tools are allowed but must be disclosed.** The submission's "Built with" section names Claude Code.
- **Judging criteria**, weighted equally: Technology, Design, Completion, Learning. Judges decide by gut feel after a few minutes with the live demo, so the first 20 seconds of play must work and impress.
- **Best Overall** also considers "design, complexity, and impact" and "a unique vision".
- **Prior art.** HackTX's 2025 Best Overall winner was AstroDoodle.party, a 2-player game played with webcam-tracked physical wands. PennApps 2025's 1st place was kinemo, webcam boxing with MediaPipe (https://devpost.com/software/kinemo). Brawlcam must look clearly beyond kinemo: 3D superhero avatars, super moves, online play across devices, AI-generated fighters, and a business.

# 2. Roles: two agents on two machines

- **You, the implementation agent**, run on the user's home server. It has no monitor, no webcam, and no access to the user's browser, cookies, or logins. You have Playwright for browser automation, plus disk space and dev tools. You own building, deploying, and testing the game; finding and downloading test clips; rendering the demo video; and drafting all submission text and the pitch deck.
- **The planner agent** runs on the user's laptop at the venue. It has the user's logged-in Chrome and a real webcam. It owns everything that needs a login (GitHub repo settings, Devpost, YouTube upload, DEV.to publishing, the .tech domain DNS, creating sponsor accounts) and real-webcam and real-phone checks.
- **Never try to sign into the user's accounts.** When you need a login-gated action (an API key you lack, a DNS record, a Vultr VM you cannot create with the keys you have), write a request under "Requests for planner" in `STATUS.md`. If you need the user directly, put all of it in one batched request. Do not ask the user for test clips; find them yourself (spec section 6).

# 3. Environment

API keys are in an environment file on this server. The user was asked to put it at `~/hacktx26/.env`. If it is not there, ask in `STATUS.md`. Expected variable names:

- `GEMINI_API_KEY`
- `META_API_KEY` (Meta Model API from dev.meta.ai)
- `TIGER_DATABASE_URL`
- `VULTR_API_KEY`
- `VERCEL_TOKEN` or a Cloudflare token
- `ELEVENLABS_API_KEY` (optional, for video voiceover)
- `SOLANA_DEVNET_SECRET` (optional)

Some may be missing. Build so that each integration fails soft: the game must still run without it. Never commit keys; the repo is public. Keys stay server-side behind the API server.

**Headless constraints:**

- **WebGL.** Headless Chromium may fail to create a WebGL context. Launch Chromium with `--use-gl=angle --use-angle=swiftshader-webgl --enable-unsafe-swiftshader`, and verify early that three.js renders a non-blank canvas. Use the full `chromium` channel if headless-shell fails. Check current Playwright and Chromium docs for flag changes.
- **No camera.** Feed the clips you downloaded (spec section 6) with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream --use-file-for-fake-video-capture=/abs/path/clip.mjpeg`.
- **Footage.** Record app footage with Playwright's `recordVideo` option or by capturing canvas frames. The downloaded clips are third-party footage. When recording for the demo video, hide the camera preview and skeleton overlay so only the 3D fighters appear.

# 4. How to work

- Build in this order: the 20-second demo moment end to end (pose, mirrored avatar, punch, block, opponent reacting), then reliability, then design, then breadth (P1 and P2 features).
- Deploy to a public HTTPS URL within the first hour and keep it deployed. Phones require HTTPS for camera access.
- Testing is extensive and is specified in spec section 9. It covers every user path in the table there, and pro fighters' clips playing full matches against each other online and on one camera. Build the test harness in the first hours alongside the game, not at the end.
- These rules from the user's standing project rules apply to all your work:
  1. **Do not factor development cost into decisions.** Never choose an approach, narrow scope, or sample instead of covering everything because the right way takes longer or costs more tokens. Decide on correctness and robustness. If time forces a cut, state it as information, cut by the rule in spec section 8, and log it in `STATUS.md`.
  2. **Always do end-to-end user testing.** Unit tests passing is not evidence. Run the real app through the real entry point, with real inputs and the real data path, and verify the user-visible result. Paste the actual command and actual output as evidence. Check the adjacent flows a change could have broken, not only the happy path. If something cannot be tested end to end, say so explicitly and say exactly what remains unverified.
  3. **Always reproduce a bug before fixing it.** Get a deterministic, minimal repro that fails on demand. Capture it as a failing test, a script, or an exact command with its output. Find the root cause; do not fix symptoms. Fix it, re-run the same repro and show it passes, and keep it as a regression test. If a bug cannot be reproduced, say so and keep investigating; never ship a speculative fix.
  4. **Every claim must be verified.** Look up anything that could have changed since your training (versions, APIs, model names, prices, limits) in current primary sources: official docs, the actual repo, the spec. Say what you checked and where. Label anything unverified as unverified.
  5. **Keep `README.md` current**, as described below.
- When web search or fetch fails or returns a JavaScript-only page, retry with `curl` and a browser user agent, then with Playwright.
- Commit and push often with clear messages. Do not add a `Co-Authored-By` trailer or any other AI attribution line to commit messages. Keep `README.md` current: what it is, how to run it, the deployed URL, tracks entered, library versions, and "Built with Claude Code".

# 5. Coordination through the repo

- **`STATUS.md`** is yours. Update it at every milestone, and whenever you are blocked. Sections:
  - deployed URL
  - what works, with evidence
  - known bugs
  - cuts made
  - requests for planner
  - requests for user
- **`REVIEW.md`** is the planner's. It holds the results of real-webcam and real-phone checks, and change requests in priority order. `git pull` and read it before starting each new milestone, and handle its items first.
- **`SPEC.md`**: a dated change note at its top overrides this prompt.
- **`DECISIONS.md`** records why this idea was chosen. Read it once.

# 6. Demo video (due as a release asset by 10:15 AM)

- Length 2 to 3 minutes; check Devpost for a stated limit. Structure:
  1. 0 to 10 s: the hook, a fighter throwing a punch and blasting the opponent, with the super uppercut in slow motion
  2. the idea in one line
  3. live walkthrough: practice, local 2-player, super moves, online 1v1, Fighter Forge
  4. technical depth: pose pipeline, retargeting, gesture rules, relay architecture, sponsor tech
  5. business: skins, season pass, ranked play, motion data for robotics labs
  6. closing shot with the URL
- Produce it with code. Research current options, such as Remotion for React-based composition, Playwright recordings of the real deployed app, HTML/CSS title cards rendered to frames, ffmpeg for assembly, TTS for voiceover (ElevenLabs if the key exists, otherwise Gemini TTS), and burned-in captions.
- Never show third-party footage from the downloaded clips. If the planner adds clips of the user to `STATUS.md`, use them in a picture-in-picture inset beside the game, because a real person's punch next to the fighter's punch shows the core idea fastest.
- Watch your render end to end (extract frames and inspect them) before publishing it.
- Publish it as a GitHub release asset, not a git commit. If you cannot create a release without the user's login, put the file on the server, add its path to `STATUS.md`, and request upload help.

# 7. Submission text and pitch (due under `submission/` by 10:15 AM; first draft by 11:00 PM Saturday)

- **`submission/devpost.md`**: title, tagline, and the sections Inspiration, What it does, How we built it, Challenges, Accomplishments, What we learned, What's next (with the business plan), and Built with (Claude Code plus every library and sponsor tool). Add one paragraph per entered track, using that track's own wording from the spec.
- **`submission/judging.md`**:
  - a 2-minute script and a 60-second script, ordered: live demo first, then Technology, Design, Completion, Learning
  - answers to likely questions: what was hard, what is real vs. mocked, how it makes money, how it differs from kinemo, what is next
- **`submission/pitch/`**: a short deck generated in code (HTML slides) for the 5:30 PM pitch competition, built around a live fight on stage.
- **`submission/devto.md`**: a DEV.to post about how it was built.

# 8. The spec

The full spec follows. It is identical to `SPEC.md` at handoff time; after handoff, `SPEC.md` is the source of truth.

---

# SPEC: Brawlcam (working name)

Last change: 2026-10-24 6:10 PM CDT. Dropped the hardware wristband and the Best Hardware track, because it needs the user's physical work. The implementation agent now finds and downloads its own test clips (section 6). Real-person footage of the user is no longer required. Added section 9 (testing): every user path, plus UFC fighter clips playing each other online. When this file changes after handoff, add a dated note at the top saying what changed. A dated note here overrides the implementation prompt.

## 1. Product

**One sentence.** Brawlcam is a browser fighting game where your body is the controller: your webcam tracks your pose, your 3D superhero copies your movements, and your real punches, blocks, and special-move gestures fight a friend on another laptop or phone.

**The 20-second demo moment.** A judge stands in front of the laptop. Within 5 seconds their avatar mirrors their arms and head. They throw a real punch; their fighter throws a glowing punch with screen shake and knocks the bot opponent back. They cross their arms in an X and a shield appears. They drive a fist upward and a super uppercut launches the opponent in slow motion. Everything must work on the first try in a noisy, brightly lit room.

**Why it can make money.** Three revenue lines, which the pitch, the store page, and the Devpost write-up must all present:

1. Cosmetic skins and auras, including AI-generated custom fighters: $2 to $10 each, plus a $5/month season pass. Fitness Boxing on Switch has sold 3M+ units, and no browser-based webcam fighter has meaningful traction yet.
2. Ranked play with Elo matchmaking. This drives retention and season-pass sales.
3. Motion data licensing. Players can opt in to share anonymized 3D pose sequences of strikes, blocks, and dodges, labeled by the game itself. Humanoid-robotics labs buy human motion data. No video ever leaves the device: only landmark coordinates are sent. This is a pitch and dashboard feature, not a data sale.

## 2. Prize tracks and how the product meets each

Non-MLH tracks (maximum 3). Best Overall and Best Pitch are entered automatically and do not count toward the 3.

- **Most Entertaining (Jester's Court), PS5 per member.** Criterion, quoted: "projects that capture that same excitement and keep people coming back for more. If you think you can build something we won't want to put down." Features that meet it: instant play with no account, two-player mode on one camera, super moves, KO slow motion, rematch button, leaderboard.
- **Meta: "Bringing People Closer Together with AI".** Judged on, quoted: "how meaningfully they strengthen human connection, how essential and well-integrated AI is, originality, and the strength of the working demo." Features that meet it:
  - online 1v1 with friends anywhere, using a room code or link
  - Fighter Forge: Muse Spark writes your fighter's name, backstory, and move names from a prompt, and Muse Image generates the fighter card art
  - a shareable rivalry card after each match, generated with Muse Image, to send to the friend you fought
  - Meta Model API docs: https://dev.meta.ai/products/meta-model-api/. It is OpenAI-SDK compatible with a different base URL. Check the docs for the base URL and model names.

MLH tracks (no limit; each must do real work that is visible in the demo):

- **Gemini API**: the live fight commentator. During a match, batched game events (hits, blocks, combos, health) go to a Gemini Flash model every 3 to 4 seconds, which returns one short hype line. The line is spoken with Gemini TTS, falling back to the browser's speechSynthesis. Docs: https://ai.google.dev/gemini-api/docs. Use a free-tier model; the research found "Gemini 3.8 Flash" recommended on the pricing page, so verify the current model ID.
- **Tiger Data**: the stats backend.
  - A `match_events` hypertable stores every hit, block, and super with a timestamp.
  - A `pose_samples` hypertable stores opt-in landmark frames.
  - Continuous aggregates power the leaderboard (wins, Elo, fastest punch, most damage per minute) and the motion-data dashboard.
  - Docs: https://www.tigerdata.com/docs. Continuous aggregates do not aggregate in real time by default since v2.13, so set a refresh policy or enable real-time aggregation.
- **Vultr**: hosts the multiplayer WebSocket relay and the API server on a Vultr VM (MLH gives $100 credit via https://www.mlh.com/partners/vultr).
- **.Tech domain**: the user claims the domain and points it at the frontend. Choose the name with the user. It should be short and say what the game is.
- **Solana**: optional and cut first. Skins owned as devnet tokens.
- **Not entered**: Snowflake. Also not entered: SpaceXSI, because the team is not using Cursor and Grok Bot.
- **DEV Writing Challenge ($100)**: a write-up published on dev.to after hacking ends.

## 3. Feature list in priority order

P0 must work for the demo. P1 should work. P2 is cut first, in reverse order of listing, if a milestone slips.

| Pri | Feature | Acceptance criteria (tested on the deployed HTTPS URL) |
|---|---|---|
| P0 | Pose tracking | Within 5 s of granting camera access, an on-screen skeleton overlay tracks the player. Runs at 20+ fps on a laptop. Upper body alone is enough; legs are optional. |
| P0 | Avatar mirroring | A 3D humanoid fighter in a ring copies the player's arms, torso lean, and head turn with under 150 ms of visible lag. A raised right hand raises the avatar's right hand (mirror-correct). |
| P0 | Punch | A fast forward or hook motion of either fist triggers a punch animation with VFX. Damage scales with fist speed (5 to 15 HP). The opponent recoils. |
| P0 | Block | Both forearms raised in front of the face sets a blocking state. Hits during block deal 20% damage and show a block spark. |
| P0 | Super moves | A meter fills from hits dealt and taken. When full, these gestures fire a super: **Uppercut** (fist driven sharply upward from below the chest) for 25 HP with a slow-motion launch; **Shield** (forearms crossed in an X) for 3 s of invulnerability; **Energy blast** (both palms pushed forward together) for a ranged 20 HP projectile. Each has a cooldown. |
| P0 | Practice vs bot | A solo mode against a CPU fighter that approaches, punches, and blocks on a timer with randomness. Health bars, a 60 s round timer, best of 3, a KO screen, and a rematch button. |
| P0 | Local 2-player | Two people stand side by side in front of one camera (MediaPipe `numPoses: 2`). The left person controls fighter 1 and the right person controls fighter 2. This is the judging-booth mode. |
| P0 | Movement | Leaning the torso left or right moves the fighter sideways. Stepping toward or away from the camera, detected by change in shoulder width, moves forward or back. Prototype hand-pointing as an alternative and keep whichever feels better; record the choice in `STATUS.md`. |
| P0 | Mobile | Playable in Chrome on Android and Safari on iOS in landscape, using the front camera at 480p. Falls back to the MediaPipe CPU delegate if the GPU delegate fails. |
| P1 | Kicks | When knees and ankles are visible (standing mode), a fast knee raise or leg extension triggers a kick for 12 to 18 HP. When legs are not visible, kicks are disabled and a small "step back for kicks" hint appears. |
| P1 | Online 1v1 | Create a room, share a link or 4-letter code, and a friend joins from another device. Each client sends its pose state and actions at 20 Hz through the WebSocket relay. The relay decides hit outcomes using the defender's latest block state and echoes results to both clients. Works across Wi-Fi and cellular. |
| P1 | Fighter Forge (Meta) | A text prompt such as "lava golem with a crown" returns a name, backstory, and three move names (Muse Spark) and a card image (Muse Image) within 15 s. The image's dominant colors tint the avatar and its aura. The card shows in the lobby and on the opponent's screen. |
| P1 | Rivalry card (Meta) | After an online match, a generated image card shows both fighters, the score, and a one-line AI summary, with a share button using the Web Share API or a copy-link fallback. |
| P1 | Commentator (Gemini) | During matches, one hype line every 3 to 4 s based on what just happened, spoken aloud, with a mute toggle. |
| P1 | Accounts-lite and Elo | A nickname stored in localStorage; no passwords. Online wins and losses update Elo (K=32), stored in Tiger Data. Leaderboard page. |
| P1 | Store page | Skins and auras with prices and a season-pass card. Purchases are mocked; label the button "Demo: no charge". Include the opt-in toggle for motion data sharing. |
| P2 | Motion data dashboard | A page for a "robotics lab buyer": counts of labeled strike, block, and dodge sequences by type, from continuous aggregates; a 3D replay of one anonymized sequence; an export-to-JSON sample. |
| P2 | Solana skins | Buying a skin mints a devnet token to a throwaway wallet. Cut first. |

**Out of scope:** hardware of any kind, real payments, password accounts, matchmaking queues beyond room codes, more than 2 players per match, video upload of any kind, anti-cheat.

## 4. Architecture

Library versions below were checked on the npm registry on 2026-10-24. Re-check before installing.

- **Frontend**: Vite + TypeScript. three.js 0.186.1. `@pixiv/three-vrm` 3.5.5 for the humanoid avatar. Use `vrm.humanoid.getNormalizedBoneNode()` to set bone rotations, and use free VRoid sample VRM models (check the license of each model).
  - **Pose**: `@mediapipe/tasks-vision` 1.1.1, Pose Landmarker lite model, `runningMode: "VIDEO"`, GPU delegate with CPU fallback, run in a Web Worker because `detectForVideo` blocks the main thread. Docs: https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js
  - **Retargeting landmarks to bones**: Kalidokit (MIT) contains a `Pose.solve` that maps MediaPipe landmarks to VRM rotations, but the package has been deprecated since 2022. Vendor the needed function into the repo with its license header, or write the arm, torso, and head solver directly from world landmarks.
  - **Hit detection**: use landmark wrist velocity and position, not mesh collisions.
- **Gesture recognition**: rule-based. Compute per-landmark velocities in world coordinates over a short window. Apply thresholds, cooldowns, and a calibration step: a 3-second "stand in a guard pose" at match start that sets the player's arm length and shoulder width. Use no ML classifier unless the rules fail.
- **Multiplayer**: a small Node server using the `ws` package with room codes, running on a Vultr VM behind Caddy for automatic HTTPS. Use a WebSocket relay rather than peer-to-peer WebRTC, because WebRTC with STUN alone often fails between phones on cellular networks. Phones require HTTPS for camera access.
- **API server**: on the same VM, it proxies calls to Gemini, the Meta Model API, and Tiger Data so that no API keys reach the browser.
- **Database**: Tiger Data (Postgres plus TimescaleDB).

```
players(id uuid pk, nickname text, elo int default 1000, created_at timestamptz)
matches(id uuid pk, mode text, p1 uuid, p2 uuid, winner uuid, started_at timestamptz, ended_at timestamptz)
match_events(time timestamptz, match_id uuid, actor uuid, type text, damage int, speed real)  -- hypertable on time
pose_samples(time timestamptz, session_id uuid, label text, landmarks jsonb)  -- hypertable, opt-in only, no player id
leaderboard_daily  -- continuous aggregate over match_events
motion_label_counts  -- continuous aggregate over pose_samples
```

- **WebSocket messages** (JSON):
  - client to server: `join{room, nickname, fighter}`, `state{t, pose, blocking, x}` at 20 Hz, `action{t, kind, hand, speed}`
  - server to client: `peer_joined`, `peer_state`, `hit{target, damage, kind, blocked}`, `round{n, hp1, hp2, timer}`, `match_over{winner, elo_delta}`
- **Hosting**: the static frontend on Vercel or Cloudflare Pages, or served by Caddy on the same Vultr VM. Use whichever the user has an account for. The .tech domain points at it.

## 5. Riskiest components and how to prove them first (by 8:30 PM)

1. **Pose frame rate on phones, and iOS GPU stability.** WebKit bug 321693 reports a crash with Pose Landmarker and the GPU delegate on the iOS 27 beta.
   - Deploy a bare HTTPS page with Pose Landmarker lite and an FPS counter.
   - Ask the planner to test it on the user's phone and laptop.
   - Below 15 fps: drop to the CPU delegate, 480p, or detection on every other frame.
2. **Headless testing on the server.** Write one Playwright script that launches Chromium with:
   - `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream --use-file-for-fake-video-capture=/abs/path/clip.mjpeg`
   - `--use-gl=angle --use-angle=swiftshader-webgl --enable-unsafe-swiftshader`

   Assert that 33 landmarks are detected from a recorded clip and that the WebGL canvas is not blank. Make clips 640x480 MJPEG with ffmpeg, because Y4M is about 1 GB per 10 s at 1080p. If the GPU delegate fails under SwiftShader, use the CPU delegate in tests only.
3. **Punch detection that feels fair.** Tune thresholds on the downloaded clips from section 6.

## 6. Test clips

The server has no camera, and the user will not record clips. Find and download them yourself from YouTube, TikTok, or other video sites with `yt-dlp`, then trim and convert them to 640x480 MJPEG with ffmpeg. Collect 5 to 10 seconds each of:

- a fighting guard pose held still
- jab
- hook
- uppercut
- a high block, both forearms in front of the face
- arms crossed in an X
- both palms pushed forward together
- front kick and knee raise
- two people standing side by side, facing the camera, both moving
- real UFC or MMA fights: two fighters exchanging strikes, at least 5 clips from different fights and camera angles
- solo shadowboxing by at least 2 different pro fighters, used as fighter A and fighter B in online tests (section 9)

Prefer front-facing, single-camera clips: shadowboxing tutorials, boxing and fitness workouts, martial-arts drills. Keep a `clips/manifest.md` listing each file's source URL, timestamps, and what it shows.

The clips are for local testing only. They stay out of the public repo (`clips/` is in `.gitignore`), and no third-party footage may appear in the demo video.

## 8. Milestones (CDT)

| Time | Milestone | Owner |
|---|---|---|
| Sat 7:15 PM | Handoff: this spec and the implementation prompt committed | Planner |
| 8:30 PM | Risk spikes 1 and 2 proven; bare pose page deployed over HTTPS | Implementation agent |
| 11:00 PM | MVP deployed: pose, avatar mirroring, punch, block, practice vs bot, health and KO | Implementation agent |
| 11:00 PM | Draft Devpost text committed (`submission/devpost.md`) | Implementation agent |
| 11:30 PM | Soft submission on Devpost | Planner |
| Sun 3:00 AM | All P0 features done: supers, local 2-player, movement, mobile | Implementation agent |
| 6:30 AM | P1 features as far as they go: online 1v1, Forge, commentator, Elo, store | Implementation agent |
| 7:30 AM | Feature freeze | Both |
| 10:15 AM | Video published as a GitHub release asset; final Devpost text, per-track paragraphs, judging scripts, pitch deck, DEV.to draft committed under `submission/` | Implementation agent |
| 11:00 AM | Final Devpost submission | Planner |

Cut rule: if a milestone slips by more than one hour, cut P2 features first, then P1 features from the bottom of the table upward. Write each cut in `STATUS.md`.

## 9. Testing

Testing must be extensive. Every user path in the table below must be exercised end to end against the deployed HTTPS URL, through the real UI, with real pose input from video clips. Unit tests may supplement this but never count as evidence that a feature works.

### 9.1 Driving the game with real people's movement

- **Fake camera, Chromium.** Launch each browser with `--use-file-for-fake-video-capture` pointing at a different clip (section 6). Each Chromium process gets its own fake camera.
- **Injected camera, all browsers.** For WebKit and Firefox, which lack the file-based fake camera, use a Playwright init script that overrides `navigator.mediaDevices.getUserMedia`. The override plays the clip in a hidden `<video>`, draws it to a canvas, and returns `canvas.captureStream(30)`. This also lets one test switch clips mid-session.
- **Ground truth.** For every clip, record in `clips/manifest.md` the expected events with timestamps, found by inspecting frames: for example "jab right at 1.2 s, 2.0 s; block 3.1 to 4.0 s". Tests assert that detected events match within ±300 ms. Report precision and recall per move type (jab, hook, uppercut, block, X-shield, palm push, kick). Target 85% recall and 90% precision on clear front-facing clips. Write the numbers in `TESTING.md` and re-run them after every threshold change.
- **UFC and real-fight footage.** Download clips of real UFC or MMA fights and shadowboxing by pro fighters. Use them for:
  - **Fighter vs. fighter online.** Fighter A's clip drives browser 1 and fighter B's clip drives browser 2. Both join the same room and play a full best-of-3 match. Assert:
    - both clients show the same HP, round, and timer within 1 network tick
    - hits that land on one screen appear on the other
    - blocks reduce damage
    - the match ends with one winner and both clients agree on it
    - Elo updates in Tiger Data
  - **Two fighters on one camera.** A clip containing both fighters drives local 2-player mode with `numPoses: 2`. Assert that each fighter's movement controls the correct avatar and that the assignment does not swap mid-round when they cross or overlap. If they do cross, the swap must recover.
  - **Robustness.** Side-on angles, fast exchanges, partial occlusion, people walking through the background, low light, and a crowd behind the player.
- **Edge input.** No person in frame, a person leaving and returning mid-round, only upper body visible (kicks disabled and the hint shown), full body visible (kicks enabled), and a seated player.

### 9.2 User paths (every row must pass before the 7:30 AM freeze)

| Area | Paths to test |
|---|---|
| First load | Desktop and phone viewports. Camera allowed. Camera denied: a clear message with a retry button. No camera device: a message, plus a demo mode against the bot with a pre-recorded pose. HTTPS required. Slow 3G throttling: the loading screen shows progress and the model loads. |
| Calibration | Guard pose detected; calibration completes in 3 s. The player is too close or too far: on-screen guidance appears. |
| Practice vs bot | Full match won by KO, lost by KO, won on time, a drawn round, rematch, quit to menu mid-round. |
| Local 2-player | Full match; one player leaves the frame mid-round (their fighter idles, the game does not crash); both players leave the frame. |
| Online 1v1 | Create room; join by link; join by code; invalid code; room full (third player); host disconnects mid-round; guest disconnects mid-round; reconnect within 10 s resumes; both players on phones; one on desktop and one on phone; 200 ms added latency. |
| Supers | Each super fires only when the meter is full, the cooldown is respected, Shield blocks all damage for 3 s, Energy blast travels and can be blocked. |
| Fighter Forge | Valid prompt; empty prompt; offensive prompt (handled by the model's refusal and shown politely); Meta API key missing or erroring (falls back to a default fighter, and the game still works); generation longer than 15 s (spinner, then timeout fallback). |
| Commentator | Lines arrive during play; mute and unmute; Gemini key missing or rate-limited (silent fallback, no errors shown to the player). |
| Rivalry card | Generated after an online match; share via Web Share where supported; copy-link fallback. |
| Leaderboard and Elo | Updates after an online match; the page loads with an empty database; Tiger Data unreachable (the page shows a friendly error, and the game still works). |
| Store | Browse; mock purchase marks the item owned; equip a skin and see it in game; motion-data opt-in toggle persists. |
| Motion data dashboard | Counts update after an opted-in match; opted-out sessions write no pose samples; export a JSON sample. |
| Browsers | Chromium desktop, WebKit (as a proxy for iOS Safari), Firefox, Chromium on a mobile viewport in landscape and portrait. |
| Performance | FPS readout of 20+ on the server with SwiftShader is not required, but record it. Memory does not grow over a 10-minute session. No console errors during any path. |

### 9.3 Evidence

- Keep the test suite in `tests/e2e/` (Playwright). A single command runs it against any URL: `BASE_URL=https://... npx playwright test`.
- `TESTING.md` lists every path above with: pass or fail, the date and time of the last run, the command, a short excerpt of the actual output, and for failures the repro steps.
- Save screenshots and Playwright traces for failures in `test-results/`, which is not committed.
- Before each milestone in section 8, run the full suite against the deployed URL and paste the summary into `STATUS.md`.
- The planner repeats the core paths with a real webcam and a real phone and reports in `REVIEW.md`. A path counts as done only when both agents' runs pass.
