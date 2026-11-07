// chart.js — turns a stage segment into timed events, one bar-sized pattern at a time.
// Every pattern is a small exercise: open the chest, raise the arms, circle the shoulders, step sideways.
import * as THREE from 'three';
import { TAU, DEG } from './util.js';

const HEALTH_TIPS = [
  ['肩の力をぬいて、深呼吸', '肩が上がっていたら、ストンと落とそう'],
  ['おへそを軽く引きしめて', 'お腹に少し力を入れると腰が安定します'],
  ['呼吸を止めないで', '吐きながら腕を伸ばすと楽になります'],
  ['ひじは軽くゆるめてOK', '腕は伸ばしきらなくても届きます'],
  ['痛みが出たら無理せずスキップ', 'ミスしても大丈夫。気持ちよく動ける範囲で'],
  ['胸を張って、目線は前へ', 'デスクワークの猫背をリセット'],
];

const CAPTIONS = {
  orb: ['青い星は左手、ピンクの星は右手でタッチ', '星が手元に来た瞬間にふれるとPERFECT'],
  both: ['ふたつ同時に来たら両手で！', '大きく腕をひらくほど肩甲骨が動きます'],
  high: ['高い星は、腕をまっすぐ上へ', '肩まわりをぐーっと伸ばそう'],
  gold: ['金色の星はどちらの手でもOK', ''],
  thread: ['光の彗星を手で追いかけて', '大きな円をえがいて肩をほぐそう'],
  butterfly: ['両手で大きな円をえがこう', '肩甲骨から回すイメージで'],
  rainbow: ['両腕を横から上へ、ゆっくり', '下ろすときも彗星について行こう'],
  infinity: ['両手をそろえて∞をえがこう', '腰ではなく胸から、やさしくひねる'],
  wing: ['両腕を横に大きく広げてキープ', '胸をひらいて肩甲骨をよせる'],
  sky: ['両手を上げてYの字でキープ', '背すじを伸ばして、肩は下げたまま'],
  step: ['光のカーテンをよけて横にステップ', '足元の光るマークに移動しよう'],
  duck: ['光のバーは軽くひざを曲げてくぐる', '背中はまっすぐ、お尻を少し後ろへ'],
  twist: ['うずまきの星は反対の手で', '体をやさしくひねって届けよう'],
};

// ---------- patterns ----------
// gen(g, beat) emits events starting at `beat` (beats from the stage downbeat); bars = length
const P = {
  frontHalf: { bars: 1, gen(g, b) { g.orb(b, 'L', 'front'); g.orb(b + 2, 'R', 'front'); } },
  frontAlt: { bars: 1, gen(g, b) { g.orb(b, 'L', 'front'); g.orb(b + 1, 'R', 'front'); g.orb(b + 2, 'L', 'front'); g.orb(b + 3, 'R', 'front'); } },
  climb: {
    bars: 1, sided: true,
    gen(g, b, s) {
      const [a, o] = s < 0 ? ['L', 'R'] : ['R', 'L'];
      g.orb(b, a, 'front'); g.orb(b + 1, a, 'y'); g.orb(b + 2, a, 'high'); g.orb(b + 3, o, 'front');
    },
  },
  widePulse: { bars: 1, gen(g, b) { g.pair(b, 'wide'); g.pair(b + 2, 'front'); } },
  skyPress: { bars: 1, gen(g, b) { g.pair(b, 'high'); g.pair(b + 2, 'low'); } },
  yRaise: { bars: 1, gen(g, b) { g.pair(b, 'y'); g.orb(b + 2, 'L', 'front'); g.orb(b + 3, 'R', 'front'); } },
  zigzag: {
    bars: 1, sided: true,
    gen(g, b, s) {
      const [a, o] = s < 0 ? ['L', 'R'] : ['R', 'L'];
      g.orb(b, a, 'y'); g.orb(b + 1, o, 'low'); g.orb(b + 2, o, 'y'); g.orb(b + 3, a, 'low');
    },
  },
  twist: { bars: 1, gen(g, b) { g.orb(b, 'R', 'cross', { twist: true }); g.orb(b + 2, 'L', 'cross', { twist: true }); } },
  goldTop: { bars: 1, gen(g, b) { g.orb(b, 'A', 'top'); g.orb(b + 2, 'L', 'wide'); g.orb(b + 3, 'R', 'wide'); } },
  runs8: {
    bars: 1,
    gen(g, b) {
      const seq = ['low', 'front', 'y', 'high', 'high', 'y', 'front', 'low'];
      seq.forEach((k, i) => g.orb(b + i * 0.5, i % 2 ? 'R' : 'L', k, { optional: i % 2 === 1 && i !== 7 }));
    },
  },
  crown: {
    bars: 2,
    gen(g, b) {
      g.orb(b, 'L', 'high'); g.orb(b + 1, 'R', 'high'); g.orb(b + 2, 'L', 'y'); g.orb(b + 3, 'R', 'y');
      g.orb(b + 4, 'L', 'wide'); g.orb(b + 5, 'R', 'wide'); g.pair(b + 6, 'front');
    },
  },
  circle: { bars: 2, sided: true, gen(g, b, s) { g.circle(b, 8, s < 0 ? 'L' : 'R', 2); } },
  butterfly: { bars: 2, gen(g, b) { const d = g.rng.chance(0.5) ? 1 : -1; g.circle(b, 8, 'L', 2, d, 'butterfly'); g.circle(b, 8, 'R', 2, d, 'butterfly'); } },
  rainbow: { bars: 2, gen(g, b) { g.rainbow(b, 8, 'L', 2); g.rainbow(b, 8, 'R', 2); } },
  infinity: { bars: 2, gen(g, b) { g.infinity(b, 8); } },
  wing: { bars: 1, gen(g, b) { g.gate(b, 2, 'wing'); } },
  sky: { bars: 1, gen(g, b) { g.gate(b, 2, 'sky'); } },
  step: { bars: 1, move: true, gen(g, b) { g.wall(b + 2); g.orb(b + 3.5, g.rng.chance(0.5) ? 'L' : 'R', 'front'); } },
  duck: { bars: 1, move: true, gen(g, b) { g.bar(b + 1); g.pair(b + 3, 'high'); } },
  stepWide: { bars: 1, move: true, gen(g, b) { g.pair(b, 'wide'); g.wall(b + 2.5); } },
};

