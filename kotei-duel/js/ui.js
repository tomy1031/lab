// js/ui.js — the page around the 3D table on a PC or phone: the HUD (trust, effort, deadline, operation), the side
// panel (the card you point at, with furigana; what you can do now; the log), banners, the guide's speech bubble,
// dialogs (lessons, cut-ins, quizzes, results, menus) and the title page. Text uses the {漢字|かんじ} markup.
import { html, plain } from './text.js';
import { drawFace } from './cardmesh.js';
import { cardFace } from './faces.js';
import { ICONS } from './art.js';

const $ = (id) => document.getElementById(id);

// a <canvas> showing a card face (the same drawing as the 3D card)
export function cardCanvas(id, opts = {}, ruby = true) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 716;
  drawFace(c.getContext('2d'), typeof id === 'string' ? cardFace(id, opts) : id, { ruby });
  return c;
}

// a round picture of an icon (speakers, lessons)
export function iconCanvas(icon, bg = '#2f6fe0', size = 112) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  x.fillStyle = bg; x.beginPath(); x.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); x.fill();
  x.save(); x.translate(size * 0.15, size * 0.15); x.scale(size * 0.7 / 100, size * 0.7 / 100);
  (ICONS[icon] || ICONS.star)(x, '#ffffff', {});
  x.restore();
  return c;
}

export class PageUI {
  constructor(app) {
    this.app = app;
    this.logEl = $('log');
    this.dialogResolve = null;
    $('modal').addEventListener('click', (e) => { if (e.target === $('modal') && this.dialogSpec?.dismiss) this.closeDialog(this.dialogSpec.dismiss); });
    addEventListener('keydown', (e) => {
      if (!$('modal').classList.contains('hidden') && this.dialogSpec) {
        const btns = this.dialogSpec.buttons || [];
        if (e.key === 'Escape' && this.dialogSpec.dismiss) this.closeDialog(this.dialogSpec.dismiss);
        if (e.key === 'Enter') { const p = btns.find((b) => b.primary) || (btns.length === 1 ? btns[0] : null); if (p && !p.disabled) { e.preventDefault(); this.closeDialog(p.id); } }
      }
    });
  }
  get ruby() { return this.app.settings.ruby; }
  h(s) { return html(s, this.ruby); }

  show(which) {
    $('start').classList.toggle('hidden', which !== 'start');
    for (const id of ['hud', 'side', 'menu-btn']) $(id).classList.toggle('hidden', which !== 'duel');
    if (which !== 'duel') { this.hideBubble(); }
  }

