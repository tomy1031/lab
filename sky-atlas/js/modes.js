// js/modes.js — the nine ways to fly. Each mode turns the player's input into the rig's velocity (and,
// for the ones you steer like a vehicle, its heading). In VR they read the Quest controllers (positions in
// the play area, triggers, sticks); on a screen, the keyboard / mouse / touch buttons.
//
//   point     スーパーマン      trigger → fly where that hand points
//   float     空中浮遊         slow and calm: sticks, gentle acceleration (the most comfortable)
//   bird      鳥              flap your arms to climb, spread them to glide, tilt to turn
//   squirrel  ムササビ         a wingsuit: arms spread you glide down (≈3:1), dive for speed, pull up to trade it
//   broom     ほうき           ride it: point it with your hand, trigger = speed, the view turns with it
//   glider    グライダー        a sailplane (≈35:1): stick tilts it, circle in thermals under the clouds to climb
//   balloon   気球             burner up, cool down; the wind carries you — it turns with height
//   jetpack   ジェットパック     thrust from your palms against gravity: point down to rise, tilt to go
//   carpet    魔法のじゅうたん    lean your body forward / sideways to fly and turn
import * as THREE from 'three';
import { clamp } from './geo.js';
import { windName } from './air.js';

const UP = new THREE.Vector3(0, 1, 0);
const G = 9.81;
const tmp = new THREE.Vector3();

// ---- helpers ----
const yawOf = (v) => Math.atan2(-v.x, -v.z); // yaw (about +y) of a horizontal direction; 0 = north (-z)
const dirOfYaw = (yaw, out = new THREE.Vector3()) => out.set(-Math.sin(yaw), 0, -Math.cos(yaw));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const approach = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-dt * rate));

// hands in the world: position, ray, + inputs (from XRInput, which is in rig space)
function hand(f, h) {
  const m = f.rig.matrixWorld;
  return {
    on: h.on, trigger: h.trigger, grip: h.grip, stick: h.stick, buttons: h.buttons,
    pos: h.pos.clone().applyMatrix4(m), d: h.ray.d.clone().transformDirection(m), local: h.pos, vel: h.vel || tmp.set(0, 0, 0),
  };
}

// the arms as wings (bird, wingsuit): spread, heading (perpendicular to the line between the hands),
// bank (their height difference) and pitch (their height against the shoulders)
function wings(f, c) {
  const L = c.inp.hands.L, R = c.inp.hands.R;
  if (!L.on || !R.on) return null;
  const span = new THREE.Vector3(R.pos.x - L.pos.x, 0, R.pos.z - L.pos.z);
  const spread = span.length();
  const heading = new THREE.Vector3().crossVectors(UP, span).normalize().applyQuaternion(f.rig.quaternion);
  const bank = Math.atan2(L.pos.y - R.pos.y, Math.max(spread, 0.2)); // left hand higher → bank right
  const rel = (L.pos.y + R.pos.y) / 2 - (c.inp.head.y - 0.32); // above (+) / below (-) the shoulders
  return { L, R, spread, heading, bank, rel };
}

