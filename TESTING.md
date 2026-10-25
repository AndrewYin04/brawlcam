# Testing

All end-to-end tests run against the deployed HTTPS server through the real UI, with real people's movement from downloaded video clips fed in as the webcam (spec section 9). Clips are local only (`clips/`, gitignored); see `clips/manifest.md` on the test server.

```
BASE_URL=https://throwhands.tech npx playwright test          # full suite
BASE_URL=https://144-202-71-213.sslip.io npx playwright test practice online   # subsets
```

Test settings used on this CPU-only server (no GPU, SwiftShader WebGL): `?cpu` (MediaPipe CPU delegate, allowed by spec section 5), `?lowgfx` (capsule stand-ins drawn from the same joints instead of the VRM model: the VRM costs ~120 ms per frame on SwiftShader and starved pose detection to 4-5 fps; with capsules pose runs at 10-16 fps), `?nocomment` (no live Gemini calls; commentary has its own tests with recorded responses). The VRM visuals are checked separately with screenshots. Test-only knobs: `?skipcal`, `?botlevel=-1..3` (-1 = passive dummy, 3 = aggressive), `?roundsecs=N`, `?meter=N`.

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
| Online 1v1 | Invalid code | PASS (protocol) | Oct 24 9:03 PM | `npx tsx tests/tools/ws-smoke.ts` | `invalid code -> room_not_found` (UI test pending) |

Paths not yet run are listed in `STATUS.md` until they have a row here.
