// izakaya — 居酒屋「だいち」, a small, warm izakaya run by 中野 だいち. The learner comes in and sits on a
// bench at a wooden table (テーブル席): the bench cushion is right at the origin, so "sit" only lowers the
// eyes. Two friends sit across the table (npc1, npc2); the owner stands at the right end of the table and
// takes the order (staff). On the table: the menu, a beer, edamame, an oshibori, chopsticks (near) and the
// friends' yakitori and sake (npc). Ahead: the wooden counter with stools, the open kitchen with the
// yakitori grill (a little smoke), sake bottles on the shelves and hand-written menu strips on the soffit;
// at the front-left the big red lantern 居酒屋 and the fish tank (生け簀) with fish swimming slowly. Left: the
// entrance with the noren だいち, the clock, the register with a maneki-neko. Right: more tables, a window
// with a bamboo blind, beer posters (made-up brands), a small TV. Behind: a raised tatami room (小上がり).
// Learner stands at the origin looking toward -z.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as K from '../kit.js';

export const meta = { indoor: true, ambience: 'izakaya' };

// room: x X0..X1, z ZN (kitchen back wall)..ZS; the soffit / kitchen front line at ZK
const X0 = -3.6; const X1 = 3.9; const ZN = -6.3; const ZK = -4.62; const ZS = 2.6; const H = 2.7;
const KX = -1.4; // left edge of the kitchen opening
const SOFFIT = 1.95; // underside of the soffit above the counter
const DZ0 = -2.2; const DZ1 = -1.0; const DH = 1.95; // entrance in the left wall
const WZ0 = -0.7; const WZ1 = 0.4; const WY0 = 1.0; const WY1 = 1.8; // window in the right wall
const CF = -3.96; // customer face of the counter
const CH = 1.0; // counter height
const TBL = { x: 0, z: -0.72, w: 1.4, d: 0.72, h: 0.72 }; // the learner's table
const NPC_Z = -1.42; // npc1/npc2 hips
const SIT = 0.45;

