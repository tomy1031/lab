// clinic — いしだ クリニック (内科・小児科), a small town clinic (町の 医院).
// The learner stands in the waiting room (待合室) at the reception window (受付): the receptionist behind
// the counter; on the counter the tray for the 保険証, the 問診票 on a clipboard, a thermometer, pens, a bell
// and a medicine bag (薬袋). Around: the nearest bench just to the right, the companion to the left, a water
// dispenser, a health poster and the window (right wall), the entrance step with shoe lockers and slippers,
// the magazine rack and the kids' corner (behind), the clinic's name board, the clock and the calendar (left).
// Front-left, through the open sliding door, the consultation room (診察室): the doctor sits at her desk
// (monitor, keyboard, X-ray light box, stethoscope) turned toward the round patient stool (built.spots.seat —
// the learner walks there and sits); the examination bed with its paper sheet and curtain rail, a sink, a
// glass cabinet and a medical cart. Reacts to time (window views, clock, lights) and season (poster,
// calendar, flowers, the tree outside, a humidifier in winter) and to rain (umbrellas, streaks).
// Learner stands at the origin looking toward -z.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as K from '../kit.js';

export const meta = { indoor: true, ambience: 'office' };

// ---- layout (metres)
const H = 2.65;                                   // ceiling
const X0 = -4.2; const X1 = 3.6; const ZS = 3.8;  // west / east / south (entrance) walls
const XC = -0.6;                                  // partition: consultation room (west) | reception office (east)
const ZR = -1.3;                                  // reception wall with the counter windows (x > XC)
const ZK = -2.4;                                  // consultation-room wall with the doorway (x < XC)
const ZO = -3.5;                                  // back wall of the reception office
const ZN = -5.6;                                  // back wall of the consultation room
const TW = 0.1;                                   // partition thickness
const GX = 0.6; const GZ = 2.8; const GY = -0.1;  // 土間 (entrance floor, one step down) for x > GX, z > GZ
const WIN1 = { x0: -0.45, x1: 0.95, y0: 1.02, y1: 1.95 };  // 受付 window
const WIN2 = { x0: 1.6, x1: 2.6, y0: 1.02, y1: 1.95 };     // お会計・お薬 window
const CTR = { x0: -0.6, x1: 2.85, h: 1.02 };               // counter (top surface at h, front edge z = -0.83)
const DOOR = { x0: -2.2, x1: -1.3, h: 2.0 };       // doorway of the consultation room (sliding door open to the west)
const EWIN = { z0: 0.35, z1: 2.05, y0: 0.9, y1: 2.15 };    // waiting-room window in the east wall
const FWIN = { z0: -4.0, z1: -2.9, y0: 1.4, y1: 2.15 };    // frosted window above the examination bed
const ENT = { x0: 1.2, x1: 2.8, h: 2.2 };          // entrance doors in the south wall
const REC = { x: 0.25, z: -1.75 };                 // receptionist (standing behind the 受付 window)
const DOC = { x: -3.0, z: -4.45 };                 // doctor (sitting), turned toward the stool (+x)
const SEAT = { x: -1.9, z: -4.45 };                // round patient stool = the learner when seated (facing -x)
const NPC1 = { x: -1.0, z: -0.15 };                // companion beside the learner
const DOC_SIT = 0.48; const STOOL_SIT = 0.45;
const DESK = { x: -3.35, w: 1.5, d: 0.7, h: 0.72 }; // against the north wall of the consultation room
const BED = { x: -3.83, z: -3.45, w: 0.65, l: 1.8, h: 0.6 }; // along the west wall, head to the north

export default function build({ setup }) {
  const time = setup.time || 'morning';
  const season = setup.season || 'spring';
  const weather = setup.weather || 'clear';
  const night = time === 'night';
  const rain = weather === 'rain';
  const winter = season === 'winter';
  const env = { time, season, weather };
  const g = new THREE.Group();
  const A = makeAtlas(1024); const T = makeAtlas(1024);
  A.textAtlas = T; A.overflow = T; // big drawings spill into the text atlas
  const M = materials();
  const add = (o, x = 0, y = 0, z = 0, ry = 0, parent = g) => { o.position.set(x, y, z); o.rotation.y = ry; parent.add(o); return o; };
  const props = {};
  const prop = (id, obj, labelJa, labelEn) => (props[id] = K.prop(id, obj, { labelJa, labelEn }));

  // ------------------------------------------------------------------ floors & ceiling
  const floor = (x0, x1, z0, z1, m, y = 0, s = 1.6) => {
    const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0, Math.max(1, Math.ceil((x1 - x0) / 1.5)), Math.max(1, Math.ceil((z1 - z0) / 1.5)));
    worldUV(geo, (x0 + x1) / 2, -(z0 + z1) / 2, s);
    return add(K.mesh(geo, m, { rx: -Math.PI / 2, cast: false }), (x0 + x1) / 2, y, (z0 + z1) / 2);
  };
  floor(X0, X1, ZR, GZ, M.wood);            // waiting room
  floor(X0, XC, ZK, ZR, M.wood);            // alcove in front of the consultation room
  floor(X0, GX, GZ, ZS, M.wood);            // beside the entrance
  floor(GX, X1, GZ, ZS, M.genkan, GY, 1.2); // 土間
  floor(X0, XC, ZN, ZK, M.vinyl, 0, 1.8);   // consultation room
  floor(XC, X1, ZO, ZR, M.vinyl, 0, 1.8);   // reception office
  const cg = new THREE.PlaneGeometry(X1 - X0, ZS - ZN, 6, 6);
  worldUV(cg, (X0 + X1) / 2, (ZS + ZN) / 2, 1.2);
  add(K.mesh(cg, M.ceil, { rx: Math.PI / 2, cast: false }), (X0 + X1) / 2, H, (ZS + ZN) / 2);
  // the step up from the 土間 (wooden edge 上がり框)
  g.add(K.box(X1 - GX, 0.104, 0.06, M.oak, { x: (GX + X1) / 2, y: GY, z: GZ - 0.03 }));
  g.add(K.box(0.06, 0.104, ZS - GZ, M.oak, { x: GX - 0.03, y: GY, z: (GZ + ZS) / 2 }));

  // ------------------------------------------------------------------ walls (cream plaster above a mint wainscot)
  const wallPiece = (len, y0, y1, cx, cz, dx, dz, t) => {
    const geo = t ? new THREE.BoxGeometry(len, y1 - y0, t) : new THREE.PlaneGeometry(len, y1 - y0, Math.max(1, Math.round(len / 1.5)), 1);
    const pos = geo.attributes.position; const uv = geo.attributes.uv; const ym = (y0 + y1) / 2;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) + pos.getZ(i), (pos.getY(i) + ym) / H);
    const m = K.mesh(geo, M.wall, { cast: false });
    m.position.set(cx, ym, cz);
    m.rotation.y = Math.atan2(-dz, dx);
    g.add(m);
  };
  /** Wall from a to b (single plane facing left of a→b, or a box of thickness t) with rectangular holes. */
  const wallRun = (ax, az, bx, bz, holes = [], { y0 = 0, y1 = H, t = 0 } = {}) => {
    const len = Math.hypot(bx - ax, bz - az); const dx = (bx - ax) / len; const dz = (bz - az) / len;
    const piece = (s0, s1, p0, p1) => { if (s1 - s0 > 0.004 && p1 - p0 > 0.004) wallPiece(s1 - s0, p0, p1, ax + dx * (s0 + s1) / 2, az + dz * (s0 + s1) / 2, dx, dz, t); };
    let s = 0;
    for (const h of [...holes].sort((a, b) => a.s0 - b.s0)) { piece(s, h.s0, y0, y1); piece(h.s0, h.s1, y0, h.y0); piece(h.s0, h.s1, h.y1, y1); s = h.s1; }
    piece(s, len, y0, y1);
  };
  const xr = XC - TW / 2;
  wallRun(X0, ZN, xr, ZN);                                  // consultation room, north
  wallRun(xr, ZN, xr, ZO);                                  // consultation room, east (outside part)
  wallRun(XC + TW / 2, ZO, X1, ZO);                         // office, north
  wallRun(X1, ZO, X1, ZS, [{ s0: EWIN.z0 - ZO, s1: EWIN.z1 - ZO, y0: EWIN.y0, y1: EWIN.y1 }], { y0: GY });       // east
  wallRun(X1, ZS, X0, ZS, [{ s0: X1 - ENT.x1, s1: X1 - ENT.x0, y0: GY, y1: ENT.h }], { y0: GY });               // south
  wallRun(X0, ZS, X0, ZN, [{ s0: ZS - FWIN.z1, s1: ZS - FWIN.z0, y0: FWIN.y0, y1: FWIN.y1 }], { y0: GY });      // west
  wallRun(xr, ZR, X1, ZR, [WIN1, WIN2].map((w) => ({ s0: w.x0 - xr, s1: w.x1 - xr, y0: w.y0, y1: w.y1 })), { t: TW }); // reception
  wallRun(X0, ZK, xr, ZK, [{ s0: DOOR.x0 - X0, s1: DOOR.x1 - X0, y0: 0, y1: DOOR.h }], { t: TW });              // 診察室
  wallRun(XC, ZO, XC, ZR - TW / 2, [], { t: TW });          // office | alcove & consultation room

  // ------------------------------------------------------------------ ceiling lights, air conditioner
  const lampTex = A.solid('#fff8ec'); const bezel = A.solid('#e6e3dc');
  const lamp = (x, z, w = 0.6, d = 0.6) => {
    g.add(A.plane(w + 0.07, d + 0.07, bezel, { x, y: H - 0.004, z, rx: Math.PI / 2 }));
    g.add(A.plane(w, d, lampTex, { glow: true, x, y: H - 0.008, z, rx: Math.PI / 2 }));
  };
  for (const [x, z] of [[-2.7, -1.3], [-2.7, 1.2], [-0.4, 1.2], [1.8, 1.2], [0.7, -0.45], [1.9, 3.3], [-2.4, -3.6], [-3.5, -4.85], [1.4, -2.4]]) lamp(x, z);
  add(ceilingCassette(A), 0.7, H, 2.2);
  add(ceilingCassette(A), -2.3, H, -0.2);
  g.add(K.cyl(0.055, 0.06, 0.03, M.white, { x: -1.2, y: H - 0.03, z: 0.7 }, 12)); // smoke detector
  g.add(K.cyl(0.055, 0.06, 0.03, M.white, { x: -1.6, y: H - 0.03, z: -3.2 }, 12));
  const boost = night ? 1.35 : time === 'evening' ? 1.18 : 1;
  const pl = (x, z, i, col = '#fff1dc', y = 2.3) => { const l = new THREE.PointLight(col, i * boost, 8, 1.5); l.position.set(x, y, z); g.add(l); };
  pl(0.3, 0.7, 4.4);
  pl(-2.6, -0.5, 3.4);
  pl(-2.4, -4.0, 4.6, '#fbf7f0');
  pl(1.3, -2.5, 2.6);

  // ------------------------------------------------------------------ reception counter & windows (受付)
  const wz = ZR + TW / 2; // waiting-side face of the reception wall
  const cw = CTR.x1 - CTR.x0; const cmx = (CTR.x0 + CTR.x1) / 2;
  g.add(K.box(cw - 0.02, 0.1, 0.3, M.dark, { x: cmx, z: -1.1, cast: false }));            // recessed plinth
  g.add(K.box(cw, 0.8, 0.38, M.oak, { x: cmx, y: 0.1, z: -1.06 }));                      // wooden front
  g.add(K.box(cw + 0.004, 0.08, 0.384, M.mint, { x: cmx, y: 0.9, z: -1.06 }));           // mint band
  g.add(K.box(cw + 0.06, 0.04, 0.42, M.cream, { x: cmx, y: CTR.h - 0.04, z: -1.04 }));   // top (front edge -0.83)
  for (const w of [WIN1, WIN2]) {
    const wx = (w.x0 + w.x1) / 2; const ww = w.x1 - w.x0;
    g.add(K.box(ww, 0.04, 0.26, M.cream, { x: wx, y: CTR.h - 0.038, z: ZR - 0.08 }));    // ledge through the window
    add(openingFrame(ww, w.y1 - w.y0, TW + 0.04, M.white), wx, w.y0, ZR);
    for (const y of [w.y0 + 0.002, w.y1 - 0.028]) g.add(K.box(ww, 0.026, 0.07, M.alu, { x: wx, y, z: ZR, cast: false })); // rails
  }
  const pane = (x0, x1, zo) => {
    const y0 = WIN1.y0 + 0.028; const y1 = WIN1.y1 - 0.028; const w = x1 - x0; const cx = (x0 + x1) / 2;
    g.add(K.mesh(new THREE.PlaneGeometry(w - 0.03, y1 - y0 - 0.03), M.glass, { x: cx, y: (y0 + y1) / 2, z: ZR + zo, cast: false, receive: false }));
    for (const x of [x0 + 0.012, x1 - 0.012]) g.add(K.box(0.024, y1 - y0, 0.022, M.alu, { x, y: y0, z: ZR + zo, cast: false }));
    for (const y of [y0, y1 - 0.024]) g.add(K.box(w, 0.024, 0.022, M.alu, { x: cx, y, z: ZR + zo, cast: false }));
  };
  pane(WIN1.x0, -0.02, 0.017); pane(0.52, WIN1.x1, -0.017); pane(2.12, WIN2.x1, 0.017);
  add(A.text([{ t: '受付', scale: 1.1 }], 0.56, 0.22, { bg: '#3f9b74', fg: '#ffffff', radius: 0.25, ppm: 420 }), (WIN1.x0 + WIN1.x1) / 2, 2.23, wz + 0.004);
  add(A.text([{ t: 'お会計・お薬', scale: 0.92 }], 0.8, 0.2, { bg: '#f1e7d3', fg: '#5b4a36', radius: 0.25, ppm: 420 }), (WIN2.x0 + WIN2.x1) / 2, 2.23, wz + 0.004);
  g.add(K.box(0.54, 0.6, 0.016, M.oakSolid, { x: 1.275, y: 1.22, z: wz + 0.008 }));
  add(A.paint(0.5, 0.56, 440, drawHours), 1.275, 1.52, wz + 0.018);
  // a notice by the water dispenser
  add(A.paint(0.36, 0.26, 420, drawNotice), 3.2, 1.62, wz + 0.004);

  // on the counter (top at CTR.h); the learner's side is +z
  const CY = CTR.h;
  add(prop('insurance_card', cardTray(A, M), 'ほけんしょう', 'health insurance card'), -0.3, CY, -0.95, 0.05);
  add(tentCard(A, [{ t: '保険証・診察券は', scale: 0.9 }, { t: 'こちらへ', scale: 0.9 }], 0.2, 0.075, { bg: '#ffffff', fg: '#2f6b55', border: '#8fcab8' }), -0.3, CY, -1.14, 0.05);
  add(prop('questionnaire', clipboard(A, M), 'もんしんひょう', 'medical questionnaire'), 0.04, CY, -0.97, -0.06);
  add(prop('thermometer', thermometerSet(A, M), 'たいおんけい', 'thermometer'), 0.36, CY, -0.95, 0.2);
  add(bell(M), 0.6, CY, -0.94);
  add(tentCard(A, [{ t: 'ご用の 方は', scale: 0.85 }, { t: 'ベルを どうぞ', scale: 0.85 }], 0.12, 0.06, { bg: '#fff8e8', fg: '#5b4a36' }), 0.6, CY, -1.06, -0.1);
  add(penStand(M), -0.52, CY, -1.02);
  add(prop('medicine', medicineBag(A, M), 'くすり', 'medicine'), 0.74, CY, -1.13, -0.22);
  add(pumpBottle(M, '#d4ecf0'), 2.7, CY, -1.08);
  add(tentCard(A, [{ t: '手指消毒に', scale: 0.85 }, { t: 'ご協力ください', scale: 0.8 }], 0.13, 0.06, { bg: '#ffffff', fg: '#2f6b55' }), 2.52, CY, -1.02, -0.2);
  add(flowerVase(season, M), 1.3, CY, -1.08);
  add(cashTray(M), 2.1, CY, -1.0);
  if (winter) add(maskBox(A, M), 1.92, CY, -1.08, 0.15);

  // ------------------------------------------------------------------ the reception office (seen through the windows)
  add(chartShelf(A, M), 0.7, 0, ZO);
  add(medShelf(A, M), XC + TW / 2, 0, -2.75, Math.PI / 2);
  add(plainDesk(1.5, 0.65, M), 2.55, 0, ZO);
  add(monitor(A, M, drawOfficeScreen), 2.55, 0.72, ZO + 0.22);
  g.add(K.box(0.4, 0.016, 0.13, M.white, { x: 2.55, y: 0.72, z: ZO + 0.48 }));
  add(officeChair(M, 0.46, '#7d9fbf'), 2.55, 0, -2.55, Math.PI);
  add(printerCab(M), X1, 0, -1.95, -Math.PI / 2);
  add(K.plant(0.8, 21), 3.3, 0, -2.5);
  add(wallClock(A, M, ...clockTime(time), 0.13), 2.55, 1.85, ZO);

  // ------------------------------------------------------------------ waiting room: benches
  add(prop('bench', bench(1.3, M), 'ベンチ', 'bench'), 0.98, 0, 0.25, -Math.PI / 2); // nearest bench, right of the learner
  add(bench(1.3, M), 1.46, 0, 0.25, Math.PI / 2);                                     // back to back with it
  add(bench(1.4, M), X0 + 0.28, 0, -1.25, Math.PI / 2);                                // along the west wall
  add(bench(1.4, M), X0 + 0.28, 0, 0.45, Math.PI / 2);
  add(bench(1.5, M), X1 - 0.28, 0, 1.2, -Math.PI / 2);                                 // under the window
  add(bench(1.6, M), -2.15, 0, 1.55, Math.PI);                                         // a row facing the reception

  // ------------------------------------------------------------------ waiting room: walls & things on them
  add(prop('clinic_sign', clinicSign(A, M), 'いしだクリニックの かんばん', 'clinic sign'), X0, 1.78, -0.4, Math.PI / 2);
  const [hh, mm] = clockTime(time);
  add(prop('clock', wallClock(A, M, hh, mm, 0.17), 'とけい', 'clock'), -2.95, 2.33, ZK + TW / 2);
  add(prop('calendar', wallCalendar(A, M, { spring: 4, summer: 7, autumn: 10, winter: 2 }[season]), 'カレンダー', 'calendar'), -3.72, 1.55, ZK + TW / 2);
  add(prop('poster', posterFrame(A, M, season), 'ポスター', 'health poster'), X1, 1.47, -0.42, -Math.PI / 2);
  // east window (the view is painted outside, not part of the prop)
  const ew = EWIN.z1 - EWIN.z0; const eh = EWIN.y1 - EWIN.y0; const ezc = (EWIN.z0 + EWIN.z1) / 2;
  add(prop('window', windowUnit(ew, eh, M, night), 'まど', 'window'), X1, EWIN.y0, ezc, -Math.PI / 2);
  add(A.paint(ew + 0.9, eh + 0.8, 160, (c, W, Hh) => drawView(c, W, Hh, env, 'garden'), { glow: true }), X1 + 0.45, EWIN.y0 + eh / 2 + 0.05, ezc, -Math.PI / 2);
  // water dispenser + bin
  add(waterServer(A, M), 3.18, 0, wz);
  add(binCan(M), 3.47, 0, -1.08);
  // plants
  add(K.plant(1.0, 5), -0.93, 0, -2.13);
  add(K.plant(1.1, 8), -0.2, 0, 3.48);
  add(K.plant(1.0, 13), -3.93, 0, 1.52);
  // outlets
  for (const [x, z, ry] of [[X1 - 0.004, -0.9, -Math.PI / 2], [X0 + 0.004, 1.3, Math.PI / 2], [-1.7, ZS - 0.004, Math.PI], [-1.5, ZK + TW / 2 + 0.004, 0]]) add(outlet(M), x, 0.3, z, ry);
  if (winter) add(humidifier(A, M), -0.95, 0, 1.55, 0.3);

  // ------------------------------------------------------------------ behind the learner: entrance, slippers, magazines, kids' corner
  const ent = add(prop('door', entranceDoors(A, M), 'いりぐち', 'entrance'), (ENT.x0 + ENT.x1) / 2, GY, ZS, Math.PI);
  ent.traverse((o) => { o.castShadow = false; });
  add(A.paint(4.2, 3.2, 90, (c, W, Hh) => drawView(c, W, Hh, env, 'street'), { glow: true }), (ENT.x0 + ENT.x1) / 2, GY + 1.5, ZS + 1.3, Math.PI);
  add(K.mesh(new THREE.PlaneGeometry(4.2, 1.3), M.pave, { rx: -Math.PI / 2, cast: false }), (ENT.x0 + ENT.x1) / 2, GY + 0.002, ZS + 0.65);
  add(A.paint(1.2, 0.6, 220, (c, W, Hh) => drawDoormat(c, W, Hh, rain), { rx: -Math.PI / 2, receive: true }), (ENT.x0 + ENT.x1) / 2, GY + 0.006, ZS - 0.4);
  add(shoeLocker(A, M), X1, GY, 3.3, -Math.PI / 2);
  add(umbrellaStand(M, rain), 0.88, GY, 3.52);
  add(slipperRack(A, M), 2.98, 0, 2.53);
  add(prop('magazine', magazineRack(A, M), 'ざっし', 'magazines'), -1.15, 0, ZS, Math.PI);
  // kids' corner
  add(A.paint(1.5, 1.5, 130, drawKidsMat, { rx: -Math.PI / 2, receive: true }), -3.3, 0.006, 2.92);
  add(toyShelf(A, M), -3.3, 0, ZS, Math.PI);
  add(A.text([{ t: 'キッズコーナー', scale: 0.95 }], 0.62, 0.15, { bg: '#fff3c9', fg: '#d9733b', radius: 0.4, ppm: 420 }), -3.3, 1.2, ZS - 0.004, Math.PI);
  add(toyBlocks(M), -3.05, 0.006, 2.7, 0.4);
  add(teddy(M), -3.75, 0.006, 2.55, 0.6);
  add(framedPicture(A, M), -1.15, 1.75, ZS, Math.PI);

  // ------------------------------------------------------------------ the consultation room (診察室)
  add(openingFrame(DOOR.x1 - DOOR.x0, DOOR.h, TW + 0.04, M.oakSolid), (DOOR.x0 + DOOR.x1) / 2, 0, ZK);
  add(slidingDoor(M), -2.67, 0, ZK + TW / 2 + 0.05);                                   // slid open to the west
  g.add(K.box(2.0, 0.06, 0.06, M.alu, { x: -2.2, y: 2.04, z: ZK + TW / 2 + 0.05 }));   // its track
  g.add(K.box(DOOR.x1 - DOOR.x0, 0.006, TW + 0.04, M.alu, { x: (DOOR.x0 + DOOR.x1) / 2, z: ZK, cast: false })); // threshold
  add(A.text([{ t: '診察室', scale: 1.0 }], 0.42, 0.15, { bg: '#ffffff', fg: '#2f6b55', border: '#8fcab8', radius: 0.25, ppm: 460 }), (DOOR.x0 + DOOR.x1) / 2, 2.26, ZK + TW / 2 + 0.004);
  add(callDisplay(A), -0.95, 2.28, ZK + TW / 2 + 0.002);

  // the doctor's desk against the north wall, the doctor turned toward the patient stool
  add(prop('doctor_desk', doctorDesk(M), '先生の つくえ', "doctor's desk"), DESK.x, 0, ZN);
  const DY = DESK.h;
  add(monitor(A, M, drawScreen), -3.48, DY, ZN + 0.2, 0.75);
  add(keyboard(A, M), -3.18, DY, ZN + 0.52, 0.45);
  g.add(rb(0.06, 0.025, 0.1, 0.012, M.white, { x: -2.9, y: DY, z: ZN + 0.5 }));
  add(stethoscope(M), -2.86, DY, ZN + 0.3, 0.4);
  add(bpMonitor(A, M), -2.82, DY, ZN + 0.12, -0.3);
  add(pumpBottle(M, '#cfe9e2'), -2.7, DY, ZN + 0.6);
  add(tissueBox(M), -3.95, DY, ZN + 0.15, 0.1);
  add(penStand(M), -3.8, DY, ZN + 0.55);
  add(succulent(M), -4.02, DY, ZN + 0.5);
  add(lightBox(A, M), -3.48, 1.6, ZN);
  add(wallShelf(M), -3.48, 2.02, ZN);
  add(officeChair(M, DOC_SIT, '#6aa79a'), DOC.x + 0.08, 0, DOC.z, Math.PI / 2);
  add(roundStool(M), SEAT.x, 0, SEAT.z);
  add(basket(M), -1.86, 0, -3.86, 0.12);
  add(cart(M), -2.3, 0, ZN + 0.3);
  // the examination bed, its curtain rail and step
  add(prop('exam_bed', examBed(M), 'しんさつだい', 'examination bed'), BED.x, 0, BED.z);
  add(stepStool(M), -3.3, 0, -3.62, 0.05);
  const railX = -3.35; const railZ = -4.5;
  g.add(K.box(0.025, 0.03, ZK - TW / 2 - railZ, M.chrome, { x: railX, y: 2.38, z: (railZ + ZK - TW / 2) / 2, cast: false }));
  g.add(K.box(railX - X0, 0.03, 0.025, M.chrome, { x: (X0 + railX) / 2, y: 2.38, z: railZ, cast: false }));
  for (const [x, z] of [[railX, -2.6], [railX, -3.6], [railX, railZ], [-3.9, railZ]]) g.add(K.box(0.012, H - 2.4, 0.012, M.chrome, { x, y: 2.4, z, cast: false }));
  add(curtainBunch(M.curtain, 0.5, 2.05), railX, 0.32, -2.75, Math.PI / 2);
  add(curtainBunch(M.curtain, 0.48, 2.05), -3.93, 0.32, railZ);
  add(frostedWindow(A, M, env), X0, FWIN.y0, (FWIN.z0 + FWIN.z1) / 2, Math.PI / 2);
  // east side: sink, glass cabinet, scale; eye chart by the door
  add(sinkUnit(A, M), xr, 0, -3.15, -Math.PI / 2);
  add(cabinet(A, M), xr, 0, -5.1, -Math.PI / 2);
  add(scale(A, M), -1.05, 0, -4.2, -0.3);
  add(A.paint(0.3, 0.6, 330, drawEyeChart), -0.98, 1.45, ZK - TW / 2 - 0.004, Math.PI);
  add(A.paint(0.26, 0.18, 420, drawHandWash), xr - 0.004, 1.55, -2.72, -Math.PI / 2);
  add(wallClock(A, M, hh, mm, 0.12), xr, 2.1, -4.3, -Math.PI / 2);

  atlasize(g, A);
  return K.finalize({
    group: g,
    spawn: K.spot(0, 0, 0),
    slots: {
      npc1: K.spot(NPC1.x, NPC1.z, K.faceYaw(NPC1, { x: 0, z: 0 })),
      doctor: { ...K.spot(DOC.x, DOC.z, K.faceYaw(DOC, SEAT)), sit: DOC_SIT },
      reception: K.spot(REC.x, REC.z, K.faceYaw(REC, { x: 0, z: 0 })),
      phone: null,
    },
    props,
    // where the learner walks to and sits ("walk" / "sit"); yaw uses the spawn convention (0 = facing -z)
    spots: { seat: { pos: new THREE.Vector3(SEAT.x, 0, SEAT.z), yaw: Math.atan2(-(DOC.x - SEAT.x), -(DOC.z - SEAT.z)), sit: STOOL_SIT } },
    center: new THREE.Vector3(-0.3, 0, -0.9),
    radius: 6.3,
  });
}

