// world/fauna.js — wild animals with senses and behaviour, blood trails and carcasses (DESIGN.md §8.4, §22.1–22.3).
//
// Each animal notices the player through
//   sight   — in its field of view, scaled by light (night, fog), your stance (crouching), cover (jungle) and
//             movement (a still player is hard to see)
//   hearing — your footsteps (running ≫ walking ≫ crouching), work noise, and loud events (a gunshot is heard
//             far away and makes every animal around wary for hours)
//   smell   — only when the wind carries your scent to it (approach from downwind!)
// Awareness rises toward 1 → the animal stops and stares (alert) → above 1 it flees; its herd follows.
// A hit wounds: bleeding drains hp over time, the animal runs, leaves blood drops you can follow, slows down
// and finally collapses. Some (boar, monitor lizard, snake) may turn and fight when wounded or cornered.
// Dead animals become carcass nodes (big ones are butchered with a tool; small ones picked up).
import * as THREE from 'three';
import { SPECIES } from '../data/fauna.js';
import { RNG, clamp } from '../core/rng.js';

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...o });

// ------------------------------------------------------------------ meshes (forward = +z)
function legs(g, mat, list, len, r) {
  const out = [];
  for (const [x, z] of list) {
    const pivot = new THREE.Group();
    pivot.position.set(x, len, z);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.8, len, 5), mat);
    leg.position.y = -len / 2;
    pivot.add(leg);
    g.add(pivot);
    out.push(pivot);
  }
  return out;
}

const BUILD = {
  boar() {
    const g = new THREE.Group(), body = M('#4a3a2c'), dark = M('#2f251c'), tusk = M('#efe6d0');
    const torso = new THREE.Mesh(new THREE.SphereGeometry(1, 9, 7), body); torso.scale.set(0.3, 0.3, 0.55); torso.position.y = 0.52; g.add(torso);
    const mane = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.6), dark); mane.position.set(0, 0.8, 0.05); g.add(mane);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.42, 7), body); head.rotation.x = Math.PI / 2; head.position.set(0, 0.5, 0.68); g.add(head);
    const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 8), M('#6b4d3a')); snout.rotation.x = Math.PI / 2; snout.position.set(0, 0.47, 0.9); g.add(snout);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 4), dark); ear.position.set(s * 0.12, 0.68, 0.56); g.add(ear);
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.08, 4), tusk); t.position.set(s * 0.06, 0.45, 0.85); t.rotation.x = -0.6; g.add(t);
    }
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.015, 0.2, 4), dark); tail.position.set(0, 0.55, -0.55); tail.rotation.x = 0.6; g.add(tail);
    g.userData.legs = legs(g, dark, [[-0.14, 0.32], [0.14, 0.32], [-0.14, -0.3], [0.14, -0.3]], 0.38, 0.045);
    g.userData.head = head;
    return g;
  },
  goat() {
    const g = new THREE.Group(), c = new THREE.Color().setHSL(0.08, 0.25, 0.35 + Math.random() * 0.4), body = M(c), horn = M('#57503f'), dark = M('#3b3329');
    const torso = new THREE.Mesh(new THREE.SphereGeometry(1, 9, 7), body); torso.scale.set(0.22, 0.24, 0.45); torso.position.y = 0.68; g.add(torso);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.32, 6), body); neck.position.set(0, 0.85, 0.38); neck.rotation.x = 0.6; g.add(neck);
    const head = new THREE.Group(); head.position.set(0, 1.0, 0.5); g.add(head);
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.13, 0.26), body); skull.position.z = 0.06; head.add(skull);
    for (const s of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.25, 5), horn); h.position.set(s * 0.05, 0.13, -0.04); h.rotation.x = -0.7; head.add(h);
      const ear = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.05), body); ear.position.set(s * 0.1, 0.03, -0.02); head.add(ear);
    }
    const beard = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 4), dark); beard.position.set(0, -0.09, 0.14); beard.rotation.x = Math.PI; head.add(beard);
    g.userData.legs = legs(g, dark, [[-0.1, 0.25], [0.1, 0.25], [-0.1, -0.25], [0.1, -0.25]], 0.5, 0.03);
    g.userData.head = head;
    return g;
  },
  fowl() {
    const g = new THREE.Group(), cock = Math.random() < 0.5;
    const body = M(cock ? '#8c3b1c' : '#7a5b3b');
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.13, 7, 6), body); torso.scale.set(1, 1, 1.3); torso.position.y = 0.25; g.add(torso);
    const head = new THREE.Group(); head.position.set(0, 0.4, 0.12); g.add(head);
    head.add(new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 5), M(cock ? '#c3622a' : '#7a5b3b')));
    const comb = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.05, 0.06), M('#d22a2a')); comb.position.set(0, 0.06, 0); head.add(comb);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.05, 4), M('#d8b14a')); beak.rotation.x = Math.PI / 2; beak.position.z = 0.06; head.add(beak);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 5), M(cock ? '#183d2a' : '#5b4630')); tail.position.set(0, 0.38, -0.2); tail.rotation.x = -0.9; g.add(tail);
    g.userData.legs = legs(g, M('#b6893e'), [[-0.04, 0], [0.04, 0]], 0.14, 0.01);
    g.userData.head = head;
    return g;
  },
  crab() {
    const g = new THREE.Group(), shell = M(Math.random() < 0.6 ? '#c2452c' : '#7d4bb0');
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.1, 7, 4), shell); body.scale.set(1.2, 0.5, 1); body.position.y = 0.08; g.add(body);
    for (const s of [-1, 1]) {
      const claw = new THREE.Mesh(new THREE.SphereGeometry(0.045, 5, 4), shell); claw.scale.set(1, 0.7, 1.5); claw.position.set(s * 0.1, 0.08, 0.11); g.add(claw);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 4, 3), M('#111')); eye.position.set(s * 0.03, 0.14, 0.07); g.add(eye);
    }
    g.userData.legs = legs(g, shell, [[-0.1, 0.03], [0.1, 0.03], [-0.11, -0.02], [0.11, -0.02], [-0.1, -0.06], [0.1, -0.06]], 0.07, 0.008);
    for (const l of g.userData.legs) l.rotation.z = l.position.x > 0 ? -0.9 : 0.9;
    return g;
  },
  bird() {
    const g = new THREE.Group(), white = M('#f2f2ee'), brown = M('#4a3f35');
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.12, 7, 6), white); torso.scale.set(1, 1, 2); torso.position.y = 0.3; g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), brown); head.position.set(0, 0.42, 0.2); g.add(head);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.12, 4), M('#d8c04a')); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.41, 0.3); g.add(beak);
    const wings = [];
    for (const s of [-1, 1]) {
      const piv = new THREE.Group(); piv.position.set(s * 0.08, 0.34, 0); g.add(piv);
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.015, 0.16), brown); w.position.x = s * 0.22; piv.add(w);
      wings.push(piv);
    }
    g.userData.wings = wings;
    g.userData.legs = legs(g, M('#8ab6c9'), [[-0.04, 0], [0.04, 0]], 0.18, 0.01);
    return g;
  },
  lizard() {
    const g = new THREE.Group(), skin = M('#4c4f33'), seg = [];
    for (let i = 0; i < 7; i++) {
      const r = i < 2 ? 0.07 : i < 4 ? 0.09 : 0.06 - (i - 4) * 0.012;
      const m = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.025, r), 6, 5), skin);
      m.scale.set(1, 0.6, 1.6);
      m.position.set(0, 0.1, 0.35 - i * 0.14);
      g.add(m); seg.push(m);
    }
    g.userData.seg = seg;
    g.userData.legs = legs(g, skin, [[-0.1, 0.2], [0.1, 0.2], [-0.1, -0.08], [0.1, -0.08]], 0.09, 0.02);
    for (const l of g.userData.legs) l.rotation.z = l.position.x > 0 ? -0.7 : 0.7;
    return g;
  },
  snake() {
    const g = new THREE.Group(), skin = M('#6b6a3a'), seg = [];
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(i === 0 ? 0.035 : 0.03 - i * 0.0015, 6, 4), i === 0 ? M('#4d4b2a') : skin);
      m.scale.set(1, 0.7, 1.8);
      m.position.set(0, 0.03, 0.4 - i * 0.07);
      g.add(m); seg.push(m);
    }
    g.userData.seg = seg;
    return g;
  },
};

