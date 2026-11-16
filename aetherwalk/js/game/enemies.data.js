// js/game/enemies.data.js — the Nagi creatures (§5.2). All original. (OPUS-B)
// attack.kind is the AttackShape kind (§5.3). windup = telegraph length (0.6–1.4 s). No attack without a telegraph.
// LINE_HALF: the hit band is ±0.32 m so a 0.35 m side step always clears it (§2.5).
export const LINE_HALF = 0.32;

export const ENEMY_DEFS = {
  thornling: {
    name: 'いばら玉', en: 'Thornling', hp: 4, radius: 0.27, height: 0.4, speed: 3.0, turn: 7,
    light: true, keep: 2.4, center: 0.24,
    attacks: [
      { id: 'pounce', kind: 'sphere', windup: 0.6, damage: 2, range: [1.0, 3.2], cooldown: 1.8, leapTime: 0.38, hitR: 0.16 },
    ],
    drops: [{ itemId: 'shard', min: 1, max: 1 }],
  },
  husk: {
    name: '凪の殻', en: 'Hollow Husk', hp: 12, radius: 0.42, height: 1.95, speed: 1.8, turn: 4,
    keep: 1.6, center: 1.0,
    attacks: [
      { id: 'sweep', kind: 'high', windup: 0.9, damage: 4, range: [0, 2.3], arc: 80, cooldown: 1.6 },
      { id: 'slam', kind: 'line', windup: 1.1, damage: 6, range: [0, 2.6], length: 3.0, cooldown: 1.8 },
    ],
    drops: [{ itemId: 'shard', min: 2, max: 4 }, { itemId: 'apple', min: 1, max: 1, chance: 0.5 }],
  },
  wisp: {
    name: '澱み火', en: 'Stagnant Wisp', hp: 6, radius: 0.32, height: 0.6, speed: 2.4, turn: 5,
    light: true, float: 1.7, keep: 8, center: 0,
    attacks: [
      { id: 'bolt', kind: 'sphere', windup: 1.0, damage: 3, range: [3, 14], cooldown: 2.6, boltSpeed: 5.0, hitR: 0.2 },
    ],
    drops: [{ itemId: 'shard', min: 2, max: 2 }, { itemId: 'mushroom', min: 1, max: 1, chance: 0.4 }],
  },
  lurker: {
    name: '砂潜り', en: 'Sand Lurker', hp: 16, radius: 0.7, height: 0.9, speed: 2.6, turn: 3,
    keep: 9, center: 0.45, burrows: true,
    attacks: [
      { id: 'charge', kind: 'line', windup: 1.2, damage: 6, range: [4, 13], extra: 4, chargeSpeed: 10, cooldown: 2.5 },
    ],
    drops: [{ itemId: 'shard', min: 3, max: 5 }, { itemId: 'bomb', min: 1, max: 1, chance: 0.5 }],
  },
  rimeguard: {
    name: '霜の番人', en: 'Rime Warden', hp: 40, radius: 0.9, height: 3.0, speed: 1.3, turn: 1.6,
    keep: 2.6, center: 1.6, heavy: true, miniboss: true,
    attacks: [
      { id: 'beam', kind: 'high', windup: 1.4, damage: 8, range: [0, 9], arc: 70, cooldown: 2.6 },
      { id: 'quake', kind: 'line', windup: 1.2, damage: 6, range: [0, 8], length: 10, cooldown: 2.4 },
    ],
    drops: [{ itemId: 'shard', min: 10, max: 10 }, { itemId: 'frostberry', min: 1, max: 1 }],
  },
  stillheart: {
    name: '凪の心臓', en: 'Stillheart', hp: 60, radius: 1.8, height: 3.6, speed: 0, turn: 0,
    boss: true, center: 3.2,
    attacks: [
      { id: 'beam', kind: 'high', windup: 1.4, damage: 4, cooldown: 3.5 },
      { id: 'quake', kind: 'line', windup: 1.2, damage: 6, length: 16, cooldown: 4 },
    ],
    drops: [],
  },
};

export const ENEMY_TYPES = Object.keys(ENEMY_DEFS);
export const NOTICE_DAY = 18, NOTICE_NIGHT = 24, LEASH = 40, ACTIVE_R = 60, DESPAWN_R = 80, MAX_ACTIVE = 6, MAX_ATTACKERS = 2;
