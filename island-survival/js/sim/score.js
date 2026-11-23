// sim/score.js — final score (§15.3) and the death review (§15.2).
//
// @typedef {Object} RunStats   plain object the lead fills (all optional, missing = 0 / false)
//   result:        'rescued'|'raft'|'drift'|'retired'|'broken'|'dead'   (game.end result)
//   how:           'promised'|'signal'|'early'|'raft'|'drift'|'flare'…   (game.end how)
//   cause:         death cause id (see DEATH_CAUSES)
//   daysSurvived:  number (days lived, last day counted)
//   hp, food, water, morale:  values (0–100) at the end
//   designsMade:   number of distinct crafted types       zonesVisited, zonesTotal
//   foodTypesEaten: distinct foods eaten                   illnessesHealed
//   guideK3:       field-guide entries at K3               guideTotal
//   buildHours:    total build time of finished structures (game hours)
//   masterpieces:  crafted items with Q >= 90              bestQ
//   achievements:  array of unlocked ids (or a number)
//   companionAlive (bool), companionAffinity (0–100), companionTrust
//   retries:       number of "redo from morning" used
//   itemMult:      optional precomputed carry-items multiplier (count × per-item); else derived from setup
//   — records / achievements:
//   fishCaught, bestFish {name, cm}, bigFishCaught, animalsHunted {kind: n}, huntedBig, hitStreak, maxShotDist, maxArrowDist,
//   craftedBest [{name, q}], illnesses [names], foodPoisonings, daysSinceFoodPoison, longestFireH, firesLit, frictionFires,
//   rainFires, distance (m), stoneTools (array of ids), aiCrafted, stewMaxIngredients, preservedHeld, cleanWaterDays,
//   homeSet, builtLogCabin, stormsSurvived, rainDryDays, herbHeals, wreckChestOpened, refusedRescue, startCount (0..5, 'all'),
//   difficulty, storiesHeard, gestures {fish,fire,bow,chop,gather}, sunsetsSeen, turtleGuard, tastedTypes, naturalistPct,
//   lastMeal {name, raw (bool), p (illness probability 0–1), cookedP (p if cooked)}, deathInfo {…optional details}.
//
// @typedef {{label:string, value:number}} Part
import { PROFESSIONS } from '../data/professions.js';

export const RANKS = [
  { min: 300, id: 'S', name: '島の 主' },
  { min: 220, id: 'A', name: '熟練の サバイバー' },
  { min: 150, id: 'B', name: 'たくましい 漂流者' },
  { min: 90, id: 'C', name: 'なんとか 生きのびた' },
  { min: -Infinity, id: 'D', name: '島に 遊ばれた' },
];
export const COUNT_MULT = { 0: 1.6, 1: 1.0, 2: 0.8, 3: 0.65, all: 0.4 };
const SURVIVED = ['rescued', 'raft', 'drift'];
const num = (v) => (Number.isFinite(+v) ? +v : 0);

/** multiplier from the number of carried items (§21.1) × per-item multipliers (setup.starterMults optional map or stats.itemMult) */
export function carryMultiplier(setup = {}, stats = {}) {
  if (stats.itemMult != null) return stats.itemMult;
  let m = COUNT_MULT[setup.count] ?? 1;
  const per = setup.starterMults;
  if (per) for (const id of setup.starters || []) m *= per[id] ?? 1;
  return m;
}
export function ammoMultiplier(setup = {}) {
  const hasGun = (setup.starters || []).some((id) => /rifle|gun/.test(id)) || setup.count === 'all';
  return hasGun && setup.ammo === 'inf' ? 0.7 : 1;
}
export function rankOf(finalScore, days) {
  const v = finalScore / Math.max(1, days);
  return RANKS.find((r) => v >= r.min);
}