// =================================================================== materials & helpers
function materials() {
  return {
    wood: K.mat('#ffffff', { map: K.woodTex('#dcc29a', [1, 1], 8), rough: 0.55 }),
    vinyl: K.mat('#ffffff', { map: K.tileTex('#eef0e8', '#e6ebe1', 6, [1, 1], '#d4dace'), rough: 0.4 }),
    genkan: K.mat('#ffffff', { map: K.tileTex('#c1bbaf', '#b4ad9f', 4, [1, 1], '#958f83'), rough: 0.75 }),
    ceil: K.mat('#ffffff', { map: K.tileTex('#f8f7f3', '#f5f4ef', 4, [1, 1], '#e3e1da'), rough: 1, emissive: '#57534b' }),
    wall: new THREE.MeshStandardMaterial({ map: wallTex(), roughness: 0.92 }),
    oak: K.mat('#ffffff', { map: K.woodTex('#dcbd92', [1, 1], 5), rough: 0.5 }),
    glass: K.mat('#e2f1f4', { rough: 0.05, metal: 0.1, opacity: 0.16, side: THREE.DoubleSide }),
    // plain colours (moved onto the atlas by atlasize)
    white: K.mat('#f5f3ee', { rough: 0.5 }),
    offwhite: K.mat('#e2ded5', { rough: 0.6 }),
    cream: K.mat('#f4eee1', { rough: 0.45 }),
    paper: K.mat('#fbfaf6', { rough: 0.85 }),
    oakSolid: K.mat('#d6b78d', { rough: 0.5 }),
    mint: K.mat('#8fcab8', { rough: 0.62 }),
    vinylBed: K.mat('#79b9a8', { rough: 0.55 }),
    seam: K.mat('#6a9c8e', { rough: 0.7 }),
    curtain: K.mat('#c6e6df', { rough: 0.9 }),
    alu: K.mat('#c6cbcf', { metal: 0.6, rough: 0.35 }),
    chrome: K.mat('#d4d8dc', { metal: 0.85, rough: 0.22 }),
    steel: K.mat('#b4b9bf', { metal: 0.5, rough: 0.4 }),
    dark: K.mat('#3b3e43', { rough: 0.5 }),
    black: K.mat('#2a2c30', { rough: 0.5 }),
    pave: K.mat('#a9a59c', { rough: 0.9 }),
  };
}

