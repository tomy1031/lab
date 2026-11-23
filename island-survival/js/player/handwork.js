// player/handwork.js — doing things with your own hands (DESIGN §24): a "作業台" overlay with a 2D canvas where the
// player knaps, sharpens, twists cord, carves, weaves, stirs, tends food over the fire and places layers.
// 8 kinds of action (§24.2), each judging one skill (timing, rhythm, steadiness…) → a performance p (0–1).
// Inputs: mouse / keyboard, touch (pointer events) and hand gestures (game.hands: pinch = pointer down, plus
// swing / strike / rub / reel / pull / wave events). Settings: handwork = manual | assist | auto (§24.6).
//
//   const r = await game.handwork.run(flow, { title, key, scene: {...} })
//   r = { ok, p, feel: { bonus, label, timeMul, good, fail }, steps: [{ kind, p }], mode, quick, cancelled, failures: [], extra }
import { drawProp, drawHand, drawSpark } from '../ui/handwork-art.js';
import { drawCarcass } from '../ui/butcher-art.js';
// the trap / fieldcraft diagrams load lazily (a missing file must not take the whole work table down)
let TA = {};
import('../ui/trap-art.js').then((m) => { TA = m; }).catch(() => {});
import { HINTS, CONTROLS, KIND_NAMES, feelOf } from '../data/handwork.js';

const W = 800, H = 500;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const clamp01 = (v) => clamp(v, 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const cvOf = (a) => { if (a.length < 2) return 0; const m = mean(a); return m > 0 ? Math.sqrt(mean(a.map((v) => (v - m) ** 2))) / m : 0; };
const wrapAng = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ------------------------------------------------------------------ paths for trace (canvas coords)
function pathFor(id, i = 0) {
  const o = i * 18;
  switch (id) {
    case 'groove': return [[300, 262 + o], [360, 258 + o], [420, 258 + o], [480, 262 + o]];
    case 'cut': return [[400 + o, 220], [404 + o, 260], [400 + o, 300]];
    case 'notch': return [[470, 240], [486, 266], [502, 240]];
    case 'belly': return [[240, 270 + o], [320, 286 + o], [400, 292 + o], [480, 286 + o], [560, 270 + o]];
    case 'shaft': return [[230, 262], [330, 262], [430, 262], [560, 262]];
    case 'hook': return [[430, 200], [430, 280], [410, 310], [380, 300], [372, 276]];
    default: return [[300, 260], [500, 260]];
  }
}
function resample(pts) {
  const out = [], segs = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) { const l = dist(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]); segs.push(l); total += l; }
  const N = 60;
  for (let k = 0; k <= N; k++) {
    let d = (total * k) / N, i = 0;
    while (i < segs.length - 1 && d > segs[i]) { d -= segs[i]; i++; }
    const t = segs[i] ? d / segs[i] : 0;
    out.push([lerp(pts[i][0], pts[i + 1][0], t), lerp(pts[i][1], pts[i + 1][1], t)]);
  }
  return { pts: out, total };
}

// ------------------------------------------------------------------ the 8 kinds
class Kind {
  constructor(step, hw) {
    this.step = step; this.hw = hw; this.n = Math.max(1, Math.round(step.n || 1));
    this.count = 0; this.scores = []; this.done = false; this.t = 0; this.tol = hw.tol;
    this.need = this.n;  // in assist mode the runner lowers this and finishes the rest with the same p
  }
  get progress() { return clamp01(this.count / this.n); }
  get p() { return mean(this.scores); }
  record(s) { this.scores.push(clamp01(s)); this.count++; if (this.count >= this.n) this.done = true; }
  /** finish the remaining repetitions with a fixed score (assist / おまかせで 仕上げる) */
  autoFinish(score) { while (this.count < this.n) { this.scores.push(score); this.count++; } this.done = true; }
  update() {}
  draw() {}
  hand() { return null; }
}

// strike: hit when the shrinking ring meets the target (timing + position)
class Strike extends Kind {
  constructor(step, hw) {
    super(step, hw);
    this.T = 1.1 / (step.tempo || 1); this.phase = -0.4; this.miss2 = 0; this.down = 0;
    const sc = step.scene;
    this.targets = step.targets ? step.targets : sc === 'stake' ? [[400, 238]] : sc === 'filter' ? [[520, 190]] : sc === 'flint' ? [[372, 250], [380, 236], [366, 262]] : [[352, 300], [348, 268], [356, 334], [362, 246], [366, 352], [350, 286]];
    this.ti = 0;
  }
  get target() { const t = this.targets[this.ti % this.targets.length]; return this.step.scene === 'stake' ? [t[0], t[1] + this.hw.sc.depth * 70] : t; }
  update(dt, I) {
    this.t += dt; this.phase += dt; this.down = Math.max(0, this.down - dt * 4);
    if (this.phase < 0) return;
    const [tx, ty] = this.target;
    let hit = null;
    if (I.pressed) hit = [I.x, I.y, 1];
    else if (I.hit.has('Space') || I.hit.has('KeyE') || I.hit.has('Enter')) hit = [tx, ty, 0.92];
    else if (I.gest.some((e) => (e.type === 'swing' && e.dir === 'down') || e.type === 'strike')) hit = I.hand ? [I.hand.x, I.hand.y, 1] : [tx, ty, 0.95];
    const late = this.phase > this.T + 0.3 * this.tol;
    if (hit || late) {
      let s = 0;
      if (hit) {
        const timing = clamp01(1 - Math.abs(this.phase - this.T) / (0.25 * this.tol));
        const posF = 1 - Math.min(1, dist(hit[0], hit[1], tx, ty) / (40 * this.tol)) * 0.5;
        s = timing * posF * hit[2];
      }
      this.effect(s, tx, ty, !!hit);
      this.record(s);
      this.miss2 = s < 0.1 ? this.miss2 + 1 : 0;
      if (this.miss2 >= 2 && this.step.knap) this.hw.failures.add('core_cracked');
      this.ti++; this.phase = -0.25; this.down = 1;
    }
  }
  effect(s, x, y, hit) {
    const hw = this.hw, sc = hw.sc;
    if (this.step.scene === 'carcass') { const c = sc.carcass; if (c) { if (this.step.bstep === 'portion') c.portions = (c.portions || 0) + 1; if (s < 0.35) hw.extra.missedJoints = (hw.extra.missedJoints || 0) + 1; } hw.burst(x, y, 'dust', 3); hw.sfx(hit ? 'chop_weak' : null); hw.flash(s); return; }
    if (this.step.scene === 'core') { if (s >= 0.35) sc.chips = Math.min(6, (sc.chips || 0) + 1); if (hw.failures.has('core_cracked')) sc.cracked = true; }
    if (this.step.scene === 'stake') sc.depth = Math.min(1, (sc.depth || 0) + 0.12 + 0.14 * s);
    if (this.step.scene === 'flint') { if (s >= 0.3) { hw.burst(x + 20, y + 20, 'spark', 3 + Math.round(s * 4)); sc.heat = Math.max(sc.heat || 0, s); } hw.sfx('flint'); return; }
    hw.burst(x, y, s >= 0.7 ? 'chip' : 'dust', s >= 0.7 ? 7 : 4);
    if (s >= 0.8 && /chert|obsidian|flint/.test(sc.material || '')) hw.burst(x, y, 'spark', 3);
    hw.sfx(hit ? (s >= 0.6 ? 'stone_hit' : 'chop_weak') : null);
    hw.flash(s);
  }
  draw(ctx) {
    if (this.done) return;
    const [tx, ty] = this.target;
    const r0 = 16, R = 95;
    const ph = Math.max(0, this.phase);
    const r = ph <= this.T ? lerp(R, r0, ph / this.T) : Math.max(2, r0 * (1 - (ph - this.T) / 0.3));
    drawProp(ctx, 'ring', { x: tx, y: ty, r, r0, good: Math.abs(ph - this.T) < 0.09 * this.tol });
  }
  hand(I) {
    const [tx, ty] = this.target, ph = Math.max(0, this.phase);
    const raised = this.down > 0 ? 0 : clamp01(ph / this.T);
    // the striking hand waits to the lower right of the target so the ring stays visible; it lifts as the ring closes
    const x = (I.active ? I.x : tx) + 105, y = (I.active ? I.y : ty) + 120 - raised * 55;
    if (this.step.scene === 'flint') return { x, y, pose: 'grip', holding: 'blade', holdState: { kind: 'knife' }, rot: -0.9 - raised * 0.3 };
    return { x, y, pose: 'grip', holding: this.step.scene === 'stake' ? 'mallet' : 'hammerstone', rot: -0.55 - raised * 0.35 };
  }
}

// rub: steady back-and-forth (rhythm + speed band)
class Rub extends Kind {
  constructor(step, hw) {
    super(step, hw);
    this.halves = 0; this.needHalves = this.n * 2; this.dir = 0; this.ext = null; this.lastRev = null; this.iv = []; this.x = 400; this.lastKey = null;
    this.band = step.band ? [step.band[0] / this.tol, step.band[1] * this.tol] : [0.2 / this.tol, 0.65 * this.tol];
  }
  get progress() { return clamp01(this.halves / this.needHalves); }
  get count() { return Math.floor((this.halves || 0) / 2); }
  set count(v) { /* derived from halves */ }
  get p() {
    if (this.forcedP != null) return this.forcedP;
    if (this.iv.length < 2) return this.iv.length ? 0.5 : 0;
    const rhythm = clamp01(1 - cvOf(this.iv) / (0.5 * this.tol));
    const speed = this.iv.filter((v) => v >= this.band[0] && v <= this.band[1]).length / this.iv.length;
    return clamp01(0.5 * rhythm + 0.5 * speed);
  }
  reversal() {
    const now = this.t;
    if (this.lastRev != null) this.iv.push(now - this.lastRev);
    this.lastRev = now; this.halves++;
    if (this.halves % 2 === 0) this.hw.sfx('rub');
    const sc = this.hw.sc;
    if (this.step.scene === 'drill') { sc.heat = clamp01(this.progress * (0.4 + this.p)); this.hw.burst(400, 330, 'steam', Math.round(1 + sc.heat * 3)); if (sc.heat > 0.6) this.hw.burst(400, 336, 'ember', 1); }
    else this.hw.burst(this.x + (this.dir > 0 ? 60 : -60), 300, this.step.scene === 'whetstone' ? 'water' : 'dust', 2);
    sc.shine = clamp01(this.progress); sc.smooth = clamp01(this.progress);
    if (this.halves >= this.needHalves) this.done = true;
  }
  autoFinish(score) { this.forcedP = score; this.halves = this.needHalves; this.done = true; }
  update(dt, I) {
    this.t += dt;
    if (I.down) {
      const x = I.x;
      if (this.ext == null) this.ext = x;
      const d = x - this.ext;
      if (this.dir === 0 && Math.abs(d) > 20) { this.dir = Math.sign(d); this.ext = x; }
      else if (this.dir !== 0) {
        if (Math.sign(d) === this.dir) this.ext = x;
        else if (Math.abs(d) > 26) { this.reversal(); this.dir = -this.dir; this.ext = x; }
      }
      this.x = clamp(x, 280, 520);
    } else this.ext = null;
    for (const k of ['KeyA', 'ArrowLeft', 'KeyD', 'ArrowRight']) if (I.hit.has(k)) {
      const side = k === 'KeyA' || k === 'ArrowLeft' ? -1 : 1;
      if (this.lastKey !== side) { this.lastKey = side; this.dir = side; this.reversal(); this.x = 400 + side * 90; }
    }
    for (const e of I.gest) {
      if (e.type === 'rub' || (e.type === 'swing' && (e.dir === 'left' || e.dir === 'right') && e.dir !== this.lastSwing)) { this.lastSwing = e.dir; this.dir = -this.dir || 1; this.reversal(); this.x = 400 + this.dir * 90; }
    }
  }
  draw(ctx) {
    // speed gauge: where the last stroke sat against the green band
    const last = this.iv[this.iv.length - 1];
    const gx = 300, gw = 200, gy = 92;
    ctx.save();
    ctx.fillStyle = 'rgba(42,41,35,.10)'; ctx.fillRect(gx, gy, gw, 10);
    const f = (v) => gx + clamp01((v - 0.05) / 1.0) * gw;
    ctx.fillStyle = 'rgba(74,154,82,.45)'; ctx.fillRect(f(this.band[0]), gy, f(this.band[1]) - f(this.band[0]), 10);
    if (last != null) { ctx.fillStyle = '#2a2923'; ctx.fillRect(f(last) - 2, gy - 4, 4, 18); }
    ctx.font = '600 13px "Zen Maru Gothic", sans-serif'; ctx.fillStyle = '#5d5849'; ctx.textAlign = 'center';
    ctx.fillText('速い', gx - 22, gy + 10); ctx.fillText('遅い', gx + gw + 22, gy + 10);
    ctx.restore();
  }
  hand() { return this.step.scene === 'drill' ? { x: 440 + (this.x - 400) * 0.25, y: 250, pose: 'open', rot: -1.4 } : { x: this.x - 95, y: 345, pose: 'grip', rot: -0.15 }; } // on the handle / palms on the drill
}

