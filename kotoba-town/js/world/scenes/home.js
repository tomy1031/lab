// home — the Mori family's old two-storey house (一戸建て). The learner has just stepped up from the
// genkan: the doma (shoes, shoe cabinet, sliding lattice door) is right beside them on the right, guest
// slippers at their feet, and the entrance hall opens straight onto the living-dining room. The dining
// table (tea, cake, spoon) is right in front; Aya stands across it, Shun at its right end by the shoes and
// the sideboard with the family photo. Beyond: the kitchen behind a noren doorway, a wall clock, the big
// garden window (cherry tree, flowers), the sofa and TV on the left, the piano on the right wall, and a
// tatami room (washitsu) with a tokonoma behind-left.
// Learner stands at the origin looking toward -z.
import * as THREE from 'three';
import * as K from '../kit.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const meta = { indoor: true, ambience: 'home' };

const XW = -4.2; const XE = 2.25; const ZN = -5.0; const ZS = 1.6; const H = 2.4;
const DX = 0.55; const DZ = -0.4; const DY = -0.22; // doma (genkan floor): x ∈ [DX, XE], z ∈ [DZ, ZS], at DY
const WSX = -1.3; const WSZ = -0.7;                 // washitsu: x ∈ [XW, WSX], z ∈ [WSZ, ZS]
const TBL = { x: -0.15, z: -0.87, w: 1.4, d: 0.8, h: 0.7 };

export default function build({ setup }) {
  const time = setup.time || 'evening';
  const season = setup.season || 'autumn';
  const rain = setup.weather === 'rain';
  const night = time === 'night';
  const lit = time === 'evening' || night;
  const winter = season === 'winter';
  const seated = night; // after dinner: the hosts sit at the table
  const g = new THREE.Group();
  const A = makeAtlas(1024, 4);
  const B = makeAtlas(1024, 1);
  const props = {};
  const add = (o, x = 0, y = 0, z = 0, ry = 0) => { o.position.set(x, y, z); o.rotation.y = ry; g.add(o); return o; };

  // ------------------------------------------------------------------ materials
  const floorMat = K.mat('#ffffff', { map: K.woodTex('#b8875a', [4, 4], 8), rough: 0.45 });
  const wallMat = K.mat('#ffffff', { map: K.noiseTex('#f3ece0', 0.04, [4, 2], 'homewall'), rough: 0.95 });
  const ceilMat = K.mat('#ffffff', { map: K.woodTex('#d9c09a', [3, 3], 10), rough: 0.8, emissive: '#3a3024', emissiveIntensity: lit ? 0.5 : 0.35 });
  const beamMat = K.mat('#ffffff', { map: K.woodTex('#7a5232', [1, 1], 2), rough: 0.4 });
  const furnMat = K.mat('#ffffff', { map: K.woodTex('#9a6a42', [1, 1], 3), rough: 0.45 });
  const lightWood = K.mat('#ffffff', { map: K.woodTex('#d1ad7f', [1, 1], 4), rough: 0.5 });
  const domaMat = K.mat('#ffffff', { map: K.tileTex('#8f8a80', '#86817a', 6, [4, 6], '#6f6a62'), rough: 0.7 });
  const tatamiMat = K.mat('#ffffff', { map: K.tatamiTex([1, 1]), rough: 0.9 });
  const sofaMat = K.mat('#8fa38a', { rough: 0.95 });
  const pianoMat = K.mat('#1e1a18', { rough: 0.18, metal: 0.1 });
  const shojiMat = new THREE.MeshBasicMaterial({ map: shojiTex(lit), toneMapped: false });

  // ------------------------------------------------------------------ shell
  // floors: main boards around the doma hole, doma lower, tatami in the washitsu
  const floorPiece = (x0, x1, z0, z1, m = floorMat, y = 0) => g.add(K.mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), m, { rx: -Math.PI / 2, x: (x0 + x1) / 2, y, z: (z0 + z1) / 2, cast: false }));
  floorPiece(XW, DX, ZN, ZS);
  floorPiece(DX, XE, ZN, DZ);
  floorPiece(DX, XE, DZ, ZS, domaMat, DY);
  // 上がり框 (step beams) on the doma's west and north edges + a 式台 board
  const kamachi = new THREE.Group();
  kamachi.add(K.box(0.1, -DY, ZS - DZ, beamMat, { x: DX + 0.05, y: DY, z: (DZ + ZS) / 2 }));
  kamachi.add(K.box(0.36, 0.1, 1.1, lightWood, { x: DX + 0.28, y: DY, z: 0.7 }));
  g.add(K.box(XE - DX, -DY, 0.1, beamMat, { x: (DX + XE) / 2, y: DY, z: DZ + 0.05 }));
  // walls
  const wall = (len, h, o) => g.add(K.mesh(new THREE.PlaneGeometry(len, h), wallMat, { cast: false, ...o }));
  wall(XE - XW, H - DY, { x: (XW + XE) / 2, y: (H + DY) / 2, z: ZS, ry: Math.PI });           // south
  wall(ZS - ZN, H, { x: XW, y: H / 2, z: (ZN + ZS) / 2, ry: Math.PI / 2 });                     // west
  // north wall with the garden window (x -3.9…-1.2) and the kitchen doorway (x 0.3…1.3)
  const GW = { x0: -3.9, x1: -1.2, top: 2.05 }; const KD = { x0: 0.3, x1: 1.3, top: 2.0 };
  wall(GW.x0 - XW, H, { x: (XW + GW.x0) / 2, y: H / 2, z: ZN });
  wall(KD.x0 - GW.x1, H, { x: (GW.x1 + KD.x0) / 2, y: H / 2, z: ZN });
  wall(XE - KD.x1, H, { x: (KD.x1 + XE) / 2, y: H / 2, z: ZN });
  wall(GW.x1 - GW.x0, H - GW.top, { x: (GW.x0 + GW.x1) / 2, y: (H + GW.top) / 2, z: ZN });
  wall(KD.x1 - KD.x0, H - KD.top, { x: (KD.x0 + KD.x1) / 2, y: (H + KD.top) / 2, z: ZN });
  // east wall with the front door opening (z -0.05…1.15) on the doma
  const FD = { z0: -0.05, z1: 1.15, top: DY + 1.95 };
  wall(FD.z0 - ZN, H - DY, { x: XE, y: (H + DY) / 2, z: (ZN + FD.z0) / 2, ry: -Math.PI / 2 });
  wall(ZS - FD.z1, H - DY, { x: XE, y: (H + DY) / 2, z: (FD.z1 + ZS) / 2, ry: -Math.PI / 2 });
  wall(FD.z1 - FD.z0, H - FD.top, { x: XE, y: (H + FD.top) / 2, z: (FD.z0 + FD.z1) / 2, ry: -Math.PI / 2 });
  g.add(K.mesh(new THREE.PlaneGeometry(XE - XW, ZS - ZN), ceilMat, { rx: Math.PI / 2, x: (XW + XE) / 2, y: H, z: (ZN + ZS) / 2, cast: false }));
  // skirting + a ceiling cornice
  for (const [len, x, z, ry] of [[XE - XW, (XW + XE) / 2, ZN + 0.01, 0], [WSZ - ZN, XW + 0.01, (ZN + WSZ) / 2, Math.PI / 2], [DZ - ZN, XE - 0.01, (ZN + DZ) / 2, -Math.PI / 2]]) {
    g.add(K.mesh(new THREE.BoxGeometry(len, 0.07, 0.015), beamMat, { x, y: 0.035, z, ry, cast: false }));
    g.add(K.mesh(new THREE.BoxGeometry(len, 0.04, 0.03), beamMat, { x, y: H - 0.02, z, ry, cast: false }));
  }

  // ------------------------------------------------------------------ genkan (doma, door, shoes)
  const genkan = K.prop('genkan', kamachi, { labelJa: 'げんかん', labelEn: 'genkan (entrance step)' });
  g.add(genkan);
  add(slidingFrontDoor(A, B, beamMat, time, rain), XE - 0.02, DY, (FD.z0 + FD.z1) / 2, -Math.PI / 2);
  add(getabako(A, beamMat, lightWood, season), (DX + XE) / 2 + 0.12, DY, ZS - 0.2, Math.PI);
  add(B.plane(0.42, 0.56, B.draw(84, 112, (c, w, h) => paintFramedPicture(c, w, h, season)), {}), (DX + XE) / 2 + 0.1, 1.45, ZS - 0.02, Math.PI);
  add(umbrellaStand(A, rain), XE - 0.2, DY, DZ + 0.2);
  const shoes = K.prop('shoes', shoeRow(A), { labelJa: 'くつ', labelEn: 'shoes' });
  add(shoes, 1.3, DY, DZ + 0.25);
  // guest slippers right at the learner's feet + a slipper rack
  const slippers = K.prop('slippers', slipperPair(A, '#c98a7a'), { labelJa: 'スリッパ', labelEn: 'slippers' });
  add(slippers, 0.3, 0, 0.12, -Math.PI / 2);
  add(slipperRack(A, beamMat), 0.15, 0, ZS - 0.22, Math.PI);
  // hall side (behind the learner): hallway door, coat hooks, calendar
  add(K.door('#a07a52', 0.8, 2.0), -0.62, 0, ZS - 0.03, Math.PI);
  add(coatHooks(A, beamMat, winter || season === 'autumn'), 0.22, 1.75, ZS - 0.04, Math.PI);

  // ------------------------------------------------------------------ dining table
  const table = K.prop('table', diningTable(furnMat), { labelJa: 'テーブル', labelEn: 'table' });
  add(table, TBL.x, 0, TBL.z);
  add(A.box(0.32, 0.004, TBL.d + 0.02, { all: '#e9dcc4', top: A.draw(32, 96, (c, w, h) => { c.fillStyle = '#e8d9bd'; c.fillRect(0, 0, w, h); c.fillStyle = '#b5523b'; c.fillRect(0, 0, w, 6); c.fillRect(0, h - 6, w, 6); c.fillStyle = 'rgba(160,80,60,0.25)'; for (let y = 12; y < h - 12; y += 8) c.fillRect(4, y, w - 8, 2); }) }), TBL.x - 0.15, TBL.h, TBL.z, 0);
  const T = TBL.h;
  const tea = K.prop('tea', night ? yunomi(A) : teaCup(A), { labelJa: 'おちゃ', labelEn: 'tea' });
  const cake = K.prop('cake', cakePlate(A, season), { labelJa: 'ケーキ', labelEn: 'cake' });
  const spoon = K.prop('spoon', spoonMesh(A), { labelJa: 'スプーン', labelEn: 'spoon' });
  if (!night) {
    add(tea, -0.12, T, -0.6); add(cake, 0.18, T, -0.62); add(spoon, 0.33, T, -0.6, 0.15);
    add(teaCup(A), -0.45, T, -1.1); add(cakePlate(A, season), -0.2, T, -1.12);
    add(teaCup(A), 0.42, T, -1.05); add(cakePlate(A, season), 0.28, T, -0.88, 0.5);
    add(kyusu(A), -0.6, T, -0.86);
    add(fruitBowl(A, season), 0.02, T, -1.0);
  } else {
    add(curryPlate(A), 0.0, T, -0.7); add(spoon, 0.2, T, -0.66, 0.1);
    add(tea, -0.3, T, -0.6); add(cake, 0.36, T, -0.86, 0.3);
    add(waterGlass(A), -0.42, T, -0.8); add(waterGlass(A), -0.15, T, -1.12); add(waterGlass(A), 0.42, T, -1.12);
    add(curryPlate(A), -0.42, T, -1.1); add(curryPlate(A), 0.36, T, -1.06, 0.6);
    add(saladBowl(A), -0.02, T, -0.98); add(potholderPot(A), -0.72, T, -1.02);
  }
  add(vase(A, season), TBL.x - 0.15, T, TBL.z + 0.02);
  // gift: held by the learner on arrival (evening), otherwise put down on the table
  const gift = K.prop('gift', giftBox(A, B), { labelJa: 'おみやげ', labelEn: 'gift (souvenir)' });
  if (time === 'evening') { gift.position.set(0.04, 1.0, -0.3); gift.rotation.set(0.15, 0.1, 0); g.add(gift); }
  else add(gift, -0.62, T, -0.58, 0.3);
  // chairs
  const chair = (x, z, ry) => add(diningChair(furnMat, A), x, 0, z, ry);
  chair(-0.62, 0.05, Math.PI + 0.35); // pulled out by the learner
  const ayaPos = seated ? { x: -0.4, z: -1.62 } : { x: -0.2, z: -1.76 };
  const shunPos = seated ? { x: 0.92, z: -1.12 } : { x: 1.0, z: -1.28 };
  if (seated) { chair(ayaPos.x, ayaPos.z + 0.04, 0); chair(0.32, -1.58, 0.1); chair(shunPos.x + 0.05, shunPos.z + 0.02, -Math.PI / 2 + 0.3); }
  else { chair(-0.78, -1.6, 0.25); chair(0.42, -1.6, -0.2); }
  // pendant lamp
  add(pendant(A, lit), TBL.x, H, TBL.z);
  const lamp = new THREE.PointLight('#ffd9a8', lit ? 9 : 3, 6, 1.4); lamp.position.set(TBL.x, 1.95, TBL.z); g.add(lamp);
  if (lit) { const l2 = new THREE.PointLight('#ffe2b8', 4, 7, 1.5); l2.position.set(-2.4, 2.2, -2.2); g.add(l2); const l3 = new THREE.PointLight('#ffd9a8', 2.5, 4, 1.6); l3.position.set(1.3, 2.1, 0.6); g.add(l3); }

  // ------------------------------------------------------------------ east wall: sideboard + photo, piano
  add(sideboard(A, furnMat), XE - 0.21, 0, -1.45, -Math.PI / 2);
  const photo = K.prop('photo', familyPhoto(A, B), { labelJa: 'かぞくの しゃしん', labelEn: 'family photo' });
  add(photo, XE - 0.24, 0.86, -1.25, -1.0);
  add(photoSmall(A, B, 1), XE - 0.18, 0.86, -1.72, -1.4);
  add(houseplant(A, 0.7), XE - 0.24, 0.86, -1.98);
  add(B.plane(0.5, 0.36, B.draw(100, 72, (c, w, h) => paintLandscape(c, w, h)), {}), XE - 0.02, 1.55, -1.45, -Math.PI / 2);
  const piano = K.prop('piano', uprightPiano(A, pianoMat), { labelJa: 'ピアノ', labelEn: 'piano' });
  add(piano, XE - 0.32, 0, -3.25, -Math.PI / 2);
  const bench = new THREE.Group(); bench.add(K.box(0.62, 0.05, 0.34, pianoMat, { y: 0.44 })); for (const [x, z] of [[-0.27, -0.13], [0.27, -0.13], [-0.27, 0.13], [0.27, 0.13]]) bench.add(K.box(0.04, 0.44, 0.04, pianoMat, { x, z }));
  add(bench, XE - 0.95, 0, -3.25, Math.PI / 2);

  // ------------------------------------------------------------------ north wall: kitchen, clock, cupboard
  const kitchen = K.prop('kitchen', kitchenRoom(A, B, wallMat, floorMat, beamMat, lit, night, season, KD), { labelJa: 'だいどころ', labelEn: 'kitchen' });
  g.add(kitchen);
  const hh = { morning: 8, noon: 12, evening: 18, night: 21 }[time] ?? 12;
  const mm = { morning: 0, noon: 30, evening: 30, night: 0 }[time] ?? 0;
  const clk = K.prop('clock', woodClock(A, hh, mm), { labelJa: 'とけい', labelEn: 'clock' });
  add(clk, -0.55, 2.08, ZN + 0.04);
  add(cupboard(A, furnMat), 1.82, 0, ZN + 0.22);
  add(B.plane(0.32, 0.46, calendarRegion(B, season), {}), -0.02, 1.25, ZN + 0.01);

  // ------------------------------------------------------------------ garden window + garden
  const gw = gardenWindow(A, lightWood, season, lit, GW);
  g.add(gw);
  const gv = gardenView(A, B, { time, season, rain, lit });
  g.add(gv.group);
  const garden = K.prop('garden', gv.garden, { labelJa: 'にわ', labelEn: 'garden' });

  // ------------------------------------------------------------------ living area (left): sofa, TV, low table
  const sofa = K.prop('sofa', sofaMesh(sofaMat, A), { labelJa: 'ソファ', labelEn: 'sofa' });
  add(sofa, -1.75, 0, -1.85, -Math.PI / 2);
  add(rug(A), -2.85, 0.004, -1.85);
  add(lowTable(lightWood, A, season), -2.85, 0, -1.85);
  const tv = K.prop('tv', tvSet(A, B, furnMat, lit), { labelJa: 'テレビ', labelEn: 'TV' });
  add(tv, XW + 0.24, 0, -1.85, Math.PI / 2);
  add(houseplant(A, 1.25), XW + 0.35, 0, -4.55);
  add(ceilingLight(A, lit), -2.5, H, -2.2);

  // ------------------------------------------------------------------ washitsu (tatami room) behind-left
  washitsu(g, A, B, { tatamiMat, beamMat, lightWood, shojiMat, wallMat, season, winter, lit });

  for (const o of [genkan, slippers, gift, sofa, table, tea, cake, spoon, tv, photo, clk, garden, kitchen, piano, shoes]) props[o.userData.propId] = o;

  // dynamic: steam over the learner's tea, the clock's pendulum
  const dyn = new THREE.Group(); dyn.userData.dynamic = true; g.add(dyn);
  const steamMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.16, depthWrite: false });
  const steam = new THREE.Group();
  for (let i = 0; i < 3; i++) steam.add(new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), steamMat));
  steam.position.copy(tea.position).add(new THREE.Vector3(0, night ? 0.09 : 0.07, 0));
  dyn.add(steam);
  const pendulum = clk.getObjectByName('pendulum');

  A.commit(); B.commit();
  return K.finalize({
    group: g,
    spawn: K.spot(0, 0, 0),
    slots: {
      host: seated ? { ...K.spot(ayaPos.x, ayaPos.z, K.faceYaw(ayaPos, { x: 0, z: 0 })), sit: 0.45 } : K.spot(ayaPos.x, ayaPos.z, K.faceYaw(ayaPos, { x: 0, z: 0 })),
      host2: seated ? { ...K.spot(shunPos.x, shunPos.z, -1.2), sit: 0.45 } : K.spot(shunPos.x, shunPos.z, K.faceYaw(shunPos, { x: 0, z: 0 })),
      phone: null,
    },
    props,
    center: new THREE.Vector3(-0.9, 0, -1.7),
    radius: 5.5,
    update(dt, t) {
      gv.tick(dt, t);
      if (pendulum) pendulum.rotation.z = Math.sin(t * Math.PI) * 0.12;
      steam.children.forEach((s, i) => { const k = (t * 0.35 + i / 3) % 1; s.position.set(Math.sin(t * 2 + i) * 0.01, k * 0.16, 0); s.scale.setScalar(0.6 + k * 1.6); });
    },
  });
}

