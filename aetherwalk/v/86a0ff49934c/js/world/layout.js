// js/world/layout.js — FABLE
// ユラ島の配置データ（座標はここだけが持つ）。three.js に依存しない純粋なデータ。
// 座標：+X 東、-Z 北、ヨー（度）0 = 北・時計回り。高さ h は地形をならす目標値（実際の y は heightAt）。

export const WORLD_SIZE = 1600;
export const HALF = 800;
export const GRID_N = 801;          // 2 m 格子
export const CELL = 2;
export const SEA_LEVEL = 0;
export const LAKE_LEVEL = 24;
export const LAKE_C = { x: 0, z: -40 };
export const LAKE_SHORE_R = 185;
export const LAKE_REGION_R = 215;
export const RING_ROAD_R = 235;
export const ICE_LEVEL = 60;

// id, name, kind, x, z, h(目標の高さ), r(平らな半径), yaw(正面の向き)
const L = [
  ['start', '目覚めの石舞台', 'ruin', 0, 540, 44, 10, 0],
  ['camp_meadow', '旅人の野営地', 'waylight', -30, 470, 26, 8, 20],
  ['tower_meadow', '風見の鐘塔', 'tower', 40, 330, 38, 9, 350],
  ['shrine_meadow', '疾走の祠', 'shrine', -190, 400, 24, 9, 60],
  ['pier', '祈りの桟橋', 'ruin', 0, 150, 25, 6, 0],
  ['isle', '凪の小島', 'arena', 0, -40, 27, 40, 0],
  ['camp_forest', '森の入口の灯', 'waylight', -300, 30, 32, 7, 90],
  ['tower_forest', '森の鐘塔', 'tower', -450, -20, 44, 9, 90],
  ['elder_tree', '大樹ヨルハ', 'vista', -520, 130, 40, 14, 135],
  ['shrine_forest', '灯しの祠', 'shrine', -330, 120, 34, 8, 220],
  ['hollow', '光苔のくぼ地', 'vista', -560, -120, 28, 20, 90],
  ['camp_canyon', '峡谷の灯', 'waylight', 330, 20, 34, 7, 270],
  ['tower_canyon', '茜の鐘塔', 'tower', 470, -40, 72, 9, 270],
  ['great_arch', '風穴のアーチ', 'vista', 380, 110, 36, 20, 288],
  ['shrine_canyon', '身かわしの祠', 'shrine', 540, 150, 40, 8, 270],
  ['lurker_nest', '砂潜りの巣', 'arena', 560, -150, 31, 25, 250],
  ['hoodoos', '千本石柱', 'vista', 430, -200, 38, 40, 200],
  ['camp_peaks', '雪線の灯', 'waylight', 20, -300, 44, 7, 180],
  ['tower_peaks', '霜の鐘塔', 'tower', 60, -430, 95, 9, 180],
  ['shrine_peaks', '剣舞の祠', 'shrine', -170, -400, 70, 8, 150],
  ['ice_mirror', '氷鏡', 'vista', 150, -340, 60, 35, 320],
  ['summit', '白冠峰', 'backdrop', -60, -560, 250, 0, 180],
  ['camp_coast', '岬の灯', 'waylight', 400, 470, 22, 7, 300],
  ['cape', '白波の岬', 'vista', 480, 500, 32, 12, 90],
  ['shrine_coast', '射手の祠', 'shrine', 440, 430, 26, 8, 80],
  ['west_beach', '夕凪の浜', 'vista', -480, 400, 2.2, 30, 250],
  ['fallen_bridge', '落ちた橋', 'ruin', 150, 230, 0, 0, 30],   // 川床にあるので地形はならさない
];
export const LANDMARKS = L.map(([id, name, kind, x, z, h, r, yaw]) => ({ id, name, kind, x, z, h, r, yaw }));
export const LM = Object.fromEntries(LANDMARKS.map((l) => [l.id, l]));

// 鏡川（湖の南東 → 海）
export const RIVER = [[90, 120], [118, 172], [150, 230], [196, 318], [250, 400], [296, 500], [330, 600], [352, 660]];

