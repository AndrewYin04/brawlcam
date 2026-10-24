# SPEC: Brawlcam (working name)

Last change: 2026-10-24 6:00 PM CDT, initial version. When this file changes after handoff, add a dated note at the top saying what changed. A dated note here overrides the implementation prompt.

## 1. Product

**One sentence.** Brawlcam is a browser fighting game where your body is the controller: your webcam tracks your pose, your 3D superhero copies your movements, and your real punches, blocks, and special-move gestures fight a friend on another laptop or phone.

**The 20-second demo moment.** A judge stands in front of the laptop. Within 5 seconds their avatar mirrors their arms and head. They throw a real punch; their fighter throws a glowing punch with screen shake and knocks the bot opponent back. They cross their arms in an X and a shield appears. They drive a fist upward and a super uppercut launches the opponent in slow motion. If the wristband is worn, it buzzes when they take a hit. Everything must work on the first try in a noisy, brightly lit room.

**Why it can make money.** Three revenue lines, which the pitch, the store page, and the Devpost write-up must all present:

1. Cosmetic skins and auras, including AI-generated custom fighters: $2 to $10 each, plus a $5/month season pass. Fitness Boxing on Switch has sold 3M+ units, and no browser-based webcam fighter has meaningful traction yet.
2. Ranked play with Elo matchmaking. This drives retention and season-pass sales.
3. Motion data licensing. Players can opt in to share anonymized 3D pose sequences of strikes, blocks, and dodges, labeled by the game itself. Humanoid-robotics labs buy human motion data. No video ever leaves the device: only landmark coordinates are sent. This is a pitch and dashboard feature, not a data sale.

## 2. Prize tracks and how the product meets each

Non-MLH tracks (maximum 3). Best Overall and Best Pitch are entered automatically and do not count toward the 3.

- **Most Entertaining (Jester's Court), PS5 per member.** Criterion, quoted: "projects that capture that same excitement and keep people coming back for more. If you think you can build something we won't want to put down." Features that meet it: instant play with no account, two-player mode on one camera, super moves, KO slow motion, rematch button, leaderboard.
- **Best Hardware Hack (Brick House), RTX 5080 per member.** Criterion, quoted: "ambitious projects that push beyond the screen and create something that deals with the tangible. The project can range from physical games and robots to custom accelerators." Feature that meets it: an ESP32 wristband with an IMU that measures real punch acceleration (scaling damage) and a vibration motor that buzzes when you are hit. This feature depends on parts from the MLH Hardware Lab (section 7). If no parts are available, swap this track for none and spend the time on design polish.
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
| P1 | Hardware wristband | See section 7. The wristband pairs from a settings screen. The IMU's peak acceleration scales punch damage when worn, and the motor buzzes for 150 ms on taking a hit, 400 ms on taking a super. |
| P1 | Accounts-lite and Elo | A nickname stored in localStorage; no passwords. Online wins and losses update Elo (K=32), stored in Tiger Data. Leaderboard page. |
| P1 | Store page | Skins and auras with prices and a season-pass card. Purchases are mocked; label the button "Demo: no charge". Include the opt-in toggle for motion data sharing. |
| P2 | Motion data dashboard | A page for a "robotics lab buyer": counts of labeled strike, block, and dodge sequences by type, from continuous aggregates; a 3D replay of one anonymized sequence; an export-to-JSON sample. |
| P2 | Solana skins | Buying a skin mints a devnet token to a throwaway wallet. Cut first. |

**Out of scope:** real payments, password accounts, matchmaking queues beyond room codes, more than 2 players per match, video upload of any kind, anti-cheat.

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
3. **Punch detection that feels fair.** Tune thresholds on recorded clips of real punches. The user will record clips on the venue laptop.

## 6. Test clips

The server has no camera. Use:

- Clips the user records at the venue: guard pose, jab, hook, uppercut, block, X-shield, palm push, kicks, and two people side by side. The user copies them to the server.
- Openly licensed clips of people punching or shadowboxing, which may be downloaded with yt-dlp for local testing only. Never put third-party footage in the public repo or the video.

## 7. Hardware wristband (conditional on MLH Hardware Lab parts)

Parts to request at the MLH Hardware Lab table (Welch Grand Hallway, https://mlh.link/hardware):

- ESP32 dev board, ideally ESP32-S3 with Wi-Fi and BLE
- IMU breakout: MPU6050, BMI160, or similar
- coin vibration motor, NPN transistor or MOSFET, flyback diode
- jumper wires, a USB cable, and a battery pack if available

Firmware, written by the implementation agent and flashed by the planner on the venue laptop with `arduino-cli`:

- read the IMU at 200 Hz
- detect a punch as a peak in linear acceleration magnitude above a threshold
- send `{type:"punch", peak_g}` to the game

Transport options:

- **WebSocket to the relay over Wi-Fi.** This works with any browser, including iOS. It needs venue Wi-Fi credentials or a phone hotspot, and captive-portal networks may block it.
- **Web Bluetooth.** Supported in Chrome desktop and Chrome Android, not iOS Safari or Firefox. Use a GATT notify characteristic for punches and a write characteristic for haptics.

Implement Web Bluetooth first, because it needs no Wi-Fi, and the WebSocket path second. The game sends `{type:"buzz", ms}` on taking a hit.

The planner cannot see wiring. Write a wiring diagram as text with pin numbers, and a serial-monitor test sketch that prints IMU readings and pulses the motor, so the user can verify each part.

## 8. Milestones (CDT)

| Time | Milestone | Owner |
|---|---|---|
| Sat 7:15 PM | Handoff: this spec and the implementation prompt committed | Planner |
| 8:30 PM | Risk spikes 1 and 2 proven; bare pose page deployed over HTTPS | Implementation agent |
| 11:00 PM | MVP deployed: pose, avatar mirroring, punch, block, practice vs bot, health and KO | Implementation agent |
| 11:00 PM | Draft Devpost text committed (`submission/devpost.md`) | Implementation agent |
| 11:30 PM | Soft submission on Devpost | Planner |
| Sun 3:00 AM | All P0 features done: supers, local 2-player, movement, mobile | Implementation agent |
| 6:30 AM | P1 features as far as they go: online 1v1, Forge, commentator, Elo, store, wristband | Implementation agent |
| 7:00 AM | Real-person footage recorded and copied to the server | User |
| 7:30 AM | Feature freeze | Both |
| 10:15 AM | Video published as a GitHub release asset; final Devpost text, per-track paragraphs, judging scripts, pitch deck, DEV.to draft committed under `submission/` | Implementation agent |
| 11:00 AM | Final Devpost submission | Planner |

Cut rule: if a milestone slips by more than one hour, cut P2 features first, then P1 features from the bottom of the table upward. Write each cut in `STATUS.md`.
