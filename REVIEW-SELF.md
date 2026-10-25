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
