// depato — ことば百貨店, basement food & wine floor (デパ地下). The learner stands at the wine counter:
// 西村 (clerk) behind it, the wine wall behind her (France / Italy / Japan sections, featured bottles with
// yen price cards on her side of the counter), the register at the counter's left end, a watch showcase at
// its right end. Within reach: the autumn gift table with ties (right) and the floor guide on the pillar
// (left). Around: pastry and wagashi shops, a deli island with evening time-sale, the escalators (far left),
// the elevator hall and restrooms (far right), an event corner with umbrellas and bags (behind).
// Learner stands at the origin looking toward -z.
import * as THREE from 'three';
import * as K from '../kit.js';

export const meta = { indoor: true, ambience: 'depato' };

export default function build({ setup }) {
  const time = setup.time || 'evening';
  const evening = time === 'evening' || time === 'night';
  const g = new THREE.Group();
  const props = {};
  const A = makeAtlas(1024);
  const T = makeAtlas(1024);
  A.textAtlas = T;
  T.overflow = A;
  const add = (o, x = 0, y = 0, z = 0, ry = 0, parent = g) => { o.position.set(x, y, z); o.rotation.y = ry; parent.add(o); return o; };

  const M = {
    floor: K.mat('#ffffff', { map: K.tileTex('#f1e9dc', '#e9dfcf', 6, [12, 7], '#d9ccb6'), rough: 0.16 }),
    ceil: K.mat('#f6f3ee', { rough: 1 }),
    wall: K.mat('#efe8dc', { rough: 0.85 }),
    cream: K.mat('#f6f0e6', { rough: 0.45 }),
    walnut: K.mat('#ffffff', { map: K.woodTex('#6a4330', [2, 2], 8), rough: 0.4 }),
    oak: K.mat('#ffffff', { map: K.woodTex('#b98b5e', [2, 1], 5), rough: 0.35 }),
    dark: K.mat('#3a2a22', { rough: 0.4 }),
    black: K.mat('#26262a', { rough: 0.35 }),
    gold: K.mat('#c9a253', { metal: 0.85, rough: 0.3 }),
    steel: K.mat('#c4c8cc', { metal: 0.8, rough: 0.25 }),
    glass: K.glassMat(),
    showGlass: K.mat('#e6f2f6', { rough: 0.04, metal: 0.1, opacity: 0.18 }),
    downlight: new THREE.MeshBasicMaterial({ color: '#fff6e6', toneMapped: false }),
    strip: new THREE.MeshBasicMaterial({ color: '#fff1d6', toneMapped: false }),
  };

  // ------------------------------------------------------------------ shell
  const X0 = -7.5; const X1 = 7.5; const ZN = -2.6; const ZS = 5.5; const H = 3.0;
  const W = X1 - X0; const D = ZS - ZN; const cx = 0; const cz = (ZN + ZS) / 2;
  add(K.mesh(new THREE.PlaneGeometry(W, D, 8, 6), M.floor, { rx: -Math.PI / 2, cast: false }), cx, 0, cz);
  add(K.mesh(new THREE.PlaneGeometry(W, D, 8, 6), M.ceil, { rx: Math.PI / 2, cast: false }), cx, H, cz);
  const wallSeg = (ax, az, bx, bz, y0 = 0, y1 = H, m = M.wall) => {
    const len = Math.hypot(bx - ax, bz - az);
    const w = K.mesh(new THREE.PlaneGeometry(len, y1 - y0), m, { cast: false });
    w.position.set((ax + bx) / 2, (y0 + y1) / 2, (az + bz) / 2);
    w.rotation.y = Math.atan2(-(bz - az), bx - ax);
    g.add(w);
    return w;
  };
  wallSeg(X0, ZN, X1, ZN); wallSeg(X1, ZN, X1, ZS); wallSeg(X1, ZS, X0, ZS); wallSeg(X0, ZS, X0, ZN);
  // dark floor border inlay + ceiling coves
  g.add(K.box(4.2, 0.004, 2.6, K.mat('#d6c7ae', { rough: 0.2 }), { x: 0, z: 0.1, cast: false }));
  g.add(K.box(4.0, 0.006, 2.4, K.mat('#efe6d6', { rough: 0.16 }), { x: 0, z: 0.1, cast: false }));
  // downlights + light strips
  for (let x = -6.5; x <= 6.6; x += 1.6) for (let z = -1.6; z <= 5.0; z += 1.6) {
    g.add(K.cyl(0.09, 0.09, 0.012, M.downlight, { x, y: H - 0.012, z, cast: false, receive: false }, 14));
  }
  const lights = [[0, 2.6, -1.2, 9, '#fff0d8'], [-3.8, 2.6, -0.8, 7, '#fff4e4'], [3.9, 2.6, -0.8, 7, '#fff4e4'], [-1.5, 2.6, 3.0, 6, '#fff4e4'], [4.2, 2.6, 3.2, 6, '#fff4e4'], [-6.3, 2.5, 1.0, 4, '#fff4e4'], [6.6, 2.5, 0.2, 4, '#fff4e4']];
  for (const [x, y, z, i, c] of lights) { const l = new THREE.PointLight(c, i, 8, 1.3); l.position.set(x, y, z); g.add(l); }
  g.add(new THREE.HemisphereLight('#fffaf2', '#d8cbb4', 0.9));

  // ------------------------------------------------------------------ the wine counter + clerk side
  const CX0 = -1.7; const CX1 = 1.7; const CZF = -0.55; const CZB = -1.15; const CH = 0.95;
  const cw = CX1 - CX0;
  g.add(K.box(cw, 0.12, CZF - CZB, M.dark, { z: (CZF + CZB) / 2 }));
  g.add(K.box(cw, CH - 0.17, 0.04, M.walnut, { y: 0.12, z: CZB + 0.02 }));
  for (const x of [CX0, 0, CX1]) g.add(K.box(0.05, CH - 0.17, CZF - CZB, M.walnut, { x: x === CX0 ? x + 0.025 : x === CX1 ? x - 0.025 : x, y: 0.12 }));
  g.add(K.mesh(new THREE.PlaneGeometry(cw - 0.05, CH - 0.17), M.showGlass, { y: 0.12 + (CH - 0.17) / 2, z: CZF, cast: false, receive: false }));
  g.add(K.box(cw + 0.04, 0.05, CZF - CZB + 0.04, M.walnut, { y: CH - 0.05, z: (CZF + CZB) / 2 }));
  g.add(K.box(cw - 0.1, 0.006, CZF - CZB - 0.06, M.showGlass, { y: CH - 0.003, z: (CZF + CZB) / 2, cast: false }));
  g.add(K.box(cw - 0.1, 0.01, 0.01, M.strip, { y: CH - 0.07, z: CZF - 0.03, cast: false }));
  // inside the showcase: gift boxes, wine glasses, openers
  g.add(K.box(cw - 0.1, 0.02, 0.5, M.cream, { y: 0.45, z: (CZF + CZB) / 2 }));
  const giftReg = T.region(120, 80, (c, w, h) => {
    c.fillStyle = '#f6efe2'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#7a2a3a'; c.fillRect(w * 0.45, 0, w * 0.1, h); c.fillRect(0, h * 0.42, w, h * 0.14);
    c.fillStyle = '#c9a253'; c.font = `700 14px ${K.JP_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('ギフト', w * 0.25, h * 0.2);
  });
  for (let i = 0; i < 5; i++) add(T.box(0.3, 0.1, 0.12, giftReg, T.solid('#f6efe2'), { top: giftReg }), -1.35 + i * 0.66, 0.47, -0.82, 0);
  for (let i = 0; i < 6; i++) add(wineGlass(M), -1.4 + i * 0.55, 0.13, -0.8);
  const pop = A.text([{ t: 'お歳暮・ギフト  うけたまわります', scale: 0.8 }], 1.2, 0.08, { bg: '#7a2a3a', fg: '#f6efe2', radius: 0.2 });
  add(pop, 0, 0.82, CZF + 0.006);

  // the wine wall (behind the clerk): France | Italy | Japan
  const sections = [
    { id: 'wine_fr', x: -1.25, label: 'フランス', sub: 'FRANCE', flag: ['#2b4a9a', '#ffffff', '#d9333a'], price: '4,800円', name: 'ボルドー 赤', glass: '#2a3a24', lab: '#f3ead6', foil: '#7a1a2a', ja: 'フランスの ワイン', en: 'French wine' },
    { id: 'wine_it', x: 0.0, label: 'イタリア', sub: 'ITALIA', flag: ['#2f8a4a', '#ffffff', '#d9333a'], price: '2,500円', name: 'トスカーナ 赤', glass: '#24331f', lab: '#e8dcc0', foil: '#1f3a6a', ja: 'イタリアの ワイン', en: 'Italian wine' },
    { id: 'wine_jp', x: 1.25, label: '日本', sub: 'やまなし', flag: ['#ffffff', '#d9333a', '#ffffff'], price: '1,900円', name: '山梨 白', glass: '#b8c48a', lab: '#fbf8f0', foil: '#c9a253', ja: 'にほんの ワイン', en: 'Japanese wine' },
  ];
  const featuredX = { wine_fr: -0.85, wine_it: 0.55, wine_jp: 1.05 };
  for (const s of sections) {
    const grp = new THREE.Group();
    const reg = bottleRegion(A, s);
    const regB = bottleRegion(A, { ...s, lab: s.id === 'wine_jp' ? '#e8f0d8' : '#d8c8a8', foil: s.id === 'wine_fr' ? '#2a2a2a' : s.foil });
    // cabinet
    const cab = new THREE.Group();
    cab.add(K.box(1.18, 2.3, 0.04, M.dark, { z: -0.17 }));
    for (const x of [-0.59, 0.59]) cab.add(K.box(0.03, 2.3, 0.38, M.walnut, { x }));
    cab.add(K.box(1.18, 0.12, 0.38, M.walnut, {}));
    cab.add(K.box(1.18, 0.08, 0.38, M.walnut, { y: 2.22 }));
    cab.add(K.box(1.1, 0.012, 0.012, M.strip, { y: 2.2, z: 0.17, cast: false }));
    for (let lv = 0; lv < 5; lv++) {
      const y = 0.12 + lv * 0.41;
      cab.add(K.box(1.14, 0.02, 0.36, M.oak, { y }));
      const n = 9;
      for (let i = 0; i < n; i++) {
        const b = wineBottle(A, lv % 2 === 0 ? reg : regB);
        b.position.set(-0.5 + i * 0.125, y + 0.02, 0.05);
        b.rotation.y = (i % 3) * 0.4;
        cab.add(b);
      }
      // price rail; the eye-level row carries the bottle's price
      const tag = lv === 3 ? priceRail(T, s.price, s.name) : priceRail(T, null);
      tag.position.set(0, y - 0.005, 0.185);
      cab.add(tag);
    }
    // header with flag
    const hd = T.region(360, 90, (c, w, h) => {
      c.fillStyle = '#3a2a22'; c.fillRect(0, 0, w, h);
      for (let k = 0; k < 3; k++) { c.fillStyle = s.flag[k]; c.fillRect(14 + k * 18, h * 0.28, 18, h * 0.44); }
      if (s.id === 'wine_jp') { c.fillStyle = '#ffffff'; c.fillRect(14, h * 0.28, 54, h * 0.44); c.fillStyle = '#d9333a'; c.beginPath(); c.arc(41, h / 2, 10, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = '#f6efe2'; c.font = `800 40px ${K.JP_FONT}`; c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillText(s.label, 86, h * 0.42);
      c.fillStyle = '#c9a253'; c.font = `700 18px ${K.JP_FONT}`; c.fillText(s.sub, 88 + c.measureText(s.label).width * 0 + 0, h * 0.82);
    });
    const hp = T.plane(1.1, 0.27, hd); hp.position.set(0, 2.45, -0.1); cab.add(hp);
    cab.position.set(s.x, 0, ZN + 0.2);
    grp.add(cab);
    // featured bottle on the clerk's side of the counter, with a price card facing the learner
    const feat = new THREE.Group();
    feat.add(K.cyl(0.07, 0.075, 0.025, M.walnut, {}, 14));
    const fb = wineBottle(A, reg); fb.position.y = 0.025; fb.scale.setScalar(1.05); feat.add(fb);
    const card = T.region(200, 130, (c, w, h) => {
      c.fillStyle = '#fffaf0'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#c9a253'; c.lineWidth = 4; c.strokeRect(4, 4, w - 8, h - 8);
      for (let k = 0; k < 3; k++) { c.fillStyle = s.flag[k]; c.fillRect(12 + k * 10, 14, 10, 16); }
      if (s.id === 'wine_jp') { c.fillStyle = '#fff'; c.fillRect(12, 14, 30, 16); c.strokeStyle = '#ccc'; c.lineWidth = 1; c.strokeRect(12, 14, 30, 16); c.fillStyle = '#d9333a'; c.beginPath(); c.arc(27, 22, 5, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = '#3a2a22'; c.font = `700 19px ${K.JP_FONT}`; c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillText(s.label, 50, 23);
      c.font = `700 17px ${K.JP_FONT}`; c.fillText(s.name, 14, 54);
      c.fillStyle = '#b5302a'; c.font = `800 40px ${K.JP_FONT}`; c.textAlign = 'center'; c.fillText(s.price, w / 2, 96);
    });
    const cp = T.plane(0.17, 0.11, card, { cast: true });
    cp.position.set(0, 0.07, 0.11); cp.rotation.x = -0.35; feat.add(cp);
    feat.add(K.box(0.16, 0.08, 0.01, M.gold, { y: 0.0, z: 0.1, rx: -0.35 }));
    feat.position.set(featuredX[s.id], CH, -1.07);
    g.add(grp);
    const p = K.prop(s.id, feat, { labelJa: s.ja, labelEn: s.en });
    g.add(p);
    props[s.id] = p;
  }
  // big lit "WINE" sign over the wall
  const ws = T.text([{ t: 'ワイン  WINE CELLAR', scale: 0.9 }], 2.4, 0.26, { bg: '#3a2a22', fg: '#e8c88a', radius: 0.1, glow: true });
  add(ws, 0, 2.78, ZN + 0.03);
  // register at the counter's left end (clerk side) + paper bags
  const reg = K.prop('register', posRegister(T, M), { labelJa: 'レジ', labelEn: 'register' });
  add(reg, -1.38, CH, -0.95, 0.15);
  for (let i = 0; i < 3; i++) add(paperBag(T, i === 1 ? 0.75 : 0.85, M), -1.95 - i * 0.03, 0, -1.6 + i * 0.12, 0.3 + i * 0.2);
  for (let i = 0; i < 6; i++) add(K.box(0.32, 0.006, 0.12, M.cream, {}), 1.45, CH + i * 0.006, -0.85, 0.1); // folded bags
  // tasting tray in front of the clerk
  const tray = new THREE.Group();
  tray.add(K.box(0.3, 0.012, 0.14, M.walnut, {}));
  for (let i = 0; i < 3; i++) { const wg = wineGlass(M); wg.scale.setScalar(0.75); wg.position.set(-0.09 + i * 0.09, 0.012, 0); tray.add(wg); }
  for (let i = 0; i < 3; i++) tray.add(K.cyl(0.018, 0.018, 0.012, K.mat(['#6a1a2a', '#7a1f2f', '#e8dca0'][i], { rough: 0.1 }), { x: -0.09 + i * 0.09, y: 0.058 }, 8));
  const tc = T.text([{ t: 'ご試飲 どうぞ', scale: 0.9 }], 0.16, 0.05, { bg: '#fffaf0', fg: '#7a2a3a', border: '#c9a253', radius: 0.15 });
  const tcg = new THREE.Group(); tc.position.y = 0.03; tc.rotation.x = -0.4; tcg.add(tc); tcg.position.set(0, 0.012, 0.09); tray.add(tcg);
  add(tray, -0.22, CH, -0.82, 0.05);
  // watch showcase at the right end (clerk side)
  const watch = K.prop('watch_case', watchCase(T, M), { labelJa: 'とけいの ケース', labelEn: 'watch showcase' });
  add(watch, 2.2, 0, -1.1, 0);

  // ------------------------------------------------------------------ within reach: gift table with ties, floor guide pillar
  const gt = new THREE.Group();
  gt.add(K.box(0.8, 0.78, 0.5, M.cream, {}));
  gt.add(K.box(0.84, 0.03, 0.54, M.walnut, { y: 0.78 }));
  add(gt, 0.92, 0, 0.02, 0.2);
  const tieBlue = K.prop('tie_blue', tieBox(T, '#2f4f8f', '#9fb6dc'), { labelJa: 'あおい ネクタイ', labelEn: 'blue tie' });
  add(tieBlue, 0.66, 0.81, -0.08, 0.35);
  const tieRed = K.prop('tie_red', tieBox(T, '#a8323a', '#e8b0a0'), { labelJa: 'あかい ネクタイ', labelEn: 'red tie' });
  add(tieRed, 0.93, 0.81, 0.13, 0.3);
  add(tieBox(T, '#3f6b4e', '#c9d8a0'), 1.13, 0.81, -0.12, 0.15);
  const tsign = T.text([{ t: '秋の ギフト', scale: 0.7, color: '#7a2a3a' }, { t: 'ネクタイ 5,500円〜', scale: 0.8 }], 0.3, 0.13, { bg: '#fffaf0', fg: '#333', border: '#c9a253', radius: 0.1 });
  const tsg = new THREE.Group(); tsign.position.y = 0.07; tsign.rotation.x = -0.2; tsg.add(tsign);
  add(tsg, 1.2, 0.81, 0.18, -0.6);
  add(paperBag(T, 0.8, M), 1.3, 0, 0.5, -0.8);
  // pillar with the floor guide (faces the learner side)
  const pil = new THREE.Group();
  pil.add(K.box(0.6, H, 0.6, K.mat('#e8e0d2', { rough: 0.25 }), {}));
  pil.add(K.box(0.62, 0.1, 0.62, M.dark, {}));
  for (const [x, z, ry] of [[0, 0.301, 0], [0, -0.301, Math.PI], [-0.301, 0, -Math.PI / 2]]) {
    const b1 = T.text([{ t: 'B1', scale: 1 }], 0.3, 0.18, { bg: '#3a2a22', fg: '#e8c88a', radius: 0.1 });
    add(b1, x, 2.5, z, ry, pil);
  }
  add(pil, -1.15, 0, 0.42);
  const fg = K.prop('floor_guide', floorGuide(T, M), { labelJa: 'フロアガイド', labelEn: 'floor guide' });
  add(fg, -0.84, 0, 0.42, Math.PI / 2);

  // ------------------------------------------------------------------ shops along the north wall
  add(shopFront(A, T, M, 'pastry'), -3.9, 0, ZN);
  add(shopFront(A, T, M, 'wagashi'), 4.1, 0, ZN);
  // deli island behind-left with the evening time sale
  add(deliIsland(A, T, M, evening), -2.5, 0, 2.95);
  add(shopFront(A, T, M, 'bakery', 0.95), -4.6, 0, ZS, Math.PI);
  add(shopFront(A, T, M, 'tea', 0.95), -1.2, 0, ZS, Math.PI);
  // ------------------------------------------------------------------ far left: escalators
  const esc = K.prop('escalator', escalators(T, M), { labelJa: 'エスカレーター', labelEn: 'escalator' });
  add(esc, X0 + 2.1, 0, 0.9, Math.PI / 2);
  // ------------------------------------------------------------------ far right: elevators + restroom corridor
  const ev = K.prop('elevator', elevators(T, M), { labelJa: 'エレベーター', labelEn: 'elevator' });
  add(ev, X1 - 0.02, 0, -0.8, -Math.PI / 2);
  const corr = new THREE.Group();
  corr.add(K.box(1.4, 2.4, 0.02, K.mat('#8a8178', { rough: 0.9 }), { z: -0.02 }));
  corr.add(K.box(0.08, 2.45, 0.1, M.dark, { x: -0.74 }));
  corr.add(K.box(0.08, 2.45, 0.1, M.dark, { x: 0.74 }));
  corr.add(K.box(1.56, 0.08, 0.1, M.dark, { y: 2.4 }));
  add(corr, X1 - 0.02, 0, 1.6, -Math.PI / 2);
  const wc = K.prop('toilet_sign', T.text([{ t: 'お手洗い  →', scale: 0.9 }, { t: 'RESTROOM', scale: 0.5 }], 0.9, 0.3, { bg: '#3a2a22', fg: '#ffffff', radius: 0.1, glow: true }), { labelJa: 'おてあらい', labelEn: 'restroom sign' });
  add(wc, X1 - 0.03, 2.62, 1.6, -Math.PI / 2);
  // ------------------------------------------------------------------ behind: event corner (umbrellas & bags)
  const banner = T.text([{ t: '秋の ギフト フェア', scale: 0.9 }, { t: 'かさ ・ バッグ ・ ハンカチ', scale: 0.6 }], 2.2, 0.42, { bg: '#7a2a3a', fg: '#f6efe2', radius: 0.06 });
  const bnG = new THREE.Group(); bnG.add(banner);
  bnG.add(K.box(0.01, 0.4, 0.01, M.steel, { x: -0.9, y: 0.2 })); bnG.add(K.box(0.01, 0.4, 0.01, M.steel, { x: 0.9, y: 0.2 }));
  add(bnG, 4.0, 2.4, 2.4, Math.PI);
  const um = K.prop('umbrella_rack', umbrellaRack(T, M), { labelJa: 'かさ', labelEn: 'umbrella rack' });
  add(um, 5.0, 0, 3.5, Math.PI + 0.5);
  const bs = K.prop('bag_shelf', bagShelf(T, M), { labelJa: 'バッグの たな', labelEn: 'bag shelf' });
  add(bs, 2.4, 0, ZS - 0.02, Math.PI);
  add(K.plant(1.3, 7), 6.7, 0, 4.8);
  add(K.plant(1.3, 13), X0 + 0.5, 0, 4.9);
  // big logo on the south wall (above the bag shelf)
  const logo = T.text([{ t: 'ことば百貨店', scale: 1 }, { t: 'KOTOBA DEPARTMENT STORE', scale: 0.4 }], 2.2, 0.5, { bg: null, fg: '#7a5a3a', ppm: 220 });
  add(logo, 4.9, 2.45, ZS - 0.02, Math.PI);
  // benches with shopping bags (a rest spot)
  const bench = new THREE.Group();
  bench.add(K.box(1.4, 0.06, 0.45, M.oak, { y: 0.42 }));
  for (const x of [-0.6, 0.6]) bench.add(K.box(0.06, 0.42, 0.4, M.steel, { x }));
  add(bench, X1 - 0.5, 0, 3.6, -Math.PI / 2);
  add(paperBag(T, 0.85, M), X1 - 0.5, 0.48, 3.2, -1.2);

  for (const o of [reg, watch, tieBlue, tieRed, fg, esc, ev, wc, um, bs]) props[o.userData.propId] = o;
  atlasize(g, A);

  const clerkPos = { x: 0, z: -1.48 };
  const npc1Pos = { x: -0.95, z: -0.62 };
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
    radius: 8,
  });
}

// =================================================================== local props
/** Closed pie-slice solid (tip at the origin, pointing -z), bottom at y=0. */
function sliceGeo(r = 0.075, h = 0.07, ang = Math.PI / 3) {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(Math.sin(ang / 2) * r, Math.cos(ang / 2) * r); s.lineTo(-Math.sin(ang / 2) * r, Math.cos(ang / 2) * r); s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  if (!geo.index) geo.setIndex([...Array(geo.attributes.position.count).keys()]);
  return geo;
}

function bottleRegion(A, s) {
  return A.region(64, 96, (c, w, h) => {
    // v (bottom→top) = profile index / 9; canvas y = (1 - v) * h
    const y = (v) => (1 - v) * h;
    c.fillStyle = s.glass; c.fillRect(0, 0, w, h);
    c.fillStyle = s.lab; c.fillRect(0, y(3 / 9), w, y(2 / 9) - y(3 / 9));
    c.fillStyle = s.foil; c.fillRect(0, y(1), w, y(6 / 9) - y(1));
    c.fillStyle = s.flag ? s.flag[s.id === 'wine_jp' ? 1 : 2] : '#7a2a3a';
    c.fillRect(w * 0.2, y(3 / 9) + 2, w * 0.25, 3);
    c.fillStyle = '#3a2a22'; c.fillRect(w * 0.15, y(3 / 9) + 6, w * 0.35, 2); c.fillRect(w * 0.15, y(3 / 9) + 9, w * 0.25, 2);
    c.fillRect(w * 0.65, y(3 / 9) + 6, w * 0.2, 2);
  });
}

const BOTTLE_PROFILE = [[0, 0], [0.036, 0.002], [0.037, 0.03], [0.037, 0.17], [0.037, 0.2], [0.03, 0.235], [0.015, 0.265], [0.014, 0.3], [0.0145, 0.335], [0, 0.336]].map(([x, y]) => new THREE.Vector2(x, y));
const bottleGeoCache = new Map();
function wineBottle(A, region) {
  const key = `${region.u0},${region.v0}`;
  if (!bottleGeoCache.has(key)) {
    const geo = new THREE.LatheGeometry(BOTTLE_PROFILE, 7);
    A.remap(geo, region);
    bottleGeoCache.set(key, geo);
  }
  return K.mesh(bottleGeoCache.get(key), A.bucket.gloss, {});
}

function priceRail(T, price, name) {
  const r = T.region(price ? 340 : 200, 22, (c, w, h) => {
    c.fillStyle = '#fbf6ec'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#3a2a22'; c.font = `700 14px ${K.JP_FONT}`; c.textBaseline = 'middle';
    if (price) {
      for (let k = 0; k < 3; k++) {
        const x = 6 + k * 112;
        c.fillStyle = '#ffffff'; c.fillRect(x, 1, 104, h - 2);
        c.fillStyle = '#b5302a'; c.font = `800 15px ${K.JP_FONT}`; c.textAlign = 'center'; c.fillText(price, x + 52, h / 2);
      }
    } else {
      for (let k = 0; k < 4; k++) { c.fillStyle = '#e8dcc6'; c.fillRect(6 + k * 50, 3, 40, h - 6); }
    }
  });
  return T.plane(1.12, 0.035, r);
}

function wineGlass(M) {
  const w = new THREE.Group();
  const gl = K.mat('#eef6f8', { rough: 0.05, opacity: 0.45 });
  w.add(K.cyl(0.03, 0.03, 0.004, gl, {}, 10));
  w.add(K.cyl(0.004, 0.004, 0.08, gl, {}, 6));
  w.add(K.cyl(0.035, 0.02, 0.07, gl, { y: 0.08 }, 10));
  return w;
}

function posRegister(T, M) {
  const r = new THREE.Group();
  r.add(K.box(0.34, 0.08, 0.3, K.mat('#2e2e33', { rough: 0.35 }), {}));
  r.add(K.box(0.04, 0.2, 0.04, K.mat('#2e2e33'), { y: 0.08, z: -0.05 }));
  const scrG = new THREE.Group();
  scrG.add(K.box(0.3, 0.2, 0.025, K.mat('#2e2e33'), { y: -0.1 }));
  const sc = T.text([{ t: 'ことば百貨店', scale: 0.6 }, { t: 'ワイン  ¥4,800', scale: 0.8 }], 0.26, 0.16, { bg: '#eaf2ff', fg: '#1e3a5a', radius: 0.04, glow: true });
  sc.position.z = -0.014; sc.rotation.y = Math.PI; scrG.add(sc);
  scrG.position.set(0, 0.38, -0.05); scrG.rotation.x = 0.25;
  r.add(scrG);
  r.add(K.box(0.11, 0.05, 0.15, K.mat('#1f1f22', { rough: 0.3 }), { x: 0.2, y: 0, z: 0.08 }));
  r.add(K.box(0.2, 0.012, 0.13, K.mat('#7a2a3a', { rough: 0.6 }), { x: -0.06, y: 0.08, z: 0.12 }));
  return r;
}

function paperBag(T, h, M) {
  const b = new THREE.Group();
  const face = T.region(110, 140, (c, w, hh) => {
    c.fillStyle = '#f4ecdc'; c.fillRect(0, 0, w, hh);
    c.fillStyle = '#2f5a4a'; c.fillRect(0, hh * 0.78, w, hh * 0.22);
    c.fillStyle = '#2f5a4a'; c.font = `800 15px ${K.JP_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('ことば', w / 2, hh * 0.38); c.fillText('百貨店', w / 2, hh * 0.52);
    c.strokeStyle = '#c9a253'; c.lineWidth = 2; c.beginPath(); c.arc(w / 2, hh * 0.45, 30, 0, Math.PI * 2); c.stroke();
  });
  const w = 0.32 * h; const d = 0.12 * h; const hh = 0.42 * h;
  b.add(T.box(w, hh, d, face, T.solid('#f4ecdc'), { back: face, top: T.solid('#e8dcc6') }));
  const hm = K.mat('#2f5a4a', { rough: 0.6 });
  for (const z of [-d / 2 + 0.01, d / 2 - 0.01]) b.add(K.mesh(new THREE.TorusGeometry(w * 0.22, 0.004, 4, 10, Math.PI), hm, { y: hh, z }));
  return b;
}

function watchCase(T, M) {
  const wc = new THREE.Group();
  wc.add(K.box(0.7, 0.75, 0.8, M.walnut, {}));
  wc.add(K.box(0.68, 0.25, 0.78, M.showGlass, { y: 0.75, cast: false }));
  wc.add(K.box(0.72, 0.03, 0.82, M.walnut, { y: 1.0 }));
  wc.add(K.box(0.64, 0.02, 0.74, K.mat('#2a2a32', { rough: 0.9 }), { y: 0.75 }));
  wc.add(K.box(0.6, 0.006, 0.006, M.strip, { y: 0.98, z: 0.36, cast: false }));
  for (let i = 0; i < 6; i++) {
    const w = new THREE.Group();
    w.add(K.cyl(0.022, 0.022, 0.008, i % 2 ? M.gold : M.steel, {}, 14));
    w.add(K.cyl(0.018, 0.018, 0.002, K.mat('#f4f1ea', { rough: 0.3 }), { y: 0.008 }, 12));
    w.add(K.box(0.018, 0.004, 0.09, K.mat(i % 3 === 0 ? '#5a3a22' : '#9aa0a6', { rough: 0.5 }), { y: -0.002 }));
    w.position.set(-0.22 + (i % 3) * 0.22, 0.77, -0.15 + Math.floor(i / 3) * 0.3);
    wc.add(w);
  }
  const s = T.text([{ t: 'うでどけい', scale: 0.8 }, { t: 'WATCH', scale: 0.5 }], 0.28, 0.12, { bg: '#2a2a32', fg: '#e8c88a', radius: 0.1 });
  const sg = new THREE.Group(); s.position.y = 0.06; s.rotation.x = -0.3; sg.add(s);
  sg.position.set(-0.18, 1.03, 0.28); sg.rotation.y = 0.5;
  wc.add(sg);
  return wc;
}

function tieBox(T, col, stripe) {
  const t = new THREE.Group();
  t.add(K.box(0.12, 0.025, 0.34, K.mat('#f6f0e6', { rough: 0.5 }), {}));
  const tie = T.region(40, 140, (c, w, h) => {
    c.fillStyle = col; c.fillRect(0, 0, w, h);
    c.strokeStyle = stripe; c.lineWidth = 4;
    for (let y = -40; y < h + 40; y += 16) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y + 20); c.stroke(); }
  });
  const s = new THREE.Shape();
  s.moveTo(-0.022, 0.14); s.lineTo(0.022, 0.14); s.lineTo(0.03, -0.11); s.lineTo(0, -0.15); s.lineTo(-0.03, -0.11); s.closePath();
  const geo = new THREE.ShapeGeometry(s);
  const pos = geo.attributes.position; const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, tie.u0 + (pos.getX(i) / 0.06 + 0.5) * (tie.u1 - tie.u0), tie.v0 + (pos.getY(i) / 0.3 + 0.5) * (tie.v1 - tie.v0));
  const m = K.mesh(geo, T.material, { y: 0.027, rx: -Math.PI / 2 });
  t.add(m);
  t.add(K.box(0.05, 0.02, 0.04, K.mat(col, { rough: 0.5 }), { y: 0.027, z: -0.14 }));
  return t;
}

