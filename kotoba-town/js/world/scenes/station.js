// station — ことばまち駅, a small suburban commuter station on the みどり line.
// The learner stands in the concourse (改札外): ticket machines on the left, the staff window with
// 岡田 and the automatic gates (自動改札) ahead, platform 1 behind the gates where the 急行 for うみの
// stands with its doors open, platform 2 (普通 みどりの方面) across the tracks, and on the right the
// open station front with the bus stop and the shops in front of the station
// (bank – post office – supermarket, left to right as seen from the station).
// Learner stands at the origin looking toward -z.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as K from '../kit.js';

export const meta = { indoor: false, ambience: 'station' };

const LINE = '#2f9a62';      // みどり line colour
const NAVY = '#203250';
const YELLOW = '#f2c230';

export default function build({ setup }) {
  const time = setup.time || 'morning';
  const season = setup.season || 'spring';
  const rain = setup.weather === 'rain';
  const night = time === 'night';
  const lampsOn = night || time === 'evening';
  const H = { morning: 9, noon: 12, evening: 17, night: 20 }[time] ?? 9;
  const hm = (h, m) => `${h}:${String(m).padStart(2, '0')}`;

  const g = new THREE.Group();
  const P = paletteKit();
  const S = signKit(false); // printed signs, lit by the scene
  const L = signKit(true);  // back-lit / LED signs
  const props = {};
  const put = (o, x = 0, y = 0, z = 0, ry = 0, parent = g) => { o.position.set(x, y, z); o.rotation.y = ry; parent.add(o); return o; };
  const both = (kit, lines, w, h, opts, x, y, z, ry = 0, parent = g) => { // double-sided hanging sign
    put(kit.sign(lines, w, h, opts), x, y, z + 0.006 * Math.cos(ry), ry, parent);
    put(kit.sign(lines, w, h, opts), x, y, z - 0.006 * Math.cos(ry), ry + Math.PI, parent);
  };

  // ------------------------------------------------------------------ ground
  const tileMat = K.mat('#ffffff', { map: K.tileTex('#e6e2d9', '#dcd7cc', 4, [1, 1], '#c9c2b5'), rough: rain ? 0.3 : 0.55 });
  g.add(K.mesh(uvPlane(5.3, 5.45, 5.3 / 1.2, 5.45 / 1.2), tileMat, { x: 1.35, z: 0.675, rx: -Math.PI / 2, cast: false }));
  const platMat = K.mat('#ffffff', { map: K.noiseTex('#b4b1aa', 0.12, [1, 1], 'plat'), rough: rain ? 0.25 : 0.8 });
  g.add(K.mesh(uvPlane(75, 4.15, 75 / 3, 4.15 / 3), platMat, { x: 7.5, z: -4.125, rx: -Math.PI / 2, cast: false }));
  g.add(K.mesh(uvPlane(75, 3.4, 75 / 3, 3.4 / 3), platMat, { x: 7.5, z: -14.8, rx: -Math.PI / 2, cast: false }));
  const ballast = K.mat('#ffffff', { map: K.noiseTex('#8d887e', 0.35, [1, 1], 'ballast'), rough: 1 });
  g.add(K.mesh(uvPlane(130, 7.0, 130 / 2, 7 / 2), ballast, { x: 10, y: -1.25, z: -9.65, rx: -Math.PI / 2, cast: false }));
  const asphalt = K.mat('#ffffff', { map: K.noiseTex('#6f7276', 0.14, [1, 1], 'asph'), rough: rain ? 0.18 : 0.9, metal: rain ? 0.15 : 0 });
  g.add(K.mesh(uvPlane(76, 64, 19, 16), asphalt, { x: 42, y: -0.02, z: 28.75, rx: -Math.PI / 2, cast: false }));   // square + streets
  const ground = K.mat('#ffffff', { map: K.noiseTex('#8f8a7c', 0.18, [1, 1], 'ground'), rough: 1 });
  g.add(K.mesh(uvPlane(160, 84, 40, 21), ground, { x: 0, y: -0.03, z: -58.4, rx: -Math.PI / 2, cast: false }));  // behind platform 2
  g.add(K.mesh(uvPlane(76, 62, 19, 16), ground, { x: -34, y: -0.03, z: 29, rx: -Math.PI / 2, cast: false }));    // behind the station
  const pave = K.mat('#ffffff', { map: K.tileTex('#c9c3b8', '#bdb6aa', 4, [1, 1], '#a39b8e'), rough: rain ? 0.22 : 0.75 });
  g.add(K.mesh(uvPlane(4, 16, 4 / 1.6, 16 / 1.6), pave, { x: 6, y: 0.002, z: 4.8, rx: -Math.PI / 2, cast: false }));   // station-front sidewalk
  g.add(K.mesh(uvPlane(3, 22, 3 / 1.6, 22 / 1.6), pave, { x: 15.5, y: 0.002, z: 2.5, rx: -Math.PI / 2, cast: false })); // shop-side sidewalk
  g.add(P.box(0.15, 0.12, 16, '#bdb8ae', { x: 8.0, y: -0.02, z: 4.8 }));   // kerbs
  g.add(P.box(0.15, 0.12, 22, '#bdb8ae', { x: 14.0, y: -0.02, z: 2.5 }));
  // zebra crossing + road lines
  for (let i = 0; i < 7; i++) g.add(P.box(5.8, 0.01, 0.45, '#e9e8e2', { x: 11, y: 0.0, z: 6.6 + i * 0.9 }, 'satin'));
  g.add(P.box(0.15, 0.01, 12, '#e9e8e2', { x: 11, y: 0.0, z: -2.0 }, 'satin'));
  if (rain) for (const [x, z, s] of [[9.5, 1.5, 1.6], [12.2, -1.2, 1.1], [5.2, 4.0, 0.9], [10.6, 9.5, 1.4]]) {
    g.add(P.mesh(new THREE.CircleGeometry(s, 20), '#4f5a66', { x, y: 0.006, z, rx: -Math.PI / 2, cast: false }, 'gloss'));
  }

  // tactile paving (点字ブロック): concourse guide line + platform edge lines
  const tDot = K.mat('#ffffff', { map: tactileTex('dot'), rough: 0.6 });
  const tBar = K.mat('#ffffff', { map: tactileTex('bar'), rough: 0.6 });
  const strip = (x0, z0, x1, z1, m) => {
    const lx = Math.abs(x1 - x0) || 0.3; const lz = Math.abs(z1 - z0) || 0.3;
    const along = lx >= lz;
    const geo = uvPlane(lx, lz, along ? lx / 0.3 : 1, along ? 1 : lz / 0.3);
    if (!along) { // rotate uv so the bars run along the strip
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) { const u = uv.getX(i); uv.setXY(i, uv.getY(i), u * lz / 0.3); }
    }
    g.add(K.mesh(geo, m, { x: (x0 + x1) / 2, y: 0.006, z: (z0 + z1) / 2, rx: -Math.PI / 2, cast: false }));
  };
  strip(-0.55, 1.75, 4.0, 2.05, tBar);      // from the entrance …
  strip(-0.7, -1.6, -0.4, 1.75, tBar);       // … to the staff window gate
  strip(-0.7, -1.9, -0.4, -1.6, tDot);
  strip(-0.85, 1.75, -0.55, 2.05, tDot);     // … and the ticket machines
  strip(-30, -5.62, 45, -5.32, tDot);         // platform 1 edge warning line
  strip(-30, -5.32, 45, -5.24, tBar);         // 内方線 (inner line)
  strip(-30, -13.38, 45, -13.68, tDot);       // platform 2
  strip(-30, -13.76, 45, -13.68, tBar);
  // platform edges: white coping + edge faces
  for (const [z, s] of [[-6.2, 1], [-13.1, -1]]) {
    g.add(P.box(75, 0.02, 0.3, '#eeece4', { x: 7.5, y: 0, z: z + s * 0.15 }, 'satin'));
    g.add(P.box(75, 0.04, 0.06, YELLOW, { x: 7.5, y: -0.02, z: z + s * 0.5 }, 'satin'));
    g.add(P.box(75, 1.25, 0.3, '#8c8984', { x: 7.5, y: -1.25, z: z + s * 0.15 }));
  }

  // ------------------------------------------------------------------ tracks + overhead line
  for (const tz of [-7.65, -11.65]) {
    for (const s of [-0.53, 0.53]) g.add(P.box(130, 0.15, 0.07, '#7d7770', { x: 10, y: -1.25, z: tz + s }, 'metal'));
    for (let x = -40; x < 66; x += 0.75) g.add(P.box(0.22, 0.08, 2.0, '#a39f97', { x, y: -1.27, z: tz }));
  }
  for (const x of [-16, 16, 48]) {
    g.add(P.box(0.25, 6.0, 0.25, '#8f9497', { x, y: -1.25, z: -9.65 }, 'metal'));
    g.add(P.box(0.12, 0.12, 6.0, '#8f9497', { x, y: 4.55, z: -9.65 }, 'metal'));
  }
  for (const tz of [-7.65, -11.65]) {
    g.add(P.box(130, 0.018, 0.018, '#3b3b3b', { x: 10, y: 4.15, z: tz }, 'metal'));
    g.add(P.box(130, 0.012, 0.012, '#3b3b3b', { x: 10, y: 4.55, z: tz }, 'metal'));
  }

  // ------------------------------------------------------------------ station building (concourse)
  const wallC = '#eee8dc'; const wallLow = '#d9d2c4';
  g.add(P.box(0.2, 3.2, 6.7, wallC, { x: -1.4, z: 0.15 }));                  // left wall (machines + staff window)
  g.add(P.box(5.6, 3.2, 0.2, wallC, { x: 1.3, z: 3.5 }));                     // back wall
  g.add(P.box(5.6, 0.12, 0.2, wallLow, { x: 1.3, z: 3.39 }));                 // skirting
  g.add(P.box(5.7, 0.3, 6.2, '#dcd8cf', { x: 1.3, y: 3.2, z: 0.6 }, 'glow'));  // ceiling slab (self-lit: the roof shades it)
  g.add(P.box(6.4, 0.25, 6.6, '#7b7f86', { x: 1.6, y: 3.5, z: 0.6 }));         // roof
  g.add(P.box(2.4, 0.3, 6.6, '#c9c2b4', { x: 5.2, y: 2.95, z: 0.6 }));        // entrance canopy
  for (const z of [-2.0, 0.7, 3.35]) g.add(P.box(0.3, 3.1, 0.3, '#d8d0c0', { x: 4.05, z }));
  g.add(P.box(0.3, 0.55, 6.6, '#cfc7b8', { x: 4.05, y: 2.65, z: 0.6 }));      // lintel over the entrance
  for (let x = -0.6; x <= 3.4; x += 1.35) for (const z of [-1.0, 0.8, 2.6]) g.add(P.box(1.1, 0.03, 0.22, '#fffaf0', { x, y: 3.03, z }, 'glow'));
  const fill = new THREE.PointLight('#fff1dc', lampsOn ? 9 : 6, 11, 1.4);
  fill.position.set(1.2, 2.8, 0.2);
  g.add(fill);
  // station name over the entrance (outside)
  put(L.sign([{ t: 'ことばまち駅', scale: 1 }, { t: 'KOTOBAMACHI STATION', scale: 0.42, weight: 500 }], 3.4, 0.6, { bg: '#fbfaf5', fg: NAVY, radius: 0.04 }), 4.22, 3.55, 0.7, Math.PI / 2);
  g.add(P.box(0.1, 0.12, 3.5, LINE, { x: 4.21, y: 3.17, z: 0.7 }));
  // header over the gates (concourse side)
  g.add(P.box(5.5, 0.55, 0.25, '#e7e1d5', { x: 1.3, y: 2.65, z: -2.1 }));
  put(L.sign([{ t: 'のりば  Platforms  ↑', scale: 0.9 }], 1.7, 0.3, { bg: NAVY, fg: '#ffffff', radius: 0.06 }), 0.2, 2.92, -1.96);
  put(L.sign([{ t: '出口  Exit  →', scale: 0.9 }], 1.25, 0.3, { bg: YELLOW, fg: '#222222', radius: 0.06 }), 2.75, 2.92, -1.96);
  // hanging exit sign inside, seen from the back
  both(L, [{ t: '← 出口  Exit', scale: 0.9 }], 1.2, 0.28, { bg: YELLOW, fg: '#222' }, 2.6, 2.55, 1.3);
  g.add(P.box(0.02, 0.5, 0.02, '#888', { x: 2.2, y: 2.7, z: 1.3 }, 'metal'));
  g.add(P.box(0.02, 0.5, 0.02, '#888', { x: 3.0, y: 2.7, z: 1.3 }, 'metal'));

  // ---- staff window (駅係員) in the left wall, ahead-left, with the route map above
  const booth = new THREE.Group();
  put(booth, -1.3, 0, -2.2);
  booth.add(P.box(0.25, 0.95, 1.7, '#d9d2c4', { x: 0.02 }));
  booth.add(P.box(0.4, 0.05, 1.75, '#b58e62', { x: 0.1, y: 0.95 }, 'satin')); // counter ledge
  booth.add(P.box(0.03, 1.05, 1.6, '#cfe0e6', { x: 0.05, y: 1.0 }, 'glass'));
  for (const z of [-0.82, 0, 0.82]) booth.add(P.box(0.06, 1.05, 0.05, '#9aa0a6', { x: 0.06, y: 1.0, z }, 'metal'));
  booth.add(P.box(0.06, 0.05, 1.7, '#9aa0a6', { x: 0.06, y: 2.03, z: 0 }, 'metal'));
  booth.add(P.box(0.14, 0.04, 0.12, '#2f6db3', { x: 0.22, y: 0.98, z: 0.55 }, 'satin'));         // IC reader
  booth.add(P.box(0.2, 0.03, 0.3, '#e9e6de', { x: 0.2, y: 0.98, z: -0.2 }, 'satin'));            // tray
  put(L.sign([{ t: '駅係員  Station Staff', scale: 0.8 }], 1.45, 0.24, { bg: '#2c3e5c', fg: '#ffffff', radius: 0.05 }), 0.12, 2.22, 0, Math.PI / 2, booth);
  put(S.sign([{ t: 'のりこし精算', scale: 0.8 }, { t: 'Fare Adjustment', scale: 0.55, weight: 500 }], 0.5, 0.2, { bg: '#ffffff', fg: '#333', radius: 0.06 }), 0.075, 1.75, 0.45, Math.PI / 2, booth);
  // booth interior (seen through the glass)
  booth.add(P.box(1.8, 0.02, 1.8, '#8c8f88', { x: -0.95 }));
  booth.add(P.box(0.6, 0.75, 1.5, '#c8c3b8', { x: -0.45 }));
  booth.add(P.box(0.08, 0.3, 0.45, '#2b2e33', { x: -0.55, y: 0.75, z: -0.3 }, 'satin'));
  booth.add(P.box(0.02, 0.26, 0.4, '#9fc4e8', { x: -0.505, y: 0.77, z: -0.3 }, 'glow'));
  booth.add(P.box(0.06, 1.4, 1.6, '#b9c4c9', { x: -1.75, y: 0.6 }));
  booth.add(P.box(0.06, 0.6, 0.9, '#f6f4ee', { x: -1.7, y: 1.2, z: 0.2 }));
  booth.add(P.box(1.0, 0.03, 0.4, '#fffaf0', { x: -0.9, y: 2.3 }, 'glow'));
  booth.add(P.cyl(0.13, 0.15, 0.08, NAVY, { x: -1.6, y: 1.55, z: -0.5 }, 'satin'));             // a cap on the shelf
  booth.add(P.box(0.25, 0.03, 0.6, '#9a7b55', { x: -1.62, y: 1.5, z: -0.4 }));
  // route map (路線図) above the staff window — next to 岡田
  const routeMap = S.draw(1.7, 0.78, 300, drawRouteMap);
  const routeMapG = new THREE.Group();
  routeMapG.add(P.box(0.05, 0.86, 1.78, '#5a5f66', { x: -0.03, y: -0.43 }, 'metal'));
  put(routeMap, 0.0, 0, 0, Math.PI / 2, routeMapG);
  put(routeMapG, -1.27, 2.62, -1.25);
  props.route_map = K.prop('route_map', routeMapG, { labelJa: 'ろせんず', labelEn: 'route map' });
  // fare chart above the ticket machines
  put(S.draw(2.6, 0.62, 260, drawFareChart), -1.28, 2.55, 0.55, Math.PI / 2);
  put(L.sign([{ t: 'きっぷうりば   Tickets', scale: 0.85 }], 1.6, 0.26, { bg: '#2c3e5c', fg: '#ffffff', radius: 0.05 }), -1.27, 2.08, 0.55, Math.PI / 2);

  // ---- ticket machines (券売機), within reach on the left
  const machines = [];
  for (const [i, z] of [[0, -0.25], [1, 0.6], [2, 1.45]]) {
    const m = ticketMachine(P, L, i);
    put(m, -1.3, 0, z, Math.PI / 2);
    machines.push(m);
  }
  props.ticket_machine = K.prop('ticket_machine', machines[0], { labelJa: 'けんばいき', labelEn: 'ticket machine' });
  // fire extinguisher box
  g.add(P.box(0.06, 0.5, 0.3, '#c8322b', { x: -1.27, y: 0.12, z: 2.4 }, 'satin'));
  put(L.sign(['消火器'], 0.3, 0.1, { bg: '#c8322b', fg: '#fff' }), -1.235, 0.75, 2.4, Math.PI / 2);

  // ---- automatic ticket gates (自動改札機)
  const gateXs = [-0.85, -0.2, 0.45, 1.1, 1.75, 2.4, 3.05];
  const gateNear = new THREE.Group(); const gateFar = new THREE.Group();
  g.add(gateNear, gateFar);
  gateXs.forEach((x, i) => {
    const gc = gateCabinet(P, L, i);
    put(gc, x, 0, -2.53, 0, i < 3 ? gateNear : gateFar);
  });
  // manned-aisle swing door
  g.add(P.box(0.45, 0.75, 0.04, '#c9ccd0', { x: -1.1, y: 0.1, z: -2.3 }, 'metal'));
  // glass partition from the gates to the station front
  g.add(P.box(0.9, 1.1, 0.06, '#c0c4c8', { x: 3.6, z: -2.53 }, 'metal'));
  g.add(P.box(0.9, 0.9, 0.03, '#cfe0e6', { x: 3.6, y: 1.1, z: -2.53 }, 'glass'));
  props.ticket_gate = K.prop('ticket_gate', gateNear, { labelJa: 'かいさつ', labelEn: 'ticket gate' });

  // ---- bench (near, right of the learner, facing the gates)
  const bench = stationBench(P);
  put(bench, 0.95, 0, 0.42);
  props.bench = K.prop('bench', bench, { labelJa: 'ベンチ', labelEn: 'bench' });

  // ---- back wall: coin lockers, posters, area map
  const lockers = new THREE.Group();
  lockers.add(P.box(1.6, 1.85, 0.5, '#a9b6c4', { z: 0 }, 'satin'));
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    lockers.add(P.box(0.36, 0.42, 0.02, r === 0 ? '#8fa2b6' : '#c4d0dc', { x: -0.585 + c * 0.39, y: 0.08 + r * 0.44, z: -0.26 }, 'satin'));
    lockers.add(P.box(0.04, 0.06, 0.02, '#e2b33c', { x: -0.47 + c * 0.39, y: 0.3 + r * 0.44, z: -0.275 }, 'metal'));
  }
  put(L.sign(['コインロッカー  Coin Lockers'], 1.5, 0.2, { bg: '#2c3e5c', fg: '#fff' }), 0, 2.02, -0.25, Math.PI, lockers);
  put(lockers, -0.45, 0, 3.15);
  const seasonPoster = {
    spring: [['さくらまつり', '#d9487a'], ['4/1〜4/10  さくらこうえん', '#7a4a5a'], ['みどりの駅から 3番バス', '#555']],
    summer: [['はなび大会', '#2a4f9e'], ['8/15  かわべ公園', '#3a3a5a'], ['うみの方面 急行で 20分', '#555']],
    autumn: [['もみじまつり', '#c4541c'], ['11/3〜11/23  みどりの山', '#6a4a2a'], ['みどりの駅から バス', '#555']],
    winter: [['イルミネーション', '#2d3f7a'], ['12/1〜12/25  うみの駅前', '#3a3a5a'], ['急行で 25分', '#555']],
  }[season] || [];
  put(S.draw(0.73, 1.03, 300, (c, w, h) => drawPoster(c, w, h, season, seasonPoster)), 1.05, 1.5, 3.36, Math.PI);
  put(S.draw(0.73, 1.03, 300, (c, w, h) => drawMuseumPoster(c, w, h)), 1.95, 1.5, 3.36, Math.PI);
  g.add(P.box(1.9, 1.15, 0.03, '#8b7356', { x: 1.5, y: 0.94, z: 3.395 }, 'satin'));
  const areaMap = S.draw(1.15, 0.95, 300, drawAreaMap);
  put(areaMap, 3.2, 1.55, 3.37, Math.PI);
  g.add(P.box(1.25, 1.05, 0.04, '#5a5f66', { x: 3.2, y: 1.03, z: 3.4 }, 'metal'));
  // a small newsstand counter (売店) by the lockers
  g.add(P.box(0.9, 1.0, 0.45, '#c86b3c', { x: -0.8, z: 2.45 }, 'satin'));
  for (let i = 0; i < 6; i++) g.add(P.box(0.13, 0.18, 0.02, ['#e8d24a', '#4a8fd8', '#e85a5a', '#68b86a', '#f2f2ee', '#d88a3a'][i], { x: -1.15 + i * 0.14, y: 0.55, z: 2.22, rx: -0.15 }, 'satin'));
  g.add(P.box(0.9, 0.04, 0.5, '#e9e4da', { x: -0.8, y: 1.0, z: 2.45 }, 'satin'));
  for (let i = 0; i < 5; i++) g.add(P.cyl(0.03, 0.03, 0.2, ['#2f8f5b', '#e8a33c', '#f2f2ee', '#c0392b', '#5d8fd0'][i], { x: -1.1 + i * 0.15, y: 1.04, z: 2.5 }, 'gloss', 8));
  put(L.sign(['売店'], 0.5, 0.18, { bg: '#c86b3c', fg: '#fff' }), -0.8, 1.2, 2.21, Math.PI);
  // trash bins (分別ごみ箱) beside the gates, concourse side
  binSet(P, S, g, 3.55, -1.6, Math.PI);
  if (rain) { // wet-floor A-frame + umbrella stand at the entrance
    const af = new THREE.Group();
    af.add(P.box(0.4, 0.6, 0.03, YELLOW, { z: 0.08, rx: -0.12 }, 'satin'));
    af.add(P.box(0.4, 0.6, 0.03, YELLOW, { z: -0.08, rx: 0.12 }, 'satin'));
    put(S.sign(['足もとに', 'ご注意ください'], 0.34, 0.24, { bg: YELLOW, fg: '#222' }), 0, 0.38, 0.12, 0, af);
    put(af, 3.4, 0, 1.6, -Math.PI / 2);
    g.add(P.cyl(0.18, 0.18, 0.5, '#9aa0a6', { x: 3.6, z: 2.9 }, 'metal'));
    for (let i = 0; i < 5; i++) g.add(P.cyl(0.015, 0.03, 0.85, ['#2f6db3', '#c0392b', '#333', '#e8a33c', '#7f9f7a'][i], { x: 3.55 + (i % 3) * 0.06, z: 2.85 + (i % 2) * 0.08, rz: 0.1 - i * 0.05 }, 'satin', 8));
  }

  // ------------------------------------------------------------------ platform 1 (behind the gates)
  // roof
  g.add(P.box(52, 0.14, 4.6, '#c4c2bb', { x: 5, y: 3.5, z: -4.3 }, 'glow'));
  g.add(P.box(52, 0.35, 0.1, '#5e6a74', { x: 5, y: 3.35, z: -6.6 }, 'satin'));
  for (const x of [-9, 6.5, 22]) {
    g.add(P.box(0.22, 3.5, 0.22, '#c9c4b6', { x, z: -4.2 }, 'satin'));
    g.add(P.box(0.15, 0.25, 4.4, '#c9c4b6', { x, y: 3.25, z: -4.3 }, 'satin'));
  }
  for (let x = -18; x <= 28; x += 3.2) g.add(P.box(1.2, 0.05, 0.12, lampsOn ? '#fffbe8' : '#f4f1e6', { x, y: 3.42, z: -4.9 }, 'glow'));
  // departure board (発車標) hanging behind the gates
  const board = new THREE.Group();
  board.add(P.box(2.6, 0.95, 0.14, '#2a2c30', { y: -0.95 }, 'satin'));
  board.add(P.box(0.04, 0.3, 0.04, '#777', { x: -1.0, y: -0.05 }, 'metal'));
  put(L.draw(2.48, 0.72, 320, (c, w, h) => drawDepartures(c, w, h, H)), 0, -0.43, 0.075, 0, board);
  const ticker = tickerStrip(2.48, 0.13, H);
  put(ticker.mesh, 0, -0.865, 0.075, 0, board);
  put(L.draw(2.48, 0.72, 320, (c, w, h) => drawDepartures(c, w, h, H)), 0, -0.43, -0.075, Math.PI, board);
  board.add(P.box(0.04, 0.3, 0.04, '#777', { x: 1.0, y: -0.05 }, 'metal'));
  put(board, 0.9, 3.27, -3.55);
  props.departure_board = K.prop('departure_board', board, { labelJa: 'じこくひょう', labelEn: 'departure board' });
  // station clock (hanging, double-sided)
  const clk = new THREE.Group();
  clk.add(P.cyl(0.27, 0.27, 0.1, '#30343a', { rx: Math.PI / 2, y: 0, z: -0.05 }, 'satin', 28));
  const face = () => S.draw(0.5, 0.5, 400, (c, w, h) => drawClock(c, w, h, H, 28));
  put(face(), 0, 0, 0.056, 0, clk);
  put(face(), 0, 0, -0.056, Math.PI, clk);
  clk.add(P.box(0.03, 0.6, 0.03, '#777', { y: 0.27 }, 'metal'));
  put(clk, -1.15, 2.72, -3.55);
  props.clock = K.prop('clock', clk, { labelJa: 'とけい', labelEn: 'clock' });
  // のりば sign for platform 1 (hanging above the express)
  const pSign2 = new THREE.Group();
  const ps2 = () => L.draw(1.9, 0.42, 320, (c, w, h) => drawNoriba(c, w, h, 1, '急行・普通', 'うみの 方面', '#d8473a'));
  put(ps2(), 0, 0, 0.012, 0, pSign2); put(ps2(), 0, 0, -0.012, Math.PI, pSign2);
  pSign2.add(P.box(1.98, 0.5, 0.02, '#5a5f66', { y: -0.25 }, 'metal'));
  for (const x of [-0.8, 0.8]) pSign2.add(P.box(0.025, 0.85, 0.025, '#777', { x, y: 0.2 }, 'metal'));
  put(pSign2, 4.6, 2.62, -4.9);
  props.platform_sign_2 = K.prop('platform_sign_2', pSign2, { labelJa: '1ばんせん', labelEn: 'platform 1 sign' });
  // direction sign to platform 2 (footbridge)
  both(L, [{ t: '2番線 のりば  Track 2  →', scale: 0.9 }], 1.6, 0.26, { bg: NAVY, fg: '#fff' }, 9.4, 2.7, -4.0);
  // platform 1 bench, stop marker, bins, vending machine, 駅名標
  const pb = stationBench(P, '#3f7fbf'); put(pb, -3.2, 0, -3.9, 0);
  const pb2 = stationBench(P, '#3f7fbf'); put(pb2, 13, 0, -3.6, 0);
  binSet(P, S, g, 8.2, -3.3, 0);
  const st1 = stationNameBoard(S, P); put(st1, -6.0, 0, -3.25, 0);
  const st1b = stationNameBoard(S, P); put(st1b, 17.0, 0, -3.25, 0);
  const stop = new THREE.Group(); // 停止位置目標 "8"
  stop.add(P.box(0.05, 1.3, 0.05, '#777', {}, 'metal'));
  put(S.sign(['8'], 0.3, 0.3, { bg: '#ffffff', fg: '#d8473a', border: '#d8473a', radius: 0.2 }), 0, 1.45, 0.03, 0, stop);
  put(stop, 2.4, 0, -5.9);
  // door-position marks on the platform floor (乗車位置)
  for (const x of [5.7, 10.5, 15.4, 20.2, 25.6]) put(S.sign([{ t: '△ 急行 8両', scale: 0.75 }], 0.5, 0.22, { bg: '#e9e6dc', fg: '#d8473a', radius: 0.1 }), x, 0.008, -4.95, 0).rotation.set(-Math.PI / 2, 0, 0);

  // ------------------------------------------------------------------ the express (急行 うみの) on track 1
  const dest = destinationTex('急行', 'うみの', 'Express', 'Umino', '#ff4b3a');
  const express = new THREE.Group();
  const doorsL = new THREE.Group(); const doorsR = new THREE.Group();
  express.add(doorsL, doorsR);
  const NOSE = 2.2;
  for (let c = 0; c < 3; c++) {
    const car = trainCar(P, { len: 20, cab: c === 0, livery: LINE, accent: '#f08c2e', dest, open: true, leaves: [doorsL, doorsR] });
    put(car, NOSE + 0.6 + c * 20.3, 0, 0, 0, express);
  }
  // the train prop is the leading car's front half (that is what the learner looks at)
  const trainProp = express.children.find((c) => c.userData.cab);
  put(express, 0, 0, -7.65);
  mergeDynamic(doorsL); mergeDynamic(doorsR);
  props.train = K.prop('train', trainProp.userData.front, { labelJa: 'でんしゃ（きゅうこう）', labelEn: 'train (express)' });

  // ------------------------------------------------------------------ platform 2 (across the tracks)
  g.add(P.box(48, 0.14, 3.9, '#c4c2bb', { x: 2, y: 3.4, z: -14.9 }, 'glow'));
  g.add(P.box(48, 0.3, 0.1, '#5e6a74', { x: 2, y: 3.28, z: -12.95 }, 'satin'));
  for (const x of [-14, -5.5, 3, 11.5, 20]) {
    g.add(P.box(0.22, 3.4, 0.22, '#c9c4b6', { x, z: -15.6 }, 'satin'));
    g.add(P.box(0.15, 0.25, 3.7, '#c9c4b6', { x, y: 3.15, z: -14.9 }, 'satin'));
  }
  for (let x = -16; x <= 22; x += 3.2) g.add(P.box(1.2, 0.05, 0.12, '#fffbe8', { x, y: 3.32, z: -14.3 }, 'glow'));
  g.add(P.box(60, 1.5, 0.05, '#7f9a86', { x: 5, z: -16.55 }, 'metal'));     // back fence
  for (let x = -25; x <= 35; x += 2.5) g.add(P.box(0.06, 1.55, 0.06, '#5f7466', { x, z: -16.55 }, 'metal'));
  // のりば sign for platform 2 — what 岡田 points at
  const pSign = new THREE.Group();
  const ps = () => L.draw(2.9, 0.66, 320, (c, w, h) => drawNoriba(c, w, h, 2, '普通', 'みどりの 方面', LINE));
  put(ps(), 0, 0, 0.012, 0, pSign); put(ps(), 0, 0, -0.012, Math.PI, pSign);
  pSign.add(P.box(3.0, 0.76, 0.02, '#5a5f66', { y: -0.38 }, 'metal'));
  for (const x of [-1.2, 1.2]) pSign.add(P.box(0.03, 0.75, 0.03, '#777', { x, y: 0.3 }, 'metal'));
  put(pSign, -1.1, 2.5, -13.75);
  props.platform_sign = K.prop('platform_sign', pSign, { labelJa: '2ばんせん', labelEn: 'platform 2 sign' });
  const st2 = stationNameBoard(S, P); put(st2, -5.0, 0, -16.35, 0);
  const st2b = stationNameBoard(S, P); put(st2b, 8.0, 0, -16.35, 0);
  for (const x of [-9.5, 4.6]) { const b = stationBench(P, '#e08a3a'); put(b, x, 0, -15.6, 0); }
  binSet(P, S, g, 1.2, -16.1, 0);
  // a small vending machine on platform 2 (not the prop)
  put(vendingMachine(P, L, 2), -12.0, 0, -15.9, 0);
  // number signs on the platform 2 roof fascia
  for (const x of [-8, 6, 16]) put(L.sign([{ t: '2', scale: 1.3 }], 0.4, 0.4, { bg: LINE, fg: '#fff', radius: 0.5 }), x, 3.2, -12.88);

  // ------------------------------------------------------------------ footbridge (跨線橋) to platform 2
  g.add(P.box(2.6, 2.5, 13.4, '#d9d4c8', { x: 11.5, y: 5.4, z: -10.0 }));
  for (let z = -15.6; z <= -4.4; z += 1.6) g.add(P.box(0.04, 1.0, 1.2, '#a9c4d0', { x: 10.19, y: 6.4, z }, 'glass'));
  g.add(P.box(2.9, 0.2, 13.8, '#7b7f86', { x: 11.5, y: 7.9, z: -10.0 }));
  put(S.sign([{ t: 'ことばまち', scale: 1 }], 2.0, 0.4, { bg: '#ffffff', fg: NAVY }), 10.18, 7.2, -9.8, -Math.PI / 2);
  { // stairs down to platform 1 (rising toward the bridge)
    const slope = -Math.atan2(5.4, 10.0);
    g.add(P.mesh(new THREE.BoxGeometry(10.4, 0.3, 1.6), '#cdc8bd', { x: 17.6, y: 2.7, z: -5.0, rz: slope }));
    g.add(P.mesh(new THREE.BoxGeometry(10.4, 1.1, 0.08), '#e5e0d4', { x: 17.6, y: 3.2, z: -4.15, rz: slope }));
    g.add(P.mesh(new THREE.BoxGeometry(10.4, 1.1, 0.08), '#e5e0d4', { x: 17.6, y: 3.2, z: -5.85, rz: slope }));
  }

  // ------------------------------------------------------------------ station front (駅前): bus stop, taxis, shops
  // vending machines outside the entrance (prop)
  const vm = new THREE.Group();
  put(vendingMachine(P, L, 0), -0.55, 0, 0, 0, vm);
  put(vendingMachine(P, L, 1), 0.55, 0, 0, 0, vm);
  put(vm, 5.35, 0, -2.85);
  props.vending_machine = K.prop('vending_machine', vm, { labelJa: 'じどうはんばいき', labelEn: 'vending machine' });
  binSet(P, S, g, 6.55, -2.95, 0, true);
  g.add(P.box(15, 1.2, 0.06, '#9aa7a0', { x: 14.5, z: -3.25 }, 'metal'));   // fence between the platform and the square
  for (let x = 7.5; x <= 22; x += 2) g.add(P.box(0.06, 1.25, 0.06, '#6d7a72', { x, z: -3.25 }, 'metal'));
  // bus stop (バスのりば)
  const bus = new THREE.Group();
  bus.add(P.cyl(0.035, 0.035, 2.3, '#c9ccd0', {}, 'metal', 10));
  bus.add(P.cyl(0.22, 0.25, 0.12, '#555a60', {}, 'satin', 16));
  const busTop = () => S.draw(0.56, 0.56, 300, (c, w, h) => drawBusSign(c, w, h));
  put(busTop(), 0, 2.35, 0.02, 0, bus); put(busTop(), 0, 2.35, -0.02, Math.PI, bus);
  put(S.draw(0.34, 0.5, 300, (c, w, h) => drawBusTimetable(c, w, h, H)), 0, 1.45, 0.045, 0, bus);
  bus.add(P.box(0.36, 0.52, 0.05, '#2f6db3', { y: 1.19, z: 0.015 }, 'satin'));
  put(bus, 7.2, 0, -0.6, -Math.PI / 2);
  props.bus_stop_sign = K.prop('bus_stop_sign', bus, { labelJa: 'バスのりば', labelEn: 'bus stop' });
  const shelterBench = stationBench(P, '#c9b38a'); put(shelterBench, 7.45, 0, 1.0, -Math.PI / 2);
  // taxi stand
  const taxi = new THREE.Group();
  taxi.add(P.cyl(0.03, 0.03, 2.0, '#c9ccd0', {}, 'metal', 10));
  put(S.sign([{ t: 'タクシーのりば', scale: 0.8 }, { t: 'TAXI', scale: 0.7 }], 0.5, 0.3, { bg: '#f2c230', fg: '#222' }), 0, 2.0, 0.02, 0, taxi);
  put(taxi, 7.4, 0, 6.0, -Math.PI / 2);
  for (const [x, z, c] of [[10.2, 9.0, '#f2c230'], [10.2, 13.8, '#3b6fb4']]) put(car(P, c), x, 0, z, 0);
  // street lamps
  for (const [x, z] of [[7.7, -2.4], [7.7, 9.5], [14.3, -6], [14.3, 4.2]]) put(streetLamp(P, lampsOn), x, 0, z, 0);
  // season tree on the station-front sidewalk
  put(seasonTree(P, season, 4), 6.6, 0, 8.2, 0);
  put(seasonTree(P, season, 9), 6.6, 0, 14.5, 0);
  // planters
  for (const z of [-1.4, 2.2]) {
    g.add(P.box(0.7, 0.45, 0.7, '#b9b2a6', { x: 4.6, z: z + 0.1 }));
    put(P.adopt(K.plant(0.8, 5 + z)), 4.6, 0.3, z + 0.1, 0);
  }

  // shops across the square (seen from the station: bank – post office – supermarket)
  const bank = shopBank(P, S, L, lampsOn); put(bank, 16.0, 0, -4.6, -Math.PI / 2);
  const post = shopPost(P, S, L, lampsOn); put(post, 16.0, 0, 0.7, -Math.PI / 2);
  const superM = shopSuper(P, S, L, lampsOn); put(superM, 16.0, 0, 7.2, -Math.PI / 2);
  props.bank = K.prop('bank', bank.userData.front, { labelJa: 'ぎんこう', labelEn: 'bank' });
  props.post_office = K.prop('post_office', post.userData.front, { labelJa: 'ゆうびんきょく', labelEn: 'post office' });
  props.supermarket = K.prop('supermarket', superM.userData.front, { labelJa: 'スーパー', labelEn: 'supermarket' });
  // town backdrop
  const facade = facadeMat(lampsOn);
  for (const [x, z, w, h, d] of [[24, -9, 8, 14, 8], [25, 1, 7, 11, 8], [24, 12, 9, 17, 8], [30, -2, 10, 22, 8], [14, 16.5, 10, 9, 6], [2, 18, 10, 12, 6]]) {
    g.add(facadeBox(facade, w, h, d, { x, z }));
  }
  for (let i = 0; i < 9; i++) put(house(P, i, lampsOn), -26 + i * 6.5, 0, -21 - (i % 3) * 1.5, 0);
  for (let i = 0; i < 5; i++) g.add(facadeBox(facade, 9, 10 + (i % 3) * 5, 8, { x: -28 + i * 13, z: -33 }));
  for (let i = 0; i < 7; i++) put(seasonTree(P, season, 20 + i, 1.3), -22 + i * 7.3, 0, -18.3, 0);
  // the far left (behind the staff office) and right ends of the platforms
  g.add(P.box(30, 3.2, 0.2, '#d9d2c4', { x: -16.5, z: -1.95 }));
  g.add(P.box(30, 1.2, 0.2, '#9aa7a0', { x: 35, z: -1.95 }, 'metal'));

  // ------------------------------------------------------------------ the passing train (通過列車) on track 2
  const passDest = destinationTex('特急', 'うみの', 'Ltd. Exp.', 'Umino', '#ffd34a');
  const pass = new THREE.Group();
  for (let c = 0; c < 4; c++) put(trainCar(P, { len: 20, cab: c === 0, livery: '#c43a3a', accent: '#e8c86a', body: '#f1ede4', dest: passDest, open: false, lite: true }), c * 20.3, 0, 0, 0, pass);
  put(pass, 200, 0, -11.65);
  pass.visible = false;

  S.commit(); L.commit();
  mergeDynamic(pass);

  // ------------------------------------------------------------------ animation
  const PASS_PERIOD = 46; const PASS_START = 9; const PASS_SPEED = 26;
  let flip = 0;
  return K.finalize({
    group: g,
    spawn: K.spot(0, 0, 0),
    slots: {
      staff: K.spot(-0.72, -1.55, K.faceYaw({ x: -0.72, z: -1.55 }, { x: 0, z: 0 })),
      npc1: K.spot(0.55, -1.3, K.faceYaw({ x: 0.55, z: -1.3 }, { x: 0, z: 0 })),
      phone: null,
    },
    props,
    center: new THREE.Vector3(2, 0, -4),
    radius: 13,
    update(dt, t) {
      // doors slide open shortly after the scene appears (the express has just arrived)
      const open = THREE.MathUtils.smoothstep(t, 1.2, 2.6);
      doorsL.position.x = -0.62 * open; doorsR.position.x = 0.62 * open;
      // destination displays alternate Japanese / English
      const f = Math.floor(t / 3.5) % 2;
      if (f !== flip) { flip = f; dest.offset.y = f ? -0.5 : 0; passDest.offset.y = f ? -0.5 : 0; }
      ticker.tex.offset.x = (t * 0.035) % 1;
      // a limited express passes through platform 2 every ~46 s
      const k = t - PASS_START;
      const ph = k < 0 ? -1 : k % PASS_PERIOD;
      const x = 150 - ph * PASS_SPEED;
      pass.visible = ph >= 0 && x > -120;
      pass.position.x = x;
    },
  });
}

