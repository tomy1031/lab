// cafe — 喫茶さかもと, a small warm kissaten near the office. The learner stands at a little table by the
// end of the counter: a guest sits across the table (npc1), the master works behind the counter to the
// front-right (counter), a friend can come up beside the table (npc2). Ahead: the street window and door
// (rainy / sunny street, seasonal tree), behind the counter: the back bar with siphons, bean jars, the CD
// player and the chalk menu board. Learner stands at the origin looking toward -z.
import * as THREE from 'three';
import * as K from '../kit.js';

export const meta = { indoor: true, ambience: 'cafe' };

export default function build({ setup }) {
  const time = setup.time || 'noon';
  const season = setup.season || 'spring';
  const weather = setup.weather || 'clear';
  const rain = weather === 'rain';
  const night = time === 'night';
  const dusk = time === 'evening' || night;
  const g = new THREE.Group();
  const props = {};
  const A = makeAtlas(1024);
  const add = (o, x = 0, y = 0, z = 0, ry = 0, parent = g) => { o.position.set(x, y, z); o.rotation.y = ry; parent.add(o); return o; };

  // ------------------------------------------------------------------ materials
  const M = {
    floor: K.mat('#ffffff', { map: K.woodTex('#8a5a36', [5, 6], 10), rough: 0.42 }),
    plaster: K.mat('#efe2cc', { rough: 0.95 }),
    ceil: K.mat('#e6d6bc', { rough: 1 }),
    panel: K.mat('#ffffff', { map: K.woodTex('#6b4226', [4, 1], 14), rough: 0.5 }),
    dark: K.mat('#4a2c1a', { rough: 0.45 }),
    wood: K.mat('#ffffff', { map: K.woodTex('#9c6a3e', [1, 1], 4), rough: 0.4 }),
    top: K.mat('#ffffff', { map: K.woodTex('#a8733f', [4, 1], 3), rough: 0.25 }),
    brass: K.mat('#c9a253', { metal: 0.85, rough: 0.3 }),
    chrome: K.mat('#c4c8cc', { metal: 0.9, rough: 0.25 }),
    velvet: K.mat('#8a2d2d', { rough: 0.85 }),
    white: K.mat('#f7f2ea', { rough: 0.25 }),
    glass: K.glassMat(),
    black: K.mat('#2b2522', { rough: 0.45 }),
    coffee: K.mat('#3a2014', { rough: 0.15 }),
    tea: K.mat('#b5651d', { rough: 0.15 }),
    bulb: new THREE.MeshBasicMaterial({ color: '#ffe0a0', toneMapped: false }),
  };

  // ------------------------------------------------------------------ room shell
  // floor area x -3.6..3.6, z -3.4..2.7; the back bar wall (x > 0.2) sits forward at z = -2.5,
  // the street façade (x < 0.2) is at z = -3.4 with the door and the big window.
  const X0 = -3.6; const X1 = 3.6; const ZN = -3.4; const ZB = -2.5; const ZS = 2.7; const H = 2.7;
  add(K.mesh(new THREE.PlaneGeometry(X1 - X0, ZS - ZN, 4, 4), M.floor, { rx: -Math.PI / 2, cast: false }), 0, 0, (ZN + ZS) / 2);
  add(K.mesh(new THREE.PlaneGeometry(X1 - X0, ZS - ZN), M.ceil, { rx: Math.PI / 2, cast: false }), 0, H, (ZN + ZS) / 2);
  const wallSeg = (ax, az, bx, bz, y0 = 0, y1 = H, m = M.plaster) => {
    const len = Math.hypot(bx - ax, bz - az);
    const w = K.mesh(new THREE.PlaneGeometry(len, y1 - y0), m, { cast: false });
    w.position.set((ax + bx) / 2, (y0 + y1) / 2, (az + bz) / 2);
    w.rotation.y = Math.atan2(-(bz - az), bx - ax);
    g.add(w);
    return w;
  };
  wallSeg(X0, ZS, X0, ZN); // west
  wallSeg(0.36, ZB, X1, ZB); // north (back bar)
  wallSeg(0.36, ZN, 0.36, ZB); // the short return wall
  wallSeg(X1, ZB, X1, ZS); // east
  wallSeg(X1, ZS, X0, ZS); // south
  // street façade made of thick pieces around the door (x -3.45..-2.65) and the window (x -2.25..-0.3)
  const fz = ZN - 0.08;
  const facade = [[-3.6, -3.45, 0, H], [-3.45, -2.65, 2.12, H], [-2.65, -2.25, 0, H], [-2.25, -0.3, 0, 0.72], [-2.25, -0.3, 2.28, H], [-0.3, 0.36, 0, H]];
  for (const [a, b, y0, y1] of facade) g.add(K.box(b - a, y1 - y0, 0.16, M.plaster, { x: (a + b) / 2, y: y0, z: fz, cast: false }));
  // wainscot panels + chair rail (0.92 m) around the room
  const wains = [[X0, -3.3, X0, 2.62, 'x'], [0.36, ZB, X1 - 0.05, ZB, 'z'], [X1, ZB, X1, ZS, 'x'], [X1, ZS, X0, ZS, 'z'], [-2.25, ZN, -0.3, ZN, 'z'], [-0.3, ZN, 0.36, ZN, 'z'], [-2.65, ZN, -2.25, ZN, 'z']];
  for (const [ax, az, bx, bz, axis] of wains) {
    const len = Math.hypot(bx - ax, bz - az);
    const cx = (ax + bx) / 2; const cz = (az + bz) / 2;
    const inset = axis === 'x' ? [Math.sign(-cx) * 0.012, 0] : [0, Math.sign(-cz + 0.001) * 0.012];
    const pw = axis === 'x' ? 0.024 : len; const pd = axis === 'x' ? len : 0.024;
    g.add(K.box(pw, 0.9, pd, M.panel, { x: cx + inset[0], z: cz + inset[1], cast: false }));
    g.add(K.box(axis === 'x' ? 0.05 : len, 0.05, axis === 'x' ? len : 0.05, M.dark, { x: cx + inset[0] * 2, y: 0.9, z: cz + inset[1] * 2, cast: false }));
    g.add(K.box(axis === 'x' ? 0.03 : len, 0.09, axis === 'x' ? len : 0.03, M.dark, { x: cx + inset[0] * 1.5, z: cz + inset[1] * 1.5, cast: false }));
  }
  // ceiling beams + cornice
  for (let x = -3.0; x <= 3.1; x += 1.2) g.add(K.box(0.14, 0.16, ZS - ZN, M.dark, { x, y: H - 0.16, z: (ZN + ZS) / 2, cast: false }));
  g.add(K.box(X1 - X0, 0.08, 0.06, M.dark, { y: H - 0.08, z: ZS - 0.03, cast: false }));

  // ------------------------------------------------------------------ the street outside (ahead, z < -3.4)
  const outside = buildStreet({ time, season, weather, A });
  g.add(outside.group);

  // window + door in the façade
  const win = new THREE.Group();
  const ww = 1.95; const wh = 1.56;
  win.add(K.mesh(new THREE.PlaneGeometry(ww, wh), M.glass, { cast: false, receive: false }));
  const fm = M.dark;
  win.add(K.box(ww + 0.12, 0.08, 0.14, fm, { y: -wh / 2 - 0.08, z: 0.02 }));
  win.add(K.box(ww + 0.16, 0.05, 0.24, M.wood, { y: -wh / 2 - 0.04, z: 0.08 })); // sill
  win.add(K.box(ww + 0.12, 0.08, 0.14, fm, { y: wh / 2 }));
  win.add(K.box(0.07, wh, 0.12, fm, { x: -ww / 2 - 0.02, y: -wh / 2 }));
  win.add(K.box(0.07, wh, 0.12, fm, { x: ww / 2 + 0.02, y: -wh / 2 }));
  win.add(K.box(0.04, wh, 0.06, fm, { x: 0, y: -wh / 2 }));
  win.add(K.box(ww, 0.035, 0.06, fm, { y: wh * 0.18 }));
  // café name in gold on the glass (seen mirrored from inside)
  const letters = A.text([{ t: '珈琲 さかもと', color: '#d9b45a' }], 0.9, 0.2, { bg: null, mirror: true, ppm: 360, weight: 800 });
  letters.position.set(-0.45, -0.18, 0.006);
  win.add(letters);
  if (rain) win.add(rainGlass(ww, wh, 0.012));
  const windowProp = K.prop('window', win, { labelJa: 'まど', labelEn: 'window' });
  add(windowProp, -1.275, 1.5, ZN + 0.02);
  // curtain rod + café curtains (lower half lace)
  g.add(rod(0.012, 0.012, 2.25, M.brass, { x: -1.275, y: 1.08, z: ZN + 0.09, rz: Math.PI / 2 }, 8));
  const lace = K.mat('#f6f0e2', { rough: 1, opacity: 0.72, side: THREE.DoubleSide });
  for (let i = 0; i < 2; i++) g.add(K.box(0.92, 0.36, 0.01, lace, { x: -1.76 + i * 0.97, y: 0.72, z: ZN + 0.1, cast: false }));
  // door: wood frame, glass upper half, brass handle, little bell
  const dr = new THREE.Group();
  dr.add(K.box(0.14, 2.1, 0.06, M.dark, { x: -0.35, z: -0.03 }));
  dr.add(K.box(0.14, 2.1, 0.06, M.dark, { x: 0.35, z: -0.03 }));
  dr.add(K.box(0.56, 0.95, 0.06, M.dark, { z: -0.03 }));
  dr.add(K.box(0.56, 0.15, 0.06, M.dark, { y: 1.95, z: -0.03 }));
  dr.add(K.mesh(new THREE.PlaneGeometry(0.56, 1.0), M.glass, { y: 1.45, z: -0.03, cast: false, receive: false }));
  if (rain) { const rg = rainGlass(0.56, 1.0, 0.04); rg.position.y = 1.45; dr.add(rg); }
  dr.add(K.cyl(0.015, 0.015, 0.28, M.brass, { x: 0.32, y: 0.85, z: 0.05 }, 8));
  dr.add(K.cyl(0.03, 0.045, 0.06, M.brass, { x: -0.3, y: 2.0, z: 0.08 }, 10));
  add(dr, -3.05, 0, ZN + 0.02);
  // umbrella stand by the door (wet umbrellas when it rains)
  const ust = new THREE.Group();
  ust.add(K.cyl(0.13, 0.12, 0.42, K.mat('#5d6a6f', { metal: 0.5, rough: 0.4 }), {}, 14));
  const umbCols = rain ? ['#2f5f8a', '#c0504d', '#3f7a52', '#e8e4da'] : ['#2f5f8a'];
  umbCols.forEach((c, i) => {
    const u = new THREE.Group();
    u.add(K.cyl(0.006, 0.006, 0.82, K.mat('#444'), {}, 6));
    u.add(K.cyl(0.012, 0.045, 0.42, K.mat(c, { rough: rain ? 0.2 : 0.7 }), { y: 0.36 }, 8));
    u.add(K.mesh(new THREE.TorusGeometry(0.03, 0.007, 6, 10, Math.PI), K.mat('#6b4a32'), { y: 0.84, x: 0.03 }));
    u.position.set(Math.cos(i * 1.7) * 0.05, 0.02, Math.sin(i * 1.7) * 0.05);
    u.rotation.set(Math.sin(i * 2.3) * 0.18, i, Math.cos(i * 2.3) * 0.18);
    ust.add(u);
  });
  add(ust, -2.48, 0, ZN + 0.32);
  if (rain) g.add(K.box(0.9, 0.012, 0.6, K.mat('#5a4a3c', { rough: 1 }), { x: -3.05, z: ZN + 0.42, cast: false })); // door mat

  // ------------------------------------------------------------------ the counter (front-right) + stools
  const CX0 = 0.22; const CX1 = 3.05; const CZF = -0.62; const CZB = -1.18; const CH = 1.0;
  const cw = CX1 - CX0; const ccx = (CX0 + CX1) / 2;
  g.add(K.box(cw, CH - 0.06, CZF - CZB - 0.12, M.panel, { x: ccx, z: (CZF + CZB) / 2 - 0.02 }));
  for (let x = CX0 + 0.3; x < CX1 - 0.1; x += 0.47) g.add(K.box(0.05, CH - 0.2, 0.03, M.dark, { x, y: 0.1, z: CZF - 0.065 }));
  g.add(K.box(cw, 0.1, 0.05, M.dark, { x: ccx, z: CZF - 0.05 }));
  g.add(K.rbox(cw + 0.1, 0.06, CZF - CZB + 0.1, 0.015, M.top, { x: ccx, y: CH - 0.06, z: (CZF + CZB) / 2 + 0.03 }));
  g.add(rod(0.018, 0.018, cw - 0.2, M.brass, { x: ccx, y: 0.22, z: CZF + 0.04, rz: Math.PI / 2 }, 8)); // foot rail
  g.add(K.box(0.1, CH - 0.06, CZF - CZB, M.dark, { x: CX0 + 0.05, z: (CZF + CZB) / 2 })); // end panel
  for (const x of [1.35, 2.05, 2.75]) add(stool(M), x, 0, CZF + 0.36);
  // the master's side: duckboard floor
  g.add(K.box(CX1 - CX0 + 0.2, 0.03, CZB - ZB, K.mat('#ffffff', { map: K.woodTex('#7a5234', [3, 2], 9), rough: 0.7 }), { x: ccx + 0.1, z: (CZB + ZB) / 2, cast: false }));

  // register at the left end of the counter, chocolates in a little dish
  const reg = K.prop('register', register(M, A), { labelJa: 'レジ', labelEn: 'cash register' });
  add(reg, 1.08, CH, -1.0, -0.5);
  const choc = new THREE.Group();
  choc.add(K.cyl(0.07, 0.05, 0.025, M.white, {}, 16));
  for (let i = 0; i < 6; i++) choc.add(K.box(0.028, 0.012, 0.028, K.mat(i % 2 ? '#5a3220' : '#7a4a2e', { rough: 0.4 }), { x: Math.cos(i) * 0.035, y: 0.022, z: Math.sin(i) * 0.035, ry: i }));
  add(choc, 0.5, CH, -0.78);
  // cake case on the counter
  const cake = K.prop('cake_case', cakeCase(M, A), { labelJa: 'ケーキの ケース', labelEn: 'cake case' });
  add(cake, 1.78, CH, -0.9);
  // siphons on the counter, a sugar pot and a little plant
  for (const x of [2.35, 2.62]) add(siphon(M), x, CH, -0.98);
  add(smallPlant(0.9, 5), 2.95, CH, -0.82);

  // ------------------------------------------------------------------ the back bar
  const bb = new THREE.Group();
  bb.add(K.box(3.2, 0.88, 0.48, M.panel, { z: 0.24 }));
  bb.add(K.box(3.24, 0.04, 0.52, M.top, { y: 0.88, z: 0.25 }));
  for (const [x0, x1] of [[-1.6, -0.6], [0.72, 1.6]]) for (const y of [1.38, 1.78]) bb.add(K.box(x1 - x0, 0.035, 0.26, M.dark, { x: (x0 + x1) / 2, y, z: 0.13 }));
  add(bb, 1.98, 0, ZB);
  // cups & saucers on the left shelves, bean jars and tea tins on the right
  const cupRow = (x0, n, y, z) => { for (let i = 0; i < n; i++) add(cup(M, null, 10), x0 + i * 0.13, y, z, 0.6); };
  cupRow(0.52, 7, 1.415, ZB + 0.13); cupRow(0.52, 7, 1.815, ZB + 0.13);
  const jarLabels = ['ブラジル', 'コロンビア', 'モカ', 'マンデリン', 'キリマン ジャロ'];
  jarLabels.forEach((t, i) => add(beanJar(M, A, t, i), 2.78 + i * 0.165, 1.415, ZB + 0.14));
  ['インド', 'ダージリン', 'アッサム', 'セイロン'].forEach((t, i) => add(teaTin(A, t, i), 2.82 + i * 0.2, 1.815, ZB + 0.13));
  // worktop: grinder, kettle, cups, a plate of toast for the menu
  add(grinder(M), 2.0, 0.92, ZB + 0.25);
  add(kettle(M), 2.55, 0.92, ZB + 0.25);
  for (let i = 0; i < 3; i++) add(cup(M, M.coffee, 12), 1.2 + i * 0.16, 0.92, ZB + 0.3);
  // CD player + CDs at the left end of the back bar (by the master)
  const cdp = K.prop('cd_player', cdPlayer(M, A), { labelJa: 'CDプレーヤー', labelEn: 'CD player' });
  add(cdp, 0.8, 0.92, ZB + 0.24);
  // menu board (chalk) between the shelves
  const menu = K.prop('menu_board', menuBoard(A, M), { labelJa: 'メニュー', labelEn: 'menu board' });
  add(menu, 1.98, 1.86, ZB + 0.03);
  // kitchen door with noren on the east wall, behind the counter
  const kd = new THREE.Group();
  kd.add(K.box(0.86, 2.08, 0.05, M.dark, {}));
  const noren = A.text([{ t: 'ちゅうぼう', scale: 0.7 }], 0.84, 0.62, { bg: '#2f4a6a', fg: '#f4ead8', radius: 0.01 });
  noren.position.set(0, 1.62, 0.04);
  kd.add(noren);
  kd.add(rod(0.012, 0.012, 0.9, M.brass, { y: 1.94, z: 0.04, rz: Math.PI / 2 }, 6));
  add(kd, X1 - 0.03, 0, -1.56, -Math.PI / 2);

  // ------------------------------------------------------------------ the learner's little table
  const tbl = K.prop('table', pedestalTable(0.66, 0.66, 0.72, M.top, M.black), { labelJa: 'テーブル', labelEn: 'table' });
  add(tbl, -0.5, 0, -0.58);
  const myChair = cafeChair(M); add(myChair, -0.62, 0, 0.12, Math.PI + 0.25);
  const npc1Pos = { x: -0.5, z: -1.22 };
  const npc1Yaw = K.faceYaw(npc1Pos, { x: 0, z: 0 });
  const c1 = cafeChair(M); add(c1, npc1Pos.x + Math.sin(npc1Yaw) * 0.08, 0, npc1Pos.z + Math.cos(npc1Yaw) * 0.08, npc1Yaw);
  // coffee + tea on the learner's side of the table
  const cc = K.prop('coffee_cup', cup(M, M.coffee, 18, true), { labelJa: 'コーヒー', labelEn: 'coffee cup' });
  add(cc, -0.27, 0.72, -0.4, 0.4);
  const tc = K.prop('tea_cup', teaCup(M), { labelJa: 'こうちゃ', labelEn: 'tea cup' });
  add(tc, -0.66, 0.72, -0.4, 0.2);
  add(tableSet(M, A), -0.5, 0.72, -0.78);

  // ------------------------------------------------------------------ the rest of the room
  // window table (ahead, behind the guest)
  add(pedestalTable(0.6, 0.6, 0.72, M.top, M.black), -1.25, 0, -2.85);
  add(cafeChair(M), -1.72, 0, -2.85, Math.PI / 2);
  add(cafeChair(M), -0.78, 0, -2.85, -Math.PI / 2);
  add(tableSet(M, A), -1.25, 0.72, -2.85);
  // red velvet banquette along the west wall with two tables
  add(banquette(M, 3.4), X0 + 0.27, 0, -0.35);
  for (const z of [-1.35, 0.55]) {
    add(pedestalTable(0.62, 0.62, 0.72, M.top, M.black), -2.75, 0, z);
    add(cafeChair(M), -2.12, 0, z, -Math.PI / 2);
    add(tableSet(M, A), -2.75, 0.72, z - 0.12);
  }
  // pictures / records on the walls
  add(framedPicture(A, 'sea', 0.7, 0.5, M), X0 + 0.02, 1.62, -1.35, Math.PI / 2);
  add(framedPicture(A, 'mountain', 0.6, 0.45, M), X0 + 0.02, 1.62, 0.55, Math.PI / 2);
  // newspaper rack near the south-west corner
  const np = K.prop('newspaper', newspaperRack(M, A), { labelJa: 'しんぶん', labelEn: 'newspaper' });
  add(np, -3.0, 0, 2.47, Math.PI);
  // tables behind the learner
  for (const [x, z] of [[0.9, 1.45], [2.6, 0.55]]) {
    add(pedestalTable(0.62, 0.62, 0.72, M.top, M.black), x, 0, z);
    add(cafeChair(M), x, 0, z - 0.55, 0);
    add(cafeChair(M), x, 0, z + 0.55, Math.PI);
    add(tableSet(M, A), x, 0.72, z);
  }
  // bookshelf on the south wall, restroom door, coat rack
  add(bookshelf(A, M), -0.9, 0, ZS - 0.18, Math.PI);
  const wc = new THREE.Group();
  wc.add(K.box(0.8, 2.05, 0.05, M.dark, {}));
  const wcs = A.text([{ t: 'お手洗い', scale: 0.9 }], 0.36, 0.13, { bg: '#f4ead8', fg: '#4a2c1a', radius: 0.15 });
  wcs.position.set(0, 1.62, 0.03); wc.add(wcs);
  wc.add(rod(0.015, 0.015, 0.12, M.brass, { x: 0.3, y: 0.95, z: 0.04, rx: Math.PI / 2 }, 8));
  add(wc, 2.5, 0, ZS - 0.03, Math.PI);
  add(coatRack(M), 1.55, 0, ZS - 0.3);
  // speakers high in the corners (jazz!)
  for (const [x, z, r] of [[X1 - 0.25, ZB + 0.2, -0.6], [X0 + 0.25, ZS - 0.25, 2.4]]) add(speaker(M), x, 2.1, z, r);
  // record sleeves on the east wall
  for (let i = 0; i < 3; i++) add(recordSleeve(A, i, M), X1 - 0.02, 1.6, 0.2 + i * 0.42, -Math.PI / 2);
  // plants
  add(K.plant(1.25, 11), -0.05, 0, -3.1);
  add(K.plant(1.1, 17), X1 - 0.35, 0, 2.3);
  add(K.plant(0.9, 23), X0 + 0.32, 0, 1.75);
  add(hangingPlant(), 3.25, 1.95, -0.85);
  // jazz poster on the pier between the door and the window
  const poster = K.prop('poster_concert', concertPoster(A, M), { labelJa: 'ジャズの ポスター', labelEn: 'jazz concert poster' });
  add(poster, -2.45, 1.48, ZN + 0.02);
  // wall clock above the window
  const hhmm = { morning: [8, 55], noon: [12, 20], evening: [17, 40], night: [20, 10] }[time] || [12, 20];
  const clk = K.prop('clock', K.clock(0.17, hhmm[0], hhmm[1]), { labelJa: 'とけい', labelEn: 'clock' });
  add(clk, -3.05, 2.42, ZN + 0.03);
  // little standing board on the counter: morning set / lunch
  const boardTxt = time === 'morning'
    ? [{ t: 'モーニング', scale: 1.0, color: '#b5452c' }, { t: '7:00〜11:00', scale: 0.7 }, { t: 'トースト・たまご つき', scale: 0.6 }]
    : [{ t: 'ランチ', scale: 1.0, color: '#b5452c' }, { t: '11:30〜14:00', scale: 0.7 }, { t: 'ナポリタン セット', scale: 0.6 }];
  const stand = A.text(boardTxt, 0.2, 0.16, { bg: '#fbf5e8', fg: '#3b2a1e', border: '#6b4226', radius: 0.06 });
  stand.rotation.x = -0.25; stand.position.y = 0.08;
  const standG = new THREE.Group(); standG.add(stand);
  add(standG, 0.36, CH, -0.72, -0.5);

  // ------------------------------------------------------------------ lights
  const lampSpots = [[1.2, -0.9, 2.02], [2.05, -0.9, 2.02], [2.9, -0.9, 2.02], [-0.5, -0.62, 2.22], [-1.25, -2.85, 1.75], [-2.75, -1.35, 1.8], [-2.75, 0.55, 1.8], [0.9, 1.45, 1.8], [2.6, 0.55, 1.8]];
  for (const [x, z, y] of lampSpots) add(pendant(M, H - y), x, y, z);
  const warm = dusk ? 1.5 : 1;
  const l1 = new THREE.PointLight('#ffc98a', 3.2 * warm, 5.5, 1.4); l1.position.set(-0.6, 2.1, -0.7); g.add(l1);
  const l2 = new THREE.PointLight('#ffcf94', 3.6 * warm, 6, 1.4); l2.position.set(1.9, 2.2, -1.2); g.add(l2);
  const l3 = new THREE.PointLight('#ffcf94', 2.6 * warm, 6, 1.4); l3.position.set(-1.6, 2.2, 1.2); g.add(l3);

  // ------------------------------------------------------------------ ceiling fan (moves)
  const fan = new THREE.Group();
  fan.userData.dynamic = true;
  fan.add(K.cyl(0.012, 0.012, 0.3, M.brass, {}, 6));
  fan.add(K.cyl(0.08, 0.1, 0.12, M.brass, { y: -0.12 }, 12));
  const blades = new THREE.Group();
  for (let i = 0; i < 4; i++) { const b = K.box(0.55, 0.012, 0.12, M.wood, { x: 0.33 }); const piv = new THREE.Group(); piv.rotation.y = i * Math.PI / 2; piv.add(b); blades.add(piv); }
  blades.position.y = -0.1;
  fan.add(blades);
  add(fan, 1.2, H - 0.32, 0.35);

  for (const o of [windowProp, reg, cake, cdp, menu, tbl, cc, tc, np, poster, clk]) props[o.userData.propId] = o;
  atlasize(g, A);

  const npc2Pos = { x: -1.2, z: -1.28 };
  const counterPos = { x: 0.78, z: -1.52 };
  return K.finalize({
    group: g,
    spawn: K.spot(0, 0, 0),
    slots: {
      counter: K.spot(counterPos.x, counterPos.z, K.faceYaw(counterPos, { x: 0, z: 0 })),
      npc1: { ...K.spot(npc1Pos.x, npc1Pos.z, npc1Yaw), sit: 0.46 },
      npc2: K.spot(npc2Pos.x, npc2Pos.z, K.faceYaw(npc2Pos, { x: 0, z: 0 })),
      phone: null,
    },
    props,
    center: new THREE.Vector3(-0.2, 0, -1.0),
    radius: 7,
    update(dt) {
      blades.rotation.y += dt * 1.6;
      outside.update(dt);
    },
  });
}