// weights per stage (patterns missing from a pool never appear there)
const POOLS = {
  warm: { frontHalf: 3, circle: 2.4, butterfly: 1.2, rainbow: 2, wing: 1.5, sky: 1.2 },
  lake: { frontAlt: 3, frontHalf: 1, climb: 2.4, widePulse: 2.2, skyPress: 1.2, yRaise: 1.6, goldTop: 1, circle: 1.4, butterfly: 1, rainbow: 1, wing: 1.2, sky: 1 },
  river: { frontAlt: 1.6, climb: 1.6, widePulse: 1.6, yRaise: 1, zigzag: 2.2, twist: 1.4, goldTop: 1, step: 3, stepWide: 1, infinity: 1, butterfly: 1, circle: 0.8, wing: 1 },
  meteor: { frontAlt: 1, zigzag: 2, twist: 1.4, runs8: 2.2, crown: 1.6, step: 2.4, stepWide: 1, duck: 2.6, widePulse: 1.2, rainbow: 1, infinity: 0.8, sky: 1 },
  aurora: { runs8: 2.6, crown: 2, zigzag: 2, step: 2.4, stepWide: 1.2, duck: 2.2, widePulse: 1.6, twist: 1.4, butterfly: 1, skyPress: 1, yRaise: 1, goldTop: 1 },
};
const REST = { warm: 0.3, lake: 0.14, river: 0.1, meteor: 0.07, aurora: 0.05 };

// cool-down: a fixed routine of slow holds (in beats)
function coolRoutine(quick, backCare) {
  const r = [
    ['crown', 8, 'のび〜っと両手を上に', 'ゆっくり吸って、吐いて'],
    ['rest', 4],
    ['crossR', 8, '右腕を胸の前へ', '左手でひじを軽く引きよせて'],
    ['crossL', 8, '左腕を胸の前へ', '右手でひじを軽く引きよせて'],
    ['wing', 8, '胸をひらいて肩甲骨をよせる', 'あごを軽く引いて、肩は下げたまま'],
  ];
  if (!quick) {
    r.push(['gaze', 16, '首をゆっくり、ホタルを目で追って', '体は正面のまま。気持ちいい範囲で']);
    if (!backCare) { r.push(['bendL', 6, '両手を上げて左へ、体の横を伸ばす', '']); r.push(['bendR', 6, '右へ、体の横を伸ばす', '']); }
    r.push(['slowCircle', 8, 'ゆっくり大きく肩まわし', '']);
  }
  r.push(['crown', 8, '最後にもう一度、大きくのび', 'おつかれさまでした！']);
  return r;
}
export function coolBars(quick, backCare) {
  const beats = coolRoutine(quick, backCare).reduce((a, x) => a + x[1] + (x[0] === 'rest' ? 0 : 2), 0);
  return 1 + Math.ceil(beats / 4) + 1;
}

// ---------- generator ----------
class Gen {
  constructor(seg, ctx) {
    this.seg = seg; this.ctx = ctx; this.rng = ctx.rng; this.body = ctx.body; this.events = [];
  }
  T(beat) { return this.seg.t0 + beat * this.seg.beatSec; }
  get laneX() { return this.ctx.lane * this.ctx.laneW; }

