// js/core/input.js — head, hands, buttons and haptics (§10.4, OPUS-A).
// One shape for every mode: 'xr-controllers' | 'xr-hands' (read from the XRFrame) and 'desktop'
// (a virtual head and two virtual hands driven through input.virtual — the PC preview, tests and the
// autoplay bot use exactly the same downstream code as VR).
import * as THREE from 'three';
import { clamp, ema, yawOfQuat, pitchOfQuat, DEG, wrapPi, smoothstep, lerp } from './util.js';
import { DEFAULT_STAND_HEIGHT, HAND_JOINTS } from './config.js';
const HANDS = ['left', 'right'];

export const BUTTONS = ['triggerL', 'triggerR', 'gripL', 'gripR', 'a', 'b', 'x', 'y', 'stickL', 'stickR', 'menu'];
const HIST = 32;

// ── desktop swing keyframes (right hand, head space: x right, y up, z back). Left hand mirrors x. ──
// p = grip position, d = where the blade (-Z of the grip) points, e = toward the elbow (+Y of the grip)
const SWINGS = {
  slashH: { wind: 0.12, strike: 0.24, recover: 0.28, keys: [
    { p: [0.48, -0.02, -0.22], d: [0.9, 0.25, 0.35], e: [0.1, -0.6, 0.8] },
    { p: [0.12, -0.12, -0.58], d: [0.05, 0.1, -1], e: [0.2, -0.6, 0.8] },
    { p: [-0.36, -0.2, -0.36], d: [-0.95, -0.05, -0.1], e: [0.6, -0.5, 0.6] },
  ] },
  slashV: { wind: 0.14, strike: 0.24, recover: 0.28, keys: [
    { p: [0.16, 0.28, -0.12], d: [0.05, 0.85, 0.5], e: [0.1, -0.9, -0.3] },
    { p: [0.12, 0.0, -0.58], d: [0.0, 0.25, -1], e: [0.15, -0.6, 0.8] },
    { p: [0.06, -0.36, -0.46], d: [0.0, -0.8, -0.55], e: [0.1, 0.3, 0.95] },
  ] },
  thrust: { wind: 0.12, strike: 0.16, recover: 0.3, keys: [
    { p: [0.2, -0.16, -0.1], d: [0.0, 0.05, -1], e: [0.15, -0.5, 0.85] },
    { p: [0.16, -0.1, -0.5], d: [0.0, 0.03, -1], e: [0.15, -0.5, 0.85] },
    { p: [0.14, -0.07, -0.82], d: [0.0, 0.02, -1], e: [0.15, -0.5, 0.85] },
  ] },
  throw: { wind: 0.18, strike: 0.2, recover: 0.3, releaseAt: 0.62, keys: [
    { p: [0.3, 0.2, 0.18], d: [0.0, 0.8, 0.6], e: [0.1, -0.9, 0.3] },
    { p: [0.25, 0.12, -0.3], d: [0.0, 0.6, -0.8], e: [0.1, -0.8, 0.5] },
    { p: [0.2, -0.02, -0.7], d: [0.0, 0.1, -1], e: [0.15, -0.5, 0.85] },
  ] },
  fan: { wind: 0.1, strike: 0.2, recover: 0.25, keys: [
    { p: [0.45, -0.1, -0.35], d: [0.1, 0.9, -0.3], e: [0.1, -0.5, 0.85] },
    { p: [0.15, -0.12, -0.45], d: [0.0, 0.9, -0.3], e: [0.1, -0.5, 0.85] },
    { p: [-0.2, -0.14, -0.4], d: [-0.1, 0.9, -0.3], e: [0.1, -0.5, 0.85] },
  ] },
  shake: { wind: 0.08, strike: 1.0, recover: 0.2, shake: true, keys: [
    { p: [0.2, -0.1, -0.45], d: [0.0, -0.3, -1], e: [0.15, -0.5, 0.85] },
    { p: [0.2, -0.1, -0.45], d: [0.0, -0.3, -1], e: [0.15, -0.5, 0.85] },
    { p: [0.2, -0.1, -0.45], d: [0.0, -0.3, -1], e: [0.15, -0.5, 0.85] },
  ] },
};
const REST = { p: [0.2, -0.3, -0.42], d: [0.05, 0.72, -0.7], e: [0.12, -0.6, 0.8] };
const GUARD = { p: [0.12, -0.2, -0.44], d: [0.0, 1, 0.05], e: [1, -0.25, 0.2] };   // hand raised in front (shield face forward)
// PC preview rests (ART_REVIEW A-P1-1/A-P1-2; VR never uses these):
//   empty hand 45.6° below the view → out of frame; holding something 34.7° below → only the item's
//   far end shows in the lower quarter; a shield turned 35° outward at the lower left.
const EMPTY_REST = { p: [0.24, -0.47, -0.46], d: [0.05, 0.72, -0.7], e: [0.12, 0.2, 0.9] };
// (a thumb-up fist puts the cuff above the grip: the grip sits under the frame at y −0.52 and the blade is pitched
//  11° up, so only the blade rises into the lower third and ≤ 25 px of glove/cuff shows at 720p)
const HELD_REST = { p: [0.22, -0.52, -0.55], d: [0.03, 0.2, -1], e: [0.0, 1, 0.0] };    // thumb up, tip low and forward
const SHIELD_REST = { p: [0.34, -0.46, -0.5], d: [0.0, 1, 0.0], e: [0.819, 0, 0.574] };  // face 35° outward (left hand mirrors)
SWINGS.rest = { keys: [REST, REST, REST] };
// held poses for desktop (orientation while reaching / resting)
const POSES = {
  rest: REST,
  guard: GUARD,
  bow: { p: [0.02, -0.09, -0.66], d: [0.0, 1, 0.0], e: [0.0, 0.0, 1] },              // bow limbs vertical, arrow along the view
  drink: { p: [0.06, -0.1, -0.18], d: [-0.15, 0.3, 1], e: [0.3, -0.9, 0.3] },          // flask neck tipped toward the mouth
  eat: { p: [0.05, -0.12, -0.2], d: [-0.2, 0.6, 0.6], e: [0.3, -0.9, 0.3] },
  pour: { p: [0.2, -0.25, -0.45], d: [0.0, -1, -0.15], e: [0.15, 0.2, 0.95] },        // upside down
  draw: { p: [0.1, -0.05, -0.25], d: [0.0, 0.1, -1], e: [0.6, -0.3, 0.7] },           // string hand, arrow forward
  raise: { p: [0.18, -0.25, -0.6], d: [0.0, 0.75, -0.66], e: [0.0, 0.66, 0.75] },     // torch held up in front, arm's length
  show: { p: [0.2, -0.2, -0.45], d: [-1, -0.15, 0.1], e: [0.0, 0.25, 1] },             // open hand, palm down, fingers forward
};

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const _rigQ = new THREE.Quaternion(), _rigQInv = new THREE.Quaternion();

