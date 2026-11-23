// ui/butcher-art.js — 2D side-view "paper diagrams" for butchering (DESIGN §25).
// Pure canvas drawing, no game imports. Logical canvas 800×500; geometry is normalized (0..1 of the drawing box,
// box aspect 1.6). Animals face LEFT. Keep every body inside y 0.08..0.82 — the bottom strip (y≈0.91) is where
// taken-out contents / the hide are laid on a leaf.
//
// View rules (§25.5):
//   mild   – flat single-colour silhouette, numbered dotted lines that turn solid when traced, leaf parcel, neutral icons. NO red.
//   normal – ink-outline paper drawing; traced lines get a thin red-brown edge (#8a3b34, tiny accent); contents = one rounded lump.
//   skip   – only drawPortions / a big parcel is used.

export const PAPER = '#f7f0dd', INK = '#2a2923', TEAL = '#1f7f86', LEAF = '#6aa35a';
const EDGE = '#8a3b34';            // normal view only, tiny accent
const SIL = '#a9b8a4', SIL_D = '#7f9382', INK_SOFT = '#4f5d4e', LEAF_D = '#4a8040', TIE = '#8a7a4a';
const FONT = '"Zen Maru Gothic","Hiragino Maru Gothic ProN","Noto Sans JP",sans-serif';

