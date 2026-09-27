/* Shared motion toolkit for the NEXTMAKE films.
 * Everything renders as a pure function of time t (seconds) so frames are reproducible:
 * a film registers scenes with NM.scene(a, b, build, update) and the renderer calls MV.seek(t).
 */
window.NM = (() => {
'use strict';
const W = 1920, H = 1080;

// ------------------------------------------------------------------ math
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, p) => a + (b - a) * p;
const prog = (t, a, b) => clamp((t - a) / (b - a));
const E = {
  lin: p => p,
  outCubic: p => 1 - Math.pow(1 - p, 3),
  inCubic: p => p * p * p,
  inOutCubic: p => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2,
  outQuart: p => 1 - Math.pow(1 - p, 4),
  inQuart: p => p * p * p * p,
  inOutQuart: p => p < .5 ? 8 * p * p * p * p : 1 - Math.pow(-2 * p + 2, 4) / 2,
  outExpo: p => p >= 1 ? 1 : 1 - Math.pow(2, -10 * p),
  inExpo: p => p <= 0 ? 0 : Math.pow(2, 10 * p - 10),
  inOutExpo: p => p <= 0 ? 0 : p >= 1 ? 1 : p < .5 ? Math.pow(2, 20 * p - 10) / 2 : (2 - Math.pow(2, -20 * p + 10)) / 2,
  outSine: p => Math.sin(p * Math.PI / 2),
  outBack: p => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); },
  inOutSine: p => -(Math.cos(Math.PI * p) - 1) / 2,
};
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
/** opacity for a window [a, b] with fade-in fi and fade-out fo */
function win(t, a, b, fi = .4, fo = .4) {
  if (t < a || t > b) return 0;
  return Math.min(fi > 0 ? clamp((t - a) / fi) : 1, fo > 0 ? clamp((b - t) / fo) : 1);
}
/** piecewise-linear keyframes [[t, v], ...] */
function keys(t, ks) {
  if (t <= ks[0][0]) return ks[0][1];
  for (let i = 0; i < ks.length - 1; i++) {
    const [t0, v0] = ks[i], [t1, v1] = ks[i + 1];
    if (t <= t1) return lerp(v0, v1, (t - t0) / (t1 - t0 || 1));
  }
  return ks[ks.length - 1][1];
}

