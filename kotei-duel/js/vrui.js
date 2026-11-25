// js/vrui.js — what you read and press in VR. Nothing is stuck to your face; the boards stand around the table:
//   left of your hand  : the card you point at (with furigana) and what you can do with it
//   right of your hand : trust, effort, deadline, turn — and the big 「ターン終了」 button
//   in front, over the V : dialogs (lessons, cut-ins, quiz, results, menus) — while one is open, only it can be pressed
//   far side           : the guide's speech bubble (tutorial, hints)
// Boards are canvases (js/board.js); the laser's uv on a board picks the button.
import * as THREE from 'three';
import { Board, ACCENT } from './board.js';
import { TABLE_H } from './room.js';
import { FONT, plain } from './text.js';
import { drawFace } from './cardmesh.js';
import { cardFace } from './faces.js';

function face(board, pos, look) {
  board.mesh.position.copy(pos);
  board.mesh.lookAt(look);
}

export class VRUI {
  constructor(app) {
    this.app = app;
    this.group = new THREE.Group();
    this.group.visible = false;
    app.scene.add(this.group);
    const head = new THREE.Vector3(0, TABLE_H + 0.45, 0.95);
    this.head = head;
    this.info = new Board('info', 1024, 1180, 0.42);
    face(this.info, new THREE.Vector3(-0.62, TABLE_H + 0.33, 0.62), head);
    this.hud = new Board('hud', 1024, 760, 0.36);
    face(this.hud, new THREE.Vector3(0.62, TABLE_H + 0.3, 0.64), head);
    this.modal = new Board('modal', 1024, 1100, 0.72, { renderOrder: 70, depthTest: false });
    face(this.modal, new THREE.Vector3(0, TABLE_H + 0.42, 0.05), head);
    this.bubble = new Board('bubble', 1024, 460, 0.7);
    face(this.bubble, new THREE.Vector3(0, TABLE_H + 0.62, -0.42), head);
    for (const b of [this.info, this.hud, this.modal, this.bubble]) { this.group.add(b.mesh); b.ruby = app.settings.ruby; }
    this.modal.visible = false;
    this.bubble.visible = false;
    this.resolve = null;
    this.onAction = null;
    this.bubbleOk = null;
  }

  setVisible(v) { this.group.visible = v; }
  setRuby(r) { for (const b of [this.info, this.hud, this.modal, this.bubble]) { b.ruby = r; if (b.spec) b.draw(); } }

  // meshes the laser can hit (a modal blocks the rest)
  targets() {
    if (!this.group.visible) return [];
    if (this.modal.visible) return [this.modal.mesh];
    const t = [this.info.mesh, this.hud.mesh];
    if (this.bubble.visible && this.bubbleOk) t.push(this.bubble.mesh);
    return t;
  }
  get modalOpen() { return this.modal.visible; }

  // a pointer event on a board → true if handled
  handle(hit) {
    if (!hit || hit.kind !== 'board') return false;
    const b = hit.board;
    const btn = b.hitButton(hit.uv);
    if (!btn) return true;
    this.app.sound.play('click');
    if (b === this.modal) { const r = this.resolve; this.resolve = null; this.modal.visible = false; r?.(btn.id); }
    else if (b === this.bubble) { const f = this.bubbleOk; this.bubbleOk = null; f?.(); }
    else this.onAction?.(btn.id);
    return true;
  }
  hover(hit) {
    for (const b of [this.info, this.hud, this.modal, this.bubble]) {
      const id = hit && hit.kind === 'board' && hit.board === b ? b.hitButton(hit.uv)?.id || null : null;
      if (b.setHover(id) && id) this.app.sound.play('hover');
    }
  }

  // ---------- info board ----------
  // spec: { id, opts, note } or { text } ; buttons: [{ id, label, sub, primary, disabled }]
  showInfo(spec, buttons) {
    const key = JSON.stringify([spec && { id: spec.id, note: spec.note, text: spec.text, en: spec.en, hole: spec.opts?.hole, title: spec.title }, buttons, this.info.ruby, this.app.settings.en]);
    if (key === this.infoKey) return;
    this.infoKey = key;
    const btns = (buttons || []).map((b) => ({ id: b.id, label: plain(b.label) + (b.sub ? `（${plain(b.sub)}）` : ''), primary: b.primary, disabled: b.disabled, wide: true }));
    if (!spec || (spec.text && !spec.id)) {
      this.info.draw({ title: spec?.title || '{手札|てふだ}・カード・マスを {指|さ}そう', body: spec?.text || this.app.idleHint(), en: spec?.en, buttons: btns, bodySize: 0.042 });
      return;
    }
    const f = cardFace(spec.id, spec.opts || {});
    const c = this.app.cardData(spec.id);
    this.info.draw({
      tag: plain(f.typeLabel || '') + (c.cost != null ? `  コスト ${c.cost}` : ''),
      title: f.name,
      sub: (f.stats || []).map((s) => `${plain(s.label)} ${s.value}`).join('　'),
      body: (f.text || '') + (spec.note ? '\n' + spec.note : ''),
      en: this.app.settings.en ? (c.flavorEn || f.en || '') : '',
      buttons: btns,
      bodySize: 0.044,
      draw: (ctx, y, W) => {
        // a small picture of the card on the right of the title
        return y;
      },
    });
  }

