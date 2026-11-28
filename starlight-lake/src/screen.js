// Screen mode helpers: physical calibration (credit-card method) and a Landolt C acuity check.
//
// Why a screen mode at all: a headset's pixels (~20-25 px/deg) can't draw detail at the
// acuity limit of most adults, and its fixed focal distance (~1.3-1.5 m) mostly hides the blur
// a low myope has at a distance. A big screen viewed uncorrected from 2.5-4 m has both: fine
// detail, and the player's real everyday blur. The low-myopia perceptual learning studies
// trained uncorrected in that situation (Tan & Fong 2008; Camilleri 2014; Yan 2015).

const CARD_MM = 85.6;   // ISO/IEC 7810 ID-1 card width

export function cssPpd(pxPerMm, distance) {
  return pxPerMm * 1000 * distance * Math.tan(Math.PI / 180);
}

/** Smallest Landolt gap the screen can draw (>= 1.5 device pixels) as decimal acuity. */
export function maxMeasurableDecimal(pxPerMm, distance) {
  const ppd = cssPpd(pxPerMm, distance) * (window.devicePixelRatio || 1);
  const gapArcmin = (1.5 / ppd) * 60;
  return 1 / gapArcmin;
}

export function bindCalibration({ store, onTrain, onAcuity }) {
  const $ = (id) => document.getElementById(id);
  const card = $('card'), slider = $('card-size'), dist = $('view-dist'), info = $('calib-info');
  const s = store.settings.screen;
  slider.value = s.pxPerMm ? Math.round(s.pxPerMm * CARD_MM) : 323;
  dist.value = s.distance || 3;
  const refresh = () => {
    card.style.width = `${slider.value}px`;
    card.style.height = `${slider.value * 53.98 / CARD_MM}px`;
    const pxPerMm = slider.value / CARD_MM;
    const d = parseFloat(dist.value) || 3;
    const ppd = cssPpd(pxPerMm, d) * (window.devicePixelRatio || 1);
    const maxDec = maxMeasurableDecimal(pxPerMm, d);
    const fov = 2 * Math.atan(window.innerHeight / pxPerMm / 1000 / 2 / d) * 180 / Math.PI;
    info.textContent = `この距離では 1度あたり約 ${Math.round(ppd)} 画素。視力 ${maxDec >= 2 ? '2.0' : maxDec.toFixed(1)} 相当まで表示できます。` +
      (maxDec < 1.0 ? '（もう少し離れると、より細かい練習ができます）' : '') +
      (fov < 4 ? `画面の見かけの高さが ${fov.toFixed(1)}° と小さめです。大きな画面（TVなど）か、少し近い距離がおすすめです。` : '');
  };
  slider.addEventListener('input', refresh);
  dist.addEventListener('input', refresh);
  refresh();
  const save = () => {
    s.pxPerMm = slider.value / CARD_MM;
    s.distance = parseFloat(dist.value) || 3;
    store.save();
    return { pxPerMm: s.pxPerMm, distance: s.distance };
  };
  $('btn-train-screen').addEventListener('click', () => onTrain(save()));
  $('btn-acuity').addEventListener('click', () => onAcuity(save()));
}

/**
 * Landolt C acuity check. Four gap directions, 2-down-1-up staircase in 0.1 log steps (one
 * chart line), threshold = mean of the last six reversals. Not a clinical test: a way to see
 * your own trend under the same conditions each time.
 */
export class AcuityTest {
  constructor({ store, calib, eye, onDone }) {
    this.store = store; this.calib = calib; this.eye = eye; this.onDone = onDone;
    this.root = document.getElementById('acuity');
    this.canvas = document.getElementById('acuity-canvas');
    this.status = document.getElementById('acuity-status');
    this.dpr = window.devicePixelRatio || 1;
    this.ppd = cssPpd(calib.pxPerMm, calib.distance) * this.dpr;   // device px per degree
    this.minGap = (1.5 / this.ppd) * 60;                           // arcmin
    this.logGap = Math.log10(2.0);                                 // start around 0.5 decimal
    this.step = 0.1;
    this.streak = 0; this.lastDir = 0; this.reversals = []; this.trials = 0; this.limited = false;
    this.onKey = (e) => {
      const map = { ArrowRight: 0, ArrowUp: 1, ArrowLeft: 2, ArrowDown: 3 };
      if (e.key in map) { e.preventDefault(); this.respond(map[e.key]); }
      if (e.key === 'Escape') this.finish(true);
    };
    this.onClick = (e) => {
      const b = e.target.closest('[data-dir]');
      if (b) this.respond(+b.dataset.dir);
    };
  }

  start() {
    this.root.hidden = false;
    document.addEventListener('keydown', this.onKey);
    this.root.addEventListener('click', this.onClick);
    this.resize();
    this.next();
  }

  resize() {
    this.canvas.width = Math.round(window.innerWidth * this.dpr);
    this.canvas.height = Math.round(window.innerHeight * this.dpr);
  }

  next() {
    this.dir = Math.floor(Math.random() * 4);
    let gap = 10 ** this.logGap;
    if (gap < this.minGap) { gap = this.minGap; this.limited = true; }
    this.gapPx = (gap / 60) * this.ppd;
    this.draw();
    const dec = 1 / gap;
    this.status.textContent = `${this.eye} ・ ${this.trials + 1} 回目 ・ 表示中 視力 ${dec.toFixed(2)} 相当`;
  }

  draw() {
    const g = this.canvas.getContext('2d');
    const W = this.canvas.width, H = this.canvas.height;
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    const gap = this.gapPx, Ro = gap * 2.5, Ri = Ro - gap;
    const cx = W / 2, cy = H / 2;
    g.fillStyle = '#000';
    g.beginPath(); g.arc(cx, cy, Ro, 0, Math.PI * 2); g.arc(cx, cy, Ri, 0, Math.PI * 2, true); g.fill('evenodd');
    g.fillStyle = '#fff';
    g.save(); g.translate(cx, cy); g.rotate(-this.dir * Math.PI / 2);
    g.fillRect(0, -gap / 2, Ro + 2, gap);
    g.restore();
  }

  respond(d) {
    if (this.waiting) return;
    const ok = d === this.dir;
    this.trials++;
    let move = 0;
    if (ok) { this.streak++; if (this.streak >= 2) { move = -1; this.streak = 0; } }
    else { this.streak = 0; move = 1; }
    if (move) {
      if (this.lastDir && move !== this.lastDir) this.reversals.push(this.logGap);
      this.lastDir = move;
      this.logGap += move * this.step;
      this.logGap = Math.max(Math.log10(this.minGap), Math.min(Math.log10(20), this.logGap));
    }
    if (this.reversals.length >= 8 || this.trials >= 40) { this.finish(false); return; }
    this.waiting = true;
    const g = this.canvas.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    setTimeout(() => { this.waiting = false; this.next(); }, 280);
  }

  finish(aborted) {
    document.removeEventListener('keydown', this.onKey);
    this.root.removeEventListener('click', this.onClick);
    this.root.hidden = true;
    if (aborted) { this.onDone(null); return; }
    const r = this.reversals.slice(-6);
    const logmar = r.length ? r.reduce((a, b) => a + b, 0) / r.length : this.logGap;
    const result = {
      date: new Date().toISOString(), eye: this.eye, distance: this.calib.distance,
      logmar: +logmar.toFixed(2), decimal: +(1 / 10 ** logmar).toFixed(2), limited: this.limited,
    };
    this.store.data.acuity.push(result);
    this.store.save();
    this.onDone(result);
  }
}
