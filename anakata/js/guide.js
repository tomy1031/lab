// js/guide.js — the controls guide, shown or hidden as you like (A or X on the controller, the 「操作ガイド」
// button on the panel, or the button at the top right on a PC). When it is on:
//   - a small card floats above each Meta Quest controller (Quest 3 / 3S Touch Plus) saying what its trigger,
//     grip, stick and buttons do in this chapter (or, with hand tracking, what a pinch does)
//   - the guide panel shows "what to do now" for the current step
//   - pulsing rings with a label mark the things to take in your hand
import * as THREE from 'three';
import { FONT } from './tubes.js';

const KEY = 'anakata.guide';

function loadPref() {
  try { const v = localStorage.getItem(KEY); return v == null ? true : v === '1'; } catch { return true; }
}
function savePref(on) {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* private mode */ }
}

// a canvas-backed sprite whose text can change
class Card {
  constructor(w, h, ppm = 2400) {
    this.c = document.createElement('canvas');
    this.c.width = Math.round(w * ppm);
    this.c.height = Math.round(h * ppm);
    this.tex = new THREE.CanvasTexture(this.c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    this.sprite.scale.set(w, h, 1);
    this.sprite.renderOrder = 40;
    this.key = '';
  }

  draw(key, fn) {
    if (key === this.key) return;
    this.key = key;
    const x = this.c.getContext('2d');
    x.clearRect(0, 0, this.c.width, this.c.height);
    fn(x, this.c.width, this.c.height);
    this.tex.needsUpdate = true;
  }
}

const ROW_COL = { trig: '#ffcf7a', grip: '#7ee0d2', stick: '#9fb0ff', btn1: '#ff8fd0', btn2: '#c9cff5', pinch: '#ffcf7a' };

function drawControllerCard(x, W, H, side, rows, hands) {
  x.fillStyle = 'rgba(9,12,30,0.9)';
  x.beginPath(); x.roundRect(4, 4, W - 8, H - 8, 26); x.fill();
  x.strokeStyle = side === 'L' ? '#4cc9ff' : '#ffb24c';
  x.lineWidth = 5; x.stroke();
  x.textBaseline = 'middle';
  x.fillStyle = side === 'L' ? '#4cc9ff' : '#ffb24c';
  x.font = `900 34px ${FONT}`;
  x.fillText(hands ? (side === 'L' ? '左手' : '右手') : side === 'L' ? '左コントローラー' : '右コントローラー', 22, 34);
  const lh = (H - 70) / rows.length;
  rows.forEach(([kind, name, what], i) => {
    const y = 70 + lh * i + lh / 2;
    x.fillStyle = ROW_COL[kind] || '#fff';
    x.beginPath(); x.roundRect(18, y - 18, 150, 36, 18); x.fill();
    x.fillStyle = '#0b0e22';
    x.font = `800 24px ${FONT}`;
    x.textAlign = 'center';
    x.fillText(name, 93, y + 1);
    x.textAlign = 'left';
    x.fillStyle = '#eef0ff';
    // shrink the text to fit rather than cut it
    let size = 26;
    x.font = `700 ${size}px ${FONT}`;
    while (x.measureText(what).width > W - 200 && size > 16) { size -= 1; x.font = `700 ${size}px ${FONT}`; }
    x.fillText(what, 184, y + 1);
  });
}

export class Guide {
  constructor(app) {
    this.app = app;
    this.on = loadPref();
    this.cards = { L: new Card(0.19, 0.115), R: new Card(0.19, 0.115) };
    for (const c of Object.values(this.cards)) { c.sprite.visible = false; app.scene.add(c.sprite); }
    // hint markers: a pulsing ring and a label, up to four
    const ringC = document.createElement('canvas');
    ringC.width = ringC.height = 128;
    const rx = ringC.getContext('2d');
    rx.strokeStyle = '#ffcf7a'; rx.lineWidth = 10;
    rx.beginPath(); rx.arc(64, 64, 52, 0, Math.PI * 2); rx.stroke();
    rx.lineWidth = 4; rx.globalAlpha = 0.5;
    rx.beginPath(); rx.arc(64, 64, 38, 0, Math.PI * 2); rx.stroke();
    const ringTex = new THREE.CanvasTexture(ringC);
    this.markers = Array.from({ length: 4 }, () => {
      const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
      ring.renderOrder = 41;
      const label = new Card(0.2, 0.04, 1600);
      label.sprite.renderOrder = 42;
      ring.visible = label.sprite.visible = false;
      app.scene.add(ring, label.sprite);
      return { ring, label };
    });
  }