/** Plaster wall: skirting, mint wainscot, wooden chair rail, cream above (v = height / H, u = metres). */
function wallTex() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 512;
  const g = c.getContext('2d');
  const py = (y) => Math.round((1 - y / H) * 512);
  g.fillStyle = '#f6f1e5'; g.fillRect(0, 0, 64, 512);
  const r = K.rng(3);
  for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(${r() > 0.5 ? 255 : 120},${r() > 0.5 ? 250 : 110},${r() > 0.5 ? 240 : 100},0.04)`; g.fillRect(r() * 64, r() * 512, 1, 1); }
  g.fillStyle = '#d6ebe1'; g.fillRect(0, py(0.92), 64, py(0.09) - py(0.92));
  g.fillStyle = 'rgba(70,120,100,0.10)';
  for (let x = 0; x < 64; x += 16) g.fillRect(x, py(0.92), 1, py(0.09) - py(0.92));
  g.fillStyle = '#d2b48a'; g.fillRect(0, py(0.97), 64, py(0.92) - py(0.97));
  g.fillStyle = 'rgba(80,50,20,0.25)'; g.fillRect(0, py(0.92), 64, 1); g.fillRect(0, py(0.97), 64, 1);
  g.fillStyle = '#c8a77c'; g.fillRect(0, py(0.09), 64, 512 - py(0.09));
  g.fillStyle = 'rgba(80,50,20,0.3)'; g.fillRect(0, py(0.09), 64, 1);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  return t;
}

/** Planar UVs in metres for a PlaneGeometry (centre offset ox/oy so neighbouring pieces line up). */
function worldUV(geo, ox, oy, s) {
  const pos = geo.attributes.position; const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + ox) / s, (pos.getY(i) + oy) / s);
}

function rb(w, h, d, r, m, o = {}, seg = 2) {
  return K.mesh(new RoundedBoxGeometry(w, h, d, seg, Math.max(0.001, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001))), m, { ...o, y: (o.y ?? 0) + h / 2 });
}
function rod(r, len, m, o = {}, seg = 8) { return K.mesh(new THREE.CylinderGeometry(r, r, len, seg), m, o); }
function sphere(r, m, o = {}, w = 8, h = 6) { return K.mesh(new THREE.SphereGeometry(r, w, h), m, o); }
function put(parent, o, x = 0, y = 0, z = 0, ry = 0) { o.position.set(x, y, z); o.rotation.y = ry; parent.add(o); return o; }
function clockTime(time) { return { morning: [9, 20], noon: [11, 45], evening: [16, 50], night: [18, 40] }[time] || [9, 20]; }

/** Window / door frame around an opening (w × h, bottom at y = 0, centred), depth across the wall. */
function openingFrame(w, h, depth, m) {
  const f = new THREE.Group();
  f.add(K.box(w + 0.1, 0.05, depth, m, { y: h, cast: false }));
  for (const sx of [-1, 1]) f.add(K.box(0.05, h, depth, m, { x: sx * (w / 2 + 0.025), cast: false }));
  return f;
}

// =================================================================== furniture
/** Upholstered waiting-room bench facing +z, seat top 0.44, backrest at z ≈ -0.24. */
function bench(len, M) {
  const b = new THREE.Group();
  b.add(rb(len, 0.09, 0.44, 0.035, M.mint, { y: 0.35 }));
  const back = rb(len, 0.36, 0.08, 0.035, M.mint, { y: 0.5, z: -0.2 });
  back.rotation.x = -0.1;
  b.add(back);
  b.add(K.box(len - 0.06, 0.05, 0.38, M.oakSolid, { y: 0.3 }));
  b.add(K.box(len - 0.1, 0.22, 0.03, M.oakSolid, { y: 0.28, z: -0.2 }));
  for (const sx of [-1, 1]) b.add(K.box(0.05, 0.35, 0.42, M.oakSolid, { x: sx * (len / 2 - 0.07) }));
  const n = Math.max(1, Math.round(len / 0.5));
  for (let i = 1; i < n; i++) b.add(K.box(0.012, 0.004, 0.38, M.seam, { x: -len / 2 + i * len / n, y: 0.44, cast: false }));
  return b;
}

/** Office chair facing +z with the seat top at `seat`. */
function officeChair(M, seat, color) {
  const c = new THREE.Group();
  const fm = K.mat('#3e4246', { rough: 0.5 }); const sm = K.mat(color, { rough: 0.7 });
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2 + 0.3;
    const leg = K.box(0.04, 0.03, 0.28, fm);
    leg.position.set(Math.sin(a) * 0.14, 0.05, Math.cos(a) * 0.14); leg.rotation.y = a;
    c.add(leg);
    c.add(sphere(0.024, fm, { x: Math.sin(a) * 0.27, y: 0.024, z: Math.cos(a) * 0.27 }, 6, 4));
  }
  c.add(K.cyl(0.025, 0.025, seat - 0.13, M.chrome, { y: 0.06 }, 8));
  c.add(K.box(0.2, 0.04, 0.22, fm, { y: seat - 0.12 }));
  c.add(rb(0.5, 0.08, 0.48, 0.03, sm, { y: seat - 0.08 }));
  c.add(K.box(0.06, 0.3, 0.03, fm, { y: seat - 0.08, z: -0.25 }));
  const back = rb(0.46, 0.46, 0.06, 0.03, sm, { y: seat + 0.12, z: -0.27 });
  back.rotation.x = -0.1;
  c.add(back);
  return c;
}

/** Round patient stool (丸いす) with the seat top at STOOL_SIT. */
function roundStool(M) {
  const s = new THREE.Group();
  s.add(K.cyl(0.19, 0.185, 0.075, M.mint, { y: STOOL_SIT - 0.075 }, 20));
  s.add(K.cyl(0.16, 0.16, 0.02, M.chrome, { y: STOOL_SIT - 0.095 }, 14));
  s.add(K.cyl(0.024, 0.024, STOOL_SIT - 0.13, M.chrome, { y: 0.05 }, 8));
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2;
    const leg = K.box(0.035, 0.025, 0.24, M.chrome);
    leg.position.set(Math.sin(a) * 0.12, 0.05, Math.cos(a) * 0.12); leg.rotation.y = a;
    s.add(leg);
    s.add(sphere(0.022, M.dark, { x: Math.sin(a) * 0.23, y: 0.022, z: Math.cos(a) * 0.23 }, 6, 4));
  }
  return s;
}

/** Desk with the back at z = 0 (against a wall), user at +z, top at 0.72. */
function plainDesk(w, d, M) {
  const t = new THREE.Group();
  t.add(K.box(w, 0.03, d, M.cream, { y: 0.69, z: d / 2 }));
  for (const sx of [-1, 1]) t.add(K.box(0.04, 0.69, d - 0.06, M.white, { x: sx * (w / 2 - 0.04), z: d / 2 }));
  t.add(K.box(w - 0.1, 0.35, 0.02, M.white, { y: 0.32, z: 0.04 }));
  return t;
}

/** The doctor's desk: oak top, white drawer pedestal on the left, back at z = 0, user at +z. */
function doctorDesk(M) {
  const d = new THREE.Group(); const W = DESK.w; const D = DESK.d; const Hh = DESK.h;
  d.add(K.box(W, 0.035, D, M.oak, { y: Hh - 0.035, z: D / 2 }));
  d.add(K.box(0.42, Hh - 0.035, D - 0.04, M.white, { x: -W / 2 + 0.23, z: D / 2 - 0.02 }));
  for (let i = 0; i < 3; i++) {
    d.add(K.box(0.4, 0.006, 0.004, M.offwhite, { x: -W / 2 + 0.23, y: 0.24 + i * 0.16, z: D - 0.038, cast: false }));
    d.add(K.box(0.12, 0.014, 0.014, M.chrome, { x: -W / 2 + 0.23, y: 0.15 + i * 0.16, z: D - 0.035, cast: false }));
  }
  for (const z of [0.05, D - 0.05]) d.add(K.box(0.04, Hh - 0.035, 0.04, M.white, { x: W / 2 - 0.04, z }));
  d.add(K.box(W - 0.5, 0.36, 0.02, M.white, { x: 0.2, y: 0.3, z: 0.04 }));
  return d;
}

/** Desktop monitor facing +z with a glowing screen drawing. */
function monitor(A, M, draw) {
  const m = new THREE.Group();
  m.add(K.box(0.2, 0.014, 0.14, M.dark));
  m.add(K.box(0.04, 0.24, 0.025, M.dark, { z: -0.03 }));
  m.add(rb(0.56, 0.34, 0.03, 0.01, M.black, { y: 0.14, z: -0.01 }));
  m.add(A.paint(0.52, 0.3, 480, draw, { glow: true, y: 0.31, z: 0.0075 }));
  return m;
}
function keyboard(A, M) {
  const k = new THREE.Group();
  k.add(K.box(0.42, 0.016, 0.14, M.white));
  k.add(A.paint(0.4, 0.12, 420, drawKeys, { rx: -Math.PI / 2, y: 0.0165 }));
  return k;
}

function stethoscope(M) {
  const s = new THREE.Group();
  const tube = K.mat('#2f4a6b', { rough: 0.45 });
  s.add(K.mesh(new THREE.TorusGeometry(0.07, 0.0055, 5, 22), tube, { rx: Math.PI / 2, y: 0.006 }));
  s.add(K.mesh(new THREE.TorusGeometry(0.045, 0.005, 5, 16, Math.PI * 1.4), tube, { rx: Math.PI / 2, y: 0.012, x: 0.015, z: 0.01 }));
  s.add(K.mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.08, 5), tube, { x: 0.1, y: 0.006, z: 0.0, rz: Math.PI / 2 }));
  s.add(K.cyl(0.024, 0.024, 0.012, M.chrome, { x: 0.15, z: 0.0 }, 14));
  s.add(K.cyl(0.019, 0.019, 0.004, M.dark, { x: 0.15, y: 0.012, z: 0.0 }, 14));
  const bin = K.mesh(new THREE.TorusGeometry(0.055, 0.0035, 4, 12, Math.PI * 0.9), M.chrome, { rx: Math.PI / 2, y: 0.005, x: -0.07, z: -0.07 });
  s.add(bin);
  for (const [x, z] of [[-0.12, -0.08], [-0.02, -0.08]]) s.add(sphere(0.008, M.dark, { x, y: 0.008, z }, 6, 4));
  return s;
}

function bpMonitor(A, M) { // 血圧計
  const b = new THREE.Group();
  b.add(rb(0.15, 0.07, 0.12, 0.014, M.white));
  b.add(A.paint(0.08, 0.05, 900, drawBP, { rx: -Math.PI / 2, y: 0.0705, z: -0.01 }));
  b.add(rb(0.12, 0.035, 0.09, 0.014, K.mat('#5f7189', { rough: 0.8 }), { x: 0.16, z: 0.01 }));
  b.add(K.mesh(new THREE.TorusGeometry(0.04, 0.004, 4, 10, Math.PI), M.dark, { rx: Math.PI / 2, x: 0.08, y: 0.01, z: 0.07 }));
  return b;
}

function tissueBox(M) {
  const t = new THREE.Group();
  t.add(K.box(0.24, 0.09, 0.12, K.mat('#e8dcc7', { rough: 0.7 })));
  t.add(K.box(0.14, 0.004, 0.04, M.dark, { y: 0.09, cast: false }));
  const tis = K.box(0.08, 0.06, 0.004, M.paper, { y: 0.09 }); tis.rotation.z = 0.25; t.add(tis);
  return t;
}

function succulent(M) {
  const p = new THREE.Group();
  p.add(K.cyl(0.045, 0.035, 0.07, K.mat('#e7d9c3', { rough: 0.8 }), {}, 10));
  const leafM = K.mat('#7fae84', { rough: 0.7 });
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const l = sphere(0.022, leafM, { x: Math.cos(a) * 0.022, y: 0.085, z: Math.sin(a) * 0.022 }, 6, 4); l.scale.set(1, 0.7, 1); p.add(l); }
  p.add(sphere(0.02, leafM, { y: 0.1 }, 6, 4));
  return p;
}

/** X-ray light box (シャウカステン), centred, back at z = 0, facing +z. */
function lightBox(A, M) {
  const l = new THREE.Group();
  l.add(K.box(0.84, 0.56, 0.06, M.white, { y: -0.28, z: 0.03 }));
  l.add(A.paint(0.78, 0.5, 300, drawXray, { glow: true, z: 0.062 }));
  for (const x of [-0.18, 0.2]) l.add(K.box(0.07, 0.025, 0.02, M.chrome, { x, y: 0.21, z: 0.066, cast: false }));
  return l;
}
function wallShelf(M) { // a small wall shelf with binders, back at z = 0
  const s = new THREE.Group();
  s.add(K.box(0.95, 0.025, 0.22, M.white, { z: 0.11 }));
  const cols = ['#5d8fc9', '#7fbcae', '#e3a857', '#d9837a', '#9c8fc9', '#5d8fc9', '#f1f0ea'];
  cols.forEach((col, i) => s.add(K.box(0.05, 0.26 - (i % 3) * 0.02, 0.2, K.mat(col, { rough: 0.6 }), { x: -0.4 + i * 0.058, y: 0.025, z: 0.11 })));
  s.add(K.box(0.12, 0.1, 0.16, K.mat('#efe7d6'), { x: 0.3, y: 0.025, z: 0.1 }));
  return s;
}

/** Examination bed (診察台): long axis z, head raised at -z, open side +x, centred. */
function examBed(M) {
  const b = new THREE.Group(); const W = BED.w; const L = BED.l;
  b.add(K.box(W - 0.12, 0.06, L - 0.3, M.dark, { cast: false }));
  b.add(K.box(W - 0.06, 0.4, L - 0.14, M.white, { y: 0.06 }));
  for (const z of [-0.42, 0.0, 0.42]) b.add(K.box(0.006, 0.32, 0.006, M.offwhite, { x: (W - 0.06) / 2 + 0.002, y: 0.1, z, cast: false }));
  for (const z of [-0.21, 0.21]) b.add(K.box(0.012, 0.08, 0.012, M.chrome, { x: (W - 0.06) / 2 + 0.006, y: 0.28, z: z, cast: false }));
  b.add(K.box(W, 0.04, L, M.steel, { y: 0.46 }));
  const flat = L - 0.52;
  b.add(rb(W, 0.1, flat, 0.035, M.vinylBed, { y: 0.5, z: L / 2 - flat / 2 }));
  b.add(K.box(W - 0.13, 0.004, flat - 0.12, M.paper, { y: 0.6, z: L / 2 - flat / 2 + 0.02, cast: false })); // paper sheet
  const head = new THREE.Group();
  head.position.set(0, 0.5, -L / 2 + 0.52);
  head.rotation.x = 0.22;
  head.add(rb(W, 0.1, 0.5, 0.035, M.vinylBed, { z: -0.25 }));
  head.add(rb(0.4, 0.07, 0.24, 0.03, M.paper, { y: 0.09, z: -0.27 }));
  b.add(head);
  // paper roll at the foot end
  b.add(rod(0.042, 0.56, M.paper, { y: 0.66, z: L / 2 + 0.04, rz: Math.PI / 2 }, 12));
  for (const sx of [-1, 1]) b.add(K.box(0.015, 0.12, 0.06, M.chrome, { x: sx * 0.295, y: 0.56, z: L / 2 + 0.04 }));
  return b;
}
function stepStool(M) {
  const s = new THREE.Group();
  s.add(K.box(0.4, 0.17, 0.28, M.white));
  s.add(K.box(0.38, 0.015, 0.26, K.mat('#8a9aa0', { rough: 0.9 }), { y: 0.17 }));
  return s;
}
/** Gathered curtain hanging from y = h down to 0, folds along x, centred. */
function curtainBunch(m, w, h, n = 4) {
  const c = new THREE.Group(); const r = w / n / 2;
  const geo = new THREE.CylinderGeometry(r * 0.95, r * 1.15, h, 7, 1);
  for (let i = 0; i < n; i++) c.add(K.mesh(geo, m, { x: -w / 2 + r + i * 2 * r, y: h / 2, z: i % 2 ? 0.018 : -0.018 }));
  for (let i = 0; i < n + 2; i++) c.add(K.box(0.012, 0.03, 0.012, K.mat('#9aa3a8'), { x: -w / 2 + i * w / (n + 1), y: h, cast: false }));
  return c;
}

function basket(M) { // 荷物かご
  const b = new THREE.Group(); const m = K.mat('#c9a46e', { rough: 0.85 }); const d = K.mat('#a9824f', { rough: 0.85 });
  b.add(K.box(0.42, 0.02, 0.3, m));
  for (const sz of [-1, 1]) b.add(K.box(0.42, 0.22, 0.015, m, { z: sz * 0.143 }));
  for (const sx of [-1, 1]) b.add(K.box(0.015, 0.22, 0.3, m, { x: sx * 0.203 }));
  for (const y of [0.06, 0.13, 0.2]) for (const sz of [-1, 1]) b.add(K.box(0.425, 0.012, 0.018, d, { y, z: sz * 0.143, cast: false }));
  return b;
}

function cart(M) { // medical wagon with supplies
  const c = new THREE.Group(); const w = 0.5; const d = 0.4;
  for (const y of [0.16, 0.8]) c.add(K.box(w, 0.02, d, M.steel, { y }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    c.add(K.cyl(0.011, 0.011, 0.8, M.chrome, { x: sx * (w / 2 - 0.02), y: 0.04, z: sz * (d / 2 - 0.02) }, 6));
    c.add(sphere(0.02, M.dark, { x: sx * (w / 2 - 0.02), y: 0.02, z: sz * (d / 2 - 0.02) }, 6, 4));
  }
  c.add(K.box(0.3, 0.015, 0.2, M.chrome, { x: -0.06, y: 0.82 }));
  c.add(K.cyl(0.045, 0.045, 0.11, K.mat('#eef3f4', { rough: 0.3 }), { x: 0.16, y: 0.82, z: -0.08 }, 12));
  c.add(K.cyl(0.047, 0.047, 0.02, M.chrome, { x: 0.16, y: 0.93, z: -0.08 }, 12));
  c.add(K.box(0.13, 0.07, 0.24, K.mat('#7fb0d6', { rough: 0.6 }), { x: 0.14, y: 0.82, z: 0.09 }));
  c.add(K.cyl(0.03, 0.03, 0.14, K.mat('#e9f2f5', { rough: 0.3 }), { x: -0.14, y: 0.835, z: 0.0 }, 10));
  c.add(K.box(0.36, 0.1, 0.3, K.mat('#f0ece2'), { y: 0.18 }));
  return c;
}

function sinkUnit(A, M) { // hand-washing sink, back at z = 0, facing +z
  const s = new THREE.Group();
  s.add(K.box(0.5, 0.74, 0.4, M.white, { z: 0.2 }));
  s.add(K.box(0.004, 0.62, 0.006, M.offwhite, { y: 0.06, z: 0.402, cast: false }));
  s.add(rb(0.54, 0.1, 0.44, 0.03, M.white, { y: 0.74, z: 0.22 }));
  s.add(K.box(0.4, 0.004, 0.28, K.mat('#dbe4e6', { rough: 0.2 }), { y: 0.84, z: 0.25, cast: false }));
  s.add(K.cyl(0.014, 0.014, 0.16, M.chrome, { y: 0.84, z: 0.07 }, 8));
  s.add(K.box(0.025, 0.025, 0.13, M.chrome, { y: 0.98, z: 0.12 }));
  s.add(K.box(0.46, 0.56, 0.012, K.mat('#cddde4', { rough: 0.05, metal: 0.6 }), { y: 1.12, z: 0.006 }));
  s.add(K.box(0.26, 0.3, 0.12, M.white, { x: -0.42, y: 1.15, z: 0.06 }));
  s.add(K.box(0.18, 0.012, 0.03, M.dark, { x: -0.42, y: 1.16, z: 0.12, cast: false }));
  put(s, pumpBottle(M, '#f2e6c9'), 0.17, 0.84, 0.1);
  return s;
}

function cabinet(A, M) { // glass-front medicine cabinet, back at z = 0, facing +z
  const c = new THREE.Group(); const w = 0.6; const d = 0.4;
  c.add(K.box(w, 0.8, d, M.white, { z: d / 2 }));
  c.add(K.box(0.006, 0.7, 0.006, M.offwhite, { y: 0.05, z: d + 0.002, cast: false }));
  for (const sx of [-1, 1]) c.add(K.box(0.012, 0.1, 0.014, M.chrome, { x: sx * 0.04, y: 0.6, z: d + 0.006, cast: false }));
  c.add(K.box(w, 0.7, 0.02, M.white, { y: 0.8, z: 0.01 }));
  for (const sx of [-1, 1]) c.add(K.box(0.02, 0.7, 0.3, M.white, { x: sx * (w / 2 - 0.01), y: 0.8, z: 0.15 }));
  c.add(K.box(w, 0.025, 0.3, M.white, { y: 1.5, z: 0.15 }));
  c.add(A.paint(w - 0.05, 0.66, 260, drawCabinetShelves, { y: 1.15, z: 0.04 }));
  c.add(K.mesh(new THREE.PlaneGeometry(w - 0.04, 0.68), M.glass, { y: 1.15, z: 0.29, cast: false, receive: false }));
  c.add(K.box(0.006, 0.68, 0.01, M.alu, { y: 0.81, z: 0.29, cast: false }));
  return c;
}

function scale(A, M) { // 体重計
  const s = new THREE.Group();
  s.add(rb(0.3, 0.05, 0.32, 0.02, M.white));
  s.add(A.paint(0.1, 0.04, 700, drawScaleLCD, { rx: -Math.PI / 2, y: 0.051, z: -0.1 }));
  return s;
}

function cardTray(A, M) { // tray for 保険証 / 診察券 with the card on it
  const t = new THREE.Group(); const m = K.mat('#a7d4c6', { rough: 0.45 });
  t.add(K.box(0.24, 0.008, 0.16, m));
  for (const sz of [-1, 1]) t.add(K.box(0.24, 0.02, 0.01, m, { z: sz * 0.075 }));
  for (const sx of [-1, 1]) t.add(K.box(0.01, 0.02, 0.16, m, { x: sx * 0.115 }));
  const card = A.paint(0.086, 0.054, 1800, drawInsuranceCard, { rx: -Math.PI / 2, y: 0.0095, x: -0.035, z: 0.01 });
  card.rotation.z = 0.12;
  t.add(card);
  const pc = A.paint(0.086, 0.054, 1600, drawPatientCard, { rx: -Math.PI / 2, y: 0.0105, x: 0.055, z: -0.012 });
  pc.rotation.z = -0.2;
  t.add(pc);
  return t;
}

function tentCard(A, lines, w, h, o) {
  const g = new THREE.Group(); const t = 0.28;
  const front = A.text(lines, w, h, { ppm: 1100, radius: 0.1, ...o });
  front.position.set(0, h / 2 * Math.cos(t), h / 2 * Math.sin(t));
  front.rotation.x = -t;
  g.add(front);
  const back = A.plane(w, h, A.solid(o.bg || '#ffffff'));
  back.position.set(0, h / 2 * Math.cos(t), -h / 2 * Math.sin(t));
  back.rotation.set(t, Math.PI, 0);
  g.add(back);
  return g;
}

function clipboard(A, M) { // 問診票 on a clipboard with a pen
  const c = new THREE.Group();
  c.add(rb(0.235, 0.006, 0.32, 0.003, K.mat('#8fc3d8', { rough: 0.4 })));
  c.add(A.paint(0.21, 0.28, 1000, drawMonshin, { rx: -Math.PI / 2, y: 0.0068, z: 0.012 }));
  c.add(rb(0.1, 0.014, 0.034, 0.005, M.chrome, { y: 0.004, z: -0.142 }));
  const pen = K.mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.14, 6), K.mat('#2f6db3', { rough: 0.35 }), { x: 0.07, y: 0.012, z: 0.04, rz: Math.PI / 2 });
  pen.rotation.y = 0.5;
  c.add(pen);
  return c;
}

function thermometerSet(A, M) { // electronic thermometer on a little tray, with alcohol swabs
  const t = new THREE.Group();
  t.add(rb(0.14, 0.012, 0.08, 0.005, M.white));
  const body = new THREE.Group();
  body.add(rb(0.12, 0.014, 0.022, 0.006, K.mat('#e9f3f8', { rough: 0.35 })));
  body.add(K.box(0.036, 0.002, 0.014, K.mat('#6f8f9c', { rough: 0.3 }), { x: 0.02, y: 0.014, cast: false }));
  body.add(rod(0.0035, 0.025, M.chrome, { x: -0.07, y: 0.007, rz: Math.PI / 2 }, 6));
  put(t, body, -0.005, 0.012, 0.0, 0.15);
  t.add(K.cyl(0.024, 0.024, 0.05, M.white, { x: 0.1, z: -0.01 }, 10));
  t.add(K.cyl(0.025, 0.025, 0.012, K.mat('#3f8fcf', { rough: 0.4 }), { x: 0.1, y: 0.05, z: -0.01 }, 10));
  return t;
}

function bell(M) { // 呼び鈴
  const b = new THREE.Group();
  b.add(K.cyl(0.045, 0.048, 0.012, M.dark, {}, 14));
  b.add(K.mesh(new THREE.SphereGeometry(0.038, 14, 5, 0, Math.PI * 2, 0, Math.PI / 2), M.chrome, { y: 0.012 }));
  b.add(K.cyl(0.005, 0.005, 0.014, M.chrome, { y: 0.048 }, 6));
  b.add(sphere(0.009, M.chrome, { y: 0.064 }, 8, 4));
  return b;
}

function penStand(M) {
  const p = new THREE.Group();
  p.add(K.cyl(0.03, 0.028, 0.09, K.mat('#7fbcae', { rough: 0.5 }), {}, 10));
  [['#2f6db3', 0.18, 0.1], ['#d9534f', -0.15, 0.05], ['#2b2e33', 0.05, -0.12]].forEach(([col, a, b]) => {
    p.add(K.mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.14, 6), K.mat(col, { rough: 0.4 }), { y: 0.1, rz: a, rx: b }));
  });
  return p;
}

function medicineBag(A, M) { // 薬袋 lying on the counter
  const b = new THREE.Group();
  b.add(K.box(0.14, 0.02, 0.21, M.paper));
  b.add(A.paint(0.14, 0.21, 1000, drawMedBag, { rx: -Math.PI / 2, y: 0.0205 }));
  return b;
}

function pumpBottle(M, color) {
  const p = new THREE.Group();
  p.add(K.cyl(0.034, 0.037, 0.16, K.mat(color, { rough: 0.25 }), {}, 12));
  p.add(K.cyl(0.0375, 0.0385, 0.05, M.white, { y: 0.04 }, 12));
  p.add(K.cyl(0.012, 0.012, 0.035, M.white, { y: 0.16 }, 8));
  p.add(K.box(0.05, 0.012, 0.016, M.white, { x: 0.015, y: 0.19 }));
  return p;
}

function flowerVase(season, M) {
  const v = new THREE.Group();
  v.add(K.cyl(0.032, 0.042, 0.15, K.mat('#e9e1d2', { rough: 0.35 }), {}, 12));
  const cols = { spring: ['#f7c3d1', '#f9d9e1'], summer: ['#8fb4e6', '#a99ad9'], autumn: ['#e98a3a', '#f2c14e'], winter: ['#d8343d', '#f3efe8'] }[season] || ['#f7c3d1', '#f9d9e1'];
  const r = K.rng(9);
  const stem = K.mat(season === 'spring' ? '#6b5a44' : '#4f7a4a', { rough: 0.8 });
  const leaf = K.mat('#5f8f55', { rough: 0.8 });
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2 + r(); const tilt = 0.15 + r() * 0.25; const len = 0.16 + r() * 0.12;
    const st = K.mesh(new THREE.CylinderGeometry(0.003, 0.004, len, 4), stem, { y: 0.15 + len / 2, x: Math.cos(a) * Math.sin(tilt) * len / 2, z: Math.sin(a) * Math.sin(tilt) * len / 2 });
    st.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt);
    v.add(st);
    const tip = { x: Math.cos(a) * Math.sin(tilt) * len, y: 0.15 + Math.cos(tilt) * len, z: Math.sin(a) * Math.sin(tilt) * len };
    const n = season === 'spring' ? 3 : 1;
    for (let k = 0; k < n; k++) {
      const f = k / n;
      v.add(sphere(season === 'spring' ? 0.016 : 0.026, K.mat(cols[(i + k) % 2], { rough: 0.7 }), { x: tip.x * (1 - f * 0.5), y: 0.15 + (tip.y - 0.15) * (1 - f * 0.45), z: tip.z * (1 - f * 0.5) }, 6, 4));
    }
    if (season !== 'spring') v.add(sphere(0.018, leaf, { x: tip.x * 0.6, y: 0.15 + (tip.y - 0.15) * 0.55, z: tip.z * 0.6 }, 5, 3));
  }
  return v;
}

function cashTray(M) { // お会計 tray
  const t = new THREE.Group(); const m = K.mat('#d9c9a8', { rough: 0.6 });
  t.add(K.box(0.2, 0.008, 0.14, m));
  for (const sz of [-1, 1]) t.add(K.box(0.2, 0.016, 0.01, m, { z: sz * 0.065 }));
  for (const sx of [-1, 1]) t.add(K.box(0.01, 0.016, 0.14, m, { x: sx * 0.095 }));
  return t;
}

function maskBox(A, M) {
  const b = new THREE.Group();
  b.add(K.box(0.2, 0.08, 0.1, M.white));
  b.add(A.text([{ t: 'マスク', scale: 0.9 }], 0.16, 0.05, { bg: '#ffffff', fg: '#3f78b5', ppm: 900, y: 0.04, z: 0.0505 }));
  b.add(K.box(0.07, 0.004, 0.05, K.mat('#cfe3f2'), { y: 0.08, cast: false }));
  return b;
}

function waterServer(A, M) { // back at z = 0, facing +z
  const w = new THREE.Group();
  w.add(rb(0.32, 1.0, 0.34, 0.03, M.white, { z: 0.17 }));
  w.add(K.box(0.22, 0.22, 0.02, M.offwhite, { y: 0.58, z: 0.335, cast: false }));
  w.add(K.box(0.16, 0.02, 0.07, M.dark, { y: 0.6, z: 0.36 }));
  for (const [x, col] of [[-0.05, '#e05a4f'], [0.05, '#4f8fe0']]) w.add(K.box(0.035, 0.03, 0.035, K.mat(col, { rough: 0.4 }), { x, y: 0.74, z: 0.35 }));
  w.add(K.cyl(0.13, 0.13, 0.3, K.mat('#a6d6ec', { rough: 0.15 }), { y: 1.02, z: 0.17 }, 16));
  w.add(K.cyl(0.05, 0.13, 0.05, K.mat('#a6d6ec', { rough: 0.15 }), { y: 1.0, z: 0.17 }, 16));
  w.add(K.cyl(0.035, 0.035, 0.26, M.white, { x: 0.2, y: 0.5, z: 0.2 }, 10)); // cup dispenser
  w.add(K.cyl(0.028, 0.022, 0.06, M.paper, { x: 0.2, y: 0.44, z: 0.2 }, 8));
  w.add(A.text([{ t: 'お水', scale: 1.1, color: '#3f78b5' }, { t: 'ご自由に どうぞ', scale: 0.7 }], 0.22, 0.1, { bg: '#ffffff', fg: '#5b4a36', ppm: 800, y: 0.88, z: 0.342 }));
  return w;
}
function binCan(M) {
  const b = new THREE.Group();
  b.add(K.cyl(0.11, 0.095, 0.34, M.white, {}, 12));
  b.add(K.cyl(0.115, 0.115, 0.03, K.mat('#8fcab8', { rough: 0.5 }), { y: 0.34 }, 12));
  return b;
}
function humidifier(A, M) { // winter: 加湿器
  const h = new THREE.Group();
  h.add(rb(0.3, 0.46, 0.22, 0.06, M.white));
  h.add(K.box(0.18, 0.01, 0.1, M.offwhite, { y: 0.46, cast: false }));
  h.add(K.box(0.04, 0.012, 0.004, K.mat('#5fb7e8', { emissive: '#5fb7e8', emissiveIntensity: 0.9 }), { y: 0.3, z: 0.111, cast: false }));
  return h;
}
function outlet(M) {
  const o = new THREE.Group();
  o.add(K.box(0.07, 0.12, 0.008, M.white, { cast: false }));
  for (const dy of [0.035, 0.075]) o.add(K.box(0.03, 0.012, 0.003, M.dark, { y: dy, z: 0.005, cast: false }));
  return o;
}

function ceilingCassette(A) { // air conditioner flush with the ceiling (down-facing planes)
  const a = new THREE.Group();
  const down = (w, d, col, y, x = 0, z = 0) => a.add(A.plane(w, d, A.solid(col), { x, y, z, rx: Math.PI / 2 }));
  down(0.84, 0.84, '#f2f0eb', -0.005);
  down(0.46, 0.46, '#e2dfd8', -0.008);
  for (const [x, z, w, d] of [[0, 0.33, 0.6, 0.07], [0, -0.33, 0.6, 0.07], [0.33, 0, 0.07, 0.6], [-0.33, 0, 0.07, 0.6]]) down(w, d, '#5a5e64', -0.008, x, z);
  return a;
}

// ------------------------------------------------------------------- walls: signs, clock, calendar, poster
function clinicSign(A, M) { // centred, back at z = 0, facing +z
  const s = new THREE.Group();
  s.add(K.box(1.58, 0.56, 0.03, M.oakSolid, { y: -0.28 }));
  s.add(A.paint(1.5, 0.48, 300, drawClinicSign, { z: 0.031 }));
  return s;
}
function wallClock(A, M, hh, mm, r) {
  const c = new THREE.Group();
  c.add(K.mesh(new THREE.CylinderGeometry(r + 0.018, r + 0.018, 0.04, 24), M.oakSolid, { rx: Math.PI / 2, z: 0.02 }));
  c.add(A.paint(r * 2, r * 2, 520, drawClockFace, { z: 0.043 }));
  const hand = (len, w, ang, z) => {
    const geo = new THREE.BoxGeometry(w, len, 0.004); geo.translate(0, len / 2 - 0.012, 0);
    const h = K.mesh(geo, M.dark, { z, cast: false }); h.rotation.z = -ang; c.add(h);
  };
  hand(r * 0.52, r * 0.09, ((hh % 12) + mm / 60) / 12 * Math.PI * 2, 0.048);
  hand(r * 0.8, r * 0.055, mm / 60 * Math.PI * 2, 0.052);
  const sec = K.mesh(new THREE.BoxGeometry(0.003, r * 0.85, 0.003), K.mat('#d9534f'), { z: 0.056, cast: false });
  sec.geometry.translate(0, r * 0.85 / 2 - 0.02, 0); sec.rotation.z = -2.2; c.add(sec);
  c.add(K.mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.01, 10), M.dark, { rx: Math.PI / 2, z: 0.056 }));
  return c;
}
function wallCalendar(A, M, month) {
  const c = new THREE.Group();
  c.add(K.box(0.36, 0.5, 0.006, M.paper, { y: -0.25 }));
  c.add(A.paint(0.36, 0.5, 400, (cx, W, Hh) => drawCalendar(cx, W, Hh, month), { z: 0.007 }));
  c.add(K.box(0.37, 0.025, 0.012, K.mat('#c0392b', { rough: 0.6 }), { y: 0.235 }));
  return c;
}
function posterFrame(A, M, season) {
  const p = new THREE.Group();
  p.add(K.box(0.56, 0.78, 0.015, M.white, { y: -0.39 }));
  p.add(A.paint(0.52, 0.74, 420, (c, W, Hh) => drawPoster(c, W, Hh, season), { z: 0.0085 }));
  return p;
}
function framedPicture(A, M) {
  const p = new THREE.Group();
  p.add(K.box(0.66, 0.48, 0.025, M.oakSolid, { y: -0.24 }));
  p.add(A.paint(0.58, 0.4, 300, drawLandscape, { z: 0.0135 }));
  return p;
}
function callDisplay(A) { // 呼び出し番号 display above the alcove
  const d = new THREE.Group();
  d.add(K.box(0.5, 0.18, 0.05, K.mat('#2e3238', { rough: 0.4 }), { y: -0.09 }));
  d.add(A.paint(0.46, 0.14, 500, drawCallDisplay, { glow: true, z: 0.051 }));
  return d;
}

/** Window in an exterior wall (frame, glass, sill, a roll screen), bottom at y = 0, facing +z. */
function windowUnit(w, h, M, night) {
  const u = new THREE.Group();
  u.add(K.mesh(new THREE.PlaneGeometry(w, h), M.glass, { y: h / 2, z: -0.03, cast: false, receive: false }));
  u.add(K.box(w + 0.08, 0.05, 0.12, M.white, { y: h - 0.02, z: -0.03 }));
  u.add(K.box(w + 0.08, 0.04, 0.12, M.white, { y: -0.01, z: -0.03 }));
  for (const sx of [-1, 1]) u.add(K.box(0.05, h, 0.12, M.white, { x: sx * (w / 2 + 0.015), z: -0.03 }));
  u.add(K.box(0.04, h, 0.05, M.alu, { z: -0.02 }));
  u.add(K.box(w + 0.16, 0.03, 0.2, M.white, { y: -0.04, z: 0.05 }));
  // roll screen, lowered further at night
  const drop = night ? 0.7 : 0.22;
  u.add(K.box(w + 0.08, 0.07, 0.07, M.white, { y: h + 0.02, z: 0.07 }));
  u.add(K.box(w, h * drop, 0.006, K.mat('#efe6d2', { rough: 0.95 }), { y: h + 0.02 - h * drop, z: 0.07 }));
  u.add(K.box(w, 0.02, 0.02, M.oakSolid, { y: h + 0.01 - h * drop, z: 0.07 }));
  return u;
}

function frostedWindow(A, M, env) { // privacy glass above the bed, bottom at y = 0, facing +z
  const w = FWIN.z1 - FWIN.z0; const h = FWIN.y1 - FWIN.y0;
  const u = new THREE.Group();
  u.add(A.paint(w, h, 70, (c, W, Hh) => drawFrosted(c, W, Hh, env), { glow: true, y: h / 2, z: -0.02 }));
  u.add(K.box(w + 0.08, 0.05, 0.1, M.white, { y: h - 0.02, z: -0.02 }));
  for (const sx of [-1, 1]) u.add(K.box(0.05, h, 0.1, M.white, { x: sx * (w / 2 + 0.015), z: -0.02 }));
  u.add(K.box(0.035, h, 0.04, M.alu, { z: -0.01 }));
  u.add(K.box(w + 0.12, 0.03, 0.14, M.white, { y: -0.03, z: 0.02 }));
  return u;
}

/** Automatic glass doors of the entrance, bottom at y = 0 (土間), facing +z (into the room). */
function entranceDoors(A, M) {
  const e = new THREE.Group(); const w = ENT.x1 - ENT.x0; const h = ENT.h - GY;
  e.add(K.box(w + 0.16, 0.14, 0.14, M.alu, { y: h - 0.02 }));
  for (const sx of [-1, 1]) e.add(K.box(0.08, h, 0.14, M.alu, { x: sx * (w / 2 + 0.04) }));
  for (const s of [-1, 1]) {
    const leaf = new THREE.Group();
    const lw = w / 2;
    leaf.add(K.mesh(new THREE.PlaneGeometry(lw - 0.06, h - 0.1), M.glass, { y: (h - 0.04) / 2, cast: false, receive: false }));
    for (const y of [0.0, h - 0.07]) leaf.add(K.box(lw, 0.05, 0.05, M.alu, { y }));
    for (const x of [-lw / 2 + 0.02, lw / 2 - 0.02]) leaf.add(K.box(0.04, h - 0.04, 0.05, M.alu, { x }));
    leaf.add(A.text([{ t: '自動ドア', scale: 0.9 }], 0.22, 0.06, { bg: '#ffffff', fg: '#2f6b55', radius: 0.4, ppm: 700, y: 1.28, z: 0.03 }));
    put(e, leaf, s * lw / 2, 0, s * 0.02);
  }
  e.add(A.text([{ t: 'いしだ クリニック', scale: 0.85 }], 0.7, 0.13, { bg: '#ffffff', fg: '#2f6b55', border: '#8fcab8', radius: 0.3, ppm: 500, y: h + 0.2, z: 0.01 }));
  return e;
}

function shoeLocker(A, M) { // 下駄箱, back at z = 0, facing +z, 0.9 wide
  const s = new THREE.Group();
  s.add(K.box(0.9, 1.0, 0.36, M.oak, { z: 0.18 }));
  s.add(A.paint(0.86, 0.94, 160, drawLockerDoors, { y: 0.5, z: 0.3605 }));
  s.add(K.box(0.94, 0.03, 0.38, M.cream, { y: 1.0, z: 0.19 }));
  put(s, pumpBottle(M, '#d4ecf0'), 0.25, 1.03, 0.2);
  put(s, tentCard(A, [{ t: '手指消毒', scale: 0.9 }], 0.14, 0.05, { bg: '#ffffff', fg: '#2f6b55' }), 0.08, 1.03, 0.26);
  put(s, K.plant(0.55, 17), -0.22, 1.03, 0.18);
  return s;
}

function umbrellaStand(M, rain) {
  const u = new THREE.Group();
  u.add(K.cyl(0.16, 0.15, 0.5, K.mat('#6f7a80', { rough: 0.5 }), {}, 14));
  u.add(K.cyl(0.165, 0.165, 0.03, K.mat('#5a646a', { rough: 0.5 }), { y: 0.5 }, 14));
  const cols = rain ? ['#3f6fb5', '#c0504d', '#5f9f6f', '#2b2e33'] : ['#2b2e33'];
  cols.forEach((col, i) => {
    const a = i * 1.7; const x = Math.cos(a) * 0.07; const z = Math.sin(a) * 0.07;
    const m = K.mat(col, { rough: rain ? 0.2 : 0.6 });
    const body = K.mesh(new THREE.CylinderGeometry(0.03, 0.012, 0.6, 8), m, { x, y: 0.42, z });
    body.rotation.z = Math.cos(a) * 0.12; body.rotation.x = -Math.sin(a) * 0.12;
    u.add(body);
    u.add(K.mesh(new THREE.TorusGeometry(0.03, 0.007, 4, 10, Math.PI), K.mat('#8a6a4a'), { x: x * 1.6 + 0.03, y: 0.82, z: z * 1.6 }));
  });
  return u;
}

function slipperRack(A, M) { // centred, facing +z (toward the 土間), slippers on two slanted shelves
  const r = new THREE.Group(); const w = 0.9; const d = 0.3;
  for (const sx of [-1, 1]) r.add(K.box(0.025, 0.62, d, M.oakSolid, { x: sx * (w / 2 - 0.0125) }));
  const cols = ['#8fcab8', '#f2b8b0', '#e9dcc3', '#9cc0e0'];
  [0.08, 0.36].forEach((y, k) => {
    const tier = new THREE.Group();
    tier.position.set(0, y, 0); tier.rotation.x = 0.28;
    tier.add(K.box(w - 0.05, 0.015, d - 0.02, M.oakSolid));
    for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) {
      const x = -0.28 + i * 0.28 + sx * 0.055;
      const m = K.mat(cols[(i + k * 2) % cols.length], { rough: 0.8 });
      tier.add(K.box(0.09, 0.022, 0.24, m, { x, y: 0.015 }));
      tier.add(K.box(0.092, 0.03, 0.09, m, { x, y: 0.03, z: 0.065 }));
    }
    r.add(tier);
  });
  r.add(K.box(w - 0.05, 0.02, d, M.oakSolid, { y: 0.6 }));
  r.add(A.text([{ t: 'スリッパを お使いください', scale: 0.85 }], 0.6, 0.08, { bg: '#ffffff', fg: '#5b4a36', border: '#d6b78d', radius: 0.3, ppm: 700, y: 0.66, z: 0.0 }));
  return r;
}

function magazineRack(A, M) { // back at z = 0, facing +z
  const r = new THREE.Group(); const w = 0.9; const h = 1.15;
  r.add(K.box(w, h, 0.02, M.oakSolid, { z: 0.01 }));
  for (const sx of [-1, 1]) r.add(K.box(0.025, h, 0.28, M.oakSolid, { x: sx * (w / 2 - 0.0125), z: 0.14 }));
  r.add(K.box(w, 0.025, 0.28, M.oakSolid, { y: h - 0.025, z: 0.14 }));
  let k = 0;
  [0.1, 0.46, 0.82].forEach((y) => {
    r.add(K.box(w - 0.05, 0.02, 0.26, M.oakSolid, { y, z: 0.13 }));
    r.add(K.box(w - 0.05, 0.05, 0.015, M.oakSolid, { y, z: 0.255 }));
    for (let i = 0; i < 3; i++) {
      const cover = A.paint(0.2, 0.27, 320, (c, W, Hh) => drawMagCover(c, W, Hh, k), { x: -0.28 + i * 0.28, y: y + 0.155, z: 0.15, rx: -0.22 });
      r.add(cover);
      const stack = K.box(0.2, 0.27, 0.012, M.paper, { x: -0.28 + i * 0.28, y: y + 0.02, z: 0.141 });
      stack.rotation.x = -0.22;
      r.add(stack);
      k++;
    }
  });
  return r;
}

function toyShelf(A, M) { // low open shelf with bins and picture books, back at z = 0, facing +z
  const s = new THREE.Group(); const w = 1.0;
  s.add(K.box(w, 0.6, 0.02, M.white, { z: 0.01 }));
  for (const x of [-w / 2 + 0.0125, 0, w / 2 - 0.0125]) s.add(K.box(0.025, 0.6, 0.3, M.oakSolid, { x, z: 0.15 }));
  for (const y of [0, 0.29, 0.58]) s.add(K.box(w, 0.025, 0.3, M.oakSolid, { y, z: 0.15 }));
  const bins = ['#f2b8b0', '#9cc0e0', '#f6d77a', '#8fcab8'];
  bins.forEach((col, i) => s.add(rb(0.44, 0.22, 0.26, 0.02, K.mat(col, { rough: 0.7 }), { x: (i % 2 ? 0.25 : -0.25), y: i < 2 ? 0.03 : 0.315, z: 0.15 })));
  const books = ['#e05a4f', '#4f8fe0', '#f2c14e', '#5fa356', '#9c6fc9'];
  books.forEach((col, i) => s.add(K.box(0.035, 0.2 - (i % 2) * 0.03, 0.16, K.mat(col, { rough: 0.6 }), { x: -0.35 + i * 0.045, y: 0.6, z: 0.12 })));
  return s;
}
function toyBlocks(M) {
  const b = new THREE.Group();
  const cols = ['#e05a4f', '#4f8fe0', '#f2c14e', '#5fa356', '#f29bbd'];
  [[0, 0, 0], [0.09, 0, 0.02], [0.045, 0.07, 0.01], [-0.12, 0, 0.12], [0.2, 0, -0.1]].forEach(([x, y, z], i) => {
    const c = K.box(0.07, 0.07, 0.07, K.mat(cols[i], { rough: 0.6 }), { x, y, z }); c.rotation.y = i * 0.4; b.add(c);
  });
  const car = new THREE.Group();
  car.add(rb(0.16, 0.06, 0.08, 0.02, K.mat('#e05a4f', { rough: 0.5 }), { y: 0.02 }));
  car.add(rb(0.08, 0.04, 0.07, 0.015, K.mat('#f7f2e8'), { y: 0.075, x: -0.01 }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) car.add(K.mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.012, 8), M.dark, { x: sx * 0.05, y: 0.02, z: sz * 0.042, rx: Math.PI / 2 }));
  put(b, car, -0.05, 0, 0.25, 0.8);
  return b;
}
function teddy(M) {
  const t = new THREE.Group(); const fur = K.mat('#c89a6a', { rough: 0.95 }); const light = K.mat('#e8cfa8', { rough: 0.95 });
  t.add(sphere(0.085, fur, { y: 0.09 }, 10, 8));
  t.add(sphere(0.065, fur, { y: 0.22 }, 10, 8));
  t.add(sphere(0.028, light, { y: 0.21, z: 0.055 }, 6, 4));
  for (const sx of [-1, 1]) {
    t.add(sphere(0.024, fur, { x: sx * 0.05, y: 0.275 }, 6, 4));
    t.add(sphere(0.032, fur, { x: sx * 0.08, y: 0.12, z: 0.03 }, 6, 4));
    t.add(sphere(0.035, fur, { x: sx * 0.05, y: 0.03, z: 0.07 }, 6, 4));
    t.add(sphere(0.008, K.mat('#2a2018'), { x: sx * 0.022, y: 0.235, z: 0.058 }, 5, 3));
  }
  return t;
}

function chartShelf(A, M) { // カルテ棚, back at z = 0, facing +z
  const s = new THREE.Group(); const w = 1.8; const h = 1.9; const d = 0.36;
  s.add(K.box(w, h, 0.02, M.white, { z: 0.01 }));
  for (const sx of [-1, 1]) s.add(K.box(0.025, h, d, M.white, { x: sx * (w / 2 - 0.0125), z: d / 2 }));
  s.add(K.box(w, 0.025, d, M.white, { y: h - 0.025, z: d / 2 }));
  s.add(A.paint(w - 0.05, h - 0.06, 130, drawFiles, { y: h / 2 - 0.01, z: d - 0.08 }));
  return s;
}
function medShelf(A, M) { // 薬棚, back at z = 0, facing +z
  const s = new THREE.Group(); const w = 1.3; const h = 1.8; const d = 0.3;
  s.add(K.box(w, h, 0.02, M.white, { z: 0.01 }));
  for (const sx of [-1, 1]) s.add(K.box(0.025, h, d, M.white, { x: sx * (w / 2 - 0.0125), z: d / 2 }));
  s.add(K.box(w, 0.025, d, M.white, { y: h - 0.025, z: d / 2 }));
  s.add(A.paint(w - 0.05, h - 0.06, 130, drawMedBoxes, { y: h / 2 - 0.01, z: d - 0.07 }));
  return s;
}
function printerCab(M) { // back at z = 0, facing +z
  const p = new THREE.Group();
  p.add(K.box(0.5, 0.7, 0.45, M.white, { z: 0.225 }));
  p.add(rb(0.44, 0.24, 0.4, 0.02, K.mat('#d9dcdf', { rough: 0.5 }), { y: 0.7, z: 0.22 }));
  p.add(K.box(0.3, 0.01, 0.2, M.paper, { y: 0.94, z: 0.2, cast: false }));
  p.add(K.box(0.32, 0.04, 0.02, M.dark, { y: 0.76, z: 0.42, cast: false }));
  return p;
}

// =================================================================== drawings (atlas)
const INK = '#3d3a35'; const GREEN = '#3f9b74';
function fitFont(c, text, weight, size, maxW) {
  let s = size;
  c.font = `${weight} ${s}px ${K.JP_FONT}`;
  while (c.measureText(text).width > maxW && s > 5) { s *= 0.92; c.font = `${weight} ${s}px ${K.JP_FONT}`; }
  return s;
}
function txt(c, t, x, y, size, { w = 700, color = INK, align = 'center', max = 1e9 } = {}) {
  c.fillStyle = color; c.textAlign = align; c.textBaseline = 'middle';
  fitFont(c, t, w, size, max);
  c.fillText(t, x, y);
}
function cross(c, cx, cy, s, color = GREEN) {
  const a = s * 0.34;
  c.fillStyle = color;
  K.roundRect(c, cx - a / 2, cy - s / 2, a, s, a * 0.2); c.fill();
  K.roundRect(c, cx - s / 2, cy - a / 2, s, a, a * 0.2); c.fill();
}
function rrect(c, x, y, w, h, r, fill, stroke, lw = 2) {
  K.roundRect(c, x, y, w, h, r);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
}
function mix(a, b, k) { const ca = new THREE.Color(a); ca.lerp(new THREE.Color(b), k); return `#${ca.getHexString()}`; }
function shade(hex, k) { const c = new THREE.Color(hex); c.multiplyScalar(k); return `#${c.getHexString()}`; }
function lines(c, x, y, w, n, gap, color = 'rgba(60,60,60,0.25)', lw = 1) {
  c.strokeStyle = color; c.lineWidth = lw;
  for (let i = 0; i < n; i++) { c.beginPath(); c.moveTo(x, y + i * gap); c.lineTo(x + w, y + i * gap); c.stroke(); }
}

