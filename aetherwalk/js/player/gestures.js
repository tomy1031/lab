// js/player/gestures.js — body gestures for talking to people (DESIGN_V2 §1.7), OPUS-A.
// gesture { kind: 'wave'|'nod'|'shake', hand } is emitted when:
//  · wave  — a hand above the shoulder swings side to side: 3 turns (≥ 7 cm apart) within 1.2 s
//  · nod   — the head pitches down / up: 3 turns (≥ 6°) within 1.0 s, the yaw nearly still
//  · shake — the head yaws left / right: 3 turns (≥ 7°) within 1.0 s, the pitch nearly still
// Not while running, gliding or climbing (nods / shakes only when not stepping), nor while that hand swings a
// weapon fast; one gesture per 1.2 s each.
// Each detector follows the swing between turns (a turn = the signal comes back by the threshold from its last
// extreme), so slow looking around, a single nod-like dip or walking bob does not count. No allocation per frame.
import * as THREE from 'three';
import { wrapPi } from '../core/util.js';
const HANDS = ['left', 'right'];
const _e = new THREE.Euler(0, 0, 0, 'YXZ'), _v = new THREE.Vector3();

/** turns of a 1-D signal: a turn is counted when it reverses by ≥ amp from its last extreme */
function makeOsc(amp, win, need) {
  return { amp, win, need, ext: 0, lo: 0, hi: 0, dir: 0, init: false, turns: [0, 0, 0, 0, 0, 0], n: 0, lastFire: -10 };
}
function turn(o, t) {
  if (o.n < o.turns.length) o.turns[o.n++] = t; else { o.turns.copyWithin(0, 1); o.turns[o.turns.length - 1] = t; }
}
function feed(o, x, t) {
  if (!o.init) { o.lo = o.hi = o.ext = x; o.dir = 0; o.init = true; o.n = 0; return false; }
  if (o.dir === 0) {
    // the first swing: which way does it go?
    o.lo = Math.min(o.lo, x); o.hi = Math.max(o.hi, x);
    if (x - o.lo >= o.amp) { o.dir = 1; o.ext = x; } else if (o.hi - x >= o.amp) { o.dir = -1; o.ext = x; }
  } else if (o.dir > 0) {
    if (x > o.ext) o.ext = x;
    else if (o.ext - x >= o.amp) { turn(o, t); o.dir = -1; o.ext = x; }      // turned at the top
  } else {
    if (x < o.ext) o.ext = x;
    else if (x - o.ext >= o.amp) { turn(o, t); o.dir = 1; o.ext = x; }      // turned at the bottom
  }
  // forget turns older than the window
  let k = 0;
  while (k < o.n && t - o.turns[k] > o.win) k++;
  if (k) { o.turns.copyWithin(0, k, o.n); o.n -= k; }
  if (o.n >= o.need && t - o.lastFire > 1.2) { o.lastFire = t; o.n = 0; return true; }
  return false;
}
const reset = (o) => { o.init = false; o.n = 0; };

export function createGestures(ctx, P) {
  const input = ctx.input;
  const wave = { left: makeOsc(0.07, 1.2, 3), right: makeOsc(0.07, 1.2, 3) };
  const nod = makeOsc(6 * Math.PI / 180, 1.0, 3);
  const shake = makeOsc(7 * Math.PI / 180, 1.0, 3);
  let yawRef = 0, yawInit = false, pitchMin = 0, pitchMax = 0, yawMin = 0, yawMax = 0, spanT = 0;
  const ev = { kind: '', hand: null };
  function emit(kind, hand) { ev.kind = kind; ev.hand = hand; ctx.events.emit('gesture', ev); }

  function update(dt) {
    if (dt <= 0) return;
    const t = ctx.clock.time;
    const busy = !P.enabled || P.gliding || P.climbing || P.mantling || P.gait === 'jog' || P.gait === 'sprint';
    const head = input.head;
    // ── head: pitch (nod) and yaw relative to a slowly following reference (shake) ──
    _e.setFromQuaternion(head.localQuat);
    const pitch = _e.x;
    if (!yawInit) { yawRef = _e.y; yawInit = true; }
    const yaw = wrapPi(_e.y - yawRef);
    yawRef = wrapPi(yawRef + yaw * Math.min(1, dt / 2.0));         // forgets a turn of the body over ~2 s
    // the spread of the other axis over the last second (a nod keeps the yaw still and vice versa)
    spanT += dt;
    if (spanT > 1.0) { spanT = 0; pitchMin = pitchMax = pitch; yawMin = yawMax = yaw; }
    pitchMin = Math.min(pitchMin, pitch); pitchMax = Math.max(pitchMax, pitch);
    yawMin = Math.min(yawMin, yaw); yawMax = Math.max(yawMax, yaw);
    const headMoving = Math.hypot(P.vel.x, P.vel.z) > 0.6;
    // head gestures only when standing (stepping in place bobs the head)
    if (busy || headMoving || P.gait !== 'idle' || !head.localPos) { reset(nod); reset(shake); }
    else {
      if (feed(nod, pitch, t) && yawMax - yawMin < 0.2) emit('nod', null);
      if (feed(shake, yaw, t) && pitchMax - pitchMin < 0.2 && Math.abs(pitch) < 0.7) emit('shake', null);
    }
    // ── hands: a wave above the shoulder, side to side across the view ──
    const shoulderY = head.localPos.y - 0.25 * (P.headHeight / Math.max(1, P.standHeight || 1.6));
    const rx = Math.cos(_e.y), rz = -Math.sin(_e.y);              // the head's right axis (local)
    for (const hand of HANDS) {
      const hd = input.hands[hand];
      const o = wave[hand];
      const swinging = (ctx.items?.tipSpeed?.(hand) || 0) > 3;
      if (busy || !hd.tracked || swinging || hd.localPos.y < shoulderY) { reset(o); continue; }
      _v.copy(hd.localPos).sub(head.localPos);
      const lateral = _v.x * rx + _v.z * rz;
      if (feed(o, lateral, t)) emit('wave', hand);
    }
  }
  return { update };
}
