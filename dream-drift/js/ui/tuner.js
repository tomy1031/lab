// ui/tuner.js — the handling tuning panel: sliders for every number in race/tune.js, applied while you drive,
// a live readout (speed, turn rate, the radius you are turning on, slip), and copy / paste of the values.
import { TUNE, TUNE_DEFS, TUNE_GROUPS, setTune, resetTune, tuneText, applyTuneText } from '../race/tune.js';

const css = `
/* top left, just right of the item box: clear of the pause button and the map (top right), the steering slider
   (bottom left) and the touch buttons (bottom right) */
.tuner { position: fixed; top: max(10px, env(safe-area-inset-top)); left: calc(max(10px, env(safe-area-inset-left)) + 128px); z-index: 45; width: min(380px, 52vw);
  max-height: calc(100vh - 20px); display: flex; flex-direction: column; background: rgba(18, 10, 46, 0.93); border: 2px solid rgba(255,255,255,0.35);
  border-radius: 18px; color: #fff; font: 600 13px/1.35 "M PLUS Rounded 1c", system-ui, sans-serif; pointer-events: auto; box-shadow: 0 8px 30px rgba(0,0,0,0.45); }
.tuner[hidden] { display: none; }
.tuner .tn-head { display: flex; align-items: center; gap: 8px; padding: 8px 10px 8px 14px; cursor: pointer; user-select: none; }
.tuner .tn-head b { flex: 1; font-size: 15px; font-weight: 900; }
.tuner .tn-head button, .tuner .tn-btns button, .tuner .tn-row button { cursor: pointer; border-radius: 10px; border: 2px solid rgba(255,255,255,0.4); background: rgba(255,255,255,0.1); color: #fff; font: inherit; padding: 5px 10px; }
.tuner .tn-btns button.primary { background: linear-gradient(180deg, #ffe76b, #ffb21f); color: #4a1d00; border-color: #fff3b0; font-weight: 900; }
.tuner .tn-body { overflow-y: auto; padding: 0 12px 12px; }
.tuner.min .tn-body { display: none; }
.tuner .tn-tele { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px 8px; background: rgba(0,0,0,0.3); border-radius: 12px; padding: 8px 10px; margin-bottom: 8px; font-variant-numeric: tabular-nums; }
.tuner .tn-tele span { opacity: 0.75; font-size: 11px; display: block; }
.tuner .tn-tele b { font-size: 15px; }
.tuner .tn-tele .on { color: #7ff0ff; }
.tuner .tn-row { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; flex-wrap: wrap; }
.tuner select { font: inherit; border-radius: 10px; padding: 4px 6px; background: #2a1d5e; color: #fff; border: 2px solid rgba(255,255,255,0.4); max-width: 60%; }
.tuner h5 { margin: 10px 0 4px; font-size: 13px; color: #ffd93b; }
.tuner .tn-p { display: grid; grid-template-columns: 1fr 70px; gap: 2px 8px; padding: 5px 6px; border-radius: 10px; }
.tuner .tn-p.changed { background: rgba(255, 217, 59, 0.13); }
.tuner .tn-p .tn-l { grid-column: 1 / -1; display: flex; justify-content: space-between; gap: 6px; }
.tuner .tn-p .tn-l small { opacity: 0.65; font-weight: 500; white-space: nowrap; }
.tuner .tn-p input[type=range] { width: 100%; accent-color: #ffd93b; }
.tuner .tn-p input[type=number] { width: 100%; font: inherit; border-radius: 8px; border: 1px solid rgba(255,255,255,0.4); background: rgba(0,0,0,0.3); color: #fff; padding: 2px 4px; }
.tuner .tn-p .tn-h { grid-column: 1 / -1; font-size: 11px; opacity: 0.6; font-weight: 500; }
.tuner .tn-btns { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 6px; }
.tuner textarea { width: 100%; height: 74px; font: 500 11px/1.3 ui-monospace, monospace; border-radius: 10px; background: rgba(0,0,0,0.35); color: #e8f6ff; border: 1px solid rgba(255,255,255,0.3); resize: vertical; }
.tuner .tn-msg { min-height: 1.3em; color: #9dffb0; font-size: 12px; }
@media (max-height: 560px) { .tuner { max-height: 56vh; } .tuner .tn-p .tn-h { display: none; } }
@media (max-width: 600px) { .tuner { left: 3vw; width: 94vw; } }
`;

