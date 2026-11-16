// js/game/itemInfo.js — §4.1 facts the game needs even when items/defs.js is a stub (OPUS-B).
// The real ITEM_DEFS (ctx.items.defs, OPUS-A) wins when present; this is only the fallback.
export const ITEM_INFO = {
  sword:            { name: '旅人の剣', en: 'Wayfarer Blade', cat: 'weapon', stack: 1, slots: ['backR', 'backL', 'hipR', 'hipL'], owned: true },
  spear:            { name: '風切りの槍', en: 'Windcutter Spear', cat: 'weapon', stack: 1, slots: ['backR', 'backL'], owned: true },
  torch:            { name: '枝の松明', en: 'Branch Torch', cat: 'weapon', stack: 1, slots: ['hipL', 'hipR', 'backR', 'backL'], owned: true },
  shield:           { name: '木霊の盾', en: 'Echo Shield', cat: 'shield', stack: 1, slots: ['backL', 'backR'], owned: true },
  bow:              { name: '風弓', en: 'Wind Bow', cat: 'bow', stack: 1, slots: ['backL', 'backR'], owned: true },
  arrow:            { name: '矢', en: 'Arrow', cat: 'ammo', stack: 30, slots: [] },
  bomb:             { name: '爆ぜ実', en: 'Burstfruit', cat: 'throwable', stack: 8, slots: ['belt'] },
  rock:             { name: '石ころ', en: 'Pebble', cat: 'throwable', stack: 10, slots: ['belt'] },
  windfan:          { name: '風扇', en: 'Gale Fan', cat: 'tool', stack: 1, slots: ['hipR', 'hipL'], owned: true },
  flask:            { name: '息吹の水筒', en: 'Breath Flask', cat: 'tool', stack: 1, slots: ['hipR', 'hipL'], owned: true },
  waybell:          { name: '道しるべの鈴', en: 'Waybell', cat: 'tool', stack: 1, slots: [], owned: true },
  apple:            { name: '陽りんご', en: 'Sun Apple', cat: 'food', stack: 10, slots: ['chest'], food: { hp: 4 } },
  apple_baked:      { name: '焼き陽りんご', en: 'Baked Apple', cat: 'food', stack: 10, slots: ['chest'], food: { hp: 8 } },
  mushroom:         { name: '灯りきのこ', en: 'Glowcap', cat: 'food', stack: 10, slots: ['chest'], food: { hp: 2, stamina: 30 } },
  mushroom_grilled: { name: '焼き灯りきのこ', en: 'Grilled Glowcap', cat: 'food', stack: 10, slots: ['chest'], food: { hp: 6, stamina: 'full' } },
  frostberry:       { name: '霜いちご', en: 'Frostberry', cat: 'food', stack: 10, slots: ['chest'], food: { hp: 2, buff: 'frost', buffTime: 60 } },
  honeycomb:        { name: '風蜜', en: 'Windhoney', cat: 'food', stack: 5, slots: ['chest'], food: { hp: 'full' } },
  shard:            { name: '光のかけら', en: 'Light Shard', cat: 'material', stack: 999, slots: [] },
  aetherseed:       { name: '風の種', en: 'Aether Seed', cat: 'key', stack: 24, slots: [] },
  pearl:            { name: '息吹の珠', en: 'Breath Pearl', cat: 'key', stack: 5, slots: [] },
};

export const SLOT_IDS = ['backR', 'backL', 'hipR', 'hipL', 'chest', 'belt'];
export const SLOT_NAMES = {
  backR: { name: '右肩', en: 'BACK R' }, backL: { name: '左肩', en: 'BACK L' },
  hipR: { name: '右腰', en: 'HIP R' }, hipL: { name: '左腰', en: 'HIP L' },
  chest: { name: '胸ポーチ', en: 'CHEST' }, belt: { name: '腹ポーチ', en: 'BELT' },
};
// which categories each slot accepts (§4.3)
export const SLOT_CATS = {
  backR: ['weapon', 'shield', 'bow'], backL: ['weapon', 'shield', 'bow'],
  hipR: ['tool', 'weapon'], hipL: ['tool', 'weapon'],
  chest: ['food'], belt: ['throwable'],
};
// carry-limit bonus per seed tier (§8.4) applies to these
export const TIER_BONUS_CATS = new Set(['ammo', 'throwable', 'food']);
