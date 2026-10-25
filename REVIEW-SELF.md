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

## Round 4: build 72bc4f4 (camera clamp, KO fix, contact fixes), Sun Oct 25 ~2:40 AM CDT
| Item | Motion | Visual |
|---|---|---|
| 1 Walk/run | 2 | 3 |
| 2 Torso/head | 2 | 3 |
| 3 Attacks | 2 | 3 |
| 4 Reactions | 3 | 3 |
| 5 Glows | 2 | 2 |
| 6 Effects | 3 | 2 |
| 7 Stage | 4 | 3 |
| 8 Camera | 1 | 2 |
| 9 Silhouettes | 3 | 2 |
| Strikes connect | 2 | 3 |

Highs:
- **Camera goes top-down** near the fence (the clamp lifted it).
- **Opponent hidden** behind you.
- **Shockwave rings** fill half the screen.
- **KO stand for 1.6 s:** the slow-mo plays the Death01 stagger.
- **Black band across the eyes:** the hair cap sat too low.
- **Steep Brawl camera.**
- **Cage slam** flies over the rail.
- **Bodies overlap**, and fighters stand too close.
- **Iron Wall counter** has no effect on the attacker.
- **Uppercut** launches before the glove arrives.

### Fixes (round 5 build, 4e9eae1)
- **Camera:** swings around you near the fence instead of lifting; wider shoulder offset.
- **Range:** arm's length plus a step, and the lunge never enters the target.
- **KO:** the fall starts on the KO frame.
- **Hair:** sits above the brow.
- **Rings:** bounded growth.
- **Iron Wall:** the counter knocks the attacker back.
- **Uppercut:** victims hold still until the glove lands (position and height).
- **Hit reactions:** a reaction layer on top of the live pose.
- **Side-steps:** walk at 60% speed.

Round 5 was captured but not reviewed: the planner's 2:35–2:50 AM direction changed the camera, commentator and bug list before the review would have been useful.

## Round 6: build 0290893 ("behind" camera with cage fading, plain fighters, announcer, HUD), Sun Oct 25 3:15 AM CDT
Reviewers: one motion+visual, one "judge" lens.

| Item | Reviewer A | Reviewer B (judge) |
|---|---|---|
| 1 Walk/run | 2 | 2 |
| 2 Torso/head | 3 | 3 |
| 3 Attacks | 2 | 2 |
| 4 Reactions | 3 | 3 |
| 5 Glows | 2 | 3 |
| 6 Effects | 3 | 2 |
| 7 Stage | 4 | 4 |
| 8 Camera | 2 | 2 |
| 9 Silhouettes | 2 | 3 |
| Strikes connect | 3 | 2 |
| Cage never blocks the fight | 1 | 1 |
| Opponent visible | 2 | 2 |

Highs:
- **Behind mode leaves the cage:** posts fill a third of the frame, and the camera sits outside the octagon (walk_forward_back, cage scenes). Metrics: cage in line of sight 68–96%, opponent visible 58–72%.
- **Faded parts read as grey veils.**
- **Your fighter is a see-through ghost** during your own strikes.
- **Fighters stand inside each other.**
- **The KO is a stiff plank.**
- **The super uppercut is a flat punch.**
- **The cage slam never touches the fence.**
- **The guard bubble looks like a full-body capsule.**
- **No visible energy-blast projectile.**
- **Brawl opening** shows two cropped foreground fighters, and you can't tell which one is you.
- **Bot contact** is 17–23 cm after the range change.

### Fixes (round 7 build, d807dee)
- **Camera:** keeps the user's behind angle but swings around the fight whenever it would leave the cage (`?cam=free` keeps the unclamped version for comparison). Occluding and near-camera cage parts fade out completely.
- **Measured locally after the fix:** cage in line of sight ≈ 0% in every scene (was up to 96%); opponent visible 97–100% (was 58–72%).
- **Spacing:** fighters keep 0.95 m apart (minDist), with a 1.25 m engage distance.
- **Contact:** the lunge may close to 0.5 m between roots. Measured: getting_hit 11.7 cm, cage scenes 3–5 cm, guard_break 7 cm.
- **See-through:** only as a fallback, at 60% opacity and never during your own strike.
- **KO:** a knockback tumble to the floor that stays down.
- **Super uppercut:** dips and rises. The launch is lower and harder (vy 4.4), and the cage absorbs the slam (restitution 0.15), so the target hits the fence at chest height (`cage` event at y 1.13 m) and drops at its base.
- **Guard bubble:** compact, around the head and arms.
- **Energy blast:** slower (4.2 m/s) so it visibly crosses the gap.
- **Brawl:** a marker over you, and a wider, higher opening shot.
- **Effects:** sphere trails removed, glove glow capped.
- **Camera cuts:** on teleports.

## Round 7: build d807dee (camera kept inside the cage, see-through fallback), Sun Oct 25 3:32 AM CDT
| Item | Reviewer A | Reviewer B (judge) |
|---|---|---|
| 1 Walk/run | 2 | 2 |
| 2 Torso/head | 3 | 3 |
| 3 Attacks | 3 | 2 |
| 4 Reactions | 3 | 3 |
| 5 Glows | 3 | 4 |
| 6 Effects | 3 | 3 |
| 7 Stage | 4 | 4 |
| 8 Camera | 2 | 2 |
| 9 Silhouettes | 3 | 3 |
| Strikes connect | 3 | 2 |
| Cage never blocks | 4 | 4 |
| Opponent visible | 2 | 2 |

