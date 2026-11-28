// js/hud.js — text in the hall for VR (canvas textures on planes): the read-out of your last hit above the far
// end (speed, spin, the kind of spin, the stroke, how close to the sweet spot), a message banner over the net
// (the point, the call, faults), and a panel on your free wrist (mode, score, hints, the paddle angle).
import * as THREE from 'three';

const FONT = '"Hiragino Sans", "Noto Sans JP", "Noto Sans CJK JP", "Yu Gothic", Meiryo, Arial, sans-serif';

class Panel {
  constructor(w, h, pxPerM = 600) {
    this.c = document.createElement('canvas');
    this.c.width = Math.round(w * pxPerM); this.c.height = Math.round(h * pxPerM);
    this.g = this.c.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, toneMapped: false }));
    this.mesh.renderOrder = 10;
    this.key = '';
  }
  draw(key, fn) {
    if (key === this.key) return;
    this.key = key;
    const g = this.g, W = this.c.width, H = this.c.height;
    g.clearRect(0, 0, W, H);
    fn(g, W, H);
    this.tex.needsUpdate = true;
  }
}
function round(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

export function spinLabel(top, side) {
  const a = Math.abs(top), s = Math.abs(side);
  if (a < 300 && s < 300) return 'ナックル（無回転）';
  const kind = a >= s * 0.6 ? (top > 0 ? '上回転' : '下回転') : '';
  const sk = s >= 300 && s >= a * 0.4 ? (side > 0 ? '右横回転' : '左横回転') : '';
  return kind && sk ? `${kind}＋${sk}` : kind || sk;
}

export class Hud {
  constructor(scene) {
    this.scene = scene;
    // your last hit: above the far end of the table, facing you
    // to the left of the far half, above where balls fly, turned toward you
    this.info = new Panel(1.1, 0.42, 620);
    this.info.mesh.position.set(-1.45, 1.6, -0.9);
    this.info.mesh.lookAt(0, 1.45, 2.2);
    scene.add(this.info.mesh);
    this.infoT = 0;
    // the banner over the net
    this.banner = new Panel(1.6, 0.34, 520);
    this.banner.mesh.position.set(0, 2.05, -1.2);
    this.banner.mesh.lookAt(0, 1.55, 2.2);
    scene.add(this.banner.mesh);
    this.bannerT = 0;
    // the wrist panel
    this.wrist = new Panel(0.16, 0.1, 2400);
    this.wrist.mesh.visible = false;
    scene.add(this.wrist.mesh);
    this.info.mesh.visible = false;
    this.banner.mesh.visible = false;
  }
  /** d: { speed (m/s), top, side, total (rpm), stroke, sweet (0…1), face, who, assisted } */
  hit(d) {
    const kmh = Math.round(d.speed * 3.6);
    const spin = spinLabel(d.top, d.side);
    const key = `${kmh}|${Math.round(d.total)}|${spin}|${d.stroke}|${d.sweet}|${d.who}|${d.face}`;
    this.info.draw(key, (g, W, H) => {
      g.fillStyle = d.who === 'p' ? 'rgba(8,16,34,0.78)' : 'rgba(40,10,14,0.72)';
      round(g, 6, 6, W - 12, H - 12, 34); g.fill();
      g.fillStyle = d.who === 'p' ? '#7fffd4' : '#ffb4a8';
      g.font = `bold 40px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'top';
      g.fillText(d.who === 'p' ? 'あなたの打球' : '相手の打球', 36, 24);
      g.fillStyle = '#fff'; g.font = `bold 118px ${FONT}`;
      g.fillText(`${kmh}`, 36, 76);
      const w = g.measureText(`${kmh}`).width;
      g.font = `bold 46px ${FONT}`; g.fillText('km/h', 46 + w, 136);
      g.textAlign = 'right';
      g.font = `bold 82px ${FONT}`; g.fillStyle = '#ffd23f';
      g.fillText(`${Math.round(d.total).toLocaleString()} rpm`, W - 36, 86);
      g.font = `bold 44px ${FONT}`; g.fillStyle = '#fff';
      g.fillText(spin, W - 36, 176);
      g.textAlign = 'left'; g.font = `bold 42px ${FONT}`; g.fillStyle = '#cfe0ff';
      let line = d.stroke || '';
      if (d.who === 'p') {
        if (d.face === 'edge') line += '　エッジ（ふち）に当たった';
        else line += `　芯 ${Math.round(d.sweet * 100)}%　${d.face === 'fh' ? 'フォア面' : 'バック面'}`;
        if (d.assisted) line += '　（アシスト）';
      }
      g.fillText(line, 36, 196);
    });
    this.info.mesh.visible = true;
    this.infoT = 4.5;
  }
  /** a message over the net: title (big) and sub (small), for secs */
  message(title, sub = '', secs = 2.2, color = '#ffffff') {
    this.banner.draw(`${title}|${sub}|${color}`, (g, W, H) => {
      g.fillStyle = 'rgba(6,10,20,0.72)'; round(g, 6, 6, W - 12, H - 12, 30); g.fill();
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = color; g.font = `bold ${sub ? 64 : 76}px ${FONT}`;
      g.fillText(title, W / 2, sub ? H * 0.38 : H / 2, W - 48);
      if (sub) { g.fillStyle = '#cfe0ff'; g.font = `bold 40px ${FONT}`; g.fillText(sub, W / 2, H * 0.74, W - 48); }
    });
    this.banner.mesh.visible = true;
    this.bannerT = secs;
  }
  /** the wrist panel: lines of text at the free hand's grip */
  setWrist(lines, grip, cam) {
    if (!grip) { this.wrist.mesh.visible = false; return; }
    this.wrist.draw(lines.join('|'), (g, W, H) => {
      g.fillStyle = 'rgba(8,14,28,0.85)'; round(g, 4, 4, W - 8, H - 8, 26); g.fill();
      g.textAlign = 'left'; g.textBaseline = 'top';
      lines.forEach((l, i) => {
        g.fillStyle = i === 0 ? '#7fffd4' : i === lines.length - 1 ? '#ffd23f' : '#ffffff';
        g.font = `bold ${i === 0 ? 30 : 25}px ${FONT}`;
        g.fillText(l, 18, 14 + i * 36, W - 36);
      });
    });
    const m = this.wrist.mesh;
    m.visible = true;
    // like a watch: on the near side of the free hand, a little lower (the ball rests on top), facing the eyes
    const toCam = cam.clone().sub(grip.position); toCam.y = 0;
    if (toCam.lengthSq() > 1e-6) toCam.normalize();
    m.position.copy(grip.position).addScaledVector(toCam, 0.09).add(new THREE.Vector3(0, -0.045, 0));
    m.lookAt(cam);
  }
  tick(dt) {
    if (this.infoT > 0) { this.infoT -= dt; if (this.infoT <= 0) this.info.mesh.visible = false; }
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.banner.mesh.visible = false; }
  }
}
