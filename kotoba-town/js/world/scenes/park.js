// park — さくら公園 in hanami season: the learner stands on the lawn under a big cherry tree, at the
// corner of a blue picnic sheet (bento, drinks, camera); a wooden bench faces them on the right
// (原 さん sits there in l05b). Beyond: the lantern-lined path, the food stalls (屋台: だんご …) on the
// right, the pond with a red bridge, and the castle on its hill far away.
// Seasons: sakura + falling petals in spring, green in summer, red/yellow leaves in autumn, bare in winter.
// Learner stands at the origin looking toward -z.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as K from '../kit.js';

export const meta = { indoor: false, ambience: 'park' };

const BARK = '#6a5347';

export default function build({ setup }) {
  const time = setup.time || 'noon';
  const season = setup.season || 'spring';
  const rain = setup.weather === 'rain';
  const lampsOn = time === 'evening' || time === 'night';
  const night = time === 'night';
  const g = new THREE.Group();
  const P = paletteKit();
  const S = signKit(false);
  const L = signKit(true);
  const props = {};
  const put = (o, x = 0, y = 0, z = 0, ry = 0, parent = g) => { o.position.set(x, y, z); o.rotation.y = ry; parent.add(o); return o; };

  // ------------------------------------------------------------------ ground: lawn, paths, puddles
  const grassTint = { spring: '#a9c98a', summer: '#86b46a', autumn: '#b6b27a', winter: '#a8a487' }[season] || '#9cc27e';
  const grass = new THREE.MeshStandardMaterial({ map: grassTex(), color: grassTint, roughness: rain ? 0.55 : 0.95 });
  g.add(K.mesh(uvPlane(320, 320, 320 / 4, 320 / 4), grass, { z: -20, rx: -Math.PI / 2, cast: false }));
  const gravel = K.mat('#ffffff', { map: K.noiseTex(rain ? '#a99d84' : '#d3c6a8', 0.22, [1, 1], 'gravel'), rough: rain ? 0.35 : 0.95 });
  g.add(K.mesh(uvPlane(70, 2.6, 70 / 2, 2.6 / 2), gravel, { y: 0.01, z: -6.5, rx: -Math.PI / 2, cast: false }));       // main path (left–right)
  g.add(K.mesh(uvPlane(2.2, 22, 2.2 / 2, 22 / 2), gravel, { x: 3.7, y: 0.012, z: 5.9, rx: -Math.PI / 2, cast: false })); // path from the entrance behind
  for (let i = 0; i < 70; i++) { // path edge stones
    const x = -35 + i; if (Math.abs(x - 3.7) < 1.3) continue;
    g.add(P.box(0.9, 0.06, 0.12, '#b9b1a1', { x, y: 0, z: -5.15 }));
  }
  if (rain) for (const [x, z, s] of [[-2, -6.4, 0.9], [5.5, -6.8, 1.2], [3.5, 2, 0.7], [-9, -6.2, 1.0]]) {
    g.add(P.mesh(new THREE.RingGeometry(0.01, s, 24, 3), '#7f8a90', { x, y: 0.016, z, rx: -Math.PI / 2, cast: false }, 'gloss'));
  }

  // ------------------------------------------------------------------ trees
  const B = blossomMats(season, night);
  // the big cherry tree by the conversation (canopy reaches over the picnic sheet)
  const bigTree = cherryTree(P, B, season, 7, { s: 1.25, bias: [0.55, 0.65], trunkH: 2.1, lush: true, detail: 1 });
  put(bigTree, -1.5, 0, -2.05);
  props.sakura = K.prop('sakura', bigTree, { labelJa: 'さくら', labelEn: 'cherry tree' });
  const treeSpots = [
    [-5.5, -3.2, 1.0], [-10.5, -4.2, 1.15], [-16, -3.6, 1.0], [5.6, -3.4, 1.05], [11, -4.0, 1.1], [17, -3.5, 1.0],
    [-7.5, -9.2, 1.1], [-13.5, -9.6, 1.0], [8.5, -10.6, 1.15], [14.5, -10.2, 1.0], [-21, -8.6, 1.1], [21, -9.2, 1.0],
    [-5.5, 4.0, 1.1], [0.8, 6.8, 1.0], [7.5, 5.0, 1.15], [-11, 3.0, 1.0], [12.5, 2.5, 1.05], [-3.0, 11, 1.0], [9, 12, 1.1],
  ];
  treeSpots.forEach(([x, z, s], i) => { const d = Math.hypot(x, z); put(cherryTree(P, B, season, 11 + i * 3, { s, detail: d < 11 ? 1 : 0, cast: d < 9 }), x, 0, z, i); });
  // far tree belts around the park
  for (let i = 0; i < 26; i++) {
    const a = -Math.PI * 0.95 + i * 0.075 * Math.PI; const r = 34 + (i % 4) * 3;
    put(farTree(P, B, season, i), Math.sin(a) * r, 0, -Math.cos(a) * r * 0.9 - 6, 0);
  }
  for (let i = 0; i < 10; i++) put(farTree(P, B, season, 40 + i), -30 + i * 7, 0, 26 + (i % 2) * 3, 0);

  // ------------------------------------------------------------------ picnic sheet (near, left) with bento, drinks, camera
  const sheet = new THREE.Group();
  sheet.add(K.mesh(new THREE.PlaneGeometry(1.9, 1.6, 6, 6), K.mat('#ffffff', { map: tarpTex(), rough: rain ? 0.2 : 0.55 }), { y: 0.012, rx: -Math.PI / 2, cast: false }));
  put(sheet, -1.0, 0, -0.32, 0.06);
  props.picnic_sheet = K.prop('picnic_sheet', sheet, { labelJa: 'レジャーシート', labelEn: 'picnic sheet' });
  for (const [x, z] of [[-1.92, -1.08], [-0.08, -1.18], [-1.95, 0.45], [-0.12, 0.5]]) g.add(P.cyl(0.035, 0.03, 0.05, '#c9c4b6', { x, z }, 'matte', 8)); // stones on the corners
  const bento = jubako(P);
  put(bento, -0.62, 0.012, -0.42, 0.25);
  props.bento = K.prop('bento', bento, { labelJa: 'おべんとう', labelEn: 'lunch box' });
  const drinks = drinkSet(P, S);
  put(drinks, -1.12, 0.012, -0.08, -0.3);
  props.drinks = K.prop('drinks', drinks, { labelJa: 'のみもの（おちゃ・ビール）', labelEn: 'drinks (tea, beer)' });
  const cam = camera(P);
  put(cam, -0.36, 0.012, 0.08, -0.6);
  props.camera = K.prop('camera', cam, { labelJa: 'カメラ', labelEn: 'camera' });
  // paper plates, chopsticks, a cushion, a tote bag and the shoes taken off at the edge
  for (const [x, z] of [[-0.95, -0.75], [-1.45, -0.6]]) {
    g.add(P.cyl(0.11, 0.09, 0.015, '#f6f4ee', { x, y: 0.014, z }, 'satin', 16));
    g.add(P.box(0.2, 0.008, 0.012, '#c9a46a', { x: x + 0.02, y: 0.03, z: z + 0.03, ry: 0.4 }));
    g.add(P.box(0.2, 0.008, 0.012, '#c9a46a', { x: x + 0.02, y: 0.03, z: z + 0.05, ry: 0.42 }));
  }
  g.add(P.rbox(0.45, 0.08, 0.45, 0.04, '#e8a33c', { x: -1.6, y: 0.012, z: -0.95 }, 'satin'));
  const tote = new THREE.Group();
  tote.add(P.rbox(0.36, 0.3, 0.14, 0.03, '#e9e1cf', {}, 'matte'));
  tote.add(P.mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 14, Math.PI), '#b98b5e', { y: 0.3 }));
  put(tote, -1.75, 0.012, 0.25, 0.4);
  for (const [x, z, c] of [[-0.6, 0.62, '#f2f2ee'], [-0.82, 0.62, '#4d6b8a']]) {
    for (const dx of [-0.05, 0.05]) g.add(P.rbox(0.09, 0.08, 0.25, 0.04, c, { x: x + dx, z: z + 0.04 }, 'satin'));
  }
  if (rain) { const u = umbrellaClosed(P, '#2f6db3'); put(u, -1.85, 0.06, -0.3, 0.3); u.rotation.z = Math.PI / 2; }

  // ------------------------------------------------------------------ the bench (near, front-right) — npc2 sits on it
  const benchPos = { x: 0.82, z: -0.58 };
  const benchYaw = K.faceYaw(benchPos, { x: 0.15, z: 0.25 });
  const bench = parkBench(P);
  put(bench, benchPos.x, 0, benchPos.z, benchYaw);
  props.bench = K.prop('bench', bench, { labelJa: 'ベンチ', labelEn: 'bench' });
  const seat = (lx) => ({ x: benchPos.x + Math.cos(benchYaw) * lx + Math.sin(benchYaw) * -0.06, z: benchPos.z - Math.sin(benchYaw) * lx + Math.cos(benchYaw) * -0.06 });
  const sitSpot = seat(-0.42);

  // ------------------------------------------------------------------ main path: lanterns, lamps, bicycle
  // lantern strings (ちょうちん) on both sides of the path, plus one across the lawn in front
  const lanternPoles = [];
  for (let x = -19.5; x <= 19.5; x += 6.5) for (const z of [-5.0, -8.0]) lanternPoles.push([x, z]);
  for (const [x, z] of lanternPoles) g.add(P.cyl(0.05, 0.06, 2.9, '#6b5440', { x, z }, 'matte', 8));
  const lantern = lanternMaker(P, lampsOn);
  for (const z of [-5.0, -8.0]) for (let x = -19.5; x < 19.5; x += 6.5) lanternString(P, g, lantern, [x, 2.75, z], [x + 6.5, 2.75, z], 6, 0.35);
  g.add(P.cyl(0.05, 0.06, 2.9, '#6b5440', { x: -3.6, z: -3.9 }, 'matte', 8));
  g.add(P.cyl(0.05, 0.06, 2.9, '#6b5440', { x: 3.4, z: -4.6 }, 'matte', 8));
  lanternString(P, g, lantern, [-3.6, 2.75, -3.9], [3.4, 2.75, -4.6], 7, 0.45);
  for (const x of [-12, 9.5, 20]) put(parkLamp(P, lampsOn), x, 0, -8.6, 0);
  put(parkLamp(P, lampsOn), 2.4, 0, 3.2, 0);
  const bike = bicycle(P);
  put(bike, -3.4, 0, -5.55, 0.15);
  props.bicycle = K.prop('bicycle', bike, { labelJa: 'じてんしゃ', labelEn: 'bicycle' });

  // ------------------------------------------------------------------ food stalls (屋台) along the path, right
  const stalls = [['dango', 3.6], ['yakisoba', 6.4], ['takoyaki', 9.2], ['ramune', 12.0]];
  const smoke = [];
  for (const [kind, x] of stalls) {
    const st = yatai(P, S, L, kind, lampsOn);
    put(st, x, 0, -9.0, 0);
    if (kind === 'dango') props.food_stall = K.prop('food_stall', st, { labelJa: 'だんごの やたい', labelEn: 'dango stall' });
    if (kind === 'yakisoba' || kind === 'takoyaki') smoke.push(new THREE.Vector3(x - 0.3, 1.1, -9.0));
  }
  const vend = vendingMachine(P, L, 0);
  put(vend, 1.4, 0, -9.0, 0);
  props.vending_machine = K.prop('vending_machine', vend, { labelJa: 'じどうはんばいき', labelEn: 'vending machine' });
  g.add(P.box(0.4, 0.75, 0.38, '#2f9a62', { x: 2.05, z: -8.9 }, 'satin')); // recycle bin by the machine
  put(S.sign(['ペットボトル'], 0.34, 0.1, { bg: '#2f9a62', fg: '#fff' }), 2.05, 0.6, -8.705);
  // festival banners (のぼり) — they sway
  const nobori = [];
  for (const [x, z, c] of [[2.6, -7.9, '#e8507a'], [5.0, -7.9, '#ffffff'], [7.8, -7.9, '#e8507a'], [10.6, -7.9, '#ffffff'], [-6, -7.95, '#e8507a']]) {
    const n = new THREE.Group();
    n.add(P.cyl(0.02, 0.02, 2.6, '#9a8a6a', {}, 'matte', 6));
    const flag = new THREE.Group();
    const face = S.draw(0.42, 1.7, 220, (cc, w, h) => drawNobori(cc, w, h, c, season));
    face.position.set(0.23, 1.62, 0.006); flag.add(face);
    const back = S.draw(0.42, 1.7, 220, (cc, w, h) => drawNobori(cc, w, h, c, season));
    back.position.set(0.23, 1.62, -0.006); back.rotation.y = Math.PI; flag.add(back);
    flag.userData.dynamic = true;
    n.add(flag);
    put(n, x, 0, z, 0.25);
    nobori.push(flag);
  }

  // ------------------------------------------------------------------ pond with a red bridge (far)
  const pond = new THREE.Group();
  const water = new THREE.MeshStandardMaterial({ map: waterTex(time, season), roughness: 0.12, metalness: 0.15 });
  const wgeo = new THREE.RingGeometry(0.01, 1, 48, 8);
  const wm = K.mesh(wgeo, water, { y: -0.12, rx: -Math.PI / 2, cast: false });
  wm.scale.set(8.5, 5.0, 1);
  pond.add(wm);
  const r = K.rng(31);
  for (let i = 0; i < 64; i++) { // stone rim
    const a = i / 64 * Math.PI * 2;
    const st = P.mesh(new THREE.IcosahedronGeometry(0.32 + r() * 0.2, 0), ['#9b968b', '#8a857b', '#aaa498'][i % 3], { x: Math.cos(a) * 8.6, y: 0.0, z: Math.sin(a) * 5.1 });
    st.scale.set(1.3, 0.55, 1); st.rotation.y = r() * 3; pond.add(st);
  }
  const bed = K.mesh(new THREE.RingGeometry(0.01, 1, 48, 6), K.mat('#5e5a4c', { rough: 1 }), { x: -5.5, y: -0.13, z: -14, rx: -Math.PI / 2, cast: false });
  bed.scale.set(8.6, 5.1, 1); g.add(bed);
  pond.add(redBridge(P));
  put(stoneLantern(P, lampsOn), 4.6, 0, -2.6, 0, pond);
  put(stoneLantern(P, lampsOn), -9.2, 0, -1.5, 0, pond);
  if (season === 'summer') for (let i = 0; i < 9; i++) pond.add(P.mesh(new THREE.CircleGeometry(0.28, 10), '#4f8a46', { x: -5 + r() * 4, y: -0.1, z: -1 + r() * 3, rx: -Math.PI / 2, cast: false }, 'satin'));
  put(pond, -5.5, 0, -14, 0);
  props.pond = K.prop('pond', pond, { labelJa: 'いけ', labelEn: 'pond' });
  // ducks swimming slowly
  const ducks = [];
  for (let i = 0; i < 3; i++) { const d = duck(P, i); d.userData.dynamic = true; g.add(d); ducks.push(d); }
  // rope fence along the pond side of the path
  for (let x = -13; x <= 1.5; x += 1.6) g.add(P.cyl(0.03, 0.03, 0.55, '#7a6248', { x, z: -8.4 }, 'matte', 6));
  g.add(P.box(14.5, 0.02, 0.02, '#c9b48a', { x: -5.75, y: 0.48, z: -8.4 }));

  // ------------------------------------------------------------------ castle on its hill (far)
  const hill = P.mesh(new THREE.IcosahedronGeometry(1, 2), { spring: '#6f9a5c', summer: '#5b8a4a', autumn: '#8a8a52', winter: '#7f7f66' }[season], { x: -30, y: -6, z: -96 });
  hill.scale.set(38, 14, 26); g.add(hill);
  for (let i = 0; i < 18; i++) {
    const a = i / 18 * Math.PI * 2; const rr = 0.7 + (i % 3) * 0.1;
    put(farTree(P, B, season, 60 + i, 1.6), -30 + Math.cos(a) * 30 * rr, 3 + (1 - rr) * 8, -96 + Math.sin(a) * 18 * rr, 0);
  }
  const castleG = castle(P, lampsOn);
  put(castleG, -30, 6.5, -98, 0.35);
  props.castle = K.prop('castle', castleG, { labelJa: 'おしろ', labelEn: 'castle' });
  // the town beyond the park (behind and to the sides) and a ring of distant hills
  const town = K.rng(88);
  for (let i = 0; i < 26; i++) {
    const a = Math.PI * 0.32 + i * (Math.PI * 1.36 / 25); const rr = 62 + town() * 18;
    const w = 8 + town() * 10; const h = 6 + town() * 16;
    const b = P.box(w, h, 8, ['#d9d4c8', '#cfd3d6', '#e3dccd', '#bfc6cc'][i % 4], { x: Math.sin(a) * rr, z: -Math.cos(a) * rr - 6, ry: -a, cast: false });
    g.add(b);
    for (let k = 0; k < Math.floor(h / 3); k++) g.add(P.box(w * 0.8, 0.9, 0.1, time === 'night' || time === 'evening' ? '#ffd890' : '#8ea2ae', { x: Math.sin(a) * (rr - 4.05), y: 1.2 + k * 3, z: -Math.cos(a) * (rr - 4.05) - 6, ry: -a, cast: false }, time === 'night' || time === 'evening' ? 'glow' : 'gloss'));
  }
  for (const [x, z, sx, sy] of [[60, -140, 70, 24], [-90, -130, 80, 30], [10, -170, 90, 36], [-150, -40, 50, 22], [150, -30, 60, 20], [-140, 80, 70, 26], [20, 150, 90, 30], [140, 90, 70, 24]]) {
    const h = P.mesh(new THREE.IcosahedronGeometry(1, 2), season === 'winter' ? '#8a8f86' : season === 'autumn' ? '#8f8a5a' : '#6f9172', { x, y: -4, z }, 'matte');
    h.scale.set(sx, sy, sx * 0.5); h.castShadow = false; g.add(h);
  }

  // ------------------------------------------------------------------ behind the learner: park sign, fountain, swings, other hanami sheets
  const sign = new THREE.Group();
  for (const x of [-0.75, 0.75]) sign.add(P.box(0.1, 1.9, 0.1, '#6b5440', { x }));
  sign.add(P.box(1.7, 0.08, 0.2, '#5a4636', { y: 1.9 }));
  const signFace = S.draw(1.5, 1.05, 260, drawParkMap);
  put(signFace, 0, 1.25, 0.06, 0, sign);
  sign.add(P.box(1.56, 1.1, 0.08, '#6b5440', { y: 0.7 }));
  put(sign, 4.9, 0, 4.2, -Math.PI * 0.75);
  const fountain = new THREE.Group();
  fountain.add(P.cyl(0.18, 0.24, 0.85, '#b9b4aa', {}, 'matte', 12));
  fountain.add(P.cyl(0.3, 0.26, 0.12, '#c9c4ba', { y: 0.85 }, 'matte', 16));
  fountain.add(P.cyl(0.015, 0.015, 0.12, '#c0c4c8', { y: 0.95 }, 'metal', 6));
  put(fountain, -2.2, 0, 3.6, 0);
  put(swings(P), -8.5, 0, 6.5, 0.3);
  for (const [x, z, ry, k] of [[-4.2, 0.4, 0.2, 1], [2.6, 1.6, -0.3, 2], [-6.2, -1.6, 0.5, 3], [6.2, -1.3, -0.1, 4]]) put(otherSheet(P, k), x, 0, z, ry);
  for (const [x, z] of [[-0.8, 5.2], [6.5, 7.5]]) {
    g.add(P.box(0.5, 0.85, 0.45, '#2f6db3', { x, z }, 'satin'));
    g.add(P.box(0.5, 0.85, 0.45, '#d8473a', { x: x + 0.55, z }, 'satin'));
    put(S.sign(['もえるごみ'], 0.4, 0.12, { bg: '#d8473a', fg: '#fff' }), x + 0.55, 0.6, z - 0.23, Math.PI);
    put(S.sign(['かん・びん'], 0.4, 0.12, { bg: '#2f6db3', fg: '#fff' }), x, 0.6, z - 0.23, Math.PI);
  }
  // pigeons on the path
  for (const [x, z, ry] of [[-1.2, -6.2, 0.4], [-0.6, -6.6, 2.2], [0.3, -6.0, -1]]) put(pigeon(P), x, 0.01, z, ry);

  if (lampsOn) { // warm light from the lanterns and the stalls after dark
    const l1 = new THREE.PointLight('#ffc89a', night ? 10 : 5, 14, 1.3); l1.position.set(0.2, 2.6, -3.0); g.add(l1);
    const l2 = new THREE.PointLight('#ffd2a0', night ? 9 : 4, 12, 1.4); l2.position.set(7.5, 2.4, -7.6); g.add(l2);
  }

  // ------------------------------------------------------------------ petals / leaves (dynamic points)
  let fall = null;
  if (season === 'spring' || season === 'autumn') {
    fall = fallingPetals(season, 520);
    g.add(fall.points);
    // fallen petals on the ground and the sheet
    const pr = K.rng(77);
    const pcol = season === 'spring' ? ['#f7d3de', '#f2bccd', '#fbe4ea'] : ['#d9762e', '#e3a03a', '#c4552a'];
    for (let i = 0; i < 360; i++) {
      const a = pr() * 6.28; const d = Math.sqrt(pr()) * 7;
      const p = P.mesh(new THREE.PlaneGeometry(0.035, 0.03), pcol[i % 3], { x: -0.5 + Math.cos(a) * d, y: 0.02 + (i % 5) * 0.0005, z: -2.5 + Math.sin(a) * d, rx: -Math.PI / 2, rz: pr() * 3, cast: false }, 'matte');
      g.add(p);
    }
  }
  // steam from the grills
  const steam = steamPuffs(smoke);
  g.add(steam.points);

  S.commit(); L.commit();
  for (const d of ducks) mergeDynamic(d);

  // ------------------------------------------------------------------ slots + animation
  return K.finalize({
    group: g,
    spawn: K.spot(0, 0, 0),
    slots: {
      npc1: K.spot(-0.05, -1.45, K.faceYaw({ x: -0.05, z: -1.45 }, { x: 0, z: 0 })),
      npc2: { ...K.spot(sitSpot.x, sitSpot.z, benchYaw), sit: 0.43 },
      phone: null,
    },
    props,
    center: new THREE.Vector3(0, 0, -4),
    radius: 13,
    update(dt, t) {
      fall?.update(dt, t);
      steam.update(dt, t);
      nobori.forEach((f, i) => { f.rotation.y = Math.sin(t * 1.3 + i * 1.7) * 0.18; f.rotation.z = Math.sin(t * 2.1 + i) * 0.015; });
      ducks.forEach((d, i) => {
        const a = t * (0.05 + i * 0.012) + i * 2.1;
        d.position.set(-5.5 + Math.cos(a) * (5.2 - i), -0.12 + Math.sin(t * 2 + i) * 0.006, -14 + Math.sin(a) * (2.8 - i * 0.4));
        d.rotation.y = -a + (i % 2 ? Math.PI : 0) - Math.PI / 2 * (i % 2 ? -1 : 1);
      });
      water.map.offset.x = Math.sin(t * 0.1) * 0.01;
    },
  });
}

