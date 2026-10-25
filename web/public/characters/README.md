# Characters

All files come from **KayKit: Character Pack: Adventurers 1.0** by **Kay Lousberg** (www.kaylousberg.com).

- Source (primary, GitHub): https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0
  (files under `addons/kaykit_character_pack_adventures/Characters/gltf/*.glb`, fetched 2026-10-25)
- Store page: https://kaylousberg.itch.io/kaykit-adventurers
- License: **CC0 1.0 Universal** (public domain dedication), https://creativecommons.org/publicdomain/zero/1.0/
  - Checked in the repo's `LICENSE.txt`: "License: (Creative Commons Zero, CC0) ... This content is free to use in
    personal, educational and commercial projects." Crediting the author is optional.
  - The itch.io page says the same: "Creative Commons Zero v1.0 Universal" / "no attribution required".
- Optional credit: "Characters by Kay Lousberg (KayKit), CC0".

## Files

| File | What it contains |
|---|---|
| `kaykit-knight.glb` | Knight: skinned mesh plus the 41-joint `Rig` skeleton, a 1024² atlas texture (PNG, embedded), and rigid props attached to bones (helmet, cape, swords, shields). No animations. From `Knight.glb`. |
| `kaykit-barbarian.glb` | Barbarian: same skeleton. Props: bear hat, cape, axes, round shield, mug. No animations. From `Barbarian.glb`. |
| `kaykit-mage.glb` | Mage: same skeleton. Props: wide hat, cape, wand, staff, spellbooks. No animations. From `Mage.glb`. |
| `kaykit-rogue.glb` | Rogue: same skeleton. Props: cape, knives, crossbows, throwable. No animations. From `Rogue.glb`. |
| `kaykit-rogue-hooded.glb` | Hooded Rogue: same as Rogue, with a hooded head mesh. From `Rogue_Hooded.glb`. |
| `kaykit-animations.glb` | Shared animation library: the `Rig` node hierarchy (41 joints, no mesh or skin) with all 76 clips. Taken from `Knight.glb` and resampled with gltf-transform (tolerance 1e-4); clip names and durations are unchanged. |

Changes from upstream: I took the animations out of the character files (each upstream file embeds the same 76 clips,
about 3.6 MB per file) and saved them once in `kaykit-animations.glb`. The upstream files have identical joint names,
hierarchy and bind pose, so any clip plays on any character with a `THREE.AnimationMixer`.

Notes for three.js:
- GLTFLoader removes `.` from node names, so `upperarm.l` becomes `upperarml`, `foot.r` becomes `footr`, and so on.
  Clip tracks are renamed the same way, so they still bind.
- Props such as `1H_Sword`, `Round_Shield`, `2H_Axe`, `Mug`, `Spellbook`, `1H_Crossbow` and `Knife` are always visible.
  Hide the ones you don't want by setting `visible = false`.
- The model faces +Z and stands on y = 0. The bind pose is a T-pose. Units are meters. The characters are chibi-proportioned,
  about 2.2–2.3 m tall in the bind pose, so scale to fit.