  // ---------- HUD ----------
  hud(D) {
    if (!D) return;
    $('h-turn-n').textContent = Math.max(1, D.turn);
    $('h-side-t').textContent = D.side === 'p' ? 'あなた' : '相手';
    $('h-side').classList.toggle('enemy', D.side === 'e');
    $('h-trust-v').textContent = D.trust;
    $('h-trust-bar').style.width = `${(100 * D.trust) / D.R.trust}%`;
    const cap = Math.max(D.R.effortCap, D.effort);
    const g = $('h-gems');
    if (g.children.length !== cap) g.innerHTML = '<i></i>'.repeat(cap);
    [...g.children].forEach((el, i) => el.classList.toggle('on', i < D.effort));
    $('h-effort-v').textContent = D.effort;
    const left = D.deadline - D.turn;
    $('h-deadline-v').textContent = D.released ? '✓' : D.deadline >= 50 ? '—' : left >= 0 ? `あと ${left}` : `${-left} 遅れ`;
    $('h-deadline-t').textContent = D.released || D.deadline >= 50 ? '' : `（ターン ${D.deadline} まで）`;
    $('h-deadline').classList.toggle('warn', !D.released && left <= 1);
    $('h-ops').classList.toggle('hidden', !D.released);
    $('h-ops-v').textContent = D.opsLeft ?? '';
  }
  enemy(ch) {
    const el = $('h-enemy');
    el.querySelector('.pic').innerHTML = '';
    const art = ch.enemy.art || {};
    el.querySelector('.pic').appendChild(iconCanvas(art.icon || 'boss', art.bg === 'red' ? '#b8202a' : art.bg === 'night' ? '#2a2f6b' : '#7a3fd0', 76));
    $('h-enemy-n').innerHTML = this.h(ch.enemy.name);
  }
  enemyAct() { const el = $('h-enemy'); el.classList.remove('act'); void el.offsetWidth; el.classList.add('act'); }
  trustHit() { const el = $('h-trust'); el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit'); }

  // ---------- side panel ----------
  // info: { id, opts, title?, note?, en? } or null (shows the hint text)
  info(spec) {
    const el = $('info');
    // the same thing again: nothing to draw
    const key = JSON.stringify([spec && { id: spec.id, note: spec.note, text: spec.text, en: spec.en, hole: spec.opts?.hole, title: spec.title }, this.ruby, this.app.settings.en]);
    if (key === this.infoKey) return;
    this.infoKey = key;
    if (!spec) { el.innerHTML = `<div class="empty">${this.h(this.app.idleHint())}</div>`; return; }
    if (spec.text && !spec.id) { el.innerHTML = `<div class="empty">${this.h(spec.text)}</div>${spec.en ? `<div class="en">${spec.en}</div>` : ''}`; return; }
    const f = cardFace(spec.id, spec.opts || {});
    const c = this.app.cardData(spec.id);
    const stats = [];
    if (c.cost != null) stats.push(`<span class="pill cost">コスト ${c.cost}</span>`);
    for (const s of f.stats || []) stats.push(`<span class="pill">${this.h(s.label)} ${s.value}</span>`);
    el.innerHTML = `
      <div class="card-head"><div class="cv"></div><div>
        <div class="nm">${this.h(f.name)}</div>
        <div class="meta">${this.h(f.typeLabel || '')}${f.phaseLabel ? '・' + this.h(f.phaseLabel) : ''}<br><span class="en">${f.en || ''}</span></div>
        <div class="stats">${stats.join('')}</div>
      </div></div>
      <div class="card-text">${this.h(f.text || '')}</div>
      ${spec.note ? `<div class="card-note">${this.h(spec.note)}</div>` : ''}
      ${c.flavor ? `<div class="card-flavor">💡 ${this.h(c.flavor)}</div><div class="en">${c.flavorEn || ''}</div>` : ''}`;
    // one picture per card, kept (drawing a card face is not free)
    this.faceCanvases = this.faceCanvases || new Map();
    const ck = `${spec.id}|${f.faceKey || ''}|${this.ruby}`;
    let cv = this.faceCanvases.get(ck);
    if (!cv) { if (this.faceCanvases.size > 60) this.faceCanvases.clear(); cv = cardCanvas(f, {}, this.ruby); this.faceCanvases.set(ck, cv); }
    el.querySelector('.cv').appendChild(cv);
  }

  // buttons: [{ id, label, sub, primary, warn, disabled, focus }]
  actions(list, onClick) {
    const el = $('actions');
    el.innerHTML = '';
    for (const b of list) {
      const x = document.createElement('button');
      x.className = 'act' + (b.primary ? ' primary' : '') + (b.warn ? ' warn' : '') + (b.focus ? ' focus' : '');
      if (b.id === 'end') x.id = 'endturn';
      x.dataset.id = b.id;
      x.disabled = !!b.disabled;
      x.innerHTML = `<span>${this.h(b.label)}</span>${b.sub ? `<small>${this.h(b.sub)}</small>` : ''}`;
      x.onclick = () => { this.app.sound.init(); this.app.sound.play('click'); onClick(b.id); };
      el.appendChild(x);
    }
  }

  log(text, cls = '') {
    const p = document.createElement('p');
    if (cls) p.className = cls;
    p.innerHTML = this.h(text);
    this.logEl.appendChild(p);
    while (this.logEl.children.length > 200) this.logEl.firstChild.remove();
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }
  clearLog() { this.logEl.innerHTML = ''; }

  // ---------- banner ----------
  banner(text, { color = '#ffcf3f', sub = '', ms = 1200 } = {}) {
    const b = $('banner');
    b.style.setProperty('--c', color);
    b.querySelector('.big').innerHTML = this.h(text);
    b.querySelector('.small').innerHTML = this.h(sub || '');
    b.classList.remove('hidden');
    const inner = b.querySelector('.in');
    inner.style.animation = 'none'; void inner.offsetWidth; inner.style.animation = '';
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => b.classList.add('hidden'), ms);
  }

