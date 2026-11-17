// track/track.js — a closed spline road: sampling, the kart-facing queries (where am I, how high is the
// ground, how far from the centre line) and the road meshes (surface, curbs, shoulders, walls, skirt).
//
// Frame per sample k (every ~2 m): P position, T tangent, R right (banked on curves), U surface normal.
// A point on the road surface at lateral offset d is P + R*d. Positive d = right of the driving direction.
import * as THREE from 'three';
import { clamp, mod, smoothstep, canvasTexture } from '../engine/util.js';

const UP = new THREE.Vector3(0, 1, 0);

export class Track {
  constructor(def) {
    this.def = def;
    const road = def.road;
    this.halfWidth = road.width / 2;
    this.curb = road.curb ?? 0.9;
    this.shoulder = road.shoulder ?? 5;
    const pts = def.points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    curve.arcLengthDivisions = 6000;
    this.curve = curve;
    const L = curve.getLength();
    const N = Math.max(200, Math.round(L / 2));
    this.N = N; this.length = L; this.step = L / N;
    this.P = []; this.T = []; this.R = []; this.U = []; this.HW = []; this.curv = []; this.bank = [];
    const nCtl = pts.length;
    for (let k = 0; k < N; k++) {
      const u = k / N;
      this.P.push(curve.getPointAt(u));
      // width multiplier from the control points (4th value), smoothly interpolated
      const t = curve.getUtoTmapping(u) * nCtl;
      const j = Math.floor(t) % nCtl, f = t - Math.floor(t);
      const w0 = def.points[j][3] ?? 1, w1 = def.points[(j + 1) % nCtl][3] ?? 1;
      this.HW.push(this.halfWidth * (w0 + (w1 - w0) * smoothstep(0, 1, f)));
    }
    for (let k = 0; k < N; k++) {
      const t = new THREE.Vector3().subVectors(this.P[mod(k + 1, N)], this.P[mod(k - 1, N)]).normalize();
      this.T.push(t);
    }
    // signed horizontal curvature (positive = right turn)
    const raw = [];
    for (let k = 0; k < N; k++) {
      const a = this.T[mod(k - 2, N)], b = this.T[mod(k + 2, N)];
      // (x,z) cross of the tangents: +z turning toward -x (its right side) gives +1
      raw.push((a.x * b.z - a.z * b.x) / (4 * this.step));
    }
    this.curv = smooth(raw, 3);
    const bankF = road.bank ?? 5;
    this.bank = smooth(this.curv.map((c) => clamp(c * bankF, -0.2, 0.2)), 8);
    for (let k = 0; k < N; k++) {
      const T = this.T[k];
      const rh = new THREE.Vector3(-T.z, 0, T.x).normalize();
      const b = this.bank[k];
      const R = rh.multiplyScalar(Math.cos(b)).add(new THREE.Vector3(0, -Math.sin(b), 0)).normalize();
      this.R.push(R);
      this.U.push(new THREE.Vector3().crossVectors(R, T).normalize());
    }
    this.racing = this.buildRacingLine();
    this._v = new THREE.Vector3();
  }

  wallD(k) { return this.HW[k] + this.curb + this.shoulder; }

  // AI racing line: inside of upcoming curves, smoothed
  buildRacingLine() {
    const N = this.N, out = new Array(N);
    const look = smooth(this.curv.map((_, k) => this.curv[mod(k + 6, N)]), 10);
    for (let k = 0; k < N; k++) out[k] = clamp(look[k] * 140, -1, 1) * this.HW[k] * 0.55;
    return smooth(out, 8);
  }

