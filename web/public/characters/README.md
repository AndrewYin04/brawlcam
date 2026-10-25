# Characters

Human-proportioned fighters (about 1.8 m tall, 7.5 heads, arm span about equal to height) and their animations by
**Quaternius** (quaternius.com). License: **CC0 1.0 Universal** (public domain dedication),
https://creativecommons.org/publicdomain/zero/1.0/. Credit (optional under CC0): "Characters and animations by Quaternius, CC0".

| File | Source pack (free "Standard" version, downloaded 2026-10-25 from itch.io) | What it is |
|---|---|---|
| `th-male_light.glb`, `th-male_dark.glb` | Universal Base Characters: `Superhero_Male` (light and dark skin textures from the pack) | 65-bone humanoid rig, skinned body, eyes, eyebrows |
| `th-female_light.glb`, `th-female_dark.glb` | Universal Base Characters: `Superhero_Female` | same rig |
| `th-animations.glb` | Universal Animation Library 1 + 2: 28 clips (idle, walk, jog, sprint, jab, cross, hook, hit reactions, knockback, death, get-up, jumps, dance, spellcast, dizzy wobble, ...) on the same rig, no meshes | animations |

Processing (with glTF-Transform 4): base-color textures only (toon shading ignores normal/roughness maps), resized to
512 px WebP, unused vertex attributes removed, meshopt-compressed; UAL2 clips merged onto the UAL1 skeleton by bone name;
translation tracks kept only on `root`/`pelvis`. The game tints the light-grey cloth (shorts, sports top) in the fighter's color.

License proof: the `License*.txt` files from each downloaded zip are copied here unchanged
(`LICENSE-Quaternius-*.txt`): "License: CC0 1.0 Universal (CC0 1.0) Public Domain Dedication ... Models by @Quaternius".
Note: quaternius.com/license.html currently shows a newer "Quaternius Asset License" (dated 2026-08-28) that restricts
redistributing assets as assets; its section 7 says changes are not retroactive, and the copies used here were
downloaded with the CC0 text above.
