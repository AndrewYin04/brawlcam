# Visual and motion review loop (spec section 11)

Evidence for each round: `video/out/review/<round>/` on the build server (contact sheets at 10 fps, 30 fps clips, `<scene>_metrics.json`), produced by `ROUND=<round> npx tsx video/review-capture.ts`. Scenes: idle, walk, run, walk_forward_back, jab, hook, uppercut, block, shield, energy_blast, getting_hit, knockback, ko, brawl8.

## Round 1: baseline on the current build (VRM renderer), Sun Oct 25 1:15 AM CDT, build 724188e

### Measurements
| Scene | Foot slide mean / max (cm) | Drift frames / moving | Frozen torso+head frames |
|---|---|---|---|
| walk | 4.11 / 4.39 | 89 / 89 | 1 |
| run | 8.18 / 8.70 | 1 / 89 | 1 |
| walk_forward_back | 5.46 / 6.52 | 86 / 88 | 1 |
| jab | 6.08 / 25.08 | 54 / 76 | 1 |
| hook | 3.87 / 8.87 | 46 / 78 | 1 |
| getting_hit | 1.92 / 12.5 | 17 / 65 | 12 |
| knockback | 0.10 / 0.73 | 23 / 52 | 11 |
| block | 0.29 / 6.04 | 7 / 7 | 24 |
| energy_blast | 0.26 / 7.63 | 9 / 9 | 32 |
| brawl8 | 4.38 / 25.09 | 59 / 94 | 2 |

### Self-review (my verdicts, before reading the reviewers)
1. Walk/run: **fail**: legs do not animate; the body drifts (walk drift 89/89 frames).
2. Torso/head: **weak**: follows the pose, but bots/idle are frozen (block 24 frozen frames).
3. Attacks: **weak**: arm only, no hips, no wind-up.
4. Reactions: **fail**: knockback is a rigid plank (knockback f7–20).
5. Glows: **fail**: aura capsule visible in most shots; wireframe shield.
6. Effects: **fail**: flat pillars and big flat particles cover the fighters (uppercut f6–22).
7. Stage: **fail**: black void, no shadows.
8. Camera: **partial**: 1v1 framing OK-ish, Brawl far too wide.
9. Silhouettes: **fail**: one recolored anime model.

### Reviewers (fresh context, evidence + checklist + the user's complaints only)
| Item | Motion reviewer | Visual reviewer |
|---|---|---|
| 1 Walk/run | 1 | 1 |
| 2 Torso/head | 1 | 2 |
| 3 Attacks | 2 | 2 |
| 4 Reactions | 1 | 2 |
| 5 Glows only when active | 1 | 1 |
| 6 Effects readable | 1 | 1 |
| 7 Stage/lighting | 2 | 2 |
| 8 Camera | 2 | 3 |
| 9 Silhouettes | 2 | 1 |

High-severity findings (summaries, both reviewers): fighters glide with locked legs (walk 1–30, drift 89/89); no distinct run cycle; knockback is a rigid plank with no tumble or landing (knockback 7–20); no flinch on hits (getting_hit 4–18); KO scene never shows a KO; effects carry over between scenes (pillar visible before "FIGHT!"); flat light columns cover fighters (uppercut 6–22); wireframe "debug" shield (shield 5–30); hitbox-like capsule outlines (jab 29, hook 4/8/29); frozen idle; Brawl camera far too wide (brawl8 7–30); thin anime models, one silhouette; black void, no shadows; giant "SUPER UPPERCUT!" banner covers the hit.

Medium findings: arm-only punches; jab/hook look the same; banner covers impacts; opponent frozen during walk; player blocks the view of the opponent; flat cape slab; Brawl scoreboard overlaps the HUD; damage numbers pile up; camera loses the launched fighter.

### Actions (round 2 build)
- New renderer `web/src/game/hero.ts`: KayKit Adventurers (CC0) toon characters, 5 silhouettes, outlines; locomotion state machine on real ground velocity (idle/walk/run/strafe/back), live pose layered on chest/head/arms, authored punch/kick/hit/death/get-up/jump clips, tumble in the air and landing.
- Removed the aura capsule and wireframe shield (fresnel bubble only while the Shield is active), the super pillar (speed lines instead).
- Effects are disposed at match teardown (the carry-over bug).
- 1v1 ring-outs with damage-scaled knockback (sim), floating sky stage, closer camera.

## Round 2: hero renderer (KayKit chibis, floating stage), Sun Oct 25 ~1:35 AM CDT, build 4e7b98e
Measured: walk drift 89 → 11 frames, walk_forward_back 86 → 2, frozen torso/head frames ~0; foot slide still 3–6 cm.

