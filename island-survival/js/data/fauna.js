// data/fauna.js — animals (DESIGN.md §8.4, §8.5, §22.1, §22.3, §22.4). Distances m, speeds m/s, hp points.
//   sight / hearing / smell: base sense distances (smell only when the wind carries your scent to it)
//   flight: distance at which it bolts; fleeDist: how far it runs; calm: real seconds until it relaxes
//   lightNight: sight multiplier at night (goats 0.3, boars 1.0, others 0.4)
//   parts: hit zones (§22.3): r (m), mul (instant damage ×), fatal: [min, max] seconds of real time, or
//          { gameMin: [a, b] } / { gameHours: [a, b] }, or null (not fatal); drop: blood drop spacing (m); slow: speed ×
//   yield: butchered with a carried knife (100 %); other tools scale it (§22.4, BUTCHER)
export const SPECIES = {
  seabird: {
    name: '海鳥', guide: 'seabird', mass: 1.3, hp: 8, size: 0.5, zones: ['rocks', 'cliff', 'beach'], group: [6, 8], count: 14, flies: true,
    walk: 0.5, run: 9, sight: 40, hearing: 15, smell: 0, flight: 12, fleeDist: [60, 150], calm: 120, lightNight: 0.4,
    active: [[5.5, 19]], bodyR: 0.2, height: 0.45, small: true,
    yield: { bird_meat: 1, feather: 6, bone: 1 }, sound: 'seagull',
  },
  junglefowl: {
    name: '野鶏', guide: 'junglefowl', mass: 1.2, hp: 10, size: 0.35, zones: ['grass', 'jungle'], group: [2, 4], count: 10, flutter: true,
    walk: 0.8, run: 6, sight: 25, hearing: 20, smell: 0, flight: 10, fleeDist: [30, 50], calm: 300, lightNight: 0.4,
    active: [[5, 10], [15, 19]], bodyR: 0.15, height: 0.35, small: true,
    yield: { bird_meat: 1, feather: 6 }, sound: 'bird_call',
  },
  goat: {
    name: 'ヤギ', guide: 'goat', mass: 32, hp: 45, size: 0.85, zones: ['grass', 'hill', 'rocks'], group: [5, 6], count: 12, lookout: true,
    walk: 1.0, run: 8.5, sight: 60, hearing: 35, smell: 120, flight: 35, fleeDist: [150, 250], calm: 1200, lightNight: 0.3,
    active: [[5, 19.5]], bodyR: 0.36, height: 0.85, climbs: true,
    parts: {
      head: { r: 0.06, mul: 4, fatal: [0, 0] },
      heart: { r: 0.12, mul: 2, fatal: [10, 30], drop: 1.5 },
      liver: { r: 0.10, mul: 1.2, fatal: { gameMin: [15, 40] }, drop: 4, bed: true },
      belly: { r: 0.18, mul: 0.8, fatal: { gameHours: [4, 8] }, drop: 8, bed: true, dirty: true },
      muscle: { r: 0.14, mul: 0.7, fatal: null, chanceFatal: 0.3, drop: 6, stopAfter: 100 },
      leg: { r: 0.06, mul: 0.5, fatal: null, drop: 12, slow: 0.6 },
    },
    yield: { goat_meat: 8, hide: 1, bone: 4, sinew: 2, fat: 2, horn: 2 }, sound: 'goat', carcassKg: 35,
  },
  boar: {
    name: 'イノシシ', guide: 'boar', mass: 60, hp: 80, size: 1.0, zones: ['jungle', 'stream'], group: [1, 3], count: 6, charger: true,
    walk: 1.1, run: 9, sight: 15, hearing: 40, smell: 200, flight: 20, fleeDist: [200, 400], calm: 1800, lightNight: 1.0,
    active: [[5, 8], [16, 24], [0, 5]], bodyR: 0.45, height: 0.75, damage: [20, 35], afraidOfFire: true,
    parts: {
      head: { r: 0.07, mul: 4, fatal: [0, 0] },
      heart: { r: 0.14, mul: 2, fatal: [10, 30], drop: 1.5 },
      liver: { r: 0.12, mul: 1.2, fatal: { gameMin: [15, 40] }, drop: 4, bed: true },
      belly: { r: 0.22, mul: 0.8, fatal: { gameHours: [4, 8] }, drop: 8, bed: true, dirty: true },
      muscle: { r: 0.17, mul: 0.7, arrowMul: 0.4, fatal: null, chanceFatal: 0.3, drop: 6, stopAfter: 100 },
      leg: { r: 0.07, mul: 0.5, fatal: null, drop: 12, slow: 0.6 },
    },
    yield: { boar_meat: 12, hide: 1, bone: 6, sinew: 3, fat: 4, horn: 2 }, sound: 'boar', carcassKg: 60,
  },
  crab: {
    name: 'カニ', guide: 'crab', mass: 0.4, hp: 2, size: 0.22, zones: ['beach', 'rocks'], group: [1, 2], count: 22, burrow: true,
    walk: 0.6, run: 3, sight: 4, hearing: 4, smell: 0, flight: 2.5, fleeDist: [4, 8], calm: 30, lightNight: 1,
    active: [[18.5, 24], [0, 6.5]], bodyR: 0.12, height: 0.1, catchable: 0.4, small: true,
    yield: { crab: 1 }, sound: 'crab',
  },
  coconut_crab: {
    name: 'ヤシガニ', guide: 'coconut_crab', mass: 2.5, hp: 12, size: 0.4, zones: ['beach', 'grass'], group: [1, 1], count: 3, burrow: true,
    walk: 0.4, run: 1.5, sight: 5, hearing: 5, smell: 0, flight: 2, fleeDist: [3, 6], calm: 60, lightNight: 1,
    active: [[19, 24], [0, 5]], bodyR: 0.2, height: 0.18, catchable: 0.3, pinch: 0.2, small: true,
    yield: { coconut_crab: 1 }, sound: 'crab',
  },
  monitor: {
    name: 'オオトカゲ', guide: 'monitor', mass: 8, hp: 30, size: 0.9, zones: ['stream', 'pond'], group: [1, 1], count: 3, territorial: 15,
    walk: 0.7, run: 5, sight: 20, hearing: 25, smell: 30, flight: 6, fleeDist: [20, 40], calm: 120, lightNight: 0.4,
    active: [[8, 17]], bodyR: 0.22, height: 0.3, damage: [12, 12], bite: 0.4, swims: true,
    yield: { small_game: 3, hide: 1 }, sound: 'snake_hiss',
  },
  viper: {
    name: 'ハブ', guide: 'viper', mass: 1, hp: 6, size: 0.9, zones: ['jungle', 'grass', 'rocks'], group: [1, 1], count: 5, ambush: true,
    walk: 0.4, run: 1.4, sight: 3, hearing: 3, smell: 4, flight: 1.5, fleeDist: [5, 10], calm: 30, lightNight: 1,
    active: [[18, 24], [0, 6]], bodyR: 0.1, height: 0.08, venom: true, damage: [4, 4], small: true,
    yield: { snake_meat: 1 }, sound: 'snake_hiss',
  },
};