// 巡礼路（経由点）
const ringRoad = [];
for (let i = 0; i <= 48; i++) {
  const a = (i / 48) * Math.PI * 2;
  ringRoad.push([LAKE_C.x + Math.sin(a) * RING_ROAD_R, LAKE_C.z - Math.cos(a) * RING_ROAD_R]);
}
export const PATHS = [
  { id: 'south', pts: [[0, 531], [-8, 508], [-26, 478], [-22, 440], [2, 392], [28, 344], [22, 300], [6, 250], [0, 195], [0, 157]] },
  { id: 'ring', pts: ringRoad, closed: true },
  { id: 'west', pts: [[-235, -40], [-268, -6], [-293, 26], [-340, 22], [-395, 0], [-441, -18]] },
  { id: 'elder', pts: [[-340, 22], [-390, 52], [-446, 90], [-506, 124]] },
  { id: 'east', pts: [[235, -40], [280, -14], [323, 16], [342, 62], [358, 96], [380, 110], [408, 112], [424, 78], [428, 30], [436, -14], [452, -34], [461, -38]] },
  { id: 'north', pts: [[-36, -272], [-12, -286], [14, -297], [30, -330], [4, -356], [-12, -392], [12, -420], [38, -438], [52, -434]] },
  { id: 'ice', pts: [[20, -300], [66, -312], [112, -330]] },
  { id: 'cape', pts: [[44, 322], [92, 280], [150, 230], [214, 282], [292, 372], [352, 436], [394, 466], [440, 486], [471, 497]] },
];

// 絶景（§7.5）
export const VISTAS = [
  { id: 'v_awakening', name: '目覚めの眺め', x: 0, z: 532, yaw: 0, time: 7.0, lift: 0 },    // 舞台の北の縁、石段の上（床が画面の下を占めないように）
  { id: 'v_tower', name: '風見の塔の頂', x: 36.6, z: 328, yaw: 300, time: 17.5, lift: 0 },   // 甲板の縁（足もとの床を画面に入れない）   // 甲板が足場（groundAt に含まれる）なので足す高さは 0
  { id: 'v_elder', name: '大樹ヨルハの木漏れ日', x: -492, z: 108, yaw: 232, time: 10.0, lift: 0, pitch: 6 },   // 大樹の広場（半径 44 m に木を置かない）から幹と光の筋
  { id: 'v_arch', name: '風穴のアーチの夕陽', x: 410, z: 120, yaw: 285, time: 18.25, lift: 0 },
  { id: 'v_aurora', name: '氷鏡のオーロラ', x: 150, z: -330, yaw: 320, time: 23.0, lift: 0 },
  { id: 'v_cape', name: '白波の岬の朝焼け', x: 496, z: 496, yaw: 90, time: 5.75, lift: 0 },   // 灯台跡を背に、崖の先
  { id: 'v_pier', name: '祈りの桟橋の星鏡', x: 0, z: 118.6, yaw: 0, time: 21.0, lift: 0, pitch: 10 },   // 桟橋の先の祈り台
];

export const TOWERS = [
  { id: 'tower_meadow', liftHeight: 24, region: 'meadow' },
  { id: 'tower_forest', liftHeight: 30, region: 'forest' },
  { id: 'tower_canyon', liftHeight: 26, region: 'canyon' },
  { id: 'tower_peaks', liftHeight: 22, region: 'peaks' },
];

export const SHRINES = [
  { id: 'shrine_meadow', type: 'sprint', region: 'meadow' },
  { id: 'shrine_forest', type: 'torch', region: 'forest' },
  { id: 'shrine_canyon', type: 'dodge', region: 'canyon' },
  { id: 'shrine_peaks', type: 'blade', region: 'peaks' },
  { id: 'shrine_coast', type: 'archery', region: 'coast' },
];
export const TORCH_TARGET = { x: -420, z: 220 };

export const WAYLIGHTS = ['camp_meadow', 'camp_forest', 'camp_canyon', 'camp_peaks', 'camp_coast'];