function floorGuide(T, M) {
  const f = new THREE.Group();
  const w = 0.5; const h = 1.02;
  f.add(K.box(w + 0.04, h + 0.04, 0.03, M.dark, { y: 1.4 - (h + 0.04) / 2 }));
  const r = T.region(w * 560, h * 560, (c, W, Hh) => {
    c.fillStyle = '#fbf7ef'; c.fillRect(0, 0, W, Hh);
    c.fillStyle = '#3a2a22'; c.fillRect(0, 0, W, 64);
    c.fillStyle = '#e8c88a'; c.font = `800 30px ${K.JP_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('フロアガイド', W / 2, 26); c.font = `700 14px ${K.JP_FONT}`; c.fillText('FLOOR GUIDE', W / 2, 52);
    const floors = [['7F', 'レストラン'], ['6F', 'こども服・おもちゃ'], ['5F', 'かぐ・しょっき'], ['4F', 'くつ・しんし服'], ['3F', 'ふじん服'], ['2F', 'バッグ・アクセサリー'], ['1F', 'けしょうひん'], ['B1', '食品・ワイン']];
    const rowH = (Hh - 90) / floors.length;
    floors.forEach(([fl, name], i) => {
      const y = 78 + i * rowH;
      const here = fl === 'B1';
      if (here) { c.fillStyle = '#f6e3b8'; c.fillRect(6, y, W - 12, rowH - 6); }
      c.fillStyle = here ? '#b5302a' : '#2f5a4a'; c.fillRect(12, y + 4, 62, rowH - 14);
      c.fillStyle = '#ffffff'; c.font = `800 26px ${K.JP_FONT}`; c.textAlign = 'center'; c.fillText(fl, 43, y + rowH / 2 - 2);
      c.fillStyle = '#3a2a22'; c.font = `700 ${name.length > 7 ? 19 : 23}px ${K.JP_FONT}`; c.textAlign = 'left'; c.fillText(name, 86, y + rowH / 2 - 2);
      if (here) { c.fillStyle = '#b5302a'; c.font = `800 15px ${K.JP_FONT}`; c.textAlign = 'right'; c.fillText('いま ここ', W - 14, y + rowH / 2 - 2); }
      c.fillStyle = 'rgba(58,42,34,0.18)'; c.fillRect(12, y + rowH - 4, W - 24, 2);
    });
  });
  const p = T.plane(w, h, r); p.position.set(0, 1.4 - (h + 0.04) / 2, 0.017); f.add(p);
  return f;
}

function shopFront(A, T, M, kind, depth = 1.35) {
  const s = new THREE.Group();
  const pastry = kind === 'pastry' || kind === 'bakery';
  const shopName = { pastry: ['パティスリー ことり', '洋菓子'], bakery: ['ベーカリー こむぎ', 'パン'], wagashi: ['和菓子  ことば屋', ''], tea: ['日本茶  みどり園', ''] }[kind];
  const Wd = 3.0;
  // back wall shelves with gift boxes
  s.add(K.box(Wd, 2.2, 0.35, pastry ? K.mat('#f3e6e0', { rough: 0.6 }) : K.mat('#ffffff', { map: K.woodTex('#c9a27a', [2, 1], 6), rough: 0.5 }), { z: 0.175 }));
  const boxReg = T.region(100, 70, (c, w, h) => {
    c.fillStyle = pastry ? '#f6d8dc' : '#e8e0c8'; c.fillRect(0, 0, w, h);
    c.fillStyle = pastry ? '#b5452c' : '#3f6b4e'; c.fillRect(0, h * 0.4, w, h * 0.2);
    c.fillStyle = pastry ? '#7a2a3a' : '#5a3a22'; c.font = `700 14px ${K.JP_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText({ pastry: 'ことり', bakery: 'こむぎ', wagashi: 'ことば屋', tea: 'みどり園' }[kind], w / 2, h * 0.22);
  });
  for (let lv = 0; lv < 3; lv++) for (let i = 0; i < 8; i++) s.add(T.box(0.28, 0.12, 0.2, boxReg, T.solid(pastry ? '#f6d8dc' : '#e8e0c8'), { x: -1.25 + i * 0.36, y: 0.9 + lv * 0.35, z: 0.42 }));
  for (let lv = 0; lv < 3; lv++) s.add(K.box(Wd - 0.1, 0.02, 0.3, pastry ? M.cream : M.oak, { y: 0.88 + lv * 0.35, z: 0.45 }));
  // sign / noren
  if (pastry) {
    const sg = T.text([{ t: shopName[0], scale: 0.9 }, { t: shopName[1], scale: 0.6 }], 1.8, 0.36, { bg: kind === 'bakery' ? '#f2dcb0' : '#f6d8dc', fg: '#7a2a3a', radius: 0.15, glow: true, ppm: 240 });
    sg.position.set(0, 2.55, 0.36); s.add(sg);
  } else {
    const nr = T.text([{ t: shopName[0], scale: 0.9 }], 2.4, 0.42, { bg: kind === 'tea' ? '#3f6b4e' : '#2f3a5a', fg: '#f6efe2', radius: 0.02, ppm: 220 });
    nr.position.set(0, 2.5, 0.38); s.add(nr);
    for (let i = 1; i < 4; i++) s.add(K.box(0.012, 0.3, 0.012, K.mat('#f6efe2'), { x: -1.2 + i * 0.6, y: 2.29, z: 0.39 }));
  }
  // refrigerated showcase counter
  const sc = new THREE.Group();
  sc.add(K.box(Wd - 0.2, 0.8, 0.6, M.cream, {}));
  sc.add(K.box(Wd - 0.2, 0.06, 0.62, pastry ? K.mat('#c98a9a', { rough: 0.4 }) : M.dark, { y: 0.8 }));
  sc.add(K.mesh(new THREE.PlaneGeometry(Wd - 0.22, 0.36), M.showGlass, { y: 1.04, z: 0.18, rx: -0.5, cast: false, receive: false }));
  sc.add(K.box(Wd - 0.2, 0.012, 0.3, M.showGlass, { y: 1.2, z: -0.1, cast: false }));
  sc.add(K.box(Wd - 0.25, 0.008, 0.008, M.strip, { y: 1.18, z: 0.0, cast: false }));
  const r = K.rng(pastry ? 3 : 8);
  for (let i = 0; i < 16; i++) {
    const x = -1.25 + (i % 8) * 0.36; const z = i < 8 ? 0.1 : -0.12;
    if (kind === 'bakery') {
      const col = ['#d9a050', '#e8c547', '#b5652c', '#e0b070', '#c98a4a'][i % 5];
      for (let k = 0; k < 3; k++) { const m = K.mesh(new THREE.SphereGeometry(0.045, 8, 6), K.mat(col, { rough: 0.7 }), { x: x - 0.08 + k * 0.08, y: 0.9, z }); m.scale.set(1.2, 0.6, 0.9); sc.add(m); }
    } else if (kind === 'tea') {
      const col = ['#3f6b4e', '#5f8f55', '#7a5a3a', '#c9a253', '#2f4a3a'][i % 5];
      for (let k = 0; k < 2; k++) sc.add(K.cyl(0.04, 0.04, 0.12, K.mat(col, { rough: 0.4 }), { x: x - 0.05 + k * 0.1, y: 0.85, z }, 10));
    } else if (pastry) {
      const col = ['#fbf6ee', '#4a2a1a', '#f1d9a0', '#c9925a', '#f6c6d3'][i % 5];
      for (let k = 0; k < 3; k++) {
        const slice = K.mesh(sliceGeo(0.06, 0.05, Math.PI / 3), K.mat(col, { rough: 0.6 }), { x: x - 0.08 + k * 0.08, y: 0.86, z: z + 0.03 });
        sc.add(slice);
        sc.add(K.mesh(new THREE.SphereGeometry(0.01, 5, 4), K.mat(k % 2 ? '#d93a3a' : '#f2e6d0'), { x: x - 0.08 + k * 0.08 + 0.02, y: 0.93, z: z + 0.02 }));
      }
    } else {
      const col = ['#f6c6d3', '#8fbf6a', '#f4f1ea', '#5a3a2a', '#e8c070'][i % 5];
      for (let k = 0; k < 3; k++) { const m = K.mesh(new THREE.SphereGeometry(0.03, 8, 6), K.mat(col, { rough: 0.7 }), { x: x - 0.08 + k * 0.08, y: 0.885, z }); m.scale.set(1, 0.65, 1); sc.add(m); }
    }
    const tag = T.text([{ t: `${({ pastry: 380, bakery: 180, wagashi: 220, tea: 980 })[kind] + Math.floor(r() * 8) * 20}円`, scale: 0.9 }], 0.09, 0.04, { bg: '#ffffff', fg: '#b5302a', radius: 0.2, ppm: 400 });
    tag.position.set(x, 0.86, z + 0.1); tag.rotation.x = -0.6; sc.add(tag);
  }
  sc.add(K.box(Wd - 0.2, 0.012, 0.5, M.cream, { y: 0.84 }));
  sc.position.z = depth;
  s.add(sc);
  return s;
}

function deliIsland(A, T, M, evening) {
  const d = new THREE.Group();
  const L = 3.0;
  d.add(K.box(L, 0.8, 1.0, M.cream, {}));
  d.add(K.box(L + 0.04, 0.05, 1.04, M.dark, { y: 0.8 }));
  d.add(K.box(L - 0.1, 0.01, 0.9, M.showGlass, { y: 1.15, cast: false }));
  for (const z of [-0.47, 0.47]) d.add(K.mesh(new THREE.PlaneGeometry(L - 0.1, 0.32), M.showGlass, { y: 1.0, z, rx: z > 0 ? -0.35 : 0.35, ry: z > 0 ? 0 : Math.PI, cast: false, receive: false }));
  const foods = [['#c47a2c', '#e8c070'], ['#5f9a50', '#f2d9a0'], ['#d9433a', '#f4f1ea'], ['#e8a33c', '#7a4a28'], ['#f4f1ea', '#e86a6a'], ['#8a4a2a', '#5f9a50']].map(([a, b], i) => T.region(90, 60, (c, w, h) => {
    c.fillStyle = '#f8f6f0'; c.fillRect(0, 0, w, h);
    const r = K.rng(i + 3);
    for (let k = 0; k < 26; k++) { c.fillStyle = r() > 0.5 ? a : b; c.beginPath(); c.arc(6 + r() * (w - 12), 6 + r() * (h - 12), 5 + r() * 5, 0, Math.PI * 2); c.fill(); }
  }));
  for (let i = 0; i < 16; i++) {
    const x = -1.3 + (i % 8) * 0.37; const z = i < 8 ? 0.2 : -0.2;
    d.add(T.box(0.32, 0.05, 0.3, foods[(i * 5) % foods.length], T.solid('#2a2a2a'), { x, y: 0.82, z, top: foods[(i * 5) % foods.length] }));
  }
  const sg = T.text([{ t: 'お惣菜', scale: 1 }, { t: 'DELI', scale: 0.5 }], 1.0, 0.3, { bg: '#5a3a22', fg: '#f6efe2', radius: 0.1 });
  const sgG = new THREE.Group(); sgG.add(sg); sgG.add(K.box(0.01, 0.6, 0.01, M.steel, { y: 0.15 }));
  sgG.position.set(0, 2.25, 0); sgG.rotation.y = Math.PI * 0.85;
  d.add(sgG);
  if (evening) {
    const ts = T.text([{ t: 'タイムセール', scale: 0.9 }, { t: '19:00〜 2わりびき', scale: 0.65 }], 0.6, 0.24, { bg: '#e84c3d', fg: '#ffffff', radius: 0.1 });
    ts.position.set(-0.8, 1.32, 0.0); ts.rotation.y = Math.PI * 0.9; d.add(ts);
    ts.add(K.box(0.008, 0.18, 0.008, M.steel, { y: -0.3 }));
  }
  return d;
}

function escalators(T, M) {
  const e = new THREE.Group();
  const rise = 3.0; const run = 4.2; const ang = Math.atan2(rise, run); const len = Math.hypot(rise, run);
  const side = K.mat('#d9d4cc', { rough: 0.3, metal: 0.2 });
  const rail = K.mat('#1f1f22', { rough: 0.4 });
  const stepReg = T.region(64, 256, (c, w, h) => {
    c.fillStyle = '#5a5e64'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) { c.fillStyle = '#3a3e44'; c.fillRect(0, y, w, 2); }
    c.fillStyle = '#f2c230'; c.fillRect(0, 0, 4, h); c.fillRect(w - 4, 0, 4, h);
  });
  for (const [x, up] of [[-0.55, true], [0.55, false]]) {
    const band = new THREE.Group();
    const steps = T.plane(0.9, len, stepReg, { receive: true });
    steps.rotation.x = -Math.PI / 2 + ang; steps.position.set(0, rise / 2, 0);
    band.add(steps);
    for (const sx of [-0.5, 0.5]) {
      const panel = K.box(0.08, 1.0, len, side, { x: sx, y: rise / 2 - 0.5, rx: ang });
      band.add(panel);
      const glassP = K.box(0.02, 0.85, len, M.showGlass, { x: sx, y: rise / 2 + 0.4, rx: ang, cast: false });
      band.add(glassP);
      band.add(K.mesh(new THREE.BoxGeometry(0.08, 0.06, len), rail, { x: sx, y: rise / 2 + 0.88, rx: ang }));
    }
    // flat landing at the bottom
    band.add(K.box(1.0, 0.04, 1.0, K.mat('#9aa0a6', { metal: 0.6, rough: 0.3 }), { y: 0, z: run / 2 + 0.5 }));
    band.position.x = x;
    e.add(band);
    const arrow = T.text([{ t: up ? '↑ のぼり' : '↓ くだり', scale: 0.8 }], 0.5, 0.12, { bg: '#2f5a4a', fg: '#ffffff', radius: 0.2 });
    arrow.position.set(x, 1.25, run / 2 + 0.06); e.add(arrow);
  }
  // truss under the slope and the ceiling opening edge
  e.add(K.box(2.3, 0.5, len, side, { y: rise / 2 - 0.62, rx: ang }));
  e.add(K.box(2.5, 0.25, 0.3, side, { y: rise - 0.25, z: -run / 2 }));
  const sg = T.text([{ t: 'エスカレーター', scale: 0.9 }, { t: '1F〜7F', scale: 0.6 }], 1.3, 0.32, { bg: '#3a2a22', fg: '#ffffff', radius: 0.1, glow: true });
  sg.position.set(0, 2.62, run / 2 + 0.5); e.add(sg);
  e.add(K.box(0.01, 0.4, 0.01, M.steel, { x: -0.5, y: 2.78, z: run / 2 + 0.5 }));
  e.add(K.box(0.01, 0.4, 0.01, M.steel, { x: 0.5, y: 2.78, z: run / 2 + 0.5 }));
  return e;
}

