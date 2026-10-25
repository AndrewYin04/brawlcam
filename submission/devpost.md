# Throw Hands

**Your body is the controller. Throw real punches at your friends from anywhere.**

Play it: https://throwhands.tech (backup: https://144-202-71-213.sslip.io)

## Inspiration

Our best game nights were the loud ones: friends, trash talk, and endless rematches. Motion games capture that, but need a console, an accessory, and everyone in one room.

We wanted that energy from what everyone already owns: a browser and a webcam. No download, no account, no controller. Open a link, stand up, fight.

Webcam boxing exists: kinemo won PennApps 2025 with a MediaPipe boxing console. We went further, with 3D fighters in a UFC-style octagon, gesture-triggered super moves, online play across devices, AI-generated fighters, and a business model.

## What it does

Allow the camera and, after a 3-second guard calibration, a fighter in the octagon copies your arms, torso, and head. A short tutorial teaches movement, then you fight:

- **Move with your body**: step or lean toward the camera to advance, back to retreat, sideways to circle. Your fighter really walks, turning its hips while it keeps facing the opponent.
- **Jabs, hooks, uppercuts**: faster punches do more damage, and the fist visibly lands on the target.
- **Guard** with both forearms in front of your face. The guard drains while you hold it and with every blocked hit; when it breaks you are dizzy for 2 seconds. **Kick** when your legs are in frame.
- **Supers** when your meter fills: a super uppercut that slams your opponent into the cage in slow motion, **Iron Wall** (cross your forearms above your face: 2.5 s of unbreakable guard that counters the first attacker), or a two-palm energy blast.

Matches are best of 3 with HP KOs and a rematch button. Big moments get an instant announcer call ("GUARD BROKEN!", "INTO THE CAGE!", "K.O.!") over a synthesized crowd. Modes:

- **Practice** against a CPU fighter.
- **Online 1v1** with a friend on another laptop or phone, by room code or link.
- **Brawl**: a free-for-all for up to 8 in a larger octagon, with bots filling empty slots and 3-second respawns.
- **Winner stays on**: two fight, the rest of the room watches and queues.
- **Local 2-player**: two people side by side in front of one camera.

AI is the core of it. A pose model in your browser *is* the controller. **Fighter Forge** turns a prompt like "lava golem with a crown" into a name, backstory, and move names (Muse Spark) and a fighter card (Muse Image). After an online match, a **rivalry card** sums up the fight for you to send your opponent. A **Gemini commentator** writes live lines about the fight.

Online wins feed an Elo leaderboard. A store page shows skins and a season pass with mock purchases. An opt-in motion-data program and a research mode collect body-point coordinates (never video) with explicit consent.

## How we built it

**Pose.** MediaPipe Pose Landmarker (lite) runs in a Web Worker so detection never blocks rendering, on the GPU delegate with CPU fallback, and falls back to the main thread on browsers without WebGL in workers (older Safari). Camera frames are read straight from the camera track where supported, so pose rate does not depend on render rate. A One Euro filter smooths landmarks.

**Fighters.** Human-proportioned characters and animations from Quaternius (CC0), toon-shaded with ink outlines. Legs come from a locomotion state machine driven by the fighter's real ground speed (no sliding in place); your live pose is layered on the chest, head, and arms. Strikes play authored clips, and a two-bone IK pulls the fist onto the target on the contact frame (measured on every hit frame: most scenes average under 10 cm from the target), with the hit spark, flinch, and knockback timed to that frame.

**Arena.** A procedural UFC-style octagon: canvas mat, chain-link cage, lit posts, a crowd, and arena lights. The camera stays inside the cage, and any cage part between the camera and a fighter fades out.

**Gestures.** Rule-based TypeScript, no classifier: velocities, joint angles, and peak detection, with per-hand cooldowns and a calibration step. Movement combines stepping (hip position and rotation-corrected shoulder width in the image) with leaning (shoulders versus hips), and is gated from the start of every strike so a big punch never moves you. It also runs in Node for tuning on labeled clips.

**Simulation.** One deterministic simulation handles health, the guard meter, supers, projectiles, cage collisions, rounds, and KOs. It runs in the browser for local modes and on the server for online rooms, and it was designed for N fighters: every message carries a slot ID, and bots send the same inputs as humans.

**Server.** A Node `ws` relay on a Vultr VM in Dallas, behind Caddy with automatic HTTPS. Online hits are resolved server-side from the defender's latest block state, and the server proxies Gemini, Meta, and Tiger Data so no keys reach the browser. Stats live in Tiger Data hypertables.