// 宝箱 12（剣は台座）。hiddenBy はしかけの id
export const CHESTS = [
  { id: 'chest_sword', x: -26.5, z: 465.5, yaw: 120, loot: [{ itemId: 'sword', count: 1 }], hiddenBy: null, pedestal: true },
  { id: 'chest_shield', x: 49, z: 341, yaw: 200, loot: [{ itemId: 'shield', count: 1 }], hiddenBy: null },
  { id: 'chest_bow', x: -508, z: 140, yaw: 130, loot: [{ itemId: 'bow', count: 1 }, { itemId: 'arrow', count: 15 }], hiddenBy: null },
  { id: 'chest_spear', x: 566, z: -160, yaw: 290, loot: [{ itemId: 'spear', count: 1 }], hiddenBy: null },
  { id: 'chest_windfan', x: 486, z: 505, yaw: 300, loot: [{ itemId: 'windfan', count: 1 }], hiddenBy: null },
  { id: 'chest_honey_meadow', x: -122, z: 300, yaw: 160, loot: [{ itemId: 'honeycomb', count: 1 }], hiddenBy: 'crack_meadow' },
  { id: 'chest_honey_forest', x: -605, z: -60, yaw: 90, loot: [{ itemId: 'honeycomb', count: 1 }], hiddenBy: 'thorn_forest' },
  { id: 'chest_honey_peaks', x: 196, z: -372, yaw: 250, loot: [{ itemId: 'honeycomb', count: 1 }], hiddenBy: 'ice_peaks' },
  { id: 'chest_arrows_forest', x: -392, z: -92, yaw: 30, loot: [{ itemId: 'arrow', count: 10 }], hiddenBy: null },
  { id: 'chest_arrows_coast', x: 300, z: 520, yaw: 20, loot: [{ itemId: 'arrow', count: 10 }], hiddenBy: null },
  { id: 'chest_bombs_canyon', x: 352, z: -92, yaw: 180, loot: [{ itemId: 'bomb', count: 4 }], hiddenBy: 'crack_canyon' },
  { id: 'chest_bombs_meadow', x: 206, z: 404, yaw: 280, loot: [{ itemId: 'bomb', count: 3 }], hiddenBy: null },
];

// しかけ（ひび岩・いばら・氷塊）。chest を隠すものは宝箱の手前に置く
export const BLOCKERS = [
  { id: 'crack_meadow', kind: 'crackrock', x: -119, z: 303.5, r: 2.2 },
  { id: 'crack_canyon', kind: 'crackrock', x: 352, z: -88, r: 2.4 },
  { id: 'crack_canyon2', kind: 'crackrock', x: 498, z: 64, r: 2.2 },
  { id: 'crack_coast', kind: 'crackrock', x: 372, z: 540, r: 2.0 },
  { id: 'crack_peaks', kind: 'crackrock', x: -96, z: -352, r: 2.2 },
  { id: 'thorn_forest', kind: 'thornvine', x: -601, z: -62, r: 2.0 },
  { id: 'thorn_forest2', kind: 'thornvine', x: -470, z: 62, r: 1.8 },
  { id: 'thorn_meadow', kind: 'thornvine', x: 118, z: 452, r: 1.8 },
  { id: 'ice_peaks', kind: 'iceblock', x: 193, z: -369.5, r: 2.1 },
  { id: 'ice_peaks2', kind: 'iceblock', x: -134, z: -420, r: 2.0 },
  { id: 'ice_peaks3', kind: 'iceblock', x: 96, z: -402, r: 1.8 },
];