// =================================================================== local helpers
/** Centred cylinder (K.cyl lifts by h/2, which is wrong once it is rotated). */
function rod(rt, rb, h, material, o = {}, seg = 8) {
  return K.mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material, o);
}

/**
 * One canvas atlas shared by signs, labels, product faces and (via atlasize) every plain-coloured mesh:
 * a handful of materials for the whole scene, so K.finalize merges it into a few draw calls.
 */
function makeAtlas(size = 1024) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const std = (rough, metal = 0) => new THREE.MeshStandardMaterial({ map: tex, roughness: rough, metalness: metal, alphaTest: 0.5 });
  const bucket = { matte: std(0.72), satin: std(0.45), gloss: std(0.18), metal: std(0.3, 0.8) };
  const material = bucket.matte;
  const glow = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, alphaTest: 0.5 });
  const own = new Set([...Object.values(bucket), glow]);
  const PAD = 4;
  const sky = [{ x: 0, y: 0, w: size }];
  const fit = (i, w, h) => {
    if (sky[i].x + w > size) return -1;
    let left = w; let j = i; let y = 0;
    while (left > 0) {
      if (j >= sky.length) return -1;
      y = Math.max(y, sky[j].y);
      if (y + h > size) return -1;
      left -= sky[j].w; j++;
    }
    return y;
  };
  const place = (w, h) => {
    let best = -1; let bestY = Infinity;
    for (let i = 0; i < sky.length; i++) { const y = fit(i, w, h); if (y >= 0 && y < bestY) { best = i; bestY = y; } }
    if (best < 0) return null;
    const x = sky[best].x;
    sky.splice(best, 0, { x, y: bestY + h, w });
    for (let i = best + 1; i < sky.length; i++) {
      const prev = sky[i - 1]; const end = prev.x + prev.w;
      if (sky[i].x >= end) break;
      const cut = end - sky[i].x;
      sky[i].x += cut; sky[i].w -= cut;
      if (sky[i].w <= 0) { sky.splice(i, 1); i--; } else break;
    }
    for (let i = 0; i < sky.length - 1; i++) if (sky[i].y === sky[i + 1].y) { sky[i].w += sky[i + 1].w; sky.splice(i + 1, 1); i--; }
    return { x, y: bestY };
  };
  const solids = new Map();
  const A = { material, glow, bucket, tex, ctx, own };
  A.region = (w, h, draw) => {
    w = Math.max(4, Math.ceil(w)); h = Math.max(4, Math.ceil(h));
    const at = place(w + PAD, h + PAD);
    if (!at) { console.warn('atlas full', w, h); return { u0: 0, u1: 0.001, v0: 0.999, v1: 1 }; }
    const { x, y } = at;
    ctx.save(); ctx.translate(x, y); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip(); draw(ctx, w, h); ctx.restore();
    return { u0: (x + 0.5) / size, u1: (x + w - 0.5) / size, v0: 1 - (y + h - 0.5) / size, v1: 1 - (y + 0.5) / size };
  };
  A.solid = (color) => {
    if (!solids.has(color)) {
      const r = A.region(12, 12, (g) => { g.fillStyle = color; g.fillRect(0, 0, 12, 12); });
      const u = (r.u0 + r.u1) / 2; const v = (r.v0 + r.v1) / 2;
      solids.set(color, { u0: u, u1: u, v0: v, v1: v });
    }
    return solids.get(color);
  };
  A.remap = (geo, r, from = 0, count = Infinity) => {
    const uv = geo.attributes.uv;
    for (let i = from; i < Math.min(uv.count, from + count); i++) uv.setXY(i, r.u0 + uv.getX(i) * (r.u1 - r.u0), r.v0 + uv.getY(i) * (r.v1 - r.v0));
    uv.needsUpdate = true;
    return geo;
  };
  /** Box (bottom at y=0) with per-face regions [px, nx, py, ny, pz(front), nz]. */
  A.boxGeo = (w, h, d, faces) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    faces.forEach((r, i) => A.remap(geo, r, i * 4, 4));
    geo.translate(0, h / 2, 0);
    return geo;
  };
  A.box = (w, h, d, front, side, o = {}) => K.mesh(A.boxGeo(w, h, d, [side, side, o.top ?? side, side, front, o.back ?? side]), o.glow ? glow : (o.mat ?? material), o);
  A.plane = (w, h, r, o = {}) => K.mesh(A.remap(new THREE.PlaneGeometry(w, h), r), o.glow ? glow : material, { cast: false, ...o });
  A.text = (lines, w, h, o = {}) => {
    const ppm = o.ppm ?? 300;
    const r = A.region(w * ppm, h * ppm, (g, W, Hh) => {
      if (o.mirror) { g.translate(W, 0); g.scale(-1, 1); }
      drawLabel(g, W, Hh, lines, o);
    });
    return A.plane(w, h, r, o);
  };
  return A;
}

