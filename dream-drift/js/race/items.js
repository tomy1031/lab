// race/items.js — prism boxes on the road, the item roulette and the seven original items:
//   ロケット / トリプルロケット (speed boost), ぷるぷるプリン (trap dropped behind), バブルショット (bouncing shot),
//   ホーミングほたる (chases the kart ahead), バリア (blocks one hit), スーパーコメット (invincible dash)
import * as THREE from 'three';
import { mod, lerp, part, merge, toyMaterial, hsl } from '../engine/util.js';

export const ITEMS = {
  boost: { name: 'ロケット', hint: '一気に加速！' },
  triple: { name: 'トリプルロケット', hint: '3回 加速できる' },
  pudding: { name: 'ぷるぷるプリン', hint: 'うしろに 置く わな' },
  bubble: { name: 'バブルショット', hint: 'まっすぐ 飛んで 壁で はねる' },
  homing: { name: 'ホーミングほたる', hint: '前の カートを 追いかける' },
  shield: { name: 'バリア', hint: '攻撃を 1回 ふせぐ' },
  comet: { name: 'スーパーコメット', hint: '無敵で 突っ走る' },
};
export const ITEM_IDS = Object.keys(ITEMS);

// inline SVG icons for the HUD (no emoji: they render the same everywhere)
export const ITEM_ICONS = {
  boost: `<svg viewBox="0 0 64 64"><path d="M32 4c10 8 14 20 12 34H20C18 24 22 12 32 4z" fill="#ff5a5f"/><circle cx="32" cy="22" r="6" fill="#bfe9ff" stroke="#fff" stroke-width="2"/><path d="M20 30l-8 12 9-2zM44 30l8 12-9-2z" fill="#ffd23f"/><path d="M24 40h16l-2 6H26z" fill="#888"/><path d="M26 46c2 8 4 12 6 14 2-2 4-6 6-14z" fill="#ffb12e"/><path d="M29 46c1 5 2 8 3 9 1-1 2-4 3-9z" fill="#fff3a0"/></svg>`,
  triple: `<svg viewBox="0 0 64 64"><g transform="translate(-14 6) scale(.62)"><path d="M32 4c10 8 14 20 12 34H20C18 24 22 12 32 4z" fill="#ff5a5f"/><circle cx="32" cy="22" r="6" fill="#bfe9ff"/><path d="M26 40c2 8 4 12 6 14 2-2 4-6 6-14z" fill="#ffb12e"/></g><g transform="translate(12 -2) scale(.62)"><path d="M32 4c10 8 14 20 12 34H20C18 24 22 12 32 4z" fill="#ff5a5f"/><circle cx="32" cy="22" r="6" fill="#bfe9ff"/><path d="M26 40c2 8 4 12 6 14 2-2 4-6 6-14z" fill="#ffb12e"/></g><g transform="translate(38 6) scale(.62)"><path d="M32 4c10 8 14 20 12 34H20C18 24 22 12 32 4z" fill="#ff5a5f"/><circle cx="32" cy="22" r="6" fill="#bfe9ff"/><path d="M26 40c2 8 4 12 6 14 2-2 4-6 6-14z" fill="#ffb12e"/></g></svg>`,
  pudding: `<svg viewBox="0 0 64 64"><ellipse cx="32" cy="54" rx="24" ry="5" fill="#e9e4ff"/><path d="M14 52l6-30h24l6 30z" fill="#ffd36b"/><path d="M20 22c4-6 20-6 24 0l1 6c-6 4-20 4-26 0z" fill="#8a4a1c"/><circle cx="32" cy="14" r="6" fill="#fff"/><circle cx="34" cy="8" r="4" fill="#ff3b5c"/><circle cx="26" cy="38" r="2.6" fill="#3a2a1a"/><circle cx="38" cy="38" r="2.6" fill="#3a2a1a"/><path d="M28 44q4 3 8 0" stroke="#3a2a1a" stroke-width="2" fill="none"/></svg>`,
  bubble: `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="24" fill="#5fd7ff" opacity=".85"/><circle cx="32" cy="32" r="24" fill="none" stroke="#e8fbff" stroke-width="3"/><ellipse cx="24" cy="22" rx="8" ry="5" fill="#fff" opacity=".9" transform="rotate(-30 24 22)"/><circle cx="42" cy="42" r="3" fill="#fff" opacity=".7"/></svg>`,
  homing: `<svg viewBox="0 0 64 64"><circle cx="32" cy="36" r="20" fill="#d9ff5a" opacity=".35"/><ellipse cx="22" cy="24" rx="10" ry="6" fill="#ffffff" opacity=".85" transform="rotate(-30 22 24)"/><ellipse cx="42" cy="24" rx="10" ry="6" fill="#ffffff" opacity=".85" transform="rotate(30 42 24)"/><ellipse cx="32" cy="36" rx="9" ry="12" fill="#f4ff6e"/><circle cx="28" cy="32" r="2.4" fill="#2a3a10"/><circle cx="36" cy="32" r="2.4" fill="#2a3a10"/><path d="M28 18q-4-8-8-8M36 18q4-8 8-8" stroke="#3a4a20" stroke-width="2" fill="none"/></svg>`,
  shield: `<svg viewBox="0 0 64 64"><path d="M32 4l24 9v16c0 15-10 26-24 31C18 55 8 44 8 29V13z" fill="#7a6bff"/><path d="M32 10l18 7v12c0 11-7 20-18 24-11-4-18-13-18-24V17z" fill="#6fe7ff"/><path d="M32 18l3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1z" fill="#fff"/></svg>`,
  comet: `<svg viewBox="0 0 64 64"><defs><linearGradient id="cg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#ff4fd8" stop-opacity="0"/><stop offset="1" stop-color="#6ff0ff"/></linearGradient></defs><path d="M4 60L34 22l8 8z" fill="url(#cg)"/><path d="M42 6l5 11 12 2-9 8 2 12-10-6-11 6 3-12-9-8 12-2z" fill="#ffe14d" stroke="#fff" stroke-width="2"/></svg>`,
};
// the same icons as standalone images (VR paints them on a canvas). As a file an SVG needs its namespace,
// without it the image never loads.
export const itemIconURL = (id) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(ITEM_ICONS[id].replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '));


// weights by race position (front → back)
const TABLE = [
  { pudding: 35, bubble: 30, boost: 20, shield: 15, homing: 0, triple: 0, comet: 0 },
  { pudding: 20, bubble: 25, boost: 22, shield: 13, homing: 15, triple: 5, comet: 0 },
  { pudding: 6, bubble: 18, boost: 24, shield: 10, homing: 22, triple: 14, comet: 6 },
  { pudding: 0, bubble: 6, boost: 22, shield: 6, homing: 22, triple: 26, comet: 18 },
];
export function rollItem(place, n, rnd = Math.random) {
  const r = n > 1 ? (place - 1) / (n - 1) : 0.4;
  const x = r * (TABLE.length - 1), i = Math.min(TABLE.length - 2, Math.floor(x)), f = x - i;
  let total = 0;
  const w = ITEM_IDS.map((id) => { const v = lerp(TABLE[i][id], TABLE[i + 1][id], f); total += v; return v; });
  let pick = rnd() * total;
  for (let k = 0; k < w.length; k++) { pick -= w[k]; if (pick <= 0) return ITEM_IDS[k]; }
  return 'boost';
}

// ---- models
function starShape(r1, r2, n = 5) {
  const s = new THREE.Shape();
  for (let i = 0; i <= n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? r2 : r1;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r); else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return s;
}
function boxGeometry() {
  const g0 = new THREE.IcosahedronGeometry(0.95, 0), g = g0.index ? g0.toNonIndexed() : g0;
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let f = 0; f < n / 3; f++) {
    const c = hsl(f / (n / 3) * 1.7, 0.85, 0.68);
    for (let v = 0; v < 3; v++) col.set([c.r, c.g, c.b], (f * 3 + v) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function puddingGeometry() {
  const S = new THREE.SphereGeometry(1, 12, 10), C = new THREE.CylinderGeometry(1, 1, 1, 18);
  return merge([
    part(new THREE.CylinderGeometry(0.62, 0.78, 0.84, 18), '#ffd36b', [0, 0.42, 0]),
    part(C, '#8a4a1c', [0, 0.88, 0], [0, 0, 0], [0.6, 0.14, 0.6]),
    part(S, '#ffffff', [0, 1.02, 0], [0, 0, 0], [0.28, 0.2, 0.28]),
    part(S, '#ff3b5c', [0.05, 1.22, 0], [0, 0, 0], 0.13),
    part(S, '#3a2a1a', [0.2, 0.55, 0.6], [0, 0, 0], 0.07),
    part(S, '#3a2a1a', [-0.2, 0.55, 0.6], [0, 0, 0], 0.07),
    part(S, '#ff9ab0', [0.36, 0.45, 0.52], [0, 0, 0], [0.09, 0.05, 0.04]),
    part(S, '#ff9ab0', [-0.36, 0.45, 0.52], [0, 0, 0], [0.09, 0.05, 0.04]),
  ]);
}

export class ItemSystem {
  constructor(race) {
    this.race = race;
    this.track = race.track;
    this.group = new THREE.Group(); this.group.name = 'items';
    this.rows = []; this.traps = []; this.shots = [];
    this.t = 0;
    const tr = this.track, N = tr.N;
    // prism boxes
    const rowsDef = race.course.itemRows || [0.25, 0.6];
    const boxes = [];
    for (const f of rowsDef) {
      const prog = mod(f * N, N);
      const hw = tr.HW[Math.floor(prog)];
      const row = { prog, boxes: [] };
      for (const s of [-0.6, -0.2, 0.2, 0.6]) {
        const b = { d: s * hw, prog, active: true, respawn: 0, pos: tr.pointAt(prog, s * hw, new THREE.Vector3()), scale: 1 };
        b.pos.y += 1.25;
        row.boxes.push(b); boxes.push(b);
      }
      this.rows.push(row);
    }
    this.rows.sort((a, b) => a.prog - b.prog);
    this.boxes = boxes;
    const shellMat = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.78, roughness: 0.15, metalness: 0.2, flatShading: true, emissive: '#ffffff', emissiveIntensity: 0.18 });
    this.shell = new THREE.InstancedMesh(boxGeometry(), shellMat, boxes.length);
    const star = new THREE.ExtrudeGeometry(starShape(0.42, 0.19), { depth: 0.14, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 1 });
    star.center();
    this.star = new THREE.InstancedMesh(star, new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe66b').multiplyScalar(2.2), toneMapped: false }), boxes.length);
    this.shell.frustumCulled = this.star.frustumCulled = false;
    this.group.add(this.shell, this.star);

    this.puddingGeo = puddingGeometry();
    this.bubbleGeo = new THREE.SphereGeometry(0.75, 20, 14);
    this.bubbleMat = new THREE.MeshStandardMaterial({ color: '#7fe3ff', transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.1, emissive: '#2ab8ff', emissiveIntensity: 0.6 });
    this.flyGeo = merge([
      part(new THREE.SphereGeometry(1, 12, 10), new THREE.Color('#f4ff6e').multiplyScalar(3), [0, 0, 0], [0, 0, 0], [0.3, 0.3, 0.42]),
      part(new THREE.SphereGeometry(1, 10, 8), new THREE.Color('#ffffff').multiplyScalar(1.5), [0.3, 0.2, 0], [0, 0, 0.5], [0.32, 0.06, 0.18]),
      part(new THREE.SphereGeometry(1, 10, 8), new THREE.Color('#ffffff').multiplyScalar(1.5), [-0.3, 0.2, 0], [0, 0, -0.5], [0.32, 0.06, 0.18]),
    ]);
    this.flyMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._s = new THREE.Vector3(); this._v = new THREE.Vector3();
    this.loc = {};
    this.updateBoxes(0);
  }

  nextRow(prog, within) {
    const N = this.track.N;
    for (const r of this.rows) {
      let ds = r.prog - prog; if (ds < 0) ds += N;
      if (ds < within) return r;
    }
    return null;
  }

  updateBoxes(dt) {
    this.t += dt;
    const m = this._m, q = this._q, s = this._s;
    this.boxes.forEach((b, i) => {
      if (!b.active) { b.respawn -= dt; if (b.respawn <= 0) { b.active = true; b.scale = 0.01; } }
      b.scale = b.active ? Math.min(1, b.scale + dt * 3) : Math.max(0, b.scale - dt * 8);
      const sc = Math.max(0.0001, b.scale);
      q.setFromEuler(this._e.set(0.4, this.t * 1.6 + i, 0.2));
      this._v.copy(b.pos); this._v.y += Math.sin(this.t * 2.2 + i * 0.7) * 0.18;
      m.compose(this._v, q, s.set(sc, sc, sc));
      this.shell.setMatrixAt(i, m);
      q.setFromEuler(this._e.set(0, -this.t * 2.5, 0));
      m.compose(this._v, q, s.set(sc * 0.95, sc * 0.95, sc * 0.95));
      this.star.setMatrixAt(i, m);
    });
    this.shell.instanceMatrix.needsUpdate = true;
    this.star.instanceMatrix.needsUpdate = true;
  }

  // physics step: pickups, roulette, shots, traps
  step(dt) {
    const race = this.race, tr = this.track, N = tr.N;
    for (const k of race.karts) {
      // roulette
      if (k.roulette > 0) {
        k.roulette -= dt;
        if (k.roulette <= 0) {
          k.roulette = 0;
          k.item = rollItem(k.place || race.karts.length, race.karts.length, race.rnd);
          k.itemCount = k.item === 'triple' ? 3 : 1;
          if (k.isHuman) race.emit('itemready', { kart: k });
        }
      }
      // boxes
      for (const row of this.rows) {
        let ds = Math.abs(row.prog - k.prog); if (ds > N / 2) ds = N - ds;
        if (ds > 2) continue;
        for (const b of row.boxes) {
          if (!b.active) continue;
          const dx = b.pos.x - k.pos.x, dz = b.pos.z - k.pos.z, dy = b.pos.y - k.pos.y;
          if (dx * dx + dz * dz < 2.0 * 2.0 && Math.abs(dy) < 3) {
            b.active = false; b.respawn = 2.5;
            race.burst(b.pos, 'box');
            if (!k.item && k.roulette <= 0) { k.roulette = k.isHuman ? 1.6 : 0.9; race.emit('itemget', { kart: k }); }
          }
        }
      }
    }
    // traps vs karts
    for (let i = this.traps.length - 1; i >= 0; i--) {
      const t = this.traps[i];
      t.age += dt;
      for (const k of race.karts) {
        const dx = t.pos.x - k.pos.x, dz = t.pos.z - k.pos.z;
        if (dx * dx + dz * dz < 1.6 * 1.6 && Math.abs(t.pos.y - k.pos.y) < 1.6 && !(t.owner === k && t.age < 0.6)) {
          const hurt = k.hit('spin');
          race.emit('trap', { kart: k, hurt, by: t.owner });
          this.removeTrap(i);
          break;
        }
      }
    }
    // shots
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.age += dt;
      if (s.age > s.life) { this.removeShot(i); continue; }
      if (s.kind === 'bubble') this.stepBubble(s, dt); else this.stepHoming(s, dt);
      let gone = false;
      for (const k of race.karts) {
        if (k === s.owner && s.age < 0.5) continue;
        if (s.kind === 'homing' && s.target && k !== s.target && s.age < 0.3) continue;
        const dx = s.pos.x - k.pos.x, dz = s.pos.z - k.pos.z, dy = s.pos.y - (k.pos.y + 0.7);
        if (dx * dx + dz * dz + dy * dy < 1.9 * 1.9) {
          const hurt = k.hit(s.kind === 'homing' ? 'big' : 'spin');
          race.emit('shothit', { kart: k, hurt, by: s.owner, kind: s.kind });
          race.burst(s.pos, s.kind);
          this.removeShot(i); gone = true; break;
        }
      }
      if (gone) continue;
      for (let j = this.traps.length - 1; j >= 0; j--) {
        const t = this.traps[j];
        const dx = s.pos.x - t.pos.x, dz = s.pos.z - t.pos.z;
        if (dx * dx + dz * dz < 1.8 * 1.8 && Math.abs(s.pos.y - t.pos.y) < 2) {
          race.burst(t.pos, 'pudding'); this.removeTrap(j); this.removeShot(i); break;
        }
      }
    }
  }

  stepBubble(s, dt) {
    const tr = this.track;
    s.pos.x += s.vel.x * dt; s.pos.z += s.vel.z * dt;
    const L = tr.locate(s.pos, s.idx, this.loc);
    s.idx = L.i; s.prog = L.prog;
    s.pos.y = L.y + 0.75;
    const lim = L.wall - 0.7;
    if (Math.abs(L.d) > lim) {
      const sg = Math.sign(L.d), over = Math.abs(L.d) - lim;
      s.pos.x -= L.rx * sg * over; s.pos.z -= L.rz * sg * over;
      const vn = (s.vel.x * L.rx + s.vel.z * L.rz) * sg;
      if (vn > 0) { s.vel.x -= 2 * vn * L.rx * sg; s.vel.z -= 2 * vn * L.rz * sg; s.bounces++; }
      if (s.bounces > 7) s.age = s.life;
    }
  }

  stepHoming(s, dt) {
    const tr = this.track, N = tr.N;
    const tg = s.target;
    if (tg && !tg.finished) {
      let ds = tg.raceDist - s.raceDist;
      if (ds < 7) {
        // direct pursuit
        const dx = tg.pos.x - s.pos.x, dy = tg.pos.y + 0.7 - s.pos.y, dz = tg.pos.z - s.pos.z;
        const l = Math.hypot(dx, dy, dz) || 1;
        const sp = s.speed;
        s.pos.x += (dx / l) * sp * dt; s.pos.y += (dy / l) * sp * dt; s.pos.z += (dz / l) * sp * dt;
        const L = tr.locate(s.pos, s.idx, this.loc); s.idx = L.i;
        s.raceDist = tg.raceDist - l / tr.step;
        s.prog = L.prog; s.d = L.d;
        return;
      }
      s.d = s.d + (tg.loc.d - s.d) * Math.min(1, dt * 2);
    } else {
      s.d *= 1 - Math.min(1, dt);
    }
    const adv = (s.speed * dt) / tr.step;
    s.prog = mod(s.prog + adv, N); s.raceDist += adv;
    tr.pointAt(s.prog, s.d, s.pos);
    s.pos.y += 1.0 + Math.sin(s.age * 9) * 0.15;
    s.idx = Math.floor(s.prog);
  }

  // use the held item
  use(k) {
    const race = this.race, tr = this.track;
    if (!k.item || k.roulette > 0 || k.spin > 0) return false;
    const it = k.item;
    const fx = Math.sin(k.heading), fz = Math.cos(k.heading);
    if (it === 'boost' || it === 'triple') { k.giveBoost(1.3); race.emit('use', { kart: k, item: it }); }
    else if (it === 'pudding') {
      const p = mod(k.prog - 2.2, tr.N);
      const mesh = new THREE.Mesh(this.puddingGeo, toyMaterial({ roughness: 0.35 }));
      mesh.castShadow = true;
      tr.placeOn(mesh, p, k.loc.d, 0);
      mesh.rotateY(Math.PI);
      this.group.add(mesh);
      this.traps.push({ mesh, pos: mesh.position, prog: p, d: k.loc.d, owner: k, age: 0 });
      if (this.traps.length > 16) this.removeTrap(0);
      race.emit('use', { kart: k, item: it });
    } else if (it === 'bubble') {
      const mesh = new THREE.Mesh(this.bubbleGeo, this.bubbleMat);
      this.group.add(mesh);
      const sp = Math.max(k.speed + 20, 44);
      const pos = mesh.position.set(k.pos.x + fx * 2.6, k.pos.y + 0.75, k.pos.z + fz * 2.6);
      this.shots.push({ kind: 'bubble', mesh, pos, vel: new THREE.Vector3(fx * sp, 0, fz * sp), owner: k, age: 0, life: 5.5, idx: k.idx, bounces: 0, prog: k.prog });
      race.emit('use', { kart: k, item: it });
    } else if (it === 'homing') {
      const st = race.standings();
      const target = k.place > 1 ? st[k.place - 2] : null;
      const mesh = new THREE.Mesh(this.flyGeo, this.flyMat);
      this.group.add(mesh);
      const shot = { kind: 'homing', mesh, pos: mesh.position, owner: k, target, age: 0, life: 10, idx: k.idx, prog: mod(k.prog + 1.5, tr.N), d: k.loc.d, raceDist: k.raceDist + 1.5, speed: Math.max(42, k.speed + 16) };
      tr.pointAt(shot.prog, shot.d, shot.pos); shot.pos.y += 1;
      this.shots.push(shot);
      race.emit('use', { kart: k, item: it, target });
    } else if (it === 'shield') { k.shield = 9; race.emit('use', { kart: k, item: it }); }
    else if (it === 'comet') { k.comet = 6.5; k.spin = 0; race.emit('use', { kart: k, item: it }); }
    k.itemCount--;
    if (k.itemCount <= 0) { k.item = null; k.itemCount = 0; }
    return true;
  }

  removeTrap(i) { const t = this.traps[i]; this.group.remove(t.mesh); this.traps.splice(i, 1); }
  removeShot(i) { const s = this.shots[i]; this.group.remove(s.mesh); this.shots.splice(i, 1); }

  // per render frame: animation and trails
  frame(dt, parts) {
    this.updateBoxes(dt);
    for (const t of this.traps) {
      const w = 1 + Math.sin(this.t * 7 + t.prog) * 0.06;
      t.mesh.scale.set(w, 2 - w, w);
    }
    for (const s of this.shots) {
      if (s.kind === 'bubble') {
        s.mesh.scale.setScalar(1 + Math.sin(s.age * 20) * 0.06);
        if (Math.random() < 0.5) parts.add.emit(s.pos.x, s.pos.y, s.pos.z, (Math.random() - 0.5), 1, (Math.random() - 0.5), [0.5, 0.9, 1.4], 0.35, 0.4, { drag: 1 });
      } else {
        const tg = s.target;
        if (tg) s.mesh.lookAt(tg.pos);
        s.mesh.rotation.z = Math.sin(s.age * 40) * 0.3;
        parts.add.emit(s.pos.x, s.pos.y, s.pos.z, (Math.random() - 0.5) * 0.5, 0.3, (Math.random() - 0.5) * 0.5, [1.6, 2.0, 0.6], 0.55, 0.5, { drag: 1, grow: -0.5 });
      }
    }
  }
}
