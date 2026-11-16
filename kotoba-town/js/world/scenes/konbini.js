// konbini — ことばマート, a Japanese convenience store at night, seen from inside at the register.
// Front: the counter with 野口 (clerk), oden, the register, hot snacks and a bread rack; behind him the
// cigarette wall and the staff door. Right: onigiri/bento chiller, aisles (snacks, cup noodles, spices),
// the drinks fridge on the far wall with the toilet to its right. Left: the glass storefront with the
// automatic door, umbrellas for sale by the entrance, the magazine rack (batteries on its bottom shelf)
// and — outside, under the eave — a white cat on a cardboard box. Behind: copy machine + ATM, ice freezer.
// Learner stands at the origin looking toward -z.
import * as THREE from 'three';
import * as K from '../kit.js';

export const meta = { indoor: true, ambience: 'konbini' };

export default function build({ setup }) {
  const time = setup.time || 'night';
  const season = setup.season || 'autumn';
  const weather = setup.weather || 'clear';
  const rain = weather === 'rain';
  const dark = time === 'night' || time === 'evening';
  const cold = season === 'autumn' || season === 'winter';
  const g = new THREE.Group();
  const props = {};
  const A = makeAtlas(1024);
  const T = makeAtlas(1024);
  A.textAtlas = T;
  const add = (o, x = 0, y = 0, z = 0, ry = 0, parent = g) => { o.position.set(x, y, z); o.rotation.y = ry; parent.add(o); return o; };

  const M = {
    floor: K.mat('#ffffff', { map: K.tileTex('#efeee9', '#e4e3dd', 8, [9, 7], '#cfcdc5'), rough: 0.22 }),
    ceil: K.mat('#ffffff', { map: K.tileTex('#f6f6f3', '#f1f1ee', 4, [9, 7], '#d9d9d4'), rough: 1 }),
    wall: K.mat('#f3f2ee', { rough: 0.9 }),
    white: K.mat('#f7f7f4', { rough: 0.4 }),
    grey: K.mat('#9aa0a6', { metal: 0.5, rough: 0.35 }),
    alu: K.mat('#c3c7cb', { metal: 0.7, rough: 0.3 }),
    darkFrame: K.mat('#3a3d42', { metal: 0.4, rough: 0.4 }),
    green: K.mat('#2f8a62', { rough: 0.45 }),
    yellow: K.mat('#f2c230', { rough: 0.45 }),
    orange: K.mat('#ef8a2e', { rough: 0.45 }),
    shelf: K.mat('#e8e8e4', { rough: 0.5 }),
    glass: K.glassMat(),
    tube: new THREE.MeshBasicMaterial({ color: '#f6fbff', toneMapped: false }),
    led: new THREE.MeshBasicMaterial({ color: '#eaf6ff', toneMapped: false }),
  };

  // ------------------------------------------------------------------ shell
  const X0 = -4.0; const X1 = 5.0; const ZN = -2.7; const ZS = 4.2; const H = 2.6;
  const W = X1 - X0; const D = ZS - ZN; const cx = (X0 + X1) / 2; const cz = (ZN + ZS) / 2;
  add(K.mesh(new THREE.PlaneGeometry(W, D, 6, 6), M.floor, { rx: -Math.PI / 2, cast: false }), cx, 0, cz);
  add(K.mesh(new THREE.PlaneGeometry(W, D, 6, 6), M.ceil, { rx: Math.PI / 2, cast: false }), cx, H, cz);
  const wallSeg = (ax, az, bx, bz, y0 = 0, y1 = H, m = M.wall) => {
    const len = Math.hypot(bx - ax, bz - az);
    const w = K.mesh(new THREE.PlaneGeometry(len, y1 - y0), m, { cast: false });
    w.position.set((ax + bx) / 2, (y0 + y1) / 2, (az + bz) / 2);
    w.rotation.y = Math.atan2(-(bz - az), bx - ax);
    g.add(w);
    return w;
  };
  wallSeg(X0, ZN, X1, ZN); wallSeg(X1, ZN, X1, ZS); wallSeg(X1, ZS, X0, ZS);
  wallSeg(X0, ZS, X0, ZN, 2.36, H); // band above the glass
  // green / yellow brand stripe around the walls at 2.25 m
  for (const [ax, az, bx, bz] of [[X0, ZN, X1, ZN], [X1, ZN, X1, ZS], [X1, ZS, X0, ZS]]) {
    const s1 = wallSeg(ax, az, bx, bz, 2.3, 2.38, M.green); const s2 = wallSeg(ax, az, bx, bz, 2.26, 2.3, M.yellow);
    const n = new THREE.Vector3(-(bz - az), 0, bx - ax).normalize().multiplyScalar(0.004);
    s1.position.add(n); s2.position.add(n);
  }
  // skirting
  g.add(K.box(W, 0.1, 0.02, M.grey, { x: cx, z: ZN + 0.01, cast: false }));
  g.add(K.box(0.02, 0.1, D, M.grey, { x: X1 - 0.01, z: cz, cast: false }));
  g.add(K.box(W, 0.1, 0.02, M.grey, { x: cx, z: ZS - 0.01, cast: false }));

  // ceiling fluorescent tubes + lights
  for (let x = -3.2; x <= 4.4; x += 1.25) for (let z = -2.0; z <= 3.8; z += 1.45) {
    g.add(K.box(0.16, 0.04, 1.15, M.white, { x, y: H - 0.05, z, cast: false }));
    g.add(K.box(0.1, 0.02, 1.08, M.tube, { x, y: H - 0.07, z, cast: false, receive: false }));
  }
  const inI = dark ? 1 : 0.7;
  const hemi = new THREE.HemisphereLight('#ffffff', '#d8d8d2', dark ? 1.25 : 0.7);
  g.add(hemi);
  for (const [x, z, i] of [[-1.6, -0.6, 7], [2.4, -0.6, 7], [0.4, 2.6, 6], [3.6, 2.4, 5]]) {
    const l = new THREE.PointLight('#f4f8ff', i * inI, 7.5, 1.2);
    l.position.set(x, 2.35, z);
    g.add(l);
  }

  // ------------------------------------------------------------------ storefront (west, glass) + outside
  const glassMat = K.mat('#d8ecf4', { rough: 0.05, metal: 0.1, opacity: dark ? 0.12 : 0.18 });
  const mullZ = [ZN, -1.75, -0.9, 0.7, 1.6, 2.55, 3.4, ZS];
  for (let i = 0; i < mullZ.length - 1; i++) {
    const a = mullZ[i]; const b = mullZ[i + 1];
    if (a === -0.9) continue; // the automatic door
    g.add(K.mesh(new THREE.PlaneGeometry(b - a, 2.3), glassMat, { x: X0, y: 1.2, z: (a + b) / 2, ry: Math.PI / 2, cast: false, receive: false }));
    if (rain) { const rg = rainGlass(b - a, 2.3, 0); rg.position.set(X0 + 0.015, 1.2, (a + b) / 2); rg.rotation.y = Math.PI / 2; g.add(rg); }
  }
  for (const z of mullZ) g.add(K.box(0.08, 2.36, 0.07, M.alu, { x: X0, z }));
  g.add(K.box(0.1, 0.06, D, M.alu, { x: X0, y: 2.33, z: cz }));
  g.add(K.box(0.1, 0.06, D, M.alu, { x: X0, y: 0.0, z: cz }));
  // automatic door (entrance)
  const ent = new THREE.Group();
  for (const s of [-1, 1]) {
    const leaf = new THREE.Group();
    leaf.add(K.mesh(new THREE.PlaneGeometry(0.76, 2.1), glassMat, { y: 1.08, cast: false, receive: false }));
    if (rain) { const rg = rainGlass(0.76, 2.1, 0.012); rg.position.y = 1.08; leaf.add(rg); }
    leaf.add(K.box(0.8, 0.05, 0.05, M.alu, { y: 0.0 }));
    leaf.add(K.box(0.8, 0.05, 0.05, M.alu, { y: 2.1 }));
    leaf.add(K.box(0.04, 2.15, 0.05, M.alu, { x: -0.39 }));
    leaf.add(K.box(0.04, 2.15, 0.05, M.alu, { x: 0.39 }));
    const st = A.text([{ t: '自動ドア', scale: 0.9 }], 0.3, 0.07, { bg: '#ffffff', fg: '#2f8a62', radius: 0.3 });
    st.position.set(0, 1.25, 0.03); leaf.add(st);
    leaf.position.x = s * 0.4;
    ent.add(leaf);
  }
  ent.add(K.box(1.7, 0.2, 0.22, M.alu, { y: 2.16 }));
  const welcome = A.text([{ t: 'いらっしゃいませ', scale: 0.8 }], 0.9, 0.12, { bg: '#2f8a62', fg: '#ffffff', radius: 0.2 });
  welcome.position.set(0, 2.26, 0.12); ent.add(welcome);
  const entrance = K.prop('entrance', ent, { labelJa: 'いりぐち', labelEn: 'entrance' });
  add(entrance, X0 + 0.02, 0, -0.1, Math.PI / 2);
  // entrance mat inside
  const matReg = T.region(300, 140, (c, w, h) => {
    c.fillStyle = '#3b4148'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#2f8a62'; c.fillRect(0, 0, w, 14); c.fillRect(0, h - 14, w, 14);
    c.fillStyle = '#f2c230'; c.font = `800 44px ${K.JP_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('ことばマート', w / 2, h / 2);
  });
  add(T.plane(1.6, 0.75, matReg, { rx: -Math.PI / 2, receive: true }), X0 + 0.5, 0.006, -0.1, 0).rotation.set(-Math.PI / 2, 0, Math.PI / 2);

  const outside = buildOutside({ time, weather, season, A, M, X0 });
  g.add(outside.group);
  props.cat = outside.cat; props.box = outside.box;

  // umbrellas for sale by the entrance
  const umb = K.prop('umbrella_stand', umbrellaRack(A, M), { labelJa: 'かさ', labelEn: 'umbrellas for sale' });
  add(umb, X0 + 0.42, 0, 1.12, Math.PI / 2);
  // magazine rack along the glass (batteries on the bottom shelf)
  const mags = magazineRack(A, M);
  const magazines = K.prop('magazines', mags.group, { labelJa: 'ざっしの たな', labelEn: 'magazine rack' });
  add(magazines, X0 + 0.27, 0, 2.85, Math.PI / 2);
  // basket stack by the door
  for (let i = 0; i < 5; i++) add(basket(A, M, false), -2.95, i * 0.07, 0.95, 0.1);
  // self-service coffee by the window corner
  add(coffeeCorner(A, M), -2.6, 0, ZN + 0.3);

  // ------------------------------------------------------------------ the counter
  const CX0 = -2.0; const CX1 = 1.32; const CZF = -0.55; const CZB = -1.15; const CH = 0.95;
  const cw = CX1 - CX0; const ccx = (CX0 + CX1) / 2;
  g.add(K.box(cw, CH - 0.04, CZF - CZB - 0.04, M.white, { x: ccx, z: (CZF + CZB) / 2 - 0.02 }));
  g.add(K.box(cw + 0.01, 0.12, 0.012, M.green, { x: ccx, y: 0.62, z: CZF - 0.035 }));
  g.add(K.box(cw + 0.01, 0.04, 0.012, M.yellow, { x: ccx, y: 0.58, z: CZF - 0.035 }));
  g.add(K.box(cw + 0.01, 0.09, 0.012, M.grey, { x: ccx, y: 0, z: CZF - 0.035 }));
  g.add(K.box(cw + 0.06, 0.04, CZF - CZB + 0.08, K.mat('#e9e2d4', { rough: 0.35 }), { x: ccx, y: CH - 0.04, z: (CZF + CZB) / 2 + 0.02 }));
  // counter-front POP
  const pop1 = A.text(cold ? [{ t: 'おでん', color: '#b5452c' }, { t: '1こ 80円〜', scale: 0.7 }] : [{ t: 'アイスコーヒー', color: '#2f6b8a' }, { t: 'S 120円', scale: 0.7 }], 0.5, 0.3, { bg: '#fffbe8', fg: '#333', border: '#ef8a2e', radius: 0.08 });
  add(pop1, -1.35, 0.32, CZF - 0.045, 0);
  const pop2 = A.text([{ t: 'からあげ', color: '#b5452c' }, { t: '5こ 260円', scale: 0.7 }], 0.5, 0.3, { bg: '#fffbe8', fg: '#333', border: '#2f8a62', radius: 0.08 });
  add(pop2, 0.6, 0.32, CZF - 0.045, 0);
  // floor sticker where the learner stands
  add(A.text([{ t: 'こちらで おまちください', scale: 0.8 }], 0.62, 0.16, { bg: '#f2c230', fg: '#333', radius: 0.3 }), 0, 0.004, -0.18).rotation.set(-Math.PI / 2, 0, 0);

  // things on the counter
  const reg = K.prop('register', posRegister(A, M), { labelJa: 'レジ', labelEn: 'register' });
  add(reg, -0.82, CH, -0.98, 0);
  if (cold) add(odenPot(A, M), -1.58, CH, -0.86);
  else add(donutCase(A, M), -1.58, CH, -0.88);
  add(hotSnackCase(A, M), 0.8, CH, -0.9);
  const bread = K.prop('bread', breadRack(A, M), { labelJa: 'パン', labelEn: 'bread' });
  add(bread, 1.12, CH, -0.86, -0.25);
  // the learner's shopping: basket with a drink and snacks, a bento and two onigiri taken out
  const bsk = K.prop('basket', basket(A, M, true), { labelJa: 'かご', labelEn: 'shopping basket' });
  add(bsk, 0.3, CH, -0.84, 0.12);
  const ben = K.prop('bento', bento(A, 2), { labelJa: 'おべんとう', labelEn: 'bento' });
  add(ben, -0.1, CH, -0.74, -0.08);
  const oni = new THREE.Group();
  add(onigiri(A, 0), -0.08, 0, 0.02, 0.15, oni);
  add(onigiri(A, 1), 0.08, 0, -0.02, -0.2, oni);
  const onig = K.prop('onigiri', oni, { labelJa: 'おにぎり', labelEn: 'rice balls' });
  add(onig, -0.42, CH, -0.74, 0);

  // ------------------------------------------------------------------ behind the counter
  const bc = new THREE.Group();
  bc.add(K.box(3.0, 0.9, 0.5, M.white, { z: 0.25 }));
  bc.add(K.box(3.04, 0.035, 0.54, K.mat('#cfd3d6', { rough: 0.35 }), { y: 0.9, z: 0.27 }));
  for (const x of [-1.2, -0.65]) { const mw = microwave(M, A); mw.position.set(x, 0.935, 0.24); bc.add(mw); }
  for (let i = 0; i < 4; i++) bc.add(K.cyl(0.045, 0.04, 0.22, K.mat('#f7f7f4', { rough: 0.6 }), { x: 0.05 + i * 0.11, y: 0.935, z: 0.3 }, 10));
  bc.add(K.box(0.32, 0.18, 0.24, K.mat('#e6e6e2', { rough: 0.5 }), { x: 0.8, y: 0.935, z: 0.25 }));
  add(bc, -0.7, 0, ZN);
  add(tobaccoWall(A, M), -0.7, 1.1, ZN + 0.02);
  // staff door + small monitor
  const sd = new THREE.Group();
  sd.add(K.box(0.72, 2.05, 0.04, K.mat('#c9ccd0', { metal: 0.3, rough: 0.45 }), {}));
  const sdp = A.text([{ t: 'STAFF ONLY', scale: 0.7 }, { t: 'じゅうぎょういん せんよう', scale: 0.55 }], 0.36, 0.12, { bg: '#ffffff', fg: '#555', radius: 0.08 });
  sdp.position.set(0, 1.55, 0.025); sd.add(sdp);
  sd.add(K.box(0.04, 0.16, 0.04, M.alu, { x: 0.28, y: 0.95, z: 0.03 }));
  add(sd, 1.32, 0, ZN + 0.02);

  // ------------------------------------------------------------------ onigiri / bento chiller (front right)
  add(chiller(A, M), 3.25, 0, ZN);
  // POP hanging from the ceiling
  const hang = (lines, x, z, ry, col) => {
    const s = A.text(lines, 0.6, 0.3, { bg: '#ffffff', fg: '#333', border: col, radius: 0.06 });
    const grp = new THREE.Group();
    grp.add(s);
    grp.add(K.box(0.006, H - 2.15, 0.006, M.grey, { y: 0.15 }));
    add(grp, x, 2.0, z, ry);
  };
  hang(cold ? [{ t: 'にくまん', color: '#b5452c' }, { t: 'あります', scale: 0.7 }] : [{ t: 'ひやし めん', color: '#2f6b8a' }, { t: 'はじめました', scale: 0.7 }], 2.6, -1.25, 0, '#ef8a2e');
  hang([{ t: 'おにぎり', color: '#2f8a62' }, { t: '2こで 30円びき', scale: 0.7 }], 3.9, -1.25, 0, '#2f8a62');

  // ------------------------------------------------------------------ aisles
  const G1 = gondola(A, M, 2.9, 1.35, { front: 'snacks', back: 'noodles', seed: 3 });
  add(G1, 2.45, 0, 1.2);
  const G2 = gondola(A, M, 3.0, 1.35, { front: 'daily', back: 'sweets', seed: 7, spiceFrom: 0.5 });
  add(G2, 2.4, 0, 2.85);
  const spices = K.prop('spices', G2.userData.spices, { labelJa: 'スパイス', labelEn: 'spices & seasonings' });
  props.spices = spices;
  // end cap facing the register: new products
  add(endCap(A, M), 0.88, 0, 1.2, -Math.PI / 2);

  // ------------------------------------------------------------------ drinks fridge (east wall) + toilet
  const fr = K.prop('drinks_fridge', drinksFridge(A, M, 5), { labelJa: 'のみものの たな', labelEn: 'drinks fridge' });
  add(fr, X1, 0, 0.4, -Math.PI / 2);
  const wc = new THREE.Group();
  wc.add(K.box(0.8, 2.05, 0.04, K.mat('#d9dde0', { rough: 0.4 }), {}));
  wc.add(K.box(0.04, 0.16, 0.04, M.alu, { x: -0.3, y: 0.95, z: 0.03 }));
  const pict = T.region(120, 120, (c, w, h) => {
    c.fillStyle = '#2f6db3'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(w * 0.3, h * 0.22, 10, 0, Math.PI * 2); c.fill(); c.fillRect(w * 0.22, h * 0.36, 18, 50);
    c.fillStyle = '#e85d5d'; c.beginPath(); c.arc(w * 0.7, h * 0.22, 10, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.moveTo(w * 0.7, h * 0.34); c.lineTo(w * 0.85, h * 0.78); c.lineTo(w * 0.55, h * 0.78); c.fill();
  });
  const pp = T.plane(0.2, 0.2, pict); pp.position.set(0, 1.5, 0.025); wc.add(pp);
  add(wc, X1 - 0.02, 0, 3.05, -Math.PI / 2);
  const ts = K.prop('toilet_sign', A.text([{ t: 'トイレ', scale: 1 }, { t: 'TOILET', scale: 0.55 }], 0.6, 0.26, { bg: '#2f6db3', fg: '#ffffff', radius: 0.12, glow: true }), { labelJa: 'トイレ', labelEn: 'toilet' });
  add(ts, X1 - 0.03, 2.2, 3.05, -Math.PI / 2);
  const drinkSign = A.text([{ t: 'のみもの  DRINK' }], 1.8, 0.24, { bg: '#2f8a62', fg: '#ffffff', radius: 0.15, glow: true });
  add(drinkSign, X1 - 0.03, 2.4, 0.4, -Math.PI / 2);

  // ------------------------------------------------------------------ back wall: copy machine + ATM, ice freezer, shelves
  const copy = K.prop('copy_machine', copyMachine(A, M), { labelJa: 'コピーき', labelEn: 'copy machine' });
  add(copy, -2.55, 0, ZS - 0.4, Math.PI);
  const atm = K.prop('atm', atmMachine(A, M), { labelJa: 'ATM', labelEn: 'ATM' });
  add(atm, -1.6, 0, ZS - 0.35, Math.PI);
  add(iceFreezer(A, M), 0.5, 0, ZS - 0.5, Math.PI);
  // posters + clock on the back wall
  const poster = (lines, x, y, w, h, bg, fg, border) => add(A.text(lines, w, h, { bg, fg, border, radius: 0.04 }), x, y, ZS - 0.01, Math.PI);
  poster(cold ? [{ t: 'ねんがじょう', scale: 0.9, color: '#c0392b' }, { t: 'ごよやく', scale: 0.8 }, { t: 'うけつけちゅう', scale: 0.6 }] : [{ t: 'なつの', scale: 0.7 }, { t: 'アイス フェア', color: '#2f6db3' }], -0.75, 1.55, 0.42, 0.58, '#fffaf0', '#333', '#c0392b');
  poster([{ t: 'ポイント', scale: 0.8, color: '#2f8a62' }, { t: '2ばい', scale: 1.2, color: '#ef8a2e' }, { t: 'まいしゅう どようび', scale: 0.5 }], 0.15, 1.6, 0.45, 0.6, '#ffffff', '#333', '#2f8a62');
  poster([{ t: 'Free Wi-Fi', scale: 0.8, color: '#2f6db3' }], 0.95, 1.5, 0.36, 0.16, '#ffffff', '#333', '#2f6db3');
  const hh = { morning: [7, 40], noon: [12, 15], evening: [18, 30], night: [21, 45] }[time] || [21, 45];
  add(K.clock(0.17, hh[0], hh[1]), 1.45, 2.0, ZS - 0.03, Math.PI);
  const ws = wallShelf(A, M, 2.4, 11);
  add(ws, 3.1, 0, ZS - 0.22, Math.PI);
  // security mirror + camera dome
  g.add(K.mesh(new THREE.SphereGeometry(0.25, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), K.mat('#dfe6ea', { metal: 0.95, rough: 0.05 }), { x: X1 - 0.12, y: 2.3, z: ZS - 0.12, rx: -Math.PI / 2 - 0.6, ry: -Math.PI / 4 }));
  g.add(K.mesh(new THREE.SphereGeometry(0.07, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), K.mat('#2a2d33', { rough: 0.2 }), { x: 0.4, y: H - 0.01, z: -1.6 }));

  for (const o of [entrance, umb, magazines, reg, bread, bsk, ben, onig, fr, ts, copy, atm]) props[o.userData.propId] = o;
  props.batteries = K.prop('batteries', mags.batteries, { labelJa: 'でんち', labelEn: 'batteries' });
  atlasize(g, A);

  const clerkPos = { x: -0.05, z: -1.5 };
  const npc1Pos = { x: -1.38, z: 0.28 };
  return K.finalize({
    group: g,
    spawn: K.spot(0, 0, 0),
    slots: {
      clerk: K.spot(clerkPos.x, clerkPos.z, K.faceYaw(clerkPos, { x: 0, z: 0 })),
      npc1: K.spot(npc1Pos.x, npc1Pos.z, K.faceYaw(npc1Pos, { x: 0, z: 0 })),
      phone: null,
    },
    props,
    center: new THREE.Vector3(0, 0, 0.6),
    radius: 7.5,
    update(dt, t) { outside.update(dt, t); },
  });
}

// =================================================================== the outside (west, through the glass)
function buildOutside({ time, weather, season, A, M, X0 }) {
  const grp = new THREE.Group();
  const rain = weather === 'rain';
  const dark = time === 'night' || time === 'evening';
  const wet = rain ? 0.08 : 0.85;
  const conc = K.mat('#ffffff', { map: K.tileTex('#8f8e8a', '#878682', 4, [3, 7], '#6f6e6a'), rough: wet, metal: rain ? 0.3 : 0 });
  const asphalt = K.mat('#ffffff', { map: K.noiseTex('#4a4c50', 0.12, [5, 6], 'asph'), rough: rain ? 0.06 : 0.9, metal: rain ? 0.4 : 0 });
  grp.add(K.mesh(new THREE.PlaneGeometry(3.4, 16, 3, 12), conc, { rx: -Math.PI / 2, x: X0 - 1.7, y: -0.02, z: 0.6, cast: false }));
  grp.add(K.mesh(new THREE.PlaneGeometry(14, 22, 10, 12), asphalt, { rx: -Math.PI / 2, x: X0 - 3.4 - 7, y: -0.05, z: 0.6, cast: false }));
  // parking lines + wheel stops
  const lineM = K.mat('#e9e7df', { rough: rain ? 0.2 : 0.8 });
  for (let i = 0; i < 6; i++) {
    const z = -4.4 + i * 2.6;
    grp.add(K.box(4.6, 0.004, 0.1, lineM, { x: X0 - 3.4 - 2.4, y: -0.05, z, cast: false }));
    grp.add(K.box(0.15, 0.1, 1.2, K.mat('#a6a39c'), { x: X0 - 3.75, y: -0.05, z: z + 1.3 }));
  }
  // eave over the storefront + downlights (the light pool where the cat sits)
  grp.add(K.box(1.5, 0.18, 14, K.mat('#e9ebe8', { rough: 0.6 }), { x: X0 - 0.75, y: 2.62, z: 0.75, cast: false }));
  for (const z of [-2.2, -0.1, 2.0, 3.9]) grp.add(K.cyl(0.08, 0.08, 0.02, new THREE.MeshBasicMaterial({ color: '#fffaf0', toneMapped: false }), { x: X0 - 0.75, y: 2.6, z }, 12));
  // the sign band on the façade (seen from the parking lot, and as a glow at the top of the glass)
  const band = A.textAtlas.region(900, 110, (c, w, h) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#2f8a62'; c.fillRect(0, 0, w, h * 0.32);
    c.fillStyle = '#f2c230'; c.fillRect(0, h * 0.32, w, h * 0.1);
    c.fillStyle = '#ef8a2e'; c.fillRect(0, h * 0.42, w, h * 0.06);
    c.fillStyle = '#2f8a62'; c.font = `800 ${h * 0.4}px ${K.JP_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('ことばマート  KOTOBA MART', w / 2, h * 0.74);
  });
  const bandM = A.textAtlas.plane(8, 0.9, band, { glow: dark });
  bandM.position.set(X0 - 1.51, 3.15, 0.6); bandM.rotation.y = -Math.PI / 2;
  grp.add(bandM);
  grp.add(K.box(0.3, 1.1, 14, K.mat('#d9dcda'), { x: X0 - 0.15, y: 2.6, z: 0.75, cast: false }));
  // trash & recycling bins under the eave (in front of the magazines)
  const binCols = [['#2f6db3', 'ペットボトル'], ['#2f8a62', 'かん・びん'], ['#c0504d', 'もえるごみ']];
  binCols.forEach(([col, label], i) => {
    const b = new THREE.Group();
    b.add(K.rbox(0.42, 0.95, 0.42, 0.04, K.mat(col, { rough: 0.5 }), {}));
    const t = A.text([{ t: label, scale: 0.8 }], 0.36, 0.11, { bg: '#ffffff', fg: '#333', radius: 0.2 });
    t.position.set(0.215, 0.75, 0); t.rotation.y = Math.PI / 2; b.add(t);
    b.add(K.cyl(0.07, 0.07, 0.01, K.mat('#222'), { y: 0.95, x: 0.06 }, 10));
    add2(grp, b, X0 - 0.4, 0, 2.2 + i * 0.5);
  });
  // umbrella stand outside the door (wet umbrellas when it rains)
  const us = new THREE.Group();
  us.add(K.box(0.6, 0.45, 0.25, K.mat('#8a9096', { metal: 0.6, rough: 0.35 }), {}));
  const ucols = rain ? ['#2f5f8a', '#e8eef2', '#c0504d', '#e8eef2', '#3f7a52'] : ['#e8eef2'];
  ucols.forEach((c, i) => {
    const u = new THREE.Group();
    u.add(K.cyl(0.006, 0.006, 0.85, K.mat('#555'), {}, 5));
    u.add(K.cyl(0.012, 0.05, 0.5, K.mat(c, { rough: rain ? 0.15 : 0.5 }), { y: 0.3 }, 8));
    u.position.set(-0.22 + i * 0.11, 0.02, 0); u.rotation.z = (i - 2) * 0.06;
    us.add(u);
  });
  add2(grp, us, X0 - 0.35, 0, 1.05, Math.PI / 2);

  // the cardboard box and the white cat sitting on it (outside the window, left of the door)
  const boxG = new THREE.Group();
  const kraft = '#c4975e';
  const side = A.region(160, 110, (c, w, h) => {
    c.fillStyle = kraft; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(90,60,30,0.25)'; for (let i = 0; i < 6; i++) c.fillRect(0, i * 19 + 4, w, 2);
    c.fillStyle = '#e07b2a'; c.beginPath(); c.arc(w * 0.3, h * 0.5, 22, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#3f7a3e'; c.fillRect(w * 0.3 - 3, h * 0.5 - 30, 6, 12);
    c.fillStyle = '#6a3a1a'; c.font = `800 30px ${K.JP_FONT}`; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText('みかん', w * 0.48, h * 0.5);
  });
  const top = A.region(110, 110, (c, w, h) => {
    c.fillStyle = kraft; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(70,45,20,0.4)'; c.fillRect(0, h / 2 - 1, w, 2);
    c.fillStyle = 'rgba(220,200,160,0.85)'; c.fillRect(0, h / 2 - 10, w, 20);
  });
  boxG.add(A.box(0.5, 0.33, 0.36, side, side, { top, back: side }));
  const kraftM = K.mat(kraft, { rough: 0.9 });
  boxG.add(K.box(0.5, 0.012, 0.16, kraftM, { y: 0.33, z: 0.25, rx: 0.5 }));
  const box = K.prop('box', boxG, { labelJa: 'はこ', labelEn: 'cardboard box' });
  add2(grp, box, X0 - 0.55, 0, -1.6, Math.PI / 2 + 0.15);
  const catModel = whiteCat(); catModel.scale.setScalar(1.15);
  const cat = K.prop('cat', catModel, { labelJa: 'ねこ', labelEn: 'cat (Shiro)' });
  add2(grp, cat, X0 - 0.55, 0.33, -1.6, Math.PI / 2 - 0.35);
  // light spilling out of the store onto the pavement and the cat
  const spill = new THREE.PointLight(dark ? '#fff2dc' : '#ffffff', dark ? 3.2 : 1, 4.5, 1.3);
  spill.position.set(X0 - 0.9, 1.9, -1.2);
  grp.add(spill);
  // bicycle by the bins, a parked car, a street lamp, a vending machine across
  const car = carModel(dark);
  add2(grp, car, X0 - 6.2, 0, -1.6, Math.PI / 2);
  const car2 = carModel(dark, '#b8bcc2');
  add2(grp, car2, X0 - 6.2, 0, 3.6, Math.PI / 2);
  const pole = K.mat('#4c5156', { metal: 0.6, rough: 0.4 });
  const lamp = new THREE.Group();
  lamp.add(K.cyl(0.06, 0.08, 5.2, pole, {}, 8));
  lamp.add(K.box(0.9, 0.06, 0.1, pole, { x: 0.45, y: 5.1 }));
  lamp.add(K.box(0.4, 0.1, 0.2, new THREE.MeshBasicMaterial({ color: dark ? '#fff1c8' : '#d8d8d0', toneMapped: false }), { x: 0.75, y: 5.0 }));
  add2(grp, lamp, X0 - 11.5, 0, -3.5, Math.PI);
  // reflections of the shop light on the wet ground
  if (rain) {
    const glowTex = streakTex();
    const glowM = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: dark ? 0.5 : 0.18, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    for (const [z, w] of [[-2.2, 0.9], [-0.1, 1.2], [1.9, 0.9], [3.6, 1.0]]) grp.add(K.mesh(new THREE.PlaneGeometry(w, 4.5), glowM, { rx: -Math.PI / 2, x: X0 - 3.6, y: -0.03, z, cast: false, receive: false }));
  }
  // painted night street beyond the parking lot
  const bd = K.mesh(new THREE.PlaneGeometry(40, 14, 8, 4), new THREE.MeshBasicMaterial({ map: nightStreetTex(time, weather), toneMapped: false, transparent: true, alphaTest: 0.4, fog: false }), { x: X0 - 19, y: 6.0, z: 0.6, ry: Math.PI / 2, cast: false, receive: false });
  grp.add(bd);
  grp.add(K.mesh(new THREE.PlaneGeometry(6, 40, 3, 12), asphalt, { rx: -Math.PI / 2, x: X0 - 20.4, y: -0.05, z: 0.6, cast: false }));
  const field = rain ? rainField(X0 - 14, X0 - 0.35, -7, 8, 6, 1100) : null;
  if (field) grp.add(field);
  const tail = cat.userData.tail;
  return {
    group: grp, cat, box,
    update(dt, t) { field?.userData.tick(dt); if (tail) tail.rotation.y = Math.sin(t * 1.3) * 0.35; },
  };
}

function add2(parent, o, x, y, z, ry = 0) { o.position.set(x, y, z); o.rotation.y = ry; parent.add(o); return o; }

function whiteCat() {
  const c = new THREE.Group();
  const fur = K.mat('#f4f1ec', { rough: 0.95 });
  const pink = K.mat('#f0a3a8', { rough: 0.7 });
  // sitting body (faces +z)
  const body = K.mesh(new THREE.SphereGeometry(0.11, 14, 10), fur, { y: 0.12 });
  body.scale.set(1, 1.15, 1.25); c.add(body);
  const chest = K.mesh(new THREE.SphereGeometry(0.075, 12, 8), fur, { y: 0.17, z: 0.07 });
  chest.scale.set(1, 1.3, 0.9); c.add(chest);
  for (const x of [-0.035, 0.035]) {
    c.add(K.cyl(0.02, 0.022, 0.15, fur, { x, y: 0.0, z: 0.1 }, 8));
    c.add(K.mesh(new THREE.SphereGeometry(0.024, 8, 6), fur, { x, y: 0.012, z: 0.115 }));
  }
  for (const x of [-0.075, 0.075]) { const h = K.mesh(new THREE.SphereGeometry(0.05, 10, 8), fur, { x, y: 0.05, z: -0.02 }); h.scale.set(0.8, 0.9, 1.4); c.add(h); }
  // head
  const head = new THREE.Group();
  head.position.set(0, 0.29, 0.06);
  const skull = K.mesh(new THREE.SphereGeometry(0.068, 14, 10), fur, {}); skull.scale.set(1.1, 0.95, 1); head.add(skull);
  for (const s of [-1, 1]) {
    const ear = K.mesh(new THREE.ConeGeometry(0.028, 0.055, 4), fur, { x: s * 0.042, y: 0.06, z: -0.005, rz: -s * 0.25 });
    head.add(ear);
    head.add(K.mesh(new THREE.ConeGeometry(0.016, 0.035, 4), pink, { x: s * 0.042, y: 0.058, z: 0.006, rz: -s * 0.25 }));
    head.add(K.mesh(new THREE.SphereGeometry(0.012, 8, 6), K.mat('#c9a43a', { rough: 0.2 }), { x: s * 0.026, y: 0.012, z: 0.058 }));
    head.add(K.mesh(new THREE.SphereGeometry(0.006, 6, 4), K.mat('#1a1a1a', { rough: 0.2 }), { x: s * 0.026, y: 0.012, z: 0.068 }));
  }
  head.add(K.mesh(new THREE.SphereGeometry(0.008, 6, 4), pink, { y: -0.008, z: 0.068 }));
  const muzzle = K.mesh(new THREE.SphereGeometry(0.03, 10, 6), fur, { y: -0.02, z: 0.05 }); muzzle.scale.set(1.3, 0.8, 0.8); head.add(muzzle);
  head.rotation.y = 0.25;
  c.add(head);
  // tail curled around the side (dynamic: it flicks)
  const tailG = new THREE.Group();
  tailG.userData.dynamic = true;
  tailG.position.set(0.0, 0.03, -0.1);
  const tail = new THREE.Group();
  tail.add(K.mesh(new THREE.TorusGeometry(0.1, 0.018, 6, 14, Math.PI * 1.1), fur, { rx: Math.PI / 2, x: 0.02, z: 0.06 }));
  tailG.add(tail);
  c.add(tailG);
  c.userData.tail = tail;
  return c;
}

function carModel(dark, color = '#2f4f6f') {
  const car = new THREE.Group();
  const paint = K.mat(color, { metal: 0.5, rough: 0.25 });
  car.add(K.rbox(1.7, 0.62, 4.2, 0.2, paint, { y: 0.25 }));
  car.add(K.rbox(1.5, 0.55, 2.2, 0.18, paint, { y: 0.8, z: -0.2 }));
  car.add(K.box(1.52, 0.4, 2.0, K.mat('#1c2530', { rough: 0.1, metal: 0.5 }), { y: 0.88, z: -0.2 }));
  const tire = K.mat('#1a1a1a', { rough: 0.8 });
  for (const [x, z] of [[-0.8, 1.3], [0.8, 1.3], [-0.8, -1.3], [0.8, -1.3]]) car.add(K.mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 14), tire, { x, y: 0.32, z, rz: Math.PI / 2 }));
  const tl = new THREE.MeshBasicMaterial({ color: dark ? '#ff5a4a' : '#a83a3a', toneMapped: false });
  for (const x of [-0.6, 0.6]) car.add(K.box(0.3, 0.1, 0.03, tl, { x, y: 0.62, z: -2.1, cast: false }));
  for (const x of [-0.6, 0.6]) car.add(K.box(0.3, 0.1, 0.03, K.mat('#e8eef2', { rough: 0.2 }), { x, y: 0.62, z: 2.1, cast: false }));
  return car;
}

