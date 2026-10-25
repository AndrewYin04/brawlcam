# Devpost draft (soft submission, 2026-10-25 12:15 AM CDT)

## Title
Throw Hands

## Tagline
Your body is the controller: throw real punches at your friends in a 3D webcam fighting game.

## Inspiration
Fighting games are most fun with friends in the same room, but controllers turn the fight into thumb movements. We wanted the punch to be a real punch: you stand up, throw hands, and your superhero throws them too, whether your friend is next to you or across the country.

## What it does
Throw Hands is a browser fighting game controlled by your body. Your webcam tracks your pose, and a 3D fighter copies your arms, torso, and head.

- **Moves:** real punches become punches, with damage scaled by fist speed. Raised forearms block. Gestures fire super moves: a fist driven upward is a slow-motion super uppercut, arms crossed in an X raise a shield, and palms pushed forward fire an energy blast.
- **Modes:**
  - practice against a CPU fighter
  - two players side by side on one camera
  - online 1v1 with a room link
  - **Brawl:** a free-for-all arena for up to 8 fighters, with bots filling empty slots
- **AI features:** an AI commentator calls the fight live, and Fighter Forge turns a text prompt into a custom fighter with a name, backstory, and card art.
- **Business:** cosmetic skins and auras, a season pass, ranked Elo matchmaking, and opt-in, anonymized motion data (pose coordinates only, never video) for humanoid-robotics labs.

## How we built it
- **Pose tracking:** MediaPipe Pose Landmarker, run in the browser in a Web Worker.
- **Fighters and arena:** three.js with VRM avatars. Pose landmarks are mapped onto the avatar's bones.
- **Gestures:** rule-based detectors on landmark velocities, with a per-player calibration step.
- **Multiplayer:** a WebSocket relay on a Vultr server. Rooms are designed for any number of players.
- **AI:**
  - the Gemini API generates and voices the live commentary
  - Meta's Muse Spark and Muse Image power Fighter Forge and the shareable rivalry cards
- **Data:** Tiger Data (TimescaleDB) stores match events and opt-in motion data, with continuous aggregates powering the leaderboard.
- **Domain:** served at throwhands.tech.

## Challenges
- Making a punch feel fair when it is detected from a webcam.
- Moving through a 3D ring without a controller.
- Keeping pose tracking fast on phones.
- Testing everything automatically on a headless server by feeding recorded fight footage into a fake camera.

## Accomplishments
(To be filled in at the end of the hackathon.)

## What we learned
(To be filled in at the end of the hackathon.)

## What's next
- 4-player free-for-all tournaments.
- A ranked season.
- A creator marketplace for skins.
- Licensing labeled motion data to robotics teams.

## Built with
mediapipe, three.js, vrm, typescript, vite, node.js, websockets, caddy, vultr, gemini-api, meta-muse, tiger-data, timescaledb, postgresql, playwright, claude-code

AI tools disclosure: built with Claude Code (Anthropic) as the coding agent.

## Links
- Code: https://github.com/AndrewYin04/throwhands
- Live: https://throwhands.tech (not live yet at soft submission)

## Tracks (non-MLH, max 3)
- Most Entertaining (Jester's Court)
- Meta: Bringing People Closer Together with AI

## MLH tracks
- Best Use of Gemini API
- Best Use of Tiger Data
- Best Use of Vultr
- Best .Tech Domain Name
