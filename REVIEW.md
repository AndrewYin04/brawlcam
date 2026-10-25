# Review (written by the planner)

Real-webcam and real-phone check results, and change requests in priority order. Read before starting each milestone.

## 2026-10-25 12:55 AM CDT

### Done by the planner
- **DNS:** A records `throwhands.tech` and `www.throwhands.tech` point to `144.202.71.213`. Verified at 12:55 AM: Google (8.8.8.8) and Cloudflare (1.1.1.1) both answer 144.202.71.213 for both names.
- **PR #1:** scanned the full history (all 26 commits) for the four key values in the env file, the Tiger password, generic key patterns, the user's home IP, and `.env` files: none found. Merging needs the user's approval; the planner asked for it.
- **Devpost:** project "Throw Hands" created as a draft (overview, description, built-with tags, repo link, tracks, additional info). It still needs the YouTube link before it can be submitted.

### Open requests, in priority order
1. **HTTPS on throwhands.tech.** At 12:55 AM, `curl https://throwhands.tech/` fails with a TLS error (curl exit 35), for both names. DNS now resolves correctly, so make Caddy obtain certificates for `throwhands.tech` and `www.throwhands.tech` (redeploy, or reload Caddy and watch its log for the ACME result). Post the result in `STATUS.md`. Keep https://144-202-71-213.sslip.io working as the fallback.
2. **GitHub access.** Until the user approves the collaborator invite, keep pushing to the fork and update the PR; the planner merges from there.
3. **Real webcam and phone checks** start once the user is at the laptop. Results will be posted here.

## 2026-10-25 about 12:55 AM CDT: video review and graphics/motion requests (top priority until the 7:30 AM freeze)

PR #1 is merged into main (`4252871`). Keep pushing to the fork until the collaborator invite is approved; the planner will merge.

The planner watched demo-video-v1 frame by frame (21 frames across all 2:27). What works: the four-part Meta structure, the captions, the Fighter Forge card at 1:24, the Brawl knockout feed at 1:12, and the end card. **The user's verdict: the game needs better graphics and motion.** Specific problems, with timestamps:

### Motion (highest priority: judges see it in the first 20 seconds)
1. **Bodies are rigid.** At 0:01 to 0:03 and 1:48 the fighters stand straight-legged and upright while only the arms move. There is no fighting stance, no bent knees, no hip or shoulder rotation into a punch, and no weight shift. Add a procedural full-body layer on top of the pose retargeting:
   - a boxing stance with bent knees and staggered feet
   - torso and hip twist toward the punching side, plus a forward lean on jabs
   - full arm extension at the punch's peak
   - an idle guard bounce when the player is still
   - feet planted, using foot IK or a fixed stance, rather than sliding
2. **Hit reactions are rigid planks.** At 0:03 and 0:36 the knocked-back fighter rotates as one stiff capsule. Add flinch and stagger poses, a head snap on a landed punch, and for knockback a tumbling arc with limbs trailing (springy secondary motion) and a landing.
3. **Smooth the pose signal before retargeting** (a One Euro filter or similar), so arms don't jitter, while keeping punch latency under 100 ms.

### Graphics
4. **The translucent capsules around every fighter look like debug hitboxes.** They appear in almost every gameplay shot (0:01, 0:06, 0:48). Show them only during Block, Shield and Super, and render them as a rim glow or outline instead of a solid tinted capsule.
5. **Placeholder particles.** Flat floating circles and hexagons fill the frame (0:03, 0:36). The flat pink rectangle for the uppercut washes out the left third of the screen (0:03), and a flat pink sphere covers the foreground at 1:48. Replace them with:
   - hit sparks and a shockwave ring at the contact point
   - a 2 to 3 frame white impact flash
   - screen shake scaled to damage
   - bloom: three.js `EffectComposer` with `UnrealBloomPass` (check the current API for the installed three.js version)
   - a speed-line or motion-trail effect for the super uppercut instead of the rectangle
6. **The fighters float in a black void.** Add contact or blob shadows under each fighter, a key light plus rim light, light fog, and an arena: a lit ring floor with texture or reflection, and stadium lights or crowd silhouettes in the background.
7. **The camera is too far away.** Fighters fill about a quarter of the frame height (0:06, 0:24). Frame both fighters tighter, follow them as they move, and punch-zoom or shake on heavy hits. In the online split-screen at 0:24 the fighters are tiny and half of each pane is black; frame them closer.
8. **Every fighter is the same anime model recolored**, including all 8 in Brawl at 1:12. They read as cosplay rather than superhuman fighters.
   - Give fighters distinct silhouettes: at least 3 or 4 different openly licensed character models (check each license and list it in the README).
   - Add per-fighter scale, armor or props, and an aura matching the Forge colors.
   - Footwear, if the models allow it.

### Video fixes (for demo-video-v2, due 10:15 AM)
9. **The hook claims something the frame doesn't show.** The caption at 0:01 says "This is a real punch, thrown by a real body", but no real person is on screen. The planner will try to get footage of the user playing on a real webcam. If it arrives, show it picture-in-picture beside the fighter in the hook and the walkthrough. If it doesn't, rewrite the hook caption so it doesn't claim a real person is visible.
10. **Repeated clip:** 0:36 shows the same frame as 0:03. Use different footage.
11. **Leaderboard bug at 1:36:** "Demo Leo" and "Demo Priya" each appear twice with different records (1016 and 984 Elo). Reproduce it, find out why one name has two rows, and fix it before re-recording. Also use believable seed data rather than names starting with "Demo".
12. Re-render after items 1 to 8 so the video shows the improved graphics. Keep the 2 to 3 minute length and Meta's four-part structure.

