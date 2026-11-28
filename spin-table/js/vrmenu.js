// js/vrmenu.js — the menu inside VR (B / Y opens it; the game pauses). A panel of buttons in front of you, pointed
// at with either controller's laser and clicked with its trigger.
import * as THREE from 'three';

const FONT = '"Hiragino Sans", "Noto Sans JP", "Noto Sans CJK JP", "Yu Gothic", Meiryo, Arial, sans-serif';
const W = 1024, H = 1100;

export class VrMenu {
  /** actions: { resume, restart, exit, recenter } */
  constructor(scene, settings, actions) {
    this.settings = settings;
    this.actions = actions;
    this.open = false;
    this.c = document.createElement('canvas'); this.c.width = W; this.c.height = H;
    this.g = this.c.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.c); this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0 * H / W), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, toneMapped: false }));
    this.mesh.renderOrder = 20;
    this.mesh.visible = false;
    scene.add(this.mesh);
    const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
    this.lasers = [0, 1].map(() => { const l = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0x7fffd4 })); l.visible = false; scene.add(l); return l; });
    this.hoverKey = null;
    this.buttons = [];
    this.ray = new THREE.Raycaster();
  }
  layout() {
    const S = this.settings;
    const B = [];
    let y = 120;
    const row = (label, items) => {
      B.push({ label, y, header: true });
      const n = items.length, gap = 12, w = (W - 80 - gap * (n - 1)) / n;
      items.forEach((it, i) => B.push({ ...it, x: 40 + i * (w + gap), y: y + 40, w, h: 76 }));
      y += 140;
    };
    row('', [{ text: '▶ 再開', act: () => this.actions.resume() }, { text: '↺ 最初から', act: () => this.actions.restart() }, { text: '⌖ 位置リセット', act: () => this.actions.recenter() }, { text: '✕ VR 終了', act: () => this.actions.exit() }]);
    const choice = (key, label, opts) => row(label, opts.map(([v, t]) => ({ text: t, on: S.get(key) === v, act: () => { S.set(key, v); if (['mode', 'level', 'bestOf'].includes(key)) this.actions.restart(); } })));
    choice('mode', 'モード（変えると最初から）', [['match', '試合'], ['rally', 'ラリー'], ['machine', 'マシン'], ['serve', 'サーブ']]);
    choice('level', '相手の強さ', [[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']]);
    row(`ラケットの角度　上下 ${S.get('gripTilt')}°・ひねり ${S.get('gripRoll')}°（スティックでも）`, [
      { text: '上下 −5°', act: () => S.set('gripTilt', S.get('gripTilt') - 5) }, { text: '上下 +5°', act: () => S.set('gripTilt', S.get('gripTilt') + 5) },
      { text: 'ひねり −5°', act: () => S.set('gripRoll', S.get('gripRoll') - 5) }, { text: 'ひねり +5°', act: () => S.set('gripRoll', S.get('gripRoll') + 5) },
    ]);
    choice('machSpin', '球出しマシンの回転', [['top', '上'], ['back', '下'], ['side', '横'], ['none', 'ナックル'], ['mix', 'ミックス']]);
    choice('machSpeed', '球出しマシンの速さ', [['slow', 'ゆっくり'], ['mid', 'ふつう'], ['fast', '速い']]);
    choice('assist', '打球アシスト', [[0, 'なし（物理のまま）'], [0.25, '少し'], [0.5, '中'], [1, '強']]);
    row('表示', [
      { text: `速さ・回転 ${S.get('hitInfo') ? 'オン' : 'オフ'}`, on: S.get('hitInfo'), act: () => S.set('hitInfo', !S.get('hitInfo')) },
      { text: `軌跡 ${S.get('trail') ? 'オン' : 'オフ'}`, on: S.get('trail'), act: () => S.set('trail', !S.get('trail')) },
      { text: `トスアシスト ${S.get('tossAssist') ? 'オン' : 'オフ'}`, on: S.get('tossAssist'), act: () => S.set('tossAssist', !S.get('tossAssist')) },
    ]);
    this.buttons = B;
    this.height = y;
  }
  draw() {
    this.layout();
    const g = this.g;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(8,14,28,0.92)';
    g.beginPath(); g.roundRect ? g.roundRect(0, 0, W, H, 36) : g.rect(0, 0, W, H); g.fill();
    g.fillStyle = '#fff'; g.font = `900 56px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText('SPIN TABLE', 40, 62);
    g.fillStyle = '#7fffd4'; g.font = `bold 30px ${FONT}`; g.fillText('メニュー（B / Y で閉じる）', 420, 66);
    for (const b of this.buttons) {
      if (b.header) { g.fillStyle = '#9fb3d1'; g.font = `bold 30px ${FONT}`; g.fillText(b.label, 44, b.y + 14); continue; }
      const hov = this.hoverKey === `${b.x},${b.y}`;
      g.fillStyle = b.on ? '#7fffd4' : hov ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)';
      g.beginPath(); g.roundRect ? g.roundRect(b.x, b.y, b.w, b.h, 14) : g.rect(b.x, b.y, b.w, b.h); g.fill();
      g.fillStyle = b.on ? '#0a1422' : '#fff'; g.font = `bold ${b.text.length > 9 ? 28 : 34}px ${FONT}`; g.textAlign = 'center';
      g.fillText(b.text, b.x + b.w / 2, b.y + b.h / 2 + 2, b.w - 12);
      g.textAlign = 'left';
    }
    this.tex.needsUpdate = true;
  }
  show(on, camera) {
    this.open = on;
    this.mesh.visible = on;
    for (const l of this.lasers) l.visible = false;
    if (on) {
      // 1.1 m in front of the eyes, at eye height
      const p = new THREE.Vector3(), q = new THREE.Quaternion();
      camera.getWorldPosition(p); camera.getWorldQuaternion(q);
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q); f.y = 0; f.normalize();
      this.mesh.position.copy(p).addScaledVector(f, 1.1); this.mesh.position.y = p.y - 0.12;
      this.mesh.lookAt(p.x, this.mesh.position.y, p.z);
      this.draw();
    }
  }
  /** input: the Input; returns true while open */
  update(input) {
    if (!this.open) return false;
    let hov = null;
    const sides = ['right', 'left'];
    sides.forEach((side, i) => {
      const h = input.hands[side];
      const laser = this.lasers[i];
      if (!h.tracked) { laser.visible = false; return; }
      const o = h.ray.position, d = new THREE.Vector3(0, 0, -1).applyQuaternion(h.ray.quaternion);
      this.ray.set(o, d);
      const hit = this.ray.intersectObject(this.mesh)[0];
      laser.visible = true;
      laser.position.copy(o); laser.quaternion.copy(h.ray.quaternion);
      laser.scale.z = hit ? hit.distance : 2;
      if (!hit) return;
      const px = hit.uv.x * W, py = (1 - hit.uv.y) * H;
      const b = this.buttons.find((k) => !k.header && px >= k.x && px <= k.x + k.w && py >= k.y && py <= k.y + k.h);
      if (b) { hov = b; if (h.pressed.trigger) { b.act(); input.pulse(side, 0.3, 15); this.draw(); } }
    });
    const key = hov ? `${hov.x},${hov.y}` : null;
    if (key !== this.hoverKey) { this.hoverKey = key; this.draw(); }
    return true;
  }
}
