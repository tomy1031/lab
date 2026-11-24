// ui/trap-art.js — 2D paper diagrams for the knowledge hand-work of DESIGN §26 (traps, fire lay, coconut, knot, signals, track cards).
// Pure canvas drawing, no game imports. Logical canvas 800×500, diagram box {x:40,y:30,w:720,h:450} (aspect 1.6).
//
// GEOMETRY CONVENTIONS
//  • every coordinate is normalized 0..1 of the box (x by box.w, y by box.h). lineToCanvas(pt, box) maps it.
//  • every rect {x,y,w,h[,rot]} is CENTRED on (x,y); w,h are fractions of box.w / box.h of the UNROTATED rect; rot is a canvas
//    rotation (radians, clockwise, around the centre). For a stick, w = length, h = thickness, rot = direction start→end.
//  • every circle radius `r` is a fraction of box.h (canvas radius = r * box.h), so loops stay round.
//  • angles are canvas angles (0 = to the right/east, +π/2 = down).
//  • K (knowledge) = state.K: 0 parts only · 1 + step numbers / names · 2 + dotted targets, arrows, rulers · 3 + "ideal band" marks.
//  • No red anywhere; no animals are ever drawn (traps look identical for view 'normal' | 'mild' | 'skip').

export const PAPER = '#f7f0dd', INK = '#2a2923', TEAL = '#1f7f86', ORANGE = '#e8743b', LEAF = '#6aa35a';
let ACT = ORANGE; // active-target colour (amber in 'mild' so no pixel ever turns reddish)
const LEAF_D = '#4a8040', WOOD = '#b07a45', WOOD_D = '#8a5a30', WOOD_L = '#c99a63', STONE = '#8d8a80', STONE_D = '#6f6c64', STONE_L = '#b9b5a8';
const CORD = '#c9a96a', CORD_D = '#9c8044', WATER = '#9bd3dc', WATER_D = '#6fb6c4', SOIL = '#cdb78a', SOIL_D = '#a98f63', SAND = '#efe3b9';
const FONT = '"Zen Maru Gothic","Hiragino Maru Gothic ProN","Noto Sans JP",sans-serif';

const W = 720, H = 450; // reference size of the drawing box (all drawing happens in this space)
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
const rng = (seed) => { let s = (seed >>> 0) || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
export const lineToCanvas = (pt, box) => [box.x + pt[0] * box.w, box.y + pt[1] * box.h];

/** stick slot from normalized end points; thick in reference px */
function stick(x0, y0, x1, y1, thick) {
  const dx = (x1 - x0) * W, dy = (y1 - y0) * H;
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: Math.hypot(dx, dy) / W, h: thick / H, rot: Math.atan2(dy, dx) };
}
/** radial stick (plan view): centre (cx,cy) normalized, angle, inner radius, length, thickness (px) */
function radial(cx, cy, ang, r0, len, thick) {
  const X = cx * W, Y = cy * H, c = Math.cos(ang), s = Math.sin(ang);
  return stick((X + c * r0) / W, (Y + s * r0) / H, (X + c * (r0 + len)) / W, (Y + s * (r0 + len)) / H, thick);
}
const role = (s, r) => ({ ...s, role: r });

// ---------------------------------------------------------------- geometry (exported)
const DF_ROCK_A = 0.5; // rock angle (rad) when fully raised
const dfUnder = (x) => 0.76 - (x - 0.18) * W * Math.tan(DF_ROCK_A) / H; // y of the rock underside (lift 1) at x

export const GEO = {
  snare: {
    ground: 0.76,                                   // y of the ground line
    stakeX: 0.80,
    stakeTargets: [[0.80, 0.427], [0.80, 0.513], [0.80, 0.60]], // stake top after hit 1,2,3 (stake 1/3, 2/3, 1)
    poleTip: [0.17, 0.10],                          // sapling tip when upright (grab it here)
    holdAnchor: [0.36, 0.30],                       // sapling tip when pulled down (hold the hand here)
    loopZones: {                                    // loop centre + radius (r × box.h). 1 cm = 0.02 box.h
      bird: { x: 0.50, y: 0.54, r: 0.12 },          // bottom 5 cm above ground, 12 cm across
      small: { x: 0.50, y: 0.64, r: 0.08 },         // bottom 2 cm above ground, 8 cm across
    },
    loopStart: { x: 0.50, y: 0.34, r: 0.15 },       // where the loop hangs before you drag it (too high, too big)
    trigger: [[0.67, 0.66], [0.72, 0.655], [0.77, 0.648], [0.80, 0.642]], // d = 0 at the free end of the trigger stick → d = 1 deep in the stake notch
    triggerBand: [0.35, 0.65],
    baitSlot: { x: 0.615, y: 0.715, w: 0.07, h: 0.085 },
    ruler: { x: 0.885, cmH: 0.02 },                 // finger/fist ruler column (K2+); 1 cm = 0.02 box.h
  },
  deadfall: {
    rockPivot: [0.18, 0.76],                        // lower corner of the slab that stays on the ground
    rockAngle: DF_ROCK_A,                           // rock angle at rockLift = 1 (rock rotates up around the pivot)
    holdAnchor: [0.69, 0.30],                       // where the hand lifts / lowers the free end (at rockLift 1)
    slots: [                                        // final positions of the figure-4, in placing order
      { id: 'upright', ...stick(0.52, 0.76, 0.52, 0.455, 16) },
      { id: 'diagonal', ...stick(0.585, dfUnder(0.585), 0.705, 0.575, 15) },
      { id: 'bait', ...stick(0.52, 0.575, 0.705, 0.575, 14) },   // the bait STICK (the food goes in baitSlot)
    ],
    partsTray: [[0.22, 0.90], [0.50, 0.90], [0.78, 0.90]],      // centres of the 3 sticks lying before (horizontal, rot 0, same w/h as slots)
    baitSlot: { x: 0.725, y: 0.64, w: 0.065, h: 0.10 },         // the food, hung at the end of the bait stick
    notchLines: [                                               // one short line per stick, drawn on the sticks in the tray
      [[0.307, 0.855], [0.307, 0.945]],
      [[0.575, 0.855], [0.600, 0.945]],
      [[0.745, 0.855], [0.765, 0.945]],
    ],
  },
  fish_trap: {
    flowDir: 0,                                     // the water goes to the right
    rightAngle: 0,                                  // mouth should face downstream
    trapSlot: { x: 0.50, y: 0.52, w: 0.26, h: 0.17 },
    stoneSlots: [{ x: 0.50, y: 0.355, w: 0.07, h: 0.10 }, { x: 0.50, y: 0.685, w: 0.07, h: 0.10 }, { x: 0.335, y: 0.52, w: 0.07, h: 0.10 }],
    baitCenter: [0.48, 0.52],
    ropeLine: [[0.37, 0.54], [0.34, 0.66], [0.31, 0.80], [0.30, 0.91]],
    bankStake: [0.30, 0.91],
    stonePile: [[0.12, 0.08], [0.19, 0.11], [0.26, 0.07]],    // where the spare stones lie (on the bank)
  },
  crab_pot: {
    flowDir: 0,                                     // ebb: the water drains to the right (to the sea)
    rightAngle: 0,
    trapSlot: { x: 0.62, y: 0.50, w: 0.22, h: 0.16 },
    stoneSlots: [{ x: 0.62, y: 0.375, w: 0.065, h: 0.095 }, { x: 0.62, y: 0.625, w: 0.065, h: 0.095 }, { x: 0.495, y: 0.50, w: 0.065, h: 0.095 }],
    baitCenter: [0.60, 0.50],
    ropeLine: [[0.51, 0.53], [0.44, 0.68], [0.36, 0.82], [0.30, 0.92]],
    bankStake: [0.30, 0.92],
    stonePile: [[0.80, 0.91], [0.87, 0.88], [0.93, 0.92]],
  },
  firelay: {
    windFrom: Math.PI,                              // wind comes from the left; the mouth of the lay is opened on that side (K3)
    types: {
      teepee: {                                     // side view
        slots: [
          role({ x: 0.50, y: 0.70, w: 0.10, h: 0.085, rot: 0 }, 'tinder'),
          role(stick(0.64, 0.78, 0.50, 0.40, 11), 'pencil'), role(stick(0.36, 0.78, 0.49, 0.41, 11), 'pencil'), role(stick(0.50, 0.72, 0.50, 0.38, 11), 'pencil'),
          role(stick(0.73, 0.81, 0.51, 0.44, 17), 'finger'), role(stick(0.27, 0.81, 0.49, 0.45, 17), 'finger'),
        ],
        gapMark: [[0.30, 0.875], [0.36, 0.875]],  // the "leave a gap" ruler (K2)
        gapLabel: [0, -16],
        mouth: [0.40, 0.72],                        // windward opening (K3)
      },
      logcabin: {                                   // plan view
        slots: [
          role({ x: 0.50, y: 0.54, w: 0.09, h: 0.14, rot: 0 }, 'tinder'),
          role(stick(0.32, 0.36, 0.68, 0.36, 11), 'pencil'), role(stick(0.32, 0.72, 0.68, 0.72, 11), 'pencil'), role(stick(0.66, 0.32, 0.66, 0.76, 11), 'pencil'),
          role(stick(0.37, 0.435, 0.62, 0.435, 17), 'finger'), role(stick(0.37, 0.645, 0.62, 0.645, 17), 'finger'),
        ],
        gapMark: [[0.33, 0.435], [0.33, 0.36]], gapLabel: [-78, 0],
        mouth: [0.28, 0.54],
      },
      star: {                                       // plan view
        slots: [
          role({ x: 0.50, y: 0.54, w: 0.085, h: 0.135, rot: 0 }, 'tinder'),
          role(radial(0.50, 0.54, -0.785, 40, 108, 11), 'pencil'), role(radial(0.50, 0.54, 0, 40, 108, 11), 'pencil'), role(radial(0.50, 0.54, 0.785, 40, 108, 11), 'pencil'),
          role(radial(0.50, 0.54, -2.0, 40, 98, 17), 'finger'), role(radial(0.50, 0.54, 2.0, 40, 98, 17), 'finger'),
        ],
        gapMark: [[0.639, 0.54], [0.598, 0.697]], gapLabel: [66, 6],
        mouth: [0.36, 0.54],
      },
    },
  },
  coconut: {
    center: [0.50, 0.52],
    seams: [                                        // 3 husking lines, top → bottom
      [[0.50, 0.20], [0.44, 0.30], [0.405, 0.44], [0.405, 0.60], [0.44, 0.74], [0.50, 0.84]],
      [[0.50, 0.20], [0.49, 0.35], [0.50, 0.52], [0.51, 0.68], [0.50, 0.84]],
      [[0.50, 0.20], [0.56, 0.30], [0.595, 0.44], [0.595, 0.60], [0.56, 0.74], [0.50, 0.84]],
    ],
    eyes: [[0.455, 0.345], [0.545, 0.345], [0.50, 0.29]],     // visible once the husk is off
    softEye: 0,                                     // index of the soft eye
    equator: [[0.356, 0.52], [0.50, 0.582], [0.644, 0.52], [0.50, 0.458]],  // 4 strike points around the middle (go round)
  },
  knot: {
    standing: [0.53, 0.0],                          // x of the standing line (it runs down from the top)
    wrapCenter: [0.53, 0.40],                       // coils are centred here (n coils, 16 px apart, tight 11 px)
    loopSlot: { x: 0.585, y: 0.585, w: 0.075, h: 0.10 },      // the small loop by the hook eye: the tag end goes through it
    eye: [0.50, 0.66],
    tag: [0.64, 0.45],                              // free end of the tag line before it is threaded
  },
  sos: {
    tideLine: 0.74,                                 // high-tide line: letters go ABOVE it
    letterSlots: [{ x: 0.58, y: 0.22, w: 0.06, h: 0.095 }, { x: 0.44, y: 0.27, w: 0.06, h: 0.095 }, { x: 0.50, y: 0.38, w: 0.06, h: 0.095 },
      { x: 0.56, y: 0.49, w: 0.06, h: 0.095 }, { x: 0.42, y: 0.54, w: 0.06, h: 0.095 }],
    colorChoices: ['dark', 'light', 'seaweed'],
    piles: [[0.86, 0.22], [0.86, 0.40], [0.86, 0.58]],         // sample piles for the colour choice, same order as colorChoices
  },
  signal: {
    coreSlots: [stick(0.29, 0.80, 0.41, 0.40, 14), stick(0.53, 0.80, 0.39, 0.41, 14), stick(0.35, 0.85, 0.40, 0.39, 14), stick(0.46, 0.85, 0.405, 0.40, 14)],
    greenPile: { x: 0.79, y: 0.74, w: 0.26, h: 0.22 },
    nest: [0.40, 0.80],                             // tinder nest at the foot of the cone
  },
};

