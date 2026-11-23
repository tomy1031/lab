// data/events.js — random events (DESIGN.md §14) as data. The simulation lives in js/sim/events.js.
// { id, name, p, when, chancePerDay | chancePerHour, bad, major, effect, omen?, impl }
//   p: 'P0'|'P1'|'P2'    bad: affected by the difficulty "bad events" multiplier (§17.1)
//   major: ◎ — at most one major event per day
//   impl: true when js/sim/events.js implements it; false = data only (later / owned by another system)

export const FLOTSAM = {
  // §21.1: the first morning is always these four (bottle, can, rope, cloth)
  day1: [['plastic_bottle', 1], ['can', 1], ['rope_scrap', 1], ['cloth', 1]],
  pool: [['driftwood', 5], ['plastic_bottle', 2], ['can', 2], ['rope_scrap', 3], ['cloth', 2], ['bamboo', 2],
    ['glass_bottle', 1], ['net_scrap', 1.5], ['float', 1], ['shell', 2]],
  crate: { chance: 0.03, pool: [[{ id: 'canned_food', n: 2 }, 1], [{ id: 'lighter', n: 1, extra: { dur: 50, ignite: 0.95 } }, 1], [{ id: 'blanket', n: 1 }, 1]] },
  count: [2, 5], afterStorm: [6, 10],
};

export const SUPPLY_DROP = [['canned_food', 3], ['water_1l', 1], ['bandage', 2]];

export const COMPANION_GIFTS = { nagi: 'grilled_fish', touko: 'herb_tea', gen: 'good_tool' };

