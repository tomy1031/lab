// race/kart.js — arcade kart physics on the track frame (speed, steering, drift + mini-turbo, hops and
// jumps, walls, off-road) and the visual rig (lean, drift angle, spin, wheels, sparks and flames).
import * as THREE from 'three';
import { clamp, damp, dampAngle, wrapAngle, hsl, linearOut } from '../engine/util.js';
import { buildKart, statMultipliers } from './characters.js';

export const SPEED_CLASSES = {
  easy: { id: 'easy', label: 'やさしい', max: 21, accel: 15, ai: [0.86, 0.93], aggr: 0.5 },
  normal: { id: 'normal', label: 'ふつう', max: 25, accel: 17, ai: [0.92, 0.98], aggr: 0.8 },
  hard: { id: 'hard', label: 'むずかしい', max: 29, accel: 19, ai: [0.97, 1.02], aggr: 1 },
};

const DRIFT_COLORS = [new THREE.Color('#ffffff'), new THREE.Color('#4fb8ff'), new THREE.Color('#ffa31f'), new THREE.Color('#ff4fe6')];
const FLAME = [new THREE.Color('#fff2a8'), new THREE.Color('#ffb72e'), new THREE.Color('#ff5a1f')];
const _f = new THREE.Vector3(), _x = new THREE.Vector3(), _n = new THREE.Vector3(), _mat = new THREE.Matrix4(), _w = new THREE.Vector3();
const UPV = new THREE.Vector3(0, 1, 0);

export class Kart {
  // vrSeat: the player rides in this kart in VR (1st person) — no fixed wheel, and the cockpit never
  // spins, flips or blinks around them
  constructor(char, { index = 0, isHuman = false, cls = SPEED_CLASSES.normal, vrSeat = false } = {}) {
    this.char = char;
    this.index = index;
    this.isHuman = isHuman;
    this.stats = statMultipliers(char);
    this.vrSeat = vrSeat;
    this.rig = buildKart(char, { noWheel: vrSeat });
    this.maxSpeed = cls.max * this.stats.speed;
    this.accel = cls.accel * this.stats.accel;
    this.turn = 1.95 * this.stats.handling;
    this.weight = this.stats.weight;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.heading = 0; this.speed = 0; this.vy = 0; this.air = false;
    this.idx = 0; this.prog = 0; this.raceDist = 0;
    this.lap = 0; this.finished = false; this.finishTime = 0; this.place = 0;
    this.drift = { active: false, dir: 0, charge: 0, level: 0 };
    this.boost = 0; this.spin = 0; this.shield = 0; this.comet = 0; this.invuln = 0;
    this.item = null; this.itemCount = 0; this.roulette = 0;
    this.loc = {};
    this.offroad = false;
    this.rubber = 1;
    this.steer = 0; this.throttle = 0;
    this.lastDriftBtn = false;
    this.padJump = false; this.trick = 0;
    this.wrongWay = 0; this.stuckT = 0; this.stuckRef = 0;
    this.normal = new THREE.Vector3(0, 1, 0);
    this.visYaw = 0; this.lean = 0; this.squash = 0; this.spinAngle = 0; this.trickAngle = 0;
    this.fxT = 0;
    this.events = [];
    this.shieldMesh = null; this.cometMesh = null;
    this.camHide = false; // set by the race when the camera is inside this kart
  }

  // put the kart on the track at progress p (sample units) and lateral offset d, facing forward
  placeOnTrack(track, p, d) {
    track.pointAt(p, d, this.pos);
    this.heading = track.headingAt(p);
    this.vel.set(0, 0, 0);
    this.speed = 0; this.vy = 0; this.air = false;
    const L = track.locate(this.pos, -1, this.loc);
    this.idx = L.i; this.prog = L.prog;
    this.raceDist = L.prog > track.N / 2 ? L.prog - track.N : L.prog;
    this.normal.set(L.ux, L.uy, L.uz);
    this.syncVisual(0, track);
  }

  giveBoost(t) { this.boost = Math.max(this.boost, t); this.events.push('boost'); }

