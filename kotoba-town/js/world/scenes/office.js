// office — bright design studio "みどりデザイン" in Tokyo: open desks, the learner's new desk,
// a colleague's desk, glass meeting room, reception with the logo wall, city windows.
// Learner stands at the origin looking toward -z.
import * as THREE from 'three';
import * as K from '../kit.js';

export const meta = { indoor: true, ambience: 'office' };

export default function build({ setup }) {
  const time = setup.time || 'morning';
  const g = new THREE.Group();
  const props = {};
  const W = 15; const D = 13; const Hh = 2.9;
  const cz = -3.5; // room centre z

  const floorMat = K.mat('#ffffff', { map: K.woodTex('#c49a6c', [6, 6], 8), rough: 0.6 });
  const wallMat = K.mat('#f3efe7', { rough: 0.9 });
  const room = K.room({ w: W, d: D, h: Hh, floor: floorMat, wall: wallMat, ceiling: K.mat('#fbfaf7', { rough: 1 }), skip: ['west'] });
  room.position.z = cz;
  g.add(room);
  // west: window wall with the city
  for (let i = 0; i < 4; i++) {
    const win = K.windowPane(3.0, 2.2, time === 'night' ? 'night' : 'city', time);
    win.position.set(-W / 2, 1.45, cz - 4.5 + i * 3.1);
    win.rotation.y = Math.PI / 2;
    g.add(win);
  }
  g.add(K.box(0.12, 0.6, D, K.mat('#e9e5dc'), { x: -W / 2, z: cz }));
  g.add(K.box(0.12, 0.25, D, K.mat('#e9e5dc'), { x: -W / 2, y: Hh - 0.25, z: cz }));
  // rug under the learner's area
  g.add(K.mesh(new THREE.PlaneGeometry(4.2, 3.4), K.mat('#ffffff', { map: K.carpetTex('#8aa39a', [3, 3]) }), { y: 0.005, z: -0.8, rx: -Math.PI / 2, cast: false }));
  // ceiling panels + lights
  for (let x = -5; x <= 5; x += 2.5) for (let z = cz - 4.5; z <= cz + 4.5; z += 3) {
    const p = K.ceilingPanel(1.2, 0.3);
    p.position.set(x, Hh - 0.02, z);
    g.add(p);
  }
  const fill = new THREE.PointLight('#fff4e0', 6, 9, 1.6);
  fill.position.set(0, 2.6, -1.2);
  g.add(fill);

  // ---- the learner's new desk (right side, within reach)
  const myDesk = K.prop('my_desk', K.table(1.4, 0.7, 0.72, K.mat('#f2efe8', { rough: 0.45 }), K.mat('#9aa0a6', { metal: 0.6, rough: 0.4 })), { labelJa: 'わたしの つくえ', labelEn: 'my desk' });
  myDesk.position.set(1.05, 0, -0.25);
  myDesk.rotation.y = -Math.PI / 2;
  g.add(myDesk);
  const pc = K.prop('pc', monitor(), { labelJa: 'コンピューター', labelEn: 'computer' });
  pc.position.set(1.3, 0.72, -0.25);
  pc.rotation.y = -Math.PI / 2;
  g.add(pc);
  g.add(K.box(0.42, 0.02, 0.14, K.mat('#3a3d42'), { x: 0.95, y: 0.72, z: -0.25, ry: -Math.PI / 2 })); // keyboard
  const cards = K.prop('business_card', cardBox(), { labelJa: 'めいし', labelEn: 'business cards' });
  cards.position.set(0.82, 0.72, 0.15);
  cards.rotation.y = -0.4;
  g.add(cards);
  const chair = K.chair('#3f4650', '#3f4650');
  chair.position.set(0.45, 0, -0.25); chair.rotation.y = Math.PI / 2;
  g.add(chair);

  // ---- colleague's desk (by the NPC)
  const aokiDesk = K.prop('aoki_desk', K.table(1.4, 0.7, 0.72, K.mat('#f2efe8', { rough: 0.45 }), K.mat('#9aa0a6', { metal: 0.6, rough: 0.4 })), { labelJa: 'あおきさんの つくえ', labelEn: "Aoki's desk" });
  aokiDesk.position.set(-1.35, 0, -1.55);
  aokiDesk.rotation.y = Math.PI / 2;
  g.add(aokiDesk);
  const m2 = monitor(); m2.position.set(-1.6, 0.72, -1.55); m2.rotation.y = Math.PI / 2; g.add(m2);
  const phone = K.prop('phone_desk', deskPhone(), { labelJa: 'でんわ', labelEn: 'telephone' });
  phone.position.set(-1.2, 0.72, -1.95); phone.rotation.y = Math.PI / 2 + 0.3;
  g.add(phone);
  const cup = K.prop('cup', mug('#e8a33c'), { labelJa: 'カップ', labelEn: 'cup' });
  cup.position.set(-1.15, 0.72, -1.2);
  g.add(cup);
  const book = K.box(0.16, 0.03, 0.23, K.mat('#4c7bb5'), { x: -1.2, y: 0.72, z: -1.45, ry: 0.2 }); g.add(book);
  const plantN = K.prop('plant', K.plant(1.1, 4), { labelJa: 'き', labelEn: 'plant' });
  plantN.position.set(1.45, 0, -2.45);
  g.add(plantN);
  // low partition with the calendar
  const part = K.box(0.06, 1.2, 1.6, K.mat('#d7d2c8', { rough: 0.9 }), { x: -2.15, z: -1.55 });
  g.add(part);
  const cal = K.prop('calendar', calendar(), { labelJa: 'カレンダー', labelEn: 'calendar' });
  cal.position.set(-2.11, 0.85, -1.4); cal.rotation.y = Math.PI / 2;
  g.add(cal);

  // ---- open office rows (far)
  for (let row = 0; row < 2; row++) for (let i = 0; i < 3; i++) {
    const x = 2.4 + i * 1.6; const z = -4.2 - row * 1.8;
    const t = K.table(1.4, 0.7, 0.72, K.mat('#f2efe8', { rough: 0.45 }), K.mat('#9aa0a6', { metal: 0.6 }));
    t.position.set(x, 0, z); g.add(t);
    const mm = monitor(); mm.position.set(x, 0.72, z - 0.2); g.add(mm);
    const ch = K.chair('#3f4650', '#4f5864'); ch.position.set(x, 0, z + 0.55); ch.rotation.y = Math.PI; g.add(ch);
  }
  // whiteboard on the east wall (far)
  const wb = K.prop('whiteboard', whiteboard(), { labelJa: 'ホワイトボード', labelEn: 'whiteboard' });
  wb.position.set(W / 2 - 0.05, 1.45, -2.4); wb.rotation.y = -Math.PI / 2;
  g.add(wb);
  // coffee corner (far right back)
  const coffee = K.prop('coffee_machine', coffeeCorner(), { labelJa: 'コーヒーメーカー', labelEn: 'coffee machine' });
  coffee.position.set(5.6, 0, -7.6);
  g.add(coffee);

  // ---- reception + logo wall (far, straight ahead)
  const counter = K.rbox(2.6, 1.05, 0.7, 0.05, K.mat('#ffffff', { map: K.woodTex('#a5784e', [2, 1], 5), rough: 0.5 }));
  counter.position.set(-1.2, 0, -7.4);
  g.add(counter);
  g.add(K.box(2.7, 0.04, 0.8, K.mat('#f5f3ef', { rough: 0.3 }), { x: -1.2, y: 1.05, z: -7.4 }));
  const logo = K.prop('logo_wall', logoWall(), { labelJa: 'みどりデザインの ロゴ', labelEn: 'company logo' });
  logo.position.set(-1.2, 0, -cz * 0 + cz - D / 2 + 0.06);
  g.add(logo);
  const clk = K.prop('clock', K.clock(0.22, time === 'morning' ? 9 : time === 'noon' ? 12 : time === 'evening' ? 17 : 20, 5), { labelJa: 'とけい', labelEn: 'clock' });
  clk.position.set(2.3, 2.25, cz - D / 2 + 0.05);
  g.add(clk);
  const plantL = K.plant(1.3, 9); plantL.position.set(0.6, 0, -9.2); g.add(plantL);

  // ---- glass meeting room (far left)
  const meet = K.prop('meeting_room', meetingRoom(), { labelJa: 'かいぎしつ', labelEn: 'meeting room' });
  meet.position.set(-5.0, 0, -6.6);
  g.add(meet);
  // corridor door + signs (far right wall)
  const dr = K.prop('door', K.door('#a5784e'), { labelJa: 'ドア', labelEn: 'door' });
  dr.position.set(W / 2 - 0.04, 0, -8.2); dr.rotation.y = -Math.PI / 2;
  g.add(dr);
  const ts = K.prop('toilet_sign', K.sign(['トイレ'], 0.55, 0.22, { bg: '#2f6db3', fg: '#ffffff' }), { labelJa: 'トイレ', labelEn: 'restroom' });
  ts.position.set(W / 2 - 0.05, 2.35, -8.2); ts.rotation.y = -Math.PI / 2;
  g.add(ts);
  const elev = K.prop('elevator', elevator(), { labelJa: 'エレベーター', labelEn: 'elevator' });
  elev.position.set(W / 2 - 0.04, 0, -5.9); elev.rotation.y = -Math.PI / 2;
  g.add(elev);
  for (const [x, z] of [[-4.5, 1.6], [6.4, 1.8], [-6.5, -9.2]]) { const p = K.plant(1.2, x * 3 + z); p.position.set(x, 0, z); g.add(p); }
  // bookshelf behind the learner
  const sh = K.shelf(2.2, 1.8, 0.4, ['#e7d8c0', '#9cb4c9', '#c97a5d', '#7f9f7a', '#ece6da'], 21);
  sh.position.set(-0.6, 0, 2.6); sh.rotation.y = Math.PI;
  g.add(sh);

  for (const o of [cards, myDesk, pc, aokiDesk, phone, cup, plantN, cal, wb, coffee, logo, clk, meet, dr, ts, elev]) props[o.userData.propId] = o;

  return K.finalize({
    group: g,
    spawn: K.spot(0, 0, 0),
    slots: {
      npc1: K.spot(-0.15, -1.35, 0),
      npc2: K.spot(-0.95, -1.95, 0.45),
      npc3: K.spot(0.62, -1.7, -0.35), // third colleague in a stand-up meeting
      reception: K.spot(-1.2, -8.05, 0),
      phone: null,
    },
    props,
    center: new THREE.Vector3(0, 0, -3),
    radius: 9,
  });
}