// ------------------------------------------------------------------ geometry helpers
/** closest approach of segment AB to point P: { d, t (0…1 along AB), q } */
function segPoint(A, B, P) {
  const ab = new THREE.Vector3().subVectors(B, A);
  const t = clamp(new THREE.Vector3().subVectors(P, A).dot(ab) / Math.max(1e-6, ab.lengthSq()));
  const q = A.clone().addScaledVector(ab, t);
  return { d: q.distanceTo(P), t, q };
}
const MESH = { seabird: 'bird', junglefowl: 'fowl', goat: 'goat', boar: 'boar', crab: 'crab', coconut_crab: 'crab', monitor: 'lizard', viper: 'snake' };
const turnTo = (cur, target, k) => { let d = target - cur; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return cur + d * Math.min(1, k); };
const randIn = (rng, [a, b]) => a + (b - a) * rng.next();

// ------------------------------------------------------------------ an animal
class Animal {
  constructor(id, kind, x, z, terrain, rng, herd) {
    this.id = id; this.kind = kind; this.sp = SPECIES[kind];
    this.mesh = BUILD[MESH[kind]]();
    const big = kind === 'boar' || kind === 'goat';
    this.scale = big ? this.sp.size * rng.float(0.85, 1.15) : 1;
    this.mesh.scale.setScalar(big ? this.scale : kind === 'coconut_crab' ? 1.9 : 1);
    this.pos = new THREE.Vector3(x, terrain.heightAt(x, z), z);
    this.yaw = rng.float(0, Math.PI * 2);
    this.speed = 0;
    this.state = 'normal';
    this.stateT = rng.float(1, 5);
    this.hp = this.sp.hp; this.maxHp = this.sp.hp;
    this.herd = herd;
    this.target = null;
    this.phase = rng.float(0, 10);
    this.alt = 0;
    this.hidden = false;
    this.headUpT = rng.float(5, 15); this.headUp = 0;
    this.sensitizedUntil = -1;     // game minutes
    this.avoidUntil = -1;          // gunshot: stays away (game minutes)
    this.alertBy = null;
    this.wound = null;             // { part, fatalReal, fatalGame, drop, run, stopAfter, slow, bed }
    this.lastDrop = this.pos.clone();
    this.ran = 0;
    this.attackCd = 0;
  }
  get alive() { return this.state !== 'dead'; }
}

export class Fauna {
  constructor(game) {
    this.game = game;
    this.animals = [];
    this.rng = new RNG((game.setup?.seed || 7) * 31 + 3);
    this.nextId = 1;
    this.group = new THREE.Group(); this.group.name = 'fauna';
    this.noises = [];
    this.blood = []; this.bloodIdx = 0;
    this.killed = {};
    this.lastCough = 0;
  }