function elevators(T, M) {
  const e = new THREE.Group();
  e.add(K.box(3.2, 2.6, 0.04, K.mat('#e2d8c6', { rough: 0.5 }), { z: -0.02 }));
  for (const x of [-0.8, 0.8]) {
    e.add(K.box(1.2, 2.25, 0.06, M.dark, { x }));
    e.add(K.box(0.52, 2.1, 0.07, M.steel, { x: x - 0.27 }));
    e.add(K.box(0.52, 2.1, 0.07, M.steel, { x: x + 0.27 }));
    const ind = T.text([{ t: '▲ B1', scale: 0.9 }], 0.3, 0.1, { bg: '#1a1a1e', fg: '#ffb84a', radius: 0.1, glow: true });
    ind.position.set(x, 2.38, 0.04); e.add(ind);
  }
  e.add(K.box(0.1, 0.2, 0.03, M.steel, { x: 0, y: 1.0 }));
  const sg = T.text([{ t: 'エレベーター', scale: 0.9 }, { t: 'ELEVATOR', scale: 0.5 }], 1.2, 0.3, { bg: '#3a2a22', fg: '#ffffff', radius: 0.1, glow: true });
  sg.position.set(0, 2.72, 0.04); e.add(sg);
  return e;
}

function umbrellaRack(T, M) {
  const r = new THREE.Group();
  r.add(K.cyl(0.35, 0.38, 0.08, M.walnut, {}, 20));
  r.add(K.cyl(0.03, 0.03, 1.1, M.steel, {}, 8));
  r.add(K.mesh(new THREE.TorusGeometry(0.28, 0.012, 6, 24), M.steel, { y: 0.7, rx: Math.PI / 2 }));
  const cols = ['#2f4f8f', '#a8323a', '#3f6b4e', '#e8c070', '#5a3a5a', '#2a2a2a', '#c98a9a', '#7a5a3a'];
  cols.forEach((c, i) => {
    const a = i / cols.length * Math.PI * 2;
    const u = new THREE.Group();
    u.add(K.cyl(0.006, 0.006, 0.95, K.mat('#555'), {}, 5));
    u.add(K.cyl(0.014, 0.045, 0.62, K.mat(c, { rough: 0.6 }), { y: 0.2 }, 8));
    u.add(K.mesh(new THREE.TorusGeometry(0.035, 0.008, 5, 8, Math.PI), M.walnut, { y: 0.95, x: 0.035 }));
    u.position.set(Math.cos(a) * 0.26, 0.08, Math.sin(a) * 0.26);
    u.rotation.set(Math.sin(a) * 0.12, -a, -Math.cos(a) * 0.12);
    r.add(u);
  });
  const s = T.text([{ t: 'かさ', scale: 1 }, { t: '3,300円〜', scale: 0.6 }], 0.3, 0.16, { bg: '#fffaf0', fg: '#333', border: '#7a2a3a', radius: 0.1 });
  s.position.set(0, 1.25, 0); r.add(s);
  const s2 = s.clone(); s2.rotation.y = Math.PI; r.add(s2);
  return r;
}

