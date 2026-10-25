# Throw Hands

A browser fighting game where your body is the controller. Your webcam tracks your pose, your 3D superhero fighter copies your movements, and your real punches, blocks, and special-move gestures fight a bot, a friend next to you, or friends on other devices.

**Play:** https://throwhands.tech (same server, backup address: https://144-202-71-213.sslip.io)

Built at HackTX 2026 (October 24 to 25, 2026). **Built with Claude Code** (AI coding tool, disclosed per the event rules).

## What you can do

- **Move with your body**: step or lean toward the camera to advance, back to retreat, sideways to circle (a short tutorial teaches it after calibration). Your fighter walks where you step.
- **Practice vs a bot** in a UFC-style octagon: best of 3, 60-second rounds, HP KOs, big hits slam fighters into the cage, rematch.
- **2 players, 1 camera**: two people side by side each control a fighter.
- **Online 1v1**: create a room, share the link or 4-letter code, fight a friend on any device. Spectators can watch and send cheers.
- **Brawl**: up to 8 fighters in a larger octagon, bots fill empty slots, knockback that grows with damage taken, 3-second respawns, live KO feed.
- **Winner stays on**: up to 8 friends, two fight at a time, the winner stays on.
- **Guard**: both forearms up in front of the face blocks 90% of damage, but a GUARD meter drains while you hold it and when hits land on it; let it empty and your guard breaks (dizzy for 2 s).
- **Super moves**: uppercut (fist driven up), Iron Wall (forearms crossed in an X above the face, elbows up: 2.5 s unbreakable guard that counters the first hit), energy blast (both palms pushed forward), when your meter is full.
- **Grappling (beta, `?grapple=1`)**: reach with both arms and pull in to **grab** into a clinch, then lift a knee for **knees** (8 damage); from the clinch, turn and bend for the **Shoulder Throw** (25 damage). Off by default while detection is tuned on real players.
- **Fighter Forge**: describe a fighter; Meta's Muse Spark writes the name, story, and moves, Muse Image paints the card, and your suit takes the card's colors.
- **Commentary**: an announcer calls the big moments instantly (pre-rendered ElevenLabs calls) over a real crowd recording; Gemini writes live lines about the fight (shown as captions).
- **Rivalry card** after online matches, **Elo leaderboard** (Tiger Data), **store** (mock purchases, "Demo: no charge"), and an opt-in **motion data** program with an explicit consent screen (labeled move sequences plus continuous 15 fps body-point streams, capped at 10 minutes per match; coordinates only, never video; stored in compressed Tiger hypertables). A separate **research mode** (`?research=1`, consent every session) records the camera to a local file only and sends labeled landmarks for gesture tuning.

No video ever leaves your device: pose tracking runs in your browser. Online play sends only joint positions and game actions.

## How it works

- **Pose**: MediaPipe Pose Landmarker (lite) in a Web Worker, GPU delegate with CPU fallback. Camera frames are read straight from the camera track (`MediaStreamTrackProcessor`) where supported, so pose rate does not depend on render rate.
- **Retargeting**: our own solver turns 15 world landmarks into bone rotations for a VRM humanoid (`web/src/game/avatar.ts`), mirror-correct, with a One Euro filter for low lag.
- **Gestures**: rule-based (`shared/gestures.ts`): strikes are detected as elbow-angle / wrist-height / sideways-sweep peaks, so they work from 10 to 30 fps; guard and the Iron Wall X from measured arm geometry; a 3-second guard calibration sets body size. Tuned and scored against labeled video clips (see [TESTING.md](TESTING.md)).
- **Game**: one deterministic simulation (`shared/sim.ts`) for any number of fighters. It runs in the browser for local modes and on the server for online rooms, where the server decides every hit using the defender's latest block state.
- **Server**: Node + `ws` on a Vultr VM in Dallas behind Caddy (automatic HTTPS). It relays rooms at 20 Hz, runs bots, and proxies Gemini, the Meta Model API, and Tiger Data so no key reaches the browser.
- **Data**: Tiger Data (PostgreSQL + TimescaleDB): `match_events` and `pose_samples` hypertables; `leaderboard_daily` and `motion_label_counts` continuous aggregates with real-time aggregation and refresh policies.

## Run it locally

```
npm install
npm run build            # frontend to dist/, server to dist-server/
TIGER_DATABASE_URL=... GEMINI_API_KEY=... META_API_KEY=... npm run server   # API + WebSocket on :8787
npm run dev              # Vite dev server with /api and /ws proxied to :8787
```