  introduce(key, t) {
    if (this.ctx.seen.has(key) || !CAPTIONS[key]) return;
    this.ctx.seen.add(key);
    const [text, sub] = CAPTIONS[key];
    this.events.push({ type: 'caption', t: t - this.seg.barSec * 1.4, dur: 3.6, text, sub, key });
  }

  orb(beat, hand, name, extra = {}) {
    const side = hand === 'L' ? -1 : hand === 'R' ? 1 : 0;
    const pos = this.body.target(name, side || 1);
    if (name === 'top') pos.x = 0;
    pos.x += this.laneX;
    const t = this.T(beat);
    this.events.push({ type: 'orb', t, hand, kind: name, pos, ...extra });
    this.introduce('orb', t);
    if (hand === 'A') this.introduce('gold', t);
    if (name === 'high') this.introduce('high', t);
    if (extra.twist) this.introduce('twist', t);
  }
  pair(beat, name) {
    this.orb(beat, 'L', name); this.orb(beat, 'R', name);
    this.introduce('both', this.T(beat));
  }

  thread(beat, beats, hand, kind, path, loops, caption) {
    const t = this.T(beat);
    this.events.push({ type: 'thread', t, t1: this.T(beat + beats), hand, kind, path, loops, lead: this.seg.barSec });
    this.introduce(caption || kind, t);
  }
  circle(beat, beats, hand, loops = 2, dir = 0, caption = 'thread', slow = false) {
    const b = this.body, s = hand === 'L' ? -1 : 1, lx = this.laneX;
    const d = dir || (this.rng.chance(0.5) ? 1 : -1);
    const r = b.reach * (slow ? 0.6 : 0.7), cx = b.shoulderHalf + 0.05, cy = b.shoulderY + 0.03, z = -0.3;
    const path = (u, out) => {
      const th = -Math.PI / 2 + d * TAU * loops * u;
      return out.set(lx + s * (cx + r * Math.cos(th)), cy + r * Math.sin(th), z);
    };
    this.thread(beat, beats, hand, 'circle', path, loops, caption === 'thread' ? 'thread' : caption);
  }
  rainbow(beat, beats, hand, reps = 2) {
    const b = this.body, s = hand === 'L' ? -1 : 1, lx = this.laneX, tmp = new THREE.Vector3();
    const path = (u, out) => {
      const p = (u * reps) % 1, tri = p < 0.5 ? p * 2 : 2 - p * 2;
      const e = -55 + 128 * (0.5 - 0.5 * Math.cos(Math.PI * tri));
      b.reachPoint(s, 34, e, 0.88, tmp);
      return out.set(tmp.x + lx, tmp.y, tmp.z);
    };
    this.thread(beat, beats, hand, 'rainbow', path, reps, 'rainbow');
  }
  infinity(beat, beats) {
    const b = this.body, lx = this.laneX;
    const a = b.shoulderHalf + b.reach * (b.backCare ? 0.32 : 0.42), h = 0.2, cy = b.shoulderY - 0.08, z = -0.4;
    const path = (u, out) => out.set(lx + a * Math.sin(TAU * u), cy + h * Math.sin(2 * TAU * u), z - 0.06 * Math.cos(TAU * u));
    this.thread(beat, beats, 'A', 'infinity', path, 1, 'infinity');
  }
  gate(beat, beats, pose, opts = {}) {
    const b = this.body, lx = this.laneX, t = this.T(beat);
    const hands = opts.hands || 'LR';
    const targets = {};
    for (const h of hands) {
      const side = h === 'L' ? -1 : 1;
      const p = b.pose(pose === 'bendL' || pose === 'bendR' ? 'bend' : pose, side);
      if (pose === 'bendR') p.x = -p.x;
      p.x += lx;
      targets[h] = p;
    }
    this.events.push({ type: 'gate', t, t1: this.T(beat + beats), pose, hands, targets, laneX: lx, long: !!opts.long });
    if (!opts.long) this.introduce(pose, t);
  }
  wall(beat) {
    const c = this.ctx;
    let next;
    if (c.lane === 0) next = this.rng.chance(0.5) ? -1 : 1;
    else next = this.rng.chance(0.7) ? 0 : -c.lane;
    if (c.lane !== 0 && next === -c.lane && c.laneW > 0.5) next = 0; // never a double-width jump with large steps
    const t = this.T(beat);
    this.events.push({ type: 'wall', t, from: c.lane, free: next, laneW: c.laneW });
    c.lane = next;
    c.moves++;
    this.introduce('step', t);
  }
  bar(beat) {
    const t = this.T(beat);
    this.events.push({ type: 'bar', t, depth: this.ctx.squatDepth, laneX: this.laneX });
    this.introduce('duck', t);
  }
  gaze(beat, beats) {
    const b = this.body, lx = this.laneX;
    const path = (u, out) => {
      const yaw = 34 * DEG * Math.sin(TAU * u), pitch = 14 * DEG * Math.sin(2 * TAU * u);
      return out.set(lx + 1.6 * Math.sin(yaw) * Math.cos(pitch), b.eyeY + 1.6 * Math.sin(pitch), -1.6 * Math.cos(yaw) * Math.cos(pitch));
    };
    this.events.push({ type: 'gaze', t: this.T(beat), t1: this.T(beat + beats), path });
  }
  caption(beat, text, sub, dur = 3.6) { this.events.push({ type: 'caption', t: this.T(beat), dur, text, sub }); }
}