// =============================================================== atlas helper (local)
// One canvas texture for most small details (colour swatches + drawings + text) so the whole scene
// merges into a handful of draw calls. Drawings are packed (tallest first) and painted in commit(),
// which must run before K.finalize.
function makeAtlas(size = 1024, swRows = 4) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const A = {
    tex,
    matte: new THREE.MeshStandardMaterial({ map: tex, roughness: 0.78, alphaTest: 0.5 }),
    gloss: new THREE.MeshStandardMaterial({ map: tex, roughness: 0.3, metalness: 0.45, alphaTest: 0.5 }),
    glow: new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, alphaTest: 0.5 }),
  };
  const SW = 16; const cols = size / SW; let nSw = 0; const swCache = new Map();
  const pending = [];
  A.draw = (pw, ph, fn) => { const r = { pw: Math.ceil(pw), ph: Math.ceil(ph), fn, uses: [] }; pending.push(r); return r; };
  A.swatch = (color) => {
    if (swCache.has(color)) return swCache.get(color);
    const i = nSw++; const x = (i % cols) * SW; const y = size - SW * (1 + Math.floor(i / cols));
    if (i >= cols * swRows) console.error('atlas: too many swatches');
    g.fillStyle = color; g.fillRect(x, y, SW, SW);
    const s = { u: (x + SW / 2) / size, v: 1 - (y + SW / 2) / size, color };
    swCache.set(color, s); return s;
  };
  A.paint = (geo, color, start = 0, count) => {
    const s = A.swatch(color); const uv = geo.attributes.uv; const end = count == null ? uv.count : start + count;
    for (let i = start; i < end; i++) uv.setXY(i, s.u, s.v);
    uv.needsUpdate = true; return geo;
  };
  A.mapUV = (geo, r, start = 0, count) => {
    const uv = geo.attributes.uv; const end = count == null ? uv.count : start + count;
    const local = []; for (let i = start; i < end; i++) local.push(uv.getX(i), uv.getY(i));
    r.uses.push({ uv, start, local });
    return geo;
  };
  A.commit = () => {
    const PAD = 4; const limit = size - swRows * SW - PAD;
    let cx = 0; let cy = 0; let rowH = 0;
    for (const r of [...pending].sort((a, b) => b.ph - a.ph)) {
      if (cx + r.pw > size) { cx = 0; cy += rowH + PAD; rowH = 0; }
      if (cy + r.ph > limit) { console.error(`atlas full (${r.pw}x${r.ph})`); continue; }
      const x = cx; const y = cy; cx += r.pw + PAD; rowH = Math.max(rowH, r.ph);
      g.save(); g.beginPath(); g.rect(x, y, r.pw, r.ph); g.clip(); g.translate(x, y); r.fn(g, r.pw, r.ph); g.restore();
      const u0 = x / size; const u1 = (x + r.pw) / size; const v0 = 1 - (y + r.ph) / size; const v1 = 1 - y / size;
      for (const { uv, start, local } of r.uses) {
        for (let k = 0; k < local.length / 2; k++) uv.setXY(start + k, u0 + local[2 * k] * (u1 - u0), v0 + local[2 * k + 1] * (v1 - v0));
        uv.needsUpdate = true;
      }
    }
    A.used = cy + rowH;
    tex.needsUpdate = true;
  };
  A.text = (lines, w, h, opts = {}) => {
    const ppm = opts.ppm ?? 260;
    return A.draw(Math.max(16, w * ppm), Math.max(16, h * ppm), (c, cw, ch) => drawText(c, cw, ch, lines, opts));
  };
  const face = (geo, spec, f) => {
    const s = spec[['right', 'left', 'top', 'bottom', 'front', 'back'][f]] ?? spec.side ?? spec.all;
    if (typeof s === 'string') A.paint(geo, s, f * 4, 4); else A.mapUV(geo, s, f * 4, 4);
  };
  /** Box (bottom at y) whose faces are swatch colours or drawings: spec = colour | {all, side, top, front …}. */
  A.box = (w, h, d, spec, o = {}) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    const sp = typeof spec === 'string' ? { all: spec } : spec;
    for (let f = 0; f < 6; f++) face(geo, sp, f);
    return K.mesh(geo, o.mat || A.matte, { ...o, y: (o.y ?? 0) + h / 2 });
  };
  A.rbox = (w, h, d, r, color, o = {}) => K.mesh(A.paint(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)), color), o.mat || A.matte, { ...o, y: (o.y ?? 0) + h / 2 });
  A.cyl = (rt, rb, h, color, o = {}, seg = 14) => K.mesh(A.paint(new THREE.CylinderGeometry(rt, rb, h, seg), color), o.mat || A.matte, { ...o, y: (o.y ?? 0) + h / 2 });
  A.plane = (w, h, region, o = {}) => K.mesh(A.mapUV(new THREE.PlaneGeometry(w, h), region), o.mat || A.matte, { cast: false, ...o });
  A.sign = (lines, w, h, opts = {}, o = {}) => A.plane(w, h, A.text(lines, w, h, opts), o);
  return A;
}
function drawText(c, cw, ch, lines, opts) {
  const r = (opts.radius ?? 0.08) * Math.min(cw, ch);
  if (opts.bg !== null) {
    c.fillStyle = opts.bg ?? '#ffffff'; K.roundRect(c, 0, 0, cw, ch, r); c.fill();
    if (opts.border) { c.strokeStyle = opts.border; c.lineWidth = Math.max(3, ch * 0.04); K.roundRect(c, c.lineWidth / 2, c.lineWidth / 2, cw - c.lineWidth, ch - c.lineWidth, r); c.stroke(); }
  }
  const arr = Array.isArray(lines) ? lines : [lines];
  const size = (opts.size ?? 0.5) * ch / Math.max(1, arr.length * 0.9);
  c.textBaseline = 'middle'; c.textAlign = opts.align ?? 'center';
  arr.forEach((line, i) => {
    const l = typeof line === 'string' ? { t: line } : line;
    let s = size * (l.scale ?? 1);
    const wt = l.weight ?? opts.weight ?? 700;
    c.font = `${wt} ${s}px ${K.JP_FONT}`;
    c.fillStyle = l.color ?? opts.fg ?? '#333333';
    const x = c.textAlign === 'left' ? cw * 0.06 : c.textAlign === 'right' ? cw * 0.94 : cw / 2;
    const y = ch * (i + 0.5) / arr.length;
    while (c.measureText(l.t).width > cw * 0.92 && s > 6) { s *= 0.92; c.font = `${wt} ${s}px ${K.JP_FONT}`; }
    c.fillText(l.t, x, y);
  });
}

