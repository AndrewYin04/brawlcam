# Testing

All end-to-end tests run against the deployed HTTPS server through the real UI, with real people's movement from downloaded video clips fed in as the webcam (spec section 9). Clips are local only (`clips/`, gitignored); see `clips/manifest.md` on the test server.

```
BASE_URL=https://throwhands.tech npx playwright test          # full suite
BASE_URL=https://144-202-71-213.sslip.io npx playwright test practice online   # subsets
```

**GPU (since 11:05 PM):** the test server has an NVIDIA GTX 1650 Ti, and Chromium gets hardware WebGL with `--use-angle=gl-egl` (verified with `WEBGL_debug_renderer_info`: "ANGLE (NVIDIA Corporation, NVIDIA GeForce GTX 1650 Ti/PCIe/SSE2, OpenGL ES 3.2)"). Tests now run the production configuration: real VRM fighters and the MediaPipe GPU delegate (practice: 26 pose fps, 61 render fps, 16.6 ms inference). Runs before 11:05 PM used the CPU-only setup (`PW_GL=swiftshader`): `?cpu` (MediaPipe CPU delegate) and `?lowgfx` (capsule stand-ins drawn from the same joints, because the VRM rendered at ~7 fps on SwiftShader and starved pose detection). `?nocomment` and `?aifixture` keep automated runs off live Gemini/Meta (recorded responses; spec 10 budget). Test-only knobs: `?skipcal`, `?botlevel=-1..3` (-1 = passive dummy, 3 = aggressive), `?roundsecs=N`, `?meter=N`.

## Latest full run

Sun Oct 25, 12:35 AM CDT (GPU setup): `npx playwright test` -> 46 passed, 1 skipped (`@live` Forge, run separately with `LIVE_AI=1`), 2 failed (the two 8-browser-scale specs, which ran in parallel with other browser tests on this 7 GB machine and timed out). Re-run alone at 12:55 AM: both passed (`BRAWL_BOTS {"kos":2,"kofeed":2}`; `WSO {"matches":4,"cheerChecked":true,"reconnectChecked":true}`, queue identical after reconnect). The suite now defaults to 1 worker.

## Gesture accuracy (spec 9.1 ground truth)

Labeled clips: `clips/groundtruth.json` (timestamps read from 10 fps frame sheets). Landmarks come from the real Pose Landmarker (lite, CPU) run frame by frame over each clip in headless Chromium (`tests/tools/dump-landmarks.ts`); `tests/tools/eval-gestures.ts` replays them through the shipped recognizer (`shared/gestures.ts`) and matches events within ±300 ms. Precision counts only clips whose labels are exhaustive (`tests/gesture-eval.json`); recall uses every confident label. Re-run after every threshold change:

```
npx tsx tests/tools/eval-gestures.ts            # 30 fps
STRIDE=2 npx tsx tests/tools/eval-gestures.ts   # 15 fps (typical phone / headless rate)
```

Last run: Sun Oct 25, 12:50 AM CDT.

| Move | 30 fps precision | 30 fps recall | 15 fps precision | 15 fps recall | Target (85% R / 90% P) |
|---|---|---|---|---|---|
| Jab | 86% (6/7) | 43% (6/14) | 63% (5/8) | 36% (5/14) | Not met overall. On the clear front-facing jab clip (`jab_01`): 6/6, 0 false positives at 30, 15, and 10 fps. Misses are in pro shadowboxing clips (`shadow_fighterF` throws sideways; `shadow_fighterG`'s deep bouncing stance trips the kick-in-progress suppression). |
| Hook | 100% (3/3) | 100% (3/3) | 100% (2/2) | 67% (2/3) | Met at 30 fps (3 labels only) |
| Uppercut | 0/3 | no confident labels | | | All uppercut labels are marked uncertain by the labeler; real-webcam check requested |
| Block | 50% (3/6) | 75% (3/4) | 50% | 75% | Not met (false blocks during X-shield transitions) |
| X shield | 100% (4/4) | 80% (4/5) | 100% | 80% | Precision met; recall 80% |
| Palm push | no confident labels | | | | Both palm-push clips are labeled uncertain |
| Kick | 71% (5/7) | 83% (5/6) | 71% | 83% | Not met (`kick_02`: fires at the chamber and the retraction, 0.4 s from the labeled peak) |
| Knee | 100% (2/2) | 100% (2/2) | 100% | 100% | Met |

What changed to get here (each verified on these clips before and after):
- Hooks: the elbow also opens during a hook, so a jab candidate whose wrist swept far toward the midline is a hook; and a discarded candidate no longer starts the full 0.32 s refractory (it hid the real hook peak). Hook recall 1/3 -> 3/3.
- Kicks: one kick at a time (shared cooldown); arm swings right after a kick are not strikes.
- Jabs aimed at the camera barely change arm length in monocular 3D (depth is compressed). Detecting elbow-angle peaks instead of arm extension took `jab_01` recall from 4/5 to 6/6, and from 20% to 100% at 15 fps.
- Strikes are detected as peaks (rise within 350 ms, then fall), so detection works the same at 10-30 fps.
- Raising both arms into a block or X used to fire two jabs: two-handed motions that end at face height are now treated as defense; ending at chest height they are a palm push.
- Blocks: measured wrists 0.1 m higher and 0.15-0.2 m further forward than the guard, close together. X: pose tracking cannot separate tightly crossed wrists, so a high X reads as "wrists touching above the face, elbows raised and spread".

## Local 2-player identity (spec 9.1 "two fighters on one camera")

`npx tsx tests/tools/assign-eval.ts` replays two-person landmarks (8 UFC clips, 2 workout clips) through `shared/assign.ts`. With MediaPipe's detection order shuffled randomly every frame (`SHUFFLE=1`, adversarial), 1,943 frames with both people visible: **0 identity swaps**. Unshuffled: 1 swap in 971 frames (`ufc_07`, where MediaPipe's own order also flips).

