// data/conditions.js — illnesses, poisonings and injuries (DESIGN.md §6.2, §6.3, §7.5).
// Per-severity arrays are [light, medium, heavy]. Units: per game hour.
//   hp: HP change /h · water / food: extra change /h · temp: body-temperature target offset (°C)
//   stamina: staminaMax multiplier · move: speed multiplier · work: action success multiplier
//   hours: natural recovery time (Infinity = does not heal by itself) · incubation: [min, max] hours (no symptoms)
export const CONDITIONS = {
  cold: { name: '風邪', kind: 'illness', icon: '🤧', hp: [0, -0.5, -1.5], temp: [0.5, 1.0, 2.0], stamina: [0.9, 0.75, 0.6], hours: [48, 72, 120], incubation: [4, 4], cough: true,
    treat: '温かくして寝る・ショウガ茶（期間 ×0.6）・解熱薬' },
  food_poison: { name: '食中毒', kind: 'illness', icon: '🤢', hp: [-0.5, -1.5, -3], water: [-4, -6, -8], move: [0.9, 0.8, 0.6], vomitFood: [15, 30, 45], hours: [12, 30, 60], incubation: [2, 6],
    treat: '炭の粉（期間 ×0.5、発症 2h 以内なら軽く）・グァバ茶・整腸薬・水をよく飲む' },
  water_illness: { name: '水あたり', kind: 'illness', icon: '💧', hp: [-0.3, -1, -2.5], water: [-4, -6, -9], absorb: [0.7, 0.7, 0.7], hours: [18, 40, 80], incubation: [3, 8],
    treat: 'グァバ茶・ヤシの水・整腸薬。水は煮沸する' },
  parasite: { name: '寄生虫', kind: 'illness', icon: '🪱', foodDrain: [1.3, 1.3, 1.3], stamina: [0.9, 0.9, 0.9], hours: [Infinity, Infinity, Infinity], incubation: [48, 48], noWorsen: true,
    treat: '虫くだし（センダンの実＋炭の煎じ薬）' },
  heatstroke: { name: '熱中症', kind: 'illness', icon: '🥵', hp: [-1, -4, -10], water: [-1.5, -3, -3], move: [0.9, 0.8, 0.6], hours: [2, 4, 6], incubation: [0, 0], auto: true,
    treat: '日陰・水浴び・水を飲む' },
  hypothermia: { name: '低体温', kind: 'illness', icon: '🥶', hours: [Infinity, Infinity, Infinity], incubation: [0, 0], auto: true,
    treat: '火・乾いた服・屋根・温かい飲み物' },
  infection: { name: '傷の化膿', kind: 'illness', icon: '🩸', hp: [-0.5, -2, -4], temp: [1, 1.5, 2], hours: [72, Infinity, Infinity], incubation: [12, 12],
    treat: '傷を洗う＋ドクダミの湿布・ハチミツ・焼いた刃で切開・抗生物質' },
  plant_poison: { name: '毒', kind: 'poison', icon: '☠️', hp: [-1, -2, -4], move: [0.9, 0.8, 0.7], vomitFood: [10, 20, 30], hours: [12, 12, 24], incubation: [0.5, 3],
    treat: '吐き出す（30 分以内）・炭の粉' },
  snake_venom: { name: 'ヘビの毒', kind: 'poison', icon: '🐍', hp: [-3, -6, -10], move: [0.6, 0.6, 0.5], hours: [24, 36, Infinity], incubation: [0.5, 0.5], blurry: true,
    treat: '安静（歩かない）・すぐ洗う・毒吸引器・ウコン＋炭の湿布' },
  sting: { name: '刺し毒', kind: 'poison', icon: '🐝', hp: [0, -2, -2], shake: [0.4, 0.4, 0.4], hours: [6, 12, 12], incubation: [0, 0],
    treat: '海水で洗う（クラゲ）・アロエ' },
  numb: { name: 'しびれ', kind: 'poison', icon: '😶', move: [0.85, 0.7, 0.7], noEat: true, hours: [1, 4, 12], incubation: [0, 0],
    treat: '時間がたつのを待つ' },
  cut: { name: '切り傷', kind: 'injury', icon: '🩹', hp: [-1, -3, -3], work: [0.9, 0.9, 0.85], hours: [24, 60, 60], incubation: [0, 0], wound: 'cut', bleed: true,
    treat: '洗う＋包帯（出血が止まる）・ヨモギ' },
  burn: { name: 'やけど', kind: 'injury', icon: '🔥', hp: [0, -0.5, -0.5], work: [0.85, 0.85, 0.8], hours: [36, 96, 96], incubation: [0, 0], wound: 'burn',
    treat: 'すぐ水で冷やす・アロエ（期間 ×0.5）' },
  bite: { name: '咬み傷', kind: 'injury', icon: '🦷', hp: [-2, -2, -3], hours: [72, 72, 96], incubation: [0, 0], wound: 'bite', bleed: true,
    treat: '洗う・包帯・ドクダミ' },
  bruise: { name: '打撲', kind: 'injury', icon: '💥', stamina: [0.9, 0.9, 0.85], hours: [24, 24, 36], incubation: [0, 0],
    treat: '冷やす（川の水）' },
  sprain: { name: 'ねんざ', kind: 'injury', icon: '🦶', move: [0.6, 0.6, 0.5], noRun: true, hours: [72, 72, 96], incubation: [0, 0],
    treat: '添え木＋紐・安静' },
  puncture: { name: '刺し傷', kind: 'injury', icon: '📍', hp: [0, -0.5, -0.5], move: [0.85, 0.85, 0.85], hours: [24, 24, 36], incubation: [0, 0], wound: 'puncture',
    treat: 'トゲを抜く（ナイフ・骨針があれば確実）' },
  hallucination: { name: '幻覚', kind: 'poison', icon: '🌀', hours: [6, 6, 6], incubation: [2, 2], visual: 'hue',
    treat: '時間がたつのを待つ' },
};

