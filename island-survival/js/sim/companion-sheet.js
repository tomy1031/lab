// sim/companion-sheet.js — companion character sheet: dice, derived parameters, job multipliers, affinity stages (DESIGN §23).
// Pure functions: no DOM, no three.js. `rng` is a function returning [0,1) (default Math.random — NOT the island seed).
import {
  PROFESSIONS, PROFESSION_IDS, CHAR_INFO, SEX_MOD, ageMod, ABILITIES, SKILLS, JOBS_SKILL,
} from '../data/professions.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const signed = (n) => (n >= 0 ? `＋${n}` : `−${-n}`);

export const mod = (x) => Math.floor((x - 10) / 2);

/** 'NdM+K' / 'NdM-K' → { total, rolls, bonus } (total includes the bonus) */
export function rollDice(expr, rng = Math.random) {
  const m = /^\s*(\d+)\s*d\s*(\d+)\s*([+\-−]\s*\d+)?\s*$/.exec(String(expr));
  if (!m) throw new Error(`bad dice expression: ${expr}`);
  const n = +m[1], sides = +m[2];
  const bonus = m[3] ? parseInt(m[3].replace('−', '-').replace(/\s/g, ''), 10) : 0;
  const rolls = [];
  for (let i = 0; i < n; i++) rolls.push(1 + Math.floor(rng() * sides));
  return { total: rolls.reduce((a, b) => a + b, 0) + bonus, rolls, bonus };
}

const ABIL_IDS = ABILITIES.map((a) => a.id);
const SKILL_IDS = SKILLS.map((s) => s.id);
export const AUTO_DEFAULT_CHANCE = 0.4;

/** pick a profession for 'auto': default 40 %, the other 9 evenly */
export function pickProfession(charId, rng = Math.random) {
  const def = CHAR_INFO[charId].defaultProfession;
  if (rng() < AUTO_DEFAULT_CHANCE) return def;
  const others = PROFESSION_IDS.filter((p) => p !== def);
  return others[Math.min(others.length - 1, Math.floor(rng() * others.length))];
}

/** Roll a fresh sheet. professionId: a PROFESSIONS id or 'auto'. */
export function rollSheet(charId, professionId = 'auto', rng = Math.random) {
  const ci = CHAR_INFO[charId];
  if (!ci) throw new Error(`unknown companion: ${charId}`);
  const pid = !professionId || professionId === 'auto' ? pickProfession(charId, rng) : professionId;
  const prof = PROFESSIONS[pid];
  if (!prof) throw new Error(`unknown profession: ${pid}`);
  const sex = SEX_MOD[ci.sex], age = ageMod(ci.age);

  const abilities = {}, rolls = {}, breakdown = {};
  for (const id of ABIL_IDS) {
    const d = rollDice(prof.dice[id] || '3d6', rng);
    const sMod = sex.abil[id] || 0, aMod = age.abil[id] || 0;
    const raw = d.total + sMod + aMod;
    const v = clamp(raw, 3, 20);
    abilities[id] = v; rolls[id] = d.rolls;
    let b = d.rolls.join('+');
    if (d.bonus) b += ` ${signed(d.bonus)}（${prof.short}）`;
    if (sMod) b += ` ${signed(sMod)}（性別）`;
    if (aMod) b += ` ${signed(aMod)}（年齢）`;
    if (v !== raw) b += ` → ${v}`;
    breakdown[id] = b;
  }

  const skills = {};
  const cap = prof.flaw.skillCap || 10;
  for (const id of SKILL_IDS) {
    const listed = prof.skills[id];
    let [lo, hi] = listed || prof.allSkills || [0, 2];
    if (listed) lo = Math.min(hi, lo + age.skillLowerBonus);
    skills[id] = lo + Math.floor(rng() * (hi - lo + 1));
  }
  for (const [id, d] of Object.entries(age.skills)) skills[id] += d;
  for (const q of ci.quirks) {
    if (q.navMinus) skills.nav -= q.navMinus;
    if (q.nightMinus) skills.night -= q.nightMinus;
    if (q.swimMin != null) skills.swim = Math.max(skills.swim, q.swimMin);
    if (q.swimFixed != null) skills.swim = q.swimFixed;
  }
  for (const id of SKILL_IDS) skills[id] = clamp(skills[id], 0, cap);

  const total = ABIL_IDS.reduce((a, id) => a + abilities[id], 0);
  return {
    char: charId, name: ci.name, short: ci.short, sex: ci.sex, age: ci.age, profession: pid,
    abilities, rolls, breakdown, skills, total, scoreMul: scoreMulOf(total),
    perk: { ...prof.perk }, flaw: { ...prof.flaw }, quirks: ci.quirks.map((q) => ({ ...q })),
  };
}

