// museum — みどり美術館, the entrance hall: a calm double-height lobby in warm wood and stone.
// Ahead: the ticket counter (受付) with 上田 behind it, the opening-hours sign beside her, a brochure
// stand within reach. Beyond: the big painting on the far wall, the exhibition entrance (gate) with the
// clock above it, the special-exhibition poster, and the café (far left, closed after 16:30).
// Lockers on the left wall, museum shop and windows on the right, glass entrance behind the learner.
// Learner stands at the origin looking toward -z.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as K from '../kit.js';

export const meta = { indoor: true, ambience: 'museum' };

const WOOD = '#a77b52';
const DARKWOOD = '#6b4a33';
const PLASTER = '#efe9df';
const STONE = '#cfc6b6';
const INK = '#3a3a34';
const GREEN = '#3c5a46';

// Town facts (data/lessons/l04.json): open 9:30–17:00, Sat & Sun until 20:00, closed Mondays,
// café 11:00–16:30, admission 1,200 yen. The l04b lines say it is 16:40 now.
const CLOCK = { morning: [10, 15], noon: [12, 30], evening: [16, 40], night: [19, 20] };

export default function build({ setup }) {
  const time = setup.time || 'evening';
  const season = setup.season || 'winter';
  const weather = setup.weather || 'clear';
  const rain = weather === 'rain';
  const [hh, mm] = CLOCK[time] || CLOCK.evening;
  const cafeOpen = hh * 60 + mm >= 11 * 60 && hh * 60 + mm < 16 * 60 + 30;

  const g = new THREE.Group();
  const P = paletteKit();
  const S = signKit(false);
  const L = signKit(true);
  const props = {};
  const put = (o, x = 0, y = 0, z = 0, ry = 0, parent = g) => { o.position.set(x, y, z); o.rotation.y = ry; parent.add(o); return o; };

  // ------------------------------------------------------------------ the hall
  const W = 12; const H = 5.0; const z0 = -6.5; const z1 = 3.5;
  const floor = K.mat('#ffffff', { map: K.tileTex('#ddd5c6', '#d3cab9', 4, [1, 1], '#bdb3a2'), rough: 0.32 });
  g.add(K.mesh(uvPlane(W, z1 - z0, W / 2.4, (z1 - z0) / 2.4), floor, { z: (z0 + z1) / 2, rx: -Math.PI / 2, cast: false }));
  const ceil = K.mat('#ffffff', { map: K.woodTex('#b98d62', [1, 1], 12), rough: 0.7 });
  g.add(K.mesh(uvPlane(W, z1 - z0, 3, 3), ceil, { y: H, z: (z0 + z1) / 2, rx: Math.PI / 2, cast: false }));
  for (let x = -5.5; x <= 5.5; x += 0.5) g.add(P.box(0.06, 0.12, z1 - z0, '#8f6a48', { x, y: H - 0.12, z: (z0 + z1) / 2, cast: false }, 'satin')); // ceiling slats
  // left wall (lockers, floor guide) + wood wainscot
  g.add(P.box(0.2, H, z1 - z0, PLASTER, { x: -W / 2 - 0.1, z: (z0 + z1) / 2 }));
  const slat = K.mat('#ffffff', { map: K.woodTex(WOOD, [1, 1], 10), rough: 0.55 });
  const slatWall = (w, h, o) => g.add(K.mesh(uvPlane(w, h, w / 1.2, h / 2.4), slat, { ...o, cast: false }));
  slatWall(z1 - z0, 2.4, { x: -W / 2 + 0.005, y: 1.2, z: (z0 + z1) / 2, ry: Math.PI / 2 });
  // right wall with tall windows
  g.add(P.box(0.2, H, z1 - z0, PLASTER, { x: W / 2 + 0.1, z: (z0 + z1) / 2 }));
  const outside = (w, h) => L.draw(w, h, 110, (c, cw, ch) => drawOutside(c, cw, ch, time, season, weather));
  for (const z of [-4.4, -1.6, 1.2]) {
    put(outside(2.2, 3.6), W / 2 - 0.02, 2.25, z, -Math.PI / 2);
    g.add(P.box(0.12, 3.75, 0.1, DARKWOOD, { x: W / 2 - 0.06, y: 0.38, z: z - 1.1 }, 'satin'));
    g.add(P.box(0.12, 3.75, 0.1, DARKWOOD, { x: W / 2 - 0.06, y: 0.38, z: z + 1.1 }, 'satin'));
    g.add(P.box(0.12, 0.1, 2.3, DARKWOOD, { x: W / 2 - 0.06, y: 4.08, z }, 'satin'));
    g.add(P.box(0.25, 0.06, 2.3, '#d9d2c4', { x: W / 2 - 0.12, y: 0.42, z }, 'satin'));
    g.add(P.box(0.04, 3.6, 2.2, '#cfe0e6', { x: W / 2 - 0.08, y: 0.45, z }, 'glass'));
  }
  g.add(P.box(0.06, 0.42, z1 - z0, '#d9d2c4', { x: W / 2 - 0.02, z: (z0 + z1) / 2 }));
  // back wall: glass entrance doors + windows
  g.add(P.box(W, H, 0.2, PLASTER, { z: z1 + 0.1 }));
  put(outside(4.2, 2.8), 0, 1.45, z1 - 0.02, Math.PI);
  for (const x of [-1.05, 1.05]) {
    g.add(P.box(1.9, 2.5, 0.04, '#cfe0e6', { x, y: 0.05, z: z1 - 0.06 }, 'glass'));
    g.add(P.box(0.06, 2.55, 0.08, '#8f9497', { x: x - 0.95, z: z1 - 0.06 }, 'metal'));
    g.add(P.box(0.03, 1.2, 0.05, '#c9ccd0', { x: x + (x < 0 ? 0.85 : -0.85), y: 0.6, z: z1 - 0.12 }, 'metal'));
  }
  g.add(P.box(4.3, 0.1, 0.1, '#8f9497', { y: 2.55, z: z1 - 0.06 }, 'metal'));
  g.add(P.box(4.3, 0.12, 0.12, DARKWOOD, { y: 2.9, z: z1 - 0.08 }, 'satin'));
  put(S.sign([{ t: '入口  Entrance', scale: 0.8 }], 1.0, 0.2, { bg: null, fg: '#5a4a3a' }), 0, 3.15, z1 - 0.01, Math.PI);
  g.add(P.box(3.0, 0.02, 1.4, '#5a5048', { y: 0, z: z1 - 0.9 }));       // entrance mat
  slatWall(3.6, 2.4, { x: -3.9, y: 1.2, z: z1 - 0.005, ry: Math.PI });
  slatWall(3.6, 2.4, { x: 3.9, y: 1.2, z: z1 - 0.005, ry: Math.PI });

  // far wall (z0): café glass front | painting wall | exhibition entrance | poster wall
  g.add(P.box(3.4, H, 0.3, '#e7dfd1', { x: -2.3, z: z0 - 0.15 }));              // painting wall -4.0 … -0.6
  g.add(P.box(2.2, H, 0.3, '#e7dfd1', { x: 0.5, z: z0 - 0.15 }));               // -0.6 … 1.6 (banner wall)
  g.add(P.box(2.0, H, 0.3, '#e7dfd1', { x: 5.0, z: z0 - 0.15 }));               // 4.0 … 6.0 (poster wall)
  g.add(P.box(2.4, H - 3.2, 0.3, '#e7dfd1', { x: 2.8, y: 3.2, z: z0 - 0.15 }));    // over the exhibition entrance
  g.add(P.box(2.0, H - 3.0, 0.3, '#e7dfd1', { x: -5.0, y: 3.0, z: z0 - 0.15 }));   // over the café front
  g.add(P.box(W, 0.12, 0.34, DARKWOOD, { y: 0, z: z0 - 0.15 }, 'satin'));        // skirting

  // ------------------------------------------------------------------ lights: washi pendants, downlights
  for (const [x, z] of [[-3, -2.5], [1.0, -3.8], [3, -2.5], [-3, 1.2], [3, 1.2]]) {
    g.add(P.cyl(0.005, 0.005, H - 3.4, '#555', { x, y: 3.4, z }, 'metal', 4));
    const lamp = P.mesh(new THREE.SphereGeometry(0.32, 14, 10), '#fff1d6', { x, y: 3.2, z }, 'glow');
    lamp.scale.set(1, 0.85, 1); lamp.castShadow = false; g.add(lamp);
    for (const yy of [3.05, 3.35]) g.add(P.mesh(new THREE.TorusGeometry(0.3, 0.008, 4, 20), '#d9c8a8', { x, y: yy, z, rx: Math.PI / 2, cast: false }, 'satin'));
  }
  for (let x = -4.5; x <= 4.5; x += 1.5) for (const z of [-5.5, 2.6]) g.add(P.cyl(0.09, 0.09, 0.02, '#fff6e2', { x, y: H - 0.15, z }, 'glow', 12));
  const l1 = new THREE.PointLight('#ffe2b8', 14, 12, 1.4); l1.position.set(0.2, 2.75, -0.3); g.add(l1);
  const l2 = new THREE.PointLight('#ffe6c4', 8, 10, 1.5); l2.position.set(-1.5, 3.2, -5.2); g.add(l2);

  // ------------------------------------------------------------------ ticket counter (受付) with 上田 behind it
  const counter = new THREE.Group();
  counter.add(P.box(2.7, 1.0, 0.55, '#d8cdb9', { z: 0 }));
  const front = K.mesh(uvPlane(2.7, 0.92, 2.7 / 1.2, 0.92 / 2.4), slat, { y: 0.5, z: 0.28, cast: false });
  counter.add(front);
  counter.add(P.box(2.85, 0.05, 0.68, '#c9a074', { y: 1.0, z: 0.02 }, 'satin'));    // wooden top
  counter.add(P.box(2.7, 0.06, 0.04, '#8f6a48', { y: 0.06, z: 0.29 }, 'satin'));
  counter.add(P.box(2.4, 0.04, 0.3, '#d8cdb9', { y: 0.75, z: -0.32 }, 'satin'));   // staff-side shelf
  put2(counter, S.sign([{ t: '受付  Reception', scale: 0.9 }], 1.0, 0.16, { bg: '#f4efe4', fg: INK, radius: 0.1 }), -0.75, 0.82, 0.29);
  put2(counter, S.sign([{ t: 'チケット  Tickets', scale: 0.9 }], 1.0, 0.16, { bg: '#f4efe4', fg: INK, radius: 0.1 }), 0.75, 0.82, 0.29);
  // staff-side kit: monitor, ticket printer, card terminal, a tiny ikebana
  counter.add(P.box(0.4, 0.27, 0.03, '#26282c', { x: -0.7, y: 1.12, z: -0.12, rx: 0.15 }, 'satin'));
  counter.add(P.box(0.36, 0.22, 0.01, '#9fc4e8', { x: -0.7, y: 1.14, z: -0.135, rx: 0.15 }, 'glow'));
  counter.add(P.box(0.12, 0.1, 0.1, '#26282c', { x: -0.7, y: 1.02, z: -0.1 }, 'satin'));
  counter.add(P.box(0.24, 0.12, 0.2, '#e9e7e1', { x: -0.25, y: 1.025, z: -0.15 }, 'satin'));
  counter.add(P.box(0.08, 0.03, 0.15, '#2a2d31', { x: 0.95, y: 1.025, z: 0.08, rx: -0.2 }, 'satin'));
  counter.add(P.box(0.06, 0.012, 0.04, '#7fd0a0', { x: 0.95, y: 1.06, z: 0.06, rx: -0.2 }, 'glow'));
  put2(counter, ikebana(P, season, 0.34), -1.15, 1.025, -0.12);
  put(counter, 0, 0, -1.15);
  // ticket (npc): ticket tray + price stand in front of 上田
  const ticket = new THREE.Group();
  ticket.add(P.box(0.24, 0.015, 0.15, '#3a3a34', {}, 'satin'));
  for (let i = 0; i < 3; i++) ticket.add(P.box(0.18, 0.004, 0.07, ['#f4efe4', '#efe0c8', '#e3ecd8'][i], { x: (i - 1) * 0.015, y: 0.016 + i * 0.004, z: (i - 1) * 0.01, ry: (i - 1) * 0.08 }, 'satin'));
  put2(ticket, S.draw(0.17, 0.075, 1200, drawTicket), 0.0, 0.03, 0.0).rotation.x = -Math.PI / 2;
  const stand = new THREE.Group();
  stand.add(P.box(0.24, 0.02, 0.1, '#cfe0e6', {}, 'glass'));
  put2(stand, S.sign([{ t: '観覧券  Admission', scale: 0.55, color: '#6a5a4a' }, { t: '一般  1,200円', scale: 0.95 }], 0.24, 0.16, { bg: '#fbf8f1', fg: INK, radius: 0.06 }), 0, 0.1, 0.0).rotation.x = -0.25;
  put2(ticket, stand, 0.22, 0, -0.03, -0.25);
  put(ticket, 0.22, 1.025, -1.12, 0);
  props.ticket = K.prop('ticket', ticket, { labelJa: 'チケット', labelEn: 'ticket' });

  // back cabinet behind the counter
  g.add(P.box(2.4, 0.9, 0.45, '#d8cdb9', { z: -2.7 }));
  g.add(P.box(2.45, 0.04, 0.5, '#c9a074', { y: 0.9, z: -2.7 }, 'satin'));
  for (let i = 0; i < 4; i++) g.add(P.box(0.55, 0.8, 0.01, '#cfc4ae', { x: -0.9 + i * 0.6, y: 0.05, z: -2.47 }, 'satin'));
  for (let i = 0; i < 5; i++) g.add(P.box(0.2, 0.28, 0.03, ['#e9d8b8', '#c9d8c8', '#d8c0c8', '#e8e2d0', '#c8d0e0'][i], { x: 0.3 + i * 0.16, y: 0.94, z: -2.75, rx: -0.15 }, 'satin'));

  // ------------------------------------------------------------------ opening-hours sign (npc, beside 上田)
  const hours = new THREE.Group();
  hours.add(P.box(0.06, 0.92, 0.06, DARKWOOD, { x: 0 }, 'satin'));
  hours.add(P.box(0.5, 0.04, 0.4, DARKWOOD, {}, 'satin'));
  hours.add(P.box(0.9, 1.22, 0.05, DARKWOOD, { y: 0.9 }, 'satin'));
  put2(hours, S.draw(0.82, 1.14, 420, drawHours), 0, 1.51, 0.028);
  put(hours, 1.42, 0, -1.95, K.faceYaw({ x: 1.42, z: -1.95 }, { x: 0, z: 0.4 }));
  props.hours_sign = K.prop('hours_sign', hours, { labelJa: 'かいかん じかん', labelEn: 'opening hours sign' });

  // ------------------------------------------------------------------ brochure stand (near, left of the learner)
  const bro = new THREE.Group();
  bro.add(P.box(0.5, 1.1, 0.06, WOOD, { z: -0.12 }, 'satin'));
  for (const x of [-0.24, 0.24]) bro.add(P.box(0.03, 1.1, 0.28, WOOD, { x }, 'satin'));
  for (let r = 0; r < 3; r++) {
    const y = 0.42 + r * 0.25;
    bro.add(P.box(0.48, 0.02, 0.2, WOOD, { y, z: 0.02, rx: -0.3 }, 'satin'));
    bro.add(P.box(0.48, 0.07, 0.015, WOOD, { y, z: 0.12 }, 'satin'));
    for (let k = 0; k < 2; k++) {
      const leaf = S.draw(0.15, 0.21, 520, (c, w, h) => drawLeaflet(c, w, h, r * 2 + k));
      leaf.position.set(-0.11 + k * 0.22, y + 0.12, 0.0); leaf.rotation.x = -0.3;
      bro.add(leaf);
    }
  }
  put2(bro, S.sign([{ t: 'ご自由に お取りください', scale: 0.7 }, { t: 'Free brochures', scale: 0.55, weight: 500 }], 0.48, 0.14, { bg: '#f4efe4', fg: INK }), 0, 1.22, -0.085);
  put(bro, -0.82, 0, -0.3, K.faceYaw({ x: -0.82, z: -0.3 }, { x: 0, z: 0 }));
  props.brochure = K.prop('brochure', bro, { labelJa: 'パンフレット', labelEn: 'brochures' });

  // ------------------------------------------------------------------ the big painting (far, far wall left)
  const painting = new THREE.Group();
  const frameW = 3.1; const frameH = 2.1;
  painting.add(P.box(frameW + 0.2, frameH + 0.2, 0.08, '#b8925a', { y: -(frameH + 0.2) / 2 }, 'metal'));
  painting.add(P.box(frameW + 0.04, frameH + 0.04, 0.09, '#f2ece0', { y: -(frameH + 0.04) / 2 }, 'satin'));
  const canvasMesh = new THREE.Mesh(new THREE.PlaneGeometry(frameW - 0.1, frameH - 0.1), paintingMat(season));
  canvasMesh.position.set(0, 0, 0.05);
  painting.add(canvasMesh);
  put2(painting, S.sign([{ t: '「みずうみの 朝」  森川 しずか  2019', scale: 0.8 }], 0.9, 0.09, { bg: '#f7f3ea', fg: INK, radius: 0.1 }), 2.1, -0.95, 0.03);
  put(painting, -2.3, 2.1, z0 + 0.01);
  props.painting = K.prop('painting', painting, { labelJa: 'え', labelEn: 'painting' });
  for (const x of [-3.2, -1.4]) { // track spots
    g.add(P.box(0.08, 0.12, 0.6, '#2a2a2a', { x, y: 3.85, z: z0 + 0.4, rx: 0.6 }, 'satin'));
  }
  g.add(P.box(3.4, 0.05, 0.05, '#2a2a2a', { x: -2.3, y: 4.0, z: z0 + 0.55 }, 'metal'));
  // low stanchions in front of the painting
  for (const x of [-3.7, -2.3, -0.9]) g.add(P.cyl(0.025, 0.025, 0.85, '#b8925a', { x, z: z0 + 0.9 }, 'metal', 8));
  g.add(P.box(2.8, 0.02, 0.02, '#8a2f3b', { x: -2.3, y: 0.78, z: z0 + 0.9 }, 'satin'));

  // ------------------------------------------------------------------ exhibition entrance (gate) with the clock above
  const gate = new THREE.Group();
  for (const s of [-1, 1]) {
    gate.add(P.box(0.12, 3.2, 0.36, DARKWOOD, { x: s * 1.26 }, 'satin'));           // door jambs
    gate.add(P.cyl(0.03, 0.03, 0.95, '#b8925a', { x: s * 0.6, z: 0.75 }, 'metal', 8));  // stanchions
    gate.add(P.cyl(0.15, 0.15, 0.03, '#b8925a', { x: s * 0.6, z: 0.75 }, 'metal', 14));
  }
  gate.add(P.box(2.64, 0.12, 0.36, DARKWOOD, { y: 3.14 }, 'satin'));
  gate.add(P.box(1.2, 0.03, 0.03, '#8a2f3b', { y: 0.88, z: 0.75 }, 'satin'));
  // ticket-check podium
  gate.add(P.box(0.5, 1.0, 0.4, '#d8cdb9', { x: 1.75, z: 0.55 }));
  gate.add(P.box(0.55, 0.04, 0.45, '#c9a074', { x: 1.75, y: 1.0, z: 0.55 }, 'satin'));
  put2(gate, S.sign([{ t: 'チケットを お見せください', scale: 0.8 }, { t: 'Please show your ticket', scale: 0.6, weight: 500 }], 0.46, 0.16, { bg: '#f4efe4', fg: INK }), 1.75, 0.82, 0.756);
  put2(gate, L.sign([{ t: '展示室  Exhibition', scale: 0.9 }], 1.7, 0.3, { bg: '#2f3a33', fg: '#f4efe4', radius: 0.06 }), 0, 3.55, 0.005);
  put2(gate, S.sign([{ t: '本日の 閉館  17:00', scale: 0.85 }, { t: 'Closing today 17:00', scale: 0.6, weight: 500 }], 0.5, 0.26, { bg: '#fbf8f1', fg: '#8a2f3b', radius: 0.06 }), -1.0, 1.35, 0.19);
  put2(gate, S.sign([{ t: '撮影禁止', scale: 0.9 }, { t: 'No photos', scale: 0.6, weight: 500 }], 0.36, 0.16, { bg: '#fbf8f1', fg: INK }), 1.0, 1.55, 0.19);
  put(gate, 2.8, 0, z0);
  props.gate = K.prop('gate', gate, { labelJa: 'てんじしつの いりぐち', labelEn: 'exhibition gate' });
  // the exhibition room glimpsed through the opening
  g.add(P.box(5, 0.02, 6, '#7a6a5a', { x: 2.8, y: 0.001, z: z0 - 3.2 }));
  g.add(P.box(5, 3.4, 0.2, '#e4ddd0', { x: 2.8, z: z0 - 5.5 }));
  g.add(P.box(0.2, 3.4, 6, '#d9d1c2', { x: 0.3, z: z0 - 3 }));
  g.add(P.box(0.2, 3.4, 6, '#d9d1c2', { x: 5.3, z: z0 - 3 }));
  g.add(P.box(5, 0.2, 6, '#3a3430', { x: 2.8, y: 3.4, z: z0 - 3 }));
  put(S.draw(1.0, 0.7, 200, (c, w, h) => drawSmallPainting(c, w, h, 1)), 2.8, 1.6, z0 - 5.39);
  put(S.draw(0.7, 0.9, 200, (c, w, h) => drawSmallPainting(c, w, h, 2)), 5.19, 1.6, z0 - 3.0, -Math.PI / 2);
  put(S.draw(0.7, 0.9, 200, (c, w, h) => drawSmallPainting(c, w, h, 3)), 0.41, 1.6, z0 - 2.4, Math.PI / 2);
  for (const [x, z] of [[2.8, -10.2], [4.6, -8.8], [1.0, -8.2]]) g.add(P.cyl(0.18, 0.18, 0.02, '#fff2d8', { x, y: 3.28, z }, 'glow', 12));
  g.add(P.box(1.6, 0.42, 0.45, DARKWOOD, { x: 2.8, z: -9.6 }, 'satin'));
  // clock above the exhibition entrance
  const clk = new THREE.Group();
  clk.add(P.cyl(0.42, 0.42, 0.06, '#2f2a26', { rx: Math.PI / 2, z: 0 }, 'satin', 32));
  put2(clk, S.draw(0.8, 0.8, 400, (c, w, h) => drawClock(c, w, h, hh, mm)), 0, 0, 0.035);
  put(clk, 2.8, 4.05, z0 + 0.02);
  props.clock = K.prop('clock', clk, { labelJa: 'とけい', labelEn: 'clock' });

  // ------------------------------------------------------------------ poster + banner (far, right)
  const poster = new THREE.Group();
  poster.add(P.box(1.36, 1.86, 0.05, '#2f2a26', { y: -0.93 }, 'satin'));
  put2(poster, S.draw(1.26, 1.76, 300, drawPoster), 0, 0, 0.03);
  put(poster, 5.0, 2.35, z0 + 0.01);
  props.poster = K.prop('poster', poster, { labelJa: 'ポスター', labelEn: 'exhibition poster' });
  // tall banner (垂れ幕) high on the wall behind the counter
  const banner = S.draw(0.95, 2.4, 220, drawBanner);
  put(banner, 0.5, 3.55, z0 + 0.02);
  g.add(P.box(1.05, 0.05, 0.05, DARKWOOD, { x: 0.5, y: 4.76, z: z0 + 0.05 }, 'satin'));

  // ------------------------------------------------------------------ café (far left), closed after 16:30
  const cafe = new THREE.Group();
  cafe.add(P.box(2.0, 3.0, 0.05, '#cfe0e6', { z: 0 }, 'glass'));
  for (const x of [-1.0, -0.2, 1.0]) cafe.add(P.box(0.06, 3.0, 0.08, DARKWOOD, { x }, 'satin'));
  cafe.add(P.box(2.0, 0.08, 0.1, DARKWOOD, { y: 2.96 }, 'satin'));
  cafe.add(P.box(2.0, 0.02, 4.0, '#9a7a5a', { y: 0.001, z: -2.0 }));                                 // café floor
  cafe.add(P.box(2.0, 3.0, 0.1, '#e8d8c0', { z: -4.0 }));
  cafe.add(P.box(0.1, 3.0, 4.0, '#e8d8c0', { x: -1.0, z: -2.0 }));
  cafe.add(P.box(2.1, 0.1, 4.0, '#6b4a33', { y: 3.0, z: -2.0 }));
  cafe.add(P.box(1.6, 1.0, 0.5, DARKWOOD, { x: 0.1, z: -3.6 }, 'satin'));                            // café counter
  for (let i = 0; i < 5; i++) cafe.add(P.cyl(0.04, 0.03, 0.09, ['#f2f2ee', '#e8a33c', '#7fb5d6', '#f2f2ee', '#c97a5d'][i], { x: -0.4 + i * 0.2, y: 1.0, z: -3.55 }, 'satin', 10));
  for (const [x, z] of [[-0.35, -1.0], [0.55, -2.2]]) {
    const t = K.table(0.65, 0.65, 0.72, K.mat('#c9a074', { rough: 0.45 }), K.mat('#3a3430'));
    put2(cafe, P.adopt(t), x, 0, z);
    for (const s of [-1, 1]) {
      const ch = P.adopt(K.chair('#6b4a33', '#a33a2a'));
      if (cafeOpen) put2(cafe, ch, x + s * 0.5, 0, z, -s * Math.PI / 2);
      else { put2(cafe, ch, x + s * 0.2, 0.72, z, -s * Math.PI / 2); ch.rotation.z = Math.PI; ch.position.y = 1.62; } // chairs up on the tables
    }
  }
  for (const [x, z] of [[-0.6, -3.0], [0.3, -0.6]]) cafe.add(P.cyl(0.12, 0.12, 0.02, '#fff0d0', { x, y: 2.95, z }, 'glow', 10));
  if (!cafeOpen) {
    const tag = new THREE.Group();
    tag.add(P.box(0.03, 1.0, 0.03, DARKWOOD, { x: -0.22 }, 'satin'));
    tag.add(P.box(0.03, 1.0, 0.03, DARKWOOD, { x: 0.22 }, 'satin'));
    put2(tag, S.sign([{ t: hh < 11 ? '準備中' : '本日の営業は', scale: 0.9 }, { t: hh < 11 ? 'Opens 11:00' : '終了しました', scale: hh < 11 ? 0.6 : 0.9 }, { t: hh < 11 ? '' : 'Closed', scale: 0.6, weight: 500 }], 0.5, 0.36, { bg: '#fbf8f1', fg: '#8a2f3b' }), 0, 0.85, 0.02);
    put2(cafe, tag, 0.4, 0, 0.45);
  }
  put(cafe, -5.0, 0, z0);
  const cafeSign = new THREE.Group();
  cafeSign.add(P.box(1.25, 0.5, 0.06, DARKWOOD, { y: -0.25 }, 'satin'));
  put2(cafeSign, L.sign([{ t: 'カフェ みどり', scale: 1 }, { t: 'Café  11:00〜16:30', scale: 0.6, weight: 500 }], 1.15, 0.42, { bg: '#f7efe0', fg: '#5a3a26', radius: 0.06 }), 0, 0, 0.035);
  cafeSign.add(P.box(0.02, 0.4, 0.02, '#555', { x: -0.45, y: 0.25 }, 'metal'));
  cafeSign.add(P.box(0.02, 0.4, 0.02, '#555', { x: 0.45, y: 0.25 }, 'metal'));
  put(cafeSign, -5.0, 2.95, z0 + 0.5);
  props.cafe_sign = K.prop('cafe_sign', cafeSign, { labelJa: 'カフェの かんばん', labelEn: 'café sign' });

  // ------------------------------------------------------------------ left wall: lockers, floor guide, logo, umbrella stand
  const lockers = new THREE.Group(); // faces +z, rotated onto the wall
  lockers.add(P.box(2.4, 1.9, 0.5, '#c8beac', {}, 'satin'));
  for (let c = 0; c < 6; c++) for (let r = 0; r < 4; r++) {
    lockers.add(P.box(0.37, 0.43, 0.02, r === 0 ? '#b3a690' : '#ddd3c2', { x: -1.0 + c * 0.4, y: 0.06 + r * 0.46, z: 0.26 }, 'satin'));
    lockers.add(P.box(0.05, 0.06, 0.02, '#b8925a', { x: -0.88 + c * 0.4, y: 0.3 + r * 0.46, z: 0.275 }, 'metal'));
    lockers.add(P.box(0.08, 0.05, 0.01, '#f4efe4', { x: -1.08 + c * 0.4, y: 0.42 + r * 0.46, z: 0.272 }, 'satin'));
  }
  put2(lockers, S.sign([{ t: 'コインロッカー  Lockers', scale: 0.85 }, { t: '100円（あとで もどります）', scale: 0.6, weight: 500 }], 1.6, 0.3, { bg: '#f4efe4', fg: INK }), 0, 2.2, 0.0);
  put(lockers, -W / 2 + 0.26, 0, -2.6, Math.PI / 2);
  props.locker = K.prop('locker', lockers, { labelJa: 'ロッカー', labelEn: 'lockers' });
  put(S.draw(0.9, 1.2, 300, drawFloorGuide), -W / 2 + 0.05, 1.5, 0.6, Math.PI / 2);
  g.add(P.box(0.04, 1.28, 0.98, DARKWOOD, { x: -W / 2 + 0.01, y: 0.86, z: 0.6 }, 'satin'));
  put(S.sign([{ t: 'みどり美術館', scale: 1 }], 3.2, 0.6, { bg: null, fg: GREEN }), -W / 2 + 0.02, 3.6, -1.2, Math.PI / 2);
  const umb = new THREE.Group(); // umbrella stand with locks (傘立て) by the entrance
  umb.add(P.box(1.2, 0.5, 0.35, '#8f9497', {}, 'metal'));
  for (let i = 0; i < 6; i++) umb.add(P.box(0.06, 0.08, 0.06, '#d8302a', { x: -0.5 + i * 0.2, y: 0.5, z: 0.12 }, 'satin'));
  const umbN = rain ? 5 : weather === 'cloudy' ? 2 : 1;
  for (let i = 0; i < umbN; i++) umb.add(P.cyl(0.015, 0.04, 0.9, ['#2f6db3', '#3a3a3a', '#8a2f3b', '#2f7a5b', '#e8a33c'][i], { x: -0.5 + i * 0.2, y: 0.1, z: 0.02, rz: 0.06 * (i % 2 ? 1 : -1) }, 'satin', 8));
  put2(umb, S.sign(['かさ立て  Umbrellas'], 0.6, 0.12, { bg: '#f4efe4', fg: INK }), 0, 0.35, 0.18);
  put(umb, -W / 2 + 0.3, 0, 2.5, Math.PI / 2);

  if (season === 'winter' || season === 'autumn' || rain) { // coat stand by the lockers (coats-and-umbrella weather)
    const rack = new THREE.Group();
    rack.add(P.cyl(0.025, 0.025, 1.75, DARKWOOD, {}, 'satin', 8));
    rack.add(P.cyl(0.22, 0.25, 0.04, DARKWOOD, {}, 'satin', 12));
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; rack.add(P.box(0.18, 0.025, 0.025, DARKWOOD, { x: Math.cos(a) * 0.09, y: 1.68, z: Math.sin(a) * 0.09, ry: -a }, 'satin')); }
    rack.add(P.rbox(0.42, 0.95, 0.16, 0.05, '#5a4a42', { x: 0.12, y: 0.75, z: 0.05, ry: 0.3 }, 'matte'));
    rack.add(P.rbox(0.38, 0.85, 0.15, 0.05, '#2f3a4a', { x: -0.1, y: 0.82, z: -0.1, ry: -0.8 }, 'matte'));
    rack.add(P.box(0.08, 0.5, 0.05, '#b8322a', { x: 0.2, y: 1.15, z: 0.16, ry: 0.3 }, 'matte')); // scarf
    put(rack, -5.4, 0, -0.55);
  }

  // ------------------------------------------------------------------ right side: museum shop, long bench, toilet sign
  const shop = new THREE.Group(); // faces -x (rotated)
  shop.add(P.box(2.6, 1.9, 0.4, '#d8cdb9', { z: -0.2 }));
  for (let r = 0; r < 4; r++) {
    shop.add(P.box(2.5, 0.03, 0.36, WOOD, { y: 0.3 + r * 0.42, z: -0.05 }, 'satin'));
    for (let k = 0; k < 9; k++) shop.add(P.box(0.11 + (k % 3) * 0.03, 0.15 + (k % 2) * 0.06, 0.02, ['#e9d8b8', '#9cb4c9', '#c97a5d', '#7f9f7a', '#f2ece0', '#d8b04a', '#8a6a9a'][(k + r) % 7], { x: -1.1 + k * 0.27, y: 0.33 + r * 0.42, z: 0.02, rx: -0.12 }, 'satin'));
  }
  put2(shop, L.sign([{ t: 'ミュージアムショップ  Shop', scale: 0.85 }], 1.8, 0.26, { bg: '#2f3a33', fg: '#f4efe4' }), 0, 2.2, 0.0);
  put(shop, W / 2 - 0.25, 0, 1.6, -Math.PI / 2);
  const table = new THREE.Group();
  table.add(P.box(1.4, 0.8, 0.7, '#d8cdb9', {}));
  table.add(P.box(1.45, 0.04, 0.75, '#c9a074', { y: 0.8 }, 'satin'));
  for (let i = 0; i < 6; i++) table.add(P.box(0.2, 0.05 + (i % 3) * 0.03, 0.26, ['#2f3a33', '#e9d8b8', '#8a2f3b', '#c8d0e0', '#d8b04a', '#f2ece0'][i], { x: -0.5 + (i % 3) * 0.5, y: 0.84, z: -0.17 + Math.floor(i / 3) * 0.34 }, 'satin'));
  for (let i = 0; i < 3; i++) table.add(P.box(0.32, 0.38, 0.02, ['#e9e1cf', '#3c5a46', '#c9a074'][i], { x: -0.45 + i * 0.45, y: 0.84, z: 0.0, ry: 0 }, 'matte'));
  put(table, 4.4, 0, 1.4, Math.PI / 2);
  const bench = new THREE.Group();
  bench.add(P.box(2.4, 0.08, 0.5, WOOD, { y: 0.4 }, 'satin'));
  for (const x of [-1.0, 1.0]) bench.add(P.box(0.08, 0.4, 0.45, DARKWOOD, { x }, 'satin'));
  put(bench, W / 2 - 0.9, 0, -2.6, Math.PI / 2);
  put(L.sign([{ t: 'トイレ  Restrooms  →', scale: 0.85 }], 1.2, 0.24, { bg: '#2f3a33', fg: '#f4efe4' }), W / 2 - 0.02, 2.65, -5.6, -Math.PI / 2);
  // plants
  for (const [x, z, s, seed] of [[-5.4, -5.8, 1.4, 3], [5.4, -5.8, 1.3, 8], [-5.4, 3.0, 1.2, 5], [5.4, 3.0, 1.2, 9]]) put(P.adopt(K.plant(s, seed)), x, 0, z);
  // big ikebana on a stone plinth (between the counter and the painting)
  const plinth = new THREE.Group();
  plinth.add(P.box(0.7, 0.75, 0.7, STONE));
  plinth.add(P.box(0.74, 0.04, 0.74, '#bdb3a2', { y: 0.75 }));
  put2(plinth, ikebana(P, season, 1.1), 0, 0.79, 0);
  put(plinth, -2.9, 0, -3.3);
  // a few stanchion posts leading to the counter (queue line)
  for (const [x, z] of [[-1.6, 0.2], [-1.6, 1.4], [1.6, 1.4]]) g.add(P.cyl(0.025, 0.025, 0.95, '#b8925a', { x, z }, 'metal', 8), P.cyl(0.15, 0.15, 0.03, '#b8925a', { x, z }, 'metal', 14));
  g.add(P.box(0.02, 0.03, 1.2, '#8a2f3b', { x: -1.6, y: 0.88, z: 0.8 }, 'satin'));

  S.commit(); L.commit();
  return K.finalize({
    group: g,
    spawn: K.spot(0, 0, 0),
    slots: {
      counter: K.spot(0, -1.78, 0),
      npc1: K.spot(1.6, -0.35, K.faceYaw({ x: 1.6, z: -0.35 }, { x: 0, z: 0 })),
      phone: null,
    },
    props,
    center: new THREE.Vector3(0, 0, -1.5),
    radius: 8,
  });
}