// ------------------------------------------------------------ local props
function monitor() {
  const g = new THREE.Group();
  g.add(K.box(0.2, 0.02, 0.16, K.mat('#2b2e33'), {}));
  g.add(K.box(0.04, 0.3, 0.03, K.mat('#2b2e33'), { z: -0.03 }));
  g.add(K.box(0.6, 0.36, 0.03, K.mat('#1d1f23', { rough: 0.4 }), { y: 0.22, z: -0.02 }));
  const scr = K.mesh(new THREE.PlaneGeometry(0.56, 0.32), new THREE.MeshBasicMaterial({ color: '#cfe3f5', toneMapped: false }), { y: 0.4, z: 0.0, cast: false });
  g.add(scr);
  return g;
}
function cardBox() {
  const g = new THREE.Group();
  g.add(K.box(0.11, 0.035, 0.07, K.mat('#f7f4ee', { rough: 0.6 })));
  const top = K.sign([{ t: 'みどりデザイン', scale: 0.6 }, { t: 'めいし', scale: 0.9 }], 0.1, 0.06, { bg: '#ffffff', fg: '#2f7a5b', ppm: 1400 });
  top.rotation.x = -Math.PI / 2; top.position.y = 0.037;
  g.add(top);
  return g;
}
function deskPhone() {
  const g = new THREE.Group();
  g.add(K.rbox(0.2, 0.06, 0.18, 0.02, K.mat('#e9e9e6', { rough: 0.4 })));
  g.add(K.rbox(0.05, 0.04, 0.2, 0.02, K.mat('#d8d8d4', { rough: 0.4 }), { x: -0.06, y: 0.06 }));
  return g;
}
export function mug(color = '#ffffff') {
  const g = new THREE.Group();
  g.add(K.cyl(0.04, 0.035, 0.09, K.mat(color, { rough: 0.35 })));
  g.add(K.mesh(new THREE.TorusGeometry(0.025, 0.006, 6, 12, Math.PI), K.mat(color, { rough: 0.35 }), { x: 0.045, y: 0.045, rz: -Math.PI / 2 }));
  return g;
}
function calendar() {
  const s = K.sign([{ t: '4がつ', scale: 0.9, color: '#c0392b' }, { t: '1 2 3 4 5 6 7', scale: 0.55 }, { t: '8 9 10 11 12 13 14', scale: 0.55 }, { t: '15 16 17 18 19 20 21', scale: 0.55 }], 0.34, 0.42, { bg: '#ffffff', fg: '#333', radius: 0.02 });
  return s;
}
function whiteboard() {
  const g = new THREE.Group();
  g.add(K.box(2.0, 1.1, 0.04, K.mat('#bfc4c9', { metal: 0.4, rough: 0.3 }), { y: -0.55, z: -0.02 }));
  const s = K.sign([{ t: 'こんしゅうの よてい', scale: 0.7, color: '#2f6db3' }, { t: 'げつ 10:00 かいぎ', scale: 0.55 }, { t: 'すい 14:00 デザイン', scale: 0.55 }, { t: 'きん 17:00 のみかい', scale: 0.55, color: '#c0392b' }], 1.9, 1.0, { bg: '#fbfcfd', fg: '#333', radius: 0.01, weight: 500 });
  s.position.z = 0.005;
  g.add(s);
  return g;
}
function coffeeCorner() {
  const g = new THREE.Group();
  g.add(K.box(1.6, 0.9, 0.6, K.mat('#ffffff', { map: K.woodTex('#a5784e', [2, 1], 4) })));
  g.add(K.box(1.62, 0.04, 0.62, K.mat('#f2f0ec', { rough: 0.3 }), { y: 0.9 }));
  g.add(K.rbox(0.32, 0.42, 0.36, 0.03, K.mat('#2c2c2f', { metal: 0.3, rough: 0.35 }), { x: -0.3, y: 0.94 }));
  g.add(K.rbox(0.18, 0.04, 0.12, 0.01, K.mat('#9e9e9e', { metal: 0.7 }), { x: -0.3, y: 0.98, z: 0.13 }));
  for (let i = 0; i < 4; i++) { const m = mug(['#ffffff', '#e8a33c', '#7fb5d6', '#e46f6f'][i]); m.position.set(0.15 + i * 0.12, 0.94, 0.05); g.add(m); }
  const s = K.sign(['コーヒー'], 0.5, 0.16, { bg: '#5b3b26', fg: '#fff3dd' });
  s.position.set(-0.3, 1.75, -0.28);
  g.add(s);
  return g;
}
function logoWall() {
  const g = new THREE.Group();
  g.add(K.box(4.2, 2.9, 0.08, K.mat('#ffffff', { map: K.woodTex('#8c6a4a', [3, 1], 10), rough: 0.6 })));
  const logo = K.sign([{ t: 'みどりデザイン', scale: 1 }, { t: 'MIDORI DESIGN', scale: 0.5, weight: 500 }], 2.4, 0.8, { bg: null, fg: '#f4f1e6' });
  logo.position.set(0, 1.85, 0.05);
  g.add(logo);
  return g;
}
function meetingRoom() {
  const g = new THREE.Group();
  const glass = K.glassMat();
  g.add(K.box(3.2, 2.7, 0.04, glass, { z: 1.4, cast: false }));
  g.add(K.box(0.04, 2.7, 2.8, glass, { x: 1.6, cast: false }));
  g.add(K.box(3.2, 0.06, 0.06, K.mat('#9aa0a6', { metal: 0.6 }), { y: 2.68, z: 1.4 }));
  const t = K.table(2.0, 0.9, 0.72, K.mat('#f2efe8', { rough: 0.4 }));
  g.add(t);
  for (const [x, z] of [[-0.6, 0.75], [0.6, 0.75], [-0.6, -0.75], [0.6, -0.75]]) { const c = K.chair('#3f4650', '#5b6a7a'); c.position.set(x, 0, z); c.rotation.y = z > 0 ? Math.PI : 0; g.add(c); }
  const s = K.sign(['かいぎしつ'], 0.7, 0.2, { bg: '#ffffff', fg: '#2f7a5b' });
  s.position.set(0, 2.2, 1.43);
  g.add(s);
  return g;
}
function elevator() {
  const g = new THREE.Group();
  g.add(K.box(1.4, 2.4, 0.06, K.mat('#d9d6cf'), { z: -0.03 }));
  g.add(K.box(0.6, 2.1, 0.04, K.mat('#b8bcc0', { metal: 0.8, rough: 0.25 }), { x: -0.31 }));
  g.add(K.box(0.6, 2.1, 0.04, K.mat('#b8bcc0', { metal: 0.8, rough: 0.25 }), { x: 0.31 }));
  const s = K.sign(['エレベーター'], 0.9, 0.16, { bg: '#333', fg: '#fff' });
  s.position.set(0, 2.25, 0.04);
  g.add(s);
  return g;
}