function drawClinicSign(c, W, Hh) {
  const gr = c.createLinearGradient(0, 0, 0, Hh); gr.addColorStop(0, '#e6cba2'); gr.addColorStop(1, '#d8b688');
  c.fillStyle = gr; c.fillRect(0, 0, W, Hh);
  const r = K.rng(4);
  for (let i = 0; i < 46; i++) {
    c.strokeStyle = `rgba(120,80,40,${0.05 + r() * 0.07})`; c.lineWidth = 1;
    const y = r() * Hh; c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(W * 0.3, y + (r() - 0.5) * 6, W * 0.7, y + (r() - 0.5) * 6, W, y + (r() - 0.5) * 4); c.stroke();
  }
  const cx = Hh * 0.6; const cy = Hh / 2; const R = Hh * 0.36;
  c.fillStyle = '#fbfaf5'; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#8fcab8'; c.lineWidth = Hh * 0.03; c.stroke();
  cross(c, cx, cy, R * 1.2);
  txt(c, 'いしだ クリニック', W * 0.59, Hh * 0.4, Hh * 0.34, { w: 800, color: '#2f5d45', max: W * 0.66 });
  txt(c, '内科・小児科', W * 0.59, Hh * 0.78, Hh * 0.16, { w: 700, color: '#6b5236', max: W * 0.6 });
}