// ------------------------------------------------------------------ DOM
const $ = s => document.querySelector(s);
function el(tag, cls, parent, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  if (parent) parent.appendChild(n);
  return n;
}
function place(n, css) { Object.assign(n.style, css); return n; }
function px(v) { return typeof v === 'number' ? v + 'px' : v; }
function box(n, x, y, w, h) { return place(n, { left: px(x), top: px(y), width: w == null ? undefined : px(w), height: h == null ? undefined : px(h) }); }
function show(n, o) { n.style.opacity = o; n.style.visibility = o <= .001 ? 'hidden' : 'visible'; }
function setT(n, { x = 0, y = 0, s = 1, r = 0, o = 1 } = {}) {
  n.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${s.toFixed(4)}) rotate(${r}deg)`;
  show(n, o);
}

/** multi-line block whose lines slide up from behind a mask */
function lines(parent, arr, css = {}, cls = '') {
  const n = el('div', 'abs ' + cls, parent);
  place(n, css);
  n._lines = arr.map(s => {
    const ln = el('div', 'ln', n);
    return el('div', 'lni', ln, s);
  });
  return n;
}
function revealLines(n, t, start, { dur = .9, stag = .1, out = null, outDur = .55, ease = E.outQuart } = {}) {
  n._lines.forEach((l, i) => {
    const p = ease(prog(t, start + i * stag, start + i * stag + dur));
    let y = (1 - p) * 105;
    if (out !== null) y -= E.inQuart(prog(t, out + i * stag * .5, out + i * stag * .5 + outDur)) * 105;
    l.style.transform = `translateY(${y.toFixed(2)}%)`;
  });
  show(n, t >= start ? 1 : 0);
}

/** text split into characters for a soft staggered fade */
function chars(parent, str, css = {}, cls = '') {
  const n = el('div', 'abs ' + cls, parent);
  place(n, css);
  n._chars = [];
  for (const c of str) {
    if (c === '\n') { el('br', '', n); continue; }
    const s = el('span', 'ch', n); s.textContent = c; n._chars.push(s);
  }
  return n;
}
function fadeChars(n, t, start, { dur = .9, stag = .045, dy = 14, out = null, outDur = .6 } = {}) {
  n._chars.forEach((c, i) => {
    const p = E.outCubic(prog(t, start + i * stag, start + i * stag + dur));
    let o = p, y = (1 - p) * dy;
    if (out !== null) { const q = E.inOutSine(prog(t, out, out + outDur)); o *= 1 - q; }
    c.style.opacity = o.toFixed(3);
    c.style.transform = `translateY(${y.toFixed(2)}px)`;
  });
  show(n, t >= start ? 1 : 0);
}

/** graded photograph */
function photo(parent, name, b = [0, 0, W, H], { raw = false, cls = '' } = {}) {
  const d = el('div', 'photo ' + (raw ? 'raw ' : '') + cls, parent);
  box(d, b[0], b[1], b[2], b[3]);
  const img = el('img', '', d);
  img.src = `../assets/img/${name}`.replace(/(\.jpg|\.png)?$/, m => m || '.jpg');
  if (!raw) el('div', 'grade', d);
  d._img = img;
  return d;
}
/** slow push-in / drift */
function kb(d, t, a, b, { s0 = 1.02, s1 = 1.08, x0 = 0, x1 = 0, y0 = 0, y1 = 0, ease = E.lin } = {}) {
  const p = ease(prog(t, a, b));
  d._img.style.transform = `translate(${lerp(x0, x1, p).toFixed(2)}px, ${lerp(y0, y1, p).toFixed(2)}px) scale(${lerp(s0, s1, p).toFixed(4)})`;
}
/** clip-path wipe: dir = 'up' | 'down' | 'left' | 'right' | 'center' */
function wipe(n, t, a, dur = .8, dir = 'up', ease = E.inOutQuart, outAt = null, outDur = .6) {
  let p = ease(prog(t, a, a + dur));
  let q = outAt === null ? 0 : ease(prog(t, outAt, outAt + outDur));
  const r = ((1 - p) * 100).toFixed(2), s = (q * 100).toFixed(2);
  const m = {
    up: `inset(${r}% 0 ${s}% 0)`, down: `inset(${s}% 0 ${r}% 0)`,
    left: `inset(0 ${s}% 0 ${r}%)`, right: `inset(0 ${r}% 0 ${s}%)`,
    center: `inset(${(r / 2)}% ${(r / 2)}% ${(r / 2)}% ${(r / 2)}%)`,
  };
  n.style.clipPath = m[dir];
  show(n, t >= a && q < 1 ? 1 : 0);
}
function drawLine(n, t, a, dur = 1, ease = E.inOutQuart, vertical = false) {
  const p = ease(prog(t, a, a + dur));
  n.style.transform = vertical ? `scaleY(${p.toFixed(4)})` : `scaleX(${p.toFixed(4)})`;
  show(n, p > 0 ? 1 : 0);
}
function count(n, t, a, b, to, { fmt = v => Math.round(v).toLocaleString('en-US'), ease = E.outExpo } = {}) {
  n.textContent = fmt(to * ease(prog(t, a, b)));
}

// ------------------------------------------------------------------ brand
const MARK = `<svg viewBox="0 0 512 445" xmlns="http://www.w3.org/2000/svg">
  <polygon class="mk1" points="0,182 285,445 0,445" fill="#0b5aa8"/>
  <polygon class="mk2" points="90,0 90,265 285,445 490,445" fill="#1a8ad6"/>
  <polygon class="mk3" points="285,210 512,5 512,445 490,445" fill="#0b5aa8"/>