// screen helpers
const scrBank = (s) => s.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']); // +1 = right
const scrPitch = (s) => clamp(s.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']) + s.touch.fwd - s.touch.back, -1, 1); // +1 = W = nose down / forward
const scrAct = (s) => (s.keys.has('Space') || s.keys.has('KeyE') || s.touch.up ? 1 : 0);
const scrAlt = (s) => (s.keys.has('KeyC') || s.keys.has('KeyQ') || s.keys.has('ControlLeft') || s.touch.down ? 1 : 0);
// on a screen the heading modes steer toward where you look: the look offset (camera yaw relative to the
// vehicle) banks you, and shrinks as you turn toward it
function lookSteer(s) { return clamp(-s.yaw * 1.4, -1, 1); }
function turnHeading(f, s, rate, dt) {
  const d = rate * dt;
  f.heading += d;
  // turning toward where you look uses up the look offset (the view stays put); keys turn the view along
  if (s.yaw * d > 0) s.yaw = Math.sign(s.yaw) * Math.max(0, Math.abs(s.yaw) - Math.abs(d));
  f.yawRate = rate;
}

// in VR, the heading modes start facing where you look
function vrHeadingStart(f, c) {
  if (!c.inp) return;
  const e = new THREE.Euler().setFromQuaternion(c.inp.headQuat, 'YXZ');
  f.heading = f.rig.rotation.y + e.y;
}

// ---- the modes ----
export const MODES = {
  point: {
    name: 'スーパーマン', sub: '手を向けてトリガー',
    vr: 'トリガーを引くと、その手の向きへ飛ぶ。両手で引くと速い。左スティックで見ている方へ、右スティックで上下',
    keys: 'W/S 前後・A/D 横・Space/C 上下・Shift 速く・マウスで見回す',
    xr(f, dt, c) {
      const hs = [hand(f, c.inp.hands.L), hand(f, c.inp.hands.R)].filter((h) => h.on && h.trigger >= 0.06);
      const vm = f.vmax(hs.length === 2 ? 2.5 : 1);
      const desired = sticks(f, c, new THREE.Vector3());
      for (const h of hs) desired.addScaledVector(h.d, h.trigger * vm);
      if (desired.length() > vm) desired.setLength(vm);
      if (desired.lengthSq() > 0.01) f.steer(desired, dt); else f.coast(dt);
    },
    screen(f, dt, c) { freeScreen(f, dt, c, 1, 2.2); },
  },

  float: {
    name: '空中浮遊', sub: 'ゆっくり・ふわふわ',
    vr: '左スティックで見ている方へ、右スティックで上下。トリガーで手の向きへ。ゆっくり動くので酔いにくい',
    keys: 'W/S 前後・A/D 横・Space/C 上下・マウスで見回す（ゆっくり）',
    cap: (f) => clamp(4 + f.agl * 0.03, 4, 45) * f.k,
    xr(f, dt, c) {
      const cap = this.cap(f);
      const desired = sticks(f, c, new THREE.Vector3(), cap, Math.min(cap, 3 + f.agl * 0.02));
      for (const h of [c.inp.hands.L, c.inp.hands.R]) if (h.on && h.trigger >= 0.06) desired.addScaledVector(hand(f, h).d, h.trigger * cap * 0.8);
      if (desired.length() > cap) desired.setLength(cap);
      f.steer(desired, dt, 1.0);
      f.info = `最高 ${Math.round(cap * 3.6)} km/h`;
    },
    screen(f, dt, c) { freeScreen(f, dt, c, 0, 1.0, this.cap(f)); f.info = ''; },
  },

  bird: {
    name: '鳥', sub: '腕ではばたく',
    vr: '両腕を広げて滑空。腕を上から下へ振り下ろすと羽ばたいて上昇。傾けて曲がる。腕をたたむと急降下。トリガーで追い風',
    keys: 'Space 羽ばたく・A/D 曲がる・W 急降下 / S 上を向く・マウスの向きにも曲がる',
    land: true, heading: true, brake: false,
    enter(f, c) { vrHeadingStart(f, c); f.st.s = Math.max(10, Math.hypot(f.vel.x, f.vel.z)); f.st.vy = f.vel.y; },
    step(f, dt, { flap, fold, bank, pitch, boost }) {
      const st = f.st, cruise = 13 * f.k * (1 + boost * 2);
      if (fold) { // a falcon's dive
        st.vy = approach(st.vy, -45 * f.k, 0.8, dt);
        st.s = approach(st.s, 30 * f.k, 0.5, dt);
      } else {
        const climbOK = st.s > 7 * f.k ? 1 : 0; // too slow to climb by raising the arms
        st.vy = approach(st.vy, -1.1 - pitch * (pitch > 0 ? 6 : 3 * climbOK), 1.4, dt); // arms lowered → steeper, raised → shallower
        st.vy += flap * 9 * dt * Math.sqrt(f.k); // each downstroke lifts
        st.s = approach(st.s, cruise + flap * 6, 0.35, dt);
        st.s = Math.max(4, st.s + pitch * (pitch > 0 ? 5 : 4) * dt * f.k); // diving gains speed, climbing costs it
      }
      st.vy = clamp(st.vy, -60, 9 * Math.sqrt(f.k));
      return -bank * 1.4 * clamp(st.s / 12, 0.5, 1.3); // turn rate
    },
    xr(f, dt, c) {
      const w = wings(f, c);
      if (!w) { f.coast(dt); return; }
      const open = w.spread > 0.7, fold = w.spread < 0.45;
      // a downstroke: both hands moving down fast while spread
      const vy = (w.L.vel.y + w.R.vel.y) / 2;
      const flap = open ? clamp(-vy - 0.4, 0, 4) : 0;
      if (open) f.heading = yawOf(w.heading);
      const rate = this.step(f, dt, { flap, fold, bank: open ? w.bank : 0, pitch: clamp(-w.rel * 1.5, -0.6, 1), boost: Math.max(w.L.trigger, w.R.trigger) });
      if (open) { f.turn(rate * dt, c.headWorld); f.heading += rate * dt; f.yawRate = rate; }
      dirOfYaw(f.heading, f.vel).multiplyScalar(f.st.s).addScaledVector(UP, f.st.vy);
      f.info = flap > 0.2 ? '羽ばたき！' : fold ? '急降下' : `滑空 ${Math.round(f.st.s * 3.6)} km/h`;
    },
    screen(f, dt, c) {
      const s = c.sin, act = scrAct(s);
      // Space: a flap each press (holding flaps every 0.45 s)
      const st = f.st;
      st.ft = (st.ft || 0) - dt;
      let flap = 0;
      if (act && st.ft <= 0) { st.ft = 0.45; st.burst = 0.3; }
      if (st.burst > 0) { st.burst -= dt; flap = 2.6; }
      const rate = this.step(f, dt, { flap, fold: scrPitch(s) > 0.5 && s.keys.has('ShiftLeft'), bank: clamp(scrBank(s) + lookSteer(s), -1, 1) * 0.6, pitch: scrPitch(s) * 0.8, boost: 0 });
      turnHeading(f, s, rate, dt);
      dirOfYaw(f.heading, f.vel).multiplyScalar(st.s).addScaledVector(UP, st.vy);
      f.info = flap ? '羽ばたき！' : `滑空 ${Math.round(st.s * 3.6)} km/h`;
    },
  },

  squirrel: {
    name: 'ムササビ', sub: '腕を広げて滑空',
    vr: '両腕を広げると滑空（3 m 進むと 1 m 下がる）。腕を下げて急降下で加速、上げて減速。傾けて曲がる。トリガーで上昇気流',
    keys: 'A/D 曲がる・W 急降下 / S 引き起こし・Space 上昇気流・マウスの向きにも曲がる',
    land: true, heading: true, brake: false,
    enter(f, c) { vrHeadingStart(f, c); f.st.V = Math.max(20, f.vel.length()); f.st.gamma = -0.3; },
    // a wingsuit: speed along the path from gravity and drag (best glide ≈ 3:1 at ~45 m/s)
    step(f, dt, { open, aim, bank, up }) {
      const st = f.st;
      let target = open ? clamp(aim, -1.1, 0.3) - 0.32 : -1.35;
      if (open && st.V < 16) target = Math.min(target, -0.7); // too slow: the nose drops
      st.gamma = approach(st.gamma, target, open ? 1.6 : 1.0, dt);
      const kd = open ? 0.00153 : 0.0034;
      st.V += (-G * Math.sin(st.gamma) - kd * st.V * st.V) * dt;
      st.V = clamp(st.V, 4, 95);
      const rate = open ? (-G * Math.tan(clamp(bank, -0.9, 0.9)) / Math.max(st.V, 12)) * 2.2 : 0;
      return rate;
    },
    apply(f, up) {
      const st = f.st;
      dirOfYaw(f.heading, f.vel).multiplyScalar(Math.cos(st.gamma) * st.V).addScaledVector(UP, Math.sin(st.gamma) * st.V);
      const lift = f.air ? f.air.lift(f.rig.position.x, f.rig.position.y, f.rig.position.z, f.groundAtFull) : 0;
      f.vel.y += lift + up * 28 * f.k;
      if (f.onGround) { st.V *= 0.9; f.msg = '着地'; }
      const sink = -Math.sin(st.gamma) * st.V;
      f.info = up ? '上昇気流！' : `${Math.round(st.V * 3.6)} km/h・滑空比 ${sink > 0.5 ? (Math.cos(st.gamma) * st.V / sink).toFixed(1) : '—'}`;
    },
    xr(f, dt, c) {
      const w = wings(f, c);
      const st = f.st;
      const open = !!w && w.spread > 0.75;
      if (open) f.heading = yawOf(w.heading);
      const up = w ? (w.L.trigger > 0.5 && w.R.trigger > 0.5 ? 1 : Math.max(w.L.trigger, w.R.trigger) * 0.5) : 0;
      const rate = this.step(f, dt, { open, aim: w ? w.rel * 1.6 : 0, bank: w ? w.bank : 0 });
      if (rate) { f.turn(rate * dt, c.headWorld); f.heading += rate * dt; f.yawRate = rate; }
      this.apply(f, up);
      if (!w) st.V = approach(st.V, 10, 1, dt);
    },
    screen(f, dt, c) {
      const s = c.sin;
      const rate = this.step(f, dt, { open: true, aim: -scrPitch(s) * 0.8, bank: clamp(scrBank(s) + lookSteer(s), -1, 1) * 0.8 });
      turnHeading(f, s, rate, dt);
      this.apply(f, scrAct(s));
    },
  },

  broom: {
    name: 'ほうき', sub: 'またがって手で操縦',
    vr: 'ほうきは手の向きに向く。トリガーで進み（両手で速く）、離すと空中で止まる。向けた方へ景色が回る',
    keys: 'W 進む / S 止まる・マウスの向きへ曲がる・A/D 曲がる・Space/C 上下',
    heading: true,
    enter(f, c) { vrHeadingStart(f, c); f.st.pitch = 0; },
    xr(f, dt, c) {
      const L = c.inp.hands.L, R = c.inp.hands.R;
      const lead = R.on ? R : L.on ? L : null;
      const st = f.st;
      if (lead) {
        const d = hand(f, lead).d;
        // the rig (your seat on the broom) turns toward where the broom points
        const want = yawOf(d), diff = wrap(want - f.rig.rotation.y);
        const rate = clamp(diff * 1.6, -1.3, 1.3);
        f.turn(rate * dt, c.headWorld);
        f.yawRate = rate;
        st.pitch = Math.asin(clamp(d.y, -1, 1));
        st.yaw = diff;
      }
      f.heading = f.rig.rotation.y;
      const thr = Math.max(L.on ? L.trigger : 0, R.on ? R.trigger : 0);
      const both = L.trigger > 0.5 && R.trigger > 0.5;
      const dir = dirOfYaw(f.heading).multiplyScalar(Math.cos(st.pitch)).addScaledVector(UP, Math.sin(st.pitch));
      const desired = sticks(f, c, new THREE.Vector3()).addScaledVector(dir, thr * f.vmax(both ? 2 : 1));
      if (desired.lengthSq() > 1) f.steer(desired, dt, 1.6); else f.coast(dt, 1.3);
      st.bank = approach(st.bank || 0, clamp(-f.yawRate * 0.35, -0.5, 0.5), 3, dt);
    },
    screen(f, dt, c) {
      const s = c.sin, st = f.st;
      const rate = clamp(-(scrBank(s) * 0.9) + clamp(s.yaw * 1.6, -1.3, 1.3), -1.3, 1.3);
      turnHeading(f, s, rate, dt);
      st.pitch = clamp(s.pitch + 0.15, -1.2, 1.2) * 0.9;
      const thr = Math.max(0, scrPitch(s));
      const dir = dirOfYaw(f.heading).multiplyScalar(Math.cos(st.pitch)).addScaledVector(UP, Math.sin(st.pitch));
      const desired = dir.multiplyScalar(thr * f.vmax(s.keys.has('ShiftLeft') ? 2 : 1)).addScaledVector(UP, (scrAct(s) - scrAlt(s)) * f.vmax() * 0.4);
      if (desired.lengthSq() > 1) f.steer(desired, dt, 1.6); else f.coast(dt, 1.3);
      st.bank = approach(st.bank || 0, clamp(-rate * 0.35, -0.5, 0.5), 3, dt);
    },
  },

  glider: {
    name: 'グライダー', sub: '上昇気流で高く',
    vr: '右スティック（またはグリップを握って右手を操縦桿のように傾ける）で、左右に傾けて旋回・前に倒すと速く・引くと遅く。雲の下の上昇気流で旋回すると上がる。トリガーでエンジン',
    keys: 'A/D 傾ける・W 機首を下げて速く / S 引き起こし・Space エンジン・マウスの向きにも曲がる',
    land: true, heading: true, brake: false, seat: true,
    enter(f, c) {
      vrHeadingStart(f, c);
      if (c.xr) f.turn(wrap(f.heading - f.rig.rotation.y), c.headWorld); // the cockpit faces where you look
      Object.assign(f.st, { V: 26, bank: 0, cal: null });
    },
    // a sailplane: airspeed follows the stick; sink from its polar (best ≈ 35:1); coordinated turns
    step(f, dt, { roll, pitch, motor }) {
      const st = f.st;
      if (f.onGround && motor < 0.1) { // rolling to a stop
        st.V = approach(st.V, 0, 1.2, dt); st.vy = 0; st.bank = approach(st.bank, 0, 3, dt); st.lift = 0;
        return 0;
      }
      st.bank = approach(st.bank, roll * 0.8, 1.6, dt);
      st.V = approach(st.V, clamp(27 + pitch * 23, 19, 55), 0.45, dt);
      const sink = (0.6 + 0.0026 * (Math.max(st.V, 8) - 22) ** 2) / Math.cos(st.bank) ** 1.5;
      const p = f.rig.position;
      const lift = f.air ? f.air.lift(p.x, p.y, p.z, f.groundAtFull) : 0;
      const vy = -sink + lift + motor * 4.5;
      const rate = (-G * Math.tan(st.bank)) / st.V;
      st.vy = vy;
      st.lift = lift;
      return rate;
    },
    apply(f) {
      const st = f.st;
      dirOfYaw(f.heading, f.vel).multiplyScalar(st.V);
      if (f.air && !f.onGround) f.vel.add(f.air.wind(f.rig.position.y, tmp)); // the air mass carries you
      f.vel.y = st.vy;
      if (f.onGround && st.V < 15) f.msg = '着陸';
      const near = f.air && f.air.nearest(f.rig.position.x, f.rig.position.z);
      const hint = near && near.d > 400 ? `・近くの上昇気流 ${(near.d / 1000).toFixed(1)} km` : '';
      f.info = `昇降 ${st.vy >= 0 ? '+' : ''}${st.vy.toFixed(1)} m/s・${Math.round(st.V * 3.6)} km/h${hint}`;
    },
    xr(f, dt, c) {
      const R = c.inp.hands.R, st = f.st;
      let roll = 0, pitch = 0;
      if (Math.abs(R.stick[0]) + Math.abs(R.stick[1]) > 0.05) { roll = R.stick[0]; pitch = -R.stick[1]; }
      else if (R.on && R.grip > 0.5) {
        // the right hand as a control stick: tilt it (the grip sets where "centred" is)
        if (!st.cal) st.cal = R.quat.clone();
        const e = new THREE.Euler().setFromQuaternion(st.cal.clone().invert().multiply(R.quat), 'YXZ');
        roll = clamp(-e.z / 0.6, -1, 1);
        pitch = clamp(-e.x / 0.5, -1, 1);
      } else st.cal = null;
      const motor = Math.max(c.inp.hands.L.trigger, R.trigger);
      const rate = this.step(f, dt, { roll, pitch, motor });
      f.turn(rate * dt, c.headWorld);
      f.heading = f.rig.rotation.y;
      f.yawRate = rate;
      this.apply(f);
    },
    screen(f, dt, c) {
      const s = c.sin;
      const rate = this.step(f, dt, { roll: clamp(scrBank(s) + lookSteer(s), -1, 1), pitch: scrPitch(s), motor: scrAct(s) });
      turnHeading(f, s, rate, dt);
      this.apply(f);
    },
  },

  balloon: {
    name: '気球', sub: 'バーナーと風まかせ',
    vr: 'トリガーでバーナー（暖めると上昇、冷めると下降）。A / X で弁を開いて早く下降。横へは風が運ぶ。風は高さで向きと強さが変わるので、高さを選んで行き先を決める',
    keys: 'Space バーナー・C 弁（下降）・マウスで見回す',
    land: true, brake: false, seat: true, noSticks: true,
    enter(f) { Object.assign(f.st, { heat: 0.5, vy: f.vel.y * 0.2 }); },
    step(f, dt, burner, vent) {
      const st = f.st;
      st.heat = clamp(st.heat + burner * dt * 0.11 - dt * 0.011 - vent * dt * 0.09, 0, 1);
      const k = clamp(f.k * 1.6, 0.8, 4);
      st.vy = approach(st.vy, (st.heat - 0.5) * 10 * k, 0.3, dt);
      const p = f.rig.position;
      const w = f.air ? f.air.wind(p.y, tmp).clone().multiplyScalar(f.k) : new THREE.Vector3(); // the real wind (× the speed setting)
      f.vel.set(w.x, st.vy, w.z);
      if (f.onGround && st.vy <= 0.05) { f.vel.x = 0; f.vel.z = 0; f.msg = '着陸'; }
      st.burner = burner;
      const name = f.air ? windName(f.air.wind(p.y, new THREE.Vector3())) : '';
      const up = f.air ? windName(f.air.wind(p.y + 600, new THREE.Vector3())) : '';
      f.info = `熱 ${Math.round(st.heat * 100)}%・${name}の風 ${Math.round(w.length() * 3.6)} km/h（600 m 上は${up}の風）`;
    },
    xr(f, dt, c) {
      const L = c.inp.hands.L, R = c.inp.hands.R;
      this.step(f, dt, Math.max(L.trigger, R.trigger), L.buttons[4] || R.buttons[4] ? 1 : 0);
    },
    screen(f, dt, c) { this.step(f, dt, scrAct(c.sin), scrAlt(c.sin)); },
  },

  jetpack: {
    name: 'ジェットパック', sub: '手のひらから噴射',
    vr: 'トリガーで手から噴射。下に向けると上昇、後ろへ傾けると前へ。重力があるので、両手でバランスをとる。A / X でホバー（その場で止まる）',
    keys: 'Space 噴射・W/S/A/D 噴射の向きを傾ける・Shift 強く・X ホバー',
    brake: false,
    thrust: (f) => 7.6 * clamp(f.k * 1.2, 0.8, 3.5),
    step(f, dt, acc, hover) {
      acc.y -= G;
      const v = f.vel;
      acc.addScaledVector(v, -0.1 - 0.0012 * v.length());
      if (hover) { acc.set(0, 0, 0); f.vel.multiplyScalar(Math.exp(-dt * 2.5)); }
      v.addScaledVector(acc, dt);
      if (f.onGround && v.y < 0) v.multiplyScalar(Math.exp(-dt * 4));
    },
    xr(f, dt, c) {
      const T = this.thrust(f), acc = new THREE.Vector3();
      let thr = 0;
      for (const h of [c.inp.hands.L, c.inp.hands.R]) {
        if (!h.on || h.trigger < 0.04) continue;
        acc.addScaledVector(hand(f, h).d, -h.trigger * T); // pushing against where the palm points
        thr += h.trigger / 2;
      }
      const hover = c.inp.hands.L.buttons[4] || c.inp.hands.R.buttons[4];
      this.step(f, dt, acc, hover);
      f.st.thr = thr;
      f.info = hover ? 'ホバー' : `推力 ${Math.round(thr * 100)}%`;
    },
    screen(f, dt, c) {
      const s = c.sin, T = this.thrust(f) * (s.keys.has('ShiftLeft') ? 1.8 : 1);
      const act = scrAct(s), fwd = scrPitch(s), side = s.axis(['KeyA'], ['KeyD']);
      const look = dirOfYaw(s.yaw), right = new THREE.Vector3(-look.z, 0, look.x);
      const acc = new THREE.Vector3(0, act * T * 2, 0).addScaledVector(look, fwd * T * 0.9).addScaledVector(right, side * T * 0.9);
      this.step(f, dt, acc, s.keys.has('KeyX'));
      f.st.thr = act;
      f.info = `推力 ${act ? 100 : 0}%`;
    },
  },

  carpet: {
    name: '魔法のじゅうたん', sub: '体を傾けて進む',
    vr: 'じゅうたんの上で前へ体を傾けると進み、後ろで戻る。左右に傾けて曲がる。右スティックで上下。トリガーで「まん中」をいまの位置に合わせ直す',
    keys: 'W/S 進む・戻る・A/D 曲がる・Space/C 上下・マウスの向きへも曲がる',
    heading: true, seat: true,
    enter(f, c) { vrHeadingStart(f, c); f.st.center = c.inp ? c.inp.head.clone() : null; },
    cap: (f) => clamp(10 + f.agl * 0.45, 10, 400) * f.k,
    xr(f, dt, c) {
      const st = f.st, inp = c.inp;
      if (!st.center || inp.was('*', 0)) { st.center = inp.head.clone(); if (st.t0) f.msg = 'まん中を合わせました'; }
      st.t0 = 1;
      // the lean: your head's offset from the centre, in the carpet's (rig's) frame
      const dx = inp.head.x - st.center.x, dzz = inp.head.z - st.center.z;
      const fwd = -dzz, side = dx;
      const dead = 0.04, full = 0.2;
      const f1 = Math.sign(fwd) * clamp((Math.abs(fwd) - dead) / (full - dead), 0, 1);
      const s1 = Math.sign(side) * clamp((Math.abs(side) - dead) / (full - dead), 0, 1);
      const rate = -s1 * 0.9;
      f.turn(rate * dt, c.headWorld);
      f.yawRate = rate;
      f.heading = f.rig.rotation.y;
      const cap = this.cap(f);
      const desired = dirOfYaw(f.heading).multiplyScalar(clamp(f1, -0.4, 1) * cap).addScaledVector(UP, -inp.hands.R.stick[1] * Math.min(cap, 4 + f.agl * 0.05));
      f.steer(desired, dt, 1.3);
      st.lean = [f1, s1];
      f.info = `前 ${Math.round(f1 * 100)}%・${s1 > 0.05 ? '右' : s1 < -0.05 ? '左' : 'まっすぐ'}`;
    },
    screen(f, dt, c) {
      const s = c.sin, st = f.st;
      const rate = clamp(-scrBank(s) * 0.9 + clamp(s.yaw * 1.4, -0.9, 0.9), -0.9, 0.9);
      turnHeading(f, s, rate, dt);
      const cap = this.cap(f), fw = scrPitch(s);
      const desired = dirOfYaw(f.heading).multiplyScalar(clamp(fw, -0.4, 1) * cap).addScaledVector(UP, (scrAct(s) - scrAlt(s)) * Math.min(cap, 4 + f.agl * 0.05));
      f.steer(desired, dt, 1.3);
      st.lean = [fw, -rate];
    },
  },
};

// sticks (VR): left = move along the view, right = up/down. Returns desired velocity added to out.
function sticks(f, c, out, cap = f.vmax(), vcap = cap) {
  const inp = c.inp;
  const L = inp.hands.L, R = inp.hands.R;
  const hq = new THREE.Quaternion().copy(f.rig.quaternion).multiply(inp.headQuat);
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(hq);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(hq);
  const sx = L.stick[0], sy = -L.stick[1], cy = -R.stick[1];
  if (sx || sy) out.addScaledVector(fwd, sy * cap).addScaledVector(right, sx * cap);
  if (cy) out.addScaledVector(UP, cy * vcap);
  return out;
}

// screen, free look (スーパーマン, 空中浮遊): move along the view
function freeScreen(f, dt, c, boostOK, rate, cap) {
  const it = c.sin.intent(dt);
  const s = c.sin;
  const yawQ = new THREE.Quaternion().setFromAxisAngle(UP, s.yaw);
  const look = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(1, 0, 0), s.pitch).applyQuaternion(yawQ);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(yawQ);
  const desired = new THREE.Vector3().addScaledVector(look, it.fwd).addScaledVector(right, it.strafe).addScaledVector(UP, it.climb);
  if (desired.lengthSq() > 1) desired.normalize();
  const active = desired.lengthSq() > 1e-4;
  desired.multiplyScalar(cap ?? f.vmax(boostOK && it.boost ? 3 : 1));
  if (active) f.steer(desired, dt, rate); else f.coast(dt, 1.4);
}

export const MODE_ORDER = ['point', 'float', 'bird', 'squirrel', 'broom', 'glider', 'balloon', 'jetpack', 'carpet'];
