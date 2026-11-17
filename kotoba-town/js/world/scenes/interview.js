// interview — a company meeting room set up for a job interview (ITビジネス編 Story C 「就職の 面接」).
// The learner enters at the origin (the door is behind them, to the right), walks ~1.5 m ahead to the
// candidate's chair (built.spots.seat) and sits facing the interviewers' table; up to three interviewers
// sit behind it (npc1 centre, npc2 to its right as the learner sees it, npc3 to its left).
// Two looks, chosen by setup.room:
//   'midori' — みどりデザイン: light wood floor and table, white walls, wood logo wall, plants, linen
//              curtains, whiteboard with design sketches, warm light.
//   'grey'   — 株式会社 くろがねシステム: grey carpet tiles and walls, steel-and-dark-laminate table,
//              black mesh chairs for the interviewers, half-closed blinds, plain clock, cool light.
// Learner stands at the origin looking toward -z.
import * as THREE from 'three';
import * as K from '../kit.js';

export const meta = { indoor: true, ambience: 'office' };

// ---- layout (metres)
const X0 = -3.0; const X1 = 3.0; const ZS = 1.85; const ZN = -5.05; const H = 2.7;
const DOOR_X = 1.1;                          // door in the south wall, behind-right of the spawn (2.1 m; 3.5 m from the seat)
const SEAT = { x: 0, z: -1.5 };              // the learner when seated (feet/hips, eyes ≈ 1.15 m)
const CHAIR_Z = -1.56;                       // candidate chair centre
const TABLE = { z: -2.81, w: 2.6, d: 0.6, h: 0.72 }; // near edge ≈ 1.0 m in front of the seat
const NPC_Z = -3.45; const NPC_DX = 0.82;    // interviewers' hips (seated): 1.95 m eye to eye with npc1
const SIT = 0.45;                            // seat height of every chair in the room
const WIN = { w: 1.6, h: 1.5, y0: 0.85, zs: [-1.35, -3.6] }; // windows in the west wall

