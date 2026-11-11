// js/player/handrig.js — realistic skinned hands (OPUS-A).
// Mesh: WebXR Input Profiles "generic-hand" (MIT, © 2019 Amazon; @webxr-input-profiles/assets 1.0.20), read by a
// tiny GLB reader (no GLTFLoader) and skinned on the CPU every frame into an ordinary indexed geometry, so it uses
// the shared lit material (smooth normals, spec, rim, per-vertex AO) without a skinning shader.
// The asset's armature space is the WebXR grip space (fingers −Y, back of the right hand +X, thumb toward −Z),
// so the hand sits under the grip group with an identity transform.
// Poses: hand tracking copies the XR joints; controllers / desktop curl the same bones procedurally
// (relaxed → grip / trigger curls, or a "wrap" solved so each finger closes onto the held item's handle).
import * as THREE from 'three';
import { HAND_JOINTS } from '../core/config.js';

// full literals: tools/build.mjs precaches CDN .glb URLs it finds in js/ (offline play)
export const HAND_URLS = {
  left: 'https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0.20/dist/profiles/generic-hand/left.glb',
  right: 'https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0.20/dist/profiles/generic-hand/right.glb',
};
export { HAND_JOINTS };
// chains: [bone indices from base to tip], flex = which of them bend
export const FINGERS = [
  { name: 'thumb', bones: [1, 2, 3, 4], flex: [1, 2, 3] },
  { name: 'index', bones: [5, 6, 7, 8, 9], flex: [6, 7, 8] },
  { name: 'middle', bones: [10, 11, 12, 13, 14], flex: [11, 12, 13] },
  { name: 'ring', bones: [15, 16, 17, 18, 19], flex: [16, 17, 18] },
  { name: 'pinky', bones: [20, 21, 22, 23, 24], flex: [21, 22, 23] },
];

// ── GLB reader (only what a skinned hand needs) ──
const COMP = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array };
const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
export function parseGLB(buf) {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB');
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));
  const binStart = 20 + jsonLen + 8;
  const read = (i) => {
    const a = json.accessors[i];
    const bv = json.bufferViews[a.bufferView];
    const T = COMP[a.componentType];
    const n = a.count * SIZE[a.type];
    const off = binStart + (bv.byteOffset || 0) + (a.byteOffset || 0);
    if (bv.byteStride && bv.byteStride !== T.BYTES_PER_ELEMENT * SIZE[a.type]) throw new Error('strided data');
    return off % T.BYTES_PER_ELEMENT === 0 ? new T(buf, off, n).slice() : new T(buf.slice(off, off + n * T.BYTES_PER_ELEMENT));
  };
  const prim = json.meshes[0].primitives[0];
  const skin = json.skins[0];
  const names = skin.joints.map((j) => json.nodes[j].name);
  const rest = skin.joints.map((j) => {
    const n = json.nodes[j];
    return { p: n.translation || [0, 0, 0], q: n.rotation || [0, 0, 0, 1] };
  });
  let joints = read(prim.attributes.JOINTS_0);
  if (!(joints instanceof Uint8Array) && !(joints instanceof Uint16Array)) joints = Uint16Array.from(joints);
  // reorder joints to HAND_JOINTS order
  const map = names.map((n) => HAND_JOINTS.indexOf(n));
  if (map.some((m) => m < 0)) throw new Error('unexpected joint names');
  const remapped = new Uint8Array(joints.length);
  for (let i = 0; i < joints.length; i++) remapped[i] = map[joints[i]];
  const restOrdered = new Array(25), ibmSrc = read(skin.inverseBindMatrices), ibm = new Float32Array(25 * 16);
  for (let i = 0; i < 25; i++) { restOrdered[map[i]] = rest[i]; ibm.set(ibmSrc.subarray(i * 16, i * 16 + 16), map[i] * 16); }
  return {
    position: read(prim.attributes.POSITION), normal: read(prim.attributes.NORMAL), uv: prim.attributes.TEXCOORD_0 != null ? read(prim.attributes.TEXCOORD_0) : null,
    joints: remapped, weights: read(prim.attributes.WEIGHTS_0), index: read(prim.indices),
    rest: restOrdered, ibm,
  };
}

const C_BACK = new THREE.Color(0x5e3c26), C_KNUCKLE = new THREE.Color(0x7a5134), C_PALM = new THREE.Color(0xa47c55),
  C_PIPING = new THREE.Color(0xe2cda2), C_TIP = new THREE.Color(0x4f3220);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _ax = new THREE.Vector3();
