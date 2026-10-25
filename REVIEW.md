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

## 2026-10-25 1:15 AM CDT: video review and graphics/motion requests (top priority until the 7:30 AM freeze)

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