export const scoreMulOf = (total) => r3(0.9 * clamp(1 - (total - 63) * 0.004, 0.90, 1.10));

/** Derived parameters (§23.5). Works on a sheet from rollSheet() or a loaded save (abilities/skills/profession/char). */
export function derived(sheet) {
  const A = sheet.abilities, S = sheet.skills;
  const ci = CHAR_INFO[sheet.char] || {};
  const sex = SEX_MOD[sheet.sex || ci.sex] || SEX_MOD.F;
  const age = ageMod(sheet.age ?? ci.age ?? 30);
  const prof = PROFESSIONS[sheet.profession] || {};
  const flaw = prof.flaw || {}, quirks = sheet.quirks || ci.quirks || [];
  const qv = (k, d) => { for (const q of quirks) if (q[k] != null) return q[k]; return d; };

  const speed = 4.0 * (0.85 + A.agi * 0.015);
  const carry = 6 + A.str * 0.4;
  const staminaMax = 60 + A.con * 4;
  const appetite = 0.8 * (0.85 + ((A.str + A.con) / 2) * 0.015) * sex.appetite;
  const coldLow = 20 - (A.con - 10) * 0.3 + (flaw.coldPlus || 0);
  const hotHigh = 30 + (A.con - 10) * 0.2;
  const illnessBase = clamp(1 - (A.con - 10) * 0.03, 0.7, 1.3);
  const illness = illnessBase * sex.illness;
  const regen = (1 + mod(A.con) * 0.05) * age.regen;
  const nightFactor = clamp(1 - (A.pow - 10) * 0.08 - S.night * 0.04, 0.3, 1.6) * (flaw.nightFearMul || 1);
  const nightFear = -2.0 * nightFactor;
  const moraleDrain = -0.8 * clamp(1 - (A.pow - 10) * 0.04, 0.6, 1.4);
  let lostRate = clamp(0.04 * (1 - S.nav * 0.12) * (1 - (A.int - 10) * 0.03), 0.002, 0.15) * qv('lostMul', 1);
  if (prof.perk?.neverLost) lostRate = Math.min(lostRate, 0.002);
  const dodge = clamp(0.5 + (A.agi - 10) * 0.04, 0.2, 0.9);
  const advice = clamp(0.6 + (A.int - 10) * 0.04, 0.3, 0.95);
  const growth = (1 + mod(A.int) * 0.1) * (prof.growthMul || 1);

  const labels = {
    carry: `${r1(carry)}kg`,
    speed: speed >= 4.2 ? '足が 速い' : speed <= 3.8 ? 'ゆっくり' : 'ふつう',
    appetite: `あなたの ${r2(appetite)} 倍`,
    cold: coldLow <= 19 ? '寒さに 強い' : coldLow >= 21 ? '寒がり' : 'ふつう',
    heat: hotHigh >= 31 ? '暑さに 強い' : hotHigh <= 29 ? '暑がり' : 'ふつう',
    illness: illness <= 0.85 ? 'かかりにくい' : illness >= 1.15 ? 'かかりやすい' : 'ふつう',
    night: nightFactor <= 0.7 ? '平気' : nightFactor <= 1.15 ? '少し こわい' : 'こわがり',
    lost: lostRate < 0.02 ? '迷いにくい' : lostRate < 0.05 ? 'ふつう' : '迷いやすい',
    strength: A.str >= 13 ? '強い' : A.str <= 8 ? '弱い' : 'ふつう',
  };
  return {
    carry, speed, run: speed * 1.75, staminaMax, appetite, coldLow, hotHigh, illness, illnessBase, regen,
    nightFear, nightFactor, moraleDrain, lostRate, dodge, advice, growth,
    sweat: sex.sweat, shiverEarly: sex.shiverEarly, coreCold: sex.coreCold,
    moraleJungleNight: qv('moraleJungleNight', 0), chatMul: flaw.chatMul || 1, labels,
  };
}

/** per-skill growth multiplier (§23.5 技能の伸び × 職業の特技・苦手) */
export function skillGrowth(sheet, skillId) {
  const prof = PROFESSIONS[sheet.profession] || {};
  return derived(sheet).growth * (prof.flaw?.growthMul?.[skillId] ?? 1);
}