  // locate(pos, hint, out): nearest frame. hint = previous sample index (local search) or -1 (global)
  locate(pos, hint, out = {}) {
    const N = this.N, P = this.P;
    let best = 0, bd = Infinity;
    if (hint == null || hint < 0) {
      for (let i = 0; i < N; i++) {
        const p = P[i];
        const d2 = (pos.x - p.x) ** 2 + (pos.z - p.z) ** 2 + ((pos.y - p.y) * 1.5) ** 2;
        if (d2 < bd) { bd = d2; best = i; }
      }
    } else {
      for (let o = -12; o <= 12; o++) {
        const i = mod(hint + o, N), p = P[i];
        const d2 = (pos.x - p.x) ** 2 + (pos.z - p.z) ** 2 + ((pos.y - p.y) * 1.5) ** 2;
        if (d2 < bd) { bd = d2; best = i; }
      }
    }
    let i = best;
    let T = this.T[i];
    let s = (pos.x - P[i].x) * T.x + (pos.z - P[i].z) * T.z;
    if (s < 0) { i = mod(i - 1, N); T = this.T[i]; s = (pos.x - P[i].x) * T.x + (pos.z - P[i].z) * T.z; }
    const j = mod(i + 1, N);
    const segH = Math.hypot(P[j].x - P[i].x, P[j].z - P[i].z) || this.step;
    const f = clamp(s / segH, 0, 1);
    const Pi = P[i], Pj = P[j], Ri = this.R[i], Rj = this.R[j];
    const px = Pi.x + (Pj.x - Pi.x) * f, py = Pi.y + (Pj.y - Pi.y) * f, pz = Pi.z + (Pj.z - Pi.z) * f;
    const rx = Ri.x + (Rj.x - Ri.x) * f, ry = Ri.y + (Rj.y - Ri.y) * f, rz = Ri.z + (Rj.z - Ri.z) * f;
    const rl = Math.hypot(rx, ry, rz);
    const rxn = rx / rl, ryn = ry / rl, rzn = rz / rl;
    const rh2 = rxn * rxn + rzn * rzn;
    const d = ((pos.x - px) * rxn + (pos.z - pz) * rzn) / rh2;
    out.i = i; out.f = f; out.prog = i + f; out.d = d;
    out.y = py + ryn * d;
    out.hw = this.HW[i] + (this.HW[j] - this.HW[i]) * f;
    out.wall = out.hw + this.curb + this.shoulder;
    out.rx = rxn / Math.sqrt(rh2); out.rz = rzn / Math.sqrt(rh2); // horizontal unit right
    out.tx = T.x; out.tz = T.z; out.ty = T.y;
    out.ux = this.U[i].x; out.uy = this.U[i].y; out.uz = this.U[i].z;
    out.heading = Math.atan2(T.x, T.z);
    return out;
  }

  // point on the surface at progress p (sample units, fractional) and lateral offset d
  pointAt(p, d = 0, out = new THREE.Vector3()) {
    const N = this.N;
    const i = mod(Math.floor(p), N), j = mod(i + 1, N), f = p - Math.floor(p);
    const Pi = this.P[i], Pj = this.P[j], Ri = this.R[i], Rj = this.R[j];
    out.set(Pi.x + (Pj.x - Pi.x) * f, Pi.y + (Pj.y - Pi.y) * f, Pi.z + (Pj.z - Pi.z) * f);
    out.x += (Ri.x + (Rj.x - Ri.x) * f) * d;
    out.y += (Ri.y + (Rj.y - Ri.y) * f) * d;
    out.z += (Ri.z + (Rj.z - Ri.z) * f) * d;
    return out;
  }

  headingAt(p) { const T = this.T[mod(Math.round(p), this.N)]; return Math.atan2(T.x, T.z); }