export const EVENTS = {
  flotsam:   { id: 'flotsam', name: '漂着物', p: 'P0', when: { morning: true }, chancePerDay: 1, bad: false, major: false, impl: true,
    effect: '浜(南)に 素材が 2〜5 個(嵐の 翌朝 6〜10)。1 日目は ペットボトル・缶・ロープ・布。3% で 木箱。' },
  typhoon:   { id: 'typhoon', name: '大嵐(台風)', p: 'P0', when: { days: '0|>=7', schedule: true }, chancePerDay: { dry: 0.03, wet: 0.08 }, bad: true, major: true, impl: true,
    guarantee: { 7: 5, 14: [6, 10], 30: [6, 10], repeatEvery: 30 },
    effect: '嵐 ブロック × 3(18h)、風速 20〜30、高潮、火が 消える、建物ダメージ。',
    omen: [
      { before: 18, text: '海が うねって いる。鳥が 低く 飛んで いく…', who: '空気が 重い。なにか 来るかも' },
      { before: 12, text: '風が 変わった。雲が 西から 厚く 流れて くる。', who: '嵐の 前の におい…備えた ほうが いいよ' },
      { before: 6, text: '波が 高い。遠くで 雷が 鳴って いる。嵐が 来る!', who: 'もうすぐ 来る。薪と 水を 屋根の 下へ!' },
      { before: 2, text: 'まもなく 大嵐 が 来る。', who: '急いで!' },
    ] },
  ship:      { id: 'ship', name: '船が 通る', p: 'P0', when: { minDay: 3, daytime: true }, chancePerDay: 0.06, chancePerDayUnlimitedLate: { minDay: 10, p: 0.08 }, bad: false, major: true, impl: true,
    effect: '水平線に 5 実分 見える(汽笛)。§15.1 の 気づかれる 判定(10 実秒ごと × 30 回)。' },
  plane:     { id: 'plane', name: '飛行機が 通る', p: 'P1', when: { minDay: 5, daytime: true }, chancePerDay: 0.04, bad: false, major: true, impl: true,
    effect: '上空を 90 実秒。§15.1(9 回判定)。気づかれたら 翌日 10:00 に 救助船。' },
  boar_raid: { id: 'boar_raid', name: 'イノシシの 夜襲', p: 'P1', when: { night: true, foodOutside: true, noFence: true }, chancePerDay: 0.12, bad: true, major: true, impl: false,
    effect: '食料を 30〜60% 荒らす、建物 −30。(基地の 状態は building 側が 持つ。night_noise の 10% から 呼ばれる)' },
  rat_theft: { id: 'rat_theft', name: 'ネズミの 盗み食い', p: 'P0', when: { night: true, foodNotInStorage: true }, chancePerDay: 0.30, bad: true, major: false, impl: true,
    effect: '食料 1〜3 個 消える。`game.stealFood(n)` が あれば それを 使う。' },
  bird_theft:{ id: 'bird_theft', name: '鳥が 干物を 取る', p: 'P1', when: { uncoveredRack: true }, chancePerDay: 0.10, bad: true, major: false, impl: true,
    effect: '干物 1〜2 個。`game.stealDried(n)` が あれば 呼ぶ。' },
  red_tide:  { id: 'red_tide', name: '赤潮', p: 'P1', when: { season: 'dry', clearDays: 3 }, chancePerDay: 0.15, bad: true, major: false, impl: true,
    effect: '2〜3 日 海が 赤茶色。貝は 毒、入り江の 釣果 ×0.5。' },
  fish_run:  { id: 'fish_run', name: '魚の 大群', p: 'P0', when: { risingTideMorning: true }, chancePerDay: 0.08, bad: false, major: false, impl: true,
    effect: '入り江に 鳥山。2h の 間 釣り アタリ ×3、網 ×2。' },
  fruit_fall:{ id: 'fruit_fall', name: '実の 当たり日', p: 'P0', when: { afterRain: true }, chancePerDay: 0.20, bad: false, major: false, impl: true,
    effect: 'ヤシの実 4〜6 が 落ちて いる。キノコ・タケノコ 倍(その 日)。' },
  flash_flood:{ id: 'flash_flood', name: '川の 増水', p: 'P1', when: { rainBlocks: 2, delayH: 6 }, chancePerDay: 1, bad: true, major: false, impl: true,
    effect: '川幅 2 倍・12h。やな・冷やし穴 破損。水は 濁る。' },
  lightning_fire:{ id: 'lightning_fire', name: '落雷の 燃え木', p: 'P1', when: { storm: true }, chancePerHour: 0.06, bad: false, major: false, impl: true,
    effect: '岩山か 密林の 木に 落雷。2h くすぶる 火種。(bus: lightning:fire)' },
  rain_gift: { id: 'rain_gift', name: '恵みの 雨', p: 'P1', when: { thirstyHours: 24, noStock: true, notHard: true }, chancePerDay: 0.25, bad: false, major: false, impl: false,
    effect: '次の ブロックが 小雨に なる。(水の 蓄え情報が 必要 — 未実装)' },
  heat_wave: { id: 'heat_wave', name: '猛暑日', p: 'P1', when: { season: 'dry' }, chancePerDay: 0.15, bad: true, major: false, impl: false,
    effect: '天気 側(weather.js の heat)が 担当。' },
  cold_night:{ id: 'cold_night', name: '冷えこむ 夜', p: 'P1', when: { clearCalmNight: true }, chancePerDay: 0.20, bad: true, major: false, impl: true,
    effect: '02–06 時の 気温 −3℃。mod: tempOffset。' },
  snake_in_bed:{ id: 'snake_in_bed', name: '寝床の ヘビ・ムカデ', p: 'P1', when: { groundBed: true }, chancePerDay: 0, bad: true, major: false, impl: false, effect: '§8.5(睡眠 側)。' },
  tool_break:{ id: 'tool_break', name: '道具が 壊れる', p: 'P0', when: { durability0: true }, bad: false, major: false, impl: true,
    effect: '「壊れた ◯◯」。気力 −4。(bus: tool:broken {name})' },
  wound_fester:{ id: 'wound_fester', name: '傷が うずく', p: 'P0', when: { untreatedWoundH: 12 }, bad: false, major: false, impl: true,
    effect: '化膿の 予告。(player.body.untreatedWoundHours() か bus: wound:untreated {hours})' },
  dream:     { id: 'dream', name: '夢', p: 'P1', when: { sleep: true }, chancePerDay: 0.6, bad: false, major: false, impl: false, effect: '§16.7(睡眠/夢 側)。' },
  night_noise:{ id: 'night_noise', name: '夜の 物音', p: 'P1', when: { night: true, smallFire: true, outdoors: true }, chancePerDay: 0.25, bad: true, major: false, impl: true,
    effect: '睡眠 −1h、気力 −3。正体は カニ/風/コウモリ/イノシシ(30/30/30/10)。' },
  companion_lost:{ id: 'companion_lost', name: '仲間が 迷子', p: 'P1', when: { toukoJungleAlone: true }, chancePerDay: 0.05, bad: true, major: false, impl: false, effect: '仲間 AI 側。' },
  companion_gift:{ id: 'companion_gift', name: '仲間からの 贈り物', p: 'P1', when: { affinity: 50, moraleBelow: 40 }, chancePerDay: 0.30, bad: false, major: false, impl: true,
    effect: '得意な 物を 1 つ、気力 +10。' },
  companion_quarrel:{ id: 'companion_quarrel', name: '口げんか', p: 'P2', when: { trustBelow: 30, bothMoraleBelow: 40 }, chancePerDay: 0.20, bad: true, major: false, impl: false, effect: '仲間 AI 側。' },
  message_bottle:{ id: 'message_bottle', name: 'びんの 手紙', p: 'P2', when: { morning: true }, chancePerDay: 0.02, bad: false, major: false, impl: true,
    effect: '手紙(気力 +8)。10% で 宝の 地図。' },
  old_camp:  { id: 'old_camp', name: '昔の 遭難者の 跡', p: 'P1', when: { firstVisit: ['cave_deep', 'rocks_shade'] }, chancePerDay: 1, bad: false, major: false, impl: true,
    effect: '錆びた ナイフ と 古い 日記。(bus: zone:enter {id} を 監視)' },
  whale:     { id: 'whale', name: 'クジラ・イルカ', p: 'P2', when: { morning: true }, chancePerDay: 0.05, bad: false, major: false, impl: true, effect: '30 秒の 眺め。気力 +10。' },
  meteor:    { id: 'meteor', name: '流れ星・満天の 星', p: 'P2', when: { clearNight: true }, chancePerDay: 0.15, bad: false, major: false, impl: true, effect: '気力 +5。' },
  turtle_nest:{ id: 'turtle_nest', name: 'ウミガメの 産卵', p: 'P2', when: { season: 'wet', night: true }, chancePerDay: 0.10, bad: false, major: false, impl: false, effect: '§8.2。' },
  supply_drop:{ id: 'supply_drop', name: '番組からの 差し入れ', p: 'P1', when: { difficulty: 'easy', everyDays: 7 }, chancePerDay: 1, bad: false, major: false, impl: true,
    effect: '浜に 小箱: 缶詰 3・水 1L・包帯 2。' },
  full_moon: { id: 'full_moon', name: '満月の 大潮', p: 'P1', when: { cycleDays: 14.75 }, bad: false, major: false, impl: true,
    effect: '潮の 振幅 ×1.3、夜も 明るい、伊勢エビ・ヤシガニ ×2。mod: tideAmp / nightLight / lobster。' },
};