// ------------------------------------------------------------------ affinity stages (§23.7)
export const STAGES = [
  { stage: 1, min: 0, name: 'よそよそしい', ask: 0.68, jobMul: 0.85, initiative: 'しない（頼まれた 事だけ）', share: 'self_first', shareText: '自分の ぶんを 先に 取る。あなたが 満腹 15 未満の ときだけ 少し くれる', chatPerHour: 0.5 },
  { stage: 2, min: 20, name: 'ふつう', ask: 0.74, jobMul: 0.95, initiative: '信頼 60 以上で、手が 空いて 30 分後', share: 'on_request', shareText: '頼めば くれる（持ち物の 半分まで）', chatPerHour: 1.0 },
  { stage: 3, min: 40, name: '打ち解けた', ask: 0.80, jobMul: 1.00, initiative: '信頼 50 以上で、10 分後', share: 'shared_store', shareText: '取った 物は 共有の 貯蔵庫へ。あなたが 満腹・水分 40 未満なら 自分から 渡す', chatPerHour: 1.5 },
  { stage: 4, min: 60, name: '仲良し', ask: 0.86, jobMul: 1.10, initiative: '信頼 40 以上で、すぐ。足りない 物を 先回りして 集める', share: 'best_to_you', shareText: '良い ほうを あなたに 回す', chatPerHour: 2.0 },
  { stage: 5, min: 80, name: '親友・特別', ask: 0.92, jobMul: 1.20, initiative: 'いつでも。あなたが 寝込むと 看病・水くみ・火の 番を 全部 やる', share: 'half_even_hungry', shareText: '自分が 満腹 30 未満でも 半分 くれる', chatPerHour: 2.5 },
];
export function stageOf(affinity) {
  let s = 1;
  for (const st of STAGES) if (affinity >= st.min) s = st.stage;
  return s;
}
export const stageInfo = (affinity) => STAGES[stageOf(affinity) - 1];

/** Probability the companion accepts a request. danger requests are refused below trust 60 (→ 0). */
export function acceptChance(sheet, { affinity = 20, trust = 50, danger = false, dislike = false, morale = 60, sick = false, recentKindness = false } = {}) {
  if (danger && trust < 60) return 0;
  let p = 0.35 + affinity * 0.003 + trust * 0.006;
  if (danger) p -= typeof danger === 'number' ? danger : 0.30;
  if (dislike) p -= affinity >= 80 ? 0.10 : 0.25;
  if (morale < 30) p -= 0.15;
  if (sick) p -= 0.20;
  if (recentKindness) p += 0.10;
  return clamp(p, 0.05, 1.0);
}

// ------------------------------------------------------------------ jobs
/** Output multiplier for one job (§23.5). opts: stage 1–5 (default 3), morale, night, toolAxe. */
export function jobMultiplier(sheet, jobId, { stage = 3, morale = 60, night = false, toolAxe = false } = {}) {
  const j = JOBS_SKILL[jobId];
  if (!j) return 1;
  let lv = j.skill ? sheet.skills[j.skill] : (j.fixed ?? 5);
  if (j.nightOnly && !night) lv = 5;
  let abil = sheet.abilities[j.ability];
  if (jobId === 'gather_wood' && toolAxe) lv = Math.max(lv, sheet.skills.build);
  let v = (0.6 + lv * 0.12) * (1 + mod(abil) * 0.05);
  v *= STAGES[clamp(stage, 1, 5) - 1].jobMul;
  if (morale < 30) v *= 0.7;
  if (night) v *= 0.4 + sheet.skills.night * 0.06;
  const prof = PROFESSIONS[sheet.profession] || {};
  v *= prof.perk?.jobMul?.[jobId] ?? 1;
  v *= prof.flaw?.jobMul?.[jobId] ?? 1;
  return v;
}

export function bestJobs(sheet, n = 3, opts = {}) {
  return Object.keys(JOBS_SKILL)
    .map((id) => ({ id, label: JOBS_SKILL[id].label, mult: jobMultiplier(sheet, id, opts) }))
    .sort((a, b) => b.mult - a.mult).slice(0, n);
}

// ------------------------------------------------------------------ text
const HIGH_TXT = { str: '力持ち', con: '丈夫で ねばりづよい', dex: '手先が 器用', agi: '身軽', int: '物知り', pow: '肝が すわって いる' };
const LOW_TXT = { str: '力仕事は ちょっと 苦手', con: '体が 弱め', dex: '細かい 作業は 不器用', agi: '動きは のんびり', int: 'あまり 物を 知らない', pow: '夜は ちょっと 苦手' };

/** one natural-Japanese sentence from the highest and lowest ability */
export function oneLiner(sheet) {
  const A = sheet.abilities;
  let hi = ABIL_IDS[0], lo = ABIL_IDS[0];
  for (const id of ABIL_IDS) { if (A[id] > A[hi]) hi = id; if (A[id] < A[lo]) lo = id; }
  const hiOk = A[hi] >= 12, loOk = A[lo] <= 8;
  const best = bestJobs(sheet, 1)[0];
  if (hiOk && loOk) return `${HIGH_TXT[hi]}だけど、${LOW_TXT[lo]}。`;
  if (hiOk) return `${HIGH_TXT[hi]}。${best.label}が 向いて いる。`;
  if (loOk) return `${LOW_TXT[lo]}。そのぶん ${best.label}を まかせたい。`;
  return `目立つ ところは ないけど、${best.label}なら まかせられる。`;
}

