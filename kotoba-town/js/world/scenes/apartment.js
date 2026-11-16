// apartment — the open-air outdoor corridor (外廊下) on the 2nd floor of a small 3-storey マンション.
// The learner has just moved into 201 and stands between their own door (201, left-behind) and the
// neighbours' porch alcove (202, 森): intercom by the hand, Aya at her open door, Shun behind her in the
// alcove. The corridor runs ahead to a parked bicycle, the mailboxes and the stairs; over the railing on
// the right: a cherry tree, the street, houses with lit windows, utility poles.
// Learner stands at the origin looking toward -z.
import * as THREE from 'three';
import * as K from '../kit.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const meta = { indoor: false, ambience: 'apartment' };

const WX = -0.75;       // face of the building wall (doors) — corridor x ∈ [WX, PX]
const PX = 0.72;        // inner face of the parapet
const OX = 1.15;        // outer face of the building (slab edges)
const Z0 = 2.6; const Z1 = -9.4; // corridor ends (near / far: stairs beyond)
const CH = 2.5;         // corridor ceiling
const GY = -2.9;        // street level

export default function build({ setup }) {
  const time = setup.time || 'evening';
  const season = setup.season || 'spring';
  const rain = setup.weather === 'rain';
  const lit = time === 'evening' || time === 'night';
  const night = time === 'night';
  const g = new THREE.Group();
  const A = makeAtlas(1024, 4);
  const B = makeAtlas(1024, 1);
  const props = {};
  const add = (o, x = 0, y = 0, z = 0, ry = 0) => { o.position.set(x, y, z); o.rotation.y = ry; g.add(o); return o; };

  // ------------------------------------------------------------------ materials
  const wallMat = K.mat('#ffffff', { map: K.noiseTex('#efe6d6', 0.05, [3, 3], 'aptwall'), rough: 0.92 });
  const concMat = K.mat('#ffffff', { map: K.noiseTex('#d9d2c5', 0.07, [4, 2], 'aptconc'), rough: 0.95 });
  const tileMat = K.mat('#ffffff', { map: K.tileTex('#c9b9a2', '#c2b199', 12, [6, 2], '#a8987f'), rough: 0.85 });
  const floorMat = K.mat('#ffffff', { map: floorTex(), rough: rain ? 0.25 : 0.8, metal: rain ? 0.15 : 0 });
  const ceilMat = K.mat('#f1eee8', { rough: 1, emissive: lit ? '#3a3226' : '#000000', emissiveIntensity: 0.6 });
  const alu = K.mat('#c9ccd0', { metal: 0.55, rough: 0.35 });
  const doorMat = K.mat('#ffffff', { map: K.woodTex('#7a5538', [1, 1], 1), rough: 0.5 });
  const steelDoor = K.mat('#e6e1d6', { metal: 0.2, rough: 0.5 });

  // ------------------------------------------------------------------ corridor shell
  const len = Z0 - Z1;
  const zc = (Z0 + Z1) / 2;
  g.add(K.mesh(new THREE.PlaneGeometry(PX - WX + 0.2, len, 1, 8), floorMat, { rx: -Math.PI / 2, x: (WX + PX) / 2 + 0.1, z: zc, cast: false }));
  g.add(K.mesh(new THREE.PlaneGeometry(OX - WX, len + 1.0, 1, 8), ceilMat, { rx: Math.PI / 2, x: (WX + OX) / 2, y: CH, z: zc - 0.5, cast: false }));
  // gutter strip along the parapet
  g.add(A.box(0.12, 0.012, len, '#8d8a84', { x: PX - 0.06, z: zc, cast: false }));
  // building wall with openings: [201 door], [PS], [202 alcove], … built from pieces
  const wallSeg = (z0, z1, y0 = 0, y1 = CH) => g.add(K.mesh(new THREE.PlaneGeometry(z0 - z1, y1 - y0), wallMat, { x: WX, y: (y0 + y1) / 2, z: (z0 + z1) / 2, ry: Math.PI / 2, cast: false }));
  const AL = { z0: -0.8, z1: -1.85, depth: 0.9 };         // 202 alcove
  const AL3 = { z0: -4.45, z1: -5.5, depth: 0.9 };        // 203 alcove
  wallSeg(Z0, AL.z0); wallSeg(AL.z1, AL3.z0); wallSeg(AL3.z1, Z1 - 4.4);
  // skirting
  g.add(A.box(0.02, 0.1, len + 4.4, '#9a8f80', { x: WX + 0.01, z: zc - 2.2, cast: false }));
  // near end wall (behind the learner)
  g.add(K.mesh(new THREE.PlaneGeometry(OX - WX, CH), wallMat, { x: (WX + OX) / 2, y: CH / 2, z: Z0, ry: Math.PI, cast: false }));
  for (const al of [AL, AL3]) alcove(g, A, wallMat, ceilMat, al);

  // parapet: concrete base + aluminium bars + top rail; structural columns on the outer line
  const cols = [2.25, -2.6, -6.9];
  g.add(K.box(0.18, 0.35, len, concMat, { x: PX + 0.09, z: zc }));
  g.add(K.box(OX - PX - 0.18, 0.35, len, concMat, { x: PX + 0.18 + (OX - PX - 0.18) / 2, y: -0.25, z: zc, cast: false }));
  g.add(K.box(0.1, 0.05, len, alu, { x: PX + 0.08, y: 1.05, z: zc }));
  g.add(K.box(0.04, 0.03, len, alu, { x: PX + 0.08, y: 0.37, z: zc, cast: false }));
  for (let z = Z0 - 0.06; z > Z1; z -= 0.11) {
    if (cols.some((c) => Math.abs(z - c) < 0.26)) continue;
    g.add(K.box(0.022, 0.68, 0.022, alu, { x: PX + 0.08, y: 0.37, z }));
  }
  for (const c of cols) g.add(K.box(OX - PX + 0.05, CH + 0.4, 0.42, concMat, { x: (PX + OX) / 2 + 0.02, y: -0.4, z: c }));
  // outer slab edges + upper / lower floors' parapets seen from outside
  g.add(K.box(0.25, 0.45, len + 4.4, concMat, { x: OX - 0.12, y: CH - 0.2, z: zc - 2.2, cast: false }));
  g.add(K.box(0.2, 1.55, len + 4.4, tileMat, { x: OX - 0.1, y: CH + 0.25, z: zc - 2.2, cast: false }));
  g.add(K.box(0.2, -GY - 0.25, len + 4.4, tileMat, { x: OX - 0.1, y: GY, z: zc - 2.2, cast: false }));
  for (const zz of [Z0 + 0.15, Z1 - 4.55]) g.add(K.box(OX - WX + 0.6, CH + 1.6 - GY, 0.3, tileMat, { x: (WX + OX) / 2 - 0.3, y: GY, z: zz }));

  // ------------------------------------------------------------------ 201 (the learner's door, near)
  const myDoor = K.prop('my_door', flushDoor(A, doorMat, alu, { number: '201', name: '', mine: true }), { labelJa: 'わたしの ドア', labelEn: 'my door (201)' });
  add(myDoor, WX, 0, 0.475, Math.PI / 2);
  add(intercom(A, '201', ''), WX + 0.01, 1.35, 1.12, Math.PI / 2);
  add(gridWindow(A, alu, false), WX, 1.0, 1.85, Math.PI / 2);
  // moving day: a flattened carton and a small stack of boxes by 201
  add(A.box(0.55, 0.42, 0.4, { all: '#c8a171', top: A.text(['ひっこし', '201'], 0.55, 0.4, { bg: '#c8a171', fg: '#6a4a2a', size: 0.4, radius: 0, ppm: 160 }) }), WX + 0.32, 0, 1.5, 0.08);
  add(A.box(0.62, 0.9, 0.03, '#c19865', { rz: 0.0 }), WX + 0.05, 0, 2.15, Math.PI / 2 + 0.05);
  // PS (meter box) door between 201 and 202
  add(psDoor(A, steelDoor, 'PS 201・202'), WX + 0.01, 0, -0.26, Math.PI / 2);
  // fire extinguisher at the near end
  add(extinguisher(A), 0.35, 0, Z0 - 0.15, Math.PI);

  // ------------------------------------------------------------------ 202 (森): alcove, open door
  const icom = K.prop('intercom', intercom(A, '202', ''), { labelJa: 'インターホン', labelEn: 'intercom' });
  add(icom, WX + 0.01, 1.35, -0.62, Math.PI / 2);
  const ax = WX - AL.depth; // back wall of the alcove (door plane)
  const neighbourDoor = new THREE.Group();
  const leaf = openDoorLeaf(A, doorMat, alu);
  leaf.position.set(ax + 0.03, 0, AL.z1 + 0.1); leaf.rotation.y = 1.42; // hinge on the far side, held open
  neighbourDoor.add(leaf);
  neighbourDoor.add(doorFrame(A, alu, AL.z1 + 0.1, AL.z0 - 0.1, ax));
  const doorN = K.prop('door_neighbor', neighbourDoor, { labelJa: 'もりさんの ドア', labelEn: "the Moris' door (202)" });
  g.add(doorN);
  // warm hallway glimpse behind the doorway
  add(B.plane(0.8, 2.0, B.draw(64, 160, (c, w, h) => { const gg = c.createLinearGradient(0, 0, 0, h); gg.addColorStop(0, '#ffe2b0'); gg.addColorStop(0.7, '#e8b98a'); gg.addColorStop(1, '#a8805a'); c.fillStyle = gg; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(90,60,40,0.35)'; c.fillRect(0, h * 0.62, w * 0.45, h * 0.38); }), { mat: B.glow }), ax - 0.6, 1.0, (AL.z0 + AL.z1) / 2, Math.PI / 2);
  const plate = K.prop('nameplate', namePlate(A, B, '202', '森'), { labelJa: 'ひょうさつ（もり）', labelEn: 'nameplate "Mori"' });
  add(plate, WX + 0.012, 1.74, AL.z1 - 0.2, Math.PI / 2);
  // Aya's flowers by the door (she works at a flower shop)
  add(flowerPot(A, ['#f08aa0', '#ffd36b', '#ffffff']), ax + 0.55, 0, AL.z0 - 0.2);
  // umbrella stand across from the alcove, against the parapet
  const ustand = K.prop('umbrella_stand', umbrellaStand(A, rain), { labelJa: 'かさたて', labelEn: 'umbrella stand' });
  add(ustand, PX - 0.2, 0, -1.6, -Math.PI / 2);
  add(gridWindow(A, alu, lit), WX, 1.0, -2.75, Math.PI / 2);
  add(psDoor(A, steelDoor, 'PS 203・204'), WX + 0.01, 0, -3.85, Math.PI / 2);

  // ------------------------------------------------------------------ 203 / 204 further down
  const d203 = new THREE.Group();
  d203.add(doorFrame(A, alu, AL3.z1 + 0.1, AL3.z0 - 0.1, WX - AL3.depth));
  const leaf3 = flushDoor(A, doorMat, alu, { number: '', name: '' }); leaf3.position.set(WX - AL3.depth + 0.02, 0, (AL3.z0 + AL3.z1) / 2); leaf3.rotation.y = Math.PI / 2; d203.add(leaf3);
  g.add(d203);
  add(namePlate(A, B, '203', '田中'), WX + 0.012, 1.74, AL3.z1 - 0.2, Math.PI / 2);
  add(intercom(A, '203', ''), WX + 0.01, 1.35, AL3.z0 + 0.15, Math.PI / 2);
  add(tricycle(A), WX + 0.35, 0, AL3.z1 - 0.65, 0.4);
  add(flowerPot(A, ['#9b7fd1', '#ffffff']), WX + 0.16, 0, -7.25, Math.PI / 2);
  add(gridWindow(A, alu, lit), WX, 1.0, -6.75, Math.PI / 2);
  add(flushDoor(A, doorMat, alu, { number: '204', name: '山本' }), WX, 0, -8.35, Math.PI / 2);
  add(intercom(A, '204', ''), WX + 0.01, 1.35, -7.75, Math.PI / 2);
  add(alarmBox(A), WX + 0.01, 1.2, -9.1, Math.PI / 2);

  // bicycle parked far down the corridor (far) — whose? Shun's.
  const bike = K.prop('bicycle', bicycle(A, season), { labelJa: 'じてんしゃ', labelEn: 'bicycle' });
  add(bike, PX - 0.32, 0, -6.1, 0.06);
  // freestanding mailboxes by the stairs (far)
  const mail = K.prop('mailbox', mailboxes(A, B), { labelJa: 'ゆうびんうけ', labelEn: 'mailboxes' });
  add(mail, PX - 0.22, 0, -8.75, -Math.PI / 2 + 0.35);

  // ------------------------------------------------------------------ stairs at the far end
  const stairs = K.prop('stairs', stairCore(A, B, concMat, alu, wallMat, lit), { labelJa: 'かいだん', labelEn: 'stairs' });
  add(stairs, 0, 0, Z1);

  // ------------------------------------------------------------------ corridor lights
  const lampZ = [1.4, -1.3, -3.9, -6.4, -8.8];
  for (const z of lampZ) add(ceilingLamp(A, lit), -0.15, CH, z);
  if (lit) {
    for (const z of [-0.6, -5.2]) { const l = new THREE.PointLight('#ffd9a8', night ? 7 : 4.5, 6.5, 1.5); l.position.set(-0.1, 2.25, z); g.add(l); }
    const al = new THREE.PointLight('#ffcf96', 3, 3, 1.6); al.position.set(ax + 0.4, 2.2, (AL.z0 + AL.z1) / 2); g.add(al);
  }

  // gift held by the learner (near): a box wrapped with noshi paper 「御挨拶」
  const gift = K.prop('gift', giftBox(A, B), { labelJa: 'プレゼント', labelEn: 'gift' });
  gift.position.set(0.06, 1.02, -0.33); gift.rotation.set(0.12, -0.12, 0);
  g.add(gift);

  // ------------------------------------------------------------------ outside: yard, street, houses
  const outside = streetView(A, B, { time, season, rain, lit, night });
  g.add(outside.group);

  for (const o of [gift, doorN, icom, plate, myDoor, bike, mail, ustand, stairs]) props[o.userData.propId] = o;

  A.commit(); B.commit();
  const aya = { x: -0.42, z: -1.28 };
  const shun = { x: -1.2, z: -1.4 };
  return K.finalize({
    group: g,
    spawn: K.spot(0, 0, 0),
    slots: {
      npc1: K.spot(aya.x, aya.z, K.faceYaw(aya, { x: 0, z: 0 })),
      npc2: K.spot(shun.x, shun.z, K.faceYaw(shun, { x: 0, z: 0.2 })),
      phone: null,
    },
    props,
    center: new THREE.Vector3(1.5, 0, -3.5),
    radius: 11,
    update(dt, t) { outside.update(dt, t); },
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

/** Merge meshes (same material) of a small dynamic object into one mesh per material. */
function mergeParts(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const byMat = new Map();
  group.traverse((o) => { if (o.isMesh) { if (!byMat.has(o.material)) byMat.set(o.material, []); byMat.get(o.material).push(o); } });
  const out = new THREE.Group();
  for (const [m, list] of byMat) {
    const geos = list.map((o) => { const gg = (o.geometry.index ? o.geometry : o.geometry).clone(); gg.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)); return gg; });
    let v = 0; let ic = 0; for (const gg of geos) { v += gg.attributes.position.count; ic += gg.index ? gg.index.count : gg.attributes.position.count; }
    const pos = new Float32Array(v * 3); const nor = new Float32Array(v * 3); const uv = new Float32Array(v * 2); const idx = new Uint32Array(ic);
    let vo = 0; let io = 0;
    for (const gg of geos) {
      pos.set(gg.attributes.position.array, vo * 3); nor.set(gg.attributes.normal.array, vo * 3); uv.set(gg.attributes.uv.array, vo * 2);
      if (gg.index) for (let i = 0; i < gg.index.count; i++) idx[io++] = gg.index.array[i] + vo;
      else for (let i = 0; i < gg.attributes.position.count; i++) idx[io++] = i + vo;
      vo += gg.attributes.position.count;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    const mm = new THREE.Mesh(geo, m); mm.castShadow = list[0].castShadow; out.add(mm);
  }
  return out;
}

function floorTex() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#9d9a94'; g.fillRect(0, 0, 256, 512);
  const r = K.rng(8);
  for (let i = 0; i < 6000; i++) { const v = r() > 0.5 ? 255 : 0; g.fillStyle = `rgba(${v},${v},${v},${r() * 0.07})`; g.fillRect(r() * 256, r() * 512, 2, 2); }
  g.fillStyle = 'rgba(60,60,60,0.25)'; g.fillRect(0, 0, 256, 2); // sheet seams
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 6); t.anisotropy = 4;
  return t;
}

function alcove(g, A, wallMat, ceilMat, al) {
  const d = al.depth; const x0 = WX - d;
  const plane = (w, h, o) => g.add(K.mesh(new THREE.PlaneGeometry(w, h), wallMat, { cast: false, ...o }));
  plane(d, CH, { x: WX - d / 2, y: CH / 2, z: al.z0, ry: Math.PI });        // near side wall (faces -z)
  plane(d, CH, { x: WX - d / 2, y: CH / 2, z: al.z1 });                     // far side wall (faces +z)
  // back wall around a 0.85 × 2.05 door opening
  const dz0 = al.z0 - 0.1; const dz1 = al.z1 + 0.1;
  plane(0.1, CH, { x: x0, y: CH / 2, z: al.z0 - 0.05, ry: Math.PI / 2 });
  plane(0.1, CH, { x: x0, y: CH / 2, z: al.z1 + 0.05, ry: Math.PI / 2 });
  plane(dz0 - dz1, CH - 2.05, { x: x0, y: (CH + 2.05) / 2, z: (dz0 + dz1) / 2, ry: Math.PI / 2 });
  g.add(K.mesh(new THREE.PlaneGeometry(d, al.z0 - al.z1), ceilMat, { rx: Math.PI / 2, x: WX - d / 2, y: CH, z: (al.z0 + al.z1) / 2, cast: false }));
  g.add(A.box(d, 0.015, al.z0 - al.z1, { all: '#b8ab98', top: A.draw(64, 64, (c, w, h) => { c.fillStyle = '#b9ad9b'; c.fillRect(0, 0, w, h); c.strokeStyle = '#998d7c'; c.lineWidth = 2; for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(i * w / 4, 0); c.lineTo(i * w / 4, h); c.stroke(); c.beginPath(); c.moveTo(0, i * h / 4); c.lineTo(w, i * h / 4); c.stroke(); } }) }, { x: WX - d / 2, z: (al.z0 + al.z1) / 2, cast: false }));
  // door mat
  g.add(A.box(0.6, 0.012, 0.42, { all: '#6b5a48', top: A.draw(48, 32, (c, w, h) => { c.fillStyle = '#7a6650'; c.fillRect(0, 0, w, h); c.strokeStyle = '#5a4a38'; c.lineWidth = 2; c.strokeRect(3, 3, w - 6, h - 6); }) }, { x: x0 + 0.35, y: 0.015, z: (al.z0 + al.z1) / 2, ry: Math.PI / 2, cast: false }));
}

function flushDoor(A, doorMat, alu, { number, name, mine }) {
  // closed steel entrance door, facing +z local, centred, bottom at 0
  const gr = new THREE.Group();
  gr.add(K.box(0.97, 2.12, 0.05, alu, { z: -0.02, cast: false }));
  gr.add(K.box(0.85, 2.03, 0.045, doorMat, { z: 0.01 }));
  gr.add(A.box(0.14, 0.03, 0.06, '#c9c9c9', { x: 0.33, y: 1.0, z: 0.06, mat: A.gloss, cast: false })); // lever
  gr.add(A.box(0.03, 0.12, 0.02, '#b9b9b9', { x: 0.36, y: 0.94, z: 0.04, mat: A.gloss, cast: false }));
  gr.add(A.cyl(0.018, 0.018, 0.012, '#c9c9c9', { x: 0.36, y: 1.15, z: 0.04, rx: Math.PI / 2, mat: A.gloss, cast: false }, 10)); // cylinder lock
  gr.add(A.cyl(0.008, 0.008, 0.01, '#3a3a3a', { y: 1.5, z: 0.04, rx: Math.PI / 2, cast: false }, 8)); // door scope
  gr.add(A.box(0.3, 0.06, 0.012, '#9a9a9a', { y: 0.9, z: 0.036, mat: A.gloss, cast: false })); // mail slot
  if (number) gr.add(A.plane(0.2, 0.08, A.text([number], 0.2, 0.08, { bg: '#f4efe4', fg: '#4a3a2a', radius: 0.1, ppm: 400 }), { y: 2.22, z: 0.0 }));
  if (name) gr.add(A.plane(0.16, 0.07, A.text([name], 0.16, 0.07, { bg: '#fbf8f0', fg: '#333', radius: 0.05, ppm: 420 }), { x: 0, y: 1.62, z: 0.036 }));
  if (mine) {
    // brand-new resident: a handwritten paper tag in the name holder + a community notice board clip (回覧板) on the lever
    gr.add(A.plane(0.16, 0.07, A.draw(64, 28, (c, w, h) => { c.fillStyle = '#fffdf6'; c.fillRect(0, 0, w, h); c.strokeStyle = '#b8b0a0'; c.strokeRect(1, 1, w - 2, h - 2); c.fillStyle = '#7a8aa0'; c.font = `500 12px ${K.JP_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('201', w / 2, h / 2); }), { y: 1.62, z: 0.036 }));
  }
  return gr;
}

function doorFrame(A, alu, zA, zB, x) {
  const gr = new THREE.Group();
  gr.add(K.box(0.08, 2.1, 0.05, alu, { x: x + 0.02, z: zA - 0.02, cast: false }));
  gr.add(K.box(0.08, 2.1, 0.05, alu, { x: x + 0.02, z: zB + 0.02, cast: false }));
  gr.add(K.box(0.08, 0.05, zB - zA + 0.09, alu, { x: x + 0.02, y: 2.07, z: (zA + zB) / 2, cast: false }));
  gr.add(A.box(0.08, 0.02, zB - zA, '#8a8a88', { x: x + 0.02, z: (zA + zB) / 2, cast: false })); // threshold
  return gr;
}

function openDoorLeaf(A, doorMat, alu) {
  // hinge at the origin; leaf along +z (0.85); outer face +x, inner face -x (which faces the learner when open)
  const gr = new THREE.Group();
  gr.add(K.box(0.045, 2.03, 0.85, doorMat, { z: 0.425 }));
  gr.add(A.box(0.01, 2.0, 0.83, '#ece6da', { x: -0.025, z: 0.425, cast: false })); // inner face skin
  gr.add(A.box(0.06, 0.03, 0.14, '#c9c9c9', { x: -0.055, y: 1.0, z: 0.72, mat: A.gloss, cast: false })); // lever
  gr.add(A.box(0.02, 0.1, 0.04, '#b9b9b9', { x: -0.035, y: 1.0, z: 0.77, mat: A.gloss, cast: false }));
  gr.add(A.box(0.02, 0.06, 0.03, '#a9a9a9', { x: -0.035, y: 1.18, z: 0.77, mat: A.gloss, cast: false })); // thumb turn
  gr.add(A.box(0.03, 0.03, 0.12, '#9a9a9a', { x: -0.04, y: 1.35, z: 0.74, mat: A.gloss, cast: false })); // door guard
  gr.add(A.box(0.06, 0.12, 0.34, '#d8d2c6', { x: -0.055, y: 0.82, z: 0.42, cast: false })); // newspaper box
  gr.add(A.box(0.03, 0.05, 0.08, '#3a3a3a', { x: -0.035, y: 1.95, z: 0.5, cast: false })); // door closer
  gr.add(K.mesh(A.paint(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6), '#9a9a9a'), A.gloss, { x: -0.06, y: 1.97, z: 0.28, rx: Math.PI / 2 - 0.2, cast: false }));
  return gr;
}

function intercom(A, number, name) {
  const gr = new THREE.Group();
  const face = A.draw(40, 64, (c, w, h) => {
    c.fillStyle = '#e9e6df'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#2a2d31'; c.beginPath(); c.arc(w / 2, 12, 6, 0, 7); c.fill();
    c.fillStyle = '#556'; for (let y = 24; y < 36; y += 3) for (let x = 10; x < w - 8; x += 3) c.fillRect(x, y, 1.5, 1.5);
    c.fillStyle = '#c9c4ba'; K.roundRect(c, 8, 42, w - 16, 16, 4); c.fill();
    c.fillStyle = '#6fb3e0'; c.fillRect(w / 2 - 6, 48, 12, 4);
  });
  gr.add(A.box(0.1, 0.16, 0.035, { all: '#dcd8cf', front: face }, { cast: false }));
  gr.add(A.plane(0.1, 0.035, A.text([number], 0.1, 0.035, { bg: '#f8f5ee', fg: '#555', radius: 0.1, ppm: 500 }), { y: 0.19, z: 0.002 }));
  return gr;
}

function namePlate(A, B, number, name) {
  const gr = new THREE.Group();
  gr.add(A.box(0.26, 0.2, 0.025, '#6b4a32', { y: -0.1, cast: false }));
  gr.add(B.plane(0.22, 0.16, B.text([{ t: number, scale: 0.55, weight: 500 }, { t: name, scale: 1.25 }], 0.22, 0.16, { bg: '#fbf6ea', fg: '#2c2420', radius: 0.04, ppm: 520, size: 0.62 }), { z: 0.014 }));
  return gr;
}

function gridWindow(A, alu, lit) {
  // small frosted kitchen window with a security grille (面格子), facing +z, bottom at y
  const gr = new THREE.Group();
  const w = 0.9; const h = 0.8;
  const glass = A.draw(48, 40, (c, cw, ch) => { const gg = c.createLinearGradient(0, 0, 0, ch); if (lit) { gg.addColorStop(0, '#fff0c8'); gg.addColorStop(1, '#f2cf96'); } else { gg.addColorStop(0, '#d7dde0'); gg.addColorStop(1, '#bcc4c8'); } c.fillStyle = gg; c.fillRect(0, 0, cw, ch); c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(cw / 2 - 1, 0, 2, ch); });
  gr.add(A.plane(w, h, glass, { y: h / 2, z: 0.0, mat: lit ? A.glow : A.matte }));
  gr.add(K.box(w + 0.08, 0.05, 0.06, alu, { y: -0.03, z: 0.02, cast: false }));
  gr.add(K.box(w + 0.08, 0.05, 0.06, alu, { y: h, z: 0.02, cast: false }));
  for (const x of [-w / 2 - 0.02, w / 2 + 0.02]) gr.add(K.box(0.04, h, 0.06, alu, { x, z: 0.02, cast: false }));
  for (let i = 0; i < 9; i++) gr.add(K.box(0.018, h + 0.04, 0.018, alu, { x: -w / 2 + 0.05 + i * (w - 0.1) / 8, y: -0.02, z: 0.11 }));
  gr.add(K.box(w + 0.1, 0.025, 0.06, alu, { y: h * 0.5, z: 0.1, cast: false }));
  // vent hood above
  gr.add(A.box(0.16, 0.12, 0.1, '#cfcac0', { x: w / 2 + 0.25, y: h + 0.15, z: 0.05, cast: false }));
  return gr;
}

function psDoor(A, mat, label) {
  const gr = new THREE.Group();
  const w = 0.46; const h = 1.9;
  const face = A.draw(40, 160, (c, cw, ch) => {
    c.fillStyle = '#e6e1d6'; c.fillRect(0, 0, cw, ch);
    c.fillStyle = 'rgba(0,0,0,0.18)'; for (let y = 10; y < 40; y += 5) c.fillRect(6, y, cw - 12, 2); for (let y = ch - 40; y < ch - 10; y += 5) c.fillRect(6, y, cw - 12, 2);
    c.fillStyle = '#8a8a8a'; c.fillRect(cw - 10, ch / 2 - 8, 4, 16);
  });
  gr.add(A.box(w + 0.05, h + 0.04, 0.03, '#bdb7ab', { z: -0.01, cast: false }));
  gr.add(A.box(w, h, 0.03, { all: '#e6e1d6', front: face }, { z: 0.005, cast: false }));
  gr.add(A.plane(0.24, 0.06, A.text([label], 0.24, 0.06, { bg: '#ffffff', fg: '#555', radius: 0.1, ppm: 420 }), { y: 1.55, z: 0.022 }));
  return gr;
}

function extinguisher(A) {
  const gr = new THREE.Group();
  gr.add(A.box(0.3, 0.6, 0.22, { all: '#c8372d', front: A.text(['消火器'], 0.3, 0.6, { bg: '#c8372d', fg: '#ffffff', size: 0.25, radius: 0.02 }) }, {}));
  gr.add(A.cyl(0.07, 0.07, 0.45, '#d8412f', { y: 0.6, z: -0.02 }, 12));
  gr.add(A.cyl(0.03, 0.04, 0.06, '#2a2a2a', { y: 1.05, z: -0.02 }, 8));
  return gr;
}

function flowerPot(A, colors) {
  const gr = new THREE.Group();
  gr.add(A.rbox(0.42, 0.24, 0.2, 0.03, '#b46a4a', {}));
  gr.add(A.box(0.38, 0.02, 0.16, '#4a3a2a', { y: 0.23, cast: false }));
  const r = K.rng(colors.length * 7 + 3);
  for (let i = 0; i < 14; i++) {
    const x = (r() - 0.5) * 0.34; const z = (r() - 0.5) * 0.12; const y = 0.27 + r() * 0.16;
    gr.add(K.mesh(A.paint(new THREE.SphereGeometry(0.045, 7, 5), ['#4f8a45', '#5f9a50', '#3f7a3a'][i % 3]), A.matte, { x, y, z, cast: false }));
    if (i % 2 === 0) gr.add(K.mesh(A.paint(new THREE.SphereGeometry(0.03, 7, 5), colors[i % colors.length]), A.matte, { x: x + 0.02, y: y + 0.06, z: z + 0.02, cast: false }));
  }
  return gr;
}

function umbrellaStand(A, rain) {
  const gr = new THREE.Group();
  gr.add(A.cyl(0.13, 0.12, 0.42, '#5d7a8c', {}, 16));
  gr.add(K.mesh(A.paint(new THREE.TorusGeometry(0.13, 0.012, 6, 18), '#4a6273'), A.matte, { y: 0.42, rx: Math.PI / 2, cast: false }));
  const cols = rain ? ['#2f6a8f', '#e8e1d0', '#c0392b', '#3c3c44'] : ['#e8e1d0', '#3c3c44', '#d98aa0'];
  cols.forEach((c, i) => {
    const u = new THREE.Group();
    u.add(A.cyl(0.006, 0.006, 0.88, '#5a5a5a', {}, 6));
    u.add(A.cyl(0.035, 0.012, 0.5, c, { y: 0.22 }, 8));
    u.add(K.mesh(A.paint(new THREE.TorusGeometry(0.035, 0.008, 6, 10, Math.PI), '#4a3a2a'), A.matte, { y: 0.88, cast: false }));
    u.position.set(Math.cos(i * 1.7) * 0.05, 0.03, Math.sin(i * 1.7) * 0.05); u.rotation.set(Math.sin(i * 2.1) * 0.12, i, Math.cos(i * 1.3) * 0.12);
    gr.add(u);
  });
  return gr;
}

function tricycle(A) {
  const gr = new THREE.Group();
  const wheel = (x, z, r) => gr.add(K.mesh(A.paint(new THREE.TorusGeometry(r, 0.018, 6, 14), '#2a2a2a'), A.matte, { x, y: r, z, ry: Math.PI / 2 }));
  wheel(0, 0.22, 0.12); wheel(-0.16, -0.2, 0.08); wheel(0.16, -0.2, 0.08);
  gr.add(A.box(0.04, 0.04, 0.42, '#e05a4a', { y: 0.2, z: 0.02 }));
  gr.add(A.box(0.3, 0.03, 0.04, '#e05a4a', { y: 0.12, z: -0.2 }));
  gr.add(A.rbox(0.14, 0.04, 0.12, 0.02, '#2a6ab0', { y: 0.3, z: -0.08 }));
  gr.add(A.cyl(0.012, 0.012, 0.25, '#e05a4a', { y: 0.2, z: 0.2 }, 6));
  gr.add(A.box(0.26, 0.025, 0.025, '#d8d8d8', { y: 0.46, z: 0.2, cast: false }));
  return gr;
}

function alarmBox(A) {
  const gr = new THREE.Group();
  gr.add(A.box(0.22, 0.42, 0.06, { all: '#c8372d', front: A.text([{ t: '火災報知器', scale: 0.7 }, { t: '●', scale: 1.4, color: '#fff3c0' }, { t: 'つよく おす', scale: 0.55 }], 0.22, 0.42, { bg: '#c8372d', fg: '#ffffff', size: 0.5, radius: 0.04 }) }, { cast: false }));
  gr.add(K.mesh(A.paint(new THREE.SphereGeometry(0.045, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#ff3a2a'), A.glow, { y: 0.5, rx: Math.PI / 2, z: 0.03, cast: false }));
  return gr;
}

function bicycle(A, season) {
  // a mamachari (city bike) with a front basket, along local +z, kickstand down
  const gr = new THREE.Group();
  const frame = '#2f4f7a'; const R = 0.33;
  const tube = (x0, y0, z0, x1, y1, z1, r = 0.016, col = frame) => {
    const a = new THREE.Vector3(x0, y0, z0); const b = new THREE.Vector3(x1, y1, z1);
    const m = K.mesh(A.paint(new THREE.CylinderGeometry(r, r, a.distanceTo(b), 6), col), A.gloss, {});
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    gr.add(m);
  };
  for (const z of [0.55, -0.55]) {
    gr.add(K.mesh(A.paint(new THREE.TorusGeometry(R, 0.022, 6, 22), '#262626'), A.matte, { y: R, z, ry: Math.PI / 2 }));
    gr.add(K.mesh(A.paint(new THREE.TorusGeometry(R - 0.03, 0.006, 4, 22), '#c9c9c9'), A.gloss, { y: R, z, ry: Math.PI / 2, cast: false }));
    gr.add(A.cyl(0.03, 0.03, 0.08, '#9a9a9a', { y: R - 0.04, z, rz: Math.PI / 2, mat: A.gloss, cast: false }, 8));
  }
  tube(0, R, -0.55, 0, 0.62, -0.12); // seat stay / tube
  tube(0, 0.62, -0.12, 0, 0.36, 0.0);
  tube(0, 0.36, 0.0, 0, 0.72, 0.42, 0.02); // low step-through down tube
  tube(0, 0.72, 0.42, 0, R, 0.55, 0.014); // fork
  tube(0, 0.72, 0.42, 0, 1.0, 0.36, 0.014); // stem
  tube(-0.27, 1.0, 0.3, 0.27, 1.0, 0.3, 0.012, '#c9c9c9'); // handlebar
  tube(0, R, -0.55, 0, 0.36, 0.0, 0.012);
  gr.add(A.rbox(0.13, 0.05, 0.24, 0.02, '#3a2a22', { y: 0.82, z: -0.16 })); // saddle
  tube(0, 0.62, -0.12, 0, 0.82, -0.16, 0.012, '#c9c9c9');
  // mudguards, chain guard, rear rack, front basket, kickstand, bell, lamp
  gr.add(K.mesh(A.paint(new THREE.TorusGeometry(R + 0.03, 0.03, 4, 12, Math.PI * 0.7), '#c9c9c9'), A.gloss, { y: R, z: 0.55, ry: Math.PI / 2, rz: 0.4, cast: false }));
  gr.add(K.mesh(A.paint(new THREE.TorusGeometry(R + 0.03, 0.03, 4, 12, Math.PI * 0.7), '#c9c9c9'), A.gloss, { y: R, z: -0.55, ry: Math.PI / 2, rz: 1.5, cast: false }));
  gr.add(A.box(0.04, 0.1, 0.5, '#2a2a2a', { y: 0.28, z: -0.3, cast: false }));
  gr.add(A.box(0.22, 0.02, 0.36, '#9a9a9a', { y: 0.72, z: -0.52, mat: A.gloss }));
  const basket = new THREE.Group();
  basket.add(A.box(0.36, 0.02, 0.28, '#9a9a9a', { mat: A.gloss }));
  for (const [x, z, w, d] of [[0, 0.14, 0.36, 0.015], [0, -0.14, 0.36, 0.015], [0.18, 0, 0.015, 0.28], [-0.18, 0, 0.015, 0.28]]) basket.add(A.box(w, 0.22, d, '#b0b0b0', { x, z, mat: A.gloss }));
  basket.position.set(0, 0.86, 0.56); gr.add(basket);
  gr.add(A.box(0.02, 0.36, 0.02, '#9a9a9a', { y: 0.0, z: -0.35, rx: -0.3, cast: false }));
  gr.add(A.cyl(0.03, 0.03, 0.03, '#d8d8d8', { x: -0.18, y: 1.0, z: 0.3, mat: A.gloss, cast: false }, 10));
  gr.add(A.cyl(0.035, 0.03, 0.07, '#e8e1c0', { y: 0.8, z: 0.72, rx: Math.PI / 2, cast: false }, 10));
  // a yellow registration sticker + a bag in the basket in autumn/winter
  gr.add(A.box(0.002, 0.04, 0.08, '#f2c94c', { x: 0.022, y: 0.55, z: -0.1, cast: false }));
  if (season === 'winter' || season === 'autumn') gr.add(A.rbox(0.28, 0.16, 0.2, 0.04, '#7a5a3a', { y: 0.88, z: 0.56 }));
  return gr;
}

function mailboxes(A, B) {
  const gr = new THREE.Group();
  const front = B.draw(150, 180, (c, w, h) => {
    c.fillStyle = '#c9c6bf'; c.fillRect(0, 0, w, h);
    const names = [['201', ''], ['202', '森'], ['203', '田中'], ['204', '山本'], ['301', '佐藤'], ['302', '']];
    for (let i = 0; i < 6; i++) {
      const x = (i % 2) * w / 2 + 6; const y = Math.floor(i / 2) * h / 3 + 6; const bw = w / 2 - 12; const bh = h / 3 - 12;
      c.fillStyle = '#dcd9d2'; c.fillRect(x, y, bw, bh);
      c.fillStyle = '#4a4a4a'; c.fillRect(x + 8, y + 8, bw - 16, 6);
      c.fillStyle = '#ffffff'; c.fillRect(x + 8, y + bh - 22, bw - 16, 16);
      c.fillStyle = '#333'; c.font = `700 12px ${K.JP_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(`${names[i][0]} ${names[i][1]}`, x + bw / 2, y + bh - 14);
      c.fillStyle = '#9a9a9a'; c.fillRect(x + bw - 14, y + bh / 2 - 6, 4, 12);
    }
  });
  gr.add(B.box(0.62, 0.74, 0.32, { all: '#bdb9b1', front }, { y: 0.62 }));
  gr.add(A.box(0.66, 0.03, 0.36, '#8a8780', { y: 1.36 }));
  for (const x of [-0.25, 0.25]) gr.add(A.box(0.05, 0.62, 0.05, '#8a8780', { x }));
  gr.add(A.plane(0.4, 0.1, A.text(['ポスト'], 0.4, 0.1, { bg: '#2f5e8c', fg: '#fff', radius: 0.15 }), { y: 1.47, z: 0.0 }));
  return gr;
}

function stairCore(A, B, conc, alu, wallMat, lit) {
  // origin at the end of the corridor (z = Z1); everything goes toward -z
  const gr = new THREE.Group();
  const land = 1.0; const steps = 12; const rise = CH / steps; const run = 0.26;
  gr.add(A.box(PX - WX + 0.2, 0.02, land, '#9d9a94', { x: (WX + PX) / 2, y: -0.02, z: -land / 2, cast: false }));
  // up-flight (right half) to the 3rd floor
  const sx0 = 0.02; const sx1 = PX;
  for (let i = 0; i < steps; i++) {
    const z = -land - i * run;
    gr.add(A.box(sx1 - sx0, rise * (i + 1), run, { all: '#a9a59e', front: '#8f8b84', top: '#9d9a94' }, { x: (sx0 + sx1) / 2, z: z - run / 2 }));
    gr.add(A.box(sx1 - sx0, 0.012, 0.04, '#e0b94a', { x: (sx0 + sx1) / 2, y: rise * (i + 1), z: z - 0.03, cast: false })); // non-slip edge
  }
  // down-flight (left half) to the ground floor, behind a low wall
  for (let i = 0; i < steps; i++) {
    const z = -land - i * run;
    gr.add(A.box(-0.02 - WX, 0.03, run, '#8f8b84', { x: (WX - 0.02) / 2, y: -rise * (i + 1), z: z - run / 2, cast: false }));
  }
  gr.add(K.box(0.12, 1.0, steps * run, conc, { x: -0.04, z: -land - steps * run / 2 }));
  // walls of the stair core
  gr.add(K.box(0.18, CH * 2 - GY, steps * run + land + 0.4, conc, { x: PX + 0.18, y: GY, z: -(steps * run + land) / 2 }));
  gr.add(K.mesh(new THREE.PlaneGeometry(PX - WX + 0.3, CH * 2 - GY), wallMat, { x: (WX + PX) / 2, y: (CH * 2 + GY) / 2, z: -land - steps * run - 0.1, cast: false }));
  // handrails
  const rail = (x) => { const r = K.mesh(new THREE.CylinderGeometry(0.02, 0.02, Math.hypot(steps * run, CH), 8), alu, { x, y: 0.9 + CH / 2, z: -land - steps * run / 2, rx: Math.atan2(-steps * run, CH), cast: false }); gr.add(r); };
  rail(PX + 0.05); rail(0.0);
  gr.add(K.box(PX - WX, 0.04, 0.04, alu, { x: (WX + PX) / 2, y: 0.9, z: -0.02, cast: false }));
  // sign + light
  gr.add(B.plane(0.5, 0.18, B.text([{ t: '階段 ↑3F ↓1F', scale: 0.8 }], 0.5, 0.18, { bg: '#2f6a4a', fg: '#ffffff', radius: 0.1 }), { x: 0.36, y: 2.2, z: -0.05, mat: lit ? B.glow : B.matte }));
  gr.add(K.mesh(A.paint(new THREE.SphereGeometry(0.1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), lit ? '#fff2d0' : '#f4f2ec'), lit ? A.glow : A.matte, { x: 0.36, y: CH * 2 - 0.2, z: -land - steps * run * 0.6, rx: Math.PI, cast: false }));
  return gr;
}

function ceilingLamp(A, lit) {
  const gr = new THREE.Group();
  gr.add(A.cyl(0.16, 0.16, 0.03, '#d8d4cc', { y: -0.03, cast: false }, 18));
  gr.add(K.mesh(A.paint(new THREE.SphereGeometry(0.14, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), lit ? '#fff1d2' : '#f6f4ef'), lit ? A.glow : A.matte, { y: -0.03, rx: Math.PI, cast: false }));
  return gr;
}

function giftBox(A, B) {
  const top = B.draw(176, 120, (c, w, h) => {
    // wrapping paper
    c.fillStyle = '#f3e6cf'; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(200,120,120,0.35)'; for (let y = 6; y < h; y += 16) for (let x = (y % 32) ? 6 : 14; x < w; x += 16) { c.beginPath(); c.arc(x, y, 3, 0, 7); c.fill(); }
    // noshi paper band
    c.fillStyle = '#fffdf8'; c.fillRect(w * 0.3, 0, w * 0.4, h);
    c.fillStyle = '#c8372d'; c.fillRect(w * 0.3, h * 0.42, w * 0.4, 3); c.fillStyle = '#c8b25a'; c.fillRect(w * 0.3, h * 0.42 + 5, w * 0.4, 2);
    c.fillStyle = '#c8372d'; c.beginPath(); c.moveTo(w * 0.33, 8); c.lineTo(w * 0.37, 4); c.lineTo(w * 0.37, 22); c.fill();
    c.fillStyle = '#222'; c.font = `700 ${h * 0.14}px ${K.JP_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.save(); c.translate(w / 2, h * 0.22); c.fillText('御挨拶', 0, 0); c.restore();
  });
  const side = A.draw(32, 16, (c, w, h) => { c.fillStyle = '#f3e6cf'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(200,120,120,0.35)'; c.beginPath(); c.arc(8, 8, 3, 0, 7); c.arc(24, 8, 3, 0, 7); c.fill(); });
  const gr = new THREE.Group();
  gr.add(A.box(0.26, 0.075, 0.18, { all: side, top: '#f3e6cf' }, { y: -0.04 }));
  gr.add(B.plane(0.26, 0.18, top, { y: 0.036, rx: -Math.PI / 2 }));
  return gr;
}

// ------------------------------------------------------------------ outside
function streetView(A, B, { time, season, rain, lit, night }) {
  const gr = new THREE.Group();
  const r = K.rng(42);
  const groundMat = K.mat('#ffffff', { map: K.noiseTex(season === 'winter' ? '#8f8e84' : '#7f8a68', 0.1, [12, 12], 'aptground'), rough: 0.95 });
  const asphalt = K.mat('#ffffff', { map: K.noiseTex(rain ? '#4e5054' : '#6b6c6e', 0.12, [2, 20], 'aptroad'), rough: rain ? 0.25 : 0.9, metal: rain ? 0.2 : 0 });
  const wallC = K.mat('#ffffff', { map: K.noiseTex('#c9c2b4', 0.08, [8, 1], 'aptblock'), rough: 0.95 });
  // big ground, subdivided (avoid giant triangles under the camera)
  gr.add(K.mesh(new THREE.PlaneGeometry(90, 90, 18, 18), groundMat, { rx: -Math.PI / 2, x: 30, y: GY - 0.02, z: -4, cast: false }));
  gr.add(K.mesh(new THREE.PlaneGeometry(5.4, 90, 2, 24), asphalt, { rx: -Math.PI / 2, x: 7.3, y: GY, z: -4, cast: false }));
  for (const x of [4.9, 9.7]) gr.add(A.box(0.12, 0.01, 90, '#e8e6df', { x, y: GY, z: -4, cast: false }));
  gr.add(A.box(1.2, 0.15, 90, '#a7a39a', { x: 10.6, y: GY, z: -4, cast: false })); // sidewalk
  gr.add(A.box(2.2, 0.06, 40, '#8f8a7e', { x: OX + 1.1, y: GY, z: -4, cast: false })); // gravel strip by the building
  // hedge along the property line, with the entrance gap
  for (const [z0, z1] of [[-14, -0.6], [1.6, 10]]) gr.add(A.rbox(0.6, 0.9, z1 - z0, 0.2, season === 'autumn' ? '#5f7a3a' : '#4f7a45', { x: 4.2, y: GY, z: (z0 + z1) / 2 }));
  // the cherry tree in front of the building (its crown is at corridor height)
  const tree = yardTree(A, season, lit);
  tree.position.set(3.2, GY, -3.8); gr.add(tree);
  const tree2 = yardTree(A, season, lit, 0.8); tree2.position.set(2.9, GY, 7.5); gr.add(tree2);
  // houses across the street
  const houseCols = ['#efe6d6', '#e3d3bd', '#f2ece2', '#d9cdb8', '#e8e0d4', '#d6dccf'];
  const roofCols = ['#5d6f86', '#8a4f3c', '#4f5f50', '#6b5a48', '#45505e', '#7a6a5a'];
  [-21, -13, -5, 3, 11, 19].forEach((z, i) => {
    const w = 6.2 + r() * 1.2; const d = 7.5; const h = 5.6;
    const facade = B.draw(200, 150, (c, cw, ch) => houseFacade(c, cw, ch, houseCols[i], lit, night, i));
    const hx = 12.2 + d / 2 + (i % 2) * 0.8;
    gr.add(B.box(d, h, w, { all: houseCols[i], left: facade }, { x: hx, y: GY, z, cast: false }));
    const roof = prism(d + 0.6, 1.9, w + 0.6);
    gr.add(K.mesh(A.paint(roof, roofCols[i]), A.matte, { x: hx, y: GY + h, z, cast: false }));
    // block wall + gate pillars
    gr.add(K.box(0.15, 1.2, w - 1.4, wallC, { x: 11.65, y: GY, z: z + 0.7, cast: false }));
    gr.add(A.rbox(0.5, 1.0, w - 2.0, 0.2, '#557a48', { x: 12.05, y: GY, z: z + 0.9 }));
    if (i === 2) { const car = carMesh(A, '#c9d2dc'); car.position.set(13.4, GY, z - 2.6); car.rotation.y = Math.PI / 2; gr.add(car); }
  });
  // vending machine on the sidewalk (glows at dusk)
  const vm = vendingMachine(A, B, lit);
  vm.position.set(11.0, GY + 0.15, -8.2); vm.rotation.y = -Math.PI / 2; gr.add(vm);
  // utility poles with wires and street lamps
  const poleZ = [-26, -12, 2, 16, 30]; const PXo = 10.4; const top = GY + 10.5;
  for (const z of poleZ) {
    gr.add(A.cyl(0.13, 0.17, 10.5, '#9a958b', { x: PXo, y: GY, z }, 10));
    gr.add(A.box(0.12, 0.12, 1.4, '#6f6b63', { x: PXo, y: top - 1.0, z }));
    gr.add(A.box(0.1, 0.1, 1.0, '#6f6b63', { x: PXo, y: top - 1.8, z }));
    if (z === 2) gr.add(A.cyl(0.25, 0.25, 0.7, '#8d918f', { x: PXo + 0.35, y: top - 3.2, z }, 10));
    // street lamp arm toward the road
    gr.add(A.box(0.9, 0.06, 0.06, '#7a7670', { x: PXo - 0.45, y: GY + 5.0, z }));
    gr.add(A.box(0.36, 0.1, 0.16, lit ? '#fff3cf' : '#e8e8e2', { x: PXo - 0.9, y: GY + 4.9, z, mat: lit ? A.glow : A.matte, cast: false }));
  }
  for (let k = 0; k < poleZ.length - 1; k++) for (const [dy, dx] of [[-1.0, -0.6], [-1.0, 0.6], [-1.8, 0]]) {
    const y = top + dy; const z0 = poleZ[k]; const z1 = poleZ[k + 1]; const zm = (z0 + z1) / 2; const sag = 0.45;
    for (const [za, zb, ya, yb] of [[z0, zm, y, y - sag], [zm, z1, y - sag, y]]) {
      const l = Math.hypot(zb - za, yb - ya);
      gr.add(K.mesh(A.paint(new THREE.CylinderGeometry(0.012, 0.012, l, 4), '#2b2b2b'), A.matte, { x: PXo + dx, y: (ya + yb) / 2, z: (za + zb) / 2, rx: Math.atan2(zb - za, yb - ya), cast: false }));
    }
  }
  // distant town on a painted backdrop (transparent sky, real sky shows through)
  const bd = new THREE.Mesh(new THREE.CylinderGeometry(80, 80, 32, 40, 1, true, Math.PI / 2 - 1.35, 2.7),
    new THREE.MeshBasicMaterial({ map: backdropTex(time, season, rain), transparent: true, alphaTest: 0.02, side: THREE.BackSide, depthWrite: false }));
  bd.position.set(0, GY + 13, -4); bd.renderOrder = -5;
  gr.add(bd);
  // dynamic: drifting petals / leaves, and a car passing now and then
  const dyn = new THREE.Group(); dyn.userData.dynamic = true; gr.add(dyn);
  let petals = null;
  if (season === 'spring' || season === 'autumn') {
    const n = 90; const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pos.set([3.4 + (r() - 0.5) * 4, GY + r() * 6, -3.8 + (r() - 0.5) * 6], i * 3);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    petals = new THREE.Points(geo, new THREE.PointsMaterial({ color: season === 'spring' ? '#f7cdd8' : '#e0903a', size: 0.06, sizeAttenuation: true }));
    petals.frustumCulled = false; dyn.add(petals);
  }
  const car = mergeParts(carMesh(A, ['#b8433a', '#e8e6e0', '#2f3f5a'][Math.floor(r() * 3)], lit));
  car.position.set(6.4, GY, -40); dyn.add(car);
  return {
    group: gr,
    update(dt, t) {
      const k = (t * 7) % 160; car.position.z = k < 80 ? -40 + k : -40 + 80; // drives by, then waits
      car.visible = k < 80;
      if (petals) {
        const p = petals.geometry.attributes.position.array;
        for (let i = 0; i < p.length; i += 3) {
          p[i + 1] -= dt * (0.35 + (i % 7) * 0.04); p[i] += Math.sin(t * 1.3 + i) * dt * 0.25; p[i + 2] += Math.cos(t * 0.9 + i) * dt * 0.15;
          if (p[i + 1] < GY) { p[i + 1] = GY + 5.5; p[i] = 3.4 + Math.sin(i * 12.9) * 1.9; p[i + 2] = -3.8 + Math.cos(i * 7.3) * 3; }
        }
        petals.geometry.attributes.position.needsUpdate = true;
      }
    },
  };
}

/** Triangular prism (gable roof) with flat normals: width x, height y, length z; base at y = 0. */
function prism(w, h, l) {
  const hw = w / 2; const hl = l / 2;
  const P = { a: [-hw, 0, -hl], b: [hw, 0, -hl], c: [0, h, -hl], d: [-hw, 0, hl], e: [hw, 0, hl], f: [0, h, hl] };
  const faces = [['a', 'c', 'b'], ['d', 'e', 'f'], ['a', 'd', 'f', 'c'], ['b', 'c', 'f', 'e']];
  const pos = []; const idx = []; const uv = [];
  for (const f of faces) {
    const base = pos.length / 3;
    f.forEach((k) => { pos.push(...P[k]); uv.push(0, 0); });
    if (f.length === 3) idx.push(base, base + 1, base + 2); else idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  return geo;
}

function houseFacade(c, w, h, col, lit, night, i) {
  c.fillStyle = col; c.fillRect(0, 0, w, h);
  c.fillStyle = 'rgba(0,0,0,0.06)'; for (let y = 0; y < h; y += 6) c.fillRect(0, y, w, 1);
  const win = (x, y, ww, hh, on) => {
    c.fillStyle = '#6b6b6b'; c.fillRect(x - 2, y - 2, ww + 4, hh + 4);
    c.fillStyle = on ? (night ? '#ffd27a' : '#ffe2a6') : '#8ea4b5'; c.fillRect(x, y, ww, hh);
    if (on) { c.fillStyle = 'rgba(200,120,60,0.35)'; c.fillRect(x, y, ww * 0.3, hh); c.fillRect(x + ww * 0.7, y, ww * 0.3, hh); }
    c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(x + ww / 2 - 1, y, 2, hh);
  };
  const on = (k) => lit && ((i * 3 + k) % 4 !== 0);
  win(18, 22, 46, 34, on(0)); win(w - 70, 22, 50, 34, on(1));
  win(18, 92, 60, 40, on(2)); win(w - 60, 98, 26, 30, on(3));
  // balcony rail on the 1st floor, door
  c.fillStyle = 'rgba(80,80,80,0.6)'; c.fillRect(10, 58, 64, 4); for (let x = 12; x < 74; x += 6) c.fillRect(x, 58, 2, 16);
  c.fillStyle = '#6b4a32'; c.fillRect(w / 2 - 12, h - 52, 26, 52);
  c.fillStyle = lit ? '#ffe6a8' : '#d8d2c4'; c.beginPath(); c.arc(w / 2 + 22, h - 46, 4, 0, 7); c.fill();
  // AC unit and a little laundry pole
  c.fillStyle = '#e9e7e2'; c.fillRect(w - 46, 66, 30, 18); c.fillStyle = '#9a9a9a'; c.beginPath(); c.arc(w - 31, 75, 6, 0, 7); c.fill();
}

function yardTree(A, season, lit, scale = 1) {
  const gr = new THREE.Group();
  const s = scale;
  gr.add(A.cyl(0.14 * s, 0.22 * s, 3.6 * s, '#4f3b2c', {}, 8));
  const r = K.rng(Math.round(scale * 10) + 5);
  const branches = [[0.6, 0.7], [-0.5, 0.5], [0.2, -0.7], [-0.4, -0.5]];
  for (const [bx, bz] of branches) {
    const b = A.cyl(0.05 * s, 0.09 * s, 1.6 * s, '#4f3b2c', { y: 3.0 * s }, 6);
    b.rotation.set(bz * 0.9, 0, -bx * 0.9); gr.add(b);
  }
  const pal = { spring: ['#f7c9d6', '#f1b2c5', '#fbe0e8', '#ecaabd'], summer: ['#4f8a45', '#5f9a50', '#3f7a3a'], autumn: ['#d9772f', '#e8a23a', '#c4452f', '#d9b04a'], winter: [] }[season] || ['#4f8a45'];
  if (pal.length) for (let i = 0; i < 16; i++) {
    const a = r() * Math.PI * 2; const rad = (0.5 + r() * 1.2) * s;
    const y = (3.6 + r() * 1.6) * s;
    const sp = K.mesh(A.paint(new THREE.IcosahedronGeometry((0.65 + r() * 0.35) * s, 1), pal[i % pal.length]), A.matte, { x: Math.max(-0.45 * s, Math.cos(a) * rad), y, z: Math.sin(a) * rad });
    sp.scale.y = 0.75; gr.add(sp);
  }
  else for (let i = 0; i < 10; i++) { const tw = A.cyl(0.015, 0.03, 1.2 * s, '#4f3b2c', { y: (3.4 + r()) * s }, 4); tw.rotation.set((r() - 0.5) * 1.6, 0, (r() - 0.5) * 1.6); gr.add(tw); }
  return gr;
}

function vendingMachine(A, B, lit) {
  const gr = new THREE.Group();
  const front = B.draw(96, 180, (c, w, h) => {
    c.fillStyle = '#f4f2ee'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#d23a32'; c.fillRect(0, 0, w, 14);
    const cols = ['#c0392b', '#2f6db3', '#f1c40f', '#2ecc71', '#6b3a22', '#e67e22', '#ecf0f1', '#8e44ad'];
    for (let row = 0; row < 3; row++) for (let k = 0; k < 6; k++) {
      const x = 6 + k * 14.5; const y = 22 + row * 34;
      c.fillStyle = cols[(row * 3 + k) % cols.length]; c.fillRect(x, y, 10, 22);
      c.fillStyle = '#ffffff'; c.fillRect(x, y + 24, 10, 4); c.fillStyle = '#3ad13a'; c.fillRect(x + 3, y + 25, 4, 2);
    }
    c.fillStyle = '#3a3a3a'; c.fillRect(8, 128, 50, 24); c.fillRect(66, 128, 22, 10);
    c.fillStyle = '#2a2a2a'; c.fillRect(10, h - 22, w - 20, 14);
  });
  gr.add(B.box(0.95, 1.83, 0.75, { all: '#d23a32', front }, { mat: lit ? B.glow : B.matte }));
  gr.add(A.box(0.6, 0.25, 0.4, '#3a6ab0', { x: 0.9, cast: false })); // recycling bin
  return gr;
}

function carMesh(A, color, lights) {
  const gr = new THREE.Group();
  gr.add(A.rbox(1.65, 0.62, 3.9, 0.18, color, { y: 0.22 }));
  gr.add(A.rbox(1.45, 0.5, 2.0, 0.16, '#2b3440', { y: 0.78, z: -0.2 }));
  for (const [x, z] of [[-0.78, 1.25], [0.78, 1.25], [-0.78, -1.3], [0.78, -1.3]]) gr.add(A.cyl(0.3, 0.3, 0.22, '#1f1f1f', { x, y: 0.0, z, rz: Math.PI / 2 }, 12));
  gr.add(A.box(1.3, 0.1, 0.03, lights ? '#fff6d8' : '#e8e8e0', { y: 0.55, z: 1.96, mat: lights ? A.glow : A.matte, cast: false }));
  gr.add(A.box(1.3, 0.08, 0.03, '#d23a32', { y: 0.58, z: -1.96, mat: lights ? A.glow : A.matte, cast: false }));
  return gr;
}

function backdropTex(time, season, rain) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
  const g = c.getContext('2d'); const w = 1024; const h = 256;
  const r = K.rng(77);
  const dusk = time === 'evening'; const night = time === 'night';
  const far = night ? '#1c2438' : dusk ? '#8c7f9c' : rain ? '#9aa3ad' : '#a9bccb';
  const mid = night ? '#232c40' : dusk ? '#6f6684' : rain ? '#848d97' : '#93a7b5';
  // hills
  g.fillStyle = far; g.beginPath(); g.moveTo(0, h);
  for (let x = 0; x <= w; x += 16) g.lineTo(x, 120 + Math.sin(x * 0.006) * 22 + Math.sin(x * 0.019) * 8);
  g.lineTo(w, h); g.fill();
  // town blocks with windows
  for (let layer = 0; layer < 2; layer++) {
    let x = 0;
    while (x < w) {
      const bw = 14 + r() * 40; const bh = (layer ? 24 : 40) + r() * (layer ? 30 : 70); const y = 205 - bh + layer * 10;
      g.fillStyle = layer ? mid : far; g.fillRect(x, y, bw, h);
      for (let wy = y + 5; wy < 215; wy += 7) for (let wx = x + 3; wx < x + bw - 3; wx += 6) {
        if (r() > (night ? 0.45 : dusk ? 0.6 : 2)) { g.fillStyle = '#ffd88a'; g.fillRect(wx, wy, 3, 3); }
      }
      x += bw + 2;
    }
  }
  // a radio tower far away
  g.strokeStyle = night ? '#ff5544' : mid; g.lineWidth = 2; g.beginPath(); g.moveTo(700, 70); g.lineTo(690, 160); g.moveTo(700, 70); g.lineTo(710, 160); g.stroke();
  g.fillStyle = mid; g.fillRect(0, 214, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