// ====================================================================== station pieces
function trainCar(P, { len = 20, cab = false, livery = LINE, accent = '#f08c2e', body = '#c9cdd2', dest, open = false, leaves = null, lite = false }) {
  const c = new THREE.Group();
  const half = 1.4;
  const metal = (w, h, d, o, col = body) => c.add(P.box(w, h, d, col, o, 'metal'));
  const doors = [0.115, 0.372, 0.628, 0.885].map((f) => f * len);
  const DW = 1.3;
  // floor, roof, ends, underbody
  c.add(P.box(len, 0.1, 2.7, '#8e9296', { x: len / 2, y: -0.05 }));
  c.add(P.box(len, 0.2, 2.72, '#b9bdc2', { x: len / 2, y: 2.72 }, 'satin'));
  c.add(P.box(len - 0.4, 0.12, 2.1, '#9da1a6', { x: len / 2, y: 2.92 }, 'satin'));
  for (const fx of [0.3, 0.7]) c.add(P.box(2.6, 0.32, 1.6, '#a7abb0', { x: len * fx, y: 2.95 }, 'satin'));
  if (!cab) metal(0.06, 3.35, 2.8, { x: 0, y: -0.62 });
  metal(0.06, 3.35, 2.8, { x: len, y: -0.62 });
  c.add(P.box(len - 1.0, 0.5, 2.3, '#3d4146', { x: len / 2, y: -1.05 }));
  for (const bx of [2.6, len - 2.6]) {
    c.add(P.box(2.4, 0.4, 2.2, '#2c2f33', { x: bx, y: -1.1 }));
    if (!lite) for (const dx of [-0.9, 0.9]) for (const s of [-1, 1]) c.add(P.cyl(0.42, 0.42, 0.12, '#3a3a3a', { x: bx + dx, y: -1.1 + 0.42 - 0.06, z: s * 0.6, rx: Math.PI / 2 }, 'metal', 9));
  }
  // sides
  for (const side of [1, -1]) {
    const z = side * (half - 0.03);
    metal(len, 0.8, 0.06, { x: len / 2, y: 1.92, z });       // upper band (continuous)
    const segs = [];
    let a = cab ? 0.0 : 0.15;
    for (const d of doors) { segs.push([a, d - DW / 2]); a = d + DW / 2; }
    segs.push([a, len - 0.15]);
    for (const [s0, s1] of segs) {
      const L = s1 - s0; const cx = (s0 + s1) / 2;
      metal(L, 1.54, 0.06, { x: cx, y: -0.62, z });           // lower band
      c.add(P.box(L, 0.1, 0.02, livery, { x: cx, y: 0.8, z: z + side * 0.035 }, 'satin'));
      c.add(P.box(L, 0.03, 0.02, accent, { x: cx, y: 0.73, z: z + side * 0.035 }, 'satin'));
      // window band: solid door pockets next to doorways, windows in between
      const pk = Math.min(0.72, L / 3);
      metal(pk, 1.0, 0.06, { x: s0 + pk / 2, y: 0.92, z });
      metal(pk, 1.0, 0.06, { x: s1 - pk / 2, y: 0.92, z });
      const wl = L - pk * 2;
      if (wl > 0.2) {
        c.add(P.box(wl, 1.0, 0.03, '#9fb6c0', { x: cx, y: 0.92, z: z - side * 0.01 }, 'glass'));
        metal(0.12, 1.0, 0.07, { x: cx, y: 0.92, z });
        c.add(P.box(wl, 0.06, 0.08, '#2f3338', { x: cx, y: 0.9, z }, 'satin'));
        c.add(P.box(wl, 0.06, 0.08, '#2f3338', { x: cx, y: 1.88, z }, 'satin'));
      }
      // seats inside
      if (L > 2 && !lite) {
        c.add(P.box(L - 0.4, 0.42, 0.5, '#3f6fb0', { x: cx, y: 0.05, z: side * (half - 0.35) }, 'satin'));
        c.add(P.box(L - 0.4, 0.45, 0.1, '#365f98', { x: cx, y: 0.47, z: side * (half - 0.14) }, 'satin'));
        c.add(P.box(L - 0.4, 0.03, 0.3, '#b0b4b8', { x: cx, y: 1.78, z: side * (half - 0.2) }, 'metal'));
      }
    }
    // door leaves (+z side = platform side). Closed doors on the far side.
    for (const d of doors) {
      for (const lr of [-1, 1]) {
        const leaf = new THREE.Group();
        leaf.add(P.box(0.64, 1.86, 0.04, body, { y: 0.05 }, 'metal'));
        leaf.add(P.box(0.36, 0.78, 0.02, '#36414a', { y: 0.98, z: side * 0.022 }, 'gloss'));
        leaf.position.set(d + lr * 0.325, 0, side * (half - 0.08));
        if (side === 1 && leaves && open) leaves[lr < 0 ? 0 : 1].add(leaf); else c.add(leaf);
      }
      metal(DW + 0.1, 0.06, 0.08, { x: d, y: 1.9, z });
    }
    // side destination display
    if (dest) { // side destination display (behind the cab on the leading car)
      const dx = cab ? 0.85 : (doors[1] + doors[2]) / 2;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.24), destMat(dest));
      m.position.set(dx, 2.25, side * (half + 0.03));
      m.rotation.y = side > 0 ? 0 : Math.PI;
      c.add(m);
      c.add(P.box(1.05, 0.32, 0.03, '#1f2226', { x: dx, y: 2.09, z: side * (half + 0.012) }, 'satin'));
    }
  }
  // interior ceiling + lights + poles
  c.add(P.box(len - 0.2, 0.04, 2.6, '#eceeea', { x: len / 2, y: 2.46 }));
  for (const zz of [-0.6, 0.6]) c.add(P.box(len - 1, 0.03, 0.14, '#fffdf2', { x: len / 2, y: 2.42, z: zz }, 'glow'));
  for (const d of doors) c.add(P.cyl(0.02, 0.02, 2.4, '#d0d4d8', { x: d, y: 0.05, z: 0.35 }, 'metal', 8));
  c.add(P.box(len - 0.3, 0.02, 2.55, '#9c9a94', { x: len / 2, y: 0.05 }, 'satin')); // interior floor
  if (cab) {
    const front = new THREE.Group();
    // nose block (faces -x)
    front.add(P.rbox(0.9, 3.35, 2.8, 0.22, body, { x: -0.25, y: -0.62 }, 'metal'));
    front.add(P.box(0.05, 1.15, 2.4, '#1c2328', { x: -0.71, y: 1.05 }, 'gloss'));        // windscreen
    front.add(P.box(0.05, 0.42, 2.6, livery, { x: -0.71, y: 0.48 }, 'satin'));
    front.add(P.box(0.05, 0.06, 2.6, accent, { x: -0.72, y: 0.43 }, 'satin'));
    front.add(P.box(0.06, 0.5, 2.6, '#2a2d31', { x: -0.68, y: -0.62 }));                // skirt
    for (const s of [-1, 1]) {
      front.add(P.box(0.04, 0.14, 0.28, '#fffbe6', { x: -0.72, y: 0.12, z: s * 0.95 }, 'glow')); // headlights
      front.add(P.box(0.04, 0.1, 0.16, '#5a1a1a', { x: -0.72, y: 0.12, z: s * 0.66 }, 'gloss'));
    }
    front.add(P.box(0.4, 0.25, 0.3, '#2a2d31', { x: -0.85, y: -0.75 }));                 // coupler
    if (dest) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.33), destMat(dest));
      m.position.set(-0.752, 2.4, 0); m.rotation.y = -Math.PI / 2;
      front.add(m);
      front.add(P.box(0.03, 0.4, 1.42, '#111316', { x: -0.72, y: 2.2 }, 'satin'));
    }
    // the first doorway region belongs to the "front" (prop anchor)
    front.add(P.box(5.0, 0.01, 0.01, '#9c9a94', { x: 2.2, y: 2.6, z: 1.3 }, 'satin'));
    c.add(front);
    c.userData.cab = true;
    c.userData.front = front;
  }
  return c;
}