/** @returns {{ total:number, rank:{id:string,name:string,perDay:number}, parts:Part[], mults:Part[], base:number }} */
export function computeScore(stats = {}, setup = {}, diffEntry = null) {
  const days = num(stats.daysSurvived);
  const survived = SURVIVED.includes(stats.result);
  const avg = (num(stats.hp) + num(stats.food) + num(stats.water) + num(stats.morale)) / 4;
  const ach = Array.isArray(stats.achievements) ? stats.achievements.length : num(stats.achievements);
  const parts = [
    { label: '生存日数', value: days * 100 },
    { label: '生還・救助・脱出', value: survived ? 500 : 0 },
    { label: '終了時の 状態', value: Math.round(Math.min(300, avg * 3)) },
    { label: '作った 型', value: num(stats.designsMade) * 10 },
    { label: '訪れた 区域', value: num(stats.zonesVisited) * 20 },
    { label: '食べた 食べ物', value: num(stats.foodTypesEaten) * 5 },
    { label: '治した 病気・ケガ', value: num(stats.illnessesHealed) * 15 },
    { label: '図鑑の 確定', value: num(stats.guideK3) * 8 },
    { label: '建築', value: Math.min(600, Math.floor(num(stats.buildHours)) * 10) },
    { label: '逸品', value: num(stats.masterpieces) * 30 },
    { label: '実績', value: ach * 50 },
    { label: '仲間', value: stats.companionAlive ? 200 + Math.round(num(stats.companionAffinity) * 3) : 0 },
  ].filter((p) => p.value !== 0 || p.label === '生存日数');
  const base = parts.reduce((a, p) => a + p.value, 0);
  const mults = [];
  const diff = diffEntry?.score ?? 1;
  mults.push({ label: '難易度', value: diff });
  mults.push({ label: '持ち物', value: carryMultiplier(setup, stats) });
  const am = ammoMultiplier(setup); if (am !== 1) mults.push({ label: '弾', value: am });
  if (setup.companion && setup.companion !== 'none') {
    // §23.6: a stronger partner sheet makes the run easier → a smaller multiplier (0.81–0.99; no sheet → 0.9)
    const m = Number(setup.companionSheet?.scoreMul) || 0.9;
    mults.push({ label: setup.companionSheet ? `仲間（${setup.companionSheet.short || ''}・${PROFESSIONS[setup.companionSheet.profession]?.short || ''}）` : '仲間あり', value: m });
  }
  if (num(stats.retries) > 0) mults.push({ label: 'やり直し', value: Math.pow(0.9, stats.retries) });
  if (stats.result === 'retired' || stats.result === 'broken') mults.push({ label: 'リタイア', value: 0.3 });
  if (stats.result === 'drift') mults.push({ label: '漂流', value: 0.6 });
  const total = Math.round(base * mults.reduce((a, m) => a * m.value, 1));
  const denom = setup.days > 0 ? setup.days : Math.max(1, days);
  const r = rankOf(total, denom);
  return { total, base, parts, mults, rank: { id: r.id, name: r.name, perDay: +(total / denom).toFixed(1) } };
}

// -------------------------------------------------------------------------- death review
export const DEATH_CAUSES = ['starve', 'thirst', 'cold', 'heat', 'sick', 'poison', 'bleed', 'drown', 'beast', 'fall', 'lightning', 'sea'];
export const DEATH_NAMES = {
  starve: '飢え', thirst: '渇き', cold: '低体温', heat: '熱中症', sick: '病気', poison: '毒',
  bleed: 'ケガ・感染', drown: '溺れ', beast: '動物', fall: '落下', lightning: '落雷', sea: '海で',
};
const pct = (p) => `${Math.round(p * 100)}%`;