function shadeHex(hex, k) { const c = new THREE.Color(hex); c.multiplyScalar(k); return `#${c.getHexString()}`; }

function shojiTex(lit) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = lit ? '#e9d7b4' : '#f7f2e6'; g.fillRect(0, 0, 128, 256);
  g.fillStyle = lit ? 'rgba(120,80,40,0.25)' : 'rgba(255,255,255,0.4)'; g.fillRect(0, 0, 128, 256);
  g.fillStyle = '#9a7a55';
  for (let x = 0; x <= 128; x += 32) g.fillRect(x - 2, 0, 4, 256);
  for (let y = 0; y <= 256; y += 40) g.fillRect(0, y - 2, 128, 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function slidingFrontDoor(A, B, beamMat, time, rain) {
  // 引き戸 with a wooden lattice over frosted glass; local +z faces the room; width 1.2, bottom at 0
  const gr = new THREE.Group();
  const glow = { morning: ['#f6f1e2', '#e6e2d6'], noon: ['#fbf8ee', '#ece8dc'], evening: ['#f6cf9a', '#d9a878'], night: ['#3b4766', '#ffd79a'] }[time] || ['#f6f1e2', '#e6e2d6'];
  const glass = B.draw(48, 96, (c, w, h) => {
    const gg = c.createLinearGradient(0, 0, 0, h); gg.addColorStop(0, glow[0]); gg.addColorStop(1, time === 'night' ? '#2c3550' : glow[1]); c.fillStyle = gg; c.fillRect(0, 0, w, h);
    if (time === 'night') { const rg = c.createRadialGradient(w * 0.8, 10, 2, w * 0.8, 10, 40); rg.addColorStop(0, 'rgba(255,215,150,0.9)'); rg.addColorStop(1, 'rgba(255,215,150,0)'); c.fillStyle = rg; c.fillRect(0, 0, w, h); }
    if (rain) { c.fillStyle = 'rgba(255,255,255,0.25)'; for (let i = 0; i < 40; i++) c.fillRect((i * 37) % w, (i * 53) % h, 1, 4); }
  });
  for (const [i, z] of [[0, -0.3], [1, 0.3]]) {
    const p = new THREE.Group();
    p.add(B.plane(0.56, 1.86, glass, { y: 0.97, mat: B.glow }));
    p.add(K.box(0.6, 0.05, 0.04, beamMat, { y: 0.0 }));
    p.add(K.box(0.6, 0.05, 0.04, beamMat, { y: 1.9 }));
    for (const x of [-0.28, 0.28]) p.add(K.box(0.04, 1.95, 0.04, beamMat, { x }));
    for (let k = 1; k < 6; k++) p.add(K.box(0.012, 1.86, 0.02, beamMat, { x: -0.28 + k * 0.56 / 6, y: 0.04, z: 0.02, cast: false }));
    for (const y of [0.5, 1.0, 1.45]) p.add(K.box(0.56, 0.012, 0.02, beamMat, { y, z: 0.02, cast: false }));
    p.position.set(z, 0, i ? 0.02 : 0.05);
    gr.add(p);
  }
  gr.add(K.box(1.3, 0.08, 0.12, beamMat, { y: 1.95 }));
  gr.add(A.box(0.04, 0.12, 0.03, '#b89a5a', { x: 0.02, y: 0.95, z: 0.08, mat: A.gloss, cast: false }));
  return gr;
}

function getabako(A, beamMat, lightWood, season) {
  const gr = new THREE.Group();
  const front = A.draw(128, 84, (c, w, h) => {
    c.fillStyle = '#b8895c'; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(70,40,20,0.5)'; c.lineWidth = 2;
    for (let i = 0; i < 4; i++) c.strokeRect(i * w / 4 + 2, 2, w / 4 - 4, h - 4);
    c.fillStyle = '#5a4030'; for (let i = 0; i < 4; i++) c.fillRect(i * w / 4 + (i % 2 ? 6 : w / 4 - 10), h * 0.45, 4, 10);
    c.fillStyle = 'rgba(255,255,255,0.06)'; for (let y = 0; y < h; y += 5) c.fillRect(0, y, w, 1);
  });
  gr.add(A.box(1.4, 0.9, 0.36, { all: '#a87c52', front }, {}));
  gr.add(K.box(1.44, 0.04, 0.4, beamMat, { y: 0.9 }));
  // on top: ikebana (Aya is a florist), key tray, a small maneki-neko
  const flowers = { spring: ['#f6c6d3', '#ffffff'], summer: ['#4a7fd1', '#ffffff'], autumn: ['#e06a3a', '#f0c040'], winter: ['#c8243a', '#ffffff'] }[season] || ['#f6c6d3'];
  gr.add(A.cyl(0.07, 0.09, 0.22, '#2f4a6a', { x: -0.4, y: 0.94, mat: A.gloss }, 12));
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4; const rr = 0.05 + (i % 3) * 0.04;
    gr.add(A.cyl(0.004, 0.004, 0.3, '#4f7a45', { x: -0.4 + Math.cos(a) * rr * 0.5, y: 1.1, z: Math.sin(a) * rr * 0.5, rz: Math.cos(a) * 0.35, rx: Math.sin(a) * 0.35, cast: false }, 4));
    gr.add(K.mesh(A.paint(new THREE.SphereGeometry(0.035, 8, 6), flowers[i % flowers.length]), A.matte, { x: -0.4 + Math.cos(a) * rr, y: 1.36 + (i % 3) * 0.04, z: Math.sin(a) * rr, cast: false }));
    gr.add(K.mesh(A.paint(new THREE.SphereGeometry(0.03, 6, 4), '#5f9a50'), A.matte, { x: -0.4 + Math.cos(a + 1) * rr * 0.8, y: 1.24, z: Math.sin(a + 1) * rr * 0.8, cast: false }));
  }
  gr.add(A.box(0.18, 0.02, 0.12, '#7a5a3a', { x: 0.1, y: 0.94 }));
  gr.add(A.box(0.04, 0.005, 0.015, '#d8c47a', { x: 0.08, y: 0.96, mat: A.gloss, cast: false }));
  const neko = new THREE.Group();
  neko.add(K.mesh(A.paint(new THREE.SphereGeometry(0.05, 10, 8), '#fbf8f0'), A.gloss, { y: 0.05 }));
  neko.add(K.mesh(A.paint(new THREE.SphereGeometry(0.04, 10, 8), '#fbf8f0'), A.gloss, { y: 0.12 }));
  neko.add(A.box(0.02, 0.05, 0.02, '#fbf8f0', { x: 0.04, y: 0.12, mat: A.gloss, cast: false }));
  neko.add(K.mesh(A.paint(new THREE.CircleGeometry(0.02, 10), '#e0b040'), A.gloss, { y: 0.06, z: 0.05, cast: false }));
  neko.add(A.box(0.05, 0.01, 0.01, '#d23a32', { y: 0.095, z: 0.04, cast: false }));
  neko.position.set(0.45, 0.94, 0); gr.add(neko);
  // shoe horn hanging on the side
  gr.add(A.box(0.04, 0.5, 0.01, '#8a5a32', { x: 0.73, y: 0.35, z: 0.1, mat: A.gloss, cast: false }));
  return gr;
}

function paintFramedPicture(c, w, h, season) {
  c.fillStyle = '#6b4a32'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#f3ecdf'; c.fillRect(6, 6, w - 12, h - 12);
  const gg = c.createLinearGradient(0, 12, 0, h * 0.6); gg.addColorStop(0, '#9cc6e6'); gg.addColorStop(1, '#f0e4cc'); c.fillStyle = gg; c.fillRect(12, 12, w - 24, h - 30);
  c.fillStyle = '#4f6f9a'; c.beginPath(); c.moveTo(14, h * 0.62); c.lineTo(w / 2, h * 0.24); c.lineTo(w - 14, h * 0.62); c.fill();
  c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(w / 2 - 12, h * 0.32); c.lineTo(w / 2, h * 0.24); c.lineTo(w / 2 + 12, h * 0.32); c.lineTo(w / 2 + 5, h * 0.35); c.lineTo(w / 2 - 4, h * 0.31); c.fill();
  c.fillStyle = season === 'spring' ? '#f2b9c8' : season === 'autumn' ? '#d9772f' : '#6f9a5a'; c.fillRect(12, h * 0.62, w - 24, h * 0.18);
  c.fillStyle = '#c0392b'; c.fillRect(w - 26, h - 30, 8, 8);
}

function umbrellaStand(A, rain) {
  const gr = new THREE.Group();
  gr.add(A.cyl(0.12, 0.11, 0.42, '#7a5a3a', {}, 14));
  const cols = rain ? ['#2f6a8f', '#e8e1d0', '#c0392b'] : ['#3c3c44', '#d98aa0'];
  cols.forEach((c, i) => {
    const u = new THREE.Group();
    u.add(A.cyl(0.006, 0.006, 0.85, '#5a5a5a', {}, 6));
    u.add(A.cyl(0.034, 0.012, 0.48, c, { y: 0.22 }, 8));
    u.add(K.mesh(A.paint(new THREE.TorusGeometry(0.034, 0.008, 6, 10, Math.PI), '#4a3a2a'), A.matte, { y: 0.85, cast: false }));
    u.position.set(Math.cos(i * 2.1) * 0.04, 0.03, Math.sin(i * 2.1) * 0.04); u.rotation.set(Math.sin(i * 2.1) * 0.1, i, Math.cos(i * 1.3) * 0.1);
    gr.add(u);
  });
  return gr;
}

function shoe(A, color, { len = 0.27, heel = 0.03, sneaker = false, sandal = false } = {}) {
  const s = new THREE.Group();
  s.add(A.rbox(0.095, 0.025, len, 0.012, sneaker ? '#f4f4f0' : '#2a2422', {}));
  if (sandal) { s.add(A.box(0.085, 0.02, 0.06, color, { y: 0.025, z: len * 0.15, cast: false })); return s; }
  s.add(A.rbox(0.085, 0.07 + heel, len * 0.62, 0.035, color, { y: 0.02, z: -len * 0.16 }));
  s.add(A.rbox(0.08, 0.05, len * 0.42, 0.03, color, { y: 0.02, z: len * 0.26 }));
  if (sneaker) s.add(A.box(0.086, 0.012, len * 0.3, '#c9584b', { y: 0.06, z: 0.0, cast: false }));
  return s;
}
function shoeRow(A) {
  // pairs lined up along the north edge of the doma, heels to the step, toes pointing into the doma (+z)
  const gr = new THREE.Group();
  const pairs = [
    { c: '#3a2a20', o: { len: 0.27 } },               // Shun's brown leather shoes
    { c: '#141414', o: { len: 0.27 } },               // the guest's black shoes
    { c: '#d9c2a3', o: { len: 0.23, heel: 0.0 } },    // Aya's beige flats
    { c: '#ffffff', o: { len: 0.26, sneaker: true } },// sneakers
    { c: '#2f3f5a', o: { len: 0.24, sandal: true } }, // house sandals (つっかけ)
  ];
  pairs.forEach((p, i) => {
    const x = -0.56 + i * 0.28;
    for (const dx of [-0.055, 0.055]) { const s = shoe(A, p.c, p.o); s.position.set(x + dx, 0, 0); s.rotation.y = dx * 0.6; gr.add(s); }
  });
  return gr;
}

function slipperPair(A, color) {
  const gr = new THREE.Group();
  for (const dx of [-0.07, 0.07]) {
    gr.add(A.rbox(0.1, 0.02, 0.26, 0.01, '#e9dcc8', { x: dx }));
    gr.add(A.rbox(0.1, 0.045, 0.12, 0.02, color, { x: dx, y: 0.012, z: 0.06 }));
  }
  return gr;
}

function slipperRack(A, beamMat) {
  const gr = new THREE.Group();
  for (const x of [-0.2, 0.2]) gr.add(K.box(0.03, 0.7, 0.03, beamMat, { x }));
  for (const y of [0.2, 0.42, 0.64]) {
    gr.add(K.box(0.42, 0.02, 0.025, beamMat, { y, z: 0.04, cast: false }));
    gr.add(A.rbox(0.09, 0.04, 0.2, 0.015, ['#c98a7a', '#8aa3c9', '#a3b88a'][Math.round(y * 5) % 3], { x: -0.06, y: y - 0.12, z: 0.05, rx: 1.2 }));
    gr.add(A.rbox(0.09, 0.04, 0.2, 0.015, ['#c98a7a', '#8aa3c9', '#a3b88a'][Math.round(y * 5) % 3], { x: 0.06, y: y - 0.12, z: 0.05, rx: 1.2 }));
  }
  return gr;
}

