// EYE GYM progress: what makes "getting better" visible.
//  - every game has a skill LEVEL (1-50) read straight from its adaptive difficulty,
//    so the number only goes up when your eyes actually did better
//  - EYE POWER = the five skill levels together (a radar chart)
//  - EYE LEVEL = experience from play (score), with titles
//  - a daily training of three games, stamps and a streak
//  - best scores, ranks S-D, history for graphs

const KEY = 'eye-gym.v1';

export const SKILLS = {
  contrast: { label: 'コントラスト' },
  focus: { label: '遠近' },
  speed: { label: '瞬間視' },
  depth: { label: '立体視' },
  field: { label: '周辺視' },
};

export const GAMES = {
  bubble: { title: 'Bubble Pop', skill: 'contrast', color: '#ff6fa8', icon: '◎', how: 'しま模様のシャボン玉だけ、指でつついて割ろう。無地はスルー！', base: 100 },
  rings: { title: 'Ring Rush', skill: 'focus', color: '#3fb8ff', icon: 'C', how: '飛んでくるリングの「切れ目」の方向へ、はじき返せ！遠くで返すほど高得点。', base: 150 },
  flash: { title: 'Flash Count', skill: 'speed', color: '#ffb52e', icon: '✦', how: '一瞬だけ光る星はいくつ？ 数字のボタンで答えよう。', base: 260 },
  depth: { title: 'Depth Order', skill: 'depth', color: '#4fcf6f', icon: '●', how: 'いちばん手前のボールから順番にタッチ！', base: 320 },
  catch: { title: 'Side Catch', skill: 'field', color: '#9a7bff', icon: '★', how: 'まん中の目を見たまま、まわりに出る星をつかまえよう。目が赤いときはさわらない！', base: 110 },
};
export const GAME_ORDER = ['bubble', 'rings', 'flash', 'depth', 'catch'];

/** Level 1-50 on a log scale between an easy and a hard value of the difficulty. */
export function levelFrom(value, easy, hard) {
  const k = Math.log(easy / value) / Math.log(easy / hard);
  return Math.max(1, Math.min(50, 1 + Math.round(49 * Math.max(0, k))));
}

export const RANKS = [
  { r: 'S', min: 8000, color: '#ff4f9a' },
  { r: 'A', min: 5500, color: '#ff9d2e' },
  { r: 'B', min: 3500, color: '#3fb8ff' },
  { r: 'C', min: 1800, color: '#4fcf6f' },
  { r: 'D', min: 0, color: '#9aa6c0' },
];
export const rankOf = (score) => RANKS.find((x) => score >= x.min);

const TITLES = [
  [1, 'Rookie Eye'], [5, 'Bright Eye'], [10, 'Sharp Eye'], [15, 'Hawk Eye'], [20, 'Eagle Eye'], [30, 'Star Eye'], [45, 'Legend Eye'],
];

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function merge(base, extra) {
  if (!extra || typeof extra !== 'object') return base;
  for (const k of Object.keys(extra)) {
    const v = extra[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) base[k] = merge(base[k], v);
    else base[k] = v;
  }
  return base;
}

export class Progress {
  constructor() {
    this.data = {
      settings: { volume: 0.8, music: 0.5, age: 42, quality: 'auto' },
      stairs: {}, games: {}, xp: 0, days: {}, skill: {}, achievements: {},
    };
    try { const raw = localStorage.getItem(KEY); if (raw) this.data = merge(this.data, JSON.parse(raw)); } catch (e) { /* no storage */ }
    for (const id of GAME_ORDER) this.data.games[id] = this.data.games[id] || { best: 0, plays: 0, history: [] };
  }
  get settings() { return this.data.settings; }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ } }
  // staircase storage API used by the shared CellGrid / Staircase
  stair(key) { return this.data.stairs[key]; }
  setStair(key, s) { this.data.stairs[key] = s; }

  skillLevel(skill) { return this.data.skill[skill] || 1; }
  eyePower() { return Object.keys(SKILLS).reduce((a, k) => a + this.skillLevel(k), 0); }

  eyeLevel() {
    // 1000 xp for level 2, a little more for each level after
    let lv = 1, need = 1000, xp = this.data.xp;
    while (xp >= need) { xp -= need; lv++; need = Math.round(need * 1.12); }
    return { lv, into: xp, need };
  }
  title(lv = this.eyeLevel().lv) { let t = TITLES[0][1]; for (const [m, n] of TITLES) if (lv >= m) t = n; return t; }

  /** Today's three games: rotates through all of them over the days. */
  daily(available) {
    const d = new Date();
    const n = Math.floor(d.getTime() / 864e5);
    const list = GAME_ORDER.filter((g) => available.includes(g));
    const out = [];
    for (let k = 0; out.length < Math.min(3, list.length); k++) {
      const g = list[(n * 2 + k) % list.length];
      if (!out.includes(g)) out.push(g);
    }
    return out;
  }
  day(key = today()) { return this.data.days[key] || (this.data.days[key] = { done: [], stamp: false }); }

  streak() {
    let s = 0;
    const d = new Date();
    for (let i = 0; i < 400; i++) {
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (this.data.days[k]?.stamp) s++;
      else if (i > 0) break;
      d.setDate(d.getDate() - 1);
    }
    return s;
  }

  /** Record a finished round. Returns what changed, for the results screen. */
  record(gameId, res, { daily = false } = {}) {
    const g = this.data.games[gameId];
    const def = GAMES[gameId];
    const prevBest = g.best;
    const prevLevel = this.skillLevel(def.skill);
    const prevEye = this.eyeLevel();
    g.plays++;
    g.best = Math.max(g.best, res.score);
    g.history.push({ date: new Date().toISOString(), score: res.score, level: res.level, acc: +res.accuracy.toFixed(2) });
    if (g.history.length > 200) g.history.shift();
    this.data.skill[def.skill] = Math.max(prevLevel, res.level);
    const xpGain = Math.round(res.score / 4) + 100;
    this.data.xp += xpGain;
    const eye = this.eyeLevel();
    let stamped = false;
    if (daily) {
      const d = this.day();
      if (!d.done.includes(gameId)) d.done.push(gameId);
      if (!d.stamp && d.done.length >= (res.dailyCount || 3)) { d.stamp = true; stamped = true; }
    }
    this.save();
    return {
      newBest: res.score > prevBest && prevBest > 0, firstPlay: prevBest === 0,
      prevBest, prevLevel, level: this.skillLevel(def.skill), levelUp: this.skillLevel(def.skill) > prevLevel,
      xpGain, eyeBefore: prevEye, eyeAfter: eye, eyeLevelUp: eye.lv > prevEye.lv, stamped,
      rank: rankOf(res.score),
    };
  }
}