// ---------------------------------------------------------------- drawing helpers (reference space W×H)
const N = (p) => [p[0] * W, p[1] * H];
function txt(ctx, s, x, y, o = {}) {
  ctx.save(); ctx.font = `${o.weight || 700} ${o.size || 15}px ${FONT}`; ctx.textAlign = o.align || 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = o.halo || PAPER; ctx.strokeText(s, x, y);
  ctx.fillStyle = o.color || INK; ctx.fillText(s, x, y); ctx.restore();
}
function badge(ctx, x, y, n, active) {
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, 12, 0, 7); ctx.fillStyle = active ? ACT : TEAL; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = PAPER; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.font = `700 15px ${FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(n), x, y + 1); ctx.restore();
}
function ringMark(ctx, x, y, r, color) {
  ctx.save(); ctx.setLineDash([6, 5]); ctx.lineWidth = 2.6; ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); ctx.restore();
}
function rectMark(ctx, s, color, a = 0.10) {
  ctx.save(); ctx.translate(s.x * W, s.y * H); ctx.rotate(s.rot || 0);
  const w = s.w * W, h = s.h * H;
  ctx.beginPath(); ctx.roundRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, 6); ctx.globalAlpha = a; ctx.fillStyle = color; ctx.fill(); ctx.globalAlpha = 1;
  ctx.setLineDash([6, 5]); ctx.lineWidth = 2.4; ctx.strokeStyle = color; ctx.stroke(); ctx.restore();
}
function arrow(ctx, x0, y0, x1, y1, color, w = 3, dash = false) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
  if (dash) ctx.setLineDash([7, 6]);
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - 13 * Math.cos(a - 0.42), y1 - 13 * Math.sin(a - 0.42)); ctx.lineTo(x1 - 13 * Math.cos(a + 0.42), y1 - 13 * Math.sin(a + 0.42)); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function leafShape(ctx, x, y, len, rot, fill = LEAF, stroke = LEAF_D) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * 0.5, -len * 0.4, len, 0); ctx.quadraticCurveTo(len * 0.5, len * 0.4, 0, 0); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 1.8; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(len * 0.1, 0); ctx.lineTo(len * 0.85, 0); ctx.lineWidth = 1.2; ctx.stroke(); ctx.restore();
}
function tuft(ctx, x, y, s = 1, col = LEAF_D) {
  ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
  for (const a of [-0.5, -0.2, 0.1, 0.4]) { ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + a * 14 * s, y - 14 * s, x + a * 26 * s, y - 24 * s); ctx.stroke(); }
  ctx.restore();
}
function stoneShape(ctx, x, y, rx, ry, rot = 0, fill = STONE) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.beginPath(); ctx.moveTo(-rx, 0); ctx.bezierCurveTo(-rx, -ry * 1.1, rx * 0.2, -ry * 1.25, rx, -ry * 0.1); ctx.bezierCurveTo(rx * 1.05, ry * 0.9, -rx * 0.4, ry * 1.1, -rx, 0); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.beginPath(); ctx.arc(-rx * 0.25, -ry * 0.35, Math.min(rx, ry) * 0.35, Math.PI * 1.1, Math.PI * 1.7); ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.stroke();
  ctx.restore();
}
/** a stick centred at 0,0 lying along +x */
function woodBar(ctx, len, th, fill = WOOD, notchAt = null) {
  ctx.beginPath(); ctx.roundRect(-len / 2, -th / 2, len, th, th * 0.45); ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = 2.4; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-len * 0.38, -th * 0.12); ctx.lineTo(-len * 0.1, -th * 0.12); ctx.moveTo(len * 0.05, th * 0.18); ctx.lineTo(len * 0.36, th * 0.18);
  ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(42,41,35,.35)'; ctx.stroke();
  if (notchAt) for (const nx of [].concat(notchAt)) { ctx.beginPath(); ctx.moveTo(nx - th * 0.45, -th / 2); ctx.lineTo(nx, th * 0.05); ctx.lineTo(nx + th * 0.45, -th / 2); ctx.fillStyle = PAPER; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke(); }
}
function slotStick(ctx, s, fill = WOOD, notchAt = null) {
  ctx.save(); ctx.translate(s.x * W, s.y * H); ctx.rotate(s.rot || 0); woodBar(ctx, s.w * W, s.h * H, fill, notchAt); ctx.restore();
}
function baitBlob(ctx, x, y, s = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.beginPath(); ctx.ellipse(0, 0, 15, 12, 0.3, 0, 7); ctx.fillStyle = '#e1b043'; ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = INK; ctx.stroke();
  ctx.beginPath(); ctx.arc(-4, -4, 4, 3.6, 4.9); ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.stroke();
  leafShape(ctx, 2, -10, 14, -0.9); ctx.restore();
}
function shadow(ctx, x, y, rx, ry, a = 0.18) { ctx.save(); ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 7); ctx.fillStyle = `rgba(42,41,35,${a})`; ctx.fill(); ctx.restore(); }
function dots(ctx, x0, y0, x1, y1, n, seed, col = 'rgba(42,41,35,.22)', r = 2.2) {
  const R = rng(seed); ctx.fillStyle = col;
  for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(lerp(x0, x1, R()), lerp(y0, y1, R()), r * (0.5 + R()), 0, 7); ctx.fill(); }
}
function smoothPath(ctx, pts, closed = false, k = 0.17) {
  const n = pts.length; ctx.moveTo(pts[0][0], pts[0][1]);
  const at = (i) => pts[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  const end = closed ? n : n - 1;
  for (let i = 0; i < end; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k, p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k, p2[0], p2[1]);
  }
  if (closed) ctx.closePath();
}
/** first frac of a polyline (px points) */
function partial(pts, frac) {
  if (frac >= 0.999) return pts.slice();
  let total = 0; const seg = [];
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); total += d; }
  let rest = total * Math.max(0, frac); const out = [pts[0]];
  for (let i = 0; i < seg.length; i++) {
    if (rest >= seg[i]) { out.push(pts[i + 1]); rest -= seg[i]; continue; }
    const t = seg[i] ? rest / seg[i] : 0; out.push([lerp(pts[i][0], pts[i + 1][0], t), lerp(pts[i][1], pts[i + 1][1], t)]); break;
  }
  return out;
}
const mc = (st, i) => (st.step === i ? ACT : TEAL);   // mark colour: orange when it is the active step
const isAct = (st, i) => st.step === i;

// ---------------------------------------------------------------- SNARE
function sceneSnare(ctx, st, K) {
  const G = GEO.snare, gy = G.ground * H;
  const sink = clamp(num(st.stake, 0)), sprung = !!st.sprung;
  const bend = sprung ? 0 : clamp(num(st.bend, 0));
  // distant hills
  ctx.fillStyle = '#e1e6c4'; ctx.beginPath(); ctx.moveTo(0, gy); ctx.bezierCurveTo(120, gy - 90, 220, gy - 110, 330, gy - 50); ctx.bezierCurveTo(430, gy - 100, 560, gy - 90, 720, gy - 40); ctx.lineTo(720, gy); ctx.fill();
  ctx.fillStyle = '#d3dcab'; ctx.beginPath(); ctx.moveTo(0, gy); ctx.bezierCurveTo(90, gy - 40, 160, gy - 50, 250, gy - 20); ctx.bezierCurveTo(400, gy - 60, 560, gy - 30, 720, gy - 10); ctx.lineTo(720, gy); ctx.fill();
  // soil
  ctx.fillStyle = SOIL; ctx.fillRect(0, gy, W, H - gy);
  dots(ctx, 0, gy + 30, W, H, 60, 7, 'rgba(120,90,50,.28)');
  // trampled strip (the game trail)
  ctx.beginPath(); ctx.moveTo(0.20 * W, gy); ctx.lineTo(0.78 * W, gy); ctx.lineTo(0.78 * W, gy + 24); ctx.bezierCurveTo(0.6 * W, gy + 30, 0.4 * W, gy + 30, 0.20 * W, gy + 24); ctx.closePath();
  ctx.fillStyle = '#e8d9ab'; ctx.fill();
  const R = rng(5); ctx.fillStyle = 'rgba(120,90,50,.35)';
  for (let i = 0; i < 6; i++) { const x = 0.25 * W + i * 0.085 * W; ctx.beginPath(); ctx.ellipse(x, gy + 13 + R() * 4, 7, 3.5, 0, 0, 7); ctx.fill(); }
  ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
  for (const x of [0.03, 0.09, 0.17, 0.865, 0.94, 0.985]) tuft(ctx, x * W, gy, 1.1, LEAF_D);
  txt(ctx, 'けもの道', 0.50 * W, gy + 44, { size: 14, color: INK, weight: 700 });

  // stake (sunk part drawn in front of the soil like a cut-away)
  const sx = G.stakeX * W, topY = lerp(0.34, 0.60, sink) * H, botY = 0.94 * H;
  ctx.beginPath(); ctx.moveTo(sx - 11, topY + 7); ctx.lineTo(sx - 3, topY - 3); ctx.lineTo(sx + 11, topY + 3); ctx.lineTo(sx + 11, botY); ctx.lineTo(sx, botY + 6); ctx.lineTo(sx - 11, botY); ctx.closePath();
  ctx.fillStyle = WOOD; ctx.fill(); ctx.lineWidth = 2.8; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(sx - 4, topY + 14); ctx.lineTo(sx - 4, topY + 60); ctx.moveTo(sx + 4, topY + 30); ctx.lineTo(sx + 4, topY + 80); ctx.lineWidth = 1.3; ctx.strokeStyle = 'rgba(42,41,35,.35)'; ctx.stroke();
  // notch in the stake face for the trigger
  const tr = G.trigger.map(N), notch = tr[tr.length - 1];
  ctx.beginPath(); ctx.moveTo(sx - 11, notch[1] - 8); ctx.lineTo(sx - 2, notch[1]); ctx.lineTo(sx - 11, notch[1] + 6); ctx.fillStyle = SOIL_D; ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
  // soil mound at the foot
  ctx.beginPath(); ctx.ellipse(sx, gy + 2, 26, 6, 0, Math.PI, 0); ctx.fillStyle = '#b79a68'; ctx.fill(); ctx.lineWidth = 2; ctx.stroke();

  // trigger stick (bar)
  let bar0 = tr[0];
  if (sprung) bar0 = [0.70 * W, 0.75 * H];
  ctx.save(); ctx.lineCap = 'round';
  const pts = sprung ? [bar0, [sx - 8, notch[1] + 3]] : tr;
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.lineWidth = 15; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 10; ctx.strokeStyle = WOOD_L; ctx.stroke();
  const trace = clamp(num(st.trigger, 0));
  if (trace > 0 && !sprung) { const p = partial(tr, trace); ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]); ctx.lineWidth = 5; ctx.strokeStyle = TEAL; ctx.stroke(); const e = p[p.length - 1]; ctx.beginPath(); ctx.arc(e[0], e[1], 7, 0, 7); ctx.fillStyle = ACT; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke(); }
  ctx.restore();

  // bait
  const bs = G.baitSlot;
  if (st.bait) baitBlob(ctx, bs.x * W, bs.y * H, 1);

  // sapling
  const base = [0.12 * W, gy], up = N(G.poleTip), bent = N(G.holdAnchor);
  const sway = sprung ? Math.sin((num(st.drift, 0) * 9)) * 6 : 0;
  const tip = [lerp(up[0], bent[0], bend) + sway, lerp(up[1], bent[1], bend)];
  const ctrl = [base[0] + (tip[0] - base[0]) * 0.15, base[1] + (tip[1] - base[1]) * 0.65];
  const curve = []; for (let i = 0; i <= 28; i++) { const t = i / 28, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t; curve.push([a * base[0] + b * ctrl[0] + c * tip[0], a * base[1] + b * ctrl[1] + c * tip[1]]); }

  // loop + cords
  const loopN = st.loop || G.loopStart;
  let lx = loopN.x * W, ly = loopN.y * H; const lr = loopN.r * H;
  if (sprung) { lx = tip[0] + 18; ly = tip[1] + 120; }
  const attach = [lx + Math.cos(-2.3) * lr, ly + Math.sin(-2.3) * lr];
  ctx.save(); ctx.lineCap = 'round';
  const cordLine = (a, b, sag) => {
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + sag, b[0], b[1]);
    ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 3.4; ctx.strokeStyle = CORD; ctx.stroke();
  };
  cordLine(tip, attach, sprung ? 4 : (st.set ? 0 : 26 * (1 - bend)));
  cordLine([lx + lr, ly], sprung ? [bar0[0] + 4, bar0[1]] : [tr[0][0], tr[0][1]], sprung ? 10 : (st.set || bend > 0.5 ? 6 : 24));
  // the loop itself
  ctx.beginPath(); ctx.arc(lx, ly, lr, 0, 7); ctx.lineWidth = 9; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 5; ctx.strokeStyle = CORD; ctx.stroke();
  ctx.beginPath(); ctx.arc(lx, ly, lr, 0.4, 1.6); ctx.lineWidth = 1.6; ctx.strokeStyle = CORD_D; ctx.setLineDash([3, 5]); ctx.stroke(); ctx.setLineDash([]);
  // slip knot at the attach point
  ctx.beginPath(); ctx.arc(attach[0], attach[1], st.tight ? 7 : 9, 0, 7); ctx.fillStyle = CORD; ctx.fill(); ctx.lineWidth = 2.6; ctx.strokeStyle = INK; ctx.stroke();
  if (!st.tight) { ctx.beginPath(); ctx.moveTo(attach[0], attach[1]); ctx.quadraticCurveTo(attach[0] - 18, attach[1] - 6, attach[0] - 28, attach[1] + 10); ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 3.2; ctx.strokeStyle = CORD; ctx.stroke(); }
  ctx.restore();

  // sapling drawing
  const wdt = (t) => lerp(17, 5, t);
  ctx.beginPath();
  const L = [], Rr = [];
  for (let i = 0; i < curve.length; i++) {
    const p = curve[i], q = curve[Math.min(curve.length - 1, i + 1)], o = curve[Math.max(0, i - 1)];
    const a = Math.atan2(q[1] - o[1], q[0] - o[0]) + Math.PI / 2, w = wdt(i / (curve.length - 1)) / 2;
    L.push([p[0] + Math.cos(a) * w, p[1] + Math.sin(a) * w]); Rr.push([p[0] - Math.cos(a) * w, p[1] - Math.sin(a) * w]);
  }
  ctx.moveTo(L[0][0], L[0][1]); L.forEach((p) => ctx.lineTo(p[0], p[1])); Rr.reverse().forEach((p) => ctx.lineTo(p[0], p[1])); ctx.closePath();
  ctx.fillStyle = '#9b7a4a'; ctx.fill(); ctx.lineWidth = 2.8; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke();
  const tangent = (i) => { const q = curve[Math.min(curve.length - 1, i + 1)], o = curve[Math.max(0, i - 1)]; return Math.atan2(q[1] - o[1], q[0] - o[0]); };
  // leaves along the tip and a twig
  const ta = tangent(curve.length - 1);
  for (const da of [-0.9, -0.35, 0.3, 0.85]) leafShape(ctx, tip[0], tip[1], 34, ta + da);
  const mid = curve[17], ma = tangent(17);
  ctx.beginPath(); ctx.moveTo(mid[0], mid[1]); ctx.lineTo(mid[0] + Math.cos(ma - 1.1) * 34, mid[1] + Math.sin(ma - 1.1) * 34); ctx.lineWidth = 3.5; ctx.strokeStyle = INK; ctx.stroke();
  leafShape(ctx, mid[0] + Math.cos(ma - 1.1) * 34, mid[1] + Math.sin(ma - 1.1) * 34, 28, ma - 1.1 - 0.5); leafShape(ctx, mid[0] + Math.cos(ma - 1.1) * 34, mid[1] + Math.sin(ma - 1.1) * 34, 26, ma - 1.1 + 0.6);
  ctx.beginPath(); ctx.ellipse(base[0], gy + 1, 24, 7, 0, Math.PI, 0); ctx.fillStyle = '#b79a68'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
  if (sprung) { ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; for (const k of [-1, 1]) { ctx.beginPath(); ctx.moveTo(tip[0] + k * 46, tip[1] + 20); ctx.lineTo(tip[0] + k * 62, tip[1] + 6); ctx.stroke(); } }

  // --- guide marks
  const wantAim = st.aim;
  if (K >= 1) {
    badge(ctx, sx + 26, topY - 12, 1, isAct(st, 1));
    badge(ctx, tip[0] - 24, tip[1] - 14, 2, isAct(st, 2));
    badge(ctx, attach[0] - 4, attach[1] - 22, 3, isAct(st, 3));
    badge(ctx, lx + lr * 0.75 + 12, ly + lr * 0.75 + 12, 4, isAct(st, 4));
    badge(ctx, tr[0][0] - 8, tr[0][1] - 24, 5, isAct(st, 5));
    badge(ctx, bs.x * W, bs.y * H - 34, 6, isAct(st, 6));
  }
  if (K >= 2) {
    // stake targets
    const nextHit = Math.min(2, Math.floor(sink * 3 + 1e-6));
    G.stakeTargets.forEach((t, i) => { const p = N(t); if (sink >= 0.999 || i < Math.floor(sink * 3 + 1e-6)) return; const act = isAct(st, 1) && i === nextHit; ringMark(ctx, p[0], p[1], act ? 17 : 9, act ? ACT : TEAL); });
    if (sink < 0.999) arrow(ctx, sx + 4, topY - 62, sx + 4, topY - 22, mc(st, 1), 3.4, true);
    // sapling: from tip down to the hold point
    if (bend < 1) { ringMark(ctx, bent[0], bent[1], 18, mc(st, 2)); arrow(ctx, up[0] + 8, up[1] + 24, bent[0] - 22, bent[1] - 14, mc(st, 2), 3, true); }
    // trigger line
    ctx.save(); ctx.setLineDash([6, 5]); ctx.lineWidth = 3; ctx.strokeStyle = mc(st, 5); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(tr[0][0], tr[0][1] - 14); for (let i = 1; i < tr.length; i++) ctx.lineTo(tr[i][0], tr[i][1] - 14); ctx.stroke(); ctx.restore();
    rectMark(ctx, bs, mc(st, 6));
    // loop zones
    for (const k of ['bird', 'small']) {
      const z = G.loopZones[k], act = isAct(st, 4) && (!wantAim || wantAim === k), col = act ? ACT : TEAL, dim = wantAim && wantAim !== k;
      ctx.save(); ctx.globalAlpha = dim ? 0.35 : 1; ringMark(ctx, z.x * W, z.y * H, z.r * H, col);
      txt(ctx, k === 'bird' ? '鳥' : '小けもの', z.x * W - z.r * H - 8, z.y * H - (k === 'bird' ? 10 : -22), { size: 13, color: col === ACT ? '#a64a1c' : TEAL, align: 'right' }); ctx.restore();
    }
    // finger / fist ruler
    const rx = G.ruler.x * W, cm = G.ruler.cmH * H;
    ctx.save(); ctx.lineWidth = 2; ctx.strokeStyle = INK;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.roundRect(rx - 19, gy - (i + 1) * 1.7 * cm, 24, 1.7 * cm - 2, 6); ctx.fillStyle = '#ecc9a0'; ctx.fill(); ctx.stroke(); }
    for (const [i, hgt] of [[0, 8], [1, 4]]) { ctx.beginPath(); ctx.roundRect(rx + 12, gy - (i ? 8 + hgt : hgt) * cm, 30, hgt * cm - 2, i ? 8 : 10); ctx.fillStyle = '#e6bd90'; ctx.fill(); ctx.stroke(); }
    ctx.restore();
    txt(ctx, '指3本', rx - 7, gy - 5.1 * cm - 10, { size: 12 }); txt(ctx, 'こぶし', rx + 27, gy - 12 * cm - 10, { size: 12 });
    // ruler lines to the zone bottoms
    for (const [k, h5] of [['bird', 5], ['small', 2]]) { if (wantAim && wantAim !== k) continue; const z = G.loopZones[k], yy = gy - h5 * cm; ctx.save(); ctx.setLineDash([3, 5]); ctx.lineWidth = 1.8; ctx.strokeStyle = TEAL; ctx.beginPath(); ctx.moveTo(rx - 22, yy); ctx.lineTo(z.x * W + 6, yy); ctx.stroke(); ctx.restore(); }
  }
  if (K >= 3) {
    // trigger "just right" band along the notch + filled zones
    const a = G.triggerBand[0], b = G.triggerBand[1];
    const seg = (t) => { const total = tr.length - 1, f = t * total, i = Math.min(total - 1, Math.floor(f)), u = f - i; return [lerp(tr[i][0], tr[i + 1][0], u), lerp(tr[i][1], tr[i + 1][1], u)]; };
    const pa = seg(a), pb = seg(b);
    ctx.save(); ctx.lineCap = 'round'; ctx.globalAlpha = 0.55; ctx.lineWidth = 22; ctx.strokeStyle = LEAF; ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.lineWidth = 3; ctx.strokeStyle = TEAL; ctx.setLineDash([]); for (const p of [pa, pb]) { ctx.beginPath(); ctx.moveTo(p[0], p[1] - 17); ctx.lineTo(p[0], p[1] + 17); ctx.stroke(); } ctx.restore();
    txt(ctx, 'ちょうど', (pa[0] + pb[0]) / 2, pa[1] + 30, { size: 13, color: TEAL });
    for (const k of ['bird', 'small']) { if (wantAim && wantAim !== k) continue; const z = G.loopZones[k]; ctx.save(); ctx.globalAlpha = 0.14; ctx.fillStyle = TEAL; ctx.beginPath(); ctx.arc(z.x * W, z.y * H, z.r * H, 0, 7); ctx.fill(); ctx.restore(); }
  }
}

// ---------------------------------------------------------------- DEADFALL
function sceneDeadfall(ctx, st, K) {
  const G = GEO.deadfall, gy = 0.76 * H, sprung = !!st.sprung;
  const lift = sprung ? 0 : clamp(num(st.rockLift, 0));
  const placed = new Set(st.parts || []);
  ctx.fillStyle = '#e1e6c4'; ctx.beginPath(); ctx.moveTo(0, gy); ctx.bezierCurveTo(140, gy - 70, 300, gy - 40, 420, gy - 60); ctx.bezierCurveTo(540, gy - 80, 640, gy - 40, 720, gy - 50); ctx.lineTo(720, gy); ctx.fill();
  ctx.fillStyle = SOIL; ctx.fillRect(0, gy, W, 0.10 * H); dots(ctx, 0, gy + 4, W, gy + 0.10 * H, 26, 3, 'rgba(120,90,50,.3)');
  ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
  // foreground mat for the parts
  ctx.fillStyle = '#d6dfae'; ctx.beginPath(); ctx.roundRect(0.05 * W, 0.835 * H, 0.90 * W, 0.14 * H, 16); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(42,41,35,.3)'; ctx.setLineDash([2, 7]); ctx.stroke(); ctx.setLineDash([]);
  for (const x of [0.04, 0.95]) tuft(ctx, x * W, gy, 1.1);

  const sl = (id) => G.slots.find((s) => s.id === id);
  const ids = ['upright', 'diagonal', 'bait'];
  // tray sticks (not yet placed)
  ids.forEach((id, i) => {
    if (placed.has(id) || sprung) return;
    const s = sl(id), c = G.partsTray[i], len = s.w * W > s.h * H ? s.w * W : s.h * H;
    ctx.save(); ctx.translate(c[0] * W, c[1] * H); woodBar(ctx, len, s.h * H, WOOD); ctx.restore();
    if (K >= 2) { const nl = G.notchLines[i].map(N); ctx.save(); ctx.setLineDash([5, 4]); ctx.lineWidth = 3; ctx.strokeStyle = TEAL; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(nl[0][0], nl[0][1]); ctx.lineTo(nl[1][0], nl[1][1]); ctx.stroke(); ctx.restore(); }
  });
  // rock
  const pv = N(G.rockPivot), a = G.rockAngle * lift, Lr = 0.66 * W, T = 44;
  ctx.save(); ctx.translate(pv[0], pv[1]); ctx.rotate(-a);
  // figure-4 pieces behind the rock's front edge
  ctx.restore();
  if (!sprung) {
    ids.forEach((id) => { if (!placed.has(id)) return; const s = sl(id); slotStick(ctx, s, id === 'diagonal' ? WOOD_D : WOOD, id === 'upright' ? null : null);
      if (id === 'upright') { ctx.save(); ctx.translate(s.x * W, s.y * H); const L = s.h * H; ctx.beginPath(); ctx.moveTo(-8, -L / 2 + 28); ctx.lineTo(0, -L / 2 + 34); ctx.lineTo(8, -L / 2 + 28); ctx.fillStyle = PAPER; ctx.fill(); ctx.lineWidth = 1.8; ctx.strokeStyle = INK; ctx.stroke(); ctx.restore(); } });
  } else {
    // scattered sticks after the drop
    [[0.30, 0.90, 0.25, 'upright'], [0.55, 0.91, -0.2, 'diagonal'], [0.80, 0.90, 0.55, 'bait']].forEach(([x, y, r, id]) => { const s = sl(id); ctx.save(); ctx.translate(x * W, y * H); ctx.rotate(r); woodBar(ctx, Math.max(s.w * W, s.h * H), 15); ctx.restore(); });
  }
  ctx.save(); ctx.translate(pv[0], pv[1]); ctx.rotate(-a);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Lr * 0.97, 0); ctx.lineTo(Lr, -T * 0.4); ctx.lineTo(Lr * 0.95, -T * 0.98); ctx.lineTo(Lr * 0.5, -T * 1.12); ctx.lineTo(Lr * 0.06, -T * 0.96); ctx.lineTo(-8, -T * 0.5); ctx.closePath();
  ctx.fillStyle = STONE_L; ctx.fill(); ctx.lineWidth = 3.2; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(Lr * 0.2, -T * 0.55); ctx.lineTo(Lr * 0.3, -T * 0.4); ctx.moveTo(Lr * 0.62, -T * 0.7); ctx.lineTo(Lr * 0.7, -T * 0.5); ctx.moveTo(Lr * 0.45, -T * 0.25); ctx.lineTo(Lr * 0.5, -T * 0.12);
  ctx.lineWidth = 1.8; ctx.strokeStyle = 'rgba(42,41,35,.4)'; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(Lr * 0.78, -T * 1.0, 32, 7, 0, Math.PI, 0); ctx.fillStyle = LEAF; ctx.fill(); ctx.lineWidth = 1.8; ctx.strokeStyle = LEAF_D; ctx.stroke();
  ctx.restore();
  // bait (food)
  if (st.bait && !sprung) { const e = N([0.705, 0.575]); ctx.beginPath(); ctx.moveTo(e[0], e[1]); ctx.lineTo(G.baitSlot.x * W, G.baitSlot.y * H - 8); ctx.lineWidth = 2.4; ctx.strokeStyle = INK; ctx.stroke(); baitBlob(ctx, G.baitSlot.x * W, G.baitSlot.y * H + 6, 1); }
  if (sprung) { shadow(ctx, pv[0] + Lr * 0.5, gy + 2, Lr * 0.5, 5, 0.2); ctx.save(); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; for (const k of [0, 1, 2]) { ctx.beginPath(); ctx.moveTo(pv[0] + Lr + 14 + k * 8, gy - 22 - k * 14); ctx.lineTo(pv[0] + Lr + 34 + k * 8, gy - 30 - k * 14); ctx.stroke(); } ctx.restore(); }
  ctx.beginPath(); ctx.arc(pv[0], pv[1], 4, 0, 7); ctx.fillStyle = INK; ctx.fill();
  // lifting-hand hint is drawn by the engine; we draw the grab point marks
  if (K >= 1) {
    ids.forEach((id, i) => { const s = placed.has(id) ? sl(id) : { x: G.partsTray[i][0], y: G.partsTray[i][1] }; badge(ctx, s.x * W, s.y * H - (placed.has(id) ? 0 : 30), i + 1, st.step === 3 && (st.parts || []).length === i); });
  }
  if (K >= 2) {
    ids.forEach((id, i) => { if (placed.has(id)) return; const col = (isAct(st, 3) && (st.parts || []).length === i) ? ACT : TEAL; rectMark(ctx, sl(id), col, 0.12); const f = N(G.partsTray[i]), t = N([sl(id).x, sl(id).y]); arrow(ctx, f[0], f[1] - 26, lerp(f[0], t[0], 0.55), lerp(f[1] - 26, t[1] + 20, 0.55), col, 2.4, true); });
    if (!st.bait) rectMark(ctx, G.baitSlot, mc(st, 1));
    const h = N(G.holdAnchor); arrow(ctx, h[0], h[1] + 60, h[0], h[1] + 18, mc(st, 2), 3.4, true); ringMark(ctx, h[0], h[1], 15, mc(st, 2));
  }
  if (K >= 3) {
    // guide: where the underside of the raised rock should be, and the "gently down" band
    ctx.save(); ctx.setLineDash([8, 6]); ctx.lineWidth = 3; ctx.strokeStyle = TEAL; ctx.beginPath(); ctx.moveTo(pv[0], pv[1]); ctx.lineTo(pv[0] + Math.cos(-G.rockAngle) * Lr, pv[1] + Math.sin(-G.rockAngle) * Lr); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.globalAlpha = 0.25; ctx.fillStyle = LEAF; ctx.beginPath(); ctx.moveTo(pv[0], pv[1]); ctx.arc(pv[0], pv[1], 120, -G.rockAngle - 0.07, -G.rockAngle + 0.07); ctx.closePath(); ctx.fill(); ctx.restore();
    txt(ctx, 'この 角度', pv[0] + 130, pv[1] - 16, { size: 13, color: TEAL });
  }
}

// ---------------------------------------------------------------- STREAM / TIDE POOL (fish_trap, crab_pot)
function flowStreaks(ctx, dir, t, clipFn, seed, speed = 22, alpha = 0.55) {
  ctx.save(); clipFn(); const R = rng(seed), c = Math.cos(dir), s = Math.sin(dir), L = 1000;
  ctx.strokeStyle = `rgba(255,255,255,${alpha})`; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
  for (let i = 0; i < 38; i++) {
    const v = (R() - 0.5) * 620, u0 = R() * L, len = 26 + R() * 34, u = ((u0 + t * speed * (0.7 + R() * 0.6)) % L) - L / 2;
    const x = 360 - s * v + c * u, y = 225 + c * v + s * u;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + c * len * 0.5 - s * 4, y + s * len * 0.5 + c * 4, x + c * len, y + s * len); ctx.stroke();
  }
  ctx.restore();
}
function drift(ctx, dir, t, clipFn, rows, seed) {
  ctx.save(); clipFn(); const R = rng(seed), c = Math.cos(dir), s = Math.sin(dir), L = 900;
  rows.forEach((v, i) => {
    const u = (((R() * L) + t * (26 + i * 5)) % L) - L / 2;
    const x = 360 - s * v + c * u, y = 225 + c * v + s * u + Math.sin(t * 1.3 + i) * 3;
    if (i % 2 === 0) leafShape(ctx, x, y, 26, dir + Math.sin(t + i) * 0.4 - 0.1, LEAF, LEAF_D);
    else { ctx.fillStyle = 'rgba(255,255,255,.85)'; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(x + k * 6 - 8, y + (k % 2) * 3, 4 - k * 0.5, 0, 7); ctx.fill(); } }
  });
  ctx.restore();
}
function basket(ctx, kind, len, hh, angle, mouthMark) {
  ctx.save(); ctx.rotate(angle);
  if (kind === 'crab_pot') {
    const r = hh * 0.62;
    ctx.beginPath(); ctx.arc(-4, 0, r, 0, 7); ctx.fillStyle = WOOD_L; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    ctx.save(); ctx.clip(); ctx.strokeStyle = 'rgba(138,90,48,.7)'; ctx.lineWidth = 2; for (let i = -6; i <= 6; i++) { ctx.beginPath(); ctx.moveTo(-r + i * 10, -r); ctx.lineTo(i * 10 + r * 0.6 - 4, r); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-r + i * 10, r); ctx.lineTo(i * 10 + r * 0.6 - 4, -r); ctx.stroke(); } ctx.restore();
    ctx.beginPath(); ctx.arc(-4, 0, r * 0.55, 0, 7); ctx.lineWidth = 2.4; ctx.strokeStyle = WOOD_D; ctx.stroke();
    // entrance funnel to the right
    ctx.beginPath(); ctx.moveTo(r - 8, -r * 0.55); ctx.lineTo(r + 26, -r * 0.3); ctx.lineTo(r + 26, r * 0.3); ctx.lineTo(r - 8, r * 0.55); ctx.closePath(); ctx.fillStyle = WOOD; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(r + 26, 0, 6, r * 0.3, 0, 0, 7); ctx.fillStyle = '#3a4a4d'; ctx.fill(); ctx.stroke();
  } else {
    const l = len * 0.5, h2 = hh * 0.5;
    ctx.beginPath(); ctx.roundRect(-l, -h2, len * 0.78, hh, 18); ctx.fillStyle = WOOD_L; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    ctx.save(); ctx.clip(); ctx.strokeStyle = 'rgba(138,90,48,.75)'; ctx.lineWidth = 2;
    for (let x = -l - 40; x < l; x += 13) { ctx.beginPath(); ctx.moveTo(x, -h2); ctx.lineTo(x + 40, h2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x + 40, -h2); ctx.lineTo(x, h2); ctx.stroke(); } ctx.restore();
    for (const x of [-l + len * 0.2, -l + len * 0.5]) { ctx.beginPath(); ctx.moveTo(x, -h2); ctx.lineTo(x, h2); ctx.lineWidth = 3.5; ctx.strokeStyle = WOOD_D; ctx.stroke(); }
    // funnel mouth to the right
    const m0 = -l + len * 0.78;
    ctx.beginPath(); ctx.moveTo(m0 - 6, -h2); ctx.lineTo(l + 4, -h2 * 0.42); ctx.lineTo(l + 4, h2 * 0.42); ctx.lineTo(m0 - 6, h2); ctx.closePath(); ctx.fillStyle = WOOD; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(l + 4, 0, 6, h2 * 0.42, 0, 0, 7); ctx.fillStyle = '#3a4a4d'; ctx.fill(); ctx.lineWidth = 2.4; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-l, -h2 + 8); ctx.lineTo(-l - 14, -h2 + 14); ctx.moveTo(-l, 0); ctx.lineTo(-l - 16, 0); ctx.moveTo(-l, h2 - 8); ctx.lineTo(-l - 14, h2 - 14); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
  }
  ctx.restore();
}
function sceneWater(ctx, st, K, id) {
  const G = GEO[id], crab = id === 'crab_pot', t = num(st.drift, 0);
  const ts = G.trapSlot, tcx = ts.x * W, tcy = ts.y * H;
  const mAng = num(st.mouthAngle, G.rightAngle + 2.3), dAng = Math.atan2(Math.sin(mAng - G.rightAngle), Math.cos(mAng - G.rightAngle));
  let waterClip;
  if (!crab) {
    // banks
    ctx.fillStyle = '#cfdca0'; ctx.fillRect(0, 0, W, H);
    const topY = 0.18 * H, botY = 0.82 * H;
    const wp = new Path2D(); wp.moveTo(0, topY + 6);
    for (let x = 0; x <= W; x += 40) wp.lineTo(x, topY + Math.sin(x * 0.02) * 7 + 4);
    wp.lineTo(W, botY); for (let x = W; x >= 0; x -= 40) wp.lineTo(x, botY + Math.sin(x * 0.017 + 2) * 7 - 2); wp.closePath();
    const g = ctx.createLinearGradient(0, topY, 0, botY); g.addColorStop(0, WATER); g.addColorStop(0.5, '#b0dde4'); g.addColorStop(1, WATER_D);
    ctx.fillStyle = g; ctx.fill(wp); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke(wp);
    // bank details
    const R = rng(11); for (let i = 0; i < 16; i++) tuft(ctx, R() * W, 0.15 * H + R() * 14 - 10, 1, LEAF_D);
    for (let i = 0; i < 12; i++) tuft(ctx, R() * W, 0.97 * H - R() * 14, 1, LEAF_D);
    dots(ctx, 0, 0.92 * H, W, 0.99 * H, 20, 4, 'rgba(120,90,50,.35)', 2.6);
    waterClip = () => { ctx.clip(wp); };
    // wet pebbles near the bank
    for (const [x, y] of [[0.62, 0.22], [0.66, 0.235], [0.9, 0.78], [0.12, 0.79]]) stoneShape(ctx, x * W, y * H, 9, 6, 0.3, STONE_L);
  } else {
    ctx.fillStyle = STONE_L; ctx.fillRect(0, 0, W, H);
    const R = rng(21); for (let i = 0; i < 60; i++) { ctx.beginPath(); ctx.ellipse(R() * W, R() * H, 4 + R() * 6, 2 + R() * 3, 0, 0, 7); ctx.fillStyle = 'rgba(111,108,100,.28)'; ctx.fill(); }
    for (let i = 0; i < 18; i++) { ctx.beginPath(); ctx.arc(R() * W, R() * H, 2.5, 0, 7); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fill(); }
    const pts = [[30, 110], [120, 62], [250, 70], [330, 122], [390, 170], [520, 170], [572, 118], [650, 62], [722, 52], [722, 400], [650, 392], [572, 335], [520, 282], [390, 282], [330, 330], [250, 386], [120, 392], [30, 330]];
    const wp = new Path2D(); const tmp = document2d(); smoothPath(tmp, pts, true, 0.16); wp.addPath(tmp.p);
    const g = ctx.createLinearGradient(0, 60, 0, 390); g.addColorStop(0, WATER); g.addColorStop(1, WATER_D);
    ctx.fillStyle = g; ctx.fill(wp); ctx.lineWidth = 3.4; ctx.strokeStyle = INK; ctx.stroke(wp);
    ctx.save(); ctx.clip(wp); ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.stroke(wp); ctx.restore();
    waterClip = () => { ctx.clip(wp); };
    // rocks along the groove
    for (const [x, y, rx, ry] of [[455, 152, 70, 28], [455, 298, 70, 28], [400, 140, 36, 22], [510, 306, 38, 22]]) stoneShape(ctx, x, y, rx, ry, 0, STONE);
    // bottom shore
    ctx.fillStyle = '#e9dfb7'; ctx.fillRect(0, 0.93 * H, W, 0.07 * H); dots(ctx, 0, 0.93 * H, W, H, 14, 8, 'rgba(120,90,50,.3)');
  }
  flowStreaks(ctx, G.flowDir, t, waterClip, id === 'crab_pot' ? 3 : 2, crab ? 16 : 22);
  drift(ctx, G.flowDir, t, waterClip, crab ? [-70, -20, 40, 85, 10] : [-120, -60, -10, 55, 110, 150, 20], 5);

  // rope (under the trap)
  const stake = N(G.bankStake), rope = clamp(num(st.rope, 0)), rl = G.ropeLine.map(N);
  const tail = [tcx - Math.cos(mAng) * ts.w * W * (crab ? 0.34 : 0.5), tcy - Math.sin(mAng) * ts.w * W * (crab ? 0.34 : 0.5)];
  ctx.save(); ctx.lineCap = 'round';
  const rp = [tail, ...rl.slice(1)];
  const sag = (1 - rope) * 16;
  ctx.beginPath(); ctx.moveTo(rp[0][0], rp[0][1]); smoothPath(ctx, rp.map((p, i) => [p[0] + (i && i < rp.length - 1 ? Math.sin(i * 2.1) * sag : 0), p[1]]), false, 0.2);
  ctx.lineWidth = 6.5; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 3.6; ctx.strokeStyle = CORD; ctx.stroke();
  ctx.restore();
  // bank stake
  ctx.save(); ctx.translate(stake[0], stake[1]); ctx.beginPath(); ctx.roundRect(-8, -26, 16, 40, 5); ctx.fillStyle = WOOD; ctx.fill(); ctx.lineWidth = 2.8; ctx.strokeStyle = INK; ctx.stroke();
  const coils = Math.round(rope * 3); for (let i = 0; i < coils; i++) { ctx.beginPath(); ctx.ellipse(0, -16 + i * 8, 11, 4, 0, 0, 7); ctx.lineWidth = 5.4; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 3; ctx.strokeStyle = CORD; ctx.stroke(); }
  ctx.restore();

  // stones: placed + spare pile
  const nSt = clamp(Math.floor(num(st.stones, 0)), 0, 3);
  G.stoneSlots.forEach((s, i) => { if (i < nSt) stoneShape(ctx, s.x * W, s.y * H, s.w * W * 0.55, s.h * H * 0.5, 0.2 * i, STONE); });
  G.stonePile.forEach((p, i) => { if (i >= nSt) stoneShape(ctx, p[0] * W, p[1] * H, 17, 12, 0.3 * i, STONE); });

  // trap
  ctx.save(); ctx.translate(tcx, tcy);
  shadow(ctx, 4, 8, ts.w * W * 0.45, ts.h * H * 0.3, 0.15);
  basket(ctx, id, ts.w * W, ts.h * H, mAng);
  ctx.restore();
  if (st.bait) { const b = N(G.baitCenter); ctx.save(); ctx.translate(tcx, tcy); ctx.rotate(mAng); const loc = [b[0] - tcx, b[1] - tcy]; ctx.restore(); const c = Math.cos(mAng - 0), s = Math.sin(mAng - 0), bx = tcx + loc[0] * c - loc[1] * s, by = tcy + loc[0] * s + loc[1] * c; baitBlob(ctx, bx, by, 0.8); }

  // guide marks
  const mouthPt = [tcx + Math.cos(mAng) * (ts.w * W * (crab ? 0.42 : 0.55)), tcy + Math.sin(mAng) * (ts.w * W * (crab ? 0.42 : 0.55))];
  if (K >= 1) {
    const b = N(G.baitCenter);
    badge(ctx, b[0], b[1] - ts.h * H * 0.5 - 20, 1, isAct(st, 1));
    badge(ctx, mouthPt[0] + Math.cos(mAng) * 8 + 4, mouthPt[1] + Math.sin(mAng) * 8 - 26, 2, isAct(st, 2));
    const s2 = G.stoneSlots[Math.min(nSt, 2)]; badge(ctx, s2.x * W + 24, s2.y * H - 30, 3, isAct(st, 3));
    badge(ctx, stake[0] + 24, stake[1] - 20, 4, isAct(st, 4));
  }
  if (K >= 2) {
    const b = N(G.baitCenter); if (!st.bait) ringMark(ctx, b[0], b[1], 22, mc(st, 1));
    // flow arrow + facing arrow
    const fx = (crab ? 0.08 : 0.12) * W, fy = (crab ? 0.30 : 0.30) * H, fl = 92;
    arrow(ctx, fx, fy, fx + Math.cos(G.flowDir) * fl, fy + Math.sin(G.flowDir) * fl, TEAL, 5);
    txt(ctx, crab ? 'ひき潮の むき' : '水の ながれ', fx + 46, fy - 20, { size: 14, color: TEAL });
    const good = Math.abs(dAng) < 0.3;
    arrow(ctx, tcx, tcy, tcx + Math.cos(G.rightAngle) * 150, tcy + Math.sin(G.rightAngle) * 150, good ? LEAF_D : mc(st, 2), 3.4, true);
    G.stoneSlots.forEach((s, i) => { if (i >= nSt) rectMark(ctx, s, i === nSt ? mc(st, 3) : TEAL, 0.12); });
    ringMark(ctx, stake[0], stake[1] - 6, 22, mc(st, 4));
  }
  if (K >= 3) {
    ctx.save(); ctx.globalAlpha = 0.22; ctx.fillStyle = LEAF; ctx.beginPath(); ctx.moveTo(tcx, tcy); ctx.arc(tcx, tcy, 175, G.rightAngle - 0.3, G.rightAngle + 0.3); ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.save(); ctx.setLineDash([6, 6]); ctx.lineWidth = 2.4; ctx.strokeStyle = TEAL; for (const k of [-0.3, 0.3]) { ctx.beginPath(); ctx.moveTo(tcx, tcy); ctx.lineTo(tcx + Math.cos(G.rightAngle + k) * 175, tcy + Math.sin(G.rightAngle + k) * 175); ctx.stroke(); } ctx.restore();
    txt(ctx, '口は こっち', tcx + 140, tcy - 56, { size: 13, color: TEAL });
  }
}
function document2d() { const p = new Path2D(); return { p, moveTo: (...a) => p.moveTo(...a), bezierCurveTo: (...a) => p.bezierCurveTo(...a), closePath: () => p.closePath(), lineTo: (...a) => p.lineTo(...a) }; }

// ---------------------------------------------------------------- FIRE LAY
function pit(ctx, plan, cx, cy, rx, ry) {
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, 7); ctx.fillStyle = SOIL; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
  dots(ctx, cx - rx * 0.8, cy - ry * 0.8, cx + rx * 0.8, cy + ry * 0.8, 36, 9, 'rgba(120,90,50,.3)');
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2 + 0.2; stoneShape(ctx, cx + Math.cos(a) * (rx + 4), cy + Math.sin(a) * (ry + 4), 14, 9, a * 0.4, i % 2 ? STONE : STONE_L); }
}
function sceneFirelay(ctx, st, K) {
  const type = GEO.firelay.types[st.layType] ? st.layType : 'teepee', T = GEO.firelay.types[type], placed = clamp(Math.floor(num(st.placed, 0)), 0, 6);
  const plan = type !== 'teepee';
  ctx.fillStyle = '#dfe7bf'; ctx.fillRect(0, 0, W, H);
  if (plan) pit(ctx, true, 0.50 * W, 0.54 * H, 164, 160); else pit(ctx, false, 0.50 * W, 0.75 * H, 270, 58);
  const names = { tinder: '火口', pencil: '鉛筆', finger: '指' };
  T.slots.forEach((s, i) => {
    if (i < placed) {
      ctx.save(); ctx.translate(s.x * W + 3, s.y * H + 6); ctx.rotate(s.rot); ctx.beginPath(); ctx.roundRect(-s.w * W / 2, -s.h * H / 2, s.w * W, s.h * H, 5); ctx.fillStyle = 'rgba(42,41,35,.14)'; ctx.fill(); ctx.restore();
      if (s.role === 'tinder') {
        ctx.save(); ctx.translate(s.x * W, s.y * H); const R = rng(4); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.fillStyle = '#e3cf94';
        ctx.beginPath(); ctx.ellipse(0, 0, s.w * W * 0.5, Math.max(s.h * H * 0.5, 18), 0, 0, 7); ctx.fill(); ctx.stroke();
        ctx.lineWidth = 1.6; ctx.strokeStyle = '#a58a42'; for (let k = 0; k < 14; k++) { const a = R() * 6.28, r = R() * 18; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r * 0.8); ctx.quadraticCurveTo(Math.cos(a + 1) * 26, Math.sin(a + 1) * 20, Math.cos(a + 2) * 30, Math.sin(a + 2) * 22); ctx.stroke(); }
        ctx.restore();
      } else slotStick(ctx, s, s.role === 'finger' ? WOOD_D : WOOD_L);
    }
  });
  // remaining items row at the bottom
  T.slots.forEach((s, i) => {
    if (i < placed) return; const x = (0.20 + i * 0.12) * W, y = 0.962 * H;
    ctx.save(); ctx.translate(x, y);
    if (s.role === 'tinder') { ctx.beginPath(); ctx.ellipse(0, 0, 19, 12, 0, 0, 7); ctx.fillStyle = '#e3cf94'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke(); }
    else { ctx.rotate(-0.25); woodBar(ctx, s.role === 'finger' ? 62 : 70, s.role === 'finger' ? 14 : 9, s.role === 'finger' ? WOOD_D : WOOD_L); }
    ctx.restore();
  });
  if (K >= 1) T.slots.forEach((s, i) => {
    badge(ctx, s.x * W - Math.cos(s.rot || 0) * 0 + (plan ? 0 : 0), s.y * H - (s.role === 'tinder' ? 26 : 0) - (plan ? 18 : 0), i + 1, st.step === i + 1 || (st.step === undefined && i === placed));
    if (i === 0 || i === 1 || i === 4) txt(ctx, names[s.role], s.x * W + 30, s.y * H - (s.role === 'tinder' ? 26 : 0) - (plan ? 18 : 0), { size: 12, color: INK, align: 'left' });
  });
  if (K >= 2) {
    T.slots.forEach((s, i) => { if (i >= placed) rectMark(ctx, s, (i === placed) ? ACT : TEAL, 0.10); });
    const g = T.gapMark.map(N); arrow(ctx, g[0][0], g[0][1], g[1][0], g[1][1], TEAL, 2.8); arrow(ctx, g[1][0], g[1][1], g[0][0], g[0][1], TEAL, 2.8);
    const lo = T.gapLabel || [0, 20]; txt(ctx, 'すきまを あける', (g[0][0] + g[1][0]) / 2 + lo[0], (g[0][1] + g[1][1]) / 2 + lo[1], { size: 13, color: TEAL });
  }
  if (K >= 3) {
    const wf = GEO.firelay.windFrom, cx = 0.5 * W, cy = (plan ? 0.54 : 0.70) * H, d = [Math.cos(wf), Math.sin(wf)];
    const x0 = cx + d[0] * 300, y0 = cy + d[1] * 300 - (plan ? 0 : 20), m = N(T.mouth);
    arrow(ctx, x0, y0, m[0] - 12, m[1], TEAL, 5);
    txt(ctx, '風が くる ほう', x0 + 50, y0 - 24, { size: 14, color: TEAL });
    ctx.save(); ctx.globalAlpha = 0.28; ctx.fillStyle = LEAF; ctx.beginPath(); ctx.arc(m[0], m[1], 34, 0, 7); ctx.fill(); ctx.restore(); ringMark(ctx, m[0], m[1], 34, TEAL);
    txt(ctx, '口を あける', m[0], m[1] + 52, { size: 13, color: TEAL });
  }
}

// ---------------------------------------------------------------- COCONUT
function sceneCoconut(ctx, st, K) {
  const G = GEO.coconut, c = N(G.center), husk = clamp(num(st.husk, 0)), opened = clamp(num(st.opened, 0)), halves = !!st.halves;
  const crack = clamp(num(st.crack, 0));
  ctx.fillStyle = '#e6dcb2'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = SOIL; ctx.fillRect(0, 0.88 * H, W, 0.12 * H); dots(ctx, 0, 0.88 * H, W, H, 24, 2, 'rgba(120,90,50,.3)');
  ctx.beginPath(); ctx.moveTo(0, 0.88 * H); ctx.lineTo(W, 0.88 * H); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
  const rx = 122, ry = 153, sx = 96, sy = 124;
  // husk pile (grows as it comes off)
  if (husk > 0.02) { const R = rng(3); for (let i = 0; i < Math.round(3 + husk * 9); i++) { const a = R() * 3.14 + 3.14, px = 0.14 * W + (R() - 0.3) * 80 * (0.4 + husk), py = 0.87 * H - R() * 22 * husk; ctx.beginPath(); ctx.moveTo(px - 24, py); ctx.quadraticCurveTo(px, py - 26 - R() * 8, px + 26, py + 2); ctx.fillStyle = '#9a7646'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke(); } }
  const drawShell = (cx, cy, rr, ry2) => {
    const g = ctx.createRadialGradient(cx - rr * 0.3, cy - ry2 * 0.3, 8, cx, cy, ry2); g.addColorStop(0, '#9a6a3c'); g.addColorStop(1, '#5c3a20');
    ctx.beginPath(); ctx.ellipse(cx, cy, rr, ry2, 0, 0, 7); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 3.4; ctx.strokeStyle = INK; ctx.stroke();
    ctx.save(); ctx.clip(); ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 2; for (let i = -4; i < 5; i++) { ctx.beginPath(); ctx.ellipse(cx, cy, Math.abs(i) * rr / 5 + 1, ry2, 0, 0, 7); ctx.stroke(); } ctx.restore();
  };
  if (halves) {
    // two cups, cut face up, with white flesh
    for (const [dx, tilt] of [[-0.17, -0.12], [0.17, 0.1]]) {
      const hx = c[0] + dx * W, hy = 0.62 * H; ctx.save(); ctx.translate(hx, hy); ctx.rotate(tilt);
      shadow(ctx, 6, 62, 84, 10, 0.2);
      ctx.beginPath(); ctx.moveTo(-84, -4); ctx.bezierCurveTo(-84, 74, 84, 74, 84, -4); ctx.closePath(); ctx.fillStyle = '#7a4f2b'; ctx.fill(); ctx.lineWidth = 3.4; ctx.strokeStyle = INK; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, -4, 84, 24, 0, 0, 7); ctx.fillStyle = '#f6f1e0'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, -2, 62, 15, 0, 0, 7); ctx.fillStyle = '#e6edd9'; ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    }
    txt(ctx, 'ヤシ殻の 器', c[0], 0.86 * H - 10, { size: 15 });
    if (K >= 1) badge(ctx, c[0], 0.20 * H, 4, false);
    return;
  }
  if (husk < 0.999) {
    drawShell(c[0], c[1], sx, sy);
    // husk layer: clipped to the ovoid, minus the peeled bands along each seam
    ctx.save(); ctx.beginPath(); ctx.ellipse(c[0], c[1], rx, ry, 0, 0, 7); ctx.clip();
    const hp = new Path2D(); hp.rect(0, 0, W, H);
    const peel = (i) => clamp(husk * 3 - i);
    ctx.fillStyle = '#a07a48'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(80,52,26,.45)'; ctx.lineWidth = 1.6; const R = rng(8);
    for (let i = 0; i < 90; i++) { const x = c[0] - rx + R() * rx * 2, y = c[1] - ry + R() * ry * 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (x - c[0]) * 0.05, y + 22 + R() * 12); ctx.stroke(); }
    // reveal shell where peeled
    G.seams.forEach((s, i) => {
      const p = peel(i); if (p <= 0) return; const px = s.map(N);
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); smoothPath(ctx, px, false, 0.15);
      ctx.lineWidth = 2 * 62 * p + 6; ctx.strokeStyle = '#d7b777'; ctx.stroke();      // fibre underside
      ctx.lineWidth = 2 * 62 * p; ctx.strokeStyle = '#6e4626'; ctx.stroke(); ctx.restore();
    });
    ctx.restore();
    ctx.beginPath(); ctx.ellipse(c[0], c[1], rx, ry, 0, 0, 7); ctx.lineWidth = 3.4; ctx.strokeStyle = INK; ctx.stroke();
    // the seams (ridges)
    G.seams.forEach((s) => { ctx.save(); ctx.beginPath(); smoothPath(ctx, s.map(N), false, 0.15); ctx.lineWidth = 2.4; ctx.strokeStyle = 'rgba(42,41,35,.5)'; ctx.stroke(); ctx.restore(); });
    // frills at peel edges
    for (let i = 0; i < 3; i++) { const p = peel(i); if (p > 0.05 && p < 1) { const s = G.seams[i].map(N)[2]; for (const k of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s[0] + k * 62 * p, s[1] - 18); ctx.lineTo(s[0] + k * (62 * p + 10), s[1]); ctx.lineTo(s[0] + k * 62 * p, s[1] + 18); ctx.lineWidth = 2.4; ctx.strokeStyle = '#d7b777'; ctx.stroke(); } } }
  } else {
    drawShell(c[0], c[1], sx, sy);
    // eyes
    G.eyes.forEach((e, i) => {
      const p = N(e), soft = i === G.softEye;
      ctx.beginPath(); ctx.arc(p[0], p[1], 10, 0, 7); ctx.fillStyle = '#4a2f18'; ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = INK; ctx.stroke();
      if (soft && opened > 0) { ctx.beginPath(); ctx.arc(p[0], p[1], 5 + opened * 8, 0, 7); ctx.fillStyle = '#2d3a3c'; ctx.fill(); ctx.stroke(); }
    });
    if (opened >= 1) { const p = N(G.eyes[G.softEye]); ctx.fillStyle = WATER_D; for (const [dx, dy] of [[-14, 22], [-24, 46], [-8, 64]]) { ctx.beginPath(); ctx.ellipse(p[0] + dx, p[1] + dy, 5, 7, 0, 0, 7); ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = INK; ctx.stroke(); } }
    if (crack > 0) { const eq = G.equator.map(N); const ring = [eq[0], [eq[1][0] - 40, eq[1][1] + 6], eq[1], [eq[1][0] + 40, eq[1][1] + 6], eq[2]]; const pp = partial(ring, crack); ctx.beginPath(); ctx.moveTo(pp[0][0], pp[0][1]); for (let i = 1; i < pp.length; i++) ctx.lineTo(pp[i][0] + (i % 2) * 2, pp[i][1] + (i % 2 ? -2 : 2)); ctx.lineWidth = 3.2; ctx.strokeStyle = '#2b1a0c'; ctx.stroke(); }
  }
  // marks
  const showEyes = husk >= 0.999;
  if (K >= 1) {
    badge(ctx, c[0] - rx - 22, c[1] - 62, 1, isAct(st, 1)); if (showEyes) badge(ctx, c[0] + 128, 0.30 * H, 2, isAct(st, 2)); if (showEyes) badge(ctx, c[0] + 128, 0.60 * H, 3, isAct(st, 3));
  }
  if (K >= 2) {
    if (!showEyes) G.seams.forEach((s, i) => { const p = s.map(N); ctx.save(); ctx.setLineDash([7, 6]); ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.strokeStyle = (isAct(st, 1) && Math.floor(husk * 3) === i) ? ACT : TEAL; ctx.beginPath(); smoothPath(ctx, p, false, 0.15); ctx.stroke(); ctx.restore(); arrow(ctx, p[0][0] + (i - 1) * 16, p[0][1] - 30, p[0][0] + (i - 1) * 6, p[0][1] - 6, TEAL, 2.4); });
    if (showEyes && opened < 1) { const e = N(G.eyes[G.softEye]); ringMark(ctx, e[0], e[1], 19, mc(st, 2)); txt(ctx, 'やわらかい', e[0] - 62, e[1] - 6, { size: 13, color: TEAL }); }
    if (showEyes && !halves && opened >= 1) G.equator.forEach((p, i) => { const q = N(p); ringMark(ctx, q[0], q[1], 13, mc(st, 3)); txt(ctx, String(i + 1), q[0], q[1], { size: 12, color: TEAL }); });
  }
  if (K >= 3 && showEyes) {
    const eq = G.equator.map(N); ctx.save(); ctx.setLineDash([8, 6]); ctx.lineWidth = 3; ctx.strokeStyle = TEAL; ctx.beginPath(); ctx.ellipse(c[0], c[1], sx + 8, 28, 0, 0, 7); ctx.stroke(); ctx.restore();
    txt(ctx, '赤道（ぐるっと 1 周）', c[0] + 150, c[1] + 6, { size: 14, color: TEAL, align: 'left' });
    ctx.save(); ctx.globalAlpha = 0.18; ctx.fillStyle = LEAF; ctx.beginPath(); ctx.ellipse(c[0], c[1], sx + 8, 28, 0, 0, 7); ctx.fill(); ctx.restore();
  }
  if (K >= 3 && !showEyes) txt(ctx, '縦の すじ 3 本', c[0] + rx + 14, c[1] - 90, { size: 14, color: TEAL, align: 'left' });
}

// ---------------------------------------------------------------- KNOT
function sceneKnot(ctx, st, K) {
  const G = GEO.knot, n = clamp(Math.round(num(st.wraps, 0)), 0, 9), tight = !!st.tight, thr = !!st.threaded;
  ctx.fillStyle = '#e9efd8'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(155,211,220,.35)'; ctx.fillRect(0, 0.88 * H, W, 0.12 * H);
  const sx = G.standing[0] * W, wc = N(G.wrapCenter), eye = N(G.eye), sp = tight ? 11 : 16;
  const line = (pts, w = 5) => { ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); smoothPath(ctx, pts, false, 0.18); ctx.lineWidth = w + 3.4; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = w; ctx.strokeStyle = CORD; ctx.stroke(); ctx.restore(); };
  // hook
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(eye[0], eye[1] + 11); ctx.lineTo(eye[0], eye[1] + 76); ctx.bezierCurveTo(eye[0], eye[1] + 118, eye[0] + 52, eye[1] + 118, eye[0] + 56, eye[1] + 70); ctx.lineTo(eye[0] + 44, eye[1] + 60);
  ctx.lineWidth = 11; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 6; ctx.strokeStyle = '#cfd2d6'; ctx.stroke();
  ctx.beginPath(); ctx.arc(eye[0], eye[1], 12, 0, 7); ctx.lineWidth = 9; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 4.6; ctx.strokeStyle = '#cfd2d6'; ctx.stroke(); ctx.restore();
  // small loop by the eye (line through the eye, doubled back)
  const L = G.loopSlot, lc = N([L.x, L.y]);
  const loopPts = [[sx + 6, 0.44 * H], [lc[0] - 8, lc[1] - 46], [lc[0] + 28, lc[1] - 10], [lc[0] + 10, lc[1] + 34], [eye[0] + 14, eye[1] - 8], [eye[0] + 6, eye[1] + 1]];
  // standing line
  line([[sx, -6], [sx, 0.2 * H], [sx, 0.44 * H], [sx + 4, 0.52 * H], [eye[0] + 12, eye[1] - 14]], 5);
  // the doubled line passing through the eye and forming the loop
  line([[eye[0] - 4, eye[1] - 14], [eye[0] - 22, eye[1] - 46], [sx - 8, 0.50 * H], [sx - 8, 0.44 * H], ...(n ? [[sx - 8, wc[1] + (n / 2) * sp]] : [[sx - 8, 0.30 * H]])], 5);
  ctx.save(); ctx.lineCap = 'round'; ctx.beginPath(); smoothPath(ctx, [[sx + 8, 0.50 * H], [lc[0] + 4, lc[1] - 40], [lc[0] + 30, lc[1] - 4], [lc[0] + 12, lc[1] + 34], [eye[0] + 10, eye[1] - 6]], false, 0.2); ctx.lineWidth = 8.4; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 5; ctx.strokeStyle = CORD; ctx.stroke(); ctx.restore();
  // wraps
  const y0 = wc[1] - ((n - 1) / 2) * sp;
  for (let i = 0; i < n; i++) {
    const y = y0 + i * sp;
    ctx.save(); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(sx - 13, y - 3); ctx.quadraticCurveTo(sx, y + 6, sx + 13, y + sp * 0.35); ctx.lineWidth = 8.4; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 5; ctx.strokeStyle = CORD; ctx.stroke(); ctx.restore();
  }
  // tag end
  const tag0 = n ? [sx - 13, y0 + (n - 1) * sp + 4] : [sx - 8, 0.30 * H];
  if (thr) line([tag0, [tag0[0] + 10, tag0[1] + 40], [lc[0] - 6, lc[1] - 34], [lc[0] + 8, lc[1] + 2], [lc[0] + 28, lc[1] + 30], [lc[0] + 64, lc[1] + 30]], 5);
  else if (n) line([tag0, [tag0[0] - 34, tag0[1] - 14], [tag0[0] - 70, tag0[1] - 6]], 5);
  if (tight) { ctx.fillStyle = INK; ctx.font = `700 14px ${FONT}`; }
  if (st.wet) { ctx.fillStyle = WATER_D; for (const [dx, dy] of [[20, -14], [30, 6], [16, 18]]) { ctx.beginPath(); ctx.ellipse(sx + dx + 10, wc[1] + dy, 4, 6, 0.3, 0, 7); ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = INK; ctx.stroke(); } }
  // marks
  if (K >= 1) { badge(ctx, sx - 54, wc[1] - 36, 1, isAct(st, 1)); badge(ctx, lc[0] + 54, lc[1] - 26, 2, isAct(st, 2)); badge(ctx, eye[0] + 90, eye[1] + 74, 3, isAct(st, 3)); }
  if (K >= 2) {
    // wrap scale: 1..8 ticks to the right of the standing line, "5" highlighted
    for (let i = 0; i < 7; i++) { const y = wc[1] - 3.5 * 16 + i * 16; ctx.save(); ctx.strokeStyle = TEAL; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx + 34, y); ctx.lineTo(sx + 44, y); ctx.stroke(); ctx.restore(); txt(ctx, String(i + 1), sx + 58, y, { size: 12, color: i === 4 ? ACT : TEAL, weight: 700 }); }
    rectMark(ctx, G.loopSlot, mc(st, 2), 0.12);
    arrow(ctx, tag0[0] + 20, tag0[1] + 60, lc[0] - 10, lc[1] - 26, mc(st, 2), 2.6, true);
  }
  if (K >= 3) { const yy = wc[1] - 3.5 * 16, yb = wc[1] + 3.5 * 16; ctx.save(); ctx.globalAlpha = 0.22; ctx.fillStyle = LEAF; ctx.fillRect(sx - 30, wc[1] - 2 * 16 - 8, 60, 4 * 16 + 20); ctx.restore(); ctx.save(); ctx.setLineDash([6, 5]); ctx.lineWidth = 2.4; ctx.strokeStyle = TEAL; ctx.strokeRect(sx - 30, wc[1] - 2 * 16 - 8, 60, 4 * 16 + 20); ctx.restore(); txt(ctx, '5 回が ちょうど', sx - 40, wc[1] - 3 * 16 - 28, { size: 13, color: TEAL, align: 'right' }); void yy; void yb; }
}

// ---------------------------------------------------------------- SOS
function sceneSos(ctx, st, K) {
  const G = GEO.sos, ty = G.tideLine * H, t = num(st.drift, 0), placed = clamp(Math.floor(num(st.placed, 0)), 0, 5), color = st.color || 'dark';
  ctx.fillStyle = SAND; ctx.fillRect(0, 0, W, ty);
  dots(ctx, 0, 0, W, ty, 90, 6, 'rgba(160,130,70,.25)', 1.8);
  // scrub at the top
  for (let i = 0; i < 12; i++) tuft(ctx, 30 + i * 62, 22 + (i % 3) * 6, 1.2, LEAF_D);
  // wet sand + sea
  const g = ctx.createLinearGradient(0, ty, 0, H); g.addColorStop(0, '#c9bd92'); g.addColorStop(0.35, WATER); g.addColorStop(1, WATER_D);
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, ty);
  for (let x = 0; x <= W; x += 20) ctx.lineTo(x, ty + Math.sin(x * 0.03) * 5); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
  ctx.beginPath(); for (let x = 0; x <= W; x += 20) ctx[x ? 'lineTo' : 'moveTo'](x, ty + Math.sin(x * 0.03) * 5); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
  // seaweed at the tide line
  ctx.strokeStyle = '#5c6a3a'; ctx.lineWidth = 3; ctx.lineCap = 'round'; for (let i = 0; i < 16; i++) { const x = 20 + i * 44 + (i % 3) * 5, y = ty + Math.sin(x * 0.03) * 5 - 4; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 8, y - 8, x + 18, y - 3); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2.6; for (let k = 0; k < 4; k++) { const y = ty + 36 + k * 30; ctx.beginPath(); for (let x = 0; x <= W; x += 14) { const yy = y + Math.sin(x * 0.04 + t * 1.4 + k) * 4; ctx[x ? 'lineTo' : 'moveTo'](x, yy); } ctx.stroke(); }
  const col = { dark: '#4a4843', light: '#f0ecdf', seaweed: '#46603f' };
  const stone = (x, y, c, s = 1, rot = 0) => stoneShape(ctx, x, y, 19 * s, 15 * s, rot, c);
  // sample piles
  G.piles.forEach((p, i) => {
    const key = G.colorChoices[i], x = p[0] * W, y = p[1] * H;
    if (st.color === key) { ctx.beginPath(); ctx.arc(x, y + 4, 44, 0, 7); ctx.lineWidth = 3; ctx.strokeStyle = ACT; ctx.setLineDash([6, 5]); ctx.stroke(); ctx.setLineDash([]); }
    if (key === 'seaweed') { ctx.save(); ctx.lineCap = 'round'; for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.moveTo(x - 30 + k * 11, y + 16); ctx.quadraticCurveTo(x - 22 + k * 11, y - 18, x - 10 + k * 11 + (k % 2) * 8, y - 10 - (k % 3) * 6); ctx.lineWidth = 8; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 4.6; ctx.strokeStyle = col.seaweed; ctx.stroke(); } ctx.restore(); }
    else { stone(x - 14, y + 8, col[key], 0.75, 0.2); stone(x + 14, y + 8, col[key], 0.75, -0.2); stone(x, y - 8, col[key], 0.75, 0.1); }
    if (K >= 1) txt(ctx, key === 'dark' ? '黒い 石' : key === 'light' ? '白い 石' : '海藻', x, y + 40, { size: 13 });
  });
  const unit = (c) => (c === 'seaweed' ? '#46603f' : col[c]);
  G.letterSlots.forEach((s, i) => { if (i < placed) { stoneShape(ctx, s.x * W, s.y * H, s.w * W * 0.55, s.h * H * 0.5, 0.35 * i, unit(color)); } });
  if (K >= 1) { G.letterSlots.forEach((s, i) => badge(ctx, s.x * W + 38, s.y * H - 4, i + 1, st.step === i + 1 || (st.step === undefined && i === placed))); }
  if (K >= 2) {
    const pts = G.letterSlots.map(N); ctx.save(); ctx.setLineDash([4, 7]); ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(31,127,134,.7)'; ctx.beginPath(); smoothPath(ctx, pts, false, 0.2); ctx.stroke(); ctx.restore();
    G.letterSlots.forEach((s, i) => { if (i >= placed) rectMark(ctx, s, i === placed ? ACT : TEAL, 0.1); });
    arrow(ctx, 30, ty - 40, 30, ty - 4, TEAL, 3); txt(ctx, '満潮線の 上に', 100, ty - 24, { size: 14, color: TEAL });
    txt(ctx, '地面と ちがう 色', G.piles[1][0] * W, G.piles[0][1] * H - 52, { size: 13, color: TEAL });
    if (st.color) { const ok = color !== 'light'; txt(ctx, ok ? 'くっきり 見える' : 'とけこんで 見えない', 0.5 * W, 0.66 * H, { size: 14, color: ok ? LEAF_D : STONE_D }); }
  }
  if (K >= 3) {
    const y0 = 0.22 * H - 36, y1 = 0.54 * H + 36; ctx.save(); ctx.setLineDash([8, 6]); ctx.lineWidth = 2.4; ctx.strokeStyle = TEAL; for (const y of [y0, y1]) { ctx.beginPath(); ctx.moveTo(0.28 * W, y); ctx.lineTo(0.72 * W, y); ctx.stroke(); } ctx.restore();
    txt(ctx, '大きく・まっすぐ・角は はっきり', 0.5 * W, y1 + 18, { size: 13, color: TEAL });
    for (const i of [0, 4]) { const s = G.letterSlots[i]; ringMark(ctx, s.x * W, s.y * H, 30, TEAL); }
  }
}

// ---------------------------------------------------------------- SIGNAL (smoke fire)
function sceneSignal(ctx, st, K) {
  const G = GEO.signal, gy = 0.88 * H, placed = clamp(Math.floor(num(st.placed, 0)), 0, 4), t = num(st.drift, 0), lit = !!st.lit, covered = !!st.covered;
  ctx.fillStyle = '#dfe9f0'; ctx.fillRect(0, 0, W, gy);
  ctx.fillStyle = '#e1e6c4'; ctx.beginPath(); ctx.moveTo(0, gy); ctx.bezierCurveTo(140, gy - 60, 300, gy - 40, 420, gy - 52); ctx.bezierCurveTo(560, gy - 70, 640, gy - 30, 720, gy - 44); ctx.lineTo(720, gy); ctx.fill();
  ctx.fillStyle = SOIL; ctx.fillRect(0, gy, W, H - gy); dots(ctx, 0, gy + 4, W, H, 30, 12, 'rgba(120,90,50,.3)');
  ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
  const nest = N(G.nest);
  ctx.beginPath(); ctx.ellipse(nest[0], nest[1] + 6, 54, 14, 0, 0, 7); ctx.fillStyle = '#e3cf94'; ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = INK; ctx.stroke();
  const R = rng(5); ctx.strokeStyle = '#a58a42'; ctx.lineWidth = 1.6; for (let i = 0; i < 18; i++) { const x = nest[0] - 44 + R() * 88, y = nest[1] + 2 + R() * 8; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (R() - 0.5) * 20, y - 6 - R() * 6); ctx.stroke(); }
  // green pile (set aside)
  const gp = G.greenPile, gx = gp.x * W, gyy = gp.y * H;
  for (let i = 0; i < 9; i++) leafShape(ctx, gx - 60 + (i % 5) * 28 + (i > 4 ? 14 : 0), gyy + 22 - (i > 4 ? 22 : 0) - (i % 3) * 5, 50, -0.35 + ((i * 53) % 10) * 0.07 - 0.2 + (i % 2 ? 0.8 : 0), LEAF, LEAF_D);
  // core sticks
  G.coreSlots.forEach((s, i) => { if (i < placed) slotStick(ctx, s, i % 2 ? WOOD_L : WOOD); });
  if (covered) { for (let i = 0; i < 7; i++) leafShape(ctx, 0.40 * W - 44 + i * 14, 0.60 * H - 40 + (i % 2) * 24 + Math.abs(i - 3) * 14, 70, 0.4 + (i - 3) * 0.26, LEAF, LEAF_D); }
  if (lit) {
    for (const [dx, h, c] of [[-16, 56, '#f2b84b'], [14, 70, ACT], [0, 88, '#f6d27a']]) { ctx.beginPath(); ctx.moveTo(nest[0] + dx - 14, nest[1]); ctx.quadraticCurveTo(nest[0] + dx - 12, nest[1] - h * 0.5, nest[0] + dx, nest[1] - h); ctx.quadraticCurveTo(nest[0] + dx + 14, nest[1] - h * 0.4, nest[0] + dx + 14, nest[1]); ctx.closePath(); ctx.fillStyle = c; ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = INK; ctx.stroke(); }
    // smoke plume: thin and dark without green leaves, thick and white with them
    const top = [0.40 * W, 0.36 * H], thick = covered ? 1 : 0.28;
    for (let i = 0; i < (covered ? 9 : 7); i++) {
      const y = top[1] - i * 32, x = top[0] + Math.sin(t * 1.2 + i * 0.8) * (6 + i * 4) + i * 6, r = (14 + i * 5) * thick + 5;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = covered ? 'rgba(250,248,240,.96)' : 'rgba(110,108,100,.55)'; ctx.fill(); ctx.lineWidth = covered ? 2.2 : 1.4; ctx.strokeStyle = covered ? 'rgba(42,41,35,.55)' : 'rgba(42,41,35,.35)'; ctx.stroke();
    }
  }
  if (K >= 1) { G.coreSlots.forEach((s, i) => badge(ctx, s.x * W + (i % 2 ? 26 : -26), s.y * H + (i > 1 ? 24 : 0), i + 1, st.step === i + 1 || (st.step === undefined && i === placed))); badge(ctx, gx, gyy - 56, 5, isAct(st, 5)); }
  if (K >= 2) {
    G.coreSlots.forEach((s, i) => { if (i >= placed) rectMark(ctx, s, i === placed ? ACT : TEAL, 0.1); });
    rectMark(ctx, gp, TEAL, 0.06); txt(ctx, '生の 葉は わきに', gx, gyy + 70, { size: 14, color: TEAL });
    if (!covered && !lit) { ctx.save(); ctx.strokeStyle = TEAL; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0.40 * W - 22, 0.28 * H - 22); ctx.lineTo(0.40 * W + 22, 0.28 * H + 22); ctx.moveTo(0.40 * W + 22, 0.28 * H - 22); ctx.lineTo(0.40 * W - 22, 0.28 * H + 22); ctx.stroke(); ctx.restore(); txt(ctx, '火が ついて から', 0.40 * W + 90, 0.28 * H, { size: 13, color: TEAL }); }
  }
  if (K >= 3) {
    ctx.save(); ctx.setLineDash([7, 6]); ctx.lineWidth = 2.6; ctx.strokeStyle = TEAL; ctx.beginPath(); ctx.moveTo(0.34 * W, 0.34 * H); ctx.bezierCurveTo(0.30 * W, 0.20 * H, 0.38 * W, 0.08 * H, 0.34 * W, -0.05 * H); ctx.moveTo(0.46 * W, 0.34 * H); ctx.bezierCurveTo(0.52 * W, 0.20 * H, 0.46 * W, 0.08 * H, 0.52 * W, -0.05 * H); ctx.stroke(); ctx.restore();
    txt(ctx, '白く 太い 煙', 0.62 * W, 0.12 * H, { size: 14, color: TEAL, align: 'left' });
    ctx.save(); ctx.globalAlpha = 0.5; arrow(ctx, 0.12 * W, 0.12 * H, 0.12 * W, 0.04 * H, TEAL, 3); ctx.restore();
  }
}

// ---------------------------------------------------------------- main entry
const SCENES = { snare: sceneSnare, deadfall: sceneDeadfall, fish_trap: (c, s, k) => sceneWater(c, s, k, 'fish_trap'), crab_pot: (c, s, k) => sceneWater(c, s, k, 'crab_pot'),
  firelay: sceneFirelay, coconut: sceneCoconut, knot: sceneKnot, sos: sceneSos, signal: sceneSignal };

export function drawTrapScene(ctx, id, state = {}, view = 'normal', box = { x: 40, y: 30, w: 720, h: 450 }) {
  const fn = SCENES[id]; if (!fn) return;
  ACT = view === 'mild' ? '#e0a82e' : ORANGE;
  const st = state || {}, K = clamp(st.K | 0, 0, 3);
  ctx.save();
  ctx.translate(box.x, box.y); ctx.scale(box.w / W, box.h / H);
  ctx.beginPath(); ctx.roundRect(0, 0, W, H, 14); ctx.clip();
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  fn(ctx, st, K, view);
  ctx.restore();
  ctx.save(); ctx.translate(box.x, box.y); ctx.scale(box.w / W, box.h / H); ctx.beginPath(); ctx.roundRect(0, 0, W, H, 14); ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(42,41,35,.35)'; ctx.stroke(); ctx.restore();
}

// ---------------------------------------------------------------- TRACK CARDS
const SPECIES = {
  goat: { jp: 'ヤギ', track: '2つに 割れた ひづめ', scat: '小さな まるい つぶが たくさん' },
  boar: { jp: 'イノシシ', track: '大きな ひづめ。うしろに 小さな 点（つめ）', scat: '太くて 短い かたまり' },
  junglefowl: { jp: '野鶏', track: '3本の ゆび。うしろに けづめ', scat: '小さな うずまき。先が 白い' },
  seabird: { jp: '海鳥', track: '水かきの ある 足あと', scat: '白い しぶき 形' },
  rat: { jp: 'ネズミ', track: '小さな 4〜5本ゆび', scat: '米つぶ ぐらいの 細かい つぶ' },
  monitor: { jp: 'オオトカゲ', track: '5本の つめ。しっぽを ひきずった すじ', scat: '細長い かたまり。先が 白い' },
  coconut_crab: { jp: 'ヤシガニ', track: '2つずつの 点。ひきずった あと', scat: 'せんいの くずが まざった かけら' },
};
const AGE_JP = { fresh: '新しい', half: '半日', old: '古い' };
const AGE_CUE = { fresh: 'ふちが するどい・つやが ある', half: 'ふちが ぼやけて きた', old: 'くずれて 白っぽい・葉が のって いる' };

function ageStyle(age) {
  if (age === 'fresh') return { fill: '#6e5638', rim: 'rgba(60,42,22,.9)', rimW: 3.2, inner: 'rgba(40,28,14,.65)', ground: '#b49a6a', gloss: 1, crumble: 0, leaves: 0, soft: 0 };
  if (age === 'half') return { fill: '#8f7752', rim: 'rgba(80,60,34,.7)', rimW: 2.4, inner: 'rgba(60,44,24,.4)', ground: '#c1a977', gloss: 0.2, crumble: 0.35, leaves: 1, soft: 1 };
  return { fill: '#cdb98a', rim: 'rgba(130,108,70,.45)', rimW: 1.6, inner: 'rgba(120,98,60,.2)', ground: '#d8c79b', gloss: 0, crumble: 1, leaves: 3, soft: 2 };
}
function stamp(ctx, pathFn, ps) {
  ctx.save(); ctx.beginPath(); pathFn(ctx); ctx.lineJoin = 'round';
  ctx.lineWidth = ps.rimW + 5; ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.stroke();
  ctx.fillStyle = ps.fill; ctx.fill(); ctx.lineWidth = ps.rimW; ctx.strokeStyle = ps.rim; ctx.stroke();
  ctx.save(); ctx.clip(); ctx.lineWidth = 10; ctx.strokeStyle = ps.inner; ctx.stroke(); ctx.restore();
  ctx.restore();
}
function trackShapes(sp) {
  // each returns {paths:[fn...], extra(ctx,ps)}; drawn around (0,0) pointing up (-y)
  const mir = (f) => (c) => { c.save(); c.scale(-1, 1); f(c); c.restore(); };
  const hoof = (w, h) => (c) => { c.moveTo(-1.5, -h); c.bezierCurveTo(-w * 1.3, -h * 0.7, -w * 1.5, h * 0.4, -w, h * 0.8); c.lineTo(-2, h * 0.8); c.bezierCurveTo(-3, h * 0.3, -3, -h * 0.4, -1.5, -h); c.closePath(); };
  const toe = (x0, y0, x1, y1, w) => (c) => { const a = Math.atan2(y1 - y0, x1 - x0), nx = -Math.sin(a) * w / 2, ny = Math.cos(a) * w / 2; c.moveTo(x0 + nx, y0 + ny); c.lineTo(x1 + nx * 0.6, y1 + ny * 0.6); c.arc(x1, y1, w * 0.3, a + Math.PI / 2, a - Math.PI / 2, true); c.lineTo(x0 - nx, y0 - ny); c.closePath(); };
  switch (sp) {
    case 'goat': return { paths: [hoof(11, 22), mir(hoof(11, 22))] };
    case 'boar': return { paths: [hoof(15, 28), mir(hoof(15, 28)), (c) => { c.moveTo(-22, 36); c.arc(-22, 36, 5, 0, 7); }, (c) => { c.moveTo(27, 36); c.arc(22, 36, 5, 0, 7); }] };
    case 'junglefowl': return { paths: [toe(0, 4, 0, -34, 7), toe(0, 4, -22, -26, 7), toe(0, 4, 22, -26, 7), toe(0, 6, 0, 20, 5.5), (c) => { c.moveTo(18, 18); c.arc(14, 18, 3.4, 0, 7); }] };
    case 'seabird': return { paths: [(c) => { c.moveTo(0, 12); c.lineTo(-30, -24); c.quadraticCurveTo(-18, -14, -9, -28); c.quadraticCurveTo(0, -16, 9, -28); c.quadraticCurveTo(18, -14, 30, -24); c.closePath(); }, toe(0, 12, 0, -30, 4)] };
    case 'rat': return { paths: [(c) => { c.moveTo(6, 8); c.arc(0, 8, 6, 0, 7); }, ...[[-9, -4], [-3, -9], [3, -9], [9, -4], [-12, 6]].map(([x, y]) => (c) => { c.moveTo(x + 2.4, y); c.arc(x, y, 2.4, 0, 7); })] };
    case 'monitor': return { paths: [(c) => { c.ellipse(0, 4, 11, 9, 0, 0, 7); }, ...[-70, -35, 0, 35, 70].map((d) => { const a = (d - 90) * Math.PI / 180; return toe(Math.cos(a) * 8, 4 + Math.sin(a) * 8, Math.cos(a) * 28, 4 + Math.sin(a) * 28, 5.4); })] };
    default: return { paths: [] };
  }
}
function leafDry(ctx, x, y, len, rot, ps) { leafShape(ctx, x, y, len, rot, ps.green ? LEAF : '#b19251', ps.green ? LEAF_D : '#7d6a36'); }

export function drawTrackCard(ctx, species, kind, age, box = { x: 0, y: 0, w: 360, h: 260 }, { K = 0 } = {}) {
  ACT = ORANGE;
  const sp = SPECIES[species] ? species : 'goat', info = SPECIES[sp], ps = ageStyle(age || 'fresh'), sc = kind === 'scat';
  const CW = 480, CH = Math.round(480 * box.h / box.w);
  ctx.save(); ctx.translate(box.x, box.y); ctx.scale(box.w / CW, box.w / CW);
  ctx.beginPath(); ctx.roundRect(0, 0, CW, CH, 16); ctx.fillStyle = '#fbf6e6'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke(); ctx.save(); ctx.clip();
  // ground patch
  const sandy = sp === 'seabird' || sp === 'coconut_crab';
  const gc = sandy ? (ps.soft === 0 ? '#cdbb8c' : ps.soft === 1 ? '#dccb9e' : '#e6d9b2') : ps.ground;
  ctx.beginPath(); ctx.roundRect(14, 14, CW - 28, CH - 74, 12); ctx.fillStyle = gc; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(42,41,35,.5)'; ctx.stroke();
  ctx.save(); ctx.clip(); dots(ctx, 14, 14, CW - 14, CH - 60, 70, 17, 'rgba(90,66,34,.22)', 2.2); dots(ctx, 14, 14, CW - 14, CH - 60, 30, 18, 'rgba(255,255,255,.22)', 2);
  const ground = { x: 14, y: 14, w: CW - 28, h: CH - 74 };
  const cx0 = CW / 2, cy0 = ground.y + ground.h / 2; let focus = [cx0, cy0, 70];
  if (!sc) {
    const sh = trackShapes(sp), scale = { goat: 1.35, boar: 1.35, junglefowl: 1.35, seabird: 1.4, rat: 1.7, monitor: 1.3 }[sp] || 1;
    // placement along a diagonal walk, alternating left/right
    const walk = sp === 'junglefowl' || sp === 'seabird' ? [[140, 205, 0.15], [240, 135, 0.05], [330, 75, -0.1]] : [[150, 200, 0.12], [290, 160, -0.05], [330, 66, 0.1]];
    if (sp === 'coconut_crab') {
      // drag groove + paired dots
      ctx.save(); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(60, 170); ctx.bezierCurveTo(160, 150, 260, 190, 420, 150); ctx.lineWidth = 16; ctx.strokeStyle = ps.fill; ctx.globalAlpha = 0.55; ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 3; ctx.strokeStyle = ps.rim; ctx.setLineDash([2, 5]); ctx.stroke(); ctx.restore();
      for (let i = 0; i < 4; i++) for (const k of [-1, 1]) { const x = 110 + i * 82, y = 170 + Math.sin(i * 1.3) * 16 + k * 26 - i * 2; stamp(ctx, (c) => { c.moveTo(x + 8, y); c.ellipse(x, y, 8, 5.5, 0.5 * k, 0, 7); }, ps); if (i === 0 && k === 1) focus = [x, y, 44]; }
    } else {
      walk.forEach(([x, y, a], i) => {
        const flip = i % 2 ? -1 : 1, s2 = scale * (i === 2 ? 0.92 : 1);
        ctx.save(); ctx.translate(x, y); ctx.rotate(a + 0.35); ctx.scale(s2 * flip, s2);
        sh.paths.forEach((p) => stamp(ctx, p, ps));
        if (sp === 'monitor') { ctx.restore(); ctx.save(); ctx.translate(x, y); }
        ctx.restore();
        if (i === 0) focus = [x, y, 52 * scale];
      });
      if (sp === 'monitor') { ctx.save(); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(90, 250); ctx.bezierCurveTo(180, 215, 220, 255, 290, 200); ctx.bezierCurveTo(330, 170, 360, 140, 420, 110); ctx.lineWidth = 11; ctx.strokeStyle = ps.fill; ctx.globalAlpha = 0.5; ctx.stroke(); ctx.restore(); }
    }
    // age: crumble + leaves
    if (ps.crumble) { const R = rng(31); ctx.fillStyle = gc; for (let i = 0; i < 70 * ps.crumble; i++) { ctx.beginPath(); ctx.arc(focus[0] + (R() - 0.5) * 220, focus[1] + (R() - 0.5) * 130, 1.6 + R() * 2.4, 0, 7); ctx.globalAlpha = 0.7; ctx.fill(); } ctx.globalAlpha = 1; }
    if (ps.gloss) { const R = rng(41); ctx.strokeStyle = 'rgba(255,255,255,.65)'; ctx.lineWidth = 2; for (let i = 0; i < 6; i++) { const x = focus[0] - 30 + R() * 60, y = focus[1] - 24 + R() * 40; ctx.beginPath(); ctx.arc(x, y, 4 + R() * 3, 3.6, 5); ctx.stroke(); } }
  } else {
    scatDraw(ctx, sp, ps, gc, cx0, cy0, ground); focus = [cx0, cy0, 90];
  }
  if (ps.leaves) { const R = rng(51); for (let i = 0; i < ps.leaves; i++) leafDry(ctx, focus[0] - 70 + R() * 140, focus[1] - 50 + R() * 90, 52 + R() * 20, R() * 6.28, { green: i === 2 }); }
  ctx.restore();
  // footer
  ctx.fillStyle = '#efe6c8'; ctx.fillRect(0, CH - 52, CW, 52);
  ctx.beginPath(); ctx.moveTo(0, CH - 52); ctx.lineTo(CW, CH - 52); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(42,41,35,.35)'; ctx.stroke();
  if (K >= 1) txt(ctx, sc ? info.scat : info.track, CW / 2, CH - 30, { size: 17, halo: '#efe6c8' });
  if (K >= 2) {
    const fr = focus[2] * 0.78;
    ctx.save(); ctx.setLineDash([7, 6]); ctx.lineWidth = 3; ctx.strokeStyle = TEAL; ctx.beginPath(); ctx.arc(focus[0], focus[1], fr, 0, 7); ctx.stroke(); ctx.restore();
    const tx = Math.min(CW - 80, focus[0] + fr + 56), ty = Math.max(34, focus[1] - fr - 16);
    arrow(ctx, tx - 38, ty + 8, focus[0] + fr * 0.72, focus[1] - fr * 0.72, TEAL, 2.4);
    txt(ctx, 'ふちの ようす', tx, ty, { size: 13, color: TEAL });
  }
  if (K >= 3) {
    txt(ctx, `${info.jp}　${AGE_JP[age] || ''}`, 24, 34, { size: 20, align: 'left', color: INK });
    txt(ctx, AGE_CUE[age] || '', CW / 2, CH - 12, { size: 12, color: TEAL, halo: '#efe6c8' });
    if (!sc) { arrow(ctx, 50, 150, 50, 90, TEAL, 3.4); txt(ctx, '向き', 50, 170, { size: 12, color: TEAL }); }
  }
  ctx.restore(); ctx.restore();
}

function scatDraw(ctx, sp, ps, gc, cx, cy, ground) {
  const age = ps.soft, R = rng(7 + sp.length);
  const fillC = { 0: '#43362a', 1: '#6b5b49', 2: '#aaa08a' }[age];
  const blob = (x, y, rx, ry, rot, c = fillC) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, 7); ctx.fillStyle = c; ctx.fill(); ctx.lineWidth = age === 2 ? 1.4 : 2.4; ctx.strokeStyle = age === 2 ? 'rgba(90,80,60,.6)' : 'rgba(30,22,14,.85)'; ctx.stroke();
    if (age === 0) { ctx.beginPath(); ctx.arc(-rx * 0.25, -ry * 0.3, Math.min(rx, ry) * 0.4, 3.5, 5.0); ctx.lineWidth = 1.8; ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.stroke(); }
    if (age === 2) { ctx.beginPath(); ctx.moveTo(-rx * 0.5, -ry * 0.2); ctx.lineTo(0, ry * 0.2); ctx.lineTo(rx * 0.4, -ry * 0.1); ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(90,80,60,.6)'; ctx.stroke(); }
    ctx.restore();
  };
  const ctx2 = ctx;
  void ctx2;
  switch (sp) {
    case 'goat': for (let i = 0; i < 16; i++) blob(cx - 70 + R() * 140, cy - 40 + R() * 80, 9, 6.5, R() * 3); break;
    case 'boar': [[-50, 8, 0.2], [10, -18, -0.15], [60, 22, 0.35]].forEach(([x, y, r]) => { ctx.save(); ctx.translate(cx + x, cy + y); ctx.rotate(r); ctx.beginPath(); ctx.roundRect(-34, -13, 68, 26, 12); ctx.fillStyle = fillC; ctx.fill(); ctx.lineWidth = age === 2 ? 1.4 : 2.6; ctx.strokeStyle = age === 2 ? 'rgba(90,80,60,.6)' : 'rgba(30,22,14,.85)'; ctx.stroke(); if (age === 0) { ctx.beginPath(); ctx.moveTo(-20, -6); ctx.lineTo(10, -6); ctx.lineWidth = 2.4; ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.stroke(); } ctx.restore(); }); break;
    case 'junglefowl': [[-60, 10], [0, -22], [58, 14], [8, 36]].forEach(([x, y], i) => { ctx.save(); ctx.translate(cx + x, cy + y); ctx.beginPath(); for (let a = 0; a < 11; a += 0.2) { const r = 3 + a * 1.9; ctx[a ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r * 0.8); } ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(30,22,14,.85)'; ctx.stroke(); ctx.lineWidth = 6; ctx.strokeStyle = fillC; ctx.stroke(); ctx.restore(); blob(cx + x + 14, cy + y - 12, 6, 4.5, 0.4, age === 2 ? '#e8e2d2' : '#f6f2e6'); }); break;
    case 'seabird': { ctx.save(); ctx.translate(cx, cy); ctx.beginPath(); smoothPath(ctx, [[-70, 0], [-48, -28], [-10, -34], [30, -22], [68, -4], [48, 22], [10, 34], [-34, 26]], true, 0.2); ctx.fillStyle = age === 2 ? '#f0ece0' : '#faf7ee'; ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = 'rgba(90,80,60,.8)'; ctx.stroke(); for (const [x, y, r] of [[-86, 16, 7], [82, -24, 6], [60, 40, 5], [-20, 48, 5]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.stroke(); } blob(0, 0, 22, 14, 0.3, age === 2 ? '#a8a08a' : '#5b5a4c'); ctx.restore(); break; }
    case 'rat': for (let i = 0; i < 18; i++) blob(cx - 60 + R() * 120, cy - 35 + R() * 70, 6.5, 2.8, R() * 3); break;
    case 'monitor': [[-34, -10, 0.3], [30, 22, -0.25]].forEach(([x, y, r]) => { blob(cx + x, cy + y, 42, 12, r); blob(cx + x + Math.cos(r) * 50, cy + y + Math.sin(r) * 50 * 0.9, 12, 9, r, '#f2eee0'); }); break;
    case 'coconut_crab': for (let i = 0; i < 26; i++) { const x = cx - 70 + R() * 140, y = cy - 40 + R() * 80; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 8 + R() * 8, y + 2); ctx.lineTo(x + 6, y + 8 + R() * 5); ctx.lineTo(x - 3, y + 6); ctx.closePath(); ctx.fillStyle = age === 0 ? '#7b5a35' : age === 1 ? '#977b55' : '#c1ab82'; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(40,30,16,.7)'; ctx.stroke(); } break;
    default: break;
  }
}
