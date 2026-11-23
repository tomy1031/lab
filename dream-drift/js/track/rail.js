// track/rail.js — railways: a track bed (ballast, sleepers, two rails) along a smooth path, trains that run on
// it to a timetable, and level crossings where it meets the road (barrier arms, flashing lamps, a bell).
// A solid line is a race hazard (register it with ctx.addHazard): a kart caught by a train spins out and is
// thrown clear, CPUs wait at a closed crossing (Race.crossingAhead), and the chase camera rises over a train.
import * as THREE from 'three';
import { clamp, canvasTexture, smoothstep } from '../engine/util.js';
import { inst } from './props.js';

const UP = new THREE.Vector3(0, 1, 0);
const _p = new THREE.Vector3();

// distance along a run of length D with cruise speed v that eases in and out over ta seconds each end
function runProfile(u, D, v, ta) {
  const Tr = D / v + ta, a = v / ta;
  if (u <= 0) return 0;
  if (u >= Tr) return D;
  if (u < ta) return 0.5 * a * u * u;
  if (u < Tr - ta) return 0.5 * v * ta + v * (u - ta);
  return D - 0.5 * a * (Tr - u) * (Tr - u);
}

export class RailLine {
  // points: [[x, y, z], …] (y = ground height there; at a level crossing the rails sit flush on the road)
  // trains: [{ cars: [Object3D with userData.len / width / height], speed, mode: 'loop' | 'shuttle', dwell, at, phase }]
  constructor(track, {
    points, closed = true, solid = true, gauge = 1.05, bedWidth = 3.6, ground = null,
    colors = {}, gates = true, trains = [], name = 'rail',
  }) {
    this.track = track; this.solid = solid; this.closed = closed;
    this.group = new THREE.Group(); this.group.name = name;
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])), closed, 'centripetal');
    curve.arcLengthDivisions = 4000;
    const L = curve.getLength();
    const S = Math.max(8, Math.round(L));
    this.L = L; this.S = S; this.ds = L / S;
    this.P = []; this.T = []; this.onRoad = [];
    const loc = {};
    for (let i = 0; i <= S; i++) {
      const u = closed ? (i % S) / S : i / S;
      const p = curve.getPointAt(u);
      if (ground) p.y = ground(p.x, p.z);
      this.P.push(p);
    }
    // where the line runs over the road: rails flush with the road surface, blended into the ground around it
    const roadY = new Array(S + 1).fill(null);
    for (let i = 0; i <= S; i++) {
      const p = this.P[i];
      const l = track.locate(p, -1, loc);
      if (Math.abs(l.d) < l.wall + 0.8 && Math.abs(p.y - l.y) < 8) { roadY[i] = l.y; this.onRoad[i] = true; } else this.onRoad[i] = false;
    }
    const blend = 14;
    const ys = this.P.map((p) => p.y);
    for (let i = 0; i <= S; i++) {
      if (roadY[i] !== null) { this.P[i].y = roadY[i] + 0.02; continue; }
      let best = null, bd = Infinity;
      for (let o = -blend; o <= blend; o++) {
        const j = this.idx(i + o);
        if (j === null || roadY[j] === null) continue;
        if (Math.abs(o) < bd) { bd = Math.abs(o); best = roadY[j]; }
      }
      if (best !== null) this.P[i].y = best + 0.02 + (ys[i] - best - 0.02) * smoothstep(0, blend, bd);
    }
    for (let i = 0; i <= S; i++) {
      const a = this.P[this.idx(i - 1) ?? i], b = this.P[this.idx(i + 1) ?? i];
      this.T.push(new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize());
    }

    this.buildBed(colors, bedWidth, gauge);
    // level crossings: the middle of each run of samples over the road
    this.crossings = [];
    for (let i = 0; i < S; i++) {
      if (!this.onRoad[i] || (i > 0 && this.onRoad[i - 1]) || (closed && i === 0 && this.onRoad[S - 1])) continue;
      let j = i; while (j + 1 < S && this.onRoad[j + 1]) j++;
      const mid = Math.round((i + j) / 2);
      const l = track.locate(this.P[mid], -1, {});
      this.crossings.push({ s: mid * this.ds, prog: l.prog, pos: this.P[mid].clone(), closed: false, bellT: 0, horned: false, gates: [] });
    }
    if (gates && solid) for (const c of this.crossings) this.buildGates(c, colors);

    // trains
    this.trains = trains.map((t) => {
      const cars = t.cars;
      let len = 0;
      for (const c of cars) { len += c.userData.len + (t.gap ?? 0.8); this.group.add(c); }
      return { ...t, cars, len, speed: t.speed ?? 15, mode: t.mode ?? (closed ? 'loop' : 'shuttle'), dwell: t.dwell ?? 0, at: t.at ?? 0, phase: t.phase ?? 0, ease: t.ease ?? 3.5, gap: t.gap ?? 0.8, v: 0, front: 0, dir: 1, boxes: [] };
    });
    this.t = 0;
    this.place(0);
  }

  idx(i) {
    if (this.closed) return ((i % this.S) + this.S) % this.S;
    return i < 0 || i > this.S ? null : i;
  }

  // point and horizontal direction on the line at distance s (m)
  at(s, out = _p) {
    let f = s / this.ds;
    if (this.closed) f = ((f % this.S) + this.S) % this.S; else f = clamp(f, 0, this.S);
    const i = Math.min(this.S - (this.closed ? 0 : 1), Math.floor(f)), j = this.closed ? (i + 1) % this.S : Math.min(this.S, i + 1), k = f - Math.floor(f);
    return out.copy(this.P[i]).lerp(this.P[j], k);
  }

  // ---- meshes
  ribbon(offA, offB, hA, hB, { from = 0, to = this.S, skip = null } = {}) {
    const pos = [], uv = [], idx = [];
    let n = 0, run = false, d = 0;
    for (let i = from; i <= to; i++) {
      const ii = this.closed ? i % this.S : i;
      if (skip && skip(ii)) { run = false; continue; }
      const P = this.P[ii], T = this.T[ii];
      const nx = -T.z, nz = T.x;
      pos.push(P.x + nx * offA, P.y + hA, P.z + nz * offA, P.x + nx * offB, P.y + hB, P.z + nz * offB);
      d = i * this.ds;
      uv.push(0, d / 4, 1, d / 4);
      if (run) { const a = (n - 1) * 2, b = a + 1, c = a + 2, e = a + 3; idx.push(a, b, c, b, e, c); }
      run = true; n++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  buildBed(colors, bedWidth, gauge) {
    const S = this.S, hw = bedWidth / 2, closedEnd = this.closed ? S : S;
    const nearRoad = (i) => { for (let o = -2; o <= 2; o++) { const j = this.idx(i + o); if (j !== null && this.onRoad[j]) return true; } return false; };
    // ballast (off the road), with sloped sides
    const gravel = canvasTexture(128, (ctx, s) => {
      ctx.fillStyle = colors.ballast || '#8d8478'; ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 900; i++) { ctx.fillStyle = ['rgba(0,0,0,0.18)', 'rgba(255,255,255,0.14)', 'rgba(90,70,50,0.2)'][i % 3]; ctx.fillRect(Math.random() * s, Math.random() * s, 3, 3); }
    });
    const bedMat = new THREE.MeshStandardMaterial({ map: gravel, roughness: 1 });
    for (const g of [this.ribbon(-hw, hw, 0.05, 0.05, { to: closedEnd, skip: nearRoad }), this.ribbon(-hw - 0.9, -hw, -0.35, 0.05, { to: closedEnd, skip: nearRoad }), this.ribbon(hw, hw + 0.9, 0.05, -0.35, { to: closedEnd, skip: nearRoad })]) {
      const m = new THREE.Mesh(g, bedMat); m.receiveShadow = true; this.group.add(m);
    }
    // crossing panels on the road between and beside the rails
    const panelTex = canvasTexture(128, (ctx, s) => {
      ctx.fillStyle = '#4a4440'; ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; for (let y = 0; y < s; y += s / 4) ctx.fillRect(0, y, s, 3);
    });
    const panel = new THREE.Mesh(this.ribbon(-hw + 0.3, hw - 0.3, 0.015, 0.015, { to: closedEnd, skip: (i) => !this.onRoad[i] }), new THREE.MeshStandardMaterial({ map: panelTex, roughness: 0.9 }));
    panel.receiveShadow = true; this.group.add(panel);
    // sleepers
    const sl = [];
    const stepN = Math.max(1, Math.round(0.85 / this.ds));
    for (let i = 0; i < (this.closed ? S : S + 1); i += stepN) {
      if (nearRoad(i)) continue;
      const P = this.P[i], T = this.T[i];
      sl.push({ x: P.x, y: P.y + 0.1, z: P.z, ry: Math.atan2(T.x, T.z), s: [2.5, 0.12, 0.26] });
    }
    this.group.add(inst(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: colors.sleeper || '#6b4a32', roughness: 0.9 }), sl, { receive: true }));
    // rails: a little raised off the road, flush over it
    const railMat = new THREE.MeshStandardMaterial({ color: colors.rail || '#c2c6ce', roughness: 0.35, metalness: 0.7 });
    const railH = (i) => (this.onRoad[i] ? 0.02 : 0.24);
    for (const side of [-1, 1]) {
      const o = (side * gauge) / 2;
      // top and both faces, height following the road / ground
      const top = this.ribbon(o - 0.05, o + 0.05, 0, 0, { to: closedEnd });
      const pos = top.attributes.position;
      for (let v = 0; v < pos.count; v++) { const i = Math.floor(v / 2); pos.setY(v, pos.getY(v) + railH(this.closed ? i % S : i)); }
      top.computeVertexNormals();
      this.group.add(new THREE.Mesh(top, railMat));
      for (const fo of [o - 0.05, o + 0.05]) {
        const face = this.ribbon(fo, fo, 0, 0.1, { to: closedEnd });
        const fp = face.attributes.position;
        for (let v = 0; v < fp.count; v++) { const i = Math.floor(v / 2); fp.setY(v, fp.getY(v) + (v % 2 ? railH(this.closed ? i % S : i) : railH(this.closed ? i % S : i) - 0.16)); }
        face.computeVertexNormals();
        const m = new THREE.Mesh(face, railMat); m.material.side = THREE.DoubleSide; this.group.add(m);
      }
    }
  }

  // a crossing: on each side of the line, a post with a crossbuck, two lamps and a striped barrier arm
  buildGates(c, colors) {
    const tr = this.track, N = tr.N;
    const armTex = canvasTexture(128, (ctx, s) => {
      for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#ffffff' : '#e3262e'; ctx.fillRect((i * s) / 8, 0, s / 8, s); }
    });
    const armMat = new THREE.MeshStandardMaterial({ map: armTex, roughness: 0.5, emissive: '#ffffff', emissiveMap: armTex, emissiveIntensity: 0.15 });
    const postMat = new THREE.MeshStandardMaterial({ color: '#2b2b2b', roughness: 0.6 });
    const signTex = canvasTexture(128, (ctx, s) => {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#e3262e'; ctx.fillRect(0, 0, s, s * 0.14); ctx.fillRect(0, s * 0.86, s, s * 0.14);
    }, { repeat: false });
    const signMat = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.5 });
    // how far from the rails along the road the barriers stand, in samples; on each side of the rails a post on
    // each side of the road, each arm reaching to the middle (raised arms stay a sensible height)
    const off = 7 / tr.step;
    for (const sgn of [-1, 1]) {
      const prog = c.prog + sgn * off;
      const k = Math.round(((prog % N) + N) % N);
      const hw = tr.HW[k];
      const W = hw + tr.curb + 1.2;
      for (const side of [1, -1]) {
        const g = new THREE.Group();
        tr.placeOn(g, prog, side * W, 0);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 3.6, 10), postMat);
        post.position.y = 1.8; post.castShadow = true; g.add(post);
        const lamps = [];
        if (side > 0 || sgn > 0) {
          // crossbuck (everything faces the oncoming karts, which come from local −z)
          for (const r of [0.75, -0.75]) {
            const b = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.32, 0.05), signMat);
            b.position.set(0, 3.25, -0.14); b.rotation.z = r; g.add(b);
          }
          const bar = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 0.12), postMat); bar.position.set(0, 2.55, 0); g.add(bar);
          for (const lx of [-0.5, 0.5]) {
            const m = new THREE.MeshBasicMaterial({ color: '#3a0d0d', toneMapped: false });
            const l = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), m);
            l.position.set(lx, 2.55, -0.18); l.scale.z = 0.5; g.add(l);
            const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.22, 12, 1, true, 0, Math.PI), postMat);
            hood.rotation.x = Math.PI / 2; hood.position.set(lx, 2.6, -0.25); g.add(hood);
            lamps.push(m);
          }
        }
        // the arm pivots at the post and reaches to the middle of the road (local +x points to the road's left)
        const len = W - 0.3;
        const pivot = new THREE.Group(); pivot.position.set(0, 1.15, 0.25); g.add(pivot);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(len, 0.16, 0.1), armMat);
        armTex.repeat.set(len / 2.4, 1); armTex.wrapS = THREE.RepeatWrapping;
        arm.position.x = (len / 2) * side; arm.castShadow = true; // toward the middle of the road
        pivot.add(arm);
        const counter = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.3), postMat); counter.position.x = -0.45 * side; pivot.add(counter);
        this.group.add(g);
        c.gates.push({ pivot, lamps, side, prog, a: 1.4, bump: 0, len });
      }
    }
  }

  // ---- motion
  // where a train is at time t: its high-s end ("front"), the direction it is heading (+1 / −1)
  frontAt(tr, t) {
    const L = this.L;
    if (tr.mode === 'loop') {
      const run = L / tr.speed + tr.ease, cyc = run + tr.dwell;
      const tau = ((t + tr.phase * cyc) % cyc + cyc) % cyc;
      return [tr.at + runProfile(tau - tr.dwell, L, tr.speed, tr.ease), 1];
    }
    const a = 4 + tr.len, b = L - 4, D = b - a;
    const run = D / tr.speed + tr.ease, cyc = 2 * (run + tr.dwell);
    const tau = ((t + tr.phase * cyc) % cyc + cyc) % cyc;
    const half = run + tr.dwell;
    return tau < half ? [a + runProfile(tau - tr.dwell, D, tr.speed, tr.ease), 1] : [b - runProfile(tau - half - tr.dwell, D, tr.speed, tr.ease), -1];
  }

  place(t) {
    for (const tr of this.trains) {
      const [front, dir] = this.frontAt(tr, t);
      let v = (this.frontAt(tr, t + 0.05)[0] - front) / 0.05; // along +s
      if (tr.mode === 'loop' && v < -1) v = tr.speed; // wrapped round the loop
      tr.front = front; tr.dir = dir; tr.v = v;
      // cars, from the high-s end backwards
      let s = front;
      tr.boxes.length = 0;
      const cars = tr.mode === 'shuttle' && dir < 0 ? [...tr.cars].reverse() : tr.cars;
      for (const car of cars) {
        const len = car.userData.len;
        const sc = s - len / 2;
        const f = this.at(sc + len * 0.35, new THREE.Vector3()), r = this.at(sc - len * 0.35, new THREE.Vector3());
        const cx = (f.x + r.x) / 2, cy = (f.y + r.y) / 2, cz = (f.z + r.z) / 2;
        const hx = f.x - r.x, hz = f.z - r.z, hl = Math.hypot(hx, hz) || 1;
        car.position.set(cx, cy + 0.24, cz);
        let yaw = Math.atan2(hx, hz);
        if (tr.mode === 'shuttle' && dir < 0) yaw += Math.PI;
        car.rotation.set(-Math.atan2(f.y - r.y, hl) * (tr.mode === 'shuttle' && dir < 0 ? -1 : 1), yaw, 0, 'YXZ');
        tr.boxes.push({ x: cx, y: cy, z: cz, tx: hx / hl, tz: hz / hl, hl: len / 2, hw: (car.userData.width || 2.8) / 2, h: car.userData.height || 3.6, vx: (hx / hl) * v, vz: (hz / hl) * v });
        s -= len + tr.gap;
      }
    }
  }

  // is the stretch of line around s (m) about to be, or being, used by a train? { ahead: m until the nose gets there }
  occupied(s, leadS = 4.5) {
    const L = this.L;
    for (const tr of this.trains) {
      const lead = tr.speed * leadS;
      if (tr.mode === 'loop') {
        const ahead = ((s - tr.front) % L + L) % L; // how far the crossing is ahead of the train's nose
        if (ahead < lead) return { ahead };
        const behind = ((tr.front - s) % L + L) % L; // how far the nose is past the crossing
        if (behind < tr.len + 6) return { ahead: 0 };
      } else {
        const hi = tr.front, lo = tr.front - tr.len;
        if (s >= lo - 6 && s <= hi + 6) return { ahead: 0 };
        if (tr.dir > 0 && s > hi && s - hi < lead) return { ahead: s - hi };
        if (tr.dir < 0 && s < lo && lo - s < lead) return { ahead: lo - s };
      }
    }
    return null;
  }

  step(dt, race) {
    this.t += dt;
    this.place(race.t);
    if (!this.solid) return;
    const me = race.humans[0];
    for (const c of this.crossings) {
      const occ = this.occupied(c.s);
      c.closed = !!occ;
      // horn as a train comes up to a crossing near you; the bell while it's closed
      if (me) {
        const dm = me.pos.distanceTo(c.pos);
        if (occ && occ.ahead > 0 && !c.horned && dm < 170) { c.horned = true; race.emit('trainhorn', { vol: 1 - dm / 170 }); }
        if (!occ) c.horned = false;
        if (c.closed && dm < 95) { c.bellT -= dt; if (c.bellT <= 0) { c.bellT = 0.42; race.emit('trainbell', { vol: 1 - dm / 95 }); } }
      }
      // barrier arms swing down (about 1.5 s) and up again; a kart driving through one knocks it up
      for (const g of c.gates) {
        const target = c.closed ? 0 : 1.4;
        g.a += clamp(target - g.a, -dt * 1.1, dt * 1.1);
        for (const k of race.karts) {
          let ds = k.prog - g.prog; const N = this.track.N; if (ds > N / 2) ds -= N; else if (ds < -N / 2) ds += N;
          if (Math.abs(ds) < 0.9 && g.a < 0.6) g.bump = Math.max(g.bump, clamp(k.speed / 20, 0.3, 1));
        }
        g.bump = Math.max(0, g.bump - dt * 1.6);
        g.pivot.rotation.z = (g.a + g.bump * 0.9) * g.side; // +x arm (post on the right) swings up with +z rotation
        const on = c.closed ? Math.floor(this.t * 3.2) % 2 : -1;
        g.lamps.forEach((m, i) => m.color.set(on === i ? '#ff2a1a' : '#3a0d0d').multiplyScalar(on === i ? 2.2 : 1));
      }
    }
  }

  // a kart inside a train car: thrown clear sideways (along the road), spins out
  collide(k, race) {
    if (!this.solid) return;
    for (const tr of this.trains) for (const b of tr.boxes) {
      if (Math.abs(k.pos.y - b.y) > 3) continue;
      const dx = k.pos.x - b.x, dz = k.pos.z - b.z;
      const u = dx * b.tx + dz * b.tz, w = dx * -b.tz + dz * b.tx;
      const R = 1.0;
      if (Math.abs(u) > b.hl + R || Math.abs(w) > b.hw + R) continue;
      const side = Math.sign(w) || 1, nx = -b.tz * side, nz = b.tx * side;
      const push = b.hw + R + 0.05 - Math.abs(w);
      k.pos.x += nx * push; k.pos.z += nz * push;
      const vn = k.vel.x * nx + k.vel.z * nz;
      if (vn < 0) { k.vel.x -= nx * vn; k.vel.z -= nz * vn; }
      k.vel.x += nx * 7 + b.vx * 0.4; k.vel.z += nz * 7 + b.vz * 0.4;
      k.bumpT = Math.max(k.bumpT || 0, 0.45);
      if (k.hit('spin')) race.emit('trap', { kart: k, hurt: true, kind: 'train' });
    }
  }

  // keep the chase camera out of a passing train: lift it over the roof
  clearCamera(v) {
    let lifted = false;
    for (const tr of this.trains) for (const b of tr.boxes) {
      const dx = v.x - b.x, dz = v.z - b.z;
      const u = dx * b.tx + dz * b.tz, w = dx * -b.tz + dz * b.tx;
      if (Math.abs(u) > b.hl + 1.5 || Math.abs(w) > b.hw + 1.5) continue;
      const top = b.y + b.h + 1.0;
      if (v.y < top && v.y > b.y - 2) { v.y = top; lifted = true; }
    }
    return lifted;
  }
}