The cage problem was solved: occlusion ≤0.9% everywhere.

New highs:
- **Camera side flips during a plain jab** (9 jumps). The new "cut on big moves" rule fired on the cage swing.
- **Opponent hidden** in cage_far (56%).
- **Super camera loses the launched victim.**
- **Launched fighter floats** in a seated guard pose.
- **Walking backward uses the jog clip in reverse**, which looks like splits.
- **See-through ghosting** (also flagged by the planner: it shows inner surfaces).
- **Brawl:** you are small at the back, behind cropped foreground fighters.
- **KO'd fighter** lies with gloves up.

Fixes (build 6039076 and later):
- **Camera:** the swing angle is smoothed with hysteresis, and it widens when your fighter hides the opponent. It cuts only on your own teleports.
- **Slow-motion camera:** frames both fighters and keeps its side.
- **See-through removed.**
- **Brawl:** a chase camera behind you.
- **Launch:** knocked-up fighters tumble.
- **Backing up:** never jogs, and runs at 70% speed.
- **KO:** settles into a limp lying pose.

Measured afterwards:
- **Opponent visible:** jab 89%, hook 84%, ko 93%, cage_far 72%.
- **Camera jumps in normal play:** 0.

## Round 8: build 53fcb66 (plus audio, drills), Sun Oct 25 4:08 AM CDT
| Item | Reviewer A | Reviewer B (judge) |
|---|---|---|
| 1 Walk/run | 2 | 3 |
| 2 Torso/head | 3 | 3 |
| 3 Attacks | 2 | 2 |
| 4 Reactions | 3 | 2 |
| 5 Glows | 2 | 3 |
| 6 Effects | 2 | 3 |
| 7 Stage | 3 | 4 |
| 8 Camera | 2 | 2 |
| 9 Silhouettes | 2 | 3 |
| Strikes connect | 1 | 2 |
| Cage never blocks | 4 | 4 |
| Opponent visible | 2 | 2 |

Highs (both):
- **KO slow-motion camera clips into the falling fighter** (ko f40).
- **Punches land behind your own back** from the camera.
- **Cage slam / launched bodies** pass over the fence or pop upright.
- **Brawl camera dives** overhead.
- **Energy blast** fires point-blank with no side camera.
- **Super uppercut glove** never rises for a live-pose player.

Fixes (build 83f8941):
- **Camera stays clear of bodies:** never inside or against a fighter. Its target and its eased path both stay 1.3 m clear of each body (1.8–2 m in slow motion). Checked frame by frame on the KO sheet: no clipping.
- **Slow-motion camera:** stays on your side and eases in and out.
- **Strikes:** the camera orbits wider during your own strike.
- **Tumbles:** limited by the distance to the fence.
- **Brawl camera:** looks 2.4 m ahead of you.
- **Energy blast:** gets the slow-motion side camera.
- **Super uppercut:** always plays its rising strike.
- **Spacing:** 1.3 m fighting distance, 1.0 m minimum.
- **Wrists:** straight along the forearm.

Measured after the fixes (local build):

| Scene | Contact mean (cm) | Opponent visible |
|---|---|---|
| jab | 0.7 | 94% |
| uppercut | 0.3 | 100% |
| ko | 0.7 | 97% |
| getting_hit | 7.8 | 99% |
| brawl8 | 4.6 | 100% |
| cage_far | 4.4 | 73% |

Still below target: planted-foot slide during strikes (5–9 cm; a rear-foot IK pin was tried, did not change the metric, and was reverted).

## Round 9: build 899b408 (slow-motion camera farther and perpendicular, nearer-camera rule, super uppercut IK, lunge cap, Iron Wall dome), Sun Oct 25 4:45 AM CDT
Reviewer A only. Reviewer B was not run: the planner's 4:35 AM queue (drill sessions: movement, hooks, grab) took priority. **Stop condition not met: 13 high findings.**

Scores:
- **1–2:** walk/run 2, wind-up/extension 2, framing 2, strikes visibly connect 2, opponent visible 2, camera never clips 1
- **3:** torso 3, flinch/tumble 3, super visuals 3, effects 3, presentation 3
- **4:** stage 4, cage never blocks 4

High findings, grouped:
- **Camera clips into or crosses over a launched/airborne opponent** (uppercut f46–61, energy_blast f34–52, cage_corner f31–88): the near-clip clearance is not enforced against airborne bodies, and the camera crosses to the opponent's side of the fight line.
- **Cage slam:** no slow-motion side camera; the opponent is hidden behind your fighter (cage_slam f46–64).
- **Framing loses a fighter:** cage_far (70% visible), knockback (you leave the frame on launch), getting_hit (cut off at the bottom and sliding 75 cm while crouched), ko (camera against your back).
- **Your own fist is hidden at impact** behind your back (jab, hook).
- **False banners:** "SUPER UPPERCUT!" in shield f34–55 with no uppercut; a stale "Guard broken!" tip in strafe.
- **big_punches:** about 1 m lunges in a stand-still scene.
- **Body interpenetration:** in hook, big_punches, cage_far, cage_corner, guard_break and shield.
- **brawl8:** the "you" marker drifts to another fighter, and other fighters fill the foreground.

Fixes for these are queued after the drill-session work (planner 4:35 AM order); round 10 follows them.
