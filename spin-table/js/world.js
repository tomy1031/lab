// js/world.js — the hall: an ITTF table (2.74 × 1.525 m, 76 cm high, a matt blue top with 2 cm white edge lines
// and the 3 mm centre line, a 25 mm top on a steel roll-away undercarriage with castors), the net assembly (15.25 cm,
// posts and clamps 15.25 cm outside the side lines), the red competition floor inside 75 cm barriers (14 × 7 m),
// the umpire's table with a flip score, a towel box, an LED scoreboard, seated spectators and overhead lights —
// a dark hall with a brightly lit court, as at a tournament. Textures are painted on canvases.
import * as THREE from 'three';
import { TABLE, NET, ROOM } from './physics.js';

const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const ctex = (c, rep = [1, 1]) => {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]);
  return t;
};

function tableTopTexture() {
  // 1 px = 2.5 mm: 1096 × 610 → the full top
  const W = 1096, Hh = 610, c = canvas(W, Hh), g = c.getContext('2d');
  g.fillStyle = '#18407e'; g.fillRect(0, 0, W, Hh);
  // a faint, even matt finish
  const img = g.getImageData(0, 0, W, Hh);
  for (let i = 0; i < img.data.length; i += 4) { const n = (Math.random() - 0.5) * 7; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
  g.putImageData(img, 0, 0);
  g.fillStyle = '#f4f6f8';
  const L = 8;                                        // 20 mm lines
  g.fillRect(0, 0, W, L); g.fillRect(0, Hh - L, W, L); g.fillRect(0, 0, L, Hh); g.fillRect(W - L, 0, L, Hh);
  g.fillRect(0, Hh / 2 - 0.6, W, 1.2);                // 3 mm centre line (doubles)
  // a small maker's mark near each end
  g.save(); g.globalAlpha = 0.35; g.fillStyle = '#c9d6ea'; g.font = 'bold 16px Arial'; g.textAlign = 'center';
  g.translate(W - 60, Hh - 22); g.fillText('SPIN TABLE 25', 0, 0); g.restore();
  g.save(); g.globalAlpha = 0.35; g.fillStyle = '#c9d6ea'; g.font = 'bold 16px Arial'; g.textAlign = 'center';
  g.translate(60, 22); g.rotate(Math.PI); g.fillText('SPIN TABLE 25', 0, 0); g.restore();
  const t = ctex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

function floorTexture() {
  const c = canvas(512, 512), g = c.getContext('2d');
  g.fillStyle = '#7b2026'; g.fillRect(0, 0, 512, 512);
  const img = g.getImageData(0, 0, 512, 512);
  for (let i = 0; i < img.data.length; i += 4) { const n = (Math.random() - 0.5) * 14; img.data[i] += n; img.data[i + 1] += n * 0.5; img.data[i + 2] += n * 0.5; }
  g.putImageData(img, 0, 0);
  return ctex(c, [3.5, 7]);
}
function hallFloorTexture() {
  const c = canvas(512, 512), g = c.getContext('2d');
  g.fillStyle = '#2a2622'; g.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 32) {
    for (let x = (y / 32) % 2 ? -64 : 0; x < 512; x += 128) {
      g.fillStyle = `rgb(${46 + Math.random() * 10},${38 + Math.random() * 8},${30 + Math.random() * 6})`;
      g.fillRect(x + 1, y + 1, 126, 30);
    }
  }
  return ctex(c, [16, 16]);
}
function barrierTexture() {
  const c = canvas(1024, 128), g = c.getContext('2d');
  g.fillStyle = '#0f2347'; g.fillRect(0, 0, 1024, 128);
  g.fillStyle = '#1d3a73'; g.fillRect(0, 104, 1024, 24);
  g.fillStyle = '#ffffff'; g.font = 'italic 900 58px Arial, sans-serif'; g.textBaseline = 'middle';
  g.fillText('SPIN TABLE', 40, 56);
  g.fillStyle = '#ffd23f'; g.font = 'bold 34px Arial, sans-serif';
  g.fillText('OPEN 2026', 440, 58);
  g.fillStyle = '#9fc2ff'; g.font = 'bold 30px Arial, sans-serif';
  g.fillText('● TABLE TENNIS', 700, 58);
  return ctex(c, [1, 1]);
}
function netTexture() {
  const c = canvas(256, 64), g = c.getContext('2d');
  g.clearRect(0, 0, 256, 64);
  g.strokeStyle = 'rgba(10,16,40,0.95)'; g.lineWidth = 1.4;
  for (let x = 0; x <= 256; x += 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 64); g.stroke(); }
  for (let y = 0; y <= 64; y += 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  const t = ctex(c, [7, 1]);
  return t;
}

/**
 * Merge every static mesh under `root` into one mesh per material (fewer draw calls on Quest). Meshes with
 * several materials are split by their groups. Instanced meshes are left as they are.
 */
export function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map(), olds = [];
  const nm = new THREE.Matrix3();
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.userData.keep) return;
    olds.push(o);
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const groups = Array.isArray(o.material) && g.groups.length ? g.groups : [{ start: 0, count: g.attributes.position.count, materialIndex: 0 }];
    nm.getNormalMatrix(o.matrixWorld);
    for (const gr of groups) {
      const mat = mats[gr.materialIndex];
      if (!mat) continue;
      if (!buckets.has(mat)) buckets.set(mat, { pos: [], nor: [], uv: [], cast: false, recv: false, order: o.renderOrder });
      const B = buckets.get(mat);
      B.cast ||= o.castShadow; B.recv ||= o.receiveShadow;
      const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
      const v = new THREE.Vector3();
      for (let i = gr.start; i < gr.start + gr.count; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld); B.pos.push(v.x, v.y, v.z);
        if (N) { v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); B.nor.push(v.x, v.y, v.z); } else B.nor.push(0, 1, 0);
        if (U) B.uv.push(U.getX(i), U.getY(i)); else B.uv.push(0, 0);
      }
    }
  });
  for (const o of olds) o.removeFromParent();
  for (const [mat, B] of buckets) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(B.nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2));
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = B.cast; m.receiveShadow = B.recv; m.renderOrder = B.order;
    m.matrixAutoUpdate = false;
    root.add(m);
  }
  root.position.set(0, 0, 0); root.rotation.set(0, 0, 0); root.scale.set(1, 1, 1);
}