/** quaternion whose -Z is d and +Y leans toward e (both in the same space) */
function quatFromBladeElbow(d, e, out) {
  _z.set(-d[0], -d[1], -d[2]).normalize();
  _y.set(e[0], e[1], e[2]);
  _y.addScaledVector(_z, -_y.dot(_z));
  if (_y.lengthSq() < 1e-6) _y.set(0, 1, 0).addScaledVector(_z, -_z.y);
  _y.normalize();
  _x.crossVectors(_y, _z).normalize();
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}

function makeHand(side, rig) {
  const object3D = new THREE.Group();
  object3D.name = 'hand-' + side;
  rig.add(object3D);
  return {
    side, tracked: false,
    pos: new THREE.Vector3(), quat: new THREE.Quaternion(),
    localPos: new THREE.Vector3(), localQuat: new THREE.Quaternion(),
    vel: new THREE.Vector3(), localVel: new THREE.Vector3(), angVel: new THREE.Vector3(), speed: 0,
    grip: 0, trigger: 0, pinch: 0,
    aimPos: new THREE.Vector3(), aimQuat: new THREE.Quaternion(),
    object3D,
    source: null,
    // history of local positions (for throw velocity)
    hist: { t: new Float64Array(HIST), x: new Float64Array(HIST), y: new Float64Array(HIST), z: new Float64Array(HIST), i: 0, len: 0 },
    prevLocalPos: new THREE.Vector3(), prevLocalQuat: new THREE.Quaternion(), hasPrev: false,
    // hand tracking: the 25 joint matrices in rig space (column-major 4×4 each) when jointsValid
    joints: new Float32Array(25 * 16), jointsValid: false, jointSpaces: null, jointSrc: null,
    thumbRest: false,                 // a thumb is on the stick / face buttons (controllers)
  };
}

