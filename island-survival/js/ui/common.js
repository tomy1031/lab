// ui/common.js — shared UI data and helpers: item lookup (with a safe fallback), ranks, freshness, attribute names,
// the take-along item list for the setup screen, preferences.
import { h } from './dom.js';

// ------------------------------------------------------------------ item definitions (js/data/items.js is loaded lazily)
let itemMod = null;
export async function loadItemModule() {
  if (itemMod) return itemMod;
  if (globalThis.ISLE_ITEMS) { itemMod = globalThis.ISLE_ITEMS; return itemMod; }
  try { itemMod = await import('../data/items.js'); } catch { itemMod = {}; }
  return itemMod;
}
export function defOf(id, stack = null) {
  try {
    const m = itemMod || globalThis.ISLE_ITEMS;
    const d = m?.itemDef?.(id, stack);
    if (d) return d;
  } catch { /* fall through */ }
  return { name: id, icon: '📦', weight: 0.1, attrs: {}, cat: 'misc', desc: '' };
}
export function nameOf(game, stack) {
  if (!stack) return '';
  if (stack.name) return stack.name;
  const d = defOf(stack.id, stack);
  try { const n = game?.sys?.knowledge?.nameOf?.(stack.id); if (n) return n; } catch { /* ignore */ }
  return d.name || stack.id;
}
export function iconOf(stack) { return defOf(stack.id, stack).icon || '📦'; }

// ------------------------------------------------------------------ DESIGN §11.2 / §11.7 / §7.2 / §7.3
export const ATTR_NAMES = {
  hard: '硬い', sharp: '鋭い', long: '長い', flex: 'しなる', fiber: '紐になる', burn: '燃える', tinder: '火口', waterproof: '防水',
  container: '容器', heavy: '重い', sticky: 'くっつく', toxic: '毒', insul: '保温', float: '浮く', edible: '食べられる', med: '薬効',
  heatproof: '耐熱', absorb: '吸う', shine: '光る', spark: '火花', scent: 'におう',
};
export const RANKS = [
  { name: '粗悪', cls: 'rk0', color: '#8a8a82' }, { name: '並', cls: 'rk1', color: '#5d5a52' }, { name: '良', cls: 'rk2', color: '#3f8f4a' },
  { name: '上等', cls: 'rk3', color: '#2f78c4' }, { name: '逸品', cls: 'rk4', color: '#c8921a' },
];
export const rankIdx = (q) => (q < 25 ? 0 : q < 50 ? 1 : q < 75 ? 2 : q < 90 ? 3 : 4);
export const rankOf = (q) => RANKS[rankIdx(q ?? 40)];
export const FRESH = [
  { name: '新鮮', cls: 'f0', color: '#4ea45a' }, { name: 'やや古い', cls: 'f1', color: '#d6b02c' },
  { name: '傷みかけ', cls: 'f2', color: '#e07a2c' }, { name: '腐敗', cls: 'f3', color: '#c4403a' },
];
export const freshStage = (f) => FRESH[f >= 70 ? 0 : f >= 40 ? 1 : f >= 15 ? 2 : 3];
export function cookName(done) {
  if (!done) return '';
  return done < 30 ? '生' : done < 65 ? '半生' : done <= 100 ? 'よく焼けた' : done <= 130 ? '焦げ' : '炭';
}
export const PROC_NAMES = { dried: '干物', smoked: '燻製', salted: '塩漬け', salted_dried: '塩干し', stew: '煮込み', confit: '油漬け' };

/** attribute tags: [[name, value], …] sorted by value */
export function attrTags(attrs, max = 12) {
  return Object.entries(attrs || {}).filter(([k, v]) => v > 0 && ATTR_NAMES[k]).sort((a, b) => b[1] - a[1]).slice(0, max).map(([k, v]) => [ATTR_NAMES[k], v, k]);
}
export function tagChips(attrs, max = 12, cls = '') {
  return attrTags(attrs, max).map(([n, v, k]) => h('span', { class: `tag a-${k} ${cls}` }, n, h('b', null, v)));
}
export const stars = (n) => '★'.repeat(Math.round(n)) + '☆'.repeat(Math.max(0, 5 - Math.round(n)));
export const fmtKg = (v) => `${(Math.round(v * 10) / 10).toFixed(1)}kg`;