  toggle(v = !this.on) {
    this.on = v;
    savePref(v);
    this.app.refreshPanel();
    this.app.syncGuideBtn?.();
    this.app.sound.click();
  }

  // what the current step asks of you, in the words for this device
  how() {
    if (!this.on || this.app.menuOpen) return null;
    const c = this.app.current;
    const g = c.guides?.[c.step];
    if (!g) return null;
    const vr = this.app.xrActive;
    const hands = vr && (this.app.input.xr.R.isHand || this.app.input.xr.L.isHand);
    return (vr ? (hands && g.hand) || g.vr : g.pc) || null;
  }

  update(t) {
    const app = this.app;
    const vr = app.xrActive;
    const c = app.current;
    // the "what to do now" text depends on controllers vs hands: refresh the panel when that changes
    const handsNow = vr && (app.input.xr.R.isHand || app.input.xr.L.isHand);
    if (handsNow !== this.lastHands) { this.lastHands = handsNow; app.refreshPanel(); }
    // controller cards
    for (const side of ['L', 'R']) {
      const card = this.cards[side];
      const p = app.input.xr[side];
      const show = this.on && vr && p.valid;
      card.sprite.visible = show;
      if (!show) continue;
      const hands = p.isHand;
      const stick = (c.stickHelp && c.stickHelp[side]) || '（使わない）';
      const rows = hands
        ? [['pinch', 'つまむ', '指した 所を 押す'], ['grip', '近くで つまむ', '物を にぎる'], ['btn2', '案内板', '目次・ガイドは 板の ボタン']]
        : [
          ['trig', 'トリガー', '押す・にぎる'],
          ['grip', 'グリップ', '物を にぎる'],
          ['stick', 'スティック', stick],
          ['btn1', side === 'L' ? 'X' : 'A', 'ガイド 表示／非表示'],
          ['btn2', side === 'L' ? 'Y' : 'B', '目次'],
        ];
      card.draw(`${side}|${hands}|${stick}`, (x, W, H) => drawControllerCard(x, W, H, side, rows, hands));
      // float just above and behind the hand, so it never covers what you hold
      const up = new THREE.Vector3(0, 1, 0);
      const toHead = app.input.head.clone().sub(p.pos).setY(0).normalize();
      card.sprite.position.copy(p.pos).addScaledVector(up, 0.1).addScaledVector(toHead, -0.02);
    }
    // markers
    const g = this.on && !app.menuOpen && (app.started || vr) ? c.guides?.[c.step] : null;
    const targets = (g && g.targets) || [];
    this.markers.forEach((m, i) => {
      const tg = targets[i];
      let pos = null;
      if (tg && (!tg.when || tg.when())) pos = tg.at();
      m.ring.visible = m.label.sprite.visible = !!pos;
      if (!pos) return;
      const k = 1 + 0.15 * Math.sin(t * 4 + i);
      const r = (tg.r || 0.06) * 2 * k;
      m.ring.position.copy(pos);
      m.ring.scale.set(r, r, 1);
      const text = (vr ? tg.vr : tg.pc) || tg.label;
      m.label.draw(text, (x, W, H) => {
        x.font = `800 ${Math.round(H * 0.56)}px ${FONT}`;
        const w = Math.min(W - 8, x.measureText(text).width + 40);
        x.fillStyle = 'rgba(255,207,122,0.95)';
        x.beginPath(); x.roundRect((W - w) / 2, 4, w, H - 8, (H - 8) / 2); x.fill();
        x.fillStyle = '#0b0e22';
        x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(text, W / 2, H / 2 + 2);
      });
      m.label.sprite.position.copy(pos).add(new THREE.Vector3(0, (tg.r || 0.06) + 0.035, 0));
    });
  }
}