// twist: circles while holding, then pull to tighten
class Twist extends Kind {
  constructor(step, hw) {
    super(step, hw);
    this.needQ = this.n * 4; this.acc = 0; this.rev = 0; this.dirSign = 0; this.prevAng = null; this.releases = 0; this.phase = 'turn';
    this.cx = 400; this.cy = 262; this.tightOK = false; this.tightT = 0; this.wasDown = false; this.pressY = null;
  }
  get progress() { return clamp01(this.acc / ((this.needQ * Math.PI) / 2)) * (this.step.tighten ? 0.9 : 1) + (this.phase === 'done' && this.step.tighten ? 0.1 : 0); }
  get count() { return Math.min(this.n, Math.floor(this.acc / (Math.PI * 2))); }
  set count(v) { /* derived */ }
  get p() {
    if (this.forcedP != null) return this.forcedP;
    const revR = this.rev / Math.max(0.5, this.acc + this.rev);
    const base = clamp01(1 - 0.15 * Math.min(3, this.releases) - revR * 1.2);
    return this.step.tighten ? base * 0.9 + (this.tightOK ? 0.1 : 0) : base;
  }
  autoFinish(score) { this.forcedP = score; this.acc = (this.needQ * Math.PI) / 2; this.phase = 'done'; this.done = true; }
  turn(d) {
    if (this.dirSign === 0 && Math.abs(d) > 0.04) this.dirSign = Math.sign(d);
    if (Math.sign(d) === this.dirSign) this.acc += Math.abs(d); else this.rev += Math.abs(d);
    const sc = this.hw.sc, pr = clamp01(this.acc / ((this.needQ * Math.PI) / 2));
    sc.wraps = Math.round(pr * 8); sc.progress = pr; sc.coils = Math.round(pr * 3);
    if (Math.floor(this.acc / (Math.PI / 2)) > (this.lastQ || 0)) { this.lastQ = Math.floor(this.acc / (Math.PI / 2)); if (this.lastQ % 4 === 0) this.hw.sfx('rustle'); }
    if (this.acc >= (this.needQ * Math.PI) / 2) { if (this.step.tighten) { this.phase = 'tighten'; this.tightT = 0; this.pressY = null; } else { this.phase = 'done'; this.done = true; } }
  }
  update(dt, I) {
    this.t += dt;
    if (this.phase === 'turn') {
      if (I.down) {
        const ang = Math.atan2(I.y - this.cy, I.x - this.cx);
        if (this.prevAng != null) { const d = wrapAng(ang - this.prevAng); if (Math.abs(d) < 1.3) this.turn(d); }
        this.prevAng = ang;
      } else {
        if (this.wasDown && this.acc > 1) this.releases++;
        this.prevAng = null;
      }
      this.wasDown = I.down;
      if (I.wheel) this.turn(Math.sign(I.wheel) * (Math.PI / 2) * Math.min(3, Math.abs(I.wheel) / 60 + 0.34));
      for (const e of I.gest) {
        if (e.type === 'reel') this.turn((e.dir === 'ccw' ? -1 : 1) * (Math.PI / 2));
        if (e.type === 'pinchEnd' && this.acc > 1) this.releases++;
      }
    } else if (this.phase === 'tighten') {
      this.tightT += dt;
      if (I.pressed) this.pressY = I.y;
      const pulled = (I.down && this.pressY != null && I.y - this.pressY > 60) || I.hit.has('KeyS') || I.hit.has('ArrowDown') || I.hit.has('Space') || I.gest.some((e) => e.type === 'pull');
      if (pulled) { this.tightOK = this.tightT <= 1.5 * this.tol + 0.6; this.hw.sc.tight = true; this.hw.sfx('pick'); this.phase = 'done'; this.done = true; }
      else if (this.tightT > 4) { this.phase = 'done'; this.done = true; }
    }
  }
  draw(ctx) {
    ctx.save();
    if (this.phase === 'turn') {
      ctx.setLineDash([8, 8]); ctx.strokeStyle = 'rgba(31,127,134,.55)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(this.cx, this.cy, 130, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      const pr = clamp01(this.acc / ((this.needQ * Math.PI) / 2));
      ctx.strokeStyle = '#1f7f86'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(this.cx, this.cy, 130, -Math.PI / 2, -Math.PI / 2 + pr * Math.PI * 2 * (this.dirSign < 0 ? -1 : 1), this.dirSign < 0); ctx.stroke();
      // a small arrow showing the turning direction
      const a = this.t * 2.2 * (this.dirSign || 1);
      ctx.fillStyle = '#1f7f86'; ctx.beginPath(); const ax = this.cx + Math.cos(a) * 130, ay = this.cy + Math.sin(a) * 130; ctx.arc(ax, ay, 7, 0, Math.PI * 2); ctx.fill();
    } else if (this.phase === 'tighten') {
      ctx.font = '700 22px "Zen Maru Gothic", sans-serif'; ctx.fillStyle = '#e8743b'; ctx.textAlign = 'center';
      ctx.fillText('↓ 引いて しめる！', this.cx, this.cy + 175);
    }
    ctx.restore();
  }
  hand(I) { return { x: I.active ? I.x : this.cx + 110, y: (I.active ? I.y : this.cy) + 50, pose: 'pinch' }; }
}