function coatHooks(A, beamMat, coats) {
  const gr = new THREE.Group();
  gr.add(K.box(0.62, 0.08, 0.03, beamMat, {}));
  for (let i = 0; i < 3; i++) gr.add(A.cyl(0.01, 0.01, 0.06, '#c9b37a', { x: -0.22 + i * 0.22, y: 0.04, z: 0.03, rx: Math.PI / 2, mat: A.gloss, cast: false }, 6));
  if (coats) for (const [i, col] of [[0, '#4f5f74'], [1, '#8a5a3a']]) {
    const c = K.mesh(A.paint(new THREE.CylinderGeometry(0.1, 0.19, 0.8, 10), col), A.matte, { x: -0.22 + i * 0.22, y: -0.42, z: 0.1 });
    c.scale.z = 0.45; gr.add(c);
  }
  gr.add(K.mesh(A.paint(new THREE.SphereGeometry(0.09, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#c9b48a'), A.matte, { x: 0.22, y: 0.02, z: 0.1 }));
  gr.add(A.cyl(0.15, 0.15, 0.01, '#c9b48a', { x: 0.22, y: 0.02, z: 0.1 }, 16));
  return gr;
}

function diningTable(m) {
  const gr = new THREE.Group();
  gr.add(K.rbox(TBL.w, 0.035, TBL.d, 0.012, m, { y: TBL.h - 0.035 }));
  gr.add(K.box(TBL.w - 0.16, 0.08, TBL.d - 0.16, m, { y: TBL.h - 0.11, cast: false }));
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) gr.add(K.box(0.06, TBL.h - 0.035, 0.06, m, { x: x * (TBL.w / 2 - 0.1), z: z * (TBL.d / 2 - 0.1) }));
  return gr;
}

function diningChair(m, A) {
  const gr = new THREE.Group();
  gr.add(K.box(0.44, 0.035, 0.42, m, { y: 0.42 }));
  gr.add(A.rbox(0.4, 0.035, 0.38, 0.015, '#b5523b', { y: 0.455 }));
  for (const [x, z] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) gr.add(K.box(0.035, 0.42, 0.035, m, { x, z }));
  for (const x of [-0.19, 0.19]) gr.add(K.box(0.035, 0.45, 0.035, m, { x, y: 0.45, z: -0.19 }));
  for (const y of [0.62, 0.78]) gr.add(K.box(0.4, 0.05, 0.02, m, { y, z: -0.19 }));
  return gr;
}

function teaCup(A) {
  const gr = new THREE.Group();
  gr.add(A.cyl(0.07, 0.065, 0.01, '#f7f3ea', { mat: A.gloss }, 18));
  gr.add(A.cyl(0.045, 0.034, 0.055, '#f7f3ea', { y: 0.01, mat: A.gloss }, 16));
  gr.add(A.cyl(0.046, 0.046, 0.006, '#3a6aa8', { y: 0.055, mat: A.gloss, cast: false }, 16));
  gr.add(A.cyl(0.041, 0.041, 0.002, '#b7742c', { y: 0.055, cast: false }, 16));
  gr.add(K.mesh(A.paint(new THREE.TorusGeometry(0.018, 0.005, 6, 10, Math.PI), '#f7f3ea'), A.gloss, { x: 0.05, y: 0.04, rz: -Math.PI / 2, cast: false }));
  return gr;
}
function yunomi(A) {
  const gr = new THREE.Group();
  gr.add(A.cyl(0.035, 0.03, 0.085, '#6b8a72', { mat: A.gloss }, 14));
  gr.add(A.cyl(0.036, 0.036, 0.012, '#d9cfb8', { y: 0.074, mat: A.gloss, cast: false }, 14));
  gr.add(A.cyl(0.031, 0.031, 0.002, '#9ab45a', { y: 0.078, cast: false }, 14));
  return gr;
}

function cakePlate(A, season) {
  const gr = new THREE.Group();
  gr.add(A.cyl(0.085, 0.07, 0.012, '#fbfaf6', { mat: A.gloss }, 20));
  const top = season === 'autumn' ? '#a8784a' : '#fffaf2';
  const slice = (geo, col, y) => { const m = K.mesh(A.paint(geo, col), A.matte, { y, ry: -0.3 }); gr.add(m); return m; };
  slice(new THREE.CylinderGeometry(0.07, 0.07, 0.025, 8, 1, false, 0, 0.75), '#f2d9a0', 0.025);
  slice(new THREE.CylinderGeometry(0.07, 0.07, 0.008, 8, 1, false, 0, 0.75), season === 'autumn' ? '#d9b07a' : '#fbeef0', 0.041);
  slice(new THREE.CylinderGeometry(0.07, 0.07, 0.022, 8, 1, false, 0, 0.75), '#f2d9a0', 0.056);
  slice(new THREE.CylinderGeometry(0.071, 0.071, 0.012, 8, 1, false, 0, 0.75), top, 0.073);
  gr.add(K.mesh(A.paint(new THREE.SphereGeometry(0.014, 10, 8), season === 'autumn' ? '#7a4a22' : '#d8243a'), A.gloss, { x: 0.02, y: 0.086, z: 0.045, cast: false }));
  return gr;
}

function spoonMesh(A) {
  const gr = new THREE.Group();
  gr.add(A.box(0.012, 0.004, 0.11, '#d9dcdf', { y: 0.004, z: -0.03, mat: A.gloss, cast: false }));
  const bowl = K.mesh(A.paint(new THREE.SphereGeometry(0.02, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), '#d9dcdf'), A.gloss, { y: 0.012, z: 0.04, cast: false });
  bowl.scale.set(0.85, 0.45, 1.3); gr.add(bowl);
  return gr;
}

function kyusu(A) {
  const gr = new THREE.Group();
  const body = K.mesh(A.paint(new THREE.SphereGeometry(0.07, 14, 10), '#5a6a4a'), A.gloss, { y: 0.06 }); body.scale.y = 0.8; gr.add(body);
  gr.add(A.cyl(0.035, 0.04, 0.02, '#5a6a4a', { y: 0.11, mat: A.gloss }, 12));
  gr.add(K.mesh(A.paint(new THREE.CylinderGeometry(0.008, 0.014, 0.07, 6), '#5a6a4a'), A.gloss, { x: 0.08, y: 0.08, rz: -1.0, cast: false }));
  gr.add(K.mesh(A.paint(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 6), '#5a6a4a'), A.gloss, { z: -0.1, y: 0.07, rx: Math.PI / 2, cast: false }));
  return gr;
}

function fruitBowl(A, season) {
  const gr = new THREE.Group();
  gr.add(A.cyl(0.13, 0.07, 0.06, '#e8dcc6', { mat: A.gloss }, 16));
  const f = { spring: ['#d8243a', 0.022, 9], summer: ['#e85a4a', 0.04, 4], autumn: ['#e8782a', 0.04, 5], winter: ['#f29a1a', 0.035, 6] }[season] || ['#e8782a', 0.04, 5];
  for (let i = 0; i < f[2]; i++) {
    const a = i / f[2] * Math.PI * 2;
    const m = K.mesh(A.paint(new THREE.SphereGeometry(f[1], 10, 8), f[0]), A.gloss, { x: Math.cos(a) * 0.065, y: 0.065 + (i % 2) * 0.02, z: Math.sin(a) * 0.065 });
    if (season === 'autumn' || season === 'winter') m.scale.y = 0.8;
    gr.add(m);
    if (season === 'autumn') gr.add(A.box(0.03, 0.006, 0.03, '#4f6a3a', { x: Math.cos(a) * 0.065, y: 0.095 + (i % 2) * 0.02, z: Math.sin(a) * 0.065, cast: false }));
  }
  return gr;
}

function curryPlate(A) {
  const gr = new THREE.Group();
  const plate = A.cyl(0.13, 0.11, 0.015, '#fbfaf6', { mat: A.gloss }, 22); plate.scale.z = 0.75; gr.add(plate);
  const rice = K.mesh(A.paint(new THREE.SphereGeometry(0.06, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#fbf8f0'), A.matte, { x: -0.04, y: 0.015 }); rice.scale.set(1, 0.55, 0.9); gr.add(rice);
  const roux = A.cyl(0.075, 0.075, 0.012, '#8a4f1e', { x: 0.035, y: 0.015, mat: A.gloss }, 18); roux.scale.z = 0.7; gr.add(roux);
  for (const [x, z, c] of [[0.05, 0.01, '#e8a23a'], [0.02, -0.02, '#c9783a'], [0.07, -0.02, '#e8c060']]) gr.add(A.box(0.018, 0.012, 0.018, c, { x, y: 0.024, z, cast: false }));
  gr.add(A.box(0.02, 0.008, 0.015, '#c8243a', { x: -0.07, y: 0.02, z: 0.03, cast: false })); // fukujinzuke
  return gr;
}
function waterGlass(A) { return A.cyl(0.032, 0.028, 0.1, '#cfe3ec', { mat: A.gloss }, 12); }
function saladBowl(A) {
  const gr = new THREE.Group();
  gr.add(A.cyl(0.11, 0.06, 0.07, '#f2efe6', { mat: A.gloss }, 16));
  for (let i = 0; i < 9; i++) gr.add(K.mesh(A.paint(new THREE.SphereGeometry(0.03, 6, 4), ['#6aa84f', '#8fc06a', '#d8243a'][i % 3]), A.matte, { x: Math.cos(i * 2.3) * 0.05, y: 0.075, z: Math.sin(i * 2.3) * 0.05, cast: false }));
  return gr;
}
function potholderPot(A) {
  const gr = new THREE.Group();
  gr.add(A.cyl(0.13, 0.13, 0.015, '#8a6a4a', {}, 16));
  gr.add(A.cyl(0.12, 0.11, 0.14, '#e8e2d2', { y: 0.015, mat: A.gloss }, 18));
  gr.add(A.cyl(0.12, 0.12, 0.012, '#d9d2c0', { y: 0.155, mat: A.gloss }, 18));
  gr.add(A.cyl(0.02, 0.02, 0.025, '#2a2a2a', { y: 0.167 }, 8));
  for (const s of [-1, 1]) gr.add(A.box(0.04, 0.02, 0.03, '#2a2a2a', { x: s * 0.135, y: 0.12, cast: false }));
  return gr;
}

function vase(A, season) {
  const gr = new THREE.Group();
  gr.add(A.cyl(0.03, 0.045, 0.14, '#3a5f8a', { mat: A.gloss }, 12));
  const col = { spring: '#f6c6d3', summer: '#f2d64a', autumn: '#e86a8a', winter: '#c8243a' }[season] || '#f6c6d3';
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05;
    gr.add(A.cyl(0.003, 0.003, 0.2, '#4f7a45', { x: Math.cos(a) * 0.015, y: 0.12, z: Math.sin(a) * 0.015, rz: Math.cos(a) * 0.25, rx: Math.sin(a) * 0.25, cast: false }, 4));
    gr.add(K.mesh(A.paint(new THREE.SphereGeometry(0.025, 8, 6), i % 2 ? col : '#ffffff'), A.matte, { x: Math.cos(a) * 0.06, y: 0.31, z: Math.sin(a) * 0.06, cast: false }));
  }
  return gr;
}

function giftBox(A, B) {
  const top = B.draw(144, 104, (c, w, h) => {
    c.fillStyle = '#2f5e8c'; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,0.2)'; for (let y = 0; y < h; y += 12) for (let x = (y % 24) ? 0 : 6; x < w; x += 12) c.fillRect(x, y, 4, 4);
    c.fillStyle = '#e8c24a'; c.fillRect(w * 0.45, 0, w * 0.1, h); c.fillRect(0, h * 0.44, w, h * 0.12);
    c.fillStyle = '#f2d870'; c.beginPath(); c.ellipse(w * 0.42, h * 0.5, 16, 9, -0.4, 0, 7); c.ellipse(w * 0.58, h * 0.5, 16, 9, 0.4, 0, 7); c.fill();
  });
  const side = A.draw(32, 12, (c, w, h) => { c.fillStyle = '#2f5e8c'; c.fillRect(0, 0, w, h); c.fillStyle = '#e8c24a'; c.fillRect(w * 0.45, 0, w * 0.1, h); });
  const gr = new THREE.Group();
  gr.add(A.box(0.24, 0.075, 0.17, { all: side, top: '#2f5e8c' }, {}));
  gr.add(B.plane(0.24, 0.17, top, { y: 0.0755, rx: -Math.PI / 2 }));
  return gr;
}

function pendant(A, lit) {
  const gr = new THREE.Group();
  gr.add(A.cyl(0.004, 0.004, 0.32, '#3a3a3a', { y: -0.32, cast: false }, 4));
  gr.add(K.mesh(A.paint(new THREE.CylinderGeometry(0.07, 0.24, 0.18, 18, 1, true), '#f2e6cf'), A.matte, { y: -0.42, cast: false }));
  gr.add(K.mesh(A.paint(new THREE.SphereGeometry(0.06, 12, 8), lit ? '#fff1cf' : '#f6f2ea'), lit ? A.glow : A.matte, { y: -0.46, cast: false }));
  return gr;
}

function sideboard(A, m) {
  const gr = new THREE.Group();
  const front = A.draw(140, 84, (c, w, h) => {
    c.fillStyle = '#8f6040'; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(50,30,15,0.6)'; c.lineWidth = 2;
    c.strokeRect(3, 3, w / 3 - 6, h - 6); c.strokeRect(w / 3 + 3, 3, w / 3 - 6, h / 2 - 6); c.strokeRect(w / 3 + 3, h / 2 + 3, w / 3 - 6, h / 2 - 6); c.strokeRect(2 * w / 3 + 3, 3, w / 3 - 6, h - 6);
    c.fillStyle = '#d8c47a'; c.fillRect(w / 3 - 12, h / 2 - 5, 4, 10); c.fillRect(2 * w / 3 + 8, h / 2 - 5, 4, 10); c.fillRect(w / 2 - 6, h / 4, 12, 3); c.fillRect(w / 2 - 6, 3 * h / 4, 12, 3);
  });
  gr.add(A.box(1.4, 0.78, 0.42, { all: '#8f6040', front }, { y: 0.05 }));
  gr.add(K.box(1.44, 0.03, 0.45, m, { y: 0.83 }));
  for (const x of [-0.62, 0.62]) gr.add(A.box(0.05, 0.05, 0.36, '#5a3c26', { x, cast: false }));
  gr.add(A.box(0.5, 0.004, 0.3, '#f4efe2', { y: 0.86, x: -0.2, cast: false })); // doily
  return gr;
}

function familyPhoto(A, B) {
  // Shun, Aya and Aya's parents in front of a temple gate
  const pic = B.draw(120, 92, (c, w, h) => {
    c.fillStyle = '#d8c4a0'; c.fillRect(0, 0, w, h);
    const gg = c.createLinearGradient(0, 8, 0, h); gg.addColorStop(0, '#a9d0ec'); gg.addColorStop(0.6, '#e8f0e0'); gg.addColorStop(1, '#a8b890'); c.fillStyle = gg; c.fillRect(8, 8, w - 16, h - 16);
    c.fillStyle = '#c0392b'; c.fillRect(20, 14, 6, 40); c.fillRect(w - 26, 14, 6, 40); c.fillRect(14, 16, w - 28, 6); c.fillRect(18, 26, w - 36, 4);
    const people = [{ x: 28, s: '#c9c4bc', top: '#6b6f78', hh: 32 }, { x: 48, s: '#1d1a18', top: '#dfe7f0', hh: 36 }, { x: 70, s: '#4a3020', top: '#e9b9a4', hh: 31 }, { x: 92, s: '#d7d3cc', top: '#9a7f9c', hh: 29 }];
    for (const p of people) {
      c.fillStyle = p.top; c.fillRect(p.x - 7, h - 8 - p.hh + 10, 14, p.hh - 10);
      c.fillStyle = '#ecc5a6'; c.beginPath(); c.arc(p.x, h - 8 - p.hh + 5, 5, 0, 7); c.fill();
      c.fillStyle = p.s; c.beginPath(); c.arc(p.x, h - 8 - p.hh + 3, 5, Math.PI, 0); c.fill();
    }
  });
  const gr = new THREE.Group();
  gr.add(A.box(0.27, 0.21, 0.02, '#c9a65a', { mat: A.gloss }));
  gr.add(B.plane(0.235, 0.18, pic, { y: 0.105, z: 0.011 }));
  gr.add(A.box(0.04, 0.16, 0.02, '#c9a65a', { z: -0.06, rx: -0.4, mat: A.gloss, cast: false }));
  return gr;
}
function photoSmall(A, B, i) {
  const pic = B.draw(56, 72, (c, w, h) => { c.fillStyle = '#f2ece0'; c.fillRect(0, 0, w, h); c.fillStyle = '#b8d0e0'; c.fillRect(6, 6, w - 12, h - 12); c.fillStyle = '#ffffff'; c.fillRect(w / 2 - 10, h * 0.4, 9, h * 0.5); c.fillStyle = '#2b2b2b'; c.fillRect(w / 2 + 1, h * 0.38, 10, h * 0.52); c.fillStyle = '#ecc5a6'; c.beginPath(); c.arc(w / 2 - 5, h * 0.34, 4, 0, 7); c.arc(w / 2 + 6, h * 0.32, 4, 0, 7); c.fill(); });
  const gr = new THREE.Group();
  gr.add(A.box(0.14, 0.18, 0.015, '#f2efe8', {}));
  gr.add(B.plane(0.11, 0.15, pic, { y: 0.09, z: 0.009 }));
  return gr;
}

function houseplant(A, s = 1) {
  const gr = new THREE.Group();
  gr.add(A.cyl(0.13 * s, 0.1 * s, 0.24 * s, '#d8cfc0', {}, 12));
  const r = K.rng(Math.round(s * 13));
  for (let i = 0; i < 12; i++) {
    const a = r() * Math.PI * 2; const rr = r() * 0.14 * s; const y = (0.35 + r() * 0.6) * s;
    const l = K.mesh(A.paint(new THREE.SphereGeometry(0.1 * s, 7, 5), ['#4f7a4a', '#5f8f55', '#3f6a3e', '#6a9a5a'][i % 4]), A.matte, { x: Math.cos(a) * rr, y, z: Math.sin(a) * rr });
    l.scale.y = 0.6; gr.add(l);
  }
  return gr;
}

function paintLandscape(c, w, h) {
  c.fillStyle = '#c9a65a'; c.fillRect(0, 0, w, h); c.fillStyle = '#f5efe0'; c.fillRect(4, 4, w - 8, h - 8);
  const gg = c.createLinearGradient(0, 8, 0, h); gg.addColorStop(0, '#f4d2a8'); gg.addColorStop(1, '#9ab8c8'); c.fillStyle = gg; c.fillRect(8, 8, w - 16, h - 16);
  c.fillStyle = '#5f7a8a'; c.beginPath(); c.moveTo(8, h - 20); c.lineTo(30, 30); c.lineTo(52, h - 26); c.lineTo(70, 36); c.lineTo(w - 8, h - 22); c.lineTo(w - 8, h - 8); c.lineTo(8, h - 8); c.fill();
  c.fillStyle = '#e86a3a'; c.beginPath(); c.arc(w - 26, 24, 6, 0, 7); c.fill();
}

function uprightPiano(A, pm) {
  const gr = new THREE.Group();
  gr.add(K.box(1.45, 1.22, 0.36, pm, { y: 0.0, z: -0.12 }));
  gr.add(K.box(1.45, 0.06, 0.6, pm, { y: 0.66 }));
  gr.add(K.box(1.45, 0.05, 0.24, pm, { y: 0.77, z: 0.06 }));
  gr.add(A.plane(1.25, 0.16, A.draw(256, 32, (c, w, h) => {
    c.fillStyle = '#f7f4ec'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#9a9890'; for (let x = 0; x < w; x += w / 36) c.fillRect(x, 0, 1, h);
    c.fillStyle = '#1a1a1a'; for (let k = 0; k < 36; k++) { const m = k % 7; if (m === 2 || m === 6) continue; c.fillRect(k * w / 36 + w / 36 * 0.65, 0, w / 36 * 0.7, h * 0.6); }
  }), { y: 0.725, z: 0.17, rx: -Math.PI / 2 }));
  for (const x of [-0.68, 0.68]) gr.add(K.box(0.06, 0.66, 0.08, pm, { x, z: 0.22 }));
  for (const x of [-0.05, 0.05]) gr.add(A.box(0.03, 0.015, 0.06, '#d8c47a', { x, y: 0.05, z: 0.14, mat: A.gloss, cast: false }));
  gr.add(A.box(0.6, 0.004, 0.3, '#c8243a', { y: 1.22, x: 0.25, z: -0.12, cast: false })); // runner
  // music stand + sheet, metronome, photo, small vase
  gr.add(A.plane(0.36, 0.24, A.draw(72, 48, (c, w, h) => { c.fillStyle = '#fbf8f0'; c.fillRect(0, 0, w, h); c.fillStyle = '#333'; for (let y = 8; y < h; y += 12) for (let k = 0; k < 5; k++) c.fillRect(4, y + k * 1.5, w - 8, 0.6); for (let i = 0; i < 12; i++) c.fillRect(8 + i * 5, 8 + (i * 7) % 10, 2, 2); }), { y: 0.95, z: 0.065, rx: -0.2 }));
  const met = K.mesh(A.paint(new THREE.ConeGeometry(0.06, 0.2, 4), '#6b4a32'), A.gloss, { x: -0.5, y: 1.32, z: -0.1, ry: Math.PI / 4 }); gr.add(met);
  gr.add(A.box(0.12, 0.15, 0.015, '#c9a65a', { x: 0.1, y: 1.22, z: -0.14, rx: -0.15, mat: A.gloss, cast: false }));
  gr.add(A.cyl(0.03, 0.04, 0.16, '#e8e2d2', { x: 0.45, y: 1.22, z: -0.12, mat: A.gloss }, 10));
  gr.add(K.mesh(A.paint(new THREE.SphereGeometry(0.04, 8, 6), '#f2b9c8'), A.matte, { x: 0.45, y: 1.43, z: -0.12, cast: false }));
  return gr;
}

function kitchenRoom(A, B, wallMat, floorMat, beamMat, lit, night, season, KD) {
  // separate kitchen (台所) behind the north wall, seen through a doorway with a noren
  const gr = new THREE.Group();
  const z0 = ZN; const z1 = ZN - 2.4; const x0 = KD.x0 - 0.6; const x1 = XE;
  gr.add(K.mesh(new THREE.PlaneGeometry(x1 - x0, z0 - z1), K.mat('#ffffff', { map: K.tileTex('#e8dfcf', '#ddd2bf', 8, [3, 3], '#c9bea9'), rough: 0.6 }), { rx: -Math.PI / 2, x: (x0 + x1) / 2, y: 0.001, z: (z0 + z1) / 2, cast: false }));
  gr.add(K.mesh(new THREE.PlaneGeometry(x1 - x0, H), wallMat, { x: (x0 + x1) / 2, y: H / 2, z: z1, cast: false }));
  gr.add(K.mesh(new THREE.PlaneGeometry(z0 - z1, H), wallMat, { x: x0, y: H / 2, z: (z0 + z1) / 2, ry: Math.PI / 2, cast: false }));
  gr.add(K.mesh(new THREE.PlaneGeometry(z0 - z1, H), wallMat, { x: x1, y: H / 2, z: (z0 + z1) / 2, ry: -Math.PI / 2, cast: false }));
  gr.add(K.mesh(new THREE.PlaneGeometry(x1 - x0, z0 - z1), wallMat, { rx: Math.PI / 2, x: (x0 + x1) / 2, y: H, z: (z0 + z1) / 2, cast: false }));
  // back counter: cabinets, sink, stove (curry pot), tiles, window, shelf
  const cx0 = x0 + 0.1; const cx1 = x1 - 0.75; const cw = cx1 - cx0; const cz = z1 + 0.33;
  const cab = A.draw(160, 48, (c, w, h) => { c.fillStyle = '#e9dcc4'; c.fillRect(0, 0, w, h); c.strokeStyle = '#b8a888'; c.lineWidth = 2; for (let i = 0; i < 5; i++) c.strokeRect(i * w / 5 + 2, 2, w / 5 - 4, h - 4); c.fillStyle = '#8a7a60'; for (let i = 0; i < 5; i++) c.fillRect(i * w / 5 + w / 10 - 6, 6, 12, 3); });
  gr.add(A.box(cw, 0.82, 0.62, { all: '#e9dcc4', front: cab }, { x: (cx0 + cx1) / 2, z: cz }));
  gr.add(A.box(cw + 0.02, 0.04, 0.64, '#c9ccd0', { x: (cx0 + cx1) / 2, y: 0.82, z: cz, mat: A.gloss }));
  gr.add(A.box(0.5, 0.012, 0.4, '#8e9296', { x: cx0 + 0.5, y: 0.855, z: cz, mat: A.gloss, cast: false })); // sink
  gr.add(A.cyl(0.012, 0.012, 0.28, '#c9ccd0', { x: cx0 + 0.5, y: 0.86, z: cz - 0.24, mat: A.gloss }, 8));
  gr.add(A.box(0.55, 0.06, 0.45, '#2b2b2b', { x: cx1 - 0.4, y: 0.86, z: cz, cast: false })); // stove
  gr.add(A.cyl(0.13, 0.12, 0.16, night ? '#e8e2d2' : '#c94b3a', { x: cx1 - 0.48, y: 0.92, z: cz, mat: A.gloss }, 16)); // pot
  gr.add(A.box(0.6, 0.3, 0.45, '#d8d4cc', { x: cx1 - 0.4, y: 1.75, z: cz - 0.05 })); // range hood
  gr.add(A.plane(cw, 0.7, A.draw(160, 70, (c, w, h) => { c.fillStyle = '#f4f1ea'; c.fillRect(0, 0, w, h); c.strokeStyle = '#d6d1c6'; c.lineWidth = 1; for (let x = 0; x < w; x += 10) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); } for (let y = 0; y < h; y += 10) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); } }), { x: (cx0 + cx1) / 2, y: 1.22, z: z1 + 0.01 }));
  const kv = B.draw(96, 64, (c, w, h) => { const gg = c.createLinearGradient(0, 0, 0, h); if (night) { gg.addColorStop(0, '#1a2440'); gg.addColorStop(1, '#2c3a58'); } else if (lit) { gg.addColorStop(0, '#f2a96b'); gg.addColorStop(1, '#fbe0b8'); } else { gg.addColorStop(0, '#a9d4f2'); gg.addColorStop(1, '#eef6f0'); } c.fillStyle = gg; c.fillRect(0, 0, w, h); c.fillStyle = night ? '#121a2c' : '#6f9a5a'; c.beginPath(); c.arc(20, h, 30, 0, 7); c.arc(70, h + 6, 34, 0, 7); c.fill(); c.fillStyle = '#e8e6e0'; c.fillRect(w / 2 - 1, 0, 3, h); });
  gr.add(B.plane(0.8, 0.55, kv, { x: cx0 + 0.55, y: 1.65, z: z1 + 0.015, mat: B.glow }));
  gr.add(A.box(0.86, 0.04, 0.06, '#e8e6e0', { x: cx0 + 0.55, y: 1.36, z: z1 + 0.03, cast: false }));
  gr.add(A.box(cw * 0.45, 0.025, 0.25, '#b48a5e', { x: cx1 - cw * 0.25, y: 2.0, z: z1 + 0.13 }));
  for (let i = 0; i < 6; i++) gr.add(A.cyl(0.04, 0.035, 0.1 + (i % 3) * 0.03, ['#c94b3a', '#e8e2d2', '#5b8f7a', '#e8a33c', '#3a6aa8', '#f2efe6'][i], { x: cx1 - cw * 0.45 + i * 0.12, y: 2.025, z: z1 + 0.13 }, 10));
  // fridge
  gr.add(A.rbox(0.68, 1.75, 0.66, 0.03, '#eeeeea', { x: x1 - 0.38, z: z1 + 0.36, mat: A.gloss }));
  gr.add(A.box(0.02, 0.5, 0.03, '#b9b9b9', { x: x1 - 0.68, y: 1.1, z: z1 + 0.7, mat: A.gloss, cast: false }));
  gr.add(A.plane(0.12, 0.16, A.draw(24, 32, (c, w, h) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h); c.fillStyle = '#c0392b'; c.fillRect(2, 2, w - 4, 6); c.fillStyle = '#555'; for (let y = 12; y < h; y += 4) c.fillRect(3, y, w - 6, 1); }), { x: x1 - 0.48, y: 1.35, z: z1 + 0.695 }));
  // doorway frame + noren
  gr.add(K.box(0.08, KD.top, 0.12, beamMat, { x: KD.x0 - 0.04, z: ZN }));
  gr.add(K.box(0.08, KD.top, 0.12, beamMat, { x: KD.x1 + 0.04, z: ZN }));
  gr.add(K.box(KD.x1 - KD.x0 + 0.16, 0.08, 0.12, beamMat, { y: KD.top, z: ZN, x: (KD.x0 + KD.x1) / 2 }));
  gr.add(A.cyl(0.012, 0.012, KD.x1 - KD.x0, '#6b4a32', { x: (KD.x0 + KD.x1) / 2, y: KD.top - 0.04, z: ZN + 0.07, rz: Math.PI / 2, cast: false }, 6));
  const noren = B.draw(160, 96, (c, w, h) => {
    c.fillStyle = '#2b4a7a'; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 2;
    for (let y = 30; y < h + 10; y += 14) for (let x = (y % 28 ? 0 : 10); x < w + 10; x += 20) { c.beginPath(); c.arc(x, y, 10, Math.PI, 0); c.stroke(); }
    c.fillStyle = '#f4efe2'; c.beginPath(); c.arc(w / 2, h * 0.32, 20, 0, 7); c.fill();
    c.fillStyle = '#2b4a7a'; c.font = `800 24px ${K.JP_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('森', w / 2, h * 0.33);
    c.fillStyle = '#1d3458'; for (let i = 1; i < 3; i++) c.fillRect(i * w / 3 - 1, h * 0.12, 2, h);
  });
  const nw = (KD.x1 - KD.x0) / 3;
  for (let i = 0; i < 3; i++) {
    const geo = new THREE.PlaneGeometry(nw - 0.012, 0.62);
    const uv = geo.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / 3); // each panel shows its third
    gr.add(K.mesh(B.mapUV(geo, noren), B.matte, { x: KD.x0 + nw * (i + 0.5), y: KD.top - 0.35, z: ZN + 0.075 + (i % 2) * 0.004, cast: false }));
  }
  return gr;
}

function woodClock(A, hh, mm) {
  // pendulum wall clock (柱時計) in a wooden case; the pendulum is animated
  const gr = new THREE.Group();
  gr.add(A.box(0.36, 0.62, 0.12, { all: '#6b4a32', front: A.draw(72, 124, (c, w, h) => { c.fillStyle = '#6b4a32'; c.fillRect(0, 0, w, h); c.fillStyle = '#3a281a'; c.fillRect(10, 74, w - 20, 44); c.strokeStyle = '#c9a65a'; c.lineWidth = 2; c.strokeRect(10, 74, w - 20, 44); }) }, { y: -0.5 }));
  gr.add(K.mesh(A.paint(new THREE.CylinderGeometry(0.15, 0.15, 0.04, 24), '#6b4a32'), A.matte, { rx: Math.PI / 2, y: 0.03, z: 0.04 }));
  const face = A.draw(112, 112, (c, w, h) => {
    c.fillStyle = '#fbf6e8'; c.beginPath(); c.arc(w / 2, h / 2, w / 2, 0, 7); c.fill();
    c.strokeStyle = '#c9a65a'; c.lineWidth = 3; c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 2, 0, 7); c.stroke();
    c.fillStyle = '#2a2a2a'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `700 ${w * 0.13}px serif`;
    const rom = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; c.save(); c.translate(w / 2 + Math.sin(a) * w * 0.36, h / 2 - Math.cos(a) * h * 0.36); c.font = `700 ${w * 0.09}px serif`; c.fillText(rom[i], 0, 0); c.restore(); }
  });
  gr.add(A.plane(0.26, 0.26, face, { y: 0.03, z: 0.061 }));
  const hand = (len, wd, ang, z) => { const m = K.mesh(A.paint(new THREE.BoxGeometry(wd, len, 0.004), '#1a1a1a'), A.matte, { y: 0.03, z, cast: false }); m.geometry.translate(0, len / 2 - 0.012, 0); m.rotation.z = -ang; gr.add(m); };
  hand(0.07, 0.011, ((hh % 12) + mm / 60) / 12 * Math.PI * 2, 0.066);
  hand(0.105, 0.007, mm / 60 * Math.PI * 2, 0.07);
  const pend = new THREE.Group(); pend.userData.dynamic = true; pend.name = 'pendulum';
  pend.add(A.box(0.008, 0.26, 0.004, '#c9a65a', { y: -0.26, mat: A.gloss, cast: false }));
  pend.add(K.mesh(A.paint(new THREE.CylinderGeometry(0.035, 0.035, 0.008, 16), '#d8b45a'), A.gloss, { y: -0.27, rx: Math.PI / 2, cast: false }));
  pend.position.set(0, -0.15, 0.065);
  gr.add(pend);
  return gr;
}

function cupboard(A, m) {
  const gr = new THREE.Group();
  const glass = A.draw(64, 96, (c, w, h) => {
    c.fillStyle = '#5a3c26'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#d9cbb0'; c.fillRect(3, 3, w - 6, h - 6);
    for (let s = 0; s < 3; s++) {
      const y = 6 + s * 30;
      c.fillStyle = '#8f6040'; c.fillRect(3, y + 26, w - 6, 3);
      for (let k = 0; k < 4; k++) { c.fillStyle = ['#fbfaf6', '#3a6aa8', '#c94b3a', '#e8e2d2'][(k + s) % 4]; c.beginPath(); c.ellipse(10 + k * 14, y + 18, 6, 9, 0, 0, 7); c.fill(); }
    }
    c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(w / 2 - 1, 3, 2, h - 6);
  });
  gr.add(A.box(0.74, 1.0, 0.42, { all: '#8f6040', front: glass }, { y: 0.85 }));
  gr.add(A.box(0.74, 0.85, 0.44, { all: '#8f6040', front: A.draw(48, 48, (c, w, h) => { c.fillStyle = '#8f6040'; c.fillRect(0, 0, w, h); c.strokeStyle = '#4a2f1c'; c.lineWidth = 2; c.strokeRect(2, 2, w / 2 - 3, h - 4); c.strokeRect(w / 2 + 1, 2, w / 2 - 3, h - 4); c.fillStyle = '#d8c47a'; c.fillRect(w / 2 - 6, h / 2 - 4, 3, 8); c.fillRect(w / 2 + 3, h / 2 - 4, 3, 8); }) }, {}));
  gr.add(K.box(0.78, 0.04, 0.46, m, { y: 1.85 }));
  gr.add(A.rbox(0.28, 0.22, 0.24, 0.05, '#e9e6df', { x: 0.15, y: 0.85, z: 0.05 })); // rice cooker on the counter
  return gr;
}

function calendarRegion(B, season) {
  const month = { spring: '4', summer: '7', autumn: '10', winter: '1' }[season] || '4';
  return B.draw(96, 138, (c, w, h) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
    c.fillStyle = { spring: '#f6c6d3', summer: '#9fd3ea', autumn: '#f0a85a', winter: '#dfe8f0' }[season] || '#eee'; c.fillRect(5, 5, w - 10, 50);
    c.fillStyle = '#c0392b'; c.font = `800 18px ${K.JP_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(`${month}月`, w / 2, 68);
    c.font = `500 8px ${K.JP_FONT}`;
    for (let d = 0; d < 30; d++) { c.fillStyle = d % 7 === 0 ? '#c0392b' : '#444'; c.fillText(String(d + 1), 9 + (d % 7) * 13, 84 + Math.floor(d / 7) * 11); }
    c.fillStyle = '#c0392b'; c.beginPath(); c.arc(9 + 5 * 13, 84 + 11, 5, 0, 7); c.lineWidth = 1; c.strokeStyle = '#c0392b'; c.stroke();
  });
}