const destMats = new WeakMap();
function destMat(tex) {
  if (!destMats.has(tex)) destMats.set(tex, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  return destMats.get(tex);
}
/** LED destination display: top half Japanese, bottom half English (alternated via offset.y). */
function destinationTex(type, to, typeEn, toEn, typeColor) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#0c0d0f'; g.fillRect(0, 0, 512, 256);
  const half = (y0, a, b, fa, fb) => {
    g.fillStyle = typeColor; K.roundRect(g, 14, y0 + 18, 170, 92, 10); g.fill();
    g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `800 ${fa}px ${K.JP_FONT}`; g.fillText(a, 99, y0 + 66);
    g.fillStyle = '#ffb23a'; g.font = `800 ${fb}px ${K.JP_FONT}`; g.fillText(b, 350, y0 + 66);
  };
  half(0, type, to, 62, 84);
  half(128, typeEn, toEn, 40, 60);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(1, 0.5); t.offset.set(0, 0.5);
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

function tickerStrip(w, h, H) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 48;
  const g = c.getContext('2d');
  g.fillStyle = '#0c0d0f'; g.fillRect(0, 0, 1024, 48);
  g.font = `700 26px ${K.JP_FONT}`; g.textBaseline = 'middle';
  const parts = [
    ['急行は みどりのに 止まりません', '#ffb23a'],
    [`みどりの方面は 2番線 普通 ${H}:40発`, '#5fe07a'],
  ];
  let x = 12;
  for (const [t, col] of parts) { g.fillStyle = col; g.fillText(t, x, 25); x += g.measureText(t).width + 40; }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  const f = Math.min(1, (w / h) * 48 / 1024);
  tex.repeat.set(f, 1);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  return { mesh, tex };
}