/** [kind]: signal weights of §15.1(b). ship / plane. */
export const SIGNAL_TABLE = {
  smokeBeach:  { ship: 0.30, plane: 0.25, day: true },
  smokeHill:   { ship: 0.45, plane: 0.40, day: true },
  smokeOther:  { ship: 0.15, plane: 0.10, day: true },
  bigFire:     { ship: 0.25, plane: 0.15, night: true },
  bigFireHill: { ship: 0.35, plane: 0.15, night: true },
  sos1:        { ship: 0.03, plane: 0.10, day: true },
  sos2:        { ship: 0.03, plane: 0.15, day: true },
  waving:      { ship: 0.10, plane: 0.03 },
  companionWave: { ship: 0.05, plane: 0.02 },
  gunshots:    { ship: 0.20, plane: 0 },
  fireColumn:  { ship: 0.05, plane: 0.05 },
  whistle:     { ship: 0.03, plane: 0 },
  lookout:     { ship: 0.05, plane: 0.05 },
  tarp:        { ship: 0.05, plane: 0.08 },
};
export const WEATHER_NOTICE = { clear: 1.0, heat: 1.0, cloudy: 0.9, drizzle: 0.6, fog: 0.3, rain: 0.3, storm: 0, typhoon: 0 };
export const PASS = { ship: { durSec: 300, checks: 30, hornSec: 300 }, plane: { durSec: 90, checks: 9 } };
