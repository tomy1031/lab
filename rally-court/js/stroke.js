// js/stroke.js — how a tennis player moves the racket, as keyframes of real technique, for the CPU's figure, your
// figure on PC, and the PC stroke's physics racket.
//
//   forehand   unit turn with the free arm across, racket up and back → the drop ("pat the dog") → the head lags
//              behind the hand → contact in front, low to high → windshield-wiper finish over the opposite
//              shoulder, the free hand catching the throat
//   backhand   two-handed: both hands on the grip all the way, turn, drop, contact, finish over the right shoulder
//   slice      one-handed, high take-back with an open face, high to low, the free arm going back for balance
//   volley     short punch, the head above the wrist
//   serve      the stance with the ball at the throat → the toss arm up and the racket to the trophy position →
//              the racket drop behind the back → up edge-first and pronating into the contact → across the body
//   ready      both hands on the racket in front (the free hand cradling the throat)
//
// Local frame: facing +z, the player's right is −x, y up, origin on the ground between the feet. Phase u: −1 end
// of the take-back, 0 contact, +1 finish. Keys hold the racket hand's position H (the middle of the grip), the shaft
// D (hand → head), the hitting face's normal N (toward the target), the torso turn T (+ = chest toward −x), lean,
// knee bend, jump, the free hand (a position or attached at `attach` m along the shaft) and the elbows' poles.
// At u = 0 the head is exactly at the contact point and moves at a realistic speed per unit of u.
import * as THREE from 'three';
import { RACKET } from './racket.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const LH = RACKET.headC;
export const SERVE_POINT = V(-0.2, 2.68, 0.3);      // matches ai.js SERVE_CONTACT / SERVE_FRONT

/** key helper. o: { off: V | {attach}, offPose, T, lean, crouch, jump, poleR, poleL } */
function K(u, H, D, N, o = {}) { return { u, H, D: D.clone().normalize(), N: N.clone().normalize(), ...o }; }
/** contact key: the hand placed so that the head is at C */
function KC(C, D, N, o) { const d = D.clone().normalize(); return K(0, C.clone().addScaledVector(d, -LH), d, N, o); }

const C_FH = V(-0.85, 0.95, 0.4), C_BH = V(0.8, 0.95, 0.45), C_FV = V(-0.78, 1.1, 0.55), C_BV = V(0.75, 1.1, 0.55);
const THROAT = 0.26, HANDLE = 0.095;
const PR = V(-0.35, -1, -0.55), PL = V(0.35, -1, -0.55);    // default elbow directions: down, out and back