  // object placed on the road surface, facing along the track (local +z = forward)
  placeOn(obj, p, d = 0, lift = 0) {
    const k = mod(Math.round(p), this.N);
    this.pointAt(p, d, obj.position);
    const U = this.U[k], T = this.T[k], R = this.R[k];
    obj.position.addScaledVector(U, lift);
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3().copy(R).negate(), U, T);
    obj.quaternion.setFromRotationMatrix(m);
    return obj;
  }

  // nearest horizontal distance from (x, z) to the centre line (global scan; for scenery placement)
  distanceToCenter(x, z, yHint = null) {
    let bd = Infinity;
    for (let i = 0; i < this.N; i++) {
      const p = this.P[i];
      if (yHint !== null && Math.abs(p.y - yHint) > 30) continue;
      const d2 = (x - p.x) ** 2 + (z - p.z) ** 2;
      if (d2 < bd) bd = d2;
    }
    return Math.sqrt(bd);
  }

  // is (x,z) clear of every road strip by margin (counted from the outer wall)
  clearOfRoad(x, z, margin = 2) {
    const lim = this.halfWidth * 1.3 + this.curb + this.shoulder + margin;
    return this.distanceToCenter(x, z) > lim;
  }

  bounds() {
    const b = new THREE.Box3();
    for (const p of this.P) b.expandByPoint(p);
    return b;
  }

  // ----------------------------------------------------------------------------------------------
  // meshes
  // strip(dA(k), dB(k), hA, hB): a ribbon between two lateral offsets (functions of sample k) at heights
  // above the surface (world up). u runs 0→1 across, v = distance / vScale.
  strip(dA, dB, hA = 0, hB = 0, vScale = 10, { flipNormal = false } = {}) {
    const N = this.N;
    const pos = new Float32Array((N + 1) * 2 * 3), uv = new Float32Array((N + 1) * 2 * 2);
    const v = this._v;
    for (let k = 0; k <= N; k++) {
      const kk = k % N;
      const P = this.P[kk], R = this.R[kk];
      const a = dA(kk), b = dB(kk);
      v.copy(P).addScaledVector(R, a).addScaledVector(UP, hA);
      pos.set([v.x, v.y, v.z], k * 6);
      v.copy(P).addScaledVector(R, b).addScaledVector(UP, hB);
      pos.set([v.x, v.y, v.z], k * 6 + 3);
      const vv = (k * this.step) / vScale;
      uv.set([0, vv, 1, vv], k * 4);
    }
    const idx = [];
    for (let k = 0; k < N; k++) {
      const a = k * 2, b = k * 2 + 1, c = k * 2 + 2, d = k * 2 + 3;
      // (a,b,c): with dA < dB the face points up
      if (!flipNormal) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // builds the road. style comes from the course definition (def.road)
  buildMeshes(style) {
    const group = new THREE.Group();
    group.name = 'track';
    const hw = (k) => this.HW[k];
    const cb = this.curb, sh = this.shoulder;
    const W = this.halfWidth * 2;

    // road surface
    const roadTex = canvasTexture(512, (ctx, s) => (style.paintRoad || defaultRoadPaint)(ctx, s, style));
    const roadMat = new THREE.MeshStandardMaterial({
      map: roadTex, roughness: style.roadRoughness ?? 0.8, metalness: style.roadMetalness ?? 0,
      ...(style.roadEmissive ? { emissive: new THREE.Color(style.roadEmissive), emissiveMap: roadTex, emissiveIntensity: style.roadEmissiveIntensity ?? 1 } : {}),
      ...(style.roadOpacity ? { transparent: true, opacity: style.roadOpacity } : {}),
    });
    const road = new THREE.Mesh(this.strip((k) => -hw(k), hw, 0, 0, W), roadMat);
    road.receiveShadow = true; road.name = 'road';
    group.add(road);

    // curbs (striped)
    const [ca, cbCol] = style.curbColors || ['#ff4b5c', '#ffffff'];
    const curbTex = canvasTexture(64, (ctx, s) => {
      ctx.fillStyle = ca; ctx.fillRect(0, 0, s, s / 2);
      ctx.fillStyle = cbCol; ctx.fillRect(0, s / 2, s, s / 2);
    });
    const curbMat = new THREE.MeshStandardMaterial({ map: curbTex, roughness: 0.6,
      ...(style.curbEmissive ? { emissive: new THREE.Color('#ffffff'), emissiveMap: curbTex, emissiveIntensity: style.curbEmissive } : {}) });
    const curbL = new THREE.Mesh(this.strip((k) => -hw(k) - cb, (k) => -hw(k), 0.04, 0.04, style.curbLength ?? 4), curbMat);
    const curbR = new THREE.Mesh(this.strip(hw, (k) => hw(k) + cb, 0.04, 0.04, style.curbLength ?? 4), curbMat);
    curbL.receiveShadow = curbR.receiveShadow = true;
    group.add(curbL, curbR);

    // shoulders (off-road)
    const shTex = style.paintShoulder ? canvasTexture(256, (ctx, s) => style.paintShoulder(ctx, s)) : null;
    const shMat = new THREE.MeshStandardMaterial({ color: shTex ? 0xffffff : (style.shoulderColor || '#7ec850'), map: shTex,
      roughness: style.shoulderRoughness ?? 0.95,
      ...(style.shoulderEmissive ? { emissive: new THREE.Color(style.shoulderEmissive), emissiveIntensity: 1 } : {}) });
    const shL = new THREE.Mesh(this.strip((k) => -hw(k) - cb - sh, (k) => -hw(k) - cb, 0, 0, 8), shMat);
    const shR = new THREE.Mesh(this.strip((k) => hw(k) + cb, (k) => hw(k) + cb + sh, 0, 0, 8), shMat);
    shL.receiveShadow = shR.receiveShadow = true;
    group.add(shL, shR);

    // walls
    const wall = style.wall || {};
    const wh = wall.height ?? 1.1, wt = wall.thickness ?? 0.5;
    const outer = (k) => hw(k) + cb + sh;
    const wallMat = new THREE.MeshStandardMaterial({
      color: wall.color || '#ffffff', roughness: wall.roughness ?? 0.5, metalness: wall.metalness ?? 0,
      ...(wall.emissive ? { emissive: new THREE.Color(wall.emissive), emissiveIntensity: wall.emissiveIntensity ?? 1 } : {}),
      ...(wall.opacity ? { transparent: true, opacity: wall.opacity, depthWrite: false } : {}),
      side: THREE.DoubleSide,
    });
    if (wall.map) { wallMat.map = canvasTexture(128, wall.map); }
    const parts = [
      this.strip((k) => -outer(k), (k) => -outer(k), 0, wh, 6),               // left inner face
      this.strip(outer, outer, wh, 0, 6),                                        // right inner face
      this.strip((k) => -outer(k) - wt, (k) => -outer(k), wh, wh, 6),          // left top
      this.strip(outer, (k) => outer(k) + wt, wh, wh, 6),                       // right top
      this.strip((k) => -outer(k) - wt, (k) => -outer(k) - wt, wh, -0.2, 6),   // left outer face
      this.strip((k) => outer(k) + wt, (k) => outer(k) + wt, -0.2, wh, 6),     // right outer face
    ];
    if (!wall.none) {
      for (const g of parts) {
        const m = new THREE.Mesh(g, wallMat);
        m.castShadow = !wall.opacity; m.receiveShadow = true;
        group.add(m);
      }
    }
    // glowing line on top of the walls
    if (wall.glow) {
      const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(wall.glow).multiplyScalar(wall.glowIntensity ?? 2.5), toneMapped: false });
      const gl = new THREE.Mesh(this.strip((k) => -outer(k) - wt * 0.7, (k) => -outer(k) - wt * 0.3, wh + 0.02, wh + 0.02, 6), glowMat);
      const gr = new THREE.Mesh(this.strip((k) => outer(k) + wt * 0.3, (k) => outer(k) + wt * 0.7, wh + 0.02, wh + 0.02, 6), glowMat);
      group.add(gl, gr);
    }

    // skirt: the road as a floating ribbon (thickness underneath)
    if (style.skirt) {
      const depth = style.skirt.depth ?? 2.5;
      const skMat = new THREE.MeshStandardMaterial({ color: style.skirt.color || '#cccccc', roughness: 0.8, side: THREE.DoubleSide,
        ...(style.skirt.emissive ? { emissive: new THREE.Color(style.skirt.emissive), emissiveIntensity: style.skirt.emissiveIntensity ?? 0.6 } : {}) });
      const ow = (k) => outer(k) + wt;
      const sk = [
        this.strip((k) => -ow(k), (k) => -ow(k), -0.2, -depth, 6),
        this.strip(ow, ow, -depth, -0.2, 6),
        this.strip(ow, (k) => -ow(k), -depth, -depth, 6),
      ];
      for (const g of sk) { const m = new THREE.Mesh(g, skMat); m.receiveShadow = true; group.add(m); }
      if (style.skirt.trim) {
        const trimMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(style.skirt.trim).multiplyScalar(style.skirt.trimIntensity ?? 2), toneMapped: false });
        group.add(new THREE.Mesh(this.strip((k) => -ow(k) - 0.02, (k) => -ow(k) - 0.02, -0.5, -0.8, 6), trimMat));
        group.add(new THREE.Mesh(this.strip((k) => ow(k) + 0.02, (k) => ow(k) + 0.02, -0.8, -0.5, 6), trimMat));
      }
    }

    // start line: checkered band across the road at sample 0
    const chk = canvasTexture(128, (ctx, s) => {
      const n = 8;
      for (let y = 0; y < 2; y++) for (let x = 0; x < n; x++) {
        ctx.fillStyle = (x + y) % 2 ? '#111111' : '#ffffff';
        ctx.fillRect((x * s) / n, (y * s) / 2, s / n, s / 2);
      }
    }, { repeat: false });
    const line = new THREE.Mesh(new THREE.PlaneGeometry(W + cb * 2, 2.4), new THREE.MeshStandardMaterial({ map: chk, roughness: 0.7 }));
    line.geometry.rotateX(-Math.PI / 2);
    chk.wrapS = THREE.RepeatWrapping; chk.repeat.set(3, 1);
    this.placeOn(line, 0, 0, 0.06);
    line.receiveShadow = true;
    group.add(line);
    return group;
  }
}

function smooth(arr, r) {
  const N = arr.length, out = new Array(N);
  for (let k = 0; k < N; k++) {
    let s = 0;
    for (let o = -r; o <= r; o++) s += arr[mod(k + o, N)];
    out[k] = s / (2 * r + 1);
  }
  return out;
}

function defaultRoadPaint(ctx, s, style) {
  ctx.fillStyle = style.roadColor || '#5b5f6e';
  ctx.fillRect(0, 0, s, s);
  // speckles
  const sp = style.roadSpeckle || ['rgba(255,255,255,0.06)', 'rgba(0,0,0,0.08)'];
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = sp[i % sp.length];
    const r = Math.random() * 2 + 0.5;
    ctx.fillRect(Math.random() * s, Math.random() * s, r, r);
  }
  // edge lines
  ctx.fillStyle = style.roadLine || 'rgba(255,255,255,0.85)';
  ctx.fillRect(s * 0.025, 0, s * 0.018, s);
  ctx.fillRect(s * (1 - 0.043), 0, s * 0.018, s);
  if (style.centerDash !== false) {
    ctx.fillStyle = style.centerDash || 'rgba(255,255,255,0.5)';
    ctx.fillRect(s * 0.494, 0, s * 0.012, s * 0.45);
  }
}