export default function build({ setup }) {
  const time = setup.time || 'night';
  const season = setup.season || 'autumn';
  const weather = setup.weather || 'clear';
  const rain = weather === 'rain';
  const lit = time === 'evening' || time === 'night'; // lanterns glow, dark street outside
  const g = new THREE.Group();
  const props = {};
  const A = makeAtlas(1024);
  const T = makeAtlas(1024);
  A.textAtlas = T;
  T.overflow = A;
  const add = (o, x = 0, y = 0, z = 0, ry = 0, parent = g) => { o.position.set(x, y, z); o.rotation.y = ry; parent.add(o); return o; };
  const M = materials();
  const dyn = new THREE.Group(); // everything that moves
  dyn.userData.dynamic = true;
  g.add(dyn);
  const tick = [];

  // ------------------------------------------------------------------ room shell
  add(K.mesh(new THREE.PlaneGeometry(X1 - X0, ZS - ZN, 8, 10), M.floor, { rx: -Math.PI / 2, cast: false }), (X0 + X1) / 2, 0, (ZN + ZS) / 2);
  add(K.mesh(new THREE.PlaneGeometry(X1 - X0, ZS - ZN, 4, 5), M.ceil, { rx: Math.PI / 2, cast: false }), (X0 + X1) / 2, H, (ZN + ZS) / 2);
  // walls are planes facing the room: walking from a to b, the room is on the right
  const wall = (ax, az, bx, bz, y0 = 0, y1 = H, m = M.plaster) => {
    const len = Math.hypot(bx - ax, bz - az);
    const w = K.mesh(new THREE.PlaneGeometry(len, y1 - y0, Math.max(1, Math.ceil(len / 2)), 1), m, { cast: false });
    w.position.set((ax + bx) / 2, (y0 + y1) / 2, (az + bz) / 2);
    w.rotation.y = Math.atan2(-(bz - az), bx - ax);
    g.add(w);
    return w;
  };
  wall(X0, ZS, X0, DZ1); wall(X0, DZ1, X0, DZ0, DH, H); wall(X0, DZ0, X0, ZK); // left (entrance)
  wall(X0, ZK, KX, ZK); // closed wall behind the fish tank
  wall(KX, ZK, KX, ZN, 0, H, M.tile); wall(KX, ZN, X1, ZN, 0, H, M.tile); wall(X1, ZN, X1, ZK, 0, H, M.tile); // kitchen
  wall(X1, ZK, X1, WZ0); wall(X1, WZ0, X1, WZ1, 0, WY0); wall(X1, WZ0, X1, WZ1, WY1, H); wall(X1, WZ1, X1, ZS); // right (window)
  wall(X1, ZS, X0, ZS); // behind the learner
  // the soffit over the counter (menu strips hang on it) + its dark lintel
  g.add(K.box(X1 - KX, H - SOFFIT, 0.14, M.plaster, { x: (KX + X1) / 2, y: SOFFIT, z: ZK - 0.07, cast: false }));
  g.add(K.box(X1 - KX + 0.1, 0.1, 0.17, M.dark, { x: (KX + X1) / 2, y: SOFFIT - 0.07, z: ZK - 0.055, cast: false }));
  // kitchen floor
  g.add(K.mesh(new THREE.PlaneGeometry(X1 - KX, ZK - ZN, 3, 1), M.kfloor, { rx: -Math.PI / 2, x: (KX + X1) / 2, y: 0.004, z: (ZK + ZN) / 2, cast: false }));
  // wainscot (dark wood to 0.9 m) with a rail
  const wains = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az); const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
    const cx = (ax + bx) / 2; const cz = (az + bz) / 2;
    const nx = alongX ? 0 : (cx < 0 ? 1 : -1); const nz = alongX ? (cz < 0 ? 1 : -1) : 0;
    g.add(K.box(alongX ? len : 0.024, 0.9, alongX ? 0.024 : len, M.panel, { x: cx + nx * 0.012, z: cz + nz * 0.012, cast: false }));
    g.add(K.box(alongX ? len : 0.05, 0.05, alongX ? 0.05 : len, M.dark, { x: cx + nx * 0.025, y: 0.88, z: cz + nz * 0.025, cast: false }));
  };
  wains(X0, ZS, X0, DZ1); wains(X0, DZ0, X0, ZK); wains(X0, ZK, KX, ZK);
  wains(X1, ZK, X1, 1.5); wains(X1, 2.4, X1, ZS); wains(X0, ZS, X1, ZS);
  // posts and ceiling beams
  for (const [x, z] of [[X0 + 0.07, ZK + 0.07], [KX, ZK + 0.02], [X1 - 0.07, ZK + 0.07], [X0 + 0.07, ZS - 0.07], [X1 - 0.07, ZS - 0.07], [X1 - 0.07, -2.0], [X0 + 0.07, 0.6]]) g.add(K.box(0.15, H, 0.15, M.dark, { x, z, cast: false }));
  for (const z of [-3.75, -2.55, -1.35, -0.15, 1.05, 2.1]) g.add(K.box(X1 - X0, 0.15, 0.15, M.dark, { x: (X0 + X1) / 2, y: H - 0.15, z, cast: false }));
  for (const z of [-5.0, -5.9]) g.add(K.box(X1 - KX, 0.12, 0.12, M.dark, { x: (KX + X1) / 2, y: H - 0.12, z, cast: false }));

  // ------------------------------------------------------------------ the learner's table (テーブル席)
  add(izTable(TBL.w, TBL.d, TBL.h, M), TBL.x, 0, TBL.z);
  // bench across the table (npc1, npc2) and the learner's bench (its cushion at the origin)
  const npc1Pos = { x: -0.33, z: NPC_Z };
  const npc2Pos = { x: 0.33, z: NPC_Z };
  add(bench(1.36, M, [npc1Pos.x, npc2Pos.x], [M.zabuA, M.zabuB]), 0, 0, NPC_Z - 0.05);
  add(bench(1.36, M, [0], [M.zabuA]), 0, 0, 0.02, Math.PI);
  // pendant washi lamp over the table
  add(pendant(A, M, 0.42), TBL.x, H, TBL.z);

  // things on the table — the learner's side (near)
  const menu = K.prop('menu', tentMenu(A, M), { labelJa: 'メニュー', labelEn: 'menu' });
  add(menu, -0.47, TBL.h, -0.6, K.faceYaw({ x: -0.47, z: -0.6 }, { x: 0, z: 0 }));
  const beer = K.prop('beer', beerMug(M, true), { labelJa: 'ビール', labelEn: 'beer' });
  add(beer, 0.25, TBL.h, -0.52, -0.5);
  const edamame = K.prop('edamame', edamameBowl(M), { labelJa: 'えだまめ', labelEn: 'edamame' });
  add(edamame, -0.15, TBL.h, -0.64);
  const oshibori = K.prop('oshibori', oshiboriTray(A, M), { labelJa: 'おしぼり', labelEn: 'hand towel' });
  add(oshibori, 0.5, TBL.h, -0.47, 0.25);
  const hashi = K.prop('chopsticks', chopsticks(A, M), { labelJa: 'はし', labelEn: 'chopsticks' });
  add(hashi, -0.04, TBL.h, -0.44);
  // the friends' side (npc)
  const yakitori = K.prop('yakitori', yakitoriPlate(M), { labelJa: 'やきとり', labelEn: 'yakitori' });
  add(yakitori, -0.3, TBL.h, -0.95, 0.12);
  const sake = K.prop('sake', sakeSet(A, M), { labelJa: 'にほんしゅ', labelEn: 'sake' });
  add(sake, 0.36, TBL.h, -0.93, -0.2);
  add(beerMug(M, false, 0.35), -0.55, TBL.h, -0.9); // npc1's half-drunk beer
  add(smallPlate(M, M.white), 0.05, TBL.h, -0.9);
  add(condiments(M), 0.6, TBL.h, -0.78);

  // ------------------------------------------------------------------ the counter + open kitchen (far, ahead)
  const ctr = new THREE.Group();
  const CX0 = -1.36; const CX1 = X1 - 0.02;
  ctr.add(K.box(CX1 - CX0, CH - 0.06, CF - ZK - 0.04, M.panel, { x: (CX0 + CX1) / 2, z: (CF + ZK) / 2 - 0.02 }));
  for (let x = CX0 + 0.2; x < CX1 - 0.1; x += 0.36) ctr.add(K.box(0.045, CH - 0.2, 0.025, M.dark, { x, y: 0.1, z: CF - 0.03 }));
  ctr.add(K.box(CX1 - CX0, 0.1, 0.05, M.dark, { x: (CX0 + CX1) / 2, z: CF - 0.03 }));
  ctr.add(K.box(CX1 - CX0 + 0.06, 0.06, 0.62, M.top, { x: (CX0 + CX1) / 2 + 0.03, y: CH - 0.06, z: CF - 0.25 }));
  // raised serving shelf (付け台) on the left part, low lip on the right
  const RS1 = 0.95;
  ctr.add(K.box(RS1 - CX0, 0.18, 0.1, M.dark, { x: (CX0 + RS1) / 2, y: CH, z: ZK + 0.08 }));
  ctr.add(K.box(RS1 - CX0, 0.04, 0.26, M.top, { x: (CX0 + RS1) / 2, y: CH + 0.18, z: ZK + 0.1 }));
  ctr.add(K.box(CX1 - RS1, 0.06, 0.06, M.dark, { x: (RS1 + CX1) / 2, y: CH, z: ZK + 0.07 }));
  ctr.add(rod(0.016, 0.016, CX1 - CX0 - 0.2, M.brass, { x: (CX0 + CX1) / 2, y: 0.2, z: CF + 0.06, rz: Math.PI / 2 }, 8));
  const counter = K.prop('counter', ctr, { labelJa: 'カウンター', labelEn: 'counter' });
  g.add(counter);
  for (const x of [-0.95, -0.3, 0.35, 1.0, 1.65, 2.3, 2.95, 3.55]) add(stool(M), x, 0, CF + 0.36);
  // big serving bowls (大皿) on the raised shelf
  [['#8a5a2a', '#c98a3a'], ['#efe6c8', '#d8c48a'], ['#6b3a1a', '#a35a2a'], ['#5f8a3a', '#e8d9a8']].forEach(([food, top], i) => add(bigBowl(M, food, top, i), -1.0 + i * 0.5, CH + 0.22, ZK + 0.1));
  // counter-top bits: soy sauce, chopstick boxes, empty glasses
  for (const x of [-0.6, 0.7, 2.0, 3.25]) add(condiments(M), x, CH, CF - 0.18, 0);
  add(beerMug(M, false, 0.08), 1.35, CH, CF - 0.14);
  add(beerMug(M, false, 0.0), 2.6, CH, CF - 0.16, 0.6);
  add(smallPlate(M, M.indigo), 2.45, CH, CF - 0.3);
  // glass case with the day's fish on the counter
  add(netaCase(M), 3.25, CH, ZK + 0.17);

  // kitchen: work counter with the yakitori grill, beer server, back counter, fridge, shelves of sake
  const KZF = ZK - 0.06; const KZB = ZK - 0.62;
  g.add(K.box(X1 - KX - 0.06, 0.88, KZF - KZB, M.steelDark, { x: (KX + X1) / 2, z: (KZF + KZB) / 2 }));
  g.add(K.box(X1 - KX - 0.06, 0.03, KZF - KZB + 0.02, M.steel, { x: (KX + X1) / 2, y: 0.88, z: (KZF + KZB) / 2 }));
  const grill = yakitoriGrill(A, M, lit);
  add(grill.group, 2.0, 0.91, (KZF + KZB) / 2);
  const smoke = smokePuffs(2.0, 1.12, (KZF + KZB) / 2, 1.0);
  dyn.add(smoke.points);
  tick.push(smoke.update);
  add(beerServer(A, M), 1.1, 0.91, (KZF + KZB) / 2 + 0.05);
  add(cuttingBoard(M), -0.2, 0.91, (KZF + KZB) / 2);
  for (let i = 0; i < 4; i++) add(smallPlate(M, i % 2 ? M.white : M.indigo), -0.85, 0.91 + i * 0.016, (KZF + KZB) / 2);
  // hood over the grill (mostly hidden behind the soffit)
  g.add(K.box(1.4, 0.32, 0.62, M.steel, { x: 2.0, y: 2.2, z: (KZF + KZB) / 2, cast: false }));
  g.add(K.box(0.3, H - 2.52, 0.3, M.steel, { x: 2.0, y: 2.52, z: (KZF + KZB) / 2, cast: false }));
  // back counter, fridge
  g.add(K.box(3.35, 0.86, 0.6, M.steelDark, { x: 1.225, z: ZN + 0.3 }));
  g.add(K.box(3.35, 0.03, 0.62, M.steel, { x: 1.225, y: 0.86, z: ZN + 0.31 }));
  g.add(K.rbox(0.85, 1.85, 0.66, 0.02, M.steel, { x: X1 - 0.5, z: ZN + 0.34 }));
  g.add(K.box(0.03, 0.5, 0.03, M.steelDark, { x: X1 - 0.86, y: 1.0, z: ZN + 0.68 }));
  add(riceCooker(M), -0.15, 0.89, ZN + 0.32);
  add(stockPot(M, 0.15), 0.5, 0.89, ZN + 0.32);
  add(stockPot(M, 0.11), 0.95, 0.89, ZN + 0.34);
  for (let i = 0; i < 5; i++) add(smallPlate(M, M.white), 1.6, 0.89 + i * 0.016, ZN + 0.3);
  // two wooden shelves of sake bottles (一升瓶) on the back wall
  const bottleNames = ['だいち', 'まつかぜ', 'ゆきみ', 'つきあかり', 'やまびこ', 'ことぶき', 'はるかぜ', 'しらなみ', 'あおば'];
  const bottleCols = ['#2f4a2c', '#5a3418', '#8fb3b8', '#2f4a2c', '#3f2a1a', '#6f9aa0', '#2a3f2a', '#5a3418', '#8fb3b8'];
  const labelRegions = bottleNames.map((n, i) => T.region(42, 96, (c, W, Hh) => {
    c.fillStyle = ['#f4ecd6', '#f6f1e4', '#e9d9b0'][i % 3]; c.fillRect(0, 0, W, Hh);
    c.fillStyle = i % 4 === 1 ? '#a8231c' : '#2a2320'; c.fillRect(0, 0, W, 6); c.fillRect(0, Hh - 6, W, 6);
    drawVertical(c, W / 2, 12, n, Math.min(W * 0.62, (Hh - 22) / [...n].length), '#1f1a17', 800);
  }));
  for (const [y, n0] of [[1.22, 0], [1.72, 4]]) {
    g.add(K.box(2.9, 0.035, 0.26, M.light, { x: 1.1, y, z: ZN + 0.14 }));
    for (const x of [-0.2, 2.4]) g.add(K.box(0.03, 0.12, 0.2, M.dark, { x, y: y - 0.12, z: ZN + 0.12 }));
    for (let i = 0; i < 14; i++) {
      const k = (i * 5 + n0) % bottleNames.length;
      const big = i % 3 !== 2;
      add(sakeBottle(A, M, bottleCols[k], labelRegions[k], big ? 1 : 0.62), -0.25 + i * 0.2, y + 0.035, ZN + 0.15 + (i % 2) * 0.02);
    }
  }
  // a short noren to the back room (kitchen, left)
  const backNoren = T.region(170, 110, (c, W, Hh) => {
    c.fillStyle = '#7a2a24'; c.fillRect(0, 0, W, Hh);
    c.strokeStyle = 'rgba(255,240,220,0.5)'; c.lineWidth = 3; c.strokeRect(8, 8, W - 16, Hh - 16);
  });
  for (let i = 0; i < 2; i++) add(T.plane(0.34, 0.55, sub(backNoren, i / 2, (i + 1) / 2)), -1.11 + i * 0.36, 1.62, ZN + 0.025);
  g.add(K.box(0.84, 2.0, 0.02, M.black, { x: -0.93, z: ZN + 0.005, cast: false }));

  // ------------------------------------------------------------------ menu strips on the soffit (far)
  const stripG = new THREE.Group();
  const strips = [['やきとり', '３００円'], ['えだまめ', '２８０円'], ['生ビール', '５００円'], ['からあげ', '４８０円'], ['ひややっこ', '２８０円'], ['さしみ', '９８０円'], ['日本酒', '４５０円'], ['ハイボール', '４５０円'], ['ウーロン茶', '２５０円'], ['やきおにぎり', '２５０円']];
  const rr = K.rng(12);
  strips.forEach(([name, price], i) => {
    const w = 0.21; const h = 0.64;
    const reg = T.region(w * 330, h * 330, (c, W, Hh) => drawStrip(c, W, Hh, name, price, i));
    const s = T.box(w, h, 0.012, reg, A.solid('#c9a874'), {});
    s.position.set(-1.12 + i * 0.425, SOFFIT + 0.06, ZK + 0.012);
    s.rotation.z = (rr() - 0.5) * 0.025;
    stripG.add(s);
    stripG.add(K.cyl(0.003, 0.003, 0.05, M.black, { x: -1.12 + i * 0.425, y: SOFFIT + 0.06 + h - 0.01, z: ZK + 0.012 }, 3));
  });
  const menuStrips = K.prop('menu_strips', stripG, { labelJa: 'メニューの ふだ', labelEn: 'menu strips' });
  g.add(menuStrips);
  // little down-lights under the lintel
  for (let x = -0.9; x < X1 - 0.3; x += 1.2) g.add(K.mesh(new THREE.CircleGeometry(0.05, 12), lit ? M.bulb : M.bulbDay, { x, y: SOFFIT - 0.072, z: ZK - 0.03, rx: Math.PI / 2, cast: false, receive: false }));

  // ------------------------------------------------------------------ the big red lantern 居酒屋 (far, front-left)
  const lanternReg = T.region(512, 256, (c, W, Hh) => {
    const gr = c.createLinearGradient(0, 0, 0, Hh);
    gr.addColorStop(0, '#8a1c16'); gr.addColorStop(0.5, '#d8382a'); gr.addColorStop(1, '#8a1c16');
    c.fillStyle = gr; c.fillRect(0, 0, W, Hh);
    for (let i = 1; i < 18; i++) { c.fillStyle = 'rgba(70,10,8,0.35)'; c.fillRect(0, i * Hh / 18, W, 2); }
    drawVertical(c, W * 0.25, Hh * 0.13, '居酒屋', Hh * 0.245, '#191210', 800);
    drawVertical(c, W * 0.75, Hh * 0.13, 'だいち', Hh * 0.245, '#191210', 800);
  });
  const lanternPos = { x: -1.6, z: -4.28 };
  const bigLantern = chochin(lanternReg, 0.21, 0.62, M, lit);
  bigLantern.rotation.y = K.faceYaw(lanternPos, { x: 0, z: 0 }) - Math.PI / 2;
  bigLantern.position.y = 1.64;
  const lanternG = new THREE.Group();
  lanternG.add(bigLantern);
  lanternG.position.set(lanternPos.x, 0, lanternPos.z);
  const lantern = K.prop('lantern', lanternG, { labelJa: 'ちょうちん', labelEn: 'red lantern' });
  g.add(lantern);
  g.add(K.box(0.03, 0.03, ZK - lanternPos.z - 0.0, M.black, { x: lanternPos.x, y: 2.12, z: (ZK + lanternPos.z) / 2 })); // iron arm
  g.add(rod(0.004, 0.004, 0.17, M.black, { x: lanternPos.x, y: 2.04, z: lanternPos.z }, 4));

  // ------------------------------------------------------------------ fish tank 生け簀 (far, front-left)
  const tank = fishTank(A, T, M);
  add(tank.group, -2.42, 0, ZK + 0.35);
  const fishTankProp = K.prop('fish_tank', tank.group, { labelJa: 'いけす', labelEn: 'fish tank' });
  add(tank.moving, -2.42, 0, ZK + 0.35, 0, dyn);
  tick.push(tank.update);
  // lunch / today's specials board above the tank
  add(specialsBoard(T, M, time, season), -2.45, 2.12, ZK + 0.02);

  // ------------------------------------------------------------------ entrance: door, noren, clock (far, left)
  g.add(K.box(0.16, DH, 0.1, M.dark, { x: X0 + 0.02, z: DZ0 - 0.05 }));
  g.add(K.box(0.16, DH, 0.1, M.dark, { x: X0 + 0.02, z: DZ1 + 0.05 }));
  g.add(K.box(0.18, 0.12, DZ1 - DZ0 + 0.2, M.dark, { x: X0 + 0.02, y: DH, z: (DZ0 + DZ1) / 2 }));
  g.add(K.box(0.2, 0.03, DZ1 - DZ0, M.stone, { x: X0, z: (DZ0 + DZ1) / 2, cast: false }));
  const pane = A.region(110, 200, (c, W, Hh) => doorGlass(c, W, Hh, lit));
  for (let i = 0; i < 2; i++) {
    const d = slidingDoor(A, M, pane, (DZ1 - DZ0) / 2 + 0.03, DH - 0.02);
    add(d, X0 - 0.04 - i * 0.035, 0.0, DZ1 - 0.3 - i * 0.6, Math.PI / 2);
  }
  // the noren だいち hangs just inside the doorway
  const norenReg = T.region(360, 240, (c, W, Hh) => {
    c.fillStyle = '#25395c'; c.fillRect(0, 0, W, Hh);
    c.fillStyle = 'rgba(255,255,255,0.08)';
    for (let y = 0; y < Hh; y += 6) c.fillRect(0, y, W, 2);
    c.fillStyle = '#f4efe2';
    c.fillRect(0, Hh * 0.9, W, Hh * 0.025);
    c.font = `800 ${Hh * 0.46}px ${K.JP_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    ['だ', 'い', 'ち'].forEach((ch, i) => c.fillText(ch, W * (i + 0.5) / 3, Hh * 0.5));
    c.font = `700 ${Hh * 0.08}px ${K.JP_FONT}`;
    c.fillText('いざかや', W * 0.5, Hh * 0.13);
  });
  const nor = new THREE.Group();
  nor.add(rod(0.014, 0.014, 1.26, M.light, { y: DH - 0.04, rz: Math.PI / 2 }, 8));
  for (let i = 0; i < 3; i++) {
    const p = T.plane(0.37, 0.74, sub(norenReg, i / 3, (i + 1) / 3), { cast: false });
    p.position.set((i - 1) * 0.385, DH - 0.06 - 0.37, 0);
    p.rotation.y = (i - 1) * 0.04;
    nor.add(p);
  }
  nor.rotation.y = Math.PI / 2;
  nor.position.set(X0 + 0.12, 0, (DZ0 + DZ1) / 2);
  const noren = K.prop('noren', nor, { labelJa: 'のれん', labelEn: 'noren curtain' });
  g.add(noren);
  const hhmm = { morning: [10, 50], noon: [12, 25], evening: [18, 35], night: [20, 40] }[time] || [20, 40];
  const clk = K.prop('clock', K.clock(0.16, hhmm[0], hhmm[1]), { labelJa: 'とけい', labelEn: 'clock' });
  add(clk, X0 + 0.03, 2.33, (DZ0 + DZ1) / 2, Math.PI / 2);
  // umbrella stand by the door (wet umbrellas when it rains)
  add(umbrellaStand(M, rain), X0 + 0.24, 0, DZ1 + 0.32);
  if (rain) g.add(K.box(0.7, 0.012, 0.9, K.mat('#4a3e34', { rough: 1 }), { x: X0 + 0.45, z: (DZ0 + DZ1) / 2, cast: false }));

  // register counter (帳場) with the maneki-neko (far, left)
  g.add(K.box(0.46, 0.92, 0.86, M.panelWood, { x: X0 + 0.23, z: -2.93 }));
  g.add(K.box(0.52, 0.04, 0.92, M.top, { x: X0 + 0.26, y: 0.92, z: -2.93 }));
  const reg = K.prop('register', register(A, M), { labelJa: 'レジ', labelEn: 'cash register' });
  add(reg, X0 + 0.27, 0.96, -2.78, Math.PI / 2 - 0.25);
  const neko = manekiNeko(A, M);
  add(neko.group, X0 + 0.26, 0.96, -3.18, K.faceYaw({ x: X0 + 0.26, z: -3.18 }, { x: 0, z: 0 }));
  tick.push(neko.update);
  const kaikei = T.text([{ t: 'おかいけい', scale: 1 }], 0.42, 0.13, { bg: '#efe0bd', fg: '#3b2414', border: '#5a3a22', radius: 0.08 });
  add(kaikei, X0 + 0.012, 1.62, -2.93, Math.PI / 2);

  // ------------------------------------------------------------------ the right side: tables, window, posters, TV
  for (const z of [-1.25, 1.05]) {
    add(izTable(1.2, 0.7, 0.72, M), 2.55, 0, z);
    add(bench(1.16, M, [2.25 - 2.55, 2.85 - 2.55], [M.zabuB, M.zabuA]), 2.55, 0, z - 0.66);
    add(bench(1.16, M, [-0.3, 0.3], [M.zabuA, M.zabuB]), 2.55, 0, z + 0.66, Math.PI);
    add(pendant(A, M, 0.5), 2.55, H, z);
  }
  // leftovers on the other tables (customers are not modelled)
  add(beerMug(M, false, 0.05), 2.3, 0.72, -1.35, 0.3);
  add(beerMug(M, false, 0.0), 2.85, 0.72, -1.1, 2.0);
  add(smallPlate(M, M.white), 2.6, 0.72, -1.3);
  add(condiments(M), 3.0, 0.72, -1.4);
  add(sakeSet(A, M), 2.4, 0.72, 1.0, 0.4);
  add(condiments(M), 3.0, 0.72, 0.95);
  // window with a half-lowered bamboo blind (sudare)
  const win = K.windowPane(WZ1 - WZ0, WY1 - WY0, lit ? 'night' : 'street', time);
  add(win, X1, (WY0 + WY1) / 2, (WZ0 + WZ1) / 2, -Math.PI / 2);
  const sudare = A.region(96, 128, (c, W, Hh) => {
    for (let y = 0; y < Hh; y += 4) { c.fillStyle = y % 8 ? '#b8935a' : '#c9a66b'; c.fillRect(0, y, W, 3); }
    c.fillStyle = '#5a3a20'; for (const x of [W * 0.2, W * 0.5, W * 0.8]) c.fillRect(x, 0, 2, Hh);
  });
  add(A.plane(WZ1 - WZ0 + 0.06, 0.48, sudare, { cast: false }), X1 - 0.07, WY1 - 0.24, (WZ0 + WZ1) / 2, -Math.PI / 2);
  g.add(rod(0.012, 0.012, WZ1 - WZ0 + 0.16, M.light, { x: X1 - 0.07, y: WY1 + 0.02, z: (WZ0 + WZ1) / 2, rx: Math.PI / 2 }, 6));
  g.add(K.box(0.12, 0.04, WZ1 - WZ0 + 0.12, M.dark, { x: X1 - 0.06, y: WY0 - 0.04, z: (WZ0 + WZ1) / 2 }));
  add(smallPlant(1.0, 3), X1 - 0.1, WY0, (WZ0 + WZ1) / 2 + 0.3);
  // posters (made-up brands)
  add(beerPoster(T, M), X1 - 0.012, 1.62, -2.85, -Math.PI / 2);
  add(highballPoster(T, M), X0 + 0.012, 1.58, -0.05, Math.PI / 2);
  add(sakePoster(T, M), 2.3, 1.62, ZS - 0.012, Math.PI);
  // small TV on a bracket in the front-right corner (a baseball game)
  const tvPos = { x: 3.35, z: -4.22 };
  add(tvSet(A, M), tvPos.x, 1.92, tvPos.z, K.faceYaw(tvPos, { x: 0.6, z: 0 }));
  g.add(rod(0.015, 0.015, H - 2.28, M.steelDark, { x: tvPos.x, y: (H + 2.28) / 2, z: tvPos.z }, 6));
  // toilet door
  const wc = new THREE.Group();
  wc.add(K.box(0.92, 2.1, 0.05, M.dark, { z: -0.025 }));
  wc.add(K.box(0.78, 2.0, 0.04, M.panelWood, {}));
  wc.add(T.text([{ t: 'トイレ', scale: 1 }], 0.34, 0.12, { bg: '#efe0bd', fg: '#3b2414', radius: 0.12 }));
  wc.children[2].position.set(0, 1.62, 0.025);
  wc.add(rod(0.012, 0.012, 0.14, M.brass, { x: 0.3, y: 0.98, z: 0.05, rx: Math.PI / 2 }, 8));
  add(wc, X1 - 0.03, 0, 1.95, -Math.PI / 2);

  // ------------------------------------------------------------------ behind: raised tatami room (小上がり)
  const ZT = 1.25; const XT = 1.0; const TH = 0.38;
  g.add(K.box(XT - X0, TH - 0.05, ZS - ZT, M.panelWood, { x: (X0 + XT) / 2, z: (ZT + ZS) / 2 }));
  g.add(K.box(XT - X0, 0.05, 0.08, M.dark, { x: (X0 + XT) / 2, y: TH - 0.05, z: ZT + 0.04 }));
  g.add(K.box(0.08, 0.05, ZS - ZT, M.dark, { x: XT - 0.04, y: TH - 0.05, z: (ZT + ZS) / 2 }));
  g.add(K.mesh(new THREE.PlaneGeometry(XT - X0 - 0.08, ZS - ZT - 0.08, 4, 1), M.tatami, { rx: -Math.PI / 2, x: (X0 + XT) / 2 - 0.04, y: TH, z: (ZT + ZS) / 2 + 0.04, cast: false }));
  g.add(K.rbox(0.5, 0.16, 0.32, 0.04, M.stone, { x: -1.0, z: ZT - 0.2 })); // step stone
  for (const [x, w] of [[-2.3, 1.1], [0.15, 0.8]]) {
    const lowT = new THREE.Group();
    lowT.add(K.box(w, 0.04, 0.62, M.top, { y: 0.29 }));
    for (const [lx, lz] of [[-w / 2 + 0.06, -0.25], [w / 2 - 0.06, -0.25], [-w / 2 + 0.06, 0.25], [w / 2 - 0.06, 0.25]]) lowT.add(K.box(0.05, 0.29, 0.05, M.dark, { x: lx, z: lz }));
    add(lowT, x, TH, 1.86);
    for (const dx of w > 1 ? [-0.3, 0.3] : [0]) for (const dz of [-0.46, 0.44]) add(K.rbox(0.46, 0.06, 0.44, 0.03, dz < 0 ? M.zabuB : M.zabuA), x + dx, TH, 1.86 + dz);
  }
  add(beerMug(M, false, 0.0), -2.55, TH + 0.33, 1.8);
  add(beerMug(M, false, 0.1), -2.05, TH + 0.33, 1.95, 1.2);
  add(smallPlate(M, M.indigo), -2.3, TH + 0.33, 1.7);
  add(sakeSet(A, M), 0.15, TH + 0.33, 1.86, 0.6);
  // a row of small festival lanterns above the tatami room
  const small = [T.region(128, 64, (c, W, Hh) => paperTex(c, W, Hh, '#d23a2c', '#7a1a14')), T.region(128, 64, (c, W, Hh) => paperTex(c, W, Hh, '#f4e9d2', '#c23a2c'))];
  g.add(rod(0.004, 0.004, XT - X0 - 0.3, M.black, { x: (X0 + XT) / 2, y: 2.36, z: ZS - 0.22, rz: Math.PI / 2 }, 3));
  for (let i = 0; i < 8; i++) add(chochin(small[i % 2], 0.085, 0.24, M, lit), X0 + 0.45 + i * 0.55, 2.2, ZS - 0.22, i * 0.7);
  // a painting of Mt Fuji and a shelf with sake bottles on the back wall
  add(fujiPicture(T, M), -2.2, 1.55, ZS - 0.015, Math.PI);
  g.add(K.box(1.0, 0.035, 0.22, M.light, { x: -0.3, y: 1.42, z: ZS - 0.11 }));
  for (let i = 0; i < 4; i++) add(sakeBottle(A, M, bottleCols[i], labelRegions[i + 2], 1), -0.65 + i * 0.23, 1.455, ZS - 0.12, Math.PI);
  add(pendant(A, M, 0.55), -2.3, H, 1.86);
  // a plant in the corner by the entrance
  add(K.plant(1.1, 7), X0 + 0.3, 0, -4.32);

  // small red / white lanterns along the beam over the tables (glow at night)
  for (let i = 0; i < 5; i++) {
    add(chochin(small[i % 2], 0.08, 0.22, M, lit), -1.6 + i * 1.2, 2.32, -2.55, i * 0.9);
  }
  // a little shelf with a daruma on the left wall
  g.add(K.box(0.2, 0.03, 0.62, M.light, { x: X0 + 0.1, y: 2.02, z: -0.05 }));
  add(daruma(A, M), X0 + 0.11, 2.05, -0.2, Math.PI / 2);
  add(sakeBottle(A, M, bottleCols[0], labelRegions[0], 0.62), X0 + 0.1, 2.05, 0.12, Math.PI / 2);

  // ------------------------------------------------------------------ lights
  const k = lit ? 1.25 : 0.9;
  const lights = [[0, 2.05, -0.75, '#ffb46a', 3.0, 4.8], [0.9, 2.35, -3.4, '#ffbd78', 3.8, 6.5], [1.3, 2.4, -5.4, '#ffe1b4', 3.0, 5.5], [0.3, 2.3, 1.3, '#ffb46a', 2.8, 6.5]];
  for (const [x, y, z, c, i, d] of lights) { const l = new THREE.PointLight(c, i * k, d, 1.4); l.position.set(x, y, z); g.add(l); }

  // small things do not cast shadows (keeps the shadow pass cheap)
  const bs = new THREE.Vector3();
  g.updateMatrixWorld(true);
  g.traverse((o) => {
    if (!o.isMesh || !o.castShadow) return;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    o.getWorldScale(bs);
    if (o.geometry.boundingSphere.radius * Math.max(bs.x, bs.y, bs.z) < 0.06) o.castShadow = false;
  });

  for (const o of [menu, beer, edamame, oshibori, hashi, yakitori, sake, menuStrips, lantern, counter, reg, clk, noren, fishTankProp]) props[o.userData.propId] = o;
  atlasize(g, A);

  const staffPos = { x: 0.98, z: -0.9 };
  return K.finalize({
    group: g,
    spawn: K.spot(0, 0, 0),
    slots: {
      staff: K.spot(staffPos.x, staffPos.z, K.faceYaw(staffPos, { x: 0, z: 0 })),
      npc1: { ...K.spot(npc1Pos.x, npc1Pos.z, K.faceYaw(npc1Pos, { x: 0, z: 0 })), sit: SIT },
      npc2: { ...K.spot(npc2Pos.x, npc2Pos.z, K.faceYaw(npc2Pos, { x: 0, z: 0 })), sit: SIT },
      phone: null,
    },
    props,
    // the learner's seat: the bench cushion right at the spawn ("sit" lowers the eyes, it does not move)
    spots: { seat: { pos: new THREE.Vector3(0, 0, 0), yaw: 0, sit: SIT } },
    center: new THREE.Vector3(0.1, 0, -1.6),
    radius: 6.2,
    update(dt, t) { for (const f of tick) f(dt, t); },
  });
}

// =================================================================== materials
function materials() {
  return {
    floor: K.mat('#ffffff', { map: K.woodTex('#5c3e27', [5, 7], 9), rough: 0.55 }),
    plaster: K.mat('#ffffff', { map: K.noiseTex('#e4cfa8', 0.06, [5, 2], 'izakaya'), rough: 0.95 }),
    panel: K.mat('#ffffff', { map: K.woodTex('#5a3a22', [6, 1], 12), rough: 0.55 }),
    ceil: K.mat('#ffffff', { map: K.woodTex('#7a5636', [4, 6], 14), rough: 0.85 }),
    top: K.mat('#ffffff', { map: K.woodTex('#a87442', [2, 1], 4), rough: 0.35 }),
    tile: K.mat('#ffffff', { map: K.tileTex('#f1ede4', '#ebe6db', 8, [7, 3], '#c7c0b2'), rough: 0.3 }),
    kfloor: K.mat('#ffffff', { map: K.tileTex('#8f8a82', '#858078', 6, [6, 2], '#6c675f'), rough: 0.6 }),
    tatami: K.mat('#ffffff', { map: K.tatamiTex([5, 1]), rough: 0.9 }),
    dark: K.mat('#3a281c', { rough: 0.55 }),
    panelWood: K.mat('#6a4428', { rough: 0.55 }),
    wood: K.mat('#7a5232', { rough: 0.5 }),
    light: K.mat('#c9a271', { rough: 0.5 }),
    bamboo: K.mat('#d6bb85', { rough: 0.55 }),
    steel: K.mat('#c4c8cc', { metal: 0.8, rough: 0.3 }),
    steelDark: K.mat('#8e9398', { metal: 0.6, rough: 0.4 }),
    brass: K.mat('#c9a253', { metal: 0.85, rough: 0.3 }),
    black: K.mat('#26201c', { rough: 0.5 }),
    lacquer: K.mat('#2a1a16', { rough: 0.25 }),
    white: K.mat('#f4efe4', { rough: 0.25 }),
    indigo: K.mat('#2f4068', { rough: 0.28 }),
    cream: K.mat('#efe3c8', { rough: 0.28 }),
    stone: K.mat('#8d8a84', { rough: 0.9 }),
    glass: K.glassMat(),
    beer: K.mat('#f4b43a', { rough: 0.32 }),
    foam: K.mat('#fbf6ea', { rough: 0.9 }),
    zabuA: K.mat('#34466e', { rough: 0.85 }),
    zabuB: K.mat('#7d3030', { rough: 0.85 }),
    bulb: new THREE.MeshBasicMaterial({ color: '#ffe0a8', toneMapped: false }),
    bulbDay: new THREE.MeshBasicMaterial({ color: '#f6e6c8', toneMapped: false }),
  };
}

// =================================================================== furniture
/** Centred cylinder (K.cyl lifts by h/2, which is wrong once it is rotated). */
function rod(rt, rb, h, material, o = {}, seg = 8) {
  return K.mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material, o);
}

/** Izakaya table: thick wooden top, square legs at the corners, stretchers only at the ends (knees stay free). */
function izTable(w, d, h, M) {
  const t = new THREE.Group();
  t.add(K.box(w, 0.05, d, M.top, { y: h - 0.05 }));
  for (const x of [-w / 2 + 0.07, w / 2 - 0.07]) t.add(K.box(0.03, 0.06, d - 0.1, M.dark, { x, y: h - 0.11 }));
  const lx = w / 2 - 0.07; const lz = d / 2 - 0.07;
  for (const [x, z] of [[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]]) t.add(K.box(0.06, h - 0.05, 0.06, M.dark, { x, z }));
  for (const x of [-lx, lx]) t.add(K.box(0.04, 0.05, d - 0.14, M.dark, { x, y: 0.1 }));
  return t;
}

/** Bench with a backrest, sitters facing +z; zabuton cushions at the given x (seat top = SIT). */
function bench(len, M, seats, cushions) {
  const b = new THREE.Group();
  b.add(K.box(len, 0.33, 0.36, M.panelWood, { z: -0.02 }));
  b.add(K.box(len, 0.05, 0.42, M.wood, { y: 0.33 }));
  b.add(K.box(len, 0.03, 0.03, M.dark, { y: 0.33, z: 0.2 }));
  b.add(K.box(len, 0.5, 0.05, M.wood, { y: 0.38, z: -0.235 }));
  b.add(K.box(len + 0.02, 0.04, 0.08, M.dark, { y: 0.88, z: -0.235 }));
  for (const x of [-len / 2 + 0.02, len / 2 - 0.02]) b.add(K.box(0.05, 0.9, 0.06, M.dark, { x, z: -0.235 }));
  seats.forEach((x, i) => b.add(K.rbox(0.44, 0.07, 0.4, 0.03, cushions[i % cushions.length], { x, y: SIT - 0.07 + 0.0, z: 0.0 })));
  return b;
}

function stool(M) {
  const s = new THREE.Group();
  s.add(K.cyl(0.17, 0.16, 0.05, M.wood, { y: 0.66 }, 16));
  s.add(K.cyl(0.15, 0.15, 0.02, M.zabuB, { y: 0.71 }, 16));
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    s.add(K.box(0.035, 0.66, 0.035, M.dark, { x: Math.cos(a) * 0.1, z: Math.sin(a) * 0.1 }));
  }
  s.add(K.box(0.24, 0.025, 0.025, M.dark, { y: 0.22 }));
  s.add(K.box(0.025, 0.025, 0.24, M.dark, { y: 0.25 }));
  return s;
}

function pendant(A, M, drop) {
  const p = new THREE.Group();
  if (!A.shadeReg) A.shadeReg = A.region(64, 64, (c, W, Hh) => { c.fillStyle = '#f5d39a'; c.fillRect(0, 0, W, Hh); for (let i = 1; i < 8; i++) { c.fillStyle = 'rgba(150,100,40,0.35)'; c.fillRect(0, i * Hh / 8, W, 2); } });
  p.add(rod(0.004, 0.004, drop, M.black, { y: -drop / 2 }, 4));
  const shade = A.remap(new THREE.CylinderGeometry(0.15, 0.17, 0.26, 16, 1, true), A.shadeReg);
  p.add(K.mesh(shade, A.glow, { y: -drop - 0.13, cast: false, receive: false }));
  p.add(K.cyl(0.05, 0.05, 0.02, M.black, { y: -drop }, 10));
  return p;
}

// =================================================================== tableware
function beerMug(M, full = true, level = 1) {
  const m = new THREE.Group();
  m.add(K.mesh(new THREE.CylinderGeometry(0.043, 0.04, 0.15, 16, 1, true), M.glass, { y: 0.089, cast: false }));
  m.add(K.cyl(0.04, 0.04, 0.014, M.glass, { cast: false }, 16));
  m.add(K.mesh(new THREE.TorusGeometry(0.036, 0.009, 6, 12, Math.PI), M.glass, { x: 0.05, y: 0.09, rz: -Math.PI / 2, cast: false }));
  if (full) {
    m.add(K.cyl(0.039, 0.036, 0.11, M.beer, { y: 0.014 }, 14));
    m.add(K.cyl(0.0405, 0.039, 0.032, M.foam, { y: 0.124 }, 14));
    m.add(K.mesh(new THREE.SphereGeometry(0.0405, 14, 4, 0, Math.PI * 2, 0, Math.PI / 2), M.foam, { y: 0.156 }));
    m.children[m.children.length - 1].scale.y = 0.25;
  } else if (level > 0) {
    m.add(K.cyl(0.039, 0.037, 0.12 * level, M.beer, { y: 0.014 }, 12));
    m.add(K.cyl(0.039, 0.039, 0.006, M.foam, { y: 0.014 + 0.12 * level }, 12));
  } else {
    m.add(K.cyl(0.04, 0.04, 0.012, M.foam, { y: 0.03 }, 12)); // foam rings of an empty mug
  }
  return m;
}

function smallPlate(M, mat) {
  return K.cyl(0.075, 0.055, 0.016, mat, {}, 16);
}

function edamameBowl(M) {
  const b = new THREE.Group();
  b.add(K.cyl(0.065, 0.04, 0.045, M.indigo, {}, 16));
  b.add(K.cyl(0.058, 0.058, 0.004, K.mat('#1f2c4a', { rough: 0.3 }), { y: 0.04 }, 16));
  const pod = new THREE.CapsuleGeometry(0.0085, 0.038, 2, 6);
  const r = K.rng(14);
  const green = [K.mat('#7fae3f', { rough: 0.55 }), K.mat('#6f9e36', { rough: 0.55 })];
  for (let i = 0; i < 13; i++) {
    const a = r() * Math.PI * 2; const d = r() * 0.035; const ring = i < 8 ? 0 : 1;
    const p = K.mesh(pod, green[i % 2], { x: Math.cos(a) * d, y: 0.047 + ring * 0.014 + r() * 0.006, z: Math.sin(a) * d, rx: Math.PI / 2 + (r() - 0.5) * 0.5, rz: r() * Math.PI });
    p.rotation.order = 'YXZ';
    p.rotation.y = r() * Math.PI;
    p.scale.set(1, 1, 0.75);
    b.add(p);
  }
  // a little dish for the empty pods
  b.add(K.cyl(0.04, 0.03, 0.014, M.white, { x: 0.11, z: 0.03 }, 12));
  return b;
}

function oshiboriTray(A, M) {
  const o = new THREE.Group();
  o.add(K.rbox(0.17, 0.012, 0.075, 0.005, M.bamboo, {}));
  o.add(K.box(0.17, 0.006, 0.006, M.wood, { y: 0.012, z: 0.034 }));
  o.add(K.box(0.17, 0.006, 0.006, M.wood, { y: 0.012, z: -0.034 }));
  const towel = K.mat('#fbf9f3', { rough: 0.95 });
  o.add(rod(0.023, 0.023, 0.14, towel, { y: 0.036, rz: Math.PI / 2 }, 12));
  // the loose end of the roll + a thin blue line
  o.add(K.box(0.14, 0.004, 0.03, towel, { y: 0.054, z: 0.01, rx: 0.5 }));
  o.add(rod(0.0232, 0.0232, 0.006, K.mat('#7fa3c9', { rough: 0.9 }), { x: 0.05, y: 0.036, rz: Math.PI / 2 }, 12));
  return o;
}

function chopsticks(A, M) {
  const c = new THREE.Group();
  c.add(K.rbox(0.045, 0.012, 0.016, 0.005, M.indigo, { x: 0.075, z: -0.005 })); // hashioki
  const stick = K.mat('#d8b98a', { rough: 0.55 });
  for (const dz of [-0.008, 0.006]) c.add(rod(0.0022, 0.0038, 0.23, stick, { x: -0.02, y: 0.012, z: dz, rz: Math.PI / 2 + 0.05 }, 6));
  // the paper sleeve おてもと
  if (!A.sleeveReg) A.sleeveReg = A.textAtlas.region(220, 48, (g, W, Hh) => {
    g.fillStyle = '#f6f1e6'; g.fillRect(0, 0, W, Hh);
    g.fillStyle = '#b5312a'; g.fillRect(0, 0, W * 0.16, Hh);
    g.fillStyle = '#2b2320'; g.font = `700 ${Hh * 0.55}px ${K.JP_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('おてもと', W * 0.58, Hh * 0.52);
  });
  const sl = A.textAtlas.plane(0.2, 0.04, A.sleeveReg, { rx: -Math.PI / 2 });
  sl.position.set(-0.02, 0.0025, 0.055);
  sl.rotation.z = 0.06;
  c.add(sl);
  return c;
}

