// kanto_map.js — stylised Kanto plain for the middle stage. Units: metres.
// Origin = Yokohama (35.45N, 139.64E); x = east, z = south.

const LAT0 = 35.45, LON0 = 139.64;
const KX = 90600, KZ = 111000; // metres per degree (lon at ~35.5N, lat)
export const ll = (lat, lon) => [(lon - LON0) * KX, -(lat - LAT0) * KZ];

export const BOUNDS = { x0: ll(0, 138.87)[0], x1: ll(0, 140.52)[0], z0: ll(36.32, 0)[1], z1: ll(34.86, 0)[1] };
export const SEA_Y = -14;
export const SEABED_Y = -90;
export const START = (() => { const [x, z] = ll(35.442, 139.618); return { x, z, yaw: Math.atan2(1, -1.6) }; })(); // look toward Tokyo (NE)

// One sea polygon: Tokyo Bay → Uraga channel → Sagami Bay → Pacific → around Bōsō → back up the bay.
const SEA_LL = [
  [35.665, 139.795], [35.625, 139.772], [35.585, 139.775], [35.555, 139.795], [35.530, 139.760], [35.505, 139.705],
  [35.470, 139.668], [35.440, 139.655], [35.400, 139.640], [35.340, 139.640], [35.290, 139.675], [35.252, 139.740],
  [35.195, 139.690], [35.140, 139.625], [35.175, 139.600], [35.230, 139.585], [35.265, 139.575], [35.305, 139.545],
  [35.310, 139.490], [35.318, 139.400], [35.305, 139.320], [35.265, 139.200], [35.235, 139.150], [35.150, 139.125],
  [35.080, 139.085], [34.980, 139.110], [34.860, 139.130], [34.860, 140.520], [35.470, 140.520], [35.390, 140.450],
  [35.250, 140.400], [35.140, 140.300], [35.050, 140.110], [34.930, 139.960], [34.920, 139.880], [34.985, 139.830],
  [35.100, 139.820], [35.200, 139.825], [35.305, 139.790], [35.380, 139.905], [35.430, 139.950], [35.520, 140.065],
  [35.590, 140.100], [35.640, 140.040], [35.680, 139.985], [35.650, 139.870], [35.665, 139.830],
];
export const SEA = SEA_LL.map(([a, b]) => ll(a, b));

export function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
export const isSea = (x, z) => pointInPoly(x, z, SEA);
export const isLand = (x, z) => x > BOUNDS.x0 && x < BOUNDS.x1 && z > BOUNDS.z0 && z < BOUNDS.z1 && !isSea(x, z);

// Regions: [name, lat, lon, radius km, tags, label?]. First match wins, so small/special ones come first.
export const REGIONS = [
  ['横浜', 35.452, 139.625, 6, ['city'], true],
  ['川崎', 35.535, 139.705, 4.5, ['city', 'industrial']],
  ['京浜工業地帯', 35.505, 139.755, 3.2, ['industrial']],
  ['東京', 35.685, 139.745, 12, ['city'], true],
  ['京葉工業地域', 35.525, 140.040, 5, ['industrial', 'coast']],
  ['千葉', 35.610, 140.115, 9, ['city', 'suburb'], true],
  ['さいたま', 35.880, 139.645, 10, ['city', 'suburb'], true],
  ['多摩', 35.640, 139.420, 13, ['suburb'], true],
  ['湘南', 35.335, 139.430, 9, ['suburb', 'coast'], true],
  ['三浦半島', 35.230, 139.650, 9, ['suburb', 'farm', 'coast'], true],
  ['筑波', 36.170, 140.090, 18, ['farm', 'mountain'], true],
  ['丹沢', 35.470, 139.160, 14, ['mountain'], true],
  ['箱根', 35.230, 139.030, 11, ['mountain'], true],
  ['房総半島', 35.220, 140.060, 30, ['farm', 'mountain', 'coast'], true],
  ['成田', 35.770, 140.380, 12, ['farm', 'suburb'], true],
  ['秩父の山', 35.990, 139.100, 22, ['mountain'], true],
  ['北関東', 36.200, 139.700, 30, ['farm', 'suburb'], true],
  ['関東平野', 35.800, 139.800, 200, ['farm', 'suburb']],
].map(([name, lat, lon, rk, tags, label]) => { const [x, z] = ll(lat, lon); return { name, x, z, r: rk * 1000, tags, label: !!label }; });

export function regionAt(x, z) {
  if (isSea(x, z)) {
    const [bx, bz] = ll(35.35, 139.80);
    if (Math.hypot(x - bx, z - bz) < 32000 && z < ll(35.25, 0)[1]) return { name: '東京湾', tags: ['bay'] };
    return { name: x < 0 ? '相模湾' : '太平洋', tags: ['bay'] };
  }
  for (const r of REGIONS) if (Math.hypot(x - r.x, z - r.z) < r.r) return r;
  return REGIONS[REGIONS.length - 1];
}

