// sim/traps.js — traps you set by hand and check later (DESIGN §11.6, §26): snares and deadfalls on land
// (best on a game trail, 獣道), fish traps / crab pots in the water. Every 6 game hours a set trap rolls for a catch:
//   P = base(zone × type) × (0.5 + Q/100) × bait × (on a trail ? 1.5 : 1) × (your scent, first 6 h ? 0.6 : 1) × hands(p) × know(K)
// A catch left more than 12 h may escape or be eaten. Small 3D models show set / sprung / caught (discreetly).
// Game trails are a few seeded lines per zone; they show as trampled grass, clearer with knowledge.
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { itemDef } from '../data/items.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// what each trap catches, where (base rate per 6 h, §11.6)
export const TRAP_TYPES = {
  snare: { name: 'くくり罠', where: 'land', base: { grass: 0.12, beach: 0.10, palm: 0.10, jungle: 0.11 }, catches: { grass: ['junglefowl', 'rat'], jungle: ['junglefowl', 'rat'], palm: ['rat'], beach: ['seabird'] }, breakOnCatch: 0.30, baitNeeded: false, howto: 'howto_trap_snare' },
  deadfall: { name: '石落とし', where: 'land', base: { grass: 0.18, palm: 0.18, jungle: 0.18, beach: 0.12 }, catches: { grass: ['rat'], jungle: ['rat', 'monitor_small'], palm: ['coconut_crab', 'rat'], beach: ['coconut_crab'] }, breakOnCatch: 0.10, baitNeeded: true, howto: 'howto_trap_deadfall' },
  fish_trap: { name: '魚かご', where: 'water', base: { stream: 0.30, pond: 0.22, sea: 0.15 }, catches: { stream: ['goby', 'eel'], pond: ['goby'], sea: ['sardine', 'wrasse'] }, breakOnCatch: 0.05, baitNeeded: false, howto: 'howto_trap_fish' },
  crab_pot: { name: 'カニかご', where: 'water', base: { sea: 0.28, stream: 0.08, pond: 0.05 }, catches: { sea: ['crab'], stream: ['crab'], pond: ['crab'] }, breakOnCatch: 0.05, baitNeeded: true, howto: 'howto_trap_fish' },
};
// catch → items you take out (the snared bird goes through the §25 procedure when you collect it)
export const CATCH_ITEMS = {
  junglefowl: { bird: 'junglefowl' }, seabird: { bird: 'seabird' },
  rat: { items: { small_game: 1 } }, monitor_small: { items: { small_game: 2 } },
  coconut_crab: { items: { coconut_crab: 1 } }, crab: { items: { crab: 1 } },
  goby: { items: { goby: 1 } }, eel: { items: { eel: 1 } }, sardine: { items: { sardine: 2 } }, wrasse: { items: { wrasse: 1 } },
};
export const CATCH_NAMES = { junglefowl: '野鶏', seabird: '海鳥', rat: '大ネズミ', monitor_small: '小さな トカゲ', coconut_crab: 'ヤシガニ', crab: 'カニ', goby: 'ハゼ', eel: 'ウナギ', sardine: '小魚', wrasse: 'ベラ' };

const BAIT_MUL = (stack) => {
  if (!stack) return 1;
  const d = itemDef(stack.id);
  if (!d) return 1;
  if (/fish|sardine|goby|organ|guts|bait_ball|meat/.test(stack.id) || d.attrs?.scent >= 7) return 1.6;
  if (d.food) return 1.3;
  return 1.1;
};
/** performance on the work table → catch multiplier (p 0.55 → 1.0) and empty-spring chance */
export const handsMul = (p) => clamp(0.55 + 0.82 * p, 0.6, 1.35);
export const emptyChance = (p) => clamp(0.32 - 0.36 * p, 0.02, 0.3);
export const knowMul = (K) => [0.8, 0.95, 1.05, 1.2][clamp(K | 0, 0, 3)];

