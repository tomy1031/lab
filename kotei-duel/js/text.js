// js/text.js — Japanese text with furigana, for both the page (HTML <ruby>) and canvas textures (cards and VR
// boards). Text is written with the markup {漢字|かんじ}; the reading can be shown or hidden (setting).
//   parse('{要件|ようけん}を決める') → [{ t: '要件', r: 'ようけん' }, { t: 'を決める' }]
//   html('{要件|ようけん}', true) → '<ruby>要件<rt>ようけん</rt></ruby>'
//   layout(ctx, text, maxW, size, { ruby }) → lines; drawLines(ctx, lines, x, y, ...)

export const FONT = '"Noto Sans JP", "Noto Sans CJK JP", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", system-ui, sans-serif';

const RE = /\{([^{}|]+)\|([^{}]+)\}/g;

export function parse(s) {
  const out = [];
  let i = 0;
  s = String(s ?? '');
  for (const m of s.matchAll(RE)) {
    if (m.index > i) out.push({ t: s.slice(i, m.index) });
    out.push({ t: m[1], r: m[2] });
    i = m.index + m[0].length;
  }
  if (i < s.length) out.push({ t: s.slice(i) });
  return out;
}

// the text without readings
export function plain(s) { return String(s ?? '').replace(RE, '$1'); }

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// HTML with <ruby> (or the plain text when ruby is off). **bold** becomes <b>.
export function html(s, ruby = true) {
  let out = '';
  for (const seg of parse(s)) out += seg.r && ruby ? `<ruby>${esc(seg.t)}<rt>${esc(seg.r)}</rt></ruby>` : esc(seg.t);
  return out.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
}

// characters that must not start a line (kinsoku, simplified)
const NO_START = '、。，．・：；？！ー）」』】〕｝〉》)]}.,!?%ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ々〜…';
const NO_END = '（「『【〔｛〈《([{';

// break the text into units that are never split: a ruby group, a run of latin letters/digits, or one character
function units(s) {
  const out = [];
  for (const seg of parse(s)) {
    if (seg.r) { out.push({ t: seg.t, r: seg.r }); continue; }
    const parts = seg.t.match(/\*\*|\n|[A-Za-z0-9][A-Za-z0-9.,:%/+\-'’_#]*|\s|./gu) || [];
    for (const p of parts) out.push({ t: p });
  }
  return out;
}

// Lay out text in lines no wider than maxW. Each line: { runs: [{ t, r, x, w, bold }], w }.
// size: font size in px. opts: { ruby (show readings), weight, lineGap }
export function layout(ctx, s, maxW, size, opts = {}) {
  const weight = opts.weight || 500;
  const fontN = `${weight} ${size}px ${FONT}`;
  const fontB = `900 ${size}px ${FONT}`;
  const lines = [];
  let cur = { runs: [], w: 0 };
  let bold = false;
  const push = () => { lines.push(cur); cur = { runs: [], w: 0 }; };
  for (const u of units(s)) {
    if (u.t === '**') { bold = !bold; continue; }
    if (u.t === '\n') { push(); continue; }
    ctx.font = bold ? fontB : fontN;
    let w = ctx.measureText(u.t).width;
    if (u.r && opts.ruby) {
      ctx.font = `700 ${Math.round(size * 0.5)}px ${FONT}`;
      w = Math.max(w, ctx.measureText(u.r).width * 0.92);
    }
    if (u.t === ' ' && cur.runs.length === 0) continue;
    if (cur.w + w > maxW && cur.runs.length) {
      // keep closing punctuation on the line it closes; keep opening brackets with what follows
      const first = u.t[0];
      if (!u.r && NO_START.includes(first) && cur.w + w <= maxW + size * 0.9) { /* hang it */ }
      else {
        const carry = [];
        const last = cur.runs[cur.runs.length - 1];
        if (last && !last.r && NO_END.includes(last.t)) { carry.push(cur.runs.pop()); cur.w -= last.w; }
        push();
        for (const c of carry) { c.x = cur.w; cur.runs.push(c); cur.w += c.w; }
        if (u.t === ' ') continue;
      }
    }
    cur.runs.push({ t: u.t, r: u.r, x: cur.w, w, bold });
    cur.w += w;
  }
  if (cur.runs.length || !lines.length) push();
  lines.size = size;
  lines.weight = weight;
  lines.ruby = !!opts.ruby && lines.some((l) => l.runs.some((r) => r.r));
  lines.lineH = Math.round(size * (lines.ruby ? 1.85 : 1.38) + (opts.lineGap || 0));
  return lines;
}

// Draw laid-out lines. y is the top of the first line. align: 'left' | 'center' | 'right' (inside width w).
// Returns the y below the last line.
export function drawLines(ctx, lines, x, y, { color = '#fff', rubyColor, align = 'left', w = 0, bold: boldColor } = {}) {
  const size = lines.size;
  const rubySize = Math.round(size * 0.5);
  const top = lines.ruby ? rubySize * 1.1 : 0;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  for (const line of lines) {
    const ox = align === 'center' ? x + (w - line.w) / 2 : align === 'right' ? x + w - line.w : x;
    const base = y + top + size * 0.95;
    for (const run of line.runs) {
      ctx.font = `${run.bold ? 900 : lines.weight} ${size}px ${FONT}`;
      ctx.fillStyle = run.bold && boldColor ? boldColor : color;
      const tw = ctx.measureText(run.t).width;
      ctx.fillText(run.t, ox + run.x + (run.w - tw) / 2, base);
      if (run.r && lines.ruby) {
        ctx.font = `700 ${rubySize}px ${FONT}`;
        ctx.fillStyle = rubyColor || color;
        const rw = ctx.measureText(run.r).width;
        const scale = Math.min(1, (run.w + rubySize * 0.2) / rw);
        ctx.save();
        ctx.translate(ox + run.x + run.w / 2, base - size * 0.98);
        ctx.scale(scale, 1);
        ctx.textAlign = 'center';
        ctx.fillText(run.r, 0, 0);
        ctx.restore();
      }
    }
    y += lines.lineH;
  }
  return y;
}

// Fit text into a box: shrinks the font until it fits maxH (down to minSize). Returns the lines.
export function fit(ctx, s, maxW, maxH, size, opts = {}) {
  const min = opts.minSize || Math.round(size * 0.55);
  let lines;
  for (let k = size; k >= min; k -= Math.max(1, Math.round(k * 0.06))) {
    lines = layout(ctx, s, maxW, k, opts);
    if (lines.length * lines.lineH <= maxH) return lines;
  }
  return lines;
}

// convenience: lay out and draw in one call; returns the y below
export function text(ctx, s, x, y, maxW, size, opts = {}) {
  const lines = opts.maxH ? fit(ctx, s, maxW, opts.maxH, size, opts) : layout(ctx, s, maxW, size, opts);
  return drawLines(ctx, lines, x, y, { ...opts, w: maxW });
}
