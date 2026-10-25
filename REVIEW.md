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