function gardenWindow(A, wood, season, lit, GW) {
  const gr = new THREE.Group();
  const w = GW.x1 - GW.x0; const h = GW.top; const cx = (GW.x0 + GW.x1) / 2;
  const alu = K.mat('#b9b3a6', { metal: 0.4, rough: 0.4 });
  gr.add(K.box(w + 0.1, 0.05, 0.14, wood, { x: cx, y: 0.0, z: ZN }));
  gr.add(K.box(w + 0.1, 0.08, 0.14, wood, { x: cx, y: h, z: ZN }));
  for (const x of [GW.x0, GW.x1]) gr.add(K.box(0.06, h, 0.14, wood, { x, z: ZN }));
  for (let i = 1; i < 4; i++) gr.add(K.box(0.04, h, 0.05, alu, { x: GW.x0 + i * w / 4, z: ZN + (i % 2 ? 0.02 : -0.02), cast: false }));
  gr.add(K.mesh(new THREE.PlaneGeometry(w, h), K.glassMat(), { x: cx, y: h / 2, z: ZN - 0.01, cast: false, receive: false }));
  // curtains: drapes bunched at both sides + a sheer lace panel half-drawn
  const drape = K.mat(lit ? '#c99a6a' : '#d9b48a', { rough: 0.95 });
  for (const [x, n] of [[GW.x0 + 0.18, 5], [GW.x1 - 0.18, 5]]) for (let i = 0; i < n; i++) { const c = K.mesh(new THREE.CylinderGeometry(0.05, 0.06, h + 0.15, 8, 1, true), drape, { x: x + (i - 2) * 0.07, y: (h + 0.15) / 2 - 0.02, z: ZN + 0.12, cast: false }); c.scale.z = 0.6; gr.add(c); }
  const lace = A.draw(32, 64, (c, cw, ch) => { c.fillStyle = '#fbf8f0'; c.fillRect(0, 0, cw, ch); c.fillStyle = 'rgba(200,190,170,0.6)'; for (let y = 4; y < ch; y += 8) for (let x = (y % 16 ? 2 : 6); x < cw; x += 8) c.fillRect(x, y, 3, 3); });
  for (let i = 0; i < 3; i++) { const p = A.plane(0.12, h, lace, { x: GW.x1 - 0.36 - i * 0.11, y: h / 2, z: ZN + 0.08 + (i % 2) * 0.02, ry: (i % 2 ? 0.25 : -0.25) }); gr.add(p); }
  gr.add(A.box(w + 0.6, 0.06, 0.06, '#8a6a4a', { x: cx, y: h + 0.1, z: ZN + 0.12, cast: false }));
  return gr;
}

