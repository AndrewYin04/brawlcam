# Decisions log

## 2026-10-24 5:40 PM CDT: idea scoring

Scores are 1 to 5. Columns:

- **Com**: commercial potential.
- **EV**: expected prize value.
- **Wow**: a visible reaction in a 20-second demo.
- **Build**: buildable by about 11:00 AM Sunday.
- **Judge**: fit with the four judging criteria (Technology, Design, Completion, Learning).
- **Nov**: novelty against existing products.

Total is the unweighted sum. Commercial potential and expected prize value were the tie-breakers, following the user's stated priorities.

Evidence behind the scores comes from four research reports run at 5:25 PM. Key facts:

- **HackTX 2025 Best Overall** was AstroDoodle.party: a 2-player game played with webcam-tracked physical wands (devpost.com/software/rocket-racer-l1hmn6).
- **PennApps XXVI 1st Overall** was kinemo, a webcam MediaPipe boxing party console (devpost.com/software/kinemo). This is direct prior art for idea 1.
- **8 of 12 sampled grand-prize winners** had a physical object or sensor in the demo.
- **Motion-fitness market:** no browser webcam game has meaningful traction. Fitness Boxing on Switch has sold 3M+ units. FitXR earns about $16M a year and has been flat.
- **Car-loan finance:** 29.6% of Q2 2026 new-car trade-ins carried negative equity (Edmunds).
- **Meta Model API (Muse Spark, Muse Image):** self-serve keys for US developers since 2026-07-09. The Llama API shut down on 2026-07-06.
- **Nessie:** live over HTTPS only. Its documentation path is broken.
- **Kalshi:** 18+, KYC required; a demo trading environment exists. New York's attorney general sued Kalshi in July 2026.

