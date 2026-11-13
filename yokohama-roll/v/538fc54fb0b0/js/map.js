// map.js — stylised (compressed) layout of the Yokohama waterfront, in metres.
// x = east, z = south (so north is -z). Land top is y = 0, the sea surface is at SEA_Y.

export const SEA_Y = -1.6;      // water surface
export const SEABED_Y = -7;     // where a big ball rests in the sea
export const SEA_MIN_R = 2.6;   // ball radius needed before it may enter the sea
export const BOUNDS = { x0: -1500, x1: 1750, z0: -1150, z1: 1400 };
export const START = { x: -45, z: -175, yaw: Math.PI * 0.75 }; // 運河パーク (Shinko), looking toward MM

const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

// Land is the union of these polygons.
export const LAND = [
  // mainland: Minato Mirai (north-west) + Sakuragicho + Kannai + Chinatown + Yamashita + Honmoku
  [[-1500, -1150], [-900, -1150], [-900, -760], [-160, -760], [-160, 90], [1100, 90], [1100, 350], [1750, 350], [1750, 1400], [-1500, 1400]],
  rect(-100, -500, 260, -40),     // 新港 (Shinko island: Red Brick, Unga Park)
  rect(300, -300, 380, 95),       // 大さん橋 (Osanbashi pier)
  rect(1250, -1150, 1750, -300),  // 大黒ふ頭 (Daikoku pier)
  rect(-172, -132, -88, -110),    // 汽車道 (Kishamichi bridge)
  rect(-172, -428, -88, -408),    // MM ↔ Shinko north bridge
  rect(198, -52, 238, 96),        // 新港橋 (Shinko ↔ mainland)
];

// Flat ground decoration patches drawn on top of the land (purely visual).
export const PATCHES = [
  // parks (grass)
  { kind: 'park', poly: rect(-95, -300, -5, -55) },        // 運河パーク
  { kind: 'park', poly: rect(-880, -753, -690, -580) },    // 臨港パーク
  { kind: 'park', poly: rect(400, 96, 1095, 188) },        // 山下公園
  { kind: 'park', poly: rect(-300, 330, 60, 590) },        // 横浜公園
  { kind: 'park', poly: rect(-1480, 760, -1200, 1000) },   // west green
  // plazas (paving)
  { kind: 'plaza', poly: rect(0, -440, 255, -120) },       // 赤レンガ広場
  { kind: 'plaza', poly: rect(-170, -132, -90, -110) },    // 汽車道
  { kind: 'plaza', poly: rect(-390, -290, -172, 10) },     // コスモワールド周辺
  { kind: 'plaza', poly: rect(-720, -260, -410, 190) },    // ランドマークプラザ周辺
  { kind: 'plaza', poly: rect(300, -300, 380, 95) },       // 大さん橋
  { kind: 'plaza', poly: rect(240, 96, 398, 188) },        // 象の鼻パーク
  // chinatown paving (reddish)
  { kind: 'china', poly: rect(250, 290, 650, 600) },
];

// Roads (polylines, 14 m wide). Cars drive back and forth along them.
export const ROAD_W = 14;
export const ROADS = [
  [[-1500, 200], [1100, 200]],    // 山下公園通り / 海岸通り
  [[-1500, 700], [1750, 700]],    // 南の大通り
  [[-400, -745], [-400, 200]],    // みなとみらい 縦
  [[-890, -300], [-174, -300]],   // みなとみらい 横
  [[-890, -560], [-174, -560]],   // みなとみらい 北
  [[-900, -1150], [-900, 1400]],  // 西の縦
  [[100, 200], [100, 1400]],      // 関内 縦
  [[760, 200], [760, 1400]],      // 元町・マリンタワー脇
  [[-1500, 1100], [1750, 1100]],  // 南
  [[1100, 450], [1750, 450]],     // 本牧
  [[1300, -1100], [1300, -350]],  // 大黒ふ頭
];