export default function build({ setup }) {
  const time = setup.time || 'morning';
  const night = time === 'night';
  const weather = setup.weather || 'clear';
  const winter = setup.season === 'winter';
  const grey = setup.room === 'grey';
  const g = new THREE.Group();
  const A = makeAtlas(1024);
  const M = materials(grey);
  const add = (o, x = 0, y = 0, z = 0, ry = 0, parent = g) => { o.position.set(x, y, z); o.rotation.y = ry; parent.add(o); return o; };

  // ------------------------------------------------------------------ room shell
  add(K.mesh(new THREE.PlaneGeometry(X1 - X0, ZS - ZN, 6, 6), M.floor, { rx: -Math.PI / 2, cast: false }), 0, 0, (ZS + ZN) / 2);
  add(K.mesh(new THREE.PlaneGeometry(X1 - X0, ZS - ZN, 3, 3), M.ceil, { rx: Math.PI / 2, cast: false }), 0, H, (ZS + ZN) / 2);
  const wallSeg = (ax, az, bx, bz, y0 = 0, y1 = H) => {
    const len = Math.hypot(bx - ax, bz - az);
    const w = K.mesh(new THREE.PlaneGeometry(len, y1 - y0), M.wall, { cast: false });
    w.position.set((ax + bx) / 2, (y0 + y1) / 2, (az + bz) / 2);
    w.rotation.y = Math.atan2(-(bz - az), bx - ax);
    g.add(w);
  };
  wallSeg(X0, ZN, X1, ZN); // north (behind the interviewers)
  wallSeg(X1, ZN, X1, ZS); // east
  wallSeg(X1, ZS, X0, ZS); // south (door wall, behind the learner)
  // west wall with two window openings
  const [wa, wb] = WIN.zs;
  wallSeg(X0, ZS, X0, wa + WIN.w / 2);
  wallSeg(X0, wa - WIN.w / 2, X0, wb + WIN.w / 2);
  wallSeg(X0, wb - WIN.w / 2, X0, ZN);
  for (const zc of WIN.zs) {
    wallSeg(X0, zc + WIN.w / 2, X0, zc - WIN.w / 2, 0, WIN.y0);
    wallSeg(X0, zc + WIN.w / 2, X0, zc - WIN.w / 2, WIN.y0 + WIN.h, H);
  }
  // skirting boards (gap for the door)
  const sk = 0.07;
  g.add(K.box(X1 - X0, sk, 0.014, M.skirt, { z: ZN + 0.007, cast: false }));
  g.add(K.box(0.014, sk, ZS - ZN, M.skirt, { x: X1 - 0.007, z: (ZS + ZN) / 2, cast: false }));
  g.add(K.box(0.014, sk, ZS - ZN, M.skirt, { x: X0 + 0.007, z: (ZS + ZN) / 2, cast: false }));
  g.add(K.box(DOOR_X - 0.5 - X0, sk, 0.014, M.skirt, { x: (X0 + DOOR_X - 0.5) / 2, z: ZS - 0.007, cast: false }));
  g.add(K.box(X1 - DOOR_X - 0.5, sk, 0.014, M.skirt, { x: (X1 + DOOR_X + 0.5) / 2, z: ZS - 0.007, cast: false }));

  // windows (the far one is the `window` prop)
  const wins = WIN.zs.map((zc) => add(westWindow({ time, night, weather, grey, M }), X0, WIN.y0 + WIN.h / 2, zc, Math.PI / 2));
  for (const w of wins) w.traverse((o) => { o.castShadow = false; });
  const windowProp = K.prop('window', wins[1], { labelJa: 'まど', labelEn: 'window' });

  // ceiling: lights, smoke detector, air conditioning
  const lampZ = [0.2, -1.6, -3.4];
  const lampMat = new THREE.MeshBasicMaterial({ color: grey ? '#f2f6ff' : '#fff2dc', toneMapped: false });
  for (const x of [-1.25, 1.25]) for (const z of lampZ) {
    // light panels face down only (no floating boxes in the overview)
    g.add(K.mesh(new THREE.PlaneGeometry(grey ? 0.3 : 0.6, grey ? 1.2 : 0.6), lampMat, { x, y: H - 0.008, z, rx: Math.PI / 2, cast: false, receive: false }));
    g.add(K.mesh(new THREE.PlaneGeometry(grey ? 0.38 : 0.66, grey ? 1.28 : 0.66), M.white, { x, y: H - 0.004, z, rx: Math.PI / 2, cast: false }));
  }
  g.add(K.cyl(0.055, 0.06, 0.03, M.white, { x: 0.7, y: H - 0.03, z: -0.9 }, 14));
  if (grey) add(ceilingCassette(M), 0, H, -1.0);
  else add(wallAircon(M), -1.35, 2.22, ZS - 0.13, Math.PI);
  const lampCol = grey ? '#edf2ff' : '#ffe6c2';
  const boost = night ? 1.35 : time === 'evening' ? 1.2 : 1;
  const l1 = new THREE.PointLight(lampCol, (grey ? 3.6 : 4.4) * boost, 8, 1.5); l1.position.set(0, 2.05, -2.6); g.add(l1);
  const l2 = new THREE.PointLight(lampCol, (grey ? 2.6 : 3.2) * boost, 8, 1.5); l2.position.set(0.3, 2.05, -0.2); g.add(l2);

  // ------------------------------------------------------------------ door (behind the learner, right)
  const door = K.prop('door', doorUnit(grey, M), { labelJa: 'ドア', labelEn: 'door' });
  add(door, DOOR_X, 0, ZS - 0.02, Math.PI);
  g.add(K.box(0.075, 0.12, 0.012, M.white, { x: DOOR_X - 0.68, y: 1.14, z: ZS - 0.006 })); // light switch
  g.add(K.box(0.02, 0.05, 0.004, M.offwhite, { x: DOOR_X - 0.68, y: 1.175, z: ZS - 0.014 }));
  add(extinguisher(A), DOOR_X - 1.0, 0, ZS - 0.14, Math.PI);

  // ------------------------------------------------------------------ the candidate's chair + bag
  const chair = K.prop('chair', grey ? meetingChair(M.steel, M.fabric, true) : meetingChair(M.oakSolid, M.fabric, false), { labelJa: 'いす', labelEn: 'chair' });
  add(chair, SEAT.x, 0, CHAIR_Z, Math.PI);
  const bag = K.prop('bag', recruitBag(M), { labelJa: 'かばん', labelEn: 'bag' });
  add(bag, SEAT.x + 0.4, 0, CHAIR_Z + 0.06, Math.PI / 2 + 0.08);

  // ------------------------------------------------------------------ the interviewers' table + chairs
  const table = K.prop('table', interviewTable(grey, M), { labelJa: 'テーブル', labelEn: 'table' });
  add(table, 0, 0, TABLE.z);
  const chairPos = { x: SEAT.x, z: CHAIR_Z };
  const npcPos = { npc1: { x: 0, z: NPC_Z }, npc2: { x: NPC_DX, z: NPC_Z }, npc3: { x: -NPC_DX, z: NPC_Z } };
  const slots = { phone: null };
  for (const [slot, p] of Object.entries(npcPos)) {
    const yaw = K.faceYaw(p, chairPos);
    slots[slot] = { ...K.spot(p.x, p.z, yaw), sit: SIT };
    const c = grey ? meshChair(M) : meetingChair(M.oakSolid, M.fabric, false);
    add(c, p.x + Math.sin(yaw) * 0.08, 0, p.z + Math.cos(yaw) * 0.08, yaw);
  }
  // on the table (top at TABLE.h); interviewer side is z < TABLE.z
  const TY = TABLE.h; const TZ = TABLE.z; const TF = TABLE.z + TABLE.d / 2; // top, centre, front edge
  const resume = K.prop('resume', resumeSheets(A, M), { labelJa: 'りれきしょ', labelEn: 'résumé' });
  add(resume, 0.02, TY, TZ - 0.1, Math.PI + 0.04);
  const laptopProp = K.prop('laptop', laptop(A, M, grey), { labelJa: 'パソコン', labelEn: 'laptop' });
  add(laptopProp, NPC_DX - 0.02, TY, TZ - 0.1, slots.npc2.yaw + Math.PI);
  const water = K.prop('water', waterSet(M), { labelJa: 'みず', labelEn: 'water' });
  add(water, -0.44, TY, TZ - 0.06);
  add(petBottle(M), NPC_DX * 0.55, TY, TZ - 0.16); // npc2's bottle, beside the laptop
  const plate = K.prop('nameplate', tentCard(A, grey
    ? [{ t: '株式会社 くろがねシステム', scale: 0.5, color: '#5b6068', weight: 600 }, { t: '採用面接', scale: 1.05 }]
    : [{ t: 'みどりデザイン', scale: 0.55, color: '#2f7a5b' }, { t: '採用面接', scale: 1.05 }],
  grey ? { bg: '#eef0f2', fg: '#33373d', border: '#7d838b' } : { bg: '#fffdf8', fg: '#3d3a35', border: '#7fb593' }), { labelJa: 'ネームプレート', labelEn: 'name plate' });
  add(plate, 0.44, TY, TF - 0.09);
  // interviewers' notes and pens
  add(notepad(A, M, 'memo'), -NPC_DX - 0.02, TY, TZ - 0.11, Math.PI - 0.1);
  add(pen(M, grey ? '#2b2e33' : '#2f6d4f'), -NPC_DX + 0.12, TY, TZ - 0.1, 0.5);
  add(pen(M, '#2b2e33'), 0.25, TY, TZ - 0.1, -0.3);
  add(notepad(A, M, 'sheet'), NPC_DX + 0.3, TY, TZ - 0.07, Math.PI - 0.15); // question sheet beside the laptop

  // ------------------------------------------------------------------ walls: logo, clock, plants, furniture
  const hhmm = { morning: [9, 58], noon: [13, 28], evening: [16, 58], night: [18, 58] }[time] || [9, 58];
  let logo;
  if (grey) {
    const lg = new THREE.Group();
    lg.add(K.box(1.72, 0.5, 0.02, M.plate, { y: -0.25 }));
    const t = A.paint(1.6, 0.42, 420, drawKuroganeLogo, { own: true });
    t.position.z = 0.0105;
    lg.add(t);
    logo = K.prop('logo', lg, { labelJa: 'くろがねシステムの ロゴ', labelEn: 'company logo' });
    add(logo, 0, 1.95, ZN + 0.012);
  } else {
    // light oak accent wall behind the interviewers, logo letters on it
    g.add(K.box(3.0, H, 0.03, M.oakWall, { z: ZN + 0.015, cast: false }));
    for (const x of [-1.5, 1.5]) g.add(K.box(0.03, H, 0.04, M.skirt, { x, z: ZN + 0.02, cast: false }));
    const lg = new THREE.Group();
    const t = A.paint(1.6, 0.5, 420, drawMidoriLogo, { own: true });
    lg.add(t);
    logo = K.prop('logo', lg, { labelJa: 'みどりデザインの ロゴ', labelEn: 'company logo' });
    add(logo, 0, 1.98, ZN + 0.035);
  }
  const clk = K.prop('clock', K.clock(grey ? 0.17 : 0.16, hhmm[0], hhmm[1]), { labelJa: 'とけい', labelEn: 'clock' });
  add(clk, grey ? 2.05 : 2.2, 2.12, ZN + 0.025);
  if (!grey) g.add(K.cyl(0.19, 0.19, 0.012, M.oakSolid, { x: 2.2, y: 2.12, z: ZN + 0.006, rx: Math.PI / 2 }, 28)); // wooden rim

  const plantProp = K.prop('plant', grey ? sansevieria(M) : K.plant(1.45, 7), { labelJa: 'き', labelEn: 'plant' });
  if (!grey) plantProp.add(K.cyl(0.24, 0.2, 0.03, M.oakSolid, {}, 18)); // saucer
  add(plantProp, -2.52, 0, ZN + 0.45);

  if (grey) {
    // east wall: video-conference display (off), company philosophy frame, steel cabinet
    add(wallDisplay(M), X1 - 0.03, 1.48, -2.0, -Math.PI / 2);
    add(framedPaint(A, M.black, 0.62, 0.46, 0.56, 0.4, drawPhilosophy), X1 - 0.015, 1.5, -0.45, -Math.PI / 2);
    add(steelCabinet(M), X1 - 0.24, 0, -4.15, -Math.PI / 2);
    add(wasteBin(M.steel), 2.68, 0, -3.3);
    // south wall: evacuation map next to the door
    add(framedPaint(A, M.steel, 0.34, 0.46, 0.3, 0.42, drawEvacMap), DOOR_X + 1.05, 1.5, ZS - 0.015, Math.PI);
  } else {
    // east wall: design poster, whiteboard with sketches, low cabinet with a phone and brochures
    add(framedPaint(A, M.oakSolid, 0.54, 0.74, 0.48, 0.68, drawPoster), X1 - 0.015, 1.5, -0.35, -Math.PI / 2);
    add(whiteboard(A, M), X1 - 0.02, 1.45, -1.75, -Math.PI / 2);
    add(credenza(A, M), X1 - 0.24, 0, -3.8, -Math.PI / 2);
    add(wasteBin(M.white), 2.7, 0, -2.85);
    // more green
    add(K.plant(1.15, 12), -2.55, 0, ZS - 0.45);
    add(K.plant(0.5, 4), X0 + 0.08, WIN.y0, WIN.zs[0] + 0.5); // on the front window sill
    // south wall: framed picture and a coat stand by the door
    add(framedPaint(A, M.oakSolid, 0.62, 0.44, 0.56, 0.38, drawHills), -1.5, 1.45, ZS - 0.015, Math.PI);
    add(coatStand(M, winter), 2.35, 0, ZS - 0.4);
  }
  // outlets
  for (const [x, z, ry] of [[X1 - 0.004, -1.0, -Math.PI / 2], [X0 + 0.004, -2.45, Math.PI / 2], [-2.2, ZN + 0.004, 0], [-1.9, ZS - 0.004, Math.PI]]) {
    const o = new THREE.Group();
    o.add(K.box(0.07, 0.12, 0.008, M.white));
    for (const dy of [0.035, 0.075]) o.add(K.box(0.03, 0.012, 0.003, M.dark, { y: dy, z: 0.005 }));
    add(o, x, 0.25, z, ry);
  }

  const props = { door, chair, bag, table, resume, laptop: laptopProp, water, nameplate: plate, clock: clk, window: windowProp, logo, plant: plantProp };

  atlasize(g, A);
  return K.finalize({
    group: g,
    spawn: K.spot(0, 0, 0),
    slots,
    props,
    // where the learner walks to and sits ("walk" / "sit"); yaw uses the spawn convention (0 = facing -z)
    spots: { seat: { pos: new THREE.Vector3(SEAT.x, 0, SEAT.z), yaw: 0, sit: SIT } },
    center: new THREE.Vector3(0, 0, (ZS + ZN) / 2),
    radius: 4.5,
  });
}