**Testing.** Every user path runs end to end against the live server with Playwright, using downloaded video of real people (including pro fighters' shadowboxing) as the webcam. Visual changes go through a review loop: scripted scenes are rendered frame by frame from the real game, measured (foot slide, fist-to-target distance, cage occlusion, opponent visibility), and scored by fresh-context AI reviewers until no high-severity findings remain. Two browsers driven by two fighters' footage play a full online best-of-3, and the test checks that both screens show identical HP, round, and timer on every shared tick (2,160 ticks, 0 mismatches). Eight browsers run winner-stays-on and Brawl rooms. The tests found and we fixed real bugs, from a big punch moving the player backward (61 cm before the fix, 4 cm after) to Safari never starting pose tracking.

## Challenges we ran into

**Punches at the camera are nearly invisible.** One webcam sees depth poorly, so a jab straight at the lens barely changes measured arm extension. Switching to elbow-angle peaks (the elbow snaps open whatever the depth) raised recall on a labeled jab clip from 80% to 100%, and at 15 fps from 20% to 100%. Detection now holds from 10 to 30 fps.

**Making fists actually land.** Our first characters were chibi, with short arms, so punches stopped short. We switched to human-proportioned fighters, then measured the gap between the fist and the target on every hit frame. The worst misses came from an unexpected place: knocked-back fighters tumbled around their feet, which swung the head a metre away from where the next punch aimed. Pivoting the tumble at the hips fixed it.

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
3. **Motion-data licensing.** Humanoid-robotics labs need human motion data. Players can opt in to share anonymized pose sequences of strikes, blocks, and dodges, labeled by the game, plus continuous body-point coordinates during play (15 times a second, up to 10 minutes per match). Only landmark coordinates are shared, never video, and never a player identifier. Off by default. The streams go into a compressed Tiger Data hypertable.

## Built with

- **Claude Code** (AI coding assistant, used to write and test much of the code)
- three.js 0.186.1
- Quaternius Universal Base Characters and Universal Animation Library (CC0)
- @pixiv/three-vrm 3.5.5 (`?classic` renderer only; Seed-san VRM model by VirtualCast, VRM Public License)
- @mediapipe/tasks-vision 1.1.1 (Pose Landmarker lite)
- Vite
- TypeScript
- Node.js with `ws`
- `pg` (node-postgres)
- Playwright
- Caddy
- Vultr
- Tiger Data (TimescaleDB)
- Gemini API (`gemini-3.5-flash-lite` commentary, `gemini-3.8-flash-tts` speech)
- Meta Model API (`muse-spark-1.3` with `muse-spark-1.2` fallback, `muse-image-1.0`)
- WebAudio API (all sound effects synthesized in code)
- undici (IPv4-pinned HTTP client)
- esbuild
- ElevenLabs (`eleven_v3`: the in-game announcer's pre-rendered calls and the demo video voiceover)
- ffmpeg (demo video assembly)
- throwhands.tech (.Tech domain)

## Prize tracks

**Most Entertaining (Jester's Court).** The track wants "projects that capture that same excitement and keep people coming back for more." You physically throw punches, and the game answers with hit-stop, an announcer call, a roaring crowd, a slow-motion uppercut that slams your opponent into the cage, and a KO. There is no account to create, a rematch is one button away, and Brawl puts up to 8 fighters in one ring.

**Meta: "Bringing People Closer Together with AI".** Throw Hands exists so friends can fight each other, side by side on one camera or remotely on two devices. After the match, a Muse Image rivalry card goes to the friend you just beat, and the rematch is right there. AI is essential: the pose-tracking model is the controller, so without it there is no game. Fighter Forge uses Muse Spark and Muse Image to turn one sentence into your own fighter, and Gemini writes live commentary.

**Best Use of Gemini API (MLH).** Every few seconds, batched match events (hits, guard breaks, supers, cage slams, KOs, health) go to Gemini (`gemini-3.5-flash-lite`), which returns one hype line about the fight. Lines are voiced by Gemini TTS (`gemini-3.8-flash-tts`) with a director-style prompt per moment ("shouting, voice cracking" for a KO, "rising disbelief" for a guard break) when the spoken-line budget allows; otherwise they show as captions, so instant pre-rendered announcer calls cover the biggest moments without talking over each other. In online rooms the server generates one shared line for everyone, so spectators hear the same call and the free tier lasts.

**Best Use of Tiger Data (MLH).** Hits, blocks, and supers go into a `match_events` hypertable; continuous aggregates power the Elo leaderboard. Opt-in pose streams go into a `pose_streams` hypertable with one smallint column per coordinate so TimescaleDB's columnar compression works: we measured 19.7 MB to 5.9 MB per player-hour (3.4x; storing arrays only reached 1.7x), with a daily continuous aggregate of minutes per mode and a storage guard at 600 MB. Research-mode landmark streams go to a compressed `research_frames` hypertable.

**Best Use of Vultr (MLH).** A Vultr VM in Dallas serves the game over HTTPS through Caddy. It also runs the WebSocket relay and the simulation for online rooms and proxies the AI and database calls.

**Best .Tech Domain Name (MLH).** "Throw hands" is slang for fighting, which is the whole game: https://throwhands.tech.