// 風の種 24（走り輪 8・眠り鈴 8・風車花 8）
export const SEEDS = [
  // 走り輪：start と 5 つの輪（rings）
  { id: 'seed_race_meadow1', type: 'race', region: 'meadow', x: -60, z: 420, rings: [[-84, 400], [-112, 384], [-140, 376], [-166, 384], [-184, 396]], timeLimit: 40 },
  { id: 'seed_race_meadow2', type: 'race', region: 'meadow', x: 96, z: 410, rings: [[120, 430], [148, 444], [176, 440], [196, 420], [214, 398]], timeLimit: 40 },
  { id: 'seed_race_lake', type: 'race', region: 'lake', x: -90, z: 178, rings: [[-126, 160], [-158, 134], [-186, 104], [-206, 70], [-222, 34]], timeLimit: 48 },
  { id: 'seed_race_forest', type: 'race', region: 'forest', x: -360, z: 12, rings: [[-382, 36], [-404, 56], [-430, 76], [-458, 96], [-486, 112]], timeLimit: 48 },
  { id: 'seed_race_canyon', type: 'race', region: 'canyon', x: 300, z: -4, rings: [[322, 14], [338, 46], [350, 80], [368, 104], [398, 114]], timeLimit: 45 },
  { id: 'seed_race_canyon2', type: 'race', region: 'canyon', x: 520, z: -110, rings: [[500, -132], [478, -152], [456, -172], [440, -196], [420, -218]], timeLimit: 45 },
  { id: 'seed_race_peaks', type: 'race', region: 'peaks', x: 30, z: -310, rings: [[50, -314], [72, -316], [94, -324], [116, -332], [138, -338]], timeLimit: 42 },
  { id: 'seed_race_coast', type: 'race', region: 'coast', x: -430, z: 440, rings: [[-452, 426], [-474, 410], [-494, 392], [-512, 372], [-528, 350]], timeLimit: 42 },
  // 眠り鈴：高いところ（dy は地面からの高さ）
  { id: 'seed_bell_meadow', type: 'bell', region: 'meadow', x: -148, z: 322, dy: 7.5 },
  { id: 'seed_bell_start', type: 'bell', region: 'meadow', x: 7.2, z: 547, dy: 6.4 },
  { id: 'seed_bell_forest1', type: 'bell', region: 'forest', x: -322, z: -92, dy: 9 },
  { id: 'seed_bell_forest2', type: 'bell', region: 'forest', x: -528, z: 148, dy: 12 },
  { id: 'seed_bell_arch', type: 'bell', region: 'canyon', x: 381, z: 112, dy: 16.5 },
  { id: 'seed_bell_canyon', type: 'bell', region: 'canyon', x: 446, z: -188, dy: 11 },
  { id: 'seed_bell_peaks', type: 'bell', region: 'peaks', x: -30, z: -356, dy: 8 },
  { id: 'seed_bell_coast', type: 'bell', region: 'coast', x: 490, z: 507, dy: 8.5 },
  // 風車花
  { id: 'seed_pin_meadow1', type: 'pinwheel', region: 'meadow', x: 62, z: 468 },
  { id: 'seed_pin_meadow2', type: 'pinwheel', region: 'meadow', x: -238, z: 348 },
  { id: 'seed_pin_lake', type: 'pinwheel', region: 'lake', x: 128, z: 122 },
  { id: 'seed_pin_forest1', type: 'pinwheel', region: 'forest', x: -272, z: 150 },
  { id: 'seed_pin_forest2', type: 'pinwheel', region: 'forest', x: -476, z: -132 },
  { id: 'seed_pin_canyon', type: 'pinwheel', region: 'canyon', x: 296, z: 148 },
  { id: 'seed_pin_peaks', type: 'pinwheel', region: 'peaks', x: -92, z: -318 },
  { id: 'seed_pin_coast', type: 'pinwheel', region: 'coast', x: 356, z: 508 },
];