export class Traps {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.nextUid = 1;
    this.trails = [];
  }

  init(game) {
    this.game = game;
    this.group = new THREE.Group(); this.group.name = 'traps';
    game.world?.scene?.add(this.group);
    this.makeTrails(game.setup?.seed ?? 7);
    game.bus?.on('hour', () => this.hourly());
    game.bus?.on('sleep:end', () => this.hourly());
  }

  // ---------------------------------------------------------------- game trails (獣道)
  makeTrails(seed) {
    const T = this.game.world?.terrain;
    if (!T) return;
    const rng = new RNG(seed * 131 + 977);
    this.trails = [];
    for (const zone of ['grass', 'jungle', 'palm', 'beach']) {
      const count = zone === 'beach' ? 1 : 3;
      for (let k = 0; k < count; k++) {
        const p0 = T.randomPointIn(rng, [zone], 300);
        if (!p0) continue;
        let x = p0.x, z = p0.z, a = rng.next() * Math.PI * 2;
        const pts = [[x, z]];
        for (let i = 0; i < 26; i++) {
          a += (rng.next() - 0.5) * 0.7;
          const nx = x + Math.cos(a) * 3.5, nz = z + Math.sin(a) * 3.5;
          if (!T.isLand(nx, nz) || T.zoneAt(nx, nz) !== zone) { a += Math.PI * 0.6; continue; }
          x = nx; z = nz; pts.push([x, z]);
        }
        if (pts.length > 6) this.trails.push({ zone, pts });
      }
    }
    this.buildTrailMarks();
  }
  /** distance to the nearest trail (m) */
  trailDist(x, z) {
    let best = Infinity;
    for (const t of this.trails) for (let i = 1; i < t.pts.length; i++) {
      const [ax, az] = t.pts[i - 1], [bx, bz] = t.pts[i];
      const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1;
      const u = clamp(((x - ax) * dx + (z - az) * dz) / L, 0, 1);
      best = Math.min(best, Math.hypot(x - (ax + u * dx), z - (az + u * dz)));
    }
    return best;
  }
  /** trampled grass along the trails; clearer when you know traps or tracks (K of the snare how-to) */
  buildTrailMarks() {
    const T = this.game.world?.terrain;
    if (!T || !this.group) return;
    if (this.trailMesh) { this.group.remove(this.trailMesh); this.trailMesh.geometry.dispose(); }
    const geo = new THREE.PlaneGeometry(0.55, 0.9); geo.rotateX(-Math.PI / 2);
    const n = this.trails.reduce((a, t) => a + t.pts.length * 2, 0);
    const mat = new THREE.MeshBasicMaterial({ color: '#7a6a3e', transparent: true, opacity: 0.18, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    let i = 0;
    for (const t of this.trails) for (let k = 1; k < t.pts.length; k++) for (const f of [0.25, 0.75]) {
      const [ax, az] = t.pts[k - 1], [bx, bz] = t.pts[k];
      const x = ax + (bx - ax) * f, z = az + (bz - az) * f;
      q.setFromAxisAngle(up, -Math.atan2(bz - az, bx - ax) + Math.PI / 2);
      m.compose(new THREE.Vector3(x, T.heightAt(x, z) + 0.03, z), q, s);
      mesh.setMatrixAt(i++, m);
    }
    mesh.count = i; mesh.frustumCulled = false;
    this.trailMesh = mesh;
    this.group.add(mesh);
    this.updateTrailVisibility();
  }
  updateTrailVisibility() {
    if (!this.trailMesh) return;
    const K = this.game.sys?.knowledge?.level?.('howto_trap_snare') ?? 0;
    this.trailMesh.material.opacity = [0.12, 0.25, 0.42, 0.55][clamp(K, 0, 3)];
  }

  // ---------------------------------------------------------------- placing
  /** can this item be set here? { ok, reason, water, zone, trail } */
  spotFor(type, x, z) {
    const g = this.game, T = g.world.terrain, def = TRAP_TYPES[type];
    if (!def) return { ok: false, reason: '罠では ない' };
    const water = T.waterAt(x, z, g.player?.seaLevel ?? 0);
    if (def.where === 'water') {
      if (!water.type) return { ok: false, reason: '水の 中（川・池・浅い 磯）に 向かって 置く' };
      if (water.depth > 1.4) return { ok: false, reason: '深すぎる（浅い 所に）' };
      if (this.list.some((t) => Math.hypot(t.x - x, t.z - z) < 2)) return { ok: false, reason: 'すぐ そばに もう 仕掛けて ある' };
      return { ok: true, water: water.type, zone: water.type, depth: water.depth, trail: Infinity };
    }
    if (water.type) return { ok: false, reason: '陸の 上に 仕掛ける' };
    const zone = T.zoneAt(x, z);
    if (!def.base[zone]) return { ok: false, reason: 'ここには 獲物が 来ない（草原・密林・ヤシ林・浜で）' };
    if (this.list.some((t) => Math.hypot(t.x - x, t.z - z) < 2)) return { ok: false, reason: 'すぐ そばに もう 仕掛けて ある' };
    return { ok: true, zone, trail: this.trailDist(x, z) };
  }

  /** set a trap (after the work table): stack = the trap item (taken from the bag by the caller) */
  add(type, x, z, { stack, p = 0.55, K = 0, bait = null, spot } = {}) {
    const g = this.game;
    spot = spot || this.spotFor(type, x, z);
    const t = {
      uid: this.nextUid++, type, x, z, zone: spot.zone, water: spot.water || null, onTrail: spot.trail < 2.5,
      q: stack?.q ?? 50, item: stack ? { ...stack } : { id: type, n: 1, q: 50 }, p, K, bait: bait ? { ...bait } : null,
      setAt: g.clock.total, lastRoll: g.clock.total, state: 'set', catch: null, caughtAt: null, dur: stack?.dur ?? 10,
    };
    this.list.push(t);
    this.makeMesh(t);
    g.bus?.emit('trap:set', { trap: t });
    return t;
  }

  // ---------------------------------------------------------------- the 6-hour rolls
  /** roll every full 6 h that passed since the last roll (sleep and long work can skip many hours at once) */
  hourly() {
    const g = this.game, now = g.clock.total;
    for (const t of this.list) {
      for (let k = 0; k < 40 && t.state === 'set' && now - t.lastRoll >= 6 * 60; k++) this.rollOnce(t, t.lastRoll + 6 * 60);
      this.expire(t, now);
    }
  }
  expire(t, now) {
    const g = this.game;
    if (t.state === 'caught' && now - t.caughtAt > 12 * 60 && !t.lost) {
      t.lost = true;
      const r = g.rng.next();
      if (r < 0.3) { t.state = 'sprung'; t.catch = null; t.note = 'escaped'; }
      else if (r < 0.6) { t.state = 'sprung'; t.catch = null; t.note = 'eaten'; }
      this.refresh(t);
    }
  }
  rollOnce(t, at) {
    const g = this.game, now = at;
    {
      t.lastRoll = now;
      const def = TRAP_TYPES[t.type];
      const scent = now - t.setAt < 6 * 60 + 1 ? 0.6 : 1;
      const baitOk = !def.baitNeeded || t.bait;
      const P = (def.base[t.zone] || 0) * (0.5 + t.q / 100) * BAIT_MUL(t.bait) * (t.onTrail ? 1.5 : 1) * scent * handsMul(t.p) * knowMul(t.K) * (baitOk ? 1 : 0.25);
      if (g.rng.next() < P) {
        const pool = def.catches[t.zone] || def.catches[Object.keys(def.catches)[0]];
        t.state = 'caught'; t.catch = pool[Math.floor(g.rng.next() * pool.length)]; t.caughtAt = now; t.lost = false;
        if (t.bait && g.rng.next() < 0.7) t.bait = null;
      } else if (g.rng.next() < emptyChance(t.p)) { t.state = 'sprung'; t.note = 'empty'; if (t.bait && g.rng.next() < 0.5) t.bait = null; }
      this.refresh(t);
    }
  }

  // ---------------------------------------------------------------- checking
  nearest(pos, r = 2.2) {
    let best = null, bd = r;
    for (const t of this.list) { const d = Math.hypot(t.x - pos.x, t.z - pos.z); if (d < bd) { bd = d; best = t; } }
    return best;
  }
  optionsFor(t) {
    const def = TRAP_TYPES[t.type], ops = [];
    const mild = (this.game.settings?.butcherView || 'mild') !== 'normal';
    if (t.state === 'caught') ops.push({ id: 'trap_take', label: `${CATCH_NAMES[t.catch] || '獲物'}が かかって いる → ${mild ? '取り出す' : '取る'}` });
    if (t.state === 'sprung') ops.push({ id: 'trap_reset', label: `${def.name}を 仕掛け直す${t.note === 'escaped' ? '（逃げられた 跡）' : t.note === 'eaten' ? '（食べられた 跡）' : '（空で はじけて いた）'}` });
    if (t.state === 'set') ops.push({ id: 'trap_look', label: `${def.name}を 見る（${t.onTrail ? '獣道の 上' : t.water ? '水の 中' : '獣道から 外れて いる'}${t.bait ? '・エサ あり' : ''}）` });
    if (t.state !== 'caught') ops.push({ id: 'trap_bait', label: t.bait ? 'エサを 替える' : 'エサを 付ける' });
    ops.push({ id: 'trap_pick', label: `${def.name}を 回収する` });
    return ops;
  }
  remove(t) {
    this.list = this.list.filter((x) => x !== t);
    if (t.mesh) { this.group.remove(t.mesh); t.mesh.traverse((o) => o.geometry?.dispose?.()); }
  }

  // ---------------------------------------------------------------- 3D (small, discreet)
  makeMesh(t) {
    const g = this.game, T = g.world?.terrain;
    if (!T || !this.group) return;
    const grp = new THREE.Group();
    const y = t.water ? Math.max(T.heightAt(t.x, t.z), (g.player?.seaLevel ?? 0) - 0.2) : T.heightAt(t.x, t.z);
    grp.position.set(t.x, y, t.z);
    const wood = new THREE.MeshStandardMaterial({ color: '#8a5a30', roughness: 0.9 });
    const fiber = new THREE.MeshStandardMaterial({ color: '#c9a96a', roughness: 0.9 });
    const stone = new THREE.MeshStandardMaterial({ color: '#7d7a72', roughness: 0.95 });
    if (t.type === 'snare') {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 1.6, 5), wood);
      pole.position.set(-0.4, 0.55, 0); pole.rotation.z = -0.75; pole.name = 'pole'; grp.add(pole);
      const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.4, 5), wood); stake.position.set(0.2, 0.15, 0); grp.add(stake);
      const loop = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.008, 4, 12), fiber); loop.position.set(0.2, 0.18, 0); loop.rotation.y = Math.PI / 2; loop.name = 'loop'; grp.add(loop);
    } else if (t.type === 'deadfall') {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), stone); rock.scale.set(1.3, 0.45, 1); rock.position.set(0, 0.32, 0); rock.rotation.z = 0.35; rock.name = 'rock'; grp.add(rock);
      for (const [x, r] of [[-0.18, 0.2], [0.05, -0.4], [0.18, 0.1]]) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.34, 4), wood); s.position.set(x, 0.15, 0.02); s.rotation.z = r; grp.add(s); }
    } else {
      const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.6, 9, 1, true), fiber);
      basket.rotation.z = Math.PI / 2; basket.position.y = 0.12; grp.add(basket);
      const w = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12, 0), stone); w.position.set(0, 0.3, 0); grp.add(w);
    }
    // the catch: a small wrapped bundle (never a detailed animal), plus a marker you can spot from afar
    const bundle = new THREE.Mesh(new THREE.SphereGeometry(0.14, 7, 5), new THREE.MeshStandardMaterial({ color: '#6a8a4a', roughness: 0.9 }));
    bundle.scale.set(1.4, 0.7, 1); bundle.position.set(0.2, 0.1, 0); bundle.name = 'catch'; grp.add(bundle);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.1), new THREE.MeshBasicMaterial({ color: '#e8743b', side: THREE.DoubleSide }));
    flag.position.set(-0.05, 0.75, 0); flag.name = 'flag'; grp.add(flag);
    t.mesh = grp;
    this.group.add(grp);
    this.refresh(t);
  }
  refresh(t) {
    const m = t.mesh; if (!m) return;
    const caught = t.state === 'caught', sprung = t.state !== 'set';
    m.getObjectByName('catch').visible = caught;
    m.getObjectByName('flag').visible = caught;
    const pole = m.getObjectByName('pole'); if (pole) pole.rotation.z = sprung ? -0.15 : -0.75;
    const rock = m.getObjectByName('rock'); if (rock) { rock.rotation.z = sprung ? 0 : 0.35; rock.position.y = sprung ? 0.13 : 0.32; }
  }

  update(dt) {
    this.acc = (this.acc || 0) + dt;
    if (this.acc > 1) { this.acc = 0; this.hourly(); }
    const t = performance.now() / 1000;
    for (const tr of this.list) { const f = tr.mesh?.getObjectByName('flag'); if (f?.visible) f.rotation.y = Math.sin(t * 3) * 0.6; }
  }

  // ---------------------------------------------------------------- save
  serialize() { return { next: this.nextUid, list: this.list.map(({ mesh, ...t }) => t) }; }
  deserialize(d) {
    for (const t of this.list) if (t.mesh) this.group.remove(t.mesh);
    this.list = (d?.list || []).map((t) => ({ ...t }));
    this.nextUid = d?.next || this.list.length + 1;
    for (const t of this.list) this.makeMesh(t);
    this.updateTrailVisibility();
  }
}