// =================================================================== materials
function materials(grey) {
  return {
    floor: grey ? K.mat('#ffffff', { map: carpetTileTex(), rough: 0.95 }) : K.mat('#ffffff', { map: K.woodTex('#dcc099', [3, 3], 8), rough: 0.5 }),
    ceil: grey ? K.mat('#ffffff', { map: K.tileTex('#eceeef', '#e7e9eb', 2, [5, 5], '#c8ccd0'), rough: 1, emissive: '#4b5058' }) : K.mat('#f8f6f1', { rough: 1, emissive: '#5a554c' }),
    wall: K.mat(grey ? '#c4c8cd' : '#f3efe8', { rough: 0.92 }),
    skirt: K.mat(grey ? '#5d6269' : '#cdb491', { rough: 0.6 }),
    oak: K.mat('#ffffff', { map: K.woodTex('#d8b689', [1, 1], 4), rough: 0.4 }),
    oakWall: K.mat('#ffffff', { map: K.woodTex('#d2ad7e', [1, 3], 10), rough: 0.55 }),
    oakSolid: K.mat('#c9a476', { rough: 0.5 }),
    white: K.mat('#f2f0eb', { rough: 0.55 }),
    offwhite: K.mat('#e2dfd8', { rough: 0.6 }),
    chrome: K.mat('#c5cacf', { metal: 0.85, rough: 0.25 }),
    steel: K.mat('#a2a8af', { metal: 0.55, rough: 0.4 }),
    plate: K.mat('#b9bec4', { metal: 0.6, rough: 0.35 }),
    panel: K.mat('#6e747c', { rough: 0.5 }),
    dark: K.mat('#34373c', { rough: 0.5 }),
    black: K.mat('#24262a', { rough: 0.55 }),
    laminate: K.mat('#3e4248', { rough: 0.32 }),
    fabric: K.mat(grey ? '#555a61' : '#cbbb9c', { rough: 0.95 }),
    mesh: K.mat('#30333a', { rough: 0.9 }),
    blind: K.mat('#d3d6d9', { rough: 0.5 }),
    linen: K.mat('#efe6d3', { rough: 0.95 }),
    pet: K.mat('#d8ecf3', { rough: 0.12, opacity: 0.55 }),
    glass: K.mat('#eaf4f7', { rough: 0.06, opacity: 0.32 }),
    water: K.mat('#c9e3ee', { rough: 0.05, opacity: 0.5 }),
    label: K.mat('#3a86c8', { rough: 0.5 }),
    cap: K.mat('#f1f3f4', { rough: 0.5 }),
    bag: K.mat('#24262b', { rough: 0.45 }),
    bagEdge: K.mat('#1b1c20', { rough: 0.6 }),
    pot: K.mat(grey ? '#6c7178' : '#e6ddcf', { rough: 0.8 }),
    soil: K.mat('#3e3227', { rough: 1 }),
  };
}

/** Grey carpet tiles (50 cm), quarter-turned so the fibre direction alternates. */
function carpetTileTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const r = K.rng(21);
  const n = 4; const s = 512 / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const alt = (x + y) % 2;
    const v = 126 + (alt ? 6 : -3) + r() * 4;
    g.fillStyle = `rgb(${v - 5},${v},${v + 5})`;
    g.fillRect(x * s, y * s, s, s);
    for (let i = 0; i < 700; i++) {
      const px = x * s + r() * s; const py = y * s + r() * s; const len = 3 + r() * 9;
      g.fillStyle = r() > 0.5 ? `rgba(255,255,255,${0.04 + r() * 0.05})` : `rgba(0,0,0,${0.05 + r() * 0.06})`;
      if (alt) g.fillRect(px, py, 1, len); else g.fillRect(px, py, len, 1);
    }
  }
  g.strokeStyle = 'rgba(0,0,0,0.16)'; g.lineWidth = 1.5;
  for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, 512); g.stroke(); g.beginPath(); g.moveTo(0, i * s); g.lineTo(512, i * s); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  t.anisotropy = 4;
  return t;
}

// =================================================================== furniture
/** Meeting chair facing +z, seat top at SIT: padded seat and back on a tube (steel) or wood frame. */
function meetingChair(frame, fabric, steel) {
  const c = new THREE.Group();
  c.add(K.rbox(0.47, 0.07, 0.45, 0.025, fabric, { y: SIT - 0.07 }));
  const back = K.rbox(0.45, 0.32, 0.055, 0.022, fabric, { y: SIT + 0.12, z: -0.215 });
  back.rotation.x = -0.1;
  c.add(back);
  const legH = SIT - 0.07;
  if (steel) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) c.add(K.cyl(0.011, 0.011, legH, frame, { x: sx * 0.2, z: sz * 0.19 }, 8));
    for (const sx of [-1, 1]) c.add(K.cyl(0.011, 0.011, 0.36, frame, { x: sx * 0.2, y: legH, z: -0.215 }, 8));
  } else {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) c.add(K.box(0.035, legH, 0.035, frame, { x: sx * 0.2, z: sz * 0.185 }));
    for (const sx of [-1, 1]) c.add(K.box(0.03, 0.4, 0.03, frame, { x: sx * 0.205, y: legH, z: -0.21 }));
    c.add(K.box(0.38, 0.03, 0.02, frame, { y: 0.16, z: -0.185 }));
  }
  return c;
}

/** Black mesh office chair facing +z (five-star base, armrests), seat top at SIT. */
function meshChair(M) {
  const c = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2 + 0.3;
    const leg = K.box(0.04, 0.03, 0.3, M.black);
    leg.position.set(Math.sin(a) * 0.15, 0.065, Math.cos(a) * 0.15); leg.rotation.y = a;
    c.add(leg);
    const w = K.cyl(0.024, 0.024, 0.03, M.dark, {}, 8);
    w.position.set(Math.sin(a) * 0.29, 0.026, Math.cos(a) * 0.29); w.rotation.set(0, a, Math.PI / 2);
    c.add(w);
  }
  c.add(K.cyl(0.026, 0.026, 0.26, M.chrome, { y: 0.07 }, 10));
  c.add(K.box(0.2, 0.04, 0.22, M.black, { y: SIT - 0.12 }));
  c.add(K.rbox(0.5, 0.08, 0.48, 0.03, M.black, { y: SIT - 0.08 }));
  c.add(K.box(0.06, 0.3, 0.03, M.black, { y: SIT - 0.1, z: -0.25 }));
  const back = K.rbox(0.46, 0.52, 0.05, 0.03, M.mesh, { y: SIT + 0.15, z: -0.27 });
  back.rotation.x = -0.12;
  c.add(back);
  for (const sx of [-1, 1]) {
    c.add(K.box(0.03, 0.2, 0.03, M.black, { x: sx * 0.27, y: SIT - 0.04, z: -0.06 }));
    c.add(K.rbox(0.06, 0.03, 0.24, 0.012, M.black, { x: sx * 0.27, y: SIT + 0.16, z: -0.04 }));
  }
  return c;
}

/** The interviewers' long table, candidate side +z, with a modesty panel hiding their legs. */
function interviewTable(grey, M) {
  const { w, d, h } = TABLE;
  const t = new THREE.Group();
  if (grey) {
    t.add(K.box(w, 0.03, d, M.laminate, { y: h - 0.03 }));
    t.add(K.box(w + 0.004, 0.008, d + 0.004, M.dark, { y: h - 0.03 })); // edge band below the top
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) t.add(K.box(0.045, h - 0.03, 0.045, M.steel, { x: sx * (w / 2 - 0.07), z: sz * (d / 2 - 0.07) }));
    for (const sz of [-1, 1]) t.add(K.box(w - 0.18, 0.05, 0.02, M.steel, { y: h - 0.085, z: sz * (d / 2 - 0.07) }));
    t.add(K.box(w - 0.2, 0.42, 0.012, M.panel, { y: 0.24, z: d / 2 - 0.075 }));
  } else {
    t.add(K.rbox(w, 0.035, d, 0.012, M.oak, { y: h - 0.035 }));
    for (const sx of [-1, 1]) {
      t.add(K.box(0.05, h - 0.035, d - 0.14, M.oakSolid, { x: sx * (w / 2 - 0.14) }));
      t.add(K.box(0.07, 0.02, d - 0.1, M.oakSolid, { x: sx * (w / 2 - 0.14) }));
    }
    t.add(K.box(w - 0.32, 0.42, 0.022, M.oakSolid, { y: 0.24, z: d / 2 - 0.09 }));
  }
  return t;
}

function doorUnit(grey, M) {
  const g = new THREE.Group();
  const frame = grey ? M.steel : M.white;
  for (const sx of [-1, 1]) g.add(K.box(0.06, 2.1, 0.1, frame, { x: sx * 0.48, z: -0.02 }));
  g.add(K.box(1.02, 0.06, 0.1, frame, { y: 2.08, z: -0.02 }));
  g.add(K.box(0.9, 2.06, 0.04, grey ? K.mat('#8f969d', { rough: 0.45, metal: 0.2 }) : K.mat('#cfae84', { rough: 0.5 }), { y: 0.01 }));
  if (!grey) for (const y of [0.55, 1.5]) g.add(K.box(0.7, 0.012, 0.004, K.mat('#b8966b', { rough: 0.5 }), { y, z: 0.021 }));
  // lever handle + plate, door closer, kick plate
  g.add(K.box(0.045, 0.16, 0.012, M.chrome, { x: 0.36, y: 0.92, z: 0.024 }));
  g.add(K.box(0.13, 0.02, 0.02, M.chrome, { x: 0.31, y: 1.02, z: 0.05 }));
  g.add(K.cyl(0.012, 0.012, 0.03, M.chrome, { x: 0.37, y: 1.03, z: 0.028, rx: Math.PI / 2 }, 8));
  g.add(K.box(0.28, 0.05, 0.05, grey ? M.dark : M.offwhite, { x: -0.22, y: 1.96, z: 0.045 }));
  g.add(K.box(0.86, 0.16, 0.004, M.chrome, { y: 0.02, z: 0.022 }));
  return g;
}