// ---------------------------------------------------------------- geometry
export const DIAGRAMS = {
  goat: {
    outline: [[.06, .36], [.09, .31], [.14, .27], [.19, .25], [.25, .27], [.31, .30], [.40, .29], [.55, .30], [.70, .29], [.80, .30], [.86, .34], [.88, .38],
      [.86, .46], [.85, .58], [.84, .78], [.79, .79], [.78, .64], [.74, .78], [.70, .79], [.69, .58], [.58, .57], [.47, .58], [.46, .78], [.42, .79], [.41, .60],
      [.38, .60], [.38, .78], [.34, .79], [.33, .58], [.29, .52], [.26, .46], [.21, .45], [.13, .43], [.08, .41]],
    deco: [
      { k: 'line', w: 10, pts: [[.20, .27], [.21, .18], [.27, .12], [.34, .15]] },                    // horn
      { k: 'poly', pts: [[.24, .28], [.19, .35], [.26, .34]] },                                          // ear
      { k: 'poly', pts: [[.14, .43], [.12, .51], [.17, .46]] },                                          // beard
      { k: 'line', w: 3, pts: [[.86, .34], [.90, .27], [.91, .31]] },                                    // tail
      { k: 'eye', pts: [[.14, .33]] }],
    steps: {
      kill: { lines: [], points: [[.17, .30]], label: 0 },
      bleed: { lines: [[[.24, .43], [.28, .47], [.32, .51]]], points: [], label: 1 },
      open: { lines: [[[.34, .54], [.42, .55], [.52, .54], [.62, .53], [.70, .53]]], points: [], label: 2 },
      gut: { lines: [[[.55, .47], [.60, .45]]], points: [[.54, .47], [.56, .91]], label: 3 },
      skin: { lines: [[[.40, .58], [.395, .70], [.39, .77]], [[.76, .58], [.745, .70], [.74, .77]], [[.30, .33], [.45, .325], [.60, .325], [.78, .33]]], points: [], label: 4 },
      portion: { lines: [], points: [], label: 5 },
    },
    noTouch: [{ x: .46, y: .44, rx: .07, ry: .06 }, { x: .63, y: .46, rx: .07, ry: .05 }, { x: .39, y: .42, rx: .035, ry: .035 }],
    joints: [[.33, .40], [.40, .55], [.67, .45], [.79, .50]],
    bundle: { x: .54, y: .45, r: .075 },
  },
  boar: {
    outline: [[.05, .52], [.07, .46], [.12, .43], [.17, .37], [.22, .32], [.27, .31], [.33, .28], [.42, .24], [.55, .27], [.70, .28], [.82, .31], [.88, .36], [.90, .42],
      [.87, .60], [.86, .78], [.81, .79], [.80, .64], [.77, .64], [.76, .78], [.71, .79], [.70, .64], [.58, .66], [.47, .67], [.46, .78], [.41, .79], [.40, .67], [.37, .67],
      [.36, .78], [.31, .79], [.30, .62], [.25, .60], [.19, .58], [.12, .57], [.07, .56]],
    deco: [
      { k: 'line', w: 4, pts: [[.11, .55], [.09, .49], [.12, .45]] },                                    // tusk
      { k: 'poly', pts: [[.25, .31], [.26, .21], [.32, .28]] },                                          // ear
      { k: 'line', w: 3, pts: [[.89, .38], [.93, .36], [.93, .42]] },                                    // tail
      { k: 'ticks', pts: [[.34, .285], [.38, .26], [.42, .245], [.47, .25], [.52, .262], [.57, .272], [.62, .275], [.67, .28], [.72, .285], [.77, .295]] },
      { k: 'eye', pts: [[.17, .43]] }],
    steps: {
      kill: { lines: [], points: [[.19, .39]], label: 0 },
      bleed: { lines: [[[.22, .55], [.27, .57], [.32, .60]]], points: [], label: 1 },
      open: { lines: [[[.33, .62], [.42, .63], [.52, .63], [.62, .62], [.72, .60]]], points: [], label: 2 },
      gut: { lines: [[[.57, .52], [.63, .50]]], points: [[.55, .52], [.58, .91]], label: 3 },
      skin: { lines: [[[.38, .67], [.375, .73], [.37, .77]], [[.73, .65], [.725, .72], [.72, .77]], [[.34, .31], [.50, .29], [.66, .31], [.84, .35]]], points: [], label: 4 },
      portion: { lines: [], points: [], label: 5 },
    },
    noTouch: [{ x: .47, y: .52, rx: .08, ry: .065 }, { x: .65, y: .54, rx: .08, ry: .055 }, { x: .40, y: .50, rx: .04, ry: .04 }],
    joints: [[.34, .46], [.42, .62], [.70, .48], [.82, .52]],
    bundle: { x: .55, y: .50, r: .085 },
  },
  small: {
    outline: [[.16, .58], [.19, .50], [.24, .44], [.28, .40], [.33, .38], [.38, .40], [.46, .37], [.58, .36], [.70, .40], [.78, .48], [.80, .60], [.78, .70], [.82, .77],
      [.74, .78], [.66, .72], [.58, .72], [.48, .72], [.44, .78], [.38, .78], [.38, .70], [.30, .68], [.26, .66], [.19, .65]],
    deco: [
      { k: 'poly', pts: [[.30, .40], [.29, .22], [.36, .24], [.36, .39]] },                              // ear
      { k: 'line', w: 3, pts: [[.80, .55], [.88, .56], [.94, .50]] },                                    // tail
      { k: 'line', w: 1.5, pts: [[.17, .58], [.09, .55]] }, { k: 'line', w: 1.5, pts: [[.17, .60], [.09, .62]] },
      { k: 'eye', pts: [[.25, .50]] }],
    steps: {
      kill: { lines: [], points: [[.27, .46]], label: 0 },
      bleed: { lines: [[[.24, .60], [.28, .63], [.33, .66]]], points: [], label: 1 },
      open: { lines: [[[.34, .65], [.45, .68], [.56, .68], [.66, .67]]], points: [], label: 2 },
      gut: { lines: [[[.54, .58], [.59, .57]]], points: [[.52, .58], [.55, .91]], label: 3 },
      skin: { lines: [[[.40, .70], [.39, .76]], [[.76, .68], [.78, .75]], [[.30, .42], [.45, .40], [.60, .40], [.74, .46]]], points: [], label: 4 },
      portion: { lines: [], points: [], label: 5 },
    },
    noTouch: [{ x: .46, y: .58, rx: .06, ry: .045 }, { x: .62, y: .60, rx: .06, ry: .04 }, { x: .40, y: .57, rx: .03, ry: .03 }],
    joints: [[.38, .50], [.50, .62], [.66, .52], [.74, .62]],
    bundle: { x: .52, y: .57, r: .065 },
  },
  fish: {
    outline: [[.07, .50], [.11, .42], [.18, .35], [.28, .30], [.36, .25], [.38, .17], [.43, .22], [.46, .14], [.51, .21], [.55, .15], [.60, .25], [.68, .34], [.76, .44],
      [.89, .27], [.86, .50], [.89, .73], [.76, .56], [.66, .66], [.56, .72], [.46, .74], [.44, .80], [.40, .74], [.34, .70], [.24, .64], [.16, .60], [.10, .56]],
    deco: [
      { k: 'line', w: 2.5, pts: [[.27, .38], [.30, .50], [.27, .62]] },                                   // gill
      { k: 'line', w: 2, pts: [[.07, .50], [.12, .51]] },                                                // mouth
      { k: 'poly', pts: [[.30, .56], [.38, .65], [.31, .66]] },                                          // pectoral fin
      { k: 'line', w: 1.5, pts: [[.50, .30], [.52, .50], [.50, .68]] }, { k: 'line', w: 1.5, pts: [[.60, .34], [.62, .48], [.60, .62]] }, // stripes
      { k: 'eye', pts: [[.17, .46]] }],
    steps: {
      stun: { lines: [], points: [[.21, .42]], label: 1 },
      scale: { lines: [[[.66, .46], [.52, .47], [.38, .48]]], points: [], label: 2 },
      gut: { lines: [[[.29, .62], [.40, .68], [.52, .70], [.62, .66]]], points: [[.44, .62], [.5, .91]], label: 3 },
    },
    noTouch: [{ x: .40, y: .57, rx: .05, ry: .04 }, { x: .54, y: .58, rx: .06, ry: .04 }],
    joints: [[.30, .50], [.72, .46]],
    bundle: { x: .46, y: .60, r: .05 },
  },
  bird: {
    outline: [[.12, .26], [.16, .22], [.19, .17], [.23, .16], [.27, .18], [.29, .25], [.31, .33], [.37, .38], [.50, .40], [.62, .38], [.70, .28], [.78, .14], [.86, .12], [.84, .22],
      [.90, .24], [.84, .32], [.78, .46], [.72, .58], [.62, .67], [.50, .69], [.40, .66], [.32, .58], [.29, .48], [.27, .38], [.23, .30], [.17, .27]],
    deco: [
      { k: 'poly', pts: [[.19, .17], [.20, .09], [.23, .12], [.25, .08], [.26, .16]] },                  // comb
      { k: 'poly', pts: [[.17, .27], [.17, .34], [.21, .29]] },                                          // wattle
      { k: 'wing', pts: [[.40, .46], [.52, .44], [.62, .50], [.55, .59], [.44, .56]] },
      { k: 'line', w: 3, pts: [[.50, .69], [.49, .80], [.43, .80]] }, { k: 'line', w: 3, pts: [[.60, .67], [.60, .80], [.54, .80]] },
      { k: 'line', w: 1.5, pts: [[.74, .30], [.82, .20]] }, { k: 'line', w: 1.5, pts: [[.74, .38], [.84, .28]] },
      { k: 'eye', pts: [[.22, .21]] }],
    steps: {
      pluck: { lines: [], points: [[.55, .46], [.45, .52], [.60, .57], [.66, .42]], label: 1 },
      gut: { lines: [[[.34, .58], [.42, .64], [.52, .65]]], points: [[.46, .58], [.5, .91]], label: 2 },
    },
    noTouch: [{ x: .52, y: .56, rx: .06, ry: .045 }],
    joints: [],
    bundle: { x: .46, y: .55, r: .06 },
  },
};