export function createInput(ctx) {
  const { rig, camera } = ctx;
  const hands = { left: makeHand('left', rig), right: makeHand('right', rig) };
  const head = {
    pos: new THREE.Vector3(), quat: new THREE.Quaternion(),
    localPos: new THREE.Vector3(0, DEFAULT_STAND_HEIGHT, 0), localQuat: new THREE.Quaternion(),
    yaw: 0, pitch: 0, localYaw: 0, tracked: true,
  };
  const stick = { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } };
  const cur = {}, prev = {};
  for (const b of BUTTONS) { cur[b] = false; prev[b] = false; }

  // ── virtual (desktop / autoplay / tests) ──
  const V = {
    lookYaw: 0, lookPitch: 0,         // world yaw (rad), pitch (rad)
    lookYawSet: false,
    cadence: 0,
    duck: false, duckAmt: 0,
    lean: 0, leanAmt: 0,
    hold: {}, until: {},
    stick: { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } },
    standHeight: DEFAULT_STAND_HEIGHT,
    hands: {
      left: { anim: null, t: 0, target: null, targetPos: new THREE.Vector3(), offset: new THREE.Vector2(), guard: false, init: false, pose: 'rest' },
      right: { anim: null, t: 0, target: null, targetPos: new THREE.Vector3(), offset: new THREE.Vector2(), guard: false, init: false, pose: 'rest' },
    },
    spread: false,
    center: new THREE.Vector3(0, 0, 0),
    reach: 0.78,                       // desktop arm reach from the shoulder when a hand target is set
  };
  for (const b of BUTTONS) { V.hold[b] = false; V.until[b] = 0; }

  let xrFrame = null;
  let lastNow = 0;

  const input = {
    mode: 'desktop',
    head, hands, stick,
    enabled: true,
    pressed: (b) => !!cur[b],
    justPressed: (b) => !!cur[b] && !prev[b],
    justReleased: (b) => !cur[b] && !!prev[b],
    haptic(hand, intensity = 0.5, ms = 30) {
      const h = hands[hand];
      if (!h) return;
      const k = ctx.settings ? ctx.settings.get('haptics') : 1;
      const amt = clamp(intensity * (k ?? 1), 0, 1);
      if (amt <= 0) return;
      const gp = h.source && h.source.gamepad;
      try {
        if (gp && gp.hapticActuators && gp.hapticActuators[0] && gp.hapticActuators[0].pulse) gp.hapticActuators[0].pulse(amt, ms);
        else if (gp && gp.vibrationActuator && gp.vibrationActuator.playEffect) gp.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: amt, weakMagnitude: amt });
      } catch { /* not supported */ }
      input.lastHaptic[hand] = amt;
    },
    lastHaptic: { left: 0, right: 0 },
    /** average body-relative hand velocity (world axes) over the last `window` seconds */
    handVelocityAvg(hand, window = 0.08, out = new THREE.Vector3()) {
      const h = hands[hand];
      const H = h.hist;
      out.set(0, 0, 0);
      if (H.len < 2) return out.copy(h.vel);
      const i0 = (H.i - 1 + HIST) % HIST;
      const t0 = H.t[i0];
      let j = i0, k = 1;
      for (; k < H.len; k++) {
        const jj = (H.i - 1 - k + HIST * 2) % HIST;
        j = jj;
        if (t0 - H.t[jj] >= window) break;
      }
      const dt = t0 - H.t[j];
      if (dt < 1e-4) return out.copy(h.vel);
      out.set((H.x[i0] - H.x[j]) / dt, (H.y[i0] - H.y[j]) / dt, (H.z[i0] - H.z[j]) / dt);
      return out.applyQuaternion(rig.quaternion);
    },
    setFrame(frame) { xrFrame = frame; },
    update,
    virtual: null,
  };

  // ───────────────────────────── virtual API ─────────────────────────────
  input.virtual = {
    state: V,
    setLook(yawDeg, pitchDeg = 0) {
      V.lookYaw = (yawDeg || 0) * DEG; V.lookPitch = clamp((pitchDeg || 0) * DEG, -1.45, 1.45); V.lookYawSet = true;
    },
    addLook(dYawDeg, dPitchDeg) {
      V.lookYaw = wrapPi(V.lookYaw + dYawDeg * DEG);
      V.lookPitch = clamp(V.lookPitch + dPitchDeg * DEG, -1.45, 1.45);
    },
    getLook() { return { yawDeg: V.lookYaw / DEG, pitchDeg: V.lookPitch / DEG }; },
    setCadence(spm) { V.cadence = Math.max(0, Number(spm) || 0); },
    get cadence() { return V.cadence; },
    setDuck(b) { V.duck = !!b; },
    setLean(x) { V.lean = clamp(Number(x) || 0, -1, 1); },
    swing(hand = 'right', kind = 'slashH') {
      const vh = V.hands[hand];
      if (!vh || !SWINGS[kind]) return false;
      vh.anim = SWINGS[kind]; vh.animKind = kind; vh.t = 0; vh.released = false;
      vh.from = vh.from || { p: new THREE.Vector3(), q: new THREE.Quaternion() };
      return true;
    },
    isSwinging(hand = 'right') { return !!V.hands[hand]?.anim; },
    setHandTarget(hand, worldPos) {
      const vh = V.hands[hand];
      if (!vh) return;
      if (!worldPos) { vh.target = null; return; }
      vh.target = true; vh.targetPos.copy(worldPos);
    },
    /** desktop mouse drag: offset the hand from rest in head space (m) */
    setHandOffset(hand, x, y) { const vh = V.hands[hand]; if (vh) vh.offset.set(x, y); },
    setGuard(hand, b) { const vh = V.hands[hand]; if (vh) vh.guard = !!b; },
    /** orientation/rest preset: 'rest' | 'guard' | 'bow' | 'drink' | 'eat' | 'pour' | 'draw' */
    setHandPose(hand, key = 'rest') { const vh = V.hands[hand]; if (vh) vh.pose = POSES[key] ? key : 'rest'; },
    press(btn, ms = 120) { if (btn in V.until) V.until[btn] = performance.now() + ms; },
    hold(btn, down) { if (btn in V.hold) V.hold[btn] = !!down; },
    spreadArms(b) { V.spread = !!b; },
    setStick(side, x, y) { const s = V.stick[side]; if (s) { s.x = clamp(x, -1, 1); s.y = clamp(y, -1, 1); } },
    setStandHeight(h) { V.standHeight = clamp(h, 1.0, 2.1); },
    /** desktop: how far a virtual hand may reach from the shoulder toward a target (m) */
    setReach(m = 0.78) { V.reach = clamp(m, 0.3, 2.0); },
  };

  // ───────────────────────────── per frame ─────────────────────────────
  function pushHist(h, now) {
    const H = h.hist;
    H.t[H.i] = now; H.x[H.i] = h.localPos.x; H.y[H.i] = h.localPos.y; H.z[H.i] = h.localPos.z;
    H.i = (H.i + 1) % HIST; if (H.len < HIST) H.len++;
  }

  function finishHand(h, dt, now) {
    // world pose from rig space
    h.pos.copy(h.localPos).applyMatrix4(rig.matrixWorld);
    h.quat.copy(_rigQ).multiply(h.localQuat);
    if (h.hasPrev && dt > 1e-4) {
      _v.copy(h.localPos).sub(h.prevLocalPos).divideScalar(dt);
      const a = ema(0.02, dt);
      h.localVel.lerp(_v, a);
      h.vel.copy(h.localVel).applyQuaternion(_rigQ);
      // angular velocity (world axes): q_delta = q * prev^-1
      _q.copy(h.prevLocalQuat).invert().premultiply(h.localQuat);
      if (_q.w < 0) { _q.x = -_q.x; _q.y = -_q.y; _q.z = -_q.z; _q.w = -_q.w; }
      const s = Math.sqrt(1 - Math.min(1, _q.w * _q.w));
      const ang = 2 * Math.acos(clamp(_q.w, -1, 1));
      if (s > 1e-5) _v2.set(_q.x / s, _q.y / s, _q.z / s).multiplyScalar(ang / dt).applyQuaternion(_rigQ);
      else _v2.set(0, 0, 0);
      h.angVel.lerp(_v2, a);
    } else { h.vel.set(0, 0, 0); h.localVel.set(0, 0, 0); h.angVel.set(0, 0, 0); }
    h.speed = h.vel.length();
    h.prevLocalPos.copy(h.localPos); h.prevLocalQuat.copy(h.localQuat); h.hasPrev = true;
    h.object3D.position.copy(h.localPos);
    h.object3D.quaternion.copy(h.localQuat);
    h.object3D.visible = h.tracked;
    pushHist(h, now);
  }

  function readXR(frame, dt) {
    const refSpace = ctx.renderer.xr.getReferenceSpace();
    if (!frame || !refSpace) return false;
    const pose = frame.getViewerPose(refSpace);
    if (pose) {
      const t = pose.transform;
      head.localPos.set(t.position.x, t.position.y, t.position.z);
      head.localQuat.set(t.orientation.x, t.orientation.y, t.orientation.z, t.orientation.w);
      head.tracked = true;
    }
    for (const b of BUTTONS) cur[b] = false;
    stick.left.x = stick.left.y = stick.right.x = stick.right.y = 0;
    hands.left.tracked = hands.right.tracked = false;
    hands.left.jointsValid = hands.right.jointsValid = false;
    const session = frame.session;
    let anyHand = false;
    for (const src of session.inputSources) {
      const side = src.handedness === 'left' ? 'left' : src.handedness === 'right' ? 'right' : null;
      if (!side) continue;
      const h = hands[side];
      h.source = src;
      // hands: the grip pose (Quest gives one) or the wrist joint below — never the pointing ray
      const space = src.hand ? src.gripSpace : (src.gripSpace || src.targetRaySpace);
      const gp = space && frame.getPose(space, refSpace);
      if (gp) {
        const t = gp.transform;
        h.localPos.set(t.position.x, t.position.y, t.position.z);
        h.localQuat.set(t.orientation.x, t.orientation.y, t.orientation.z, t.orientation.w);
        h.tracked = true;
      }
      const ap = src.targetRaySpace && frame.getPose(src.targetRaySpace, refSpace);
      if (ap) {
        const t = ap.transform;
        h.aimPos.set(t.position.x, t.position.y, t.position.z).applyMatrix4(rig.matrixWorld);
        h.aimQuat.set(t.orientation.x, t.orientation.y, t.orientation.z, t.orientation.w).premultiply(_rigQ);
      }
      const S = side === 'left' ? 'L' : 'R';
      if (src.hand) {
        anyHand = true;
        // all 25 joints (for the skinned hand)
        if (h.jointSrc !== src) { h.jointSrc = src; h.jointSpaces = HAND_JOINTS.map((n) => src.hand.get(n)); }
        if (h.jointSpaces.every(Boolean)) {
          if (frame.fillPoses) h.jointsValid = !!frame.fillPoses(h.jointSpaces, refSpace, h.joints);
          else {
            h.jointsValid = true;
            for (let i = 0; i < 25; i++) {
              const jp = frame.getJointPose(h.jointSpaces[i], refSpace);
              if (!jp) { h.jointsValid = false; break; }
              h.joints.set(jp.transform.matrix, i * 16);
            }
          }
        }
        // pinch from joint distances (thumb tip ↔ index tip = grab, ↔ middle tip = use)
        const jt = (name) => { const j = src.hand.get(name); return j ? frame.getJointPose(j, refSpace) : null; };
        const th = jt('thumb-tip'), ix = jt('index-finger-tip'), mi = jt('middle-finger-tip');
        const pinchOf = (a, b) => {
          if (!a || !b) return 0;
          const p = a.transform.position, q = b.transform.position;
          const d = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
          return clamp(1 - (d - 0.012) / 0.04, 0, 1);
        };
        const pi = pinchOf(th, ix), pm = pinchOf(th, mi);
        h.pinch = pi;
        // hysteresis: grab at ≥ 0.8, let go at ≤ 0.5 (§3.2)
        const wasGrip = prev['grip' + S];
        h.grip = pi;
        cur['grip' + S] = wasGrip ? pi > 0.5 : pi >= 0.8;
        h.trigger = pm;
        cur['trigger' + S] = prev['trigger' + S] ? pm > 0.5 : pm >= 0.8;
        if (!gp) {
          const w = jt('wrist');
          if (w) {
            const t = w.transform;
            h.localPos.set(t.position.x, t.position.y, t.position.z);
            h.localQuat.set(t.orientation.x, t.orientation.y, t.orientation.z, t.orientation.w);
            h.tracked = true;
          }
        }
        continue;
      }
      const g = src.gamepad;
      if (!g) continue;
      const btn = (i) => g.buttons[i] || null;
      const tr = btn(0), sq = btn(1), st = btn(3), b4 = btn(4), b5 = btn(5);
      h.trigger = tr ? tr.value : 0;
      h.grip = sq ? sq.value : 0;
      h.pinch = 0;
      cur['trigger' + S] = !!tr && (tr.pressed || tr.value > 0.55);
      cur['grip' + S] = !!sq && (sq.pressed || sq.value > 0.55);
      cur['stick' + S] = !!st && st.pressed;
      h.thumbRest = !!((st && st.touched) || (b4 && b4.touched) || (b5 && b5.touched));
      if (side === 'left') { cur.x = !!b4 && b4.pressed; cur.y = !!b5 && b5.pressed; }
      else { cur.a = !!b4 && b4.pressed; cur.b = !!b5 && b5.pressed; }
      const ax = g.axes || [];
      const sx = ax.length >= 4 ? ax[2] : ax[0] || 0;
      const sy = ax.length >= 4 ? ax[3] : ax[1] || 0;
      stick[side].x = Math.abs(sx) > 0.12 ? sx : 0;
      stick[side].y = Math.abs(sy) > 0.12 ? -sy : 0;
    }
    const mode = anyHand ? 'xr-hands' : 'xr-controllers';
    if (input.mode !== mode) { input.mode = mode; ctx.flags.handTracking = anyHand; }
    return true;
  }

  // virtual head + hands (desktop)
  function headSpaceToLocal(p, out) {
    // p: [x,y,z] in head space → rig-local
    return out.set(p[0], p[1], p[2]).applyQuaternion(head.localQuat).add(head.localPos);
  }
  const _from = new THREE.Vector3(), _to = new THREE.Vector3();
  const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
  const _mir = [0, 0, 0], _mirD = [0, 0, 0], _mirE = [0, 0, 0];
  function mirrorKey(key, side) {
    const s = side === 'left' ? -1 : 1;
    _mir[0] = key.p[0] * s; _mir[1] = key.p[1]; _mir[2] = key.p[2];
    _mirD[0] = key.d[0] * s; _mirD[1] = key.d[1]; _mirD[2] = key.d[2];
    _mirE[0] = key.e[0] * s; _mirE[1] = key.e[1]; _mirE[2] = key.e[2];
  }
  function keyPose(key, side, outP, outQ) {
    mirrorKey(key, side);
    headSpaceToLocal(_mir, outP);
    quatFromBladeElbow(_mirD, _mirE, outQ);
    outQ.premultiply(head.localQuat);
  }

  function updateVirtual(dt, now) {
    // head
    const turnYaw = -rig.rotation.y;
    head.localYaw = wrapPi(V.lookYaw - turnYaw);
    _e.set(V.lookPitch, -head.localYaw, 0, 'YXZ');
    head.localQuat.setFromEuler(_e);
    V.duckAmt += ((V.duck ? 0.45 : 0) - V.duckAmt) * ema(0.1, dt);
    V.leanAmt += (V.lean - V.leanAmt) * ema(0.09, dt);
    const ry = head.localYaw;
    const rx = Math.cos(ry), rz = Math.sin(ry);       // body right vector in rig space
    head.localPos.set(V.center.x + rx * V.leanAmt * 0.38, V.standHeight - V.duckAmt, V.center.z + rz * V.leanAmt * 0.38);
    head.tracked = true;

    for (const side of HANDS) {
      const h = hands[side];
      const vh = V.hands[side];
      h.tracked = true;
      const S = side === 'left' ? 'L' : 'R';
      h.grip = cur['grip' + S] ? 1 : 0;
      h.trigger = cur['trigger' + S] ? 1 : 0;
      h.pinch = 0;
      let exact = false;
      if (vh.anim) {
        const A = vh.anim;
        vh.t += dt;
        const t = vh.t;
        if (t < A.wind) {
          // ease from the pose we were in to the first key
          if (!vh.windInit) { vh.from.p.copy(h.localPos); vh.from.q.copy(h.localQuat); vh.windInit = true; }
          const k = smoothstep(0, 1, t / A.wind);
          keyPose(A.keys[0], side, _to, _qb);
          _from.copy(vh.from.p).lerp(_to, k);
          h.localPos.copy(_from);
          h.localQuat.copy(vh.from.q).slerp(_qb, k);
          exact = true;
        } else if (t < A.wind + A.strike) {
          const u = (t - A.wind) / A.strike;
          if (A.shake) {
            keyPose(A.keys[0], side, h.localPos, h.localQuat);
            const w = Math.sin(u * Math.PI * 2 * 4) * 0.13;     // 4 shakes in 1 s (4 Hz)
            _v.set(w, 0, 0).applyQuaternion(head.localQuat);
            h.localPos.add(_v);
          } else {
            const e = 0.5 - 0.5 * Math.cos(u * Math.PI);      // ease in-out
            const seg = e < 0.5 ? 0 : 1;
            const f = seg === 0 ? e * 2 : (e - 0.5) * 2;
            keyPose(A.keys[seg], side, _from, _qa);
            keyPose(A.keys[seg + 1], side, _to, _qb);
            h.localPos.copy(_from).lerp(_to, f);
            h.localQuat.copy(_qa).slerp(_qb, f);
            if (A.releaseAt != null && !vh.released && u >= A.releaseAt) {
              vh.released = true;
              V.hold['grip' + S] = false;
              V.until['grip' + S] = 0;
            }
          }
          exact = true;
        } else if (t < A.wind + A.strike + A.recover) {
          // fall back toward rest (smoothed below)
          if (A.releaseAt != null && !vh.released) { vh.released = true; V.hold['grip' + S] = false; V.until['grip' + S] = 0; }
        } else {
          vh.anim = null; vh.windInit = false;
        }
      }
      if (exact) continue;
      // targets: explicit world target > spread arms > guard > rest (+ drag offset)
      if (vh.target) {
        _to.copy(vh.targetPos);
        rig.worldToLocal(_to);
        // keep within arm reach of the shoulder
        _v.set(side === 'left' ? -0.18 : 0.18, -0.22, 0.02).applyQuaternion(head.localQuat).add(head.localPos);
        _v2.copy(_to).sub(_v);
        const L = _v2.length();
        if (L > V.reach) _to.copy(_v).addScaledVector(_v2, V.reach / L);
        keyPose(POSES[vh.pose] || REST, side, _from, _qb);
        h.localPos.lerp(_to, ema(0.06, dt));
        h.localQuat.slerp(_qb, ema(0.08, dt));
      } else if (V.spread) {
        const s = side === 'left' ? -1 : 1;
        // body-yaw frame, shoulder height
        _to.set(s * 0.78, -0.24, -0.05);
        _q2.setFromAxisAngle(_y.set(0, 1, 0), -head.localYaw);
        _to.applyQuaternion(_q2).add(head.localPos);
        h.localPos.lerp(_to, ema(0.08, dt));
        _mirD[0] = s; _mirD[1] = 0.05; _mirD[2] = -0.2; _mirE[0] = -s * 0.2; _mirE[1] = -0.3; _mirE[2] = 0.9;
        quatFromBladeElbow(_mirD, _mirE, _qb).premultiply(_q2);
        h.localQuat.slerp(_qb, ema(0.08, dt));
      } else {
        const held = ctx.items?.held?.[side];
        let key;
        if (vh.guard) key = GUARD;
        else if (vh.pose !== 'rest' && POSES[vh.pose]) key = POSES[vh.pose];
        else if (!held) key = EMPTY_REST;
        else if (held.def?.block) key = SHIELD_REST;
        else key = HELD_REST;
        mirrorKey(key, side);
        _mir[0] += vh.offset.x; _mir[1] += vh.offset.y;
        headSpaceToLocal(_mir, _to);
        quatFromBladeElbow(_mirD, _mirE, _qb).premultiply(head.localQuat);
        if (!vh.init) { h.localPos.copy(_to); h.localQuat.copy(_qb); vh.init = true; }
        // back out of frame in ≈ 0.3 s; into a holding pose a little quicker
        const k = vh.offset.lengthSq() > 0 ? ema(0.03, dt) : key === EMPTY_REST ? ema(0.1, dt) : ema(0.07, dt);
        h.localPos.lerp(_to, k);
        h.localQuat.slerp(_qb, k);
      }
    }
  }

  function update(dt) {
    const now = performance.now() / 1000;
    const rawDt = lastNow ? clamp(now - lastNow, 1e-4, 0.25) : 1 / 60;
    lastNow = now;
    for (const b of BUTTONS) prev[b] = cur[b];
    rig.updateMatrixWorld();
    _rigQ.copy(rig.quaternion);
    _rigQInv.copy(_rigQ).invert();

    const xrActive = !!(ctx.renderer.xr.isPresenting && xrFrame);
    if (xrActive) {
      readXR(xrFrame, rawDt);
    } else {
      if (input.mode !== 'desktop') input.mode = 'desktop';
      const nowMs = performance.now();
      for (const b of BUTTONS) cur[b] = input.enabled && (V.hold[b] || V.until[b] > nowMs);
      stick.left.x = V.stick.left.x; stick.left.y = V.stick.left.y;
      stick.right.x = V.stick.right.x; stick.right.y = V.stick.right.y;
      updateVirtual(rawDt, now);
      for (const side of HANDS) {
        const h = hands[side];
        // aim = grip pose pointed forward
        h.aimQuat.copy(_rigQ).multiply(h.localQuat);
      }
    }
    // head world pose; drive the camera ourselves so everyone sees this frame's head
    head.pos.copy(head.localPos).applyMatrix4(rig.matrixWorld);
    head.quat.copy(_rigQ).multiply(head.localQuat);
    head.yaw = yawOfQuat(head.quat);
    head.pitch = pitchOfQuat(head.quat);
    head.localYaw = yawOfQuat(head.localQuat);
    camera.position.copy(head.localPos);
    camera.quaternion.copy(head.localQuat);
    camera.updateMatrixWorld();
    finishHand(hands.left, rawDt, now);
    finishHand(hands.right, rawDt, now);
    if (!xrActive) {
      for (const side of HANDS) {
        const h = hands[side];
        h.aimPos.copy(h.pos);
        _v3.set(0, 0, -1).applyQuaternion(h.quat);
      }
    }
    input.rawDt = rawDt;
  }

  input.SWINGS = SWINGS;
  input.POSES = POSES;
  return input;
}