// trace: follow a line with the blade, or short carving strokes along an arrow
class Trace extends Kind {
  constructor(step, hw) {
    super(step, hw);
    this.mode = step.mode || 'line';
    if (this.mode === 'line') { this.li = 0; this.setLine(); }
    else { this.from = [520, 236]; this.to = [600, 262]; this.stroke = null; }
    this.devSum = 0; this.devN = 0;
  }
  setLine() { this.alongSpeed = 0; this.line = resample(this.step.lines ? this.step.lines[Math.min(this.li, this.step.lines.length - 1)] : pathFor(this.step.path, this.li)); this.prog = 0; this.lineT = 0; this.tracing = false; this.devSum = 0; this.devN = 0; this.speedMax = 0; }
  markTraced() {
    const c = this.hw.sc.carcass; if (!c || !this.step.bstep) return;
    const arr = (c.traced[this.step.bstep] = c.traced[this.step.bstep] || []);
    arr[this.li] = clamp01(this.prog / (this.line.pts.length - 1));
  }
  update(dt, I) {
    this.t += dt;
    if (this.mode === 'line') return this.updateLine(dt, I);
    // strokes: press near the start of the arrow, pull toward its end
    const L = dist(...this.from, ...this.to);
    const kbd = I.hit.has('Space') || I.hit.has('KeyE');
    const gst = I.gest.some((e) => e.type === 'pull' || (e.type === 'swing' && e.dir === 'down'));
    if (kbd || gst) { this.finishStroke(kbd ? 0.5 : 0.65); return; }
    if (I.pressed && dist(I.x, I.y, ...this.from) < 55 * this.tol) this.stroke = { dev: 0, n: 0, t: 0 };
    if (this.stroke) {
      if (!I.down) { this.stroke = null; return; }
      this.stroke.t += dt;
      const ux = (this.to[0] - this.from[0]) / L, uy = (this.to[1] - this.from[1]) / L;
      const rx = I.x - this.from[0], ry = I.y - this.from[1];
      const along = rx * ux + ry * uy, off = Math.abs(rx * uy - ry * ux);
      this.stroke.dev += off; this.stroke.n++;
      if (along >= L * 0.75) {
        const s = clamp01(1 - this.stroke.dev / this.stroke.n / (22 * this.tol)) - (this.stroke.t < 0.08 ? 0.1 : 0) - (this.stroke.t > 1.6 ? 0.1 : 0);
        this.finishStroke(s);
      }
    }
  }
  finishStroke(s) {
    this.stroke = null;
    const sc = this.hw.sc;
    this.record(s);
    if (this.step.taper) sc.taper = clamp01(this.count / this.n);
    sc.straight = clamp01((sc.straight ?? 0.4) + 0.06);
    this.hw.burst(560, 252, 'shaving', 3); this.hw.sfx('rustle');
  }
  updateLine(dt, I) {
    const pts = this.line.pts, N = pts.length - 1;
    if (this.step.depthStop && this.tracing && !I.down && this.prog > N * 0.12) {
      // let go where it should catch: d 0.35–0.65 is just right (§26.5 引き金)
      const d = this.prog / N, [b0, b1] = this.step.band || [0.35, 0.65];
      const md = this.devN ? this.devSum / this.devN : 20;
      let s = clamp01(1 - Math.max(0, Math.abs(d - (b0 + b1) / 2) - (b1 - b0) / 2) / (0.25 * this.tol)) * clamp01(1.15 - md / (40 * this.tol));
      if (this.speedMax > 1100) { this.hw.extra.snapped = true; s = Math.min(s, 0.1); }
      if (d < b0) this.hw.extra.triggerShallow = true;
      if (d > b1) this.hw.extra.triggerDeep = true;
      this.hw.extra.triggerD = d;
      this.tracing = false; this.prog = N; this.markTraced();
      const c = this.hw.sc.trap; if (c) { c.trigger = d; c.set = true; }
      this.record(s); this.hw.sfx('pick');
      return;
    }
    const kbd = I.hit.has('Space');
    if (kbd) { this.devSum += 10; this.devN++; this.prog = N; }
    if (!this.tracing && I.down) {
      const at = pts[Math.min(N, Math.round(this.prog))];
      if (dist(I.x, I.y, at[0], at[1]) < 38 * this.tol) this.tracing = true;
    }
    if (this.tracing) {
      if (!I.down) this.tracing = false;
      else {
        this.lineT += dt;
        let best = this.prog, bd = Infinity;
        // the nearest point ahead (a leap along the line counts as moving that fast)
        for (let k = Math.floor(this.prog); k <= N; k++) { const d = dist(I.x, I.y, pts[k][0], pts[k][1]) + (k - this.prog) * 0.05; if (d < bd) { bd = d; best = k; } }
        bd = dist(I.x, I.y, pts[best][0], pts[best][1]);
        // how fast the blade moves along the line (px/s), measured per frame: a jump is "too fast"
        if (best > this.prog && dt > 0) this.alongSpeed = Math.max(this.alongSpeed || 0, ((best - this.prog) * this.line.total) / N / dt);
        if (best > this.prog) this.prog = best;
        this.devSum += bd; this.devN++;
        this.speedMax = Math.max(this.speedMax, I.speed || 0, this.alongSpeed || 0);
        this.live = this.prog / N;
        // §25.2 腹を 開く: going deep (into the no-touch zone, or far off the line / too fast) spoils the meat
        if (this.step.noTouch && ((bd > 10 && this.step.noTouch.some((z) => ((I.x - z.x) / (z.rx * 0.75)) ** 2 + ((I.y - z.y) / (z.ry * 0.75)) ** 2 < 1)) || bd > 34 / this.tol || (I.speed || 0) > 1600)) { this.hw.extra.cutDeep = true; if (this.hw.sc.carcass) this.hw.sc.carcass.cutDeep = true; }
        if (this.step.scene !== 'carcass' && Math.random() < 0.15) this.hw.burst(I.x, I.y, 'shaving', 1);
        this.markTraced();
      }
    }
    if (this.prog >= N * 0.97) {
      const md = this.devN ? this.devSum / this.devN : 20;
      let s = clamp01(1 - md / (37.7 * this.tol * 0.6));
      if (this.speedMax > 1400) s -= 0.1;
      if (this.lineT > 7) s -= 0.1;
      if (kbd) s = 0.5;
      this.record(s);
      if (this.step.notch) this.hw.sc.notch = clamp01(0.3 + s);
      if (this.step.trigger && (s < 0.25 || this.speedMax > 1100)) this.hw.extra.snapped = true; // §26: a hasty hand springs the trap
      this.prog = this.line.pts.length - 1; this.markTraced();
      this.hw.sfx('rustle');
      if (!this.done) { this.li++; this.setLine(); }
    }
  }
  draw(ctx) {
    if (this.done) return;
    if (this.mode === 'line') {
      const pts = this.line.pts;
      if (this.step.scene !== 'carcass') drawProp(ctx, 'path', { pts, done: this.prog / (pts.length - 1), width: 4 });
      else if ((this.hw.sc.carcass?.knowledge ?? 0) < 2) { ctx.save(); ctx.globalAlpha = 0.22; drawProp(ctx, 'path', { pts, done: this.prog / (pts.length - 1), width: 3 }); ctx.restore(); }
      const at = pts[Math.min(pts.length - 1, Math.round(this.prog))];
      ctx.save(); ctx.strokeStyle = '#e8743b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(at[0], at[1], 14 + Math.sin(this.t * 6) * 3, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    } else drawProp(ctx, 'arrow', { from: this.from, to: this.to });
  }
  hand(I) { return { x: (I.active ? I.x : 540) + 20, y: (I.active ? I.y : 250) + 60, pose: 'grip', holding: 'blade', holdState: { kind: this.step.blade || 'knife' }, rot: 0.5 }; }
}

// weave: alternate sides on the beat
class Weave extends Kind {
  constructor(step, hw) {
    super(step, hw);
    this.beat = 0.62 / (step.tempo || 1); this.lead = 0.9; this.wrong = 0;
  }
  get tk() { return this.lead + this.count * this.beat; }
  get side() { return this.count % 2 === 0 ? 1 : -1; }
  update(dt, I) {
    this.t += dt;
    let input = 0;
    if (I.hit.has('ArrowLeft') || I.hit.has('KeyA')) input = -1;
    if (I.hit.has('ArrowRight') || I.hit.has('KeyD')) input = 1;
    if (I.pressed) input = I.x < W / 2 ? -1 : 1;
    for (const e of I.gest) if (e.type === 'swing' && (e.dir === 'left' || e.dir === 'right')) input = e.dir === 'left' ? -1 : 1;
    const win = this.beat * 0.5;
    if (input && this.t > this.tk - win) {
      let s = clamp01(1 - Math.abs(this.t - this.tk) / (0.3 * this.tol));
      if (input !== this.side) { s = Math.max(0, s - 0.3); this.mistake(); this.wrong++; }
      this.record(s); this.hw.sfx('rustle'); this.rowsUpdate();
    } else if (this.t > this.tk + win) { this.record(0); this.mistake(); this.rowsUpdate(); }
  }
  mistake() { const sc = this.hw.sc; sc.loose = (sc.loose || []).concat([this.count]); }
  get p() { return this.forcedP ?? clamp01(mean(this.scores) - 0.08 * this.wrong); } // a wrong side loosens that row (§24.2)
  autoFinish(score) { this.forcedP = score; super.autoFinish(score); this.rowsUpdate(); }
  rowsUpdate() { const sc = this.hw.sc; sc.rows = Math.round((this.count / this.n) * (sc.total || 12)); }
  draw(ctx) {
    if (this.done) return;
    const ph = clamp01(1 - Math.abs(this.t - this.tk) / this.beat);
    for (const s of [-1, 1]) {
      const on = s === this.side, x = W / 2 + s * 300;
      ctx.save(); ctx.globalAlpha = on ? 0.4 + 0.6 * ph : 0.25;
      ctx.fillStyle = on ? '#1f7f86' : '#8c8570';
      ctx.beginPath(); ctx.moveTo(x + s * 28, 250); ctx.lineTo(x - s * 10, 220); ctx.lineTo(x - s * 10, 280); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
  hand(I) { return { x: W / 2 + this.side * 200, y: 330, pose: 'pinch', side: this.side < 0 ? 'left' : 'right' }; }
}

// stir: keep circling at an even pace (or knead on the beat)
class Stir extends Kind {
  constructor(step, hw) {
    super(step, hw);
    this.cx = 400; this.cy = 280; this.needQ = this.n * 4; this.acc = 0; this.prevAng = null; this.qT = []; this.lastQ = 0; this.lastMove = 0; this.stops = 0; this.started = false;
    this.knead = !!step.knead; this.beat = 0.7;
  }
  get progress() { return this.knead ? super.progress : clamp01(this.acc / ((this.needQ * Math.PI) / 2)); }
  get count() { return this.knead ? this._c || 0 : Math.min(this.n, Math.floor(this.acc / (Math.PI * 2))); }
  set count(v) { this._c = v; }
  get p() {
    if (this.forcedP != null) return this.forcedP;
    if (this.knead) return mean(this.scores);
    const iv = []; for (let i = 1; i < this.qT.length; i++) iv.push(this.qT[i] - this.qT[i - 1]);
    return clamp01(1 - cvOf(iv) / (0.5 * this.tol) - 0.1 * this.stops);
  }
  autoFinish(score) { this.forcedP = score; this.acc = (this.needQ * Math.PI) / 2; this._c = this.n; this.done = true; }
  update(dt, I) {
    this.t += dt;
    if (this.knead) {
      const tk = 0.6 + (this._c || 0) * this.beat;
      const hit = I.pressed || I.hit.has('Space') || I.gest.some((e) => e.type === 'push' || e.type === 'pull' || (e.type === 'swing' && e.dir === 'down'));
      if (hit && this.t > tk - this.beat / 2) { this.record(clamp01(1 - Math.abs(this.t - tk) / (0.3 * this.tol))); this.hw.sfx('drop'); }
      else if (this.t > tk + this.beat / 2) this.record(0.2);
      this.hw.sc.smooth = this.progress;
      return;
    }
    const move = (d) => {
      this.acc += Math.abs(d); this.lastMove = this.t; this.started = true;
      const q = Math.floor(this.acc / (Math.PI / 2));
      if (q > this.lastQ) { this.lastQ = q; this.qT.push(this.t); if (q % 4 === 0) this.hw.sfx('rub'); }
      this.hw.sc.mix = this.progress;
      if (this.acc >= (this.needQ * Math.PI) / 2) this.done = true;
    };
    if (I.down) {
      const ang = Math.atan2(I.y - this.cy, I.x - this.cx);
      if (this.prevAng != null) { const d = wrapAng(ang - this.prevAng); if (Math.abs(d) < 1.3) move(d); }
      this.prevAng = ang;
    } else this.prevAng = null;
    for (const e of I.gest) if (e.type === 'reel') move(Math.PI / 2);
    if (I.hit.has('Space')) move(Math.PI / 2);
    if (this.started && !this.done && this.t - this.lastMove > 0.8) { this.stops++; this.lastMove = this.t; }
  }
  draw(ctx) {
    if (this.done) return;
    ctx.save();
    if (this.knead) {
      const tk = 0.6 + (this._c || 0) * this.beat, ph = clamp01(1 - Math.abs(this.t - tk) / this.beat);
      ctx.strokeStyle = '#1f7f86'; ctx.lineWidth = 4; ctx.globalAlpha = 0.3 + 0.7 * ph;
      ctx.beginPath(); ctx.arc(this.cx, this.cy - 20, 30 + 50 * (1 - ph), 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.setLineDash([8, 8]); ctx.strokeStyle = 'rgba(31,127,134,.55)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(this.cx, this.cy - 10, 70, 40, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
  hand(I) { return { x: (I.active ? I.x : this.cx + 60) + 10, y: (I.active ? I.y : this.cy) + 50, pose: this.knead ? 'fist' : 'point' }; }
}

// tend: watch the colour / bubbles / smoke and act at the right moment
class Tend extends Kind {
  constructor(step, hw) {
    super(step, hw);
    this.mode = step.mode || 'skewer';
    this.d = [0, 0]; this.side = 0; this.power = 0.7; this.flips = 0; this.bub = 0; this.boilT = 0; this.smoke = 0; this.taken = false;
    this.tStop = 5.5 + Math.random() * 2.5;
    this.glow = Math.max(0.15, (hw.sc.heat || 0.4) * 0.5); this.blows = []; this.lastBlow = -9;
    hw.sc.food = step.food || hw.sc.food || 'fish';
  }
  get progress() { return this.mode === 'blow' ? clamp01(this.glow) : this.mode === 'skewer' ? clamp01((this.d[0] + this.d[1]) / 1.8) : this.mode === 'boil' ? clamp01(this.bub * 0.6 + this.boilT / 25) : clamp01(this.t / (this.tStop + 2)); }
  update(dt, I) {
    this.t += dt;
    const fan = I.hit.has('Space') || I.gest.some((e) => e.type === 'wave');
    if (fan) { this.power = Math.min(1.2, this.power + 0.25); this.hw.burst(400, 380, 'ember', 2); }
    this.power += (0.7 - this.power) * dt * 0.5;
    const takeOut = I.hit.has('KeyR') || I.gest.some((e) => e.type === 'pull' || e.type === 'grab') || (I.released && I.dragY < -70);
    const act = I.hit.has('KeyE') || I.hit.has('Enter') || (I.released && Math.abs(I.dragY) < 25) || I.gest.filter((e) => e.type === 'reel').length >= 1;
    const sc = this.hw.sc;
    if (this.mode === 'blow') {
      // §10.2: steady breaths grow the ember; puffing too fast scatters it, stopping lets it die
      const blow = I.hit.has('Space') || I.hit.has('KeyE') || I.pressed || I.gest.some((e) => e.type === 'wave' || e.type === 'push');
      if (blow) {
        const iv = this.t - this.lastBlow; this.lastBlow = this.t;
        if (iv < 0.22) { this.glow -= 0.08; this.hw.burst(400, 300, 'dust', 2); } else { this.glow += iv <= 1.1 ? 0.13 : 0.07; this.blows.push(iv); }
        this.hw.burst(400, 300, 'ember', 2); this.hw.sfx('rub');
      }
      this.glow -= dt * 0.05;
      sc.glow = clamp01(this.glow);
      if (Math.random() < dt * 6 * this.glow) this.hw.burst(400 + (Math.random() - 0.5) * 50, 290, 'steam', 1);
      if (this.glow >= 1) { const iv = this.blows.slice(1); this.finish(clamp01(1 - cvOf(iv) / (0.6 * this.tol)) * 0.6 + 0.4); this.hw.extra.flame = true; }
      else if (this.glow <= 0 || this.t > 14) { this.hw.extra.flame = false; this.finish(0); }
      return;
    }
    if (this.mode === 'skewer') {
      this.d[this.side] += dt * 0.085 * this.power * (1 + 0.15 * (1 - this.tol));
      this.d[1 - this.side] += dt * 0.012 * this.power;
      sc.doneness = this.d[1 - this.side]; sc.side = this.side; // the face we look at is the one up
      if (act && !takeOut) { this.side = 1 - this.side; this.flips++; this.hw.sfx('sizzle'); }
      if (Math.random() < dt * 3) this.hw.burst(400 + (Math.random() - 0.5) * 120, 250, 'steam', 1);
      if (takeOut || this.d[0] > 1.45 || this.d[1] > 1.45) this.finish(this.d.map((v) => clamp01(1 - Math.abs(v - 0.9) / (0.32 * this.tol))).reduce((a, b) => a + b) / 2);
    } else if (this.mode === 'boil') {
      this.bub = Math.min(1, this.bub + dt * this.power * 0.17);
      if (this.bub >= 1) this.boilT += dt;
      sc.bubbles = this.bub; sc.steam = clamp01(this.bub * 1.2);
      if (Math.random() < dt * 6 * this.bub) this.hw.burst(400 + (Math.random() - 0.5) * 90, 215, this.bub >= 1 ? 'bubble' : 'steam', 1);
      if (act || takeOut) {
        const t = this.boilT;
        const s = this.bub < 1 ? 0.2 + 0.2 * this.bub : t < 7 ? 0.5 + 0.5 * (t / 7) : t <= 13 * this.tol ? 1 : clamp01(1 - (t - 13 * this.tol) / 20);
        this.hw.extra.boilT = t; this.hw.extra.boiled = this.bub >= 1 && t >= 7 - 2 * (this.tol - 1);
        this.finish(s);
      } else if (this.boilT > 40) { this.hw.extra.boilT = this.boilT; this.hw.extra.boiled = true; this.finish(0.4); }
    } else {
      // smoke: rises, then stops — take it off when the smoke stops
      this.smoke = this.t < this.tStop - 3 ? clamp01(this.t / 2) : clamp01((this.tStop - this.t) / 3);
      sc.steam = this.smoke; sc.bubbles = clamp01(this.t / this.tStop) * 0.5;
      if (Math.random() < dt * 8 * this.smoke) this.hw.burst(400 + (Math.random() - 0.5) * 60, 200, 'steam', 1);
      if (act || takeOut) this.finish(clamp01(1 - Math.abs(this.t - this.tStop) / (2.5 * this.tol)));
      else if (this.t > this.tStop + 8) this.finish(0.1);
    }
  }
  finish(s) { this.taken = true; this.hw.extra.doneness = (this.d[0] + this.d[1]) / 2; this.record(s); this.hw.sfx('pick'); }
  autoFinish(score) {
    if (this.mode === 'blow') { this.hw.extra.flame = score >= 0.4; this.hw.sc.glow = 1; }
    if (this.mode === 'boil') { this.hw.extra.boiled = true; this.hw.extra.boilT = 10; }
    if (this.mode === 'skewer') { this.d = [0.9, 0.9]; this.hw.extra.doneness = 0.9; }
    super.autoFinish(score);
  }
  draw(ctx) {
    if (this.done) return;
    ctx.save();
    if (this.mode === 'skewer') {
      // the colour scale with the "just right" band; marks for both faces
      const gx = 260, gw = 280, gy = 86;
      const g = ctx.createLinearGradient(gx, 0, gx + gw, 0);
      g.addColorStop(0, '#efd9b8'); g.addColorStop(0.55, '#e2a24f'); g.addColorStop(0.75, '#9a5a2a'); g.addColorStop(1, '#2a2420');
      ctx.fillStyle = g; ctx.fillRect(gx, gy, gw, 12);
      const f = (v) => gx + clamp01(v / 1.4) * gw;
      ctx.strokeStyle = '#1f7f86'; ctx.lineWidth = 3; ctx.strokeRect(f(0.78), gy - 3, f(1.02) - f(0.78), 18);
      this.d.forEach((v, i) => { ctx.fillStyle = i === this.side ? '#e8743b' : '#2a2923'; ctx.beginPath(); ctx.arc(f(v), gy + 24, 6, 0, Math.PI * 2); ctx.fill(); });
      ctx.font = '600 13px "Zen Maru Gothic", sans-serif'; ctx.textAlign = 'left';
      ctx.fillStyle = '#e8743b'; ctx.fillText('● 火に 当たって いる 面', 292, gy + 50);
      ctx.fillStyle = '#2a2923'; ctx.fillText('● 上の 面', 452, gy + 50);
    }
    ctx.restore();
  }
  hand() { return { x: 560, y: 300, pose: 'grip', rot: -0.3 }; }
}

// place: drag pieces into the frames, bottom-up / in order
class Place extends Kind {
  constructor(step, hw) {
    super(step, hw);
    const kinds = (step.tokens || ['stone']).slice(0, this.n);
    while (kinds.length < this.n) kinds.push(kinds[kinds.length - 1] || 'stone');
    // tokens can carry ids (the order is checked on ids: the three sticks of a figure-4 look alike) and labels
    const ids = step.tokenIds || kinds;
    this.order = ids.slice(0, this.n);
    const list = kinds.map((k, i) => ({ kind: k, id: ids[i] ?? k, label: step.tokenLabels?.[i] || null }));
    const shuffled = step.ordered ? list.slice().sort(() => Math.random() - 0.5) : list;
    const gap = Math.min(78, 360 / Math.max(1, shuffled.length));
    this.tokens = shuffled.map((k, i) => ({ ...k, x: 110, y: 120 + i * gap, hx: 110, hy: 120 + i * gap, placed: false }));
    const sc = step.scene;
    if (sc === 'drill') { this.tokens.forEach((t) => { t.x = t.hx = 400; t.y = t.hy = 345; }); }
    if (step.tokenAt) this.tokens.forEach((t, i) => { const p = step.tokenAt[Math.min(i, step.tokenAt.length - 1)]; t.x = t.hx = p[0]; t.y = t.hy = p[1]; });
    const fromList = step.slotListFrom ? step.slotListFrom(hw.extra) : step.slotList;
    const one = step.slotFrom ? step.slotFrom(hw.extra) : null;
    if (fromList) this.slots = kinds.map((k, i) => { const q = fromList[Math.min(i, fromList.length - 1)]; return { x: q[0], y: q[1], w: q[2], h: q[3] }; });
    else if (one) this.slots = kinds.map(() => ({ x: one[0], y: one[1], w: one[2], h: one[3] }));
    else if (sc === 'firelay') this.slots = kinds.map((k, i) => ({ x: 470, y: 360 - i * 62, w: 170 - i * 20, h: 52 }));
    else this.slots = kinds.map((k, i) => (step.slotAt ? { x: step.slotAt[0], y: step.slotAt[1] - i * 8, w: step.slotAt[2] || 120, h: step.slotAt[3] || 70 } : sc === 'drill' ? { x: 560, y: 350, w: 110, h: 70 } : sc === 'filter' ? { x: 520, y: 260 + (74 - 44 * i) * 1.2, w: 122, h: 48 } : sc === 'weave' ? { x: 400, y: 330 - i * 50, w: 240, h: 44 } : { x: 400 + (i - (kinds.length - 1) / 2) * 90, y: 262, w: 80, h: 80 }));
    this.held = null; this.drops = 0;
    if (sc === 'filter') hw.sc.layers = [];
    // the piece is already in place: only turn it (fish trap mouth)
    if (step.rotate && step.rotateOnly) { const tk = this.tokens[0]; tk.placed = true; tk.x = this.slots[0].x; tk.y = this.slots[0].y; this.rotating = { tk, base: 1, angle: step.rotate.start ?? 0, t: 0, moved: false }; if (hw.sc.trap) hw.sc.trap.mouthAngle = this.rotating.angle; }
  }
  get p() { return this.forcedP ?? clamp01(mean(this.scores) - 0.1 * this.drops); }
  autoFinish(score) {
    this.forcedP = score;
    for (const tk of this.tokens) if (!tk.placed) { tk.placed = true; }
    if (this.step.scene === 'filter') this.hw.sc.layers = this.order.slice();
    if (this.step.bait) this.hw.extra.baited = true;
    super.autoFinish(score);
  }
  update(dt, I) {
    this.t += dt;
    if (this.rotating) return this.updateRotate(dt, I);
    const slot = this.slots[this.count];
    if (!slot) return;
    if (I.hit.has('Space')) { // keyboard: place the right piece
      const tk = this.tokens.find((t) => !t.placed && t.id === this.order[this.count]) || this.tokens.find((t) => !t.placed);
      if (tk) this.drop(tk, slot.x, slot.y, 0.6);
      return;
    }
    if (I.pressed && !this.held) this.held = this.tokens.find((t) => !t.placed && dist(I.sx, I.sy, t.x, t.y) < 40 * this.tol) || null; // where the press began
    if (this.held) {
      if (I.down) { this.held.x = I.x; this.held.y = I.y; }
      else {
        const tk = this.held; this.held = null;
        tk.x = I.x; tk.y = I.y; // where the finger was let go
        if (Math.abs(tk.x - slot.x) < (slot.w / 2 + 20) * this.tol && Math.abs(tk.y - slot.y) < (slot.h / 2 + 20) * this.tol) this.drop(tk, tk.x, tk.y, 1);
        else { this.drops++; tk.x = tk.hx; tk.y = tk.hy; this.hw.sfx('drop'); }
      }
    }
  }
  drop(tk, x, y, mul) {
    const slot = this.slots[this.count];
    const center = 1 - Math.min(1, dist(x, y, slot.x, slot.y) / (60 * this.tol)) * 0.5;
    const right = !this.step.ordered || tk.id === this.order[this.count];
    if (!right) this.hw.failures.add('order');
    tk.placed = true; tk.x = slot.x; tk.y = slot.y;
    (this.placedIds = this.placedIds || []).push(tk.id);
    if (this.step.rotate) { this.rotating = { tk, base: center * mul, angle: this.step.rotate.start ?? 0, t: 0 }; const c = this.hw.sc.trap; if (c) c.mouthAngle = this.rotating.angle; this.hw.sfx('drop'); return; }
    if (this.step.scene === 'filter') this.hw.sc.layers = (this.hw.sc.layers || []).concat([tk.kind]);
    const c = this.hw.sc.carcass;
    if (c && this.step.bstep === 'gut') c.removed = true;
    if (c && this.step.bstep === 'skin') c.skinned = true;
    if (this.step.firm && center * mul < 0.3) this.hw.extra.squeezed = true; // §25.2 にがい 袋
    if (this.step.bait) this.hw.extra.baited = true;
    this.record(center * (right ? 1 : 0.5) * mul);
    this.hw.sfx('drop');
  }
  /** turn the placed piece (wheel / Q E / drag left-right / turn the wrist), then confirm (click / Enter / pinch) */
  updateRotate(dt, I) {
    const R = this.rotating, c = this.hw.sc.trap;
    R.t += dt;
    if (I.wheel) R.angle += Math.sign(I.wheel) * 0.12;
    if (I.keys.has('KeyQ')) R.angle -= dt * 1.6;
    if (I.keys.has('KeyE')) R.angle += dt * 1.6;
    if (I.down && R.dragX != null) R.angle += (I.x - R.dragX) * 0.012;
    R.dragX = I.down ? I.x : null;
    for (const e of I.gest) if (e.type === 'reel') R.angle += (e.dir === 'ccw' ? -1 : 1) * 0.4;
    if (c) c.mouthAngle = R.angle;
    const confirm = (R.t > 0.4 && (I.hit.has('Enter') || I.hit.has('Space') || (I.released && Math.abs(I.dragY) < 8 && R.moved))) || R.t > 12;
    if (I.down) R.moved = true;
    if (!confirm) return;
    const want = this.step.rotate.target ?? 0;
    const err = Math.abs(Math.atan2(Math.sin(R.angle - want), Math.cos(R.angle - want))) * 180 / Math.PI;
    const dirMul = err >= 90 ? 0.3 : 1 - 0.25 * Math.floor(err / 45);
    this.hw.extra.mouthErr = err; this.hw.extra.mouthMul = dirMul;
    this.rotating = null;
    this.record(R.base * clamp01(1 - err / 120));
    this.hw.sfx('pick');
  }
  draw(ctx) {
    if (this.rotating) {
      ctx.save(); ctx.font = '700 17px "Zen Maru Gothic", sans-serif'; ctx.fillStyle = '#e8743b'; ctx.textAlign = 'center';
      ctx.fillText('向きを 合わせて 決定（ホイール・Q E・左右ドラッグ → クリック／Enter）', 400, 470); ctx.restore();
    }
    this.slots.forEach((s, i) => { if (i >= this.count && !this.step.hideSlot) drawProp(ctx, 'slot', { x: s.x, y: s.y, w: s.w, h: s.h, active: i === this.count }); });
    for (const tk of this.tokens) {
      if (tk.placed && (this.step.scene === 'filter' || this.step.hidePlaced)) continue;
      if (this.step.hideTokens && tk !== this.held) continue;
      drawProp(ctx, 'token', { x: tk.x, y: tk.y, kind: tk.kind, held: tk === this.held });
      if (tk.label) { ctx.save(); ctx.font = '700 13px "Zen Maru Gothic", sans-serif'; ctx.fillStyle = '#2a2923'; ctx.textAlign = 'center'; ctx.fillText(tk.label, tk.x, tk.y + 46); ctx.restore(); }
    }
    if (this.step.labels && this.hw.sc.showOrder) {
      ctx.save(); ctx.font = '600 13px "Zen Maru Gothic", sans-serif'; ctx.fillStyle = '#1f7f86'; ctx.textAlign = 'left';
      this.slots.forEach((s, i) => { if (i >= this.count) ctx.fillText(this.step.labels[i], s.x + s.w / 2 + 8, s.y + 5); });
      ctx.restore();
    }
    if (this.step.ordered && this.step.scene === 'filter' && this.count < this.slots.length) {
      ctx.save(); ctx.font = '600 14px "Zen Maru Gothic", sans-serif'; ctx.fillStyle = '#5d5849'; ctx.textAlign = 'left';
      ctx.fillText('↑ 下から 順に', this.slots[0].x + 70, this.slots[0].y + 6); ctx.restore();
    }
  }
  hand(I) { return this.held ? { x: I.x + 18, y: I.y + 54, pose: 'pinch' } : { x: I.active ? I.x + 18 : 330, y: (I.active ? I.y + 54 : 430), pose: 'open' }; }
}

// hold (§26.2): keep the force needle inside a narrowing band — bend a sapling, prop a rock, lower it gently
class Hold extends Kind {
  constructor(step, hw) {
    super(step, hw);
    this.dur = Math.max(2, step.n || 4); this.band = step.band || [0.45, 0.75]; this.narrow = step.narrow ?? 0.5;
    this.f = 0.2; this.fill = 0; this.inT = 0; this.allT = 0; this.outT = 0; this.slips = 0; this.started = false;
    this.pushAt = 0.8 + Math.random() * (this.dur - 1.2); this.pushed = false; this.kick = 0; this.bonus = 0; this.dropped = false;
  }
  get count() { return this.done ? this.n : 0; }
  set count(v) { /* derived */ }
  get progress() { return clamp01(this.fill / this.dur); }
  get p() { return this.forcedP ?? clamp01((this.allT ? this.inT / this.allT : 0) - 0.15 * this.slips + this.bonus); }
  autoFinish(score) { this.forcedP = score; this.fill = this.dur; this.done = true; this.hw.sc.bend = 1; this.hw.sc.rockLift = this.step.release === 'gentle' ? 0.2 : 1; }
  bandNow() {
    const c = (this.band[0] + this.band[1]) / 2, w0 = (this.band[1] - this.band[0]) * this.tol;
    const w = w0 * (1 - (1 - this.narrow) * clamp01(this.allT / this.dur));
    return [c - w / 2, c + w / 2, c, w];
  }
  update(dt, I) {
    this.t += dt;
    const holding = I.down || I.keys.has('KeyW') || I.keys.has('KeyS') || (I.hand && I.gest.every((e) => e.type !== 'release') && I.handGrab);
    if (!this.started) { if (holding) this.started = true; else return; }
    // the force: pointer height while pressed (top = strong), W / S, or the closed hand's height
    if (I.down) this.f = clamp01(1 - (I.y - 70) / 360);
    if (I.keys.has('KeyW')) this.f = clamp01(this.f + dt * 0.7);
    if (I.keys.has('KeyS')) this.f = clamp01(this.f - dt * 0.7);
    if (I.hand && I.handGrab && !I.down) this.f = clamp01(1 - I.hand.y);
    const [lo, hi, c, w] = this.bandNow();
    if (!this.pushed && this.allT > this.pushAt) { this.pushed = true; this.kick = w * 0.5 * (Math.random() < 0.5 ? -1 : 1); this.hw.sfx('drop'); }
    this.kick *= Math.exp(-dt * 2.2);
    this.needle = clamp01(this.f + Math.sin((this.t * Math.PI * 2) / 1.2) * w * 0.2 + this.kick);
    const released = I.released || (!I.down && !I.keys.has('KeyW') && !I.keys.has('KeyS') && !(I.hand && I.handGrab));
    if (released && this.fill < this.dur) {
      // let go too early: the sapling springs / the rock drops (§26.6)
      this.dropped = true; this.hw.extra.dropped = this.step.hid || this.step.bstep || true; this.forcedP = 0.1; this.done = true; this.hw.flash(0); this.hw.sfx('stone_hit');
      return;
    }
    this.allT += dt;
    const inBand = this.needle >= lo && this.needle <= hi;
    if (inBand) { this.inT += dt; this.fill += dt; this.outT = 0; }
    else { this.outT += dt; if (this.outT >= 0.5) { this.slips++; this.outT = -1e9; this.fill = Math.max(0, this.fill - this.dur * 0.3); this.hw.flash(0.2); } }
    if (!inBand && this.outT < 0) this.outT = this.outT; else if (inBand) this.outT = 0;
    const sc = this.hw.sc;
    sc.bend = clamp01(this.f); sc.rockLift = clamp01(this.f);
    if (this.fill >= this.dur) {
      if (this.step.release === 'gentle') {
        this.waitRelease = true;
        if (released || I.released) { if (Math.abs(this.needle - c) <= w * 0.25) this.bonus = 0.1; sc.rockLift = 0.2; this.done = true; this.hw.sfx('pick'); }
      } else this.done = true;
    }
    if (this.allT > this.dur * 3 && !this.done) { this.done = true; }
  }
  draw(ctx) {
    const [lo, hi] = this.bandNow();
    const gx = 712, gy = 70, gh = 360, gw = 26;
    const Y = (v) => gy + (1 - v) * gh;
    ctx.save();
    ctx.fillStyle = 'rgba(42,41,35,.08)'; ctx.fillRect(gx, gy, gw, gh);
    ctx.fillStyle = 'rgba(74,154,82,.5)'; ctx.fillRect(gx, Y(hi), gw, Y(lo) - Y(hi));
    ctx.strokeStyle = '#2a2923'; ctx.lineWidth = 2; ctx.strokeRect(gx, gy, gw, gh);
    if (this.started) { ctx.fillStyle = '#e8743b'; ctx.fillRect(gx - 8, Y(this.needle ?? this.f) - 3, gw + 16, 6); }
    // "かかり" fill on top
    ctx.fillStyle = 'rgba(31,127,134,.15)'; ctx.fillRect(gx - 6, gy - 30, gw + 12, 12);
    ctx.fillStyle = '#1f7f86'; ctx.fillRect(gx - 6, gy - 30, (gw + 12) * this.progress, 12);
    ctx.font = '700 15px "Zen Maru Gothic", sans-serif'; ctx.fillStyle = '#5d5849'; ctx.textAlign = 'center';
    ctx.fillText('力', gx + gw / 2, gy + gh + 22);
    if (!this.started) { ctx.fillStyle = '#e8743b'; ctx.fillText('押して 持ち上げ、帯の 中で 保つ', 400, 96); }
    else if (this.waitRelease) { ctx.fillStyle = '#1f7f86'; ctx.fillText('そっと はなす', 400, 96); }
    ctx.restore();
  }
  hand(I) { return { x: 560, y: 200 + (1 - (this.f || 0)) * 160, pose: 'grip', rot: -0.2 }; }
}

// choose: K0 butchering — which comes next? (a wrong pick costs time, not quality: §25.4)
class Choose extends Kind {
  constructor(step, hw) { super(step, hw); this.opts = step.options || []; this.msg = ''; this.msgT = 0; }
  // options as buttons along the bottom, or as spots on the picture (step.spots: [[x, y, r]] — e.g. the soft eye of a coconut)
  boxes() { return this.opts.map((o, i) => (o.spot ? { ...o, x: o.spot[0], y: o.spot[1], w: (o.spot[2] || 26) * 2, h: (o.spot[2] || 26) * 2, round: true } : { ...o, x: (W - this.opts.length * 220) / 2 + 110 + i * 220, y: 440, w: 200, h: 46 })); }
  update(dt, I) {
    this.t += dt; this.msgT -= dt;
    let pick = -1;
    if (I.pressed) this.boxes().forEach((b, i) => { if (b.round ? Math.hypot(I.x - b.x, I.y - b.y) < b.w / 2 * this.tol : Math.abs(I.x - b.x) < b.w / 2 && Math.abs(I.y - b.y) < b.h / 2) pick = i; });
    ['Digit1', 'Digit2', 'Digit3', 'Digit4'].forEach((k, i) => { if (I.hit.has(k)) pick = i; });
    if (pick < 0 || !this.opts[pick]) return;
    const o = this.opts[pick];
    if (this.step.pick) { this.hw.extra[this.step.pick] = o.value ?? o.label; this.record(1); this.hw.sfx('pick'); return; } // a free choice (aim, lay type…)
    if (o.ok) { this.record(this.wrong ? Math.max(0.4, 1 - 0.3 * this.wrong) : 1); this.hw.sfx('pick'); }
    else { this.wrong = (this.wrong || 0) + 1; this.msg = this.step.wrongMsg || '…ちがう 気が する'; this.msgT = 1.6; this.hw.extra.wrongChoices = (this.hw.extra.wrongChoices || 0) + 1; this.hw.sfx('drop'); if (o.spot) this.hw.burst(o.spot[0], o.spot[1], 'dust', 3); }
  }
  autoFinish(s) { super.autoFinish(s); }
  draw(ctx) {
    ctx.save(); ctx.font = '700 17px "Zen Maru Gothic", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [i, b] of this.boxes().entries()) {
      if (b.round) { // a spot on the picture
        ctx.strokeStyle = this.step.showAnswer && b.ok ? '#1f7f86' : '#e8743b'; ctx.lineWidth = 3; ctx.setLineDash([6, 5]);
        ctx.beginPath(); ctx.arc(b.x, b.y, b.w / 2 + Math.sin(this.t * 4 + i) * 2, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#2a2923'; ctx.fillText(String(i + 1), b.x + b.w / 2 + 10, b.y - b.h / 2);
        continue;
      }
      ctx.fillStyle = this.step.showAnswer && b.ok ? '#d3ecee' : '#fffaf0'; ctx.strokeStyle = '#2a2923'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.roundRect?.(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h, 12); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#2a2923'; ctx.fillText(`${i + 1}. ${b.label}`, b.x, b.y);
    }
    if (this.step.question) { ctx.font = '800 20px "Zen Maru Gothic", sans-serif'; ctx.fillStyle = '#2a2923'; ctx.fillText(this.step.question, 400, 400); }
    if (this.msgT > 0) { ctx.fillStyle = '#bf5424'; ctx.fillText(this.msg, 400, 60); }
    ctx.restore();
  }
}

const KINDS = { strike: Strike, rub: Rub, twist: Twist, trace: Trace, weave: Weave, stir: Stir, tend: Tend, place: Place, choose: Choose, hold: Hold };

// ------------------------------------------------------------------ the runner + overlay
export class Handwork {
  constructor(game) {
    this.game = game;
    this.mastery = {};   // key → { good, sum } (§24.6 手慣れ)
    this.seen = {};      // kind → times done (hints fade after 3)
    this.active = null;
    this.parts = [];
  }

  serialize() { return { mastery: this.mastery, seen: this.seen }; }
  deserialize(d) { this.mastery = d?.mastery || {}; this.seen = d?.seen || {}; }

  /** manual | assist | auto (touch defaults to assist) */
  mode() {
    const s = this.game.settings?.handwork;
    if (s === 'manual' || s === 'assist' || s === 'auto') return s;
    return this.game.setup?.control === 'touch' ? 'assist' : 'manual';
  }
  isMastered(key) { const m = this.mastery[key]; return !!m && m.good >= 3; }

  /** tolerance: difficulty × craft skill × hand injuries × doing it together (§24.2) */
  tolerance(opts) {
    const g = this.game;
    const diff = { easy: 1.3, normal: 1, hard: 0.9, extreme: 0.8 }[g.setup?.difficulty] ?? 1;
    const lv = opts.skill ?? g.sys?.player?.skills?.craft ?? 0;
    const hurt = (g.sys?.player?.body?.visible?.() || []).some((c) => /cut|burn|blister|bruise|wound/.test(c.id)) ? 0.85 : 1;
    const together = g.sys?.companion?.togetherActive?.() ? 1.1 : 1;
    return diff * (1 + 0.03 * lv) * hurt * together * (opts.mode === 'assist' ? 1.25 : 1) * (opts.tolMul || 1);
  }

  async run(flowIn, opts = {}) {
    if (this.active) return { ok: false, cancelled: true, p: 0 };
    let mode = opts.mode || this.mode();
    let flow = (flowIn || []).map((s) => ({ ...s }));
    let quick = false;
    // §26.10: at most 4 full hands-on tasks per game hour — after that "the same rhythm" (the last p of this task)
    const now = this.game.clock?.total ?? 0;
    this.recent = (this.recent || []).filter((t) => now - t < 60);
    this.lastP = this.lastP || {};
    if (mode === 'manual' && !opts.careful && this.recent.length >= 4) {
      mode = 'auto'; opts = { ...opts, autoP: this.lastP[opts.key] ?? 0.55, sameRhythm: true };
      this.game.bus?.emit('toast', { text: '同じ 調子で 続けた（手で やる 作業は 1 時間に 4 つまで）', kind: 'info' });
    }
    if (mode !== 'auto' && opts.key && this.isMastered(opts.key) && !opts.careful && flow.length) {
      const last = flow[flow.length - 1];
      flow = [{ ...last, n: Math.min(2, last.n || 1) }];
      quick = true;
    }
    this.failures = new Set(); this.extra = {};
    this.sc = { material: 'chert', chips: 0, depth: 0, wraps: 0, progress: 0, rows: 0, total: 12, mix: 0, shine: 0, taper: 0, notch: 0, straight: 0.4, layers: [], doneness: 0, bubbles: 0, steam: 0, coils: 0, smooth: 0, ...(opts.scene || {}) };
    this.tol = this.tolerance({ ...opts, mode });
    const res = await new Promise((resolve) => this.open(flow, { ...opts, mode, quick }, resolve));
    if (!res.cancelled && mode === 'manual' && !quick) { this.recent.push(now); if (opts.key) this.lastP[opts.key] = res.p; }
    if (!res.cancelled && opts.key && mode === 'manual' && !quick) {
      const m = this.mastery[opts.key] || (this.mastery[opts.key] = { good: 0, sum: 0 });
      if (res.p >= 0.7) { m.good++; m.sum += res.p; if (m.good === 3) this.game.bus?.emit('toast', { text: `「${opts.title || opts.key}」は もう 手慣れた（次から ひと手で 仕上がる）`, kind: 'good' }); }
    }
    if (quick && !res.cancelled) { const m = this.mastery[opts.key]; res.p = Math.min(0.85, Math.max(0.55, 0.6 * (m.sum / Math.max(1, m.good)) + 0.4 * res.p)); res.feel = feelOf(res.p); res.feel.timeMul *= 0.85; }
    return res;
  }

  // ---------------------------------------------------------------- overlay life cycle
  open(flow, opts, resolve) {
    const g = this.game;
    const wasPaused = g.paused;
    g.pause?.(true);
    g.freezeRender = true;
    const root = document.createElement('div');
    root.id = 'handwork'; root.className = 'hw';
    root.innerHTML = `<div class="hw-panel" role="dialog" aria-label="作業"><div class="hw-head"><b class="hw-title"></b><span class="hw-step"></span><span class="hw-badge"></span></div>
      <canvas class="hw-cv" width="${W}" height="${H}"></canvas>
      <div class="hw-say hidden"></div>
      <div class="hw-hint"></div>
      <div class="hw-foot"><span class="hw-dots"></span><span class="hw-sp"></span><button class="btn small hw-auto" type="button">おまかせで 仕上げる <kbd>Tab</kbd></button><button class="btn small ghost hw-stop" type="button">やめる <kbd>Esc</kbd></button></div></div>`;
    document.body.appendChild(root);
    const cv = root.querySelector('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = W * dpr; cv.height = H * dpr;
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const st = {
      flow, opts, idx: 0, kind: null, results: [], root, cv, ctx, done: false, cancelled: false, last: performance.now(), autoT: 0, finishing: false, finishP: opts.autoP, flashT: 0, flashS: 0, msgT: 0,
      I: { x: 400, y: 260, down: false, pressed: false, released: false, wheel: 0, keys: new Set(), hit: new Set(), gest: [], hand: null, active: false, speed: 0, dragY: 0, sx: 0, sy: 0 },
    };
    this.active = st;
    root.querySelector('.hw-title').textContent = opts.title || '作業';
    const toCanvas = (e) => { const r = cv.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H]; };
    const I = st.I;
    let lastMove = performance.now();
    cv.addEventListener('pointerdown', (e) => { e.preventDefault(); cv.setPointerCapture?.(e.pointerId); I.lastMouse = performance.now(); [I.x, I.y] = toCanvas(e); I.down = true; I.pressed = true; I.active = true; I.sx = I.x; I.sy = I.y; I.dragY = 0; });
    cv.addEventListener('pointermove', (e) => { const [x, y] = toCanvas(e); const now = performance.now(); I.lastMouse = now; const dt = Math.max(1, now - lastMove) / 1000; I.speed = dist(x, y, I.x, I.y) / dt; lastMove = now; I.x = x; I.y = y; I.active = true; if (I.down) I.dragY = I.y - I.sy; });
    const up = (e) => { if (!I.down) return; [I.x, I.y] = toCanvas(e); I.dragY = I.y - I.sy; I.down = false; I.released = true; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => { e.preventDefault(); I.wheel += e.deltaY; }, { passive: false });
    cv.style.touchAction = 'none';
    st.onKey = (e) => {
      const k = e.code;
      if (['Tab', 'Escape', 'Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyE', 'KeyR', 'KeyA', 'KeyD', 'KeyS', 'Enter'].includes(k)) { e.preventDefault(); e.stopPropagation(); }
      if (e.type === 'keydown') {
        if (e.repeat) return;
        if (k === 'Escape') { this.cancel(); return; }
        if (k === 'Tab') { this.autoComplete(); return; }
        I.keys.add(k); I.hit.add(k);
      } else I.keys.delete(k);
    };
    window.addEventListener('keydown', st.onKey, true);
    window.addEventListener('keyup', st.onKey, true);
    // what the partner says while you work (the HUD subtitles are under this overlay)
    const sayEl = root.querySelector('.hw-say');
    st.onSay = (e) => { if (!e?.text || e.who === 'あなた') return; sayEl.textContent = `${e.who}「${e.text}」`; sayEl.classList.remove('hidden'); clearTimeout(st.sayT); st.sayT = setTimeout(() => sayEl.classList.add('hidden'), 3500 + e.text.length * 90); };
    g.bus?.on('subtitle', st.onSay);
    root.querySelector('.hw-auto').onclick = () => this.autoComplete();
    root.querySelector('.hw-stop').onclick = () => this.cancel();
    st.resolve = (r) => {
      window.removeEventListener('keydown', st.onKey, true);
      window.removeEventListener('keyup', st.onKey, true);
      g.bus?.off?.('subtitle', st.onSay); clearTimeout(st.sayT);
      root.remove();
      this.active = null;
      g.freezeRender = false;
      if (!wasPaused) g.pause?.(false);
      resolve(r);
    };
    this.nextStep();
    const loop = (t) => { if (this.active !== st) return; this.frame(t); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  nextStep() {
    const st = this.active;
    if (st.kind?.step.sync && this.sc.trap) st.kind.step.sync(st.kind, this.sc.trap, this, true);
    if (st.kind) st.results.push({ kind: st.kind.step.kind, p: st.kind.p, n: st.kind.step.weight ?? st.kind.n, bstep: st.kind.step.bstep, hid: st.kind.step.hid });
    // a gate can stop the flow after a step (e.g. the friction gave no ember → no blowing)
    if (st.kind && st.opts.gate && st.idx < st.flow.length && st.opts.gate(st.idx - 1, st.results) === false) { this.extra.stopped = true; return this.finish(); }
    if (st.idx >= st.flow.length) return this.finish();
    const step = st.flow[st.idx++];
    const K = KINDS[step.kind] || Place;
    st.kind = new K(step, this);
    if (st.opts.mode === 'assist') st.kind.need = Math.min(st.kind.n, Math.max(2, Math.ceil(st.kind.n / 3)));
    if (step.total) this.sc.total = step.total;
    if (step.kind === 'weave') { this.sc.total = Math.max(6, Math.round(step.n / 2)); this.sc.rows = 0; this.sc.loose = []; }
    if (step.material) this.sc.material = step.material;
    if (step.variant) this.sc.variant = step.variant;
    if (step.blade) this.sc.blade = step.blade;
    if (step.colors) this.sc.colors = step.colors;
    if (step.content) this.sc.content = step.content;
    if (step.pestle != null) this.sc.pestle = step.pestle;
    st.kind.t = 0;
    if (this.sc.carcass) { this.sc.carcass.step = step.bstep; if (st.idx > 1) { const prev = st.flow[st.idx - 2]; if (prev?.bstep) this.sc.carcass.done[prev.bstep] = true; } }
    st.opts.onStep?.(step, st.idx - 1);
    const seen = this.seen[step.kind] || 0;
    const hintsOn = this.game.settings?.hints !== false;
    const ctl = CONTROLS[step.kind] || {};
    const how = this.game.hands?.ready ? ctl.gesture : this.game.setup?.control === 'touch' ? ctl.touch : ctl.mouse;
    st.root.querySelector('.hw-step').textContent = `${st.idx} / ${st.flow.length}　${step.label || KIND_NAMES[step.kind] || ''}`;
    st.root.querySelector('.hw-hint').textContent = step.hint ? `${step.hint}　（${how || ''}）` : hintsOn && seen < 3 ? `${(HINTS[step.kind] || [''])[0]}　（${how || ''}）` : hintsOn ? `（${how || ''}）` : '';
    st.root.querySelector('.hw-badge').textContent = st.opts.quick ? '手慣れた：ひと手で 仕上げ' : st.opts.sameRhythm ? '同じ 調子で 続ける' : st.opts.mode === 'assist' ? '半自動' : st.opts.mode === 'auto' ? 'おまかせ' : '';
    this.seen[step.kind] = seen + 1;
  }

  frame(t) {
    const st = this.active;
    const dt = Math.min(0.25, (t - st.last) / 1000); // real time: timing judgements must not slow down on a slow machine
    st.last = t;
    const I = st.I;
    // gestures: the camera hand as a pointer (pinch = pressed) plus motion events
    const hs = this.game.hands;
    if (hs?.ready && this.game.freezeRender) hs.poll(); // the game loop is frozen while we are open
    if (hs?.ready) {
      I.gest = (hs.events || []).slice();
      const h = hs.motion?.state?.hands?.[0];
      if (h) {
        const hx = h.x * W, hy = h.y * H, pinch = !!h.pinch;
        I.hand = { x: hx, y: hy, pinch };
        I.handGrab = h.pose === 'fist' || h.pose === 'grab' || (I.handGrab && !I.gest.some((e) => e.type === 'release'));
        if (I.gest.some((e) => e.type === 'grab')) I.handGrab = true;
        if (performance.now() - (I.lastMouse || 0) > 1500) { // the mouse / finger wins while it is being used
          if (pinch && !I.down) { I.pressed = true; I.sx = hx; I.sy = hy; I.dragY = 0; }
          if (!pinch && I.down) { I.released = true; I.dragY = hy - I.sy; }
          I.down = pinch; I.x = hx; I.y = hy; I.active = true;
          if (pinch) I.dragY = hy - I.sy;
        }
      } else I.hand = null;
    } else I.gest = [];
    const k = st.kind;
    if (k && !k.done) {
      if (st.opts.mode === 'auto' || st.finishing) {
        st.autoT += dt;
        if (st.autoT > (st.opts.mode === 'auto' ? 2 / st.flow.length : 0.4)) { k.autoFinish(st.finishP ?? 0.55); st.autoT = 0; this.autoVisual(); }
      } else {
        k.update(dt, I);
        if (!k.done && k.count >= k.need && k.need < k.n) { k.autoFinish(Math.min(0.85, k.p || 0.55)); this.autoVisual(); }
      }
    }
    // the diagram follows the work (steps can carry a sync(kind, trapState, hw, done) hook)
    if (k?.step.sync && this.sc.trap) k.step.sync(k, this.sc.trap, this, !!k.done);
    I.pressed = false; I.released = false; I.wheel = 0; I.hit.clear();
    this.draw(dt);
    if (k?.done && !st.done) { st.msgT += dt; if (st.msgT > 0.45) { st.msgT = 0; this.nextStep(); } }
  }

  autoVisual() { const sc = this.sc; sc.chips = Math.max(sc.chips, 3); sc.wraps = 8; sc.progress = 1; sc.rows = sc.total; sc.mix = 1; sc.shine = 1; sc.taper = Math.max(sc.taper, 0.8); sc.coils = 3; sc.smooth = 1; sc.tight = true; }

  draw(dt) {
    const st = this.active, ctx = st.ctx;
    ctx.clearRect(0, 0, W, H);
    // paper
    ctx.fillStyle = '#f7f0dd'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(90,70,30,.10)'; ctx.lineWidth = 1;
    for (let y = 34; y < H; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    const t = performance.now() / 1000, sc = this.sc, k = st.kind;
    const scene = k?.step.scene || 'core';
    this.drawScene(ctx, scene, t);
    k?.draw(ctx);
    // particles
    this.parts = this.parts.filter((p) => (p.life -= dt) > 0);
    for (const p of this.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g ?? 380) * dt; ctx.save(); ctx.globalAlpha = clamp01(p.life * 2); drawSpark(ctx, p.x, p.y, p.size, p.kind); ctx.restore(); }
    // the working hand
    const hh = k && !k.done ? k.hand(st.I) : null;
    // on the field diagrams the hand only shows while you hold / drag, smaller, so it never hides the marks
    const diagram = scene === 'trap' || scene === 'track' || scene === 'carcass';
    if (hh && (!diagram || st.I.down)) { ctx.save(); if (diagram) ctx.globalAlpha = 0.8; drawHand(ctx, { side: 'right', scale: diagram ? 0.7 : 0.95, ...hh }); ctx.restore(); }
    // flash / feel text
    if (st.flashT > 0) {
      st.flashT -= dt;
      ctx.save(); ctx.globalAlpha = clamp01(st.flashT * 2); ctx.font = '800 26px "Zen Maru Gothic", sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = st.flashS >= 0.8 ? '#1f7f86' : st.flashS >= 0.4 ? '#c8921a' : '#8c8570';
      ctx.fillText(st.flashS >= 0.85 ? 'いい！' : st.flashS >= 0.55 ? 'よし' : st.flashS >= 0.25 ? 'まずまず' : 'ずれた', W / 2, 150 - (0.5 - st.flashT) * 30);
      ctx.restore();
    }
    // progress dots and the running p
    const dots = st.root.querySelector('.hw-dots');
    const pr = k ? k.progress : 1;
    dots.style.setProperty('--p', `${Math.round(pr * 100)}%`);
    st.root.querySelector('.hw-sp').textContent = k && k.count > 0 ? `手ごたえ ${feelOf(k.p).label}` : '';
  }

  drawScene(ctx, scene, t) {
    const sc = this.sc;
    switch (scene) {
      case 'core':
        drawProp(ctx, 'lap', { x: 400, y: 395, scale: 1.2, t });
        drawProp(ctx, 'core', { x: 400, y: 300, scale: 1.25, t, material: /obsidian/.test(sc.material) ? 'obsidian' : /chert|flint/.test(sc.material) ? 'chert' : 'stone', chips: sc.chips, cracked: sc.cracked });
        drawHand(ctx, { x: 470, y: 380, side: 'left', pose: 'grip', scale: 0.9, rot: 0.2 });
        break;
      case 'whetstone':
        drawProp(ctx, 'whetstone', { x: 400, y: 330, scale: 1.5, t, wet: 0.8 });
        drawProp(ctx, 'blade', { x: (this.active.kind?.x ?? 400), y: 296, scale: 0.95, t, kind: sc.blade || 'knife', shine: sc.shine, angle: -0.08 });
        drawHand(ctx, { x: 190, y: 380, side: 'left', pose: 'open', scale: 0.9, rot: 0.5 });
        break;
      case 'stick':
        drawProp(ctx, 'stick', { x: 400, y: 262, scale: 1.75, t, length: 1, taper: sc.taper, notch: sc.notch, straight: sc.straight, charred: sc.charred || 0 });
        drawHand(ctx, { x: 200, y: 330, side: 'left', pose: 'grip', scale: 0.9 });
        break;
      case 'lashing':
        drawProp(ctx, 'lashing', { x: 400, y: 262, scale: 1.4, t, wraps: sc.wraps, tight: !!sc.tight, variant: sc.variant || 'cross' });
        drawHand(ctx, { x: 250, y: 360, side: 'left', pose: 'grip', scale: 0.9, rot: 0.3 });
        break;
      case 'cord':
        drawProp(ctx, 'cord', { x: 400, y: 262, scale: 1.7, t, progress: sc.progress, tight: !!sc.tight, loose: !!this.failures?.has('unravel') });
        drawHand(ctx, { x: 160, y: 320, side: 'left', pose: 'pinch', scale: 0.9 });
        break;
      case 'weave':
        drawProp(ctx, 'weave', { x: 400, y: 255, scale: 1.25, t, rows: sc.rows, total: sc.total, loose: sc.loose || [], material: sc.material === 'chert' ? 'leaf' : sc.material });
        break;
      case 'bowl':
        drawProp(ctx, 'bowl', { x: 400, y: 300, scale: 1.6, t, mix: sc.mix, colors: sc.colors || ['#8a6a4a', '#d9c39a'], content: sc.content || 'paste', pestle: !!sc.pestle });
        drawHand(ctx, { x: 230, y: 380, side: 'left', pose: 'grip', scale: 0.9, rot: 0.3 });
        break;
      case 'clay':
        drawProp(ctx, 'clay', { x: 400, y: 290, scale: 1.6, t, coils: sc.coils, smooth: sc.smooth });
        break;
      case 'pot':
        drawProp(ctx, 'fire', { x: 400, y: 380, scale: 1.1, t, power: 0.8 });
        drawProp(ctx, 'pot', { x: 400, y: 250, scale: 1.05, t, bubbles: sc.bubbles, steam: sc.steam, content: sc.content || 'water' });
        break;
      case 'skewer':
        drawProp(ctx, 'fire', { x: 400, y: 390, scale: 1.15, t, power: 0.85 });
        drawProp(ctx, 'skewer', { x: 400, y: 262, scale: 1.4, t, doneness: sc.doneness, side: sc.side, food: sc.food || 'fish' });
        break;
      case 'filter':
        drawProp(ctx, 'filter', { x: 520, y: 260, scale: 1.2, t, layers: sc.layers || [], slots: 0, water: sc.water || 0 });
        break;
      case 'stake':
        drawProp(ctx, 'stake', { x: 400, y: 330, scale: 1.3, t, depth: sc.depth });
        break;
      case 'firelay': // the stone ring; the lay goes in bottom-up (tinder, kindling teepee, fuel)
        drawProp(ctx, 'fire', { x: 470, y: 380, scale: 1.1, t, power: 0 });
        break;
      case 'trap': // §26: trap / fieldcraft diagrams
        if (sc.trap) TA.drawTrapScene?.(ctx, sc.trap.id || sc.trap.type, { ...sc.trap, drift: t }, sc.trap.view || 'mild', { x: 40, y: 30, w: 720, h: 450 });
        break;
      case 'track':
        if (sc.track) TA.drawTrackCard?.(ctx, sc.track.species, sc.track.kind, sc.track.age, { x: 220, y: 60, w: 360, h: 300 }, { K: sc.track.K });
        break;
      case 'carcass': // §25: the paper diagram (normal / mild), never 3D gore
        if (sc.carcass) drawCarcass(ctx, sc.carcass.species, sc.carcass.view, sc.carcass, { x: 40, y: 30, w: 720, h: 450 });
        break;
      case 'drill': // fire board on the ground, the drill upright between the palms, smoke and an ember at the notch
        drawProp(ctx, 'lap', { x: 400, y: 380, scale: 1.1, t });
        drawProp(ctx, 'stick', { x: 400, y: 250, scale: 0.75, rot: -Math.PI / 2, t, length: 1, straight: 1 });
        drawProp(ctx, 'bowl', { x: 560, y: 360, scale: 0.75, t, mix: 0, colors: ['#c9a96a', '#b08d55'], content: 'powder' });
        drawHand(ctx, { x: 360 - (this.active.kind?.x ? (this.active.kind.x - 400) * 0.25 : 0), y: 250, side: 'left', pose: 'open', scale: 0.95, rot: 1.4 });
        if ((sc.heat || 0) > 0.5) { ctx.save(); ctx.globalAlpha = (sc.heat - 0.5) * 2; drawSpark(ctx, 400, 340, 10, 'ember'); ctx.restore(); }
        break;
      case 'flint':
        drawProp(ctx, 'bowl', { x: 400, y: 340, scale: 1.1, t, mix: 0, colors: ['#c9a96a', '#b08d55'], content: 'powder' });
        drawProp(ctx, 'core', { x: 340, y: 230, scale: 0.6, t, material: 'chert' });
        drawHand(ctx, { x: 300, y: 300, side: 'left', pose: 'grip', scale: 0.85, rot: 0.3 });
        break;
      case 'blow': {
        const gl = sc.glow || 0;
        drawProp(ctx, 'bowl', { x: 400, y: 320, scale: 1.4, t, mix: 0, colors: ['#c9a96a', '#b08d55'], content: 'powder' });
        ctx.save(); ctx.globalAlpha = 0.25 + gl * 0.75; drawSpark(ctx, 400, 300, 10 + gl * 16, 'ember'); ctx.restore();
        if (gl > 0.75) { ctx.save(); ctx.globalAlpha = (gl - 0.75) * 4; drawProp(ctx, 'fire', { x: 400, y: 292, scale: 0.45 + gl * 0.2, t, power: gl }); ctx.restore(); }
        drawHand(ctx, { x: 250, y: 380, side: 'left', pose: 'open', scale: 0.9, rot: 0.6 });
        drawHand(ctx, { x: 550, y: 380, side: 'right', pose: 'open', scale: 0.9, rot: -0.6 });
        ctx.save(); ctx.font = '700 18px "Zen Maru Gothic", sans-serif'; ctx.fillStyle = '#5d5849'; ctx.textAlign = 'center';
        ctx.fillText('ふーっ…（一定の 間で。強すぎると 散る）', 400, 140); ctx.restore();
        break;
      }
      case 'arm':
        drawProp(ctx, 'arm', { x: 400, y: 280, scale: 1.5, t, wraps: sc.wraps ? Math.round(sc.wraps * 0.75) : 0, tight: sc.tight ? 1 : 0.4 });
        break;
      default:
        drawProp(ctx, 'lap', { x: 400, y: 395, scale: 1.2, t });
    }
  }

  burst(x, y, kind, n = 4) {
    for (let i = 0; i < n; i++) {
      const up = kind === 'steam' || kind === 'bubble' || kind === 'ember';
      this.parts.push({ x, y, vx: (Math.random() - 0.5) * (up ? 40 : 260), vy: up ? -40 - Math.random() * 60 : -120 - Math.random() * 160, g: up ? -20 : 520, life: up ? 1.2 : 0.7, size: kind === 'spark' ? 9 : kind === 'steam' ? 12 : 6 + Math.random() * 4, kind });
    }
    if (this.parts.length > 160) this.parts.splice(0, this.parts.length - 160);
  }
  sfx(name) { if (name) try { this.game.sys?.sfx?.play(name); } catch { /* ignore */ } }
  flash(s) { if (this.active) { this.active.flashT = 0.5; this.active.flashS = s; } }

  /** おまかせで 仕上げる: the rest at the average of what you did and 0.55 */
  autoComplete() {
    const st = this.active; if (!st || st.finishing) return;
    const done = st.results.concat(st.kind && st.kind.count ? [{ p: st.kind.p, n: st.kind.count }] : []);
    const pSoFar = done.length ? done.reduce((a, r) => a + r.p * r.n, 0) / Math.max(1, done.reduce((a, r) => a + r.n, 0)) : 0.55;
    st.finishP = (pSoFar + 0.55) / 2; st.finishing = true;
  }
  cancel() { const st = this.active; if (!st || st.done) return; st.done = true; st.cancelled = true; st.resolve({ ok: false, cancelled: true, p: 0, feel: feelOf(0), steps: [], failures: [], extra: {} }); }

  finish() {
    const st = this.active; if (!st || st.done) return;
    st.done = true;
    const tot = st.results.reduce((a, r) => a + r.n, 0) || 1;
    let p = st.results.reduce((a, r) => a + r.p * r.n, 0) / tot;
    if (st.opts.mode === 'auto') p = st.opts.autoP ?? 0.55;
    p = clamp01(p);
    const feel = feelOf(p);
    // §24.5 failure per action kind when p < 0.25 (manual only)
    if (feel.fail && st.opts.mode === 'manual') {
      const kinds = new Set(st.results.map((r) => r.kind));
      if (kinds.has('twist')) this.failures.add(this.sc.variant === 'haft' ? 'loose_blade' : 'unravel');
      if (kinds.has('trace')) this.failures.add('slip');
      if (kinds.has('weave')) this.failures.add('skipped');
      if (kinds.has('strike') && !this.failures.has('core_cracked')) this.failures.add('snapped');
      if (kinds.has('tend')) this.failures.add('burnt');
    }
    // show the result for a moment
    const r = { ok: true, p, feel, steps: st.results.map((x) => ({ kind: x.kind, p: x.p, bstep: x.bstep, hid: x.hid })), mode: st.opts.mode, quick: !!st.opts.quick, sameRhythm: !!st.opts.sameRhythm, cancelled: false, failures: [...this.failures], extra: { ...this.extra } };
    st.root.querySelector('.hw-hint').textContent = `${feel.label}（手仕事 ${feel.bonus >= 0 ? '＋' : '−'}${Math.abs(feel.bonus)}）`;
    st.root.classList.add('hw-done');
    if (this.sc.carcass) { for (const s2 of st.flow) if (s2.bstep) this.sc.carcass.done[s2.bstep] = true; this.sc.carcass.step = null; }
    this.flash(p);
    setTimeout(() => st.resolve(r), st.opts.mode === 'auto' ? 350 : 900);
  }
}
