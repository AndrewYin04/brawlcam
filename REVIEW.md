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