  // hit by an item / trap. returns true if it hurt
  hit(kind = 'spin') {
    if (this.comet > 0 || this.invuln > 0) return false;
    if (this.shield > 0) { this.shield = 0; this.events.push('shieldpop'); this.invuln = 0.6; return false; }
    this.spin = kind === 'big' ? 1.6 : 1.15;
    this.speed *= 0.3;
    this.drift.active = false; this.drift.level = 0;
    this.boost = 0;
    this.invuln = this.spin + 0.4;
    this.events.push('hit');
    return true;
  }

  topSpeed() {
    let top = this.maxSpeed * this.rubber;
    if (this.offroad && this.boost <= 0 && this.comet <= 0) top *= 0.55;
    if (this.boost > 0) top = this.maxSpeed * this.rubber * 1.32;
    if (this.comet > 0) top = Math.max(top, this.maxSpeed * this.rubber * 1.2);
    return top;
  }

  // one physics step. ctl = {steer, throttle, brake, drift}
  step(dt, ctl, race) {
    const track = race.track;
    let steer = clamp(ctl.steer || 0, -1, 1), thr = clamp(ctl.throttle || 0, 0, 1), brk = clamp(ctl.brake || 0, 0, 1);
    const btn = !!ctl.drift;
    if (this.spin > 0) { this.spin -= dt; steer = 0; thr = 0; brk = 0; }
    this.boost = Math.max(0, this.boost - dt);
    this.shield = Math.max(0, this.shield - dt);
    this.comet = Math.max(0, this.comet - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.steer = steer; this.throttle = thr;

    // ---- speed
    const top = this.topSpeed();
    const sp01 = clamp(this.speed / this.maxSpeed, 0, 1);
    const acc = this.accel * (1 - 0.5 * sp01) + (this.boost > 0 ? 32 : 0) + (this.comet > 0 ? 12 : 0);
    if (brk > 0.1 && this.boost <= 0) {
      if (this.speed > 0.5) this.speed -= 30 * brk * dt;
      else this.speed = Math.max(this.speed - 12 * brk * dt, -8);
    } else if (thr > 0.05 || this.boost > 0) {
      if (this.speed < top) this.speed = Math.min(top, this.speed + acc * Math.max(thr, this.boost > 0 ? 1 : 0) * dt * (this.speed < 0 ? 2.5 : 1));
    } else {
      const dec = 5 * dt;
      this.speed = Math.abs(this.speed) < dec ? 0 : this.speed - Math.sign(this.speed) * dec;
    }
    if (this.speed > top) this.speed = Math.max(top, this.speed - (this.offroad && this.boost <= 0 ? 24 : 8) * dt);

    // ---- drift (hold the drift button while steering at speed; release for a mini-turbo)
    if (btn && !this.lastDriftBtn && !this.air && this.spin <= 0) {
      this.vy = 4.2; this.air = true; this.events.push('hop');
      if (this.padJump) this.trick = 1;
    }
    if (btn && this.air && this.padJump && !this.lastDriftBtn) this.trick = 1;
    if (btn && !this.drift.active && Math.abs(steer) > 0.35 && this.speed > 11 && this.spin <= 0) {
      this.drift.active = true; this.drift.dir = Math.sign(steer); this.drift.charge = 0; this.drift.level = 0;
    }
    if (this.drift.active) {
      if (!btn || this.speed < 7 || this.spin > 0) {
        const lv = this.drift.level;
        this.drift.active = false; this.drift.level = 0;
        if (lv >= 1 && this.spin <= 0) { this.giveBoost([0, 0.55, 0.95, 1.4][lv]); this.events.push('miniturbo' + lv); }
      } else {
        this.drift.charge += dt * (0.7 + 0.6 * clamp(steer * this.drift.dir, 0, 1)) * (this.offroad ? 0.4 : 1);
        const lv = this.drift.charge >= 2.4 ? 3 : this.drift.charge >= 1.45 ? 2 : this.drift.charge >= 0.7 ? 1 : 0;
        if (lv > this.drift.level) this.events.push('driftlevel' + lv);
        this.drift.level = lv;
      }
    }
    this.lastDriftBtn = btn;

    // ---- steering
    const spdAbs = Math.abs(this.speed);
    let yaw;
    if (this.drift.active) {
      yaw = this.drift.dir * this.turn * (0.8 + 0.42 * steer * this.drift.dir);
    } else {
      yaw = steer * this.turn * clamp(spdAbs / 6, 0, 1) * (1 - 0.26 * clamp(spdAbs / this.maxSpeed, 0, 1.2));
    }
    if (this.speed < 0) yaw = -yaw * 0.8;
    if (this.air) yaw *= 0.7;
    this.heading = wrapAngle(this.heading - yaw * dt);

    // ---- velocity (grip pulls the velocity toward the facing direction; low grip = slide)
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    let grip = this.drift.active ? 3.4 : 11;
    if (this.air) grip = 1.2;
    if (this.spin > 0) grip = 1.4;
    const k = 1 - Math.exp(-grip * dt);
    this.vel.x += (fx * this.speed - this.vel.x) * k;
    this.vel.z += (fz * this.speed - this.vel.z) * k;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    // ---- ground
    const L = track.locate(this.pos, this.idx, this.loc);
    this.idx = L.i;
    if (this.air) {
      this.vy -= 34 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= L.y && this.vy <= 0) {
        this.pos.y = L.y;
        this.air = false;
        this.squash = Math.min(0.25, -this.vy * 0.02);
        if (this.padJump) {
          this.giveBoost(this.trick ? 0.9 : 0.35);
          if (this.trick) this.events.push('trick');
          this.padJump = false; this.trick = 0;
        }
        this.vy = 0;
      }
    } else {
      this.pos.y = L.y;
    }

    // ---- walls
    const lim = L.wall - 0.95;
    if (Math.abs(L.d) > lim) {
      const s = Math.sign(L.d), over = Math.abs(L.d) - lim;
      this.pos.x -= L.rx * s * over; this.pos.z -= L.rz * s * over;
      const vn = (this.vel.x * L.rx + this.vel.z * L.rz) * s;
      if (vn > 0) {
        this.vel.x -= L.rx * s * vn * 1.5; this.vel.z -= L.rz * s * vn * 1.5;
        if (vn > 6) { this.speed *= 0.72; this.events.push('wall'); this.wallFx = 0.3; }
        else this.speed *= 1 - 1.2 * dt;
      }
      // nose pointing into the wall: turn it back along the road (forgiving for gesture steering)
      const into = (fx * L.rx + fz * L.rz) * s;
      const fwdDot = fx * L.tx + fz * L.tz;
      if (into > 0 && fwdDot > -0.2 && this.spin <= 0) this.heading = dampAngle(this.heading, L.heading, 3.5, dt);
    }

    // ---- surface state, progress, wrong way
    this.offroad = !this.air && Math.abs(L.d) > L.hw + track.curb;
    const N = track.N;
    let dp = L.prog - this.prog;
    if (dp < -N / 2) dp += N; else if (dp > N / 2) dp -= N;
    this.raceDist += dp;
    this.prog = L.prog;
    const along = fx * L.tx + fz * L.tz;
    this.wrongWay = along < -0.35 && this.speed > 3 ? this.wrongWay + dt : 0;
  }