| Item | Motion reviewer | Visual reviewer |
|---|---|---|
| 1 Walk/run | 2 | 2 |
| 2 Torso/head | 1 | 2 |
| 3 Attacks | 1 | 1 |
| 4 Reactions | 1 | 3 |
| 5 Glows only when active | 2 | 2 |
| 6 Effects readable | 1 | 1 |
| 7 Stage/lighting | 3 | 2 |
| 8 Camera | 2 | 2 |
| 9 Silhouettes | 2 | 2 |

Highs:
- the chibi helmet hides the opponent and every punch from behind
- knockdowns are a stiff plank that snaps upright
- getting_hit teleports
- full-screen flashes and the KO pillar wash out the frame
- block looks like idle
- no energy-blast projectile
- the KO scene never KOs
- the Brawl scoreboard is over the HUD

Then the user's webcam test (REVIEW.md 1:35 AM) replaced the direction: human proportions, an octagon instead of ring-outs, and movement teaching.

### Actions (round 3 build)
- Human-proportioned Quaternius fighters (CC0) with guard-up locomotion.
- Two-bone IK contact plus a lunge; the impact plays on the contact frame.
- Arm's-length range, an over-the-shoulder camera, the octagon, and the guard bubble.
- Edge-only impact flash; no BLOCK/SHIELD text labels in hero mode.

## Round 3: octagon + human fighters, Sun Oct 25 2:18 AM CDT, build f9b725c
Measured, fist-to-target on the contact frame:
- jab 1.9 cm, hook 5.9 / 17.9 cm, uppercut 4.5 cm
- bot strikes (getting_hit) 30 / 138 cm, guard_break 20.7 / 113 cm, knockback 60 cm

Foot slide is 2–10 cm.

### Self-review (before the reviewers)
1 walk ok but slides; 2 better; 3 jab connects; 4 tumble ok; 5 guard bubble reads; 6 KO burst is too white; 7 octagon reads; 8 framing OK in idle; 9 the fighters look alike.

### Reviewers
| Item | Motion | Visual |
|---|---|---|
| 1 Walk/run | 2 | 2 |
| 2 Torso/head | 3 | 3 |
| 3 Attacks | 2 | 2 |
| 4 Reactions | 2 | 3 |
| 5 Glows | 2 | 2 |
| 6 Effects | 2 | 1 |
| 7 Stage/lighting | 4 | 3 |
| 8 Camera | 1 | 1 |
| 9 Silhouettes | 2 | 1 |
| Strikes connect | 2 | 1 |

Highs (both reviewers):
- **The camera goes through the cage** posts and pads in about half the scenes (jab, walk, run, strafe, getting_hit, knockback, ko).
- **The KO'd fighter stays standing, then T-poses** (ko f13–30).
- The Iron Wall pose and gold bubble are never shown (shield).
- **Bot strikes register from up to 1.4 m away** (getting_hit, guard_break).
- **White spark bursts hide the fighters** (ko f8–12, uppercut).
- **Eight identical bald mannequins** in Brawl.
- The Brawl board covers the HUD.
- The player's head still overlaps the opponent.

### Root causes and fixes (round 4 build, 72bc4f4)
- **Camera:** clamped inside the octagon's walls (apothem − 0.3 m). It rises when pushed close to your back, and is now about 35° off the shoulder line (back 2.3 m, right 1.65 m).
- **KO / T-pose:** the hit reaction played on the delayed contact frame, *after* the sim's KO. It replaced the death clip, and when it ended nothing had weight, which gave the bind pose. Now:
  - the KO waits for the pending contact
  - a knocked-out fighter's death clip can't be replaced
  - the death clip plays faster (it staggers for about 1 s before falling)
- **Bot contact misses:** the tumble rotated the body around the feet, so a tumbling target's head was 1 m+ from where the attacker aimed. The tumble now pivots at the hips, and strikes on airborne targets aim at the chest. Bot contact is now 6.7 / 22 cm (getting_hit), 4.3 / 15 cm (guard_break), 9.4 cm (knockback), and 2.6 / 8 cm across 22 hits in brawl8.
- **Effects:** at most 16 spark sprites, each at most 0.16 m at 0.8 opacity; bloom 0.45 → 0.3; smaller KO and super rings.
- **Iron Wall:** a tight, normally blended saturated-gold bubble. The scene now uses a real clip of a person crossing their forearms above the face.
- **Silhouettes:** each roster slot has a top (none / tank / rash guard), fight pants, and hair (short / bun / long / mohawk) or headgear in the fighter's color; plus light/dark skin and heavy/lean builds.
- **Dizzy:** an upright, head-shaking loop with a sway (the old clip folded the body backward).
- **HUD:** the Brawl board moved below the bars; the movement indicator moved to a corner.
