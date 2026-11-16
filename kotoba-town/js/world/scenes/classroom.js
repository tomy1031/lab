// classroom — a small, warm classroom of a Japanese language school (日本語学校).
// Desks are pushed together for conversation practice: the learner sits at the head of the group
// (お誕生日席), Ana on the left side, Minh on the right side, Hayakawa-sensei in front of the group
// by her desk (教卓), whiteboard behind her. Windows on the students' left (as in Japanese schools),
// corridor wall with sliding doors and a bulletin board on the right, lockers at the back.
// Learner stands at the origin looking toward -z.
import * as THREE from 'three';
import * as K from '../kit.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const meta = { indoor: true, ambience: 'classroom' };

const W = 7.0; const ZF = -3.7; const ZB = 3.3; const H = 2.7; // room: x ∈ [-3.5, 3.5], z ∈ [ZF, ZB]
const DESK_H = 0.7; const SEAT_H = 0.43;

export default function build({ setup }) {
  const time = setup.time || 'morning';
  const season = setup.season || 'spring';
  const rain = setup.weather === 'rain';
  const cloudy = setup.weather === 'cloudy' || rain;
  const dark = time === 'night' || time === 'evening';
  const winter = season === 'winter';
  const g = new THREE.Group();
  const A = makeAtlas(1024, 4); // small props, swatches
  const B = makeAtlas(1024, 1); // big flat boards: whiteboard, maps, posters
  const props = {};
  const add = (o, x = 0, y = 0, z = 0, ry = 0) => { o.position.set(x, y, z); o.rotation.y = ry; g.add(o); return o; };

  // ------------------------------------------------------------------ materials
  const floorMat = K.mat('#ffffff', { map: K.woodTex('#c49568', [5, 5], 9), rough: 0.55 });
  const wallMat = K.mat('#f4efe4', { rough: 0.95 });
  const wainMat = K.mat('#ffffff', { map: K.woodTex('#b98a5e', [6, 1], 3), rough: 0.6 });
  const trimMat = K.mat('#8c6646', { rough: 0.6 });
  const ceilMat = K.mat('#ffffff', { map: ceilingTex(), rough: 1, emissive: '#6d6a62', emissiveIntensity: 0.55 });
  const deskTop = K.mat('#ffffff', { map: K.woodTex('#e3c79c', [1, 1], 4), rough: 0.45 });
  const plyMat = K.mat('#ffffff', { map: K.woodTex('#c9935e', [1, 1], 3), rough: 0.5 });
  const steel = K.mat('#a3aab1', { metal: 0.55, rough: 0.4 });
  const alu = K.mat('#d4d8dc', { metal: 0.5, rough: 0.35 });
  const doorMat = K.mat('#ffffff', { map: K.woodTex('#c8a274', [1, 1], 2), rough: 0.55 });
  const curtainMat = K.mat('#f0e2c2', { rough: 0.95 });

  // ------------------------------------------------------------------ shell
  const room = K.room({ w: W, d: ZB - ZF, h: H, floor: floorMat, wall: wallMat, skip: ['west'] });
  room.position.z = (ZF + ZB) / 2;
  g.add(room);
  // ceiling: one plane with the tile texture
  g.add(K.mesh(new THREE.PlaneGeometry(W, ZB - ZF), ceilMat, { rx: Math.PI / 2, y: H, z: (ZF + ZB) / 2, cast: false }));
  // wainscot (腰板) + rails on the three solid walls
  const wain = (len, x, z, ry) => {
    const m = K.mesh(new THREE.BoxGeometry(len, 0.9, 0.025), wainMat, { x, y: 0.45, z, ry, cast: false });
    g.add(m);
    g.add(K.mesh(new THREE.BoxGeometry(len, 0.04, 0.05), trimMat, { x, y: 0.92, z, ry, cast: false }));
    g.add(K.mesh(new THREE.BoxGeometry(len, 0.05, 0.04), trimMat, { x, y: H - 0.05, z, ry, cast: false }));
  };
  wain(W, 0, ZF + 0.012, 0);
  wain(W, 0, ZB - 0.012, 0);
  wain(ZB - ZF, W / 2 - 0.012, (ZF + ZB) / 2, Math.PI / 2);

  // west: window wall (windows on the students' left)
  const winZ = [-2.3, -0.1, 2.1]; const winW = 1.8; const sill = 0.95; const winTop = 2.4;
  const xw = -W / 2;
  // wall pieces around the openings
  const wallPiece = (z0, z1, y0, y1) => g.add(K.mesh(new THREE.PlaneGeometry(z1 - z0, y1 - y0), wallMat, { x: xw, y: (y0 + y1) / 2, z: (z0 + z1) / 2, ry: Math.PI / 2, cast: false }));
  wallPiece(ZF, ZB, 0, sill);
  wallPiece(ZF, ZB, winTop, H);
  let zc = ZF;
  for (const z of winZ) { wallPiece(zc, z - winW / 2, sill, winTop); zc = z + winW / 2; }
  wallPiece(zc, ZB, sill, winTop);
  g.add(K.mesh(new THREE.BoxGeometry(0.025, 0.9, ZB - ZF), wainMat, { x: xw + 0.012, y: 0.45, z: (ZF + ZB) / 2, cast: false }));
  g.add(K.mesh(new THREE.BoxGeometry(0.05, 0.05, ZB - ZF), trimMat, { x: xw + 0.02, y: H - 0.05, z: (ZF + ZB) / 2, cast: false }));
  // outside: one painted view far behind the windows (parallax) + frames, glass, sills, curtains
  const view = new THREE.Mesh(new THREE.PlaneGeometry(16, 7), new THREE.MeshBasicMaterial({ map: outsideTex(time, season, setup.weather), toneMapped: false }));
  view.position.set(xw - 3.2, 1.9, -0.1); view.rotation.y = Math.PI / 2;
  g.add(view);
  for (const z of winZ) {
    const fr = (w, h, d, x, y, zz) => g.add(K.mesh(new THREE.BoxGeometry(w, h, d), alu, { x, y, z: zz, cast: false }));
    fr(0.12, 0.05, winW + 0.05, xw, sill, z); fr(0.12, 0.05, winW + 0.05, xw, winTop, z);
    fr(0.12, winTop - sill, 0.05, xw, (sill + winTop) / 2, z - winW / 2); fr(0.12, winTop - sill, 0.05, xw, (sill + winTop) / 2, z + winW / 2);
    fr(0.06, winTop - sill, 0.04, xw - 0.02, (sill + winTop) / 2, z); // meeting stile of the sliding sashes
    fr(0.05, 0.03, winW, xw - 0.03, sill + 0.55, z); // transom bar
    g.add(K.mesh(new THREE.PlaneGeometry(winW, winTop - sill), K.glassMat(), { x: xw - 0.01, y: (sill + winTop) / 2, z, ry: Math.PI / 2, cast: false, receive: false }));
    g.add(K.box(0.22, 0.03, winW + 0.2, plyMat, { x: xw + 0.1, y: sill - 0.03, z, cast: false })); // sill board
    for (const s of [-1, 1]) {
      const c = curtain(curtainMat, 0.42, winTop - sill + 0.3);
      add(c, xw + 0.14, sill - 0.2, z + s * (winW / 2 + 0.02), Math.PI / 2);
    }
    g.add(K.box(0.04, 0.04, winW + 1.0, alu, { x: xw + 0.14, y: winTop + 0.1, z, cast: false })); // curtain rail
  }
  // little things on the window sills
  const pot = K.plant(0.55, 12); add(pot, xw + 0.14, sill, -1.25);
  const pot2 = K.plant(0.45, 5); add(pot2, xw + 0.14, sill, 1.0);
  add(A.cyl(0.05, 0.04, 0.12, '#7fb3c9', {}), xw + 0.12, sill, 3.0); // pencil cup

  // ------------------------------------------------------------------ front wall
  const wb = K.prop('whiteboard', whiteboard(A, B, alu, season, time), { labelJa: 'ホワイトボード', labelEn: 'whiteboard' });
  add(wb, 0, 0.82, ZF + 0.03);
  const hh = { morning: 9, noon: 12, evening: 17, night: 20 }[time] ?? 9;
  const mm = { morning: 5, noon: 30, evening: 50, night: 0 }[time] ?? 0;
  const clk = K.prop('clock', atlasClock(A, 0.17, hh, mm), { labelJa: 'とけい', labelEn: 'clock' });
  add(clk, 0, 2.33, ZF + 0.03);
  const kana = B.plane(0.86, 1.1, kanaChart(B), {}); add(kana, -2.5, 1.55, ZF + 0.02);
  const map = K.prop('map_japan', B.plane(1.25, 0.95, japanMap(B), {}), { labelJa: 'にほんの ちず', labelEn: 'map of Japan' });
  add(map, 2.45, 1.6, ZF + 0.02);
  g.add(A.box(1.31, 1.01, 0.02, '#8c6646', { x: 2.45, y: 1.12, z: ZF + 0.008, cast: false }));
  // speaker + daily-duty sign
  add(A.box(0.32, 0.22, 0.14, { all: '#e9e6df', front: A.draw(64, 44, (c, w, h) => { c.fillStyle = '#e9e6df'; c.fillRect(0, 0, w, h); c.fillStyle = '#9a968d'; for (let y = 6; y < h - 4; y += 5) for (let x = 6; x < w - 4; x += 5) c.fillRect(x, y, 2, 2); }) }, { cast: false }), 1.75, 2.35, ZF + 0.07);
  add(B.sign(['にっちょく', { t: winter ? 'ミン' : 'アナ', scale: 1.3, color: '#c0392b' }], 0.24, 0.32, { bg: '#fff8e6', border: '#8c6646', radius: 0.06 }), -1.9, 1.3, ZF + 0.02);
  // light switch + outlet
  add(A.box(0.08, 0.12, 0.012, '#f2f0ea', { cast: false }), 3.2, 1.2, ZF + 0.006);
  add(A.box(0.07, 0.11, 0.012, '#f2f0ea', { cast: false }), -1.6, 0.3, ZF + 0.006);

  // reading corner (front-left): low bookshelf with dictionaries + newspaper
  const shelfX = -2.75; const shelfZ = ZF + 0.25;
  add(bookshelf(A, plyMat, 1.2, 0.86, 0.32, 3), shelfX, 0, shelfZ);
  const news = K.prop('newspaper', newspaper(A, season), { labelJa: 'しんぶん', labelEn: 'newspaper' });
  add(news, shelfX + 0.2, 0.86, shelfZ + 0.02, 0.15);
  add(A.box(0.24, 0.05, 0.3, { all: '#d8d2c4', top: A.text(['にほんご', 'しんぶん'], 0.24, 0.3, { bg: '#f1ece0', fg: '#555', size: 0.4 }) }), shelfX - 0.35, 0.86, shelfZ, -0.1);
  const globe = new THREE.Group();
  globe.add(A.cyl(0.07, 0.09, 0.03, '#6b5a48', {}));
  globe.add(K.mesh(A.paint(new THREE.SphereGeometry(0.13, 16, 12), '#5d9fd0'), A.gloss, { y: 0.19 }));
  add(globe, shelfX - 0.1, 0.86, shelfZ + 0.03);

  // ------------------------------------------------------------------ east wall: corridor side
  const xe = W / 2;
  for (const [z, label] of [[-2.85, '1-A'], [2.55, '']]) {
    const d = slidingDoor(A, doorMat, alu);
    add(d, xe - 0.05, 0, z, -Math.PI / 2);
    if (label) add(B.sign([{ t: 'Aクラス', scale: 0.9 }, { t: 'にほんご しょきゅう', scale: 0.55 }], 0.42, 0.2, { bg: '#fffaf0', fg: '#3b5f8a', border: '#8c6646' }), xe - 0.03, 2.3, z, -Math.PI / 2);
  }
  // emergency exit pictogram over the back door (lit)
  add(A.plane(0.4, 0.14, A.draw(160, 56, (c, w, h) => {
    c.fillStyle = '#1f9a55'; c.fillRect(0, 0, w, h); c.fillStyle = '#f4fff4';
    c.font = `800 ${h * 0.5}px ${K.JP_FONT}`; c.textBaseline = 'middle'; c.fillText('非常口', w * 0.42, h * 0.52);
    c.beginPath(); c.arc(w * 0.16, h * 0.25, h * 0.1, 0, 7); c.fill();
    c.fillRect(w * 0.13, h * 0.38, w * 0.06, h * 0.3); c.fillRect(w * 0.08, h * 0.65, w * 0.05, h * 0.25); c.fillRect(w * 0.2, h * 0.62, w * 0.06, h * 0.08);
  }), { mat: A.glow }), xe - 0.03, 2.3, 2.55, -Math.PI / 2);
  // bulletin board (掲示板) with posters
  add(bulletin(A, B, trimMat, season), xe - 0.02, 1.0, -0.2, -Math.PI / 2);
  // high transom windows to the corridor
  const transom = A.draw(64, 16, (c, w, h) => { c.fillStyle = dark ? '#efe2c4' : '#e6ebe9'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(0,0,0,0.08)'; c.fillRect(w / 2 - 1, 0, 2, h); });
  for (const z of [-1.2, 0.8]) {
    add(A.plane(1.4, 0.32, transom, { mat: A.glow }), xe - 0.01, 2.35, z, -Math.PI / 2);
    g.add(K.box(0.05, 0.04, 1.44, alu, { x: xe - 0.02, y: 2.17, z, cast: false }));
    g.add(K.box(0.05, 0.04, 1.44, alu, { x: xe - 0.02, y: 2.51, z, cast: false }));
  }

  // ------------------------------------------------------------------ back wall
  // cubby lockers for bags
  add(cubbies(A, plyMat, season), -0.6, 0, ZB - 0.22, Math.PI);
  // coat hooks with coats (more in winter)
  const hookRail = A.box(3.0, 0.06, 0.03, '#8c6646', { cast: false }); add(hookRail, -0.6, 1.62, ZB - 0.02);
  const coatColors = winter ? ['#5c6f8a', '#9a4b3f', '#3e4a3c', '#c9a46a', '#6d5a7a'] : season === 'autumn' ? ['#8a6a4a', '#4f5f74'] : ['#c7b9a1'];
  coatColors.forEach((c, i) => add(coat(A, c), -1.85 + i * 0.6, 1.6, ZB - 0.08, Math.PI));
  // timetable + calendar + air conditioner
  add(B.plane(0.7, 0.5, timetable(B), {}), 1.85, 1.75, ZB - 0.02, Math.PI);
  add(B.plane(0.42, 0.56, calendarRegion(B, season), {}), 2.75, 1.65, ZB - 0.02, Math.PI);
  add(aircon(A), -1.3, 2.3, ZB - 0.14, Math.PI);
  // umbrella stand by the back door
  add(umbrellaStand(A, rain), 3.05, 0, 3.0);

  // ------------------------------------------------------------------ ceiling lights
  for (const x of [-1.8, 0, 1.8]) for (const z of [-2.2, 0.0, 2.2]) {
    g.add(A.box(1.25, 0.06, 0.22, '#f2f1ec', { x, y: H - 0.06, z, cast: false }));
    const tube = K.mesh(A.paint(new THREE.BoxGeometry(1.15, 0.02, 0.14), '#fffdf4'), A.glow, { x, y: H - 0.075, z, cast: false, receive: false });
    g.add(tube);
  }
  add(A.box(0.62, 0.05, 0.62, { all: '#f2f1ec', bottom: A.draw(64, 64, (c, w, h) => { c.fillStyle = '#f2f1ec'; c.fillRect(0, 0, w, h); c.fillStyle = '#d6d4cc'; c.fillRect(8, 8, w - 16, 6); c.fillRect(8, h - 14, w - 16, 6); c.fillRect(8, 8, 6, h - 16); c.fillRect(w - 14, 8, 6, h - 16); c.fillStyle = '#c9c7bf'; c.fillRect(24, 24, w - 48, h - 48); }) }, { cast: false }), 0.9, H - 0.05, -1.1);
  const fill = new THREE.PointLight(dark ? '#ffe9c8' : '#fff6e6', dark ? 9 : 6, 10, 1.4);
  fill.position.set(0, 2.45, -1.0);
  g.add(fill);
  if (dark || cloudy) {
    const fill2 = new THREE.PointLight('#ffefd6', 4, 8, 1.5);
    fill2.position.set(0, 2.4, 2.2);
    g.add(fill2);
  }

  // ------------------------------------------------------------------ the learner's group of desks
  // learner's desk (head of the group), Ana's desk (left side), Minh's desk (right side)
  const myDesk = schoolDesk(A, deskTop, steel, 0.8, 0.55);
  add(myDesk, 0, 0, -0.45);
  const anaDesk = schoolDesk(A, deskTop, steel, 0.8, 0.55);
  add(anaDesk, -0.275, 0, -1.125, -Math.PI / 2);
  const minhDesk = schoolDesk(A, deskTop, steel, 0.8, 0.55);
  add(minhDesk, 0.275, 0, -1.125, Math.PI / 2);
  // chairs: the learner's is pulled back; Ana and Minh sit, turned a little toward the learner
  add(studentChair(plyMat, steel), 0.12, 0, 0.42, Math.PI + 0.15);
  const anaSlot = { ...K.spot(-0.9, -1.1, 1.15), sit: SEAT_H };
  const minhSlot = { ...K.spot(0.9, -1.1, -1.15), sit: SEAT_H };
  for (const s of [anaSlot, minhSlot]) add(studentChair(plyMat, steel), s.pos.x + Math.sin(s.yaw) * 0.05, 0, s.pos.z + Math.cos(s.yaw) * 0.05, s.yaw);
  // name tents
  add(nameTent(A, 'アナ'), -0.42, DESK_H, -0.86, Math.PI / 2 + 0.6);
  add(nameTent(A, 'ミン'), 0.42, DESK_H, -0.86, -Math.PI / 2 - 0.6);

  // things on the learner's desk (near)
  const Y = DESK_H;
  const book = K.prop('book', textbook(A), { labelJa: 'ほん', labelEn: 'book' });
  add(book, -0.2, Y, -0.5, 0.12);
  const dict = K.prop('dictionary', dictionary(A), { labelJa: 'じしょ', labelEn: 'dictionary' });
  add(dict, 0.24, Y, -0.56, -0.08);
  const note = K.prop('notebook', notebook(A, winter), { labelJa: 'ノート', labelEn: 'notebook' });
  add(note, 0.02, Y, -0.33, -0.05);
  const pen = K.prop('pen', penMesh(A, '#2c4a8a'), { labelJa: 'ペン', labelEn: 'pen' });
  add(pen, 0.07, Y + 0.008, -0.3, 0.5);
  const pencil = K.prop('pencil', pencilMesh(A), { labelJa: 'えんぴつ', labelEn: 'pencil' });
  add(pencil, 0.2, Y, -0.28, -0.35);
  const eraser = K.prop('eraser', eraserMesh(A), { labelJa: 'けしゴム', labelEn: 'eraser' });
  add(eraser, 0.3, Y, -0.36, 0.3);
  const key = K.prop('key', keyMesh(A), { labelJa: 'かぎ', labelEn: 'key' });
  add(key, -0.3, Y, -0.27, 0.6);
  const choco = K.prop('chocolate', chocolate(A), { labelJa: 'チョコレート', labelEn: 'chocolate' });
  add(choco, -0.29, Y, -0.66, -0.2);

  // Ana's desk: camera magazine + camera (npc)
  const mag = K.prop('magazine', magazine(A), { labelJa: 'ざっし', labelEn: 'magazine' });
  add(mag, -0.36, Y, -1.16, Math.PI / 2 - 0.25);
  const cam = K.prop('camera', cameraMesh(A), { labelJa: 'カメラ', labelEn: 'camera' });
  add(cam, -0.14, Y, -1.4, 0.4);
  add(pencilCase(A, '#e88aa0'), -0.18, Y, -0.84, 0.2);
  // Minh's desk: canned coffee, notebook; backpack on the floor (npc)
  const coffee = K.prop('coffee', canCoffee(A), { labelJa: 'コーヒー', labelEn: 'coffee' });
  add(coffee, 0.4, Y, -1.4);
  add(A.box(0.18, 0.012, 0.25, { all: '#d9dfe8', top: A.text([{ t: 'ノート', scale: 0.7 }, { t: 'グエン・ミン', scale: 0.5 }], 0.18, 0.25, { bg: '#7fa6c9', fg: '#ffffff', size: 0.45, radius: 0.02 }) }), 0.2, Y, -1.08, -0.2);
  add(pencilMesh(A), 0.12, Y + 0.012, -1.15, 1.2);
  const bag = K.prop('bag', backpack(A, '#3f6f8f'), { labelJa: 'かばん', labelEn: 'bag' });
  add(bag, 1.28, 0, -1.55, -0.9);

  // ------------------------------------------------------------------ teacher's desk (教卓)
  const tdX = 0.88; const tdZ = -2.45;
  add(teacherDesk(A, deskTop, steel), tdX, 0, tdZ);
  const TY = 0.74;
  const watch = K.prop('watch', watchMesh(A), { labelJa: 'とけい', labelEn: 'watch' });
  add(watch, 0.46, TY, -2.27, 0.4);
  add(A.box(0.12, 0.09, 0.22, { all: '#f2f0ea', top: A.draw(32, 48, (c, w, h) => { c.fillStyle = '#f2f0ea'; c.fillRect(0, 0, w, h); c.fillStyle = '#9fc9e0'; c.fillRect(0, 0, w, 10); c.fillStyle = '#fff'; c.fillRect(8, h / 2 - 4, w - 16, 8); }) }), 0.42, TY, -2.6, 0.2); // tissues
  add(A.box(0.24, 0.03, 0.32, { all: '#f4f1ea', top: A.text(['しゅっせき'], 0.24, 0.32, { bg: '#2f5e8c', fg: '#fff', size: 0.3, radius: 0.02 }) }), 0.72, TY, -2.45, 0.05);
  add(A.cyl(0.04, 0.035, 0.1, '#5b8f7a', {}), 0.95, TY, -2.65); // pen cup
  for (const [i, c] of ['#2c4a8a', '#c0392b', '#222831'].entries()) add(A.cyl(0.007, 0.007, 0.14, c, {}), 0.94 + i * 0.012, TY + 0.02, -2.65 + (i - 1) * 0.008);
  add(paperStack(A, 0.21, 0.297, 0.03, winter), 1.01, TY, -2.4, -0.08);
  add(cdPlayer(A), 1.27, TY, -2.6, -0.3);
  if (rain || season === 'autumn') add(lostAndFound(A), 1.27, TY, -2.3, -0.1);
  // the found umbrella leans against the teacher's desk, right by her (npc)
  const umb = K.prop('umbrella', umbrellaMesh(A, '#2f6a8f', rain), { labelJa: 'かさ', labelEn: 'umbrella' });
  umb.position.set(0.14, 0, -2.2); umb.rotation.set(0.05, 0.3, -0.17);
  g.add(umb);

  // ------------------------------------------------------------------ other desks of the class
  const others = [
    { x: -2.35, z: -1.35, ry: 0 }, { x: -2.35, z: -0.25, ry: 0 }, // window-side pair (facing the board)
    { x: 2.3, z: -1.35, ry: 0 }, { x: 2.3, z: -0.25, ry: 0 },
    { x: -1.5, z: 1.55, ry: 0 }, { x: 1.4, z: 1.55, ry: 0 },
  ];
  const deco = rngLocal(5);
  others.forEach((o, i) => {
    add(schoolDesk(A, deskTop, steel, 0.7, 0.5), o.x, 0, o.z, o.ry);
    const ch = studentChair(plyMat, steel); add(ch, o.x + (deco() - 0.5) * 0.12, 0, o.z + 0.5 + deco() * 0.1, Math.PI + (deco() - 0.5) * 0.4);
    if (i % 2 === 0) add(textbook(A, ['#e8a33c', '#7fb36a', '#d46a6a'][i % 3]), o.x - 0.12, DESK_H, o.z - 0.05, (deco() - 0.5) * 0.6);
    if (i % 3 === 1) add(pencilCase(A, ['#6a8fc9', '#c9a06a', '#8ac98f'][i % 3]), o.x + 0.15, DESK_H, o.z + 0.05, deco());
    if (winter && i < 4) add(scarfOnChair(A, ['#b5523b', '#4f6d8f', '#d9b25b', '#6f8f5a'][i]), ch.position.x, 0, ch.position.z, ch.rotation.y);
  });
  // heater (winter) / small fan (summer) near the window
  if (winter) add(heater(A), xw + 0.45, 0, -1.25, Math.PI / 2);
  // waste bins (分別) by the front door
  add(bins(A), 3.1, 0, -1.75, -Math.PI / 2);

  // ------------------------------------------------------------------ finish
  for (const o of [book, dict, note, pen, pencil, eraser, key, choco, umb, bag, watch, cam, mag, coffee, news, wb, map, clk]) props[o.userData.propId] = o;

  const dynamic = new THREE.Group();
  dynamic.userData.dynamic = true;
  g.add(dynamic);
  let steam = null;
  if (winter) { steam = steamPuffs(); steam.position.set(xw + 0.45, 0.62, -1.4); dynamic.add(steam); }

  A.commit(); B.commit();
  const teacherPos = { x: -0.28, z: -2.22 };
  return K.finalize({
    group: g,
    spawn: K.spot(0, 0, 0),
    slots: {
      teacher: K.spot(teacherPos.x, teacherPos.z, K.faceYaw(teacherPos, { x: 0, z: 0 })),
      npc1: anaSlot,
      npc2: minhSlot,
      phone: null,
    },
    props,
    center: new THREE.Vector3(0, 0, -0.3),
    radius: 4.8,
    update(dt, t) {
      if (steam) steam.children.forEach((s, i) => {
        const k = (t * 0.25 + i / steam.children.length) % 1;
        s.position.y = k * 0.5; s.scale.setScalar(0.6 + k * 1.4); s.material.opacity = 0.18 * Math.sin(k * Math.PI);
      });
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
function rngLocal(seed) { return K.rng(seed); }

// =============================================================== textures
function ceilingTex() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f7f5ef'; g.fillRect(0, 0, 256, 256);
  const r = K.rng(4);
  for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(120,115,100,${0.12 + r() * 0.15})`; g.fillRect(r() * 256, r() * 256, 1.5, 1.5); }
  g.strokeStyle = '#d9d5ca'; g.lineWidth = 3; g.strokeRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(7 / 0.6, 7 / 0.6); t.anisotropy = 4;
  return t;
}

/** Outside the windows (rows ~170–370 are what the windows show): sky, town across the street,
 *  a tree crown or two by the school (season), utility pole + wires, rain streaks. */
function outsideTex(time, season, weather) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const g = c.getContext('2d'); const w = 1024; const h = 512;
  const rain = weather === 'rain'; const cloudy = weather === 'cloudy' || rain;
  let sky = { morning: ['#9fd0f2', '#f4ead8'], noon: ['#7fbde9', '#dceffa'], evening: ['#e99a62', '#fbd9ae'], night: ['#0e1a33', '#283a5c'] }[time] || ['#a9d4f2', '#f6ead6'];
  if (cloudy) sky = time === 'evening' ? ['#2f3a4c', '#5d6573'] : time === 'night' ? ['#0c1424', '#1c2638'] : ['#b3bcc6', '#e2e5e8'];
  const gr = g.createLinearGradient(0, 120, 0, 380); gr.addColorStop(0, sky[0]); gr.addColorStop(1, sky[1]);
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const r = K.rng(21);
  const dark = time === 'night' || (time === 'evening' && cloudy);
  const dusk = time === 'evening' || time === 'night';
  for (let i = 0; i < (cloudy ? 22 : 6); i++) {
    g.fillStyle = cloudy ? (dark ? 'rgba(70,78,92,0.45)' : 'rgba(245,247,250,0.5)') : 'rgba(255,255,255,0.7)';
    const x = r() * w; const y = 150 + r() * 90;
    for (let k = 0; k < 4; k++) { g.beginPath(); g.ellipse(x + k * 22, y + (k % 2) * 6, 34 + r() * 20, 10 + r() * 6, 0, 0, 7); g.fill(); }
  }
  // far skyline
  let x = -10;
  while (x < w) {
    const bw = 40 + r() * 70; const bh = 40 + r() * 90; const y = 330 - bh;
    const base = dark ? 52 : dusk ? 150 : 190 + r() * 20;
    g.fillStyle = `rgb(${base},${base + 6},${base + 14})`; g.fillRect(x, y, bw, h);
    for (let wy = y + 8; wy < 330; wy += 11) for (let wx = x + 5; wx < x + bw - 6; wx += 9) {
      g.fillStyle = dark ? (r() > 0.55 ? 'rgba(255,214,140,0.85)' : 'rgba(25,32,48,0.5)') : 'rgba(160,185,205,0.45)';
      g.fillRect(wx, wy, 5, 6);
    }
    x += bw + 3;
  }
  // across the street: a mid-rise block (right) and low houses with roofs (left)
  const bcol = dark ? '#5a5650' : '#e8dfcf';
  g.fillStyle = bcol; g.fillRect(560, 230, 330, 200);
  for (let fy = 0; fy < 5; fy++) for (let fx = 0; fx < 8; fx++) {
    const wx = 575 + fx * 39; const wy = 245 + fy * 34;
    g.fillStyle = dark ? (r() > 0.4 ? '#ffd58a' : '#2c3442') : '#9fb6c8'; g.fillRect(wx, wy, 26, 18);
    g.fillStyle = dark ? '#3c3a36' : '#c9c0b0'; g.fillRect(wx - 3, wy + 20, 32, 5); // balcony rails
  }
  for (let i = 0; i < 4; i++) {
    const hx = 40 + i * 120; const hy = 300 + (i % 2) * 10;
    g.fillStyle = dark ? '#4c4842' : ['#efe6d6', '#e3d3bd', '#f2ece2', '#d9cdb8'][i]; g.fillRect(hx, hy, 100, 120);
    g.fillStyle = dark ? '#2e3640' : ['#5d6f86', '#8a4f3c', '#4f5f50', '#6b5a48'][i];
    g.beginPath(); g.moveTo(hx - 8, hy + 2); g.lineTo(hx + 50, hy - 34); g.lineTo(hx + 108, hy + 2); g.fill();
    g.fillStyle = dark ? '#ffd58a' : '#a9bfd0'; g.fillRect(hx + 14, hy + 22, 22, 18); g.fillRect(hx + 62, hy + 22, 22, 18);
  }
  // street
  g.fillStyle = dark ? '#3a3a3c' : '#9a9a98'; g.fillRect(0, 395, w, h);
  g.fillStyle = dark ? '#77756f' : '#eeeeea'; for (let k = 0; k < w; k += 70) g.fillRect(k, 440, 38, 4);
  if (rain) { g.fillStyle = 'rgba(200,210,220,0.25)'; g.fillRect(0, 395, w, h); }
  // utility poles + wires
  for (const px of [470, 980]) { g.fillStyle = dark ? '#2a2e36' : '#8f8d88'; g.fillRect(px, 150, 8, 260); g.fillRect(px - 22, 175, 52, 5); }
  g.strokeStyle = dark ? 'rgba(15,15,20,0.85)' : 'rgba(60,60,60,0.55)'; g.lineWidth = 1.3;
  for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(0, 190 + k * 7); g.quadraticCurveTo(240, 225 + k * 8, 474, 177 + k * 3); g.quadraticCurveTo(730, 215 + k * 8, 984, 177 + k * 3); g.lineTo(1024, 185 + k * 6); g.stroke(); }
  // tree crowns by the school building
  const leaf = { spring: ['#f7c9d6', '#f1b2c5', '#fbe0e8', '#e7a0b6', '#fff0f3'], summer: ['#4f8a45', '#5f9a50', '#3f7a3a', '#6aa85a'], autumn: ['#d9772f', '#e8a23a', '#c4452f', '#e3c04a'], winter: [] }[season] || ['#4f8a45'];
  const trunk = dark ? '#2b2420' : '#5a4636';
  for (const [tx, ty, rad] of [[250, 345, 105], [800, 360, 80]]) {
    g.strokeStyle = trunk; g.lineCap = 'round';
    const branch = (bx, by, a, len, wd, d) => {
      const x2 = bx + Math.cos(a) * len; const y2 = by - Math.sin(a) * len;
      g.lineWidth = wd; g.beginPath(); g.moveTo(bx, by); g.lineTo(x2, y2); g.stroke();
      if (d > 0) { branch(x2, y2, a + 0.4 + r() * 0.3, len * 0.7, wd * 0.62, d - 1); branch(x2, y2, a - 0.4 - r() * 0.3, len * 0.7, wd * 0.62, d - 1); }
    };
    branch(tx, h, Math.PI / 2, (h - ty) * 0.75, 20, season === 'winter' ? 6 : 4);
    if (leaf.length) for (let i = 0; i < 420; i++) {
      const a = r() * Math.PI * 2; const rr = Math.sqrt(r()) * rad;
      const col = leaf[Math.floor(r() * leaf.length)];
      g.fillStyle = dark ? shadeHex(col, 0.4) : dusk ? shadeHex(col, 0.8) : col;
      g.globalAlpha = 0.9;
      g.beginPath(); g.arc(tx + Math.cos(a) * rr * 1.25, ty + Math.sin(a) * rr * 0.62, 5 + r() * 9, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
  }
  if (rain) {
    g.strokeStyle = 'rgba(225,232,240,0.32)'; g.lineWidth = 1.1;
    for (let i = 0; i < 800; i++) { const rx = r() * w; const ry = r() * h; g.beginPath(); g.moveTo(rx, ry); g.lineTo(rx - 3, ry + 18); g.stroke(); }
    g.fillStyle = 'rgba(210,222,235,0.3)';
    for (let i = 0; i < 220; i++) { g.beginPath(); g.arc(r() * w, 140 + r() * 260, 1.5 + r() * 2.5, 0, 7); g.fill(); }
  }
  if (cloudy && !dark) { g.fillStyle = 'rgba(205,210,216,0.15)'; g.fillRect(0, 0, w, h); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function shadeHex(hex, k) { const c = new THREE.Color(hex); c.multiplyScalar(k); return `#${c.getHexString()}`; }

// =============================================================== furniture & props
function curtain(m, w, h) {
  const gr = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const c = K.mesh(new THREE.CylinderGeometry(0.06, 0.07, h, 8, 1, true), m, { x: (i - 1.5) * w / 4.2, y: h / 2, cast: false });
    c.scale.z = 0.55; gr.add(c);
  }
  return gr;
}

function schoolDesk(A, top, steel, w, d) {
  const gr = new THREE.Group();
  gr.add(K.box(w, 0.025, d, top, { y: DESK_H - 0.025 }));
  gr.add(K.box(w + 0.006, 0.03, d + 0.006, steel, { y: DESK_H - 0.055, cast: false }));
  const lx = w / 2 - 0.03; const lz = d / 2 - 0.03;
  for (const [x, z] of [[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]]) gr.add(K.box(0.025, DESK_H - 0.05, 0.025, steel, { x, z }));
  // book box under the top (open toward the student, +z)
  gr.add(A.box(w - 0.08, 0.012, d - 0.12, '#9aa1a8', { y: DESK_H - 0.17, z: -0.03 }));
  gr.add(A.box(w - 0.08, 0.11, 0.012, '#9aa1a8', { y: DESK_H - 0.17, z: -d / 2 + 0.04 }));
  gr.add(K.box(w - 0.06, 0.02, 0.02, steel, { y: 0.12, z: -lz, cast: false }));
  // rubber feet
  for (const [x, z] of [[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]]) gr.add(A.cyl(0.018, 0.018, 0.02, '#3a3a3a', { x, z, cast: false }, 8));
  return gr;
}

function studentChair(ply, steel) {
  const gr = new THREE.Group();
  gr.add(K.rbox(0.4, 0.025, 0.38, 0.01, ply, { y: SEAT_H - 0.025 }));
  gr.add(K.rbox(0.38, 0.17, 0.022, 0.01, ply, { y: 0.62, z: -0.2, rx: 0.08 }));
  for (const [x, z] of [[-0.17, -0.16], [0.17, -0.16], [-0.17, 0.16], [0.17, 0.16]]) gr.add(K.box(0.02, SEAT_H - 0.03, 0.02, steel, { x, z }));
  for (const x of [-0.17, 0.17]) gr.add(K.box(0.02, 0.42, 0.02, steel, { x, y: SEAT_H - 0.03, z: -0.19 }));
  gr.add(K.box(0.36, 0.02, 0.02, steel, { y: 0.15, z: -0.16, cast: false }));
  return gr;
}

function teacherDesk(A, top, steel) {
  const gr = new THREE.Group();
  gr.add(K.box(1.15, 0.03, 0.6, top, { y: 0.71 }));
  // modesty panel + drawers block, facing the class (+z)
  gr.add(A.box(1.12, 0.55, 0.02, '#c6b59a', { y: 0.16, z: 0.27 }));
  gr.add(A.box(0.38, 0.55, 0.55, { all: '#d8d3c8', front: A.draw(48, 64, (c, w, h) => { c.fillStyle = '#d8d3c8'; c.fillRect(0, 0, w, h); c.fillStyle = '#b9b3a5'; for (let i = 1; i < 3; i++) c.fillRect(0, i * h / 3 - 1, w, 2); c.fillStyle = '#7d7a73'; for (let i = 0; i < 3; i++) c.fillRect(w / 2 - 8, i * h / 3 + 8, 16, 3); }) }, { x: 0.36, y: 0.16 }));
  for (const [x, z] of [[-0.53, -0.26], [-0.53, 0.26], [0.53, -0.26], [0.53, 0.26]]) gr.add(K.box(0.03, 0.71, 0.03, steel, { x, z }));
  return gr;
}

function whiteboard(A, B, alu, season, time) {
  const gr = new THREE.Group();
  const w = 3.4; const h = 1.15;
  const board = {
    spring: { date: '4月12日（金）', title: 'かいわの れんしゅう', lines: [['はじめまして。〜です。', '#2b4f8c'], ['〜から きました。', '#2b4f8c'], ['どうして 日本語を 勉強しますか。', '#333'], ['→ 〜から。', '#c0392b']], side: ['漢字', '日本語 学生', '先生 漢字'], note: '金よう日 クラスで カラオケ！' },
    summer: { date: '7月8日（月）', title: 'かいわの れんしゅう', lines: [['なつやすみに なにを しますか。', '#2b4f8c'], ['〜たいです。', '#c0392b']], side: ['漢字', '山 川 海'], note: 'しゅくだい p.48' },
    autumn: { date: '10月16日（水）', title: 'これ・それ・あれ', lines: [['これは だれの かさですか。', '#2b4f8c'], ['── わたしのです。', '#333'], ['── わたしのじゃ ありません。', '#333'], ['なんの ざっしですか。', '#c0392b']], side: ['ことば', 'かさ かぎ', 'ほん じしょ'], note: 'わすれものに ちゅうい！' },
    winter: { date: '1月20日（月）', title: '漢字テスト 9:10〜9:40', lines: [['えんぴつで 書いて ください。', '#2b4f8c'], ['レポート：あしたまで', '#c0392b'], ['〜に かりました ／ かしました', '#333']], side: ['漢字', '書 読', '話 聞'], note: 'がんばりましょう！' },
  }[season] || null;
  const b = board || { date: '', title: 'かいわの れんしゅう', lines: [], side: [], note: '' };
  const region = B.draw(w * 220, h * 220, (c, cw, ch) => {
    c.fillStyle = '#fbfbf8'; c.fillRect(0, 0, cw, ch);
    const grad = c.createLinearGradient(0, 0, cw, ch); grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(0.5, 'rgba(255,255,255,0.0)'); grad.addColorStop(0.62, 'rgba(210,220,230,0.18)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = grad; c.fillRect(0, 0, cw, ch);
    // ghost of erased writing
    c.fillStyle = 'rgba(120,130,150,0.06)'; for (let i = 0; i < 6; i++) c.fillRect(cw * (0.3 + i * 0.07), ch * 0.7, cw * 0.05, ch * 0.05);
    const f = (wt, px) => `${wt} ${px}px ${K.JP_FONT}`;
    c.textBaseline = 'top'; c.textAlign = 'left';
    c.fillStyle = '#333'; c.font = f(500, ch * 0.07); c.fillText(b.date, cw * 0.025, ch * 0.05);
    c.fillStyle = '#2b4f8c'; c.font = f(700, ch * 0.12); c.fillText(b.title, cw * 0.2, ch * 0.08);
    c.strokeStyle = '#2b4f8c'; c.lineWidth = 3; c.beginPath(); c.moveTo(cw * 0.2, ch * 0.23); c.lineTo(cw * 0.2 + c.measureText(b.title).width, ch * 0.23); c.stroke();
    b.lines.forEach(([t, col], i) => { c.fillStyle = col; c.font = f(500, ch * 0.085); c.fillText(t, cw * 0.22, ch * (0.32 + i * 0.13)); });
    // right column: kanji box
    c.strokeStyle = '#c0392b'; c.lineWidth = 3; K.roundRect(c, cw * 0.73, ch * 0.08, cw * 0.24, ch * 0.5, 12); c.stroke();
    b.side.forEach((t, i) => { c.fillStyle = i ? '#222' : '#c0392b'; c.font = f(i ? 700 : 500, ch * (i ? 0.11 : 0.07)); c.fillText(t, cw * 0.75, ch * (0.11 + i * 0.14)); });
    c.fillStyle = '#c0392b'; c.font = f(700, ch * 0.075); c.fillText(b.note, cw * 0.62, ch * 0.78);
    // little doodle: umbrella in autumn, sakura in spring, snowman in winter
    c.lineWidth = 3; c.strokeStyle = '#2b4f8c';
    if (season === 'autumn') { c.beginPath(); c.arc(cw * 0.1, ch * 0.62, 40, Math.PI, 0); c.stroke(); c.beginPath(); c.moveTo(cw * 0.1, ch * 0.62); c.lineTo(cw * 0.1, ch * 0.8); c.arc(cw * 0.1 - 9, ch * 0.8, 9, 0, Math.PI); c.stroke(); }
    if (season === 'spring') { c.fillStyle = '#e88aa8'; for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; c.beginPath(); c.arc(cw * 0.1 + Math.cos(a) * 16, ch * 0.66 + Math.sin(a) * 16, 13, 0, 7); c.fill(); } }
    if (season === 'winter') { c.beginPath(); c.arc(cw * 0.1, ch * 0.74, 26, 0, 7); c.stroke(); c.beginPath(); c.arc(cw * 0.1, ch * 0.6, 18, 0, 7); c.stroke(); }
    if (time === 'evening' && season !== 'autumn') { c.fillStyle = '#555'; c.font = f(500, ch * 0.06); c.fillText('おつかれさまでした', cw * 0.03, ch * 0.88); }
  });
  gr.add(B.plane(w, h, region, { y: h / 2 }));
  gr.add(K.box(w + 0.08, 0.04, 0.05, alu, { y: -0.04, z: 0.01, cast: false }));
  gr.add(K.box(w + 0.08, 0.04, 0.05, alu, { y: h, z: 0.0, cast: false }));
  gr.add(K.box(0.04, h + 0.08, 0.05, alu, { x: -w / 2 - 0.02, y: -0.04, cast: false }));
  gr.add(K.box(0.04, h + 0.08, 0.05, alu, { x: w / 2 + 0.02, y: -0.04, cast: false }));
  // tray: markers + eraser + magnets
  gr.add(K.box(w * 0.8, 0.02, 0.09, alu, { y: -0.06, z: 0.05, cast: false }));
  for (const [i, col] of ['#222831', '#c0392b', '#2b4f8c'].entries()) gr.add(K.mesh(A.paint(new THREE.CylinderGeometry(0.01, 0.01, 0.13, 8), col), A.matte, { x: -0.9 + i * 0.06, y: -0.03, z: 0.06, rz: Math.PI / 2, cast: false }));
  gr.add(A.box(0.13, 0.04, 0.05, { all: '#2f3b4a', top: '#f0d36a' }, { x: 0.8, y: -0.045, z: 0.06, cast: false }));
  for (const [x, y, col] of [[-1.55, 1.0, '#e74c3c'], [1.4, 1.05, '#3a7bd5'], [1.5, 1.05, '#f1c40f']]) gr.add(K.mesh(A.paint(new THREE.CylinderGeometry(0.018, 0.018, 0.012, 12), col), A.matte, { x, y, z: 0.01, rx: Math.PI / 2, cast: false }));
  // a printed sheet held by magnets
  gr.add(B.plane(0.21, 0.297, B.text([{ t: 'しゅくだい', scale: 0.8, color: '#c0392b' }, { t: '1. ことば', scale: 0.5, weight: 500 }, { t: '2. ぶんけい', scale: 0.5, weight: 500 }, { t: '3. かいわ', scale: 0.5, weight: 500 }], 0.21, 0.297, { bg: '#fffdf6', radius: 0.01, size: 0.6 }), { x: 1.45, y: 0.85, z: 0.006 }));
  return gr;
}

function atlasClock(A, R, hh, mm) {
  const gr = new THREE.Group();
  gr.add(K.mesh(A.paint(new THREE.CylinderGeometry(R + 0.015, R + 0.015, 0.05, 28), '#6b5a48'), A.matte, { rx: Math.PI / 2, cast: false }));
  const face = A.draw(128, 128, (c, w, h) => {
    c.fillStyle = '#fbf8f0'; c.beginPath(); c.arc(w / 2, h / 2, w / 2, 0, 7); c.fill();
    c.fillStyle = '#333'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `700 ${w * 0.12}px ${K.JP_FONT}`;
    for (let i = 1; i <= 12; i++) { const a = i / 12 * Math.PI * 2; c.fillText(String(i), w / 2 + Math.sin(a) * w * 0.37, h / 2 - Math.cos(a) * h * 0.37); }
    for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2; const r0 = i % 5 ? 0.46 : 0.44; c.fillRect(w / 2 + Math.sin(a) * w * r0 - 1, h / 2 - Math.cos(a) * h * r0 - 1, 2, 2); }
  });
  gr.add(A.plane(R * 2, R * 2, face, { z: 0.026 }));
  const hand = (len, wd, ang, z) => {
    const m = K.mesh(A.paint(new THREE.BoxGeometry(wd, len, 0.004), '#222'), A.matte, { z, cast: false });
    m.geometry.translate(0, len / 2 - 0.015, 0); m.rotation.z = -ang; gr.add(m);
  };
  hand(R * 0.55, 0.014, ((hh % 12) + mm / 60) / 12 * Math.PI * 2, 0.03);
  hand(R * 0.8, 0.009, mm / 60 * Math.PI * 2, 0.034);
  return gr;
}

function kanaChart(A) {
  const rows = ['あいうえお', 'かきくけこ', 'さしすせそ', 'たちつてと', 'なにぬねの', 'はひふへほ', 'まみむめも', 'や ゆ よ', 'らりるれろ', 'わ を ん'];
  return A.draw(220, 280, (c, w, h) => {
    c.fillStyle = '#fffaf0'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#c0392b'; c.font = `800 22px ${K.JP_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('ひらがな', w / 2, 18);
    c.font = `700 19px ${K.JP_FONT}`;
    const cols = 10; const cwid = (w - 16) / cols;
    rows.forEach((row, ci) => {
      [...row].forEach((ch, ri) => {
        const x = w - 8 - cwid * (ci + 0.5); const y = 46 + ri * 46;
        c.fillStyle = ri === 0 ? '#2b4f8c' : '#333'; c.fillText(ch, x, y);
      });
    });
    c.strokeStyle = '#e0c9a6'; c.lineWidth = 2; c.strokeRect(2, 2, w - 4, h - 4);
  });
}

function japanMap(A) {
  const isl = [
    [[130.9, 34.4], [132.0, 35.4], [133.5, 35.6], [135.2, 35.7], [136.0, 36.3], [136.7, 37.2], [137.3, 36.8], [138.5, 37.8], [139.5, 38.5], [139.9, 40.0], [140.0, 40.7], [140.9, 41.4], [141.5, 40.6], [141.9, 39.5], [141.0, 38.3], [140.9, 37.0], [140.6, 36.2], [140.9, 35.7], [139.8, 35.0], [139.6, 35.3], [138.9, 34.6], [138.2, 34.6], [137.0, 34.6], [136.9, 34.3], [136.8, 33.6], [135.8, 33.4], [135.1, 34.2], [135.4, 34.7], [134.5, 34.7], [133.5, 34.4], [132.3, 34.2], [131.3, 34.0]],
    [[140.0, 41.5], [140.1, 42.3], [139.8, 42.6], [140.4, 43.3], [141.4, 43.3], [141.6, 44.4], [141.9, 45.5], [142.9, 44.6], [144.3, 44.0], [145.3, 44.3], [145.6, 43.3], [144.3, 42.9], [143.3, 42.0], [141.7, 42.6], [141.0, 41.8]],
    [[132.4, 33.4], [132.9, 34.0], [134.0, 34.4], [134.6, 34.2], [134.7, 33.8], [134.2, 33.3], [133.6, 33.5], [133.0, 32.8], [132.5, 32.9]],
    [[129.8, 33.3], [130.4, 33.9], [131.0, 33.9], [131.7, 33.6], [131.9, 32.9], [131.4, 31.4], [130.7, 31.0], [130.2, 31.3], [130.2, 32.1], [129.6, 32.6]],
  ];
  const colors = ['#9fcf7a', '#c9df8a', '#f0c27a', '#f2a07a'];
  return A.draw(300, 228, (c, w, h) => {
    c.fillStyle = '#cfe8f3'; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 1;
    for (let x = 0; x < w; x += 25) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    for (let y = 0; y < h; y += 25) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    const k = 15.5; const P = ([lo, la]) => [(lo - 128.6) * k + 8, (45.8 - la) * k + 8];
    isl.forEach((pts, i) => {
      c.beginPath(); pts.forEach((p, j) => { const [x, y] = P(p); if (j) c.lineTo(x, y); else c.moveTo(x, y); }); c.closePath();
      c.fillStyle = colors[i]; c.fill(); c.strokeStyle = '#6b8a5a'; c.lineWidth = 1.5; c.stroke();
    });
    // Okinawa inset
    c.strokeStyle = '#7a8a9a'; c.strokeRect(8, h - 52, 60, 44);
    c.fillStyle = '#f2a07a'; c.beginPath(); c.ellipse(36, h - 30, 9, 4, -0.7, 0, 7); c.fill();
    // Tokyo / Osaka dots
    c.fillStyle = '#c0392b';
    const [tx, ty] = P([139.7, 35.7]); c.beginPath(); c.arc(tx, ty, 4, 0, 7); c.fill();
    const [ox, oy] = P([135.5, 34.7]); c.beginPath(); c.arc(ox, oy, 3, 0, 7); c.fill();
    c.font = `700 13px ${K.JP_FONT}`; c.fillStyle = '#333'; c.textBaseline = 'middle';
    c.fillText('東京', tx + 6, ty + 8); c.fillText('大阪', ox - 30, oy + 10);
    c.font = `800 22px ${K.JP_FONT}`; c.fillStyle = '#2b4f8c'; c.fillText('日本', 18, 24);
  });
}

function bookshelf(A, ply, w, h, d, rows) {
  const gr = new THREE.Group();
  gr.add(K.box(w, 0.02, d, ply, { y: h - 0.02 }));
  gr.add(K.box(0.02, h, d, ply, { x: -w / 2 + 0.01 }));
  gr.add(K.box(0.02, h, d, ply, { x: w / 2 - 0.01 }));
  gr.add(A.box(w, h, 0.01, '#b48a62', { z: -d / 2 + 0.005, cast: false }));
  const r = K.rng(9);
  for (let i = 0; i < rows; i++) {
    const y = 0.03 + i * (h - 0.05) / rows;
    gr.add(K.box(w - 0.02, 0.02, d, ply, { y, cast: false }));
    const spines = A.draw(256, 64, (c, cw, ch) => {
      let x = 0;
      while (x < cw) {
        const bw = 8 + r() * 14; const bh = ch * (0.7 + r() * 0.3);
        c.fillStyle = ['#c0533a', '#3c6e9e', '#e2b34a', '#5b8f5b', '#efe6d4', '#7a4f8a', '#2f4f6f'][Math.floor(r() * 7)];
        c.fillRect(x, ch - bh, bw - 1, bh);
        c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(x + 2, ch - bh + 6, bw - 5, 2);
        x += bw;
      }
    });
    gr.add(A.box(w - 0.06, (h - 0.05) / rows - 0.04, d - 0.06, { all: '#5d4a3a', front: spines }, { y: y + 0.02, z: 0.01, cast: false }));
  }
  return gr;
}

function newspaper(A, season) {
  const gr = new THREE.Group();
  const front = A.draw(160, 220, (c, w, h) => {
    c.fillStyle = '#efeadf'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#222'; c.font = `800 26px ${K.JP_FONT}`; c.textBaseline = 'top'; c.fillText('にほんご新聞', 8, 6);
    c.fillStyle = '#c0392b'; c.fillRect(8, 38, w - 16, 3);
    c.fillStyle = '#333'; c.font = `700 16px ${K.JP_FONT}`;
    c.fillText({ spring: 'さくら まんかい', summer: 'なつまつり', autumn: 'たいふう 10ごう', winter: 'ゆき 10センチ' }[season] || 'ニュース', 8, 48);
    c.fillStyle = '#8a8a8a'; c.fillRect(8, 72, 70, 50);
    c.fillStyle = 'rgba(40,40,40,0.55)';
    for (let y = 72; y < h - 8; y += 7) c.fillRect(86, y, w - 94, 3);
    for (let y = 130; y < h - 8; y += 7) c.fillRect(8, y, 70, 3);
  });
  gr.add(A.box(0.27, 0.012, 0.36, { all: '#e6e0d4', top: front }));
  return gr;
}

function slidingDoor(A, doorMat, alu) {
  const gr = new THREE.Group();
  gr.add(K.box(1.1, 2.1, 0.05, K.mat('#9c7a58', { rough: 0.6 }), { z: -0.03, cast: false })); // frame
  gr.add(K.box(0.92, 1.98, 0.035, doorMat, { x: 0.02, z: 0.01, cast: false }));
  // small window in the door showing the (lit) corridor
  gr.add(A.plane(0.32, 0.55, A.draw(32, 48, (c, w, h) => { const gg = c.createLinearGradient(0, 0, 0, h); gg.addColorStop(0, '#e7e3d8'); gg.addColorStop(1, '#c7c1b3'); c.fillStyle = gg; c.fillRect(0, 0, w, h); }), { x: 0.22, y: 1.35, z: 0.03 }));
  gr.add(K.box(0.36, 0.03, 0.04, alu, { x: 0.22, y: 1.06, z: 0.03, cast: false }));
  gr.add(K.box(0.36, 0.03, 0.04, alu, { x: 0.22, y: 1.62, z: 0.03, cast: false }));
  gr.add(A.box(0.03, 0.14, 0.015, '#6d6a64', { x: -0.36, y: 0.95, z: 0.03, cast: false })); // recessed pull
  return gr;
}

function bulletin(A, B, trim, season) {
  const gr = new THREE.Group();
  const w = 2.6; const h = 1.05;
  const cork = B.draw(256, 104, (c, cw, ch) => {
    c.fillStyle = '#c9a77a'; c.fillRect(0, 0, cw, ch);
    const r = K.rng(31); for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(${r() > 0.5 ? '90,60,30' : '240,220,190'},0.25)`; c.fillRect(r() * cw, r() * ch, 1.5, 1.5); }
  });
  gr.add(B.plane(w, h, cork, { y: h / 2, z: 0.012 }));
  gr.add(K.box(w + 0.06, 0.04, 0.03, trim, { y: -0.02, cast: false }));
  gr.add(K.box(w + 0.06, 0.04, 0.03, trim, { y: h - 0.02, cast: false }));
  gr.add(K.box(0.03, h, 0.03, trim, { x: -w / 2 - 0.02, cast: false }));
  gr.add(K.box(0.03, h, 0.03, trim, { x: w / 2 + 0.02, cast: false }));
  const ev = { spring: ['おはなみ', '4月6日（土）', '#f6c6d3', '#a8435f'], summer: ['なつまつり', '7月27日（土）', '#bfe3f2', '#2b5f8c'], autumn: ['ハロウィン パーティー', '10月31日（木）', '#f3b26b', '#5a3a1a'], winter: ['もちつき', '1月25日（土）', '#f4efe2', '#a8432f'] }[season] || ['クラス パーティー', '', '#f4efe2', '#333'];
  const posters = [
    { x: -1.0, y: 0.55, w: 0.42, h: 0.58, lines: [{ t: '日本語能力試験', scale: 0.75 }, { t: 'JLPT', scale: 1.3, color: '#c0392b' }, { t: 'N5・N4', scale: 0.9 }, { t: '12月1日（日）', scale: 0.6, weight: 500 }], bg: '#fffaf0', fg: '#2b4f8c' },
    { x: -0.45, y: 0.6, w: 0.5, h: 0.4, lines: [{ t: ev[0], scale: 0.9 }, { t: ev[1], scale: 0.6 }, { t: 'みんなで いきましょう！', scale: 0.5, weight: 500 }], bg: ev[2], fg: ev[3] },
    { x: 0.15, y: 0.52, w: 0.42, h: 0.58, lines: [{ t: 'ごみの わけかた', scale: 0.7 }, { t: 'もえる ごみ', scale: 0.55, color: '#c0392b' }, { t: 'もえない ごみ', scale: 0.55, color: '#2b4f8c' }, { t: 'ペットボトル', scale: 0.55, color: '#2f7a5b' }], bg: '#ffffff', fg: '#333' },
    { x: 0.72, y: 0.62, w: 0.46, h: 0.34, lines: [{ t: 'スピーチ大会', scale: 0.9 }, { t: 'さんかしゃ ぼしゅう', scale: 0.55 }], bg: '#e8f2e0', fg: '#2f6a3a' },
    { x: 0.72, y: 0.25, w: 0.46, h: 0.3, lines: [{ t: 'としょしつ', scale: 0.8 }, { t: '9:00〜18:00', scale: 0.6 }], bg: '#fff6d8', fg: '#7a5a1a' },
    { x: -0.42, y: 0.22, w: 0.44, h: 0.28, lines: [{ t: 'こんげつの もくひょう', scale: 0.55 }, { t: 'まいにち 漢字 5つ！', scale: 0.7, color: '#c0392b' }], bg: '#ffffff', fg: '#333' },
  ];
  for (const p of posters) {
    gr.add(B.sign(p.lines, p.w, p.h, { bg: p.bg, fg: p.fg, radius: 0.03, size: 0.55 }, { x: p.x, y: p.y, z: 0.018 }));
    gr.add(K.mesh(A.paint(new THREE.CylinderGeometry(0.01, 0.01, 0.01, 8), '#d9443a'), A.matte, { x: p.x, y: p.y + p.h / 2 - 0.03, z: 0.026, rx: Math.PI / 2, cast: false }));
  }
  // class photo
  const photo = B.draw(96, 64, (c, w, h) => {
    const gg = c.createLinearGradient(0, 0, 0, h); gg.addColorStop(0, '#9cc9e8'); gg.addColorStop(1, '#d7e9c5'); c.fillStyle = gg; c.fillRect(0, 0, w, h);
    const r = K.rng(77);
    for (let i = 0; i < 9; i++) { const x = 10 + i * 9.5; const y = 30 + (i % 2) * 8; c.fillStyle = ['#f0c94b', '#3f7fbf', '#e9b9a4', '#5b7f6a', '#c94b4b'][i % 5]; c.fillRect(x - 4, y + 6, 9, 24); c.fillStyle = ['#f3d2b8', '#d9a985', '#c08a63'][Math.floor(r() * 3)]; c.beginPath(); c.arc(x, y + 2, 4, 0, 7); c.fill(); }
    c.strokeStyle = '#fff'; c.lineWidth = 4; c.strokeRect(0, 0, w, h);
  });
  gr.add(B.plane(0.3, 0.2, photo, { x: -1.08, y: 0.13, z: 0.018 }));
  return gr;
}

function cubbies(A, ply, season) {
  const gr = new THREE.Group();
  const w = 3.0; const h = 1.0; const d = 0.4; const cols = 8; const rows = 2;
  gr.add(K.box(w, 0.025, d, ply, { y: h - 0.025 }));
  gr.add(A.box(w, h, 0.015, '#9c7a58', { z: -d / 2 + 0.008, cast: false }));
  for (let i = 0; i <= cols; i++) gr.add(K.box(0.02, h, d, ply, { x: -w / 2 + i * w / cols, cast: false }));
  for (let j = 0; j < rows; j++) gr.add(K.box(w, 0.02, d, ply, { y: j * h / rows, cast: false }));
  const r = K.rng(17);
  const bagCols = ['#3f6f8f', '#c9584b', '#5b7f5a', '#e3b04a', '#6d5a7a', '#2f3b4a', '#d98aa0'];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    if (r() < 0.45) continue;
    const x = -w / 2 + (i + 0.5) * w / cols; const y = j * h / rows + 0.02;
    gr.add(A.rbox(0.26, 0.2 + r() * 0.14, 0.24, 0.05, bagCols[Math.floor(r() * bagCols.length)], { x, y, z: 0.02, rx: -0.12 }));
  }
  // name labels
  const labels = A.draw(512, 16, (c, cw, ch) => { c.fillStyle = '#9c7a58'; c.fillRect(0, 0, cw, ch); for (let i = 0; i < cols; i++) { c.fillStyle = '#fbf6ea'; c.fillRect(i * cw / cols + 10, 2, cw / cols - 20, ch - 4); } });
  gr.add(A.box(w, 0.04, 0.012, { all: '#9c7a58', front: labels }, { y: h - 0.06, z: d / 2, cast: false }));
  // top: a box of hand-outs, a globe-ish plant
  gr.add(A.box(0.36, 0.14, 0.26, { all: '#d8b98a', top: A.text(['プリント'], 0.36, 0.26, { bg: '#e8d2a8', fg: '#7a5a3a', size: 0.35 }) }, { x: 0.9, y: h }));
  const p = K.plant(0.5, 3); p.position.set(-1.2, h, 0); gr.add(p);
  return gr;
}

function coat(A, color) {
  const gr = new THREE.Group();
  gr.add(A.cyl(0.006, 0.006, 0.08, '#8a8a8a', { rx: Math.PI / 2, y: -0.01, cast: false }, 6));
  const body = K.mesh(A.paint(new THREE.CylinderGeometry(0.12, 0.22, 0.85, 10, 1), color), A.matte, { y: -0.48, z: 0.08 });
  body.scale.z = 0.45; gr.add(body);
  gr.add(K.mesh(A.paint(new THREE.SphereGeometry(0.09, 10, 6), shadeHex(color, 0.85)), A.matte, { y: -0.08, z: 0.08, cast: false }));
  return gr;
}

function timetable(A) {
  return A.draw(210, 150, (c, w, h) => {
    c.fillStyle = '#fffdf6'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#2b4f8c'; c.font = `800 18px ${K.JP_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('じかんわり', w / 2, 14);
    const days = ['', 'げつ', 'か', 'すい', 'もく', 'きん']; const cw = w / 6; const rh = (h - 30) / 4;
    c.strokeStyle = '#9fb4cc'; c.lineWidth = 1;
    c.font = `700 11px ${K.JP_FONT}`;
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
      c.strokeRect(i * cw + 1, 28 + j * rh, cw - 2, rh);
      c.fillStyle = '#333';
      const t = j === 0 ? days[i] : i === 0 ? ['', '9:00', '10:50', '13:30'][j] : ['かいわ', 'ぶんぽう', '漢字', 'ちょうかい', 'さくぶん'][(i + j) % 5];
      c.fillText(t, i * cw + cw / 2, 28 + j * rh + rh / 2);
    }
  });
}

function calendarRegion(A, season) {
  const month = { spring: '4', summer: '7', autumn: '10', winter: '1' }[season] || '4';
  return A.draw(126, 168, (c, w, h) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
    const pic = { spring: '#f6c6d3', summer: '#9fd3ea', autumn: '#f0a85a', winter: '#dfe8f0' }[season] || '#eee';
    c.fillStyle = pic; c.fillRect(6, 6, w - 12, 64);
    c.fillStyle = '#c0392b'; c.font = `800 22px ${K.JP_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(`${month}月`, w / 2, 86);
    c.font = `500 10px ${K.JP_FONT}`;
    for (let d = 0; d < 30; d++) { c.fillStyle = d % 7 === 0 ? '#c0392b' : '#444'; c.fillText(String(d + 1), 12 + (d % 7) * 17, 104 + Math.floor(d / 7) * 14); }
  });
}

function aircon(A) {
  const gr = new THREE.Group();
  gr.add(A.rbox(0.85, 0.28, 0.22, 0.05, '#f4f3ef', {}));
  gr.add(A.box(0.7, 0.03, 0.02, '#d4d2cb', { y: 0.04, z: 0.1, cast: false }));
  gr.add(K.mesh(A.paint(new THREE.CircleGeometry(0.008, 8), '#5fd38a'), A.glow, { x: 0.35, y: 0.21, z: 0.111, cast: false }));
  return gr;
}

function umbrellaStand(A, rain) {
  const gr = new THREE.Group();
  gr.add(A.box(0.36, 0.45, 0.24, { all: '#7d8a92', top: '#3c4247' }, {}));
  const cols = rain ? ['#2f6a8f', '#c0392b', '#e8e1d0', '#3c3c44', '#7fb36a', '#f0b84a'] : ['#3c3c44', '#e8e1d0'];
  cols.forEach((c, i) => {
    const u = closedUmbrella(A, c);
    u.position.set(-0.12 + (i % 3) * 0.12, 0.05, -0.05 + Math.floor(i / 3) * 0.1);
    u.rotation.set((i % 2 ? 1 : -1) * 0.08, 0, ((i % 3) - 1) * 0.08);
    gr.add(u);
  });
  if (rain) gr.add(K.mesh(A.paint(new THREE.CircleGeometry(0.4, 18), '#a7b4bd'), A.gloss, { rx: -Math.PI / 2, y: 0.003, x: -0.2, z: -0.1, cast: false }));
  return gr;
}

function closedUmbrella(A, color) {
  const gr = new THREE.Group();
  gr.add(A.cyl(0.006, 0.006, 0.9, '#5a5a5a', {}, 6));
  gr.add(A.cyl(0.035, 0.012, 0.55, color, { y: 0.2 }, 8));
  gr.add(K.mesh(A.paint(new THREE.TorusGeometry(0.035, 0.008, 6, 10, Math.PI), '#4a3a2a'), A.matte, { y: 0.9, rz: 0, cast: false }));
  return gr;
}

function umbrellaMesh(A, color, wet) {
  // the found umbrella: a long umbrella, half-strapped, leaning (pivot at its tip on the floor)
  const gr = new THREE.Group();
  gr.add(A.cyl(0.006, 0.006, 0.86, '#6a6a6a', {}, 6));
  gr.add(A.cyl(0.05, 0.012, 0.6, color, { y: 0.12 }, 10));
  gr.add(A.cyl(0.052, 0.052, 0.03, '#e8e1d0', { y: 0.45 }, 10)); // strap
  gr.add(K.mesh(A.paint(new THREE.TorusGeometry(0.04, 0.009, 6, 12, Math.PI), '#7a5232'), A.matte, { x: 0.04, y: 0.86, cast: false }));
  if (wet) gr.add(K.mesh(A.paint(new THREE.CircleGeometry(0.12, 14), '#9fb0bc'), A.gloss, { rx: -Math.PI / 2, y: 0.003, cast: false }));
  return gr;
}

function nameTent(A, name) {
  const gr = new THREE.Group();
  const r = A.text([name], 0.18, 0.07, { bg: '#ffffff', fg: '#2b4f8c', radius: 0.02, ppm: 400 });
  gr.add(A.box(0.18, 0.07, 0.004, { all: '#ffffff', front: r, back: r }, { rx: -0.25, cast: false }));
  gr.add(A.box(0.18, 0.07, 0.004, '#f4f1ea', { rx: 0.25, z: -0.03, cast: false }));
  return gr;
}

function textbook(A, color = '#3a7bd5') {
  const cover = A.draw(84, 116, (c, w, h) => {
    c.fillStyle = color; c.fillRect(0, 0, w, h);
    c.fillStyle = '#ffffff'; c.fillRect(0, h * 0.18, w, h * 0.3);
    c.fillStyle = color; c.font = `800 ${w * 0.2}px ${K.JP_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('にほんご', w / 2, h * 0.33);
    c.fillStyle = '#fff'; c.font = `700 ${w * 0.14}px ${K.JP_FONT}`; c.fillText('しょきゅう 1', w / 2, h * 0.62);
    c.fillStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.arc(w * 0.5, h * 0.82, w * 0.1, 0, 7); c.fill();
  });
  const gr = new THREE.Group();
  gr.add(A.box(0.182, 0.018, 0.257, { all: '#f5f1e6', top: cover, left: color, bottom: color }));
  return gr;
}

function dictionary(A) {
  const cover = A.draw(76, 104, (c, w, h) => {
    c.fillStyle = '#7a2633'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#d9b45a'; c.lineWidth = 2; c.strokeRect(5, 5, w - 10, h - 10);
    c.fillStyle = '#e8c86a'; c.font = `800 ${w * 0.22}px ${K.JP_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('じしょ', w / 2, h * 0.38); c.font = `700 ${w * 0.13}px ${K.JP_FONT}`; c.fillText('日本語', w / 2, h * 0.6);
  });
  const edge = A.draw(16, 48, (c, w, h) => { c.fillStyle = '#efe8d8'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(120,100,80,0.25)'; for (let y = 0; y < h; y += 2) c.fillRect(0, y, w, 1); });
  return A.box(0.13, 0.055, 0.19, { all: '#7a2633', top: cover, front: edge, right: edge, back: edge });
}

function notebook(A, winter) {
  const page = A.draw(104, 140, (c, w, h) => {
    c.fillStyle = '#fbfaf4'; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(90,130,190,0.45)'; c.lineWidth = 1;
    for (let y = 16; y < h; y += 9) { c.beginPath(); c.moveTo(4, y); c.lineTo(w - 4, y); c.stroke(); }
    c.fillStyle = '#3a3a52'; c.font = `500 9px ${K.JP_FONT}`; c.textBaseline = 'bottom';
    const lines = winter ? ['漢字 れんしゅう', '書く 書く 書く', '読む 読む', '話す 聞く'] : ['これは ほんです。', 'それは じしょです。', 'あれは だれの', 'かさですか。'];
    lines.forEach((t, i) => c.fillText(t, 6, 25 + i * 18));
  });
  const gr = new THREE.Group();
  gr.add(A.box(0.2, 0.006, 0.26, { all: '#4f8fbf', top: page }));
  return gr;
}

function penMesh(A, color) {
  const gr = new THREE.Group();
  gr.add(K.mesh(A.paint(new THREE.CylinderGeometry(0.0055, 0.0055, 0.14, 8), color), A.gloss, { rz: Math.PI / 2, y: 0.006, cast: false }));
  gr.add(K.mesh(A.paint(new THREE.CylinderGeometry(0.006, 0.006, 0.04, 8), '#d8d8d8'), A.gloss, { rz: Math.PI / 2, x: -0.05, y: 0.006, cast: false }));
  gr.add(A.box(0.035, 0.003, 0.004, '#d8d8d8', { x: -0.045, y: 0.012, cast: false }));
  return gr;
}

function pencilMesh(A) {
  const gr = new THREE.Group();
  gr.add(K.mesh(A.paint(new THREE.CylinderGeometry(0.0045, 0.0045, 0.15, 6), '#f0c040'), A.matte, { rz: Math.PI / 2, y: 0.005, cast: false }));
  gr.add(K.mesh(A.paint(new THREE.ConeGeometry(0.0045, 0.018, 6), '#e8c9a0'), A.matte, { rz: -Math.PI / 2, x: 0.084, y: 0.005, cast: false }));
  gr.add(K.mesh(A.paint(new THREE.CylinderGeometry(0.0046, 0.0046, 0.012, 6), '#e48aa0'), A.matte, { rz: Math.PI / 2, x: -0.081, y: 0.005, cast: false }));
  return gr;
}

function eraserMesh(A) {
  const sleeve = A.draw(48, 20, (c, w, h) => { c.fillStyle = '#3b6fb6'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffffff'; c.fillRect(0, h * 0.35, w, h * 0.3); c.fillStyle = '#d33'; c.fillRect(0, h * 0.35, w * 0.3, h * 0.3); });
  const gr = new THREE.Group();
  gr.add(A.box(0.05, 0.012, 0.022, '#f6f6f2', { x: 0.008, cast: false }));
  gr.add(A.box(0.036, 0.0135, 0.0235, { all: '#3b6fb6', top: sleeve, front: sleeve, back: sleeve }, { x: -0.004, cast: false }));
  return gr;
}

function keyMesh(A) {
  const gr = new THREE.Group();
  gr.add(K.mesh(A.paint(new THREE.TorusGeometry(0.014, 0.0025, 6, 14), '#c9c9c9'), A.gloss, { rx: Math.PI / 2, y: 0.003, cast: false }));
  gr.add(A.box(0.008, 0.003, 0.045, '#d8c47a', { z: 0.035, mat: A.gloss, cast: false }));
  gr.add(K.mesh(A.paint(new THREE.CylinderGeometry(0.012, 0.012, 0.004, 12), '#d8c47a'), A.gloss, { y: 0.002, z: 0.012, cast: false }));
  gr.add(A.box(0.006, 0.003, 0.01, '#d8c47a', { x: 0.006, z: 0.05, mat: A.gloss, cast: false }));
  // keychain charm (a small cat)
  gr.add(K.mesh(A.paint(new THREE.SphereGeometry(0.014, 10, 8), '#f2c94c'), A.matte, { x: -0.02, y: 0.012, z: -0.02, cast: false }));
  return gr;
}

function chocolate(A) {
  const top = A.draw(96, 48, (c, w, h) => {
    c.fillStyle = '#5a2e1c'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#d4a650'; c.fillRect(0, h * 0.7, w, h * 0.12);
    c.fillStyle = '#f6e7c8'; c.font = `800 ${h * 0.34}px ${K.JP_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('チョコ', w / 2, h * 0.38);
  });
  return A.box(0.16, 0.012, 0.08, { all: '#5a2e1c', top });
}

function testPaper(A) {
  return A.draw(84, 118, (c, w, h) => {
    c.fillStyle = '#fbfaf4'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#333'; c.font = `800 11px ${K.JP_FONT}`; c.textBaseline = 'top'; c.fillText('漢字テスト', 6, 6);
    c.font = `500 7px ${K.JP_FONT}`; c.fillText('なまえ ＿＿＿＿＿', 6, 22);
    c.strokeStyle = '#bbb';
    for (let i = 0; i < 5; i++) { c.strokeRect(8 + i * 15, 40, 12, 12); c.strokeRect(8 + i * 15, 70, 12, 12); }
  });
}

function magazine(A) {
  const spread = A.draw(150, 104, (c, w, h) => {
    c.fillStyle = '#fbf8f2'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#e9ecef'; c.fillRect(w / 2 - 1, 0, 2, h);
    // left page: big camera photo
    c.fillStyle = '#3d4f63'; c.fillRect(6, 8, w / 2 - 12, h * 0.55);
    c.fillStyle = '#20252b'; K.roundRect(c, 14, 22, w / 2 - 28, h * 0.32, 4); c.fill();
    c.fillStyle = '#9bb4c9'; c.beginPath(); c.arc(w / 4, 22 + h * 0.16, h * 0.11, 0, 7); c.fill();
    c.fillStyle = '#c0392b'; c.font = `800 13px ${K.JP_FONT}`; c.textBaseline = 'top'; c.fillText('カメラ', 8, h * 0.66);
    c.fillStyle = 'rgba(40,40,40,0.5)'; for (let y = h * 0.82; y < h - 4; y += 5) c.fillRect(8, y, w / 2 - 16, 2);
    // right page: landscape photo + text
    c.fillStyle = '#8fc0e0'; c.fillRect(w / 2 + 6, 8, w / 2 - 12, h * 0.4); c.fillStyle = '#6a9a5a'; c.fillRect(w / 2 + 6, 8 + h * 0.28, w / 2 - 12, h * 0.12);
    c.fillStyle = 'rgba(40,40,40,0.5)'; for (let y = h * 0.55; y < h - 4; y += 5) c.fillRect(w / 2 + 8, y, w / 2 - 16, 2);
  });
  const gr = new THREE.Group();
  gr.add(A.box(0.42, 0.008, 0.28, { all: '#e8e2d6', top: spread }));
  return gr;
}

function cameraMesh(A) {
  const gr = new THREE.Group();
  gr.add(A.rbox(0.13, 0.08, 0.06, 0.012, '#2a2d31', {}));
  gr.add(A.rbox(0.05, 0.03, 0.05, 0.008, '#2a2d31', { x: -0.03, y: 0.075 }));
  gr.add(K.mesh(A.paint(new THREE.CylinderGeometry(0.03, 0.032, 0.05, 16), '#1d1f22'), A.gloss, { rx: Math.PI / 2, y: 0.04, z: 0.05 }));
  gr.add(K.mesh(A.paint(new THREE.CircleGeometry(0.022, 16), '#4a6a8a'), A.gloss, { y: 0.04, z: 0.076, cast: false }));
  gr.add(A.box(0.02, 0.01, 0.02, '#b9b9b9', { x: 0.035, y: 0.08, mat: A.gloss, cast: false }));
  gr.add(A.box(0.11, 0.004, 0.012, '#c0392b', { y: 0.06, z: -0.031, cast: false })); // strap lug
  return gr;
}

function pencilCase(A, color) {
  const gr = new THREE.Group();
  gr.add(A.rbox(0.2, 0.05, 0.07, 0.025, color, {}));
  gr.add(A.box(0.16, 0.004, 0.005, '#d8d8d8', { y: 0.05, cast: false }));
  return gr;
}

function canCoffee(A) {
  const label = A.draw(64, 48, (c, w, h) => {
    c.fillStyle = '#6b3a22'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#e9d3a8'; c.fillRect(0, h * 0.3, w, h * 0.4);
    c.fillStyle = '#6b3a22'; c.font = `800 ${h * 0.26}px ${K.JP_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('コーヒー', w / 2, h / 2);
  });
  const gr = new THREE.Group();
  const body = new THREE.CylinderGeometry(0.026, 0.026, 0.1, 14, 1, true);
  gr.add(K.mesh(A.mapUV(body, label), A.matte, { y: 0.05 }));
  gr.add(K.mesh(A.paint(new THREE.CylinderGeometry(0.024, 0.026, 0.008, 14), '#c9c9c9'), A.gloss, { y: 0.104, cast: false }));
  gr.add(K.mesh(A.paint(new THREE.CylinderGeometry(0.026, 0.024, 0.006, 14), '#c9c9c9'), A.gloss, { y: 0.003, cast: false }));
  return gr;
}

function backpack(A, color) {
  const gr = new THREE.Group();
  gr.add(A.rbox(0.3, 0.42, 0.18, 0.07, color, {}));
  gr.add(A.rbox(0.24, 0.16, 0.06, 0.03, shadeHex(color, 0.82), { y: 0.06, z: 0.1 }));
  gr.add(K.mesh(A.paint(new THREE.TorusGeometry(0.05, 0.012, 6, 12, Math.PI), '#2a2a2a'), A.matte, { y: 0.42, cast: false }));
  gr.add(A.box(0.2, 0.012, 0.012, '#d8d8d8', { y: 0.3, z: 0.09, cast: false }));
  return gr;
}

function watchMesh(A) {
  const gr = new THREE.Group();
  gr.add(K.mesh(A.paint(new THREE.TorusGeometry(0.03, 0.006, 6, 18), '#6b4a32'), A.matte, { rx: Math.PI / 2, y: 0.006, cast: false }));
  gr.add(K.mesh(A.paint(new THREE.CylinderGeometry(0.017, 0.017, 0.01, 16), '#d8c47a'), A.gloss, { x: 0.03, y: 0.012, cast: false }));
  gr.add(K.mesh(A.mapUV(new THREE.CircleGeometry(0.014, 16), A.draw(24, 24, (c, w, h) => { c.fillStyle = '#fbf8ef'; c.beginPath(); c.arc(w / 2, h / 2, w / 2, 0, 7); c.fill(); c.strokeStyle = '#222'; c.lineWidth = 2; c.beginPath(); c.moveTo(w / 2, h / 2); c.lineTo(w / 2, 4); c.moveTo(w / 2, h / 2); c.lineTo(w - 6, h / 2); c.stroke(); })), A.matte, { x: 0.03, y: 0.0175, rx: -Math.PI / 2, cast: false }));
  return gr;
}

function paperStack(A, w, d, h, test) {
  const top = test ? testPaper(A) : A.draw(42, 60, (c, cw, ch) => { c.fillStyle = '#fbfaf4'; c.fillRect(0, 0, cw, ch); c.fillStyle = 'rgba(40,40,40,0.4)'; for (let y = 8; y < ch - 4; y += 5) c.fillRect(4, y, cw - 8 - (y % 3) * 4, 2); });
  const side = A.draw(16, 16, (c, cw, ch) => { c.fillStyle = '#efece2'; c.fillRect(0, 0, cw, ch); c.fillStyle = 'rgba(0,0,0,0.12)'; for (let y = 0; y < ch; y += 2) c.fillRect(0, y, cw, 1); });
  return A.box(w, h, d, { all: side, top });
}

function cdPlayer(A) {
  const gr = new THREE.Group();
  gr.add(A.rbox(0.3, 0.13, 0.17, 0.03, '#d9d6cf', {}));
  for (const x of [-0.1, 0.1]) gr.add(K.mesh(A.mapUV(new THREE.CircleGeometry(0.045, 16), A.draw(32, 32, (c, w, h) => { c.fillStyle = '#4a4d52'; c.beginPath(); c.arc(w / 2, h / 2, w / 2, 0, 7); c.fill(); c.fillStyle = '#2e3034'; for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 2 - i * 3, 0, 7); c.stroke(); } })), A.matte, { x, y: 0.065, z: 0.086, cast: false }));
  gr.add(A.box(0.12, 0.012, 0.1, '#bdbab2', { y: 0.13, cast: false }));
  gr.add(A.box(0.1, 0.03, 0.01, '#8fd3a8', { y: 0.095, z: 0.086, mat: A.glow, cast: false }));
  return gr;
}

function lostAndFound(A) {
  const gr = new THREE.Group();
  const front = A.text([{ t: 'わすれもの', scale: 1 }], 0.34, 0.16, { bg: '#f6e3b4', fg: '#8a4a1a', radius: 0.02, size: 0.55 });
  gr.add(A.box(0.34, 0.16, 0.24, { all: '#d8b98a', front, top: '#a07a50' }, {}));
  gr.add(A.box(0.12, 0.05, 0.08, '#e46f6f', { x: -0.08, y: 0.16, rz: 0.1, cast: false })); // a forgotten pencil case
  gr.add(A.cyl(0.03, 0.03, 0.06, '#7fb5d6', { x: 0.1, y: 0.16 }));
  return gr;
}

function scarfOnChair(A, color) {
  const gr = new THREE.Group();
  gr.add(A.box(0.36, 0.06, 0.04, color, { y: 0.8, z: -0.21 }));
  gr.add(A.box(0.08, 0.32, 0.03, color, { x: -0.12, y: 0.5, z: -0.24 }));
  return gr;
}

function heater(A) {
  // round kerosene stove (石油ストーブ) with a kettle on top
  const gr = new THREE.Group();
  gr.add(A.cyl(0.22, 0.22, 0.05, '#4a4d52', {}, 20));
  gr.add(A.cyl(0.2, 0.2, 0.4, '#d9d4c8', { y: 0.05 }, 20));
  const glowWin = new THREE.CylinderGeometry(0.205, 0.205, 0.16, 20, 1, true, -0.9, 1.8);
  gr.add(K.mesh(A.paint(glowWin, '#ff8a3a'), A.glow, { y: 0.27, cast: false }));
  gr.add(A.cyl(0.21, 0.21, 0.03, '#5a5d62', { y: 0.45 }, 20));
  gr.add(A.cyl(0.08, 0.1, 0.12, '#b8bcc0', { y: 0.48, mat: A.gloss }, 14));
  gr.add(K.mesh(A.paint(new THREE.CylinderGeometry(0.008, 0.014, 0.12, 6), '#b8bcc0'), A.gloss, { x: 0.1, y: 0.56, rz: -0.9, cast: false }));
  gr.add(K.mesh(A.paint(new THREE.TorusGeometry(0.06, 0.006, 6, 12, Math.PI), '#3a3a3a'), A.matte, { y: 0.6, cast: false }));
  return gr;
}

function bins(A) {
  const gr = new THREE.Group();
  [['#3a7bd5', 'もえる'], ['#e3b04a', 'もえない'], ['#5b9f5b', 'ペット']].forEach(([col, label], i) => {
    const x = (i - 1) * 0.36;
    gr.add(A.box(0.3, 0.55, 0.3, { all: col, front: A.text([label], 0.3, 0.12, { bg: '#ffffff', fg: col, size: 0.6, radius: 0.1 }), top: '#2f2f2f' }, { x }));
  });
  return gr;
}

function steamPuffs() {
  const gr = new THREE.Group();
  const m = () => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.1, depthWrite: false });
  for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), m()); s.position.x = (i - 1.5) * 0.06; gr.add(s); }
  return gr;
}