function yakitoriPlate(M) {
  const p = new THREE.Group();
  p.add(K.rbox(0.3, 0.016, 0.13, 0.008, K.mat('#3a2a24', { rough: 0.25 }), {}));
  const stick = K.mat('#d9bf8a', { rough: 0.6 });
  const meat = K.mat('#8a4a22', { rough: 0.35 }); const meat2 = K.mat('#a65a2a', { rough: 0.4 });
  const negi = K.mat('#d8e2b0', { rough: 0.5 });
  const chunk = new THREE.IcosahedronGeometry(0.016, 1);
  for (let s = 0; s < 4; s++) {
    const z = -0.042 + s * 0.028; const tilt = (s - 1.5) * 0.06;
    const sk = new THREE.Group();
    sk.add(rod(0.0018, 0.0018, 0.24, stick, { x: -0.01, rz: Math.PI / 2 }, 4));
    for (let i = 0; i < 4; i++) {
      const isNegi = s % 2 === 1 && i % 2 === 1;
      const m = K.mesh(chunk, isNegi ? negi : (i % 2 ? meat2 : meat), { x: -0.06 + i * 0.034 });
      m.scale.set(isNegi ? 0.8 : 1.15, isNegi ? 0.8 : 0.85, isNegi ? 0.8 : 1);
      sk.add(m);
    }
    sk.position.set(0, 0.03, z);
    sk.rotation.y = tilt;
    p.add(sk);
  }
  p.add(K.mesh(new THREE.SphereGeometry(0.018, 8, 4, 0, Math.PI), K.mat('#f2d64a', { rough: 0.4 }), { x: 0.12, y: 0.016, z: 0.04, rx: -Math.PI / 2 })); // lemon
  return p;
}