function gardenView(A, B, { time, season, rain, lit }) {
  const gr = new THREE.Group();   // ground, deck, fence, neighbours (scenery)
  const gd = new THREE.Group();   // the garden itself (the prop): tree, flower beds, lantern, stones, shrubs
  gr.add(gd);
  const night = time === 'night';
  const r = K.rng(64);
  const gy = -0.45;
  const grass = K.mat('#ffffff', { map: K.noiseTex(season === 'winter' ? '#8a8f74' : season === 'autumn' ? '#7f8a52' : '#6f9a5a', 0.12, [10, 10], 'homegrass'), rough: 0.95 });
  gr.add(K.mesh(new THREE.PlaneGeometry(26, 14, 10, 6), grass, { rx: -Math.PI / 2, x: -1, y: gy, z: ZN - 7, cast: false }));
  // engawa deck + stepping stones + gravel
  gr.add(K.box(4.0, 0.06, 0.9, K.mat('#ffffff', { map: K.woodTex('#a07a52', [3, 1], 6), rough: 0.6 }), { x: -2.55, y: -0.1, z: ZN - 0.5 }));
  gr.add(A.box(3.8, 0.35, 0.8, '#7a6a58', { x: -2.55, y: gy, z: ZN - 0.5, cast: false }));
  for (const [x, z] of [[-2.3, -6.2], [-1.9, -6.9], [-2.4, -7.6], [-1.8, -8.3]]) gd.add(A.cyl(0.24, 0.26, 0.06, '#9a958a', { x, y: gy, z }, 10));
  // cherry tree (or the season's version of it)
  const tree = gardenTree(A, season);
  tree.position.set(-4.4, gy - 0.2, -10.2); gd.add(tree);
  // flower beds along the deck
  const fl = { spring: ['#f6c6d3', '#f2d64a', '#ffffff', '#e86a8a', '#9b7fd1'], summer: ['#4a7fd1', '#f2d64a', '#e85a4a'], autumn: ['#e86a8a', '#ffffff', '#c94bd1', '#f0a030'], winter: ['#c8243a', '#ffffff'] }[season] || ['#f6c6d3'];
  for (let i = 0; i < 26; i++) {
    const x = -3.9 + r() * 3.2; const z = ZN - 1.2 - r() * 0.5;
    gd.add(K.mesh(A.paint(new THREE.SphereGeometry(0.1, 6, 5), ['#4f7a45', '#5f9a50'][i % 2]), A.matte, { x, y: gy + 0.08, z }));
    if (season !== 'winter' || i % 3 === 0) gd.add(K.mesh(A.paint(new THREE.SphereGeometry(0.045, 6, 5), fl[i % fl.length]), A.matte, { x: x + 0.03, y: gy + 0.2, z: z + 0.03, cast: false }));
  }
  // stone lantern (灯籠)
  const lan = new THREE.Group();
  lan.add(A.cyl(0.18, 0.22, 0.12, '#a39e92', {}, 6)); lan.add(A.cyl(0.06, 0.08, 0.55, '#a39e92', { y: 0.12 }, 8));
  lan.add(A.box(0.3, 0.22, 0.3, { all: '#a39e92', front: night || time === 'evening' ? '#ffd27a' : '#5a564e' }, { y: 0.67, mat: night || time === 'evening' ? A.glow : A.matte }));
  lan.add(K.mesh(A.paint(new THREE.ConeGeometry(0.32, 0.2, 6), '#8f8a80'), A.matte, { y: 0.98 }));
  lan.position.set(-1.9, gy, -7.4); gd.add(lan);
  // a small maple / shrub and a hydrangea-ish bush
  for (const [x, z, s, c] of [[-1.2, -9.4, 0.8, season === 'autumn' ? '#c4452f' : '#5f8f4a'], [-3.0, -6.8, 0.55, '#4f7a45'], [0.4, -6.3, 0.5, '#3f6a3e']]) {
    gd.add(K.mesh(A.paint(new THREE.IcosahedronGeometry(s, 1), c), A.matte, { x, y: gy + s * 0.9, z }));
  }
  // wooden board fence (板塀) + neighbours behind (backdrop)
  const fence = A.draw(128, 48, (c, w, h) => { c.fillStyle = '#8a6a4a'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(40,25,10,0.35)'; for (let x = 0; x < w; x += 8) c.fillRect(x, 0, 1.5, h); c.fillStyle = '#5a4030'; c.fillRect(0, 0, w, 4); });
  gr.add(A.box(14, 1.8, 0.06, { all: '#8a6a4a', back: fence, front: fence }, { x: -1.5, y: gy, z: -11.2, cast: false }));
  const bd = B.draw(256, 96, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    const houses = [[0, 40, 70, '#d9cdb8', '#6b5a48'], [74, 30, 60, '#e8e0d4', '#45505e'], [140, 46, 64, '#efe6d6', '#8a4f3c'], [206, 36, 50, '#e3d3bd', '#5d6f86']];
    for (const [x, y, ww, col, roof] of houses) {
      c.fillStyle = night ? shadeHex(col, 0.35) : col; c.fillRect(x, y, ww, h - y);
      c.fillStyle = night ? shadeHex(roof, 0.4) : roof; c.beginPath(); c.moveTo(x - 4, y + 2); c.lineTo(x + ww / 2, y - 18); c.lineTo(x + ww + 4, y + 2); c.fill();
      for (let k = 0; k < 2; k++) { c.fillStyle = lit && (x + k) % 3 ? '#ffd27a' : night ? '#22293a' : '#9fb4c4'; c.fillRect(x + 10 + k * (ww / 2), y + 14, 14, 12); }
    }
    for (let i = 0; i < 9; i++) { c.fillStyle = night ? '#1a2a1a' : ['#4f7a45', '#3f6a3e', '#5f8f55'][i % 3]; c.beginPath(); c.arc(i * 30 + 10, h - 8, 18 + (i % 3) * 6, 0, 7); c.fill(); }
  });
  gr.add(B.plane(22, 8.2, bd, { x: -1.5, y: gy + 3.4, z: -13.5 }));
  // dynamic: drifting petals / leaves
  const dyn = new THREE.Group(); dyn.userData.dynamic = true; gr.add(dyn);
  let petals = null;
  if (season === 'spring' || season === 'autumn') {
    const n = 60; const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pos.set([-4.2 + (r() - 0.5) * 4, gy + r() * 4, -9.4 + (r() - 0.5) * 4], i * 3);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    petals = new THREE.Points(geo, new THREE.PointsMaterial({ color: season === 'spring' ? '#f4b8c8' : '#d9772f', size: 0.035 }));
    petals.frustumCulled = false; dyn.add(petals);
  }
  const tick = (dt, t) => {
    if (!petals) return;
    const p = petals.geometry.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) {
      p[i + 1] -= dt * (0.3 + (i % 5) * 0.05); p[i] += Math.sin(t + i) * dt * 0.2;
      if (p[i + 1] < gy) { p[i + 1] = gy + 4; p[i] = -4.2 + Math.sin(i * 9.1) * 2; }
    }
    petals.geometry.attributes.position.needsUpdate = true;
  };
  return { group: gr, garden: gd, tick };
}

