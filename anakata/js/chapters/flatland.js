// js/chapters/flatland.js — 2章 平面の国. A glowing disc at your waist is a 2D world (after E. A. Abbott,
// Flatland, 1884). Push solid objects through it with your hands and see only what its people can: the
// cross-section. Above, a strip shows the flatlander's actual view — a 1D image. Then reach into a sealed
// house from "above" and take its coin out without opening a wall: what a 4D being could do to our boxes.
//
// The disc is drawn by a shader that evaluates each object's signed distance function in the plane, so any
// cut, at any tilt, is exact. The 1D view is ray-marched in JS in the plane from the flatlander's eye.
import * as THREE from 'three';
import { Chapter, clamp } from './base.js';
import { textPlane } from '../widgets.js';

const MAXO = 6;
const PLANE_Y = 1.0;
const PLANE_C = new THREE.Vector3(0, PLANE_Y, -0.55);
const PLANE_R = 0.42;
// plane-local layout (x right, z towards you)
const HOUSE = { x: -0.22, z: -0.1, h: 0.075, t: 0.008 };
const EYE = { x: 0.02, z: 0.3, yaw: 0, fov: (110 * Math.PI) / 180 }; // yaw 0 = looking along −z
const RAYS = 160;

const SDF_GLSL = /* glsl */ `
float dot2(vec2 v) { return dot(v, v); }
float sdCone(vec3 p, float h, float r1, float r2) {
  vec2 q = vec2(length(p.xz), p.y);
  vec2 k1 = vec2(r2, h);
  vec2 k2 = vec2(r2 - r1, 2.0 * h);
  vec2 ca = vec2(q.x - min(q.x, (q.y < 0.0) ? r1 : r2), abs(q.y) - h);
  vec2 cb = q - k1 + k2 * clamp(dot(k1 - q, k2) / dot2(k2), 0.0, 1.0);
  float s = (cb.x < 0.0 && ca.y < 0.0) ? -1.0 : 1.0;
  return s * sqrt(min(dot2(ca), dot2(cb)));
}
float sdObj(int i, vec3 pw) {
  vec3 p = (uInv[i] * vec4(pw, 1.0)).xyz;
  vec4 q = uP[i];
  float k = uKind[i];
  if (k < 0.5) return 1e3;
  if (k < 1.5) return length(p) - q.x;
  if (k < 2.5) { vec3 d = abs(p) - q.xyz; return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0); }
  if (k < 3.5) { vec2 t = vec2(length(p.xz) - q.x, p.y); return length(t) - q.y; }
  if (k < 4.5) return sdCone(p, q.x, q.y, 0.0);
  vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(q.x, q.y);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}`;

const DISC_F = /* glsl */ `
uniform mat4 uInv[${MAXO}];
uniform vec4 uP[${MAXO}];
uniform float uKind[${MAXO}];
uniform vec3 uCol[${MAXO}];
uniform vec4 uHouse;
uniform vec4 uEye;
uniform float uTime;
varying vec3 vW;
varying vec2 vL;
${SDF_GLSL}
float sdBox2(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
void main() {
  float r = length(vL);
  vec3 col = vec3(0.03, 0.05, 0.1);
  float a = 0.78;
  // faint grid
  vec2 g = abs(fract(vL * 20.0) - 0.5);
  float grid = smoothstep(0.47, 0.5, max(g.x, g.y));
  col += vec3(0.08, 0.12, 0.25) * grid * 0.5;
  // the flatlander's field of view
  vec2 e = vL - uEye.xy;
  float ang = atan(e.x, -e.y) - uEye.z;
  ang = atan(sin(ang), cos(ang));
  if (abs(ang) < uEye.w * 0.5 && length(e) > 0.02) col += vec3(0.12, 0.12, 0.05) * (0.6 + 0.4 * sin(length(e) * 160.0 - uTime * 4.0)) * 0.35;
  // house walls
  vec2 hp = vL - uHouse.xy;
  float wall = abs(sdBox2(hp, vec2(uHouse.z))) - uHouse.w * 0.5;
  float fw = fwidth(wall);
  col = mix(col, vec3(0.78, 0.8, 0.9), smoothstep(fw, -fw, wall));
  // cross-sections of the solids
  for (int i = 0; i < ${MAXO}; i++) {
    float d = sdObj(i, vW);
    float w = max(fwidth(d), 1e-4);
    float inside = smoothstep(w, -w, d);
    float edge = smoothstep(0.0022 + w, 0.0022 - w, abs(d));
    col = mix(col, uCol[i] * 0.85, inside * 0.9);
    col = mix(col, uCol[i] * 1.6 + 0.25, edge);
  }
  // the flatlander: a small triangle with an eye
  vec2 ep = vL - uEye.xy;
  float c = cos(uEye.z), s = sin(uEye.z);
  vec2 lp = vec2(c * ep.x + s * ep.y, -s * ep.x + c * ep.y);
  float tri = max(abs(lp.x) * 1.7 - lp.y * 0.9, lp.y - 0.018) - 0.012; // apex forward (−z)
  col = mix(col, vec3(1.0), smoothstep(0.0012, -0.0012, tri));
  col = mix(col, vec3(0.1, 0.1, 0.2), smoothstep(0.004, 0.003, length(lp - vec2(0.0, 0.006))));
  // the rim of the world
  float rim = smoothstep(0.006, 0.0, abs(r - ${PLANE_R.toFixed(3)} + 0.004));
  col += vec3(0.4, 0.55, 1.0) * rim;
  gl_FragColor = vec4(col, max(a, rim));
}`;