function ticketMachine(P, L, i) {
  const m = new THREE.Group(); // faces +z (rotated into the wall by the caller)
  m.add(P.box(0.8, 1.75, 0.45, '#e8e6e0', { z: 0.2 }, 'satin'));
  m.add(P.box(0.78, 0.9, 0.12, '#d6d3cb', { y: 0.82, z: 0.45, rx: 0 }, 'satin'));
  m.add(P.box(0.82, 0.08, 0.5, '#2f9a62', { y: 1.72, z: 0.2 }, 'satin'));
  const scr = L.draw(0.5, 0.36, 400, (c, w, h) => drawTicketScreen(c, w, h, i));
  scr.position.set(0, 1.16, 0.505); scr.rotation.x = -0.35;
  m.add(scr);
  m.add(P.box(0.56, 0.42, 0.04, '#2a2d31', { y: 0.94, z: 0.48, rx: -0.35 }, 'satin'));
  m.add(P.box(0.12, 0.04, 0.03, '#888', { x: 0.28, y: 1.32, z: 0.52 }, 'metal'));  // coin slot
  m.add(P.box(0.16, 0.04, 0.03, '#555', { x: 0.27, y: 1.22, z: 0.52 }, 'metal'));  // bill slot
  m.add(P.box(0.5, 0.12, 0.06, '#2a2d31', { y: 0.45, z: 0.52 }, 'satin'));        // ticket outlet
  m.add(P.box(0.12, 0.12, 0.03, '#2f6db3', { x: -0.3, y: 1.3, z: 0.52 }, 'satin')); // IC card slot
  put2(m, L.sign([{ t: i === 0 ? 'きっぷ・IC チャージ' : i === 1 ? 'きっぷ  Tickets' : 'IC カード', scale: 0.85 }], 0.7, 0.13, { bg: '#2c3e5c', fg: '#fff' }), 0, 1.55, 0.415);
  return m;
}
function put2(parent, o, x, y, z, ry = 0) { o.position.set(x, y, z); o.rotation.y = ry; parent.add(o); return o; }