// Named districts — shown as a banner when the ball enters them, also used for scatter tags.
// tags: what kind of small things live here. dens multiplies the base scatter density.
export const DISTRICTS = [
  { name: '運河パーク', poly: rect(-100, -300, 0, -40), tags: ['park', 'plaza', 'waterfront'], dens: 5 },
  { name: '汽車道', poly: rect(-172, -132, -88, -110), tags: ['plaza', 'waterfront'], dens: 2.5 },
  { name: '赤レンガ倉庫', poly: rect(0, -500, 260, -40), tags: ['plaza', 'waterfront'], dens: 2.4 },
  { name: 'コスモワールド', poly: rect(-395, -295, -160, 10), tags: ['plaza'], dens: 1.6 },
  { name: 'ランドマークタワー', poly: rect(-890, -295, -405, 90), tags: ['plaza', 'street'], dens: 1.2 },
  { name: '桜木町', poly: rect(-890, 90, -160, 196), tags: ['street', 'plaza'], dens: 1.0 },
  { name: 'みなとみらい', poly: rect(-890, -760, -160, -295), tags: ['plaza', 'street', 'mm'], dens: 0.8 },
  { name: '臨港パーク', poly: rect(-890, -760, -690, -575), tags: ['park', 'waterfront'], dens: 1.2 },
  { name: '大さん橋', poly: rect(300, -300, 380, 95), tags: ['plaza', 'waterfront'], dens: 1.3 },
  { name: '象の鼻パーク', poly: rect(238, 90, 400, 196), tags: ['plaza', 'waterfront'], dens: 1.5 },
  { name: '山下公園', poly: rect(400, 90, 1100, 196), tags: ['park', 'waterfront'], dens: 1.6 },
  { name: '中華街', poly: rect(250, 280, 650, 610), tags: ['chinatown'], dens: 2.6 },
  { name: '横浜スタジアム', poly: rect(-300, 330, 60, 590), tags: ['park', 'street'], dens: 0.9 },
  { name: '関内', poly: rect(-160, 196, 760, 700), tags: ['street', 'kannai'], dens: 0.7 },
  { name: '元町', poly: rect(650, 196, 1100, 700), tags: ['street', 'kannai'], dens: 0.6 },
  { name: '本牧', poly: rect(1100, 350, 1750, 1400), tags: ['street', 'port'], dens: 0.35 },
  { name: '大黒ふ頭', poly: rect(1250, -1150, 1750, -300), tags: ['port'], dens: 0.2 },
  { name: '横浜のまち', poly: rect(-1500, -1150, 1750, 1400), tags: ['street'], dens: 0.22 },
];

// Hand-placed landmarks: [id, x, z, rotationY, extra]
// extra.float: sits in the sea; extra.y: base height; extra.noBuild: keep free of filler
const H = Math.PI / 2;
export const LANDMARKS = [
  ['landmark_tower', -640, -140, 0],
  ['queens_square', -640, -430, 0],
  ['convention', -470, -670, 0],
  ['sail_hotel', -250, -690, Math.PI * 0.25],
  ['ferris_wheel', -260, -210, H * 0.6],
  ['coaster', -300, -60, 0],
  ['museum', -270, -440, 0],
  ['mm_tower', -560, -650, 0, { variant: 1 }],
  ['red_brick_2', 120, -360, 0],
  ['red_brick_1', 120, -240, 0],
  ['sakuragicho_station', -570, 140, 0],
  ['ropeway_tower', -470, 60, Math.atan2(410, -320)],
  ['ropeway_tower', -60, -260, Math.atan2(410, -320)],
  ['sailing_ship', -40, 30, H, { float: true, sink: 4 }],
  ['cruise_ship', 418, -110, Math.PI, { float: true, sink: 6 }],
  ['old_liner', 760, 62, H, { float: true, sink: 5 }],
  ['marine_tower', 660, 255, 0],
  ['classic_hotel', 520, 245, 0],
  ['queen_tower', 160, 150, 0],
  ['king_tower', 30, 265, 0],
  ['jack_tower', -90, 260, 0],
  ['stadium', -130, 460, 0],
  ['chinatown_gate', 258, 440, H],
  ['chinatown_gate', 642, 440, H],
  ['chinatown_gate', 450, 288, 0],
  ['chinatown_gate', 450, 602, 0],
  ['kanteibyo', 520, 485, Math.PI],
  ['bay_bridge', 1450, 0, H, { y: 0 }],
  ['crane', 1320, -330, 0],
  ['crane', 1420, -330, 0],
  ['crane', 1520, -330, 0],
];

