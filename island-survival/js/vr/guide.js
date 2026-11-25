// vr/guide.js — the controls guide in the headset (DESIGN §27.6): a small card floats above each controller and says
// what every button does right now (in the world, in the menu, on the work table, while placing, while working).
// The row of a button lights up while you press it, so the card also teaches where the buttons are.
// Made for Meta Quest 3 / 3S (Touch Plus): right A B, left X Y, a stick, the trigger (index finger) and the grip
// (middle finger) on each. Shown by default; 「ガイド」 in the VR menu or the settings hides / shows it.
import * as THREE from 'three';
import { makePanelMaterial } from './vrui.js';
import { guideRows } from './guiderows.js';

export { guideRows };

const FONT = '"Zen Maru Gothic", "Hiragino Maru Gothic ProN", "Noto Sans JP", sans-serif';
const W = 640, H = 420;          // canvas px
const MW = 0.2, MH = 0.13;       // metres

const KEY = {
  trigger: { label: 'トリガー', sub: '人さし指', color: '#e8743b' },
  grip: { label: 'グリップ', sub: '中指', color: '#8c6cd9' },
  stick: { label: 'スティック', sub: '', color: '#1f7f86' },
  a: { label: 'A', sub: '', color: '#2f78c4', round: true },
  b: { label: 'B', sub: '', color: '#2f78c4', round: true },
  x: { label: 'X', sub: '', color: '#2f78c4', round: true },
  y: { label: 'Y', sub: '', color: '#2f78c4', round: true },
  swing: { label: '振る', sub: '', color: '#4a9a52' },
  watch: { label: '⌚', sub: '', color: '#8c8570' },
  info: { label: '…', sub: '', color: '#8c8570' },
};

function rr(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

class GuideCard {
  constructor(side) {
    this.side = side;
    this.cv = document.createElement('canvas'); this.cv.width = W; this.cv.height = H;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(MW, MH), makePanelMaterial(this.cv));
    this.mesh.renderOrder = 1002; this.mesh.frustumCulled = false; this.mesh.visible = false;
    this.mesh.name = `vr-guide-${side}`;
    this.sig = '';
  }

  draw(card, pressed) {
    this.pressed = [...pressed].sort();
    this.title = card.title;
    const sig = JSON.stringify([card, this.pressed]);
    if (sig === this.sig) return;
    this.sig = sig;
    const c = this.cv.getContext('2d');
    c.clearRect(0, 0, W, H);
    rr(c, 4, 4, W - 8, H - 8, 30); c.fillStyle = 'rgba(14,38,42,.9)'; c.fill();
    c.lineWidth = 4; c.strokeStyle = 'rgba(253,248,234,.5)'; c.stroke();
    c.textBaseline = 'middle'; c.textAlign = 'left';
    c.fillStyle = '#ffd36b'; c.font = `900 34px ${FONT}`;
    c.fillText(card.title, 26, 40, W - 52);
    const rows = card.rows.slice(0, 5), top = 82, rh = Math.min(66, (H - top - 14) / Math.max(1, rows.length));
    rows.forEach((r, i) => {
      const k = KEY[r.key] || KEY.info, y = top + i * rh, on = pressed.has(r.key);
      if (on) { rr(c, 14, y + 2, W - 28, rh - 4, 16); c.fillStyle = 'rgba(255,211,107,.95)'; c.fill(); }
      // the key's badge
      const bw = k.round ? 50 : 160, bx = 24, by = y + rh / 2;
      rr(c, bx, by - 23, bw, 46, 23); c.fillStyle = k.color; c.fill();
      c.fillStyle = '#ffffff'; c.font = `900 ${k.round ? 30 : 26}px ${FONT}`; c.textAlign = 'center';
      c.fillText(k.label, bx + bw / 2, by + 1, bw - 10);
      c.textAlign = 'left';
      c.fillStyle = on ? '#2a2923' : '#fdf8ea'; c.font = `800 28px ${FONT}`;
      c.fillText(r.text, bx + bw + 18, by + 1, W - bx - bw - 48);
    });
    this.mesh.material.map.needsUpdate = true;
  }

  dispose() { this.mesh.geometry.dispose(); this.mesh.material.map?.dispose(); this.mesh.material.dispose(); }
}

export class VRGuide {
  constructor() {
    this.cards = { left: new GuideCard('left'), right: new GuideCard('right') };
    this.on = true;
  }
  get meshes() { return [this.cards.left.mesh, this.cards.right.mesh]; }

  /**
   * every frame: grips = { left: Object3D|null, right: Object3D|null }, head = camera,
   * state for guideRows, pressed = { left: Set, right: Set } of keys held now
   */
  update(grips, head, state, pressed) {
    const rows = this.on ? guideRows(state) : null;
    for (const side of ['left', 'right']) {
      const card = this.cards[side], g = grips[side];
      if (!rows || !g || !g.visible) { card.mesh.visible = false; continue; }
      card.draw(rows[side], pressed[side] || new Set());
      // above the hand, a little to the outside, facing the eyes
      const p = new THREE.Vector3(); g.getWorldPosition(p);
      const hp = new THREE.Vector3(); head.getWorldPosition(hp);
      const toHead = hp.clone().sub(p); toHead.y = 0; const d = toHead.length() || 1; toHead.divideScalar(d);
      const out = new THREE.Vector3(-toHead.z, 0, toHead.x).multiplyScalar(side === 'right' ? -0.05 : 0.05);
      card.mesh.position.copy(p).add(new THREE.Vector3(0, 0.12, 0)).add(out);
      card.mesh.lookAt(hp);
      card.mesh.visible = true;
    }
  }

  hide() { for (const c of Object.values(this.cards)) c.mesh.visible = false; }
  dispose() { for (const c of Object.values(this.cards)) c.dispose(); }
}