// ====================================================================== trees & nature
function blossomMats(season, night) {
  if (season === 'winter') return null;
  const base = { spring: ['#f6c9d6', '#fbe3ea', '#e9a1b8', '#ffffff'], summer: ['#5c9a4e', '#79b062', '#3f7438', '#8cc070'], autumn: ['#d9762e', '#e8b040', '#bf4a2a', '#e68a3a'] }[season];
  const tex = blobTex(season, base);
  const mk = (color) => new THREE.MeshStandardMaterial({ map: tex, color, roughness: 0.95, emissive: night && season === 'spring' ? '#4a2a34' : '#000000' });
  return { light: mk('#ffffff'), dark: mk(season === 'spring' ? '#e8c4cf' : '#c9c9c9') };
}

function cherryTree(P, B, season, seed, { s = 1, bias = [0, 0], trunkH = 1.7, lush = false, detail = 1, cast = true } = {}) {
  const t = new THREE.Group();
  const r = K.rng(seed);
  const th = trunkH * s;
  const lean = (r() - 0.5) * 0.12;
  t.add(P.cyl(0.13 * s, 0.2 * s, th, BARK, { rz: lean }, 'matte', 9));
  t.add(P.cyl(0.24 * s, 0.3 * s, 0.25, BARK, {}, 'matte', 9));
  const top = new THREE.Vector3(-Math.sin(lean) * th, th, 0);
  const n = 5;
  const tips = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + r() * 0.8;
    const dir = new THREE.Vector3(Math.cos(a) + bias[0] * 0.8, 0.9 + r() * 0.5, Math.sin(a) + bias[1] * 0.8).normalize();
    const len = (1.5 + r() * 0.9) * s;
    const br = branch(P, top, dir, len, 0.09 * s, 0.05 * s);
    t.add(br);
    const tip = top.clone().addScaledVector(dir, len);
    tips.push(tip);
    // secondary branch
    const dir2 = dir.clone().add(new THREE.Vector3((r() - 0.5) * 1.2, 0.2, (r() - 0.5) * 1.2)).normalize();
    const mid = top.clone().addScaledVector(dir, len * 0.55);
    t.add(branch(P, mid, dir2, len * 0.6, 0.045 * s, 0.025 * s));
    tips.push(mid.clone().addScaledVector(dir2, len * 0.6));
    if (season === 'winter') for (let k = 0; k < 3; k++) {
      const d3 = dir.clone().add(new THREE.Vector3((r() - 0.5) * 1.6, r() * 0.6, (r() - 0.5) * 1.6)).normalize();
      t.add(branch(P, tip, d3, len * 0.35, 0.02 * s, 0.008 * s));
    }
  }
  if (!B) return t;
  for (const tip of tips) {
    const k = (lush ? 2 : 1) + Math.floor(r() * 2);
    for (let j = 0; j < k; j++) {
      const rad = (0.55 + r() * 0.45) * s;
      const m = K.mesh(new THREE.IcosahedronGeometry(rad, detail), j % 2 ? B.dark : B.light, { x: tip.x + (r() - 0.5) * 0.9 * s, y: tip.y + (r() - 0.3) * 0.5 * s, z: tip.z + (r() - 0.5) * 0.9 * s, cast });
      m.scale.set(1.25, 0.72, 1.25);
      m.rotation.y = r() * 3;
      t.add(m);
    }
  }
  // a crown blob over the trunk
  const crown = K.mesh(new THREE.IcosahedronGeometry(1.0 * s, detail), B.light, { x: top.x + bias[0] * s, y: top.y + 1.3 * s, z: top.z + bias[1] * s, cast });
  crown.scale.set(1.5, 0.7, 1.5);
  t.add(crown);
  return t;
}