export class World {
  constructor(scene, renderer, opts = {}) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    scene.background = new THREE.Color(0x07090f);
    scene.fog = new THREE.Fog(0x07090f, 18, 42);
    this.lights(renderer, opts);
    this.floor();
    this.table();
    this.net();
    this.barriers();
    this.officials();
    this.hall(opts);
    this.scoreboard = new Scoreboard(this.root);
    // everything above is static: one draw call per material
    if (this.crowd) for (const c of this.crowd) c.removeFromParent();
    mergeStatic(this.root);
    if (this.crowd) for (const c of this.crowd) this.root.add(c);
  }

  lights(renderer, opts) {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0xc8d6ff, 0x2a1a18, 0.55));
    const key = new THREE.DirectionalLight(0xfff4e6, 2.6);
    key.position.set(1.2, 8, 2.0);
    key.target.position.set(0, 0.7, 0);
    key.castShadow = opts.shadows !== false;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera;
    sc.left = -2.6; sc.right = 2.6; sc.top = 3.6; sc.bottom = -3.6; sc.near = 4; sc.far = 12;
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.01;
    key.shadow.radius = 3;
    s.add(key); s.add(key.target);
    this.key = key;
    const fill = new THREE.DirectionalLight(0xdfe8ff, 0.7);
    fill.position.set(-3, 5, -4);
    s.add(fill);
    // a soft environment for reflections (paddle, ball, table varnish)
    const pm = new THREE.PMREMGenerator(renderer);
    const env = new THREE.Scene();
    env.background = new THREE.Color(0x0c0f18);
    const panel = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const [x, z] of [[-2, -3], [2, -3], [-2, 3], [2, 3], [0, 0]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.0), panel);
      m.position.set(x, 6, z); m.rotation.x = Math.PI / 2; env.add(m);
    }
    const red = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ color: 0x5a1a1e }));
    red.rotation.x = -Math.PI / 2; env.add(red);
    s.environment = pm.fromScene(env, 0.04).texture;
    s.environmentIntensity = 0.45;
    pm.dispose();
  }

  floor() {
    const hall = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ map: hallFloorTexture(), roughness: 0.75 }));
    hall.rotation.x = -Math.PI / 2; hall.position.y = -0.002; hall.receiveShadow = true;
    this.root.add(hall);
    const court = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.halfX * 2, ROOM.halfZ * 2), new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.62, metalness: 0 }));
    court.rotation.x = -Math.PI / 2; court.receiveShadow = true;
    this.root.add(court);
  }

  table() {
    const T = TABLE;
    const g = new THREE.Group();
    this.tableGroup = g;
    const blue = new THREE.MeshStandardMaterial({ color: 0x163b74, roughness: 0.6 });
    const top = new THREE.MeshPhysicalMaterial({ map: tableTopTexture(), roughness: 0.58, metalness: 0, clearcoat: 0.08, clearcoatRoughness: 0.6 });
    // the top: one slab, the texture turned so its long side runs along z
    const geo = new THREE.BoxGeometry(T.halfW * 2, T.thick, T.halfL * 2);
    const uv = geo.attributes.uv;
    // remap the +y face's UVs so u runs along z (the texture is 2.74 m wide)
    const pos = geo.attributes.position, nor = geo.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      if (nor.getY(i) > 0.5) uv.setXY(i, (pos.getZ(i) + T.halfL) / (2 * T.halfL), (pos.getX(i) + T.halfW) / (2 * T.halfW));
    }
    const slab = new THREE.Mesh(geo, [blue, blue, top, blue, blue, blue]);
    slab.position.y = T.h - T.thick / 2;
    slab.receiveShadow = true; slab.castShadow = true;
    g.add(slab);
    // a thin dark gap between the two halves (the net hides most of it)
    const gap = new THREE.Mesh(new THREE.BoxGeometry(T.halfW * 2 + 0.001, 0.002, 0.003), new THREE.MeshBasicMaterial({ color: 0x0b1530 }));
    gap.position.y = T.h - 0.0005;
    g.add(gap);
    // undercarriage: a steel apron under each half, folding legs, a central frame and castors
    const steel = new THREE.MeshStandardMaterial({ color: 0x1c2638, roughness: 0.45, metalness: 0.6 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x0d0f14, roughness: 0.7 });
    const add = (geo2, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo2, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; g.add(m); return m; };
    for (const s of [1, -1]) {
      // apron rails 5 cm in from the edges
      add(new THREE.BoxGeometry(0.03, 0.05, 1.25), steel, T.halfW - 0.07, T.h - T.thick - 0.025, s * 0.68);
      add(new THREE.BoxGeometry(0.03, 0.05, 1.25), steel, -T.halfW + 0.07, T.h - T.thick - 0.025, s * 0.68);
      add(new THREE.BoxGeometry(T.halfW * 2 - 0.14, 0.05, 0.03), steel, 0, T.h - T.thick - 0.025, s * (T.halfL - 0.08));
      // the legs: a square-section frame near each end, slanting in
      for (const sx of [1, -1]) {
        const lx = sx * (T.halfW - 0.13), lz = s * (T.halfL - 0.32);
        const leg = add(new THREE.BoxGeometry(0.05, 0.72, 0.05), steel, lx, 0.36 + 0.02, lz, s * 0.06, 0, 0);
        leg.position.z -= s * 0.02;
        // castor
        add(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 16), dark, lx, 0.035, lz - s * 0.04, 0, 0, Math.PI / 2);
        add(new THREE.BoxGeometry(0.05, 0.04, 0.06), steel, lx, 0.07, lz - s * 0.04);
      }
      add(new THREE.BoxGeometry(T.halfW * 2 - 0.26, 0.04, 0.04), steel, 0, 0.22, s * (T.halfL - 0.34));
      // the central frame: a tube from the leg cross-bar to the middle
      add(new THREE.BoxGeometry(0.05, 0.05, T.halfL - 0.4), steel, 0, 0.22, s * (T.halfL - 0.34) / 2 - s * 0.04);
    }
    // the centre chassis with its wheels
    add(new THREE.BoxGeometry(0.5, 0.06, 0.12), steel, 0, 0.22, 0);
    for (const sx of [1, -1]) add(new THREE.CylinderGeometry(0.05, 0.05, 0.035, 18), dark, sx * 0.22, 0.05, 0, 0, 0, Math.PI / 2);
    for (const sx of [1, -1]) add(new THREE.BoxGeometry(0.04, 0.2, 0.04), steel, sx * 0.22, 0.13, 0);
    this.root.add(g);
  }

  net() {
    const T = TABLE, N = NET;
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(N.halfLen * 2, N.h - 0.012), new THREE.MeshStandardMaterial({ map: netTexture(), transparent: true, alphaTest: 0.25, side: THREE.DoubleSide, roughness: 0.9 }));
    mesh.position.set(0, T.h + (N.h - 0.012) / 2, 0);
    mesh.castShadow = true;
    g.add(mesh);
    // the white top band (15 mm) with the cord inside
    const band = new THREE.Mesh(new THREE.BoxGeometry(N.halfLen * 2, 0.015, 0.006), new THREE.MeshStandardMaterial({ color: 0xf4f6fa, roughness: 0.7 }));
    band.position.set(0, T.h + N.h - 0.0075, 0);
    band.castShadow = true;
    g.add(band);
    // the posts and their clamps on the table's side
    const black = new THREE.MeshStandardMaterial({ color: 0x15181f, roughness: 0.35, metalness: 0.5 });
    for (const s of [1, -1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(N.postW, N.h + 0.04, N.postD), black);
      post.position.set(s * (N.halfLen + N.postW / 2), T.h + (N.h + 0.04) / 2 - 0.03, 0);
      post.castShadow = true;
      g.add(post);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(N.halfLen - T.halfW + 0.03, 0.02, 0.05), black);
      arm.position.set(s * (T.halfW + (N.halfLen - T.halfW) / 2), T.h - 0.035, 0);
      g.add(arm);
      const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 12), black);
      screw.position.set(s * (T.halfW - 0.02), T.h - 0.055, 0);
      g.add(screw);
    }
    this.root.add(g);
  }

  barriers() {
    const R = ROOM;
    const mat = new THREE.MeshStandardMaterial({ map: barrierTexture(), roughness: 0.6 });
    const back = new THREE.MeshStandardMaterial({ color: 0x0a1328, roughness: 0.8 });
    const panelL = 1.4;
    const place = (x, z, ry) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(panelL - 0.02, R.barrierH, 0.03), [back, back, back, back, mat, back]);
      m.position.set(x, R.barrierH / 2, z); m.rotation.y = ry;
      m.receiveShadow = true;
      this.root.add(m);
      // feet
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.4), back);
      f.position.set(x, 0.015, z); f.rotation.y = ry;
      this.root.add(f);
    };
    // the long sides (along z) and the ends (along x); a gap at the umpire's side for the officials
    for (let z = -R.halfZ + panelL / 2; z < R.halfZ; z += panelL) {
      place(-R.halfX, z, Math.PI / 2);
      if (Math.abs(z) > 0.8) place(R.halfX, z, -Math.PI / 2);
    }
    for (let x = -R.halfX + panelL / 2; x < R.halfX; x += panelL) { place(x, -R.halfZ, 0); place(x, R.halfZ, Math.PI); }
  }

  officials() {
    // the umpire's table and chair beside the net, the flip score on it facing the players
    const g = new THREE.Group();
    g.position.set(ROOM.halfX - 0.9, 0, 0);
    const cloth = new THREE.MeshStandardMaterial({ color: 0x14295a, roughness: 0.9 });
    const desk = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.74, 1.0), cloth);
    desk.position.set(0, 0.37, 0); desk.castShadow = true;
    g.add(desk);
    const chairMat = new THREE.MeshStandardMaterial({ color: 0x222831, roughness: 0.6, metalness: 0.3 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.42), chairMat);
    seat.position.set(0.45, 0.48, 0); g.add(seat);
    const backr = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.45, 0.42), chairMat);
    backr.position.set(0.66, 0.72, 0); g.add(backr);
    for (const [dx, dz] of [[-0.18, -0.18], [-0.18, 0.18], [0.18, -0.18], [0.18, 0.18]]) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.48, 8), chairMat);
      l.position.set(0.45 + dx, 0.24, dz); g.add(l);
    }
    this.flip = new FlipScore(g);
    this.root.add(g);
    // the towel box at the net post on the other side
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 0.4), new THREE.MeshStandardMaterial({ color: 0x1d3a73, roughness: 0.5 }));
    box.position.set(-TABLE.halfW - 0.75, 0.275, 0);
    box.castShadow = true;
    this.root.add(box);
    const towel = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.25), new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 1 }));
    towel.position.set(-TABLE.halfW - 0.75, 0.575, 0.03);
    this.root.add(towel);
  }

  hall(opts) {
    // dark stands left and right with seated spectators (one instanced mesh), lights above the court
    const tier = new THREE.MeshStandardMaterial({ color: 0x151a26, roughness: 0.9 });
    for (const s of [1, -1]) {
      for (let i = 0; i < 6; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.45 + i * 0.45, 26), tier);
        m.position.set(s * (6.2 + i * 1.0), (0.45 + i * 0.45) / 2, 0);
        this.root.add(m);
      }
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(18, 0.45 + i * 0.45, 1.0), tier);
        m.position.set(0, (0.45 + i * 0.45) / 2, s * (9.5 + i * 1.0));
        this.root.add(m);
      }
    }
    if (!opts.lite) {
      const seats = [];
      for (const s of [1, -1]) for (let i = 0; i < 6; i++) for (let k = -12; k <= 12; k += 0.62) if (Math.random() < 0.55) seats.push([s * (6.2 + i * 1.0), 0.45 + i * 0.45, k]);
      for (const s of [1, -1]) for (let i = 0; i < 3; i++) for (let k = -8.5; k <= 8.5; k += 0.62) if (Math.random() < 0.5) seats.push([k, 0.45 + i * 0.45, s * (9.5 + i * 1.0)]);
      const body = new THREE.CapsuleGeometry(0.17, 0.35, 3, 8);
      const inst = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ roughness: 0.85 }), seats.length);
      const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshStandardMaterial({ roughness: 0.8 }), seats.length);
      const m = new THREE.Matrix4(), col = new THREE.Color();
      const shirts = [0x2e5fa8, 0xc23b3b, 0xe8e8e8, 0x3a3a3a, 0xf0b429, 0x2f8f5b, 0x6b4fa0, 0x1f2a44];
      const skins = [0xe9c4a4, 0xc99a74, 0x8d5a3b, 0xf1d3b8, 0x6b432b];
      seats.forEach(([x, y, z], i) => {
        m.makeTranslation(x, y + 0.36, z); inst.setMatrixAt(i, m);
        inst.setColorAt(i, col.setHex(shirts[i % shirts.length]).multiplyScalar(0.55 + Math.random() * 0.3));
        m.makeTranslation(x, y + 0.78, z); head.setMatrixAt(i, m);
        head.setColorAt(i, col.setHex(skins[(i * 7) % skins.length]).multiplyScalar(0.6));
      });
      this.root.add(inst, head);
      this.crowd = [inst, head];
    }
    // light rigs: glowing panels above the court
    const lamp = new THREE.MeshBasicMaterial({ color: 0xfff6e8 });
    const rig = new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 0.6, metalness: 0.5 });
    for (const [x, z] of [[-1.6, -2.4], [1.6, -2.4], [-1.6, 2.4], [1.6, 2.4], [-1.6, 0], [1.6, 0]]) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.5), rig);
      box.position.set(x, 7.5, z); this.root.add(box);
      const l = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.42), lamp);
      l.rotation.x = Math.PI / 2; l.position.set(x, 7.43, z); this.root.add(l);
    }
    for (const s of [1, -1]) {
      const truss = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 9), rig);
      truss.position.set(s * 1.6, 7.62, 0); this.root.add(truss);
    }
    // the far walls, dark, with a band of LED boards
    const wall = new THREE.MeshStandardMaterial({ color: 0x0b0e16, roughness: 0.95 });
    for (const s of [1, -1]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(40, 14), wall);
      w.position.set(0, 7, s * 13); w.rotation.y = s > 0 ? Math.PI : 0; this.root.add(w);
      const w2 = new THREE.Mesh(new THREE.PlaneGeometry(30, 14), wall);
      w2.position.set(s * 12.5, 7, 0); w2.rotation.y = -s * Math.PI / 2; this.root.add(w2);
    }
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: 0x05070c }));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = 10; this.root.add(ceil);
  }
}