  init(game) {
    this.game = game;
    game.world.scene.add(this.group);
    const g = new THREE.CircleGeometry(0.08, 7); g.rotateX(-Math.PI / 2);
    this.bloodMesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: '#6d0f0f', transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), 500);
    this.bloodMesh.count = 0; this.bloodMesh.frustumCulled = false;
    game.world.scene.add(this.bloodMesh);
    const res = game.diff?.resources ?? 1;
    for (const kind of Object.keys(SPECIES)) this.populate(kind, Math.max(1, Math.round(SPECIES[kind].count * res)));
    game.bus.on('noise', (n) => this.noise(n.x, n.z, n.radius, n.kind));
  }

  populate(kind, n, awayFrom = null) {
    const sp = SPECIES[kind], t = this.game.world.terrain;
    let placed = 0, guard = 0;
    while (placed < n && guard++ < 300) {
      const p = t.randomPointIn(this.rng, sp.zones, 80);
      if (!p) break;
      if (awayFrom && Math.hypot(p.x - awayFrom.x, p.z - awayFrom.z) < 80) continue;
      if (!t.isLand(p.x, p.z, 0.6) && !sp.swims) continue;
      const herd = { id: this.nextId, center: new THREE.Vector3(p.x, 0, p.z), lookout: null };
      const size = this.rng.int(sp.group[0], sp.group[1]);
      for (let k = 0; k < size && placed < n; k++) {
        const x = p.x + this.rng.float(-5, 5), z = p.z + this.rng.float(-5, 5);
        if (!t.isLand(x, z, 0.5) && !sp.swims) continue;
        const a = new Animal(this.nextId++, kind, x, z, t, this.rng, herd);
        if (sp.lookout && !herd.lookout) { herd.lookout = a; a.lookout = true; }
        this.animals.push(a); this.group.add(a.mesh); placed++;
      }
    }
  }

  /** a sound somewhere: radius = how far it carries (m). kind 'gunshot' scares far and long (§22.2) */
  noise(x, z, radius, kind = '') {
    const now = this.game.clock.total;
    for (const a of this.animals) {
      if (!a.alive) continue;
      const d = Math.hypot(a.pos.x - x, a.pos.z - z);
      if (kind === 'gunshot') {
        if (d < 150) { a.avoidUntil = now + 6 * 60; a.sensitizedUntil = now + 6 * 60; this.startFlee(a, new THREE.Vector3(x, 0, z), 1.5); }
        else if (d < 400) { a.sensitizedUntil = now + 60; if (a.state === 'normal') this.startAlert(a, new THREE.Vector3(x, 0, z), 'hear'); }
      } else if (d < radius * (a.sp.hearing / 30)) {
        if (a.state === 'normal') this.startAlert(a, new THREE.Vector3(x, 0, z), 'hear');
        else if (a.state === 'alert') this.startFlee(a, new THREE.Vector3(x, 0, z));
      }
    }
  }

  /** the player's footprint in the senses right now */
  signature() {
    const g = this.game, P = g.player, mi = P.moveInfo, W = g.sys.weather;
    const zone = g.world.terrain.zoneAt(P.pos.x, P.pos.z);
    const crouch = P.crouch;
    const motion = mi.running ? 1.5 : mi.moving ? 1.0 : 0.5;
    const env = g.world.env || { night: 0 };
    const h = g.clock.hour;
    const twilight = (h >= 5 && h < 6.5) || (h >= 18 && h < 19.5);
    let light = env.night > 0.7 ? 'night' : twilight ? 'twilight' : 'day';
    if (g.sys.player?.torchLit) light = 'day';
    const background = zone === 'jungle' || g.sys.player?.shelter?.rain >= 0.3 ? 0.6 : P.pos.y > 30 ? 1.5 : 1;
    let noise = !mi.moving ? 0 : mi.running ? 28 : crouch ? 4 : 10;
    if (mi.moving && (zone === 'jungle')) noise *= 1.5;
    if (mi.moving && (zone === 'beach' || zone === 'stream' || mi.inWater)) noise *= 0.6;
    if (mi.swimming) noise = 12;
    if ((W?.rain ?? 0) > 0.3) noise *= 0.5;
    if ((W?.windSpeed ?? 0) > 8) noise *= 0.6;
    const scent = (g.sys.player?.bloodyHands ? 1.5 : 1) * (g.sys.player?.smoky ? 0.6 : 1) * ((W?.rain ?? 0) > 0.3 ? 0.5 : 1);
    return { posture: crouch ? 0.6 : 1, motion, background, light, noise, scent, moving: mi.moving };
  }

  isActive(sp, hour) { return sp.active.some(([a, b]) => hour >= a && hour < b); }

  update(dt, gm) {
    const g = this.game;
    if (!g.world) return;
    const hour = g.clock.hour, now = g.clock.total;
    const P = g.player.pos;
    const sig = this.signature();
    const W = g.sys.weather;
    const wind = W?.windSpeed ?? 2, wd = W?.windDir ?? 0.8;
    const wx = Math.sin(wd), wz = Math.cos(wd);
    const notice = g.diff?.notice ?? 1;
    const t = g.world.terrain;
    // coughing gives you away (cold, §6.2)
    if (g.sys.player?.body?.has?.('cold') && performance.now() - this.lastCough > 9000 && this.rng.next() < dt * 0.06) { this.lastCough = performance.now(); g.sys.sfx?.play('cough'); this.noise(P.x, P.z, 20); }
    for (const a of this.animals) {
      const sp = a.sp;
      const dx = P.x - a.pos.x, dz = P.z - a.pos.z;
      const dist = Math.hypot(dx, dz);
      const far = dist > 180;
      a.mesh.visible = !far && !a.hidden;
      let adt = dt;
      if (far && a.state !== 'flee' && a.state !== 'wounded') { a.farT = (a.farT || 0) + dt; if (a.farT < 0.5) continue; adt = a.farT; a.farT = 0; }
      if (a.state === 'dead') continue;
      a.phase += adt; a.attackCd -= adt;
      const active = this.isActive(sp, hour);
      const sens = now < a.sensitizedUntil ? 1.5 : 1;

      // ---------- wounds
      if (a.wound) {
        const w = a.wound;
        if (w.fatalReal !== undefined) { w.fatalReal -= adt; if (w.fatalReal <= 0) { this.kill(a, w.part); continue; } }
        if (w.fatalGame !== undefined && now >= w.fatalGame) { this.kill(a, w.part); continue; }
        if (w.drop && a.pos.distanceTo(a.lastDrop) > w.drop && (!w.stopAfter || w.run < w.stopAfter)) { this.dropBlood(a.pos.x, a.pos.z); a.lastDrop.copy(a.pos); }
      }

      // ---------- senses (§22.1)
      let senses = 0, by = null;
      if (a.state !== 'flee' || a.wound) {
        // sight: 270° field of view
        const facing = Math.atan2(dx, dz) - a.yaw;
        const ang = Math.abs(Math.atan2(Math.sin(facing), Math.cos(facing))) * 180 / Math.PI;
        const lightMul = sig.light === 'day' ? 1 : sig.light === 'twilight' ? 0.7 : sp.lightNight;
        const headUp = a.headUp > 0 || a.lookout || a.state === 'alert' ? 1.5 : 1;
        const sightR = sp.sight * sig.posture * sig.motion * sig.background * lightMul * headUp * sens * notice * (active ? 1 : 0.5);
        if (ang < 135 && dist < sightR) { senses++; by = 'sight'; }
        // hearing: the radius your noise carries, scaled by how keen its ears are
        const hearR = sig.noise * (sp.hearing / 30) * sens * notice;
        if (dist < hearR) { senses++; by = by || 'hear'; }
        // smell: only when the wind carries your scent to it
        if (sp.smell > 0) {
          const ux = -dx / Math.max(dist, 0.1), uz = -dz / Math.max(dist, 0.1); // you → animal
          const cosA = ux * wx + uz * wz;
          let k = wind < 1 ? 0.3 : cosA > Math.cos(Math.PI / 6) ? clamp(0.5 + wind / 4, 0, 2) : cosA > 0 ? 0.3 : 0;
          const smellR = sp.smell * k * sig.scent * notice;
          if (dist < smellR) { senses++; by = 'smell'; }
        }
      }
      // look around now and then (sight ×1.5 for a moment)
      a.headUpT -= adt; a.headUp = Math.max(0, a.headUp - adt);
      if (a.headUpT <= 0) { a.headUp = 1.5; a.headUpT = this.rng.float(5, 15); }

      // ---------- states
      if (now < a.avoidUntil && a.state === 'normal' && dist < 160) this.startFlee(a, P.clone());
      switch (a.state) {
        case 'normal': case 'rest':
          if (senses > 0) {
            if (by === 'smell' || dist < sp.flight * sens || senses >= 2) { this.reactFlee(a, P, dist); }
            else this.startAlert(a, P.clone(), by);
          } else {
            a.stateT -= adt;
            if (a.stateT <= 0) this.pickIdle(a, active);
          }
          break;
        case 'alert': {
          a.speed = 0;
          a.yaw = turnTo(a.yaw, Math.atan2(dx, dz), adt * 4);
          a.stateT -= adt;
          if (dist < sp.flight * sens || (senses > 0 && sig.moving) || senses >= 2 || by === 'smell') this.reactFlee(a, P, dist);
          else if (a.stateT <= 0) { if (this.rng.next() < 0.6) { a.state = 'normal'; a.stateT = 2; } else this.reactFlee(a, P, dist); }
          break;
        }
        case 'flee':
          if (!a.target) { a.state = 'normal'; a.stateT = 2; a.sensitizedUntil = Math.max(a.sensitizedUntil, now + sp.calm / 60); if (sp.burrow && this.rng.next() < 0.6) a.hidden = true; }
          break;
        case 'charge':
          this.updateCharge(a, adt, P, dist);
          break;
        case 'wounded':
          if (!a.target) {
            if (a.wound?.bed) { a.state = 'bedded'; a.speed = 0; }
            else { a.state = 'normal'; a.stateT = 3; }
          }
          break;
        case 'bedded':
          // §22.3: walking up on a bedded wounded animal makes it run again (twice as far); boars may charge
          if (dist < 30 && (senses > 0 || dist < 12)) {
            if (sp.charger && dist < 15 && this.rng.next() < 0.6) this.startCharge(a, P);
            else { this.startFlee(a, P.clone(), 2); a.state = 'wounded'; }
          }
          break;
        default: break;
      }
      // territorial monitor lizard / ambush snake
      if (sp.ambush && a.state !== 'flee') this.ambush(a, dist);
      if (sp.territorial && dist < sp.territorial && a.state !== 'flee') { a.threatT = (a.threatT || 0) + adt; if (a.threatT > 5 && dist < 2 && a.attackCd <= 0) this.attack(a, 'bite'); } else a.threatT = 0;

      this.move(a, adt, t);
      this.animate(a, adt);
    }
  }

  startAlert(a, from, by) {
    if (a.state === 'flee' || a.state === 'charge' || a.state === 'wounded') return;
    a.state = 'alert'; a.alertBy = by; a.threat = from;
    a.stateT = this.rng.float(3, 8);
    a.target = null;
    // goats: the lookout bleats and the herd looks up within a second
    if (a.sp.lookout) for (const b of this.animals) if (b !== a && b.herd === a.herd && b.state === 'normal') { b.state = 'alert'; b.stateT = this.rng.float(3, 8); b.threat = from; }
  }

  /** flee, or for a boar close by: maybe charge (§8.4: 10 m, 40 %) */
  reactFlee(a, P, dist) {
    if (a.sp.charger && dist < 10 && this.rng.next() < 0.4 && !this.fireScares(a)) { this.startCharge(a, P); return; }
    this.startFlee(a, P.clone());
    this.alarmHerd(a);
  }

  fireScares(a) {
    if (!a.sp.afraidOfFire) return false;
    if (this.game.sys.player?.torchLit) return true;
    const f = this.game.sys.player?.fireNear;
    return !!(f && this.game.sys.player.nearFire < 8);
  }

  startFlee(a, from, distMul = 1) {
    const sp = a.sp;
    a.state = a.wound ? 'wounded' : 'flee';
    a.hidden = false;
    const ax = a.pos.x - from.x, az = a.pos.z - from.z, L = Math.hypot(ax, az) || 1;
    let fx = ax / L, fz = az / L;
    let dist = randIn(this.rng, sp.fleeDist) * distMul;
    if (a.wound) {
      // wounded: run the distance of the wound (§22.3)
      const w = a.wound;
      dist = w.run ? w.run * distMul : dist;
    }
    // goats run uphill (toward the peak), boars deeper into the jungle
    const L2 = this.game.world.layout;
    if (sp.climbs) { const px = L2.peak.x - a.pos.x, pz = L2.peak.z - a.pos.z, pl = Math.hypot(px, pz) || 1; fx = fx * 0.5 + (px / pl) * 0.5; fz = fz * 0.5 + (pz / pl) * 0.5; }
    const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    dist = Math.min(dist, 260);
    a.target = { x: a.pos.x + fx * dist + this.rng.float(-10, 10), z: a.pos.z + fz * dist + this.rng.float(-10, 10) };
    a.ran = 0;
    if (sp.flies) a.flying = true;
    if (sp.flutter) a.flutterT = 0.8;
    a.herd.center.set(a.target.x, 0, a.target.z);
  }

  startCharge(a, P) {
    a.state = 'charge';
    const dx = P.x - a.pos.x, dz = P.z - a.pos.z, L = Math.hypot(dx, dz) || 1;
    a.chargeDir = { x: dx / L, z: dz / L };
    a.chargeLeft = 15 + L;
    a.yaw = Math.atan2(dx, dz);
    this.game.bus.emit('toast', { text: `${a.sp.name}が 突進して くる！ 横に よけろ！`, kind: 'danger' });
    this.game.sys.sfx?.play('danger');
    this.game.sys.sfx?.play(a.sp.sound || 'boar', { volume: 1 });
  }

  updateCharge(a, dt, P, dist) {
    const sp = a.sp;
    a.speed = sp.run;
    a.target = { x: a.pos.x + a.chargeDir.x * 5, z: a.pos.z + a.chargeDir.z * 5 };
    a.chargeLeft -= sp.run * dt;
    if (dist < 1.3 && a.attackCd <= 0) { this.attack(a, 'charge'); a.attackCd = 2; a.chargeLeft = Math.min(a.chargeLeft, 3); }
    if (a.chargeLeft <= 0) {
      a.chargeDir = null;
      if (this.rng.next() < 0.7 || a.wound) this.startFlee(a, P.clone());
      else { a.state = 'alert'; a.stateT = 3; }
    }
  }

  /** an animal hurts the player */
  attack(a, how) {
    const sp = a.sp;
    const [lo, hi] = sp.damage || [5, 10];
    const dmg = (lo + (hi - lo) * this.rng.next()) * (this.game.diff?.animalDmg ?? 1);
    this.game.bus.emit('animal:attack', { kind: a.kind, name: sp.name, how, damage: dmg, venom: !!sp.venom, bite: sp.bite ?? (how === 'bite' ? 0.25 : 0), fracture: how === 'charge' && this.rng.next() < 0.1 });
  }

  ambush(a, dist) {
    // a viper bites when you stand within 1.5 m for 2 s (§8.5); it hisses first if you notice
    if (dist < 1.5) {
      a.closeT = (a.closeT || 0) + 1 / 60;
      if (a.closeT > 0.2 && !a.hissed) { a.hissed = true; this.game.sys.sfx?.play('snake_hiss'); this.game.bus.emit('subtitle', { who: '', text: '（シューッ…）', final: true }); }
      if (a.closeT > 2 && a.attackCd <= 0) { a.attackCd = 6; this.attack(a, 'bite'); }
    } else { a.closeT = 0; a.hissed = false; }
  }

  pickIdle(a, active) {
    const sp = a.sp, r = this.rng;
    if (!active) { a.state = 'rest'; a.stateT = r.float(30, 90); a.target = null; a.hidden = !!sp.burrow; return; }
    a.state = 'normal'; a.hidden = false;
    if (a.lookout || r.next() < 0.5) { a.stateT = r.float(4, 12); a.target = null; a.grazing = !a.lookout; return; }
    a.grazing = false;
    a.stateT = r.float(6, 15);
    const c = a.herd.center;
    const ang = r.float(0, Math.PI * 2), rad = r.float(3, sp.flies ? 25 : 14);
    a.target = { x: c.x + Math.cos(ang) * rad, z: c.z + Math.sin(ang) * rad };
    if (r.next() < 0.15) { c.x += r.float(-15, 15); c.z += r.float(-15, 15); }
  }

  alarmHerd(a) {
    for (const b of this.animals) {
      if (b === a || b.herd !== a.herd || !b.alive || b.state === 'flee' || b.state === 'wounded' || b.state === 'charge') continue;
      if (b.pos.distanceTo(a.pos) < 40) { b.threat = a.threat; this.startFlee(b, a.threat || this.game.player.pos); }
    }
  }

  move(a, dt, t) {
    const sp = a.sp;
    let want = 0;
    if (a.state === 'normal' && a.target) want = sp.walk;
    if (a.state === 'flee') want = sp.run;
    if (a.state === 'wounded') want = sp.run * (a.wound?.slow ?? 1) * 0.85;
    if (a.state === 'charge') want = sp.run;
    if (a.target && want > 0) {
      const dx = a.target.x - a.pos.x, dz = a.target.z - a.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.8) { a.target = null; a.flying = false; }
      else {
        a.yaw = turnTo(a.yaw, Math.atan2(dx, dz), dt * (a.state === 'normal' ? 3 : 8));
        a.speed += (want - a.speed) * (1 - Math.exp(-5 * dt));
        const step = a.speed * dt;
        const nx = a.pos.x + Math.sin(a.yaw) * step, nz = a.pos.z + Math.cos(a.yaw) * step;
        const okLand = t.isLand(nx, nz, this.game.player.seaLevel + 0.1) || sp.swims || a.flying || a.kind === 'crab';
        const climb = (t.heightAt(nx, nz) - t.heightAt(a.pos.x, a.pos.z)) / Math.max(1e-3, step);
        const steep = climb > (sp.climbs ? 3 : 1.2);
        if (okLand && !steep && Math.hypot(nx, nz) < 320) { a.pos.x = nx; a.pos.z = nz; a.ran += step; if (a.wound) a.wound.run = Math.max(0, (a.wound.run ?? 0) - step); }
        else a.target = { x: a.pos.x + this.rng.float(-25, 25), z: a.pos.z + this.rng.float(-25, 25) };
      }
    } else a.speed *= Math.exp(-6 * dt);
    const ground = t.heightAt(a.pos.x, a.pos.z);
    if (sp.flies) {
      const targetAlt = a.flying ? 12 + Math.sin(a.phase * 0.3) * 4 : 0;
      a.alt += (targetAlt - a.alt) * (1 - Math.exp(-1.2 * dt));
      if (a.flying && a.speed < 1) a.speed = sp.run;
    } else if (sp.flutter && a.flutterT > 0) { a.flutterT -= dt; a.alt = Math.sin((1 - a.flutterT / 0.8) * Math.PI) * 1.4; }
    else a.alt = 0;
    a.pos.y = ground + a.alt;
    a.mesh.position.copy(a.pos);
    a.mesh.rotation.y = a.yaw;
    a.mesh.rotation.z = a.state === 'bedded' ? 1.2 : 0;
  }

  animate(a, dt) {
    const u = a.mesh.userData, sp = a.sp;
    const cyc = a.phase * (2 + a.speed * 3.2);
    if (u.legs) { const amp = Math.min(0.9, a.speed * 0.25); u.legs.forEach((l, i) => { l.rotation.x = Math.sin(cyc + (i % 2 ? Math.PI : 0) + (i >= 2 ? Math.PI : 0)) * amp; }); }
    if (u.head) { const k = a.grazing && a.state === 'normal' && !a.target ? 0.7 + Math.sin(a.phase * 2) * 0.1 : a.state === 'alert' || a.headUp > 0 ? -0.25 : 0; u.head.rotation.x += (k - u.head.rotation.x) * (1 - Math.exp(-4 * dt)); }
    if (u.wings) { const flap = a.alt > 0.3 ? Math.sin(a.phase * (a.flying ? 9 : 14)) * 0.8 : -0.1; u.wings[0].rotation.z = flap; u.wings[1].rotation.z = -flap; }
    if (u.seg) u.seg.forEach((m, i) => { m.position.x = Math.sin(a.phase * (sp.ambush ? 1 : 6) * (a.speed > 0.1 ? 1 : 0.2) - i * 0.7) * (a.kind === 'viper' ? 0.05 : 0.025) * Math.min(i, 3); });
  }

  dropBlood(x, z) {
    const m = this.bloodMesh, n = 500;
    // §25.5: in ひかえめ / 省略 the trail is trampled grass and scuffs, not red (same information for tracking)
    const mild = (this.game.settings?.butcherView || 'mild') !== 'normal';
    m.material.color.set(mild ? '#5e5a3a' : '#6d0f0f'); m.material.opacity = mild ? 0.7 : 0.85;
    const y = this.game.world.terrain.heightAt(x, z) + 0.02;
    const i = this.blood.length < n ? this.blood.length : (this.bloodIdx = (this.bloodIdx + 1) % n);
    m.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(x + this.rng.float(-0.25, 0.25), y, z + this.rng.float(-0.25, 0.25)), new THREE.Quaternion(), new THREE.Vector3().setScalar(this.rng.float(0.6, 1.7))));
    const rec = { x, z, at: this.game.clock.total };
    if (this.blood.length < n) this.blood.push(rec); else this.blood[i] = rec;
    m.count = this.blood.length;
    m.instanceMatrix.needsUpdate = true;
  }

  /** rain washes the blood away (§22.3: drizzle 30 min, rain 5 min) */
  washBlood() {
    const r = this.game.sys.weather?.rain ?? 0;
    if (r < 0.2 || !this.blood.length) return;
    const life = r > 0.6 ? 5 : 30, now = this.game.clock.total;
    const keep = this.blood.filter((b) => now - b.at < life);
    if (keep.length === this.blood.length) return;
    this.blood = []; this.bloodMesh.count = 0;
    for (const b of keep) this.dropBlood(b.x, b.z);
  }

  // ------------------------------------------------------------------ hits
  /** the hit zones of an animal as world spheres */
  zones(a) {
    const sp = a.sp, s = a.kind === 'boar' || a.kind === 'goat' ? a.scale / sp.size : 1;
    const h = sp.height * (a.kind === 'boar' || a.kind === 'goat' ? a.scale : 1), R = sp.bodyR * s;
    const fwd = new THREE.Vector3(Math.sin(a.yaw), 0, Math.cos(a.yaw)), side = new THREE.Vector3(fwd.z, 0, -fwd.x);
    const c = a.pos.clone().add(new THREE.Vector3(0, h * 0.62 + (a.state === 'bedded' ? -h * 0.4 : 0), 0));
    if (!sp.parts) return [{ part: 'body', p: c, r: R }];
    const P = sp.parts, up = (k) => new THREE.Vector3(0, h * k, 0);
    const out = [
      { part: 'head', p: c.clone().addScaledVector(fwd, R * 1.45).add(up(0.12)), r: P.head.r * 1.6 * s },
      { part: 'heart', p: c.clone().addScaledVector(fwd, R * 0.45).add(up(-0.12)), r: P.heart.r * s },
      { part: 'liver', p: c.clone().add(up(-0.03)), r: P.liver.r * s },
      { part: 'belly', p: c.clone().addScaledVector(fwd, -R * 0.5).add(up(-0.08)), r: P.belly.r * s },
      { part: 'muscle', p: c.clone().addScaledVector(fwd, R * 0.6).add(up(0.12)), r: P.muscle.r * s },
      { part: 'muscle', p: c.clone().addScaledVector(fwd, -R * 0.75).add(up(0.08)), r: P.muscle.r * s },
    ];
    for (const fz of [0.6, -0.6]) for (const sx of [0.5, -0.5]) out.push({ part: 'leg', p: a.pos.clone().addScaledVector(fwd, R * fz).addScaledVector(side, R * sx).add(up(0.3)), r: P.leg.r * 1.5 * s });
    return out;
  }

  /** segment A→B (projectile step or melee reach) against every animal → { animal, part, point, t } | null */
  hitTest(A, B, pad = 0) {
    let best = null;
    for (const a of this.animals) {
      if (!a.alive || a.hidden) continue;
      if (a.pos.distanceTo(A) > A.distanceTo(B) + 4) continue;
      for (const z of this.zones(a)) {
        const r = segPoint(A, B, z.p);
        if (r.d < z.r + pad && (!best || r.t < best.t - 1e-4 || (Math.abs(r.t - best.t) < 0.02 && (z.part === 'heart' || z.part === 'head')))) best = { animal: a, part: z.part, point: r.q, t: r.t };
      }
    }
    return best;
  }

  /** a wary animal ducks the arrow if it hears the string first (§22.2) */
  dodges(a, flightTime) {
    if (!(a.kind === 'goat' || a.sp.flies)) return false;
    const p = a.state === 'alert' ? (flightTime >= 0.35 ? 0.4 : 0.15) : 0.1;
    return this.rng.next() < p;
  }

  /**
   * weapon hit. weapon: { power, kind: 'arrow'|'bullet'|'spear'|'melee'|'stone', name }
   * returns { killed, part, dmg }
   */
  damage(hit, weapon) {
    const a = hit.animal, sp = a.sp;
    const part = hit.part;
    const now = this.game.clock.total;
    let dmg;
    if (!sp.parts) {
      dmg = weapon.power * (0.85 + 0.3 * this.rng.next());
      a.hp -= dmg;
    } else {
      const P = sp.parts[part] || sp.parts.muscle;
      let mul = P.mul;
      if (part === 'muscle' && P.arrowMul && weapon.kind === 'arrow') mul *= P.arrowMul;
      // arrows and blades kill by bleeding: the instant share of a body hit is half; the head ×4 is direct
      dmg = weapon.power * mul * (part === 'head' ? 1 : 0.5) * (0.85 + 0.3 * this.rng.next());
      a.hp -= dmg;
      if (a.hp > 0) {
        const w = a.wound && a.wound.severity > (P.mul || 0) ? a.wound : { part, severity: P.mul, drop: P.drop, slow: P.slow, bed: P.bed, dirty: P.dirty, stopAfter: P.stopAfter };
        let fatal = P.fatal;
        if (!fatal && P.chanceFatal && this.rng.next() < P.chanceFatal) fatal = { gameHours: [3, 8] };
        if (Array.isArray(fatal)) w.fatalReal = Math.min(w.fatalReal ?? Infinity, randIn(this.rng, fatal));
        else if (fatal?.gameMin) w.fatalGame = Math.min(w.fatalGame ?? Infinity, now + randIn(this.rng, fatal.gameMin));
        else if (fatal?.gameHours) w.fatalGame = Math.min(w.fatalGame ?? Infinity, now + randIn(this.rng, fatal.gameHours) * 60);
        w.run = part === 'heart' ? randIn(this.rng, [20, 80]) : part === 'liver' ? randIn(this.rng, [100, 250]) : part === 'belly' ? randIn(this.rng, [300, 600]) : randIn(this.rng, [80, 200]);
        a.wound = w;
        if (weapon.kind === 'bullet') a.meatLoss = (a.meatLoss || 0) + 1;
      }
    }
    this.dropBlood(hit.point.x, hit.point.z);
    this.game.sys.sfx?.play('hit_flesh');
    if (a.hp <= 0) { this.kill(a, part); return { killed: true, part, dmg }; }
    this.game.sys.sfx?.play('animal_hurt', { pitch: sp.mass > 20 ? 0.7 : 1.6 });
    a.threat = this.game.player.pos.clone();
    const d = a.pos.distanceTo(this.game.player.pos);
    if (sp.charger && d < 8 && this.rng.next() < 0.6) this.startCharge(a, this.game.player.pos);
    else { this.startFlee(a, this.game.player.pos.clone()); a.state = 'wounded'; }
    this.alarmHerd(a);
    return { killed: false, part, dmg };
  }

  kill(a, how) {
    a.state = 'dead'; a.speed = 0; a.hidden = false; a.alt = 0; a.target = null;
    a.deathAt = this.game.clock.total;
    a.pos.y = this.game.world.terrain.heightAt(a.pos.x, a.pos.z);
    a.mesh.position.copy(a.pos).add(new THREE.Vector3(0, a.sp.bodyR * 0.3, 0));
    a.mesh.rotation.z = Math.PI / 2;
    a.mesh.visible = true;
    this.killed[a.kind] = (this.killed[a.kind] || 0) + 1;
    a.node = this.game.world.nodes.add({ kind: 'carcass', x: a.pos.x, y: a.pos.y, z: a.pos.z, r: a.sp.bodyR + 0.3, object3d: a.mesh, priority: 2, pickY: 0.3,
      data: { species: a.kind, animal: a, how, diedAt: a.deathAt, dirty: a.wound?.dirty, meatLoss: a.meatLoss || 0 } });
    this.game.bus.emit('animal:killed', { kind: a.kind, name: a.sp.name, how, x: a.pos.x, z: a.pos.z });
  }

  /** catch a small animal by hand; score 0–1 from the reaction minigame (§9.3) */
  tryCatch(a, score = 0.6) {
    const need = a.sp.catchable ?? 0.5;
    const s = score - (a.state === 'alert' ? 0.15 : 0) - (a.speed > 1 ? 0.25 : 0) + (this.game.player.crouch ? 0.1 : 0);
    if (s >= need) { this.kill(a, 'caught'); return { ok: true }; }
    const pinch = a.sp.pinch && this.rng.next() < a.sp.pinch;
    this.startFlee(a, this.game.player.pos.clone());
    return { ok: false, pinch };
  }

  /** the nearest living, visible animal in front within reach */
  nearestLiving(pos, dir, reach = 1.8, filter = null) {
    let best = null, bd = reach;
    for (const a of this.animals) {
      if (!a.alive || a.hidden || (filter && !filter(a))) continue;
      const dx = a.pos.x - pos.x, dz = a.pos.z - pos.z, d = Math.hypot(dx, dz);
      if (d > bd) continue;
      if ((dx * dir.x + dz * dir.z) / Math.max(d, 0.01) < 0.5 && d > 0.7) continue;
      best = a; bd = d;
    }
    return best;
  }

  removeCarcass(a) {
    if (a.node) this.game.world.nodes.remove(a.node);
    this.group.remove(a.mesh);
    this.animals = this.animals.filter((x) => x !== a);
  }

  /** each new day: populations recover slowly (§8.4), old carcasses disappear, wounded escapees may die */
  onNewDay() {
    const now = this.game.clock.total;
    for (const a of [...this.animals]) if (a.state === 'dead' && now - a.deathAt > 36 * 60) this.removeCarcass(a);
    for (const [kind, sp] of Object.entries(SPECIES)) {
      const alive = this.animals.filter((a) => a.kind === kind && a.alive).length;
      const cap = Math.round(sp.count * (this.game.diff?.resources ?? 1));
      const add = kind === 'goat' ? (this.rng.next() < 1 / 6 ? 1 : 0) : kind === 'boar' ? (this.rng.next() < 1 / 8 ? 1 : 0) : Math.ceil(cap * 0.2);
      if (alive < cap && add) this.populate(kind, Math.min(cap - alive, add), this.game.player.pos);
    }
  }

  serialize() { return { killed: this.killed }; }
  deserialize(d) { this.killed = d.killed || {}; }
  debug() {
    const by = {};
    for (const a of this.animals) by[a.kind] = (by[a.kind] || 0) + (a.alive ? 1 : 0);
    return { alive: by, states: this.animals.reduce((o, a) => { o[a.state] = (o[a.state] || 0) + 1; return o; }, {}) };
  }
}