function gateCabinet(P, L, i) {
  const c = new THREE.Group(); // long axis along z, entry end at +z
  c.add(P.rbox(0.18, 0.9, 1.2, 0.04, '#d9dcde', {}, 'satin'));
  c.add(P.box(0.2, 0.06, 1.22, '#2c3e5c', { y: 0.9 }, 'satin'));
  c.add(P.box(0.16, 0.012, 0.18, '#3aa0e8', { y: 0.96, z: 0.38 }, 'glow'));   // IC touch pad
  c.add(P.box(0.1, 0.01, 0.1, '#bfe6ff', { y: 0.97, z: 0.38 }, 'glow'));
  c.add(P.box(0.1, 0.012, 0.02, '#111', { y: 0.96, z: 0.12 }, 'satin'));     // ticket slot
  c.add(P.box(0.03, 0.3, 0.22, '#e8743a', { x: 0.1, y: 0.5, z: -0.05 }, 'satin')); // flap (retracted)
  c.add(P.box(0.03, 0.3, 0.22, '#e8743a', { x: -0.1, y: 0.5, z: -0.05 }, 'satin'));
  // end indicators (in = green arrow, out-only = red cross)
  const ok = i !== 4;
  put2(c, L.sign([ok ? '↑' : '×'], 0.12, 0.12, { bg: ok ? '#2a9a58' : '#d23a2a', fg: '#fff', radius: 0.2 }), 0, 0.72, 0.605);
  put2(c, L.sign([i === 1 || i === 2 ? 'IC' : '↑'], 0.12, 0.12, { bg: '#2a9a58', fg: '#fff', radius: 0.2 }), 0, 0.72, -0.605, Math.PI);
  return c;
}