function streakTex() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, 'rgba(255,248,230,0.9)'); gr.addColorStop(0.5, 'rgba(255,248,230,0.35)'); gr.addColorStop(1, 'rgba(255,248,230,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
  const h = g.createLinearGradient(0, 0, 64, 0);
  h.addColorStop(0, 'rgba(0,0,0,1)'); h.addColorStop(0.5, 'rgba(0,0,0,0)'); h.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = h; g.fillRect(0, 0, 64, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function nightStreetTex(time, weather) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 360;
  const g = c.getContext('2d');
  const r = K.rng(23);
  const night = time === 'night'; const dusk = time === 'evening';
  const dim = night ? 0.25 : dusk ? 0.7 : weather === 'clear' ? 1 : 0.8;
  const col = (hex) => { const k = new THREE.Color(hex).multiplyScalar(dim); return `#${k.getHexString()}`; };
  let x = 0; let i = 0;
  const shops = ['ラーメン', 'いざかや', 'クリーニング', 'くすり', '歯科', 'カラオケ', 'ふどうさん', 'パン'];
  while (x < 1024) {
    const bw = 80 + r() * 90; const bh = 130 + r() * 200;
    g.fillStyle = col(['#8a8d94', '#9a9288', '#7c8088', '#a39a8c', '#868a80'][i % 5]);
    g.fillRect(x, 360 - bh, bw, bh);
    for (let wy = 360 - bh + 12; wy < 360 - 70; wy += 30) for (let wx = x + 8; wx < x + bw - 18; wx += 24) {
      g.fillStyle = night ? (r() > 0.5 ? 'rgba(255,208,130,0.95)' : 'rgba(40,46,60,1)') : col('#b9c8d4');
      g.fillRect(wx, wy, 13, 17);
    }
    g.fillStyle = night ? (r() > 0.3 ? 'rgba(255,226,170,0.95)' : '#2a2d34') : col('#e0dccf');
    g.fillRect(x + 6, 360 - 52, bw - 12, 52);
    const signCol = ['#d94a3a', '#f2c230', '#2f8a62', '#2f6db3'][i % 4];
    g.fillStyle = night ? signCol : col(signCol); g.fillRect(x + 8, 360 - 76, bw - 16, 20);
    g.fillStyle = '#ffffff'; g.font = `700 14px ${K.JP_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(shops[i % shops.length], x + bw / 2, 360 - 66);
    if (i % 3 === 0) { g.fillStyle = night ? '#ffcf5a' : col('#f0e0b0'); g.fillRect(x + bw - 16, 360 - bh + 24, 12, 80); }
    x += bw + 4; i++;
  }
  // a glowing vending machine pair and a traffic light
  g.fillStyle = night ? '#eaf4ff' : '#d8e2ea'; g.fillRect(430, 300, 22, 58); g.fillRect(455, 300, 22, 58);
  g.fillStyle = '#c0392b'; g.fillRect(430, 300, 22, 8); g.fillStyle = '#2f6db3'; g.fillRect(455, 300, 22, 8);
  g.fillStyle = '#222'; g.fillRect(760, 160, 6, 200); g.fillRect(740, 160, 46, 16);
  g.fillStyle = night ? '#ff4a3a' : '#a33'; g.beginPath(); g.arc(776, 168, 5, 0, Math.PI * 2); g.fill();
  if (weather !== 'clear') { g.fillStyle = weather === 'rain' ? 'rgba(120,130,145,0.22)' : 'rgba(180,185,190,0.15)'; g.fillRect(0, 0, 1024, 360); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// =================================================================== products (atlas faces, cached per atlas)
function products(A) {
  if (A.prod) return A.prod;
  const P = {};
  const txt = (c, t, x, y, size, col = '#fff', wt = 800) => { c.fillStyle = col; c.font = `${wt} ${size}px ${K.JP_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(t, x, y); };
  P.snack = [['#e84c3d', 'ポテト'], ['#f2c230', 'コーン'], ['#2f6db3', 'えび'], ['#8a4fb3', 'グミ'], ['#2f8a62', 'のり'], ['#ef8a2e', 'チーズ'], ['#c0392b', 'からい'], ['#3a3d42', 'チョコ']].map(([col, t], i) => A.region(64, 84, (c, w, h) => {
    c.fillStyle = col; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.arc(w / 2, h * 0.62, 20, 0, Math.PI * 2); c.fill();
    c.fillStyle = ['#f2c230', '#e84c3d', '#ffffff', '#f6c6d3'][i % 4]; c.beginPath(); c.arc(w / 2, h * 0.62, 12, 0, Math.PI * 2); c.fill();
    txt(c, t, w / 2, h * 0.22, 15);
  }));
  P.noodle = [['#e84c3d', 'しょうゆ'], ['#f2c230', 'カレー'], ['#2f6db3', 'しお'], ['#3a3d42', 'とんこつ'], ['#2f8a62', 'うどん'], ['#ef8a2e', 'みそ']].map(([col, t]) => A.region(96, 48, (c, w, h) => {
    c.fillStyle = '#fbf8f0'; c.fillRect(0, 0, w, h);
    c.fillStyle = col; c.fillRect(0, 0, w, h * 0.45);
    txt(c, t, w / 4, h * 0.25, 13); txt(c, t, w * 0.75, h * 0.25, 13);
    c.fillStyle = '#c9a253'; c.fillRect(0, h * 0.82, w, 4);
  }));
  P.bottle = [['#cfe8f4', '#2f6db3', '水'], ['#c9a253', '#2f8a62', 'お茶'], ['#7a3a1a', '#e84c3d', 'コーラ'], ['#f2c230', '#ef8a2e', 'オレンジ'], ['#e8d2a0', '#8a5a3a', 'ほうじ茶'], ['#bfe0b0', '#2f8a62', 'りょく茶'], ['#f4f4f0', '#2f6db3', 'カルピス'], ['#3a2a1a', '#c9a253', 'コーヒー'], ['#f6c6d3', '#c0392b', 'もも'], ['#d0e8f8', '#3a8fbf', 'スポーツ']].map(([liq, band, t]) => A.region(96, 64, (c, w, h) => {
    c.fillStyle = liq; c.fillRect(0, 0, w, h);
    c.fillStyle = band; c.fillRect(0, h * 0.35, w, h * 0.4);
    txt(c, t, w / 4, h * 0.55, 12); txt(c, t, w * 0.75, h * 0.55, 12);
  }));
  P.can = [['#c0392b', 'ビール'], ['#f2c230', 'レモン'], ['#2f6db3', 'サワー'], ['#e8e8e4', 'ハイボール']].map(([col, t]) => A.region(96, 48, (c, w, h) => {
    c.fillStyle = col; c.fillRect(0, 0, w, h);
    txt(c, t, w / 4, h * 0.5, 12, col === '#e8e8e4' ? '#333' : '#fff'); txt(c, t, w * 0.75, h * 0.5, 12, col === '#e8e8e4' ? '#333' : '#fff');
  }));
  P.onigiri = [['しゃけ', '#ef8a5a'], ['うめ', '#c0392b'], ['ツナマヨ', '#2f6db3'], ['こんぶ', '#3a3d42']].map(([t, col]) => A.region(72, 64, (c, w, h) => {
    c.fillStyle = '#f8f6f0'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#1f3a2a'; c.fillRect(0, h * 0.62, w, h);
    c.fillStyle = col; c.fillRect(w * 0.2, h * 0.3, w * 0.6, h * 0.22);
    txt(c, t, w / 2, h * 0.41, 11);
    c.fillStyle = '#e84c3d'; c.fillRect(w * 0.46, 0, w * 0.08, h);
  }));
  P.bento = [0, 1, 2, 3].map((k) => A.region(96, 72, (c, w, h) => {
    c.fillStyle = '#1e1e22'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#fbfaf5'; c.fillRect(5, 5, w * 0.48, h - 10);
    c.fillStyle = '#c0392b'; c.beginPath(); c.arc(w * 0.28, h * 0.5, 5, 0, Math.PI * 2); c.fill();
    const main = ['#b5652c', '#d9a050', '#8a4a2a', '#e8c070'][k];
    c.fillStyle = main; for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(w * 0.62 + (i % 2) * 14, h * 0.3 + Math.floor(i / 2) * 16, 8, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#5f9a50'; c.fillRect(w * 0.58, h * 0.68, w * 0.36, h * 0.2);
    c.fillStyle = '#f2c230'; c.fillRect(w * 0.82, h * 0.06, w * 0.15, h * 0.18);
    c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(0, 0, w, h * 0.1);
  }));
  P.sandwich = [['#f2d9a0', '#e8c547', '#5f9a50'], ['#f2d9a0', '#e84c3d', '#f8f0e0'], ['#f2d9a0', '#8a4a2a', '#5f9a50']].map(([bread, a, b]) => A.region(64, 64, (c, w, h) => {
    c.fillStyle = bread; c.fillRect(0, 0, w, h);
    c.fillStyle = a; c.fillRect(0, h * 0.35, w, h * 0.12);
    c.fillStyle = b; c.fillRect(0, h * 0.47, w, h * 0.1);
    c.fillStyle = a; c.fillRect(0, h * 0.62, w, h * 0.1);
  }));
  P.sweet = [['#f6c6d3', 'プリン'], ['#8a5a3a', 'ロール'], ['#f8f0e0', 'だんご'], ['#e8c070', 'シュー'], ['#5f9a50', 'まっちゃ'], ['#c0392b', 'いちご']].map(([col, t]) => A.region(56, 48, (c, w, h) => {
    c.fillStyle = '#fbf8f2'; c.fillRect(0, 0, w, h);
    c.fillStyle = col; c.beginPath(); c.arc(w / 2, h * 0.62, 14, 0, Math.PI * 2); c.fill();
    txt(c, t, w / 2, h * 0.2, 10, '#555');
  }));
  P.daily = [['#ffffff', '#2f6db3', 'ティッシュ'], ['#e8f4fb', '#3a8fbf', 'せんざい'], ['#fff6e0', '#ef8a2e', 'マスク'], ['#f4f4f0', '#2f8a62', 'はブラシ'], ['#fdf0f4', '#c0392b', 'ばんそうこう'], ['#f0f0f8', '#8a4fb3', 'シャンプー']].map(([bg, col, t]) => A.region(72, 72, (c, w, h) => {
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    c.fillStyle = col; c.fillRect(0, h * 0.62, w, h * 0.38);
    txt(c, t, w / 2, h * 0.32, 12, col);
  }));
  P.spice = [['#f4f4f0', 'しお'], ['#3a3d42', 'こしょう'], ['#7a3a1a', 'しょうゆ'], ['#e8c070', 'カレー'], ['#5f9a50', 'わさび'], ['#c0392b', 'とうがらし'], ['#e8a33c', 'からし'], ['#f6efe0', 'さとう']].map(([col, t]) => A.region(56, 64, (c, w, h) => {
    c.fillStyle = col; c.fillRect(0, 0, w, h);
    c.fillStyle = '#fffbe8'; c.fillRect(0, h * 0.35, w, h * 0.38);
    txt(c, t, w / 2, h * 0.54, t.length > 3 ? 10 : 13, '#5a3a1a');
  }));
  P.tobacco = ['#ffffff', '#2f6db3', '#c0392b', '#3a3d42', '#c9a253', '#2f8a62', '#8a4fb3', '#e8e8e4'].map((col) => A.region(24, 36, (c, w, h) => {
    c.fillStyle = col; c.fillRect(0, 0, w, h);
    c.fillStyle = col === '#ffffff' || col === '#e8e8e4' ? '#c0392b' : '#ffffff'; c.fillRect(0, h * 0.55, w, h * 0.14);
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, h * 0.85, w, h * 0.15);
  }));
  P.mag = [['#e84c3d', 'しゅうかん ことば'], ['#2f6db3', 'まんが キング'], ['#2f8a62', 'たびの 本'], ['#f2c230', 'きょうの りょうり'], ['#3a3d42', 'くるま ワールド'], ['#f6c6d3', 'ファッション'], ['#ef8a2e', 'サッカー'], ['#8a4fb3', 'テレビ ガイド']].map(([col, t], i) => A.region(80, 108, (c, w, h) => {
    c.fillStyle = '#fbf8f2'; c.fillRect(0, 0, w, h);
    c.fillStyle = col; c.fillRect(0, 0, w, h * 0.22);
    txt(c, t, w / 2, h * 0.11, t.length > 6 ? 10 : 13);
    const pc = ['#f0c8a0', '#9cc7e0', '#a8d090', '#f6d55c'][i % 4];
    c.fillStyle = pc; c.fillRect(6, h * 0.27, w - 12, h * 0.5);
    c.fillStyle = 'rgba(60,40,30,0.7)'; c.beginPath(); c.arc(w / 2, h * 0.47, 14, 0, Math.PI * 2); c.fill();
    c.fillStyle = col; c.fillRect(6, h * 0.82, w * 0.6, 6); c.fillRect(6, h * 0.9, w * 0.4, 5);
  }));
  P.battery = ['単3', '単4', '9V'].map((t, i) => A.region(48, 80, (c, w, h) => {
    c.fillStyle = ['#2f6db3', '#c0392b', '#3a3d42'][i]; c.fillRect(0, 0, w, h);
    c.fillStyle = '#ffffff'; c.font = `800 13px ${K.JP_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('でんち', w / 2, 10);
    c.fillText(t, w / 2, 24);
    c.fillStyle = '#d6dade'; for (let k = 0; k < (i === 2 ? 1 : 4); k++) c.fillRect(6 + k * 10, 36, 8, 34);
    c.fillStyle = '#f2c230'; for (let k = 0; k < (i === 2 ? 1 : 4); k++) c.fillRect(6 + k * 10, 36, 8, 6);
  }));
  P.price = A.region(512, 20, (c, w, h) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#333'; c.font = `700 12px ${K.JP_FONT}`; c.textBaseline = 'middle';
    const r = K.rng(4);
    for (let x = 4; x < w - 40; x += 44 + Math.floor(r() * 30)) { c.fillStyle = '#f2c230'; c.fillRect(x, 2, 40, h - 4); c.fillStyle = '#333'; c.fillText(`${100 + Math.floor(r() * 30) * 10}円`, x + 3, h / 2); }
  });
  A.prod = P;
  return P;
}

const pick = (arr, r) => arr[Math.floor(r() * arr.length) % arr.length];

/** Cylinder whose side wraps the given region (bottle labels, cans, cups). Bottom at 0. */
function labelCyl(A, rt, rb, h, region, seg = 8, capColor = null) {
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(rt, rb, h, seg, 1, true);
  A.remap(geo, region);
  g.add(K.mesh(geo, A.material, { y: h / 2 }));
  if (capColor) g.add(K.cyl(rt, rt, 0.004, K.mat(capColor, { rough: 0.5 }), { y: h }, seg));
  return g;
}

function petBottle(A, region, cap = '#f4f4f0') {
  const b = labelCyl(A, 0.032, 0.032, 0.16, region, 8);
  b.add(K.cyl(0.012, 0.032, 0.04, K.mat('#e9f2f6', { rough: 0.2 }), { y: 0.16 }, 8));
  b.add(K.cyl(0.013, 0.013, 0.022, K.mat(cap, { rough: 0.5 }), { y: 0.2 }, 8));
  return b;
}

function indexed(geo) {
  if (!geo.index) { const n = geo.attributes.position.count; geo.setIndex([...Array(n).keys()]); }
  return geo;
}

function onigiri(A, k) {
  const P = products(A);
  const s = new THREE.Shape();
  const r = 0.055;
  s.moveTo(-r, -r * 0.55); s.quadraticCurveTo(-r * 1.1, -r * 0.8, -r * 0.7, -r * 0.8);
  s.lineTo(r * 0.7, -r * 0.8); s.quadraticCurveTo(r * 1.1, -r * 0.8, r, -r * 0.55);
  s.lineTo(r * 0.12, r * 0.75); s.quadraticCurveTo(0, r * 0.9, -r * 0.12, r * 0.75); s.closePath();
  const geo = indexed(new THREE.ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: false, curveSegments: 3 }));
  const reg = P.onigiri[k % P.onigiri.length];
  const pos = geo.attributes.position; const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, reg.u0 + (pos.getX(i) / (2.2 * r) + 0.5) * (reg.u1 - reg.u0), reg.v0 + (pos.getY(i) / (1.7 * r) + 0.47) * (reg.v1 - reg.v0));
  geo.translate(0, r * 0.8, -0.0175);
  return K.mesh(geo, A.material, {});
}

function sandwich(A, k) {
  const P = products(A);
  const s = new THREE.Shape();
  s.moveTo(-0.06, 0); s.lineTo(0.06, 0); s.lineTo(0.06, 0.1); s.closePath();
  const geo = indexed(new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false }));
  const reg = P.sandwich[k % P.sandwich.length];
  const pos = geo.attributes.position; const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, reg.u0 + (pos.getX(i) / 0.12 + 0.5) * (reg.u1 - reg.u0), reg.v0 + (pos.getY(i) / 0.1) * (reg.v1 - reg.v0));
  geo.translate(0, 0, -0.025);
  return K.mesh(geo, A.material, {});
}

function bento(A, k) {
  const P = products(A);
  const b = new THREE.Group();
  b.add(A.box(0.21, 0.05, 0.15, A.solid('#1e1e22'), A.solid('#1e1e22'), { top: P.bento[k % P.bento.length] }));
  b.add(K.box(0.215, 0.012, 0.155, K.mat('#e9f2f6', { rough: 0.1, opacity: 0.35 }), { y: 0.05, cast: false }));
  return b;
}

function basket(A, M, full) {
  const b = new THREE.Group();
  const col = '#2f8a62';
  const mesh = A.region(128, 64, (c, w, h) => {
    c.fillStyle = col; c.fillRect(0, 0, w, h);
    c.clearRect(0, 0, 0, 0);
    for (let y = 14; y < h - 8; y += 10) for (let x = 6; x < w - 6; x += 10) c.clearRect(x, y, 6, 6);
    c.fillStyle = '#ffffff'; c.font = `800 11px ${K.JP_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('ことばマート', w / 2, 7);
  });
  const W = 0.42; const D = 0.3; const Hh = 0.2;
  b.add(K.box(W - 0.04, 0.012, D - 0.04, K.mat(col, { rough: 0.5 }), {}));
  for (const [x, z, ry, len] of [[0, D / 2, 0, W], [0, -D / 2, Math.PI, W], [W / 2, 0, Math.PI / 2, D], [-W / 2, 0, -Math.PI / 2, D]]) {
    const p = A.plane(len, Hh, mesh, { cast: true });
    p.material = A.material; p.position.set(x, Hh / 2, z); p.rotation.y = ry;
    b.add(p);
    const back = A.plane(len, Hh, mesh); back.position.set(x, Hh / 2, z); back.rotation.y = ry + Math.PI; b.add(back);
  }
  const hm = K.mat('#2a6e50', { rough: 0.5 });
  for (const x of [-0.12, 0.12]) b.add(K.mesh(new THREE.TorusGeometry(0.13, 0.008, 5, 12, Math.PI), hm, { x, y: Hh, rx: 0, ry: Math.PI / 2 }));
  if (full) {
    const P = products(A);
    const pb = petBottle(A, P.bottle[1], '#2f8a62'); pb.rotation.z = Math.PI / 2 - 0.25; pb.position.set(0.08, 0.06, 0.03); b.add(pb);
    b.add(A.box(0.13, 0.17, 0.05, P.snack[0], A.solid('#e84c3d'), { x: -0.1, y: 0.01, z: -0.02, rz: 0.2 }));
    b.add(A.box(0.1, 0.06, 0.08, P.sweet[0], A.solid('#fbf8f2'), { x: 0.04, y: 0.01, z: -0.08 }));
  }
  return b;
}

function umbrellaRack(A, M) {
  const r = new THREE.Group();
  r.add(K.box(0.5, 0.05, 0.36, M.grey, {}));
  r.add(K.cyl(0.015, 0.015, 1.25, M.alu, { x: -0.22 }, 6));
  r.add(K.cyl(0.015, 0.015, 1.25, M.alu, { x: 0.22 }, 6));
  r.add(K.box(0.5, 0.025, 0.025, M.alu, { y: 1.2 }));
  const vinyl = K.mat('#e6eef2', { rough: 0.3 });
  const handle = K.mat('#f4f4f2', { rough: 0.4 });
  for (let i = 0; i < 7; i++) {
    const u = new THREE.Group();
    u.add(K.cyl(0.006, 0.006, 0.9, M.alu, {}, 5));
    u.add(K.cyl(0.014, 0.04, 0.55, vinyl, { y: 0.28 }, 8));
    u.add(K.mesh(new THREE.TorusGeometry(0.03, 0.006, 5, 8, Math.PI), handle, { y: 0.9, x: 0.03 }));
    u.position.set(-0.19 + i * 0.063, 0.3, (i % 2) * 0.05 - 0.02);
    u.rotation.z = (i - 3) * 0.02;
    r.add(u);
  }
  const s = A.text([{ t: 'ビニールがさ', scale: 0.8 }, { t: '550円', scale: 1, color: '#c0392b' }], 0.4, 0.22, { bg: '#ffffff', fg: '#2f6db3', border: '#2f6db3', radius: 0.08 });
  s.position.set(0, 1.4, 0.02); r.add(s);
  return r;
}

function magazineRack(A, M) {
  const P = products(A);
  const g = new THREE.Group();
  const L = 2.4; const Dp = 0.42;
  g.add(K.box(L, 1.05, 0.03, M.shelf, { z: -Dp / 2 }));
  for (const x of [-L / 2, L / 2]) g.add(K.box(0.03, 1.05, Dp, M.shelf, { x }));
  g.add(K.box(L, 0.08, Dp, M.grey, {}));
  g.add(K.box(L, 0.02, Dp, M.shelf, { y: 0.08 }));
  // sign on top
  const sg = A.text([{ t: 'ざっし  MAGAZINE', scale: 0.8 }], 0.9, 0.12, { bg: '#2f8a62', fg: '#ffffff', radius: 0.2 });
  sg.position.set(0, 1.12, -Dp / 2 + 0.03); g.add(sg);
  // three tiers of magazines leaning back
  const r = K.rng(12);
  for (let t = 0; t < 3; t++) {
    const y = 0.34 + t * 0.25; const z = -0.02 - t * 0.06;
    g.add(K.box(L, 0.02, 0.14, M.shelf, { y: y - 0.02, z: z + 0.04 }));
    g.add(K.box(L, 0.04, 0.01, M.shelf, { y: y - 0.02, z: z + 0.11 }));
    for (let x = -L / 2 + 0.14; x < L / 2 - 0.1; x += 0.235) {
      const m = A.box(0.21, 0.28, 0.008, pick(P.mag, r), A.solid('#efece4'), { x, y, z: z + 0.06, rx: -0.28 + t * 0.03 });
      g.add(m);
    }
  }
  // bottom shelf (y 0.1): batteries + small goods, with a label strip
  const bat = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const k = i < 4 ? 0 : i < 7 ? 1 : 2;
    bat.add(A.box(0.08, 0.13, 0.02, P.battery[k], A.solid('#d6dade'), { x: 0.3 + i * 0.09, y: 0.1, z: 0.04 + (i % 2) * 0.01, rx: -0.1 }));
  }
  g.add(bat);
  for (let i = 0; i < 10; i++) g.add(A.box(0.12, 0.1, 0.06, pick(P.daily, r), A.solid('#f4f4f0'), { x: -1.1 + i * 0.12, y: 0.1, z: 0.02 }));
  const lab = A.text([{ t: 'でんち', scale: 0.9 }], 0.3, 0.05, { bg: '#f2c230', fg: '#333', radius: 0.2 });
  lab.position.set(0.66, 0.05, Dp / 2 + 0.003); g.add(lab);
  const lab2 = A.text([{ t: 'にちようひん', scale: 0.9 }], 0.4, 0.05, { bg: '#ffffff', fg: '#333', radius: 0.2 });
  lab2.position.set(-0.5, 0.05, Dp / 2 + 0.003); g.add(lab2);
  return { group: g, batteries: bat };
}

function coffeeCorner(A, M) {
  const c = new THREE.Group();
  c.add(K.box(0.9, 0.9, 0.5, M.white, { z: 0.0 }));
  c.add(K.box(0.92, 0.03, 0.52, K.mat('#cfd3d6', { rough: 0.35 }), { y: 0.9 }));
  c.add(K.rbox(0.38, 0.62, 0.42, 0.03, K.mat('#2a2d33', { rough: 0.3 }), { x: -0.18, y: 0.93 }));
  const scr = A.text([{ t: 'コーヒー', scale: 0.9 }, { t: 'R 120 ・ L 180', scale: 0.6 }], 0.26, 0.16, { bg: '#1b2a3a', fg: '#eaf4ff', radius: 0.1, glow: true });
  scr.position.set(-0.18, 1.3, 0.215); c.add(scr);
  for (let i = 0; i < 3; i++) c.add(K.cyl(0.04, 0.035, 0.14, K.mat('#f4f1ea', { rough: 0.6 }), { x: 0.15 + i * 0.1, y: 0.93, z: 0.08 }, 10));
  c.add(K.box(0.16, 0.1, 0.12, K.mat('#8a6a4a'), { x: 0.28, y: 0.93, z: -0.12 }));
  const s = A.text([{ t: 'セルフ コーヒー' }], 0.7, 0.14, { bg: '#5b3b26', fg: '#fff3dd', radius: 0.2 });
  s.position.set(0, 1.85, -0.2); c.add(s);
  return c;
}

function posRegister(A, M) {
  const r = new THREE.Group();
  const body = K.mat('#e9eaec', { rough: 0.4 });
  r.add(K.box(0.36, 0.1, 0.32, body, {}));
  // clerk screen (faces the clerk, -z) and customer display (faces the learner, +z)
  const stand = K.mat('#3a3d42', { rough: 0.4 });
  r.add(K.box(0.04, 0.22, 0.04, stand, { y: 0.1, z: -0.06 }));
  const scr = new THREE.Group();
  scr.add(K.box(0.32, 0.22, 0.03, stand, { y: -0.11 }));
  const sc = A.text([{ t: 'ことばマート', scale: 0.6 }, { t: '¥1,284', scale: 1 }], 0.22, 0.14, { bg: '#eaf6ff', fg: '#1e3a5a', radius: 0.05, glow: true });
  sc.position.z = -0.017; sc.rotation.y = Math.PI; scr.add(sc);
  scr.position.set(0, 0.42, -0.05); scr.rotation.x = 0.25;
  r.add(scr);
  const cd = A.text([{ t: 'ごうけい', scale: 0.6 }, { t: '¥1,284', scale: 1 }], 0.14, 0.09, { bg: '#16202c', fg: '#8af0b0', radius: 0.06, glow: true });
  cd.position.set(0, 0.36, -0.03); cd.rotation.y = 0;
  r.add(cd);
  r.add(K.box(0.12, 0.05, 0.16, K.mat('#2a2d33', { rough: 0.3 }), { x: 0.24, y: 0, z: 0.05 })); // card terminal
  r.add(K.box(0.2, 0.012, 0.13, K.mat('#4a7a9a', { rough: 0.5 }), { x: -0.05, y: 0.1, z: 0.14 })); // money tray
  return r;
}

function odenPot(A, M) {
  const o = new THREE.Group();
  const steel = K.mat('#c8ccd0', { rough: 0.3 });
  o.add(K.box(0.5, 0.14, 0.36, steel, {}));
  o.add(K.box(0.48, 0.005, 0.34, K.mat('#b07a3a', { rough: 0.1 }), { y: 0.12 }));
  o.add(K.box(0.48, 0.03, 0.006, steel, { y: 0.1 }));
  o.add(K.box(0.006, 0.03, 0.34, steel, { y: 0.1 }));
  const r = K.rng(3);
  for (let i = 0; i < 12; i++) {
    const x = -0.2 + (i % 4) * 0.13; const z = -0.12 + Math.floor(i / 4) * 0.12;
    const k = i % 3;
    if (k === 0) o.add(K.cyl(0.035, 0.035, 0.03, K.mat('#e8d6a8', { rough: 0.5 }), { x, y: 0.105, z }, 12)); // daikon
    else if (k === 1) { const e = K.mesh(new THREE.SphereGeometry(0.026, 10, 6), K.mat('#c9884a', { rough: 0.4 }), { x, y: 0.125, z }); e.scale.set(1, 0.8, 1.2); o.add(e); } // egg
    else o.add(K.box(0.05, 0.03, 0.04, K.mat('#5a5048', { rough: 0.7 }), { x, y: 0.105, z, ry: r() })); // konnyaku
  }
  const s = A.text([{ t: 'おでん', color: '#b5452c' }], 0.24, 0.08, { bg: '#fff6e0', fg: '#333', border: '#b5452c', radius: 0.2 });
  s.position.set(0, 0.24, 0.12); s.rotation.x = -0.3; o.add(s);
  o.add(K.box(0.008, 0.11, 0.008, steel, { x: 0, y: 0.14, z: 0.1 }));
  return o;
}

function donutCase(A, M) {
  const d = new THREE.Group();
  d.add(K.box(0.48, 0.03, 0.32, M.white, {}));
  d.add(K.box(0.46, 0.3, 0.3, K.mat('#e9f2f6', { rough: 0.05, opacity: 0.25 }), { y: 0.03, cast: false }));
  const cols = ['#c98a4a', '#f6c6d3', '#5a3220', '#f4ead8'];
  for (let i = 0; i < 6; i++) d.add(K.mesh(new THREE.TorusGeometry(0.035, 0.018, 6, 12), K.mat(cols[i % 4], { rough: 0.5 }), { x: -0.14 + (i % 3) * 0.14, y: i < 3 ? 0.05 : 0.17, z: 0, rx: Math.PI / 2 }));
  d.add(K.box(0.44, 0.01, 0.28, M.white, { y: 0.13 }));
  return d;
}

function hotSnackCase(A, M) {
  const h = new THREE.Group();
  h.add(K.box(0.42, 0.06, 0.34, K.mat('#8a9096', { rough: 0.35 }), {}));
  h.add(K.box(0.4, 0.3, 0.32, K.mat('#fff2d8', { rough: 0.05, opacity: 0.25 }), { y: 0.06, cast: false }));
  h.add(K.box(0.42, 0.04, 0.34, K.mat('#8a9096', { rough: 0.35 }), { y: 0.36 }));
  h.add(K.box(0.38, 0.01, 0.02, new THREE.MeshBasicMaterial({ color: '#ffb85a', toneMapped: false }), { y: 0.35, z: 0.1, cast: false }));
  const fry = K.mat('#c47a2c', { rough: 0.8 });
  for (let i = 0; i < 8; i++) { const s = K.mesh(new THREE.SphereGeometry(0.03, 7, 5), fry, { x: -0.13 + (i % 4) * 0.085, y: 0.09, z: -0.06 + Math.floor(i / 4) * 0.1 }); s.scale.set(1.2, 0.8, 1); h.add(s); }
  for (let i = 0; i < 3; i++) { const c = K.mesh(new THREE.SphereGeometry(0.04, 8, 5), K.mat('#d9a050', { rough: 0.8 }), { x: -0.1 + i * 0.1, y: 0.22, z: 0 }); c.scale.set(1.3, 0.5, 0.9); h.add(c); }
  h.add(K.box(0.38, 0.008, 0.28, K.mat('#9aa0a6', { metal: 0.6 }), { y: 0.18 }));
  const s = A.text([{ t: 'ホットスナック', scale: 0.8 }], 0.4, 0.06, { bg: '#e84c3d', fg: '#ffffff', radius: 0.2 });
  s.position.set(0, 0.42, 0.17); h.add(s);
  return h;
}

function breadRack(A, M) {
  const b = new THREE.Group();
  const wood = K.mat('#b98b5e', { rough: 0.6 });
  b.add(K.box(0.3, 0.02, 0.3, wood, {}));
  b.add(K.box(0.3, 0.02, 0.2, wood, { y: 0.16, z: -0.05 }));
  for (const x of [-0.14, 0.14]) b.add(K.box(0.02, 0.18, 0.3, wood, { x }));
  const breads = [['#d9a050', 1.2, 0.7], ['#e8c547', 1, 0.75], ['#b5652c', 1.3, 0.6], ['#e0b070', 1, 0.8]];
  breads.forEach(([col, sx, sy], i) => {
    const s = K.mesh(new THREE.SphereGeometry(0.045, 10, 6), K.mat(col, { rough: 0.7 }), { x: -0.07 + (i % 2) * 0.14, y: i < 2 ? 0.045 : 0.2, z: i < 2 ? 0.05 : -0.05 });
    s.scale.set(sx, sy, 1); b.add(s);
  });
  b.add(K.rbox(0.12, 0.05, 0.08, 0.02, K.mat('#f2e0b0', { rough: 0.6 }), { x: 0.0, y: 0.02, z: -0.08 }));
  const t = A.text([{ t: 'やきたて パン', scale: 0.75, color: '#8a4a2a' }, { t: '120円〜', scale: 0.8 }], 0.2, 0.09, { bg: '#fffaf0', fg: '#333', border: '#d9a050', radius: 0.12 });
  t.position.set(0, 0.32, 0.0); b.add(t);
  return b;
}

function microwave(M, A) {
  const m = new THREE.Group();
  m.add(K.box(0.46, 0.28, 0.36, K.mat('#e6e6e2', { rough: 0.4 }), {}));
  m.add(K.box(0.3, 0.2, 0.01, K.mat('#2a2d33', { rough: 0.2 }), { x: -0.05, y: 0.04, z: 0.18 }));
  m.add(K.box(0.08, 0.06, 0.01, new THREE.MeshBasicMaterial({ color: '#8af0b0', toneMapped: false }), { x: 0.17, y: 0.18, z: 0.181, cast: false }));
  return m;
}

function tobaccoWall(A, M) {
  const P = products(A);
  const t = new THREE.Group();
  const W = 3.0;
  t.add(K.box(W, 1.15, 0.22, M.white, { z: 0.11 - 0.11 }));
  const r = K.rng(5);
  for (let row = 0; row < 6; row++) {
    const y = 0.05 + row * 0.16;
    t.add(K.box(W, 0.012, 0.06, M.shelf, { y, z: 0.25 }));
    for (let i = 0; i < 30; i++) {
      const x = -W / 2 + 0.06 + i * 0.098;
      t.add(A.box(0.055, 0.085, 0.022, pick(P.tobacco, r), A.solid('#d8d8d4'), { x, y: y + 0.012, z: 0.24 }));
    }
    const nums = A.region(400, 14, (c, w, h) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#333'; c.font = `700 11px ${K.JP_FONT}`; c.textBaseline = 'middle'; c.textAlign = 'center';
      for (let i = 0; i < 30; i++) c.fillText(String(row * 30 + i + 1), (i + 0.5) * w / 30, h / 2);
    });
    const np = A.plane(W - 0.04, 0.03, nums); np.position.set(0, y - 0.012, 0.281); t.add(np);
  }
  const hd = A.text([{ t: 'たばこは ばんごうで おもうしつけください', scale: 0.8 }], 2.6, 0.14, { bg: '#2f8a62', fg: '#ffffff', radius: 0.2, glow: true });
  hd.position.set(0, 1.08, 0.23); t.add(hd);
  t.position.z = 0;
  return t;
}

function chiller(A, M) {
  const P = products(A);
  const c = new THREE.Group();
  const W = 2.6; const Dp = 0.78;
  c.add(K.box(W, 0.7, Dp, M.white, { z: Dp / 2 }));
  c.add(K.box(W + 0.01, 0.1, 0.012, M.green, { y: 0.45, z: Dp + 0.001 }));
  c.add(K.box(W, 2.05, 0.06, K.mat('#dfe3e4', { rough: 0.3, metal: 0.3 }), { z: 0.03 }));
  for (const x of [-W / 2, W / 2]) c.add(K.box(0.04, 2.05, Dp, M.white, { x, z: Dp / 2 }));
  c.add(K.box(W, 0.3, 0.5, M.white, { y: 1.85, z: 0.25 }));
  const hd = A.text([{ t: 'おにぎり ・ おべんとう ・ サンドイッチ', scale: 0.85 }], W - 0.1, 0.22, { bg: '#2f8a62', fg: '#ffffff', radius: 0.12, glow: true });
  hd.position.set(0, 2.0, 0.505); c.add(hd);
  const r = K.rng(9);
  // deck 0: bento (deep)
  c.add(K.box(W - 0.08, 0.02, Dp - 0.1, M.shelf, { y: 0.7, z: Dp / 2 }));
  for (let x = -W / 2 + 0.16; x < W / 2 - 0.1; x += 0.235) for (const dz of [0.48, 0.66]) {
    const b = bento(A, Math.floor(r() * 4)); b.position.set(x, 0.72, dz); b.rotation.x = 0.0; c.add(b);
  }
  // shelves
  const tiers = [[1.0, 0.5, 'sand'], [1.27, 0.42, 'oni'], [1.54, 0.34, 'oni']];
  for (const [y, d, kind] of tiers) {
    c.add(K.box(W - 0.08, 0.02, d, M.shelf, { y, z: 0.08 + d / 2, rx: 0 }));
    c.add(K.box(W - 0.08, 0.008, 0.01, M.led, { y: y - 0.01, z: 0.1 + d, cast: false }));
    const strip = A.plane(W - 0.08, 0.025, P.price); strip.position.set(0, y + 0.0, 0.085 + d); c.add(strip);
    for (let x = -W / 2 + 0.1; x < W / 2 - 0.06; x += kind === 'oni' ? 0.115 : 0.135) {
      if (kind === 'oni') {
        for (const dz of [d - 0.02, d - 0.12, d - 0.22]) { const o = onigiri(A, Math.floor(r() * 4)); o.position.set(x, y + 0.02, 0.08 + dz); o.rotation.x = -0.15; c.add(o); }
      } else {
        for (const dz of [d - 0.04, d - 0.16]) { const s = sandwich(A, Math.floor(r() * 3)); s.position.set(x, y + 0.02, 0.08 + dz); c.add(s); }
      }
    }
  }
  return c;
}

function gondola(A, M, L, Hh, { front, back, seed, spiceFrom = null }) {
  const P = products(A);
  const g = new THREE.Group();
  const Dp = 0.9;
  g.add(K.box(L, Hh, 0.04, M.shelf, {}));
  g.add(K.box(L, 0.12, Dp, M.grey, {}));
  g.add(K.box(L + 0.02, 0.04, Dp * 0.5, M.white, { y: Hh }));
  for (const x of [-L / 2, L / 2]) g.add(K.box(0.04, Hh, Dp, M.shelf, { x }));
  const r = K.rng(seed);
  const spices = new THREE.Group();
  const fill = (side, kind) => {
    const s = side; // -1 = front (-z), +1 = back (+z)
    for (let lv = 0; lv < 4; lv++) {
      const y = 0.12 + lv * 0.3;
      g.add(K.box(L - 0.04, 0.02, 0.4, M.shelf, { y, z: s * 0.22 }));
      const strip = A.plane(L - 0.06, 0.025, P.price); strip.position.set(0, y + 0.01, s * 0.425); strip.rotation.y = s > 0 ? 0 : Math.PI; g.add(strip);
      for (let x = -L / 2 + 0.08; x < L / 2 - 0.06;) {
        const isSpice = spiceFrom !== null && s < 0 && x > spiceFrom - L / 2 && kind === 'daily';
        let w = 0.1;
        const z = s * 0.3; const ry = s > 0 ? 0 : Math.PI;
        let item;
        if (isSpice) {
          w = 0.065;
          item = labelCyl(A, 0.026, 0.028, 0.11 + r() * 0.05, pick(P.spice, r), 8, pick(['#c0392b', '#f2c230', '#2f8a62', '#f4f4f0'], r));
          spices.add(item); item.position.set(x + w / 2, y + 0.02, z);
          for (const dz of [0.08, -0.08]) { const it2 = labelCyl(A, 0.026, 0.028, 0.12, pick(P.spice, r), 8); it2.position.set(x + w / 2, y + 0.02, z + dz * s); spices.add(it2); }
          x += w + 0.01;
          continue;
        }
        if (kind === 'snacks') { w = 0.13; item = A.box(0.12, 0.17 + r() * 0.04, 0.06, pick(P.snack, r), A.solid('#e8e2d8')); }
        else if (kind === 'noodles') { w = 0.11; item = labelCyl(A, 0.05, 0.04, 0.1, pick(P.noodle, r), 10, '#f4f4f0'); }
        else if (kind === 'sweets') { w = 0.08; item = A.box(0.07, 0.06, 0.07, pick(P.sweet, r), A.solid('#fbf8f2')); }
        else { w = 0.11; item = A.box(0.1, 0.1 + r() * 0.08, 0.08, pick(P.daily, r), A.solid('#f4f4f0')); }
        item.position.set(x + w / 2, y + 0.02, z); item.rotation.y = ry;
        g.add(item);
        if (kind !== 'noodles' || lv % 2 === 0) { const it2 = item.clone(); it2.position.z = z - s * 0.12; g.add(it2); }
        x += w + 0.012;
      }
    }
  };
  fill(-1, front); fill(1, back);
  g.add(spices);
  if (spiceFrom !== null) {
    const sg = A.text([{ t: 'ちょうみりょう ・ スパイス', scale: 0.8 }], 1.2, 0.12, { bg: '#ef8a2e', fg: '#ffffff', radius: 0.2 });
    sg.position.set(spiceFrom - L / 2 + 0.85, Hh + 0.12, -0.02); sg.rotation.y = Math.PI; g.add(sg);
    g.add(K.box(0.01, 0.12, 0.01, M.grey, { x: spiceFrom - L / 2 + 0.85, y: Hh, z: -0.02 }));
  }
  const fsign = A.text([{ t: front === 'snacks' ? 'おかし' : 'にちようひん', scale: 0.8 }], 0.6, 0.12, { bg: '#2f8a62', fg: '#ffffff', radius: 0.2 });
  fsign.position.set(-L / 2 + 0.5, Hh + 0.12, -0.03); fsign.rotation.y = Math.PI; g.add(fsign);
  const bsign = A.text([{ t: back === 'noodles' ? 'カップめん' : 'デザート', scale: 0.8 }], 0.6, 0.12, { bg: '#ef8a2e', fg: '#ffffff', radius: 0.2 });
  bsign.position.set(-L / 2 + 0.5, Hh + 0.12, 0.03); g.add(bsign);
  g.userData.spices = spices;
  return g;
}

function endCap(A, M) {
  const P = products(A);
  const e = new THREE.Group();
  e.add(K.box(0.9, 1.2, 0.35, M.shelf, {}));
  for (let lv = 0; lv < 3; lv++) {
    const y = 0.15 + lv * 0.36;
    e.add(K.box(0.86, 0.02, 0.3, M.white, { y, z: 0.03 }));
    for (let i = 0; i < 6; i++) e.add(A.box(0.12, 0.16, 0.06, P.snack[(lv * 3 + i) % P.snack.length], A.solid('#e8e2d8'), { x: -0.36 + i * 0.145, y: y + 0.02, z: 0.12 }));
  }
  const s = A.text([{ t: 'しんはつばい！', color: '#c0392b' }], 0.7, 0.16, { bg: '#fff6a8', fg: '#333', border: '#e84c3d', radius: 0.15 });
  s.position.set(0, 1.32, 0.05); e.add(s);
  return e;
}

function drinksFridge(A, M, doors) {
  const P = products(A);
  const f = new THREE.Group();
  const dw = 0.76; const W = doors * dw; const Dp = 0.65; const Hh = 2.05;
  f.add(K.box(W, Hh, 0.04, K.mat('#d9dde0', { rough: 0.4 }), { z: 0.02 }));
  f.add(K.box(W + 0.06, 0.2, Dp, M.darkFrame, { z: Dp / 2 }));
  f.add(K.box(W + 0.06, 0.18, Dp, M.darkFrame, { y: Hh - 0.18, z: Dp / 2 }));
  for (const x of [-W / 2, W / 2]) f.add(K.box(0.04, Hh, Dp, M.darkFrame, { x, z: Dp / 2 }));
  const r = K.rng(21);
  for (let s = 0; s < 5; s++) {
    const y = 0.22 + s * 0.33;
    f.add(K.box(W - 0.04, 0.015, Dp - 0.1, K.mat('#c8ccd0', { metal: 0.5, rough: 0.4 }), { y, z: Dp / 2 - 0.02 }));
    const strip = A.plane(W - 0.06, 0.022, P.price); strip.position.set(0, y + 0.004, Dp - 0.075); f.add(strip);
    for (let d = 0; d < doors; d++) {
      const reg = pick(P.bottle, r); const reg2 = pick(P.bottle, r);
      for (let i = 0; i < 6; i++) {
        const x = -W / 2 + d * dw + 0.1 + i * 0.105;
        const can = s === 0 && d >= doors - 2;
        for (const z of [Dp - 0.15]) {
          const b = can ? labelCyl(A, 0.033, 0.033, 0.12, pick(P.can, r), 8, '#c8ccd0') : petBottle(A, i < 3 ? reg : reg2);
          b.position.set(x, y + 0.008, z);
          f.add(b);
        }
      }
    }
  }
  // doors: glass + frames + LED strips
  const glass = K.mat('#dff0f6', { rough: 0.05, metal: 0.1, opacity: 0.16 });
  for (let d = 0; d < doors; d++) {
    const x = -W / 2 + d * dw + dw / 2;
    f.add(K.mesh(new THREE.PlaneGeometry(dw - 0.06, Hh - 0.4), glass, { x, y: Hh / 2 + 0.01, z: Dp, cast: false, receive: false }));
    f.add(K.box(0.04, Hh - 0.38, 0.04, M.darkFrame, { x: x - dw / 2, y: 0.19, z: Dp - 0.01 }));
    f.add(K.box(0.012, Hh - 0.42, 0.012, M.led, { x: x - dw / 2 + 0.03, y: 0.21, z: Dp - 0.04, cast: false }));
    f.add(K.box(0.02, 0.5, 0.03, M.alu, { x: x + dw / 2 - 0.07, y: 0.8, z: Dp + 0.02 }));
  }
  return f;
}

function copyMachine(A, M) {
  const c = new THREE.Group();
  c.add(K.rbox(0.66, 0.95, 0.6, 0.03, K.mat('#e9eaec', { rough: 0.4 }), {}));
  c.add(K.box(0.6, 0.06, 0.55, K.mat('#d0d3d6', { rough: 0.4 }), { y: 0.95 }));
  for (let i = 0; i < 3; i++) c.add(K.box(0.6, 0.01, 0.01, K.mat('#9aa0a6'), { y: 0.2 + i * 0.22, z: 0.301 }));
  const scr = A.text([{ t: 'コピー・プリント', scale: 0.7 }, { t: 'タッチして ください', scale: 0.55 }], 0.26, 0.16, { bg: '#1e3a5a', fg: '#eaf6ff', radius: 0.06, glow: true });
  scr.position.set(0.12, 1.03, 0.1); scr.rotation.x = -1.0; c.add(scr);
  c.add(K.box(0.2, 0.05, 0.12, K.mat('#2a2d33'), { x: -0.18, y: 1.01, z: 0.12 }));
  const s = A.text([{ t: 'マルチコピー  COPY・FAX', scale: 0.8 }], 0.66, 0.12, { bg: '#2f6db3', fg: '#ffffff', radius: 0.2, glow: true });
  s.position.set(0, 1.85, -0.25); c.add(s);
  return c;
}

function atmMachine(A, M) {
  const a = new THREE.Group();
  a.add(K.rbox(0.56, 1.42, 0.52, 0.03, K.mat('#dfe4e8', { rough: 0.35 }), {}));
  a.add(K.box(0.565, 0.1, 0.525, K.mat('#c0392b', { rough: 0.4 }), { y: 1.25 }));
  a.add(K.box(0.565, 0.03, 0.525, K.mat('#f2c230', { rough: 0.4 }), { y: 1.22 }));
  a.add(K.box(0.5, 0.36, 0.2, K.mat('#2a2d33', { rough: 0.3 }), { y: 0.95, z: 0.16 }));
  const scr = A.text([{ t: 'いらっしゃいませ', scale: 0.6 }, { t: 'おひきだし', scale: 0.8 }, { t: 'おあずけいれ', scale: 0.8 }], 0.3, 0.22, { bg: '#e8f4ff', fg: '#1e3a5a', radius: 0.04, glow: true });
  scr.position.set(0, 1.15, 0.262); scr.rotation.x = -0.2; a.add(scr);
  a.add(K.box(0.18, 0.02, 0.12, K.mat('#3a3d42'), { x: 0.0, y: 0.9, z: 0.3 }));
  a.add(K.box(0.3, 0.03, 0.04, K.mat('#555'), { y: 0.72, z: 0.27 }));
  const s = A.text([{ t: 'ATM', scale: 1 }, { t: '24じかん', scale: 0.6 }], 0.5, 0.26, { bg: '#c0392b', fg: '#ffffff', radius: 0.12, glow: true });
  s.position.set(0, 1.85, -0.2); a.add(s);
  return a;
}

function iceFreezer(A, M) {
  const P = products(A);
  const f = new THREE.Group();
  f.add(K.box(1.5, 0.82, 0.72, M.white, {}));
  f.add(K.box(1.51, 0.12, 0.73, K.mat('#3a8fbf', { rough: 0.4 }), { y: 0.55 }));
  f.add(K.box(1.46, 0.02, 0.68, K.mat('#dff0f6', { rough: 0.05, opacity: 0.3 }), { y: 0.84, cast: false }));
  const r = K.rng(8);
  for (let i = 0; i < 14; i++) f.add(A.box(0.12, 0.06, 0.16, pick(P.sweet, r), A.solid(pick(['#3a8fbf', '#f6c6d3', '#f4f4f0', '#8a5a3a'], r)), { x: -0.62 + (i % 7) * 0.2, y: 0.74, z: -0.16 + Math.floor(i / 7) * 0.3, ry: (r() - 0.5) * 0.4, top: pick(P.sweet, r) }));
  const s = A.text([{ t: 'アイス', scale: 1 }], 0.5, 0.14, { bg: '#3a8fbf', fg: '#ffffff', radius: 0.2 });
  s.position.set(0, 0.6, 0.365); f.add(s);
  return f;
}

function wallShelf(A, M, L, seed) {
  const P = products(A);
  const w = new THREE.Group();
  const Hh = 1.7;
  w.add(K.box(L, Hh, 0.04, M.shelf, {}));
  for (const x of [-L / 2, L / 2]) w.add(K.box(0.04, Hh, 0.42, M.shelf, { x, z: 0.21 }));
  w.add(K.box(L, 0.12, 0.42, M.grey, { z: 0.21 }));
  const r = K.rng(seed);
  for (let lv = 0; lv < 5; lv++) {
    const y = 0.12 + lv * 0.31;
    w.add(K.box(L - 0.04, 0.02, 0.4, M.shelf, { y, z: 0.22 }));
    const strip = A.plane(L - 0.06, 0.022, P.price); strip.position.set(0, y + 0.01, 0.425); w.add(strip);
    for (let x = -L / 2 + 0.08; x < L / 2 - 0.08; x += 0.11) {
      const it = lv < 2 ? labelCyl(A, 0.033, 0.033, 0.12, pick(P.can, r), 8, '#c8ccd0') : A.box(0.1, 0.1 + r() * 0.1, 0.08, pick(P.daily, r), A.solid('#f4f4f0'));
      it.position.set(x + 0.05, y + 0.02, 0.3); w.add(it);
    }
  }
  const s = A.text([{ t: 'おさけ ・ にちようひん', scale: 0.8 }], 1.0, 0.13, { bg: '#2f8a62', fg: '#ffffff', radius: 0.2 });
  s.position.set(0, Hh + 0.12, 0.05); w.add(s);
  return w;
}

// =================================================================== shared local helpers (same as cafe.js)
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
  /** Text sign (a plane); goes to A.textAtlas when one is attached (keeps product faces and signs apart). */
  A.text = (lines, w, h, o = {}) => {
    const T = A.textAtlas || A;
    const ppm = o.ppm ?? 300;
    const r = T.region(w * ppm, h * ppm, (g, W, Hh) => {
      if (o.mirror) { g.translate(W, 0); g.scale(-1, 1); }
      drawLabel(g, W, Hh, lines, o);
    });
    return T.plane(w, h, r, o);
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

