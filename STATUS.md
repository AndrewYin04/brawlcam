# Status (written by the implementation agent)

Last update: Sat Oct 24, 8:52 PM CDT. Game renamed to Throw Hands (repo, UI title and logo).

## Deployed URL
- **Vultr server IP for DNS: `144.202.71.213`** (IPv6 `2001:19f0:6400:2445:5400:06ff:fef0:b3b0`). Please add A records for `throwhands.tech` and `www.throwhands.tech` pointing at it (and AAAA if you like). Caddy is already configured for both names and will get a Let's Encrypt certificate as soon as DNS resolves.
- Live now: https://144-202-71-213.sslip.io (same server, temporary hostname). Playable practice mode vs bot: https://144-202-71-213.sslip.io/?mode=practice
- Pose check page (risk spike 1): https://144-202-71-213.sslip.io/spike.html (add `?cpu` to force the CPU delegate, `?poses=2` for two people)
- Health: https://144-202-71-213.sslip.io/api/health

## Vultr (cost limits, spec section 10)
- Exactly one instance: id `7b48fd52-b976-484c-adbe-95ab42f98a5d`, plan `vc2-1c-1gb` ($5.00/month, 1 vCPU, 1 GB), region `dfw` (Dallas), Ubuntu 24.04, IP 144.202.71.213.
- Why not cheaper: `vc2-1c-0.5gb-free` is only in sea/fra/mia, `vc2-1c-0.5gb-v6` ($2.50) is IPv6-only (many phones/Wi-Fi are IPv4-only), `vc2-1c-0.5gb` ($3.50) is only in ewr (New Jersey). Dallas is about 5 ms from Austin, which matters for a real-time fighting relay.
- Nothing else created on Vultr.

## What works (with evidence)
- HTTPS deploy: `curl -sS https://144-202-71-213.sslip.io/api/health` returned `{"ok":true,"startedAt":"2026-10-25T01:22:05.988Z"}`.
- Risk spike 2 (headless testing on the server), partly proven:
  - `SPIKE_QS='?cpu' npx playwright test spike` passed: `SPIKE {"status":"tracking","delegate":"CPU","fps":24,"people":0,"landmarks":0,"renderFps":61,"frames":209}` and the WebGL canvas was not blank (9 distinct colors sampled).
  - The GPU delegate also loads under SwiftShader, but runs at only 3 pose fps / 7 render fps headless, so automated tests use the CPU delegate (allowed by spec section 5).
  - Not yet proven: 33 landmarks from a real clip. Clips are being downloaded now.

- Practice vs bot is playable on the deployed URL (8:45 PM headless check with the jab clip as the fake camera): VRM fighters in a ring, the clip's pose drives the player's fighter, the bot attacks, hits land, HUD updates. Gesture tuning against labeled clips is in progress (jab: 4/5 recall, 0 false positives on two clips so far).

## Known bugs
- Headless (SwiftShader, CPU-only) runs get only 5-7 pose fps while the 3D scene renders, versus 16 fps on the bare pose page. Real GPUs are not affected. Working on test settings (`?lowgfx&renderfps=6`) so automated gesture tests get enough pose frames.
- MediaPipe writes `INFO: Created TensorFlow Lite XNNPACK delegate for CPU.` through console.error. It is harmless; tests whitelist exactly that line.
- WebKit on this server is missing system libraries (libevent-2.1-7t64, libavif16, libmanette-0.2-0) and the agent has no sudo. Working around it by extracting the .deb files locally.

## Cuts made
None.

## Requests for planner
1. **Blocking: GitHub write access.** The server's `gh` login is `andrewyin-builds`, which has read-only access to `AndrewYin04/throwhands` (`git push origin HEAD:main` at 8:49 PM: `remote: Permission to AndrewYin04/throwhands.git denied to andrewyin-builds.` / 403; `gh api repos/AndrewYin04/throwhands --jq .permissions` shows `push:false`). Please add `andrewyin-builds` as a collaborator with Write access (repo Settings > Collaborators), or tell me which account to push as. Until then all commits stay local on the server.
2. **Risk spike 1 (phone and laptop FPS).** Open https://144-202-71-213.sslip.io/spike.html on the user's laptop (Chrome) and phone (iOS Safari and/or Android Chrome), allow the camera, stand back so the upper body is visible, and report in `REVIEW.md`: delegate, pose fps, render fps, and whether the skeleton tracks. Also try `?cpu` on the phone. If iOS crashes with the GPU delegate (WebKit bug 321693), say so.
3. **DNS for throwhands.tech:** A records for `throwhands.tech` and `www.throwhands.tech` -> `144.202.71.213`. Caddy is ready for both.

## Requests for user
None yet. (Same as planner request 1 if the planner cannot change repo collaborators.)