// Ropeway cable: cabins travel along this line at the given height.
export const ROPEWAY = { a: [-470, 60], b: [-60, -260], y: 38.2, cabins: 8, gap: 5.6 };

// Chinatown street grid (pedestrian). Buildings line both sides.
export const CHINA_STREETS = {
  ew: [340, 440, 530],          // z of east-west streets
  ns: [330, 450, 560],          // x of north-south alleys
  x0: 255, x1: 645, z0: 292, z1: 598,
};

// Areas filled with filler buildings: [x0, z0, x1, z1, protoIds[], spacing]
export const BUILD_BLOCKS = [
  [-890, -560, -405, -305, ['mm_tower', 'office'], 95],
  [-395, -555, -175, -305, ['mm_tower', 'office', 'museum'], 90],
  [-890, -290, -720, 90, ['office', 'mm_tower'], 85],
  [-1500, -1150, -910, 1400, ['mansion', 'office', 'house', 'house', 'brick_building'], 70],
  [-890, 210, -310, 690, ['office', 'mansion', 'brick_building', 'house'], 62],
  [-300, 600, 90, 690, ['office', 'brick_building'], 60],
  [110, 210, 245, 690, ['office', 'brick_building', 'mansion'], 55],
  [250, 610, 750, 690, ['mansion', 'office', 'house'], 55],
  [770, 210, 1100, 690, ['mansion', 'house', 'office'], 55],
  [-1500, 710, 1750, 1090, ['house', 'house', 'mansion', 'office'], 65],
  [-1500, 1110, 1750, 1400, ['house', 'house', 'mansion'], 70],
  [1110, 360, 1750, 690, ['warehouse', 'container_stack', 'mansion'], 80],
  [1260, -1140, 1740, -420, ['warehouse', 'container_stack', 'container_stack'], 75],
];

// Where boats may be spawned (they then wander, staying on water).
export const SEA_AREAS = [
  rect(-150, -1100, 1700, 80),
];

// helpers -------------------------------------------------------------------
export function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function isLand(x, z) {
  for (const p of LAND) if (pointInPoly(x, z, p)) return true;
  return false;
}

export function districtAt(x, z) {
  for (const d of DISTRICTS) if (pointInPoly(x, z, d.poly)) return d;
  return null;
}

// distance from point to a road polyline segment set; returns {d, road, t}
export function nearestRoad(x, z) {
  let best = { d: Infinity, road: -1 };
  ROADS.forEach((pts, ri) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const dx = bx - ax, dz = bz - az;
      const L2 = dx * dx + dz * dz;
      let t = ((x - ax) * dx + (z - az) * dz) / L2;
      t = Math.max(0, Math.min(1, t));
      const px = ax + dx * t, pz = az + dz * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < best.d) best = { d, road: ri, seg: i, t };
    }
  });
  return best;
}

export function onRoad(x, z, margin = 0) {
  return nearestRoad(x, z).d < ROAD_W / 2 + margin;
}

export function inChinaStreet(x, z, margin = 0) {
  const c = CHINA_STREETS;
  if (x < c.x0 || x > c.x1 || z < c.z0 || z > c.z1) return false;
  for (const sz of c.ew) if (Math.abs(z - sz) < 7 + margin) return true;
  for (const sx of c.ns) if (Math.abs(x - sx) < 5 + margin) return true;
  return false;
}