function branch(P, from, dir, len, r0, r1) {
  const m = P.mesh(new THREE.CylinderGeometry(r1, r0, len, 5), BARK, {}, 'matte');
  m.position.copy(from).addScaledVector(dir, len / 2);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  return m;
}

function farTree(P, B, season, seed, s = 1.3) {
  const t = new THREE.Group();
  const r = K.rng(seed);
  t.add(P.cyl(0.15 * s, 0.22 * s, 2.0 * s, BARK, {}, 'matte', 6));
  if (!B) {
    for (let i = 0; i < 4; i++) {
      const a = r() * 6.28;
      t.add(branch(P, new THREE.Vector3(0, 1.8 * s, 0), new THREE.Vector3(Math.cos(a), 1.2, Math.sin(a)).normalize(), 1.6 * s, 0.07 * s, 0.02 * s));
    }
    return t;
  }
  for (let i = 0; i < 4; i++) {
    const m = K.mesh(new THREE.IcosahedronGeometry((1.1 + r() * 0.5) * s, 0), i % 2 ? B.dark : B.light, { x: (r() - 0.5) * 1.6 * s, y: (2.6 + r() * 1.2) * s, z: (r() - 0.5) * 1.6 * s, cast: false });
    m.scale.set(1.2, 0.85, 1.2);
    t.add(m);
  }
  return t;
}