// 敵の出現点（約 40 組）
const E = (type, x, z, radius, count, night, region, boss = false) => ({ type, x, z, radius, count, night, region, boss });
export const ENEMIES = [
  // 草原
  E('thornling', -92, 452, 10, 3, false, 'meadow'), E('thornling', 96, 372, 10, 3, false, 'meadow'),
  E('thornling', -178, 330, 12, 3, false, 'meadow'), E('thornling', 60, 236, 10, 3, false, 'meadow'),
  E('husk', 34, 346, 5, 1, false, 'meadow'),                 // 鐘塔のふもと（盾を落とす）
  E('husk', -110, 380, 14, 2, true, 'meadow'), E('husk', 120, 300, 14, 2, true, 'meadow'),
  E('husk', -40, 262, 12, 2, true, 'meadow'), E('wisp', -230, 420, 10, 1, true, 'meadow'),
  E('husk', 240, 440, 12, 1, true, 'meadow'),
  // 湖のまわり
  E('husk', 150, 150, 10, 1, true, 'lake'), E('wisp', -200, 110, 10, 1, true, 'lake'), E('thornling', 222, -120, 10, 3, false, 'lake'),
  // 森
  E('thornling', -318, 70, 10, 3, false, 'forest'), E('wisp', -372, -44, 10, 1, false, 'forest'),
  E('wisp', -420, 60, 10, 2, false, 'forest'), E('husk', -442, -34, 6, 2, false, 'forest'),
  E('wisp', -540, -100, 12, 2, false, 'forest'), E('thornling', -470, 170, 10, 3, false, 'forest'),
  E('husk', -380, 180, 12, 2, true, 'forest'), E('wisp', -300, -130, 12, 2, true, 'forest'),
  E('husk', -560, 40, 12, 2, true, 'forest'),
  // 峡谷
  E('lurker', 400, 40, 14, 1, false, 'canyon'), E('lurker', 520, 90, 16, 1, false, 'canyon'),
  E('lurker', 556, -146, 16, 2, false, 'canyon'), E('lurker', 420, -180, 16, 1, false, 'canyon'),
  E('thornling', 300, 90, 10, 3, false, 'canyon'), E('husk', 462, -30, 6, 2, false, 'canyon'),
  E('husk', 360, -60, 12, 2, true, 'canyon'), E('wisp', 470, 130, 12, 1, true, 'canyon'),
  // 峰
  E('rimeguard', 50, -380, 4, 1, false, 'peaks', true), E('rimeguard', 150, -322, 4, 1, false, 'peaks', true),
  E('husk', -20, -330, 10, 2, false, 'peaks'), E('wisp', -120, -380, 12, 2, false, 'peaks'),
  E('thornling', 90, -300, 10, 3, false, 'peaks'), E('husk', -180, -360, 12, 2, true, 'peaks'),
  E('wisp', 110, -420, 12, 2, true, 'peaks'),
  // 浜
  E('thornling', 380, 500, 10, 3, false, 'coast'), E('husk', 430, 468, 10, 1, true, 'coast'),
  E('thornling', -450, 410, 12, 3, false, 'coast'), E('wisp', -500, 380, 12, 1, true, 'coast'),
  // ボス
  E('stillheart', 0, -40, 6, 1, false, 'lake', true),
];

// 採集点（約 60）。kind: tree = りんごの木（prop あり）、bush = 株（prop あり）、ground = 地面に置くだけ
const G = (itemId, x, z, count, kind) => ({ itemId, x, z, count, kind });
export const GATHER = [
  // りんごの木
  G('apple', 9, 532, 3, 'tree'), G('apple', -44, 462, 3, 'tree'), G('apple', 70, 356, 3, 'tree'), G('apple', -140, 420, 3, 'tree'),
  G('apple', 160, 330, 3, 'tree'), G('apple', -60, 250, 3, 'tree'), G('apple', -236, -92, 3, 'tree'), G('apple', 250, 40, 3, 'tree'),
  G('apple', 330, 450, 3, 'tree'), G('apple', -286, 60, 3, 'tree'), G('apple', -400, 380, 3, 'tree'), G('apple', 120, 190, 3, 'tree'),
  // 灯りきのこ（森・夜の草原）
  G('mushroom', -310, 44, 2, 'ground'), G('mushroom', -356, 96, 2, 'ground'), G('mushroom', -428, 10, 2, 'ground'),
  G('mushroom', -480, 108, 3, 'ground'), G('mushroom', -548, -112, 3, 'ground'), G('mushroom', -572, -134, 3, 'ground'),
  G('mushroom', -520, -60, 2, 'ground'), G('mushroom', -390, -150, 2, 'ground'), G('mushroom', -330, 210, 2, 'ground'),
  G('mushroom', -452, 250, 2, 'ground'), G('mushroom', -250, 20, 1, 'ground'), G('mushroom', -600, 90, 2, 'ground'),
  // 霜いちご（峰）
  G('frostberry', 36, -312, 2, 'bush'), G('frostberry', -40, -340, 2, 'bush'), G('frostberry', 120, -318, 2, 'bush'),
  G('frostberry', 170, -360, 2, 'bush'), G('frostberry', -150, -384, 2, 'bush'), G('frostberry', 74, -410, 2, 'bush'),
  G('frostberry', -80, -300, 2, 'bush'), G('frostberry', 200, -300, 2, 'bush'),
  // 爆ぜ実の株（峡谷）
  G('bomb', 342, 34, 2, 'bush'), G('bomb', 392, 96, 2, 'bush'), G('bomb', 440, 160, 2, 'bush'), G('bomb', 520, 130, 2, 'bush'),
  G('bomb', 540, -120, 2, 'bush'), G('bomb', 410, -170, 2, 'bush'), G('bomb', 300, -60, 2, 'bush'), G('bomb', 470, 40, 2, 'bush'),
  // 石ころ
  G('rock', 4, 526, 3, 'ground'), G('rock', -20, 480, 3, 'ground'), G('rock', 30, 350, 3, 'ground'), G('rock', -180, 392, 3, 'ground'),
  G('rock', 140, 240, 3, 'ground'), G('rock', -290, 40, 3, 'ground'), G('rock', -440, -6, 3, 'ground'), G('rock', 336, 28, 3, 'ground'),
  G('rock', 372, 118, 3, 'ground'), G('rock', 440, -190, 3, 'ground'), G('rock', 24, -292, 3, 'ground'), G('rock', -160, -392, 3, 'ground'),
  G('rock', 410, 462, 3, 'ground'), G('rock', -470, 398, 3, 'ground'),
  // 矢の束
  G('arrow', -446, -12, 5, 'ground'), G('arrow', -514, 122, 5, 'ground'), G('arrow', 444, 424, 5, 'ground'),
  G('arrow', 464, -46, 5, 'ground'), G('arrow', 56, -424, 5, 'ground'), G('arrow', 204, 288, 5, 'ground'),
];

