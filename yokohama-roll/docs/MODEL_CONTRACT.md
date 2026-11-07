# Model module contract (read this first)

Game: **ハマころ！** — an ORIGINAL three.js game where you roll a sticky ball around Yokohama
(Minato Mirai → Red Brick → Yamashita Park → Chinatown), picking up everything smaller than the
ball and growing, until the ball is big enough to roll up the city and finally the whole world.
It uses the "roll things up and grow" mechanic but is NOT a copy of any existing game: do not use
names, characters, art style, music or text from other games (no princes, kings, "katamari" words).

Project root: `/home/user/lab/yokohama-roll`. Plain ES modules, no build step, `three@0.170.0`.

## How to model
Import helpers only from `../geo.js` (read it — it is short):
`box, cyl, cone, sphere, torus, ico, dodeca, capsule, plane, lathe, extrude, beam, group, repeat, merge, shade, mix, rng`.
Every primitive is centred on the origin like THREE's, positioned with `opts {x,y,z,rx,ry,rz,sx,sy,sz,s,glow}`.
`glow: 0..1` makes the part light up at night (windows, lanterns, neon, lamps, screens). Use it generously on
windows/lights — the game turns to dusk/night as the ball grows and the lit city is a highlight.

Finished model conventions:
- Units are **metres** (Yokohama modules) — real-world sizes matter, the game compares item size to ball size.
- Base sits on y = 0, centred on x/z, **front faces +Z** (cars drive toward +Z, people walk toward +Z).
- Low-poly, toy-like, cheerful saturated colours (flat-shaded). Recognisable silhouettes beat detail.
- Triangle budget: tiny items ≤ 300 tris, people/vehicles ≤ 600, buildings ≤ 3000, signature landmarks ≤ 8000.
- Never call `new THREE.Mesh` etc. — the module returns geometry only. Deterministic: use `rng(seed)` not Math.random.

## Module shape
```js
import { box, cyl, merge /* … */ } from '../geo.js';
export default {
  can: {
    name: '空き缶',            // Japanese display name shown on pickup (short, friendly)
    kind: 'thing',            // food | thing | animal | person | vehicle | plant | building | landmark | nature
    variants: [0xd8382c, 0x2c7fd8], // optional: build(v) is called once per variant (e.g. body colours)
    where: ['plaza', 'street'],     // scatter tags (see your brief); omit for hand-placed landmarks
    weight: 3,                // relative scatter frequency within its tags (default 1)
    move: 'walk', speed: 1.2, // optional movement: walk | hop | fly | drive | sail (m/s)
    build: (v) => merge(/* parts */),
  },
};
```

## Check your work visually (required)
```
cd /home/user/lab/yokohama-roll
node tools/preview.mjs models/<your_file>.js /tmp/claude-0/-home-user-lab/f0dcb976-c72b-5349-a06d-476c65c7fb25/scratchpad/<name>.png 0      # day
node tools/preview.mjs models/<your_file>.js /tmp/claude-0/-home-user-lab/f0dcb976-c72b-5349-a06d-476c65c7fb25/scratchpad/<name>_n.png 1   # night (glow check)
node tools/preview.mjs models/<your_file>.js out.png 0 id1,id2   # only some ids, bigger cells
```
It prints `{"count":N,"errors":[]}` and a PNG contact sheet with each model's real size and triangle count;
open the PNG with the Read tool and iterate until every model reads clearly. `errors` must be empty.

Rules: only create/edit the file(s) named in your brief. Do not git commit. Do not touch other files.
When done, reply with: file path, list of ids with their real size, anything the integrator should know.