function sakeSet(A, M) {
  const s = new THREE.Group();
  s.add(K.rbox(0.22, 0.012, 0.13, 0.005, M.lacquer, {}));
  if (!A.tokkuriReg) A.tokkuriReg = A.region(64, 64, (c, W, Hh) => {
    c.fillStyle = '#f2ece0'; c.fillRect(0, 0, W, Hh);
    c.fillStyle = '#2f4a7a'; c.fillRect(0, Hh * 0.38, W, Hh * 0.08); c.fillRect(0, Hh * 0.52, W, Hh * 0.03);
    for (let i = 0; i < 6; i++) { c.beginPath(); c.arc((i + 0.5) * W / 6, Hh * 0.7, 3, 0, Math.PI * 2); c.fill(); }
  });
  const pts = [[0.026, 0], [0.034, 0.006], [0.042, 0.04], [0.04, 0.07], [0.022, 0.1], [0.011, 0.125], [0.012, 0.14], [0.017, 0.15]].map(([r, y]) => new THREE.Vector2(r, y));
  const tk = A.remap(new THREE.LatheGeometry(pts, 14), A.tokkuriReg);
  s.add(K.mesh(tk, A.bucket.gloss, { x: -0.05, y: 0.012 }));
  for (const [x, z] of [[0.045, -0.025], [0.07, 0.035]]) {
    s.add(K.cyl(0.021, 0.015, 0.03, M.cream, { x, y: 0.012, z }, 12));
    s.add(K.cyl(0.018, 0.018, 0.002, K.mat('#e9e2c8', { rough: 0.05 }), { x, y: 0.036, z }, 12));
  }
  return s;
}