/** Move every plain-coloured standard material onto the atlas (colour → one texel), bucketed by finish. */
function atlasize(root, A) {
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    const m = o.material;
    if (!m || Array.isArray(m) || A.own.has(m) || !m.isMeshStandardMaterial) return;
    if (m.map || m.transparent || m.alphaTest || m.side !== THREE.FrontSide) return;
    if (m.emissive && m.emissive.r + m.emissive.g + m.emissive.b > 0) return;
    if (!o.geometry.attributes.uv) return;
    const kind = m.metalness >= 0.3 ? 'metal' : m.roughness < 0.3 ? 'gloss' : m.roughness < 0.6 ? 'satin' : 'matte';
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
      const lw = Math.max(2, Math.min(W, H) * (o.borderW ?? 0.06));
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
    const align = l.align ?? o.align ?? 'center';
    g.textAlign = align;
    g.font = `${wgt} ${s}px ${K.JP_FONT}`;
    g.fillStyle = l.color ?? o.fg ?? '#333333';
    const pad = W * (o.pad ?? 0.06);
    const x = align === 'left' ? pad : align === 'right' ? W - pad : W / 2;
    const y = H * (l.y ?? (i + 0.5) / arr.length);
    while (g.measureText(l.t).width > W - pad * 2 && s > 6) { s *= 0.92; g.font = `${wgt} ${s}px ${K.JP_FONT}`; }
    g.fillText(l.t, x, y);
  });
}

