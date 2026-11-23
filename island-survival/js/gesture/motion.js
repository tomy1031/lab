// gesture/motion.js — turns per-frame hand landmarks into motion gestures for the survival actions.
// Pure logic (no DOM): feed it MediaPipe landmark arrays + dt; read `events` (one-shot) and `state` (continuous).
//
// Coordinates: landmarks are camera-image space (x right, y down, 0…1, NOT mirrored). The recogniser mirrors
// x so that "right" means the player's right, and measures speeds in palm-sizes per second so the
// distance to the camera does not change the thresholds.
//
// One-shot events (state.events, cleared every update):
//   pose     {hand, pose}                hand shape changed (open | fist | point | gun | peace | call | other)
//   pinch    {hand, x, y} / pinchEnd     thumb + index tips touch / part         → pick up, gather, UI click
//   grab     {hand} / release {hand}     open → fist / fist → open quickly        → grab, pull net, let go
//   swing    {hand, dir, speed, pose}    a fast stroke (dir: down | up | left | right) → chop, hammer, hit, cast
//   push     {hand} / pull {hand}        hand comes toward / goes away from the camera fast → throw, thrust, yank
//   reel     {hand, dir}                 a quarter turn of a circling hand        → reel in a fishing line
//   rub      {strokes}                   two hands sliding past each other, each reversal  → fire by friction
//   strike   {}                          two fists knock together fast            → flint & steel sparks
//   loose    {power}                     bow: the drawing hand opens after drawing → shoot an arrow
//   shoot    {}                          gun pose: thumb drops or the hand kicks up → fire the gun
//   wave     {hand}                      open hand waved side to side             → call the companion
//   throw    {hand, speed}               fist opens while the hand moves fast     → throw a net / spear / stone
// Continuous state:
//   hands[]  { id, x, y, size, pose, pinch, vx, vy, speed }   (x, y mirrored screen space 0…1)
//   draw     0…1 bow draw amount, aim {x, y} gun / pointing hand fingertip, count
import { LM, classify, palmCenter, palmSize, pinchRatio } from './pose.js';

const HIST = 0.6; // seconds of history per hand

export class MotionRecognizer {
  constructor(opts = {}) {
    this.o = {
      swingSpeed: 5.5,      // palm-sizes per second for a stroke
      pushRatio: 0.22,      // relative palm-size change within 0.25 s
      refractory: 0.32,     // seconds between strokes of one hand
      sensitivity: 1,
      ...opts,
    };
    this.tracks = new Map(); // id → track
    this.nextId = 1;
    this.state = { hands: [], draw: 0, aim: null, events: [], count: 0, rubStrokes: 0 };
    this.t = 0;
    this.rub = { lastSign: 0, strokes: 0, lastT: -9 };
    this.bow = { active: false, base: 0, drawHand: null, max: 0 };
    this.strikeCd = 0;
  }

  setSensitivity(s) { this.o.sensitivity = s; }

  emit(type, extra = {}) { this.state.events.push({ type, t: this.t, ...extra }); }

  /** hands: array of 21-point landmark arrays; handedness: optional ['Left'|'Right'] */
  update(hands, dt, aspect = 4 / 3, handedness = null) {
    this.t += dt;
    const st = this.state;
    st.events = [];
    st.count = hands.length;
    this.strikeCd = Math.max(0, this.strikeCd - dt);
    const sens = this.o.sensitivity;

    // ---- associate detections with tracks (nearest palm centre)
    const dets = hands.map((lm, i) => {
      const c = palmCenter(lm);
      return { lm, x: 1 - c.x, y: c.y, size: palmSize(lm, aspect), pose: classify(lm, aspect), pinchR: pinchRatio(lm, aspect), label: handedness?.[i] || null };
    });
    const used = new Set();
    const live = [];
    for (const d of dets) {
      let best = null, bd = 0.25;
      for (const tr of this.tracks.values()) {
        if (used.has(tr)) continue;
        const dd = Math.hypot(tr.x - d.x, tr.y - d.y);
        if (dd < bd) { bd = dd; best = tr; }
      }
      if (!best) { best = this.newTrack(d); }
      used.add(best);
      this.step(best, d, dt, aspect, sens);
      live.push(best);
    }
    // drop tracks not seen for a while
    for (const [id, tr] of this.tracks) {
      if (!used.has(tr)) { tr.lost += dt; if (tr.lost > 0.35) this.tracks.delete(id); }
    }

    // ---- two-hand gestures
    if (live.length >= 2) {
      const [a, b] = live[0].x < live[1].x ? [live[0], live[1]] : [live[1], live[0]];
      this.twoHands(a, b, dt);
    } else {
      this.bowRelease(false);
      this.rub.lastSign = 0;
    }
    // ---- single-hand bow (pinch, pull down/back) when only one hand is visible
    if (live.length === 1) this.oneHandBow(live[0]);

    // gun / pointing aim
    const gunHand = live.find((h) => h.pose === 'gun') || live.find((h) => h.pose === 'point');
    st.aim = gunHand ? { x: gunHand.tipX, y: gunHand.tipY, pose: gunHand.pose } : null;
    st.hands = live.map((h) => ({ id: h.id, x: h.x, y: h.y, size: h.size, pose: h.pose, pinch: h.pinch, vx: h.vx, vy: h.vy, speed: h.speed, tipX: h.tipX, tipY: h.tipY }));
    return st;
  }