function condiments(M) {
  const c = new THREE.Group();
  c.add(K.cyl(0.022, 0.024, 0.08, K.mat('#3a2418', { rough: 0.15 }), { x: -0.04 }, 10)); // soy sauce
  c.add(K.cyl(0.024, 0.024, 0.022, K.mat('#c8352a', { rough: 0.4 }), { x: -0.04, y: 0.08 }, 10));
  c.add(K.cyl(0.016, 0.016, 0.07, K.mat('#b53a22', { rough: 0.5 }), { x: 0.01 }, 8)); // shichimi
  c.add(K.cyl(0.013, 0.016, 0.018, K.mat('#2f2620', { rough: 0.5 }), { x: 0.01, y: 0.07 }, 8));
  c.add(K.box(0.05, 0.09, 0.05, M.light, { x: 0.065 })); // chopstick box
  for (let i = 0; i < 5; i++) c.add(K.box(0.006, 0.05, 0.006, K.mat('#d8b98a'), { x: 0.052 + (i % 3) * 0.012, y: 0.09, z: -0.01 + Math.floor(i / 3) * 0.014 }));
  return c;
}

function bigBowl(M, food, top, i) {
  const b = new THREE.Group();
  b.add(K.cyl(0.14, 0.07, 0.055, i % 2 ? M.indigo : K.mat('#6a4a32', { rough: 0.3 }), {}, 18));
  const mound = K.mesh(new THREE.SphereGeometry(0.11, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), K.mat(food, { rough: 0.6 }), { y: 0.04 });
  mound.scale.y = 0.42;
  b.add(mound);
  const r = K.rng(30 + i);
  const bit = new THREE.IcosahedronGeometry(0.018, 0);
  for (let k = 0; k < 7; k++) b.add(K.mesh(bit, K.mat(top, { rough: 0.5 }), { x: (r() - 0.5) * 0.12, y: 0.075 + r() * 0.01, z: (r() - 0.5) * 0.1 }));
  return b;
}

function netaCase(M) {
  const n = new THREE.Group();
  const w = 0.92; const d = 0.24; const h = 0.22;
  n.add(K.box(w, 0.03, d, M.steel, {}));
  n.add(K.box(w, 0.012, d - 0.02, K.mat('#f4f4f0', { rough: 0.3 }), { y: 0.03 }));
  n.add(K.box(w, h - 0.03, d, M.glass, { y: 0.03, cast: false }));
  n.add(K.box(w + 0.01, 0.015, d + 0.01, M.steel, { y: h }));
  for (const x of [-w / 2, w / 2]) n.add(K.box(0.015, h, d, M.steel, { x }));
  const fish = [['#b8323a', 0.14], ['#f08a5a', 0.13], ['#f2eee6', 0.12], ['#a8424a', 0.1], ['#f4e6cf', 0.1], ['#c8323a', 0.12]];
  let x = -w / 2 + 0.08;
  fish.forEach(([c, len], i) => {
    n.add(K.rbox(len, 0.04, 0.08, 0.012, K.mat(c, { rough: 0.3 }), { x: x + len / 2, y: 0.042, z: (i % 2) * 0.02 - 0.01 }));
    x += len + 0.02;
  });
  for (let i = 0; i < 5; i++) n.add(K.box(0.04, 0.012, 0.05, K.mat('#5f9a3c', { rough: 0.6 }), { x: -w / 2 + 0.15 + i * 0.16, y: 0.042, z: 0.07 }));
  return n;
}

// =================================================================== kitchen
function yakitoriGrill(A, M, lit) {
  const gr = new THREE.Group();
  const w = 1.0; const d = 0.3;
  gr.add(K.box(w, 0.2, d, K.mat('#3b3a38', { metal: 0.5, rough: 0.5 }), {}));
  gr.add(K.box(w + 0.04, 0.03, 0.04, M.steel, { y: 0.19, z: d / 2 }));
  gr.add(K.box(w + 0.04, 0.03, 0.04, M.steel, { y: 0.19, z: -d / 2 }));
  const coals = A.region(96, 32, (c, W, Hh) => {
    c.fillStyle = '#4a1c0e'; c.fillRect(0, 0, W, Hh);
    const r = K.rng(5);
    for (let i = 0; i < 70; i++) { c.fillStyle = ['#ff7a2a', '#ffb050', '#e2461c', '#2a1a14'][Math.floor(r() * 4)]; c.beginPath(); c.arc(r() * W, r() * Hh, 2 + r() * 4, 0, Math.PI * 2); c.fill(); }
  });
  gr.add(A.plane(w - 0.04, d - 0.06, coals, { glow: true, rx: -Math.PI / 2, y: 0.17 }));
  for (let i = 0; i < 9; i++) gr.add(K.box(0.006, 0.006, d - 0.04, M.steelDark, { x: -w / 2 + 0.06 + i * 0.11, y: 0.2 }));
  // skewers across the grill
  const stick = K.mat('#d9bf8a', { rough: 0.6 });
  const meat = K.mat('#9a5a2a', { rough: 0.45 }); const raw = K.mat('#e6b8a0', { rough: 0.5 });
  const chunk = new THREE.IcosahedronGeometry(0.015, 0);
  for (let i = 0; i < 8; i++) {
    const x = -w / 2 + 0.1 + i * 0.11;
    gr.add(rod(0.0018, 0.0018, d + 0.12, stick, { x, y: 0.215, z: 0.05, rx: Math.PI / 2 }, 4));
    for (let k = 0; k < 4; k++) gr.add(K.mesh(chunk, i % 3 === 0 ? raw : meat, { x, y: 0.215, z: -0.09 + k * 0.045 }));
  }
  if (lit) gr.add(A.box(w - 0.04, 0.012, 0.004, A.solid('#ff8a3a'), A.solid('#ff8a3a'), { glow: true, y: 0.17, z: d / 2 + 0.002, cast: false }));
  return { group: gr };
}

/** A little smoke rising from the grill: soft Points whose alpha follows each puff's life. */
function smokePuffs(x, y, z, spread) {
  const N = 26; const life = 2.8;
  const pos = new Float32Array(N * 3); const col = new Float32Array(N * 4);
  const r = K.rng(21);
  const puffs = Array.from({ length: N }, (_, i) => ({ age: (i / N) * life, x0: (r() - 0.5) * spread, z0: (r() - 0.5) * 0.18, ph: r() * 6 }));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.3, map: softDot(), transparent: true, depthWrite: false, vertexColors: true, sizeAttenuation: true }));
  pts.frustumCulled = false;
  pts.position.set(x, y, z);
  const update = (dt) => {
    for (let i = 0; i < N; i++) {
      const p = puffs[i];
      p.age += dt;
      if (p.age > life) { p.age -= life; p.x0 = (r() - 0.5) * spread; }
      const k = p.age / life;
      pos[i * 3] = p.x0 + Math.sin(p.age * 1.3 + p.ph) * 0.05 + k * 0.08;
      pos[i * 3 + 1] = k * 0.85;
      pos[i * 3 + 2] = p.z0 + k * 0.1;
      const a = Math.sin(Math.PI * k) * 0.3;
      col.set([0.86, 0.84, 0.8, a], i * 4);
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  };
  update(0);
  return { points: pts, update };
}

let softDotTex = null;
function softDot() {
  if (softDotTex) return softDotTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  softDotTex = new THREE.CanvasTexture(c);
  softDotTex.colorSpace = THREE.SRGBColorSpace;
  return softDotTex;
}