const _m = new THREE.Matrix4(), _one = new THREE.Vector3(1, 1, 1), _c = new THREE.Color();
const X1 = new THREE.Vector3(1, 0, 0), Y1 = new THREE.Vector3(0, 1, 0), Z1 = new THREE.Vector3(0, 0, 1);

/** one hand: geometry (skinned on the CPU), pose state, posing helpers */
export function createHandRig(data, side, material, gripCenter = new THREE.Vector3(), art = null) {
  // where the grip origin (the held item's axis) sits inside the curled fingers, in the asset's space;
  // procedural poses are shifted by −gripCenter so held handles lie in the fist (hand tracking is absolute)
  const nV = data.position.length / 3;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(nV * 3), nrm = new Float32Array(nV * 3), col = new Float32Array(nV * 4);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  if (data.uv) geo.setAttribute('uv', new THREE.BufferAttribute(data.uv, 2));
  geo.setIndex(new THREE.BufferAttribute(data.index, 1));
  // per-vertex facts for the texture bake: base colour, side (d), distance along the bone (s), region
  const vBase = new Float32Array(nV * 3), vD = new Float32Array(nV), vS = new Float32Array(nV), vF = new Int8Array(nV), vSeg = new Int8Array(nV);
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'glove-' + side;
  mesh.frustumCulled = false;

  // rest pose and the working pose (hand / grip space)
  const restP = data.rest.map((r) => new THREE.Vector3().fromArray(r.p));
  const restQ = data.rest.map((r) => new THREE.Quaternion().fromArray(r.q));
  const P = restP.map((p) => p.clone()), Q = restQ.map((q) => q.clone());
  const boneMat = new Float32Array(25 * 16);
  const dorsal = restQ.map((q) => Y1.clone().applyQuaternion(q));     // +Y of each joint = back of the hand

  // ── leather glove colours (RGBA, alpha = AO) from the rest shape ──
  {
    const rp = data.position, rn = data.normal, J = data.joints, W = data.weights;
    for (let v = 0; v < nV; v++) {
      let best = 0, bw = -1;
      for (let k = 0; k < 4; k++) if (W[v * 4 + k] > bw) { bw = W[v * 4 + k]; best = J[v * 4 + k]; }
      _v.set(rn[v * 3], rn[v * 3 + 1], rn[v * 3 + 2]);
      const d = _v.dot(dorsal[best]);                       // +1 back of the hand … −1 palm
      const finger = FINGERS.findIndex((f) => f.bones.includes(best));
      const seg = finger >= 0 ? FINGERS[finger].bones.indexOf(best) : -1;
      vD[v] = d; vF[v] = finger; vSeg[v] = seg;
      // distance along the bone (−Z of its frame) from its joint: drives stitch dashes
      _v2.set(rp[v * 3], rp[v * 3 + 1], rp[v * 3 + 2]).sub(restP[best]);
      vS[v] = -_v2.dot(_ax.set(0, 0, 1).applyQuaternion(restQ[best])) + best * 0.37;
      // two-tone: dark back panels, suede palm, a light welt along the finger seams
      _c.copy(C_BACK).lerp(C_PALM, THREE.MathUtils.smoothstep(-d, -0.15, 0.35));
      if (finger >= 1 && seg >= 1 && Math.abs(d) < 0.12) _c.lerp(C_PIPING, 0.75);
      if (finger === 0 && seg >= 1 && Math.abs(d) < 0.1) _c.lerp(C_PIPING, 0.6);
      // knuckle guard: lighter leather over the knuckles
      _v2.set(rp[v * 3], rp[v * 3 + 1], rp[v * 3 + 2]);
      if (finger >= 1 && d > 0.3) {
        const kj = FINGERS[finger].bones[1];
        if (_v2.distanceTo(restP[kj]) < 0.012) _c.lerp(C_KNUCKLE, 0.8);
      }
      // worn, darker finger tips
      if (seg >= 3) _c.lerp(C_TIP, 0.35);
      // AO: creases between the fingers and on the palm side of the joints
      let ao = 1;
      if (finger >= 1) {
        const lat = Math.abs(_v.dot(_ax.set(1, 0, 0).applyQuaternion(restQ[best])));
        if (finger === 2 || finger === 3) ao -= 0.28 * THREE.MathUtils.smoothstep(lat, 0.55, 0.95);
        else ao -= 0.14 * THREE.MathUtils.smoothstep(lat, 0.55, 0.95);
        if (d < -0.3) for (const fj of FINGERS[finger].flex) if (_v2.distanceTo(restP[fj]) < 0.008) ao = Math.min(ao, 0.62);
      }
      if (best === 0 && d < -0.3) ao = Math.min(ao, 0.85);
      vBase[v * 3] = _c.r; vBase[v * 3 + 1] = _c.g; vBase[v * 3 + 2] = _c.b;
      col[v * 4] = _c.r; col[v * 4 + 1] = _c.g; col[v * 4 + 2] = _c.b; col[v * 4 + 3] = ao;
    }
  }
  // a baked leather texture (stitched seams, grain) when the asset has UVs: then the vertex colour keeps only AO
  if (data.uv && art && typeof document !== 'undefined') {
    try {
      const tex = bakeGloveTexture(art, data, { vBase, vD, vS, vF, vSeg, restP });
      material = art.material({ color: 0xffffff, vertexColors: true, flat: false, rim: 0.35, spec: 0.12, gloss: 10, map: tex });
      mesh.material = material;
      for (let v = 0; v < nV; v++) { col[v * 4] = 1; col[v * 4 + 1] = 1; col[v * 4 + 2] = 1; }
      mesh.userData.baked = true;
    } catch (e) { console.info('[AW] glove bake skipped:', e && e.message); }
  }

  function setRest() {
    for (let i = 0; i < 25; i++) { P[i].copy(restP[i]); Q[i].copy(restQ[i]); }
  }
  /** bend joint j of a chain by angle (rad, + = toward the palm); carries everything distal to it */
  function bend(chain, from, angle) {
    if (!angle) return;
    const j = chain[from];
    _ax.copy(X1).applyQuaternion(Q[j]);
    _q.setFromAxisAngle(_ax, -angle);
    const pivot = P[j];
    for (let k = from; k < chain.length; k++) {
      const b = chain[k];
      if (k > from) { _v.copy(P[b]).sub(pivot).applyQuaternion(_q); P[b].copy(pivot).add(_v); }
      Q[b].premultiply(_q);
    }
  }
  /** pose = rest + per finger flex angles (array of 5 × 3) */
  function pose(angles) {
    setRest();
    for (let f = 0; f < 5; f++) {
      const F = FINGERS[f];
      for (let j = 0; j < 3; j++) bend(F.bones, F.bones.indexOf(F.flex[j]), angles[f * 3 + j]);
    }
    for (let i = 0; i < 25; i++) P[i].sub(gripCenter);
  }
  /** joints from XR (already in grip space): positions + orientations, 25 × 7 floats */
  function poseFromJoints(arr) {
    for (let i = 0; i < 25; i++) {
      P[i].set(arr[i * 7], arr[i * 7 + 1], arr[i * 7 + 2]);
      Q[i].set(arr[i * 7 + 3], arr[i * 7 + 4], arr[i * 7 + 5], arr[i * 7 + 6]);
    }
  }
  /** curl angles that close a finger onto a cylinder along Z through (cx, cy) of radius r (+ finger radius) */
  function solveWrap(r, cx = 0, cy = 0, maxA = 1.75) {
    cx += gripCenter.x; cy += gripCenter.y;
    const out = new Float32Array(15);
    const tmpP = P.map((p) => p.clone()), tmpQ = Q.map((q) => q.clone());
    for (let f = 0; f < 5; f++) {
      const F = FINGERS[f];
      const fr = f === 0 ? 0.0105 : f === 4 ? 0.0075 : 0.0085;
      const R = r + fr;
      for (let j = 0; j < 3; j++) {
        const from = F.bones.indexOf(F.flex[j]);
        // save
        const save = F.bones.map((b) => [P[b].clone(), Q[b].clone()]);
        const clear = (a) => {
          F.bones.forEach((b, i) => { P[b].copy(save[i][0]); Q[b].copy(save[i][1]); });
          bend(F.bones, from, a);
          // smallest distance from the moved segment(s) to the axis
          let dmin = Infinity;
          for (let k = from; k < F.bones.length - 1; k++) {
            const a0 = P[F.bones[k]], a1 = P[F.bones[k + 1]];
            for (let s = 0; s <= 4; s++) {
              const x = a0.x + (a1.x - a0.x) * s / 4 - cx, y = a0.y + (a1.y - a0.y) * s / 4 - cy;
              dmin = Math.min(dmin, Math.hypot(x, y));
            }
          }
          return dmin;
        };
        const lim = j === 0 ? maxA * 0.95 : maxA;
        let lo = 0, hi = lim;
        if (clear(hi) >= R) lo = hi;
        else if (clear(0) < R) lo = 0;
        else for (let it = 0; it < 18; it++) { const mid = (lo + hi) / 2; if (clear(mid) >= R) lo = mid; else hi = mid; }
        out[f * 3 + j] = lo;
        F.bones.forEach((b, i) => { P[b].copy(save[i][0]); Q[b].copy(save[i][1]); });
        bend(F.bones, from, lo);
      }
    }
    for (let i = 0; i < 25; i++) { P[i].copy(tmpP[i]); Q[i].copy(tmpQ[i]); }
    return out;
  }

  /** CPU skinning of the current pose into the geometry */
  function skin() {
    for (let i = 0; i < 25; i++) {
      _m.compose(P[i], Q[i], _one);
      _m.multiplyMatrices(_m, _mI.fromArray(data.ibm, i * 16));
      boneMat.set(_m.elements, i * 16);
    }
    const rp = data.position, rn = data.normal, J = data.joints, W = data.weights, M = boneMat;
    for (let v = 0; v < nV; v++) {
      const x = rp[v * 3], y = rp[v * 3 + 1], z = rp[v * 3 + 2];
      const nx = rn[v * 3], ny = rn[v * 3 + 1], nz = rn[v * 3 + 2];
      let ox = 0, oy = 0, oz = 0, px = 0, py = 0, pz = 0;
      for (let k = 0; k < 4; k++) {
        const w = W[v * 4 + k];
        if (w === 0) continue;
        const o = J[v * 4 + k] * 16;
        ox += w * (M[o] * x + M[o + 4] * y + M[o + 8] * z + M[o + 12]);
        oy += w * (M[o + 1] * x + M[o + 5] * y + M[o + 9] * z + M[o + 13]);
        oz += w * (M[o + 2] * x + M[o + 6] * y + M[o + 10] * z + M[o + 14]);
        px += w * (M[o] * nx + M[o + 4] * ny + M[o + 8] * nz);
        py += w * (M[o + 1] * nx + M[o + 5] * ny + M[o + 9] * nz);
        pz += w * (M[o + 2] * nx + M[o + 6] * ny + M[o + 10] * nz);
      }
      pos[v * 3] = ox; pos[v * 3 + 1] = oy; pos[v * 3 + 2] = oz;
      const L = Math.hypot(px, py, pz) || 1;
      nrm[v * 3] = px / L; nrm[v * 3 + 1] = py / L; nrm[v * 3 + 2] = pz / L;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
  }
  setRest();
  skin();
  geo.computeBoundingSphere();
  return { mesh, geo, P, Q, restP, restQ, pose, poseFromJoints, solveWrap, skin, setRest, triangles: data.index.length / 3 };
}
const _mI = new THREE.Matrix4();

// ── texture bake in UV space ──
const vnoise = (x, y, z) => {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const h = (a, b, c) => { const n = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return n - Math.floor(n); };
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(h(xi, yi, zi), h(xi + 1, yi, zi), u), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
    l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v), w);
};
function bakeGloveTexture(art, data, A) {
  const N = 512;
  const img = new Float32Array(N * N * 3), have = new Uint8Array(N * N);
  const uv = data.uv, idx = data.index, rp = data.position;
  const THREAD = [0.8, 0.71, 0.54];
  // knuckle row height as a function of z (back of the hand seam above the knuckles)
  const kz = [6, 11, 16, 21].map((b) => [A.restP[b].z, A.restP[b].y]).sort((a, b) => a[0] - b[0]);
  const kY = (z) => { if (z <= kz[0][0]) return kz[0][1]; for (let i = 1; i < kz.length; i++) if (z <= kz[i][0]) { const t = (z - kz[i - 1][0]) / (kz[i][0] - kz[i - 1][0]); return kz[i - 1][1] + (kz[i][1] - kz[i - 1][1]) * t; } return kz[kz.length - 1][1]; };
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const ax = uv[a * 2] * N, ay = uv[a * 2 + 1] * N, bx = uv[b * 2] * N, by = uv[b * 2 + 1] * N, cx = uv[c * 2] * N, cy = uv[c * 2 + 1] * N;
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area) < 1e-9) continue;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(N - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(N - 1, Math.ceil(Math.max(ay, by, cy)));
    const fRegion = A.vF[a], seg = Math.max(A.vSeg[a], A.vSeg[b], A.vSeg[c]);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      let w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area;
      let w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area;
      let w2 = 1 - w0 - w1;
      if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;
      w0 = Math.max(0, w0); w1 = Math.max(0, w1); w2 = Math.max(0, w2);
      const k = y * N + x;
      let r = A.vBase[a * 3] * w0 + A.vBase[b * 3] * w1 + A.vBase[c * 3] * w2;
      let g = A.vBase[a * 3 + 1] * w0 + A.vBase[b * 3 + 1] * w1 + A.vBase[c * 3 + 1] * w2;
      let bl = A.vBase[a * 3 + 2] * w0 + A.vBase[b * 3 + 2] * w1 + A.vBase[c * 3 + 2] * w2;
      const d = A.vD[a] * w0 + A.vD[b] * w1 + A.vD[c] * w2;
      const sx = A.vS[a] * w0 + A.vS[b] * w1 + A.vS[c] * w2;
      const X = rp[a * 3] * w0 + rp[b * 3] * w1 + rp[c * 3] * w2, Y = rp[a * 3 + 1] * w0 + rp[b * 3 + 1] * w1 + rp[c * 3 + 1] * w2, Z = rp[a * 3 + 2] * w0 + rp[b * 3 + 2] * w1 + rp[c * 3 + 2] * w2;
      // leather grain: fine pores + soft mottling
      let m = 0.9 + 0.12 * vnoise(X * 900, Y * 900, Z * 900) + 0.06 * vnoise(X * 160, Y * 160, Z * 160);
      // finger side seams: a groove with a dashed thread
      const onFinger = fRegion >= 0 && seg >= 1;
      if (onFinger) {
        const ad = Math.abs(d);
        if (ad < 0.075) { if ((sx / 0.0034) % 1 < 0.55) { r = THREAD[0]; g = THREAD[1]; bl = THREAD[2]; m = 1; } else m *= 0.7; }
        else if (ad < 0.12) m *= 0.78;
      }
      // a stitched seam across the back of the hand above the knuckles
      if (!onFinger && d > 0.35) {
        const dy = Y - kY(Z);
        if (Math.abs(dy - 0.014) < 0.0013) { if ((Z / 0.0034) % 1 < 0.55 || (Z / 0.0034) % 1 < -0.45) { r = THREAD[0]; g = THREAD[1]; bl = THREAD[2]; m = 1; } else m *= 0.72; }
        else if (Math.abs(dy - 0.014) < 0.0028) m *= 0.85;
      }
      // the wrist band under the cuff: darker, with a seam
      if (Y > 0.064) { m *= 0.78; if (Math.abs(Y - 0.066) < 0.0012) { r = THREAD[0] * 0.9; g = THREAD[1] * 0.9; bl = THREAD[2] * 0.9; m = 1; } }
      img[k * 3] = r * m; img[k * 3 + 1] = g * m; img[k * 3 + 2] = bl * m; have[k] = 1;
    }
  }
  // pad the UV islands (no dark seams from mip-mapping)
  for (let it = 0; it < 4; it++) {
    const add = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const k = y * N + x;
      if (have[k]) continue;
      let n = 0, r = 0, g = 0, b = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
        const kk = yy * N + xx;
        if (have[kk] === 1) { n++; r += img[kk * 3]; g += img[kk * 3 + 1]; b += img[kk * 3 + 2]; }
      }
      if (n) add.push(k, r / n, g / n, b / n);
    }
    for (let i = 0; i < add.length; i += 4) { const k = add[i]; img[k * 3] = add[i + 1]; img[k * 3 + 1] = add[i + 2]; img[k * 3 + 2] = add[i + 3]; have[k] = 2; }
    for (let k = 0; k < have.length; k++) if (have[k] === 2) have[k] = 1;
  }
  const tex = art.canvasTexture(N, N, (c2) => {
    const id = c2.createImageData(N, N);
    for (let k = 0; k < N * N; k++) {
      // linear → sRGB bytes (the canvas texture is sRGB)
      for (let ch = 0; ch < 3; ch++) id.data[k * 4 + ch] = Math.round(255 * Math.pow(Math.min(1, Math.max(0, img[k * 3 + ch])), 1 / 2.2));
      id.data[k * 4 + 3] = 255;
    }
    c2.putImageData(id, 0, 0);
  });
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

/** fetch + parse both hands; rejects when offline and not cached */
export async function loadHandData() {
  const get = async (s) => {
    const r = await fetch(HAND_URLS[s], { mode: 'cors' });
    if (!r.ok) throw new Error('hand asset HTTP ' + r.status);
    return parseGLB(await r.arrayBuffer());
  };
  const [left, right] = await Promise.all([get('left'), get('right')]);
  return { left, right };
}