function drawHours(c, W, Hh) {
  rrect(c, 0, 0, W, Hh, W * 0.04, '#fffdf7');
  c.fillStyle = GREEN; K.roundRect(c, W * 0.04, Hh * 0.04, W * 0.92, Hh * 0.16, W * 0.03); c.fill();
  txt(c, '診療時間', W / 2, Hh * 0.12, Hh * 0.1, { color: '#ffffff', w: 800, max: W * 0.8 });
  const days = ['月', '火', '水', '木', '金', '土', '日'];
  const x0 = W * 0.34; const cwid = (W * 0.96 - x0) / 7;
  days.forEach((d, i) => txt(c, d, x0 + cwid * (i + 0.5), Hh * 0.29, Hh * 0.07, { color: i === 6 ? '#d9534f' : i === 5 ? '#3f6fb5' : INK }));
  const rows = [['9:00〜', '12:30', [1, 1, 1, 1, 1, 1, 0]], ['15:00〜', '18:30', [1, 1, 0, 1, 1, 0, 0]]];
  rows.forEach(([a, b, on], k) => {
    const y = Hh * (0.47 + k * 0.21);
    lines(c, W * 0.04, y - Hh * 0.1, W * 0.92, 1, 0, '#cfe2d7', 2);
    txt(c, a, W * 0.18, y - Hh * 0.035, Hh * 0.06, { max: W * 0.28 });
    txt(c, b, W * 0.18, y + Hh * 0.04, Hh * 0.06, { max: W * 0.28 });
    on.forEach((o, i) => txt(c, o ? '○' : '／', x0 + cwid * (i + 0.5), y, Hh * 0.075, { color: o ? GREEN : '#c46a5a' }));
  });
  lines(c, W * 0.04, Hh * 0.79, W * 0.92, 1, 0, '#cfe2d7', 2);
  txt(c, '休診日：水・土の 午後、日曜・祝日', W / 2, Hh * 0.88, Hh * 0.058, { color: '#6b5236', max: W * 0.92 });
}