export const lineToCanvas = (pt, box) => [box.x + pt[0] * box.w, box.y + pt[1] * box.h];

// ---------------------------------------------------------------- helpers
const mapPts = (pts, box) => pts.map((p) => lineToCanvas(p, box));

function smooth(ctx, pts, closed, k = 0.15) {
  const n = pts.length;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  const at = (i) => pts[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  const end = closed ? n : n - 1;
  for (let i = 0; i < end; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k, p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k, p2[0], p2[1]);
  }
  if (closed) ctx.closePath();
}

function polyline(ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); }

/** first `frac` (0..1) of a polyline's length */
function partial(pts, frac) {
  if (frac >= 0.999) return pts;
  let total = 0; const seg = [];
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); total += d; }
  let rest = total * Math.max(0, frac); const out = [pts[0]];
  for (let i = 0; i < seg.length; i++) {
    if (rest >= seg[i]) { out.push(pts[i + 1]); rest -= seg[i]; continue; }
    const t = seg[i] ? rest / seg[i] : 0;
    out.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]);
    break;
  }
  return out;
}

const wobble = (pts, a) => { const out = []; for (let i = 0; i < pts.length - 1; i++) { out.push(pts[i]); const m = [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2 + (i % 2 ? a : -a)]; out.push(m); } out.push(pts[pts.length - 1]); return out; };