## User paths (spec 9.2)

| Area | Path | Result | Last run (CDT) | Command | Evidence |
|---|---|---|---|---|---|
| Practice vs bot | Full match won by KO | PASS | Oct 24 9:30 PM | `npx playwright test practice` | `WON_KO {"winner":1,"me":1,"rounds":["ko","ko"],"hits":38,"actions":59,"fps":16}` (jab clip vs passive bot; 59 real strikes detected) |
| Practice vs bot | Lost by KO | PASS | Oct 24 9:30 PM | same | `LOST_KO {"winner":2,"me":1,"rounds":["ko","ko"]}` |
| Practice vs bot | Won on time | PASS | Oct 24 9:30 PM | same | `WON_TIME ... "winner":1,"reason":"time"}, "hp":[100,79]` |
| Practice vs bot | Drawn round | PASS | Oct 24 9:30 PM | same | `DRAW ... "winner":null,"reason":"time"}, "hp":[100,100], "banner":"DRAW ROUND"`; round 2 starts |
| Practice vs bot | Rematch | PASS | Oct 24 9:30 PM | same | Rematch after the KO win starts a new round 1 |
| Practice vs bot | Quit to menu mid-round | PASS | Oct 24 9:30 PM | same | Menu shown, no console errors |
| Avatar mirroring | Fighter mirrors the player within 5 s of camera access | PASS | Oct 25 12:18 AM | `npx playwright test tests/e2e/mirror.spec.ts` | `MIRROR ms after camera access: 1778` (now mirrors during calibration too) |
| First load | Desktop, camera allowed, no console errors | PASS | Oct 24 9:38 PM | `npx playwright test firstload` | CPU delegate, pose fps > 3, zero console errors |
| First load | Phone viewports (844x390 landscape, 390x844 portrait, touch, DPR 2) | PASS | Oct 24 9:38 PM | same | No horizontal overflow; HUD within viewport; screenshots in `test-results/phone-*.png` |
| First load | Camera denied: clear message and retry | PASS | Oct 24 9:41 PM | same | "Camera blocked" + "Allow camera access..." + Retry re-asks (Chromium `--use-fake-ui-for-media-stream=deny` = NotAllowedError) |
| First load | No camera device: message + demo mode vs bot | PASS | Oct 24 9:38 PM | same | "No camera found"; demo mode lands 3+ hits |
| First load | HTTPS required | PASS | Oct 24 9:38 PM | same | `http://` answers a redirect to `https://` |
| First load | Slow 3G: loading progress, models load | PASS | Oct 24 9:41 PM | same | `SLOW3G progress % [3,5,8,11,14,17]`, menu after 183 s (DevTools Slow 3G values: 400 ms, 500 kbit/s) |
| Calibration | Guard pose detected; completes in ~3 s | PASS | Oct 24 9:38 PM | `npx playwright test calibration` | `CALIB seconds 2.8` (guard clip) |
| Calibration | Too close / too far guidance | PASS | Oct 24 9:38 PM | same | Injected camera zoom 2.4 => "Step back..."; zoom 0.3 => "Step closer..."; back to normal => calibration completes |
| Local 2-player | Full match, both people control their fighter | PASS | Oct 24 9:43 PM | `npx playwright test local2p` | Two real clips side by side: `LOCAL2P {"winner":1,"byPlayer":[33,25],"hits":20}` |
| Local 2-player | One player leaves mid-round; both leave; both return | PASS | Oct 24 9:43 PM | same | Masked half => that fighter `present=0`, other `1`; blank => both 0; restore => both 1; no errors |
| Online 1v1 | Fighter A vs fighter B full best-of-3 (create room, join by link), rivalry card, Web Share and copy-link fallback | PASS | Oct 24 10:29 PM | `npx playwright test online` | Latest: `{"samples":2160,"mismatches":0,"p95ArrivalSkewMs":29}`, card shown on both clients, Web Share called, copy fallback copied a link. Earlier: `{"samples":1715,"mismatches":0,"p95ArrivalSkewMs":49,"aHits":30,"bHits":30,"bActions":48,"winner":2,"elo_delta":{"1":-16,"2":16}}`: same tick => identical HP/round/timer on both; both agree on the winner; Elo written to Tiger Data |
| Online 1v1 | Join by typed code | PASS | Oct 24 9:42 PM | `npx playwright test online2` | Lowercase code accepted; both rosters show 2 |
| Online 1v1 | Invalid code (UI) | PASS | Oct 24 9:42 PM | same | "No room with that code. Check it and try again." |
| Online 1v1 | Third person becomes a spectator, sees the live fight, cheers reach fighters | PASS | Oct 24 9:42 PM | same | Spectator snapshot has 2 fighters, time advances; cheer counted on host |
| Online 1v1 | Ninth person refused with a clear message | PASS | Oct 24 9:42 PM | same | Room filled to 8 (3 browsers + 5 WebSocket clients); 9th browser: "That room is full (8 people max)." |
| Online 1v1 | Guest disconnects mid-round | PASS | Oct 24 9:42 PM | same | Guest fighter idles (`present=0`), then after the 10 s grace host wins |
| Online 1v1 | Host disconnects mid-round | PASS | Oct 24 9:42 PM | same | Guest wins, becomes host (rematch enabled) |
| Online 1v1 | Reconnect within 10 s resumes | PASS | Oct 24 9:42 PM | same | `setOffline` 4 s; same slot, present again, match continued |
| Online 1v1 | 200 ms added latency | PASS (simulated) | Oct 24 9:42 PM | same | Client-side `?netlag=200` (100 ms each way): `LAG200 {"winner":2,"bActions":18,"hits":5}`, both agree. Real cellular latency not measured here. |
| Online 1v1 | Both players on phones | PASS (viewport) | Oct 24 9:42 PM | same | 844x390 mobile viewports, round completes, no overflow, no errors. Real phones: planner check pending |
| Online 1v1 | One desktop, one phone | PASS (viewport) | Oct 24 9:42 PM | same | 1280x720 + 390x844 |
| Brawl | 8 browsers, 8 different fighter clips, full 2-minute round | PASS | Oct 25 12:17 AM | `npx playwright test tests/e2e/brawl.spec.ts -g "8 browsers, 8"` | GPU run: `BRAWL8 {"samples":2494,"mismatches":0,"p95":35,"kos":3,"ringouts":3,"respawns":3,"actions":[0,123,2,22,0,113,54,40],"turns":[0,5,0,8,0,7,0,1],"fps":[16,20,16,18,21,19,19,18]}`: same tick => identical positions/HP/knockback/KOs on all 8; arrival p95 35 ms; human KOs and KO feed; final KO counts identical. (Capsule fighters + no traces for this test: 8 full VRM browsers swap this 7 GB machine.) Earlier CPU-only run (10:10 PM): `npx playwright test tests/e2e/brawl.spec.ts` | `BRAWL8 {"samples":397,"mismatches":0,"turns":[0,18,1,14,0,12,0,10],"tgChanges":[2,18,2,12,0,12,0,10],"kos":2,"ringouts":2,"respawns":2}`: same tick => identical positions, HP, knockback, KOs on all 8; shoulder turns switch target lock; final KO counts identical. Arrival skew p95 195 ms here because 8 browsers saturate this 8-core server (2-browser test: 49 ms). Pose ran at 1-4 fps per browser, so few human KOs. |
| Brawl | 1 human + 7 bots; 3 humans + 5 bots; fighter disconnects (replaced by a bot); spectator joins mid-round | PASS | Oct 24 10:13 PM | same, `-g "1 human"` | `BRAWL_BOTS {"kos":2,"kofeed":2}`: ring-outs, respawns, and KO feed lines; disconnected fighter turns into a bot; late joiner enters as spectator |
| Brawl | 8-fighter round on a phone-sized viewport (record FPS) | RECORDED | Oct 24 10:10 PM | same | 844x390 mobile viewport on this CPU-only server (SwiftShader): VRM fighters 2-3 fps, capsules 48-60 fps. Not representative of a phone GPU; real-phone FPS: planner check pending |
| Winner-stays-on room | 8 browsers, 4+ matches rotate, spectators cheer, queue survives reconnect, fighter leaves mid-match | PASS | Oct 24 10:41 PM | `npx playwright test tests/e2e/wso.spec.ts` | `WSO {"matches":4,"pairs":["1-2","2-3","2-4","4-5","5-6"],"cheerChecked":true,"reconnectChecked":true}`, `WSO_QUEUE qBefore == qAfter`; leaver's match awarded, next in line fights; no console errors |
| Supers | Super fires only with a full meter | PASS | Oct 24 10:16 PM | `npx playwright test tests/e2e/supers.spec.ts` | `SUPER_GATE {"xGestures":7,"shields":0}`: X gestures recognized, no super with an empty meter |
| Supers | Shield blocks all damage for 3 s; cooldown respected | PASS | Oct 24 10:16 PM | same | `SHIELD {"shields":1,"duringShield":[[0,true]x6]}`: every hit during the shield did 0 damage; with the meter held full, no second shield within the 10 s cooldown in 35 s of X gestures |
| Supers | Energy blast travels and can be blocked | PASS | Oct 24 10:19 PM | same | `BLAST {"path":[[0,-0.25],[0,0.05]],"blasts":[[20,false],[4,true]]}`; projectile moves across frames; blocked = 4 HP, unblocked = 20 |
| Fighter Forge | Valid prompt (recorded Meta response) | PASS | Oct 24 10:18 PM | `npx playwright test tests/e2e/features.spec.ts` | Name/story/moves/card shown; card color becomes the fighter's color in the match (`me.color` equals saved color, name "King Magma") |
| Fighter Forge | Valid prompt (live Meta) | PASS | Oct 24 9:19 PM | `npx tsx tests/tools/forge-live.ts "volcano samurai frog"` | `FORGE 13.0s {"source":"meta","image":true,"name":"Magma Ribbit Ronin"}` |
| Fighter Forge | Empty prompt | PASS | Oct 24 10:16 PM | features | House fighter + "Type an idea..." (real server, no AI call) |
| Fighter Forge | Offensive prompt (recorded refusal) | PASS | Oct 24 10:16 PM | features | Polite toast "Let's forge a different fighter..." + house fighter |
| Fighter Forge | Meta API erroring | PASS | Oct 24 10:16 PM | features | 500 => house fighter; practice still starts |
| Fighter Forge | Longer than 15 s | PASS | Oct 24 10:16 PM | features | Spinner text, fallback in < 17 s |
| Commentator | Lines arrive during play; mute/unmute | PASS | Oct 24 10:16 PM | features | Lines >= 3.4 s apart, shown on screen; muted lines not spoken; unmute persists |
| Commentator | Gemini rate-limited or down | PASS | Oct 24 10:16 PM | features | 429 => no toast, no errors, match continues |
| Leaderboard and Elo | Page loads (real Tiger Data); unreachable => friendly error; empty | PASS | Oct 24 10:18 PM | features | Table rendered; 503 => "taking a breather"; empty => "No ranked fights yet"; practice still starts |
| Leaderboard and Elo | Updates after an online match | PASS | Oct 24 9:10 PM | `npx playwright test online` | `elo_delta {"1":-16,"2":16}` from Tiger Data; players table rows updated |
| Store | Browse, mock purchase, equip shows in game, opt-in persists | PASS | Oct 24 10:18 PM | features | 8 skins with "Demo: no charge"; Buy => Equip => Equipped; in-game color `#ffc53d`; consent persists across reload |
| Browsers | WebKit (proxy for iOS Safari): pose drives the fighter, practice plays | PASS | Oct 24 11:04 PM | `npx playwright test tests/e2e/browsers.spec.ts` | `BROWSER webkit {"delegate":"GPU","poseFps":12,"renderFps":28,"actions":2,"hits":2}` via the main-thread pose fallback (WebKit has no WebGL in workers) |
| Browsers | Firefox | PARTIAL | Oct 24 11:04 PM | same | Headless Firefox on this server has no WebGL at all (no display, no Xvfb, no sudo); the game shows a clear "can't run 3D graphics" message instead of crashing. Gameplay in Firefox is unverified here. |
| Browsers | Chromium mobile viewport, landscape and portrait | PASS | Oct 24 11:04 PM | same | 844x390 and 390x844, gestures register, no console errors |
| Motion data dashboard | Opted-in match writes samples (counts update); opted-out writes none; export JSON | PASS | Oct 24 10:16 PM | features | `MOTION {"sent":1,"before":1,"after":2}`; 0 requests when opted out; export has 33-point frames and no player identifiers |
| Online 1v1 | Invalid code | PASS (protocol) | Oct 24 9:03 PM | `npx tsx tests/tools/ws-smoke.ts` | `invalid code -> room_not_found` (UI test pending) |