const SETS = {
  fh: { C: C_FH, face: 1, keys: [
    K(-1.0, V(-0.42, 1.36, -0.3), V(0.12, 0.8, -0.58), V(-0.85, -0.2, 0.45), { T: 1.3, lean: 0.12, off: V(-0.1, 1.27, 0.52), offPose: 'open', poleR: V(-0.4, -0.7, -0.6) }),
    K(-0.62, V(-0.6, 1.12, -0.36), V(0.05, -0.35, -0.94), V(-0.5, -0.8, 0.3), { T: 1.05, lean: 0.14, off: V(0.02, 1.22, 0.48), offPose: 'open' }),
    K(-0.32, V(-0.62, 0.92, -0.08), V(-0.5, -0.45, -0.74), V(-0.4, -0.35, 0.85), { T: 0.65, lean: 0.16, off: V(0.2, 1.15, 0.42), offPose: 'relaxed', poleR: V(-0.3, -1, -0.3) }),
    KC(C_FH, V(-0.95, -0.04, -0.16), V(0.08, -0.1, 1), { T: 0.12, lean: 0.18, off: V(0.36, 1.08, 0.2), offPose: 'relaxed', poleR: V(-0.2, -1, 0) }),
    K(0.3, V(-0.18, 1.12, 0.62), V(-0.55, 0.5, 0.67), V(0.6, 0.1, 0.8), { T: -0.45, lean: 0.14, off: V(0.42, 1.12, 0.02), offPose: 'relaxed', poleR: V(-0.3, -0.6, 0.6) }),
    K(0.65, V(0.16, 1.4, 0.4), V(0.35, 0.85, -0.35), V(0.9, -0.3, 0.3), { T: -0.8, lean: 0.1, off: V(0.42, 1.24, -0.05), offPose: 'relaxed', poleR: V(-0.2, -0.2, 1) }),
    K(1.0, V(0.28, 1.5, 0.12), V(0.3, 0.25, -0.92), V(0.9, -0.3, 0.2), { T: -0.95, lean: 0.08, off: { attach: THROAT }, offPose: 'throat', poleR: V(-0.1, -0.3, 1) }),
  ] },
  bh: { C: C_BH, face: -1, twoHanded: true, keys: [
    K(-1.0, V(0.42, 1.2, -0.32), V(-0.15, 0.62, -0.77), V(0.7, -0.3, 0.65), { T: -1.35, lean: 0.12, off: { attach: HANDLE }, offPose: 'grip', poleR: V(0.2, -1, 0.4), poleL: V(0.6, -1, -0.3) }),
    K(-0.6, V(0.55, 1.0, -0.32), V(0.1, -0.4, -0.91), V(0.6, -0.6, 0.5), { T: -1.1, lean: 0.14, off: { attach: HANDLE }, offPose: 'grip' }),
    K(-0.3, V(0.56, 0.88, -0.02), V(0.55, -0.45, -0.7), V(0.35, -0.3, 0.88), { T: -0.6, lean: 0.16, off: { attach: HANDLE }, offPose: 'grip' }),
    // contact with the shoulders still a little closed (the right shoulder forward)
    KC(C_BH, V(0.94, -0.04, -0.2), V(-0.06, -0.1, 1), { T: -0.45, lean: 0.2, off: { attach: HANDLE }, offPose: 'grip', poleR: V(0.1, -1, 0.2), poleL: V(0.4, -1, -0.2) }),
    K(0.3, V(0.15, 1.15, 0.6), V(0.5, 0.5, 0.7), V(-0.6, 0.1, 0.8), { T: 0.3, lean: 0.14, off: { attach: HANDLE }, offPose: 'grip' }),
    K(0.65, V(-0.22, 1.45, 0.32), V(-0.3, 0.85, -0.35), V(-0.9, -0.3, 0.3), { T: 0.85, lean: 0.1, off: { attach: HANDLE }, offPose: 'grip', poleR: V(0, -0.3, 1), poleL: V(0.3, -0.3, 1) }),
    K(1.0, V(-0.32, 1.5, 0.05), V(-0.3, 0.25, -0.92), V(-0.9, -0.3, 0.2), { T: 1.0, lean: 0.08, off: { attach: HANDLE }, offPose: 'grip', poleR: V(0.2, -0.3, 1), poleL: V(0.3, -0.3, 1) }),
  ] },
  bhSlice: { C: C_BH, face: -1, keys: [
    K(-1.0, V(0.38, 1.42, -0.18), V(0.1, 0.75, -0.65), V(0.3, 0.6, 0.7), { T: -1.3, lean: 0.1, off: { attach: THROAT }, offPose: 'throat', poleR: V(0.3, -0.6, 0.6) }),
    K(-0.5, V(0.55, 1.25, -0.08), V(0.55, 0.45, -0.7), V(0.1, 0.5, 0.85), { T: -1.0, lean: 0.12, off: { attach: THROAT }, offPose: 'throat' }),
    K(-0.2, V(0.48, 1.05, 0.2), V(0.85, 0.25, -0.45), V(0.0, 0.4, 0.9), { T: -0.6, lean: 0.15, off: V(0.45, 1.15, -0.25), offPose: 'open' }),
    KC(C_BH, V(0.94, 0.12, -0.3), V(-0.05, 0.35, 1), { T: -0.6, lean: 0.2, off: V(0.55, 1.2, -0.4), offPose: 'open', poleR: V(0.2, -1, 0.2) }),
    K(0.4, V(0.05, 1.0, 0.7), V(0.2, 0.25, 0.95), V(-0.3, 0.6, 0.6), { T: -0.1, lean: 0.14, off: V(0.6, 1.25, -0.45), offPose: 'open' }),
    K(1.0, V(-0.3, 1.2, 0.6), V(-0.45, 0.55, 0.7), V(-0.6, 0.5, 0.4), { T: 0.15, lean: 0.1, off: V(0.6, 1.25, -0.45), offPose: 'open', poleR: V(0.3, -0.8, 0.2) }),
  ] },
  fhSlice: { C: C_FH, face: 1, keys: [
    K(-1.0, V(-0.4, 1.45, -0.2), V(-0.1, 0.75, -0.65), V(-0.3, 0.6, 0.7), { T: 1.2, lean: 0.1, off: V(-0.05, 1.3, 0.5), offPose: 'open' }),
    K(-0.4, V(-0.58, 1.22, -0.05), V(-0.6, 0.45, -0.65), V(-0.1, 0.5, 0.85), { T: 0.9, lean: 0.12, off: V(0.1, 1.25, 0.45), offPose: 'open' }),
    KC(C_FH, V(-0.94, 0.12, -0.3), V(0.05, 0.35, 1), { T: 0.3, lean: 0.16, off: V(0.3, 1.15, 0.25), offPose: 'relaxed' }),
    K(0.5, V(-0.1, 1.0, 0.7), V(-0.2, 0.25, 0.95), V(0.3, 0.6, 0.6), { T: 0.0, lean: 0.14, off: V(0.42, 1.18, 0.1), offPose: 'relaxed' }),
    K(1.0, V(0.25, 1.15, 0.55), V(0.45, 0.55, 0.7), V(0.6, 0.5, 0.4), { T: -0.2, lean: 0.1, off: V(0.45, 1.2, 0.0), offPose: 'relaxed' }),
  ] },
  fhVolley: { C: C_FV, face: 1, keys: [
    K(-1.0, V(-0.5, 1.22, 0.25), V(-0.45, 0.8, -0.25), V(0.1, 0.25, 1), { T: 0.6, lean: 0.12, off: V(-0.12, 1.25, 0.55), offPose: 'open' }),
    KC(C_FV, V(-0.82, 0.48, 0.1), V(0.05, 0.2, 1), { T: 0.25, lean: 0.15, off: V(0.25, 1.2, 0.35), offPose: 'relaxed' }),
    K(1.0, V(-0.2, 1.05, 0.75), V(-0.6, 0.45, 0.65), V(0.1, 0.3, 1), { T: 0.15, lean: 0.15, off: V(0.3, 1.18, 0.3), offPose: 'relaxed' }),
  ] },
  bhVolley: { C: C_BV, face: -1, keys: [
    K(-1.0, V(0.45, 1.22, 0.2), V(0.45, 0.8, -0.25), V(-0.1, 0.25, 1), { T: -0.7, lean: 0.12, off: { attach: THROAT }, offPose: 'throat' }),
    KC(C_BV, V(0.82, 0.48, 0.1), V(-0.05, 0.2, 1), { T: -0.55, lean: 0.18, off: V(0.45, 1.2, 0.0), offPose: 'open' }),
    K(1.0, V(0.15, 1.05, 0.7), V(0.55, 0.45, 0.65), V(-0.1, 0.3, 1), { T: -0.2, lean: 0.15, off: V(0.5, 1.2, -0.15), offPose: 'open' }),
  ] },
  serve: { C: SERVE_POINT, face: 1, fixed: true, keys: [
    // trophy: racket up behind the head, elbow at shoulder height, the toss arm reaching up, knees bent, back arched
    K(-1.0, V(-0.38, 1.6, -0.18), V(0.05, 0.85, -0.5), V(-0.9, 0.1, -0.3), { T: 1.2, lean: -0.18, crouch: 0.28, off: V(-0.1, 2.15, 0.33), offPose: 'open', poleR: V(-1, 0.1, -0.3), poleL: V(0.6, -0.4, -0.2) }),
    // racket drop behind the back, elbow up
    K(-0.55, V(-0.32, 1.8, -0.2), V(0.15, -0.9, -0.35), V(-0.9, 0.0, 0.3), { T: 0.95, lean: -0.12, crouch: 0.1, off: V(-0.04, 1.95, 0.35), offPose: 'open', poleR: V(-0.6, 0.7, -0.4), poleL: V(0.6, -0.5, -0.2) }),
    // up edge-first
    K(-0.22, V(-0.26, 2.15, -0.02), V(-0.05, 0.2, -0.98), V(-1, 0, 0), { T: 0.55, lean: 0.0, crouch: -0.12, jump: 0.05, off: V(0.16, 1.45, 0.3), offPose: 'relaxed', poleR: V(-0.5, 0.8, -0.2) }),
    // contact: full reach, the face pronated to the target
    KC(SERVE_POINT, V(0.04, 0.97, 0.22), V(0, -0.15, 1), { T: 0.2, lean: 0.12, crouch: -0.16, jump: 0.1, off: V(0.26, 1.25, 0.2), offPose: 'relaxed', poleR: V(-0.5, 0.3, -0.2) }),
    K(0.3, V(-0.1, 2.0, 0.65), V(0.2, 0.15, 0.97), V(0.5, -0.8, 0.3), { T: -0.2, lean: 0.3, crouch: -0.05, jump: 0.06, off: V(0.3, 1.15, 0.12), offPose: 'relaxed', poleR: V(-0.6, 0.0, 0.6) }),
    K(0.65, V(0.2, 1.25, 0.55), V(0.55, -0.6, 0.55), V(0.6, 0.4, 0.6), { T: -0.55, lean: 0.35, crouch: 0.15, off: V(0.3, 1.1, 0.02), offPose: 'relaxed', poleR: V(-0.3, -0.5, 1) }),
    K(1.0, V(0.35, 0.85, 0.15), V(0.35, -0.4, -0.85), V(0.6, 0.6, 0.0), { T: -0.6, lean: 0.3, crouch: 0.3, off: V(0.25, 1.05, -0.05), offPose: 'relaxed', poleR: V(-0.2, -0.6, 1) }),
  ] },
};
// before the trophy: the stance with the ball held against the throat, then the arms rising together
const SERVE_PRE = [
  K(0, V(-0.2, 1.05, 0.32), V(-0.25, 0.55, 0.8), V(-0.9, 0.1, 0.3), { T: 0.9, lean: 0.05, crouch: 0.05, off: { attach: THROAT }, offPose: 'ball' }),
  K(0.5, V(-0.36, 1.12, -0.12), V(0.0, -0.4, -0.92), V(-0.9, 0.0, 0.3), { T: 1.05, lean: -0.05, crouch: 0.15, off: V(-0.03, 1.6, 0.33), offPose: 'ball', poleR: V(-0.8, -0.6, -0.2), poleL: V(0.6, -0.6, -0.2) }),
  { ...SETS.serve.keys[0], u: 1 },
];
const READY = K(0, V(-0.12, 1.02, 0.36), V(0.3, 0.55, 0.78), V(-0.9, 0.2, 0.35), { T: 0.0, lean: 0.12, off: { attach: THROAT }, offPose: 'throat' });