// --- the same distance functions in JS, for the flatlander's 1D view ---
function sdCone(px, py, pz, h, r1) {
  const qx = Math.hypot(px, pz), qy = py;
  const k1x = 0, k1y = h, k2x = -r1, k2y = 2 * h;
  const cax = qx - Math.min(qx, qy < 0 ? r1 : 0), cay = Math.abs(qy) - h;
  const t = clamp(((k1x - qx) * k2x + (k1y - qy) * k2y) / (k2x * k2x + k2y * k2y), 0, 1);
  const cbx = qx - k1x + k2x * t, cby = qy - k1y + k2y * t;
  const s = cbx < 0 && cay < 0 ? -1 : 1;
  return s * Math.sqrt(Math.min(cax * cax + cay * cay, cbx * cbx + cby * cby));
}
function sdObj(o, x, y, z) {
  const e = o.inv.elements;
  const px = e[0] * x + e[4] * y + e[8] * z + e[12];
  const py = e[1] * x + e[5] * y + e[9] * z + e[13];
  const pz = e[2] * x + e[6] * y + e[10] * z + e[14];
  const q = o.p;
  switch (o.kind) {
    case 1: return Math.hypot(px, py, pz) - q[0];
    case 2: {
      const dx = Math.abs(px) - q[0], dy = Math.abs(py) - q[1], dz = Math.abs(pz) - q[2];
      return Math.hypot(Math.max(dx, 0), Math.max(dy, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dy, dz), 0);
    }
    case 3: return Math.hypot(Math.hypot(px, pz) - q[0], py) - q[1];
    case 4: return sdCone(px, py, pz, q[0], q[1]);
    case 5: {
      const dx = Math.abs(Math.hypot(px, pz)) - q[0], dy = Math.abs(py) - q[1];
      return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
    }
  }
  return 1e3;
}

const OBJECTS = [
  { id: 'sphere', name: '球', kind: 1, p: [0.075, 0, 0, 0], color: '#ff9a5a', geo: () => new THREE.SphereGeometry(0.075, 40, 24), bound: 0.075, home: [-0.05, 1.3, -0.62] },
  { id: 'cone', name: '円すい', kind: 4, p: [0.09, 0.075, 0, 0], color: '#58d0ff', geo: () => new THREE.ConeGeometry(0.075, 0.18, 40, 1), bound: 0.12, home: [0.16, 1.3, -0.62] },
  { id: 'cube', name: '立方体', kind: 2, p: [0.055, 0.055, 0.055, 0], color: '#9dff7a', geo: () => new THREE.BoxGeometry(0.11, 0.11, 0.11), bound: 0.096, home: [0.34, 1.3, -0.52] },
  { id: 'torus', name: 'ドーナツ', kind: 3, p: [0.06, 0.022, 0, 0], color: '#ff7ad9', geo: () => new THREE.TorusGeometry(0.06, 0.022, 20, 48).rotateX(Math.PI / 2), bound: 0.082, home: [-0.27, 1.3, -0.7] },
  { id: 'coin', name: '金貨', kind: 5, p: [0.03, 0.007, 0, 0], color: '#ffd34d', geo: () => new THREE.CylinderGeometry(0.03, 0.03, 0.014, 32), bound: 0.032, home: null },
];