  // respawn at the centre of the road, a little behind where we are
  respawn(track) {
    const p = this.prog - 3;
    track.pointAt(p, 0, this.pos);
    this.heading = track.headingAt(p);
    this.vel.set(0, 0, 0); this.speed = 0; this.vy = 0; this.air = false;
    this.drift.active = false; this.spin = 0;
    const L = track.locate(this.pos, -1, this.loc);
    let dp = L.prog - this.prog;
    if (dp < -track.N / 2) dp += track.N; else if (dp > track.N / 2) dp -= track.N;
    this.raceDist += dp; this.prog = L.prog; this.idx = L.i;
    this.invuln = 2;
    this.respawns = (this.respawns || 0) + 1;
    this.events.push('respawn');
  }

  // ----------------------------------------------------------------------------------------------
  syncVisual(dt, track) {
    const rig = this.rig, L = this.loc;
    rig.root.position.copy(this.pos);
    if (L.ux !== undefined) {
      _n.set(L.ux, L.uy, L.uz);
      if (this.air) _n.lerp(UPV, 0.5);
      if (dt > 0) this.normal.lerp(_n, 1 - Math.exp(-12 * dt)).normalize(); else this.normal.copy(_n);
    }
    _f.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    _f.addScaledVector(this.normal, -_f.dot(this.normal)).normalize();
    _x.crossVectors(this.normal, _f).normalize();
    _mat.makeBasis(_x, this.normal, _f);
    rig.root.quaternion.setFromRotationMatrix(_mat);
    if (dt <= 0) return;

    const dTarget = this.drift.active && !this.vrSeat ? -this.drift.dir * 0.42 : 0;
    this.visYaw = damp(this.visYaw, dTarget, 8, dt);
    if (this.spin > 0 && !this.vrSeat) this.spinAngle += dt * 13; else this.spinAngle = damp(this.spinAngle, Math.round(this.spinAngle / (Math.PI * 2)) * Math.PI * 2, 10, dt);
    rig.visual.rotation.y = this.visYaw + this.spinAngle;
    if (this.trick && this.air && !this.vrSeat) this.trickAngle += dt * 14; else this.trickAngle = damp(this.trickAngle, Math.round(this.trickAngle / (Math.PI * 2)) * Math.PI * 2, 12, dt);
    rig.visual.rotation.z = this.trickAngle - this.steer * 0.04 * clamp(this.speed / 10, 0, 1);
    this.lean = damp(this.lean, this.steer * 0.28 + (this.drift.active ? this.drift.dir * 0.12 : 0), 8, dt);
    rig.driver.rotation.z = this.lean;
    rig.driver.rotation.x = damp(rig.driver.rotation.x, this.boost > 0 ? -0.12 : 0, 6, dt);
    this.squash = damp(this.squash, 0, 9, dt);
    rig.visual.scale.set(1 + this.squash * 0.5, 1 - this.squash, 1 + this.squash * 0.3);
    const spinRate = (this.speed * dt) / 0.42;
    for (const w of rig.wheels) w.rotation.x += spinRate;
    for (const p of rig.pivots) p.rotation.y = damp(p.rotation.y, -this.steer * 0.45, 12, dt);
    // blob shadow stays on the ground while airborne
    const h = Math.max(0, this.pos.y - (L.y ?? this.pos.y));
    rig.blob.position.y = -h + 0.06;
    const bs = 1 / (1 + h * 0.25);
    rig.blob.scale.set(bs, 1, bs);
    this.blinkOn = this.invuln > 0 && this.spin <= 0 && this.shield <= 0 ? Math.floor(this.invuln * 14) % 2 === 0 : true;
    if (this.vrSeat) this.blinkOn = true;
    rig.visual.visible = this.blinkOn && !this.camHide;

    // shield bubble / comet aura
    if (this.shield > 0 && !this.shieldMesh) this.shieldMesh = makeShield(rig.root);
    if (this.shieldMesh) {
      this.shieldMesh.visible = this.shield > 0;
      if (this.shield > 0) { this.shieldMesh.rotation.y += dt; this.shieldMesh.material.uniforms.t.value += dt; }
    }
    if (this.comet > 0 && !this.cometMesh) this.cometMesh = makeComet(rig.root);
    if (this.cometMesh) {
      this.cometMesh.visible = this.comet > 0;
      if (this.comet > 0) this.cometMesh.material.color.copy(hsl(performance.now() / 600, 1, 0.6)).multiplyScalar(1.6);
    }
  }