function fallingPetals(season, n) {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = season === 'spring' ? '#fbd6e1' : '#e58a3a';
  g.beginPath(); g.ellipse(16, 16, 13, 8, 0.5, 0, 6.3); g.fill();
  g.fillStyle = season === 'spring' ? '#f3b2c6' : '#c4552a';
  g.beginPath(); g.ellipse(18, 15, 6, 3, 0.5, 0, 6.3); g.fill();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const pos = new Float32Array(n * 3); const seeds = new Float32Array(n);
  const r = K.rng(5);
  const AREA = { x0: -9, x1: 8, z0: -13, z1: 5 };
  for (let i = 0; i < n; i++) {
    pos[i * 3] = AREA.x0 + r() * (AREA.x1 - AREA.x0); pos[i * 3 + 1] = r() * 5.5; pos[i * 3 + 2] = AREA.z0 + r() * (AREA.z1 - AREA.z0);
    seeds[i] = r();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ map: tex, size: season === 'spring' ? 0.05 : 0.08, sizeAttenuation: true, transparent: true, alphaTest: 0.4, depthWrite: false });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.userData.dynamic = true;
  return {
    points,
    update(dt, t) {
      for (let i = 0; i < n; i++) {
        const s = seeds[i];
        pos[i * 3 + 1] -= dt * (0.28 + s * 0.3);
        pos[i * 3] += dt * (0.25 + Math.sin(t * 0.7 + s * 20) * 0.35);
        pos[i * 3 + 2] += dt * Math.cos(t * 0.9 + s * 13) * 0.2;
        if (pos[i * 3 + 1] < 0.02) { pos[i * 3 + 1] = 4 + s * 1.8; pos[i * 3] = AREA.x0 + ((s * 7919 + t) % 1) * (AREA.x1 - AREA.x0); }
        if (pos[i * 3] > AREA.x1) pos[i * 3] = AREA.x0;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

function steamPuffs(sources) {
  const n = sources.length * 14;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30); grd.addColorStop(0, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  const pos = new Float32Array(n * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({ map: tex, size: 0.45, transparent: true, depthWrite: false, opacity: 0.6 }));
  points.frustumCulled = false;
  points.userData.dynamic = true;
  return {
    points,
    update(dt, t) {
      for (let i = 0; i < n; i++) {
        const src = sources[Math.floor(i / 14)]; const k = ((t * 0.35 + (i % 14) / 14) % 1);
        pos[i * 3] = src.x + Math.sin(k * 6 + i) * 0.12 * k; pos[i * 3 + 1] = src.y + k * 1.4; pos[i * 3 + 2] = src.z + Math.cos(k * 5 + i) * 0.1 * k;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

// ====================================================================== picnic things
function jubako(P) {
  const b = new THREE.Group(); // two-tier lacquer lunch box: one tier open beside the stacked lid tier
  const open = new THREE.Group();
  open.add(P.box(0.24, 0.07, 0.24, '#1d1a1a', {}, 'gloss'));
  open.add(P.box(0.22, 0.005, 0.22, '#9a1f1f', { y: 0.066 }, 'gloss'));
  // compartments: egg (卵), fish (魚), vegetables (野菜), rice balls
  for (let i = 0; i < 4; i++) open.add(P.box(0.045, 0.03, 0.05, '#f2cf4a', { x: -0.08 + (i % 2) * 0.05, y: 0.066, z: -0.07 + Math.floor(i / 2) * 0.055 }, 'satin'));
  for (let i = 0; i < 3; i++) open.add(P.box(0.06, 0.025, 0.035, '#f08a6a', { x: 0.05, y: 0.066, z: -0.08 + i * 0.04, ry: 0.1 }, 'satin'));
  for (let i = 0; i < 3; i++) {
    const o = P.mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 3), '#f7f5ef', { x: -0.07 + i * 0.065, y: 0.085, z: 0.065, rx: Math.PI / 2, rz: Math.PI / 2 }, 'satin');
    open.add(o);
    open.add(P.box(0.03, 0.022, 0.032, '#1f2a1f', { x: -0.07 + i * 0.065, y: 0.068, z: 0.065 }));
  }
  for (const [x, z, c, rr] of [[0.09, 0.03, '#3f8a3a', 0.022], [0.07, 0.07, '#d8302a', 0.016], [0.1, 0.08, '#3f8a3a', 0.02], [-0.02, 0.0, '#9a5a2a', 0.02]]) open.add(P.mesh(new THREE.SphereGeometry(rr, 8, 6), c, { x, y: 0.08, z }, 'satin'));
  b.add(open);
  const closed = new THREE.Group();
  closed.add(P.box(0.24, 0.14, 0.24, '#1d1a1a', {}, 'gloss'));
  closed.add(P.box(0.245, 0.012, 0.245, '#9a1f1f', { y: 0.07 }, 'gloss'));
  closed.add(P.box(0.25, 0.02, 0.25, '#1d1a1a', { y: 0.14 }, 'gloss'));
  closed.add(P.box(0.04, 0.165, 0.26, '#d8a03a', {}, 'satin'));
  put2(b, closed, 0.29, 0, 0.02, 0.1);
  for (const dz of [0, 0.02]) b.add(P.box(0.22, 0.008, 0.01, '#c9a46a', { x: 0.0, y: 0.002, z: -0.17 + dz, ry: 0.05 }));
  return b;
}

function drinkSet(P, S) {
  const d = new THREE.Group();
  // cooler box with beer cans
  const cool = new THREE.Group();
  cool.add(P.rbox(0.42, 0.28, 0.28, 0.03, '#2f6db3', {}, 'satin'));
  cool.add(P.rbox(0.44, 0.05, 0.3, 0.02, '#f2f2ee', { y: 0.28, z: -0.13, rx: -1.1 }, 'satin'));
  cool.add(P.box(0.38, 0.01, 0.24, '#bfe0f0', { y: 0.25 }, 'gloss'));
  for (let i = 0; i < 4; i++) cool.add(P.cyl(0.033, 0.033, 0.12, i % 2 ? '#d9c06a' : '#c9ccd0', { x: -0.12 + i * 0.08, y: 0.2, z: 0.02 }, 'metal', 10));
  put2(d, cool, 0, 0, 0);
  // green tea bottles + beer cans + paper cups
  for (let i = 0; i < 2; i++) {
    const b = new THREE.Group();
    b.add(P.cyl(0.035, 0.035, 0.19, '#cfe3c6', {}, 'gloss', 10));
    b.add(P.cyl(0.036, 0.036, 0.08, '#2f8a4a', { y: 0.06 }, 'satin', 10));
    b.add(P.cyl(0.015, 0.03, 0.04, '#cfe3c6', { y: 0.19 }, 'gloss', 8));
    b.add(P.cyl(0.016, 0.016, 0.02, '#2f8a4a', { y: 0.23 }, 'satin', 8));
    put2(d, b, 0.32 + i * 0.09, 0, 0.12);
  }
  for (let i = 0; i < 2; i++) d.add(P.cyl(0.033, 0.033, 0.12, i ? '#c9ccd0' : '#d9c06a', { x: 0.34 + i * 0.08, z: -0.05 }, 'metal', 10));
  for (let i = 0; i < 3; i++) d.add(P.cyl(0.035, 0.028, 0.08, '#f6f4ee', { x: -0.06 + i * 0.075, z: 0.25, y: 0 }, 'satin', 10));
  return d;
}

function camera(P) {
  const c = new THREE.Group();
  c.add(P.rbox(0.14, 0.09, 0.07, 0.012, '#2a2b2e', { y: 0.0 }, 'satin'));
  c.add(P.cyl(0.032, 0.035, 0.07, '#1b1c1e', { y: 0.045, z: 0.06, rx: Math.PI / 2 }, 'satin', 16));
  c.add(P.cyl(0.026, 0.026, 0.005, '#3a4a6a', { y: 0.045, z: 0.096, rx: Math.PI / 2 }, 'gloss', 16));
  c.add(P.box(0.04, 0.02, 0.04, '#2a2b2e', { x: -0.03, y: 0.09 }, 'satin'));
  c.add(P.box(0.02, 0.008, 0.02, '#c9ccd0', { x: 0.045, y: 0.09 }, 'metal'));
  c.add(P.mesh(new THREE.TorusGeometry(0.12, 0.006, 4, 20, Math.PI), '#2a2b2e', { y: 0.005, z: -0.08, rx: -Math.PI / 2 }));
  return c;
}

function umbrellaClosed(P, color) {
  const u = new THREE.Group();
  u.add(P.cyl(0.01, 0.045, 0.75, color, {}, 'satin', 8));
  u.add(P.mesh(new THREE.TorusGeometry(0.04, 0.012, 6, 10, Math.PI), '#6b5440', { y: 0.78, rz: Math.PI }));
  return u;
}

function otherSheet(P, k) {
  const s = new THREE.Group();
  s.add(P.mesh(new THREE.PlaneGeometry(1.8, 1.8, 2, 2), k % 2 ? '#3d78c9' : '#4a86d6', { y: 0.008, rx: -Math.PI / 2, cast: false }, 'satin'));
  const r = K.rng(k * 9);
  s.add(P.rbox(0.4, 0.26, 0.26, 0.03, ['#e8452f', '#f2f2ee', '#2f6db3'][k % 3], { x: -0.5, z: -0.5 }, 'satin'));
  s.add(P.rbox(0.36, 0.3, 0.14, 0.03, ['#e9e1cf', '#5d6b7a', '#c97a5d'][k % 3], { x: 0.5, z: -0.6, ry: r() }, 'matte'));
  s.add(P.rbox(0.45, 0.08, 0.45, 0.04, '#e8a33c', { x: 0.3, z: 0.3 }, 'satin'));
  for (const dx of [-0.05, 0.05]) s.add(P.rbox(0.09, 0.08, 0.25, 0.04, '#f2f2ee', { x: -0.2 + dx, z: 1.0 }, 'satin'));
  for (let i = 0; i < 3; i++) s.add(P.cyl(0.035, 0.035, 0.19, '#cfe3c6', { x: -0.1 + i * 0.09, z: 0.0 }, 'gloss', 8));
  return s;
}

function parkBench(P) {
  const b = new THREE.Group(); // faces +z, 1.5 m
  for (let i = 0; i < 3; i++) b.add(P.box(1.5, 0.04, 0.12, '#a5794e', { y: 0.4, z: -0.15 + i * 0.14 }, 'satin'));
  for (let i = 0; i < 2; i++) b.add(P.box(1.5, 0.12, 0.035, '#a5794e', { y: 0.55 + i * 0.17, z: -0.25 - i * 0.04, rx: -0.2 }, 'satin'));
  for (const x of [-0.68, 0.68]) {
    b.add(P.box(0.06, 0.42, 0.45, '#2f4a3a', { x, z: -0.03 }, 'metal'));
    b.add(P.box(0.06, 0.45, 0.06, '#2f4a3a', { x, y: 0.42, z: -0.27, rx: -0.2 }, 'metal'));
    b.add(P.box(0.07, 0.04, 0.4, '#2f4a3a', { x, y: 0.62, z: 0.0 }, 'metal'));
    b.add(P.box(0.05, 0.2, 0.05, '#2f4a3a', { x, y: 0.42, z: 0.17 }, 'metal'));
  }
  return b;
}

// ====================================================================== festival things
function lanternMaker(P, on) {
  return (parent, x, y, z, i) => {
    const red = i % 3 === 1;
    const body = P.mesh(new THREE.SphereGeometry(0.13, 8, 6), on ? (red ? '#ff8a6a' : '#ffe2b0') : (red ? '#e2463a' : '#f6efe0'), { x, y, z }, on ? 'glow' : 'satin');
    body.scale.set(1, 1.3, 1); body.castShadow = false;
    parent.add(body);
    for (const yy of [0.15, -0.18]) parent.add(P.cyl(0.075, 0.075, 0.03, '#2a2422', { x, y: y + yy, z, cast: false }, 'satin', 6));
    if (!red) parent.add(P.cyl(0.132, 0.132, 0.05, '#d8302a', { x, y: y - 0.04, z, cast: false }, on ? 'glow' : 'satin', 8));
  };
}
function lanternString(P, g, lantern, a, b, n, sag) {
  const pts = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector3(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * sag, a[2] + (b[2] - a[2]) * t)); }
  for (let i = 0; i < 12; i++) {
    const p = pts[i]; const q = pts[i + 1];
    const len = p.distanceTo(q);
    const m = P.mesh(new THREE.CylinderGeometry(0.006, 0.006, len, 4), '#3a3330', {}, 'matte');
    m.position.copy(p).lerp(q, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), q.clone().sub(p).normalize());
    m.castShadow = false;
    g.add(m);
  }
  for (let i = 1; i < n; i++) {
    const t = i / n;
    lantern(g, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * sag - 0.22, a[2] + (b[2] - a[2]) * t, i);
  }
}

function yatai(P, S, L, kind, on) {
  const y = new THREE.Group(); // faces +z
  const wood = '#a5794e';
  const info = {
    dango: { sign: 'だんご', color: '#e8507a', prices: ['花見だんご 1本 100円', 'みたらし 1本 100円'] },
    yakisoba: { sign: 'やきそば', color: '#e8452f', prices: ['やきそば 500円'] },
    takoyaki: { sign: 'たこやき', color: '#e8452f', prices: ['たこやき 6こ 500円'] },
    ramune: { sign: 'ラムネ', color: '#2f8fd8', prices: ['ラムネ 200円', 'おちゃ 150円'] },
  }[kind];
  y.add(P.box(2.4, 0.9, 0.75, wood, { z: 0.15 }));
  y.add(P.box(2.5, 0.05, 0.85, '#e9e1cf', { y: 0.9, z: 0.15 }, 'satin'));
  for (const [x, z] of [[-1.18, 0.5], [1.18, 0.5], [-1.18, -0.6], [1.18, -0.6]]) y.add(P.box(0.08, 2.35, 0.08, wood, { x, z }));
  y.add(P.box(2.4, 1.6, 0.04, '#ece6da', { y: 0.9, z: -0.62 }));
  // striped awning
  for (let i = 0; i < 8; i++) {
    const s = P.box(0.31, 0.04, 1.5, i % 2 ? '#ffffff' : info.color, { x: -1.085 + i * 0.31, y: 2.35, z: 0.0, rx: -0.18 }, 'satin');
    y.add(s);
  }
  for (let i = 0; i < 8; i++) y.add(P.box(0.31, 0.22, 0.02, i % 2 ? '#ffffff' : info.color, { x: -1.085 + i * 0.31, y: 2.12, z: 0.72 }, 'satin'));
  // header board
  put2(y, L.sign([{ t: info.sign, scale: 1.1 }], 1.5, 0.42, { bg: '#fff8ea', fg: info.color, border: info.color }), 0, 2.6, 0.62);
  y.add(P.box(1.6, 0.5, 0.05, wood, { y: 2.35, z: 0.59 }));
  put2(y, S.sign(info.prices.map((t) => ({ t, scale: 0.75 })), 0.9, 0.2 * info.prices.length + 0.1, { bg: '#fffdf4', fg: '#333', radius: 0.05 }), 0.6, 0.55, 0.53);
  // lanterns at the corners
  for (const x of [-1.05, 1.05]) {
    const l = P.mesh(new THREE.SphereGeometry(0.16, 10, 8), on ? '#ffb07a' : '#e2463a', { x, y: 1.75, z: 0.62 }, on ? 'glow' : 'satin');
    l.scale.set(1, 1.35, 1); y.add(l);
    y.add(P.cyl(0.09, 0.09, 0.04, '#2a2422', { x, y: 1.95, z: 0.62 }, 'satin', 8));
  }
  // goods
  if (kind === 'dango') {
    for (let i = 0; i < 9; i++) {
      const x = -0.9 + i * 0.12; const mitarashi = i > 5;
      y.add(P.cyl(0.004, 0.004, 0.2, '#e8d9b0', { x, y: 0.93, z: 0.3, rx: Math.PI / 2 - 0.1 }, 'matte', 4));
      ['#f4a6be', '#f7f5ee', '#8cc06a'].forEach((c, k) => y.add(P.mesh(new THREE.SphereGeometry(0.022, 6, 4), mitarashi ? '#b8742e' : c, { x, y: 0.955, z: 0.23 + k * 0.045 }, mitarashi ? 'gloss' : 'satin')));
    }
    y.add(P.box(0.5, 0.03, 0.3, '#2a2422', { x: 0.55, y: 0.92, z: 0.25 }, 'metal'));
  } else if (kind === 'yakisoba') {
    y.add(P.box(1.0, 0.05, 0.5, '#3a3a3a', { x: -0.3, y: 0.92, z: 0.15 }, 'metal'));
    y.add(P.box(0.7, 0.03, 0.35, '#c9944a', { x: -0.3, y: 0.97, z: 0.15 }, 'matte'));
    for (let i = 0; i < 5; i++) y.add(P.box(0.14, 0.05, 0.1, '#f6f4ee', { x: 0.45 + (i % 3) * 0.16, y: 0.93 + Math.floor(i / 3) * 0.05, z: 0.35 }, 'satin'));
  } else if (kind === 'takoyaki') {
    y.add(P.box(0.8, 0.06, 0.45, '#2f2f2f', { x: -0.4, y: 0.92, z: 0.15 }, 'metal'));
    for (let i = 0; i < 18; i++) y.add(P.mesh(new THREE.SphereGeometry(0.028, 6, 4), '#c98a3a', { x: -0.72 + (i % 6) * 0.12, y: 0.99, z: 0.02 + Math.floor(i / 6) * 0.12 }, 'satin'));
  } else {
    y.add(P.box(0.9, 0.3, 0.5, '#5aa0d8', { x: -0.35, y: 0.92, z: 0.15 }, 'gloss'));
    for (let i = 0; i < 10; i++) y.add(P.cyl(0.025, 0.03, 0.22, i % 3 ? '#9fd4e8' : '#cfe3c6', { x: -0.7 + (i % 5) * 0.16, y: 1.0, z: 0.05 + Math.floor(i / 5) * 0.2 }, 'gloss', 8));
  }
  return y;
}

function vendingMachine(P, L, k) {
  const v = new THREE.Group(); // faces +z
  v.add(P.rbox(1.0, 1.83, 0.72, 0.03, ['#e7413a', '#2f6db3', '#2f9a62'][k % 3], {}, 'satin'));
  put2(v, L.draw(0.88, 0.92, 260, (c, w, h) => drawVending(c, w, h, k)), 0, 1.25, 0.372);
  v.add(P.box(0.6, 0.16, 0.05, '#222', { y: 0.12, z: 0.37 }, 'satin'));
  v.add(P.box(0.16, 0.2, 0.03, '#d0d0d0', { x: 0.3, y: 0.62, z: 0.37 }, 'metal'));
  return v;
}

function parkLamp(P, on) {
  const l = new THREE.Group();
  l.add(P.cyl(0.05, 0.07, 3.2, '#3f4a42', {}, 'metal', 8));
  l.add(P.cyl(0.2, 0.12, 0.3, '#3f4a42', { y: 3.2 }, 'metal', 8));
  l.add(P.mesh(new THREE.SphereGeometry(0.17, 10, 8), on ? '#fff1c8' : '#eeeae0', { y: 3.6 }, on ? 'glow' : 'gloss'));
  l.add(P.cyl(0.02, 0.2, 0.12, '#3f4a42', { y: 3.76 }, 'metal', 8));
  return l;
}

function bicycle(P) {
  const b = new THREE.Group(); // ママチャリ, along x, on its stand
  const frame = '#c9d8e2';
  for (const x of [-0.52, 0.52]) {
    b.add(P.mesh(new THREE.TorusGeometry(0.31, 0.022, 6, 22), '#2a2b2e', { x, y: 0.33 }, 'satin'));
    b.add(P.cyl(0.03, 0.03, 0.06, '#9aa0a6', { x, y: 0.33, rx: Math.PI / 2 }, 'metal', 8));
  }
  const tube = (x0, y0, x1, y1, r = 0.018) => {
    const p = new THREE.Vector3(x0, y0, 0); const q = new THREE.Vector3(x1, y1, 0);
    const m = P.mesh(new THREE.CylinderGeometry(r, r, p.distanceTo(q), 6), frame, {}, 'satin');
    m.position.copy(p).lerp(q, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), q.clone().sub(p).normalize());
    b.add(m);
  };
  tube(-0.52, 0.33, -0.05, 0.33); tube(-0.05, 0.33, -0.16, 0.75); tube(0.42, 0.85, -0.05, 0.33, 0.022);
  tube(0.52, 0.33, 0.42, 0.85); tube(-0.52, 0.33, -0.16, 0.7); tube(0.42, 0.85, 0.36, 1.0);
  b.add(P.rbox(0.22, 0.06, 0.12, 0.03, '#2a2b2e', { x: -0.17, y: 0.76 }, 'satin'));
  b.add(P.box(0.04, 0.03, 0.55, '#9aa0a6', { x: 0.34, y: 1.0 }, 'metal'));
  b.add(P.box(0.3, 0.22, 0.32, '#9aa0a6', { x: 0.6, y: 0.78 }, 'metal'));   // front basket
  b.add(P.box(0.32, 0.03, 0.2, '#9aa0a6', { x: -0.5, y: 0.66 }, 'metal'));   // rear rack
  b.add(P.box(0.3, 0.03, 0.06, '#c0392b', { x: -0.5, y: 0.6, z: 0.0 }, 'satin'));
  b.add(P.box(0.18, 0.04, 0.03, '#888', { x: -0.05, y: 0.33, z: 0.1 }, 'metal'));
  return b;
}

function redBridge(P) {
  const b = new THREE.Group(); // 太鼓橋 across the narrow part of the pond (local pond coords)
  const N = 9; const span = 5.0;
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N; const x = -span / 2 + t * span;
    const y = 0.25 + Math.sin(t * Math.PI) * 0.75;
    const dy = Math.cos(t * Math.PI) * 0.75 * Math.PI / span;
    b.add(P.box(span / N + 0.02, 0.08, 1.4, '#a5794e', { x, y, rz: Math.atan(dy) }));
    for (const z of [-0.7, 0.7]) {
      b.add(P.box(0.06, 0.55, 0.06, '#c8322b', { x, y: y + 0.05, z }, 'satin'));
      b.add(P.box(span / N + 0.03, 0.05, 0.05, '#c8322b', { x, y: y + 0.55, z, rz: Math.atan(dy) }, 'satin'));
    }
  }
  for (const s of [-1, 1]) for (const z of [-0.7, 0.7]) b.add(P.cyl(0.05, 0.05, 0.15, '#d9a03a', { x: s * span / 2, y: 0.8, z }, 'metal', 8));
  for (const x of [-1.4, 0, 1.4]) for (const z of [-0.6, 0.6]) b.add(P.box(0.12, 1.0, 0.12, '#7a3a2a', { x, y: -0.4, z }));
  b.position.set(2.2, 0, 0.3); b.rotation.y = Math.PI / 2 - 0.2;
  return b;
}