// ---- rolling stock (local +z = forward, origin on the rail top at the middle of the car)
function wheels(group, len, mat, n = 2) {
  const wg = new THREE.CylinderGeometry(0.45, 0.45, 0.2, 14); wg.rotateZ(Math.PI / 2);
  for (const z of n === 2 ? [-len * 0.32, len * 0.32] : [-len * 0.36, -len * 0.24, len * 0.24, len * 0.36]) {
    for (const x of [-0.62, 0.62]) { const w = new THREE.Mesh(wg, mat); w.position.set(x, 0.45, z); group.add(w); }
  }
}

export function makeLoco({ body = '#1f5fae', stripe = '#ffd23b', roof = '#d9dde6', len = 13 } = {}) {
  const g = new THREE.Group();
  const bm = new THREE.MeshStandardMaterial({ color: body, roughness: 0.45, metalness: 0.2 });
  const sm = new THREE.MeshStandardMaterial({ color: stripe, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: '#202228', roughness: 0.7 });
  const glass = new THREE.MeshStandardMaterial({ color: '#9fd4ff', roughness: 0.1, metalness: 0.4, emissive: '#3a6a90', emissiveIntensity: 0.4 });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.5, len), dark); frame.position.y = 1.0; g.add(frame);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, len * 0.62), bm); hood.position.set(0, 2.35, -len * 0.14); hood.castShadow = true; g.add(hood);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.9, len * 0.26), bm); cab.position.set(0, 2.7, len * 0.33); cab.castShadow = true; g.add(cab);
  const cabRoof = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.25, len * 0.3), new THREE.MeshStandardMaterial({ color: roof, roughness: 0.5 })); cabRoof.position.set(0, 4.25, len * 0.33); g.add(cabRoof);
  const band = new THREE.Mesh(new THREE.BoxGeometry(2.95, 0.35, len * 0.98), sm); band.position.y = 1.45; g.add(band);
  const win = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.8, 0.1), glass); win.position.set(0, 3.35, len * 0.33 + len * 0.13 + 0.02); g.add(win);
  for (const x of [-1.41, 1.41]) { const sw = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, len * 0.18), glass); sw.position.set(x, 3.35, len * 0.33); g.add(sw); }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff4c8').multiplyScalar(2.4), toneMapped: false }));
  lamp.position.set(0, 2.1, len / 2 + 0.05); g.add(lamp);
  const lamp2 = lamp.clone(); lamp2.position.set(0, 3.6, -len * 0.45 - 0.1); g.add(lamp2);
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.6, 10), dark); stack.position.set(0, 3.7, -len * 0.05); g.add(stack);
  // cow catcher
  const pilot = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.6, 0.6), sm); pilot.position.set(0, 0.6, len / 2 + 0.1); pilot.rotation.x = -0.4; g.add(pilot);
  wheels(g, len, dark, 4);
  g.userData = { len: len + 0.4, width: 3.0, height: 4.3 };
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function makeCoach({ body = '#3a7fc8', band = '#f4f0e0', roof = '#7d8696', len = 15 } = {}) {
  const g = new THREE.Group();
  const tex = canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = body; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = band; ctx.fillRect(0, s * 0.3, s, s * 0.34);
    for (let i = 0; i < 6; i++) { ctx.fillStyle = '#26394f'; ctx.fillRect(s * (0.04 + i * 0.16), s * 0.35, s * 0.11, s * 0.24); ctx.fillStyle = 'rgba(170,220,255,0.55)'; ctx.fillRect(s * (0.05 + i * 0.16), s * 0.36, s * 0.04, s * 0.1); }
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, s * 0.92, s, s * 0.08);
  }, { repeat: false });
  const side = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 });
  const plain = new THREE.MeshStandardMaterial({ color: body, roughness: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: '#202228', roughness: 0.7 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.7, len), [side, side, plain, plain, plain, plain]);
  box.position.y = 2.45; box.castShadow = true; g.add(box);
  const rf = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, len, 16, 1, false, -Math.PI / 2, Math.PI), new THREE.MeshStandardMaterial({ color: roof, roughness: 0.6 }));
  rf.rotation.x = Math.PI / 2; rf.rotation.y = Math.PI / 2; rf.position.y = 3.8; rf.scale.set(1, 1, 0.35); g.add(rf);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.4, len * 0.96), dark); frame.position.y = 0.95; g.add(frame);
  wheels(g, len, dark, 4);
  g.userData = { len, width: 2.9, height: 4.3 };
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// the Battambang bamboo train ("norry"): a bamboo deck on two axles with a little engine, passengers on mats
export function makeNorry({ riders = 3, rng = Math.random } = {}) {
  const g = new THREE.Group();
  const bamboo = canvasTexture(128, (ctx, s) => {
    ctx.fillStyle = '#c9a85c'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 16; i++) { const x = (i * s) / 16; ctx.fillStyle = i % 2 ? '#b8954a' : '#d8bb70'; ctx.fillRect(x, 0, s / 16 - 1, s); ctx.fillStyle = 'rgba(90,60,20,0.5)'; ctx.fillRect(x, (i * 37) % s, s / 16, 3); }
  });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.14, 3.0), new THREE.MeshStandardMaterial({ map: bamboo, roughness: 0.85 }));
  deck.position.y = 0.85; g.add(deck);
  const dark = new THREE.MeshStandardMaterial({ color: '#2a2a2e', roughness: 0.6, metalness: 0.4 });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.16, 2.6), new THREE.MeshStandardMaterial({ color: '#5a3d22', roughness: 0.9 })); beam.position.y = 0.72; g.add(beam);
  const wg = new THREE.CylinderGeometry(0.32, 0.32, 0.18, 14); wg.rotateZ(Math.PI / 2);
  for (const z of [-0.95, 0.95]) {
    const ax = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.3, 6), dark); ax.rotation.z = Math.PI / 2; ax.position.set(0, 0.32, z); g.add(ax);
    for (const x of [-0.53, 0.53]) { const w = new THREE.Mesh(wg, dark); w.position.set(x, 0.32, z); g.add(w); }
  }
  // the engine at the back with its belt
  const eng = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.6), new THREE.MeshStandardMaterial({ color: '#b03a2a', roughness: 0.5 })); eng.position.set(0.5, 1.15, -1.15); g.add(eng);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.35, 10), dark); tank.rotation.z = Math.PI / 2; tank.position.set(0.5, 1.45, -1.15); g.add(tank);
  // woven mats and passengers
  const mats = ['#d8484a', '#3b8fd6', '#e6b23a', '#4caf6a'];
  const mat = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.05, 1.7), new THREE.MeshStandardMaterial({ color: mats[Math.floor(rng() * 4)], roughness: 0.9 })); mat.position.set(0, 0.95, 0.35); g.add(mat);
  const skin = new THREE.MeshStandardMaterial({ color: '#c58b5e', roughness: 0.7 });
  const shirts = ['#ff6b6b', '#ffd166', '#06d6a0', '#118ab2', '#ef476f', '#ffffff'];
  for (let i = 0; i < riders; i++) {
    const p = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.35, 4, 8), new THREE.MeshStandardMaterial({ color: shirts[Math.floor(rng() * shirts.length)], roughness: 0.8 }));
    body.position.y = 0.38; p.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), skin); head.position.y = 0.82; p.add(head);
    if (rng() < 0.6) { const hat = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.16, 12), new THREE.MeshStandardMaterial({ color: '#e8d49a', roughness: 0.9 })); hat.position.y = 0.98; p.add(hat); }
    p.position.set(-0.6 + (i % 3) * 0.6, 0.95, 0.9 - Math.floor(i / 3) * 0.7 + (rng() - 0.5) * 0.2);
    g.add(p);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData = { len: 3.1, width: 2.3, height: 2.2 };
  return g;
}