// ====================================================================== museum pieces
function put2(parent, o, x, y, z, ry = 0) { o.position.set(x, y, z); o.rotation.y = ry; parent.add(o); return o; }

function ikebana(P, season, s = 1) {
  const k = new THREE.Group();
  k.add(P.cyl(0.11 * s, 0.09 * s, 0.22 * s, '#2f3a33', {}, 'gloss', 14));
  const flower = { spring: '#f6c3d2', summer: '#f2f2ee', autumn: '#d9762e', winter: '#c8282e' }[season] || '#c8282e';
  const leaf = season === 'autumn' ? '#b85a2a' : '#3f6a3e';
  const r = K.rng(Math.round(s * 10));
  for (let i = 0; i < 6; i++) {
    const a = r() * 6.28; const len = (0.4 + r() * 0.5) * s;
    const dir = new THREE.Vector3(Math.cos(a) * 0.5, 1, Math.sin(a) * 0.5).normalize();
    const m = P.mesh(new THREE.CylinderGeometry(0.006 * s, 0.01 * s, len, 4), '#4b3b33', {}, 'matte');
    m.position.set(dir.x * len / 2, 0.2 * s + dir.y * len / 2, dir.z * len / 2);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    k.add(m);
    const tip = new THREE.Vector3(dir.x * len, 0.2 * s + dir.y * len, dir.z * len);
    k.add(P.mesh(new THREE.SphereGeometry(0.045 * s, 8, 6), flower, { x: tip.x, y: tip.y, z: tip.z }, 'satin'));
    k.add(P.mesh(new THREE.SphereGeometry(0.05 * s, 6, 4), leaf, { x: tip.x * 0.7, y: tip.y * 0.8, z: tip.z * 0.7 + 0.03 }, 'satin'));
  }
  return k;
}