// ------------------------------------------------------------------ preferences (UI-side, plus game settings via core/save)
const PK = 'isle.ui';
export const prefs = {
  get() { try { return JSON.parse(localStorage.getItem(PK) || '{}'); } catch { return {}; } },
  set(patch) { try { localStorage.setItem(PK, JSON.stringify({ ...this.get(), ...patch })); } catch { /* ignore */ } },
};

// ------------------------------------------------------------------ take-along items (DESIGN §3 / §21)
export const STARTER_FALLBACK = [
  { id: 'knife', name: 'サバイバルナイフ', icon: '🔪', star: 2, score: 1.0, p: 'P0', desc: '切る・削る・さばく。錬成の「削る」品質 +20、解体の肉 +30%。万能の工作の島。' },
  { id: 'axe', name: '手斧', icon: '🪓', star: 2, score: 1.0, p: 'P0', desc: '伐採 ×3、薪割り、建築の所要時間 ×0.6。建築の島。' },
  { id: 'bow', name: '弓と矢 10 本', icon: '🏹', star: 3, score: 1.0, p: 'P0', desc: '射程 40m。矢は回収できる。狩りの島。' },
  { id: 'rifle', name: '猟銃', icon: '🔫', star: 3, score: 1.0, p: 'P0', desc: '射程 120m、威力 80。弾の火薬で着火。肉は取れるが弾が命。', ammo: true },
  { id: 'rod', name: '釣り竿', icon: '🎣', star: 2, score: 1.0, p: 'P0', desc: '糸・針 3・ウキつき。魚の島。食料は安定、ただし生魚に注意。' },
  { id: 'net', name: '投網', icon: '🕸️', star: 2, score: 1.0, p: 'P0', desc: '浅瀬で小魚を一度に 2〜8 匹。大漁と腐敗の島。' },
  { id: 'firesteel', name: '火打ち石', icon: '✨', star: 1, score: 0.95, p: 'P0', desc: '着火成功率 0.85、濡れに強い。初日から火がある島。' },
  { id: 'pot', name: '鍋（3L）', icon: '🍲', star: 2, score: 1.0, p: 'P0', desc: '煮沸・煮込み・塩づくり。安全な水と料理の島。' },
  { id: 'rope', name: 'ロープ 30m', icon: '🪢', star: 3, score: 1.05, p: 'P1', desc: '6 本に切り分け可。建築・いかだ・崖の昇降。探検と建築の近道。' },
  { id: 'bottle', name: '浄水ボトル', icon: '🧴', star: 2, score: 1.0, p: 'P1', desc: 'どの淡水でも飲める。水の心配がない島。' },
  { id: 'tent', name: '1 人用テント', icon: '⛺', star: 2, score: 1.0, p: 'P0', desc: '雨よけ 1.0、保温 +4℃、睡眠の質 +0.20。天気がこわくない島。' },
  { id: 'sleeping_bag', name: '寝袋', icon: '🛌', star: 2, score: 1.0, p: 'P0', desc: '就寝中 保温 +7℃。夜がこわくない島。雨には弱い。' },
  { id: 'goggles', name: '水中ゴーグル', icon: '🥽', star: 3, score: 1.05, p: 'P1', desc: '素潜りが可能に。貝・ウニ・タコ。海の中の島。' },
  { id: 'medkit', name: '救急箱', icon: '🧰', star: 3, score: 1.05, p: 'P1', desc: '包帯・消毒液・各種の薬。病気とケガを 6 回ほど無かったことに。' },
  { id: 'guide', name: 'サバイバル図鑑', icon: '📖', star: 2, score: 0.95, p: 'P1', desc: '植物・キノコ・魚介が最初から全部「確定」。発症率の数字が見える。' },
];
export function normStarter(e) {
  if (!e) return null;
  const d = Array.isArray(e) ? { id: e[0], ...e[1] } : e;
  const st = d.starter || {};
  const fb = STARTER_FALLBACK.find((x) => x.id === d.id) || {};
  const sc = st.score ?? d.score ?? fb.score ?? 1;
  const star = st.star ?? d.star ?? fb.star ?? 2;
  return {
    id: d.id, name: d.name || fb.name || d.id, icon: d.icon || fb.icon || '📦',
    star: typeof star === 'object' ? (star['12'] ?? Object.values(star)[0] ?? 2) : star,
    score: typeof sc === 'object' ? (sc['12'] ?? Object.values(sc)[0] ?? 1) : sc,
    p: st.p || d.p || fb.p || 'P0', desc: st.effect || st.desc || d.desc || fb.desc || '', ammo: d.id === 'rifle',
  };
}
export function getStarters(game) {
  let list = null;
  try { const m = itemMod || globalThis.ISLE_ITEMS; const r = m?.starterItems?.(); if (r) list = Array.isArray(r) ? r : Object.entries(r); } catch { /* ignore */ }
  list = (list || []).map(normStarter).filter(Boolean);
  if (list.length < 3) list = STARTER_FALLBACK.map(normStarter);
  return list;
}