// ctx: { rng, body, lane, laneW, squatDepth, seated, backCare, quick, seen:Set, moves, tipIndex, last }
export function generateStage(seg, ctx) {
  const g = new Gen(seg, ctx);
  if (seg.key === 'cool') return genCool(g, seg, ctx);
  const pool = { ...POOLS[seg.key] };
  if (ctx.seated) { delete pool.step; delete pool.stepWide; delete pool.duck; }
  if (!ctx.squatDepth) delete pool.duck;
  if (ctx.backCare) { if (pool.twist) pool.twist *= 0.5; if (pool.infinity) pool.infinity *= 0.6; }
  const rest = Math.max(0.02, (REST[seg.key] ?? 0.1) - (seg.loop || 0) * 0.02);

  let bar = 1;                 // bar 0 is the stage title
  const lastBar = seg.bars - 1; // final bar stays empty for the transition
  let prev = ctx.last, sideBias = 0, sinceMove = 9, sinceTip = 0;
  while (bar < lastBar - (ctx.lane !== 0 ? 1 : 0)) {
    const room = lastBar - bar - (ctx.lane !== 0 ? 1 : 0);
    const table = {};
    for (const k in pool) {
      const p = P[k];
      if (p.bars > room) continue;
      if (k === prev) continue;
      if (p.move && sinceMove < 2) continue;
      table[k] = pool[k];
    }
    if (!Object.keys(table).length) break;
    const key = g.rng.weighted(table);
    const p = P[key];
    let side = 0;
    if (p.sided) { side = sideBias > 0 ? -1 : sideBias < 0 ? 1 : (g.rng.chance(0.5) ? -1 : 1); sideBias += side; }
    p.gen(g, bar * 4, side);
    prev = key;
    sinceMove = p.move ? 0 : sinceMove + p.bars;
    bar += p.bars;
    sinceTip += p.bars;
    if (sinceTip >= 12 && seg.key !== 'warm' && bar < lastBar - 2) {
      const [text, sub] = HEALTH_TIPS[ctx.tipIndex++ % HEALTH_TIPS.length];
      g.caption(bar * 4, text, sub);
      sinceTip = 0;
    }
    if (g.rng.chance(rest) && bar < lastBar - 1) bar += 1;
  }
  // come back to the centre lane before the next stage
  if (ctx.lane !== 0) {
    const t = g.T((lastBar - 1) * 4 + 2);
    g.events.push({ type: 'wall', t, from: ctx.lane, free: 0, laneW: ctx.laneW });
    ctx.lane = 0;
  }
  ctx.last = prev;
  g.events.sort((a, b) => a.t - b.t);
  return g.events;
}

function genCool(g, seg, ctx) {
  let beat = 4;
  for (const [kind, beats, text, sub] of coolRoutine(ctx.quick, ctx.backCare)) {
    if (kind === 'rest') { beat += beats; continue; }
    g.caption(beat, text, sub || '', Math.min(beats * seg.beatSec + 1.2, 9));
    const b0 = beat + 2;
    if (kind === 'crown') g.gate(b0, beats, 'crown', { long: true });
    else if (kind === 'crossR') g.gate(b0, beats, 'cross', { long: true, hands: 'R' });
    else if (kind === 'crossL') g.gate(b0, beats, 'cross', { long: true, hands: 'L' });
    else if (kind === 'wing') g.gate(b0, beats, 'wing', { long: true });
    else if (kind === 'bendL') g.gate(b0, beats, 'bendL', { long: true });
    else if (kind === 'bendR') g.gate(b0, beats, 'bendR', { long: true });
    else if (kind === 'gaze') g.gaze(b0, beats);
    else if (kind === 'slowCircle') { g.circle(b0, beats, 'L', 1, 1, 'none', true); g.circle(b0, beats, 'R', 1, 1, 'none', true); }
    beat = b0 + beats;
  }
  g.events.sort((a, b) => a.t - b.t);
  return g.events;
}
