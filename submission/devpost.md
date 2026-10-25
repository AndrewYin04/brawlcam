# Throw Hands

**Your body is the controller. Throw real punches at your friends from anywhere.**

Play it: https://throwhands.tech (backup: https://144-202-71-213.sslip.io)

## Inspiration

Our best game nights were the loud ones: friends, trash talk, and endless rematches. Motion games capture that, but need a console, an accessory, and everyone in one room.

We wanted that energy from what everyone already owns: a browser and a webcam. No download, no account, no controller. Open a link, stand up, fight.

Webcam boxing exists: kinemo won PennApps 2025 with a MediaPipe boxing console. We went further, with 3D superhero avatars, gesture-triggered super moves, online play across devices, AI-generated fighters, and a business model.

## What it does

Allow the camera and, within seconds, a 3D superhero copies your arms, torso, and head. Then you fight:

- **Jabs, hooks, uppercuts**: faster punches do more damage.
- **Block** with both forearms in front of your face. **Kick** when your legs are in frame.
- **Supers** when your meter fills: an uppercut that launches your opponent in slow motion, an X-arm 3-second shield, or a two-palm energy blast.

Matches are best of 3 with KOs, a rematch button, and synthesized sound. Modes:

- **Practice** against a CPU fighter.
- **Online 1v1** with a friend on another laptop or phone, by room code or link. <!-- VERIFY -->
- **Brawl**: a free-for-all for up to 8, with bots filling empty slots. <!-- VERIFY -->
- **Winner stays on**: two fight, the rest of the room watches and queues. <!-- VERIFY -->
- **Local 2-player**: two people side by side in front of one camera. <!-- VERIFY -->

AI is the core of it. A pose model in your browser *is* the controller. **Fighter Forge** turns a prompt like "lava golem with a crown" into a name, backstory, and move names (Muse Spark) and a fighter card (Muse Image). <!-- VERIFY --> After an online match, a **rivalry card** sums up the fight for you to send your opponent. <!-- VERIFY --> A **Gemini commentator** calls the fight out loud. <!-- VERIFY -->

Online wins feed an Elo leaderboard. A store page shows skins and a season pass with mock purchases, plus a motion-data consent screen. <!-- VERIFY -->

## How we built it

**Pose.** MediaPipe Pose Landmarker (lite) runs in a Web Worker so detection never blocks rendering, on the GPU delegate with CPU fallback. A One Euro filter smooths landmarks.

**Avatar.** three.js and @pixiv/three-vrm drive a VRM humanoid (Seed-san by VirtualCast), recolored as a superhero suit with glowing gloves and an aura. We solve arm, torso, and head rotations directly from world landmarks, mirror-correct.

**Gestures.** Rule-based TypeScript, no classifier: velocities, joint angles, and peak detection, with per-hand cooldowns and a calibration step. It also runs in Node for tuning on labeled clips.

**Simulation.** One deterministic simulation handles health, meters, supers, projectiles, rounds, and KOs. It runs in the browser for local modes and on the server for online rooms, and it was designed for N fighters: every message carries a slot ID, and bots send the same inputs as humans.

**Server.** A Node `ws` relay on a Vultr VM in Dallas, behind Caddy with automatic HTTPS. Online hits are resolved server-side from the defender's latest block state, and the server proxies Gemini, Meta, and Tiger Data so no keys reach the browser. <!-- VERIFY --> Stats live in Tiger Data hypertables. <!-- VERIFY -->

**Testing.** Playwright end-to-end tests feed downloaded video clips to headless Chromium as a fake webcam.

## Challenges we ran into

**Punches at the camera are nearly invisible.** One webcam sees depth poorly, so a jab straight at the lens barely changes measured arm extension. Switching to elbow-angle peaks (the elbow snaps open whatever the depth) raised recall on a labeled jab clip from 80% to 100%, and at 15 fps from 20% to 100%. Detection now holds from 10 to 30 fps.

**Headless tests starved the pose model.** With no GPU, Chromium renders on the CPU through SwiftShader, and the 3D scene ate the frame budget. Reading frames with `MediaStreamTrackProcessor` and decoupling pose detection from render rate fixed capture.

## Accomplishments that we're proud of

- A full fight loop with supers, slow motion, and KOs, controlled only by your body, in a browser tab.
- Jab detection measured on labeled clips at several frame rates, not guessed.
- One simulation shared by client and server, built for 1 to 8 fighters.

## What we learned

- Monocular pose is good at angles and poor at depth; build gestures on what the camera measures well.
- Test thresholds across frame rates: a gesture that works at 30 fps can vanish at 15.
- Designing for N players early makes every multiplayer mode a configuration of one room.

## What's next

More fighters and arenas, then three revenue lines:

1. **Cosmetics.** Skins, auras, and AI-generated fighters from Fighter Forge at $2 to $10 each, plus a $5/month season pass. Fitness Boxing has sold 3M+ units on Switch, and no browser webcam fighter has real traction yet.
2. **Ranked play.** Elo matchmaking and seasons drive retention and season-pass sales.
3. **Motion-data licensing.** Humanoid-robotics labs need human motion data. Players can opt in to share anonymized pose sequences of strikes, blocks, and dodges, labeled by the game. Only landmark coordinates are shared, never video, and never a player identifier. Off by default.

## Built with

- **Claude Code** (AI coding assistant, used to write and test much of the code)
- three.js 0.186.1
- @pixiv/three-vrm 3.5.5 (Seed-san VRM model by VirtualCast, VRM Public License)
- @mediapipe/tasks-vision 1.1.1 (Pose Landmarker lite)
- Vite
- TypeScript
- Node.js with `ws`
- `pg` (node-postgres)
- Playwright
- Caddy
- Vultr
- Tiger Data (TimescaleDB)
- Gemini API (Gemini Flash, Gemini TTS)
- Meta Model API (Muse Spark, Muse Image)
- WebAudio API
- throwhands.tech (.Tech domain)

## Prize tracks

**Most Entertaining (Jester's Court).** The track wants "projects that capture that same excitement and keep people coming back for more." You physically throw punches, and the game answers with screen shake, a slow-motion uppercut launch, and a KO. There is no account to create, a rematch is one button away, and Brawl puts up to 8 fighters in one ring. <!-- VERIFY -->

**Meta: "Bringing People Closer Together with AI".** Throw Hands exists so friends can fight each other, side by side on one camera or remotely on two devices. <!-- VERIFY --> After the match, a Muse Image rivalry card goes to the friend you just beat, and the rematch is right there. <!-- VERIFY --> AI is essential: the pose-tracking model is the controller, so without it there is no game. Fighter Forge uses Muse Spark and Muse Image to turn one sentence into your own fighter, and Gemini calls the fight live. <!-- VERIFY -->

**Best Use of Gemini API (MLH).** Every 3 to 4 seconds, batched match events (hits, blocks, combos, health) go to Gemini Flash, which returns one hype line that Gemini TTS speaks aloud, with a browser speech fallback and a mute toggle. <!-- VERIFY -->

**Best Use of Tiger Data (MLH).** Hits, blocks, and supers go into a `match_events` hypertable and opt-in landmark frames into `pose_samples`. Continuous aggregates power the Elo leaderboard and the motion-data counts. <!-- VERIFY -->

**Best Use of Vultr (MLH).** A Vultr VM in Dallas serves the game over HTTPS through Caddy. It also runs the WebSocket relay and the simulation for online rooms and proxies the AI and database calls. <!-- VERIFY -->

**Best .Tech Domain Name (MLH).** "Throw hands" is slang for fighting, which is the whole game: https://throwhands.tech.