function westWindow({ time, night, weather, grey, M }) {
  const w = new THREE.Group();
  w.add(K.windowPane(WIN.w, WIN.h, night ? 'night' : 'city', time));
  if (weather !== 'clear') { // grey sky haze, and trickles on the glass when it rains
    w.add(K.mesh(new THREE.PlaneGeometry(WIN.w, WIN.h), new THREE.MeshBasicMaterial({ color: night ? '#2a3140' : '#a9b2ba', transparent: true, opacity: weather === 'rain' ? 0.5 : 0.32, depthWrite: false, toneMapped: false }), { z: -0.035, cast: false, receive: false }));
    if (weather === 'rain') w.add(K.mesh(new THREE.PlaneGeometry(WIN.w, WIN.h), rainGlassMat(), { z: -0.02, cast: false, receive: false }));
  }
  w.add(K.box(WIN.w + 0.14, 0.03, 0.2, M.white, { y: -WIN.h / 2 - 0.035, z: 0.06 })); // sill
  if (grey) {
    // venetian blind, half lowered, slats half closed
    const bw = WIN.w + 0.02;
    w.add(K.box(bw + 0.04, 0.05, 0.07, M.blind, { y: WIN.h / 2 - 0.02, z: 0.09 }));
    const n = Math.round(WIN.h * (night ? 0.92 : 0.58) / 0.042);
    for (let i = 0; i < n; i++) {
      const s = K.box(bw, 0.003, 0.05, M.blind, { y: WIN.h / 2 - 0.06 - i * 0.042, z: 0.09, cast: false });
      s.rotation.x = 0.55;
      w.add(s);
    }
    w.add(K.box(bw, 0.022, 0.055, M.blind, { y: WIN.h / 2 - 0.09 - n * 0.042, z: 0.09 }));
    w.add(K.cyl(0.005, 0.005, 0.7, M.blind, { x: bw / 2 - 0.06, y: WIN.h / 2 - 0.74, z: 0.12 }, 6)); // tilt wand
  } else {
    w.add(K.box(WIN.w + 0.86, 0.025, 0.03, M.white, { y: WIN.h / 2 + 0.1, z: 0.15 }));
    for (const sx of [-1, 1]) add2(w, curtain(M.linen, 0.36, WIN.h + 0.34), sx * (WIN.w / 2 + 0.17), -WIN.h / 2 - 0.22, 0.13);
  }
  return w;
}
function add2(parent, o, x, y, z) { o.position.set(x, y, z); parent.add(o); return o; }

/** Gathered curtain (folds = half cylinders), bottom at y = 0, facing +z. */
function curtain(m, w, h) {
  const g = new THREE.Group();
  const n = 4; const r = w / n / 2;
  const geo = new THREE.CylinderGeometry(r, r, h, 6, 1, true, -Math.PI / 2, Math.PI);
  for (let i = 0; i < n; i++) g.add(K.mesh(geo, m, { x: -w / 2 + r + i * 2 * r, y: h / 2, z: (i % 2) * 0.012 }));
  return g;
}

function wallAircon(M) { // facing +z
  const a = new THREE.Group();
  a.add(K.rbox(0.84, 0.28, 0.23, 0.05, M.white));
  a.add(K.box(0.72, 0.025, 0.02, M.offwhite, { y: 0.02, z: 0.1 }));
  a.add(K.box(0.7, 0.01, 0.01, M.dark, { y: 0.045, z: 0.112 }));
  a.add(K.box(0.03, 0.012, 0.004, K.mat('#59c27a', { emissive: '#59c27a', emissiveIntensity: 0.8 }), { x: 0.3, y: 0.06, z: 0.117 }));
  return a;
}

function ceilingCassette(M) { // flush with the ceiling at y = 0, made of down-facing planes
  const a = new THREE.Group();
  const down = (w, d, m, y, x = 0, z = 0) => a.add(K.mesh(new THREE.PlaneGeometry(w, d), m, { x, y, z, rx: Math.PI / 2, cast: false }));
  down(0.84, 0.84, M.white, -0.005);
  down(0.46, 0.46, M.offwhite, -0.008);
  for (const [x, z, w, d] of [[0, 0.33, 0.6, 0.07], [0, -0.33, 0.6, 0.07], [0.33, 0, 0.07, 0.6], [-0.33, 0, 0.07, 0.6]]) down(w, d, M.dark, -0.008, x, z);
  return a;
}

/** Translucent rain trickles for the window glass (one shared material). */
let rainMat = null;
function rainGlassMat() {
  if (rainMat) return rainMat;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  const r = K.rng(31);
  for (let i = 0; i < 60; i++) {
    const x = r() * 256; let y = r() * 200; const len = 20 + r() * 90;
    g.strokeStyle = `rgba(235,242,250,${0.25 + r() * 0.35})`; g.lineWidth = 1 + r() * 1.5;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < len; k += 8) { y += 8; g.lineTo(x + Math.sin((y + i) * 0.08) * 1.5, y); }
    g.stroke();
  }
  for (let i = 0; i < 220; i++) { g.fillStyle = `rgba(235,242,250,${0.2 + r() * 0.4})`; g.beginPath(); g.arc(r() * 256, r() * 256, 0.8 + r() * 1.8, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  rainMat = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.8 });
  return rainMat;
}

function recruitBag(M) { // black A4 business bag standing on its own, front +z
  const g = new THREE.Group();
  g.add(K.rbox(0.4, 0.29, 0.11, 0.02, M.bag));
  g.add(K.rbox(0.3, 0.14, 0.022, 0.008, M.bagEdge, { y: 0.05, z: 0.058 }));
  for (const z of [-0.028, 0.028]) g.add(K.mesh(new THREE.TorusGeometry(0.075, 0.008, 6, 14, Math.PI), M.bagEdge, { y: 0.29, z }));
  g.add(K.box(0.02, 0.032, 0.006, M.chrome, { x: 0.13, y: 0.235, z: 0.058 }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(K.cyl(0.008, 0.008, 0.008, M.chrome, { x: sx * 0.16, y: -0.006, z: sz * 0.035 }, 6));
  return g;
}

function laptop(A, M, grey) { // the user sits at +z
  const g = new THREE.Group();
  const body = K.mat(grey ? '#50555d' : '#c8cbcf', { metal: grey ? 0.25 : 0.6, rough: 0.35 });
  g.add(K.rbox(0.32, 0.016, 0.22, 0.006, body));
  g.add(K.box(0.27, 0.002, 0.095, M.black, { y: 0.016, z: -0.02 }));
  g.add(K.box(0.09, 0.001, 0.055, K.mat('#a7abb0', { rough: 0.4 }), { y: 0.016, z: 0.07 }));
  const lid = new THREE.Group();
  lid.position.set(0, 0.016, -0.106);
  lid.rotation.x = -0.3;
  lid.add(K.rbox(0.32, 0.215, 0.008, 0.004, body, { z: -0.004 }));
  const scr = A.paint(0.29, 0.18, 620, (c, W, Hh) => drawScreen(c, W, Hh, grey), { glow: true });
  scr.position.set(0, 0.11, 0.0005);
  lid.add(scr);
  if (!grey) { // a green leaf sticker on the back of the lid
    const st = A.paint(0.05, 0.05, 600, (c, W) => { c.fillStyle = '#3f8f5f'; c.beginPath(); c.arc(W / 2, W / 2, W * 0.48, 0, Math.PI * 2); c.fill(); leaf(c, W / 2, W / 2, W * 0.42, '#f4f1e6', '#3f8f5f'); });
    st.position.set(0.06, 0.12, -0.0085); st.rotation.y = Math.PI;
    lid.add(st);
  }
  g.add(lid);
  return g;
}

/** A3 履歴書 opened flat (two A4 pages), text up for whoever sits at -z when rotated by π. */
function resumeSheets(A, M) {
  const g = new THREE.Group();
  const p = A.paint(0.42, 0.297, 640, drawResume, { rx: -Math.PI / 2, y: 0.002 });
  g.add(p);
  // a clear file under it, a little bigger
  g.add(K.box(0.45, 0.002, 0.32, K.mat('#dcebf3', { rough: 0.2 }), { x: 0.01, z: -0.004, cast: false }));
  return g;
}

function notepad(A, M, kind) {
  const g = new THREE.Group();
  const p = A.paint(0.15, 0.21, 600, (c, W, Hh) => drawNotes(c, W, Hh, kind), { rx: -Math.PI / 2, y: 0.004 });
  g.add(p);
  if (kind === 'memo') g.add(K.box(0.15, 0.004, 0.21, M.white, { cast: false }));
  return g;
}

function pen(M, color) {
  const g = new THREE.Group();
  g.add(K.mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.14, 8), K.mat(color, { rough: 0.35 }), { y: 0.005, rz: Math.PI / 2 }));
  g.add(K.mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.03, 8), M.chrome, { x: 0.06, y: 0.005, rz: Math.PI / 2 }));
  return g;
}