function bagShelf(T, M) {
  const b = new THREE.Group();
  b.add(K.box(2.0, 1.9, 0.02, M.walnut, { z: -0.19 }));
  for (const x of [-1.0, 1.0]) b.add(K.box(0.04, 1.9, 0.4, M.cream, { x }));
  b.add(K.box(2.04, 0.04, 0.4, M.cream, { y: 1.9 }));
  b.add(K.box(2.0, 0.08, 0.4, M.dark, {}));
  const cols = ['#7a5a3a', '#2a2a2a', '#a8323a', '#e8dcc6', '#3f6b4e', '#c98a9a', '#2f4f8f', '#b98b5e'];
  for (let lv = 0; lv < 3; lv++) {
    const y = 0.25 + lv * 0.55;
    b.add(K.box(1.96, 0.025, 0.38, M.walnut, { y, z: 0.0 }));
    for (let i = 0; i < 4; i++) {
      const c = cols[(lv * 4 + i) % cols.length];
      const bag = new THREE.Group();
      bag.add(K.rbox(0.32, 0.24, 0.12, 0.04, K.mat(c, { rough: 0.55 }), {}));
      bag.add(K.mesh(new THREE.TorusGeometry(0.09, 0.01, 5, 12, Math.PI), K.mat(c, { rough: 0.5 }), { y: 0.24 }));
      bag.add(K.box(0.04, 0.03, 0.01, M.gold, { y: 0.17, z: 0.062 }));
      bag.position.set(-0.72 + i * 0.48, y + 0.025, 0.06);
      b.add(bag);
    }
  }
  const s = T.text([{ t: 'バッグ', scale: 1 }, { t: 'BAG', scale: 0.5 }], 0.5, 0.2, { bg: '#7a2a3a', fg: '#f6efe2', radius: 0.12 });
  s.position.set(0, 2.05, 0.15); b.add(s);
  // flip so the shelf faces +z (into the room) before the caller rotates it
  b.position.z = 0.2;
  const holder = new THREE.Group(); holder.add(b);
  return holder;
}