function stoneLantern(P, on) {
  const l = new THREE.Group(); // 灯籠
  const st = '#a39d90';
  l.add(P.box(0.5, 0.15, 0.5, st));
  l.add(P.cyl(0.1, 0.12, 0.7, st, { y: 0.15 }, 'matte', 8));
  l.add(P.box(0.42, 0.1, 0.42, st, { y: 0.85 }));
  l.add(P.box(0.32, 0.3, 0.32, on ? '#ffd890' : '#8e887c', { y: 0.95 }, on ? 'glow' : 'matte'));
  l.add(P.cyl(0.05, 0.42, 0.25, st, { y: 1.25, ry: Math.PI / 4 }, 'matte', 4));
  l.add(P.mesh(new THREE.SphereGeometry(0.06, 8, 6), st, { y: 1.53 }));
  return l;
}

function duck(P, i) {
  const d = new THREE.Group();
  d.add(P.mesh(new THREE.SphereGeometry(0.16, 10, 8), i === 1 ? '#f2f0ea' : '#8a6a4a', { y: 0.06 }, 'satin'));
  d.children[0].scale.set(1.4, 0.75, 0.95);
  d.add(P.mesh(new THREE.SphereGeometry(0.08, 8, 6), i === 1 ? '#f2f0ea' : '#2f6a4a', { x: 0.18, y: 0.2 }, 'satin'));
  d.add(P.box(0.08, 0.025, 0.04, '#e8a33c', { x: 0.27, y: 0.19 }, 'satin'));
  return d;
}

