// js/ui.js — the guide panel. One canvas, shown two ways: in VR it is a floating board you point at with the
// laser; on a PC or phone the same canvas sits in the page as an overlay and takes clicks and taps.
// It shows either the chapter list (menu) or one step of a chapter: title, the kind of claim (established
// science / educated guess / speculation, after Kip Thorne's The Science of Interstellar), the text, the
// chapter's own buttons and the step navigation.
import * as THREE from 'three';
import { FONT } from './tubes.js';

export const TAGS = {
  fact: { label: '確かな科学', color: '#7ee08a' },
  math: { label: '確かな数学', color: '#7ee0d2' },
  guess: { label: '有力な仮説', color: '#ffc65a' },
  spec: { label: '推測（SF）', color: '#ff8fd0' },
};

const W = 1024, H = 840;
const ACCENT = '#ffcf7a';

// split text into tokens that may not be broken (latin words / numbers) and single CJK characters;
// **…** marks highlighted words
function tokens(text) {
  const out = [];
  let hi = false;
  const re = /\*\*|[A-Za-z0-9.,:;%/+\-−×=²³√^'’()[\]<>≤≥~|]+|\s|./gu;
  for (const m of text.matchAll(re)) {
    const s = m[0];
    if (s === '**') { hi = !hi; continue; }
    out.push({ s, hi });
  }
  return out;
}
const NO_START = new Set('、。，．）」』】〉》・ー…！？!?,.:;)ぁぃぅぇぉっゃゅょァィゥェォッャュョ'.split(''));
const NO_END = new Set('「『【（〈《('.split(''));

export function layoutText(ctx, text, maxW) {
  const lines = [];
  for (const para of text.split('\n')) {
    const tk = tokens(para);
    let line = [], w = 0;
    for (let i = 0; i < tk.length; i++) {
      const t = tk[i];
      const tw = ctx.measureText(t.s).width;
      if (w + tw > maxW && line.length) {
        // keep closing punctuation on this line; carry an opening bracket to the next
        if (NO_START.has(t.s[0])) { line.push(t); lines.push(line); line = []; w = 0; continue; }
        const carry = [];
        while (line.length && NO_END.has(line[line.length - 1].s)) carry.unshift(line.pop());
        lines.push(line);
        line = carry;
        w = carry.reduce((s, c) => s + ctx.measureText(c.s).width, 0);
        if (t.s === ' ') continue;
      }
      line.push(t);
      w += tw;
    }
    lines.push(line);
  }
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export class Panel {
  constructor(app) {
    this.app = app;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.canvas.className = 'panel-canvas';
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    this.tex.generateMipmaps = true;
    this.tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.wm = 0.84; // metres
    this.hm = (this.wm * H) / W;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(this.wm, this.hm), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, toneMapped: false }));
    this.mesh.renderOrder = 10;
    this.buttons = [];
    this.hoverId = null;
    this.spec = null;
    this.dirty = true;
    this.place(new THREE.Vector3(-0.66, 1.42, -0.8));
    // as an item for the Interactor
    this.item = {
      priority: true,
      enabled: () => this.mesh.visible && this.app.xrActive,
      rayHit: (ray) => this.rayHit(ray),
      press: (p, hit) => this.press(p, hit),
      drag: (p) => this.dragMove(p),
      release: () => { this.dragging = null; },
      hoverOn: (p, hit) => this.setHover(hit.button || null),
      hoverOff: () => this.setHover(null),
    };
    // DOM (PC / phone)
    this.canvas.addEventListener('pointermove', (e) => {
      const b = this.buttonAt(...this.domXY(e));
      this.canvas.style.cursor = b ? 'pointer' : 'default';
      this.setHover(b ? b.id : null);
    });
    this.canvas.addEventListener('pointerleave', () => this.setHover(null));
    this.canvas.addEventListener('click', (e) => {
      const b = this.buttonAt(...this.domXY(e));
      if (b) this.fire(b.id);
    });
  }

  // put the board at p (in the stage's coordinates), turned to face the standing user at the origin
  place(p) {
    this.mesh.position.copy(p);
    this.mesh.lookAt(new THREE.Vector3(0, p.y, 0.15));
    this.home = p.clone();
  }

  domXY(e) {
    const r = this.canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  }

  buttonAt(x, y) {
    return this.buttons.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h && !b.disabled) || null;
  }

  rayHit(ray) {
    const m = this.mesh;
    m.updateWorldMatrix(true, false);
    const inv = (this._inv ||= new THREE.Matrix4()).copy(m.matrixWorld).invert();
    const o = ray.origin.clone().applyMatrix4(inv);
    const d = ray.direction.clone().transformDirection(inv);
    if (Math.abs(d.z) < 1e-6) return null;
    const t = -o.z / d.z;
    if (t < 0) return null;
    const lx = o.x + d.x * t, ly = o.y + d.y * t;
    if (Math.abs(lx) > this.wm / 2 || Math.abs(ly) > this.hm / 2) return null;
    const cx = (lx / this.wm + 0.5) * W, cy = (0.5 - ly / this.hm) * H;
    const b = this.buttonAt(cx, cy);
    // world distance along the ray
    const wp = new THREE.Vector3(lx, ly, 0).applyMatrix4(m.matrixWorld);
    return { d: wp.distanceTo(ray.origin), point: wp, button: b ? b.id : null, cy };
  }

  press(p, hit) {
    if (hit.button) { this.fire(hit.button); return false; }
    // anywhere else on the board: drag it to a new place
    this.dragging = { dist: hit.d };
    return true;
  }

  dragMove(p) {
    if (!this.dragging) return;
    const target = p.ray.at(this.dragging.dist, new THREE.Vector3());
    const parent = this.mesh.parent;
    parent.worldToLocal(target);
    this.mesh.position.lerp(target, 0.5);
    const head = parent.worldToLocal(this.app.input.head.clone());
    this.mesh.lookAt(parent.localToWorld(new THREE.Vector3(head.x, this.mesh.position.y, head.z)));
  }

  setHover(id) {
    if (id === this.hoverId) return;
    this.hoverId = id;
    this.dirty = true;
  }

  fire(id) {
    this.app.sound.click();
    this.onButton?.(id);
  }

  show(spec) {
    this.spec = spec;
    this.dirty = true;
  }

  update() {
    if (!this.dirty || !this.spec) return;
    this.dirty = false;
    this.draw(this.spec);
    this.tex.needsUpdate = true;
  }

  draw(spec) {
    const c = this.ctx;
    this.buttons = [];
    c.clearRect(0, 0, W, H);
    roundRect(c, 4, 4, W - 8, H - 8, 34);
    c.fillStyle = 'rgba(9, 12, 30, 0.9)';
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = 'rgba(140, 160, 255, 0.35)';
    c.stroke();
    if (spec.kind === 'menu') this.drawMenu(spec);
    else this.drawStep(spec);
  }

  button(id, label, x, y, w, h, { on = false, primary = false, disabled = false, small = false } = {}) {
    const c = this.ctx;
    const hover = this.hoverId === id && !disabled;
    roundRect(c, x, y, w, h, 16);
    c.fillStyle = disabled ? 'rgba(255,255,255,0.04)' : on ? '#e9ecff' : primary ? (hover ? '#ffd98f' : ACCENT) : hover ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)';
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = hover ? '#ffffff' : 'rgba(255,255,255,0.18)';
    c.stroke();
    c.fillStyle = disabled ? 'rgba(255,255,255,0.3)' : on || primary ? '#0b0e22' : '#eef0ff';
    c.font = `800 ${small ? 24 : 28}px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    let text = label;
    while (c.measureText(text).width > w - 16 && text.length > 2) text = text.slice(0, -2) + '…';
    c.fillText(text, x + w / 2, y + h / 2 + 1);
    this.buttons.push({ id, x, y, w, h, disabled });
  }

  tag(kind, x, y, align = 'right') {
    const t = TAGS[kind];
    if (!t) return 0;
    const c = this.ctx;
    c.font = `800 24px ${FONT}`;
    const w = c.measureText(t.label).width + 30;
    const x0 = align === 'right' ? x - w : x;
    roundRect(c, x0, y, w, 38, 19);
    c.fillStyle = t.color;
    c.fill();
    c.fillStyle = '#0b0e22';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(t.label, x0 + w / 2, y + 20);
    return w;
  }

  text(str, x, y, maxW, { size = 30, lh = 1.62, color = '#e6e9ff', maxY = H } = {}) {
    const c = this.ctx;
    c.font = `500 ${size}px ${FONT}`;
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    const lines = layoutText(c, str, maxW);
    let yy = y;
    for (const line of lines) {
      if (yy > maxY) break;
      let xx = x;
      for (const t of line) {
        c.fillStyle = t.hi ? ACCENT : color;
        c.font = `${t.hi ? 800 : 500} ${size}px ${FONT}`;
        c.fillText(t.s, xx, yy);
        xx += c.measureText(t.s).width;
      }
      yy += size * lh;
    }
    return yy;
  }

  drawMenu(spec) {
    const c = this.ctx;
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    c.fillStyle = '#ffffff';
    c.font = `900 60px ${FONT}`;
    c.fillText('ANAKATA', 44, 92);
    c.font = `800 30px ${FONT}`;
    c.fillStyle = ACCENT;
    c.fillText('5次元を 体で わかる', 330, 90);
    let y = this.text(spec.text, 44, 146, W - 88, { size: 26, lh: 1.55, color: '#c9cff5' });
    y += 4;
    const cols = 2, bw = (W - 88 - 16) / cols, bh = 78;
    spec.chapters.forEach((ch, i) => {
      const x = 44 + (i % cols) * (bw + 16), yy = y + Math.floor(i / cols) * (bh + 12);
      const hover = this.hoverId === 'ch' + i;
      roundRect(c, x, yy, bw, bh, 18);
      c.fillStyle = ch.current ? 'rgba(255,207,122,0.22)' : hover ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.07)';
      c.fill();
      c.lineWidth = 2;
      c.strokeStyle = hover ? '#fff' : ch.current ? ACCENT : 'rgba(255,255,255,0.16)';
      c.stroke();
      c.fillStyle = ACCENT;
      c.font = `900 34px ${FONT}`;
      c.textAlign = 'left';
      c.fillText(String(i + 1), x + 18, yy + 50);
      c.fillStyle = '#fff';
      c.font = `800 28px ${FONT}`;
      let t = ch.title;
      while (c.measureText(t).width > bw - 70 && t.length > 2) t = t.slice(0, -2) + '…';
      c.fillText(t, x + 56, yy + 36);
      c.fillStyle = TAGS[ch.tag]?.color || '#aab';
      c.font = `700 21px ${FONT}`;
      c.fillText(TAGS[ch.tag]?.label + (ch.sub ? '　' + ch.sub : ''), x + 56, yy + 66);
      this.buttons.push({ id: 'ch' + i, x, y: yy, w: bw, h: bh });
    });
    const by = H - 84;
    const n = spec.actions.length;
    const bw2 = (W - 88 - (n - 1) * 12) / n;
    spec.actions.forEach((a, i) => this.button(a.id, a.label, 44 + i * (bw2 + 12), by, bw2, 60, a));
  }

  drawStep(spec) {
    const c = this.ctx;
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    c.fillStyle = ACCENT;
    c.font = `900 30px ${FONT}`;
    c.fillText(spec.num, 40, 66);
    const nw = c.measureText(spec.num).width;
    c.fillStyle = '#ffffff';
    c.font = `900 40px ${FONT}`;
    let title = spec.title;
    const tagW = 200;
    while (c.measureText(title).width > W - 80 - nw - 20 - tagW && title.length > 2) title = title.slice(0, -2) + '…';
    c.fillText(title, 40 + nw + 16, 68);
    this.tag(spec.tag, W - 36, 36);
    // step dots
    const n = spec.steps, k = spec.step;
    for (let i = 0; i < n; i++) {
      c.beginPath();
      c.arc(46 + i * 26, 100, i === k ? 8 : 6, 0, Math.PI * 2);
      c.fillStyle = i === k ? ACCENT : i < k ? 'rgba(255,207,122,0.45)' : 'rgba(255,255,255,0.2)';
      c.fill();
    }
    if (spec.stepTitle) {
      c.textAlign = 'left';
      c.fillStyle = '#ffffff';
      c.font = `800 30px ${FONT}`;
      c.fillText(spec.stepTitle, 46 + n * 26 + 10, 111);
    }
    const nActRows = spec.actions.length ? Math.ceil(spec.actions.length / 4) : 0;
    let bottom = H - 96 - nActRows * 72;
    // the controls guide: what to do now, in a box above the buttons
    if (spec.how) {
      c.font = `700 25px ${FONT}`;
      const lines = layoutText(c, spec.how, W - 80 - 120).slice(0, 3);
      const bh = 26 + lines.length * 36;
      const by = bottom - bh - 12;
      roundRect(c, 40, by, W - 80, bh, 16);
      c.fillStyle = 'rgba(126,224,210,0.14)';
      c.fill();
      c.lineWidth = 2;
      c.strokeStyle = 'rgba(126,224,210,0.6)';
      c.stroke();
      roundRect(c, 52, by + 13, 96, 34, 17);
      c.fillStyle = '#7ee0d2';
      c.fill();
      c.fillStyle = '#0b0e22';
      c.font = `800 22px ${FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('操作', 100, by + 31);
      c.textAlign = 'left';
      c.textBaseline = 'alphabetic';
      lines.forEach((line, i) => {
        let xx = 162;
        for (const t of line) {
          c.fillStyle = t.hi ? ACCENT : '#dff8f4';
          c.font = `${t.hi ? 800 : 600} 25px ${FONT}`;
          c.fillText(t.s, xx, by + 40 + i * 36);
          xx += c.measureText(t.s).width;
        }
      });
      bottom = by;
      bottom += 0;
    }
    let y = 160;
    if (spec.extra) {
      const eh = spec.extraH || 150;
      y = this.text(spec.text, 40, y, W - 80, { size: 29, lh: 1.55, maxY: bottom - eh - 10 });
      spec.extra(c, { x: 40, y: Math.min(y - 10, bottom - eh - 8), w: W - 80, h: eh });
    } else {
      this.text(spec.text, 40, y, W - 80, { size: 30, lh: 1.6, maxY: bottom - 10 });
    }
    // chapter actions
    const actY = H - 96 - nActRows * 72;
    spec.actions.forEach((a, i) => {
      const row = Math.floor(i / 4), inRow = Math.min(4, spec.actions.length - row * 4), col = i % 4;
      const bw = (W - 80 - (inRow - 1) * 12) / inRow;
      this.button(a.id, a.label, 40 + col * (bw + 12), actY + row * 72, bw, 60, a);
    });
    // navigation
    const ny = H - 84;
    this.button('menu', '目次', 40, ny, 116, 60);
    this.button('prev', '◀ もどる', 168, ny, 190, 60, { disabled: k === 0 && !spec.prevChapter });
    this.button('guide', spec.guideOn ? '操作ガイド ON' : '操作ガイド OFF', 370, ny, 210, 60, { on: spec.guideOn, small: true });
    c.fillStyle = '#9aa3d6';
    c.font = `800 26px ${FONT}`;
    c.textAlign = 'center';
    c.fillText(`${k + 1} / ${n}`, 634, ny + 40);
    const last = k === n - 1;
    this.button('next', last ? (spec.nextChapter ? '次の章へ ▶' : '目次へ ▶') : 'つぎへ ▶', W - 40 - 280, ny, 280, 60, { primary: true });
  }
}