Every integration fails soft: without keys or a database the game still runs (house fighters, template commentary, no leaderboard).

Tests: `BASE_URL=https://throwhands.tech npx playwright test` (see [TESTING.md](TESTING.md); video clips are not in the repo).

Deploy: `deploy/deploy.sh` (builds, rsyncs to the VM, restarts the service).

## Prize tracks entered

- Most Entertaining (Jester's Court)
- Meta: Bringing People Closer Together with AI
- MLH: Best Use of Gemini API, Tiger Data, Vultr, .Tech domain
- Best Overall and Best Pitch (automatic)

## What we wrote vs. third-party code (Meta rules: original contribution clearly identified)

Everything in `web/src`, `shared/`, `server/`, `tests/`, `scripts/`, and `deploy/` was written during the hackathon (with Claude Code). That includes the pose-to-bone retargeting solver, gesture recognizer, game simulation, bots, networking, AI integrations, UI, synthesized sound effects, and tests. No code was vendored or copied into the repo; Kalidokit was not used.

Third-party libraries (installed from npm, unmodified):

| Library | Version | License | Use |
|---|---|---|---|
| three | 0.186.1 | MIT | 3D rendering |
| @pixiv/three-vrm | 3.5.5 | MIT | VRM avatar loading and humanoid bones |
| @mediapipe/tasks-vision | 1.1.1 | Apache-2.0 | Pose Landmarker (wasm copied to `web/public/mediapipe/` at build time) |
| MediaPipe Pose Landmarker lite model | float16/latest | Apache-2.0 | Pose model (downloaded at build time) |
| ws | 8.22.0 | MIT | WebSocket server |
| pg | 8.23.1 | MIT | PostgreSQL client |
| undici | 8.12.3 | MIT | IPv4-pinned HTTP client for the Meta API |
| vite | 8.3.5 | MIT | Build |
| typescript | 7.0.2 | Apache-2.0 | Language |
| esbuild | 0.28.2 | MIT | Server bundle |
| @playwright/test | 1.64.1 | Apache-2.0 | End-to-end tests |
| tsx | 4.23.15 | MIT | Running TypeScript tools |

Assets:

| Asset | Source | License |
|---|---|---|
| Fighters and animations (`web/public/characters/th-*.glb`): Quaternius Universal Base Characters (Superhero male/female) and Universal Animation Library 1 + 2 | [quaternius.com](https://quaternius.com), free Standard packs from itch.io, details and processing in `web/public/characters/README.md` | CC0 1.0 (license files from the downloads are in `web/public/characters/`). Credit: characters and animations by Quaternius. |
| Seed-san VRM model, used only by the `?classic` renderer (`web/public/avatars/seed-san.vrm`, textures downscaled by `scripts/optimize-vrm.py`) | VirtualCast, Inc., [vrm-c/vrm-specification samples](https://github.com/vrm-c/vrm-specification/tree/master/samples/Seed-san) | VRM Public License 1.0: avatar use by everyone, commercial use allowed, modification and redistribution allowed, credit required. **Credit: Seed-san model by VirtualCast, Inc.** We hide the robot arm and backpack and recolor the suit at runtime. |
| Bungee font (headings) | Google Fonts, David Jonathan Ross | SIL Open Font License 1.1 |
| Sound effects | Synthesized in code with WebAudio (`web/src/game/audio.ts`) | Ours |
| Fighter card and rivalry art | Generated at runtime by Meta Muse Image | Generated per player |

Test video clips (downloaded for local testing only) are not in the repo and never appear in the demo video.

## Sponsor APIs used

- **Gemini API**: `gemini-3.5-flash-lite` (commentary, fallback `gemini-3.8-flash`), `gemini-3.8-flash-lite-tts` (speech). Free tier only, server-side rate limits.
- **Meta Model API**: `muse-spark-1.3` (fallback `muse-spark-1.2`) for Fighter Forge text and rivalry lines; `muse-image-1.0` for card art. A server-side spend estimate stops Meta calls at $20.
- **Tiger Data**: hypertables and continuous aggregates for match stats, Elo leaderboard, and motion-data counts. TLS verified against Timescale's CA.
- **Vultr**: one `vc2-1c-1gb` VM (Dallas) runs Caddy, the relay, and the API server.

## Project docs

- [SPEC.md](SPEC.md): product spec (source of truth)
- [STATUS.md](STATUS.md): progress, evidence, requests
- [TESTING.md](TESTING.md): test results and gesture accuracy
- [DECISIONS.md](DECISIONS.md): why this idea
- [submission/](submission/): Devpost text, judging scripts, pitch deck