// 地形の大きな形（種によらず固定）。[x, z, 高さ, 広がり σ]
export const HILLS = [
  // 草原
  [0, 552, 23, 46], [52, 326, 15, 40], [-150, 330, 15, 62], [-262, 440, 9, 60], [182, 440, 9, 60],
  [-20, 400, -3, 70], [-60, 262, 5, 50], [110, 520, 6, 55], [-120, 520, 6, 60],
  [200, 320, -6, 70], [290, 500, -8, 80],
  // 森
  [-452, -20, 9, 46], [-560, -120, -9, 46], [-400, -220, 16, 80], [-380, 262, 11, 86], [-610, 60, 7, 70],
  [-520, 130, 3, 40], [-300, 30, -3, 40], [-470, 330, 6, 70],
  // 峡谷（台地は mesa の場で作る）
  [330, 20, -1, 40],
  // 峰
  [62, -440, 22, 40], [150, -340, -4, 46], [-170, -400, -4, 40], [20, -300, -3, 36],
];
// 峰（とがった山）。[x, z, 高さ, 半径]
export const PEAKS = [
  [-60, -560, 166, 205], [-246, -500, 92, 150], [136, -584, 80, 140], [-340, -384, 46, 110], [250, -470, 50, 110],
];
// 台地の場への加算。[x, z, 量, σ]（正 = 台地、負 = 谷底）
export const MESA_BIAS = [
  [488, -52, 0.5, 50], [330, 20, -0.6, 46], [372, 96, -0.55, 62], [540, 150, -0.5, 36],
  [560, -150, -0.6, 44], [430, -200, -0.6, 58], [300, -60, -0.25, 50], [420, 30, -0.3, 30],
  [440, 190, 0.35, 50], [300, 130, 0.3, 40], [520, 40, 0.3, 40], [360, -140, 0.35, 40], [610, -40, 0.3, 50],
];
// 海岸線：方位（22.5° きざみ、0 = 北、時計回り）ごとの島の半径
export const COAST_R = [668, 640, 628, 652, 668, 650, 734, 664, 652, 640, 655, 656, 662, 640, 626, 652];
// 入江 [x, z, 深さ m, σ]
export const COVES = [[512, 404, 150, 38], [-40, 690, 60, 40], [-640, 250, 50, 40]];