const paintCache = {};
function paintingMat(season) {
  if (paintCache[season]) return paintCache[season];
  const c = document.createElement('canvas'); c.width = 1024; c.height = 680;
  const g = c.getContext('2d');
  const w = c.width; const h = c.height;
  const r = K.rng(42);
  // dawn sky
  const sky = g.createLinearGradient(0, 0, 0, h * 0.6);
  sky.addColorStop(0, '#9fb6c6'); sky.addColorStop(0.6, '#e9d6b4'); sky.addColorStop(1, '#f2c89a');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(214,90,60,0.9)'; g.beginPath(); g.arc(w * 0.68, h * 0.3, 46, 0, 6.3); g.fill();
  // misty mountain ranges
  const ridge = (y0, amp, col, seed) => {
    const rr = K.rng(seed); g.fillStyle = col; g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w; x += 16) g.lineTo(x, y0 - Math.abs(Math.sin(x * 0.004 + seed) * amp) - rr() * amp * 0.25);
    g.lineTo(w, h); g.closePath(); g.fill();
  };
  ridge(h * 0.5, h * 0.22, 'rgba(110,130,140,0.65)', 3);
  ridge(h * 0.58, h * 0.16, 'rgba(80,105,110,0.75)', 7);
  // lake
  const lake = g.createLinearGradient(0, h * 0.6, 0, h);
  lake.addColorStop(0, '#d9cdb4'); lake.addColorStop(1, '#7f9aa0');
  g.fillStyle = lake; g.fillRect(0, h * 0.62, w, h * 0.38);
  g.strokeStyle = 'rgba(255,240,220,0.45)'; g.lineWidth = 2;
  for (let i = 0; i < 40; i++) { const y = h * (0.64 + r() * 0.34); const x = r() * w; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 20 + r() * 60, y); g.stroke(); }
  g.fillStyle = 'rgba(214,90,60,0.35)'; g.fillRect(w * 0.66, h * 0.64, 14, h * 0.3);
  // pine trees on the left shore (season-tinted)
  const pine = season === 'autumn' ? '#5a3a24' : '#2f4434';
  g.fillStyle = '#4a4434'; g.beginPath(); g.moveTo(0, h * 0.62); g.quadraticCurveTo(w * 0.2, h * 0.58, w * 0.34, h * 0.7); g.lineTo(0, h); g.fill();
  for (let i = 0; i < 4; i++) {
    const x = w * (0.05 + i * 0.07); const y = h * (0.62 - i * 0.02);
    g.strokeStyle = '#3a2a20'; g.lineWidth = 7; g.beginPath(); g.moveTo(x, y + 60); g.quadraticCurveTo(x + 20, y - 40, x + 10, y - 120); g.stroke();
    for (let k = 0; k < 4; k++) { g.fillStyle = pine; g.beginPath(); g.ellipse(x + 10 + (k % 2 ? 30 : -20), y - 40 - k * 28, 48 - k * 6, 14, 0, 0, 6.3); g.fill(); }
  }
  // brush texture
  for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(${r() > 0.5 ? 255 : 60},${r() > 0.5 ? 240 : 50},${r() > 0.5 ? 220 : 40},0.04)`; g.fillRect(r() * w, r() * h, 6 + r() * 14, 2); }
  g.fillStyle = '#b8322a'; g.fillRect(w - 70, h - 90, 34, 34); // seal
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return (paintCache[season] = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.22 }));
}

// ====================================================================== drawings (atlas callbacks)
function txt(g, t, x, y, px, color, weight = 700, align = 'center', maxW = 0) {
  g.font = `${weight} ${px}px ${K.JP_FONT}`;
  g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle';
  if (maxW) while (g.measureText(t).width > maxW && px > 8) g.font = `${weight} ${(px *= 0.93)}px ${K.JP_FONT}`;
  g.fillText(t, x, y);
}

function drawHours(g, w, h) {
  g.fillStyle = '#fbf8f1'; g.fillRect(0, 0, w, h);
  g.fillStyle = GREEN; g.fillRect(0, 0, w, h * 0.13);
  txt(g, 'みどり美術館  ご案内', w / 2, h * 0.065, h * 0.055, '#f4efe4', 800);
  const rows = [
    ['開館時間', '9:30 〜 17:00', 'Hours 9:30–17:00'],
    ['土・日曜日', '9:30 〜 20:00', 'Sat & Sun until 20:00'],
    ['休館日', '月曜日', 'Closed on Mondays'],
    ['カフェ', '11:00 〜 16:30', 'Café 11:00–16:30'],
    ['観覧料', '一般 1,200円', 'Admission ¥1,200'],
  ];
  rows.forEach(([k, v, en], i) => {
    const y = h * (0.21 + i * 0.16);
    txt(g, k, w * 0.07, y, h * 0.042, '#6a5a4a', 800, 'left');
    txt(g, v, w * 0.93, y, h * 0.052, k === '休館日' ? '#8a2f3b' : INK, 800, 'right', w * 0.56);
    txt(g, en, w * 0.93, y + h * 0.055, h * 0.03, '#7a7468', 500, 'right');
    g.strokeStyle = '#d8cdb9'; g.lineWidth = 2; g.beginPath(); g.moveTo(w * 0.06, y + h * 0.09); g.lineTo(w * 0.94, y + h * 0.09); g.stroke();
  });
}

function drawTicket(g, w, h) {
  g.fillStyle = '#f4efe4'; g.fillRect(0, 0, w, h);
  g.fillStyle = GREEN; g.fillRect(0, 0, w * 0.06, h);
  txt(g, 'みどり美術館  観覧券', w * 0.55, h * 0.3, h * 0.2, INK, 800, 'center', w * 0.85);
  txt(g, '一般  1,200円', w * 0.55, h * 0.68, h * 0.22, '#8a2f3b', 800, 'center', w * 0.85);
}

function drawLeaflet(g, w, h, k) {
  const pal = [['#3c5a46', '#e9d6b4'], ['#8a2f3b', '#f4efe4'], ['#2f4a6b', '#e9e1cf'], ['#d8b04a', '#3a3a34'], ['#6a5a8a', '#f2ece0'], ['#c97a5d', '#fbf8f1']][k % 6];
  g.fillStyle = pal[0]; g.fillRect(0, 0, w, h);
  g.fillStyle = pal[1]; g.fillRect(w * 0.08, h * 0.08, w * 0.84, h * 0.5);
  g.fillStyle = pal[0]; g.globalAlpha = 0.6;
  g.beginPath(); g.moveTo(w * 0.08, h * 0.5); g.lineTo(w * 0.35, h * 0.25 + k * 4); g.lineTo(w * 0.6, h * 0.42); g.lineTo(w * 0.92, h * 0.2); g.lineTo(w * 0.92, h * 0.58); g.lineTo(w * 0.08, h * 0.58); g.fill();
  g.beginPath(); g.arc(w * 0.7, h * 0.22, w * 0.08, 0, 6.3); g.fill(); g.globalAlpha = 1;
  txt(g, ['ひかりの風景', 'みどり美術館', '日本の版画', 'こども ワークショップ', 'カフェ メニュー', '年間パスポート'][k % 6], w / 2, h * 0.72, h * 0.08, pal[1], 800, 'center', w * 0.9);
}

function drawPoster(g, w, h) {
  const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, '#1f2f3a'); grd.addColorStop(1, '#3c5a46');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  const sky = g.createLinearGradient(0, h * 0.08, 0, h * 0.55); sky.addColorStop(0, '#e9d6b4'); sky.addColorStop(1, '#f2c89a');
  g.fillStyle = sky; g.fillRect(w * 0.08, h * 0.06, w * 0.84, h * 0.5);
  g.fillStyle = 'rgba(80,105,110,0.85)'; g.beginPath(); g.moveTo(w * 0.08, h * 0.48); g.lineTo(w * 0.3, h * 0.3); g.lineTo(w * 0.5, h * 0.42); g.lineTo(w * 0.72, h * 0.24); g.lineTo(w * 0.92, h * 0.4); g.lineTo(w * 0.92, h * 0.56); g.lineTo(w * 0.08, h * 0.56); g.fill();
  g.fillStyle = 'rgba(214,90,60,0.9)'; g.beginPath(); g.arc(w * 0.68, h * 0.18, w * 0.05, 0, 6.3); g.fill();
  txt(g, '特別展', w / 2, h * 0.63, h * 0.045, '#e9d6b4', 700);
  txt(g, 'ひかりの 風景', w / 2, h * 0.71, h * 0.075, '#fbf8f1', 800, 'center', w * 0.9);
  txt(g, 'Light and Landscape', w / 2, h * 0.78, h * 0.035, '#e9d6b4', 500);
  txt(g, '2026.11.3 – 2027.1.31', w / 2, h * 0.85, h * 0.035, '#fbf8f1', 700);
  txt(g, 'みどり美術館', w / 2, h * 0.93, h * 0.04, '#e9d6b4', 800);
}

function drawBanner(g, w, h) {
  g.fillStyle = '#2f3a33'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#e9d6b4'; g.fillRect(w * 0.08, h * 0.02, w * 0.84, h * 0.006); g.fillRect(w * 0.08, h * 0.972, w * 0.84, h * 0.006);
  txt(g, '特別展', w / 2, h * 0.07, w * 0.2, '#e9d6b4', 700);
  const chars = ['ひ', 'か', 'り', 'の', '風', '景'];
  chars.forEach((c, i) => txt(g, c, w / 2, h * (0.18 + i * 0.112), w * 0.4, '#fbf8f1', 800));
  txt(g, '11.3 – 1.31', w / 2, h * 0.9, w * 0.14, '#e9d6b4', 700);
}

function drawFloorGuide(g, w, h) {
  g.fillStyle = '#fbf8f1'; g.fillRect(0, 0, w, h);
  g.fillStyle = GREEN; g.fillRect(0, 0, w, h * 0.12);
  txt(g, '館内案内  Floor Guide', w / 2, h * 0.06, h * 0.05, '#f4efe4', 800);
  const rows = [['2F', '展示室 B・C', 'Galleries B, C'], ['1F', '受付・展示室 A', 'Reception, Gallery A'], ['1F', 'カフェ・ショップ', 'Café, Shop'], ['B1', 'ロッカー・トイレ', 'Lockers, Restrooms']];
  rows.forEach(([f, ja, en], i) => {
    const y = h * (0.22 + i * 0.2);
    g.fillStyle = i === 0 ? '#c9a074' : '#3c5a46'; K.roundRect(g, w * 0.06, y - h * 0.06, w * 0.18, h * 0.12, 8); g.fill();
    txt(g, f, w * 0.15, y, h * 0.055, '#fff', 800);
    txt(g, ja, w * 0.3, y - h * 0.02, h * 0.05, INK, 800, 'left', w * 0.66);
    txt(g, en, w * 0.3, y + h * 0.04, h * 0.032, '#7a7468', 500, 'left', w * 0.66);
  });
}

function drawSmallPainting(g, w, h, k) {
  g.fillStyle = '#b8925a'; g.fillRect(0, 0, w, h);
  const cols = [['#c9d8e2', '#5a7a8a', '#e8b06a'], ['#efe0c8', '#8a5a3a', '#3c5a46'], ['#e9e1cf', '#c8282e', '#2f3a33']][k % 3];
  g.fillStyle = cols[0]; g.fillRect(w * 0.06, h * 0.06, w * 0.88, h * 0.88);
  g.fillStyle = cols[1]; g.beginPath(); g.ellipse(w * 0.45, h * 0.6, w * 0.3, h * 0.18, 0.3, 0, 6.3); g.fill();
  g.fillStyle = cols[2]; g.beginPath(); g.arc(w * 0.65, h * 0.32, w * 0.12, 0, 6.3); g.fill();
}

function drawClock(g, w, h, hh, mm) {
  const r = w / 2;
  g.fillStyle = '#f7f3ea'; g.beginPath(); g.arc(r, r, r * 0.98, 0, 6.3); g.fill();
  g.strokeStyle = '#2f2a26'; g.lineWidth = r * 0.05; g.beginPath(); g.arc(r, r, r * 0.95, 0, 6.3); g.stroke();
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    txt(g, String(i === 0 ? 12 : i), r + Math.sin(a) * r * 0.72, r - Math.cos(a) * r * 0.72, r * 0.17, '#2f2a26', 700);
  }
  for (let i = 0; i < 60; i++) {
    if (i % 5 === 0) continue;
    const a = i / 60 * Math.PI * 2;
    g.fillStyle = '#7a7468'; g.beginPath(); g.arc(r + Math.sin(a) * r * 0.86, r - Math.cos(a) * r * 0.86, r * 0.012, 0, 6.3); g.fill();
  }
  const hand = (len, wd, a) => { g.strokeStyle = '#2f2a26'; g.lineWidth = wd; g.lineCap = 'round'; g.beginPath(); g.moveTo(r, r); g.lineTo(r + Math.sin(a) * len, r - Math.cos(a) * len); g.stroke(); };
  hand(r * 0.45, r * 0.065, ((hh % 12) + mm / 60) / 12 * Math.PI * 2);
  hand(r * 0.68, r * 0.04, mm / 60 * Math.PI * 2);
  g.fillStyle = '#b8925a'; g.beginPath(); g.arc(r, r, r * 0.05, 0, 6.3); g.fill();
  txt(g, 'MIDORI', r, r * 1.38, r * 0.09, '#7a7468', 500);
}

/** The view through the windows: museum garden at the given time / season / weather. */
function drawOutside(g, w, h, time, season, weather) {
  const cloudy = weather !== 'clear';
  const sky = {
    morning: cloudy ? ['#b9c2cc', '#dfe3e6'] : ['#a9d0ea', '#f2e6d2'],
    noon: cloudy ? ['#b4bec8', '#dde2e6'] : ['#86c0e8', '#dff0fa'],
    evening: cloudy ? ['#4f5d72', '#9a8a86'] : ['#4d6aa6', '#f2b07a'],
    night: ['#0c1424', '#1c2638'],
  }[time] || ['#86c0e8', '#dff0fa'];
  const grd = g.createLinearGradient(0, 0, 0, h * 0.75);
  grd.addColorStop(0, sky[0]); grd.addColorStop(1, sky[1]);
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  const r = K.rng(Math.round(w + h));
  if (cloudy) for (let i = 0; i < 18; i++) { g.fillStyle = `rgba(${time === 'night' ? '40,50,70' : '230,232,236'},0.25)`; g.beginPath(); g.ellipse(r() * w, r() * h * 0.4, 40 + r() * 80, 12 + r() * 16, 0, 0, 6.3); g.fill(); }
  const dusk = time === 'evening' || time === 'night';
  // far buildings + hedge + lawn
  g.fillStyle = dusk ? '#3a4050' : '#9aa6ae'; for (let i = 0; i < 6; i++) g.fillRect(r() * w, h * (0.42 + r() * 0.08), 30 + r() * 50, h);
  g.fillStyle = season === 'winter' ? (dusk ? '#4a4c48' : '#9a9a88') : (dusk ? '#2f3f30' : '#6f9a5c');
  g.fillRect(0, h * 0.68, w, h);
  g.fillStyle = dusk ? '#283228' : '#4f7a46'; g.fillRect(0, h * 0.62, w, h * 0.07);
  // trees
  for (let i = 0; i < 3; i++) {
    const x = w * (0.15 + i * 0.35 + r() * 0.1); const y = h * 0.66;
    g.strokeStyle = dusk ? '#1f1a18' : '#4b3b33'; g.lineWidth = w * 0.025;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - h * 0.25); g.stroke();
    if (season === 'winter') {
      g.lineWidth = w * 0.008;
      for (let k = 0; k < 9; k++) { const a = -Math.PI / 2 + (r() - 0.5) * 2; g.beginPath(); g.moveTo(x, y - h * (0.12 + r() * 0.12)); g.lineTo(x + Math.cos(a) * w * 0.15, y - h * 0.25 + Math.sin(a) * h * 0.12); g.stroke(); }
    } else {
      g.fillStyle = { spring: '#f2bccd', summer: '#4f8a46', autumn: '#d9762e' }[season] || '#4f8a46';
      if (dusk) g.fillStyle = '#3a3438';
      for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(x + (r() - 0.5) * w * 0.2, y - h * (0.28 + r() * 0.1), w * 0.09, 0, 6.3); g.fill(); }
    }
  }
  // lamp posts (lit at dusk)
  for (const fx of [0.3, 0.8]) {
    const x = w * fx;
    g.fillStyle = '#2a2a2a'; g.fillRect(x - 2, h * 0.45, 4, h * 0.25);
    g.fillStyle = dusk ? '#ffe2a0' : '#d9d9d0'; g.beginPath(); g.arc(x, h * 0.45, 7, 0, 6.3); g.fill();
    if (dusk) { const gl = g.createRadialGradient(x, h * 0.45, 2, x, h * 0.45, 40); gl.addColorStop(0, 'rgba(255,220,150,0.5)'); gl.addColorStop(1, 'rgba(255,220,150,0)'); g.fillStyle = gl; g.fillRect(x - 40, h * 0.45 - 40, 80, 80); }
  }
  if (weather === 'rain') { g.strokeStyle = 'rgba(220,230,240,0.35)'; g.lineWidth = 1; for (let i = 0; i < 120; i++) { const x = r() * w; const y = r() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 3, y + 14); g.stroke(); } }
  // reflections on the glass
  g.fillStyle = 'rgba(255,255,255,0.06)'; g.beginPath(); g.moveTo(w * 0.1, 0); g.lineTo(w * 0.3, 0); g.lineTo(w * 0.05, h); g.lineTo(0, h); g.fill();
}

// ====================================================================== shared mini-kit (same as station.js)
function uvPlane(w, h, rx, ry) { // subdivided: one huge triangle pair under the camera breaks depth precision
  const geo = new THREE.PlaneGeometry(w, h, Math.min(40, Math.max(1, Math.ceil(w / 3))), Math.min(40, Math.max(1, Math.ceil(h / 3))));
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * rx, uv.getY(i) * ry);
  return geo;
}

// ---------------------------------------------------------------------- palette + sign atlas
/** Flat colours from one small palette texture: every plain mesh shares a handful of materials. */
function paletteKit() {
  const N = 16; const C = 16;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = N * C;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  const cells = new Map();
  const uvOf = (color) => {
    const key = new THREE.Color(color).getHexString();
    let uv = cells.get(key);
    if (!uv) {
      const i = cells.size;
      if (i >= N * N) throw new Error('palette full');
      const x = i % N; const y = Math.floor(i / N);
      ctx.fillStyle = `#${key}`; ctx.fillRect(x * C, y * C, C, C);
      uv = [(x + 0.5) / N, 1 - (y + 0.5) / N];
      cells.set(key, uv);
      tex.needsUpdate = true;
    }
    return uv;
  };
  const std = (o) => new THREE.MeshStandardMaterial({ map: tex, ...o });
  const mats = {
    matte: std({ roughness: 0.85 }),
    satin: std({ roughness: 0.5 }),
    gloss: std({ roughness: 0.2 }),
    metal: std({ roughness: 0.4, metalness: 0.3 }),
    glow: new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }),
    glass: std({ roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.3, depthWrite: false }),
  };
  for (const [k, m] of Object.entries(mats)) m.name = `palette:${k}`;
  const paintGeo = (geo, color) => {
    const [u, v] = uvOf(color);
    const n = geo.attributes.position.count;
    const a = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { a[i * 2] = u; a[i * 2 + 1] = v; }
    geo.setAttribute('uv', new THREE.BufferAttribute(a, 2));
    return geo;
  };
  const P = {
    mats,
    paint: paintGeo,
    mesh: (geo, color, o = {}, kind = 'matte') => {
      const m = K.mesh(paintGeo(geo, color), mats[kind], o);
      if (kind === 'glass' || kind === 'glow') m.castShadow = false;
      return m;
    },
    box: (w, h, d, color, o = {}, kind) => P.mesh(new THREE.BoxGeometry(w, h, d), color, { ...o, y: (o.y ?? 0) + h / 2 }, kind),
    rbox: (w, h, d, r, color, o = {}, kind, seg = 1) => P.mesh(new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2)), color, { ...o, y: (o.y ?? 0) + h / 2 }, kind),
    cyl: (rt, rb, h, color, o = {}, kind, seg = 16) => P.mesh(new THREE.CylinderGeometry(rt, rb, h, seg), color, { ...o, y: (o.y ?? 0) + h / 2 }, kind),
    /** Move meshes built with the kit helpers (K.plant, K.chair …) onto the palette. */
    adopt(obj) {
      obj.traverse((m) => {
        if (!m.isMesh || !m.material?.isMeshStandardMaterial || m.material.map || m.material.transparent) return;
        const mt = m.material;
        const kind = mt.metalness > 0.4 ? 'metal' : mt.roughness < 0.35 ? 'gloss' : mt.roughness < 0.65 ? 'satin' : 'matte';
        m.geometry = paintGeo(m.geometry.clone(), `#${mt.color.getHexString()}`);
        m.material = mats[kind];
      });
      return obj;
    },
  };
  return P;
}