  newTrack(d) {
    const tr = { id: this.nextId++, x: d.x, y: d.y, size: d.size, pose: d.pose, pinch: false, hist: [], vx: 0, vy: 0, speed: 0, lost: 0,
      lastStroke: -9, poseT: 0, prevPose: d.pose, prevPoseT: -9, ang: null, turn: 0, waveSign: 0, waveFlips: [], tipX: 0.5, tipY: 0.5, gunT: -9, label: d.label };
    this.tracks.set(tr.id, tr);
    return tr;
  }

  step(tr, d, dt, aspect, sens) {
    const t = this.t;
    tr.lost = 0;
    const px = tr.x, py = tr.y;
    // light smoothing
    const k = 1 - Math.exp(-28 * dt);
    tr.x += (d.x - tr.x) * k; tr.y += (d.y - tr.y) * k;
    tr.size += (d.size - tr.size) * (1 - Math.exp(-18 * dt));
    const ps = Math.max(0.03, tr.size);
    // velocity in palm sizes / s (x scaled by aspect so both axes are in the same units)
    const ivx = ((tr.x - px) * aspect) / ps / Math.max(dt, 1e-3), ivy = (tr.y - py) / ps / Math.max(dt, 1e-3);
    const kv = 1 - Math.exp(-20 * dt);
    tr.vx += (ivx - tr.vx) * kv; tr.vy += (ivy - tr.vy) * kv;
    tr.speed = Math.hypot(tr.vx, tr.vy);
    tr.hist.push({ t, x: tr.x, y: tr.y, size: tr.size, pose: d.pose });
    while (tr.hist.length && t - tr.hist[0].t > HIST) tr.hist.shift();
    const tip = d.lm[LM.INDEX_TIP];
    tr.tipX = 1 - tip.x; tr.tipY = tip.y;

    // ---- pose changes, grab / release
    if (d.pose !== tr.pose) {
      tr.prevPose = tr.pose; tr.prevPoseT = t;
      const from = tr.pose;
      tr.pose = d.pose;
      this.emit('pose', { hand: tr.id, pose: d.pose, from });
      if ((from === 'open' || from === 'other') && d.pose === 'fist') this.emit('grab', { hand: tr.id });
      if (from === 'fist' && (d.pose === 'open' || d.pose === 'other')) {
        this.emit('release', { hand: tr.id });
        if (tr.speed > this.o.swingSpeed * 0.55 / sens || this.sizeChange(tr, 0.3) > this.o.pushRatio * 0.6) this.emit('throw', { hand: tr.id, speed: tr.speed });
      }
      // gun: thumb folds (gun → point) = trigger
      if (from === 'gun' && d.pose === 'point') this.emit('shoot', { hand: tr.id, how: 'thumb' });
      if (d.pose === 'gun') tr.gunT = t;
    }
    // gun: a quick upward kick of the hand also fires
    if (tr.pose === 'gun' && tr.vy < -this.o.swingSpeed * 0.8 / sens && t - tr.lastStroke > this.o.refractory) {
      tr.lastStroke = t;
      this.emit('shoot', { hand: tr.id, how: 'kick' });
    }

    // ---- pinch with hysteresis
    const was = tr.pinch;
    tr.pinch = was ? d.pinchR < 0.5 : d.pinchR < 0.3;
    if (tr.pinch && !was) this.emit('pinch', { hand: tr.id, x: tr.tipX, y: tr.tipY });
    if (!tr.pinch && was) this.emit('pinchEnd', { hand: tr.id });

    // ---- strokes (swing) at the velocity peak
    const thr = this.o.swingSpeed / sens;
    if (tr.speed > thr && t - tr.lastStroke > this.o.refractory && tr.pose !== 'gun') {
      tr.lastStroke = t;
      const ax = Math.abs(tr.vx), ay = Math.abs(tr.vy);
      const dir = ay >= ax ? (tr.vy > 0 ? 'down' : 'up') : (tr.vx > 0 ? 'right' : 'left');
      this.emit('swing', { hand: tr.id, dir, speed: tr.speed, pose: tr.pose });
    }

    // ---- push / pull (size change over 0.25 s)
    const ch = this.sizeChange(tr, 0.25);
    if (Math.abs(ch) > this.o.pushRatio / sens && t - (tr.lastPush || -9) > 0.45) {
      tr.lastPush = t;
      this.emit(ch > 0 ? 'push' : 'pull', { hand: tr.id, amount: ch });
    }

    // ---- circling (reel): accumulate the turning of the velocity direction
    if (tr.speed > 1.6 / sens) {
      const a = Math.atan2(tr.vy, tr.vx);
      if (tr.ang !== null) {
        let da = a - tr.ang;
        while (da > Math.PI) da -= 2 * Math.PI;
        while (da < -Math.PI) da += 2 * Math.PI;
        if (Math.abs(da) < 1.2) tr.turn += da;
      }
      tr.ang = a;
      if (Math.abs(tr.turn) > Math.PI / 2) { this.emit('reel', { hand: tr.id, dir: Math.sign(tr.turn) }); tr.turn = 0; }
    } else { tr.ang = null; tr.turn *= 0.9; }

    // ---- wave: open hand, horizontal reversals
    if (tr.pose === 'open' && Math.abs(tr.vx) > 2.2 / sens) {
      const s = Math.sign(tr.vx);
      if (s !== tr.waveSign) { tr.waveSign = s; tr.waveFlips.push(t); }
      tr.waveFlips = tr.waveFlips.filter((x) => t - x < 1.4);
      if (tr.waveFlips.length >= 4) { tr.waveFlips = []; this.emit('wave', { hand: tr.id }); }
    }
  }