function gardenTree(A, season) {
  const gr = new THREE.Group();
  const bark = '#4f3b2c';
  gr.add(A.cyl(0.13, 0.22, 1.5, bark, {}, 8));
  const r = K.rng(31);
  const limbs = [];
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + 0.3; const len = 1.4 + r() * 0.5; const tilt = 1.05;
    const b = A.cyl(0.04, 0.09, len, bark, {}, 6);
    b.position.set(0, 1.35, 0); b.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt); gr.add(b);
    limbs.push([Math.cos(a) * len * Math.sin(tilt), 1.35 + len * Math.cos(tilt), Math.sin(a) * len * Math.sin(tilt)]);
  }
  const pal = { spring: ['#f7c9d6', '#f1b2c5', '#fbe0e8', '#ecaabd', '#fff0f4'], summer: ['#4f8a45', '#5f9a50', '#3f7a3a'], autumn: ['#d9772f', '#e8a23a', '#c4452f', '#d9b04a'], winter: [] }[season] || ['#4f8a45'];
  if (pal.length) {
    for (let i = 0; i < 70; i++) {
      const [lx, ly, lz] = limbs[i % limbs.length];
      const s = 0.28 + r() * 0.3;
      gr.add(K.mesh(A.paint(new THREE.IcosahedronGeometry(s, 1), pal[Math.floor(r() * pal.length)]), A.matte, { x: lx * (0.4 + r() * 0.7) + (r() - 0.5) * 0.8, y: ly + (r() - 0.3) * 0.8, z: lz * (0.4 + r() * 0.7) + (r() - 0.5) * 0.8 }));
    }
  } else {
    for (let i = 0; i < 18; i++) { const tw = A.cyl(0.012, 0.03, 0.9, bark, {}, 4); const [lx, ly, lz] = limbs[i % limbs.length]; tw.position.set(lx, ly, lz); tw.rotation.set((r() - 0.5) * 1.8, 0, (r() - 0.5) * 1.8); gr.add(tw); }
  }
  return gr;
}

function sofaMesh(m, A) {
  // 3-seater facing +z
  const gr = new THREE.Group();
  gr.add(K.rbox(1.9, 0.42, 0.85, 0.08, m, { y: 0.0 }));
  gr.add(K.rbox(1.9, 0.5, 0.22, 0.08, m, { y: 0.35, z: -0.32 }));
  for (const x of [-0.85, 0.85]) gr.add(K.rbox(0.2, 0.3, 0.85, 0.07, m, { x, y: 0.35 }));
  for (const x of [-0.5, 0.0, 0.5]) gr.add(K.rbox(0.5, 0.1, 0.58, 0.04, m, { x, y: 0.4, z: 0.08 }));
  gr.add(A.rbox(0.4, 0.38, 0.14, 0.07, '#e8b95a', { x: -0.55, y: 0.48, z: -0.12, rx: -0.3 }));
  gr.add(A.rbox(0.38, 0.36, 0.14, 0.07, '#c96a4a', { x: 0.62, y: 0.48, z: -0.12, rx: -0.3, ry: 0.2 }));
  gr.add(A.rbox(0.42, 0.04, 0.3, 0.02, '#b86a4a', { x: 0.45, y: 0.82, z: -0.33, cast: false })); // knitted throw draped over the back
  gr.add(A.rbox(0.42, 0.32, 0.04, 0.02, '#b86a4a', { x: 0.45, y: 0.52, z: -0.47, cast: false }));
  for (const [x, z] of [[-0.85, -0.35], [0.85, -0.35], [-0.85, 0.35], [0.85, 0.35]]) gr.add(A.box(0.05, 0.06, 0.05, '#4a3020', { x, y: -0.06, z, cast: false }));
  gr.position.y = 0.06;
  return gr;
}

function rug(A) {
  return A.box(2.2, 0.008, 1.7, { all: '#c9b48a', top: A.draw(128, 100, (c, w, h) => { c.fillStyle = '#d9c39a'; c.fillRect(0, 0, w, h); c.strokeStyle = '#a8603a'; c.lineWidth = 4; c.strokeRect(6, 6, w - 12, h - 12); c.strokeStyle = '#6a8a7a'; c.lineWidth = 2; c.strokeRect(14, 14, w - 28, h - 28); c.fillStyle = 'rgba(168,96,58,0.3)'; for (let i = 0; i < 5; i++) c.fillRect(24 + i * 18, h / 2 - 3, 10, 6); }) }, { cast: false });
}

function lowTable(m, A, season) {
  const gr = new THREE.Group();
  gr.add(K.rbox(1.0, 0.04, 0.6, 0.015, m, { y: 0.36 }));
  for (const [x, z] of [[-0.44, -0.24], [0.44, -0.24], [-0.44, 0.24], [0.44, 0.24]]) gr.add(K.box(0.04, 0.36, 0.04, m, { x, z }));
  gr.add(A.box(0.2, 0.012, 0.28, { all: '#efeadf', top: A.draw(40, 56, (c, w, h) => { c.fillStyle = '#efeadf'; c.fillRect(0, 0, w, h); c.fillStyle = '#222'; c.font = `800 9px ${K.JP_FONT}`; c.fillText('新聞', 3, 10); c.fillStyle = 'rgba(40,40,40,0.5)'; for (let y = 16; y < h - 3; y += 4) c.fillRect(3, y, w - 6, 1.5); }) }, { x: 0.25, y: 0.4, z: 0.05, ry: 0.3, cast: false }));
  gr.add(A.box(0.05, 0.02, 0.16, '#2a2a2a', { x: -0.2, y: 0.4, z: 0.1, ry: 0.4, cast: false }));
  if (season === 'winter') { const b = fruitBowl(A, 'winter'); b.position.set(-0.25, 0.4, -0.1); gr.add(b); }
  return gr;
}