function pigeon(P) {
  const b = new THREE.Group();
  b.add(P.mesh(new THREE.SphereGeometry(0.08, 8, 6), '#8a8f9a', { y: 0.11 }, 'satin'));
  b.children[0].scale.set(1.5, 0.9, 0.9);
  b.add(P.mesh(new THREE.SphereGeometry(0.045, 8, 6), '#6f7480', { x: 0.1, y: 0.18 }, 'satin'));
  b.add(P.box(0.12, 0.02, 0.07, '#5d626c', { x: -0.14, y: 0.1, rz: 0.3 }));
  b.add(P.box(0.02, 0.06, 0.02, '#c9604a', { x: 0.0, y: 0.0 }));
  return b;
}

function swings(P) {
  const s = new THREE.Group();
  const c = '#d8473a';
  for (const x of [-1.2, 1.2]) for (const z of [-0.6, 0.6]) {
    const m = P.mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.3, 8), c, { x, y: 1.1, z: z * 0.6, rx: z > 0 ? -0.25 : 0.25 }, 'satin');
    s.add(m);
  }
  s.add(P.cyl(0.05, 0.05, 2.5, c, { y: 2.2, rz: Math.PI / 2, x: 1.25 }, 'satin', 8));
  for (const x of [-0.5, 0.5]) {
    for (const dz of [-0.15, 0.15]) s.add(P.box(0.015, 1.7, 0.015, '#9aa0a6', { x, y: 0.5, z: dz }, 'metal'));
    s.add(P.box(0.45, 0.04, 0.2, '#3a5a8a', { x, y: 0.48 }, 'satin'));
  }
  return s;
}