function petBottle(M) {
  const b = new THREE.Group();
  b.add(K.cyl(0.032, 0.032, 0.15, M.pet, {}, 12));
  b.add(K.cyl(0.014, 0.032, 0.045, M.pet, { y: 0.15 }, 12));
  b.add(K.cyl(0.0335, 0.0335, 0.055, M.label, { y: 0.05 }, 12));
  b.add(K.cyl(0.015, 0.015, 0.02, M.cap, { y: 0.195 }, 10));
  b.add(K.cyl(0.029, 0.029, 0.13, M.water, { y: 0.005 }, 10));
  return b;
}

function waterSet(M) {
  const g = new THREE.Group();
  add2(g, petBottle(M), -0.05, 0, 0.0);
  add2(g, petBottle(M), 0.05, 0, -0.07);
  const glass = new THREE.Group();
  glass.add(K.cyl(0.036, 0.03, 0.1, M.glass, {}, 14));
  glass.add(K.cyl(0.031, 0.027, 0.06, M.water, { y: 0.004 }, 14));
  add2(g, glass, 0.08, 0, 0.06);
  return g;
}

/** Folded tent card (two leaning faces), text facing +z. */
function tentCard(A, lines, o) {
  const g = new THREE.Group();
  const w = 0.27; const h = 0.1; const t = 0.3;
  const front = A.text(lines, w, h, { ppm: 760, radius: 0.04, ...o });
  front.position.set(0, h / 2 * Math.cos(t), h / 2 * Math.sin(t));
  front.rotation.x = -t;
  g.add(front);
  const back = A.plane(w, h, A.solid(o.bg));
  back.position.set(0, h / 2 * Math.cos(t), -h / 2 * Math.sin(t));
  back.rotation.set(t, Math.PI, 0);
  g.add(back);
  return g;
}

function sansevieria(M) {
  const g = new THREE.Group();
  g.add(K.box(0.3, 0.34, 0.3, M.pot));
  g.add(K.box(0.27, 0.01, 0.27, M.soil, { y: 0.33 }));
  const r = K.rng(5);
  const geo = new THREE.ConeGeometry(0.045, 1, 4);
  for (let i = 0; i < 12; i++) {
    const hgt = 0.5 + r() * 0.45;
    const leafM = K.mat(i % 3 ? '#4b6b45' : '#62804c', { rough: 0.7 });
    const l = K.mesh(geo, leafM, {});
    const a = r() * Math.PI * 2; const rad = 0.02 + r() * 0.08;
    l.scale.set(1, hgt, 0.3);
    l.position.set(Math.cos(a) * rad, 0.33 + hgt / 2, Math.sin(a) * rad);
    l.rotation.set(Math.sin(a) * 0.18, r() * Math.PI, -Math.cos(a) * 0.18);
    g.add(l);
  }
  return g;
}

function framedPaint(A, frameMat, fw, fh, iw, ih, draw) { // centred at y = 0, facing +z
  const g = new THREE.Group();
  g.add(K.box(fw, fh, 0.025, frameMat, { y: -fh / 2 }));
  const p = A.paint(iw, ih, 300, draw);
  p.position.z = 0.0135;
  g.add(p);
  return g;
}

function whiteboard(A, M) { // centred at y = 0, facing +z
  const g = new THREE.Group();
  g.add(K.box(1.82, 0.92, 0.03, M.chrome, { y: -0.46 }));
  const b = A.paint(1.76, 0.86, 300, drawWhiteboard);
  b.position.z = 0.016;
  g.add(b);
  g.add(K.box(1.1, 0.025, 0.07, M.chrome, { y: -0.49, z: 0.035 }));
  ['#2f5fb3', '#c0392b', '#2b2e33'].forEach((c, i) => g.add(K.cyl(0.008, 0.008, 0.12, K.mat(c, { rough: 0.4 }), { x: -0.3 + i * 0.06, y: -0.457, z: 0.045, rz: Math.PI / 2 }, 6)));
  return g;
}

function credenza(A, M) { // low cabinet facing +z
  const g = new THREE.Group();
  g.add(K.box(1.3, 0.66, 0.44, M.white, { y: 0.04 }));
  g.add(K.box(1.26, 0.04, 0.4, M.dark, { z: -0.01 }));
  g.add(K.box(1.34, 0.03, 0.47, M.oakSolid, { y: 0.7 }));
  for (const x of [-0.325, 0, 0.325]) g.add(K.box(0.006, 0.6, 0.004, M.offwhite, { x, y: 0.07, z: 0.222 }));
  for (const x of [-0.06, 0.06]) g.add(K.box(0.012, 0.12, 0.02, M.chrome, { x, y: 0.42, z: 0.23 }));
  // conference phone (three-lobed), tissue box, company brochures, small plant
  const ph = K.cyl(0.12, 0.13, 0.035, M.dark, { y: 0.73, x: -0.38 }, 3); ph.rotation.y = 0.5; g.add(ph);
  g.add(K.cyl(0.03, 0.03, 0.006, M.black, { x: -0.38, y: 0.765 }, 12));
  g.add(K.box(0.24, 0.075, 0.12, K.mat('#f3f1ec', { rough: 0.7 }), { x: 0.02, y: 0.73, z: 0.06, ry: 0.1 }));
  g.add(K.box(0.08, 0.025, 0.04, K.mat('#ffffff', { rough: 0.9 }), { x: 0.02, y: 0.805, z: 0.06, ry: 0.1 }));
  const cover = A.region(0.21 * 300, 0.297 * 300, drawBrochure);
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Group();
    s.add(K.box(0.21, 0.012, 0.297, K.mat('#3f8f5f', { rough: 0.5 })));
    s.add(A.plane(0.21, 0.297, cover, { rx: -Math.PI / 2, y: 0.0125 }));
    s.position.set(0.32 + i * 0.004, 0.73 + i * 0.013, 0.02 - i * 0.006); s.rotation.y = -0.12 + i * 0.07;
    g.add(s);
  }
  add2(g, K.plant(0.42, 3), 0.56, 0.73, -0.08);
  return g;
}

/** Red fire extinguisher on a little base, with its 消火器 sign on the wall above (facing +z). */
function extinguisher(A) {
  const g = new THREE.Group();
  const red = K.mat('#c8352e', { rough: 0.35 });
  g.add(K.box(0.24, 0.04, 0.2, K.mat('#9aa1a8', { metal: 0.5, rough: 0.4 })));
  g.add(K.cyl(0.075, 0.075, 0.42, red, { y: 0.04 }, 14));
  g.add(K.mesh(new THREE.SphereGeometry(0.075, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), red, { y: 0.46 }));
  g.add(K.box(0.05, 0.05, 0.05, K.mat('#2b2e33'), { y: 0.52 }));
  g.add(K.box(0.03, 0.01, 0.14, K.mat('#2b2e33'), { y: 0.57, z: 0.03 }));
  const label = A.paint(0.07, 0.12, 600, (c, W, Hh) => { c.fillStyle = '#f2f0ea'; c.fillRect(0, 0, W, Hh); c.fillStyle = '#c8352e'; c.fillRect(0, 0, W, Hh * 0.22); });
  label.position.set(0, 0.26, 0.0755);
  g.add(label);
  const sign = A.paint(0.2, 0.09, 500, (c, W, Hh) => drawLabel(c, W, Hh, ['消火器'], { bg: '#d23c3c', fg: '#ffffff', radius: 0.1 }));
  sign.position.set(0, 1.0, -0.12);
  g.add(sign);
  return g;
}

function wasteBin(m) {
  const g = new THREE.Group();
  g.add(K.cyl(0.13, 0.11, 0.33, m, {}, 16));
  g.add(K.cyl(0.115, 0.115, 0.01, K.mat('#2e3034'), { y: 0.32 }, 16));
  return g;
}