function tvSet(A, B, m, lit) {
  const gr = new THREE.Group();
  gr.add(A.box(1.5, 0.42, 0.42, { all: '#6b4a32', front: A.draw(96, 28, (c, w, h) => { c.fillStyle = '#7a5538'; c.fillRect(0, 0, w, h); c.strokeStyle = '#4a2f1c'; c.lineWidth = 2; c.strokeRect(2, 2, w / 2 - 3, h - 4); c.strokeRect(w / 2 + 1, 2, w / 2 - 3, h - 4); c.fillStyle = '#d8c47a'; c.fillRect(w / 2 - 8, h / 2 - 1, 5, 2); c.fillRect(w / 2 + 3, h / 2 - 1, 5, 2); }) }, {}));
  gr.add(A.box(0.3, 0.03, 0.2, '#1f1f1f', { y: 0.42 }));
  gr.add(A.box(0.05, 0.12, 0.05, '#1f1f1f', { y: 0.44 }));
  gr.add(A.rbox(1.12, 0.66, 0.05, 0.01, '#1a1a1a', { y: 0.55, mat: A.gloss }));
  const scr = B.draw(160, 90, (c, w, h) => {
    // evening baseball broadcast (Shun's favourite)
    const gg = c.createLinearGradient(0, 0, 0, h); gg.addColorStop(0, '#2a5a2a'); gg.addColorStop(1, '#3f7f3a'); c.fillStyle = gg; c.fillRect(0, 0, w, h);
    c.fillStyle = '#c9a06a'; c.beginPath(); c.moveTo(w / 2, h * 0.35); c.lineTo(w * 0.8, h * 0.7); c.lineTo(w / 2, h); c.lineTo(w * 0.2, h * 0.7); c.fill();
    c.fillStyle = '#ffffff'; c.fillRect(w / 2 - 2, h * 0.62, 4, 4);
    c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(6, 6, 58, 22); c.fillStyle = '#ffffff'; c.font = `700 9px ${K.JP_FONT}`; c.fillText('東京 3 - 2 大阪', 9, 15); c.fillText('7回ウラ', 9, 25);
  });
  gr.add(B.plane(1.06, 0.6, scr, { y: 0.88, z: 0.027, mat: B.glow }));
  return gr;
}

function ceilingLight(A, lit) {
  const gr = new THREE.Group();
  gr.add(A.cyl(0.32, 0.32, 0.04, '#e8e2d6', { y: -0.05, cast: false }, 24));
  gr.add(K.mesh(A.paint(new THREE.SphereGeometry(0.3, 20, 6, 0, Math.PI * 2, 0, Math.PI / 2), lit ? '#fff4dc' : '#f4f2ec'), lit ? A.glow : A.matte, { y: -0.05, rx: Math.PI, cast: false }));
  return gr;
}

function washitsu(g, A, B, { tatamiMat, beamMat, lightWood, shojiMat, wallMat, season, winter, lit }) {
  const w = WSX - XW; const d = ZS - WSZ; const cx = (XW + WSX) / 2; const cz = (WSZ + ZS) / 2;
  // tatami (six mats with borders)
  const tat = new THREE.Group();
  const mats = [[0, 0, 1], [1, 0, 1], [2, 0, 0], [0, 1, 0], [1, 1, 1], [2, 1, 1]];
  for (const [i, j, rot] of mats) {
    const mw = w / 3; const md = d / 2;
    const m = K.mesh(new THREE.BoxGeometry(mw - 0.01, 0.04, md - 0.01), tatamiMat, { x: XW + mw * (i + 0.5), y: 0.02, z: WSZ + md * (j + 0.5), ry: rot ? 0 : 0, cast: false });
    tat.add(m);
  }
  g.add(tat);
  // threshold (敷居) and lintel (鴨居) on the open east side, ranma above
  g.add(K.box(0.1, 0.045, d, beamMat, { x: WSX, z: cz, cast: false }));
  g.add(K.box(0.1, 0.08, d, beamMat, { x: WSX, y: 1.8, z: cz }));
  const ranma = A.draw(256, 64, (c, cw, ch) => { c.fillStyle = '#efe4cc'; c.fillRect(0, 0, cw, ch); c.strokeStyle = '#6b4a32'; c.lineWidth = 2; for (let x = 0; x <= cw; x += 8) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, ch); c.stroke(); } for (let y = 0; y <= ch; y += 8) { c.beginPath(); c.moveTo(0, y); c.lineTo(cw, y); c.stroke(); } c.lineWidth = 4; c.strokeRect(2, 2, cw - 4, ch - 4); for (let i = 1; i < 4; i++) c.fillRect(i * cw / 4 - 2, 0, 4, ch); });
  g.add(A.box(0.04, H - 1.88, d, { all: '#6b4a32', right: ranma, left: ranma }, { x: WSX, y: 1.88, z: cz, cast: false }));
  // north side: closed fusuma (both faces), lintel, wall above
  const fus = A.draw(160, 128, (c, cw, ch) => {
    c.fillStyle = '#efe6d2'; c.fillRect(0, 0, cw, ch);
    c.fillStyle = 'rgba(160,140,100,0.25)'; for (let i = 0; i < 30; i++) c.fillRect((i * 37) % cw, (i * 53) % ch, 8, 1);
    c.fillStyle = '#7a8a6a'; c.beginPath(); c.moveTo(0, ch * 0.8); for (let x = 0; x <= cw; x += 10) c.lineTo(x, ch * 0.72 - Math.sin(x * 0.05) * 10); c.lineTo(cw, ch); c.lineTo(0, ch); c.fill();
    c.fillStyle = '#c94b3a'; c.beginPath(); c.arc(cw * 0.75, ch * 0.25, 9, 0, 7); c.fill();
    c.strokeStyle = '#5a3c26'; c.lineWidth = 3; for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(i * cw / 4, 0); c.lineTo(i * cw / 4, ch); c.stroke(); }
    c.fillStyle = '#3a2a1a'; for (let i = 0; i < 4; i++) c.fillRect(i * cw / 4 + (i % 2 ? 6 : cw / 4 - 10), ch / 2, 4, 6);
  });
  g.add(A.box(w, 1.8, 0.04, { all: '#5a3c26', front: fus, back: fus }, { x: cx, z: WSZ }));
  g.add(K.box(w, 0.08, 0.1, beamMat, { x: cx, y: 1.8, z: WSZ }));
  g.add(K.mesh(new THREE.BoxGeometry(w, H - 1.88, 0.04), wallMat, { x: cx, y: 1.88 + (H - 1.88) / 2, z: WSZ, cast: false }));
  // two fusuma slid open, stacked at the south end of the east side
  const fus2 = A.draw(40, 128, (c, cw, ch) => { c.fillStyle = '#efe6d2'; c.fillRect(0, 0, cw, ch); c.fillStyle = '#7a8a6a'; c.fillRect(0, ch * 0.75, cw, ch * 0.25); c.strokeStyle = '#5a3c26'; c.lineWidth = 3; c.strokeRect(1, 1, cw - 2, ch - 2); });
  for (const k of [0, 1]) g.add(A.box(0.03, 1.78, 0.72, { all: '#5a3c26', right: fus2, left: fus2 }, { x: WSX + (k ? 0.03 : -0.03), y: 0.02, z: ZS - 0.38 - k * 0.04, cast: false }));
  // tokonoma on the west wall: raised board, hanging scroll, ikebana
  g.add(K.box(0.6, 0.12, 1.5, lightWood, { x: XW + 0.3, y: 0.0, z: 0.25 }));
  g.add(K.box(0.62, 0.1, 0.08, beamMat, { x: XW + 0.31, y: 0.0, z: 1.02, cast: false }));
  g.add(K.box(0.1, H, 0.1, beamMat, { x: XW + 0.62, z: -0.5, cast: false })); // tokobashira
  g.add(K.box(0.62, 0.1, 1.5, beamMat, { x: XW + 0.31, y: 1.95, z: 0.25, cast: false }));
  const scroll = B.draw(48, 140, (c, cw, ch) => {
    c.fillStyle = '#9a8a6a'; c.fillRect(0, 0, cw, ch); c.fillStyle = '#f4eedc'; c.fillRect(5, 14, cw - 10, ch - 30);
    c.fillStyle = '#222'; c.font = `500 26px serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    const word = { spring: '春', summer: '夏', autumn: '秋', winter: '和' }[season] || '和'; c.fillText(word, cw / 2, ch * 0.32);
    c.font = `500 15px serif`; c.fillText('一期一会', cw / 2, ch * 0.62); c.fillStyle = '#c0392b'; c.fillRect(cw / 2 - 4, ch * 0.8, 8, 8);
    c.fillStyle = '#4a3a2a'; c.fillRect(0, 0, cw, 4); c.fillRect(0, ch - 6, cw, 6);
  });
  g.add(B.plane(0.42, 1.2, scroll, { x: XW + 0.02, y: 1.2, z: 0.25, ry: Math.PI / 2 }));
  const ike = new THREE.Group();
  ike.add(A.cyl(0.12, 0.1, 0.06, '#3a3a3a', { mat: A.gloss }, 16));
  const fcol = { spring: '#f6c6d3', summer: '#4a7fd1', autumn: '#e8a23a', winter: '#c8243a' }[season] || '#f6c6d3';
  for (let i = 0; i < 5; i++) { ike.add(A.cyl(0.004, 0.004, 0.45 - i * 0.05, '#5a4030', { y: 0.05, rz: (i - 2) * 0.25, cast: false }, 4)); ike.add(K.mesh(A.paint(new THREE.SphereGeometry(0.035, 8, 6), i % 2 ? fcol : '#ffffff'), A.matte, { x: -(i - 2) * 0.1, y: 0.45 - i * 0.04, cast: false })); }
  ike.position.set(XW + 0.3, 0.12, 0.6); g.add(ike);
  // shoji window on the south wall (lit from the outside / evening lamp inside)
  g.add(K.mesh(new THREE.PlaneGeometry(1.6, 1.1), shojiMat, { x: cx + 0.2, y: 1.35, z: ZS - 0.02, ry: Math.PI, cast: false }));
  g.add(K.box(1.68, 0.05, 0.06, beamMat, { x: cx + 0.2, y: 0.78, z: ZS - 0.03, cast: false }));
  // low table: chabudai, or kotatsu in winter; zabuton cushions
  if (winter) {
    const kot = new THREE.Group();
    kot.add(A.rbox(1.2, 0.36, 1.2, 0.12, '#b5523b', { y: 0.04 }));
    kot.add(A.box(1.25, 0.06, 0.06, '#d9b25b', { y: 0.06, z: 0.6, cast: false }));
    kot.add(K.box(0.9, 0.03, 0.9, lightWood, { y: 0.4 }));
    const bowl = fruitBowl(A, 'winter'); bowl.position.set(0.0, 0.43, 0); kot.add(bowl);
    kot.position.set(cx + 0.15, 0, cz); g.add(kot);
  } else {
    g.add(K.cyl(0.42, 0.42, 0.03, lightWood, { x: cx + 0.15, y: 0.32, z: cz }, 24));
    for (const a of [0, 2.1, 4.2]) g.add(A.cyl(0.03, 0.03, 0.3, '#5a3c26', { x: cx + 0.15 + Math.cos(a) * 0.3, y: 0.03, z: cz + Math.sin(a) * 0.3 }, 6));
    const yu = yunomi(A); yu.position.set(cx + 0.25, 0.35, cz - 0.1); g.add(yu);
  }
  for (const [dx, dz] of [[-0.75, 0], [0.15, 0.78], [0.15, -0.8]]) g.add(A.rbox(0.55, 0.07, 0.55, 0.03, '#7a3a5a', { x: cx + 0.15 + dx, y: 0.04, z: cz + dz }));
  // paper lamp (andon) in the corner
  const andon = new THREE.Group();
  andon.add(A.box(0.24, 0.5, 0.24, { all: lit ? '#ffe2a8' : '#f4ecd8' }, { y: 0.05, mat: lit ? A.glow : A.matte }));
  for (const [x, z] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]]) andon.add(A.box(0.025, 0.6, 0.025, '#3a2a1a', { x, z }));
  andon.position.set(XW + 0.95, 0.04, ZS - 0.3); g.add(andon);
}