function beerServer(A, M) {
  const s = new THREE.Group();
  s.add(K.rbox(0.3, 0.42, 0.3, 0.03, M.steel, {}));
  const plate = A.textAtlas.region(120, 60, (c, W, Hh) => {
    c.fillStyle = '#1d2a4a'; c.fillRect(0, 0, W, Hh);
    c.fillStyle = '#f4d27a'; c.font = `800 ${Hh * 0.42}px ${K.JP_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('ほしぞら', W / 2, Hh * 0.4);
    c.fillStyle = '#ffffff'; c.font = `700 ${Hh * 0.24}px ${K.JP_FONT}`; c.fillText('生ビール', W / 2, Hh * 0.78);
  });
  s.add(A.textAtlas.plane(0.24, 0.12, plate, { y: 0.3, z: 0.152 }));
  for (const x of [-0.07, 0.07]) {
    s.add(rod(0.012, 0.012, 0.08, M.steel, { x, y: 0.2, z: 0.18, rx: Math.PI / 2 }, 8));
    s.add(rod(0.012, 0.016, 0.12, M.black, { x, y: 0.29, z: 0.21 }, 8));
  }
  s.add(K.box(0.26, 0.02, 0.1, M.steelDark, { y: 0.0, z: 0.2 }));
  return s;
}

function cuttingBoard(M) {
  const b = new THREE.Group();
  b.add(K.box(0.45, 0.03, 0.28, K.mat('#efe2c4', { rough: 0.7 }), {}));
  b.add(K.box(0.2, 0.004, 0.035, M.steel, { x: 0.05, y: 0.03, z: 0.05, ry: 0.3 }));
  b.add(K.box(0.1, 0.02, 0.025, M.black, { x: -0.1, y: 0.03, z: 0.1, ry: 0.3 }));
  b.add(K.rbox(0.12, 0.05, 0.06, 0.02, K.mat('#e8e6dc', { rough: 0.4 }), { x: -0.12, y: 0.03, z: -0.05 })); // tofu
  return b;
}

function riceCooker(M) {
  const r = new THREE.Group();
  r.add(K.cyl(0.18, 0.18, 0.26, K.mat('#efe9dc', { rough: 0.3 }), {}, 16));
  r.add(K.cyl(0.17, 0.18, 0.05, M.steel, { y: 0.26 }, 16));
  r.add(K.box(0.08, 0.04, 0.04, M.black, { y: 0.3 }));
  return r;
}

function stockPot(M, r = 0.16) {
  const p = new THREE.Group();
  p.add(K.cyl(r, r, r * 1.6, M.steel, {}, 16));
  p.add(K.cyl(r * 1.02, r * 1.02, 0.02, M.steelDark, { y: r * 1.6 }, 16));
  p.add(K.cyl(0.02, 0.02, 0.03, M.black, { y: r * 1.6 + 0.02 }, 8));
  return p;
}

function sakeBottle(A, M, color, label, scale = 1) {
  const b = new THREE.Group();
  const glassM = K.mat(color, { rough: 0.12 });
  const s = scale;
  b.add(K.cyl(0.05 * s, 0.05 * s, 0.25 * s, glassM, {}, 12));
  b.add(K.cyl(0.018 * s, 0.05 * s, 0.07 * s, glassM, { y: 0.25 * s }, 12));
  b.add(K.cyl(0.016 * s, 0.018 * s, 0.07 * s, glassM, { y: 0.32 * s }, 10));
  b.add(K.cyl(0.019 * s, 0.019 * s, 0.025 * s, K.mat('#c9a253', { metal: 0.6, rough: 0.35 }), { y: 0.39 * s }, 10));
  const l = A.textAtlas.plane(0.055 * s, 0.13 * s, label, {});
  l.position.set(0, 0.13 * s, 0.051 * s);
  b.add(l);
  return b;
}

// =================================================================== the far things
/** A paper lantern (chōchin): a lathe body with an atlas texture, black caps; glows at night. */
function chochin(region, R, h, M, glow) {
  const grp = new THREE.Group();
  const pts = [];
  const n = 12;
  for (let i = 0; i <= n; i++) { const t = i / n; pts.push(new THREE.Vector2(R * (0.62 + 0.38 * Math.sin(Math.PI * t)), -h / 2 + h * t)); }
  const geo = new THREE.LatheGeometry(pts, 18);
  const A = region.atlas;
  A.remap(geo, region);
  grp.add(K.mesh(geo, glow ? A.glow : A.material, { cast: !glow }));
  grp.add(rod(R * 0.66, R * 0.66, h * 0.07, M.black, { y: h / 2 }, 16));
  grp.add(rod(R * 0.66, R * 0.66, h * 0.07, M.black, { y: -h / 2 }, 16));
  grp.add(rod(0.004, 0.004, 0.08, M.black, { y: h / 2 + 0.06 }, 4));
  return grp;
}

function paperTex(c, W, Hh, base, band) {
  c.fillStyle = base; c.fillRect(0, 0, W, Hh);
  for (let i = 1; i < 10; i++) { c.fillStyle = 'rgba(60,20,10,0.25)'; c.fillRect(0, i * Hh / 10, W, 1.5); }
  c.fillStyle = band; c.fillRect(0, 0, W, Hh * 0.1); c.fillRect(0, Hh * 0.9, W, Hh * 0.1);
  c.fillRect(0, Hh * 0.45, W, Hh * 0.06);
}

/** fillText that shrinks the font until the text fits maxW. */
function fitText(c, t, x, y, maxW, size, weight = 700) {
  let s = size;
  c.font = `${weight} ${s}px ${K.JP_FONT}`;
  while (c.measureText(t).width > maxW && s > 6) { s *= 0.94; c.font = `${weight} ${s}px ${K.JP_FONT}`; }
  c.fillText(t, x, y);
}

/** Text written top to bottom (縦書き): ー turns, small kana shift to the upper right. */
function drawVertical(c, cx, y0, text, size, color, weight = 800) {
  c.fillStyle = color; c.font = `${weight} ${size}px ${K.JP_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  let y = y0 + size / 2;
  for (const ch of text) {
    if (ch === ' ') { y += size * 0.4; continue; }
    if ('ー〜－'.includes(ch)) { c.save(); c.translate(cx, y); c.rotate(Math.PI / 2); c.fillText(ch, 0, 0); c.restore(); }
    else if ('ゃゅょっャュョッぁぃぅぇぉァィゥェォ'.includes(ch)) c.fillText(ch, cx + size * 0.12, y - size * 0.1);
    else c.fillText(ch, cx, y);
    y += size * 1.02;
  }
  return y;
}

/** One hand-written wooden menu strip: dish name in ink, the price in red underneath. */
function drawStrip(c, W, Hh, name, price, i) {
  const r = K.rng(40 + i);
  const paper = i % 4 === 3;
  c.fillStyle = paper ? '#f4ead2' : ['#e8cf9c', '#e3c690', '#ecd6a8'][i % 3];
  c.fillRect(0, 0, W, Hh);
  if (!paper) for (let k = 0; k < 14; k++) { c.strokeStyle = `rgba(120,80,40,${0.08 + r() * 0.1})`; c.lineWidth = 1; const x = r() * W; c.beginPath(); c.moveTo(x, 0); c.bezierCurveTo(x + 4, Hh * 0.3, x - 4, Hh * 0.7, x + 2, Hh); c.stroke(); }
  c.strokeStyle = 'rgba(90,55,25,0.55)'; c.lineWidth = 3; c.strokeRect(1.5, 1.5, W - 3, Hh - 3);
  c.fillStyle = '#3a2a1c'; c.beginPath(); c.arc(W / 2, Hh * 0.035, 3, 0, Math.PI * 2); c.fill();
  const nameN = [...name].length; const priceN = [...price].length;
  const top = Hh * 0.07; const avail = Hh * 0.9;
  const s = Math.min(W * 0.74, avail / (nameN * 1.02 + priceN * 0.78 * 1.02 + 0.35));
  const after = drawVertical(c, W / 2, top, name, s, '#1b1410', 800);
  drawVertical(c, W / 2, after - s / 2 + s * 0.35, price, s * 0.78, '#b0261c', 800);
}

function fishTank(A, T, M) {
  const grp = new THREE.Group();
  const TW = 1.2; const TD = 0.5; const B = 0.7; const TH = 0.58;
  grp.add(K.box(TW, B, TD, K.mat('#4a3020', { rough: 0.55 }), {}));
  grp.add(K.box(TW + 0.04, 0.04, TD + 0.04, M.dark, { y: B - 0.02 }));
  grp.add(T.text([{ t: 'いけす', scale: 1 }], 0.3, 0.1, { bg: '#f1e6cc', fg: '#2a1c14', border: '#2a1c14', radius: 0.12 }));
  grp.children[grp.children.length - 1].position.set(-0.35, 0.5, TD / 2 + 0.003);
  grp.add(K.box(TW - 0.04, 0.04, TD - 0.04, K.mat('#b9ab8c', { rough: 0.95 }), { y: B + 0.02 })); // gravel
  const rockM = K.mat('#6f6a62', { rough: 0.9 });
  for (const [x, z, s] of [[-0.35, -0.08, 0.07], [0.3, 0.05, 0.05], [0.05, -0.12, 0.045]]) grp.add(K.mesh(new THREE.DodecahedronGeometry(s, 0), rockM, { x, y: B + 0.06, z }));
  const weed = K.mat('#4f8a46', { rough: 0.7 });
  for (const [x, z, h] of [[-0.45, -0.12, 0.22], [-0.4, -0.1, 0.16], [0.42, -0.14, 0.2], [0.47, -0.11, 0.26]]) grp.add(K.mesh(new THREE.ConeGeometry(0.015, h, 4), weed, { x, y: B + 0.04 + h / 2, z }));
  const back = A.region(128, 64, (c, W, Hh) => {
    const gr = c.createLinearGradient(0, 0, 0, Hh);
    gr.addColorStop(0, '#9fdcea'); gr.addColorStop(0.6, '#4f9fb8'); gr.addColorStop(1, '#2f6f86');
    c.fillStyle = gr; c.fillRect(0, 0, W, Hh);
    const r = K.rng(9);
    for (let i = 0; i < 30; i++) { c.fillStyle = `rgba(255,255,255,${r() * 0.18})`; c.beginPath(); c.arc(r() * W, r() * Hh * 0.6, 2 + r() * 6, 0, Math.PI * 2); c.fill(); }
  });
  grp.add(A.plane(TW - 0.05, TH - 0.06, back, { glow: true, y: B + TH / 2, z: -TD / 2 + 0.02 }));
  grp.add(K.box(TW - 0.02, TH, TD - 0.02, M.glass, { y: B, cast: false }));
  grp.add(K.box(TW - 0.05, TH - 0.08, TD - 0.05, K.mat('#6fc4c8', { rough: 0.1, opacity: 0.16, emissive: '#0d3a40' }), { y: B + 0.01, cast: false }));
  const frame = K.mat('#2b2a28', { metal: 0.4, rough: 0.4 });
  for (const [x, z] of [[-TW / 2, -TD / 2], [TW / 2, -TD / 2], [-TW / 2, TD / 2], [TW / 2, TD / 2]]) grp.add(K.box(0.025, TH, 0.025, frame, { x, y: B, z }));
  grp.add(K.box(TW + 0.02, 0.05, TD + 0.02, frame, { y: B + TH }));
  grp.add(A.box(TW - 0.1, 0.012, 0.04, A.solid('#e6f6ff'), A.solid('#e6f6ff'), { glow: true, y: B + TH - 0.012, z: 0.1, cast: false, receive: false })); // tank light
  grp.add(rod(0.008, 0.008, TH - 0.02, M.steel, { x: 0.5, y: B + TH / 2, z: -0.17 }, 6)); // air pipe
  // fish (one InstancedMesh, swimming on ellipses) + rising bubbles
  const moving = new THREE.Group();
  const geo = fishGeometry();
  const fishMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35, metalness: 0.25 });
  const fishData = [
    ['#e46c5c', 1.25, 0.42, 0.13, 0.32, B + 0.3], ['#a9bccb', 1.0, 0.38, 0.11, -0.4, B + 0.2], ['#b8c6d2', 0.95, 0.4, 0.1, 0.45, B + 0.38],
    ['#9fb0bf', 1.0, 0.36, 0.14, -0.3, B + 0.12], ['#d9604e', 1.1, 0.33, 0.09, -0.36, B + 0.44], ['#8f8466', 1.05, 0.4, 0.12, 0.28, B + 0.26],
  ];
  const fish = new THREE.InstancedMesh(geo, fishMat, fishData.length);
  fishData.forEach(([c], i) => fish.setColorAt(i, new THREE.Color(c)));
  fish.castShadow = false; fish.receiveShadow = false;
  fish.frustumCulled = false;
  moving.add(fish);
  const NB = 14;
  const bpos = new Float32Array(NB * 3);
  const bgeo = new THREE.BufferGeometry();
  bgeo.setAttribute('position', new THREE.BufferAttribute(bpos, 3));
  const bubbles = new THREE.Points(bgeo, new THREE.PointsMaterial({ size: 0.02, color: '#e8f6ff', map: softDot(), transparent: true, depthWrite: false, opacity: 0.85 }));
  bubbles.frustumCulled = false;
  moving.add(bubbles);
  const dummy = new THREE.Object3D();
  const r = K.rng(3);
  const bub = Array.from({ length: NB }, () => ({ y: r() * (TH - 0.12), ph: r() * 6 }));
  const update = (dt, t) => {
    fishData.forEach(([, s, ax, bz, w, y], i) => {
      const a = t * w + i * 1.7;
      const x = Math.cos(a) * ax; const z = Math.sin(a) * bz;
      const vx = -Math.sin(a) * ax * w; const vz = Math.cos(a) * bz * w;
      dummy.position.set(x, y + Math.sin(t * 0.7 + i) * 0.02, z);
      dummy.rotation.set(0, Math.atan2(-vz, vx) + Math.sin(t * 6 + i) * 0.1, Math.sin(t * 0.5 + i) * 0.06);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      fish.setMatrixAt(i, dummy.matrix);
    });
    fish.instanceMatrix.needsUpdate = true;
    bub.forEach((b, i) => {
      b.y += dt * 0.16;
      if (b.y > TH - 0.12) b.y = 0;
      bpos.set([0.5 + Math.sin(t * 3 + b.ph) * 0.006, B + 0.06 + b.y, -0.17 + Math.cos(t * 2.5 + b.ph) * 0.006], i * 3);
    });
    bgeo.attributes.position.needsUpdate = true;
  };
  update(0, 0);
  return { group: grp, moving, update };
}

function fishGeometry() {
  const body = new THREE.SphereGeometry(1, 10, 6);
  body.scale(0.07, 0.028, 0.017);
  const tail = new THREE.ConeGeometry(0.028, 0.045, 4);
  tail.rotateZ(-Math.PI / 2);
  tail.scale(1, 1, 0.25);
  tail.translate(-0.084, 0, 0);
  const fin = new THREE.ConeGeometry(0.014, 0.03, 3);
  fin.scale(1.4, 1, 0.25);
  fin.translate(0.0, 0.03, 0);
  return mergeGeometries([body, tail, fin]);
}

function slidingDoor(A, M, pane, w, h) {
  const d = new THREE.Group();
  const fm = K.mat('#7a5534', { rough: 0.5 });
  d.add(K.box(w, 0.42, 0.035, fm, {}));
  d.add(K.box(w, 0.06, 0.04, fm, { y: h - 0.06 }));
  d.add(K.box(0.05, h, 0.04, fm, { x: -w / 2 + 0.025 }));
  d.add(K.box(0.05, h, 0.04, fm, { x: w / 2 - 0.025 }));
  d.add(A.plane(w - 0.1, h - 0.48, pane, { glow: true, y: 0.42 + (h - 0.48) / 2 }));
  for (let i = 1; i < 3; i++) d.add(K.box(0.018, h - 0.48, 0.03, fm, { x: -w / 2 + 0.05 + i * (w - 0.1) / 3, y: 0.42 }));
  for (let i = 1; i < 5; i++) d.add(K.box(w - 0.1, 0.018, 0.03, fm, { y: 0.42 + i * (h - 0.48) / 5 }));
  d.add(K.box(0.02, 0.1, 0.02, M.black, { x: w / 2 - 0.08, y: 0.95, z: 0.022 }));
  return d;
}

function doorGlass(c, W, Hh, lit) {
  const gr = c.createLinearGradient(0, 0, 0, Hh);
  if (lit) { gr.addColorStop(0, '#1a2034'); gr.addColorStop(1, '#2a3048'); }
  else { gr.addColorStop(0, '#e6ecec'); gr.addColorStop(1, '#f2eee4'); }
  c.fillStyle = gr; c.fillRect(0, 0, W, Hh);
  if (lit) { // the lantern outside glows through the frosted glass
    const rg = c.createRadialGradient(W * 0.7, Hh * 0.2, 2, W * 0.7, Hh * 0.2, W * 0.75);
    rg.addColorStop(0, 'rgba(255,120,60,0.85)'); rg.addColorStop(0.35, 'rgba(220,80,40,0.35)'); rg.addColorStop(1, 'rgba(220,80,40,0)');
    c.fillStyle = rg; c.fillRect(0, 0, W, Hh);
  }
  const r = K.rng(8);
  for (let i = 0; i < 500; i++) { c.fillStyle = `rgba(255,255,255,${r() * (lit ? 0.04 : 0.12)})`; c.fillRect(r() * W, r() * Hh, 2, 2); }
}

function umbrellaStand(M, rain) {
  const u = new THREE.Group();
  u.add(K.cyl(0.13, 0.12, 0.42, K.mat('#6a5444', { rough: 0.6 }), {}, 14));
  (rain ? ['#2f5f8a', '#c0504d', '#e8e4da'] : ['#2f5f8a']).forEach((c, i) => {
    const s = new THREE.Group();
    s.add(K.cyl(0.006, 0.006, 0.82, K.mat('#444'), {}, 6));
    s.add(K.cyl(0.012, 0.045, 0.42, K.mat(c, { rough: rain ? 0.2 : 0.7 }), { y: 0.36 }, 8));
    s.add(K.mesh(new THREE.TorusGeometry(0.03, 0.007, 6, 10, Math.PI), K.mat('#6b4a32'), { y: 0.84, x: 0.03 }));
    s.position.set(Math.cos(i * 2.1) * 0.05, 0.02, Math.sin(i * 2.1) * 0.05);
    s.rotation.set(Math.sin(i * 2.3) * 0.16, i, Math.cos(i * 2.3) * 0.16);
    u.add(s);
  });
  return u;
}

function register(A, M) {
  const r = new THREE.Group();
  const body = K.mat('#e6dcc4', { rough: 0.35 });
  r.add(K.box(0.32, 0.03, 0.34, M.black, {}));
  r.add(K.rbox(0.32, 0.1, 0.32, 0.02, body, { y: 0.02 }));
  r.add(K.rbox(0.28, 0.1, 0.16, 0.02, body, { y: 0.1, z: -0.07 }));
  const keys = A.region(64, 40, (c, w, h) => {
    c.fillStyle = '#d6ccb4'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 6; x++) { c.fillStyle = x > 3 ? '#c96a4a' : '#f8f4ea'; c.fillRect(3 + x * 10, 3 + y * 9, 8, 7); }
  });
  const kp = A.plane(0.26, 0.13, keys);
  kp.rotation.x = -1.0; kp.position.set(0, 0.135, 0.07);
  r.add(kp);
  const disp = A.textAtlas.region(60, 22, (c, W, Hh) => {
    c.fillStyle = '#1e2a22'; c.fillRect(0, 0, W, Hh);
    c.fillStyle = '#9be08a'; c.font = `700 ${Hh * 0.75}px monospace`; c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillText('2,860', W - 4, Hh / 2);
  });
  const dp = A.textAtlas.plane(0.13, 0.045, disp, {});
  dp.position.set(0, 0.235, -0.02); dp.rotation.x = -0.25;
  r.add(dp);
  r.add(K.box(0.14, 0.05, 0.03, M.black, { y: 0.2, z: -0.03 }));
  // a little tray for the change
  r.add(K.rbox(0.14, 0.012, 0.1, 0.01, M.lacquer, { x: 0.0, z: 0.25 }));
  return r;
}