// ── interpolation ─────────────────────────────────────────────────────
const tmp = { a: new THREE.Vector3(), b: new THREE.Vector3() };
function hermite(p0, p1, m0, m1, t, h, out) {
  const t2 = t * t, t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
  return out.set(0, 0, 0).addScaledVector(p0, h00).addScaledVector(m0, h10 * h).addScaledVector(p1, h01).addScaledVector(m1, h11 * h);
}
function tangent(keys, i, f) {
  const a = keys[Math.max(0, i - 1)], b = keys[Math.min(keys.length - 1, i + 1)];
  const du = b.u - a.u || 1;
  return f(b).clone().sub(f(a)).multiplyScalar(1 / du);
}
const num = (k, name, def) => (k[name] ?? def);
function offPoint(k) {
  if (k.off && k.off.attach != null) return k.H.clone().addScaledVector(k.D, k.off.attach);
  return k.off ? k.off.clone() : k.H.clone();
}

/** evaluate a key list at u */
function keyPose(k) {
  return {
    H: k.H.clone(), D: k.D.clone(), N: k.N.clone(), T: num(k, 'T', 0), lean: num(k, 'lean', 0.12), crouch: num(k, 'crouch', 0), jump: num(k, 'jump', 0),
    offP: offPoint(k), attach: k.off && k.off.attach != null ? k.off.attach : null, offPose: k.offPose,
    poleR: k.poleR ? k.poleR.clone().normalize() : null, poleL: k.poleL ? k.poleL.clone().normalize() : null,
  };
}
function evalKeys(keys, u) {
  if (u <= keys[0].u) return keyPose(keys[0]);
  const last = keys[keys.length - 1];
  if (u >= last.u) return keyPose(last);
  let i = 0;
  while (keys[i + 1].u < u) i++;
  const k0 = keys[i], k1 = keys[i + 1];
  const h = k1.u - k0.u, t = (u - k0.u) / h;
  const vec = (f) => hermite(f(k0), f(k1), tangent(keys, i, f), tangent(keys, i + 1, f), t, h, new THREE.Vector3());
  const H = vec((k) => k.H);
  const D = vec((k) => k.D).normalize();
  const N = vec((k) => k.N);
  const s = (name, def) => num(k0, name, def) + (num(k1, name, def) - num(k0, name, def)) * (t * t * (3 - 2 * t));
  const a0 = k0.off && k0.off.attach, a1 = k1.off && k1.off.attach;
  const attach = a0 != null && a1 != null ? a0 + (a1 - a0) * t : null;
  const offP = attach != null ? H.clone().addScaledVector(D, attach) : vec(offPoint);
  const lerpV = (x, y) => (x || y ? (x || y).clone().lerp(y || x, t).normalize() : null);
  return {
    H, D, N, T: s('T', 0), lean: s('lean', 0.12), crouch: s('crouch', 0), jump: s('jump', 0),
    offP, attach, offPose: t < 0.5 ? k0.offPose : k1.offPose, poleR: lerpV(k0.poleR, k1.poleR), poleL: lerpV(k0.poleL, k1.poleL),
  };
}