function badge(ctx, x, y, text, u) {
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, 12 * u, 0, Math.PI * 2);
  ctx.fillStyle = TEAL; ctx.fill(); ctx.lineWidth = 2 * u; ctx.strokeStyle = PAPER; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = `700 ${15 * u}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(text), x, y + 1 * u);
  ctx.restore();
}

function ellipse(ctx, cx, cy, rx, ry) { ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); }

// ---------------------------------------------------------------- parcels / lumps
/** leaf-wrapped parcel (mild/skip) centred at cx,cy with half-width r */
function parcel(ctx, cx, cy, r, tag, u = 1) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.moveTo(-r * 1.1, 0);
  ctx.bezierCurveTo(-r * 0.7, -r * 0.95, r * 0.7, -r * 0.95, r * 1.1, 0);
  ctx.bezierCurveTo(r * 0.7, r * 0.95, -r * 0.7, r * 0.95, -r * 1.1, 0);
  ctx.closePath();
  ctx.fillStyle = LEAF; ctx.fill(); ctx.lineWidth = 2 * u; ctx.strokeStyle = LEAF_D; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-r * 0.95, 0); ctx.lineTo(r * 0.95, 0);
  ctx.moveTo(-r * 0.4, 0); ctx.lineTo(-r * 0.1, -r * 0.45); ctx.moveTo(r * 0.1, 0); ctx.lineTo(r * 0.4, -r * 0.45);
  ctx.moveTo(-r * 0.4, 0); ctx.lineTo(-r * 0.1, r * 0.45); ctx.moveTo(r * 0.1, 0); ctx.lineTo(r * 0.4, r * 0.45);
  ctx.lineWidth = 1.5 * u; ctx.strokeStyle = LEAF_D; ctx.stroke();
  // tie
  ctx.beginPath(); ctx.moveTo(0, -r * 0.62); ctx.lineTo(0, r * 0.62); ctx.lineWidth = 3 * u; ctx.strokeStyle = TIE; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, -r * 0.62, 3 * u, 0, 7); ctx.fillStyle = TIE; ctx.fill();
  if (tag) {
    const w = (tag.length * 13 + 12) * u, hh = 20 * u;
    ctx.fillStyle = PAPER; ctx.strokeStyle = INK_SOFT; ctx.lineWidth = 1.5 * u;
    ctx.beginPath(); ctx.roundRect(-w / 2, r * 0.45, w, hh, 5 * u); ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK; ctx.font = `700 ${13 * u}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(tag, 0, r * 0.45 + hh / 2 + 1 * u);
  }
  ctx.restore();
}

/** ONE rounded lump (normal view) */
function lump(ctx, cx, cy, r, u = 1, tilt = 0) {
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(tilt);
  smooth(ctx, [[-r, 0], [-r * 0.6, -r * 0.72], [r * 0.2, -r * 0.8], [r * 0.9, -r * 0.3], [r * 0.85, r * 0.45], [r * 0.1, r * 0.8], [-r * 0.7, r * 0.55]], true, 0.2);
  ctx.fillStyle = '#c9a58f'; ctx.fill(); ctx.lineWidth = 2.2 * u; ctx.strokeStyle = INK; ctx.stroke();
  ctx.beginPath(); ctx.arc(-r * 0.15, -r * 0.1, r * 0.4, Math.PI * 1.1, Math.PI * 1.7); ctx.lineWidth = 1.5 * u; ctx.strokeStyle = 'rgba(42,41,35,.45)'; ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- main carcass drawing
function bodyShape(ctx, d, box, view, st) {
  const pts = mapPts(d.outline, box);
  const u = box.w / 800;
  smooth(ctx, pts, true);
  const skinned = !!st.skinned;
  if (view === 'mild') { ctx.fillStyle = skinned ? '#c9d3c6' : SIL; ctx.fill(); ctx.lineWidth = 2.5 * u; ctx.strokeStyle = SIL_D; if (skinned) ctx.setLineDash([6 * u, 5 * u]); ctx.stroke(); ctx.setLineDash([]); }
  else { ctx.fillStyle = skinned ? '#e6d2bb' : '#f1e6c8'; ctx.fill(); ctx.lineWidth = 3 * u; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke(); }
  return pts;
}

function decorate(ctx, d, box, view) {
  const u = box.w / 800;
  const col = view === 'mild' ? SIL_D : INK;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const o of d.deco || []) {
    const pts = mapPts(o.pts, box);
    if (o.k === 'line') { smooth(ctx, pts, false, 0.2); ctx.lineWidth = (o.w || 3) * u; ctx.strokeStyle = col; ctx.stroke(); }
    else if (o.k === 'poly') {
      smooth(ctx, pts, true, 0.18);
      ctx.fillStyle = view === 'mild' ? SIL_D : '#e4d6b4'; ctx.fill(); ctx.lineWidth = 2.2 * u; ctx.strokeStyle = view === 'mild' ? SIL_D : INK; ctx.stroke();
    } else if (o.k === 'wing') {
      smooth(ctx, pts, true, 0.2); ctx.lineWidth = 2 * u; ctx.strokeStyle = view === 'mild' ? SIL_D : INK; ctx.stroke();
    } else if (o.k === 'ticks') {
      ctx.beginPath();
      for (const p of pts) { ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] - 5 * u, p[1] - 17 * u); }
      ctx.lineWidth = 2.5 * u; ctx.strokeStyle = col; ctx.stroke();
    } else if (o.k === 'eye') {
      ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], 4.5 * u, 0, 7);
      ctx.fillStyle = view === 'mild' ? PAPER : INK; ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * drawCarcass(ctx, species, view, state, box)
 * state: { step, done:{}, traced:{stepId:[0..1,…]}, knowledge:0..3, showNoTouch, cutDeep, removed, skinned, portions }
 */