Test the motion changes with the same clip-driven suite, and add screenshot or frame-strip evidence of the before and after look to `STATUS.md`.

## 2026-10-25 about 1:00 AM CDT: HTTPS diagnosis, and a Smash-style look and real locomotion (overrides items 1 to 8 above where they conflict)

### A. throwhands.tech HTTPS is still down (blocks the live demo URL)
Verified by the planner at about 1:00 AM:
- **DNS:** correct everywhere. Google, Cloudflare, and the laptop's own resolver all answer 144.202.71.213 for `throwhands.tech` and `www.throwhands.tech`.
- **Port 80:** Caddy answers `http://throwhands.tech` with `308` to https, so it knows the name.
- **Port 443:** the TLS handshake fails for both names (curl: "failed to receive handshake"; Chrome: ERR_CONNECTION_CLOSED). `https://144-202-71-213.sslip.io` works.

Caddy has no certificate for the domain yet. Check Caddy's logs for the ACME error: a Let's Encrypt rate limit from the earlier failed attempts, or a ZeroSSL account problem. Get the certificate, re-test with `curl -v https://throwhands.tech`, and post the result in STATUS.md. If Let's Encrypt is rate-limited, check its reported retry time and use another CA Caddy supports in the meantime.

### B. The user's direction: "the graphics should be more like Super Smash Bros"
In the user's words: "the movements are super awkward. the people are drifting around rather than walking/running. the people torsos and head and everything should be more human. it looks like they can only move their arms and do a kick motion and can't walk."

**1. Real locomotion: the biggest problem.**
- **Lower body and root motion** come from a locomotion state machine driven by the fighter's actual ground velocity: fighting-stance idle with a bounce, walk, run, step back, and turn. Crossfade between them by speed, and scale playback rate to ground speed so feet never slide. Fighters must never translate without their legs animating.
- **Upper body** comes from the player's pose, layered additively on top of the clip: spine twist, chest, neck and head turn, shoulders, and arms. The torso and head then move like the player instead of staying rigid.
- **Attacks** (jab, hook, uppercut, kick, block, shield, energy blast): when the gesture fires, blend in an authored attack clip, or exaggerate the pose with anticipation, follow-through, and hip rotation, so each hit shows a wind-up, a full extension, and a recoil.
- **Reactions:** hit flinch, knockback tumble, a landing and get-up, and a KO.

**2. Characters:** stylized, chunky, readable heroes instead of the recolored anime VRM.
- Use rigged models that ship with walk, run, idle, punch, and hit clips.
- Candidates to verify (check each license yourself and list it in the README):
  - Quaternius "Animated Human" (listed as CC0 on OpenGameArt: idle, walk, run, punch, jump, death)
  - KayKit Character Animations (listed as CC0, glTF added in v1.2)
- Give each fighter a distinct silhouette, color, and accessory. Keep the Forge colors tinting the suit and aura.
- Toon shading (`MeshToonMaterial`) plus an outline pass for the Smash look.

**3. Smash-style presentation:**
- **Side-on 2.5D camera** that pans and zooms to keep all fighters in frame, the way Smash does. Constrain movement to a left/right lane. Lean-to-move maps to this directly, and in Brawl, target the nearest opponent left or right.
- **A floating stage** with a stylized sky or city background, edges you can be knocked off, and blast zones beyond them.
- **HUD:** damage percent per fighter along the bottom with a portrait and stock icons, Smash-style, alongside or instead of health bars. Keep KO rules consistent with the spec, or update the spec note.
- **KO effects:** a blast-zone flash and streak, hit sparks, impact freeze frames (hit-stop of about 3 to 6 frames on heavy hits), screen shake, and bloom.

**4. Safety:**
- Keep the current renderer reachable behind a URL flag (for example `?classic`) until the new one passes the full suite, so the 7:30 AM freeze always has a working build.
- Report progress in STATUS.md with before and after screenshots.
- If B cannot be finished by about 6:30 AM, ship the locomotion and character parts first (B1 and B2): they fix the "drifting and only arms move" problem the user named.

### C. Video v2
Re-record after B. Show walking, running, punches with body rotation, and a Smash-style KO in the hook. Keep the 2 to 3 minute length and Meta's four-part structure.

## 2026-10-25 about 1:05 AM CDT: review your own work, plus adversarial reviewers
The user wants every graphics, motion, and video change self-reviewed and checked by independent adversarial reviewer agents as you iterate. This is now **spec section 11** (`git pull` and read it). In short:
- capture frame strips at 10 fps, short clips, and foot-slide/drift measurements before and after each change
- self-review against the 10-item checklist
- run at least two fresh-context reviewer subagents that see only the evidence, the checklist, and the user's complaints, not your notes
- fix all high-severity findings and repeat until a round has none
- log each round in `REVIEW-SELF.md`

The planner's earlier findings (the 12:55 AM and 1:00 AM sections above) are the starting checklist. Run the first round on the current build before you change anything, so the before scores exist.

