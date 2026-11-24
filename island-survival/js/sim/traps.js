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

// §26.4 bait: what suits which trap / target — best ×1.3, suits ×1.0, wrong ×0.8, none ×0.5 (required → ×0.1)
const FISHY = /sardine|goby|wrasse|jack|eel|trevally|seabream|grouper|fish|shellfish|crab|organ_meat/;
export function baitClass(type, aim, stack) {
  if (!stack) return 'none';
  const id = stack.id, d = itemDef(id);
  if (id === 'bait_ball') return type === 'fish_trap' || type === 'crab_pot' ? 'ball' : 'ok';
  if (type === 'snare' && aim === 'bird') return id === 'grub' || id === 'berry' || (FISHY.test(id) && stack.forSeabird) ? 'best' : FISHY.test(id) ? 'ok' : d?.food ? 'wrong' : 'wrong';
  if (type === 'snare') return id === 'coconut_meat' ? 'best' : d?.food && !FISHY.test(id) ? 'ok' : 'wrong';
  if (type === 'deadfall') return id === 'coconut_meat' ? 'best' : (d?.food && ((stack.fresh ?? 100) < 40 || /meat|organ/.test(id))) || FISHY.test(id) ? 'ok' : d?.food ? 'ok' : 'wrong';
  if (type === 'fish_trap') return /shellfish|organ_meat/.test(id) || (FISHY.test(id) && (stack.gutted || (stack.fresh ?? 100) < 70)) ? 'best' : FISHY.test(id) ? 'ok' : id === 'seaweed' ? 'weed' : 'wrong';
  if (type === 'crab_pot') return FISHY.test(id) && (stack.fresh ?? 100) < 60 ? 'best' : FISHY.test(id) || /meat/.test(id) ? 'ok' : 'wrong';
  return 'ok';
}
export const BAIT_MUL = { best: 1.3, ok: 1.0, ball: 1.2, weed: 0.6, wrong: 0.8, none: 0.5 };
/** §26.6: S (the set) = 0.70 + 0.6 p (0.55 → 1.03), Kc by knowledge, empty springs, breaks */
export const handsMul = (p) => 0.70 + 0.6 * p;
export const knowMul = (K) => [0.85, 1.0, 1.1, 1.2][clamp(K | 0, 0, 3)];
const KE = [1.3, 1.0, 0.8, 0.6];
export const emptyChance = (p, K = 1) => clamp(0.15 - 0.16 * p, 0.01, 0.15) * KE[clamp(K | 0, 0, 3)];
export const MAX_TRAPS = 6;
const BIRDS = new Set(['junglefowl', 'seabird']);

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
        if (pts.length > 6) {
          // who uses it (§26.3) and 1–2 narrow points (bush, rocks, a fallen log)
          const users = zone === 'grass' ? (k === 0 ? ['goat'] : ['junglefowl', 'rat']) : zone === 'jungle' ? (k < 2 ? ['boar'] : ['rat']) : zone === 'palm' ? ['rat', 'coconut_crab'] : ['seabird'];
          const narrow = [pts[Math.floor(pts.length * (0.3 + rng.next() * 0.2))]];
          if (rng.next() < 0.5) narrow.push(pts[Math.floor(pts.length * (0.65 + rng.next() * 0.2))]);
          this.trails.push({ id: this.trails.length, zone, pts, users, narrow });
        }
      }
    }
    this.buildTrailMarks();
  }
  /** distance to the nearest trail (m) */
  trailDist(x, z) { return this.nearestTrail(x, z).d; }
  nearestTrail(x, z) {
    let best = Infinity, trail = null;
    for (const t of this.trails) for (let i = 1; i < t.pts.length; i++) {
      const [ax, az] = t.pts[i - 1], [bx, bz] = t.pts[i];
      const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1;
      const u = clamp(((x - ax) * dx + (z - az) * dz) / L, 0, 1);
      const d = Math.hypot(x - (ax + u * dx), z - (az + u * dz));
      if (d < best) { best = d; trail = t; }
    }
    return { d: best, trail };
  }
  /** tracks / droppings along the trails, every ~20 m (§26.3) */
  signs() {
    if (this._signs) return this._signs;
    const out = [];
    for (const t of this.trails) for (let i = 2; i < t.pts.length; i += 6) out.push({ x: t.pts[i][0], z: t.pts[i][1], trail: t, kind: i % 12 === 2 ? 'scat' : 'track', species: t.users[i % t.users.length] });
    return (this._signs = out);
  }
  signAt(pos, r = 1.6) { let best = null, bd = r; for (const s of this.signs()) { const d = Math.hypot(s.x - pos.x, s.z - pos.z); if (d < bd) { bd = d; best = s; } } return best; }
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
    this.marks = [];
    for (const t of this.trails) for (let k = 1; k < t.pts.length; k++) for (const f of [0.25, 0.75]) {
      const [ax, az] = t.pts[k - 1], [bx, bz] = t.pts[k];
      const x = ax + (bx - ax) * f, z = az + (bz - az) * f;
      q.setFromAxisAngle(up, -Math.atan2(bz - az, bx - ax) + Math.PI / 2);
      const pos = new THREE.Vector3(x, T.heightAt(x, z) + 0.03, z);
      this.marks.push({ pos, q: q.clone(), trail: t.id });
      m.compose(pos, q, s);
      mesh.setMatrixAt(i++, m);
    }
    mesh.count = i; mesh.frustumCulled = false;
    this.trailMesh = mesh;
    this.group.add(mesh);
    this.updateTrailVisibility();
  }
  updateTrailVisibility() { this.updateTrailMarks(true); }
  /** a partner pointed at a trail: show all of it brightly for 20 s (§26.3) */
  flashTrail(trail) {
    if (!this.marks) return;
    this.flash = { id: trail.id, until: performance.now() + 20000 };
    this.updateTrailMarks(true);
  }
  /** §26.3: you see trails within 8 m standing (35 %), 15 m crouching (60 %); reading tracks K2 20 m, K3 30 m; +1 m per hunting Lv; rain ×0.7, dark ×0.4 */
  updateTrailMarks(force = false) {
    if (!this.trailMesh || !this.marks) return;
    const g = this.game, P = g.player?.pos;
    if (!P) return;
    const Kr = g.sys?.knowledge?.level?.('howto_read_tracks') ?? 0, Ks = g.sys?.knowledge?.level?.('howto_trap_snare') ?? 0;
    const crouch = !!g.player?.crouch;
    let R = Math.max(crouch ? 15 : 8, Kr >= 3 ? 30 : Kr >= 2 ? 20 : 0) + (g.sys?.player?.skills?.hunt ?? 0);
    if ((g.sys?.weather?.rain ?? 0) > 0.3) R *= 0.7;
    const h = g.clock?.hour ?? 12;
    if ((h < 5.5 || h > 19) && !(g.sys?.player?.heldStack?.()?.lit > 0)) R *= 0.4;
    this.trailMesh.material.opacity = Math.min(0.75, (crouch ? 0.6 : 0.35) + 0.05 * Math.max(Kr, Ks));
    const m = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3(0, 0, 0);
    let changed = force;
    const fl = this.flash && performance.now() < this.flash.until ? this.flash.id : null;
    if (fl != null) this.trailMesh.material.opacity = 0.8;
    this.marks.forEach((mk, i) => {
      const vis = Math.hypot(mk.pos.x - P.x, mk.pos.z - P.z) <= R || (fl != null && mk.trail === fl);
      if (vis !== mk.vis) { mk.vis = vis; changed = true; m.compose(mk.pos, mk.q, vis ? one : zero); this.trailMesh.setMatrixAt(i, m); }
    });
    if (changed) this.trailMesh.instanceMatrix.needsUpdate = true;
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
      if (this.list.length >= MAX_TRAPS) return { ok: false, reason: `罠は ${MAX_TRAPS} つまで（見回りが 大変に なる）` };
      return { ok: true, water: water.type, zone: water.type, depth: water.depth, trail: Infinity };
    }
    if (water.type) return { ok: false, reason: '陸の 上に 仕掛ける' };
    const zone = T.zoneAt(x, z);
    if (!def.base[zone]) return { ok: false, reason: 'ここには 獲物が 来ない（草原・密林・ヤシ林・浜で）' };
    if (this.list.some((t) => Math.hypot(t.x - x, t.z - z) < 2)) return { ok: false, reason: 'すぐ そばに もう 仕掛けて ある' };
    if (this.list.length >= MAX_TRAPS) return { ok: false, reason: `罠は ${MAX_TRAPS} つまで（見回りが 大変に なる）` };
    const nt = this.nearestTrail(x, z);
    const narrow = nt.trail?.narrow?.some((q) => Math.hypot(q[0] - x, q[1] - z) < 2) || false;
    if (type === 'deadfall' && /beach/.test(zone)) return { ok: true, zone, trail: nt.d, trailRef: nt.trail, narrow, soft: true };
    return { ok: true, zone, trail: nt.d, trailRef: nt.trail, narrow };
  }

  /** set a trap (after the work table): stack = the trap item (taken from the bag by the caller) */
  add(type, x, z, { stack, p = 0.55, K = 0, bait = null, spot, aim = null, marks = {}, scent = 1 } = {}) {
    const g = this.game;
    spot = spot || this.spotFor(type, x, z);
    const t = {
      uid: this.nextUid++, type, x, z, zone: spot.zone, water: spot.water || null, onTrail: spot.trail < 1.2, trailId: spot.trailRef?.id ?? null,
      trailUsers: spot.trailRef?.users || [], narrow: !!spot.narrow, soft: !!spot.soft, aim, marks, scent,
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
    // §26.8 the 12-hour rule, repeated every 12 h (a shallow stake lets more escape)
    while (t.state === 'caught' && now - t.caughtAt >= 12 * 60 * ((t.lostRolls || 0) + 1)) {
      t.lostRolls = (t.lostRolls || 0) + 1;
      const r = g.rng.next(), esc = 0.3 + (t.marks?.stakeShallow ? 0.15 : 0);
      if (r < esc) { t.state = 'sprung'; t.catch = null; t.note = 'escaped'; }
      else if (r < esc + 0.3) { t.state = 'sprung'; t.catch = null; t.note = 'eaten'; }
      this.refresh(t);
    }
  }
  rollOnce(t, at) {
    const g = this.game, now = at;
    {
      t.lastRoll = now;
      const def = TRAP_TYPES[t.type], M = t.marks || {};
      // ① catch (§26.6)
      let pool = def.catches[t.zone] || def.catches[Object.keys(def.catches)[0]];
      let aimMul = 1;
      if (t.type === 'snare' && t.aim) { const want = pool.filter((sp) => (t.aim === 'bird') === BIRDS.has(sp)); aimMul = want.length ? 1 : 0.3; if (want.length) pool = want; }
      const trailOk = t.onTrail && (t.type !== 'snare' || !t.aim || t.trailUsers.some((u) => (t.aim === 'bird') === BIRDS.has(u)));
      const bc = baitClass(t.type, t.aim, t.bait);
      const bait = def.baitNeeded && bc === 'none' ? 0.1 : BAIT_MUL[bc];
      const scent = (now - t.setAt < 6 * 60 ? 0.6 : 1) * (t.scent ?? 1) * (now < (t.disturbedUntil || 0) ? 0.8 : 1);
      const crowd = Math.pow(0.8, this.list.filter((o) => o !== t && o.trailId != null && o.trailId === t.trailId && Math.hypot(o.x - t.x, o.z - t.z) < 20).length);
      const mistakes = (M.loopOff ? 0.5 : 1) * (M.triggerDeep ? 0.7 : 1) * (M.tooTight ? 0.8 : 1) * (t.soft ? 0.6 : 1) * (M.mouthMul ?? 1);
      const P = Math.min(0.45, (def.base[t.zone] || 0) * (0.5 + t.q / 100) * bait * (trailOk ? 1.5 : 1) * (t.narrow && trailOk ? 1.2 : 1) * scent * handsMul(t.p) * knowMul(t.K) * aimMul * crowd * mistakes);
      const W = g.sys?.weather;
      if (g.rng.next() < P) {
        t.state = 'caught'; t.catch = pool[Math.floor(g.rng.next() * pool.length)]; t.caughtAt = now; t.lost = false; t.lostRolls = 0;
        if (t.where === 'water' || def.where === 'water') t.count = Math.max(1, Math.round((1 + Math.floor(t.q / 40)) * handsMul(t.p) * knowMul(t.K) * (M.mouthMul ?? 1) * (0.5 + g.rng.next())));
        if (t.bait && g.rng.next() < 0.7) t.bait = null;
      } else if (g.rng.next() < emptyChance(t.p, t.K) * (M.triggerShallow ? 2 : 1) * ((W?.windSpeed ?? 0) > 8 || /storm|typhoon/.test(W?.type || '') ? 2 : 1) * (t.type === 'deadfall' ? 1.2 : 1) * (M.assembleOff ? 1.5 : 1) && def.where !== 'water') {
        // ② sprung empty
        t.state = 'sprung'; t.note = (W?.windSpeed ?? 0) > 8 ? 'wind' : M.triggerShallow ? 'shallow' : 'empty';
      } else if (t.bait && g.rng.next() < 0.1 * (M.triggerDeep ? 2 : 1) * (M.baitNearMouth ? 2 : 1)) {
        // ③ only the bait is gone
        t.bait = null; t.note = 'baitGone';
      }
      // a fish trap without enough stones may wash away (§26.5)
      if (def.where === 'water' && M.stonesWeak && t.state !== 'broken' && g.rng.next() < 0.15 * 0.75) { t.state = 'broken'; t.note = 'flood'; t.catch = null; }
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
    if (t.state === 'set' && t.note === 'baitGone') ops.push({ id: 'trap_look', label: `${def.name}：エサだけ 取られて いる` });
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
    if (this.acc > 1) {
      this.acc = 0; this.hourly();
      const P = this.game.player?.pos, now = this.game.clock.total;
      if (P) for (const t of this.list) if (Math.hypot(t.x - P.x, t.z - P.z) < 2) t.disturbedUntil = now + 180;
      this.updateTrailMarks();
      // a hunter partner points at trails as you walk (§26.3)
      if ((this.spotT = (this.spotT || 0) + 1) % 5 === 0 && this.game.sys.companion) import('../player/trapwork.js').then((m) => m.partnerSpotsTrail(this.game)).catch(() => {});
    }
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