function drawNotice(c, W, Hh) {
  rrect(c, 0, 0, W, Hh, W * 0.05, '#fff8e8', '#e3a857', W * 0.02);
  txt(c, 'おねがい', W / 2, Hh * 0.2, Hh * 0.13, { color: '#d9733b', w: 800 });
  txt(c, 'ねつの ある 方は', W / 2, Hh * 0.45, Hh * 0.1, { max: W * 0.88 });
  txt(c, '受付に お声かけ ください', W / 2, Hh * 0.62, Hh * 0.1, { max: W * 0.88 });
  txt(c, '院内では マスクを おねがいします', W / 2, Hh * 0.82, Hh * 0.085, { max: W * 0.9, color: '#6b5236' });
}

function drawPoster(c, W, Hh, season) {
  const P = {
    spring: { bg: '#fdeef2', band: '#e98aa6', title: '花粉症の きせつです', sub1: 'くしゃみ・はなみず・', sub2: '目の かゆみは ごそうだんを' },
    summer: { bg: '#e6f5fb', band: '#3f9fd1', title: '熱中症に ちゅうい！', sub1: 'こまめに 水分を', sub2: 'とりましょう' },
    autumn: { bg: '#fff1df', band: '#e58a3a', title: 'インフルエンザ よぼうせっしゅ', sub1: '10月から', sub2: '受付中です' },
    winter: { bg: '#edf2fb', band: '#4f78c4', title: 'かぜ・インフルエンザ よぼう', sub1: '手あらい・うがい・', sub2: 'マスクを わすれずに' },
  }[season] || null;
  const p = P || { bg: '#fdeef2', band: '#e98aa6', title: '花粉症の きせつです', sub1: '', sub2: '' };
  c.fillStyle = p.bg; c.fillRect(0, 0, W, Hh);
  c.fillStyle = p.band; c.fillRect(0, 0, W, Hh * 0.2);
  txt(c, p.title, W / 2, Hh * 0.1, Hh * 0.075, { color: '#ffffff', w: 800, max: W * 0.9 });
  const cx = W / 2; const cy = Hh * 0.47; const R = W * 0.27;
  c.fillStyle = '#ffffff'; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
  if (season === 'summer') {
    c.fillStyle = '#f6c343'; c.beginPath(); c.arc(cx - R * 0.25, cy - R * 0.2, R * 0.38, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#f6c343'; c.lineWidth = R * 0.07;
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; c.beginPath(); c.moveTo(cx - R * 0.25 + Math.cos(a) * R * 0.48, cy - R * 0.2 + Math.sin(a) * R * 0.48); c.lineTo(cx - R * 0.25 + Math.cos(a) * R * 0.62, cy - R * 0.2 + Math.sin(a) * R * 0.62); c.stroke(); }
    c.fillStyle = '#4fa8dc'; c.beginPath(); c.moveTo(cx + R * 0.35, cy - R * 0.15); c.quadraticCurveTo(cx + R * 0.68, cy + R * 0.3, cx + R * 0.35, cy + R * 0.5); c.quadraticCurveTo(cx + R * 0.02, cy + R * 0.3, cx + R * 0.35, cy - R * 0.15); c.fill();
  } else if (season === 'autumn') {
    c.fillStyle = '#5f8fd0'; c.beginPath(); c.moveTo(cx, cy - R * 0.6); c.lineTo(cx + R * 0.5, cy - R * 0.4); c.quadraticCurveTo(cx + R * 0.5, cy + R * 0.35, cx, cy + R * 0.62); c.quadraticCurveTo(cx - R * 0.5, cy + R * 0.35, cx - R * 0.5, cy - R * 0.4); c.closePath(); c.fill();
    cross(c, cx, cy, R * 0.5, '#ffffff');
  } else if (season === 'winter') {
    c.fillStyle = '#9fd3f0'; for (const [dx, dy, rr] of [[-0.35, -0.3, 0.22], [0.25, -0.35, 0.16], [0.35, 0.15, 0.24], [-0.25, 0.28, 0.18], [0.0, 0.0, 0.12]]) { c.beginPath(); c.arc(cx + dx * R, cy + dy * R, rr * R, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#ffffff'; K.roundRect(c, cx - R * 0.42, cy - R * 0.2, R * 0.84, R * 0.46, R * 0.12); c.fill();
    c.strokeStyle = '#6f9fd0'; c.lineWidth = R * 0.04; c.stroke();
    lines(c, cx - R * 0.3, cy - R * 0.05, R * 0.6, 3, R * 0.1, '#9fc0e0', R * 0.03);
  } else {
    c.fillStyle = '#f3a6bb';
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 - Math.PI / 2; c.beginPath(); c.ellipse(cx + Math.cos(a) * R * 0.34, cy + Math.sin(a) * R * 0.34, R * 0.26, R * 0.2, a, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#f6d77a'; c.beginPath(); c.arc(cx, cy, R * 0.17, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(230,190,60,0.7)'; const r = K.rng(5);
    for (let i = 0; i < 18; i++) { c.beginPath(); c.arc(cx + (r() - 0.5) * R * 1.8, cy + (r() - 0.5) * R * 1.8, R * 0.035, 0, Math.PI * 2); c.fill(); }
  }
  txt(c, p.sub1, W / 2, Hh * 0.76, Hh * 0.055, { max: W * 0.9 });
  txt(c, p.sub2, W / 2, Hh * 0.83, Hh * 0.055, { max: W * 0.9 });
  cross(c, W * 0.3, Hh * 0.935, Hh * 0.035);
  txt(c, 'いしだ クリニック', W * 0.55, Hh * 0.935, Hh * 0.035, { color: '#2f5d45', max: W * 0.5 });
}

function drawCalendar(c, W, Hh, month) {
  c.fillStyle = '#fffefa'; c.fillRect(0, 0, W, Hh);
  const pic = { 4: ['#fde3ea', '#f3a6bb', '#8a6a4a'], 7: ['#dff2fb', '#5fb3e0', '#f6c343'], 10: ['#fff0dc', '#e8913f', '#c9512f'], 2: ['#eef3fb', '#9db8de', '#ffffff'] }[month] || ['#fde3ea', '#f3a6bb', '#8a6a4a'];
  c.fillStyle = pic[0]; c.fillRect(0, 0, W, Hh * 0.38);
  const r = K.rng(month);
  c.fillStyle = pic[1];
  for (let i = 0; i < 14; i++) { c.beginPath(); c.arc(r() * W, r() * Hh * 0.34 + Hh * 0.02, W * (0.04 + r() * 0.05), 0, Math.PI * 2); c.fill(); }
  c.fillStyle = pic[2];
  for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(r() * W, r() * Hh * 0.34 + Hh * 0.02, W * 0.025, 0, Math.PI * 2); c.fill(); }
  txt(c, `${month}月`, W * 0.2, Hh * 0.45, Hh * 0.07, { color: '#c0392b', w: 800 });
  txt(c, '2026', W * 0.82, Hh * 0.45, Hh * 0.04, { color: '#8a8378' });
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  const gx = W * 0.05; const gw = W * 0.9 / 7; const gy = Hh * 0.53; const gh = Hh * 0.075;
  days.forEach((d, i) => txt(c, d, gx + gw * (i + 0.5), gy, Hh * 0.035, { color: i === 0 ? '#d9534f' : i === 6 ? '#3f6fb5' : INK }));
  const first = new Date(2026, month - 1, 1).getDay(); const n = new Date(2026, month, 0).getDate();
  for (let d = 1; d <= n; d++) {
    const k = first + d - 1; const col = k % 7; const row = Math.floor(k / 7);
    const x = gx + gw * (col + 0.5); const y = gy + gh * (row + 1);
    txt(c, String(d), x, y, Hh * 0.036, { color: col === 0 ? '#d9534f' : col === 6 ? '#3f6fb5' : INK, w: 600 });
  }
}

function drawClockFace(c, W) {
  const R = W / 2;
  c.fillStyle = '#fbf9f3'; c.beginPath(); c.arc(R, R, R * 0.98, 0, Math.PI * 2); c.fill();
  c.fillStyle = INK;
  for (let i = 0; i < 60; i++) {
    const a = i / 60 * Math.PI * 2; const big = i % 5 === 0;
    c.save(); c.translate(R + Math.sin(a) * R * 0.86, R - Math.cos(a) * R * 0.86); c.rotate(a);
    c.fillRect(-(big ? R * 0.025 : R * 0.008), -(big ? R * 0.06 : R * 0.03), big ? R * 0.05 : R * 0.016, big ? R * 0.12 : R * 0.06);
    c.restore();
  }
  for (let h = 1; h <= 12; h++) { const a = h / 12 * Math.PI * 2; txt(c, String(h), R + Math.sin(a) * R * 0.66, R - Math.cos(a) * R * 0.66, R * 0.2, { w: 700 }); }
  cross(c, R, R * 1.36, R * 0.12);
}

function drawXray(c, W, Hh) {
  c.fillStyle = '#f1f6fa'; c.fillRect(0, 0, W, Hh);
  const film = (fx, fy, fw, fh, side) => {
    c.fillStyle = '#121822'; c.fillRect(fx, fy, fw, fh);
    const cx = fx + fw / 2; const cy = fy + fh * 0.52;
    c.fillStyle = '#5c6672';
    c.beginPath(); c.ellipse(cx, cy, fw * (side ? 0.3 : 0.42), fh * 0.44, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#1f2833';
    if (side) { c.beginPath(); c.ellipse(cx, cy - fh * 0.04, fw * 0.22, fh * 0.32, 0, 0, Math.PI * 2); c.fill(); } else {
      for (const s of [-1, 1]) { c.beginPath(); c.ellipse(cx + s * fw * 0.19, cy - fh * 0.03, fw * 0.15, fh * 0.32, s * 0.08, 0, Math.PI * 2); c.fill(); }
    }
    c.fillStyle = '#9aa4ae'; c.fillRect(cx - fw * 0.025 + (side ? fw * 0.12 : 0), fy + fh * 0.06, fw * 0.05, fh * 0.86);
    c.strokeStyle = 'rgba(190,198,206,0.75)'; c.lineWidth = Math.max(1.5, fw * 0.012);
    for (let i = 0; i < 7; i++) {
      const y = cy - fh * 0.3 + i * fh * 0.085;
      if (side) { c.beginPath(); c.ellipse(cx, y, fw * 0.25, fh * 0.05, 0.15, Math.PI * 0.1, Math.PI * 0.9); c.stroke(); } else {
        for (const s of [-1, 1]) { c.beginPath(); c.ellipse(cx + s * fw * 0.17, y, fw * 0.17, fh * 0.05, s * 0.2, s > 0 ? Math.PI * 1.05 : -Math.PI * 0.05, s > 0 ? Math.PI * 1.95 : Math.PI * 1.05); c.stroke(); }
      }
    }
    if (!side) { c.fillStyle = 'rgba(170,178,186,0.6)'; c.beginPath(); c.ellipse(cx - fw * 0.05, cy + fh * 0.16, fw * 0.14, fh * 0.13, 0.4, 0, Math.PI * 2); c.fill(); }
  };
  film(W * 0.06, Hh * 0.08, W * 0.5, Hh * 0.86, false);
  film(W * 0.6, Hh * 0.08, W * 0.34, Hh * 0.86, true);
}

function drawScreen(c, W, Hh) {
  c.fillStyle = '#f2f7f6'; c.fillRect(0, 0, W, Hh);
  c.fillStyle = '#3f9b8a'; c.fillRect(0, 0, W, Hh * 0.13);
  txt(c, '電子カルテ', W * 0.16, Hh * 0.066, Hh * 0.08, { color: '#ffffff', w: 800 });
  txt(c, '2026.11', W * 0.88, Hh * 0.066, Hh * 0.06, { color: '#e6f4f1' });
  rrect(c, W * 0.03, Hh * 0.18, W * 0.38, Hh * 0.78, 6, '#ffffff', '#cfe2dc');
  [['たいおん', '37.6℃'], ['けつあつ', '118/76'], ['みゃく', '72']].forEach(([k, v], i) => {
    txt(c, k, W * 0.12, Hh * (0.3 + i * 0.2), Hh * 0.06, { color: '#6b7b78' });
    txt(c, v, W * 0.3, Hh * (0.3 + i * 0.2), Hh * 0.08, { color: i === 0 ? '#d9733b' : INK, w: 800 });
  });
  rrect(c, W * 0.45, Hh * 0.18, W * 0.52, Hh * 0.38, 6, '#ffffff', '#cfe2dc');
  c.strokeStyle = '#e58a3a'; c.lineWidth = 3; c.beginPath();
  [0.4, 0.32, 0.36, 0.25, 0.22, 0.3].forEach((v, i) => { const x = W * (0.49 + i * 0.085); const y = Hh * (0.18 + v); if (i) c.lineTo(x, y); else c.moveTo(x, y); }); c.stroke();
  rrect(c, W * 0.45, Hh * 0.6, W * 0.52, Hh * 0.36, 6, '#ffffff', '#cfe2dc');
  lines(c, W * 0.48, Hh * 0.68, W * 0.44, 4, Hh * 0.07, 'rgba(80,90,90,0.35)', 3);
}
function drawOfficeScreen(c, W, Hh) {
  c.fillStyle = '#f4f6f8'; c.fillRect(0, 0, W, Hh);
  c.fillStyle = '#4f78c4'; c.fillRect(0, 0, W, Hh * 0.13);
  txt(c, '受付 一覧', W * 0.15, Hh * 0.066, Hh * 0.08, { color: '#ffffff', w: 800 });
  for (let i = 0; i < 6; i++) {
    const y = Hh * (0.22 + i * 0.13);
    c.fillStyle = i % 2 ? '#ffffff' : '#e9eef6'; c.fillRect(W * 0.03, y - Hh * 0.06, W * 0.94, Hh * 0.12);
    txt(c, String(10 + i), W * 0.08, y, Hh * 0.06);
    c.fillStyle = 'rgba(80,90,100,0.35)'; c.fillRect(W * 0.16, y - 3, W * (0.3 + (i % 3) * 0.1), 6);
    c.fillStyle = i < 2 ? '#8fcab8' : '#f2c14e'; c.fillRect(W * 0.8, y - Hh * 0.035, W * 0.12, Hh * 0.07);
  }
}
function drawKeys(c, W, Hh) {
  c.fillStyle = '#e8e8e4'; c.fillRect(0, 0, W, Hh);
  c.fillStyle = '#fbfbf9';
  const kw = W / 15.5; const kh = Hh / 5.4;
  for (let row = 0; row < 5; row++) for (let i = 0; i < 15; i++) {
    if (row === 4 && i > 3 && i < 11) continue;
    c.fillRect(W * 0.01 + i * kw + 1, Hh * 0.04 + row * kh + 1, kw - 2, kh - 2);
  }
  c.fillRect(W * 0.01 + 4 * kw + 1, Hh * 0.04 + 4 * kh + 1, 7 * kw - 2, kh - 2);
}
function drawBP(c, W, Hh) {
  c.fillStyle = '#c9d8d2'; c.fillRect(0, 0, W, Hh);
  txt(c, '118', W * 0.35, Hh * 0.35, Hh * 0.32, { color: '#2b3a36', w: 800 });
  txt(c, '76', W * 0.35, Hh * 0.72, Hh * 0.3, { color: '#2b3a36', w: 800 });
  txt(c, '72', W * 0.78, Hh * 0.55, Hh * 0.22, { color: '#4f6b65' });
}
function drawScaleLCD(c, W, Hh) { c.fillStyle = '#b9cdc6'; c.fillRect(0, 0, W, Hh); txt(c, '0.0kg', W / 2, Hh / 2, Hh * 0.6, { color: '#2b3a36', w: 800 }); }

function drawMonshin(c, W, Hh) {
  c.fillStyle = '#fffefb'; c.fillRect(0, 0, W, Hh);
  c.fillStyle = '#e4f2ec'; c.fillRect(0, 0, W, Hh * 0.11);
  txt(c, '問診票', W / 2, Hh * 0.058, Hh * 0.07, { w: 800, color: '#2f6b55' });
  const L = W * 0.08;
  txt(c, 'お名前', L, Hh * 0.17, Hh * 0.04, { align: 'left' }); lines(c, W * 0.32, Hh * 0.19, W * 0.6, 1, 0, '#9aa', 1);
  txt(c, '体温', L, Hh * 0.26, Hh * 0.04, { align: 'left' }); txt(c, '．　℃', W * 0.62, Hh * 0.26, Hh * 0.04); lines(c, W * 0.32, Hh * 0.28, W * 0.45, 1, 0, '#9aa', 1);
  txt(c, 'きょうは どう されましたか？', L, Hh * 0.36, Hh * 0.038, { align: 'left', max: W * 0.86 });
  const items = ['ねつ', 'せき', 'のど', 'はなみず', 'あたま', 'おなか'];
  items.forEach((t, i) => {
    const x = L + (i % 2) * W * 0.44; const y = Hh * (0.44 + Math.floor(i / 2) * 0.075);
    c.strokeStyle = '#557'; c.lineWidth = 1; c.strokeRect(x, y - Hh * 0.017, Hh * 0.034, Hh * 0.034);
    txt(c, t, x + Hh * 0.05, y, Hh * 0.036, { align: 'left' });
  });
  txt(c, 'いつから ですか？', L, Hh * 0.7, Hh * 0.038, { align: 'left' }); lines(c, L, Hh * 0.76, W * 0.84, 1, 0, '#9aa', 1);
  txt(c, 'アレルギー　□ある　□ない', L, Hh * 0.84, Hh * 0.036, { align: 'left', max: W * 0.86 });
  txt(c, 'いしだ クリニック', W / 2, Hh * 0.94, Hh * 0.032, { color: '#2f6b55' });
}
function drawMedBag(c, W, Hh) {
  c.fillStyle = '#fffefb'; c.fillRect(0, 0, W, Hh);
  c.fillStyle = '#e8e4da'; c.fillRect(0, 0, W, Hh * 0.08);
  c.strokeStyle = GREEN; c.lineWidth = W * 0.025; c.strokeRect(W * 0.07, Hh * 0.12, W * 0.86, Hh * 0.8);
  txt(c, 'おくすり', W / 2, Hh * 0.22, Hh * 0.08, { w: 800, color: '#2f6b55' });
  txt(c, '内服薬', W / 2, Hh * 0.34, Hh * 0.055);
  lines(c, W * 0.18, Hh * 0.48, W * 0.5, 1, 0, '#99a', 1); txt(c, '様', W * 0.78, Hh * 0.46, Hh * 0.05);
  txt(c, '1日 3回', W / 2, Hh * 0.59, Hh * 0.055, { w: 800 });
  txt(c, '毎食後', W / 2, Hh * 0.68, Hh * 0.05);
  cross(c, W * 0.22, Hh * 0.84, Hh * 0.05);
  txt(c, 'いしだ クリニック', W * 0.58, Hh * 0.84, Hh * 0.042, { color: '#2f6b55', max: W * 0.6 });
}
function drawInsuranceCard(c, W, Hh) {
  rrect(c, 0, 0, W, Hh, Hh * 0.08, '#d9ecdf');
  c.fillStyle = '#5ea47c'; c.fillRect(0, Hh * 0.08, W, Hh * 0.2);
  txt(c, '健康保険 被保険者証', W / 2, Hh * 0.18, Hh * 0.13, { color: '#ffffff', w: 800, max: W * 0.9 });
  ['氏名', '生年月日', '記号・番号'].forEach((t, i) => { txt(c, t, W * 0.06, Hh * (0.42 + i * 0.17), Hh * 0.09, { align: 'left' }); lines(c, W * 0.38, Hh * (0.47 + i * 0.17), W * 0.55, 1, 0, 'rgba(60,80,70,0.4)', 1); });
}
function drawPatientCard(c, W, Hh) {
  rrect(c, 0, 0, W, Hh, Hh * 0.08, '#fdf6e8');
  cross(c, W * 0.14, Hh * 0.25, Hh * 0.18);
  txt(c, 'いしだ クリニック', W * 0.56, Hh * 0.25, Hh * 0.13, { color: '#2f5d45', max: W * 0.7 });
  txt(c, '診察券', W / 2, Hh * 0.55, Hh * 0.18, { w: 800 });
  lines(c, W * 0.15, Hh * 0.82, W * 0.7, 1, 0, 'rgba(60,60,60,0.4)', 1);
}
function drawEyeChart(c, W, Hh) {
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, Hh);
  c.strokeStyle = '#cfd6d4'; c.lineWidth = 2; c.strokeRect(1, 1, W - 2, Hh - 2);
  txt(c, '視力表', W / 2, Hh * 0.05, Hh * 0.035, { color: '#6b7b78' });
  const vals = ['0.1', '0.2', '0.3', '0.5', '0.7', '1.0', '1.2'];
  vals.forEach((v, i) => {
    const y = Hh * (0.13 + i * 0.125); const s = Hh * (0.05 - i * 0.0062);
    txt(c, v, W * 0.12, y, Hh * 0.025, { color: '#888' });
    const n = i < 2 ? 1 : i < 4 ? 2 : 3;
    for (let k = 0; k < n; k++) {
      const x = W * (0.55 + (k - (n - 1) / 2) * 0.24);
      c.strokeStyle = '#222'; c.lineWidth = s * 0.4; c.beginPath();
      const gap = [0, Math.PI / 2, Math.PI, -Math.PI / 2][(i + k) % 4];
      c.arc(x, y, s * 0.8, gap + 0.35, gap + Math.PI * 2 - 0.35); c.stroke();
    }
  });
}
function drawHandWash(c, W, Hh) {
  rrect(c, 0, 0, W, Hh, W * 0.06, '#eaf6f8', '#7fb5c8', 3);
  txt(c, '手あらい', W / 2, Hh * 0.32, Hh * 0.22, { color: '#3f78b5', w: 800 });
  txt(c, '30びょう ていねいに', W / 2, Hh * 0.7, Hh * 0.14, { max: W * 0.9 });
}
function drawCallDisplay(c, W, Hh) {
  c.fillStyle = '#15191f'; c.fillRect(0, 0, W, Hh);
  txt(c, 'よびだし', W * 0.24, Hh / 2, Hh * 0.36, { color: '#9be3c4', w: 700 });
  txt(c, '12', W * 0.62, Hh / 2, Hh * 0.7, { color: '#ffd36b', w: 800 });
  txt(c, 'ばん', W * 0.85, Hh / 2, Hh * 0.36, { color: '#9be3c4' });
}
function drawFiles(c, W, Hh) {
  c.fillStyle = '#f4f2ee'; c.fillRect(0, 0, W, Hh);
  const cols = ['#f2b8b0', '#9cc0e0', '#f6d77a', '#8fcab8', '#f2c49b', '#c3b3e6', '#f7f4ec'];
  const r = K.rng(12); const rows = 5; const rh = Hh / rows;
  for (let k = 0; k < rows; k++) {
    let x = 2;
    while (x < W - 3) {
      const w = 3 + r() * 4; const h = rh * (0.72 + r() * 0.16);
      c.fillStyle = cols[Math.floor(r() * cols.length)]; c.fillRect(x, (k + 1) * rh - h - 3, w, h);
      c.fillStyle = 'rgba(255,255,255,0.8)'; c.fillRect(x + 0.5, (k + 1) * rh - h + 3, w - 1, 3);
      x += w + 0.6;
    }
    c.fillStyle = '#e4e0d8'; c.fillRect(0, (k + 1) * rh - 3, W, 3);
  }
}
function drawMedBoxes(c, W, Hh) {
  c.fillStyle = '#f4f2ee'; c.fillRect(0, 0, W, Hh);
  const cols = ['#5d8fc9', '#d9534f', '#5fa356', '#e3a857', '#9c6fc9'];
  const r = K.rng(14); const rows = 6; const rh = Hh / rows;
  for (let k = 0; k < rows; k++) {
    let x = 3;
    while (x < W - 8) {
      const w = 7 + r() * 8; const h = rh * (0.35 + r() * 0.35);
      c.fillStyle = '#fbfaf6'; c.fillRect(x, (k + 1) * rh - h - 3, w, h);
      c.fillStyle = cols[Math.floor(r() * cols.length)]; c.fillRect(x, (k + 1) * rh - h - 3 + h * 0.25, w, h * 0.22);
      x += w + 1.5;
    }
    c.fillStyle = '#e1ddd5'; c.fillRect(0, (k + 1) * rh - 3, W, 3);
  }
}
function drawCabinetShelves(c, W, Hh) {
  c.fillStyle = '#f3f5f4'; c.fillRect(0, 0, W, Hh);
  const r = K.rng(8);
  for (let k = 0; k < 3; k++) {
    const base = (k + 1) * Hh / 3 - 3;
    let x = 4;
    while (x < W - 10) {
      const w = 8 + r() * 10; const h = Hh / 3 * (0.4 + r() * 0.4);
      c.fillStyle = r() > 0.5 ? '#f9f8f4' : ['#cfe3ee', '#e9d8b8', '#d9ead8'][Math.floor(r() * 3)];
      if (r() > 0.5) { c.fillRect(x, base - h, w, h); } else { K.roundRect(c, x, base - h, w, h, w * 0.3); c.fill(); }
      c.fillStyle = 'rgba(60,110,150,0.6)'; c.fillRect(x + 1, base - h * 0.6, w - 2, 3);
      x += w + 3;
    }
    c.fillStyle = '#d8dcdb'; c.fillRect(0, base, W, 3);
  }
}
function drawLockerDoors(c, W, Hh) {
  c.fillStyle = '#c9a77c'; c.fillRect(0, 0, W, Hh);
  const cols = 3; const rows = 4; const cw = W / cols; const ch = Hh / rows;
  for (let i = 0; i < cols; i++) for (let k = 0; k < rows; k++) {
    rrect(c, i * cw + 2, k * ch + 2, cw - 4, ch - 4, 4, '#e3c9a0', 'rgba(90,60,30,0.35)', 1);
    rrect(c, i * cw + cw * 0.35, k * ch + ch * 0.18, cw * 0.3, ch * 0.2, 3, '#fbf7ee');
    txt(c, String(k * cols + i + 1), i * cw + cw / 2, k * ch + ch * 0.28, ch * 0.15, { w: 700 });
    c.fillStyle = '#8a6a4a'; c.fillRect(i * cw + cw * 0.45, k * ch + ch * 0.7, cw * 0.1, ch * 0.08);
  }
}
function drawMagCover(c, W, Hh, k) {
  const sets = [['#f6d77a', 'けんこう', '#e05a4f'], ['#9cc0e0', 'りょうり', '#2f5d8f'], ['#f2b8b0', 'たびの 本', '#8a3a3a'], ['#8fcab8', 'くらし', '#2f6b55'], ['#c3b3e6', 'えほん', '#5b3f8f'], ['#f2c49b', 'しゅうまつ', '#8a5a2a'], ['#d9ead8', 'はな', '#3f7a3c'], ['#f7f4ec', 'スポーツ', '#2b2e33'], ['#fde3ea', 'こそだて', '#c0504d']];
  const [bg, title, ink] = sets[k % sets.length];
  c.fillStyle = bg; c.fillRect(0, 0, W, Hh);
  txt(c, title, W / 2, Hh * 0.14, Hh * 0.13, { color: ink, w: 800, max: W * 0.9 });
  const r = K.rng(k + 3);
  c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.arc(W * (0.3 + r() * 0.4), Hh * 0.56, W * 0.28, 0, Math.PI * 2); c.fill();
  c.fillStyle = ink; c.globalAlpha = 0.55; c.beginPath(); c.arc(W * (0.35 + r() * 0.3), Hh * 0.58, W * 0.14, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
  c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(W * 0.1, Hh * 0.86, W * 0.6, 3); c.fillRect(W * 0.1, Hh * 0.92, W * 0.4, 3);
}
function drawKidsMat(c, W, Hh) {
  const cols = ['#f2b8b0', '#9cc0e0', '#f6d77a', '#8fcab8', '#c3b3e6'];
  const n = 5; const s = W / n;
  for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) {
    c.fillStyle = cols[(i + k * 2) % cols.length]; c.fillRect(i * s, k * s, s, s);
    c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.arc(i * s + s / 2, k * s + s / 2, s * 0.18, 0, Math.PI * 2); c.fill();
  }
  c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 2;
  for (let i = 1; i < n; i++) { c.beginPath(); c.moveTo(i * s, 0); c.lineTo(i * s, Hh); c.stroke(); c.beginPath(); c.moveTo(0, i * s); c.lineTo(W, i * s); c.stroke(); }
}
function drawDoormat(c, W, Hh, rain) {
  c.fillStyle = rain ? '#4a4f55' : '#5d636a'; c.fillRect(0, 0, W, Hh);
  c.strokeStyle = '#8fcab8'; c.lineWidth = Hh * 0.06; c.strokeRect(Hh * 0.08, Hh * 0.08, W - Hh * 0.16, Hh - Hh * 0.16);
  cross(c, W * 0.2, Hh / 2, Hh * 0.32, '#8fcab8');
  txt(c, 'いしだ クリニック', W * 0.58, Hh / 2, Hh * 0.28, { color: '#e8efe9', w: 800, max: W * 0.66 });
}
function drawLandscape(c, W, Hh) {
  const gr = c.createLinearGradient(0, 0, 0, Hh); gr.addColorStop(0, '#bfe0f2'); gr.addColorStop(1, '#f6ecd8');
  c.fillStyle = gr; c.fillRect(0, 0, W, Hh);
  c.fillStyle = '#9fb7cf'; c.beginPath(); c.moveTo(0, Hh * 0.7); c.lineTo(W * 0.3, Hh * 0.35); c.lineTo(W * 0.5, Hh * 0.6); c.lineTo(W * 0.72, Hh * 0.3); c.lineTo(W, Hh * 0.65); c.lineTo(W, Hh); c.lineTo(0, Hh); c.fill();
  c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(W * 0.66, Hh * 0.38); c.lineTo(W * 0.72, Hh * 0.3); c.lineTo(W * 0.78, Hh * 0.39); c.fill();
  c.fillStyle = '#8fb873'; c.beginPath(); c.moveTo(0, Hh * 0.8); c.quadraticCurveTo(W * 0.5, Hh * 0.62, W, Hh * 0.82); c.lineTo(W, Hh); c.lineTo(0, Hh); c.fill();
}

/** Outside view for the windows and the entrance (kind: 'garden' | 'street'), reacting to time, season, weather. */
function drawView(c, W, Hh, { time, season, weather }, kind) {
  const night = time === 'night'; const eve = time === 'evening'; const grey = weather !== 'clear';
  const sky = night ? ['#0f1b36', '#2b3c62'] : eve ? ['#e9996a', '#fde0bb'] : time === 'morning' ? ['#a9d6f2', '#f6ead6'] : ['#7fc0ec', '#e2f2fb'];
  if (grey && !night) { sky[0] = mix(sky[0], '#9aa5b1', 0.65); sky[1] = mix(sky[1], '#c9cfd5', 0.6); }
  const gr = c.createLinearGradient(0, 0, 0, Hh); gr.addColorStop(0, sky[0]); gr.addColorStop(1, sky[1]);
  c.fillStyle = gr; c.fillRect(0, 0, W, Hh);
  const r = K.rng(kind === 'street' ? 17 : 5);
  const dk = (hex) => (night ? shade(hex, 0.3) : eve ? shade(mix(hex, '#f0b080', 0.15), 0.85) : hex);
  if (!night && !grey) { c.fillStyle = 'rgba(255,255,255,0.75)'; for (let i = 0; i < 4; i++) { const x = r() * W; const y = Hh * (0.08 + r() * 0.2); for (let k = 0; k < 3; k++) { c.beginPath(); c.ellipse(x + k * W * 0.04, y + (k % 2) * 4, W * 0.05, Hh * 0.03, 0, 0, Math.PI * 2); c.fill(); } } }
  if (night && !grey) { c.fillStyle = 'rgba(255,255,230,0.8)'; for (let i = 0; i < 26; i++) c.fillRect(r() * W, r() * Hh * 0.4, 1.5, 1.5); c.fillStyle = '#f6f0d0'; c.beginPath(); c.arc(W * 0.8, Hh * 0.14, W * 0.025, 0, Math.PI * 2); c.fill(); }
  const gy = Hh * (kind === 'street' ? 0.7 : 0.74);
  // a row of Japanese houses
  let x = -W * 0.03;
  while (x < W) {
    const bw = W * (0.13 + r() * 0.09); const bh = Hh * (0.17 + r() * 0.12); const top = gy - bh - Hh * 0.04;
    c.fillStyle = dk(['#efe6d6', '#e3dccf', '#d9e0e4', '#f2ead9', '#e8d9c6'][Math.floor(r() * 5)]);
    c.fillRect(x, top, bw, bh + Hh * 0.04);
    c.fillStyle = dk(['#5b6b7c', '#7a5a4a', '#4f5f6f', '#6b6f78'][Math.floor(r() * 4)]);
    c.beginPath(); c.moveTo(x - bw * 0.07, top + 2); c.lineTo(x + bw * 0.2, top - bh * 0.3); c.lineTo(x + bw * 0.8, top - bh * 0.3); c.lineTo(x + bw * 1.07, top + 2); c.fill();
    for (let k = 0; k < 2; k++) {
      const lit = night ? r() > 0.35 : false;
      c.fillStyle = lit ? '#ffd88a' : night ? '#1d2433' : dk('#9fb3c2');
      c.fillRect(x + bw * (0.18 + k * 0.42), top + bh * 0.25, bw * 0.22, bh * 0.28);
    }
    x += bw + W * (0.015 + r() * 0.02);
  }
  // utility pole and wires
  const px = W * (kind === 'street' ? 0.86 : 0.72);
  c.fillStyle = night ? '#2a2f3a' : dk('#8d8a84'); c.fillRect(px, Hh * 0.05, W * 0.012, gy - Hh * 0.05 + 4); c.fillRect(px - W * 0.04, Hh * 0.12, W * 0.092, Hh * 0.012);
  c.strokeStyle = night ? 'rgba(20,24,32,0.9)' : 'rgba(60,60,60,0.55)'; c.lineWidth = 1.2;
  for (const dy of [0.12, 0.15]) { c.beginPath(); c.moveTo(0, Hh * (dy + 0.05)); c.quadraticCurveTo(px * 0.5, Hh * (dy + 0.12), px, Hh * dy); c.quadraticCurveTo(px + (W - px) * 0.5, Hh * (dy + 0.08), W, Hh * (dy + 0.03)); c.stroke(); }
  if (kind === 'garden') {
    c.fillStyle = dk('#8db874'); c.fillRect(0, gy, W, Hh - gy);
    c.fillStyle = dk('#d9c7a6'); for (let i = 0; i < W; i += W * 0.03) c.fillRect(i, gy - Hh * 0.08, W * 0.02, Hh * 0.1);
    c.fillRect(0, gy - Hh * 0.06, W, Hh * 0.012);
    c.fillStyle = dk('#4f8a4a'); for (let i = 0; i < 14; i++) { c.beginPath(); c.arc(i / 13 * W, gy + Hh * 0.04, W * 0.05, 0, Math.PI * 2); c.fill(); }
  } else {
    c.fillStyle = dk('#bdb8ae'); c.fillRect(0, gy, W, Hh - gy);
    c.fillStyle = dk('#74777c'); c.fillRect(0, gy + (Hh - gy) * 0.18, W, (Hh - gy) * 0.4);
    c.fillStyle = night ? '#6b6b60' : '#f4f1e8'; for (let i = 0; i < W; i += W * 0.12) c.fillRect(i, gy + (Hh - gy) * 0.37, W * 0.06, 2);
    c.fillStyle = dk('#d2cdc2'); c.fillRect(0, gy + (Hh - gy) * 0.58, W, (Hh - gy) * 0.42);
    // a standing signboard of the clinic by the door
    const sx = W * 0.72; const sy = gy + (Hh - gy) * 0.62;
    c.fillStyle = dk('#3f9b74'); c.fillRect(sx, sy - Hh * 0.17, W * 0.06, Hh * 0.17);
    c.fillStyle = dk('#ffffff'); c.fillRect(sx + W * 0.006, sy - Hh * 0.16, W * 0.048, Hh * 0.1);
    cross(c, sx + W * 0.03, sy - Hh * 0.11, W * 0.03, dk(GREEN));
  }
  // the tree (season)
  const tx = kind === 'garden' ? W * 0.3 : W * 0.16; const ty = gy + Hh * 0.02;
  c.fillStyle = dk('#7a5a3c'); c.fillRect(tx - W * 0.012, ty - Hh * 0.38, W * 0.024, Hh * 0.38);
  if (season === 'winter') {
    c.strokeStyle = dk('#6e5640'); c.lineWidth = 2;
    for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 + (r() - 0.5) * 1.6; const l = Hh * (0.12 + r() * 0.14); const by = ty - Hh * (0.22 + r() * 0.15); c.beginPath(); c.moveTo(tx, by); c.lineTo(tx + Math.cos(a) * l, by + Math.sin(a) * l); c.stroke(); }
  } else {
    const cols = { spring: ['#f7c6d4', '#f2a9bf', '#fbe0e8'], summer: ['#4f8f4a', '#5fa356', '#3f7a3c'], autumn: ['#e0823a', '#c9512f', '#e9b03e'] }[season] || ['#4f8f4a', '#5fa356', '#3f7a3c'];
    for (let i = 0; i < 22; i++) { c.fillStyle = dk(cols[i % 3]); c.beginPath(); c.arc(tx + (r() - 0.5) * W * 0.2, ty - Hh * (0.42 + r() * 0.22), W * (0.035 + r() * 0.035), 0, Math.PI * 2); c.fill(); }
  }
  if (night) { // a street lamp
    const lx = kind === 'garden' ? W * 0.88 : W * 0.4;
    c.fillStyle = '#2a2f3a'; c.fillRect(lx, Hh * 0.3, 3, gy - Hh * 0.3);
    const lg = c.createRadialGradient(lx, Hh * 0.3, 1, lx, Hh * 0.3, W * 0.12); lg.addColorStop(0, 'rgba(255,236,180,0.95)'); lg.addColorStop(1, 'rgba(255,236,180,0)');
    c.fillStyle = lg; c.beginPath(); c.arc(lx, Hh * 0.3, W * 0.12, 0, Math.PI * 2); c.fill();
  }
  if (weather === 'rain') {
    c.fillStyle = night ? 'rgba(40,50,70,0.3)' : 'rgba(170,178,190,0.3)'; c.fillRect(0, 0, W, Hh);
    c.strokeStyle = night ? 'rgba(180,190,210,0.35)' : 'rgba(235,240,248,0.5)'; c.lineWidth = 1;
    for (let i = 0; i < 160; i++) { const x0 = r() * W; const y0 = r() * Hh; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 - 2, y0 + 10 + r() * 8); c.stroke(); }
  }
}