function stationBench(P, seat = '#e08a3a') {
  const b = new THREE.Group(); // faces -z, 3 seats along x
  for (let i = 0; i < 3; i++) {
    const x = -0.46 + i * 0.46;
    b.add(P.rbox(0.42, 0.06, 0.42, 0.03, seat, { x, y: 0.42 }, 'satin'));
    b.add(P.rbox(0.42, 0.4, 0.05, 0.02, seat, { x, y: 0.5, z: 0.21, rx: 0.12 }, 'satin'));
  }
  b.add(P.box(1.45, 0.05, 0.08, '#8c9196', { y: 0.36 }, 'metal'));
  for (const x of [-0.62, 0.62]) b.add(P.box(0.06, 0.38, 0.38, '#8c9196', { x }, 'metal'));
  return b;
}

function binSet(P, S, g, x, z, ry, outside = false) {
  const b = new THREE.Group();
  const labels = outside ? [['かん・びん', '#2f6db3'], ['ペットボトル', '#2f9a62']] : [['かん・びん', '#2f6db3'], ['ペットボトル', '#2f9a62'], ['もえるごみ', '#d8473a']];
  labels.forEach(([t, col], i) => {
    const xx = (i - (labels.length - 1) / 2) * 0.42;
    b.add(P.box(0.4, 0.95, 0.38, '#c9ccd0', { x: xx }, 'metal'));
    b.add(P.box(0.4, 0.05, 0.4, col, { x: xx, y: 0.95 }, 'satin'));
    b.add(P.box(0.18, 0.06, 0.01, '#222', { x: xx, y: 0.8, z: 0.195 }, 'satin'));
    put2(b, S.sign([t], 0.34, 0.11, { bg: col, fg: '#fff' }), xx, 0.62, 0.193);
  });
  b.position.set(x, 0, z); b.rotation.y = ry; g.add(b);
  return b;
}

function stationNameBoard(S, P) {
  const b = new THREE.Group();
  for (const x of [-0.9, 0.9]) b.add(P.box(0.06, 2.0, 0.06, '#7c8288', { x }, 'metal'));
  const face = () => S.draw(1.9, 0.62, 300, drawStationName);
  put2(b, face(), 0, 1.6, 0.035); put2(b, face(), 0, 1.6, -0.035, Math.PI);
  b.add(P.box(1.96, 0.68, 0.06, '#7c8288', { y: 1.26 }, 'metal'));
  return b;
}

function vendingMachine(P, L, k) {
  const v = new THREE.Group(); // faces +z
  const cols = ['#e7413a', '#2f6db3', '#2f9a62'];
  v.add(P.rbox(1.0, 1.83, 0.72, 0.03, cols[k % 3], {}, 'satin'));
  v.add(P.box(0.9, 0.95, 0.02, '#f4f6f8', { y: 0.78, z: 0.36 }, 'glow'));
  put2(v, L.draw(0.88, 0.92, 260, (c, w, h) => drawVending(c, w, h, k)), 0, 1.25, 0.372);
  v.add(P.box(0.6, 0.16, 0.05, '#222', { y: 0.12, z: 0.37 }, 'satin'));
  v.add(P.box(0.16, 0.2, 0.03, '#d0d0d0', { x: 0.3, y: 0.62, z: 0.37 }, 'metal'));
  return v;
}

function streetLamp(P, on) {
  const l = new THREE.Group();
  l.add(P.cyl(0.06, 0.08, 4.6, '#6a7076', {}, 'metal', 10));
  l.add(P.box(0.8, 0.08, 0.12, '#6a7076', { x: -0.35, y: 4.55 }, 'metal'));
  l.add(P.box(0.45, 0.06, 0.22, on ? '#fff3cf' : '#e8e6de', { x: -0.65, y: 4.48 }, on ? 'glow' : 'satin'));
  return l;
}

function car(P, color) {
  const c = new THREE.Group();
  c.add(P.rbox(1.7, 0.75, 4.3, 0.15, color, { y: 0.25 }, 'gloss'));
  c.add(P.rbox(1.5, 0.55, 2.2, 0.15, '#2e3a44', { y: 0.95, z: 0.1 }, 'gloss'));
  for (const [x, z] of [[-0.8, -1.4], [0.8, -1.4], [-0.8, 1.4], [0.8, 1.4]]) c.add(P.cyl(0.32, 0.32, 0.22, '#222', { x, y: 0.0, z, rz: Math.PI / 2 }, 'satin', 12));
  c.add(P.box(0.45, 0.14, 0.2, '#f2f2ee', { y: 1.5, z: 0.1 }, 'satin'));
  return c;
}

function seasonTree(P, season, seed, s = 1) {
  const t = new THREE.Group();
  const r = K.rng(seed);
  t.add(P.cyl(0.11 * s, 0.17 * s, 2.0 * s, '#5d4636', {}, 'matte', 8));
  for (let i = 0; i < 3; i++) {
    const a = r() * 6.28;
    t.add(P.cyl(0.04 * s, 0.07 * s, 1.3 * s, '#5d4636', { x: Math.cos(a) * 0.3 * s, y: 1.7 * s, z: Math.sin(a) * 0.3 * s, rz: Math.cos(a) * 0.6, rx: -Math.sin(a) * 0.6 }, 'matte', 6));
  }
  if (season === 'winter') return t;
  const pal = { spring: ['#f7c6d4', '#f2b3c6', '#fbd9e3', '#eaa6bd'], summer: ['#4f8a46', '#5f9a50', '#447c3e', '#6aa65a'], autumn: ['#d9762e', '#e3a03a', '#c4552a', '#e8c04a'] }[season] || ['#5f9a50'];
  const geo = new THREE.IcosahedronGeometry(0.75 * s, 1);
  for (let i = 0; i < 9; i++) {
    const a = r() * 6.28; const rad = (0.3 + r() * 0.9) * s;
    const m = P.mesh(geo.clone(), pal[i % pal.length], { x: Math.cos(a) * rad, y: (2.4 + r() * 1.1) * s, z: Math.sin(a) * rad }, 'matte');
    m.scale.set(1 + r() * 0.4, 0.75 + r() * 0.3, 1 + r() * 0.4);
    t.add(m);
  }
  return t;
}

function house(P, i, lit) {
  const h = new THREE.Group();
  const walls = ['#e9e1d0', '#d8d2c8', '#efe7d6', '#cfd6d8', '#e6d8c4'];
  const roofs = ['#5a6470', '#7a4a3a', '#3f4a52', '#6b5a4a'];
  const w = 5 + (i % 2); const d = 5; const hh = 5.2 + (i % 3) * 0.6;
  h.add(P.box(w, hh, d, walls[i % 5]));
  for (const s of [-1, 1]) {
    const roof = P.box(w + 0.4, 0.15, d * 0.62, roofs[i % 4], { y: hh + 0.55, z: s * d * 0.25, rx: s * 0.45 });
    h.add(roof);
  }
  for (const [x, y] of [[-1.2, 1.2], [1.2, 1.2], [-1.2, 3.6], [1.2, 3.6]]) h.add(P.box(1.0, 0.9, 0.05, lit && (x + y + i) % 3 > 0.5 ? '#ffd890' : '#7e9aa8', { x, y, z: d / 2 + 0.01 }, lit ? 'glow' : 'gloss'));
  return h;
}

// ---- shops in front of the station (each faces +z locally; front = anchor sub-group)
function shopShell(P, w, h, wall, lit) {
  const s = new THREE.Group();
  s.add(P.box(w, h, 6, wall, { z: -3 }));
  s.add(P.box(w, 0.2, 6.1, '#8a8f94', { y: h, z: -3 }));
  for (let fl = 1; fl < Math.floor(h / 3.2); fl++) for (let k = 0; k < Math.floor(w / 1.7); k++) {
    s.add(P.box(1.1, 1.2, 0.05, lit ? (k + fl) % 3 ? '#ffe2a8' : '#6d8794' : '#8eaab8', { x: -w / 2 + 0.85 + k * 1.7, y: fl * 3.2 + 0.6, z: 0.02 }, lit ? 'glow' : 'gloss'));
  }
  return s;
}
function storefront(P, w, interior, lit) {
  const f = new THREE.Group();
  f.add(P.box(w - 0.3, 2.5, 0.05, interior, { z: -1.5 }, lit ? 'glow' : 'matte'));
  f.add(P.box(w - 0.3, 2.45, 0.03, '#bcd3dc', { z: 0.03 }, 'glass'));
  for (let x = -w / 2 + 0.15; x <= w / 2 - 0.1; x += (w - 0.3) / 3) f.add(P.box(0.08, 2.5, 0.08, '#8a8f94', { x, z: 0.03 }, 'metal'));
  f.add(P.box(w, 0.1, 0.1, '#8a8f94', { y: 2.45, z: 0.03 }, 'metal'));
  return f;
}
function shopBank(P, S, L, lit) {
  const b = shopShell(P, 5.2, 8.5, '#d9d6cf', lit);
  const front = new THREE.Group(); b.add(front);
  front.add(storefront(P, 5.2, '#e9eef2', true));
  front.add(P.box(5.2, 0.9, 0.2, '#1f4f8f', { y: 2.7, z: 0.1 }, 'satin'));
  put2(front, L.sign([{ t: '◎ ことば銀行', scale: 1 }], 3.6, 0.7, { bg: '#1f4f8f', fg: '#ffffff' }), 0, 3.15, 0.205);
  put2(front, L.sign(['ATM'], 0.8, 0.4, { bg: '#ffffff', fg: '#1f4f8f', border: '#1f4f8f' }), 1.8, 2.0, 0.08);
  put2(front, S.sign(['ATM  8:00〜21:00'], 1.1, 0.22, { bg: '#ffffff', fg: '#1f4f8f' }), -1.6, 1.6, 0.06);
  b.userData.front = front;
  return b;
}
function shopPost(P, S, L, lit) {
  const b = shopShell(P, 5.0, 7.0, '#efe9df', lit);
  const front = new THREE.Group(); b.add(front);
  front.add(storefront(P, 5.0, '#f4efe4', true));
  front.add(P.box(5.0, 0.9, 0.2, '#e2412f', { y: 2.7, z: 0.1 }, 'satin'));
  put2(front, L.sign([{ t: '〒 ことばまち郵便局', scale: 1 }], 3.9, 0.7, { bg: '#e2412f', fg: '#ffffff' }), 0, 3.15, 0.205);
  put2(front, S.sign([{ t: '郵便  9:00〜17:00', scale: 0.8 }, { t: 'ATM  8:00〜21:00', scale: 0.8 }], 1.1, 0.4, { bg: '#ffffff', fg: '#c0392b' }), 1.6, 1.6, 0.06);
  // red post box (ポスト) in front
  const pb = new THREE.Group();
  pb.add(P.rbox(0.5, 1.15, 0.45, 0.08, '#d8302a', {}, 'gloss'));
  pb.add(P.box(0.3, 0.03, 0.05, '#222', { y: 0.95, z: 0.22 }, 'satin'));
  put2(pb, S.sign(['〒'], 0.22, 0.22, { bg: '#ffffff', fg: '#d8302a', radius: 0.5 }), 0, 0.7, 0.23);
  put2(front, pb, -1.9, 0, 1.0);
  b.userData.front = front;
  return b;
}
function shopSuper(P, S, L, lit) {
  const b = shopShell(P, 8.0, 6.6, '#f1ece2', lit);
  const front = new THREE.Group(); b.add(front);
  front.add(storefront(P, 8.0, '#fff4dc', true));
  front.add(P.box(8.0, 1.0, 0.2, '#f08c2e', { y: 2.7, z: 0.1 }, 'satin'));
  put2(front, L.sign([{ t: 'スーパー さくらや', scale: 1 }], 5.4, 0.75, { bg: '#f08c2e', fg: '#ffffff' }), 0, 3.2, 0.205);
  // awning + produce stands + carts
  const aw = P.box(7.6, 0.06, 1.3, '#2f9a62', { y: 2.45, z: 0.6, rx: 0.25 }, 'satin'); front.add(aw);
  for (let i = 0; i < 3; i++) {
    const x = -3.0 + i * 1.3;
    front.add(P.box(1.1, 0.7, 0.6, '#b58a5a', { x, z: 0.65 }));
    const fruit = ['#e8452f', '#f2b23a', '#7cb84a'][i];
    for (let k = 0; k < 6; k++) front.add(P.mesh(new THREE.SphereGeometry(0.08, 8, 6), fruit, { x: x - 0.4 + k * 0.16, y: 0.78, z: 0.55 + (k % 2) * 0.15 }, 'satin'));
    put2(front, S.sign([['りんご 198円', 'みかん 298円', 'キャベツ 158円'][i]], 0.7, 0.18, { bg: '#fff9e0', fg: '#c0392b' }), x, 0.85, 0.96);
  }
  put2(front, S.sign([{ t: '本日 特売', scale: 1 }], 1.2, 0.5, { bg: '#ffef5a', fg: '#d8302a' }), 2.4, 1.6, 0.06);
  for (let i = 0; i < 3; i++) {
    const cart = new THREE.Group();
    cart.add(P.box(0.5, 0.45, 0.8, '#c9ccd0', { y: 0.45 }, 'metal'));
    cart.add(P.box(0.5, 0.04, 0.04, '#e8452f', { y: 1.0, z: 0.4 }, 'satin'));
    put2(front, cart, 3.0 + i * 0.12, 0, 0.9 + i * 0.25, 0.1);
  }
  b.userData.front = front;
  return b;
}

