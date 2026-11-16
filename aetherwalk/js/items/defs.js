// js/items/defs.js — ITEM_DEFS (§4.1 table, §4.5 shape), OPUS-A. The contract file other owners read.
// Extra keys beyond §4.5 (all optional for readers): grab (grab segment in grip space), bow, bomb, fan, bell,
// flask, torch, autoCollect, holdOffset.
//
// food: { hp: number | 'full', stamina?: number | 'full', buff?: 'frost', buffTime?: s, cookTo?, cookTime?, bites }
//   — effects are applied by OPUS-B on 'item:consume'. The flask's food is per gulp.

const W = (o) => Object.freeze(o);

export const ITEM_DEFS = {
  sword: {
    id: 'sword', name: '旅人の剣', en: 'Wayfarer Blade', cat: 'weapon', stack: 1,
    slots: ['backR', 'backL', 'hipR', 'hipL'], owned: true,
    melee: W({ type: 'slash', base: 6, minSpeed: 2.0, strongSpeed: 4.5, strongMul: 1.5, thrust: 5, reach: 0.85, radius: 0.05, cooldown: 0.25, from: 0.1 }),
    thrown: W({ damage: 4, minSpeed: 5 }), block: null, food: null, use: 'gale',
    element: 'none', flammable: false, icon: 'sword', size: 0.45,
    grab: [[0, 0, 0.08], [0, 0, -0.8]],
    desc: 'まっすぐな片手剣。走るほど刃に風が宿る。',
  },
  spear: {
    id: 'spear', name: '風切りの槍', en: 'Windcutter Spear', cat: 'weapon', stack: 1,
    slots: ['backR', 'backL'], owned: true,
    melee: W({ type: 'thrust', base: 4, minSpeed: 2.0, strongSpeed: 4.5, strongMul: 1.5, thrust: 8, thrustSpeed: 2.5, reach: 1.6, radius: 0.05, cooldown: 0.25, from: 0.6 }),
    thrown: W({ damage: 10, minSpeed: 5 }), block: null, food: null, use: 'gale',
    element: 'none', flammable: false, icon: 'spear', size: 0.9,
    grab: [[0, 0, 0.55], [0, 0, -1.55]],
    desc: '柄の向きにまっすぐ突く。投げれば遠くの的にも届く。',
  },
  torch: {
    id: 'torch', name: '枝の松明', en: 'Branch Torch', cat: 'weapon', stack: 1,
    slots: ['hipL', 'hipR', 'backR', 'backL'], owned: true,
    melee: W({ type: 'blunt', base: 3, minSpeed: 2.0, strongSpeed: 4.5, strongMul: 1.5, thrust: 3, reach: 0.55, radius: 0.06, cooldown: 0.3, from: 0.2, fireBonus: 3 }),
    thrown: W({ damage: 2, minSpeed: 5 }), block: null, food: null, use: 'torch',
    torch: W({ burnTime: 180, head: -0.5 }),
    element: 'none', flammable: true, icon: 'torch', size: 0.3,
    grab: [[0, 0, 0.12], [0, 0, -0.5]],
    desc: '棍棒にもなる枝。火に近づけると燃え、暗がりを照らす。',
  },
  shield: {
    id: 'shield', name: '木霊の盾', en: 'Echo Shield', cat: 'shield', stack: 1,
    slots: ['backL', 'backR'], owned: true,
    melee: W({ type: 'blunt', base: 2, minSpeed: 2.0, strongSpeed: 4.5, strongMul: 1, thrust: 2, reach: 0, radius: 0.26, cooldown: 0.4, from: 0, bash: true }),
    thrown: W({ damage: 2, minSpeed: 5 }),
    block: W({ arc: 60, parryWindow: 0.25, parrySpeed: 1.5, stagger: 2 }), food: null, use: null,
    element: 'none', flammable: false, icon: 'shield', size: 0.3,
    grab: [[0.06, 0, 0]],
    desc: '正面からの攻撃を受ける。攻撃に向けて押し出せば、はじき返す。',
  },
  bow: {
    id: 'bow', name: '風弓', en: 'Wind Bow', cat: 'bow', stack: 1,
    slots: ['backL', 'backR'], owned: true,
    melee: null, thrown: W({ damage: 1, minSpeed: 5 }), block: null, food: null, use: 'bow',
    bow: W({ minDraw: 0.15, maxDraw: 0.6, speedBase: 18, speedDraw: 30, nockY: 0.228, limb: 0.575 }),
    element: 'none', flammable: false, icon: 'bow', size: 0.6,
    grab: [[0, 0, 0.4], [0, 0, -0.4]],
    desc: '片手で持ち、もう片手で肩ごしに矢を取って、つがえて引いて離す。',
  },
  arrow: {
    id: 'arrow', name: '矢', en: 'Arrow', cat: 'ammo', stack: 30, slots: [], owned: false,
    melee: null, thrown: W({ damage: 1, minSpeed: 6 }), block: null, food: null, use: null,
    arrow: W({ damage: 4, damageDraw: 6, fireBonus: 3, length: 0.81 }),
    element: 'none', flammable: true, icon: 'arrow', size: 0.4,
    grab: [[0, 0, 0], [0, 0, -0.8]],
    desc: '弓で放つ。先を火に触れさせると火矢になる。',
  },
  bomb: {
    id: 'bomb', name: '爆ぜ実', en: 'Burstfruit', cat: 'throwable', stack: 8, slots: ['belt'], owned: false,
    melee: null, thrown: W({ damage: 1, minSpeed: 6 }), block: null, food: null, use: 'fuse',
    bomb: W({ fuse: 3, radius: 4, center: 14, edge: 4, self: 4 }),
    element: 'none', flammable: true, icon: 'bomb', size: 0.07,
    desc: '握ってトリガーで点火（火に触れても）。3 秒後にはじける。投げても転がしてもいい。',
  },
  rock: {
    id: 'rock', name: '石ころ', en: 'Pebble', cat: 'throwable', stack: 10, slots: ['belt'], owned: false,
    melee: null, thrown: W({ damage: 3, minSpeed: 6, stun: 1.5 }), block: null, food: null, use: null,
    element: 'none', flammable: false, icon: 'rock', size: 0.05,
    desc: '拾って投げる。鈴やスイッチも鳴らせる。',
  },
  windfan: {
    id: 'windfan', name: '風扇', en: 'Gale Fan', cat: 'tool', stack: 1, slots: ['hipR', 'hipL'], owned: true,
    melee: null, thrown: W({ damage: 1, minSpeed: 5 }), block: null, food: null, use: 'fan',
    fan: W({ minSpeed: 2.5, range: 6, halfAngle: 30, cooldown: 0.45, life: 0.3 }),
    element: 'wind', flammable: false, icon: 'windfan', size: 0.2,
    desc: '面の向きにあおぐと突風が起きる。火を消し、飛び道具を跳ね返し、風車花を回す。',
  },
  flask: {
    id: 'flask', name: '息吹の水筒', en: 'Breath Flask', cat: 'tool', stack: 1, slots: ['hipR', 'hipL'], owned: true,
    melee: null, thrown: W({ damage: 1, minSpeed: 5 }), block: null, use: 'flask',
    food: W({ hp: 2, cure: 'burn' }),
    flask: W({ gulps: 3, tilt: 60, pourTilt: 120, gulpTime: 0.5, neck: -0.12 }),
    element: 'water', flammable: false, icon: 'flask', size: 0.08,
    desc: '口の近くで傾けて飲む（1口で HP +2）。水に沈めて汲み、逆さにして注ぐ。',
  },
  waybell: {
    id: 'waybell', name: '道しるべの鈴', en: 'Waybell', cat: 'tool', stack: 1, slots: [], owned: true,
    melee: null, thrown: W({ damage: 1, minSpeed: 5 }), block: null, food: null, use: 'bell',
    bell: W({ reversals: 4, window: 0.9, minSpeed: 1.0, ribbon: 6, cooldown: 2 }),
    element: 'none', flammable: false, icon: 'waybell', size: 0.08,
    desc: '振ると、目的地へ光の粒の帯が伸びる。手首に吊るしてある。',
  },
  apple: {
    id: 'apple', name: '陽りんご', en: 'Sun Apple', cat: 'food', stack: 10, slots: ['chest'], owned: false,
    melee: null, thrown: W({ damage: 1, minSpeed: 6 }), block: null, use: null,
    food: W({ hp: 4, cookTo: 'apple_baked', cookTime: 3, bites: 2 }),
    element: 'none', flammable: false, icon: 'apple', size: 0.045,
    desc: '日なたの味。火にかざして 3 秒で焼きりんご。',
  },
  apple_baked: {
    id: 'apple_baked', name: '焼き陽りんご', en: 'Baked Apple', cat: 'food', stack: 10, slots: ['chest'], owned: false,
    melee: null, thrown: W({ damage: 1, minSpeed: 6 }), block: null, use: null,
    food: W({ hp: 8, bites: 2 }),
    element: 'none', flammable: false, icon: 'apple_baked', size: 0.045,
    desc: 'あたたかく甘い。',
  },
  mushroom: {
    id: 'mushroom', name: '灯りきのこ', en: 'Glowcap', cat: 'food', stack: 10, slots: ['chest'], owned: false,
    melee: null, thrown: W({ damage: 1, minSpeed: 6 }), block: null, use: null,
    food: W({ hp: 2, stamina: 30, cookTo: 'mushroom_grilled', cookTime: 3, bites: 2 }),
    element: 'none', flammable: false, icon: 'mushroom', size: 0.045,
    desc: 'ほんのり光る。食べると追い風が少し吹く。',
  },
  mushroom_grilled: {
    id: 'mushroom_grilled', name: '焼き灯りきのこ', en: 'Grilled Glowcap', cat: 'food', stack: 10, slots: ['chest'], owned: false,
    melee: null, thrown: W({ damage: 1, minSpeed: 6 }), block: null, use: null,
    food: W({ hp: 6, stamina: 'full', bites: 2 }),
    element: 'none', flammable: false, icon: 'mushroom_grilled', size: 0.045,
    desc: '香ばしい。追い風が満ちる。',
  },
  frostberry: {
    id: 'frostberry', name: '霜いちご', en: 'Frostberry', cat: 'food', stack: 10, slots: ['chest'], owned: false,
    melee: null, thrown: W({ damage: 1, minSpeed: 6 }), block: null, use: null,
    food: W({ hp: 2, buff: 'frost', buffTime: 60, bites: 2 }),
    element: 'none', flammable: false, icon: 'frostberry', size: 0.04,
    desc: 'ひんやり。60 秒のあいだ追い風が減らない。',
  },
  honeycomb: {
    id: 'honeycomb', name: '風蜜', en: 'Windhoney', cat: 'food', stack: 5, slots: ['chest'], owned: false,
    melee: null, thrown: W({ damage: 1, minSpeed: 6 }), block: null, use: null,
    food: W({ hp: 'full', bites: 2 }),
    element: 'none', flammable: false, icon: 'honeycomb', size: 0.05,
    desc: 'HP がすべて戻る。宝箱と祠だけで手に入る。',
  },
  shard: {
    id: 'shard', name: '光のかけら', en: 'Light Shard', cat: 'material', stack: 999, slots: [], owned: false,
    melee: null, thrown: null, block: null, food: null, use: null, autoCollect: 1.0,
    element: 'none', flammable: false, icon: 'shard', size: 0.03,
    desc: '島の通貨。触れるか近くを通ると集まる。',
  },
  aetherseed: {
    id: 'aetherseed', name: '風の種', en: 'Aether Seed', cat: 'key', stack: 24, slots: [], owned: false,
    melee: null, thrown: null, block: null, food: null, use: null, autoCollect: 1.0,
    element: 'wind', flammable: false, icon: 'aetherseed', size: 0.04,
    desc: '止まった風のかけら。4 つごとに追い風が強くなる。',
  },
  pearl: {
    id: 'pearl', name: '息吹の珠', en: 'Breath Pearl', cat: 'key', stack: 5, slots: [], owned: false,
    melee: null, thrown: null, block: null, food: null, use: null, autoCollect: 1.0,
    element: 'none', flammable: false, icon: 'pearl', size: 0.035,
    desc: '祠のごほうび。最大 HP がハート 1 つ増える。',
  },
};
for (const k of Object.keys(ITEM_DEFS)) Object.freeze(ITEM_DEFS[k]);
export const ITEM_IDS = Object.keys(ITEM_DEFS);