function castle(P, lit) {
  const c = new THREE.Group(); // 天守 on stone walls (石垣)
  const white = '#f1eee6'; const roof = '#4f5d61'; const dark = '#2f3236';
  const frustum = (bottomHalf, topHalf, h, color, y, kind = 'matte') => {
    const m = P.mesh(new THREE.CylinderGeometry(topHalf * Math.SQRT2, bottomHalf * Math.SQRT2, h, 4), color, { y: y + h / 2, ry: Math.PI / 4 }, kind);
    c.add(m); return m;
  };
  frustum(8.5, 6.6, 6.5, '#9c978c', -0.5);
  const tier = (half, h, y, roofHalf, roofH) => {
    c.add(P.box(half * 2, h, half * 2, white, { y }));
    c.add(P.box(half * 2 + 0.06, h * 0.38, half * 2 + 0.06, dark, { y }));
    for (const s of [-1, 1]) for (let k = -1; k <= 1; k++) {
      c.add(P.box(0.8, 0.6, 0.06, lit ? '#ffd890' : '#3a3d40', { x: k * half * 0.55, y: y + h * 0.62, z: s * (half + 0.03) }, lit ? 'glow' : 'satin'));
      c.add(P.box(0.06, 0.6, 0.8, lit ? '#ffd890' : '#3a3d40', { x: s * (half + 0.03), y: y + h * 0.62, z: k * half * 0.55 }, lit ? 'glow' : 'satin'));
    }
    frustum(roofHalf, half * 0.82, roofH, roof, y + h - 0.1, 'satin');
    // front gable (千鳥破風)
    const gable = P.mesh(new THREE.CylinderGeometry(1.4, 1.4, 1.2, 3), roof, { y: y + h + roofH * 0.45, z: roofHalf * 0.65, rz: Math.PI / 2, rx: 0 }, 'satin');
    gable.rotation.set(0, Math.PI / 2, Math.PI / 2);
    gable.scale.set(1, 1, 0.9);
    c.add(gable);
  };
  tier(5.2, 4.2, 6.0, 7.0, 1.7);
  tier(3.9, 3.4, 11.6, 5.4, 1.5);
  tier(2.8, 3.0, 16.4, 4.2, 0);
  frustum(4.3, 0.6, 2.8, roof, 19.3, 'satin');
  c.add(P.box(3.4, 0.35, 0.35, roof, { y: 22.0 }, 'satin'));
  for (const s of [-1, 1]) c.add(P.box(0.3, 0.7, 0.25, '#d9b23a', { x: s * 1.7, y: 22.2 }, 'metal'));
  return c;
}