function setFor(sw) {
  if (sw.kind === 'serve') return SETS.serve;
  if (sw.kind === 'fh') return sw.volley ? SETS.fhVolley : sw.slice ? SETS.fhSlice : SETS.fh;
  if (sw.kind === 'bh') return sw.volley ? SETS.bhVolley : sw.slice ? SETS.bhSlice : SETS.bh;
  return null;
}

/** blend two evaluated poses (a → b by w) */
function blendPose(a, b, w) {
  if (w <= 0) return a; if (w >= 1) return b;
  const L = (x, y) => x.clone().lerp(y, w);
  const s = (x, y) => x + (y - x) * w;
  return {
    H: L(a.H, b.H), D: L(a.D, b.D).normalize(), N: L(a.N, b.N), T: s(a.T, b.T), lean: s(a.lean, b.lean), crouch: s(a.crouch, b.crouch), jump: s(a.jump, b.jump),
    offP: L(a.offP, b.offP), attach: a.attach != null && b.attach != null ? s(a.attach, b.attach) : (w < 0.5 ? a.attach : b.attach),
    offPose: w < 0.5 ? a.offPose : b.offPose, poleR: a.poleR && b.poleR ? L(a.poleR, b.poleR).normalize() : (a.poleR || b.poleR), poleL: a.poleL && b.poleL ? L(a.poleL, b.poleL).normalize() : (a.poleL || b.poleL),
    twoHanded: w < 0.5 ? a.twoHanded : b.twoHanded, sway: s(a.sway || 0, b.sway || 0),
  };
}