const CONF = { str: '力', con: '体力', dex: '手先の 器用さ', agi: '足の 速さ', int: '物知りな こと', pow: '気の 強さ' };
const WEAK = { str: '力仕事', con: '体力', dex: '細かい 手作業', agi: '足の 速さ', int: '物知りでは ない', pow: '気の 強さ' };

/** 1–2 Japanese lines for the Live prompt (§23.7): self-awareness without numbers */
export function selfAwareness(sheet, persona) {
  const A = sheet.abilities, S = sheet.skills;
  const prof = PROFESSIONS[sheet.profession] || {};
  const d = derived(sheet);
  const conf = ABIL_IDS.filter((id) => A[id] >= 13).map((id) => CONF[id]);
  const weak = ABIL_IDS.filter((id) => A[id] <= 8).map((id) => WEAK[id]);
  const good = SKILLS.filter((s) => S[s.id] >= 6).sort((a, b) => S[b.id] - S[a.id]).map((s) => s.name.replace('・漁', ''));
  const never = SKILLS.filter((s) => S[s.id] <= 1).map((s) => s.name.replace('・漁', ''));
  const l1 = [`あなたの 職業は ${prof.short || ''}。`];
  if (conf.length) l1.push(`${conf.slice(0, 2).join('と ')}に 自信が あり、`);
  if (weak.length) l1.push(`${weak.slice(0, 2).join('と ')}は 苦手。`); else if (conf.length) l1[l1.length - 1] = l1[l1.length - 1].replace(/、$/, '。');
  const l2 = [];
  if (good.length) l2.push(`${good.slice(0, 3).join('と ')}が 得意。`);
  if (never.length) l2.push(`${never.slice(0, 2).join('と ')}は やった ことが ない。`);
  if (d.labels.night === 'こわがり') l2.push('夜の 森は こわい。');
  else if (d.labels.night === '平気') l2.push('夜は あまり こわくない。');
  const out = [l1.join('')];
  if (l2.length) out.push(l2.join(''));
  return out;
}

const sexLabel = (s) => SEX_MOD[s]?.label || '';

/** everything the UI needs, in display order */
export function sheetSummary(sheet) {
  const ci = CHAR_INFO[sheet.char] || {};
  const prof = PROFESSIONS[sheet.profession] || {};
  const d = derived(sheet);
  const abilities = ABILITIES.map((a) => {
    const v = sheet.abilities[a.id];
    return { id: a.id, name: a.name, value: v, pct: clamp((v - 3) / 17, 0, 1), breakdown: sheet.breakdown?.[a.id] || '', tier: v >= 16 ? 'high' : v <= 6 ? 'low' : '', mod: mod(v) };
  });
  const skills = SKILLS.map((s) => ({ id: s.id, name: s.name, lv: sheet.skills[s.id] }))
    .sort((a, b) => (b.lv >= 4) - (a.lv >= 4) || b.lv - a.lv);
  const life = [
    { id: 'carry', label: '持てる 重さ', text: d.labels.carry },
    { id: 'speed', label: '歩く 速さ', text: `${r1(d.speed)} m/s（${d.labels.speed}）` },
    { id: 'appetite', label: '食べる 量', text: d.labels.appetite },
    { id: 'cold', label: '寒さ', text: d.labels.cold },
    { id: 'heat', label: '暑さ', text: d.labels.heat },
    { id: 'illness', label: '病気', text: d.labels.illness },
    { id: 'night', label: '夜', text: d.labels.night },
    { id: 'lost', label: '道に 迷う', text: d.labels.lost },
  ];
  const best = bestJobs(sheet, 3).map((j) => ({ ...j, text: `${j.label} ×${r1(j.mult)}` }));
  return {
    char: sheet.char, name: sheet.name || ci.name, short: sheet.short || ci.short, age: sheet.age ?? ci.age, sex: sexLabel(sheet.sex || ci.sex),
    profession: sheet.profession, professionName: prof.name || '', professionShort: prof.short || '',
    title: `${sheet.name || ci.name}・${sheet.age ?? ci.age}・${sexLabel(sheet.sex || ci.sex)}・${prof.name || ''}`,
    abilities, skills, perk: sheet.perk?.text || prof.perk?.text || '', flaw: sheet.flaw?.text || prof.flaw?.text || '',
    quirks: (sheet.quirks || ci.quirks || []).map((q) => q.text), life, best, oneLiner: oneLiner(sheet),
    scoreMul: sheet.scoreMul, total: sheet.total, derived: d,
  };
}

export { PROFESSIONS, PROFESSION_IDS, CHAR_INFO, ABILITIES, SKILLS, JOBS_SKILL };