/** base infection chance per 12 h for an untreated wound (DESIGN.md §6.3) */
export const INFECTION_BASE = { cut: 0.06, puncture: 0.08, burn: 0.10, bite: 0.25 };

/** severity draw by freshness stage when a food poisoning hits (§7.4) */
export const SEVERITY_BY_FRESH = [
  [0.70, 0.25, 0.05], // fresh
  [0.60, 0.30, 0.10], // a bit old
  [0.40, 0.40, 0.20], // going off
  [0.20, 0.45, 0.35], // rotten
];

// DESIGN.md §17.1
export const DIFFICULTY = {
  easy:    { name: 'のんびり', drain: 0.7, illness: 0.6, worsen: 0.5, thermal: 0.25, resources: 1.3, notice: 0.8, fire: 0.10, durability: 1.5, badEvents: 0.5, score: 0.6, showRisk: 'percent', retries: 3, companionDies: false, needs: 1, weatherMode: 'dry' },
  normal:  { name: 'ふつう',   drain: 1.0, illness: 1.0, worsen: 1.0, thermal: 0.35, resources: 1.0, notice: 1.0, fire: 0,    durability: 1.0, badEvents: 1.0, score: 1.0, showRisk: 'band', retries: 3, companionDies: true, needs: 1, weatherMode: 'normal' },
  hard:    { name: 'きびしい', drain: 1.2, illness: 1.3, worsen: 1.3, thermal: 0.40, resources: 0.8, notice: 1.15, fire: -0.03, durability: 0.85, badEvents: 1.3, score: 1.4, showRisk: 'band', retries: 0, companionDies: true, needs: 1, weatherMode: 'wetter' },
  extreme: { name: '極限',     drain: 1.4, illness: 1.6, worsen: 1.6, thermal: 0.45, resources: 0.6, notice: 1.3, fire: -0.06, durability: 0.7, badEvents: 1.6, score: 2.0, showRisk: 'none', retries: 0, companionDies: true, needs: 1.2, weatherMode: 'wet' },
};