// Rail lines (trains run back and forth along them). Lists of [lat, lon].
export const RAILS = [
  { kind: 'shinkansen', pts: [[35.681, 139.767], [35.629, 139.739], [35.507, 139.617], [35.400, 139.420], [35.256, 139.155], [35.150, 138.870]] },
  { kind: 'shinkansen', pts: [[35.681, 139.767], [35.750, 139.720], [35.906, 139.624], [36.100, 139.700], [36.320, 139.900]] },
  { kind: 'train', pts: [[35.681, 139.767], [35.629, 139.739], [35.531, 139.697], [35.466, 139.622], [35.400, 139.533], [35.339, 139.487], [35.327, 139.350], [35.256, 139.155]] },
  { kind: 'train', pts: [[35.466, 139.622], [35.400, 139.630], [35.335, 139.625], [35.280, 139.670], [35.180, 139.640]] },
  { kind: 'train', pts: [[35.681, 139.767], [35.690, 139.700], [35.700, 139.580], [35.656, 139.339], [35.640, 139.270]] },
  { kind: 'train', pts: [[35.681, 139.767], [35.700, 139.900], [35.690, 140.000], [35.613, 140.113], [35.700, 140.250], [35.776, 140.390]] },
  { kind: 'train', pts: [[35.613, 140.113], [35.500, 140.000], [35.380, 139.925], [35.200, 139.850], [34.990, 139.860]] },
  { kind: 'train', pts: [[35.681, 139.767], [35.730, 139.850], [35.900, 139.950], [36.080, 140.110]] },
  { kind: 'train', pts: [[35.690, 139.700], [35.730, 139.710], [35.732, 139.770], [35.700, 139.775], [35.681, 139.767], [35.640, 139.740], [35.658, 139.700], [35.690, 139.700]] },
].map((r) => ({ kind: r.kind, pts: r.pts.map(([a, b]) => ll(a, b)) }));

// Expressways (drawn only).
export const HIGHWAYS = [
  [[35.68, 139.77], [35.60, 139.74], [35.53, 139.74], [35.47, 139.66], [35.40, 139.58], [35.33, 139.40], [35.26, 139.16]],
  [[35.68, 139.77], [35.66, 139.60], [35.62, 139.40], [35.55, 139.25], [35.36, 138.93]],
  [[35.68, 139.77], [35.80, 139.70], [36.00, 139.60], [36.32, 139.55]],
  [[35.68, 139.77], [35.72, 139.95], [35.78, 140.30]],
  [[35.55, 139.78], [35.46, 139.875], [35.40, 139.93]],
  [[35.61, 140.11], [35.45, 140.00], [35.30, 139.90]],
].map((pts) => pts.map(([a, b]) => ll(a, b)));

// Rivers (drawn only): [width m, pts]
export const RIVERS = [
  [260, [[35.53, 139.77], [35.58, 139.68], [35.64, 139.50], [35.70, 139.30], [35.78, 139.10]]],
  [300, [[35.64, 139.86], [35.72, 139.84], [35.80, 139.78], [35.90, 139.62], [36.05, 139.45], [36.25, 139.25]]],
  [380, [[35.73, 140.86], [35.85, 140.50], [35.93, 140.20], [36.02, 139.90], [36.15, 139.60], [36.32, 139.30]]],
  [220, [[35.31, 139.37], [35.40, 139.36], [35.52, 139.33], [35.60, 139.25], [35.65, 139.10]]],
  [160, [[35.68, 139.89], [35.75, 139.88], [35.85, 139.86], [35.95, 139.84]]],
].map(([w, pts]) => [w, pts.map(([a, b]) => ll(a, b))]);

// Hand-placed landmarks: [id, lat, lon, rotY]
export const LANDMARKS = [
  ['yokohama_mm', 35.459, 139.636, Math.PI / 2],
  ['tokyo_tower', 35.6586, 139.7454, 0],
  ['skytree', 35.7101, 139.8107, 0],
  ['tokyo_station', 35.6812, 139.7671, Math.PI / 2],
  ['kokkai', 35.6759, 139.7448, Math.PI / 2],
  ['tocho', 35.6896, 139.6905, Math.PI / 2],
  ['shinjuku_towers', 35.6940, 139.6990, 0],
  ['shibuya', 35.6595, 139.7005, 0.4],
  ['kaminarimon', 35.7111, 139.7964, 0],
  ['tokyo_dome', 35.7056, 139.7519, 0],
  ['rainbow_bridge', 35.6365, 139.7633, 0.62],
  ['odaiba_wheel', 35.6265, 139.7826, 0.3],
  ['imperial_palace', 35.6852, 139.7528, 0],
  ['haneda', 35.5494, 139.7798, 0.2],
  ['narita', 35.7720, 140.3929, 0.6],
  ['umihotaru', 35.4637, 139.8752, -0.8],
  ['theme_park', 35.6329, 139.8804, 0.5],
  ['daibutsu', 35.3167, 139.5358, Math.PI],
  ['enoshima', 35.2994, 139.4803, Math.PI],
  ['mt_takao', 35.6251, 139.2437, 0],
  ['mt_tsukuba', 36.2253, 140.1067, 0],
  ['tanzawa', 35.4700, 139.1600, 0.35],
  ['hakone', 35.2300, 139.0300, 0],
].map(([id, lat, lon, rot]) => { const [x, z] = ll(lat, lon); return { id, x, z, rot }; });