function coatStand(M, winter) {
  const g = new THREE.Group();
  g.add(K.cyl(0.2, 0.22, 0.025, M.oakSolid, {}, 18));
  g.add(K.cyl(0.016, 0.018, 1.72, M.oakSolid, {}, 8));
  g.add(K.mesh(new THREE.SphereGeometry(0.03, 10, 6), M.oakSolid, { y: 1.74 }));
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + 0.4;
    const hk = K.cyl(0.008, 0.008, 0.16, M.oakSolid, {}, 6);
    hk.position.set(Math.sin(a) * 0.06, 1.62, Math.cos(a) * 0.06);
    hk.rotation.set(Math.cos(a) * 0.9, 0, -Math.sin(a) * 0.9);
    g.add(hk);
  }
  // a folded umbrella hanging off one hook
  const u = K.cyl(0.012, 0.03, 0.62, K.mat('#2f5f8a', { rough: 0.6 }), {}, 8);
  u.position.set(0.11, 1.05, 0.04);
  g.add(u);
  if (winter) { // someone's coat on the stand
    const coat = K.mat('#4a4f5c', { rough: 0.9 });
    g.add(K.rbox(0.36, 0.86, 0.13, 0.05, coat, { x: -0.06, y: 0.72, z: -0.1 }));
    g.add(K.rbox(0.3, 0.1, 0.16, 0.05, coat, { x: -0.06, y: 1.52, z: -0.08 }));
    g.add(K.box(0.03, 0.2, 0.18, K.mat('#b84a3a', { rough: 0.9 }), { x: -0.06, y: 1.38, z: -0.06 })); // scarf
  }
  return g;
}

function wallDisplay(M) { // centred at y = 0, facing +z
  const g = new THREE.Group();
  g.add(K.rbox(1.22, 0.71, 0.05, 0.01, M.black, { y: -0.355 }));
  g.add(K.box(1.17, 0.66, 0.002, K.mat('#14161a', { rough: 0.12 }), { y: -0.33, z: 0.025 }));
  g.add(K.rbox(0.22, 0.045, 0.06, 0.01, M.dark, { y: 0.36, z: 0.01 })); // conference camera
  g.add(K.cyl(0.012, 0.012, 0.004, M.black, { y: 0.383, z: 0.042, rx: Math.PI / 2 }, 10));
  return g;
}

function steelCabinet(M) { // facing +z
  const g = new THREE.Group();
  const m = K.mat('#b3b8be', { rough: 0.45, metal: 0.25 });
  g.add(K.box(0.9, 1.8, 0.45, m));
  g.add(K.box(0.004, 1.7, 0.004, M.dark, { y: 0.05, z: 0.226 }));
  g.add(K.box(0.86, 0.004, 0.004, M.dark, { y: 0.9, z: 0.226 }));
  for (const sx of [-1, 1]) g.add(K.box(0.015, 0.14, 0.025, M.chrome, { x: sx * 0.04, y: 1.1, z: 0.235 }));
  const tag = K.box(0.16, 0.05, 0.003, M.white, { x: -0.25, y: 1.55, z: 0.227 }); g.add(tag);
  return g;
}

// =================================================================== canvas drawings
function leaf(c, cx, cy, r, fill, vein) {
  c.fillStyle = fill;
  c.beginPath();
  c.moveTo(cx - r * 0.55, cy + r * 0.5);
  c.quadraticCurveTo(cx - r * 0.65, cy - r * 0.55, cx + r * 0.55, cy - r * 0.55);
  c.quadraticCurveTo(cx + r * 0.5, cy + r * 0.55, cx - r * 0.55, cy + r * 0.5);
  c.fill();
  c.strokeStyle = vein; c.lineWidth = Math.max(1, r * 0.09); c.lineCap = 'round';
  c.beginPath(); c.moveTo(cx - r * 0.5, cy + r * 0.45); c.lineTo(cx + r * 0.32, cy - r * 0.32); c.stroke();
}

function fitFont(c, text, weight, size, maxW) {
  let s = size;
  c.font = `${weight} ${s}px ${K.JP_FONT}`;
  while (c.measureText(text).width > maxW && s > 6) { s *= 0.94; c.font = `${weight} ${s}px ${K.JP_FONT}`; }
  return s;
}

function drawMidoriLogo(c, W, Hh) {
  const r = Hh * 0.4; const cx = r + Hh * 0.05; const cy = Hh / 2;
  c.fillStyle = '#3f8f5f'; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
  leaf(c, cx, cy, r * 0.85, '#f6f2e6', '#3f8f5f');
  const x0 = cx + r + Hh * 0.14; const maxW = W - x0 - Hh * 0.05;
  c.textAlign = 'left'; c.textBaseline = 'middle';
  c.fillStyle = 'rgba(40,60,45,0.25)';
  fitFont(c, 'みどりデザイン', 800, Hh * 0.46, maxW);
  c.fillText('みどりデザイン', x0 + 3, Hh * 0.42 + 3);
  c.fillStyle = '#2f7a5b';
  c.fillText('みどりデザイン', x0, Hh * 0.42);
  c.fillStyle = '#3f6f55';
  c.font = `700 ${Hh * 0.15}px ${K.JP_FONT}`;
  c.letterSpacing = `${Hh * 0.04}px`;
  c.fillText('MIDORI DESIGN', x0 + 4, Hh * 0.82);
  c.letterSpacing = '0px';
}

function drawKuroganeLogo(c, W, Hh) {
  const s = Hh * 0.66; const x = Hh * 0.1; const y = (Hh - s) / 2;
  c.fillStyle = '#3a3e45'; c.fillRect(x, y, s, s);
  c.fillStyle = '#c3c8cd'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = `900 ${s * 0.78}px ${K.JP_FONT}`;
  c.fillText('K', x + s / 2, y + s * 0.54);
  const x0 = x + s + Hh * 0.12; const maxW = W - x0 - Hh * 0.08;
  c.textAlign = 'left'; c.fillStyle = '#3a3e45';
  c.font = `700 ${Hh * 0.15}px ${K.JP_FONT}`;
  c.fillText('株式会社', x0, Hh * 0.2);
  fitFont(c, 'くろがねシステム', 800, Hh * 0.4, maxW);
  c.fillText('くろがねシステム', x0, Hh * 0.52);
  c.fillStyle = '#555a62';
  c.font = `600 ${Hh * 0.12}px ${K.JP_FONT}`;
  c.letterSpacing = `${Hh * 0.05}px`;
  c.fillText('KUROGANE SYSTEM', x0 + 2, Hh * 0.85);
  c.letterSpacing = '0px';
}

function scribble(c, x, y, w, color, lw = 1, r = Math.random) {
  c.strokeStyle = color; c.lineWidth = lw; c.beginPath();
  c.moveTo(x, y);
  for (let k = x; k < x + w; k += 3) c.lineTo(k, y + Math.sin(k * 0.9 + r() * 6) * lw * 0.9);
  c.stroke();
}

