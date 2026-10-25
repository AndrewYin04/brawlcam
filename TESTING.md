# Testing

All end-to-end tests run against the deployed HTTPS server through the real UI, with real people's movement from downloaded video clips fed in as the webcam (spec section 9). Clips are local only (`clips/`, gitignored); see `clips/manifest.md` on the test server.

```
BASE_URL=https://throwhands.tech npx playwright test          # full suite
BASE_URL=https://144-202-71-213.sslip.io npx playwright test practice online   # subsets
```

**GPU (since 11:05 PM):** the test server has an NVIDIA GTX 1650 Ti, and Chromium gets hardware WebGL with `--use-angle=gl-egl` (verified with `WEBGL_debug_renderer_info`: "ANGLE (NVIDIA Corporation, NVIDIA GeForce GTX 1650 Ti/PCIe/SSE2, OpenGL ES 3.2)"). Tests now run the production configuration: real VRM fighters and the MediaPipe GPU delegate (practice: 26 pose fps, 61 render fps, 16.6 ms inference). Runs before 11:05 PM used the CPU-only setup (`PW_GL=swiftshader`): `?cpu` (MediaPipe CPU delegate) and `?lowgfx` (capsule stand-ins drawn from the same joints, because the VRM rendered at ~7 fps on SwiftShader and starved pose detection). `?nocomment` and `?aifixture` keep automated runs off live Gemini/Meta (recorded responses; spec 10 budget). Test-only knobs: `?skipcal`, `?botlevel=-1..3` (-1 = passive dummy, 3 = aggressive), `?roundsecs=N`, `?meter=N`.

## Gesture accuracy (spec 9.1 ground truth)

Labeled clips: `clips/groundtruth.json` (timestamps read from 10 fps frame sheets). Landmarks come from the real Pose Landmarker (lite, CPU) run frame by frame over each clip in headless Chromium (`tests/tools/dump-landmarks.ts`); `tests/tools/eval-gestures.ts` replays them through the shipped recognizer (`shared/gestures.ts`) and matches events within ±300 ms. Precision counts only clips whose labels are exhaustive (`tests/gesture-eval.json`); recall uses every confident label. Re-run after every threshold change:

```
npx tsx tests/tools/eval-gestures.ts            # 30 fps
STRIDE=2 npx tsx tests/tools/eval-gestures.ts   # 15 fps (typical phone / headless rate)
```

Last run: Sat Oct 24, 9:22 PM CDT.

| Move | 30 fps precision | 30 fps recall | 15 fps precision | 15 fps recall | Target (85% R / 90% P) |
|---|---|---|---|---|---|
| Jab | 86% (6/7) | 43% (6/14) | 63% (5/8) | 36% (5/14) | Not met overall. On the clear front-facing jab clip (`jab_01`): 6/6 recall, 0 false positives at 30, 15, and 10 fps. Misses are in pro shadowboxing clips (`shadow_fighterF` throws sideways, so jabs read as hooks; `shadow_fighterG`). |
| Hook | 100% (1/1) | 33% (1/3) | 100% | 33% | Not met (3 labels only) |
| Uppercut | 0/2 | no confident labels | | | Ground truth for uppercut is all marked uncertain by the labeler |
| Block | 50% (3/6) | 75% (3/4) | 50% | 75% | Not met |
| X shield | 100% (4/4) | 80% (4/5) | 100% | 80% | Precision met; recall 80% |
| Palm push | no confident labels | | | | Both palm-push clips are labeled uncertain |
| Kick | 63% (5/8) | 83% (5/6) | 63% | 83% | Not met |
| Knee | 100% (2/2) | 100% (2/2) | 100% | 100% | Met |

What changed to get here (each verified on these clips before and after):
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
| Online 1v1 | Fighter A vs fighter B full best-of-3 (create room, join by link) | PASS | Oct 24 9:10 PM | `npx playwright test online` | `{"samples":1715,"mismatches":0,"p95ArrivalSkewMs":49,"aHits":30,"bHits":30,"bActions":48,"winner":2,"elo_delta":{"1":-16,"2":16}}`: same tick => identical HP/round/timer on both; both agree on the winner; Elo written to Tiger Data |
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
| Brawl | 8 browsers, 8 different fighter clips, full 2-minute round | PASS (sync) / skew noted | Oct 24 10:10 PM | `npx playwright test tests/e2e/brawl.spec.ts` | `BRAWL8 {"samples":397,"mismatches":0,"turns":[0,18,1,14,0,12,0,10],"tgChanges":[2,18,2,12,0,12,0,10],"kos":2,"ringouts":2,"respawns":2}`: same tick => identical positions, HP, knockback, KOs on all 8; shoulder turns switch target lock; final KO counts identical. Arrival skew p95 195 ms here because 8 browsers saturate this 8-core server (2-browser test: 49 ms). Pose ran at 1-4 fps per browser, so few human KOs. |
| Brawl | 1 human + 7 bots; 3 humans + 5 bots; fighter disconnects (replaced by a bot); spectator joins mid-round | PASS | Oct 24 10:13 PM | same, `-g "1 human"` | `BRAWL_BOTS {"kos":2,"kofeed":2}`: ring-outs, respawns, and KO feed lines; disconnected fighter turns into a bot; late joiner enters as spectator |
| Brawl | 8-fighter round on a phone-sized viewport (record FPS) | RECORDED | Oct 24 10:10 PM | same | 844x390 mobile viewport on this CPU-only server (SwiftShader): VRM fighters 2-3 fps, capsules 48-60 fps. Not representative of a phone GPU; real-phone FPS: planner check pending |
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

## Bugs found by these tests (reproduced first, fixed, re-run)

| Bug | Repro | Root cause | Fix | Regression test |
|---|---|---|---|---|
| Brawl: players walked out of the ring by themselves | `npx tsx tests/unit/brawl-edge.ts`: 4 self ring-outs in 20 s of noisy movement, no hits | Walking was not limited at the edge; only knockback should ring you out | Walking stops 0.25 m inside the edge | `tests/unit/brawl-edge.ts` (now 0) |
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
