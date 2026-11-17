# Building a Kotoba Town scene

A scene is the 3D place a conversation happens in. Each one lives in `js/world/scenes/<id>.js`;
the reference implementation is `js/world/scenes/office.js` — read it first.

## Contract

```js
import * as THREE from 'three';
import * as K from '../kit.js';
export const meta = { indoor: true, ambience: 'office' };   // ambience: office|classroom|apartment|depato|museum|station|cafe|park|home|konbini
export default function build({ setup }) {                 // setup = { time, season, weather } from the variant
  …
  return K.finalize({
    group,                 // THREE.Group with everything static (+ dynamic bits flagged userData.dynamic = true)
    spawn: K.spot(0, 0, 0),// the learner: feet at the origin, looking toward -z. Keep it that way.
    slots: { npc1: K.spot(x, z, yaw), …, phone: null },   // every slot of the catalog; yaw from K.faceYaw(pos, {x:0,z:0})
    props,                 // { propId: Object3D } for EVERY prop id of the catalog (K.prop(id, obj, {labelJa, labelEn}))
    center, radius,        // shadow-camera centre and half-size (metres)
    update(dt, t) {},      // optional animation (trains, leaves, steam) — only touch objects flagged dynamic
  });
}
```

- A slot may add `sit: <seat height m>` (e.g. `{ ...K.spot(0, -1.1, 0), sit: 0.45 }`) when the person
  sits on a chair/bench you placed there.
- `K.finalize` turns props into anchors and merges static meshes per material. Anything that moves
  must sit under an object with `userData.dynamic = true` (it is then left unmerged).
- People are added by the engine at the slots — don't model people. Leave ~0.5 m free around slots.

## Zones (they carry grammar: これ／それ／あれ, ここ／そこ／あそこ)

Seen from the learner at the origin facing -z:
- `near` — within arm's reach (≤ 1 m), so the learner can say これ／ここ.
- `npc` — right next to the NPC who talks (≈ 1.2–2.5 m away, beside/behind that NPC), so それ／そこ.
- `far` — clearly away from both (≥ 3.5 m), so あれ／あそこ.
NPC slots for the main conversation partner are ~1.2–1.5 m in front of the learner.

## Look & feel

- **Real Japanese places, warm and immersive.** Japanese signage in kana/kanji with `K.sign`, real
  proportions (doors 2.0 m, counters 1.0 m, tables 0.72 m, ceilings 2.6–3.0 m), lots of small
  believable details (posters, price tags, plants, umbrellas, bins, outlets, vending machines …).
- The UI is Animal-Crossing-friendly; the world is soft and cosy: warm lights, gentle colours,
  rounded shapes (`K.rbox`), no harsh pure black/white.
- Outdoors/indoors must react to `setup.time` (morning/noon/evening/night: lit windows, lamps on at
  night), `season` (sakura in spring, green in summer, red/yellow leaves in autumn, bare trees and
  coats-weather props in winter) and `weather` (wet ground sheen / umbrellas when it rains) where it
  makes sense. The engine already does sky, sun, fog and falling rain (js/world/environment.js).
- Windows: `K.windowPane(w, h, kind, time)` paints an outside view.
- Use `K.shelf` (instanced products), `K.table`, `K.chair`, `K.plant`, `K.door`, `K.clock`,
  `K.sign`, `K.woodTex`, `K.tileTex`, `K.noiseTex`, `K.carpetTex`, `K.tatamiTex`, `K.mat`.

## Budget (Meta Quest 2 renders this twice per frame)

- ≤ 120 k triangles and ≤ 120 draw calls for the scene after `finalize` (the preview prints both).
- Canvas textures ≤ 1024 px; no external downloads (no models, images or fonts from the network).
- Subdivide big ground planes (e.g. `PlaneGeometry(w, d, 8, 8)`, `RingGeometry(0.01, r, 48, 12)`): single huge
  triangles (tens of metres) that pass under the camera break depth testing on some GPUs.

## Checking your work

```bash
cd kotoba-town
node tools/shot.mjs /tmp/…/shots "scene=cafe&view=spawn&time=noon" "scene=cafe&view=overview&labels=1" \
  "scene=cafe&view=left" "scene=cafe&view=right" "scene=cafe&view=back" "scene=cafe&view=spawn&time=night&weather=rain"
```

Open the PNGs (Read tool) and iterate until the place looks convincing from the learner's spot in every
direction, labels show every prop in the right zone, and the preview line shows the budget is met.
`&cast=aoki,fujita` chooses who stands at the slots; `&labels=1` tags slots and props.