/**
 * Sign atlas: signs and drawings are packed into shared 1024² canvases (one material per page),
 * so dozens of signs cost one or two draw calls. lit = back-lit (MeshBasic, not tone-mapped).
 * draw()/sign() return planes facing +z; call commit() once before K.finalize.
 */
function signKit(lit) {
  const SIZE = 1024; const PAD = 8;
  const reqs = [];
  const kit = {
    draw(w, h, ppm, fn) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h));
      m.castShadow = false; m.receiveShadow = !lit;
      let pw = Math.round(w * ppm); let ph = Math.round(h * ppm);
      const k = Math.min(1, (SIZE - 2 * PAD) / pw, (SIZE - 2 * PAD) / ph);
      pw = Math.max(8, Math.floor(pw * k)); ph = Math.max(8, Math.floor(ph * k));
      reqs.push({ m, pw, ph, fn });
      return m;
    },
    sign(lines, w, h, opts = {}) { return kit.draw(w, h, opts.ppm ?? 300, (g, cw, ch) => textBlock(g, cw, ch, lines, opts)); },
    commit() {
      reqs.sort((a, b) => b.ph - a.ph);
      let page = null; let x = 0; let y = 0; let rowH = 0;
      const newPage = () => {
        const c = document.createElement('canvas'); c.width = c.height = SIZE;
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
        const mat = lit ? new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, alphaTest: 0.5 })
          : new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, alphaTest: 0.5 });
        mat.name = `atlas:${lit ? 'lit' : 'std'}`;
        page = { g: c.getContext('2d'), tex, mat };
        x = PAD; y = PAD; rowH = 0;
      };
      for (const r of reqs) {
        if (!page) newPage();
        if (x + r.pw + PAD > SIZE) { x = PAD; y += rowH + PAD; rowH = 0; }
        if (y + r.ph + PAD > SIZE) newPage();
        const pg = page.g;
        pg.save(); pg.beginPath(); pg.rect(x, y, r.pw, r.ph); pg.clip(); pg.translate(x, y);
        r.fn(pg, r.pw, r.ph);
        pg.restore();
        const uv = r.m.geometry.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, (x + uv.getX(i) * r.pw) / SIZE, 1 - (y + (1 - uv.getY(i)) * r.ph) / SIZE);
        uv.needsUpdate = true;
        r.m.material = page.mat;
        page.tex.needsUpdate = true;
        x += r.pw + PAD; rowH = Math.max(rowH, r.ph);
      }
      reqs.length = 0;
    },
  };
  return kit;
}