/**
 * The racket and the body for a stroke state sw: { kind: 'fh'|'bh'|'serve'|'ready', u, cH, reach, front, slice,
 * volley, prep (0…1 how far the take-back has gone while waiting), toss (serve: 0…1 before the trophy) }.
 * Returns { hand, shaft, face (the racket's +Z, the palm-side face), head, T, lean, crouch, jump, sway (hips toward
 * the ball, m along x), off (free hand
 * position), offAttach (m along the shaft, or null), offPose, poleR, poleL, twoHanded }.
 */
export function strokePose(sw) {
  const set = setFor(sw);
  let p;
  if (!set) p = evalKeys([READY], 0);
  else if (sw.kind === 'serve' && (sw.toss ?? 1) < 1 && (sw.u ?? -1) <= -1) {
    p = evalKeys(SERVE_PRE, Math.max(0, sw.toss ?? 0));
    p.face = 1;
  } else {
    const u = Math.max(-1, Math.min(1, sw.u ?? 0));
    p = evalKeys(set.keys, u);
    // shift the stroke so the contact lands on this ball (fully at the contact, partly elsewhere)
    if (!set.fixed) {
      const C = set.C;
      const s = C.x < 0 ? -1 : 1;
      const want = new THREE.Vector3(s * (sw.reach ?? Math.abs(C.x)), sw.cH ?? C.y, sw.front ?? C.z);
      const d = want.sub(C);
      const w = Math.exp(-(u / 0.5) * (u / 0.5));
      const shift = new THREE.Vector3(d.x * w, d.y * (0.55 + 0.45 * w), d.z * w);
      p.H.add(shift);
      if (p.attach == null) p.offP.add(shift.multiplyScalar(0.6)); else p.offP = p.H.clone().addScaledVector(p.D, p.attach);
      // bend lower for low balls; move the weight toward the ball through the contact
      p.crouch += Math.max(0, (C.y - (sw.cH ?? C.y))) * 0.9 * (0.4 + 0.6 * w);
      p.sway = s * 0.08 * Math.exp(-(u / 0.6) * (u / 0.6));
    }
    // waiting for the ball: blend from the ready position into the take-back
    if (u <= -1 && sw.prep != null && sw.prep < 1) p = blendPose(evalKeys([READY], 0), p, sw.prep);
    p.face = set.face;
    p.twoHanded = !!set.twoHanded;
  }
  // the racket's +Z (palm-side face): the hitting normal for palm-side strokes, its opposite for backhands
  const N = p.N.clone().multiplyScalar(p.face === -1 ? -1 : 1);
  N.addScaledVector(p.D, -N.dot(p.D)).normalize();
  const head = p.H.clone().addScaledVector(p.D, LH);
  return {
    hand: p.H, shaft: p.D, face: N, head, T: p.T, lean: p.lean, crouch: p.crouch || 0, jump: p.jump || 0, sway: p.sway || 0,
    off: p.offP, offAttach: p.attach ?? null, offPose: p.offPose || 'relaxed', poleR: p.poleR || PR, poleL: p.poleL || PL, twoHanded: !!p.twoHanded,
  };
}

/** speed of the racket head per unit of u at the contact (m/u), for timing a stroke to a racket-head speed */
export function contactSpeedPerU(kind, slice = false) {
  const e = 0.004;
  const a = strokePose({ kind, slice, u: -e }).head, b = strokePose({ kind, slice, u: e }).head;
  return a.distanceTo(b) / (2 * e);
}
