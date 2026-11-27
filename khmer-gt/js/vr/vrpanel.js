// js/vr/vrpanel.js — Full Controller-Free VR Floating Menu Panel (Course select, Car select, Difficulty, Race Start, Pause, Results)
// Controlled with WebXR Hand Pinch Ray or Controller Laser.
import * as THREE from 'three';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export class VRMenuPanel {
  constructor() {
    this.w = 1.65;
    this.h = 1.05;
    this.cv = document.createElement('canvas');
    this.cv.width = 1320;
    this.cv.height = 840;
    this.ctx = this.cv.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.colorSpace = THREE.SRGBColorSpace;

    this.group = new THREE.Group();
    this.group.position.set(0, 0.08, -1.65);

    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(this.w, this.h),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, depthTest: false, fog: false })
    );
    this.mesh.renderOrder = 30;
    this.group.add(this.mesh);

    // Visible laser pointer line & dot for hand/controller menu aiming
    const rayGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -2.5)]);
    this.rayLine = new THREE.Line(rayGeo, new THREE.LineBasicMaterial({ color: '#00f0ff', depthTest: false }));
    this.rayLine.renderOrder = 35;
    this.rayLine.visible = false;

    this.cursorDot = new THREE.Mesh(
      new THREE.CircleGeometry(0.018, 16),
      new THREE.MeshBasicMaterial({ color: '#ffd447', depthTest: false })
    );
    this.cursorDot.renderOrder = 36;
    this.cursorDot.visible = false;
    this.group.add(this.cursorDot);

    this.raycaster = new THREE.Raycaster();
    this.buttons = [];
    this.hoverId = null;
    this.spec = null;
    this.visible = false;
  }

  attachTo(rigSpace, scene) {
    rigSpace.add(this.group);
    scene.add(this.rayLine);
  }

  setVisible(v) {
    this.visible = v;
    this.group.visible = v;
    this.rayLine.visible = false;
    this.cursorDot.visible = false;
  }

  // Draw structured GT VR panel: { title, subtitle, rows: [{label, value}], buttons: [{id, label, x, y, w, h, primary, active}] }
  draw(spec) {
    this.spec = spec;
    const c = this.ctx;
    const W = this.cv.width;
    const H = this.cv.height;
    c.clearRect(0, 0, W, H);

    // Luxury Carbon/Glass Backing
    roundRect(c, 8, 8, W - 16, H - 16, 36);
    c.fillStyle = 'rgba(10, 14, 22, 0.94)';
    c.fill();
    c.lineWidth = 4;
    c.strokeStyle = spec.cyber ? '#00f0ff' : '#d4a84b';
    c.stroke();

    // Header Bar
    c.fillStyle = spec.cyber ? 'rgba(0, 240, 255, 0.14)' : 'rgba(212, 168, 75, 0.14)';
    roundRect(c, 24, 24, W - 48, 128, 22);
    c.fill();

    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = spec.cyber ? '#00f0ff' : '#f2c86b';
    c.font = '900 54px "Orbitron", "Noto Sans JP", sans-serif';
    c.fillText(spec.title || 'KHMER GT VR', W / 2, 70);

    c.fillStyle = '#dce4f0';
    c.font = '600 26px "Noto Sans JP", sans-serif';
    c.fillText(spec.subtitle || '人差し指でポイント＆ピンチで選択（コントローラー不要）', W / 2, 122);

    // Info Rows
    const rows = spec.rows || [];
    let ry = 198;
    for (const r of rows) {
      roundRect(c, 48, ry - 26, W - 96, 56, 12);
      c.fillStyle = r.highlight ? 'rgba(212, 168, 75, 0.26)' : 'rgba(255, 255, 255, 0.06)';
      c.fill();
      c.textAlign = 'left';
      c.fillStyle = '#9aa8bd';
      c.font = '700 26px "Noto Sans JP", sans-serif';
      c.fillText(r.label, 76, ry + 2);
      c.textAlign = 'right';
      c.fillStyle = r.highlight ? '#ffd45e' : '#ffffff';
      c.font = '800 30px "Orbitron", "Noto Sans JP", sans-serif';
      c.fillText(r.value, W - 76, ry + 2);
      ry += 66;
    }

    // Buttons
    this.buttons = spec.buttons || [];
    for (const b of this.buttons) {
      const hov = this.hoverId === b.id;
      roundRect(c, b.x, b.y, b.w, b.h, 18);
      if (b.primary) {
        c.fillStyle = hov ? '#ff4655' : '#d92b3a';
      } else if (b.active) {
        c.fillStyle = hov ? '#f0c45e' : '#d4a84b';
      } else {
        c.fillStyle = hov ? '#2c374c' : '#18202f';
      }
      c.fill();
      c.lineWidth = hov ? 5 : 2;
      c.strokeStyle = hov ? '#00f0ff' : 'rgba(255,255,255,0.22)';
      c.stroke();

      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = b.active && !b.primary ? '#0d1016' : '#ffffff';
      c.font = `800 ${b.fontSize || 30}px "Noto Sans JP", sans-serif`;
      c.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 2);
    }

    this.tex.needsUpdate = true;
  }

  // Raycast VR Hand/Controller ray onto this panel and trigger onSelect(buttonId) on pinch/trigger
  updateInteraction(vrInput, onSelect) {
    if (!this.visible || !vrInput || !vrInput.pointerRay.active) {
      this.rayLine.visible = false;
      this.cursorDot.visible = false;
      return;
    }

    const { origin, dir } = vrInput.pointerRay;
    this.raycaster.set(origin, dir);
    const hits = this.raycaster.intersectObject(this.mesh, false);

    // Draw laser line
    this.rayLine.visible = true;
    const endDist = hits.length ? hits[0].distance : 2.2;
    const endPt = origin.clone().addScaledVector(dir, endDist);
    const posAttr = this.rayLine.geometry.attributes.position;
    posAttr.setXYZ(0, origin.x, origin.y, origin.z);
    posAttr.setXYZ(1, endPt.x, endPt.y, endPt.z);
    posAttr.needsUpdate = true;

    let newHover = null;
    if (hits.length && hits[0].uv) {
      const uv = hits[0].uv;
      const px = uv.x * this.cv.width;
      const py = (1 - uv.y) * this.cv.height;
      this.cursorDot.visible = true;
      this.cursorDot.position.set((uv.x - 0.5) * this.w, (uv.y - 0.5) * this.h, 0.01);

      for (const b of this.buttons) {
        if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) {
          newHover = b.id;
          break;
        }
      }
    } else {
      this.cursorDot.visible = false;
    }

    if (newHover !== this.hoverId) {
      this.hoverId = newHover;
      if (this.spec) this.draw(this.spec);
    }

    if (vrInput.selectEdge && this.hoverId) {
      onSelect?.(this.hoverId);
    }
  }
}