| # | Idea | Non-MLH tracks it fits | Com | EV | Wow | Build | Judge | Nov | Total |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Webcam-controlled 3D superhuman fighting game, online 1v1 on desktop and phone, ESP32 haptic wristbands; anonymized motion data as a second revenue line | Entertaining, Hardware, Meta | 4 | 5 | 5 | 3 | 5 | 3 | 25 |
| 2 | Same game without hardware | Entertaining, Meta | 4 | 4 | 5 | 4 | 4 | 3 | 24 |
| 3 | "Next Move" car-equity copilot: loan balance vs. market value (SerpApi listings), trade-in/prepay advice, Nessie accounts | Toyota, Capital One, SerpApi | 4 | 3 | 2 | 4 | 3 | 3 | 19 |
| 4 | PolicyArena: crowd Elo for robot-policy videos | none | 4 | 1 | 2 | 4 | 3 | 3 | 17 |
| 5 | FailureLens: cluster robot failures, suggest data to collect | none | 4 | 1 | 2 | 3 | 3 | 4 | 17 |
| 6 | Pose teleop of a servo robot arm, logging demonstrations as robot training data | Hardware | 4 | 3 | 4 | 2 | 4 | 3 | 20 |
| 7 | Two physical servo robots boxing, each driven by a player's body | Hardware, Entertaining | 2 | 4 | 5 | 1 | 4 | 4 | 20 |
| 8 | Kalshi whale and insider-pattern alerts | none | 3 | 1 | 2 | 4 | 2 | 2 | 14 |
| 9 | Kalshi combo market-making backtester | none | 3 | 1 | 1 | 3 | 3 | 3 | 14 |
| 10 | Kalshi C++ low-latency engine | none | 2 | 1 | 1 | 3 | 3 | 2 | 12 |
| 11 | GPU inference engine with live benchmark | Hardware (weak) | 3 | 2 | 2 | 2 | 4 | 2 | 15 |
| 12 | AgentPack: portable agent config plus eval CI | NMC2 | 4 | 2 | 1 | 4 | 3 | 3 | 17 |
| 13 | Agent Relay: shared, watchable, hand-off-able agent sessions | NMC2 | 4 | 2 | 2 | 3 | 3 | 3 | 17 |
| 14 | Agent CI: replay traces on prompt changes | NMC2 | 4 | 2 | 1 | 4 | 3 | 2 | 16 |
| 15 | Lease-end copilot with photo-based wear estimate | Toyota | 3 | 2 | 3 | 3 | 3 | 3 | 17 |
| 16 | Total-cost-of-ownership planner | Toyota, SerpApi | 3 | 2 | 1 | 4 | 2 | 2 | 14 |
| 17 | Friends savings-challenge game on Nessie | Capital One, Meta | 2 | 2 | 2 | 4 | 3 | 2 | 15 |
| 18 | Group-chat plan synthesizer (Meta's own example) | Meta | 3 | 2 | 2 | 4 | 3 | 1 | 15 |
| 19 | Family story weaver from scattered updates | Meta | 2 | 2 | 3 | 4 | 3 | 2 | 16 |
| 20 | AI charades party game | Meta, Entertaining | 2 | 3 | 4 | 4 | 3 | 1 | 17 |
| 21 | Webcam physical-therapy rep counter with clinician report | none | 4 | 1 | 3 | 4 | 3 | 2 | 17 |
| 22 | Webcam sign-language tutor | Meta | 3 | 2 | 3 | 3 | 3 | 2 | 16 |
| 23 | Voice reading tutor for kids (YC Primer) | none | 4 | 1 | 2 | 3 | 3 | 2 | 15 |
| 24 | Aging-parent voice check-ins with family dashboard (YC Aging) | Meta | 4 | 2 | 2 | 4 | 3 | 2 | 17 |
| 25 | AI-generated choreography webcam rhythm game | Entertaining | 3 | 3 | 4 | 3 | 4 | 2 | 19 |
| 26 | Voice-plus-gesture wizard duel | Entertaining | 3 | 3 | 4 | 3 | 4 | 3 | 20 |
| 27 | Webcam computer control for mobility-impaired users | none | 3 | 2 | 3 | 3 | 3 | 2 | 16 |
| 28 | Live sports-watch party with AI commentary and friend predictions | Meta | 3 | 2 | 2 | 3 | 3 | 2 | 15 |
| 29 | Shopping price agent | SerpApi | 2 | 2 | 1 | 4 | 2 | 1 | 12 |
| 30 | Smart-cane-style assistive hardware with obstacle sensing | Hardware | 3 | 3 | 3 | 2 | 4 | 2 | 17 |
| 31 | IoT medication bottle with dashboard | Hardware | 3 | 2 | 2 | 3 | 3 | 1 | 14 |
| 32 | Webcam motion-capture marketplace (pay users for labeled motion clips) | none | 4 | 1 | 2 | 3 | 3 | 4 | 17 |

### Top 3

1. **Idea 1, the fighting game with hardware wristbands** (chosen).
   - **Prize EV:** it fits the three highest-value tracks open to it at once:
     - Best Overall, entered automatically: a MacBook Pro per member.
     - Most Entertaining: a PS5 per member.
     - Best Hardware: an RTX 5080 per member.
     - Meta takes the third non-MLH slot (online 1v1 with remote friends, AI-made fighter skins).
     - Best Pitch does not count toward the 3-track limit.
   - **Precedent:** HackTX's own 2025 overall winner was a webcam-tracked physical party game.
   - **Prior art:** kinemo already won with webcam boxing. Differentiation comes from 3D avatars with superhero moves, online play across devices, haptic wristbands, and the business layer.
   - **Commercial case:** cosmetic skins (sold through AI skin generation), ranked play, and a second revenue line selling consented, anonymized 3D strike-and-block motion sequences to humanoid-robotics labs. The robotics labs are the user's evals/data idea, folded in.
2. **Idea 3, the car-equity copilot.**
   - **Prize odds:** high P(win) in three less crowded sponsor tracks.
   - **Commercial case:** a credible B2B sale to lenders.
   - **Weakness:** the 20-second demo is weak, and its prizes are worth far less than a MacBook or 5080.
3. **Idea 6, pose teleop of a robot arm logging training data.**
   - **Strength:** the strongest commercial and robotics story.
   - **Risk:** it depends on what arm hardware the MLH lab has, which is unknown, and a moving arm is risky to demo live.

**Fallback if the user cannot get hardware:** idea 2. Swap the Hardware track for Best Pitch effort, and keep Most Entertaining and Meta.