/** Same layout rules as K.sign, drawn into an atlas cell. */
function textBlock(g, cw, ch, lines, opts = {}) {
  const r = (opts.radius ?? 0.08) * Math.min(cw, ch);
  if (opts.bg !== null) {
    g.fillStyle = opts.bg ?? '#ffffff';
    K.roundRect(g, 0, 0, cw, ch, r); g.fill();
    if (opts.border) {
      g.strokeStyle = opts.border; g.lineWidth = Math.max(4, ch * 0.05);
      K.roundRect(g, g.lineWidth / 2, g.lineWidth / 2, cw - g.lineWidth, ch - g.lineWidth, r); g.stroke();
    }
  }
  const arr = Array.isArray(lines) ? lines : [lines];
  const size = (opts.size ?? 0.5) * ch / Math.max(1, arr.length * 0.9);
  g.textBaseline = 'middle';
  g.textAlign = opts.align ?? 'center';
  arr.forEach((line, i) => {
    const l = typeof line === 'string' ? { t: line } : line;
    let s = size * (l.scale ?? 1);
    const font = () => `${l.weight ?? opts.weight ?? 700} ${s}px ${K.JP_FONT}`;
    g.font = font();
    g.fillStyle = l.color ?? opts.fg ?? '#333333';
    const x = g.textAlign === 'left' ? cw * 0.06 : g.textAlign === 'right' ? cw * 0.94 : cw / 2;
    const y = ch * (i + 0.5) / arr.length;
    while (g.measureText(l.t).width > cw * 0.92 && s > 8) { s *= 0.92; g.font = font(); }
    g.fillText(l.t, x, y);
  });
}