/** the umpire's flip score (two pairs of cards: games and points), facing the players along ±z */
class FlipScore {
  constructor(parent) {
    this.c = canvas(512, 256);
    this.tex = ctex(this.c);
    this.tex.wrapS = this.tex.wrapT = THREE.ClampToEdgeWrapping;
    const m = new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.5 });
    const geo = new THREE.PlaneGeometry(0.44, 0.22);
    for (const s of [1, -1]) {
      const p = new THREE.Mesh(geo, m);
      p.position.set(0, 0.86, s * 0.08);
      p.rotation.y = s > 0 ? 0 : Math.PI;
      p.rotation.x = -s * 0.0;
      parent.add(p);
    }
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.24, 0.14), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    stand.position.set(0, 0.86, 0); parent.add(stand);
    this.set({ p: 0, c: 0 }, { p: 0, c: 0 });
  }
  set(points, games) {
    const g = this.c.getContext('2d');
    g.fillStyle = '#111'; g.fillRect(0, 0, 512, 256);
    const card = (x, w, n, col) => {
      g.fillStyle = col; g.fillRect(x, 20, w, 216);
      g.fillStyle = '#fff'; g.font = `bold ${w > 120 ? 170 : 110}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(n), x + w / 2, 132);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, 126, w, 3);
    };
    // from the players' view: the opponent (left), you (right)
    card(14, 90, games.c, '#7a1e24'); card(110, 150, points.c, '#c23b3b');
    card(266, 150, points.p, '#1f4e8c'); card(422, 76, games.p, '#163b74');
    this.tex.needsUpdate = true;
  }
}

/** the LED scoreboard above the far end */
class Scoreboard {
  constructor(parent) {
    this.c = canvas(1024, 384);
    this.tex = ctex(this.c);
    this.tex.wrapS = this.tex.wrapT = THREE.ClampToEdgeWrapping;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 2.1), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }));
    scr.position.set(0, 4.6, -12.9);
    parent.add(scr);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(5.9, 2.4, 0.2), new THREE.MeshStandardMaterial({ color: 0x0a0a0a }));
    frame.position.set(0, 4.6, -13.02);
    parent.add(frame);
    this.mesh = scr;
    this.draw({ title: 'SPIN TABLE OPEN', p: 'YOU', c: 'CPU', points: { p: 0, c: 0 }, games: { p: 0, c: 0 }, server: null, note: '' });
  }
  draw(d) {
    const g = this.c.getContext('2d');
    g.fillStyle = '#04060b'; g.fillRect(0, 0, 1024, 384);
    g.fillStyle = '#ffd23f'; g.font = 'bold 40px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(d.title, 512, 40);
    const row = (y, name, games, pts, serving, col) => {
      g.fillStyle = col; g.fillRect(30, y - 52, 964, 104);
      g.fillStyle = '#fff'; g.textAlign = 'left'; g.font = 'bold 64px Arial';
      g.fillText(name, 60, y + 2);
      if (serving) { g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(470, y, 16, 0, Math.PI * 2); g.fill(); }
      g.textAlign = 'center'; g.fillStyle = '#9fc2ff'; g.font = 'bold 72px Arial'; g.fillText(String(games), 640, y + 4);
      g.fillStyle = '#fff'; g.font = 'bold 92px Arial'; g.fillText(String(pts), 860, y + 6);
    };
    row(140, d.c, d.games.c, d.points.c, d.server === 'c', '#3a1016');
    row(260, d.p, d.games.p, d.points.p, d.server === 'p', '#0f2347');
    g.fillStyle = '#cfe0ff'; g.font = 'bold 32px Arial'; g.textAlign = 'center';
    g.fillText(d.note || '', 512, 350);
    this.tex.needsUpdate = true;
  }
}