export class Flatland extends Chapter {
  constructor(app) {
    super(app, {
      id: 'flatland', title: '平面の国', tag: 'math', sub: '2次元人の 目で 見る',
      desc: '2次元の 世界に 立体を 通すと、住人に 見えるのは 切り口だけ。密室から 物を 取り出す。',
    });
    this.view = { pos: [0, 1.62, 0.2], yaw: 0, pitch: -0.62 };
    this.keyHelp = 'T：最後に さわった 物を 傾ける';
    // the disc
    // drawn first and writing depth: the solids (translucent, drawn after) show the cut through themselves,
    // and their parts below the world are hidden by it
    this.discMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: true, side: THREE.DoubleSide,
      uniforms: {
        uInv: { value: Array.from({ length: MAXO }, () => new THREE.Matrix4()) },
        uP: { value: Array.from({ length: MAXO }, () => new THREE.Vector4()) },
        uKind: { value: new Array(MAXO).fill(0) },
        uCol: { value: Array.from({ length: MAXO }, () => new THREE.Color()) },
        uHouse: { value: new THREE.Vector4(HOUSE.x, HOUSE.z, HOUSE.h, HOUSE.t) },
        uEye: { value: new THREE.Vector4(EYE.x, EYE.z, EYE.yaw, EYE.fov) },
        uTime: { value: 0 },
      },
      vertexShader: 'varying vec3 vW; varying vec2 vL; void main(){ vL = vec2(position.x, -position.y); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: DISC_F,
    });
    this.disc = new THREE.Mesh(new THREE.CircleGeometry(PLANE_R, 96), this.discMat);
    this.disc.rotation.x = -Math.PI / 2; // local +y of the circle → world −z, so vL = (x, z)
    this.disc.position.copy(PLANE_C);
    this.disc.renderOrder = 1;
    this.root.add(this.disc);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(PLANE_R + 0.01, 0.06, 0.04, 64, 1, true), new THREE.MeshStandardMaterial({ color: '#141a3a', roughness: 0.6, side: THREE.DoubleSide }));
    base.position.set(PLANE_C.x, PLANE_Y - 0.03, PLANE_C.z);
    this.root.add(base);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.08, PLANE_Y - 0.05, 16), new THREE.MeshStandardMaterial({ color: '#141a3a', roughness: 0.6 }));
    stem.position.set(PLANE_C.x, (PLANE_Y - 0.05) / 2, PLANE_C.z);
    this.root.add(stem);
    // the 1D view strip, standing at the far edge of the world
    this.viewData = new Uint8Array(RAYS * 4);
    this.viewTex = new THREE.DataTexture(this.viewData, RAYS, 1, THREE.RGBAFormat);
    this.viewTex.colorSpace = THREE.SRGBColorSpace;
    this.viewTex.magFilter = THREE.NearestFilter;
    this.viewTex.needsUpdate = true;
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.06), new THREE.MeshBasicMaterial({ map: this.viewTex, toneMapped: false }));
    strip.position.set(0, 1.3, -1.06);
    this.root.add(strip);
    this.strip = strip;
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.1), new THREE.MeshBasicMaterial({ color: '#0a0d22' }));
    frame.position.set(0, 1.3, -1.062);
    this.root.add(frame);
    const cap = textPlane('住人の 目に 映る 世界（1次元の 像）', { h: 0.034, color: '#ffe3a8' });
    cap.position.set(0, 1.375, -1.06);
    this.root.add(cap);
    const cap2 = textPlane('← 住人の 左　　　　　　　　　　住人の 右 →', { h: 0.022, color: '#9aa3d6' });
    cap2.position.set(0, 1.235, -1.06);
    this.root.add(cap2);
    // the solids
    this.objs = OBJECTS.map((d, i) => {
      const mat = new THREE.MeshStandardMaterial({ color: d.color, roughness: 0.3, metalness: 0.1, transparent: true, opacity: d.id === 'coin' ? 0.7 : 0.36, depthWrite: false, emissive: d.color, emissiveIntensity: 0.12 });
      const mesh = new THREE.Mesh(d.geo(), mat);
      mesh.renderOrder = 2;
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 25), new THREE.LineBasicMaterial({ color: d.color, transparent: true, opacity: 0.6 }));
      edges.renderOrder = 3;
      mesh.add(edges);
      this.root.add(mesh);
      const o = { ...d, i, mesh, mat, inv: new THREE.Matrix4() };
      o.item = this.grabItem(o);
      return o;
    });
    this.coin = this.objs.find((o) => o.id === 'coin');
    this.items = this.objs.map((o) => o.item);
    this.last = this.objs[1];
    this.resetObjects();

    this.steps = [
      { title: '2次元の 世界', text: 'テーブルの 上の 光る 円盤は、2次元の 世界「**平面の国**」（アボット『フラットランド』1884）。住人（白い 三角）は この 平面の 中しか 知らず、「上」も「下」も ない。四角い 家の 壁は ただの 線。' },
      { title: '住人の 目', text: '住人の 目に 映るのは、奥の 帯のような **1次元の 像** だけ（近い 物ほど 明るい）。あなたの 網膜は 2次元で、そこから 3次元を 組み立てている。住人も 1次元の 像から 2次元を 組み立てる。家の 中は 壁に かくれて 見えない。' },
      { title: '球が 通る', text: '球を にぎって 平面に 通してみよう（ボタンでも）。住人には **点が 現れ、円が ふくらみ、しぼんで 消える** ように 見える。球の 全体は 決して 見えない。見えるのは その時々の 切り口だけ。', enter: () => this.sweep('sphere'), actions: () => [{ id: 'sweep', label: '球を 通す', primary: true }, { id: 'reset', label: 'もとに もどす' }] },
      { title: '切り口の 形', text: '円すい・立方体・ドーナツも 通してみよう。**傾けると 切り口が 変わる**。円すいなら 円・だ円・放物線・双曲線（円錐曲線）。立方体を 角から 通すと 三角形→六角形→三角形。ドーナツは 2つの 円にも なる。', actions: () => [{ id: 'sweepcube', label: '立方体を 角から 通す', primary: true }, { id: 'tilt', label: `${this.last.name}を 傾ける` }, { id: 'reset', label: 'もとに もどす' }] },
      { title: '密室から 取り出す', text: '家の 中の **金貨** を 上へ つまみ上げて、住人の 前に 置いてみよう。壁は 1つも 壊れていない。住人から 見ると、金貨は **密室から 消え、目の前に 突然 現れる**。', enter: () => { if (!this.coin.item.held) this.placeCoin(); }, actions: () => [{ id: 'coinout', label: '金貨を 取り出す', primary: true }, { id: 'coinback', label: '金貨を 家に もどす' }] },
      { title: 'あなたが 平面人', text: 'あなたは 住人の 家の 中を、壁ごしに 全部 **一度に** 見ている。同じように 4次元の 存在は、私たちの 閉じた 箱の 中身も 体の 中も 一度に 見て、壊さずに 取り出せる。次の 章では、あなたが 住人の 立場に なり、4次元の 物体の **切り口** を 見る。' },
    ];
  }

  resetObjects() {
    for (const o of this.objs) {
      o.mesh.quaternion.identity();
      if (o.home) o.mesh.position.fromArray(o.home);
    }
    this.placeCoin();
    this.anim = null;
  }

  placeCoin() {
    this.coin.mesh.position.set(PLANE_C.x + HOUSE.x, PLANE_Y, PLANE_C.z + HOUSE.z);
    this.coin.mesh.quaternion.identity();
  }

  grabItem(o) {
    const item = {
      enabled: () => this.root.visible,
      near: (p) => o.mesh.getWorldPosition(new THREE.Vector3()).distanceTo(p) - o.bound * 0.8,
      rayHit: (ray) => {
        const pt = ray.intersectSphere(new THREE.Sphere(o.mesh.getWorldPosition(new THREE.Vector3()), o.bound), new THREE.Vector3());
        return pt ? { d: pt.distanceTo(ray.origin), point: pt } : null;
      },
      press: (p, hit, direct) => {
        this.anim = null;
        this.last = o;
        o.mesh.updateWorldMatrix(true, false);
        if (direct) {
          const hand = new THREE.Matrix4().compose(p.pos, p.quat, new THREE.Vector3(1, 1, 1));
          item.held = { direct, rel: hand.invert().multiply(o.mesh.matrixWorld) };
        } else {
          const n = p.ray.direction.clone().negate();
          const objW = o.mesh.getWorldPosition(new THREE.Vector3());
          item.held = { direct, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(n, objW), off: objW.clone().sub(hit.point) };
        }
        o.mat.emissiveIntensity = 0.4;
        this.app.refreshPanel();
        return true;
      },
      drag: (p) => {
        const h = item.held;
        if (!h) return;
        const parent = o.mesh.parent;
        if (h.direct) {
          const hand = new THREE.Matrix4().compose(p.pos, p.quat, new THREE.Vector3(1, 1, 1));
          const w = hand.multiply(h.rel);
          const local = parent.matrixWorld.clone().invert().multiply(w);
          local.decompose(o.mesh.position, o.mesh.quaternion, new THREE.Vector3());
        } else {
          const pt = p.ray.intersectPlane(h.plane, new THREE.Vector3());
          if (pt) o.mesh.position.copy(parent.worldToLocal(pt.add(h.off)));
        }
      },
      release: () => { item.held = null; o.mat.emissiveIntensity = 0.12; },
    };
    return item;
  }

  sweep(id) {
    const o = this.objs.find((x) => x.id === id);
    this.last = o;
    o.mesh.quaternion.identity();
    if (id === 'cube') o.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(1, 1, 1).normalize(), new THREE.Vector3(0, 1, 0));
    this.anim = { o, t: 0, x: PLANE_C.x + 0.02, z: PLANE_C.z - 0.02, top: PLANE_Y + o.bound * 1.25 + 0.03, dur: 7 };
  }

  onAction(id) {
    if (id === 'sweep') this.sweep('sphere');
    else if (id === 'sweepcube') this.sweep('cube');
    else if (id === 'reset') this.resetObjects();
    else if (id === 'tilt') this.tilt();
    else if (id === 'coinout') {
      this.anim = { coin: true, t: 0, from: this.coin.mesh.position.clone(), to: new THREE.Vector3(PLANE_C.x + 0.03, PLANE_Y, PLANE_C.z + 0.12) };
    } else if (id === 'coinback') {
      this.anim = { coin: true, t: 0, from: this.coin.mesh.position.clone(), to: new THREE.Vector3(PLANE_C.x + HOUSE.x, PLANE_Y, PLANE_C.z + HOUSE.z) };
    }
  }

  tilt() {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0.3).normalize(), Math.PI / 12);
    this.last.mesh.quaternion.premultiply(q);
  }

  keys(k) {
    if (k.has('KeyT') && !this.tKey) { this.tKey = true; this.tilt(); }
    if (!k.has('KeyT')) this.tKey = false;
  }

  update(dt, t) {
    const a = this.anim;
    if (a && a.o) {
      a.t += dt / a.dur;
      const u = Math.min(1, a.t);
      const y = a.top - (a.top - (PLANE_Y - (a.top - PLANE_Y))) * (0.5 - 0.5 * Math.cos(u * Math.PI));
      a.o.mesh.position.set(a.x, y, a.z);
      if (u >= 1) { this.anim = null; if (a.o.home) a.o.mesh.position.fromArray(a.o.home); }
    } else if (a && a.coin) {
      a.t += dt / 2.6;
      const u = Math.min(1, a.t);
      const p = a.from.clone().lerp(a.to, u);
      p.y = PLANE_Y + Math.sin(u * Math.PI) * 0.16;
      this.coin.mesh.position.copy(p);
      if (u >= 1) this.anim = null;
    }
    // uniforms
    const U = this.discMat.uniforms;
    U.uTime.value = t;
    this.root.updateMatrixWorld(true);
    for (let i = 0; i < MAXO; i++) {
      const o = this.objs[i];
      if (!o) { U.uKind.value[i] = 0; continue; }
      o.inv.copy(o.mesh.matrixWorld).invert();
      U.uInv.value[i].copy(o.inv);
      U.uP.value[i].fromArray(o.p);
      U.uKind.value[i] = o.kind;
      U.uCol.value[i].set(o.color);
    }
    this.drawView();
  }

  // the flatlander's eye: march rays in the plane; what they hit, coloured and darkened with distance
  drawView() {
    const M = this.disc.matrixWorld;
    const origin = new THREE.Vector3(EYE.x, -EYE.z, 0).applyMatrix4(M); // disc-local (x, −z) → world
    const ax = new THREE.Vector3(1, 0, 0).transformDirection(M); // plane x
    const az = new THREE.Vector3(0, -1, 0).transformDirection(M); // plane z (towards you)
    const live = this.objs.filter((o) => {
      const c = o.mesh.getWorldPosition(new THREE.Vector3());
      const n = new THREE.Vector3(0, 0, 1).transformDirection(M);
      return Math.abs(c.clone().sub(origin).dot(n)) < o.bound + 0.002;
    });
    const cols = live.map((o) => new THREE.Color(o.color));
    const wallCol = [0.78, 0.8, 0.9];
    const p = new THREE.Vector3();
    for (let r = 0; r < RAYS; r++) {
      const ang = EYE.yaw + ((r + 0.5) / RAYS - 0.5) * EYE.fov; // 0 = −z; positive = to the right
      const dx = Math.sin(ang), dz = -Math.cos(ang);
      let s = 0.01, hit = null;
      while (s < 0.95) {
        const lx = EYE.x + dx * s, lz = EYE.z + dz * s;
        if (Math.hypot(lx, lz) > PLANE_R) break;
        // house walls (2D)
        const hx = Math.abs(lx - HOUSE.x) - HOUSE.h, hz = Math.abs(lz - HOUSE.z) - HOUSE.h;
        const box = Math.hypot(Math.max(hx, 0), Math.max(hz, 0)) + Math.min(Math.max(hx, hz), 0);
        let d = Math.abs(box) - HOUSE.t / 2;
        let what = d <= 0 ? -1 : null;
        if (what === null) {
          p.copy(origin).addScaledVector(ax, dx * s).addScaledVector(az, dz * s);
          for (let i = 0; i < live.length; i++) {
            const od = sdObj(live[i], p.x, p.y, p.z);
            if (od <= 0) { what = i; break; }
            d = Math.min(d, od);
          }
        }
        if (what !== null) { hit = { what, s }; break; }
        s += Math.max(d, 0.002);
      }
      let c;
      if (!hit) c = [0.04, 0.05, 0.12];
      else {
        const base = hit.what === -1 ? wallCol : [cols[hit.what].r, cols[hit.what].g, cols[hit.what].b];
        const k = clamp(1.15 - hit.s * 1.25, 0.25, 1);
        c = base.map((x) => x * k);
      }
      // the view is drawn left (the flatlander's left) to right
      this.viewData[r * 4] = Math.round(Math.pow(clamp(c[0], 0, 1), 1 / 2.2) * 255);
      this.viewData[r * 4 + 1] = Math.round(Math.pow(clamp(c[1], 0, 1), 1 / 2.2) * 255);
      this.viewData[r * 4 + 2] = Math.round(Math.pow(clamp(c[2], 0, 1), 1 / 2.2) * 255);
      this.viewData[r * 4 + 3] = 255;
    }
    this.viewTex.needsUpdate = true;
  }

  setupGuides() {
    const at = (id, dy = 0) => () => this.objs.find((o) => o.id === id).mesh.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, dy, 0));
    const disc = { at: () => this.disc.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0.3, 0.02, 0.2)), label: 'ここが 2次元の 世界', r: 0.03 };
    const strip = { at: () => this.strip.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0.36, 0, 0.01)), label: '住人の 見え方', r: 0.03 };
    this.guides = [
      { vr: '立体（球・円すい など）は、手を 近づけて **グリップ** で にぎれる。説明は 案内板の「つぎへ」で 進む。', hand: '立体は 手を 近づけて **つまむ** と にぎれる。', pc: '立体は **ドラッグ** で 動かせる。', targets: [disc] },
      { vr: '奥の **帯** を 見る。立体を 円盤に 入れると、帯に 色が 現れる。', pc: '奥の **帯** を 見る。立体を 円盤に 入れると、帯に 色が 現れる。', targets: [strip] },
      { vr: '**オレンジの 球** を グリップで にぎり、円盤を **下へ くぐらせる**。「球を 通す」ボタンでも。', hand: '球を つまんで 円盤の 下へ くぐらせる。', pc: '球を **下へ ドラッグ** して 円盤を くぐらせる。', targets: [{ at: at('sphere'), vr: 'にぎって 下へ', pc: '下へ ドラッグ', r: 0.085 }] },
      { vr: '円すい・立方体・ドーナツを にぎり、**手首を ひねって 傾けながら** 通す。', hand: 'つまんで 手首を ひねりながら 通す。', pc: 'ドラッグで 通す。**T キー** で 傾ける。', targets: [{ at: at('cone'), label: '円すい', r: 0.1 }, { at: at('cube'), label: '立方体', r: 0.08 }, { at: at('torus'), label: 'ドーナツ', r: 0.08 }] },
      { vr: '家（四角）の 中の **金貨** を にぎって **上へ 持ち上げ**、白い 三角（住人）の 前に 置く。', hand: '金貨を つまんで 持ち上げ、住人の 前に 置く。', pc: '金貨を **上へ ドラッグ** してから、住人の 前へ 下ろす。', targets: [{ at: at('coin', 0.01), vr: 'にぎって 持ち上げる', pc: 'ドラッグで 持ち上げる', r: 0.04 }] },
      { vr: '「次の章へ」で、4次元の 切り口へ。', pc: '「次の章へ」で、4次元の 切り口へ。' },
    ];
  }

}
