# Demo video music bed

| | |
|---|---|
| File | `video/v2/music/bed.mp3` (beat map: `video/v2/music/beats.json`) |
| Title | **Let the Games Begin** |
| Artist | **section31** (Section 31; OpenGameArt user `section31`) |
| Primary source page | https://opengameart.org/content/let-the-games-begin-0 |
| Download URL (original) | https://opengameart.org/sites/default/files/S31-Let%20the%20Games%20Begin.ogg |
| License | **CC0 1.0 Universal (Public Domain Dedication)**, https://creativecommons.org/publicdomain/zero/1.0/ |
| Attribution required | **No** |
| Redistribution in a public git repo | **Allowed.** CC0 waives all copyright, so the file can be committed to the repo. No `.gitignore` entry needed. |
| Genre / feel | Electronic / techno beat (page tags: futuristic, electronic, beats, drum, Techno) |
| Tempo | **130.0 BPM** (steady, no drift), first beat at **0.428 s** |
| Duration | **162.462 s (2:42.46)** = exactly 352 beats / 88 bars, so it loops cleanly |
| File size | 3,900,987 bytes (3.7 MiB), MP3 192 kbps CBR, 44.1 kHz stereo |
| sha256 (bed.mp3) | `4ee4617c63666fef3e7dae0540775f09a510e5beea9463a51912999f8d4879b8` |
| sha256 (original .ogg) | `b0335fd0c4541b45b8867ed1b4e002936827da5aa88edb211ff60c66b877a34a` |

## License evidence (primary source, fetched 2026-10-25)

From the OpenGameArt page itself (https://opengameart.org/content/let-the-games-begin-0):

- License field: `License(s): CC0`. The badge links to `http://creativecommons.org/publicdomain/zero/1.0/`.
- Copyright/Attribution Notice field: *"No copyright necessary, do whatever you want with it."*
- Author's description: *"Just starting to mess around with making music, forgive my lack of skill. Free to use for anybody who might find it useful. This is for my game, Star Shift Alpha."*
- The page lists it in the collections "CC0 Music" and "Truly Truly Public Domain".

The CC0 deed in summary: the author waives all copyright and related rights, and anyone may copy, modify, distribute and perform the work, including commercially, without asking permission. CC0 does not cover trademark or patent rights, and it does not mean the author endorses your use.

## README credit (courtesy only; not required)

```
Music: "Let the Games Begin" by section31 (https://opengameart.org/content/let-the-games-begin-0), CC0 1.0 / public domain.
```

## Beat map (`music/beats.json`)

- `bpm` 130.0, `offset` 0.428 s, `beat_period` 0.461538 s. Every beat is `beat[i] = 0.428 + i * 60/130`: 351 beats, with `downbeats` every 4th beat starting at 1.813 s (87 bars).
- **How it was measured:** ffmpeg decoded the audio to mono 22.05 kHz PCM. A numpy script built a spectral-flux onset envelope (STFT 1024 / hop 256) and ran autocorrelation tempo estimation on 15 overlapping 20 s windows. Every window gave 130.0 BPM. The half-time value of 65 also scores high, but the beat level is 130. Next, a fixed-tempo grid fit searched bpm ±0.6 in 0.005 steps and phase in 2 ms steps, and returned bpm = 130.000 and phase = 0.428 s. Re-fitting the phase in each 20 s window moved it by at most 2 ms anywhere in the track, so there is no drift. The fit was run on the original .ogg and on the transcoded bed.mp3, and both gave identical results.
- **Downbeats (a best guess, but well supported):** the bar phase was picked from the low-band (<150 Hz, kick) onset strength. All four energy changes in the track land exactly on that phase (beats 47, 63, 223, 287). Two checks for the editor: (1) all-band onsets are actually strongest one beat later, on beat index 0 mod 4. (2) The first downbeat is at 1.813 s, so 0.428–1.813 s plays as a 3-beat pickup.
- **Timing caveat:** the offset comes from the onset envelope (11.6 ms frames, interpolated), so it is accurate to about ±10 ms. Some decoders add MP3 encoder delay (about 25 ms) if they ignore the LAME gapless header. If cuts feel slightly early, check against the .ogg or nudge by about 25 ms.

### Sections (from beat-level RMS energy)

| start (s) | label | notes |
|---|---|---|
| 0.000 | intro | Full beat from the first sample (no quiet intro). Slightly lighter for the first 15 beats. |
| 7.351 | groove | Main groove kicks in. |
| 22.120 | build | Loudest 4-bar lift (RMS about 0.55 vs 0.38). |
| 29.505 | main | Steady main loop. |
| 103.351 | breakdown | Energy drops about 50% (RMS 0.38 → 0.19) for 16 bars, about 29.5 s. Good spot for a voice-over or a calmer feature explanation. |
| 132.890 | drop | Full beat returns and runs to the end. |
| 162.462 | end | Hard stop at the end of the file. The track is exactly 88 bars, so it can loop. |

For a 2:00–2:45 cut: the full track fits as is. The track is high energy from 0 s, so there is no lead-in to skip. To trim, cut on a downbeat and land the ending on a downbeat followed by a short fade.

## Backup candidates (not downloaded into the repo)

1. **"Hunter-class Lifeform"** by vitalezzz: https://opengameart.org/content/hunter-class-lifeform. License **CC0** per the page. The page's attribution notice reads *"Vitalezzz - Hunter-class Lifeform"*; it is a requested credit, not a legal requirement under CC0. About **129 BPM** (my measurement, consistent across windows), 2:28.9, electronic/sci-fi action, tagged "loop" ("can be looped").
2. **"Winning the Race"** by section31: https://opengameart.org/content/winning-the-race. License **CC0**, notice *"No copyright necessary, do whatever you want with it."* Electronic, 2:19.0 (shorter than 2:30, so it would need a loop). Tempo is **ambiguous**: windows split between about 145 and about 96.6 BPM (a 3:2 relationship). Probably 145, but this has not been confirmed.

(Rejected: "Night Prowler" by section31 is CC0 and 2:32 long, but measured at 110 BPM, below the 120 BPM floor.)

## Sourcing notes

- FreePD.com is gone. Its homepage now reads *"FreePD.com - Site Closed … we have officially taken the service offline … [freepd.com] is now permanently closed. 2008-2025"*, so it was not used.
- The downloaded files were handled as untrusted data in an isolated download directory and re-encoded with ffmpeg (metadata stripped, then title/artist/source re-tagged) into `bed.mp3`.