/** butchering by tool (§22.4): meat / hide / sinew / bone / fat share and game minutes for goat / boar */
export const BUTCHER = {
  pro_knife: { label: '持ち込みナイフ', meat: 1.0, hide: 1, hideQ: 75, sinew: 1, bone: 1, fat: 1, organs: true, minutes: [30, 45] },
  knife: { label: '手づくりナイフ', meat: 0.9, hide: 1, hideQ: 55, sinew: 0.8, bone: 1, fat: 0.8, minutes: [45, 65] },
  flake: { label: '石刃', meat: 0.8, hide: 1, hideQ: 35, sinew: 0.5, bone: 1, fat: 0.6, minutes: [55, 80] },
  axe: { label: '手斧', meat: 0.85, hide: 1, hideQ: 30, sinew: 0.5, bone: 1, fat: 0.7, marrow: true, minutes: [40, 55] },
  shell: { label: '貝殻・ガラス片', meat: 0.65, hide: 0.5, hideQ: 20, sinew: 0, bone: 1, fat: 0.3, minutes: [80, 120] },
  hands: { label: '素手・石', meat: 0.6, hide: 0, sinew: 0, bone: 1, fat: 0, smallOnly: true, minutes: [10, 10] },
};

/** fishing species (§22.5): spots: 'shallow' (bay / beach), 'reef' (rocky shore), 'deep' (reef offshore), 'river', 'pool'
 *  time multipliers by part of day [dawn 05–08, day 08–16, dusk 16–19, night 19–05]; tide: 'rising'|'moving'|'falling_end'
 *  bait: best (1.3) / ok (1.0); others 0.3. hook: 's' | 'm' | 'l'. item: inventory id. power: line tension per s (§9.4) */