/** → string[] : [what happened, why, what would have helped, (optional extra)] */
export function deathReview(cause, stats = {}) {
  const d = stats.deathInfo || {}, m = stats.lastMeal || null;
  const day = num(stats.daysSurvived);
  const L = [];
  switch (cause) {
    case 'starve':
      L.push('食べ物が 底を ついて、体が 動かなく なった。');
      L.push(day <= 3 ? '最初の 3 日は 動き回るより、確実な 食料(ヤシの実・貝・小魚)を 先に 確保すると 持つ。' : '食料の 蓄えが ない まま 日が 過ぎた。保存食(干物・燻製)を 作って おけば 嵐の 日も しのげた。');
      L.push('こうすれば 助かった: 空腹(food < 30)に なる 前に 1 日 1 回は 火を 通した 食事を。潮の 引く 朝は 貝・カニが 安全で 楽。');
      break;
    case 'thirst':
      L.push('水が 切れて、脱水で 倒れた。');
      L.push('脱水(water < 10)に なると 熱中症の 確率が ×3 に なり、動けなく なる。');
      L.push('こうすれば 助かった: 川・岩清水・ヤシの実を 最優先で 探す。雨の 日は 容器を 並べて 雨水を ためる。川の 水は 煮沸すれば 安全。');
      break;
    case 'cold':
      L.push('体温が 下がり続け、低体温で 力 尽きた。');
      L.push(d.wet ? '濡れた まま 風に 当たった。濡れると 体感は 大きく 下がる。' : '夜と 雨で 体温が 奪われた。体温は 35℃を 切ると 動きが 鈍る。');
      L.push('こうすれば 助かった: 雨の 前に 屋根と 火を 用意。濡れたら すぐ 火の そばで 乾かし、風を よける 壁か 木かげで 寝る。');
      break;
    case 'heat':
      L.push('炎天下で 体温が 上がり、熱中症で 倒れた。');
      L.push('水が 足りない まま 日なたで 動くと、体温が 40℃を 超えて 危険に なる。');
      L.push('こうすれば 助かった: 昼の 暑い 時間は 日陰で 休み、水を こまめに 飲む。帽子を かぶり、海や 川で 水浴びを。');
      break;
    case 'sick':
      L.push('病気が 悪化して 力 尽きた。');
      L.push('風邪・食中毒・水あたりは、放って おくと 重く なる(悪化 確率が 毎時 加わる)。');
      L.push('こうすれば 助かった: 症状が 出たら 休んで 水分を とり、薬草茶・炭の 粉で 手当て。体を 冷やさず 清潔に。');
      break;
    case 'poison': {
      const name = m?.name ?? '毒の ある もの';
      L.push(m?.raw ? `生の ${name} を 食べて 当たった。` : `${name} の 毒で 力 尽きた。`);
      L.push(m?.p != null ? `食べた ときの 発症率は ${pct(m.p)} だった。` : '見分けが つかない 植物・キノコ・魚の 毒は 命に かかわる。');
      L.push(m?.cookedP != null ? `こうすれば 助かった: よく 焼くか 煮れば ${pct(m.cookedP)} まで 下がる。` : 'こうすれば 助かった: 図鑑で 見分け方を 確かめる、わからない ものは 少量だけ かじって 様子を 見る、貝は 加熱。');
      break; }
    case 'bleed':
      L.push('ケガの 出血と 感染で 力 尽きた。');
      L.push('傷を 放置すると 12 時間で うずき、化膿する。咬み傷は 感染しやすい。');
      L.push('こうすれば 助かった: ヨモギで 止血し、清潔な 布で 包帯。傷口を 真水で 洗い、無理に 動かない。');
      break;
    case 'drown':
      L.push('水に のまれて 溺れた。');
      L.push('スタミナが 切れた 状態で 深みに 入ると 泳げない。増水した 川・満ち潮の 磯も 危ない。');
      L.push('こうすれば 助かった: 疲れて いる ときは 水に 入らない。増水中の 川は 渡らない。浮く もの(流木・ヤシの実)を つかむ。');
      break;
    case 'beast':
      L.push('動物に 襲われて 力 尽きた。');
      L.push('イノシシは 近づくと 突進し、ヘビ・ムカデは 咬む。夜は 気づくのが 遅れる。');
      L.push('こうすれば 助かった: 警戒の 印が 見えたら 距離を とり、火と 槍を 手元に。寝る 前に 寝床を はたく。');
      break;
    case 'fall':
      L.push('高い ところから 落ちて 力 尽きた。');
      L.push('濡れた 岩・崖の 縁で 足を すべらせると 大きな ダメージ。夜と 雨は 特に 危ない。');
      L.push('こうすれば 助かった: 雨と 夜は 岩場を 避ける。登る ときは スタミナを 残し、ロープを 使う。');
      break;
    case 'lightning':
      L.push('雷に 打たれた。');
      L.push('嵐の 間、岩山の 頂上や 高い 木の 下は 直撃の 危険が ある(頂上で 5%)。');
      L.push('こうすれば 助かった: 嵐の 間は 低い 場所の 屋根の 下か 洞窟へ。雷の あとの 火種は 嵐が 弱まってから 取りに 行く。');
      break;
    case 'sea':
      L.push('海の 上で 力 尽きた。');
      L.push('いかだでの 航海は 水・食料・天気に 左右される。出航の 成功率は 条件で 大きく 変わる。');
      L.push('こうすれば 助かった: 水 9L 以上、保存食、帆と 丈夫な オール、晴れの 日に 北の 浜から 下げ潮で 出る。確実なのは 狼煙で 船を 待つ こと。');
      break;
    default:
      L.push('力 尽きた。'); L.push('何が 足りなかったか、日記を 見返して みよう。');
  }
  if (num(stats.daysSurvived) > 0) L.push(`${day} 日 生きのびた。次は 最初の 3 日に 水と 火と 屋根を 優先すると 楽に なる。`);
  return L;
}

/** localStorage top-10 helper (§15.3). Safe outside the browser. */
export function saveRecord(entry, storage = (typeof localStorage !== 'undefined' ? localStorage : null), key = 'island-survival/records') {
  try {
    const list = JSON.parse(storage?.getItem(key) || '[]');
    list.push(entry); list.sort((a, b) => b.total - a.total);
    const top = list.slice(0, 10); storage?.setItem(key, JSON.stringify(top)); return top;
  } catch { return [entry]; }
}