  // ---------- the guide's bubble ----------
  bubble({ speaker, say, en, ok, onOk }) {
    const b = $('bubble');
    const sp = this.app.speaker(speaker);
    const who = b.querySelector('.who');
    who.innerHTML = '';
    who.appendChild(iconCanvas(sp.art?.icon || 'person', sp.art?.bg === 'purple' ? '#7a3fd0' : '#2f6fe0', 112));
    who.insertAdjacentHTML('beforeend', this.h(sp.name));
    b.querySelector('.say').innerHTML = this.h(say);
    b.querySelector('.en').textContent = en || '';
    const bb = b.querySelector('.bbtn');
    bb.innerHTML = '';
    if (ok) { const x = document.createElement('button'); x.textContent = ok; x.onclick = () => { this.app.sound.play('click'); onOk?.(); }; bb.appendChild(x); }
    b.classList.remove('hidden');
  }
  hideBubble() { $('bubble').classList.add('hidden'); }

  // ---------- dialog ----------
  // spec: { tag, title, body, en, src, color, cards: [id], icon, buttons: [{ id, label, primary, good, bad, disabled }], dismiss, html }
  dialog(spec) {
    this.dialogSpec = spec;
    const m = $('modal');
    const box = m.querySelector('.box');
    box.style.setProperty('--c', spec.color || '#7fe3ff');
    box.innerHTML = `${spec.tag ? `<span class="tag">${this.h(spec.tag)}</span>` : ''}
      ${spec.title ? `<h3>${this.h(spec.title)}</h3>` : ''}
      <div class="cards"></div>
      ${spec.body ? `<div class="body">${this.h(spec.body)}</div>` : ''}
      ${spec.html || ''}
      ${spec.en ? `<div class="en" style="margin-top:6px">${spec.en}</div>` : ''}
      ${spec.src ? `<div class="src">${this.h(spec.src)}</div>` : ''}
      <div class="btns"></div>`;
    const cards = box.querySelector('.cards');
    for (const c of spec.cards || []) cards.appendChild(typeof c === 'string' ? cardCanvas(c, {}, this.ruby) : cardCanvas(c.id, c.opts || {}, this.ruby));
    if (spec.icon) cards.appendChild(iconCanvas(spec.icon, '#8a6411', 96));
    if (!cards.children.length) cards.remove();
    const btns = box.querySelector('.btns');
    for (const b of spec.buttons || []) {
      const x = document.createElement('button');
      x.className = (b.primary ? 'primary' : '') + (b.good ? ' good' : '') + (b.bad ? ' badc' : '');
      x.innerHTML = this.h(b.label);
      x.disabled = !!b.disabled;
      x.onclick = () => { this.app.sound.init(); this.app.sound.play('click'); this.closeDialog(b.id); };
      btns.appendChild(x);
    }
    m.classList.remove('hidden');
    box.scrollTop = 0;
    const first = btns.querySelector('button.primary') || btns.querySelector('button');
    first?.focus({ preventScroll: true });
    return new Promise((res) => { this.dialogResolve = res; });
  }
  closeDialog(id) {
    $('modal').classList.add('hidden');
    const r = this.dialogResolve;
    this.dialogResolve = null; this.dialogSpec = null;
    r?.(id);
  }
  get dialogOpen() { return !!this.dialogResolve; }
}