function drawFrosted(c, W, Hh, { time, weather }) {
  const night = time === 'night';
  const top = night ? '#26314c' : time === 'evening' ? '#f3d3b4' : weather !== 'clear' ? '#dfe5ea' : '#f4fafb';
  const bot = night ? '#1b2338' : time === 'evening' ? '#f7e3cd' : weather !== 'clear' ? '#cfd7de' : '#e3f0f2';
  const gr = c.createLinearGradient(0, 0, 0, Hh); gr.addColorStop(0, top); gr.addColorStop(1, bot);
  c.fillStyle = gr; c.fillRect(0, 0, W, Hh);
  c.fillStyle = night ? 'rgba(0,0,0,0.15)' : 'rgba(120,150,120,0.12)';
  for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(W * (0.15 + i * 0.12), Hh * (0.55 + (i % 2) * 0.1), W * 0.12, 0, Math.PI * 2); c.fill(); }
}

// =================================================================== atlas (few draw calls)
/** Canvas atlas: drawings + one texel per plain colour, a few shared materials (matte/satin/gloss/metal/glow). */
function makeAtlas(size = 1024) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const std = (rough, metal = 0) => new THREE.MeshStandardMaterial({ map: tex, roughness: rough, metalness: metal, alphaTest: 0.5 });
  const bucket = { matte: std(0.78), satin: std(0.48), gloss: std(0.2), metal: std(0.3, 0.75) };
  const glow = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, alphaTest: 0.5 });
  const A = { tex, bucket, glow, material: bucket.matte, own: new Set([...Object.values(bucket), glow]), overflow: null, textAtlas: null };
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
  A.region = (w, h, draw) => {
    w = Math.max(4, Math.ceil(w)); h = Math.max(4, Math.ceil(h));
    const at = place(w + PAD, h + PAD);
    if (!at) {
      if (A.overflow) return A.overflow.region(w, h, draw);
      console.warn('clinic atlas full', w, h);
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
  A.remap = (geo, r) => {
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, r.u0 + uv.getX(i) * (r.u1 - r.u0), r.v0 + uv.getY(i) * (r.v1 - r.v0));
    uv.needsUpdate = true;
    return geo;
  };
  A.plane = (w, h, r, o = {}) => { const owner = r.atlas || A; return K.mesh(A.remap(new THREE.PlaneGeometry(w, h), r), o.glow ? owner.glow : owner.material, { cast: false, ...o }); };
  A.paint = (w, h, ppm, draw, o = {}) => A.plane(w, h, A.region(w * ppm, h * ppm, draw), o);
  /** Text sign (a plane); goes to the text atlas when one is attached. */
  A.text = (lines, w, h, o = {}) => {
    const T = A.textAtlas || A;
    const ppm = o.ppm ?? 320;
    const r = T.region(w * ppm, h * ppm, (g, W, Hh) => drawLabel(g, W, Hh, lines, o));
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
    const owner = r.atlas || A;
    const geo = o.geometry.clone();
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, r.u0, r.v0);
    o.geometry = geo;
    o.material = owner.bucket[kind];
  });
}