## 2026-10-25 1:08 AM CDT: HTTPS check
- `https://throwhands.tech/` returns 200 and `/api/health` returns 200. Thanks.
- `https://www.throwhands.tech/` still fails the TLS handshake (curl exit 35), though DNS for `www` points to 144.202.71.213. Add `www.throwhands.tech` to Caddy, ideally as a permanent redirect to `https://throwhands.tech{uri}`, obtain its certificate, and confirm with `curl -sI https://www.throwhands.tech/`.

## 2026-10-25 1:12 AM CDT: DECISION, the hybrid direction (replaces section B3 of the 1:00 AM notes)
The user chose a **hybrid**: keep the current 3D ring camera and free movement, and take Smash's characters, effects, and feel. **Do not build the side-on camera, the left/right lane, or the stock HUD.** Reason: the player faces the webcam and punches forward. In the behind-the-fighter view the fighter punches forward into the screen too, so the mirror feels natural; a side-on camera turns a forward punch into a sideways one. It also matches the user's original idea, "UFC ring but super smash bro-like characters and abilities", and avoids rewriting movement, Brawl targeting, and the tests before the freeze.

What to build, in priority order:
1. **Real locomotion and a human body** (section B1 of the 1:00 AM notes, unchanged):
   - walk, run, idle stance, and step back driven by ground speed, with no sliding or drifting
   - the player's pose layered on spine, chest, neck, head, shoulders, and arms
   - attack wind-up, full extension, and recoil
   - flinch, stagger, tumble, and get-up reactions
2. **Smash-style characters** (section B2, unchanged): chunky stylized heroes with distinct silhouettes, toon shading (`MeshToonMaterial`), an outline pass, and bright saturated colors. Keep Forge colors tinting the suit and aura. Verify each model's license.
3. **Camera: keep the over-the-shoulder 3D view, closer.**
   - In 1v1, both fighters fill most of the frame height; follow the action, and zoom slightly or shake on heavy hits.
   - In Brawl, center on the player's fighter and widen just enough to keep nearby fighters in view.
4. **Arena with a Smash feel:** the ring as a floating platform with a lit, textured floor, edge glow, and a stylized sky or city background far below and around it. Add shadows, a key light, a rim light, and light fog. Brawl keeps its knockback percent and ring-outs off the platform edge.
5. **Effects:**
   - hit-stop of 3 to 6 frames on heavy hits, hit sparks and a shockwave ring, a white impact flash, screen shake, and bloom
   - a KO flash and streak when a fighter leaves the platform
   - block, shield, and super shown only while active, as a glow or outline
6. **Rules and HUD:** keep the current 1v1 rules (HP bars, best of 3) and Brawl rules (knockback %, ring-outs, KOs). Restyle the HUD in a bold Smash-like way: character portrait, big numbers, and a damage percent in Brawl. Don't change what it tracks.
7. Keep `?classic` working until the new look passes the full suite and the section 11 review loop.

## 2026-10-25 1:15 AM CDT: the user likes the floating stage with knock-off edges; make it central in every mode
This refines items 4 and 6 of the 1:12 AM decision. The camera stays 3D, behind the player's fighter.
- **One stage for every mode** (practice, local 2-player, online 1v1, Brawl): a floating platform high in the sky, with clouds and a stylized city far below, no ropes, and a glowing edge. The edge reads as dangerous: a warning glow when a fighter is within about 1 m of it, and a camera nudge toward the drop.
- **Ring-outs in 1v1 too:**
  - Keep HP bars and best of 3, but add knockback that grows with damage taken, the way Smash's percent does: heavy hits (super uppercut, energy blast, the third hit of a combo) push the target back farther the more damage they have taken.
  - A fighter knocked past the edge falls, with a KO flash, a streak, and the camera tracking the fall for about 0.5 s. That loses them the round immediately, the same as reaching 0 HP.
  - The HUD shows HP plus a small knockback percent under each bar.
- **Brawl:** unchanged rules (knockback %, ring-outs, KO count). It just uses the new sky stage.
- **Recovery:** a fighter pushed to the edge without falling teeters with flailing arms (an animation), so near-misses read clearly.
- **Tests:** add 1v1 ring-out paths to `tests/e2e` and `TESTING.md`:
  - a ring-out ends the round for both clients
  - a fighter at the edge survives a light hit
  - knockback distance grows with damage taken (assert the numbers)

  Re-run the full suite and the section 11 review loop.
- **Video v2:** show a ring-out off the floating stage. It is the strongest Smash-like moment.

## 2026-10-25 1:35 AM CDT: the user's real-webcam test of build 4e7b98e (overrides the 1:15 AM floating-stage section)

**First, update STATUS.md.** It still says 12:05 AM. The user and planner want your updates before sending more direction. Post:
- what changed since 12:05 AM
- round 2 review-loop scores
- what you are working on now
- the exact movement controls and their thresholds

Then work on the items below, and update STATUS.md after each one.

The user played with a real webcam. Pose tracking "kinda works". Problems, in the user's words and with the planner's spec:

### 1. "idk how to move forward and backward"
- Find out why with real-webcam-like input. Check the current step-toward/away threshold (shoulder width) and whether the duel assist hides the effect.
- **Teach movement in the game.** Calibration gets a 15-second movement tutorial with a live on-screen arrow and fill bar for each direction: "step toward the camera to advance", "step back to retreat", "lean to strafe". It advances when each direction has been detected once. During matches, a small HUD indicator shows the movement input currently detected (arrows light up).
- **Make forward/back easier to trigger:** also accept a torso lean toward or away from the camera, measured against the calibrated shoulder width and nose position, with a dead zone so punches don't trigger movement. Keep stepping working.
- Test it with clips of people stepping and leaning (add some if needed). Report the detection rate in STATUS.md.
- Explain movement in one bigger line on the menu, not small print.

### 2. Arena: "too small", and KO by falling off "is not a good idea". Use a UFC octagon with a cage
- **Replace the floating sky stage and all ring-outs** (1v1 and Brawl) with a **UFC-style octagon**:
  - eight-sided canvas mat with a center logo
  - chain-link cage walls about 1.8 m high (30 cm above the fighters' heads), padded posts at the corners
  - arena lighting from above, a dark arena with crowd silhouettes and stadium lights beyond the cage
- **Size:** UFC's large octagon is about 30 ft (9.1 m) across. Use about 9 m for Brawl and about 7 to 9 m for 1v1, scaled to human-sized fighters about 1.8 m tall. Keep the camera close enough that fighters stay large (spec 11.2 item 8).
- **Knockback:** no falling off. Fighters slam into the cage wall and bounce off it, with a cage-shake effect and a heavier hit spark. Knockback distance still grows with damage taken.
- **KO rules:**
  - 1v1: back to HP-only KOs (HP bars, best of 3)
  - Brawl: each fighter has an HP bar; reaching 0 is a KO with a 3 s respawn; most KOs in 2 minutes wins
  - remove the knockback-% ring-out rules everywhere
- Remove the teeter animation and the edge warning. Update the tests: drop the ring-out tests, and add cage-bounce and Brawl-HP tests. Update TESTING.md.

### 3. "these new characters dont actually hit each other... shaped more like a human, with longer limbs, human proportion limbs"
- **Proportions:** the KayKit Adventurers are chibi, with a big head and short arms, so punches end short of the opponent. Switch to human-proportioned, rigged, openly licensed characters (verify each license and credit it in the README and the site footer):
  - head about 1/7 to 1/8 of body height
  - arm reach about equal to height
  - athletic builds, like Smash's human fighters (Ryu, Captain Falcon), not chibi
- Keep toon shading, outlines, bright colors, and distinct silhouettes. Keep the locomotion state machine and pose layering from 4e7b98e, retargeted to the new skeleton.
- **Visible contact:** when a strike registers, the attacker's fist or foot must reach the target.
  - Hold fighting range at about one arm's length.
  - Add a short lunge, or IK the fist toward the target's head or torso, so contact happens on the hit frame.
  - Put the spark at the contact point; the target's flinch starts there.
- **New review-loop measurement:** fist-to-target distance on each hit frame, with a target under 10 cm. Add it to the section 11 metrics and the checklist ("strikes visibly connect").

### 4. Credits
The site footer still credits "Seed-san model by VirtualCast, Inc." Update the footer and README to match the models actually used.

### Order
1, 3, 2, then 4. Movement and contact affect every match. Run the section 11 loop after each, keep `?classic` until the new build passes, feature freeze 7:30 AM.

## 2026-10-25 1:50 AM CDT: defense redesign (the user chose a Smash-style guard plus an "Iron Wall" super), and DNS

### DNS
At 1:45 AM, nameserver `tech-domains.venus.orderbox-dns.com` answered `127.0.0.1` for `throwhands.tech`, while `www` was correct there and all other nameservers were correct for both. The planner re-saved both A records at the registrar at 1:48 AM. Re-check all four nameservers before your next certificate attempt. If one still lags, post the time in STATUS.md and the planner will contact the registrar.

### Defense: replace unlimited Block and the 3 s X-shield
The user asked how shields break and pointed to Smash. Per SmashWiki, Smash's shield shrinks while held, shrinks faster per blocked hit (by the attack's shield damage), regenerates when released, and when it breaks the fighter is stunned (https://www.ssbwiki.com/Shield). Today Block is unlimited at 20% damage, so a player can stand with forearms up and barely take damage. New design:

1. **Guard** (gesture unchanged: both forearms up in front of the face):
   - raises a bubble around the fighter; blocked hits deal 10% damage
   - **guard meter 0 to 100:**
     - drains 20 per second while held, so it empties in 5 s
     - each blocked hit drains extra: jab 10, hook 15, kick 20, super uppercut 60, energy blast 50
     - refills at 25 per second after 0.5 s with the arms down
   - the bubble shrinks and shifts from blue to yellow to red as the meter drops; show the meter on the HUD
2. **Guard break:**
   - at 0 the bubble shatters, with a glass-break sound, shards, and a short camera shake
   - the fighter is **dizzy for 2 s** (stars over the head, wobble animation), cannot attack or guard, and takes normal damage
   - the guard starts again at 30 after the dizzy ends
3. **Iron Wall** (the X-cross gesture with a full super meter; this replaces the 3 s X-shield):
   - for 2.5 s an unbreakable guard (gold bubble, 0 damage, no meter drain)
   - the first attacker to hit it is **countered**: they take 10 damage and a short stagger
   - it costs the full super meter
   - pick one X-cross pose (in front of the chest, or above the head) and make the tutorial, menu, and detection match; today the menu and STATUS.md disagree
4. **Bots** use the guard too, and sometimes get guard-broken, so the mechanic shows up in practice and in the video.
5. **Teaching:** add guard and Iron Wall to the calibration tutorial (after movement) and the menu's controls list.
6. **Tests and review:**
   - unit tests for meter drain, refill, break, dizzy duration, and the Iron Wall counter
   - an e2e path: hold guard until it breaks, then take a hit while dizzy
   - add a "guard break" scene to the section 11 review loop
7. **Order:** after the 1:35 AM items 1 (movement) and 3 (human proportions and visible contact); before the octagon if time is short. Freeze is still 7:30 AM.

## 2026-10-25 2:00 AM CDT: add "step sideways to strafe" (the user approved), on top of acd2f05
Seen: acd2f05 added lean forward/back, the duel-assist fix, the 15 s movement tutorial, and the movement indicator. Good. One more input:

- **Problem:** strafe is measured only as shoulders-vs-hips lean (`shared/gestures.ts:446-448`). A player who steps sideways moves shoulders and hips together, so nothing happens. That is the movement people try first.
- **Add sideways stepping** alongside leaning:
  - track the hip center's horizontal position in the camera image, as a fraction of image width, against its calibrated position
  - stepping left or right of the calibrated spot strafes that way; standing still at the calibrated spot is neutral
  - dead zone and full-speed thresholds proportional to the calibrated shoulder width in the image, so they work at any camera distance; pick values from clips and report them
  - combine the two inputs, for example `strafe = clamp(stepStrafe + leanStrafe, -1, 1)`; ignore both while striking or blocking, as today
- **Staying in frame:** if the player's hip center gets within about 10% of the frame edge, show "step back to the center" and stop increasing strafe speed in that direction. Also show a faint home marker in the camera preview, so players can return to center.
- **Mirroring:** the camera preview is mirrored. Make sure a step to the player's own left moves their fighter to the left as seen on screen, for both the step and lean inputs. Check with a real webcam, and the planner will verify on the laptop.
- **Tutorial and menu:** the movement tutorial gets a "step left / step right" stage, accepting either stepping or leaning. The menu line becomes "Move: step or lean left/right, step or lean toward/away".
- **Tests:**
  - unit tests for the step-strafe signal: neutral at the calibrated spot, both directions, dead zone, the edge clamp, and mirroring
  - a clip of a person stepping side to side driving the fighter left and right (add one if needed)
  - report the detection rate in STATUS.md

  Then run the section 11 loop's walk/strafe scenes.

## 2026-10-25 2:16 AM CDT: data collection (the user chose research mode plus opt-in streams). No player video.
Seen: 78659ed (human-proportioned Quaternius fighters, IK contact, arm's-length range). Good. The user then asked to collect video and the 33 points for testing and model training. Constraints that make "always on" unacceptable:
- the menu promises "No video ever leaves your device"
- Meta's rules forbid collecting personal data without express written consent
- the free Tiger tier is small (about 750 MiB per service per a 2025 changelog; check it); the database is 12 MB today

Video does not go into Postgres.

### 1. Research mode (build next: it gives real ground truth for tuning gestures)
- **Entry:** `?research=1`. A full-screen consent step every session states plainly what happens: "Records your camera video to a file on this device, and sends your body-point coordinates, labeled research, to our server. Video is never uploaded." Nothing starts without an explicit checkbox.
- **Records, synchronized by timestamp:**
  - the camera video via `MediaRecorder` (480p, 30 fps), saved only as a local download
  - a JSONL file with one line per frame: time, the 33 world landmarks plus 33 image landmarks with visibility, detected actions with their scores, movement input, and game events (hits, blocks, guard breaks)
  - marker keys: **Space** = "I did a move and it did not register"; **F** = "it fired a move I did not do"; **1 to 9** = "I just did move N" (jab, hook, uppercut, block, X, palm, kick, step left/right, step forward/back)
- **Server copy:** the landmark, action, and marker stream also goes to a new Tiger hypertable `research_frames`, keyed by a random session UUID and tagged `research`, with a compression policy (`segmentby` session_id, ordered by time). It never contains video.
- **End of session:** both files download (`throwhands-research-<time>.webm` and `.jsonl`). The user will copy recordings to the server. Use them as test fixtures stored outside the repo, and report per-move recall and precision from the markers in TESTING.md.

### 2. Opt-in continuous pose streams (after step-sideways, the guard, and the octagon)
- **Behind the existing motion-data consent** (off by default), whole sessions are streamed instead of only short labeled snippets: landmarks downsampled to 15 fps, packed as compact numeric arrays (not verbose JSON), batched every 2 s, and capped at 10 minutes per session. Anonymous: a random session UUID, no player ID, no video.
- **Storage:**
  - a Tiger hypertable `pose_streams` with compression (`segmentby` session_id) and a continuous aggregate for minutes per label and per day
  - a storage guard: stop accepting stream inserts when `pg_database_size()` passes 600 MB, and log it
  - report the measured MB per player-hour before and after compression in STATUS.md
- **Showcase for the Tiger Data prize:** add frames stored, compressed size, and compression ratio to the motion-data page.
- **Update all user-facing text so it stays true:** the consent screen ("continuous body-point coordinates during play"), the menu footer, the README, and `submission/devpost.md`.

### Order from here
1. Research mode
2. Step sideways (2:00 AM)
3. Guard redesign (1:50 AM)
4. UFC octagon (1:35 AM)
5. Opt-in streams
6. Credits

Run the section 11 loop after visual changes; the freeze is 7:30 AM. Update STATUS.md (last update 1:50 AM) with 78659ed's review-loop scores and fist-to-target numbers.

## 2026-10-25 2:35 AM CDT: the user's test of the octagon build: camera occlusion, HUD overlap, monotone commentator
Seen: 5936250 (step sideways, 88% on real footage), bebb164 (guard, Iron Wall, octagon, cage bounce), dc578b2 (research mode). STATUS.md still says 1:50 AM; update it.

The user's screenshot (round 2, 1v1, Practice): "this is blocking my vision sometimes when the camera is at that angle." What it shows:

### 1. The camera ends up outside the cage, so the fence blocks the fight
- **What the screenshot shows:**
  - a corner post fills about a quarter of the screen as a solid black shape, with no lighting or texture
  - the top rail cuts a black band across the whole frame
  - chain-link covers both fighters
  - the damage number ("12") is hidden behind the rail
- **Fixes:**
  - **Keep the camera inside the octagon:** clamp its position to the cage radius minus about 0.6 m, and pull it in or up when the follow position would leave. Alternatively, raise it above the cage height and look down at a broadcast angle. Whichever you choose, the cage must never sit between the camera and the fighters.
  - **Fade occluders:** any cage panel, post, or rail between the camera and either fighter fades to about 15% opacity, or dithers out, while it occludes. Many fighting games do this.
  - **Post material:** the black post looks unlit or missing its material. Give the padded posts a lit, colored material.
- **New review-loop measurement and checklist item:** environment occlusion. Cast rays from the camera to each fighter's head, chest, hands, and feet every frame, and report the percentage of rays blocked by the cage, posts, or rails; target under 5%. Add a "camera near the cage" scene to the section 11 captures (fighters pushed into a corner and against the fence).

### 2. The player's own fighter hides the opponent
In the screenshot the camera sits directly behind the player's fighter, whose back covers most of the opponent. Use an over-the-shoulder offset, shifting the camera to one side by about half a shoulder width, so the opponent's head and torso are always visible. If they still overlap on screen, make the player's fighter partly transparent. Add a measurement: the percentage of the opponent's upper body visible in 1v1, target over 80%.

### 3. HUD overlap
- the player's name is cut off at the left edge ("ESE EATER" for "CHEESE EATER")
- the "THROW HANDS" arena banner sits behind and between the top HUD bars
- the commentary caption, the volume slider, and the tutorial hint ("Block with forearms up!") overlap at the bottom center
- the volume control stays open over the HUD

Give each HUD element its own safe area; truncate long names with an ellipsis inside the bar; close the volume popup on click-away or after 3 s. Check at 1280x720, 1920x1080, and a phone landscape viewport.

### 4. "The commentator is very monotone"
**Root cause found by the planner in `server/ai.ts`:**
- Gemini TTS is limited to `GEMINI_TTS_RPM` = 8 per minute, while lines arrive every 3 to 4 s (15 to 20 per minute)
- template lines are never voiced by Gemini
- a 429 backs off for 30 s

So most lines play through the browser's `speechSynthesis`, which is flat and robotic, at rate 1.15 and pitch 1.05. Gemini is used only on the lite TTS model with a one-line prompt. Fixes:
- **Fewer, bigger lines:** speak only on big moments: a combo, a super, a guard break, a cage slam, a KO, round start and end, low HP. Aim for at most 6 to 8 spoken lines per minute; the rest are caption-only.
- **Pre-rendered stock calls:** generate 40 to 60 short, high-energy calls once at deploy time and store them as audio files served from the server. Examples: "OHHH!", "WHAT A SHOT!", "HE'S HURT!", "GUARD BROKEN!", "INTO THE CAGE!", "IT'S OVER!", "ROUND TWO, FIGHT!", plus versions with the fighter's name for the house fighters. Play these instantly (zero latency, no rate limit) for template moments.
- **The most expressive voice available:** an ElevenLabs key exists on the server, used for the video's voiceover.
  - Use it for the stock calls, with a high-energy sports-announcer style. Check the current ElevenLabs model names, the style and stability settings, and the account's remaining character quota through its API. Write the quota in STATUS.md, and never spend more than 50% of what remains.
  - For live AI lines, try the full `gemini-3.8-flash-tts` before the lite one, with a director-style prompt that sets energy per event ("shouting, voice cracking with excitement" for a KO; "rising disbelief" for a guard break). Check Gemini's TTS docs for style control and two-speaker support (play-by-play plus color commentator) and use them if supported.
- **Remove the `speechSynthesis` fallback during matches.** If no voiced audio is available, show the caption only, or play a stock call.
- **Crowd audio:** a crowd roar layered under big hits, an "ooh" on blocked heavy hits, a building chant at low HP, and arena music between rounds (openly licensed; credit it).
- **Mute:** keep the mute toggle, and let the user set commentary and crowd volume separately.
- **Review:** add a commentary check to the section 11 loop, a 60-second match recording with audio. Reviewers rate energy and variety (1 to 5) and whether lines match on-screen events.

### Order
1, 2, and 4 first (they affect every match and the video), then 3, then the rest of the queue (opt-in streams, then credits). Freeze 7:30 AM.

## 2026-10-25 2:45 AM CDT: the user prefers the original camera angle; make the cage fade (replaces item 1 of the 2:35 AM section)
The user, after the screenshot: "i think the camera angle is good; maybe the cage can turn transparent or something? worth experimenting to see what 'keep camera inside the cage' means bc what happens when the player is close to the camera?"

The user's concern about clamping the camera inside the cage: when the fighters are near the fence on the camera's side, a clamped camera gets squeezed onto the player's back, the framing jumps, and the camera can clip into the fighter. Round 4 (72bc4f4) already clamps the camera inside the walls and offsets it about 35°. The user has not compared it with the original angle yet. So:

1. **Cage fading, needed with any camera.** Every cage element (chain-link panel, post, pad, top rail) that sits between the camera and any part of either fighter fades to about 10 to 20% opacity or dithers out, smoothly over about 150 ms, and returns when it no longer occludes. Fade only the occluding sections, not the whole cage, so the octagon still reads. The damage numbers and hit sparks must never be hidden by the cage.
2. **Two camera modes behind a URL flag, for the user to compare:**
   - `?cam=behind` (**the default for now**, the user's preferred angle): the original behind-the-fighter follow camera, not clamped to the cage, relying on fading. Keep the opponent visible: if the player's own fighter covers more than about 20% of the opponent's upper body, make the player's fighter partly transparent, and optionally shift the camera slightly sideways. Do not change the overall angle.
   - `?cam=inside`: the round 4 clamped camera with its 35° offset.

   Record both through the section 11 "camera near the cage" scene (fighters in a corner, against the fence on the camera's side, and on the far side). Report the occlusion percentage, opponent visibility, and camera jumps (frame-to-frame camera movement over 0.3 m) for each in STATUS.md, with screenshots. The user picks the default after trying both.
3. **Post material:** the padded posts render as solid black in the user's screenshot. Fix the material and lighting.
4. The 2:35 AM items 2 (only as described in point 2 here), 3 (HUD), and 4 (commentator) still stand.

## 2026-10-25 2:50 AM CDT: bug ("a big punch moves me backward"), then new moves (shoulder-throw super and grappling)
Seen: 41cb160 (opt-in streams), STATUS at 2:45 AM. Good.

### A. Bug: throwing a big punch moves the player backward (fix first)
The user: "when you throw a punch im p sure the shoulder frames looks smaller and so the player moves backward when you try to swing a big punch."

Likely mechanism, from the planner reading `shared/gestures.ts`. Confirm it with a repro; do not assume:
- forward/back comes from the image shoulder width, divided by `cos(yaw)`, with yaw estimated from **world-landmark z**, MediaPipe's noisiest axis
- the correction is clamped at `cos >= 0.5` (a 60° twist)
- the movement gate only starts on the frame a strike is *detected*, which is its peak; the wind-up and torso twist before detection still feed `ratioS` and `leanS`, and the 0.15 s smoothing spreads them out
- the punching shoulder moving forward may also shift `MS[2]`, which feeds `leanFwd`

Fix process (rule 3): reproduce it first with a clip of someone throwing big hooks and straights while standing still (from the user's research recordings if available, or a downloaded clip). Assert `move` stays within the dead zone, then fix. Ideas to evaluate against the repro:
- start the movement gate at strike **onset**: when wrist speed or arm extension starts rising past a low threshold, not at detection. Hold forward/back at its pre-strike value until about 0.35 s after the strike ends.
- use a distance cue that ignores twisting alongside shoulder width: torso length in the image (shoulder center to hip center), or eye or ear spacing, weighted toward whichever is steadiest. Ignore shoulder width when |yaw| > 35°.
- require forward/back intent to persist for about 0.2 s before it moves the fighter
- keep the repro as a regression test, and add a "big punches while standing still" scene to the section 11 captures, with the metric "fighter displacement during strikes", target under 5 cm

### B. New moves: grappling (clinch) and a Shoulder Throw super (the user's request; also in the user's original concept)
**Design: Smash's triangle.** Guard beats strikes, grabs beat guard, strikes interrupt grabs. Grabs give guarding players a counter, which pairs with the new guard meter. Starting thresholds below; tune them on clips and the user's recordings.

1. **Grab, entering the clinch** (no meter):
   - **Gesture:** within 1.1 m of the target, both arms extend forward together (both extensions above about 0.75, within 0.25 s of each other), then both wrists pull back toward the chest (extension below 0.45, wrists closer than one shoulder width) within 0.5 s. This "reach and pull" differs from the energy blast, which is palms pushed forward and held.
   - **Rules:** startup 0.3 s. A strike landing on the grabber during startup cancels the grab (strike beats grab). A guarding target is grabbed anyway (grab beats guard). Iron Wall is immune.
2. **Clinch state:** both fighters lock at about 0.6 m for up to 3 s.
   - **Grabber:** knees (the existing knee lift) deal 8 damage each, and short hooks deal normal damage.
   - **Escape:** the held fighter pushes both palms forward (a "frame"), or steps or leans back hard (forward input below -0.6 for 0.3 s). After 3 s the clinch breaks on its own.
   - **Visuals:** paired animation with arms around the neck and shoulders, driven by IK onto the other fighter's neck and shoulders.
3. **Shoulder Throw super** (full super meter):
   - **Gesture:** from the clinch or within 1 m, grab (both hands forward), then within 0.8 s twist the torso by 60° or more and hinge forward (shoulders drop by at least 15% of torso length). This mimics a judo shoulder throw.
   - **Effect:** 25 damage. Guard cannot block it. Iron Wall stops it. A strike landing in its first 0.3 s cancels it.
   - **Presentation:** a paired throw animation. The attacker turns their back and the target arcs over the attacker's shoulder onto the mat, with a heavy slam, mat dust, a camera shake, about 0.4 s of slow motion, and a stock commentary call ("SHOULDER THROW!").
   - **Animation:** if the Quaternius animation library has no throw clips, build it procedurally: attach the target's root to the attacker's shoulder and drive an arc in about 0.6 s, with ragdoll-like limb lag.
4. **Bots:** occasionally grab a guarding player and clinch, so the triangle shows up in practice and in the video.
5. **Teaching:** add Grab and Shoulder Throw to the tutorial and the menu controls list.
6. **Tests and review:**
   - unit tests for grab detection versus energy blast versus guard (no cross-triggers on labeled clips), clinch escape, the triangle rules, and throw damage
   - an e2e path: guard, get grabbed, get thrown
   - clinch and throw scenes in the section 11 captures

### Order (freeze 7:30 AM)
1. Bug A
2. Camera: cage fade and the two camera modes (2:45 AM)
3. Commentator (2:35 AM item 4)
4. Grab and clinch, then the Shoulder Throw
5. HUD overlap (2:35 AM item 3)

If B is not solid by about 6:45 AM, put it behind `?grapple=1` so the default build stays stable for the demo.

## 2026-10-25 2:55 AM CDT: "Research drills", a guided recording mode with only the player's fighter (the user's request; build it first, since bug A uses it)
Seen: 788f9eb (round 4 fixes; pose_streams 3.4x compression, 5.9 MB per player-hour). Good.

The user can't press label keys while throwing punches, and wants a separate research mode showing only their character. Labels should come from **prompts**, not keys.

- **Entry:** `?research=1&drills=1`, plus a "Guided drills" button on the research consent screen. Same consent; same uploads (landmark stream to `research_frames`, with no video); local video download stays on by default, with a checkbox to turn it off.
- **Scene:**
  - only the player's fighter in the octagon, no opponent, framed so the whole body is visible
  - one large prompt card ("Throw 8 RIGHT HOOKS on the beat. Don't step."), with the fighter demonstrating the move once first
  - a 3-2-1 countdown, then an audible beat, about one rep every 1.5 s
  - the camera preview in a corner
  - no game HUD, no commentator
- **Labels come from the script:** each rep's label is the prompted move plus the beat time window (beat ± 0.6 s), written into the JSONL and into `research_frames` as `label` and `rep` columns. The marker keys stay available but are optional.
- **The drill script (about 5 to 6 minutes; Skip and Redo buttons per drill):**
  1. **stand still**, guard up, 20 s: ground truth for no movement
  2. **big punches while standing still** (bug A): 8 big right hooks, 8 big left hooks, 8 big straights, 6 uppercuts; the card says "don't step"
  3. each move ×8: jab L, jab R, block (hold 3 s ×3), X-cross (Iron Wall pose) ×4, palm push ×4, knee ×4, kick ×4; grab and shoulder throw ×4 each once they exist
  4. movement ×4 each: step forward and back, lean forward and back, step left and right, lean left and right
  5. free shadowboxing, 30 s, unlabeled
- **Live feedback:**
  - after each drill, a result line from the live detector, e.g. "8 asked · 7 detected · 1 extra move"
  - for the stand-still and big-punch drills, "you drifted X cm", so bug A is visible right away
  - a summary table at the end
- **Agent side:**
  - a script that pulls drill sessions from Tiger by session id and computes per-move recall and precision, plus drift during the stand-still and big-punch drills
  - drill sessions become regression fixtures (stored outside the repo)
  - results in TESTING.md, with each fix showing before and after numbers
- **Order:** build a minimal version first (drills 1, 2, and 4), so the user can record bug A's data within about 30 minutes, then add drill 3. Then continue the 2:50 AM order.

### 2:58 AM refinement from the user: one prompt at a time ("throw a hook, then you throw a hook, and throw a jab, then throw a jab")
Make the drills **prompt-by-prompt** instead of reps on a beat:
- The screen shows one large instruction ("THROW A RIGHT HOOK"), then waits for the player.
- The rep ends when the detector fires the matching move, or after a 3 s timeout, which counts as a miss. A short "✓ hook" or "✗ missed" flashes, then after about 0.8 s the next prompt appears.
- **Label window:** from the prompt appearing until the rep ends, with the prompted move as the label. Any other move detected in the window is recorded as an extra (false) detection.
- **Order:** randomized moves (jab L/R, hook L/R, straight, uppercut, block, X-cross, palm, knee, kick, step and lean in each direction), each about 6 times, so the player can't anticipate. The "stand still" (20 s) and "big punches while standing still" blocks stay as their own sections at the start, because bug A needs them.
- **Calm pacing:** a progress bar ("23 / 90"), and a pause on Space.
- The live per-move tally and the end summary stay as specified above.