// ====================================================================== drawings (atlas callbacks)
function txt(g, t, x, y, px, color, weight = 700, align = 'center', maxW = 0) {
  g.font = `${weight} ${px}px ${K.JP_FONT}`;
  g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle';
  if (maxW) while (g.measureText(t).width > maxW && px > 8) g.font = `${weight} ${(px *= 0.93)}px ${K.JP_FONT}`;
  g.fillText(t, x, y);
}

function drawDepartures(g, w, h, H) {
  g.fillStyle = '#0c0d0f'; K.roundRect(g, 0, 0, w, h, 10); g.fill();
  g.fillStyle = '#1d3a6b'; g.fillRect(0, 0, w, h * 0.2);
  txt(g, '発車案内', w * 0.04, h * 0.1, h * 0.12, '#ffffff', 800, 'left');
  txt(g, 'Departures', w * 0.26, h * 0.1, h * 0.09, '#cfd8e6', 500, 'left');
  const cols = [0.035, 0.2, 0.36, 0.7, 0.86];
  txt(g, '種別', w * cols[0], h * 0.27, h * 0.065, '#9aa6b8', 500, 'left');
  txt(g, '時刻', w * cols[1], h * 0.27, h * 0.065, '#9aa6b8', 500, 'left');
  txt(g, '行先', w * cols[2], h * 0.27, h * 0.065, '#9aa6b8', 500, 'left');
  txt(g, 'のりば', w * cols[3], h * 0.27, h * 0.065, '#9aa6b8', 500, 'left');
  txt(g, '両数', w * cols[4], h * 0.27, h * 0.065, '#9aa6b8', 500, 'left');
  const rows = [['急行', '#ff4b3a', `${H}:36`, 'うみの', '1', '8両'], ['普通', '#5fe07a', `${H}:40`, 'みどりの', '2', '4両'], ['急行', '#ff4b3a', `${H}:56`, 'うみの', '1', '8両']];
  rows.forEach(([type, col, tm, to, pl, cars], i) => {
    const y = h * (0.42 + i * 0.2);
    g.strokeStyle = '#2a2d31'; g.lineWidth = 2; g.beginPath(); g.moveTo(w * 0.02, y - h * 0.1); g.lineTo(w * 0.98, y - h * 0.1); g.stroke();
    txt(g, type, w * cols[0], y, h * 0.13, col, 800, 'left');
    txt(g, tm, w * cols[1], y, h * 0.13, '#ffb23a', 700, 'left');
    txt(g, to, w * cols[2], y, h * 0.13, '#ffb23a', 800, 'left');
    txt(g, pl, w * cols[3] + w * 0.04, y, h * 0.13, '#ffb23a', 800, 'left');
    txt(g, cars, w * cols[4], y, h * 0.11, '#ffb23a', 700, 'left');
  });
}

function drawNoriba(g, w, h, n, type, dir, col) {
  g.fillStyle = '#f7f6f2'; K.roundRect(g, 0, 0, w, h, 8); g.fill();
  g.fillStyle = col; g.beginPath(); g.arc(h * 0.5, h * 0.5, h * 0.4, 0, 6.3); g.fill();
  txt(g, String(n), h * 0.5, h * 0.53, h * 0.58, '#ffffff', 800);
  txt(g, 'のりば', h * 1.0, h * 0.5, h * 0.24, '#333', 800, 'left');
  txt(g, type, w * 0.47, h * 0.33, h * 0.24, col === LINE ? '#1f7a4a' : col, 800, 'left', w * 0.5);
  txt(g, dir, w * 0.47, h * 0.7, h * 0.28, NAVY, 800, 'left', w * 0.5);
  g.fillStyle = col; g.fillRect(0, h - 8, w, 8);
}

function drawStationName(g, w, h) {
  g.fillStyle = '#fbfaf6'; g.fillRect(0, 0, w, h);
  txt(g, 'ことばまち', w / 2, h * 0.3, h * 0.3, '#222', 800);
  txt(g, 'Kotobamachi', w / 2, h * 0.53, h * 0.11, '#555', 500);
  g.fillStyle = LINE; g.fillRect(0, h * 0.64, w, h * 0.13);
  txt(g, '← わかば', w * 0.04, h * 0.88, h * 0.12, '#333', 700, 'left');
  txt(g, 'みどりの →', w * 0.96, h * 0.88, h * 0.12, '#333', 700, 'right');
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(w / 2, h * 0.705, h * 0.05, 0, 6.3); g.fill();
}

function drawRouteMap(g, w, h) {
  g.fillStyle = '#fbfaf5'; g.fillRect(0, 0, w, h);
  txt(g, 'みどり線  路線図  Route Map', w * 0.04, h * 0.1, h * 0.075, NAVY, 800, 'left');
  const st = [['わかば', 140, false], ['ことばまち', 0, true], ['みどりの', 140, false], ['さくらだい', 180, false], ['かわべ', 220, true], ['ひかり', 260, false], ['うみの', 300, true]];
  const y = h * 0.5; const x0 = w * 0.07; const dx = (w * 0.86) / (st.length - 1);
  g.strokeStyle = LINE; g.lineWidth = h * 0.05; g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + dx * (st.length - 1), y); g.stroke();
  st.forEach(([n, fare, exp], i) => {
    const x = x0 + dx * i; const here = n === 'ことばまち';
    g.fillStyle = here ? '#e8452f' : '#ffffff'; g.strokeStyle = exp ? '#d8473a' : LINE; g.lineWidth = h * 0.018;
    g.beginPath(); g.arc(x, y, h * 0.045, 0, 6.3); g.fill(); g.stroke();
    if (exp) { g.fillStyle = '#d8473a'; g.beginPath(); g.arc(x, y - h * 0.11, h * 0.022, 0, 6.3); g.fill(); }
    txt(g, n, x, y + h * 0.13, h * 0.07, here ? '#e8452f' : '#222', 800, 'center', dx * 0.98);
    txt(g, here ? '現在地' : `${fare}円`, x, y + h * 0.24, h * 0.06, here ? '#e8452f' : '#444', 700);
  });
  g.fillStyle = '#d8473a'; g.beginPath(); g.arc(w * 0.06, h * 0.88, h * 0.022, 0, 6.3); g.fill();
  txt(g, '急行 停車駅（みどりのには 止まりません）', w * 0.085, h * 0.88, h * 0.06, '#333', 700, 'left');
}

function drawFareChart(g, w, h) {
  g.fillStyle = '#fbfaf5'; g.fillRect(0, 0, w, h);
  g.fillStyle = LINE; g.fillRect(0, 0, w, h * 0.16);
  txt(g, '運賃表  Fares（おとな / こども）', w * 0.03, h * 0.08, h * 0.1, '#fff', 800, 'left');
  const rows = [['わかば', '140 / 70'], ['みどりの', '140 / 70'], ['さくらだい', '180 / 90'], ['かわべ', '220 / 110'], ['ひかり', '260 / 130'], ['うみの', '300 / 150']];
  rows.forEach(([n, f], i) => {
    const col = i % 3; const row = Math.floor(i / 3);
    const x = w * (0.03 + col * 0.33); const y = h * (0.38 + row * 0.32);
    g.fillStyle = i % 2 ? '#eef3ee' : '#f6f4ee'; g.fillRect(x - w * 0.01, y - h * 0.13, w * 0.31, h * 0.26);
    txt(g, n, x, y, h * 0.13, '#222', 800, 'left');
    txt(g, `${f} 円`, x + w * 0.29, y, h * 0.12, '#c0392b', 800, 'right');
  });
}

function drawTicketScreen(g, w, h, i) {
  const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, '#2c6fb8'); grd.addColorStop(1, '#174a86');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  txt(g, i === 2 ? 'IC カード チャージ' : 'きっぷを かう', w / 2, h * 0.13, h * 0.1, '#fff', 800);
  const labels = i === 2 ? ['1000円', '2000円', '3000円', '5000円', '10000円', 'English'] : ['140円', '180円', '220円', '260円', '300円', 'English'];
  labels.forEach((t, k) => {
    const x = w * (0.06 + (k % 3) * 0.31); const y = h * (0.3 + Math.floor(k / 3) * 0.33);
    g.fillStyle = k === 5 ? '#f2c230' : '#ffffff'; K.roundRect(g, x, y, w * 0.27, h * 0.26, 8); g.fill();
    txt(g, t, x + w * 0.135, y + h * 0.13, h * 0.09, '#1d3a6b', 800, 'center', w * 0.25);
  });
}