function drawResume(c, W, Hh) {
  const r = K.rng(4);
  c.fillStyle = '#fbfaf5'; c.fillRect(0, 0, W, Hh);
  c.fillStyle = 'rgba(0,0,0,0.07)'; c.fillRect(W / 2 - 1, 0, 2, Hh);
  const pw = W / 2;
  const ink = '#5b5b5b';
  // left page: title, photo, name/address grid, education
  c.fillStyle = '#333'; c.textBaseline = 'middle'; c.textAlign = 'left';
  c.font = `800 ${Hh * 0.075}px ${K.JP_FONT}`;
  c.fillText('履 歴 書', pw * 0.08, Hh * 0.08);
  c.fillStyle = '#e3eaf0'; c.fillRect(pw * 0.72, Hh * 0.05, pw * 0.21, Hh * 0.24);
  c.fillStyle = '#9aa7b4';
  c.beginPath(); c.arc(pw * 0.825, Hh * 0.14, Hh * 0.04, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(pw * 0.825, Hh * 0.27, pw * 0.08, Hh * 0.06, 0, Math.PI, 0); c.fill();
  c.strokeStyle = '#777'; c.lineWidth = 1;
  c.strokeRect(pw * 0.06, Hh * 0.16, pw * 0.62, Hh * 0.2);
  c.strokeRect(pw * 0.06, Hh * 0.38, pw * 0.88, Hh * 0.14);
  scribble(c, pw * 0.2, Hh * 0.27, pw * 0.3, '#333', 2, r);
  scribble(c, pw * 0.12, Hh * 0.45, pw * 0.6, ink, 1, r);
  for (let i = 0; i < 9; i++) {
    const y = Hh * (0.56 + i * 0.047);
    c.strokeStyle = '#999'; c.beginPath(); c.moveTo(pw * 0.06, y); c.lineTo(pw * 0.94, y); c.stroke();
    if (i < 7) scribble(c, pw * 0.1, y + Hh * 0.024, pw * (0.25 + r() * 0.5), ink, 1, r);
  }
  // right page: licences, motivation box
  for (let i = 0; i < 5; i++) {
    const y = Hh * (0.06 + i * 0.05);
    c.strokeStyle = '#999'; c.beginPath(); c.moveTo(pw * 1.06, y); c.lineTo(pw * 1.94, y); c.stroke();
    if (i < 3) scribble(c, pw * 1.1, y + Hh * 0.025, pw * (0.3 + r() * 0.4), ink, 1, r);
  }
  c.strokeStyle = '#777'; c.strokeRect(pw * 1.06, Hh * 0.34, pw * 0.88, Hh * 0.4);
  c.fillStyle = '#444'; c.font = `700 ${Hh * 0.035}px ${K.JP_FONT}`;
  c.fillText('志望の動機', pw * 1.09, Hh * 0.37);
  for (let i = 0; i < 6; i++) scribble(c, pw * 1.1, Hh * (0.42 + i * 0.05), pw * (0.55 + r() * 0.3), ink, 1, r);
  c.strokeRect(pw * 1.06, Hh * 0.78, pw * 0.88, Hh * 0.16);
}

function drawNotes(c, W, Hh, kind) {
  const r = K.rng(kind.length);
  c.fillStyle = kind === 'memo' ? '#fbf8ec' : '#fbfbfa'; c.fillRect(0, 0, W, Hh);
  if (kind === 'memo') {
    c.fillStyle = '#c94f4f'; c.fillRect(0, 0, W, Hh * 0.05);
    for (let i = 0; i < 12; i++) { const y = Hh * (0.12 + i * 0.07); c.strokeStyle = '#b8c8d8'; c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    for (let i = 0; i < 4; i++) scribble(c, W * 0.1, Hh * (0.15 + i * 0.07), W * (0.3 + r() * 0.5), '#3a4a7a', 1, r);
  } else {
    c.fillStyle = '#444'; c.font = `700 ${Hh * 0.06}px ${K.JP_FONT}`; c.textBaseline = 'middle'; c.textAlign = 'left';
    c.fillText('質問シート', W * 0.08, Hh * 0.07);
    for (let i = 0; i < 9; i++) {
      const y = Hh * (0.16 + i * 0.09);
      c.fillStyle = '#666'; c.fillText(`${i + 1}.`, W * 0.06, y);
      scribble(c, W * 0.18, y, W * (0.4 + r() * 0.35), '#555', 1, r);
      c.strokeStyle = '#aaa'; c.strokeRect(W * 0.86, y - Hh * 0.02, Hh * 0.04, Hh * 0.04);
    }
  }
}

function drawScreen(c, W, Hh, grey) {
  c.fillStyle = '#f3f6f9'; c.fillRect(0, 0, W, Hh);
  c.fillStyle = grey ? '#4a5260' : '#3f8f5f'; c.fillRect(0, 0, W, Hh * 0.14);
  c.fillStyle = '#ffffff'; c.textBaseline = 'middle'; c.textAlign = 'left';
  c.font = `700 ${Hh * 0.09}px ${K.JP_FONT}`;
  c.fillText('面接 評価シート', W * 0.04, Hh * 0.07);
  const r = K.rng(9);
  for (let i = 0; i < 6; i++) {
    const y = Hh * (0.24 + i * 0.12);
    c.fillStyle = '#8a929c'; c.fillRect(W * 0.05, y - 2, W * (0.22 + r() * 0.12), 4);
    for (let k = 0; k < 5; k++) {
      c.strokeStyle = '#9aa3ad'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(W * (0.55 + k * 0.08), y, Hh * 0.025, 0, Math.PI * 2); c.stroke();
      if (k === Math.floor(r() * 5) && i < 4) { c.fillStyle = grey ? '#4a5260' : '#3f8f5f'; c.fill(); }
    }
  }
}

function drawWhiteboard(c, W, Hh) {
  c.fillStyle = '#fbfcfc'; c.fillRect(0, 0, W, Hh);
  const r = K.rng(12);
  for (let i = 0; i < 14; i++) { c.fillStyle = `rgba(150,160,170,${0.04 + r() * 0.05})`; c.beginPath(); c.ellipse(r() * W, r() * Hh, 20 + r() * 50, 6 + r() * 14, r(), 0, Math.PI * 2); c.fill(); }
  const blue = '#2f5fb3';
  c.strokeStyle = blue; c.lineWidth = 3; c.lineJoin = 'round';
  // two phone wireframes and a web page
  for (const [x, y] of [[W * 0.06, Hh * 0.22], [W * 0.2, Hh * 0.22]]) {
    c.strokeRect(x, y, W * 0.1, Hh * 0.62);
    c.strokeRect(x + W * 0.012, y + Hh * 0.08, W * 0.076, Hh * 0.16);
    for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(x + W * 0.015, y + Hh * (0.32 + k * 0.06)); c.lineTo(x + W * (0.05 + r() * 0.03), y + Hh * (0.32 + k * 0.06)); c.stroke(); }
  }
  c.beginPath(); c.moveTo(W * 0.165, Hh * 0.5); c.lineTo(W * 0.195, Hh * 0.5); c.lineTo(W * 0.185, Hh * 0.46); c.stroke();
  c.strokeRect(W * 0.4, Hh * 0.22, W * 0.3, Hh * 0.5);
  c.strokeRect(W * 0.42, Hh * 0.3, W * 0.12, Hh * 0.18);
  for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(W * 0.57, Hh * (0.32 + k * 0.05)); c.lineTo(W * (0.62 + r() * 0.06), Hh * (0.32 + k * 0.05)); c.stroke(); }
  c.fillStyle = blue; c.textAlign = 'left'; c.textBaseline = 'middle';
  c.font = `700 ${Hh * 0.08}px ${K.JP_FONT}`;
  c.fillText('Webサイト リニューアル', W * 0.06, Hh * 0.1);
  c.fillStyle = '#c0392b';
  c.font = `700 ${Hh * 0.07}px ${K.JP_FONT}`;
  c.fillText('しめきり 12/5', W * 0.74, Hh * 0.3);
  c.fillStyle = '#2b2e33';
  c.font = `500 ${Hh * 0.06}px ${K.JP_FONT}`;
  c.fillText('・おみせの よやく', W * 0.74, Hh * 0.45);
  c.fillText('・スマホ ファースト', W * 0.74, Hh * 0.56);
  c.fillText('・テスト', W * 0.74, Hh * 0.67);
}

function drawPoster(c, W, Hh) {
  c.fillStyle = '#f6efe2'; c.fillRect(0, 0, W, Hh);
  const dots = [['#3f8f5f', 0.32, 0.3, 0.22], ['#e8a33c', 0.66, 0.24, 0.14], ['#7fb5d6', 0.62, 0.48, 0.1], ['#e46f6f', 0.24, 0.55, 0.08]];
  for (const [col, x, y, rr] of dots) { c.fillStyle = col; c.beginPath(); c.arc(W * x, Hh * y, W * rr, 0, Math.PI * 2); c.fill(); }
  leaf(c, W * 0.32, Hh * 0.3, W * 0.17, '#f6efe2', '#3f8f5f');
  c.fillStyle = '#3d3a35'; c.textAlign = 'center'; c.textBaseline = 'middle';
  fitFont(c, '小さな お店に、', 800, Hh * 0.075, W * 0.86);
  c.fillText('小さな お店に、', W / 2, Hh * 0.74);
  c.fillText('いい デザインを。', W / 2, Hh * 0.84);
  c.fillStyle = '#2f7a5b'; c.font = `700 ${Hh * 0.035}px ${K.JP_FONT}`;
  c.fillText('MIDORI DESIGN', W / 2, Hh * 0.94);
}

function drawHills(c, W, Hh) {
  const gr = c.createLinearGradient(0, 0, 0, Hh); gr.addColorStop(0, '#cfe6f2'); gr.addColorStop(1, '#f4ecd8');
  c.fillStyle = gr; c.fillRect(0, 0, W, Hh);
  for (const [col, y, a] of [['#9cc29a', 0.55, 0.12], ['#74a77a', 0.68, 0.1], ['#4f8a5e', 0.82, 0.08]]) {
    c.fillStyle = col; c.beginPath(); c.moveTo(0, Hh);
    for (let x = 0; x <= W; x += 6) c.lineTo(x, Hh * (y - Math.sin(x / W * Math.PI * 2 + y * 9) * a));
    c.lineTo(W, Hh); c.fill();
  }
  c.fillStyle = '#f2c66d'; c.beginPath(); c.arc(W * 0.78, Hh * 0.25, Hh * 0.09, 0, Math.PI * 2); c.fill();
}

function drawBrochure(c, W, Hh) {
  c.fillStyle = '#3f8f5f'; c.fillRect(0, 0, W, Hh);
  c.fillStyle = '#f6f2e6'; c.beginPath(); c.arc(W / 2, Hh * 0.38, W * 0.2, 0, Math.PI * 2); c.fill();
  leaf(c, W / 2, Hh * 0.38, W * 0.17, '#3f8f5f', '#f6f2e6');
  c.fillStyle = '#f6f2e6'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = `800 ${Hh * 0.09}px ${K.JP_FONT}`;
  c.fillText('会社案内', W / 2, Hh * 0.7);
}