  // ---------- HUD board ----------
  showHud(D, buttons) {
    const key = JSON.stringify([D && [D.turn, D.side, D.trust, D.effort, D.deadline, D.released, D.opsLeft], buttons]);
    if (key === this.hudKey) return;
    this.hudKey = key;
    const btns = (buttons || []).map((b) => ({ id: b.id, label: plain(b.label), primary: b.primary, disabled: b.disabled, wide: true }));
    this.hud.draw({
      title: D ? (D.side === 'p' ? `ターン ${D.turn}　あなた` : `ターン ${D.turn}　{相手|あいて}`) : 'KOTEI DUEL',
      buttons: btns,
      draw: (c, y, W) => {
        if (!D) return y;
        const row = (label, value, color, extra) => {
          y += 72;
          c.font = `800 40px ${FONT}`; c.fillStyle = '#a9c4ff'; c.textAlign = 'left'; c.fillText(label, 60, y);
          c.font = `900 60px ${FONT}`; c.fillStyle = color; c.textAlign = 'right'; c.fillText(value, W - 60, y);
          c.textAlign = 'left';
          if (extra) extra(y);
        };
        row('♥ 信頼', `${D.trust}`, D.trust <= 6 ? '#ff5a4f' : '#ff9aa8', (yy) => {
          c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(300, yy - 30, 420, 18);
          c.fillStyle = '#ff6f8a'; c.fillRect(300, yy - 30, (420 * D.trust) / D.R.trust, 18);
        });
        row('◆ 工数', `${D.effort}`, ACCENT, (yy) => {
          for (let i = 0; i < Math.max(D.R.effortCap, D.effort); i++) { c.save(); c.translate(320 + i * 50, yy - 20); c.rotate(Math.PI / 4); c.fillStyle = i < D.effort ? ACCENT : 'rgba(255,255,255,0.15)'; c.fillRect(-14, -14, 28, 28); c.restore(); }
        });
        const left = D.deadline - D.turn;
        row('⌛ 納期', D.released ? '✓' : D.deadline >= 50 ? '—' : left >= 0 ? `あと${left}` : `${-left}遅れ`, !D.released && left <= 1 ? '#ff5a4f' : '#7fe3ff');
        if (D.released) row('運用', `あと${D.opsLeft}`, '#2fd08f');
        return y + 20;
      },
    });
  }

  // ---------- modal dialog ----------
  dialog(spec) {
    const btns = (spec.buttons || []).map((b) => ({ id: b.id, label: plain(b.label), primary: b.primary || b.good, disabled: b.disabled, wide: (spec.buttons || []).length <= 3 || plain(b.label).length > 14 }));
    const cards = spec.cards || [];
    this.modal.draw({
      tag: spec.tag ? plain(spec.tag) : '',
      title: spec.title || '',
      body: spec.body || '',
      en: this.app.settings.en ? spec.en || '' : '',
      accent: spec.color,
      buttons: btns,
      bodySize: spec.bodySize || 0.04,
      draw: cards.length ? (ctx, y, W) => {
        // cards in a row
        const n = cards.length, cw = Math.min(200, (W - 120) / n - 16), ch = cw * 716 / 512;
        const tmp = document.createElement('canvas'); tmp.width = 512; tmp.height = 716;
        cards.forEach((c, i) => {
          const id = typeof c === 'string' ? c : c.id;
          drawFace(tmp.getContext('2d'), cardFace(id, c.opts || {}), { ruby: this.app.settings.ruby });
          ctx.drawImage(tmp, (W - n * (cw + 16)) / 2 + i * (cw + 16), y + 8, cw, ch);
        });
        return y + ch + 24;
      } : null,
    });
    this.modal.visible = true;
    this.app.sound.play('lesson');
    return new Promise((res) => { this.resolve = res; });
  }
  closeDialog(id) { if (this.resolve) { const r = this.resolve; this.resolve = null; this.modal.visible = false; r(id); } }

  // ---------- the guide's bubble ----------
  showBubble({ speaker, say, en, ok, onOk }) {
    const sp = this.app.speaker(speaker);
    this.bubble.draw({ tag: plain(sp.name), body: say, en: this.app.settings.en ? en : '', buttons: ok ? [{ id: 'ok', label: ok, primary: true, wide: true }] : [], bodySize: 0.04, bg0: 'rgba(255,250,235,0.97)', bg1: 'rgba(245,236,210,0.97)', accent: ACCENT, titleColor: '#1b1f2c', bodyColor: '#1b1f2c', rubyColor: '#6b5a3a', enColor: '#5a6276', boldColor: '#b03a00' });
    // dark text on the light bubble
    this.bubbleOk = ok ? onOk : null;
    this.bubble.visible = true;
  }
  hideBubble() { this.bubble.visible = false; this.bubbleOk = null; }

  // keep the boards facing the player's head (after the table was fitted to them)
  update() {
    const p = this.app.camera.getWorldPosition(new THREE.Vector3());
    for (const b of [this.modal, this.bubble]) if (b.visible) {
      const q = b.mesh.quaternion.clone();
      b.mesh.lookAt(p);
      b.mesh.quaternion.slerp(q, 0.9);
    }
  }
}