function drawClock(g, w, h, hh, mm) {
  const r = w / 2;
  g.fillStyle = '#fbfbf7'; g.beginPath(); g.arc(r, r, r * 0.98, 0, 6.3); g.fill();
  g.strokeStyle = '#2b2e33'; g.lineWidth = r * 0.07; g.beginPath(); g.arc(r, r, r * 0.93, 0, 6.3); g.stroke();
  for (let i = 0; i < 60; i++) {
    const a = i / 60 * Math.PI * 2; const big = i % 5 === 0;
    g.strokeStyle = '#222'; g.lineWidth = big ? r * 0.05 : r * 0.015;
    g.beginPath(); g.moveTo(r + Math.sin(a) * r * (big ? 0.68 : 0.76), r - Math.cos(a) * r * (big ? 0.68 : 0.76));
    g.lineTo(r + Math.sin(a) * r * 0.82, r - Math.cos(a) * r * 0.82); g.stroke();
  }
  const hand = (len, wd, a, col) => { g.strokeStyle = col; g.lineWidth = wd; g.lineCap = 'round'; g.beginPath(); g.moveTo(r - Math.sin(a) * r * 0.12, r + Math.cos(a) * r * 0.12); g.lineTo(r + Math.sin(a) * len, r - Math.cos(a) * len); g.stroke(); };
  hand(r * 0.48, r * 0.08, ((hh % 12) + mm / 60) / 12 * Math.PI * 2, '#222');
  hand(r * 0.72, r * 0.05, mm / 60 * Math.PI * 2, '#222');
  hand(r * 0.75, r * 0.018, 0.23 * Math.PI * 2, '#d8302a');
  g.fillStyle = '#222'; g.beginPath(); g.arc(r, r, r * 0.05, 0, 6.3); g.fill();
}

function drawPoster(g, w, h, season, lines) {
  const bg = { spring: ['#fde7ef', '#f7c6d4'], summer: ['#1d2f6b', '#3a5bb0'], autumn: ['#fbe6cf', '#e8a05a'], winter: ['#1f2b52', '#4a5f9a'] }[season] || ['#fff', '#eee'];
  const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, bg[0]); grd.addColorStop(1, bg[1]);
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  const r = K.rng(5);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = season === 'spring' ? 'rgba(232,120,160,0.55)' : season === 'autumn' ? 'rgba(200,80,30,0.5)' : 'rgba(255,240,180,0.7)';
    g.beginPath(); g.arc(r() * w, r() * h * 0.6, 4 + r() * 10, 0, 6.3); g.fill();
  }
  const dark = season === 'summer' || season === 'winter';
  lines.forEach(([t, col], i) => txt(g, t, w / 2, h * (0.62 + i * 0.12), i === 0 ? h * 0.1 : h * 0.05, dark ? '#fff7d8' : col, 800, 'center', w * 0.9));
}

function drawMuseumPoster(g, w, h) {
  g.fillStyle = '#efe9dc'; g.fillRect(0, 0, w, h);
  const grd = g.createLinearGradient(0, h * 0.08, 0, h * 0.58); grd.addColorStop(0, '#9fb8c8'); grd.addColorStop(1, '#e9d2a8');
  g.fillStyle = grd; g.fillRect(w * 0.08, h * 0.06, w * 0.84, h * 0.52);
  g.fillStyle = '#4f6a5a'; g.beginPath(); g.moveTo(w * 0.08, h * 0.5); g.lineTo(w * 0.35, h * 0.3); g.lineTo(w * 0.6, h * 0.45); g.lineTo(w * 0.92, h * 0.28); g.lineTo(w * 0.92, h * 0.58); g.lineTo(w * 0.08, h * 0.58); g.fill();
  txt(g, 'みどり美術館', w / 2, h * 0.67, h * 0.065, '#2c3a30', 800);
  txt(g, '特別展「ひかりの 風景」', w / 2, h * 0.76, h * 0.05, '#2c3a30', 700, 'center', w * 0.9);
  txt(g, '9:30〜17:00（土・日 20:00まで）', w / 2, h * 0.85, h * 0.035, '#555', 700, 'center', w * 0.9);
  txt(g, '月曜 休館', w / 2, h * 0.91, h * 0.035, '#555', 700);
}

function drawAreaMap(g, w, h) {
  g.fillStyle = '#f7f4ea'; g.fillRect(0, 0, w, h);
  g.fillStyle = NAVY; g.fillRect(0, 0, w, h * 0.13);
  txt(g, '駅周辺案内図  Area Map', w / 2, h * 0.065, h * 0.075, '#fff', 800);
  // station (bottom), square, road, shops (top)
  g.fillStyle = '#c9c3b6'; g.fillRect(w * 0.08, h * 0.8, w * 0.84, h * 0.12);
  txt(g, 'ことばまち駅', w / 2, h * 0.86, h * 0.06, '#333', 800);
  g.fillStyle = '#9aa0a6'; g.fillRect(w * 0.05, h * 0.47, w * 0.9, h * 0.13);
  const shops = [['ぎんこう', '#1f4f8f'], ['ゆうびんきょく', '#e2412f'], ['スーパー', '#f08c2e']];
  shops.forEach(([t, col], i) => {
    const x = w * (0.06 + i * 0.3);
    g.fillStyle = col; g.fillRect(x, h * 0.2, w * 0.27, h * 0.22);
    txt(g, t, x + w * 0.135, h * 0.31, h * 0.055, '#fff', 800, 'center', w * 0.25);
  });
  g.fillStyle = '#2f6db3'; g.beginPath(); g.arc(w * 0.82, h * 0.69, h * 0.04, 0, 6.3); g.fill();
  txt(g, 'バス', w * 0.82, h * 0.755, h * 0.04, '#2f6db3', 800);
  g.fillStyle = '#e8452f'; g.beginPath(); g.arc(w * 0.5, h * 0.72, h * 0.035, 0, 6.3); g.fill();
  txt(g, '現在地', w * 0.5, h * 0.66, h * 0.045, '#e8452f', 800);
}

function drawBusSign(g, w, h) {
  const r = w / 2;
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(r, r, r * 0.98, 0, 6.3); g.fill();
  g.strokeStyle = '#2f6db3'; g.lineWidth = r * 0.12; g.beginPath(); g.arc(r, r, r * 0.88, 0, 6.3); g.stroke();
  txt(g, 'バスのりば', r, r * 0.72, r * 0.26, '#2f6db3', 800, 'center', w * 0.75);
  txt(g, 'ことばまち駅前', r, r * 1.12, r * 0.17, '#333', 800, 'center', w * 0.7);
  txt(g, 'BUS STOP', r, r * 1.42, r * 0.14, '#2f6db3', 700);
}

function drawBusTimetable(g, w, h, H) {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#2f6db3'; g.fillRect(0, 0, w, h * 0.14);
  txt(g, '時刻表', w / 2, h * 0.07, h * 0.08, '#fff', 800);
  for (let i = 0; i < 6; i++) {
    const y = h * (0.24 + i * 0.13);
    txt(g, `${H + Math.floor(i / 2)}`, w * 0.15, y, h * 0.07, '#333', 800);
    txt(g, i % 2 ? '15  45' : '05  35', w * 0.62, y, h * 0.065, '#333', 700);
  }
}

function drawVending(g, w, h, k) {
  g.fillStyle = '#eef2f5'; g.fillRect(0, 0, w, h);
  const cols = ['#e7413a', '#f2b23a', '#2f9a62', '#5d8fd0', '#f2f2ee', '#8a5a3a', '#e8c04a', '#2a2d31'];
  const r = K.rng(k + 3);
  for (let row = 0; row < 3; row++) for (let i = 0; i < 6; i++) {
    const x = w * (0.04 + i * 0.16); const y = h * (0.04 + row * 0.3);
    g.fillStyle = cols[Math.floor(r() * cols.length)];
    K.roundRect(g, x + w * 0.02, y, w * 0.1, h * 0.19, 6); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(x + w * 0.03, y + h * 0.05, w * 0.02, h * 0.1);
    txt(g, ['120', '140', '160', '130'][(i + row) % 4], x + w * 0.07, y + h * 0.22, h * 0.04, '#333', 800);
    g.fillStyle = '#3aa0e8'; g.fillRect(x + w * 0.04, y + h * 0.255, w * 0.06, h * 0.012);
  }
}

// ====================================================================== textures & helpers
let tactileCache = {};
function tactileTex(kind) {
  if (tactileCache[kind]) return tactileCache[kind];
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#e7bd22'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(120,90,10,0.45)'; g.lineWidth = 2; g.strokeRect(1, 1, 126, 126);
  if (kind === 'dot') {
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
      const cx = 13 + x * 25.5; const cy = 13 + y * 25.5;
      g.fillStyle = 'rgba(110,80,0,0.35)'; g.beginPath(); g.arc(cx + 1.5, cy + 1.5, 8, 0, 6.3); g.fill();
      g.fillStyle = '#f6d24a'; g.beginPath(); g.arc(cx, cy, 8, 0, 6.3); g.fill();
    }
  } else {
    for (let i = 0; i < 4; i++) {
      const y = 16 + i * 32;
      g.fillStyle = 'rgba(110,80,0,0.35)'; g.fillRect(10, y - 5, 110, 12);
      g.fillStyle = '#f6d24a'; g.fillRect(8, y - 7, 110, 12);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  tactileCache[kind] = t;
  return t;
}

const facadeCache = {};
function facadeMat(lit) {
  const k = lit ? 'lit' : 'day';
  if (facadeCache[k]) return facadeCache[k];
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#d4d0c8'; g.fillRect(0, 0, 256, 256);
  const r = K.rng(4);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const on = lit && r() > 0.4;
    g.fillStyle = on ? '#ffd98a' : '#7d95a3';
    g.fillRect(x * 64 + 10, y * 64 + 14, 44, 34);
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x * 64 + 8, y * 64 + 50, 48, 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, emissive: lit ? '#ffffff' : '#000000', emissiveMap: lit ? t : null, emissiveIntensity: lit ? 0.35 : 0 });
  facadeCache[k] = m;
  return m;
}
/** Building block with a window-grid texture: 1 texture tile = 4 m × 4 m (4 storeys of 1 m windows). */
function facadeBox(m, w, h, d, { x = 0, z = 0 } = {}) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  const sizes = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const k = f * 4 + i;
    uv.setXY(k, uv.getX(k) * sizes[f][0] / 4, uv.getY(k) * sizes[f][1] / 4);
  }
  for (let i = 8; i < 16; i++) uv.setXY(i, 0.02, 0.02); // roofs: plain wall colour
  return K.mesh(geo, m, { x, y: h / 2, z });
}

function uvPlane(w, h, rx, ry) { // subdivided: one huge triangle pair under the camera breaks depth precision
  const geo = new THREE.PlaneGeometry(w, h, Math.min(40, Math.max(1, Math.ceil(w / 3))), Math.min(40, Math.max(1, Math.ceil(h / 3))));
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * rx, uv.getY(i) * ry);
  return geo;
}

/** Merge every mesh under a moving group into one mesh per material (keeps the group dynamic). */
function mergeDynamic(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const by = new Map(); const victims = [];
  group.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    let geo = o.geometry.clone();
    for (const n of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(n)) geo.deleteAttribute(n);
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    if (geo.index) geo = geo.toNonIndexed();
    if (!by.has(o.material)) by.set(o.material, []);
    by.get(o.material).push(geo);
    victims.push(o);
  });
  for (const o of victims) o.parent.remove(o);
  for (const c of [...group.children]) group.remove(c);
  for (const [mat, list] of by) {
    const m = new THREE.Mesh(mergeGeometries(list, false), mat);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  }
  group.userData.dynamic = true;
  return group;
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