export const FISH = {
  sardine:  { name: 'イワシ風の 小魚', item: 'sardine', size: 's', spots: { shallow: 0.6, river: 0.2 }, time: [1.5, 1.0, 1.3, 0.3], tide: { rising: 1.3 }, best: ['bait_ball', 'shellfish'], ok: ['grub'], depth: 0.5, hook: 's', power: 15, stamina: 20 },
  wrasse:   { name: 'ベラ', item: 'wrasse', size: 's', spots: { reef: 0.45 }, time: [1.0, 1.2, 1.0, 0], best: ['shellfish', 'crab'], ok: ['grub'], depth: 1.5, hook: 's', power: 15, stamina: 20 },
  jack:     { name: 'アジ', item: 'jack', size: 'm', spots: { shallow: 0.3, reef: 0.2 }, time: [2.0, 0.5, 2.0, 0.8], tide: { moving: 1.5, slack: 0.5 }, best: ['fish_fillet', 'sardine', 'lure'], ok: ['shellfish'], depth: 1.5, hook: 'm', power: 30, stamina: 50 },
  seabream: { name: 'クロダイ', item: 'seabream', size: 'm', spots: { reef: 0.35 }, time: [1.3, 1.0, 1.3, 0.6], tide: { rising: 1.4 }, best: ['crab', 'shellfish'], ok: ['seaweed'], depth: 3, hook: 'm', power: 30, stamina: 50 },
  grouper:  { name: 'ハタ', item: 'grouper', size: 'l', spots: { deep: 0.6, reef: 0.08 }, time: [0.5, 0.5, 1.5, 2.0], tide: { falling_end: 1.3 }, best: ['sardine', 'fish_fillet'], ok: ['crab'], depth: 3, hook: 'l', power: 55, stamina: 120 },
  trevally: { name: 'カスミアジ', item: 'trevally', size: 'l', spots: { deep: 0.4 }, time: [2.0, 0.4, 0.4, 0.4], tide: { moving: 2.0 }, best: ['lure', 'sardine'], ok: ['fish_fillet'], depth: 1, hook: 'l', power: 60, stamina: 120 },
  goby:     { name: 'ハゼ・テナガエビ', item: 'goby', size: 's', spots: { river: 0.8, pool: 0.7 }, time: [1.0, 1.0, 1.5, 1.5], best: ['grub', 'worm'], ok: ['shellfish'], depth: 0.5, hook: 's', power: 12, stamina: 15 },
  eel:      { name: '大ウナギ', item: 'eel', size: 'l', spots: { pool: 0.3, river: 0.05 }, time: [0, 0, 0.3, 1.0], best: ['fish_fillet', 'sardine'], ok: ['grub'], depth: 1, hook: 'l', power: 40, stamina: 80, line: 6 },
  puffer:   { name: 'ハリセン魚', item: 'puffer', size: 's', spots: { shallow: 0.06 }, time: [1, 1, 1, 0.5], best: [], ok: ['*'], depth: 1.5, hook: 's', power: 15, stamina: 20 },
  junk:     { name: '流木・長靴', item: 'driftwood', size: 's', spots: { shallow: 0.04, reef: 0.04, river: 0.04, deep: 0.02 }, time: [1, 1, 1, 1], best: [], ok: ['*'], depth: 0, hook: 's', power: 5, stamina: 5 },
};
