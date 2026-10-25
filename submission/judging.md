# Throw Hands: judging guide

Booth setup: laptop on a table, webcam at chest height, 2 to 3 m of floor in front, bright light behind the camera (not behind the player). Open https://throwhands.tech, type the judge's name, press **Practice vs Bot**. Keep a phone logged into the same room for the online demo.

## 2-minute script

**0:00 to 0:40: live demo (judge plays).**
"Stand here, raise your fists to your chin." (Calibration ring fills in 3 seconds.) "That's you." The fighter copies their arms and head. "Throw a real jab." Glowing glove, screen shake, damage number. "Now both forearms up in front of your face: that's a block. Watch the meter: when it glows, cross your arms in an X above your head." Shield bubble. "Now drive your fist up from your hip." Super uppercut, slow-motion launch. "That's the whole controller: your body."

**0:40 to 1:00: human connection.**
"It's built for friends. Two of you can stand side by side on one camera, or I send you a link and you fight me from your phone." (Show the phone joining the room.) "After the match you get a rivalry card to send to the friend you beat, and the rematch is one button."

**1:00 to 1:25: Technology.**
"Pose tracking runs in your browser, in a web worker: no video leaves the device. We wrote our own retargeting from 3D landmarks to the avatar's bones, and a rule-based gesture engine. Jabs aimed at the camera barely change arm length, so we detect elbow-angle peaks instead: on our labeled jab clip that took recall to 100%, even at 15 frames per second. Online, one game simulation runs on our Vultr server and decides every hit from the defender's block state, so both screens agree tick for tick."

**1:25 to 1:40: Design.**
"Superhero suits in your colors, glowing gloves, an aura that charges with your meter, synthesized sound, and a Gemini commentator calling the fight out loud. Fighter Forge: type 'lava golem with a crown' and Meta's Muse models write and paint your fighter, and your suit takes the card's colors."

**1:40 to 1:52: Completion.**
"It's live at throwhands.tech: practice, two players on one camera, online rooms with spectators, an 8-fighter brawl, winner-stays-on, a leaderboard on Tiger Data. We test every user path end to end with real fighters' footage as the webcam: two pro fighters' clips play full online matches against each other, and both screens match on every tick."

**1:52 to 2:00: Learning.**
"Biggest lesson: monocular pose is great at angles and bad at depth, so build gestures on what the camera actually measures. And test at the frame rate players really get, not the one on your laptop."

## 60-second script

"Stand here, fists up." (3 s calibration.) "That's you: throw a jab." (Hit, shake.) "Forearms up blocks. Meter full? Cross your arms for a shield, or drive a fist up for a slow-motion super uppercut.

It's for friends: two of you on one camera, or a link to fight from your phone, with a rivalry card and a one-button rematch.

Under the hood: pose tracking in your browser, our own avatar retargeting and gesture engine tuned on labeled fight footage, and a server-side simulation on Vultr so online hits are fair. Meta's Muse models forge custom fighters, Gemini commentates live, and Tiger Data runs the leaderboard. It's live at throwhands.tech, and every user path is tested end to end."

## Likely questions

**What was hard?**
Punch detection that feels fair. A jab straight at the camera barely changes the arm's measured length, because one camera sees depth poorly. We switched to elbow-angle peaks and validated on labeled clips: on the clear jab clip, 6 of 6 jabs at 30, 15, and 10 fps, with no false positives. Blocks and the X shield needed measured geometry: pose tracking cannot separate tightly crossed wrists, so the X is recognized as "wrists together above the face, elbows raised and spread". Second: headless testing. Without a GPU the 3D scene starved pose detection, so we read camera frames straight from the camera track and decoupled pose rate from render rate.

**What is real and what is mocked?**
Real: pose tracking, gestures, the game, bots, online rooms on our Vultr server, Gemini commentary and speech, Muse Spark and Muse Image fighter generation, the rivalry card, the Elo leaderboard and stats in Tiger Data, and opt-in motion data storage. Mocked: purchases in the store (labeled "Demo: no charge"). The motion-data business is a consented collection pipeline and dashboard; no data has been sold.

**How does it make money?**
Three lines: cosmetics (skins, auras, and AI-forged fighters at $2 to $10, plus a $5/month season pass); ranked play with Elo, which drives retention and pass sales; and licensing opt-in, anonymized motion sequences (landmark coordinates labeled by the game, never video) to humanoid-robotics labs that need human motion data. Fitness Boxing has sold 3M+ copies on Switch, and no browser webcam fighter has real traction yet.

**How is this different from kinemo (PennApps 2025)?**
kinemo is webcam boxing. We added 3D superhero avatars that mirror your whole upper body, gesture-triggered super moves, online play across laptops and phones with a server-authoritative simulation, an 8-fighter brawl and winner-stays-on rooms, AI-generated fighters (Meta Muse), a live AI commentator (Gemini), and a business model.

**Why rules instead of a trained classifier?**
Rules work from the first frame with no training data, tune in minutes, and we can measure them: we score every change against labeled clips (precision and recall per move). A classifier is the next step once opted-in players provide labeled motion data, which is exactly the dataset our third revenue line creates.

**How do you handle latency online?**
Your own fighter's arms move locally with zero network delay; the server decides hits and broadcasts state 20 times a second. We test with 200 ms of added latency and with network drops (reconnect within 10 seconds resumes your fighter).

**Privacy?**
No video leaves the device. Online play sends joint positions and actions only. Motion-data sharing is off by default and needs an explicit checkbox; samples carry a random session ID, no name and no player ID.

**What's next?**
More fighters and arenas, ranked seasons, a phone-first layout, and training a gesture model on opted-in data.