Paths not yet run are listed in `STATUS.md` until they have a row here.

## Rules and controls added Sun Oct 25 1:40–3:00 AM (octagon, guard, movement, contact, data)

| Area | Test | Result (latest run) |
|---|---|---|
| Movement: lean forward/back, retreat persists (repro of the user's bug) | `npx tsx tests/unit/move-forward-back.ts` | before the fix: a 12 cm lean gave forward input 0.13 and moved 0.09 m; a retreat was partly undone. After: lean in gives 0.94, moves 0.41 m; the retreat stays (1.81 → 1.81 m); standing in guard 0/90 frames of movement input |
| Movement: step sideways to strafe | `npx tsx tests/unit/side-step.ts` | neutral at the calibrated spot; dead zone holds; full strafe at 0.9 shoulder widths; edge warning and clamp past 90% of the frame; mirroring (stepping to your own left moves your fighter screen-left); real side-to-side footwork (shadow_fighterD): 88% of frames strafe in the stepped direction, 0 wrong-direction frames |
| Movement tutorial + defend stage (real clips through the real UI) | `npx playwright test calibration` | all 4 directions detected (zoom = step in/out, sideways shift = step, skew = lean), guard (block_01 clip) and Iron Wall X (xshield_01 clip) detected, then the match starts; the HUD indicator lights while moving |
| Guard meter, break, dizzy, Iron Wall counter | `npx tsx tests/unit/guard-meter.ts` (48 checks), `tests/unit/bot-guard.ts` | drain 20/s, empty in 5 s, refill 25/s after 0.5 s, per-hit drain, break → 2 s dizzy → guard at 30, blocked hits 10%, Iron Wall 0 damage + first-attacker counter |
| Guard break in the real game | `npx playwright test supers -g guard` | `GUARD {"blockedBefore":[["hook",1,84],["hook",1,35],["jab",1,15]],"break":{...},"dizzyHit":["jab",9,false]}` |
| Octagon: cage bounce, no ring-outs, HP KOs, Brawl respawn | `npx tsx tests/unit/octagon-cage.ts` (replaces the ring-out tests) | knockback 0.28 / 0.48 / 0.66 m at 0 / 60 / 120 damage taken; super uppercut next to the fence → `cage` event at 9 m/s, stays inside, bounces back, round continues; walking stops at the fence with no slam; 1v1 HP KO ends the round; Brawl 0 HP → KO credited, respawn after 3.07 s with 100 HP |
| Strikes visibly connect (section 11 metric) | `ROUND=<r> npx tsx video/review-capture.ts` → `contactMeanCm`/`contactMaxCm` | round 4 (deployed): jab 1.9, hook 2.0, uppercut 2.0, ko 1.9, cage_slam 2.0, shield 3.1 / 5.4, getting_hit 6.7 / 22, knockback 9.4, guard_break 4.5 / 16, brawl8 2.5 / 8 cm over 22 hits (target: under 10 cm) |
| Research recording mode | `npx playwright test research` | consent required (Start disabled until ticked); 2 files downloaded (1.2 MB webm, 283 KB jsonl with 33 world + 33 image points per frame); markers `did:jab`, `missed`, `false_fire` recorded; 131 landmark frames + 3 markers stored server-side; declining records and sends nothing |
| Opt-in continuous pose streams | `npx playwright test streams` | consent on: 182 frames in 12 s (15.2 fps), 7 batches, stored in `pose_streams`; consent off: 0 requests |
| Stream storage per player-hour | `npx tsx tests/tools/stream-storage-bench.ts` (throwaway hypertable, 54,000 real frames, dropped after) | real[] arrays: 34.6 → 20.4 MB per player-hour (1.7x); one smallint column per coordinate (shipped): 19.7 → 5.9 MB (3.4x), about 102 player-hours under the 600 MB guard |
| Big punch must not move you (bug A, the user's report) | `npx tsx tests/unit/punch-no-move.ts` (real clips of people punching in place) | before: up to 61 cm of input-driven movement around a strike; after: 4.2 cm worst (target < 5) |
| Pose rate vs renderer (integrated Intel GPU, like the user's laptop) | `npx tsx tests/tools/pose-fps.ts` (VARIANTS=...) | pose alone 17 fps; game idle 16 (60 fps render) / 17.4 (cap 30) / 19.5 (cap 24, no bloom); under another GPU load 7.4 uncapped vs 18 capped at 30. Shipped: automatic step-down when pose < 18 / 15 fps |
| Research recording cost | browser check (codec forced) | pose 12.4 fps with VP9 recording, 14.4 with H.264 (now preferred) |
| Announcer audible | `npx playwright test commentary` (production) | 9 calls in 26 s matching events; AudioContext running, voice bus 0.9, 9 played; 0 browser speechSynthesis calls |
| Stock calls say only their line | `npx tsx tests/tools/check-calls.ts` (ElevenLabs speech-to-text) | 48/48 clean (0 extra words) |
| Live Gemini TTS lines | `npx tsx tests/tools/check-live-tts.ts` | not measurable today: both Gemini TTS models answer 429 (free-tier quota). Live lines are captions; spoken commentary is the verified stock calls |
| Research mode auto-save | `npx playwright test research` (production) | consent, 2 files, labels/markers, 137 frames to Tiger; saves on Quit/Menu/page close, checkpoints every 2 min |
| Guided drills | `npx playwright test drills` (production, clips drive the prompts) | 3 sections; big punches 10/15 detected; movement 24/24; files saved |
| Grappling (flagged ?grapple=1) | `tests/unit/grapple-gestures.ts`, `grapple-sim.ts`, `tests/tools/grapple-scan.ts` | 0 grab/throw false triggers on all 37 clips; synthetic grab 4/4, throw 4/4; triangle rules, escapes, throw damage; existing detection unchanged (eval-gestures identical) |
| Camera (round 7 fixes) | `ROUND=<r> npx tsx video/review-capture.ts` | cage in line of sight ~0% in every scene; opponent visible 84-93% (cage_far 72%); no side flips in normal play |

## Grab reach vs jab / energy blast, and real grapple footage (planner direction, Oct 25)

The user's report ("it keeps registering as a punch"): the grab's two-arm reach fired a jab (and sometimes the energy
blast) before the pull-in. Reproduced on the synthetic grab sequences in `tests/unit/grapple-gestures.ts` built from a
real guard clip: before, every reach-and-pull fired `jab@1.33` (or `jab@1.4`) before the grab. Root cause: when both arms
extend together, usually only one arm passes the jab rules (the other's speed sits just under `strikeMinSpeed`), so the
two-hand palm pairing never runs and the single jab fires at once; a palm pair fired the blast on the spot with no hold.

Rules added in `shared/gestures.ts` (`GRAPPLE_CFG.jabHold*`, `reachElbowMin`, `blastHold*`; they apply with or without
`?grapple=1`):
- **Jab hold.** A jab whose arm is out at reach length while the other arm is past 50% of a reach, still extending
  (> 1.5 arm lengths/s) and opening its elbow (>= 105 deg) is held for up to 0.25 s. It fires as soon as the other arm
  stops short or the jab arm comes back; it fires nothing if the arms form a reach. If both arms are already out together,
  straight (both elbows >= 150 deg), in a reach that formed within 0.25 s, the jab is part of that reach and fires nothing.
- **Energy blast hold.** A palm pair fires the blast only after the palms are held out for 0.3 s (both extensions >= 0.75,
  elbows >= 105 deg, wrists >= 0.7 arm lengths in front of the shoulders); the pull-in pose or the arms coming back cancels it.
  The blast now fires 0.3 s after the push by design; so does the palm frame that escapes a clinch (the sim reads the same
  `palm` action).

Thresholds were picked on the real clips: an elbow-free version swallowed real jabs (`jab_01` 2.7 s: the rear hand drifts
forward with its elbow at ~100 deg), 140 deg dropped one-twos on `shadow_fighterF`, a "still rising" rate of 0 held five real
single jabs (+33-133 ms), and the blast hold without the forward test fired a blast on `shadow_fighterI` (arms hanging in a
karate ready stance).

`npx tsx tests/tools/eval-gestures.ts`, before and after (identical):

| move | TP | FP | FN | precision | recall |
|---|---|---|---|---|---|
| uppercut | 0 | 3 | 0 | 0% | - |
| jab | 6 | 1 | 8 | 86% | 43% |
| hook | 3 | 0 | 0 | 100% | 100% |
| block | 3 | 3 | 1 | 50% | 75% |
| xshield | 4 | 0 | 1 | 100% | 80% |
| kick | 5 | 2 | 1 | 71% | 83% |
| knee | 2 | 0 | 0 | 100% | 100% |

(No palm row before or after: the recognizer detects 0 palm pushes on `palmpush_01/02`, both before and after; existing gap.)
Detections that changed on unscored clips: `palmpush_01` lost jabL@8.27 + jabR@8.30 (frames: hands dropping to the belt, not a
strike); `shadow_fighterI` lost jabL@0.33, jabR@0.53, jabL@0.67 (arms hanging in a ready stance); `crowd_01` (4 people,
side-on sparring, the tracked person switches, excluded from eval) lost 6 of 15 jabs.

Jab latency (`npx tsx tests/tools/jab-latency.ts`: arm extension peak to the frame the jab is emitted):

| | labeled jabs | all jabs on all 37 clips |
|---|---|---|
| before | n 13, mean 46 ms, median 33, max 267 | n 72, mean 75 ms, median 33, max 333 |
| after | n 13, mean 46 ms, median 33, max 267 | n 62, mean 75 ms, median 33, max 333 |

Every jab that still fires is emitted on the same frame as before (the 10 fewer are the removals listed above), so
single-arm jab latency did not rise.

Synthetic grabs (`tests/unit/grapple-gestures.ts`, now asserted): no jab or palm from the start of the reach to 0.3 s after the
grab in all five grab sequences (30 and 15 fps, arms together and 0.18 s apart, grab-then-throw); push and hold 1.2 s fires
exactly one blast; `grapple-scan` still 0 grab / 0 throw on all 37 clips.

### Real grab / throw footage (`npx tsx tests/tools/grapple-eval.ts`)

Clips (local only, `clips/grapple/`, labels in `clips/grapple/groundtruth.json`, landmarks via
`CLIPS_DIR=clips/grapple BASE_URL=... npx tsx tests/tools/dump-landmarks.ts`):

| clip | source | content | labels |
|---|---|---|---|
| seoi_01 | youtube.com/watch?v=wFKVZnfg9hs 4.0-27.5 s | solo seoi-nage shadow uchikomi, 3/4 to side view | 17 throw reps (2 with the full hinge) |
| seoi_02 | youtube.com/watch?v=WoH6L6UJDZI 86-116 s | solo drop-seoi drill, front-on start, turn, knee drop, hinge | 6 throws (all hinged) |
| clinch_03 | youtube.com/watch?v=gYt6LvKoe2k 83-119 s | solo "clinch entry in shadowboxing" tutorial (frames, covers) | 0 grabs (no two-hand reach-and-pull in it) |
| clinch_01 | youtube.com/watch?v=p-E5l0szE8Q 5.2-34 s | Muay Thai partner clinch-entry drill, side-on | not labeled (side-on, two people) |
| clinch_02 | youtube.com/watch?v=g-_2EvQQvmg 0-16 s | hook block to clinch entry, side-on partner drill | not labeled |

| | TP | FP | FN | precision | recall |
|---|---|---|---|---|---|
| throw (±0.5 s around the labeled interval) | 1 | 1 | 22 | 50% | **4%** (hinged reps 1/8) |
| grab | - | 0 | - | - | not measured: no real front-on two-hand clinch entry found |

Cross-triggers on these clips (none contains a punch or palm push): jab 18 before / **14 after** (8 / 6 inside a labeled
throw), energy blast 2 before / **0 after**, plus hooks (9 on seoi_01, unchanged). No grab fired on any of the five clips.

Why throws are missed (seoi_02 rep 1, per-frame features): the judo entry has almost no forward reach (both extensions rise
0.77 -> 0.85, under `reachRise` 0.12, because the grip is already taken), the turn comes with the arms pulled in, and the
hinge lands about 1.5 s after the turn, past `throwWindow` 0.8 s. **Default-on criterion (about 70% recall for grab and throw)
is not met**: throw 4% on real drills, grab unmeasured. `?grapple=1` stays opt-in.

## The user's drill sessions fda75d56 and 2dd3adbd, replayed (REVIEW.md 4:25 and 4:35 AM, Sun Oct 25 5:00 AM)
- **Data:** both sessions were exported from Tiger with `tests/tools/export-research.ts` into local fixtures (`clips/research/`, gitignored).
  - **Timing:** row times are rebuilt by a rolling fit, because the server clamped frame times to its clock and up to 9 frames shared 1 ms. New sessions store the capture time in `ft`.
  - **Replay:** `tests/tools/drill-replay.ts` replays a session through the real recognizer with the live guard calibration, and scores each rep on a 3 s window the way `web/src/drills.ts` does. `tests/tools/drill-trace.ts` traces one rep frame by frame. `tests/tools/strike-features.ts` gives each rep's sweep, rise, torso turn and elbow.
- **Per-drill movement numbers, before and after:** STATUS.md, "Since 4:35 AM".
- **Strike confusion on the punch and grapple reps, both sessions** (actions fired inside the rep windows):

| Prompted (both sessions) | Reps detected before → after | jab fired before → after | hook fired before → after | uppercut fired before → after | palm fired before → after | grab fired before → after | throw fired before → after |
|---|---|---|---|---|---|---|---|
| straight_big | 3/8 → 3/8 | 4 → 4 | 3 → 4 | 5 → 5 | 0 → 0 | 0 → 0 | 0 → 0 |
| hook_L_big | 2/8 → 4/8 | 6 → 6 | 2 → 4 | 1 → 1 | 0 → 0 | 0 → 0 | 0 → 0 |
| hook_R_big | 2/8 → 5/8 | 7 → 7 | 5 → 8 | 2 → 2 | 0 → 0 | 0 → 0 | 0 → 0 |
| uppercut_big | 1/6 → 4/6 | 7 → 7 | 4 → 3 | 1 → 4 | 0 → 0 | 0 → 0 | 0 → 0 |
| grab | 0/4 → 3/4 | 11 → 3 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 3 | 0 → 0 |
| throw | 0/4 → 0/4 | 5 → 2 | 4 → 4 | 1 → 0 | 0 → 0 | 0 → 1 | 0 → 0 |

  These were replayed on the uploaded JSONL capture times. The "before" column matches the live numbers in REVIEW.md (session 2: right hooks 0/4, uppercuts 0/3, grabs 0/4). Video ground truth for session 2 is in STATUS.md.

- **Boundaries were tuned on these sessions plus the 37 shadowboxing clips:**
  - big uppercut: wrist rise ≥ 0.4 m and ≥ 0.75 × the sweep
  - big hook: sweep ≥ 0.45 m, or a turn ≥ 35° with ≥ 0.3 m sweep
  - **Why not 0.30 m:** the planner's 0.30 m turned 7 crosses on the clips (bladed-stance rear straights, 0.29–0.41 m sweep) into hooks, and cost 1 labeled jab. At 0.45 m every labeled jab is kept.
  - **Yaw wrap fixed:** the turn is now a wrapped difference. Before the fix, a yaw crossing ±180° read as a 358° turn.
- **eval-gestures (labeled clips), unchanged before and after:**
  - jab: 6 TP, 1 FP, 8 FN (86% precision)
  - hook: 3/3, 0 FP
  - uppercut: 3 FP (unchanged)
  - block, xshield, kick and knee unchanged
- **jab-latency:** 13 labeled jabs, mean 46 ms, median 33 ms (same frames as before). All clips: 58 jabs, down from 62. The arbiter now calls 4 of them hooks: wide swings on `crowd_01`, `kick_02`, `ufc_02` and `ufc_05`.
- **Grab on the user's real reps: 0/4 → 3/4.** False grabs on the 37 clips stay 0 (`grapple-scan`).
  - The guard-return pull only counts after a simultaneous (≤ 0.12 s) two-arm reach in which both wrists rise ≥ 0.25 m. Without the rising-wrists condition, it fired 10 false grabs on shadowboxing one-twos.
  - Throw recall is unchanged: 0/4 on the user's reps, 4% on the seoi-nage clips.
- **Movement unit tests, all PASS:** `move-forward-back`, `side-step`, `punch-no-move`.
  - **move-forward-back:** the synthetic lean is now 25 cm. Real "lean toward the camera" reps changed size 26–39%; a 12 cm lean at 1.5 m (8%) is inside the dead zone by design.
  - **punch-no-move:** now counts displacement *caused* by the strike. Footwork already under way 0.4 s before a punch is not counted; the raw number is printed too (hook_01: 0.0 cm caused, 6.3 cm raw footwork).

- **e2e fixes, Sun Oct 25 5:50 AM:**
  - **Motion data export** failed 2 of 2 runs, a real bug. The Export button's handler was attached only after three stats requests, and a click within 0.1 s of the page showing did nothing.
    - The first fix moved only the fetch, and still failed: the repro (click as soon as the table appears) showed `onclick: false`.
    - The handler is now attached when the page shows, and the same repro downloads the file.
  - **Targeted e2e on `994fc39`:** 22/22 PASS. Covers drills, research, calibration, features (a voiced roast played live: "Bold strategy, hitting nothing.") and supers (blast path and a blocked blast).
  - **Energy blast** failed 2 of 2 runs, a stale test. A probe of 60 s on production: the scripted blocker was guard-broken 6 times and KO'd, and the one blast landed unguarded. The e2e now checks that the blast fires, travels and lands. Blocked-blast damage (10%) and guard drain (50) stay asserted in `tests/unit/guard-meter.ts`.
  - **Commentator mute:** the e2e now drives the volume panel (the sound button opens it since the audio work); PASS on production.

## Grab tuning loop, grapple-only strike rules (REVIEW.md 6:35 / 6:40 AM, Sun Oct 25 8:50 AM)

`GestureRecognizer.grappleEnabled` (default false; the app sets it from `?grapple=1` via `web/src/flags.ts` for local
modes, online forces it off). With it off nothing new runs: `eval-gestures`, `jab-latency`, `grapple-scan` (per-clip
detections) and `drill-replay --reps` on all three sessions are **byte-identical** to HEAD a3758c1 (diffed against a
`git archive` copy of HEAD run on the same data). Every tool takes `--grapple` to replay with it on. Scorer:
`tests/tools/grab-score.ts` (each grab rep = grab / strike-instead / nothing, plus "clean" = no strike in the rep window).

Tuning session **ea6e2541**; **2dd3adbd held out** (also scored once mid-loop; no parameter was chosen from it). Neither
is a truly fresh session: the 05:20 and 06:11 grab tuning used both. 4 grab reps each, too few for a % target.

| iteration | change (grapple on only) | ea6e2541 grab / strike-instead / nothing; clean | 2dd3adbd (held out) | side effects |
|---|---|---|---|---|
| 0 (HEAD) | - | 3/4 / 1 / 0; clean 1/4 | 4/4 / 0 / 0; clean 2/4 | - |
| 1 | drop a strike 0.6 s after a grab; drop a strike when both arms rose into a reach within 0.12 s and are still out (other elbow >= 105) | 3/4 / 1 / 0; clean 1/4 | 4/4; clean 3/4 | big hooks lost: 2dd3adbd hook_R 3/4 -> 1/4, hook_L 2/4 -> 1/4; ea6e2541 hook_L 4/4 -> 3/4 |
| 2 | the sync-reach rule only when the torso turned < 35 deg in the strike window (big hooks turn 70-120) | same | same | hook reps back to HEAD |
| 2b | 50 deg instead of 35 (to drop ea6e2541 grab 1's hook R, 43 deg turn) | same | - | ea6e2541 hook_L rep 14 lost: reverted |
| 3 | a dropped strike still counts as arm activity for movement | same | same | - |

Final per grab rep (grapple on): ea6e2541 r1 grab + jabR hookR before it (R arm alone, then a 43 deg turning lunge that
reads as a hook), r3 strike-instead (uppercutR jabL; strikes 4 -> 2; the user's grab came 3.3-3.5 s after the prompt,
after the window), r4 grab + jabL 1.5 s later (reach sync 0.20 s, outside 0.12), r8 clean. 2dd3adbd r1, r4, r7 clean
(r7's post-grab jabR gone), r6 grab + jabL 0.19 s into the rep (small two-arm lift, other elbow 99 < 105; its post-grab
jabR gone). Grab detected **ea6e2541 3/4 (75%)**, **2dd3adbd 4/4 (100%)**; strike instead 1/4 and 0/4; nothing 0/4
and 0/4. The >= 90% / <= 5% target is **not met on ea6e2541** (with 4 reps, 90% needs 4/4).

False grabs: 0 on the 37 clips and the 9 user clips, grappling off and on; drill negatives 1/117 (fda75d56 hook_R_big
r10, as at HEAD). `clips/landmarks/user_grab.json` (cut from 2dd3adbd's grab reps for the v3 video, added 07:59) holds
deliberate grabs; grapple-scan and `tests/unit/grapple-gestures.ts` now report it separately, not as a false trigger.
Grapple on vs HEAD: eval-gestures TP/FN unchanged for every move, jab FP 1 -> 0 (walkout_01); labeled jab latency
unchanged (n 13, mean 46 ms); 9 unlabeled jabs dropped (3 in user_grab); drill strike reps unchanged except
fda75d56 straight_big r14's wrong uppercutR hookR (still a miss) and a 0.11 strafe blip after it.

## Bugs found by these tests (reproduced first, fixed, re-run)

| Bug | Repro | Root cause | Fix | Regression test |
|---|---|---|---|---|
| "idk how to move forward and backward" (user's webcam test) | `npx tsx tests/unit/move-forward-back.ts`: lean in 12 cm → forward input 0.13, 0.09 m moved | The 1v1 duel assist overrode any forward/back input under 0.2 and walked you back to range as soon as you stopped | Lean input, rotation-corrected step, assist only after 1.5 s idle and never pushes you back | same test |
| KO'd fighter stayed standing, then T-posed (review round 3) | review-capture `ko` scene, frames 13–30 | The hit reaction played on the delayed contact frame after the sim's KO, replaced the death clip, then nothing had weight (bind pose) | KO waits for the contact; death clip can't be replaced; starts at the fall | review-capture `ko` |
| Bot strikes "connected" from 1.4 m (review round 3) | `DEBUG_CONTACT=1` review-capture: jab contact 1.16–1.39 m on a tumbling target | Tumble rotated the body around the feet, swinging the head 1 m+ from where strikes aimed | Tumble pivots at the hips; strikes on airborne targets aim at the chest | contact metric in review-capture |
| Camera inside the cage (review round 3) / top-down near the fence (round 4) | review-capture jab/walk/run/knockback frames | No collision with the octagon; then the fix lifted the camera | Clamp inside the walls and swing around the player instead of lifting | review-capture scenes |
| Brawl: players walked out of the ring by themselves (before the octagon) | `npx tsx tests/unit/brawl-edge.ts`: 4 self ring-outs in 20 s of noisy movement, no hits | Walking was not limited at the edge; only knockback should ring you out | Walking stops 0.25 m inside the edge | `tests/unit/brawl-edge.ts` (now 0) |
| Late joiner stuck in the lobby while a match runs | `npx tsx tests/unit/late-join.ts`: no `match_start` | Server only sent `match_start` at match start | Send it to people who join mid-match (spectators) | `tests/unit/late-join.ts`, brawl spec |
| Brawl: a disconnected fighter was not replaced by a bot | brawl spec timed out waiting for `bot=1` | `leave()` removed the client before looking up its slot | Pass the slot explicitly | brawl spec |
| Chosen color and name ignored in game | features spec: expected `#ffc53d`, got `#ff3d6e` | Game read `brawlcam.*` keys, Store/Forge wrote `throwhands.*` | One key set + migration | features spec (Forge, Store) |
| Energy blast hit instantly at duel range (no visible travel) | supers spec: 1 projectile position | Spawned 0.5 m out with a 0.55 m hit radius | Spawn at the hands, 6 m/s, 0.4 m radius | supers spec |
| Camera-denied test used the wrong failure | headless without permission gives `NotSupportedError`, not a denial | Test setup | `--use-fake-ui-for-media-stream=deny` (real `NotAllowedError`) | firstload spec |

| Safari/WebKit never started pose tracking | `tests/tools` WebKit probe: stage stuck at camera, then 0 grabs | (1) camera video was inside a `display:none` HUD, and WebKit does not load a stream into it; (2) MediaPipe needs WebGL in the worker, which WebKit lacks; (3) the main-thread wasm loader must be the classic build | Camera video moved out of the HUD; main-thread pose fallback with the classic loader; time-boxed camera start; time-based frame grab | browsers spec (WebKit) |
| No-WebGL browsers crashed at boot | Firefox headless: `Error creating WebGL context` page error, stuck on loading | Arena creation threw | Friendly message | browsers spec (Firefox) |
| Rivalry card requested by every client (429s, duplicate Meta calls) | WSO spec: `Failed to load resource: 429` | Each of 8 clients POSTed `/api/rivalry` after each match | Server generates once per match and broadcasts; in-flight dedupe | wso spec |
| Leaderboard stats stuck at 0 after a cleanup | `leaderboard_daily` had no rows for new events | Refreshing the daily aggregate with an open end moved the watermark past "now" | Recreated the aggregates; cleanup refreshes complete buckets only | manual check (`/api/leaderboard` shows KOs, fastest punch, dmg/min) |

## Known intermittent

- `local2p` "one player leaves" failed once inside an 18-minute full-suite run on a loaded machine (a 15 s wait), then passed 3/3 when repeated alone (`--repeat-each=3`). Not reproduced on demand yet; traces are kept on the next full run.