export function drawCarcass(ctx, species, view, state = {}, box = { x: 0, y: 0, w: 800, h: 500 }) {
  const d = DIAGRAMS[species] || DIAGRAMS.small;
  const st = { done: {}, traced: {}, knowledge: 0, ...state };
  const u = box.w / 800;
  ctx.save();
  // paper card
  ctx.beginPath(); ctx.roundRect(box.x, box.y, box.w, box.h, 14 * u); ctx.fillStyle = PAPER; ctx.fill();
  ctx.lineWidth = 2 * u; ctx.strokeStyle = 'rgba(42,41,35,.25)'; ctx.stroke();
  ctx.save(); ctx.beginPath(); ctx.roundRect(box.x, box.y, box.w, box.h, 14 * u); ctx.clip();

  if (view === 'skip') { // a single wrapped parcel
    parcel(ctx, box.x + box.w / 2, box.y + box.h / 2, 120 * u, 'ていねいに 下ごしらえ', u);
    ctx.restore(); ctx.restore(); return;
  }

  const kn = st.knowledge | 0;
  // ground line
  ctx.beginPath(); ctx.moveTo(box.x + box.w * .1, box.y + box.h * .83); ctx.lineTo(box.x + box.w * .9, box.y + box.h * .83);
  ctx.setLineDash([2 * u, 8 * u]); ctx.lineWidth = 2 * u; ctx.strokeStyle = 'rgba(42,41,35,.2)'; ctx.lineCap = 'round'; ctx.stroke(); ctx.setLineDash([]);

  bodyShape(ctx, d, box, view, st);
  decorate(ctx, d, box, view);

  // hatch lines on the normal drawing (belly shade)
  if (view === 'normal') {
    const o = d.outline; const ys = o.map((p) => p[1]); const top = Math.min(...ys);
    ctx.save(); ctx.beginPath(); smooth(ctx, mapPts(o, box), true); ctx.clip();
    ctx.strokeStyle = 'rgba(42,41,35,.14)'; ctx.lineWidth = 1.2 * u;
    for (let i = 0; i < 14; i++) { const x = box.x + box.w * (.2 + i * .05); ctx.beginPath(); ctx.moveTo(x, box.y + box.h * (top + .02)); ctx.lineTo(x - 18 * u, box.y + box.h * (top + .06)); ctx.stroke(); }
    ctx.restore();
  }

  // portions: cut gaps across the body
  const np = st.portions | 0;
  if (np > 0 && d.joints.length) {
    ctx.save(); ctx.lineCap = 'round';
    d.joints.slice(0, np).forEach((j) => {
      const c = lineToCanvas(j, box);
      ctx.beginPath(); ctx.moveTo(c[0] - 4 * u, c[1] - 52 * u); ctx.lineTo(c[0] + 4 * u, c[1] + 52 * u);
      ctx.lineWidth = 6 * u; ctx.strokeStyle = PAPER; ctx.stroke();
      ctx.lineWidth = 1.6 * u; ctx.strokeStyle = view === 'mild' ? SIL_D : INK; ctx.setLineDash([3 * u, 4 * u]); ctx.stroke(); ctx.setLineDash([]);
    });
    ctx.restore();
  }

  // contents
  const bd = d.bundle; const bc = lineToCanvas([bd.x, bd.y], box); const br = bd.r * box.w;
  const opened = st.done.open || st.done.gut || st.removed;
  if (opened && !st.removed) {
    if (view === 'mild') parcel(ctx, bc[0], bc[1], br, null, u);
    else lump(ctx, bc[0], bc[1], br, u, st.cutDeep ? 0.35 : 0);
  }
  if (st.removed) {
    // empty hollow where it was + contents laid on a leaf below
    ellipse(ctx, bc[0], bc[1], br * 1.1, br * 0.8); ctx.setLineDash([4 * u, 5 * u]); ctx.lineWidth = 1.6 * u;
    ctx.strokeStyle = view === 'mild' ? SIL_D : 'rgba(42,41,35,.5)'; ctx.stroke(); ctx.setLineDash([]);
    const lc = lineToCanvas([bd.x, .91], box);
    ctx.beginPath(); ctx.ellipse(lc[0], lc[1], br * 1.9, br * 0.75, 0, 0, 7); ctx.fillStyle = 'rgba(106,163,90,.35)'; ctx.fill();
    if (view === 'mild') parcel(ctx, lc[0], lc[1], br, null, u); else lump(ctx, lc[0], lc[1], br, u, 0);
  }
  if (st.skinned) { // the hide, folded, laid at the lower left
    const hc = lineToCanvas([.18, .91], box); const hw = box.w * .075;
    smooth(ctx, [[hc[0] - hw, hc[1]], [hc[0] - hw * .4, hc[1] - hw * .6], [hc[0] + hw * .6, hc[1] - hw * .5], [hc[0] + hw, hc[1] + hw * .1], [hc[0] + hw * .2, hc[1] + hw * .6], [hc[0] - hw * .7, hc[1] + hw * .4]], true, 0.2);
    ctx.fillStyle = view === 'mild' ? '#bccab8' : '#cdb48a'; ctx.fill(); ctx.lineWidth = 2 * u; ctx.strokeStyle = view === 'mild' ? SIL_D : INK; ctx.stroke();
  }

  // ---- step guidance
  const stepIds = Object.keys(d.steps);
  const cur = st.step && d.steps[st.step];

  // finished steps' lines: solid
  for (const id of stepIds) {
    if (!st.done[id] || id === st.step) continue;
    const sdef = d.steps[id];
    sdef.lines.forEach((ln) => drawTraced(ctx, mapPts(ln, box), 1, view, u, id === 'open' && st.cutDeep));
  }
  if (cur) {
    const lines = cur.lines;
    const tr = st.traced[st.step] || [];
    lines.forEach((ln, i) => {
      const cp = mapPts(ln, box);
      if (kn >= 2 && !st.done[st.step]) { // dotted guide with number
        polyline(ctx, cp); ctx.setLineDash([5 * u, 7 * u]); ctx.lineWidth = 2.4 * u; ctx.lineCap = 'round';
        ctx.strokeStyle = view === 'mild' ? INK_SOFT : INK; ctx.stroke(); ctx.setLineDash([]);
        if (cur.label) badge(ctx, cp[0][0] - 0 * u, cp[0][1] - 20 * u, cur.label, u);
      }
      const f = st.done[st.step] ? 1 : (tr[i] || 0);
      if (f > 0) drawTraced(ctx, cp, f, view, u, st.step === 'open' && st.cutDeep);
    });
    if (kn >= 2 && !st.done[st.step]) {
      cur.points.forEach((p, i) => {
        const c = lineToCanvas(p, box);
        ctx.beginPath(); ctx.arc(c[0], c[1], 10 * u, 0, 7); ctx.lineWidth = 2.5 * u; ctx.strokeStyle = TEAL; ctx.stroke();
        ctx.beginPath(); ctx.arc(c[0], c[1], 3 * u, 0, 7); ctx.fillStyle = TEAL; ctx.fill();
        if (cur.label && !cur.lines.length && i === 0) badge(ctx, c[0], c[1] - 26 * u, cur.label, u);
      });
    }
    // no-touch zones (K3)
    const nt = st.showNoTouch ?? (st.step === 'open' || st.step === 'gut');
    if (nt && kn >= 3 && !st.removed) {
      ctx.save();
      d.noTouch.forEach((z, i) => {
        const c = lineToCanvas([z.x, z.y], box);
        ellipse(ctx, c[0], c[1], z.rx * box.w, z.ry * box.w); ctx.fillStyle = 'rgba(31,127,134,.12)'; ctx.fill();
        ctx.setLineDash([6 * u, 5 * u]); ctx.lineWidth = 2 * u; ctx.strokeStyle = TEAL; ctx.stroke(); ctx.setLineDash([]);
        if (i === 0) { ctx.fillStyle = TEAL; ctx.font = `700 ${13 * u}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText('さわらない', c[0], c[1] + z.ry * box.w + 16 * u); }
      });
      ctx.restore();
    }
    // joint marks (K3, portion step)
    if (kn >= 3 && st.step === 'portion') {
      d.joints.forEach((j, i) => {
        const c = lineToCanvas(j, box);
        ctx.beginPath(); ctx.moveTo(c[0] - 8 * u, c[1] - 8 * u); ctx.lineTo(c[0] + 8 * u, c[1] + 8 * u); ctx.moveTo(c[0] + 8 * u, c[1] - 8 * u); ctx.lineTo(c[0] - 8 * u, c[1] + 8 * u);
        ctx.lineWidth = 3 * u; ctx.lineCap = 'round'; ctx.strokeStyle = TEAL; ctx.stroke();
        if (i === 0 && d.steps.portion.label) badge(ctx, c[0], c[1] - 24 * u, d.steps.portion.label, u);
      });
    } else if (kn >= 2 && st.step === 'portion') {
      d.joints.forEach((j, i) => { const c = lineToCanvas(j, box); ctx.beginPath(); ctx.arc(c[0], c[1], 6 * u, 0, 7); ctx.setLineDash([3 * u, 3 * u]); ctx.lineWidth = 2 * u; ctx.strokeStyle = TEAL; ctx.stroke(); ctx.setLineDash([]); });
    }
  }
  ctx.restore(); ctx.restore();
}

/** traced portion of a line. mild: solid ink-soft (never "opens"). normal: slit with a thin red-brown edge. */
function drawTraced(ctx, cpts, frac, view, u, wobbly) {
  let pts = partial(cpts, frac);
  if (pts.length < 2) return;
  if (wobbly) pts = wobble(pts, 3 * u);
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (view === 'mild') {
    polyline(ctx, pts); ctx.lineWidth = 3.4 * u; ctx.strokeStyle = INK_SOFT; ctx.stroke();
  } else {
    polyline(ctx, pts); ctx.lineWidth = 4 * u; ctx.strokeStyle = EDGE; ctx.stroke();
    polyline(ctx, pts); ctx.lineWidth = 1.4 * u; ctx.strokeStyle = '#f1e6c8'; ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- portions
const LABEL = { meat: '肉', hide: '皮', bone: '骨', sinew: '腱', fat: '脂', organ: '中身', feather: '羽', fish_fillet: '切り身', scales: 'うろこ' };

/** local-coordinate icon, half-size s. mode 'icon' (flat neutral) or 'draw' (ink drawing). */
function icon(ctx, id, cx, cy, s, mode, u) {
  ctx.save(); ctx.translate(cx, cy); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const flat = mode === 'icon';
  const fill = (normalCol) => { ctx.fillStyle = flat ? '#bccab8' : normalCol; ctx.fill(); ctx.lineWidth = 2.4 * u; ctx.strokeStyle = flat ? SIL_D : INK; ctx.stroke(); };
  const line = (w = 2) => { ctx.lineWidth = w * u; ctx.strokeStyle = flat ? SIL_D : 'rgba(42,41,35,.55)'; ctx.stroke(); };
  switch (id) {
    case 'meat': // chunk with marbling
      smooth(ctx, [[-s, 0], [-s * .7, -s * .7], [s * .2, -s * .8], [s, -s * .2], [s * .8, s * .6], [-s * .3, s * .75]], true, 0.2); fill('#d9bfa6');
      ctx.beginPath(); ctx.moveTo(-s * .5, -s * .1); ctx.quadraticCurveTo(0, -s * .4, s * .5, -s * .05); ctx.moveTo(-s * .3, s * .3); ctx.quadraticCurveTo(0, s * .1, s * .5, s * .35); line(1.6); break;
    case 'hide':
      smooth(ctx, [[-s, -s * .3], [-s * .4, -s * .7], [s * .3, -s * .6], [s, -s * .8], [s * .8, 0], [s, s * .7], [s * .1, s * .5], [-s * .6, s * .8], [-s * .8, s * .2]], true, 0.15); fill('#cdb48a'); break;
    case 'bone':
      ctx.beginPath(); ctx.moveTo(-s * .6, 0); ctx.lineTo(s * .6, 0); ctx.lineWidth = s * .35; ctx.strokeStyle = flat ? SIL_D : INK; ctx.stroke();
      for (const [x, y] of [[-s * .75, -s * .22], [-s * .75, s * .22], [s * .75, -s * .22], [s * .75, s * .22]]) { ctx.beginPath(); ctx.arc(x, y, s * .26, 0, 7); ctx.fillStyle = flat ? '#bccab8' : '#efe6cc'; ctx.fill(); ctx.lineWidth = 2.2 * u; ctx.strokeStyle = flat ? SIL_D : INK; ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(-s * .6, 0); ctx.lineTo(s * .6, 0); ctx.lineWidth = s * .26; ctx.strokeStyle = flat ? '#bccab8' : '#efe6cc'; ctx.stroke(); break;
    case 'sinew':
      ctx.beginPath(); ctx.moveTo(-s, s * .1); for (let i = 0; i < 4; i++) ctx.quadraticCurveTo(-s + (i + .5) * s / 2, i % 2 ? s * .55 : -s * .55, -s + (i + 1) * s / 2, s * .1);
      ctx.lineWidth = 5 * u; ctx.strokeStyle = flat ? SIL_D : INK; ctx.stroke(); ctx.lineWidth = 2.2 * u; ctx.strokeStyle = flat ? '#bccab8' : '#ece0bc'; ctx.stroke(); break;
    case 'fat':
      ellipse(ctx, 0, 0, s * .85, s * .6); fill(flat ? '' : '#f4ecd2'); ctx.beginPath(); ctx.arc(-s * .3, -s * .15, s * .16, 0, 7); line(1.6); break;
    case 'organ':
      lump(ctx, 0, 0, s * .8, u, 0); break;
    case 'feather':
      ctx.beginPath(); ctx.moveTo(-s * .9, s * .6); ctx.quadraticCurveTo(-s * .5, -s * .9, s * .8, -s * .7); ctx.quadraticCurveTo(s * .6, s * .5, -s * .9, s * .6); ctx.closePath(); fill('#e4d6b4');
      ctx.beginPath(); ctx.moveTo(-s * .95, s * .65); ctx.lineTo(s * .6, -s * .5); line(1.8); break;
    case 'fish_fillet':
      smooth(ctx, [[-s, 0], [-s * .4, -s * .5], [s * .5, -s * .4], [s, -s * .1], [s * .5, s * .5], [-s * .4, s * .45]], true, 0.2); fill('#ead9c4');
      ctx.beginPath(); ctx.moveTo(-s * .6, 0); ctx.lineTo(s * .7, -s * .05); line(1.4); break;
    case 'scales':
      for (const [x, y] of [[-s * .45, -s * .2], [s * .1, -s * .3], [s * .5, s * .15], [-s * .1, s * .3], [-s * .6, s * .35]]) { ctx.beginPath(); ctx.arc(x, y, s * .26, Math.PI, 0); ctx.closePath(); ctx.fillStyle = flat ? '#bccab8' : '#e6e2d2'; ctx.fill(); ctx.lineWidth = 2 * u; ctx.strokeStyle = flat ? SIL_D : INK; ctx.stroke(); }
      break;
    default: ellipse(ctx, 0, 0, s * .7, s * .5); fill('#e4d6b4');
  }
  ctx.restore();
}

/** drawPortions(ctx, items, view, box) — items [{id, n}] → a row of icons (mild), cut-shape drawings (normal) or parcels (skip). */
export function drawPortions(ctx, items, view, box = { x: 0, y: 0, w: 800, h: 200 }) {
  const list = (items || []).filter((it) => it && it.n !== 0);
  const u = Math.min(box.w / 800, box.h / 200) * 1.0;
  ctx.save();
  ctx.beginPath(); ctx.roundRect(box.x, box.y, box.w, box.h, 12 * u); ctx.fillStyle = PAPER; ctx.fill();
  ctx.lineWidth = 2 * u; ctx.strokeStyle = 'rgba(42,41,35,.25)'; ctx.stroke();
  if (!list.length) { ctx.restore(); return; }
  const cw = Math.min(box.w / list.length, box.h * 1.1);
  const x0 = box.x + (box.w - cw * list.length) / 2;
  const s = Math.min(cw, box.h) * 0.27;
  list.forEach((it, i) => {
    const cx = x0 + cw * (i + .5), cy = box.y + box.h * 0.42;
    const name = LABEL[it.id] || it.id;
    if (view === 'skip' || (view === 'mild' && (it.id === 'meat' || it.id === 'organ' || it.id === 'fish_fillet'))) {
      parcel(ctx, cx, cy, s * 1.1, view === 'skip' || it.id === 'meat' ? name : null, u * (s / 40));
    } else icon(ctx, it.id, cx, cy, s, view === 'mild' ? 'icon' : 'draw', u * (s / 40));
    ctx.fillStyle = INK; ctx.font = `700 ${Math.max(12, s * .42)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(`${name} ×${it.n ?? 1}`, cx, box.y + box.h * 0.88);
  });
  ctx.restore();
}