</svg>`;
const MARK_LIGHT = MARK.replace(/#0b5aa8/g, '#2d7fd4').replace('#1a8ad6', '#5cc0ff');
function logo(parent, size, css = {}, { light = true, color } = {}) {
  const n = el('div', 'abs logo', parent, `<span>NEXT</span>${light ? MARK_LIGHT : MARK}<span>MAKE</span>`);
  place(n, Object.assign({ fontSize: px(size), color: color || (light ? '#fff' : '#0b5aa8') }, css));
  n._parts = [...n.querySelectorAll('polygon')];
  n._words = [...n.querySelectorAll('span')];
  n._words.forEach(w => { w.style.display = 'inline-block'; });
  return n;
}
/** logo build: mark pieces settle, words slide out from the mark */
function buildLogo(n, t, a, { dur = 1.1 } = {}) {
  const dirs = [[-60, 40], [0, -70], [60, 40]];
  n._parts.forEach((m, i) => {
    const q = E.outQuart(prog(t, a + i * .09, a + dur * .7 + i * .09));
    m.style.transform = `translate(${(dirs[i][0] * (1 - q)).toFixed(1)}px, ${(dirs[i][1] * (1 - q)).toFixed(1)}px)`;
    m.style.opacity = q.toFixed(3);
  });
  n._words.forEach((w, i) => {
    const q = E.outQuart(prog(t, a + .35, a + .35 + dur));
    w.style.transform = `translateX(${((i ? -1 : 1) * 40 * (1 - q)).toFixed(1)}px)`;
    w.style.opacity = q.toFixed(3);
    w.style.clipPath = i ? `inset(0 ${(100 - q * 100).toFixed(1)}% 0 0)` : `inset(0 0 0 ${(100 - q * 100).toFixed(1)}%)`;
  });
}

// ------------------------------------------------------------------ film driver
const scenes = [];
let root = null;
const hooks = { before: [], after: [], preload: [] };
function scene(a, b, build, update) {
  root = root || $('#scenes');
  const n = el('div', 'scene', root);
  const ctx = build(n) || {};
  scenes.push({ a, b, n, ctx, update });
  return n;
}
function grain() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'), im = x.createImageData(256, 256), r = rng(9);
  for (let i = 0; i < im.data.length; i += 4) { const v = r() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
  x.putImageData(im, 0, 0);
  $('#grain').style.backgroundImage = `url(${c.toDataURL()})`;
}
function film({ duration, fps = 30, audio }) {
  grain();
  const seek = t => {
    t = clamp(t, 0, duration - 1e-4);
    hooks.before.forEach(f => f(t));
    for (const s of scenes) {
      const vis = t >= s.a && t < s.b;
      s.n.style.display = vis ? 'block' : 'none';
      if (vis) s.update(t, s.ctx);
    }
    hooks.after.forEach(f => f(t));
    const f = Math.floor(t * fps);
    $('#grain').style.transform = `translate(${(f * 37) % 256 - 128}px, ${(f * 91) % 256 - 128}px)`;
  };
  const ready = async () => {
    for (const p of hooks.preload) await p();
    await Promise.all(['500 40px SERIF', '400 40px SANS', '700 40px SANS', '200 40px LATIN', '500 40px LATIN'].map(f => document.fonts.load(f)));
    await document.fonts.ready;
    await Promise.all([...document.images].map(i => i.decode().catch(() => {})));
    return true;
  };
  window.MV = { seek, ready, DURATION: duration, FPS: fps };

  const isRender = new URLSearchParams(location.search).has('render');
  document.body.classList.add(isRender ? 'render' : 'preview');
  if (isRender) return;
  // interactive preview with music
  const vp = $('#viewport');
  const fit = () => {
    const s = Math.min(innerWidth / W, (innerHeight - 70) / H);
    vp.style.transform = `scale(${s})`;
    vp.style.marginLeft = ((innerWidth - W * s) / 2) + 'px';
  };
  addEventListener('resize', fit); fit();
  const ctl = el('div', '', document.body); ctl.id = 'controls';
  ctl.innerHTML = `<button>▶ Play</button><input type="range" min="0" max="${duration}" step="0.01" value="0"><span>0.00</span>`;
  const [btn, scrub, tc] = ctl.children;
  const au = new Audio(audio);
  let playing = false;
  btn.onclick = () => {
    playing = !playing; btn.textContent = playing ? '❚❚ Pause' : '▶ Play';
    if (playing) { au.currentTime = +scrub.value; au.play().catch(() => {}); } else au.pause();
  };
  scrub.oninput = () => { au.currentTime = +scrub.value; seek(+scrub.value); };
  ready().then(() => {
    const loop = () => {
      const t = playing ? au.currentTime : +scrub.value;
      if (playing && (au.ended || t >= duration)) { playing = false; btn.textContent = '▶ Play'; }
      scrub.value = t; tc.textContent = t.toFixed(2);
      seek(t);
      requestAnimationFrame(loop);
    };
    loop();
  });
}

return { W, H, clamp, lerp, prog, E, rng, win, keys, $, el, place, px, box, show, setT, lines, revealLines, chars, fadeChars,
  photo, kb, wipe, drawLine, count, MARK, MARK_LIGHT, logo, buildLogo, scene, hooks, film };
})();