// ------------------------------------------------------------------ setup: severity + score multiplier (DESIGN §2, §21.1)
export const COUNT_MULT = { 0: 1.6, 1: 1.0, 2: 0.8, 3: 0.65, all: 0.4 };
export const COUNT_SEV = { 0: 2, 1: 0, 2: -0.5, 3: -1, all: -2 };
export const DIFF_MULT = { easy: 0.6, normal: 1.0, hard: 1.4, extreme: 2.0 };
export const DIFF_SEV = { easy: -1, normal: 0, hard: 1, extreme: 2 };
export const AMMO_MULT = { 12: 1.0, 30: 0.9, inf: 0.7 };
export function calcSetup(setup, starters) {
  const chosen = setup.count === 'all' ? starters : starters.filter((s) => setup.starters.includes(s.id));
  const parts = [];
  let mult = 1;
  const add = (label, v) => { parts.push({ label, v }); mult *= v; };
  add(`持っていく数（${setup.count === 'all' ? '全部' : setup.count + ' 個'}）`, COUNT_MULT[setup.count] ?? 1);
  const itemMult = chosen.reduce((a, s) => a * (s.score || 1), 1);
  if (chosen.length && Math.abs(itemMult - 1) > 0.001) add('持ち物', itemMult);
  if (chosen.some((s) => s.ammo || s.id === 'rifle')) { const a = AMMO_MULT[setup.ammo] ?? 1; if (a !== 1) add('弾の数', a); }
  add('難易度', DIFF_MULT[setup.difficulty] ?? 1);
  if (setup.companion && setup.companion !== 'none') add('仲間あり', 0.9);
  const avg = chosen.length ? chosen.reduce((a, s) => a + (s.star || 2), 0) / chosen.length : 3;
  let sev = avg + (COUNT_SEV[setup.count] ?? 0) + (DIFF_SEV[setup.difficulty] ?? 0) - (setup.companion && setup.companion !== 'none' ? 0.5 : 0);
  if (setup.count === 'all') sev = Math.min(sev, avg - 2 + (DIFF_SEV[setup.difficulty] ?? 0));
  return { stars: Math.max(1, Math.min(5, Math.round(sev))), mult, parts };
}

export function toast(game, text, kind = 'info') { try { game.bus?.emit('toast', { text, kind }); } catch { /* ignore */ } }
export const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

export function head(text, screens, extra) {
  return h('div', { class: 'sheet-head' },
    h('h2', { class: 'title' }, text), extra || null, h('span', { class: 'grow' }),
    h('button', { class: 'btn icon x', 'aria-label': 'とじる', onclick: () => screens.back() }, '✕'));
}