  /** relative palm-size change over the last `win` seconds (+ = toward the camera) */
  sizeChange(tr, win) {
    const h = tr.hist;
    if (h.length < 2) return 0;
    let old = h[0];
    for (const e of h) { if (this.t - e.t <= win) { old = e; break; } }
    return (tr.size - old.size) / Math.max(0.03, old.size);
  }

  twoHands(a, b, dt) {
    // a = player's left on screen (smaller x), b = right
    const sep = Math.hypot(b.x - a.x, b.y - a.y);
    const avg = (a.size + b.size) / 2 || 0.1;
    // ---- rub: opposite vertical or horizontal motion, alternating
    const rv = (a.vy - b.vy), rh = (a.vx - b.vx);
    const rel = Math.abs(rv) > Math.abs(rh) ? rv : rh;
    if (Math.abs(rel) > 3.0 / this.o.sensitivity && sep / avg < 3.2) {
      const s = Math.sign(rel);
      if (s !== this.rub.lastSign) {
        if (this.rub.lastSign !== 0) { this.rub.strokes++; this.emit('rub', { strokes: this.rub.strokes }); }
        this.rub.lastSign = s; this.rub.lastT = this.t;
      }
    }
    if (this.t - this.rub.lastT > 1.2) { this.rub.lastSign = 0; }
    this.state.rubStrokes = this.rub.strokes;
    // ---- strike: two fists closing in fast
    const closing = -((b.vx - a.vx) * (b.x - a.x) + (b.vy - a.vy) * (b.y - a.y)) / Math.max(1e-3, sep);
    if (a.pose === 'fist' && b.pose === 'fist' && sep / avg < 1.9 && closing > 2.5 / this.o.sensitivity && this.strikeCd <= 0) {
      this.strikeCd = 0.35;
      this.emit('strike', {});
    }
    // ---- bow: one hand pinching (the string), the other holds the bow; drawing = separation grows
    const drawHand = a.pinch ? a : b.pinch ? b : null;
    if (drawHand) {
      if (!this.bow.active) { this.bow = { active: true, base: sep / avg, drawHand: drawHand.id, max: 0, two: true }; }
      const amount = Math.max(0, Math.min(1, (sep / avg - this.bow.base) / 2.6));
      this.bow.max = Math.max(this.bow.max, amount);
      this.state.draw = amount;
    } else this.bowRelease(true);
  }

  oneHandBow(h) {
    // pinch, then pull the hand down/back: draw grows with the distance from where the pinch started
    if (h.pinch) {
      if (!this.bow.active) this.bow = { active: true, startX: h.x, startY: h.y, startSize: h.size, drawHand: h.id, max: 0, two: false };
      if (!this.bow.two) {
        const d = Math.hypot(h.x - this.bow.startX, h.y - this.bow.startY) / Math.max(0.03, h.size) + Math.max(0, (this.bow.startSize - h.size) / this.bow.startSize) * 3;
        const amount = Math.max(0, Math.min(1, d / 2.4));
        this.bow.max = Math.max(this.bow.max, amount);
        this.state.draw = amount;
      }
    } else this.bowRelease(true);
  }

  bowRelease(fire) {
    if (this.bow.active) {
      if (fire && this.state.draw > 0.25) this.emit('loose', { power: this.state.draw });
      this.bow = { active: false, base: 0, drawHand: null, max: 0 };
    }
    this.state.draw = 0;
  }
}