function drawPhilosophy(c, W, Hh) {
  c.fillStyle = '#fbfaf6'; c.fillRect(0, 0, W, Hh);
  c.strokeStyle = '#b9a46a'; c.lineWidth = 3; c.strokeRect(W * 0.04, Hh * 0.05, W * 0.92, Hh * 0.9);
  c.fillStyle = '#2d3036'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = `800 ${Hh * 0.15}px ${K.JP_FONT}`;
  c.fillText('経営理念', W / 2, Hh * 0.22);
  c.textAlign = 'left';
  c.font = `700 ${Hh * 0.085}px ${K.JP_FONT}`;
  ['一、品質を 第一に', '一、お客様の 信頼に こたえる', '一、誠実に はたらく'].forEach((t, i) => c.fillText(t, W * 0.14, Hh * (0.46 + i * 0.15)));
}

function drawEvacMap(c, W, Hh) {
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, Hh);
  c.fillStyle = '#2e8b4f'; c.fillRect(0, 0, W, Hh * 0.14);
  c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
  fitFont(c, '避難経路図', 800, Hh * 0.09, W * 0.9);
  c.fillText('避難経路図', W / 2, Hh * 0.07);
  c.strokeStyle = '#555'; c.lineWidth = 2;
  c.strokeRect(W * 0.1, Hh * 0.22, W * 0.8, Hh * 0.62);
  for (const x of [0.36, 0.62]) { c.beginPath(); c.moveTo(W * x, Hh * 0.22); c.lineTo(W * x, Hh * 0.6); c.stroke(); }
  c.beginPath(); c.moveTo(W * 0.1, Hh * 0.6); c.lineTo(W * 0.9, Hh * 0.6); c.stroke();
  c.strokeStyle = '#2e8b4f'; c.lineWidth = 4;
  c.beginPath(); c.moveTo(W * 0.48, Hh * 0.45); c.lineTo(W * 0.48, Hh * 0.72); c.lineTo(W * 0.82, Hh * 0.72); c.stroke();
  c.fillStyle = '#2e8b4f'; c.beginPath(); c.moveTo(W * 0.86, Hh * 0.72); c.lineTo(W * 0.8, Hh * 0.68); c.lineTo(W * 0.8, Hh * 0.76); c.fill();
  c.fillStyle = '#d23c3c'; c.beginPath(); c.arc(W * 0.48, Hh * 0.42, W * 0.035, 0, Math.PI * 2); c.fill();
  c.font = `700 ${Hh * 0.05}px ${K.JP_FONT}`; c.fillText('現在地', W * 0.48, Hh * 0.33);
  c.fillStyle = '#333'; c.fillText('非常口', W * 0.82, Hh * 0.8);
}

// =================================================================== atlas (few draw calls)
/**
 * One canvas atlas for the scene's drawings (logo, résumé, screens, posters) and — via atlasize — every
 * plain-coloured standard material (colour → one 16 px cell), bucketed by finish, so K.finalize merges the
 * room into a handful of meshes.
 */
function makeAtlas(size = 1024) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const std = (rough, metal = 0) => new THREE.MeshStandardMaterial({ map: tex, roughness: rough, metalness: metal, alphaTest: 0.5 });
  const bucket = { matte: std(0.85), satin: std(0.5), gloss: std(0.22), metal: std(0.32, 0.75) };
  const glow = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, alphaTest: 0.5 });
  const A = { tex, bucket, glow, material: bucket.satin, own: new Set([...Object.values(bucket), glow]) };
  const CELL = 16; const BAND = 128; const PAD = 4;
  let nSolid = 0; let px = 0; let py = BAND; let rowH = 0;
  A.region = (w, h, draw) => {
    w = Math.max(4, Math.ceil(w)); h = Math.max(4, Math.ceil(h));
    if (px + w > size) { px = 0; py += rowH + PAD; rowH = 0; }
    if (py + h > size || w > size) { console.warn('interview atlas full', w, h); return null; }
    ctx.save(); ctx.translate(px, py); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip(); draw(ctx, w, h); ctx.restore();
    const r = { u0: (px + 0.5) / size, u1: (px + w - 0.5) / size, v0: 1 - (py + h - 0.5) / size, v1: 1 - (py + 0.5) / size };
    px += w + PAD; rowH = Math.max(rowH, h);
    tex.needsUpdate = true;
    return r;
  };
  const solids = new Map();
  A.solid = (color) => {
    if (!solids.has(color)) {
      const per = size / CELL;
      const x = (nSolid % per) * CELL; const y = Math.floor(nSolid / per) * CELL;
      if (y + CELL > BAND) console.warn('interview atlas: too many colours');
      nSolid++;
      ctx.fillStyle = color; ctx.fillRect(x, y, CELL, CELL);
      tex.needsUpdate = true;
      const u = (x + CELL / 2) / size; const v = 1 - (y + CELL / 2) / size;
      solids.set(color, { u0: u, u1: u, v0: v, v1: v });
    }
    return solids.get(color);
  };
  A.remap = (geo, r) => {
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, r.u0 + uv.getX(i) * (r.u1 - r.u0), r.v0 + uv.getY(i) * (r.v1 - r.v0));
    uv.needsUpdate = true;
    return geo;
  };
  A.plane = (w, h, r, o = {}) => K.mesh(A.remap(new THREE.PlaneGeometry(w, h), r), o.glow ? glow : A.material, { cast: false, ...o });
  /** A drawing of w×h metres at ppm pixels per metre (falls back to its own texture when the atlas is full). */
  A.paint = (w, h, ppm, draw, o = {}) => {
    const r = o.own ? null : A.region(w * ppm, h * ppm, draw);
    if (r) return A.plane(w, h, r, o);
    // own texture: smooth (alpha-blended) edges for big lettering, or the atlas is full
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * ppm); c.height = Math.ceil(h * ppm);
    draw(c.getContext('2d'), c.width, c.height);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const m = o.glow ? new THREE.MeshBasicMaterial({ map: t, toneMapped: false }) : new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, transparent: true });
    return K.mesh(new THREE.PlaneGeometry(w, h), m, { cast: false, ...o });
  };
  A.text = (lines, w, h, o = {}) => A.paint(w, h, o.ppm ?? 320, (c, W, Hh) => drawLabel(c, W, Hh, lines, o), o);
  return A;
}

/** Move every plain-coloured standard material onto the atlas (colour → one cell), bucketed by finish. */
function atlasize(root, A) {
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    const m = o.material;
    if (!m || Array.isArray(m) || A.own.has(m) || !m.isMeshStandardMaterial) return;
    if (m.map || m.transparent || m.alphaTest || m.side !== THREE.FrontSide) return;
    if (m.emissive && m.emissive.r + m.emissive.g + m.emissive.b > 0) return;
    if (!o.geometry.attributes.uv) return;
    const kind = m.metalness >= 0.3 ? 'metal' : m.roughness < 0.3 ? 'gloss' : m.roughness < 0.7 ? 'satin' : 'matte';
    const r = A.solid(`#${m.color.getHexString()}`);
    const geo = o.geometry.clone();
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, r.u0, r.v0);
    o.geometry = geo;
    o.material = A.bucket[kind];
  });
}

function drawLabel(g, W, H, lines, o = {}) {
  const r = (o.radius ?? 0.08) * Math.min(W, H);
  if (o.bg !== null) {
    g.fillStyle = o.bg ?? '#ffffff';
    K.roundRect(g, 0, 0, W, H, r); g.fill();
    if (o.border) {
      const lw = Math.max(2, Math.min(W, H) * (o.borderW ?? 0.05));
      g.strokeStyle = o.border; g.lineWidth = lw;
      K.roundRect(g, lw / 2, lw / 2, W - lw, H - lw, Math.max(1, r - lw / 2)); g.stroke();
    }
  }
  const arr = Array.isArray(lines) ? lines : [lines];
  const size = (o.size ?? 0.55) * H / Math.max(1, arr.length * 0.9);
  g.textBaseline = 'middle';
  arr.forEach((line, i) => {
    const l = typeof line === 'string' ? { t: line } : line;
    let s = size * (l.scale ?? 1);
    const wgt = l.weight ?? o.weight ?? 700;
    g.textAlign = 'center';
    g.font = `${wgt} ${s}px ${K.JP_FONT}`;
    g.fillStyle = l.color ?? o.fg ?? '#333333';
    const pad = W * 0.06;
    while (g.measureText(l.t).width > W - pad * 2 && s > 6) { s *= 0.92; g.font = `${wgt} ${s}px ${K.JP_FONT}`; }
    g.fillText(l.t, W / 2, H * (i + 0.5) / arr.length);
  });
}