// ====================================================================== drawings & textures
function txt(g, t, x, y, px, color, weight = 700, align = 'center', maxW = 0) {
  g.font = `${weight} ${px}px ${K.JP_FONT}`;
  g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle';
  if (maxW) while (g.measureText(t).width > maxW && px > 8) g.font = `${weight} ${(px *= 0.93)}px ${K.JP_FONT}`;
  g.fillText(t, x, y);
}
function put2(parent, o, x, y, z, ry = 0) { o.position.set(x, y, z); o.rotation.y = ry; parent.add(o); return o; }

function drawNobori(g, w, h, col, season) {
  const pink = col !== '#ffffff';
  g.fillStyle = col; g.fillRect(0, 0, w, h);
  g.fillStyle = pink ? '#ffffff' : '#e8507a'; g.fillRect(0, 0, w, h * 0.04); g.fillRect(0, h * 0.96, w, h * 0.04);
  const chars = [...({ spring: 'さくら', summer: 'なつ', autumn: 'あき', winter: 'ふゆ' }[season] || 'さくら'), 'ま', 'つ', 'り'];
  chars.forEach((ch, i) => txt(g, ch, w / 2, h * (0.12 + i * 0.76 / (chars.length - 1)), w * 0.62, pink ? '#ffffff' : '#d8306a', 800));
}

function drawParkMap(g, w, h) {
  g.fillStyle = '#f7f2e4'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#2f7a5b'; g.fillRect(0, 0, w, h * 0.16);
  txt(g, 'さくら公園  Sakura Park', w / 2, h * 0.08, h * 0.09, '#fff', 800);
  g.fillStyle = '#bfe0b0'; K.roundRect(g, w * 0.05, h * 0.2, w * 0.9, h * 0.62, 20); g.fill();
  g.fillStyle = '#7fb8d8'; g.beginPath(); g.ellipse(w * 0.35, h * 0.4, w * 0.16, h * 0.1, 0, 0, 6.3); g.fill();
  txt(g, 'いけ', w * 0.35, h * 0.4, h * 0.06, '#1d4a6a', 800);
  g.fillStyle = '#d8c8a0'; g.fillRect(w * 0.05, h * 0.53, w * 0.9, h * 0.05);
  g.fillStyle = '#e8507a'; for (let i = 0; i < 4; i++) g.fillRect(w * (0.58 + i * 0.08), h * 0.43, w * 0.06, h * 0.08);
  txt(g, 'やたい', w * 0.7, h * 0.37, h * 0.055, '#c0305a', 800);
  for (let i = 0; i < 9; i++) { g.fillStyle = '#f2a6be'; g.beginPath(); g.arc(w * (0.1 + i * 0.1), h * (0.66 + (i % 2) * 0.08), h * 0.03, 0, 6.3); g.fill(); }
  g.fillStyle = '#e8452f'; g.beginPath(); g.arc(w * 0.62, h * 0.74, h * 0.03, 0, 6.3); g.fill();
  txt(g, '現在地', w * 0.62, h * 0.8, h * 0.05, '#e8452f', 800);
  txt(g, 'しろ ↑ 1.2km', w * 0.2, h * 0.27, h * 0.05, '#4a4a4a', 800);
  txt(g, 'さくらまつり 4/1〜4/10   ぼんぼり 18:00〜21:00', w / 2, h * 0.91, h * 0.05, '#c0305a', 800, 'center', w * 0.92);
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

const texCache = {};
function grassTex() {
  if (texCache.grass) return texCache.grass;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, 256, 256);
  const r = K.rng(21);
  for (let i = 0; i < 2600; i++) {
    const v = 120 + Math.floor(r() * 120);
    g.strokeStyle = `rgba(${v},${v},${v},0.5)`; g.lineWidth = 1 + r();
    const x = r() * 256; const y = r() * 256;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y - 3 - r() * 4); g.stroke();
  }
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(80,80,80,${0.06 + r() * 0.06})`; g.beginPath(); g.arc(r() * 256, r() * 256, 10 + r() * 30, 0, 6.3); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return (texCache.grass = t);
}

function blobTex(season, base) {
  const k = `blob${season}`;
  if (texCache[k]) return texCache[k];
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base[0]; g.fillRect(0, 0, 256, 256);
  const r = K.rng(9);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = base[1 + Math.floor(r() * 3)];
    g.globalAlpha = 0.55 + r() * 0.45;
    const x = r() * 256; const y = r() * 256; const s = season === 'spring' ? 2 + r() * 3 : 3 + r() * 4;
    if (season === 'spring') { for (let p = 0; p < 5; p++) { const a = p / 5 * 6.28; g.beginPath(); g.arc(x + Math.cos(a) * s * 0.6, y + Math.sin(a) * s * 0.6, s * 0.55, 0, 6.3); g.fill(); } }
    else { g.beginPath(); g.ellipse(x, y, s, s * 0.6, r() * 3, 0, 6.3); g.fill(); }
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2);
  return (texCache[k] = t);
}

function tarpTex() {
  if (texCache.tarp) return texCache.tarp;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#3f7fd0'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1;
  for (let i = 0; i < 256; i += 4) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
  g.strokeStyle = 'rgba(20,40,90,0.25)'; g.lineWidth = 3;
  for (const v of [85, 171]) { g.beginPath(); g.moveTo(v, 0); g.lineTo(v, 256); g.stroke(); g.beginPath(); g.moveTo(0, v); g.lineTo(256, v); g.stroke(); }
  g.fillStyle = '#d8dde4'; g.fillRect(0, 0, 256, 6); g.fillRect(0, 250, 256, 6); g.fillRect(0, 0, 6, 256); g.fillRect(250, 0, 6, 256);
  for (const [x, y] of [[8, 8], [248, 8], [8, 248], [248, 248]]) { g.fillStyle = '#c9ccd0'; g.beginPath(); g.arc(x, y, 5, 0, 6.3); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return (texCache.tarp = t);
}

function waterTex(time, season) {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  const sky = { morning: ['#a8cde0', '#6f9fb4'], noon: ['#8fc0dc', '#5a8ea8'], evening: ['#d8a888', '#6a7a90'], night: ['#1c2a40', '#0e1828'] }[time] || ['#8fc0dc', '#5a8ea8'];
  const grd = g.createRadialGradient(256, 256, 20, 256, 256, 256); grd.addColorStop(0, sky[0]); grd.addColorStop(1, sky[1]);
  g.fillStyle = grd; g.fillRect(0, 0, 512, 512);
  const r = K.rng(3);
  if (season !== 'winter') for (let i = 0; i < 30; i++) {
    g.fillStyle = season === 'spring' ? 'rgba(240,180,200,0.35)' : season === 'autumn' ? 'rgba(220,130,60,0.3)' : 'rgba(70,120,70,0.3)';
    const a = r() * 6.28; g.beginPath(); g.arc(256 + Math.cos(a) * 220, 256 + Math.sin(a) * 220, 20 + r() * 40, 0, 6.3); g.fill();
  }
  g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 2;
  for (let i = 0; i < 70; i++) { const x = r() * 512; const y = r() * 512; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 12 + r() * 30, y); g.stroke(); }
  if (season === 'spring') for (let i = 0; i < 260; i++) { g.fillStyle = 'rgba(250,215,225,0.9)'; g.fillRect(r() * 512, r() * 512, 3, 2); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ====================================================================== shared mini-kit (same as station.js)
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