/** Translucent rain trickles on a window (a plane just inside the glass). */
let rainGlassMat = null;
function rainGlass(w, h, z = 0.01) {
  if (!rainGlassMat) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 512;
    const g = c.getContext('2d');
    const r = K.rng(31);
    for (let i = 0; i < 70; i++) {
      const x = r() * 256; let y = r() * 400; const len = 30 + r() * 140;
      g.strokeStyle = `rgba(235,242,250,${0.25 + r() * 0.35})`;
      g.lineWidth = 1 + r() * 2;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < len; k += 10) { y += 10; g.lineTo(x + Math.sin((y + i) * 0.07) * 2, y); }
      g.stroke();
      g.fillStyle = 'rgba(240,246,252,0.55)';
      g.beginPath(); g.arc(x, y, 2 + r() * 2, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(235,242,250,${0.2 + r() * 0.35})`; g.beginPath(); g.arc(r() * 256, r() * 512, 0.8 + r() * 2.2, 0, Math.PI * 2); g.fill(); }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    rainGlassMat = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.8 });
  }
  const geo = new THREE.PlaneGeometry(w, h);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * 0.9, uv.getY(i) * h * 0.6);
  return K.mesh(geo, rainGlassMat, { z, cast: false, receive: false });
}

/** Falling rain (dynamic LineSegments) inside a box. */
function rainField(x0, x1, z0, z1, y1 = 6, n = 700) {
  const pos = new Float32Array(n * 6);
  const r = K.rng(77);
  for (let i = 0; i < n; i++) {
    const x = x0 + r() * (x1 - x0); const z = z0 + r() * (z1 - z0); const y = r() * y1;
    pos.set([x, y, z, x + 0.01, y - 0.3, z], i * 6);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#d4dde6', transparent: true, opacity: 0.45 }));
  lines.frustumCulled = false;
  const grp = new THREE.Group();
  grp.userData.dynamic = true;
  grp.add(lines);
  grp.userData.tick = (dt) => {
    const p = geo.attributes.position.array;
    for (let i = 0; i < p.length; i += 6) {
      p[i + 1] -= dt * 8; p[i + 4] -= dt * 8;
      if (p[i + 4] < 0) { p[i + 1] += y1; p[i + 4] += y1; }
    }
    geo.attributes.position.needsUpdate = true;
  };
  return grp;
}

const FOLIAGE = {
  spring: ['#f6c6d3', '#f9dbe4', '#efb2c4', '#fbe7ee'],
  summer: ['#4f8a46', '#5f9a50', '#3f7a3e', '#6aa65a'],
  autumn: ['#d8662c', '#e8a33c', '#c4452c', '#d98b2b'],
  winter: null,
};

function streetTree(season, seed = 1, scale = 1) {
  const t = new THREE.Group();
  const bark = K.mat('#5a4636', { rough: 0.9 });
  t.add(K.cyl(0.09 * scale, 0.13 * scale, 2.6 * scale, bark, {}, 8));
  const r = K.rng(seed);
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2 + r();
    const br = K.cyl(0.03, 0.06, 1.1 * scale, bark, {}, 6);
    br.position.set(Math.cos(a) * 0.15, 1.6 * scale + r() * 0.5, Math.sin(a) * 0.15);
    br.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7);
    t.add(br);
  }
  const cols = FOLIAGE[season];
  if (cols) {
    const geo = new THREE.IcosahedronGeometry(0.55 * scale, 1);
    for (let i = 0; i < 16; i++) {
      const a = r() * Math.PI * 2; const rad = r() * 1.0 * scale;
      const m = K.mesh(geo, K.mat(cols[i % cols.length], { rough: 0.85 }), { x: Math.cos(a) * rad, y: (1.95 + r() * 1.3) * scale, z: Math.sin(a) * rad });
      m.scale.setScalar(0.7 + r() * 0.6);
      t.add(m);
    }
  }
  return t;
}

/** Street seen through the window: pavement, road, a seasonal tree, lamp, bicycle, planter, painted shops across. */
function buildStreet({ time, season, weather, A }) {
  const grp = new THREE.Group();
  const rain = weather === 'rain';
  const wet = rain ? 0.12 : 0.85;
  const z0 = -3.48;
  const pave = K.mat('#ffffff', { map: K.tileTex('#b9b2a6', '#aaa397', 6, [5, 2], '#8d877d'), rough: wet, metal: rain ? 0.25 : 0 });
  const road = K.mat('#ffffff', { map: K.noiseTex('#55575c', 0.12, [6, 3], 'asphalt'), rough: rain ? 0.08 : 0.9, metal: rain ? 0.35 : 0 });
  grp.add(K.mesh(new THREE.PlaneGeometry(16, 2.9, 8, 2), pave, { rx: -Math.PI / 2, x: -1, y: 0.0, z: z0 - 1.45, cast: false }));
  grp.add(K.box(16, 0.14, 0.18, K.mat('#9b968c', { rough: 0.8 }), { x: -1, y: -0.02, z: z0 - 2.95, cast: false }));
  grp.add(K.mesh(new THREE.PlaneGeometry(16, 6, 8, 4), road, { rx: -Math.PI / 2, x: -1, y: -0.06, z: z0 - 6.0, cast: false }));
  for (let i = 0; i < 6; i++) grp.add(K.box(1.4, 0.005, 0.12, K.mat('#e9e6dc', { rough: rain ? 0.2 : 0.8 }), { x: -7 + i * 2.6, y: -0.06, z: z0 - 6.0, cast: false }));
  grp.add(K.mesh(new THREE.PlaneGeometry(24, 7, 12, 4), pave, { rx: -Math.PI / 2, x: -3, y: 0.0, z: z0 - 12.5, cast: false }));
  if (rain) {
    const pud = K.mat('#6d7684', { rough: 0.02, metal: 0.6 });
    for (const [x, z, s] of [[-1.6, -4.3, 0.9], [-0.4, -5.6, 1.3], [-2.6, -7.8, 1.6], [-0.9, -9.0, 1.1]]) {
      const p = K.mesh(new THREE.CircleGeometry(0.5, 16), pud, { rx: -Math.PI / 2, x, y: z < -6.4 ? -0.055 : 0.004, z, cast: false });
      p.scale.set(s, s * 0.6, 1);
      grp.add(p);
    }
  }
  // awning over the window (green & cream stripes) — its scalloped edge shows at the top of the window
  const aw = new THREE.Group();
  const stripeA = K.mat('#3f6b4e', { rough: 0.8 }); const stripeB = K.mat('#efe6d2', { rough: 0.8 });
  for (let i = 0; i < 10; i++) aw.add(K.box(0.24, 0.02, 0.9, i % 2 ? stripeA : stripeB, { x: -1.275 + (i - 4.5) * 0.24 }));
  aw.rotation.x = -0.45;
  aw.position.set(0, 2.42, z0 - 0.42);
  grp.add(aw);
  for (let i = 0; i < 10; i++) {
    const v = K.box(0.24, 0.16, 0.01, i % 2 ? stripeA : stripeB, { x: -1.275 + (i - 4.5) * 0.24, y: 2.06, z: z0 - 0.84 });
    grp.add(v);
    grp.add(K.mesh(new THREE.CircleGeometry(0.12, 8, Math.PI, Math.PI), i % 2 ? stripeA : stripeB, { x: -1.275 + (i - 4.5) * 0.24, y: 2.06, z: z0 - 0.84, cast: false }));
  }
  // planter box under the window with seasonal flowers
  grp.add(K.box(1.9, 0.74, 0.3, K.mat('#7a5638', { rough: 0.8 }), { x: -1.28, z: z0 - 0.2 }));
  const flowerCols = { spring: ['#f4a6c0', '#ffffff', '#f6d55c'], summer: ['#e85d75', '#f6d55c', '#7fb5d6'], autumn: ['#d97a2b', '#a83a3a', '#e8c547'], winter: ['#d84a4a', '#f2f2f2', '#3f6a3e'] }[season];
  const fr = K.rng(5);
  for (let i = 0; i < 22; i++) {
    const s = K.mesh(new THREE.IcosahedronGeometry(0.05, 0), K.mat(i % 3 === 0 ? '#4f7a4a' : flowerCols[i % 3], { rough: 0.8 }), { x: -2.15 + fr() * 1.75, y: 0.76 + fr() * 0.1, z: z0 - 0.12 - fr() * 0.18 });
    grp.add(s);
  }
  // the street tree right outside, a lamp post, a parked bicycle, guard rail
  const tree = streetTree(season, 3, 1.0);
  tree.position.set(-1.9, 0, z0 - 2.5);
  grp.add(tree);
  const pole = K.mat('#4c5156', { metal: 0.6, rough: 0.4 });
  const lamp = new THREE.Group();
  lamp.add(K.cyl(0.05, 0.07, 4.2, pole, {}, 8));
  lamp.add(K.box(0.6, 0.06, 0.08, pole, { x: 0.3, y: 4.15 }));
  lamp.add(K.box(0.36, 0.08, 0.18, new THREE.MeshBasicMaterial({ color: time === 'night' || time === 'evening' ? '#fff1c8' : '#d8d8d0', toneMapped: false }), { x: 0.55, y: 4.07 }));
  lamp.position.set(-3.3, 0, z0 - 2.6);
  grp.add(lamp);
  const bike = bicycle(K.mat('#3c6e8f', { metal: 0.4, rough: 0.4 }));
  bike.position.set(-0.6, 0, z0 - 1.2); bike.rotation.y = Math.PI / 2 - 0.2;
  grp.add(bike);
  for (let i = 0; i < 5; i++) grp.add(K.cyl(0.03, 0.03, 0.8, K.mat('#e8e4da', { metal: 0.3 }), { x: -4.8 + i * 1.8, y: 0, z: z0 - 2.75 }, 8));
  grp.add(K.box(8, 0.06, 0.05, K.mat('#e8e4da', { metal: 0.3 }), { x: -1.2, y: 0.74, z: z0 - 2.75 }));
  // shops across the street: painted backdrop
  const bd = K.mesh(new THREE.PlaneGeometry(36, 13, 8, 4), new THREE.MeshBasicMaterial({ map: streetTex(time, weather, season), toneMapped: false, transparent: true, alphaTest: 0.4, fog: false }), { x: -3, y: 5.1, z: z0 - 16, cast: false, receive: false });
  grp.add(bd);
  const field = rain ? rainField(-6, 3, z0 - 0.5, z0 - 10, 5.5, 650) : null;
  if (field) grp.add(field);
  return { group: grp, update(dt) { field?.userData.tick(dt); } };
}

function streetTex(time, weather, season) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 384;
  const g = c.getContext('2d');
  const r = K.rng(19);
  const night = time === 'night'; const dusk = time === 'evening';
  const grey = weather === 'rain' ? 0.6 : weather === 'cloudy' ? 0.78 : 1;
  const tint = (hex, k = 1) => {
    const col = new THREE.Color(hex);
    if (night) col.multiplyScalar(0.28); else if (dusk) col.lerp(new THREE.Color('#ff9a5a'), 0.2).multiplyScalar(0.85);
    else if (time === 'morning') col.lerp(new THREE.Color('#fff0d6'), 0.15);
    const l = (col.r + col.g + col.b) / 3;
    col.lerp(new THREE.Color(l, l, l), 1 - grey);
    col.multiplyScalar(k * (0.75 + grey * 0.25));
    return `#${col.getHexString()}`;
  };
  const shops = [['ベーカリー', '#f2d7a8'], ['花', '#f6c6d3'], ['本', '#d8e4ec'], ['くすり', '#e9f0dc'], ['ラーメン', '#f0c8a0'], ['不動産', '#e4e4e4'], ['ケーキ', '#f8e0e8'], ['クリーニング', '#dce8f0']];
  let x = 0; let i = 0;
  while (x < 1024) {
    const bw = 90 + r() * 70; const bh = 150 + r() * 190;
    const facade = ['#d9cbb4', '#c9c2b8', '#e3d7c6', '#b9b1a7', '#d6c2a8', '#c2b6a2'][i % 6];
    g.fillStyle = tint(facade); g.fillRect(x, 384 - bh, bw, bh);
    // windows
    for (let wy = 384 - bh + 14; wy < 384 - 90; wy += 34) for (let wx = x + 10; wx < x + bw - 22; wx += 28) {
      g.fillStyle = night ? (r() > 0.45 ? 'rgba(255,214,140,0.95)' : tint('#3a4250')) : tint(r() > 0.5 ? '#a9bccb' : '#93a7b8');
      g.fillRect(wx, wy, 16, 20);
    }
    // ground-floor shop with awning + sign
    const [name, col] = shops[i % shops.length];
    g.fillStyle = night ? 'rgba(255,226,170,0.95)' : tint('#e9e4d8'); g.fillRect(x + 6, 384 - 62, bw - 12, 62);
    g.fillStyle = tint(['#b5452c', '#3f6b4e', '#2f5f8a', '#c08a2c'][i % 4]); g.fillRect(x + 4, 384 - 78, bw - 8, 16);
    g.fillStyle = night ? '#fff4dc' : tint(col, 1.05); g.fillRect(x + 12, 384 - 104, bw - 24, 22);
    g.fillStyle = night ? '#5a3a20' : tint('#3a2a1e');
    g.font = `700 16px ${K.JP_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(name, x + bw / 2, 384 - 93);
    // vertical sign
    if (i % 3 === 1) { g.fillStyle = night ? '#ffd27a' : tint('#f4e3b5'); g.fillRect(x + bw - 18, 384 - bh + 30, 14, 90); }
    x += bw + 3; i++;
  }
  // utility pole + wires
  g.strokeStyle = night ? '#1a1c22' : tint('#4a4a4a'); g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, 120); g.quadraticCurveTo(512, 150, 1024, 115); g.stroke();
  g.beginPath(); g.moveTo(0, 135); g.quadraticCurveTo(512, 168, 1024, 130); g.stroke();
  g.fillStyle = night ? '#22242a' : tint('#7d7468'); g.fillRect(610, 100, 10, 284);
  if (weather !== 'clear') { g.fillStyle = weather === 'rain' ? 'rgba(170,180,190,0.28)' : 'rgba(200,205,210,0.18)'; g.fillRect(0, 0, 1024, 384); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function bicycle(frameMat) {
  const b = new THREE.Group();
  const tire = K.mat('#222', { rough: 0.7 });
  for (const x of [-0.5, 0.5]) b.add(K.mesh(new THREE.TorusGeometry(0.3, 0.025, 6, 20), tire, { x, y: 0.32 }));
  b.add(K.box(0.9, 0.04, 0.04, frameMat, { y: 0.5, rz: 0.1 }));
  b.add(K.box(0.04, 0.45, 0.04, frameMat, { x: -0.15, y: 0.3, rz: 0.3 }));
  b.add(K.box(0.04, 0.5, 0.04, frameMat, { x: 0.45, y: 0.32, rz: -0.25 }));
  b.add(K.box(0.2, 0.05, 0.1, K.mat('#2a2a2a'), { x: -0.22, y: 0.78 }));
  b.add(K.box(0.04, 0.04, 0.5, K.mat('#999', { metal: 0.7 }), { x: 0.48, y: 0.92 }));
  b.add(K.box(0.28, 0.2, 0.32, K.mat('#bbb', { metal: 0.6, rough: 0.4 }), { x: 0.65, y: 0.72 }));
  return b;
}

// --------------------------------------------------------------- furniture & small things
function pedestalTable(w, d, h, topMat, legMat) {
  const t = new THREE.Group();
  t.add(K.rbox(w, 0.04, d, 0.012, topMat, { y: h - 0.04 }));
  t.add(K.cyl(0.035, 0.045, h - 0.06, legMat, { y: 0.03 }, 10));
  t.add(K.cyl(0.2, 0.24, 0.03, legMat, {}, 16));
  return t;
}

function cafeChair(M) {
  const c = new THREE.Group();
  c.add(K.rbox(0.42, 0.06, 0.4, 0.02, M.velvet, { y: 0.42 }));
  c.add(K.box(0.4, 0.03, 0.38, M.dark, { y: 0.4 }));
  for (const [x, z] of [[-0.17, -0.16], [0.17, -0.16], [-0.17, 0.16], [0.17, 0.16]]) c.add(K.cyl(0.018, 0.016, 0.41, M.dark, { x, z }, 6));
  c.add(K.cyl(0.018, 0.018, 0.5, M.dark, { x: -0.17, y: 0.45, z: -0.18 }, 6));
  c.add(K.cyl(0.018, 0.018, 0.5, M.dark, { x: 0.17, y: 0.45, z: -0.18 }, 6));
  c.add(K.rbox(0.38, 0.2, 0.04, 0.015, M.velvet, { y: 0.7, z: -0.18 }));
  return c;
}

function stool(M) {
  const s = new THREE.Group();
  s.add(K.cyl(0.19, 0.18, 0.08, M.velvet, { y: 0.7 }, 18));
  s.add(K.cyl(0.035, 0.035, 0.7, M.chrome, {}, 8));
  s.add(K.cyl(0.2, 0.22, 0.03, M.chrome, {}, 16));
  s.add(K.mesh(new THREE.TorusGeometry(0.15, 0.012, 6, 18), M.chrome, { y: 0.28, rx: Math.PI / 2 }));
  return s;
}

function banquette(M, len) {
  const b = new THREE.Group();
  b.add(K.box(0.5, 0.36, len, M.dark, {}));
  b.add(K.rbox(0.5, 0.1, len, 0.03, M.velvet, { y: 0.36 }));
  b.add(K.rbox(0.12, 0.55, len, 0.04, M.velvet, { x: -0.22, y: 0.46 }));
  for (let z = -len / 2 + 0.6; z < len / 2; z += 0.6) b.add(K.box(0.13, 0.5, 0.015, K.mat('#6f2424', { rough: 0.9 }), { x: -0.215, y: 0.48, z }));
  return b;
}

function cup(M, liquid, seg = 14, spoon = false) {
  const c = new THREE.Group();
  c.add(K.cyl(0.072, 0.06, 0.012, M.white, {}, seg + 4));
  c.add(K.cyl(0.042, 0.032, 0.065, M.white, { y: 0.01 }, seg));
  if (liquid) c.add(K.cyl(0.038, 0.038, 0.004, liquid, { y: 0.064 }, seg));
  c.add(K.mesh(new THREE.TorusGeometry(0.02, 0.006, 5, 8, Math.PI), M.white, { x: 0.044, y: 0.045, rz: -Math.PI / 2 }));
  if (spoon) c.add(K.box(0.09, 0.004, 0.012, M.chrome, { x: -0.02, y: 0.013, z: 0.05, ry: 0.4 }));
  return c;
}

function teaCup(M) {
  const c = new THREE.Group();
  c.add(K.cyl(0.075, 0.062, 0.012, M.white, {}, 18));
  c.add(K.cyl(0.052, 0.03, 0.05, M.white, { y: 0.01 }, 16));
  c.add(K.cyl(0.048, 0.048, 0.004, M.tea, { y: 0.052 }, 16));
  c.add(K.cyl(0.02, 0.02, 0.003, K.mat('#f2dc5d', { rough: 0.4 }), { x: 0.01, y: 0.055 }, 10)); // lemon
  c.add(K.mesh(new THREE.TorusGeometry(0.018, 0.005, 5, 8, Math.PI), M.white, { x: 0.054, y: 0.04, rz: -Math.PI / 2 }));
  // little teapot behind it
  const pot = new THREE.Group();
  pot.add(K.mesh(new THREE.SphereGeometry(0.065, 12, 8), M.white, { y: 0.06 }));
  pot.add(K.cyl(0.02, 0.025, 0.02, M.white, { y: 0.12 }, 8));
  pot.add(rod(0.008, 0.014, 0.08, M.white, { x: 0.07, y: 0.07, rz: -0.9 }, 6));
  pot.position.set(-0.1, 0, -0.09);
  c.add(pot);
  return c;
}

function tableSet(M, A) {
  const s = new THREE.Group();
  s.add(K.cyl(0.03, 0.035, 0.07, M.white, { x: 0.1 }, 10)); // sugar pot
  s.add(K.mesh(new THREE.SphereGeometry(0.012, 6, 4), M.white, { x: 0.1, y: 0.078 }));
  const nap = new THREE.Group();
  nap.add(K.box(0.1, 0.012, 0.06, M.chrome, {}));
  nap.add(K.box(0.08, 0.075, 0.03, K.mat('#fbfaf6', { rough: 1 }), { y: 0.01 }));
  nap.position.x = -0.08; s.add(nap);
  s.add(K.cyl(0.016, 0.022, 0.1, K.mat('#e9dcc8', { rough: 0.3 }), { x: 0.0, z: -0.04 }, 8)); // bud vase
  s.add(K.mesh(new THREE.SphereGeometry(0.02, 6, 4), K.mat('#e86a6a'), { x: 0.0, y: 0.13, z: -0.04 }));
  return s;
}

function register(M, A) {
  const r = new THREE.Group();
  const body = K.mat('#e9dfc8', { rough: 0.35 });
  r.add(K.rbox(0.3, 0.1, 0.3, 0.02, body, {}));
  r.add(K.rbox(0.26, 0.1, 0.16, 0.02, body, { y: 0.08, z: -0.06 }));
  const keys = A.region(64, 40, (g, w, h) => {
    g.fillStyle = '#d9cfb8'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 6; x++) { g.fillStyle = x > 3 ? '#c96a4a' : '#f8f4ea'; g.fillRect(3 + x * 10, 3 + y * 9, 8, 7); }
  });
  const kp = A.plane(0.24, 0.13, keys);
  kp.rotation.x = -1.0; kp.position.set(0, 0.115, 0.06);
  r.add(kp);
  const disp = A.text([{ t: '480', color: '#9be08a' }], 0.12, 0.04, { bg: '#1e2a22', radius: 0.1 });
  disp.position.set(0, 0.2, -0.02); disp.rotation.x = -0.2;
  r.add(disp);
  r.add(K.box(0.3, 0.03, 0.32, M.dark, { y: -0.02 }));
  return r;
}

function cakeCase(M, A) {
  const c = new THREE.Group();
  c.add(K.box(0.66, 0.08, 0.38, M.dark, {}));
  c.add(K.box(0.62, 0.28, 0.34, M.glass, { y: 0.08, cast: false }));
  c.add(K.box(0.64, 0.02, 0.36, M.dark, { y: 0.36 }));
  c.add(K.box(0.6, 0.01, 0.32, M.white, { y: 0.08 }));
  const cakes = [
    ['#fbf6ee', '#d93a3a'], // shortcake
    ['#4a2a1a', '#f2e6d0'], // chocolate
    ['#f1d9a0', '#e8c070'], // cheesecake
    ['#c9925a', '#7a4a28'], // mont blanc
  ];
  cakes.forEach(([body, top], i) => {
    const x = -0.22 + i * 0.145;
    const plate = K.cyl(0.05, 0.05, 0.006, M.white, { x, y: 0.09, z: 0.02 }, 12); c.add(plate);
    if (i === 3) {
      c.add(K.cyl(0.035, 0.045, 0.05, K.mat('#e8d6b0'), { x, y: 0.096, z: 0.02 }, 10));
      c.add(K.cyl(0.006, 0.042, 0.06, K.mat(body, { rough: 0.7 }), { x, y: 0.146, z: 0.02 }, 10));
    } else {
      const wedge = new THREE.CylinderGeometry(0.06, 0.06, 0.065, 6, 1, false, 0, Math.PI / 3);
      c.add(K.mesh(wedge, K.mat(body, { rough: 0.6 }), { x: x - 0.02, y: 0.13, z: 0.0, ry: -Math.PI / 6 + Math.PI / 2 }));
      c.add(K.mesh(new THREE.SphereGeometry(0.012, 6, 4), K.mat(top, { rough: 0.4 }), { x, y: 0.17, z: 0.03 }));
    }
  });
  const tag = A.text([{ t: 'ケーキ', scale: 0.8, color: '#7a3a2a' }, { t: 'かく 520円', scale: 1 }], 0.18, 0.08, { bg: '#fffaf0', fg: '#3b2a1e', border: '#c9a253', radius: 0.12 });
  tag.position.set(0.18, 0.2, 0.172);
  c.add(tag);
  return c;
}

function siphon(M) {
  const s = new THREE.Group();
  s.add(K.cyl(0.06, 0.07, 0.02, M.black, {}, 12));
  s.add(K.cyl(0.008, 0.008, 0.32, M.chrome, { x: -0.06 }, 6));
  s.add(K.cyl(0.03, 0.03, 0.05, M.brass, { y: 0.02 }, 10)); // burner
  s.add(K.mesh(new THREE.SphereGeometry(0.055, 12, 8), M.glass, { y: 0.13, cast: false }));
  s.add(K.mesh(new THREE.SphereGeometry(0.045, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.coffee, { y: 0.13 }));
  s.add(K.cyl(0.04, 0.025, 0.12, M.glass, { y: 0.19, cast: false }, 10));
  return s;
}

function beanJar(M, A, label, i) {
  const j = new THREE.Group();
  j.add(K.cyl(0.06, 0.06, 0.2, M.glass, {}, 12));
  j.add(K.cyl(0.055, 0.055, 0.15, K.mat(['#4a2a18', '#5a341e', '#3d2214', '#4f2e1a', '#603820'][i % 5], { rough: 0.9 }), {}, 10));
  j.add(K.cyl(0.062, 0.062, 0.03, M.brass, { y: 0.2 }, 12));
  const lab = A.text([{ t: label }], 0.1, 0.05, { bg: '#f8f0dc', fg: '#4a2c1a', border: '#8a6a3a', radius: 0.1 });
  lab.position.set(0, 0.09, 0.062);
  j.add(lab);
  return j;
}

function teaTin(A, label, i) {
  const t = new THREE.Group();
  const col = ['#7a2a2a', '#2a4a6a', '#3f6b4e', '#8a6a2a'][i % 4];
  const reg = A.region(80, 120, (g, w, h) => {
    g.fillStyle = col; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#d9b45a'; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#f4e6c0'; g.font = `700 ${label.length > 4 ? 13 : 17}px ${K.JP_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, w / 2, h * 0.45); g.font = `700 12px ${K.JP_FONT}`; g.fillText('TEA', w / 2, h * 0.7);
  });
  t.add(A.box(0.1, 0.15, 0.08, reg, A.solid(col), { top: A.solid('#c9a253') }));
  return t;
}