export class Tuner {
  // onCourse(idx): drive another course; onRestart(): start the current one again; courses: [{ name }]
  constructor({ courses = [], onCourse, onRestart } = {}) {
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const el = this.el = document.createElement('div');
    el.className = 'tuner'; el.id = 'tuner'; el.hidden = true;
    el.innerHTML = `
      <div class="tn-head"><b>ドリフト調整</b><button data-tn="min" title="たたむ">▾</button><button data-tn="close" title="とじる">×</button></div>
      <div class="tn-body">
        <div class="tn-tele">
          <div><span>速さ</span><b data-t="speed">—</b></div><div><span>曲がる 速さ</span><b data-t="rate">—</b></div><div><span>曲がりの 半径</span><b data-t="radius">—</b></div>
          <div><span>すべり角</span><b data-t="slip">—</b></div><div><span>ハンドル 入力</span><b data-t="steer">—</b></div><div><span>ドリフト</span><b data-t="drift">—</b></div>
        </div>
        <div class="tn-row">コース <select data-tn="course">${courses.map((c, i) => `<option value="${i}">${i + 1}. ${c.name}</option>`).join('')}</select><button data-tn="restart">やり直す</button></div>
        <div data-tn="params"></div>
        <div class="tn-btns"><button class="primary" data-tn="copy">値を コピー</button><button data-tn="load">下の 枠から 読み込む</button><button data-tn="reset">初期値に もどす</button></div>
        <textarea data-tn="out" spellcheck="false"></textarea>
        <div class="tn-msg" data-tn="msg">変えた 値は すぐ 走りに 反映され、この 端末に 保存されます。</div>
      </div>`;
    document.body.appendChild(el);
    this.q = (s) => el.querySelector(`[data-tn="${s}"]`);
    this.tele = Object.fromEntries([...el.querySelectorAll('[data-t]')].map((e) => [e.dataset.t, e]));
    this.rows = new Map();
    const params = this.q('params');
    for (const [g, title] of Object.entries(TUNE_GROUPS)) {
      const h = document.createElement('h5'); h.textContent = title; params.appendChild(h);
      for (const d of TUNE_DEFS.filter((x) => x.group === g)) {
        const row = document.createElement('div'); // not a <label>: clicking its text must not grab the keyboard
        row.className = 'tn-p';
        row.innerHTML = `<span class="tn-l">${d.label}<small>${d.unit ? d.unit + '・' : ''}初期値 ${d.def}</small></span>
          <input type="range" min="${d.min}" max="${d.max}" step="${d.step}"><input type="number" min="${d.min}" max="${d.max}" step="${d.step}">
          ${d.hint ? `<span class="tn-h">${d.hint}</span>` : ''}`;
        const [range, num] = row.querySelectorAll('input');
        const apply = (v) => { setTune(d.key, Number(v)); this.refresh(); };
        range.addEventListener('input', () => apply(range.value));
        num.addEventListener('change', () => apply(num.value));
        // give the keyboard back to driving once you let go of a slider
        range.addEventListener('pointerup', () => range.blur());
        range.addEventListener('change', () => range.blur());
        params.appendChild(row);
        this.rows.set(d.key, { row, range, num, d });
      }
    }
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tn]');
      if (!b) { if (e.target.closest('.tn-head')) this.toggleMin(); return; }
      const a = b.dataset.tn;
      if (a === 'min') this.toggleMin();
      else if (a === 'close') this.close();
      else if (a === 'restart') onRestart?.();
      else if (a === 'copy') this.copy();
      else if (a === 'load') { const n = applyTuneText(this.q('out').value); this.refresh(); this.msg(n ? `${n} 個の 値を 読み込みました` : '枠に 値（{ … }）を 貼り付けてから 押してください'); }
      else if (a === 'reset') { resetTune(); this.refresh(); this.msg('初期値に もどしました'); }
      if (b.tagName === 'BUTTON') b.blur();
    });
    this.q('course').addEventListener('change', (e) => { onCourse?.(Number(e.target.value)); e.target.blur(); });
    this.rate = 0; this.lastHeading = null; this.teleT = 0;
    this.refresh();
  }

  get isOpen() { return !this.el.hidden; }
  open(courseIdx) { this.el.hidden = false; this.el.classList.remove('min'); if (courseIdx !== undefined) this.q('course').value = String(courseIdx); this.refresh(); }
  close() { this.el.hidden = true; }
  toggleMin() { this.el.classList.toggle('min'); }
  msg(t) { this.q('msg').textContent = t; }

  refresh() {
    for (const { row, range, num, d } of this.rows.values()) {
      const v = TUNE[d.key];
      if (document.activeElement !== range) range.value = v;
      if (document.activeElement !== num) num.value = v;
      row.classList.toggle('changed', v !== d.def);
    }
    const out = this.q('out');
    if (document.activeElement !== out) out.value = tuneText();
  }

  async copy() {
    const text = tuneText(), out = this.q('out');
    out.value = text;
    try { await navigator.clipboard.writeText(text); this.msg('コピーしました。そのまま 貼り付けて 送ってください'); return; } catch { /* fall back */ }
    out.focus(); out.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { /* not allowed */ }
    this.msg(ok ? 'コピーしました。そのまま 貼り付けて 送ってください' : '下の 枠を 選んで（長押し）コピーしてください');
  }

  // live readout from your kart
  update(k, dt) {
    if (!this.isOpen || !k || dt <= 0) return;
    if (this.lastHeading !== null) {
      let dh = k.heading - this.lastHeading; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
      this.rate += (dh / dt - this.rate) * (1 - Math.exp(-dt * 8));
    }
    this.lastHeading = k.heading;
    this.teleT -= dt;
    if (this.teleT > 0) return;
    this.teleT = 0.12;
    const v = Math.hypot(k.vel.x, k.vel.z), rate = Math.abs(this.rate);
    let slip = Math.atan2(k.vel.x, k.vel.z) - k.heading; while (slip > Math.PI) slip -= Math.PI * 2; while (slip < -Math.PI) slip += Math.PI * 2;
    const t = this.tele;
    t.speed.textContent = `${Math.round(Math.max(0, k.speed) * 3.6)} km/h`;
    t.rate.textContent = `${Math.round((rate * 180) / Math.PI)} °/秒`;
    t.radius.textContent = rate > 0.04 && v > 3 ? `${Math.round(v / rate)} m` : 'まっすぐ';
    t.slip.textContent = v > 3 ? `${Math.round((Math.abs(slip) * 180) / Math.PI)} °` : '—';
    t.steer.textContent = `${k.steer >= 0 ? '+' : ''}${k.steer.toFixed(2)}`;
    t.drift.textContent = k.drift.active ? `ON ${['', '青', 'オレンジ', 'ピンク'][k.drift.level] || ''}` : 'OFF';
    t.drift.classList.toggle('on', k.drift.active);
  }
}