function drawLabel(g, W, Hh, lines, o = {}) {
  const r = (o.radius ?? 0.08) * Math.min(W, Hh);
  if (o.bg !== null) {
    g.fillStyle = o.bg ?? '#ffffff';
    K.roundRect(g, 0, 0, W, Hh, r); g.fill();
    if (o.border) {
      const lw = Math.max(2, Math.min(W, Hh) * (o.borderW ?? 0.06));
      g.strokeStyle = o.border; g.lineWidth = lw;
      K.roundRect(g, lw / 2, lw / 2, W - lw, Hh - lw, Math.max(1, r - lw / 2)); g.stroke();
    }
  }
  const arr = Array.isArray(lines) ? lines : [lines];
  const size = (o.size ?? 0.55) * Hh / Math.max(1, arr.length * 0.9);
  g.textBaseline = 'middle';
  arr.forEach((line, i) => {
    const l = typeof line === 'string' ? { t: line } : line;
    let s = size * (l.scale ?? 1);
    const wgt = l.weight ?? o.weight ?? 700;
    g.textAlign = 'center';
    g.font = `${wgt} ${s}px ${K.JP_FONT}`;
    g.fillStyle = l.color ?? o.fg ?? '#333333';
    const pad = W * (o.pad ?? 0.06);
    while (g.measureText(l.t).width > W - pad * 2 && s > 5) { s *= 0.92; g.font = `${wgt} ${s}px ${K.JP_FONT}`; }
    g.fillText(l.t, W / 2, Hh * (i + 0.5) / arr.length);
  });
}