function grinder(M) {
  const gr = new THREE.Group();
  gr.add(K.box(0.14, 0.2, 0.14, M.dark, {}));
  gr.add(K.cyl(0.05, 0.03, 0.12, M.chrome, { y: 0.2 }, 10));
  gr.add(K.cyl(0.07, 0.05, 0.1, M.glass, { y: 0.32, cast: false }, 10));
  return gr;
}

function kettle(M) {
  const k = new THREE.Group();
  const cu = K.mat('#b87333', { metal: 0.85, rough: 0.3 });
  k.add(K.cyl(0.07, 0.085, 0.13, cu, {}, 14));
  k.add(K.cyl(0.03, 0.06, 0.03, cu, { y: 0.13 }, 12));
  k.add(rod(0.006, 0.012, 0.22, cu, { x: 0.12, y: 0.12, rz: -1.1 }, 6));
  k.add(K.mesh(new THREE.TorusGeometry(0.05, 0.008, 5, 10, Math.PI), M.dark, { y: 0.16, x: -0.02, ry: Math.PI / 2 }));
  return k;
}

function cdPlayer(M, A) {
  const p = new THREE.Group();
  const silver = K.mat('#b8b4ac', { metal: 0.7, rough: 0.35 });
  p.add(K.rbox(0.36, 0.11, 0.28, 0.01, silver, {}));
  const face = A.region(180, 56, (g, w, h) => {
    g.fillStyle = '#c9c5bd'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#20302a'; g.fillRect(10, 10, 80, 22);
    g.fillStyle = '#8af0b0'; g.font = `700 14px ${K.JP_FONT}`; g.textBaseline = 'middle'; g.fillText('CD  03  4:12', 14, 21);
    g.fillStyle = '#333'; g.fillRect(100, 14, 70, 6);
    for (let i = 0; i < 4; i++) { g.fillStyle = '#777'; g.beginPath(); g.arc(112 + i * 16, 40, 5, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#555'; g.font = `700 10px ${K.JP_FONT}`; g.fillText('COMPACT DISC', 12, 44);
  });
  const fp = A.plane(0.34, 0.1, face); fp.position.set(0, 0.055, 0.141); p.add(fp);
  // two little speakers + a stack of CD cases
  for (const x of [-0.3, 0.3]) {
    p.add(K.box(0.16, 0.26, 0.18, M.dark, { x }));
    p.add(rod(0.045, 0.045, 0.01, M.black, { x, y: 0.16, z: 0.09, rx: Math.PI / 2 }, 12));
    p.add(rod(0.025, 0.025, 0.01, M.black, { x, y: 0.06, z: 0.09, rx: Math.PI / 2 }, 10));
  }
  const cases = ['#1f3a5f', '#7a2a2a', '#e0b84a', '#2a2a2a'];
  cases.forEach((c, i) => p.add(K.box(0.14, 0.012, 0.125, K.mat(c, { rough: 0.3 }), { x: 0.05 + i * 0.002, y: 0.11 + i * 0.012, z: -0.02, ry: i * 0.08 })));
  return p;
}

function menuBoard(A, M) {
  const b = new THREE.Group();
  const w = 1.1; const h = 0.8;
  b.add(K.box(w + 0.08, h + 0.08, 0.04, M.dark, { y: -h / 2 - 0.04 }));
  const r = A.region(w * 500, h * 500, (g, W, Hh) => {
    g.fillStyle = '#2e3a33'; g.fillRect(0, 0, W, Hh);
    const rr = K.rng(9);
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(255,255,255,${rr() * 0.05})`; g.fillRect(rr() * W, rr() * Hh, 3 + rr() * 30, 1 + rr() * 2); }
    g.textBaseline = 'middle';
    const px = (k) => Math.round(Hh * k);
    g.fillStyle = '#f6e9b0'; g.font = `800 ${px(0.1)}px ${K.JP_FONT}`; g.textAlign = 'center';
    g.fillText('メニュー  MENU', W / 2, Hh * 0.085);
    g.strokeStyle = 'rgba(246,233,176,0.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(40, Hh * 0.16); g.lineTo(W - 40, Hh * 0.16); g.stroke();
    const items = [
      ['ブレンドコーヒー（ブラジル）', '480円', '#ffffff'],
      ['紅茶（インド）', '450円', '#ffffff'],
      ['本日の ケーキ', '520円', '#ffd9d0'],
      ['自家製 プリン', '400円', '#e3ecff'],
      ['厚切り トースト', '380円', '#e3ecff'],
      ['昔ながらの ナポリタン', '850円', '#e3ecff'],
      ['季節の 果物 パフェ', '780円', '#e3ecff'],
    ];
    items.forEach(([name, price, col], i) => {
      const y = Hh * (0.245 + i * 0.093);
      g.fillStyle = col; g.font = `700 ${px(i < 3 ? 0.072 : 0.06)}px ${K.JP_FONT}`;
      g.textAlign = 'left'; g.fillText(name, 30, y);
      const nw = g.measureText(name).width;
      g.textAlign = 'right'; g.fillText(price, W - 28, y);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      for (let dx = 30 + nw + 14; dx < W - 120; dx += 12) g.fillRect(dx, y + 8, 4, 3);
    });
    g.fillStyle = '#f6e9b0'; g.font = `700 ${px(0.052)}px ${K.JP_FONT}`; g.textAlign = 'center';
    g.fillText('モーニング 7:00〜11:00 ・ セットは ＋100円', W / 2, Hh * 0.94);
  });
  const face = A.plane(w, h, r); face.position.set(0, 0, 0.022); b.add(face);
  return b;
}

function concertPoster(A, M) {
  const p = new THREE.Group();
  const w = 0.36; const h = 0.52;
  const r = A.region(w * 800, h * 800, (g, W, Hh) => {
    const f = (k, wt = 800) => `${wt} ${Math.round(W * k)}px ${K.JP_FONT}`;
    const gr = g.createLinearGradient(0, 0, 0, Hh);
    gr.addColorStop(0, '#1d2a4a'); gr.addColorStop(1, '#3b1f3a');
    g.fillStyle = gr; g.fillRect(0, 0, W, Hh);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#e8b04a'; g.font = f(0.27); g.fillText('JAZZ', W / 2, Hh * 0.11);
    g.fillStyle = '#f6efe0'; g.font = f(0.1); g.fillText('ジャズ コンサート', W / 2, Hh * 0.22);
    // saxophone
    g.strokeStyle = '#e8b04a'; g.lineWidth = W * 0.04; g.lineCap = 'round';
    g.beginPath(); g.moveTo(W * 0.64, Hh * 0.29); g.lineTo(W * 0.52, Hh * 0.45); g.quadraticCurveTo(W * 0.43, Hh * 0.53, W * 0.33, Hh * 0.48); g.stroke();
    g.fillStyle = '#e8b04a'; g.beginPath(); g.ellipse(W * 0.31, Hh * 0.47, W * 0.07, W * 0.045, 0.4, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 4; i++) { g.fillStyle = '#f6efe0'; g.beginPath(); g.arc(W * (0.61 - i * 0.03), Hh * (0.32 + i * 0.03), W * 0.012, 0, Math.PI * 2); g.fill(); }
    for (let i = 0; i < 3; i++) { g.fillStyle = '#e8b04a'; g.font = f(0.07); g.fillText('♪', W * (0.75 + i * 0.07), Hh * (0.36 - i * 0.04)); }
    g.fillStyle = '#ffffff'; g.font = f(0.115); g.fillText('土曜日の 晩', W / 2, Hh * 0.6);
    g.fillStyle = '#e8b04a'; g.font = f(0.13); g.fillText('7:00 〜 9:00', W / 2, Hh * 0.7);
    g.fillStyle = '#f6efe0'; g.font = f(0.07, 700); g.fillText('よる 7時から 9時まで', W / 2, Hh * 0.78);
    g.fillStyle = '#d0c8e0'; g.font = f(0.085, 700); g.fillText('喫茶さかもと', W / 2, Hh * 0.87);
    g.font = f(0.055, 500); g.fillText('入場無料（ワンドリンク）', W / 2, Hh * 0.94);
  });
  p.add(K.box(w + 0.03, h + 0.03, 0.01, K.mat('#efe6d6'), { y: -(h + 0.03) / 2 }));
  const face = A.plane(w, h, r); face.position.z = 0.011; p.add(face);
  p.add(K.mesh(new THREE.SphereGeometry(0.012, 6, 4), K.mat('#c0392b'), { y: h / 2 - 0.02, z: 0.014 }));
  return p;
}

function newspaperRack(M, A) {
  const r = new THREE.Group();
  r.add(K.box(0.05, 1.05, 0.05, M.dark, { x: -0.28 }));
  r.add(K.box(0.05, 1.05, 0.05, M.dark, { x: 0.28 }));
  r.add(K.box(0.62, 0.04, 0.3, M.dark, {}));
  const names = ['日本新聞', 'スポーツ', 'けいざい'];
  names.forEach((n, i) => {
    const y = 0.98 - i * 0.28;
    r.add(rod(0.012, 0.012, 0.58, M.wood, { y, z: 0.03, rz: Math.PI / 2 }, 6));
    const reg = A.region(150, 100, (g, w, h) => {
      g.fillStyle = '#efece4'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#222'; g.font = `800 22px ${K.JP_FONT}`; g.textAlign = 'left'; g.textBaseline = 'top';
      g.fillText(n, 8, 6);
      g.fillStyle = '#b03030'; g.fillRect(8, 34, 50, 4);
      for (let k = 0; k < 7; k++) { g.fillStyle = 'rgba(40,40,40,0.55)'; g.fillRect(8 + (k % 2) * 70, 44 + Math.floor(k / 2) * 12, 62, 6); }
    });
    r.add(A.box(0.46, 0.3, 0.012, reg, A.solid('#e6e2d8'), { y: y - 0.3, z: 0.035 + i * 0.012 }));
  });
  return r;
}

function bookshelf(A, M) {
  const b = new THREE.Group();
  b.add(K.box(1.6, 1.7, 0.32, M.dark, { z: -0.02 }));
  const cols = ['#7a2a2a', '#2a4a6a', '#3f6b4e', '#8a6a2a', '#e0d6c0', '#5a3a5a', '#b5452c', '#2f2f3a'];
  const spines = cols.map((c) => A.region(24, 96, (g, w, h) => {
    g.fillStyle = c; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,230,170,0.7)'; g.fillRect(3, 10, w - 6, 3); g.fillRect(3, h - 16, w - 6, 3);
  }));
  const r = K.rng(4);
  for (let s = 0; s < 4; s++) {
    const y = 0.06 + s * 0.41;
    b.add(K.box(1.54, 0.025, 0.3, M.wood, { y, z: 0.0 }));
    let x = -0.74;
    while (x < 0.7) {
      const bw = 0.025 + r() * 0.025; const bh = 0.22 + r() * 0.1;
      const k = Math.floor(r() * cols.length);
      b.add(A.box(bw, bh, 0.2, spines[k], A.solid(cols[k]), { x: x + bw / 2, y: y + 0.025, z: 0.02 }));
      x += bw + 0.004;
      if (r() < 0.06) x += 0.12;
    }
  }
  return b;
}

function coatRack(M) {
  const c = new THREE.Group();
  c.add(K.cyl(0.025, 0.03, 1.75, M.dark, {}, 8));
  c.add(K.cyl(0.22, 0.24, 0.03, M.dark, {}, 12));
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; c.add(rod(0.012, 0.012, 0.18, M.brass, { x: Math.cos(a) * 0.08, y: 1.62, z: Math.sin(a) * 0.08, rz: Math.cos(a) * 0.8, rx: -Math.sin(a) * 0.8 }, 6)); }
  const coat = K.mat('#6b5a48', { rough: 0.9 });
  c.add(K.rbox(0.36, 0.7, 0.14, 0.05, coat, { x: 0.08, y: 0.95, z: 0.05, rz: 0.08 }));
  c.add(K.mesh(new THREE.TorusGeometry(0.12, 0.03, 6, 12), K.mat('#a8453a', { rough: 0.9 }), { y: 1.55, x: -0.05, rx: 1.3 }));
  return c;
}

function speaker(M) {
  const s = new THREE.Group();
  s.add(K.box(0.3, 0.42, 0.26, M.dark, {}));
  s.add(rod(0.09, 0.09, 0.01, M.black, { y: 0.15, z: 0.13, rx: Math.PI / 2 }, 14));
  s.add(rod(0.04, 0.04, 0.01, M.black, { y: 0.33, z: 0.13, rx: Math.PI / 2 }, 10));
  return s;
}

function recordSleeve(A, i, M) {
  const s = new THREE.Group();
  const pal = [['#e8b04a', '#1d2a4a'], ['#c0392b', '#f4ead8'], ['#2f6b8a', '#f6e9b0']][i % 3];
  const r = A.region(150, 150, (g, w, h) => {
    g.fillStyle = pal[1]; g.fillRect(0, 0, w, h);
    g.fillStyle = pal[0];
    if (i === 0) { g.beginPath(); g.arc(w * 0.6, h * 0.45, 40, 0, Math.PI * 2); g.fill(); }
    else if (i === 1) { for (let k = 0; k < 5; k++) g.fillRect(14 + k * 26, 20 + k * 12, 18, 90); }
    else { g.fillRect(0, h * 0.55, w, 18); g.fillRect(0, h * 0.7, w, 8); }
    g.fillStyle = pal[0]; g.font = `800 20px ${K.JP_FONT}`; g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillText(['BLUE NOTE', 'SAX TRIO', 'SWING'][i % 3], 10, h - 18);
  });
  s.add(K.box(0.33, 0.33, 0.01, M.dark, { y: -0.165 }));
  const f = A.plane(0.31, 0.31, r); f.position.z = 0.011; s.add(f);
  return s;
}

function framedPicture(A, kind, w, h, M) {
  const p = new THREE.Group();
  p.add(K.box(w + 0.06, h + 0.06, 0.03, K.mat('#8a6a3a', { metal: 0.3, rough: 0.5 }), { y: -(h + 0.06) / 2 }));
  const r = A.region(w * 300, h * 300, (g, W, Hh) => {
    if (kind === 'sea') {
      const gr = g.createLinearGradient(0, 0, 0, Hh); gr.addColorStop(0, '#9cc7e0'); gr.addColorStop(0.55, '#e8eef0'); gr.addColorStop(0.56, '#3f7aa0'); gr.addColorStop(1, '#2a5a7a');
      g.fillStyle = gr; g.fillRect(0, 0, W, Hh);
      g.fillStyle = '#f4f0e6'; g.beginPath(); g.moveTo(W * 0.3, Hh * 0.55); g.lineTo(W * 0.36, Hh * 0.25); g.lineTo(W * 0.42, Hh * 0.55); g.fill();
    } else {
      const gr = g.createLinearGradient(0, 0, 0, Hh); gr.addColorStop(0, '#f0d9b0'); gr.addColorStop(1, '#e8c890');
      g.fillStyle = gr; g.fillRect(0, 0, W, Hh);
      g.fillStyle = '#6a7a8a'; g.beginPath(); g.moveTo(0, Hh * 0.8); g.lineTo(W * 0.45, Hh * 0.25); g.lineTo(W * 0.62, Hh * 0.45); g.lineTo(W, Hh * 0.75); g.lineTo(W, Hh); g.lineTo(0, Hh); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(W * 0.37, Hh * 0.37); g.lineTo(W * 0.45, Hh * 0.25); g.lineTo(W * 0.53, Hh * 0.36); g.fill();
    }
  });
  const f = A.plane(w, h, r); f.position.set(0, 0, 0.016); p.add(f);
  return p;
}

function pendant(M, cord) {
  const p = new THREE.Group();
  p.add(K.cyl(0.004, 0.004, cord, M.black, {}, 4));
  p.add(K.cyl(0.035, 0.14, 0.13, M.brass, { y: -0.13 }, 16));
  p.add(K.mesh(new THREE.SphereGeometry(0.045, 10, 6), M.bulb, { y: -0.135, cast: false, receive: false }));
  return p;
}

function smallPlant(scale, seed) {
  const p = new THREE.Group();
  p.add(K.cyl(0.05 * scale, 0.04 * scale, 0.08 * scale, K.mat('#b9805a', { rough: 0.8 }), {}, 10));
  const r = K.rng(seed);
  const leaf = new THREE.IcosahedronGeometry(0.035 * scale, 0);
  for (let i = 0; i < 9; i++) p.add(K.mesh(leaf, K.mat(i % 2 ? '#5f8f55' : '#4f7a4a', { rough: 0.8 }), { x: (r() - 0.5) * 0.08, y: (0.1 + r() * 0.08) * scale, z: (r() - 0.5) * 0.08 }));
  return p;
}

function hangingPlant() {
  const p = new THREE.Group();
  const cord = K.mat('#d9c9a8', { rough: 1 });
  for (let i = 0; i < 3; i++) p.add(K.cyl(0.003, 0.003, 0.6, cord, { x: Math.cos(i * 2.1) * 0.06, y: 0.25, z: Math.sin(i * 2.1) * 0.06 }, 3));
  p.add(K.mesh(new THREE.SphereGeometry(0.11, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), K.mat('#e8dccb', { rough: 0.8 }), { y: 0.25 }));
  const r = K.rng(8);
  const leaf = new THREE.IcosahedronGeometry(0.05, 0);
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2; const d = 0.06 + r() * 0.08; const drop = r() * 0.5;
    p.add(K.mesh(leaf, K.mat(i % 3 ? '#5f8f55' : '#7aa86a', { rough: 0.8 }), { x: Math.cos(a) * (d + drop * 0.15), y: 0.24 - drop, z: Math.sin(a) * (d + drop * 0.15) }));
  }
  return p;
}