  // particles: drift sparks, boost flames, dust, comet sparkle
  fx(dt, parts, dust) {
    this.fxT += dt;
    if (this.fxT < 1 / 50) return;
    const step = this.fxT; this.fxT = 0;
    const root = this.rig.root;
    // particles inherit most of the kart's velocity so they trail just behind it instead of shooting
    // backwards into the chase camera
    const vx = this.vel.x, vz = this.vel.z;
    if (this.drift.active && !this.air) {
      const c = DRIFT_COLORS[this.drift.level];
      for (const wpos of this.rig.rearWheels) {
        _w.copy(wpos); _w.x *= 1.05; root.localToWorld(_w);
        const n = this.drift.level ? 3 : 1;
        for (let i = 0; i < n; i++) parts.add.emit(_w.x, _w.y + 0.15, _w.z, vx * 0.6 + (Math.random() - 0.5) * 5, 2 + Math.random() * 4, vz * 0.6 + (Math.random() - 0.5) * 5, c,
          this.drift.level ? 0.38 : 0.25, 0.28, { gravity: 18, drag: 0.8 });
      }
    }
    if (this.boost > 0 || this.comet > 0) {
      for (const e of this.rig.exhausts) {
        _w.copy(e); root.localToWorld(_w);
        for (let i = 0; i < 2; i++) {
          const c = FLAME[(Math.random() * 3) | 0];
          parts.add.emit(_w.x, _w.y, _w.z, vx * 0.72 + (Math.random() - 0.5) * 2, 0.6 + Math.random(), vz * 0.72 + (Math.random() - 0.5) * 2, c, 0.6, 0.17, { drag: 0.6, grow: -0.6 });
        }
      }
    }
    if (this.comet > 0) {
      const c = hsl(Math.random(), 1, 0.65);
      parts.add.emit(this.pos.x + (Math.random() - 0.5) * 2, this.pos.y + 0.5 + Math.random() * 1.5, this.pos.z + (Math.random() - 0.5) * 2, vx * 0.7, 1, vz * 0.7, c, 0.45, 0.6, { drag: 0.3 });
    }
    if (this.offroad && Math.abs(this.speed) > 4 && dust) {
      for (const wpos of this.rig.rearWheels) {
        _w.copy(wpos); root.localToWorld(_w);
        parts.soft.emit(_w.x, _w.y + 0.2, _w.z, vx * 0.45 + (Math.random() - 0.5) * 2, 1 + Math.random() * 1.5, vz * 0.45 + (Math.random() - 0.5) * 2, dust, 0.9, 0.5, { drag: 0.6, grow: 1.5, alpha: 0.6 });
      }
    }
    if (this.wallFx > 0) {
      this.wallFx -= step;
      for (let i = 0; i < 4; i++) parts.add.emit(this.pos.x, this.pos.y + 0.6, this.pos.z, (Math.random() - 0.5) * 9, 2 + Math.random() * 5, (Math.random() - 0.5) * 9, FLAME[0], 0.3, 0.3, { gravity: 20 });
    }
    if (this.spin > 0) {
      const c = hsl(0.14, 1, 0.7);
      const a = performance.now() / 120;
      parts.add.emit(this.pos.x + Math.cos(a) * 0.9, this.pos.y + 2.6, this.pos.z + Math.sin(a) * 0.9, 0, 0.3, 0, c, 0.5, 0.35);
    }
  }
}

function makeShield(root) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { t: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform float t; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.2); float bands = 0.5 + 0.5*sin(vP.y*6.0 + t*4.0);
        vec3 c = mix(vec3(0.3,0.9,1.0), vec3(0.8,0.5,1.0), bands);
        gl_FragColor = vec4(c * 1.6, f * 0.85 + 0.06); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  linearOut(mat);
  const m = new THREE.Mesh(new THREE.SphereGeometry(1.75, 24, 16), mat);
  m.position.y = 1.0; m.scale.set(1, 0.85, 1.15);
  root.add(m);
  return m;
}
function makeComet(root) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1.6, 20, 14), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  m.position.y = 0.9; m.scale.set(1, 0.8, 1.3);
  root.add(m);
  return m;
}
