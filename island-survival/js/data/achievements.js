// data/achievements.js — DESIGN.md §15.4 (+ §20.3 naturalist / taster). check(stats, game) → boolean.
// `stats` fields are documented at the top of js/sim/score.js (RunStats). Achievements are re-checked by the lead
// (e.g. every game hour and at the end) and the new ones are shown via a toast.
const n = (v) => (Number.isFinite(+v) ? +v : 0);
const has = (arr, id) => Array.isArray(arr) && arr.includes(id);
const ended = (s) => ['rescued', 'raft', 'drift'].includes(s.result);

export const ACHIEVEMENTS = [
  { id: 'first_fire', name: 'はじめての 火', desc: '初めて 火を おこす', icon: '🔥', p: 'P0', check: (s) => n(s.firesLit) >= 1 },
  { id: 'friction_fire', name: '木と 木だけで', desc: 'きりもみ・弓ぎり・火みぞで 着火', icon: '🪵', p: 'P0', check: (s) => n(s.frictionFires) >= 1 },
  { id: 'rain_fire', name: '雨の 中の 火', desc: '雨の 日に 着火', icon: '🌧️', p: 'P1', check: (s) => n(s.rainFires) >= 1 },
  { id: 'eternal_flame', name: '絶やさぬ 火', desc: '火を 72h 絶やさない', icon: '♨️', p: 'P0', check: (s) => n(s.longestFireH) >= 72 },
  { id: 'first_fish', name: '初釣果', desc: '初めて 魚を 釣る', icon: '🐟', p: 'P0', check: (s) => n(s.fishCaught) >= 1 },
  { id: 'big_fish', name: '大物', desc: '大魚を 釣る', icon: '🐋', p: 'P0', check: (s) => n(s.bigFishCaught) >= 1 },
  { id: 'fisher_50', name: '漁師', desc: '魚を 50 匹', icon: '🎣', p: 'P1', check: (s) => n(s.fishCaught) >= 50 },
  { id: 'hunter', name: '狩人', desc: 'ヤギか イノシシを しとめる', icon: '🏹', p: 'P0', check: (s) => n(s.huntedBig) >= 1 || n(s.animalsHunted?.goat) + n(s.animalsHunted?.boar) >= 1 },
  { id: 'one_shot', name: '一発必中', desc: '弾 12 発モードで 外さずに 3 頭', icon: '🎯', p: 'P1', check: (s) => n(s.hitStreak) >= 3 },
  { id: 'archer', name: '30m の 矢', desc: '30m 以上から 命中', icon: '🏹', p: 'P1', check: (s) => n(s.maxArrowDist) >= 30 },
  { id: 'stone_age', name: '石器時代', desc: '石刃・石斧・石槍を 全部 作る', icon: '🪨', p: 'P0', check: (s) => ['stone_blade', 'stone_axe', 'stone_spear'].every((id) => has(s.stoneTools, id)) },
  { id: 'masterpiece', name: '逸品', desc: 'Q90 以上を 作る', icon: '✨', p: 'P0', check: (s) => n(s.bestQ) >= 90 || n(s.masterpieces) >= 1 },
  { id: 'inventor_10', name: '発明家', desc: '型を 10 種 作る', icon: '💡', p: 'P0', check: (s) => n(s.designsMade) >= 10 },
  { id: 'inventor_30', name: '大発明家', desc: '型を 30 種 作る', icon: '🧪', p: 'P1', check: (s) => n(s.designsMade) >= 30 },
  { id: 'eureka', name: 'ひらめき', desc: 'AI 錬成で 新しい 物を 3 つ', icon: '🌟', p: 'P1', check: (s) => n(s.aiCrafted) >= 3 },
  { id: 'chef', name: '島の 料理人', desc: '具 4 種の 煮込みを 作る', icon: '🍲', p: 'P1', check: (s) => n(s.stewMaxIngredients) >= 4 },
  { id: 'preserver', name: '冬じたく', desc: '保存食を 同時に 20 個 持つ', icon: '🥫', p: 'P1', check: (s) => n(s.preservedHeld) >= 20 },
  { id: 'iron_stomach', name: '鉄の 胃袋', desc: '食中毒に 一度も ならずに 14 日', icon: '🥄', p: 'P1', check: (s) => n(s.foodPoisonings) === 0 && n(s.daysSurvived) >= 14 },
  { id: 'bad_oyster', name: '当たり年', desc: '食中毒に 3 回', icon: '🦪', p: 'P1', check: (s) => n(s.foodPoisonings) >= 3 },
  { id: 'clean_water', name: 'きれいな 水', desc: 'ろ過 + 煮沸の 水だけで 7 日', icon: '💧', p: 'P1', check: (s) => n(s.cleanWaterDays) >= 7 },
  { id: 'home_sweet', name: 'わが家', desc: '小屋・寝床・炉・干し台・雨水受けを そろえる', icon: '🏠', p: 'P0', check: (s) => !!s.homeSet },
  { id: 'carpenter', name: '棟梁', desc: '丸太小屋を 建てる', icon: '🪚', p: 'P1', check: (s) => !!s.builtLogCabin },
  { id: 'storm_rider', name: '嵐を 越えて', desc: '大嵐を 建物 無傷(HP 50% 以上)で 越える', icon: '🌀', p: 'P1', check: (s) => n(s.stormsSurvived) >= 1 },
  { id: 'never_wet', name: '雨宿りの 達人', desc: '雨の 日に wet 30 以下で 1 日', icon: '☔', p: 'P1', check: (s) => n(s.rainDryDays) >= 1 },
  { id: 'healer', name: '島の 医者', desc: '薬草で 病気・ケガを 5 回 治す', icon: '🌿', p: 'P1', check: (s) => n(s.herbHeals) >= 5 },
  { id: 'explorer', name: '島を 知る', desc: '全区域を 訪れる', icon: '🧭', p: 'P0', check: (s) => n(s.zonesTotal) > 0 && n(s.zonesVisited) >= n(s.zonesTotal) },
  { id: 'wreck_diver', name: '沈んだ 宝', desc: '難破船の 道具箱を 開ける', icon: '⚓', p: 'P1', check: (s) => !!s.wreckChestOpened },
  { id: 'not_yet', name: 'まだ 帰らない', desc: '救助を 断る', icon: '🏝️', p: 'P1', check: (s) => n(s.refusedRescue) >= 1 },
  { id: 'sailor', name: '自分の 舟で', desc: 'いかだで 脱出', icon: '⛵', p: 'P1', check: (s) => s.result === 'raft' },
  { id: 'bare_hands', name: '素手の 王', desc: '「なにも 持たない」で 14 日 以上 生還', icon: '✋', p: 'P1', check: (s) => s.startCount === 0 && ended(s) && n(s.daysSurvived) >= 14 },
  { id: 'extreme_30', name: '極限 30 日', desc: '極限で 30 日 生還', icon: '💀', p: 'P1', check: (s) => s.difficulty === 'extreme' && ended(s) && n(s.daysSurvived) >= 30 },
  { id: 'hundred', name: '百日', desc: '100 日 生還', icon: '💯', p: 'P2', check: (s) => ended(s) && n(s.daysSurvived) >= 100 },
  { id: 'best_friend', name: '相棒', desc: '親密 80', icon: '🤝', p: 'P1', check: (s) => n(s.companionAffinity) >= 80 },
  { id: 'good_listener', name: '聞き上手', desc: '身の上話を 4 話 聞く', icon: '👂', p: 'P1', check: (s) => n(s.storiesHeard) >= 4 },
  { id: 'hands_on', name: '体で 覚えた', desc: 'ジェスチャーで 釣り・火おこし・弓・伐採・採集を 成功', icon: '🙌', p: 'P0', check: (s) => ['fish', 'fire', 'bow', 'chop', 'gather'].every((k) => s.gestures?.[k]) },
  { id: 'sunset_7', name: '夕日の 常連', desc: '夕日を 7 回 見る', icon: '🌇', p: 'P2', check: (s) => n(s.sunsetsSeen) >= 7 },
  { id: 'turtle_guard', name: '見守る 人', desc: 'ウミガメの 産卵を 見守る', icon: '🐢', p: 'P2', check: (s) => !!s.turtleGuard },
  // §20.3
  { id: 'naturalist_half', name: '博物学者', desc: '図鑑 50%', icon: '📖', p: 'P0', check: (s) => (n(s.guideTotal) > 0 && n(s.guideK3) / n(s.guideTotal) >= 0.5) || n(s.naturalistPct) >= 50 },
  { id: 'naturalist_full', name: '島の 百科', desc: '図鑑 100%', icon: '📚', p: 'P1', check: (s) => (n(s.guideTotal) > 0 && n(s.guideK3) >= n(s.guideTotal)) || n(s.naturalistPct) >= 100 },
  { id: 'taster', name: '味見役', desc: 'かじって 確かめた 物 10 種', icon: '👅', p: 'P1', check: (s) => n(s.tastedTypes) >= 10 },
];

export const ACHIEVEMENT_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

/** ids newly satisfied (not in `have`) */
export function newlyUnlocked(stats, game, have = []) {
  const set = new Set(have);
  return ACHIEVEMENTS.filter((a) => !set.has(a.id) && (() => { try { return a.check(stats, game); } catch { return false; } })()).map((a) => a.id);
}
