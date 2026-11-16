// js/player/steps.js — in-place stepping detection (§2.1) and arm-swing assist (§2.3), OPUS-A.
//
// Signal: the "neck point" 10 cm below / 8 cm behind the eyes (nods and look-arounds rotate about the neck,
// so its height barely moves), low-passed. Each foot strike = one dip of the head = one valley.
// Valleys are found with a small position hysteresis (robust to jitter at any frame rate) and accepted when
// amplitude, descent speed, spacing and nod checks pass. Ducks, side-steps and big weapon swings suppress or
// harden detection. Synthetic steps (desktop W, tests, the bot) enter at the same point as real valleys.
import * as THREE from 'three';
import { STEP, CADENCE_CURVE, GAIT_ZONES } from '../core/config.js';
import { clamp, ema, piecewise, RingBuffer, ringMedian, pitchOfQuat, yawOfQuat, wrapPi } from '../core/util.js';
const HANDS = ['left', 'right'];

const _n = new THREE.Vector3();

export function createSteps(ctx, P) {
  const input = ctx.input;
  const S = {
    init: false, t: 0,
    yLP: 0, base: 0, stand: 0, vy: 0, prevYLP: 0,
    pitch: 0, pitchRate: 0, hx: 0, hz: 0, hSpeed: 0,
    // extremum tracking
    dir: 1, maxY: -Infinity, minY: Infinity, peakY: 0, descPeak: 0, pitchMax: 0,
    // steps
    lastStepT: -1e9, firstStepT: -1e9, lastHeadStepT: -1e9,
    intervals: new RingBuffer(8), amps: new RingBuffer(6),
    foot: 'R',
    state: 'idle',            // 'idle' | 'provisional' | 'moving'
    cadence: 0,               // spm used for speed (median of last 4 intervals)
    cadenceDisp: 0,
    lastCadence: 0, lastMovingT: -1e9,
    ampEMA: 0.012,
    // suppression
    detDuck: false, suppressUntil: -1e9, holdUntil: -1e9,
    aMinEff: 0.009,
    // simulated stepping
    sim: { spm: 0, until: -1e9, next: 0 },
    vsim: { next: 0, on: false },
    // arms
    arms: {
      left: { hi: 0, lo: 0, dir: 0, lastRev: -1e9, amp: 0, v: 0 },
      right: { hi: 0, lo: 0, dir: 0, lastRev: -1e9, amp: 0, v: 0 },
      anti: 0, swinging: false, lastArmStepT: -1e9,
    },
    reject: { amp: 0, small: 0, descent: 0, interval: 0, nod: 0, squat: 0, suppressed: 0 },
  };

  const curve = (spm) => piecewise(CADENCE_CURVE, spm);
  const aMinBase = () => STEP.aMin[ctx.settings.get('stepSensitivity')] || STEP.aMin.mid;

  function stopTimeout() {
    const m = S.intervals.len ? ringMedian(S.intervals, 4) : 0.6;
    // §2.1 says clamp(1.6·m, 0.45, 0.9); a steady slow rhythm (50–66 spm, m > 0.9 s) must not stop
    // between its own steps, so never wait less than one interval + 0.25 s
    return Math.max(clamp(1.6 * m, 0.45, 0.9), m + 0.25);
  }

  function registerStep(t, A, source) {
    const interval = t - S.lastStepT;
    const fresh = S.state === 'idle' || interval > Math.max(STEP.confirmWindow, stopTimeout() + 0.1);
    S.lastStepT = t;
    if (source === 'head' || source === 'sim') S.lastHeadStepT = t;
    S.foot = S.foot === 'L' ? 'R' : 'L';
    S.amps.push(A);
    S.ampEMA += (A - S.ampEMA) * 0.35;
    P.steps++;
    if (fresh) {
      S.state = 'provisional';
      S.firstStepT = t;
      S.intervals.clear();          // a new start sets a new rhythm (the old cadence is only the first guess)
    } else {
      if (interval >= STEP.minInterval) S.intervals.push(interval);
      if (S.state === 'provisional' && interval >= 0.25 && interval <= STEP.confirmWindow) S.state = 'moving';
      else if (S.state === 'provisional' && interval < 0.25) S.state = 'moving';
    }
    if (S.intervals.len) S.cadence = clamp(60 / ringMedian(S.intervals, 4), 0, 280);
    else S.cadence = S.lastCadence > 0 && t - S.lastMovingT < 3 ? S.lastCadence : 100;
    S.lastMovingT = t;
    S.lastCadence = S.cadence;
    const aMin = S.aMinEff;
    const strength = source === 'sim' ? clamp((S.sim.spm || S.cadence) / 185, 0.2, 1) : clamp((A - aMin) / Math.max(1e-3, 0.04 - aMin), 0, 1);
    let surface = 'grass';
    try { surface = ctx.world.surfaceAt(P.pos.x, P.pos.z) || 'grass'; } catch { /* stub */ }
    ctx.events.emit('step', { foot: S.foot, cadence: Math.round(S.cadence), speed: P.speed, strength, surface, source });
    if (P.onStep) P.onStep(source, S);
  }

  // ── head signal ──
  function updateHead(now, rdt) {
    const head = input.head;
    _n.set(0, -STEP.neckDown, STEP.neckBack).applyQuaternion(head.localQuat).add(head.localPos);
    const y = _n.y;
    if (!S.init) {
      S.init = true; S.yLP = S.base = S.stand = S.prevYLP = y; S.maxY = y; S.minY = y; S.dir = 1;
      S.hx = head.localPos.x; S.hz = head.localPos.z; S.pitch = pitchOfQuat(head.localQuat);
      return;
    }
    S.t += rdt;
    S.yLP += (y - S.yLP) * ema(STEP.tauLP, rdt);
    S.base += (S.yLP - S.base) * ema(STEP.tauBase, rdt);
    if (!S.detDuck) {
      // learn standing height: fast at first and when standing up taller, slow otherwise
      const tau = S.t < 2 ? 0.3 : S.yLP > S.stand + 0.04 ? 0.8 : STEP.tauStand;
      S.stand += (S.yLP - S.stand) * ema(tau, rdt);
    }
    const vyRaw = (S.yLP - S.prevYLP) / rdt;
    S.prevYLP = S.yLP;
    S.vy += (vyRaw - S.vy) * ema(STEP.tauVy, rdt);
    const pitch = pitchOfQuat(head.localQuat);
    S.pitchRate += (Math.abs(pitch - S.pitch) / rdt - S.pitchRate) * ema(0.04, rdt);
    S.pitch = pitch;
    const dx = head.localPos.x - S.hx, dz = head.localPos.z - S.hz;
    S.hx = head.localPos.x; S.hz = head.localPos.z;
    S.hSpeed += (Math.hypot(dx, dz) / rdt - S.hSpeed) * ema(0.08, rdt);

    // ducking (no steps while down and 0.25 s after; keep running speed 0.5 s)
    const duckNow = S.yLP < S.stand - STEP.duckDrop || (S.vy < -STEP.duckVy && S.yLP < S.stand - STEP.duckVyDrop);
    if (duckNow && !S.detDuck) {
      S.detDuck = true;
      if (S.state !== 'idle') S.holdUntil = Math.max(S.holdUntil, now + STEP.duckHold);
    } else if (!duckNow && S.detDuck) {
      S.detDuck = false;
      S.suppressUntil = Math.max(S.suppressUntil, now + STEP.duckRecover);
    }
    if (S.detDuck) S.suppressUntil = Math.max(S.suppressUntil, now + STEP.duckRecover);
    // side step / lean
    if (S.hSpeed > STEP.lateralSpeed) {
      S.suppressUntil = Math.max(S.suppressUntil, now + STEP.lateralHold);
      if (S.state !== 'idle') S.holdUntil = Math.max(S.holdUntil, now + STEP.lateralHold);
    }

    // effective threshold
    let aMin = aMinBase();
    const hs = Math.max(input.hands.left.speed, input.hands.right.speed);
    if (hs > STEP.swingHandSpeed) aMin *= STEP.swingAMinMul;
    if (ctx.settings.get('armAssist') && S.arms.swinging) aMin *= STEP.armAssistMul;
    S.aMinEff = aMin;

    // extremum tracking with hysteresis
    const h = Math.max(0.0018, 0.3 * aMin);
    if (S.dir > 0) {
      if (S.yLP > S.maxY) S.maxY = S.yLP;
      if (S.yLP < S.maxY - h) {           // peak confirmed → descending
        S.peakY = S.maxY; S.dir = -1; S.minY = S.yLP; S.descPeak = Math.max(0, -S.vy); S.pitchMax = S.pitchRate;
      }
    } else {
      if (S.yLP < S.minY) S.minY = S.yLP;
      if (-S.vy > S.descPeak) S.descPeak = -S.vy;
      if (S.pitchRate > S.pitchMax) S.pitchMax = S.pitchRate;
      if (S.yLP > S.minY + h) {           // valley confirmed → evaluate one step
        evaluate(now, S.peakY - S.minY, S.descPeak, S.pitchMax, aMin);
        S.dir = 1; S.maxY = S.yLP;
      }
    }
  }

  function evaluate(now, A, desc, pitchMax, aMin) {
    const R = S.reject;
    if (now < S.suppressUntil || S.detDuck) { R.suppressed++; return; }
    if (A < aMin) { R.small++; return; }
    if (A > STEP.maxAmp) { R.squat++; return; }
    if (desc < STEP.minDescent) { R.descent++; return; }
    if (now - S.lastStepT < STEP.minInterval) { R.interval++; return; }
    if (pitchMax > STEP.nodPitchRate && A < 2 * aMin) { R.nod++; return; }
    if (!P.enabled) return;
    registerStep(now, A, 'head');
  }

  // ── arms (§2.3): anti-phase forward/back swings along the body axis ──
  function updateArms(now, rdt) {
    const A = S.arms;
    const head = input.head;
    const yaw = P.bodyYawLocal != null ? P.bodyYawLocal : yawOfQuat(head.localQuat);
    const fx = Math.sin(yaw), fz = -Math.cos(yaw);
    let swingingHands = 0;
    for (const side of HANDS) {
      const hnd = input.hands[side];
      const a = A[side];
      if (!hnd.tracked) { a.lastRev = -1e9; a.dir = 0; continue; }
      const p = (hnd.localPos.x - head.localPos.x) * fx + (hnd.localPos.z - head.localPos.z) * fz;
      a.v = hnd.localVel.x * fx + hnd.localVel.z * fz;
      // a weapon swing (tip > 2 m/s) is not an arm step
      const tip = ctx.items?.tipSpeed ? ctx.items.tipSpeed(side) : 0;
      if (tip > 2) { a.lastRev = -1e9; a.dir = 0; continue; }
      if (a.dir === 0) { a.dir = 1; a.hi = a.lo = p; }
      if (a.dir > 0) {
        if (p > a.hi) a.hi = p;
        if (p < a.hi - 0.03) {               // turned back at the front
          a.amp = a.hi - a.lo; a.dir = -1; a.lo = p;
          if (a.amp >= STEP.armAmp) { a.lastRev = now; onArmRev(now, side); }
        }
      } else {
        if (p < a.lo) a.lo = p;
        if (p > a.lo + 0.03) {               // turned forward at the back
          a.amp = a.hi - a.lo; a.dir = 1; a.hi = p;
          if (a.amp >= STEP.armAmp) { a.lastRev = now; onArmRev(now, side); }
        }
      }
      if (now - a.lastRev < 0.8) swingingHands++;
    }
    A.anti += ((A.left.v * A.right.v < -0.01 ? 1 : A.left.v * A.right.v > 0.01 ? -1 : 0) - A.anti) * ema(0.4, rdt);
    A.swinging = swingingHands === 2 && A.anti > 0.1;
  }
  function onArmRev(now, side) {
    // arm-only walking (accessibility): every reversal of one arm = one step (anti-phase arms reverse together)
    if (!ctx.settings.get('armOnlyWalk')) return;
    const A = S.arms;
    const lead = input.hands.left.tracked && now - A.left.lastRev < 1.0 ? 'left' : 'right';
    if (side !== lead || !A.swinging) return;
    if (now - S.lastHeadStepT < 1.2) return;           // the head is already stepping
    if (now - A.lastArmStepT < STEP.minInterval) return;
    A.lastArmStepT = now;
    registerStep(now, 0.012, 'arms');
  }

  // ── synthetic steps ──
  function updateSim(now) {
    const sim = S.sim;
    if (sim.spm > 0 && now < sim.until) {
      let guard = 0;
      while (now >= sim.next && guard++ < 6) { registerStep(sim.next, 0.012 + clamp((sim.spm - 100) / 100, 0, 1) * 0.02, 'sim'); sim.next += 60 / sim.spm; }
    } else if (sim.spm > 0 && now >= sim.until) sim.spm = 0;
    // input.virtual.setCadence (desktop W, bot) — ignored in XR
    const vc = ctx.flags.xr ? 0 : input.virtual.cadence;
    if (vc > 0 && !(sim.spm > 0)) {
      if (!S.vsim.on) { S.vsim.on = true; S.vsim.next = now; }
      let guard = 0;
      while (now >= S.vsim.next && guard++ < 6) { registerStep(S.vsim.next, 0.012 + clamp((vc - 100) / 100, 0, 1) * 0.02, 'sim'); S.vsim.next += 60 / vc; }
    } else S.vsim.on = false;
  }

  const steps = {
    S,
    curve,
    simulate(spm, seconds) {
      const now = ctx.clock.time;
      S.sim.spm = Math.max(0, +spm || 0);
      S.sim.until = now + Math.max(0, +seconds || 0);
      S.sim.next = now;
    },
    update(dt) {
      const now = ctx.clock.time;
      const rdt = clamp(input.rawDt || ctx.clock.rawDt || dt || 1 / 60, 1e-3, 0.25);
      if (dt <= 0) return;                         // paused
      updateHead(now, rdt);
      updateArms(now, rdt);
      if (P.enabled) updateSim(now);
      // stop / cancel
      if (S.state === 'provisional' && now - S.firstStepT > STEP.confirmWindow && now > S.holdUntil) {
        S.state = 'idle'; S.cadence = 0;              // a lone bob: cancel the provisional start
      } else if (S.state === 'moving' && now - S.lastStepT > stopTimeout() && now > S.holdUntil) {
        S.state = 'idle'; S.cadence = 0;
      }
      S.cadenceDisp += ((S.state === 'idle' ? 0 : S.cadence) - S.cadenceDisp) * ema(0.5, rdt);
    },
    /** 0..1 share of the cadence-curve speed the stepping state allows */
    stateFactor() {
      if (S.state === 'idle') return 0;
      if (S.state === 'provisional') return 0.5;
      return 1;
    },
    /** gait zone of the current cadence */
    gait() {
      if (S.state === 'idle') return 'idle';
      const c = S.cadence;
      return c >= GAIT_ZONES.sprint ? 'sprint' : c >= GAIT_ZONES.jog ? 'jog' : c >= GAIT_ZONES.walk ? 'walk' : 'idle';
    },
    /** vigor 0.9..1.15 from the bob amplitude (9 → 40 mm), +0.05 with arm assist */
    vigor() {
      let v = 0.9 + 0.25 * clamp((S.ampEMA - 0.009) / 0.031, 0, 1);
      if (ctx.settings.get('armAssist') && S.arms.swinging) v += STEP.armVigor;
      return v;
    },
    armOnly() { return ctx.clock.time - S.lastHeadStepT > 1.2 && ctx.clock.time - S.arms.lastArmStepT < 1.2; },
    get standY() { return S.stand; },
    get detDuck() { return S.detDuck; },
    reset() { S.init = false; S.state = 'idle'; S.cadence = 0; S.intervals.clear(); },
  };
  return steps;
}

export { wrapPi };