function manekiNeko(A, M) {
  const n = new THREE.Group();
  const white = K.mat('#f7f3ea', { rough: 0.3 });
  const gold = K.mat('#e2b23a', { metal: 0.7, rough: 0.3 });
  const red = K.mat('#c8302a', { rough: 0.4 });
  n.add(K.rbox(0.16, 0.025, 0.13, 0.01, red, {}));
  const body = K.mesh(new THREE.SphereGeometry(0.07, 14, 10), white, { y: 0.095 });
  body.scale.set(1, 1.1, 0.85);
  n.add(body);
  const head = K.mesh(new THREE.SphereGeometry(0.065, 14, 10), white, { y: 0.215 });
  head.scale.set(1.12, 0.95, 0.92);
  n.add(head);
  for (const s of [-1, 1]) {
    n.add(K.mesh(new THREE.ConeGeometry(0.022, 0.04, 4), white, { x: s * 0.045, y: 0.275, rz: -s * 0.35 }));
    n.add(K.mesh(new THREE.ConeGeometry(0.012, 0.022, 4), K.mat('#f0a6a0', { rough: 0.5 }), { x: s * 0.046, y: 0.272, z: 0.008, rz: -s * 0.35 }));
  }
  const face = A.region(96, 64, (c, W, Hh) => {
    c.strokeStyle = '#2a2220'; c.lineWidth = 4; c.lineCap = 'round';
    for (const x of [W * 0.3, W * 0.7]) { c.beginPath(); c.arc(x, Hh * 0.42, W * 0.08, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); }
    c.fillStyle = '#e46a6a'; c.beginPath(); c.arc(W / 2, Hh * 0.58, 4, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#2a2220'; c.lineWidth = 2.5;
    c.beginPath(); c.arc(W * 0.45, Hh * 0.66, 5, 0.1, Math.PI - 0.1); c.stroke();
    c.beginPath(); c.arc(W * 0.55, Hh * 0.66, 5, 0.1, Math.PI - 0.1); c.stroke();
    c.lineWidth = 1.5; for (const s of [-1, 1]) for (const dy of [-4, 4]) { c.beginPath(); c.moveTo(W / 2 + s * 14, Hh * 0.62 + dy * 0.5); c.lineTo(W / 2 + s * 40, Hh * 0.6 + dy * 1.6); c.stroke(); }
    c.fillStyle = 'rgba(240,140,140,0.6)'; for (const x of [W * 0.2, W * 0.8]) { c.beginPath(); c.arc(x, Hh * 0.6, 6, 0, Math.PI * 2); c.fill(); }
  });
  n.add(A.plane(0.1, 0.066, face, { y: 0.21, z: 0.062 }));
  n.add(K.mesh(new THREE.TorusGeometry(0.048, 0.008, 6, 18), red, { y: 0.16, rx: Math.PI / 2 + 0.15 }));
  n.add(K.mesh(new THREE.SphereGeometry(0.013, 8, 6), gold, { y: 0.15, z: 0.055 }));
  const koban = A.textAtlas.region(48, 64, (c, W, Hh) => {
    c.fillStyle = '#e8bd4a'; c.beginPath(); c.ellipse(W / 2, Hh / 2, W / 2 - 1, Hh / 2 - 1, 0, 0, Math.PI * 2); c.fill();
    drawVertical(c, W / 2, Hh * 0.12, '千万両', Hh * 0.24, '#5a3a10', 800);
  });
  n.add(A.textAtlas.plane(0.045, 0.06, koban, { x: 0.03, y: 0.1, z: 0.066, rx: -0.1 }));
  n.add(K.mesh(new THREE.CapsuleGeometry(0.016, 0.03, 2, 6), white, { x: 0.04, y: 0.075, z: 0.05 }));
  // the beckoning paw (moves)
  const pivot = new THREE.Group();
  pivot.userData.dynamic = true;
  pivot.position.set(-0.055, 0.17, 0.02);
  const paw = K.mesh(new THREE.CapsuleGeometry(0.017, 0.05, 2, 6), white, { y: 0.04, z: 0.01 });
  pivot.add(paw);
  pivot.add(K.mesh(new THREE.SphereGeometry(0.008, 6, 4), K.mat('#f0a6a0', { rough: 0.5 }), { y: 0.075, z: 0.026 }));
  n.add(pivot);
  return { group: n, update: (dt, t) => { pivot.rotation.x = 0.15 + Math.sin(t * 2.6) * 0.32; } };
}

function specialsBoard(T, M, time, season) {
  const b = new THREE.Group();
  const w = 0.92; const h = 0.6;
  b.add(K.box(w + 0.06, h + 0.06, 0.03, M.dark, { y: -(h + 0.06) / 2 }));
  const lunch = time === 'morning' || time === 'noon';
  const items = lunch
    ? [['からあげ ていしょく', '８００円'], ['さしみ ていしょく', '９５０円'], ['ごはん・みそしる つき', '']]
    : ({
      spring: [['たけのこ ごはん', '４８０円'], ['なのはな おひたし', '３５０円']],
      summer: [['ひやし トマト', '３２０円'], ['えだまめ', '２８０円']],
      autumn: [['さんま しおやき', '６８０円'], ['きのこ バター', '４５０円']],
      winter: [['おでん もりあわせ', '５５０円'], ['かき フライ', '６８０円']],
    }[season] || [['さんま しおやき', '６８０円'], ['きのこ バター', '４５０円']]);
  const r = T.region(w * 380, h * 380, (c, W, Hh) => {
    c.fillStyle = '#f3e8cf'; c.fillRect(0, 0, W, Hh);
    c.textBaseline = 'middle';
    c.fillStyle = '#b0261c'; c.textAlign = 'center';
    fitText(c, lunch ? 'ランチ' : 'きょうの おすすめ', W / 2, Hh * 0.17, W * 0.9, Hh * 0.2, 800);
    c.fillStyle = '#3b2a1e'; c.font = `700 ${Hh * 0.09}px ${K.JP_FONT}`;
    c.fillText(lunch ? '11:30〜14:00' : '17:00〜23:00', W / 2, Hh * 0.33);
    items.forEach(([n, p], i) => {
      const y = Hh * (0.5 + i * 0.16);
      c.font = `700 ${Hh * 0.105}px ${K.JP_FONT}`; c.fillStyle = '#1f1712';
      if (!p) { c.textAlign = 'center'; c.font = `700 ${Hh * 0.085}px ${K.JP_FONT}`; c.fillText(n, W / 2, y); return; }
      c.textAlign = 'left'; fitText(c, n, W * 0.07, y, W * 0.6, Hh * 0.105, 700);
      c.textAlign = 'right'; c.fillStyle = '#b0261c'; fitText(c, p, W * 0.93, y, W * 0.26, Hh * 0.105, 700);
    });
  });
  b.add(T.plane(w, h, r, { z: 0.017 }));
  return b;
}

function beerPoster(T, M) {
  const w = 0.5; const h = 0.72;
  const r = T.region(w * 400, h * 400, (c, W, Hh) => {
    const gr = c.createLinearGradient(0, 0, 0, Hh);
    gr.addColorStop(0, '#13204a'); gr.addColorStop(1, '#3a2a6a');
    c.fillStyle = gr; c.fillRect(0, 0, W, Hh);
    const rr = K.rng(4);
    for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(255,250,220,${0.4 + rr() * 0.6})`; c.beginPath(); c.arc(rr() * W, rr() * Hh * 0.45, 1 + rr() * 1.6, 0, Math.PI * 2); c.fill(); }
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#f4d27a'; c.font = `800 ${W * 0.2}px ${K.JP_FONT}`; c.fillText('ほしぞら', W / 2, Hh * 0.12);
    c.fillStyle = '#ffffff'; c.font = `800 ${W * 0.15}px ${K.JP_FONT}`; c.fillText('生ビール', W / 2, Hh * 0.24);
    // the mug
    const mx = W * 0.3; const my = Hh * 0.36; const mw = W * 0.38; const mh = Hh * 0.38;
    c.fillStyle = '#e8a83a'; c.fillRect(mx, my + mh * 0.18, mw, mh * 0.82);
    c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(mx + mw * 0.12, my + mh * 0.25, mw * 0.1, mh * 0.65);
    c.fillStyle = '#fffaf0'; for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(mx + mw * (0.1 + i * 0.2), my + mh * 0.17, mw * 0.14, 0, Math.PI * 2); c.fill(); }
    c.strokeStyle = '#e8e2d0'; c.lineWidth = W * 0.035; c.beginPath(); c.arc(mx + mw, my + mh * 0.55, mh * 0.2, -Math.PI / 2, Math.PI / 2); c.stroke();
    c.fillStyle = '#f4d27a'; c.font = `800 ${W * 0.11}px ${K.JP_FONT}`; c.fillText('ジョッキ ５００円', W / 2, Hh * 0.86);
    c.fillStyle = '#c9c4e8'; c.font = `700 ${W * 0.055}px ${K.JP_FONT}`; c.fillText('HOSHIZORA BEER', W / 2, Hh * 0.94);
  });
  const p = new THREE.Group();
  p.add(K.box(w + 0.02, h + 0.02, 0.008, K.mat('#e9e2d2'), { y: -(h + 0.02) / 2 }));
  p.add(T.plane(w, h, r, { z: 0.009 }));
  const holder = new THREE.Group(); holder.add(p);
  return holder;
}

function highballPoster(T, M) {
  const w = 0.48; const h = 0.68;
  const r = T.region(w * 400, h * 400, (c, W, Hh) => {
    const gr = c.createLinearGradient(0, 0, 0, Hh);
    gr.addColorStop(0, '#2f8a86'); gr.addColorStop(1, '#bfe3d2');
    c.fillStyle = gr; c.fillRect(0, 0, W, Hh);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#ffffff'; c.font = `800 ${W * 0.17}px ${K.JP_FONT}`; c.fillText('そよかぜ', W / 2, Hh * 0.1);
    c.font = `800 ${W * 0.14}px ${K.JP_FONT}`; c.fillText('ハイボール', W / 2, Hh * 0.21);
    const gx = W * 0.36; const gy = Hh * 0.3; const gw = W * 0.28; const gh = Hh * 0.46;
    c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(gx, gy, gw, gh);
    c.fillStyle = 'rgba(240,210,120,0.75)'; c.fillRect(gx + 4, gy + gh * 0.15, gw - 8, gh * 0.82);
    c.fillStyle = 'rgba(255,255,255,0.7)'; for (let i = 0; i < 4; i++) c.fillRect(gx + 8 + (i % 2) * gw * 0.4, gy + gh * (0.2 + i * 0.17), gw * 0.35, gw * 0.3);
    c.fillStyle = '#f4e04a'; c.beginPath(); c.arc(gx + gw * 0.9, gy + gh * 0.05, gw * 0.28, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#1f4f4c'; c.font = `700 ${W * 0.075}px ${K.JP_FONT}`; c.fillText('すっきり さわやか', W / 2, Hh * 0.84);
    c.font = `800 ${W * 0.11}px ${K.JP_FONT}`; c.fillText('４５０円', W / 2, Hh * 0.93);
  });
  const p = new THREE.Group();
  p.add(K.box(w + 0.02, h + 0.02, 0.008, K.mat('#e9e2d2'), { y: -(h + 0.02) / 2 }));
  p.add(T.plane(w, h, r, { z: 0.009 }));
  const holder = new THREE.Group(); holder.add(p);
  return holder;
}

function sakePoster(T, M) {
  const w = 0.44; const h = 0.7;
  const r = T.region(w * 400, h * 400, (c, W, Hh) => {
    c.fillStyle = '#f2e9d4'; c.fillRect(0, 0, W, Hh);
    c.fillStyle = '#6f8aa6';
    c.beginPath(); c.moveTo(0, Hh * 0.62); c.lineTo(W * 0.3, Hh * 0.4); c.lineTo(W * 0.5, Hh * 0.52); c.lineTo(W * 0.72, Hh * 0.34); c.lineTo(W, Hh * 0.58); c.lineTo(W, Hh * 0.7); c.lineTo(0, Hh * 0.7); c.fill();
    c.fillStyle = '#c23a2c'; c.beginPath(); c.arc(W * 0.78, Hh * 0.14, W * 0.1, 0, Math.PI * 2); c.fill();
    drawVertical(c, W * 0.3, Hh * 0.06, 'やまびこ', Hh * 0.1, '#1f1a17', 800);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#2a2320'; c.font = `800 ${W * 0.13}px ${K.JP_FONT}`; c.fillText('日本酒', W / 2, Hh * 0.79);
    c.fillStyle = '#b0261c'; c.font = `800 ${W * 0.1}px ${K.JP_FONT}`; c.fillText('いっぱい ４５０円', W / 2, Hh * 0.9);
  });
  const p = new THREE.Group();
  p.add(K.box(w + 0.04, h + 0.04, 0.01, M.dark, { y: -(h + 0.04) / 2 }));
  p.add(T.plane(w, h, r, { z: 0.011 }));
  const holder = new THREE.Group(); holder.add(p);
  return holder;
}

function fujiPicture(T, M) {
  const w = 0.8; const h = 0.5;
  const r = T.region(w * 300, h * 300, (c, W, Hh) => {
    const gr = c.createLinearGradient(0, 0, 0, Hh); gr.addColorStop(0, '#f0d9b0'); gr.addColorStop(1, '#e8c890');
    c.fillStyle = gr; c.fillRect(0, 0, W, Hh);
    c.fillStyle = '#3f5f86'; c.beginPath(); c.moveTo(W * 0.1, Hh); c.lineTo(W * 0.45, Hh * 0.28); c.lineTo(W * 0.55, Hh * 0.28); c.lineTo(W * 0.9, Hh); c.fill();
    c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(W * 0.37, Hh * 0.45); c.lineTo(W * 0.45, Hh * 0.28); c.lineTo(W * 0.55, Hh * 0.28); c.lineTo(W * 0.63, Hh * 0.45); c.lineTo(W * 0.55, Hh * 0.4); c.lineTo(W * 0.5, Hh * 0.46); c.lineTo(W * 0.45, Hh * 0.4); c.fill();
    c.fillStyle = '#c23a2c'; c.beginPath(); c.arc(W * 0.8, Hh * 0.2, Hh * 0.09, 0, Math.PI * 2); c.fill();
  });
  const p = new THREE.Group();
  p.add(K.box(w + 0.06, h + 0.06, 0.03, M.dark, { y: -(h + 0.06) / 2 }));
  p.add(T.plane(w, h, r, { z: 0.016 }));
  const holder = new THREE.Group(); holder.add(p);
  return holder;
}

function tvSet(A, M) {
  const tv = new THREE.Group();
  tv.add(K.box(0.68, 0.4, 0.05, M.black, {}));
  const scr = A.textAtlas.region(200, 112, (c, W, Hh) => {
    c.fillStyle = '#3f8a3a'; c.fillRect(0, 0, W, Hh);
    c.fillStyle = '#5aa34a'; for (let i = 0; i < 8; i++) c.fillRect(0, i * Hh / 8, W, Hh / 16);
    c.fillStyle = '#c8a070'; c.beginPath(); c.moveTo(W / 2, Hh * 0.35); c.lineTo(W * 0.75, Hh * 0.62); c.lineTo(W / 2, Hh * 0.92); c.lineTo(W * 0.25, Hh * 0.62); c.fill();
    c.fillStyle = '#f4f4f0'; for (const [x, y] of [[0.5, 0.36], [0.74, 0.62], [0.26, 0.62], [0.5, 0.9]]) c.fillRect(W * x - 3, Hh * y - 3, 6, 6);
    c.fillStyle = 'rgba(20,24,40,0.85)'; c.fillRect(6, 6, 74, 26);
    c.fillStyle = '#ffffff'; c.font = `700 ${16}px ${K.JP_FONT}`; c.textBaseline = 'middle'; c.textAlign = 'left';
    c.fillText('3 - 2  7回', 10, 19);
  });
  tv.add(A.textAtlas.plane(0.62, 0.35, scr, { glow: true, y: 0.2, z: 0.026 }));
  return tv;
}

function daruma(A, M) {
  const d = new THREE.Group();
  const red = K.mat('#c8302a', { rough: 0.35 });
  const body = K.mesh(new THREE.SphereGeometry(0.075, 14, 10), red, { y: 0.075 });
  body.scale.set(1, 1.08, 0.95);
  d.add(body);
  const face = A.region(64, 64, (c, W, Hh) => {
    c.fillStyle = '#f6efe2'; c.beginPath(); c.ellipse(W / 2, Hh / 2, W * 0.46, Hh * 0.42, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#1f1a17';
    c.beginPath(); c.arc(W * 0.33, Hh * 0.45, 6, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#1f1a17'; c.lineWidth = 2; c.beginPath(); c.arc(W * 0.67, Hh * 0.45, 6, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 3; c.beginPath(); c.moveTo(W * 0.2, Hh * 0.28); c.lineTo(W * 0.42, Hh * 0.32); c.moveTo(W * 0.8, Hh * 0.28); c.lineTo(W * 0.58, Hh * 0.32); c.stroke();
    c.beginPath(); c.arc(W / 2, Hh * 0.62, 8, 0.2, Math.PI - 0.2); c.stroke();
  });
  d.add(A.plane(0.075, 0.07, face, { y: 0.095, z: 0.073 }));
  return d;
}

function smallPlant(scale, seed) {
  const p = new THREE.Group();
  p.add(K.cyl(0.06 * scale, 0.045 * scale, 0.09 * scale, K.mat('#8a5a3a', { rough: 0.8 }), {}, 10));
  const r = K.rng(seed);
  const leaf = new THREE.IcosahedronGeometry(0.04 * scale, 0);
  for (let i = 0; i < 9; i++) p.add(K.mesh(leaf, K.mat(i % 2 ? '#5f8f55' : '#4f7a4a', { rough: 0.8 }), { x: (r() - 0.5) * 0.1, y: (0.11 + r() * 0.1) * scale, z: (r() - 0.5) * 0.1 }));
  return p;
}

function tentMenu(A, M) {
  const grp = new THREE.Group();
  const w = 0.23; const h = 0.32; const lean = 0.3;
  const reg = A.textAtlas.region(w * 1250, h * 1250, (c, W, Hh) => {
    c.fillStyle = '#f7f0df'; c.fillRect(0, 0, W, Hh);
    c.strokeStyle = '#7a2e22'; c.lineWidth = W * 0.02; c.strokeRect(W * 0.03, W * 0.03, W - W * 0.06, Hh - W * 0.06);
    c.textBaseline = 'middle'; c.textAlign = 'center';
    c.fillStyle = '#7a2e22'; c.font = `800 ${Hh * 0.075}px ${K.JP_FONT}`; c.fillText('メニュー', W / 2, Hh * 0.085);
    c.fillStyle = '#2a201a'; c.font = `700 ${Hh * 0.036}px ${K.JP_FONT}`; c.fillText('いざかや だいち', W / 2, Hh * 0.145);
    const rows = [['のみもの'], ['生ビール', '500円'], ['ハイボール', '450円'], ['日本酒', '450円'], ['ウーロン茶', '250円'], ['たべもの'], ['やきとり', '300円'], ['えだまめ', '280円'], ['からあげ', '480円'], ['ひややっこ', '280円']];
    rows.forEach(([n, p], i) => {
      const y = Hh * (0.215 + i * 0.077);
      if (!p) {
        c.fillStyle = '#b0261c'; c.fillRect(W * 0.08, y - Hh * 0.026, W * 0.84, Hh * 0.052);
        c.fillStyle = '#fff6e6'; c.textAlign = 'center'; c.font = `800 ${Hh * 0.04}px ${K.JP_FONT}`; c.fillText(n, W / 2, y + 1);
        return;
      }
      c.fillStyle = '#1f1712'; c.font = `700 ${Hh * 0.05}px ${K.JP_FONT}`;
      c.textAlign = 'left'; c.fillText(n, W * 0.09, y);
      const nw = c.measureText(n).width;
      c.textAlign = 'right'; c.fillStyle = '#b0261c'; c.fillText(p, W * 0.92, y);
      c.fillStyle = 'rgba(60,40,30,0.35)';
      for (let x = W * 0.09 + nw + 8; x < W * 0.92 - c.measureText(p).width - 8; x += 7) c.fillRect(x, y + 2, 2.5, 2.5);
    });
  });
  const card = M.cream;
  const front = new THREE.Group();
  front.add(K.box(w, h, 0.004, card, { z: -0.002 }));
  front.add(A.textAtlas.plane(w * 0.98, h * 0.98, reg, { y: h / 2, z: 0.0015 }));
  front.rotation.x = -lean;
  front.position.z = Math.sin(lean) * h;
  grp.add(front);
  const back = new THREE.Group();
  back.add(K.box(w, h, 0.004, K.mat('#7a2e22', { rough: 0.4 }), { z: 0.002 }));
  back.rotation.x = lean;
  back.position.z = -Math.sin(lean) * h;
  grp.add(back);
  return grp;
}

// =================================================================== atlas (shared with cafe / konbini)
/** Sub-range [a, b] (0..1, along u) of an atlas region. */
function sub(r, a, b) { return { ...r, u0: r.u0 + (r.u1 - r.u0) * a, u1: r.u0 + (r.u1 - r.u0) * b }; }

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