export const LABELS = [
  ['横浜', 35.45, 139.63], ['川崎', 35.53, 139.70], ['東京', 35.69, 139.76], ['千葉', 35.61, 140.11], ['さいたま', 35.88, 139.64],
  ['東京湾', 35.47, 139.85], ['相模湾', 35.18, 139.40], ['筑波山', 36.22, 140.10], ['箱根', 35.23, 139.03], ['成田', 35.77, 140.39],
  ['房総半島', 35.20, 140.07], ['湘南', 35.33, 139.43],
].map(([n, lat, lon]) => { const [x, z] = ll(lat, lon); return [n, x, z]; });

// Paint the ground: land colours by region, rivers, rails, highways; the sea is left transparent.
export function drawGround(ctx, W, H) {
  const B = BOUNDS;
  const sx = W / (B.x1 - B.x0), sz = H / (B.z1 - B.z0);
  const P = (x, z) => [(x - B.x0) * sx, (z - B.z0) * sz];
  const path = (pts, close) => { ctx.beginPath(); pts.forEach(([x, z], i) => { const [px, pz] = P(x, z); i ? ctx.lineTo(px, pz) : ctx.moveTo(px, pz); }); if (close) ctx.closePath(); };
  // base: countryside patchwork
  ctx.fillStyle = '#9cc46e';
  ctx.fillRect(0, 0, W, H);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const fieldCols = ['#a8cf72', '#c4d67a', '#8fbf63', '#d8cf7e', '#b7d27c', '#9fca6b'];
  for (let i = 0; i < 9000; i++) {
    const x = rnd() * W, y = rnd() * H, w = 6 + rnd() * 26, h = 6 + rnd() * 26;
    ctx.fillStyle = fieldCols[(rnd() * fieldCols.length) | 0];
    ctx.fillRect(x, y, w, h);
  }
  // regions: mountains dark green, cities grey-beige with a block grid
  const sorted = [...REGIONS].reverse(); // big first, so small specific ones paint on top
  for (const r of sorted) {
    if (r.name === '関東平野') continue;
    const [cx, cz] = P(r.x, r.z);
    const rad = r.r * sx;
    let col = null;
    if (r.tags.includes('mountain')) col = r.tags.includes('farm') ? 'rgba(92,140,70,0.55)' : 'rgba(70,118,62,0.85)';
    else if (r.tags.includes('city')) col = 'rgba(200,196,186,0.92)';
    else if (r.tags.includes('industrial')) col = 'rgba(176,176,176,0.95)';
    else if (r.tags.includes('suburb')) col = 'rgba(214,206,182,0.75)';
    if (!col) continue;
    const g = ctx.createRadialGradient(cx, cz, rad * 0.35, cx, cz, rad);
    g.addColorStop(0, col); g.addColorStop(1, col.replace(/[\d.]+\)$/, '0)'));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cz, rad, 0, Math.PI * 2); ctx.fill();
    if (r.tags.includes('city') || r.tags.includes('suburb')) {
      // street grid flecks
      ctx.fillStyle = r.tags.includes('city') ? 'rgba(150,146,140,0.55)' : 'rgba(170,160,140,0.4)';
      const n = Math.round(rad * rad * 0.05);
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * rad * 0.9;
        ctx.fillRect(cx + Math.cos(a) * d, cz + Math.sin(a) * d, 2 + rnd() * 4, 2 + rnd() * 4);
      }
    }
  }
  // rivers
  ctx.strokeStyle = '#4b97c9'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [w, pts] of RIVERS) { ctx.lineWidth = Math.max(2, w * sx); path(pts); ctx.stroke(); }
  // highways
  ctx.strokeStyle = 'rgba(245,240,230,0.9)'; ctx.lineWidth = Math.max(2, 90 * sx);
  for (const pts of HIGHWAYS) { path(pts); ctx.stroke(); }
  // rails
  for (const r of RAILS) {
    ctx.strokeStyle = r.kind === 'shinkansen' ? 'rgba(60,90,160,0.85)' : 'rgba(80,70,70,0.8)';
    ctx.lineWidth = Math.max(1.5, (r.kind === 'shinkansen' ? 60 : 40) * sx);
    path(r.pts); ctx.stroke();
  }
  // cut out the sea (transparent), with a light beach rim
  ctx.save();
  ctx.lineWidth = Math.max(3, 240 * sx); ctx.strokeStyle = '#e9dcb5';
  path(SEA, true); ctx.stroke();
  ctx.globalCompositeOperation = 'destination-out';
  path(SEA, true); ctx.fill();
  ctx.restore();
}
