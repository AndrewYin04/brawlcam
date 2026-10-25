---
title: "Throw Hands: a webcam fighting game where your body is the controller (built in 24 hours)"
published: false
tags: gamedev, webdev, javascript, ai
---

At HackTX 2026 we built **Throw Hands**, a browser fighting game where your webcam tracks your pose, a 3D fighter in a UFC-style octagon copies your arms, torso, and head and walks where you step, and your real punches, guards, and gestures fight a bot, a friend on the same camera, or friends anywhere online. It is live at https://throwhands.tech. This post is about the parts that were harder than they looked.

## The stack

- **Pose:** MediaPipe Pose Landmarker (lite) in a Web Worker.
- **Avatar:** three.js + `@pixiv/three-vrm`, driven by our own landmark-to-bone solver.
- **Game:** one deterministic TypeScript simulation that runs in the browser for local modes and on a Node server for online rooms.
- **Server:** Node + `ws` on a Vultr VM behind Caddy; it also proxies Gemini, Meta's Muse models, and Tiger Data (TimescaleDB).
- **Built with Claude Code**, which wrote most of the code with us and, just as important, the test harness.

## 1. A punch at the camera is almost invisible

Our first jab detector watched arm extension: distance from shoulder to wrist. It missed punches. The reason: a jab thrown straight at a single webcam barely changes the measured 3D arm length, because monocular depth is compressed. On a labeled clip, the arm went from 0.24 m to 0.34 m during a full jab.

What the camera *does* measure well is angles. The elbow snaps open from about 75° to 120° in a tenth of a second, whatever the depth. Switching to **elbow-angle peaks** took recall on our labeled jab clip from 4/5 to 6/6.

## 2. Test at the frame rate players actually get

Our second detector used velocity over a 100 ms window. It looked fine at 30 fps on a laptop. At 15 fps (a phone, or a busy machine) its recall fell to 20%: one frame per window is not a velocity.

We rewrote strikes as **peak detection**: a strike is a local maximum of elbow angle, wrist height (uppercut), or sideways sweep (hook) that rose enough within 350 ms. That costs one frame of latency and works the same at 10, 15, and 30 fps. Our evaluation tool replays recorded landmarks at any frame rate, so we score every change at 30 and 15 fps.

## 3. Blocks, and an X the camera cannot see

A block looked like a guard until we measured both on video: in a block the wrists sit about 0.1 m higher and 0.15 to 0.2 m further forward, close together. The "cross your arms in an X" Iron Wall was stranger: pose tracking cannot separate tightly crossed wrists, so the X never showed up as crossed. We recognize it as what the model *does* report: wrists touching above the face, elbows raised and spread. Raising both arms into a block also used to fire two jabs, so two-handed motions that end at face height now count as defense, and at chest height as an energy-blast palm push.

## 4. One simulation for N players

We designed for N fighters from the start: every message carries a slot ID, hit resolution looks up targets by ID, and bots are server-side players that send the same inputs as humans. A 1v1 duel, an 8-fighter Brawl with Smash-style knockback, and winner-stays-on are all configurations of one room. Online, the server decides every hit using the defender's latest block state and broadcasts state 20 times a second; your own fighter's arms move locally with zero delay.

## 5. Real people as the webcam, in CI

We could not stand in front of a camera all night, so the tests use **downloaded video of real people as the webcam**. Chromium's `--use-file-for-fake-video-capture` plays an MJPEG clip as a camera; for WebKit we inject a `getUserMedia` that paints a clip into a canvas stream (which also lets a test make a player "leave the frame" by masking half the image).

The best test: two browsers, driven by two pro fighters' shadowboxing footage, create and join a room through the real UI and play a full best-of-3. Each client logs every snapshot it receives; the test compares them tick by tick. Result: 2,160 shared ticks, 0 mismatches in HP, round, or timer, and 95% of ticks reaching both clients within 29 ms.

The tests also found real bugs: Brawl players walking themselves out of the ring from noisy movement, a chosen skin color ignored in game (two different localStorage key names after a rename), late joiners stuck in the lobby, and Safari never starting pose tracking. That last one had three causes: the camera `<video>` lived inside a `display:none` HUD and WebKit will not load a stream into it; MediaPipe needs WebGL inside the worker, which WebKit lacks (we fall back to the main thread); and the main thread needs MediaPipe's classic wasm loader, not the ES-module one.

## 6. AI where it matters

- **Fighter Forge:** type "volcano samurai frog" and Meta's Muse Spark writes a name, backstory, and moves (about 2 s, JSON output) while Muse Image paints a card (about 10 s with `reasoning_strength: low`). Your suit takes the card's dominant color.
- **Commentator:** every 3 to 4 seconds, a batch of match events goes to Gemini (flash-lite answers in about 0.6 s) and Gemini TTS speaks the line.
- **Rivalry card:** after an online match, the server generates one card per match and sends it to everyone in the room.

All keys stay on the server, every AI call has a fallback, and automated tests use recorded responses.

## 7. Tune on a real player, not just clips

Downloaded shadowboxing clips got gestures working, but the first real laptop session broke movement: leaning back moved the fighter *forward*. We added a guided drill mode: one prompt at a time (stand still, throw a big hook, step back...), the prompt as the label, and opt-in recording of the body points plus the player's own webcam video. Three sessions later:

- **Replay first.** The recorded frames, with their exact capture times, replay through the same recognizer. The replay matched the live game's recorded output number for number, so every fix could be reproduced before it was written. (One trap: our server clamped frame times to its own clock, and a laptop clock running ahead collapsed nine frames onto one millisecond. Store capture time separately.)
- **Laptops hide the hips.** The torso-lean signal measured shoulders against hip depth, but at a laptop the hips are out of frame and their depth is a guess. Forward/back now reads apparent body size (rotation-corrected shoulder width) against "your spot": the median size over the last 10 s the player stood settled. Stepping back went from never registering to 3 of 3.
- **Big punches are not small punches.** Real big hooks open the elbow to 160° and sweep the wrist about 1 m; a 150° elbow cap called them jabs. Classifying big swings by the whole motion (sweep, rise, torso turn) took hooks from 0/4 to 3/4 and uppercuts from 0/3 to 3/3, with no change on the labeled clips.
- **The video is the ground truth.** Some misses were reps where no punch was thrown. Contact sheets from the player's webcam settled each one.
- **Grappling came last, and stays labeled beta.** Grab (reach with both arms and pull in), clinch knees and the Shoulder Throw were tuned on the same player's recorded grab drills: 4/4 grabs detected in one session and 3/4 in the next (the miss read as a strike). There were 0 false grabs across 37 real clips. With grappling on, strike replays only lost misreads, never gained one. It ships on by default; `?grapple=0` turns it off.

## What's next

More fighters and arenas, ranked seasons, and an opt-in program where players share anonymized, game-labeled motion sequences (coordinates only, never video) with humanoid-robotics labs. That same data could eventually train a gesture model to replace our rules.

Play it at https://throwhands.tech, and bring a friend.