// =================================================================== shared local helpers (same as cafe.js)
/** Centred cylinder (K.cyl lifts by h/2, which is wrong once it is rotated). */
function rod(rt, rb, h, material, o = {}, seg = 8) {
  return K.mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material, o);
}

/**
 * One canvas atlas shared by signs, labels, product faces and (via atlasize) every plain-coloured mesh:
 * a handful of materials for the whole scene, so K.finalize merges it into a few draw calls.
 * When it is full, regions spill into A.overflow (another atlas); every region remembers its atlas.
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
  const A = { material, glow, bucket, tex, ctx, own, overflow: null };
  A.region = (w, h, draw) => {
    w = Math.max(4, Math.ceil(w)); h = Math.max(4, Math.ceil(h));
    const at = place(w + PAD, h + PAD);
    if (!at) {
      if (A.overflow) return A.overflow.region(w, h, draw);
      console.warn('atlas full', w, h);
      return { u0: 0, u1: 0.001, v0: 0.999, v1: 1, atlas: A };
    }
    const { x, y } = at;
    ctx.save(); ctx.translate(x, y); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip(); draw(ctx, w, h); ctx.restore();
    return { u0: (x + 0.5) / size, u1: (x + w - 0.5) / size, v0: 1 - (y + h - 0.5) / size, v1: 1 - (y + 0.5) / size, atlas: A };
  };
  A.solid = (color) => {
    if (!solids.has(color)) {
      const r = A.region(12, 12, (g) => { g.fillStyle = color; g.fillRect(0, 0, 12, 12); });
      const u = (r.u0 + r.u1) / 2; const v = (r.v0 + r.v1) / 2;
      solids.set(color, { u0: u, u1: u, v0: v, v1: v, atlas: r.atlas, color });
    }
    return solids.get(color);
  };
  A.remap = (geo, r, from = 0, count = Infinity) => {
    const uv = geo.attributes.uv;
    for (let i = from; i < Math.min(uv.count, from + count); i++) uv.setXY(i, r.u0 + uv.getX(i) * (r.u1 - r.u0), r.v0 + uv.getY(i) * (r.v1 - r.v0));
    uv.needsUpdate = true;
    return geo;
  };
  /** Box (bottom at y=0) with per-face regions [px, nx, py, ny, pz(front), nz] — all faces from one atlas. */
  A.boxGeo = (w, h, d, faces) => {
    const owner = faces[4].atlas || A;
    const same = faces.map((r) => (r.atlas && r.atlas !== owner && r.color ? owner.solid(r.color) : r));
    const geo = new THREE.BoxGeometry(w, h, d);
    same.forEach((r, i) => A.remap(geo, r, i * 4, 4));
    geo.translate(0, h / 2, 0);
    return geo;
  };
  A.box = (w, h, d, front, side, o = {}) => {
    const owner = front.atlas || A;
    return K.mesh(A.boxGeo(w, h, d, [side, side, o.top ?? side, side, front, o.back ?? side]), o.glow ? owner.glow : (o.mat ?? owner.material), o);
  };
  A.plane = (w, h, r, o = {}) => { const owner = r.atlas || A; return K.mesh(A.remap(new THREE.PlaneGeometry(w, h), r), o.glow ? owner.glow : owner.material, { cast: false, ...o }); };
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

