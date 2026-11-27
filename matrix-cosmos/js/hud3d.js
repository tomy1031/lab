// js/hud3d.js — Sleek translucent Matrix holographic VR dock (curved console at waist height, never blocks 360° view)
import * as THREE from 'three';

const FONT = '"JetBrains Mono", "Fira Code", "Noto Sans JP", "Hiragino Kaku Gothic ProN", monospace';

// Helper: crisp glowing Matrix text sprite / plane for in-world diegetic labels
export function makeHoloLabel(text, { w = 0.82, h = 0.19, color = '#00ff55', bg = 'rgba(1,12,6,0.86)', fontSize = 40 } = {}) {
  const cw = Math.round(w * 900);
  const ch = Math.round(h * 900);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(256, cw);
  canvas.height = Math.max(96, ch);
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  const draw = (txt, col = color) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (bg) {
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.roundRect(6, 6, canvas.width - 12, canvas.height - 12, 16);
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.font = `800 ${fontSize}px ${FONT}`;
    ctx.fillStyle = col;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = String(txt).split('\n');
    const lh = fontSize * 1.28;
    const y0 = canvas.height / 2 - ((lines.length - 1) * lh) / 2;
    lines.forEach((line, i) => ctx.fillText(line, canvas.width / 2, y0 + i * lh));
    tex.needsUpdate = true;
  };
  draw(text, color);

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide })
  );
  mesh.userData.updateText = draw;
  return mesh;
}

export class HoloDock {
  constructor(app) {
    this.app = app;
    this.W = 1280;
    this.H = 380;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.ctx = this.canvas.getContext('2d');

    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;

    this.widthM = 1.18;
    this.heightM = (this.widthM * this.H) / this.W;

    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(this.widthM, this.heightM),
      new THREE.MeshBasicMaterial({
        map: this.tex,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        side: THREE.DoubleSide,
      })
    );
    // Low waist-level cockpit console, tilted up 32° so your upper view is 100% open!
    this.mesh.position.set(0, 0.88, -1.08);
    this.mesh.rotation.x = -0.56;
    this.mesh.renderOrder = 25;
    this.mesh.visible = false;

    this.buttons = [];
    this.hoverId = null;
    this.dirty = true;
    this.hiddenByUser = false;
    this._inv = new THREE.Matrix4();
    this._sliderRect = null;
    this._lastStateKey = '';
  }

  rayHit(ray) {
    if (!this.mesh.visible) return null;
    this.mesh.updateWorldMatrix(true, false);
    this._inv.copy(this.mesh.matrixWorld).invert();
    const o = ray.origin.clone().applyMatrix4(this._inv);
    const d = ray.direction.clone().transformDirection(this._inv);
    if (Math.abs(d.z) < 1e-6) return null;
    const t = -o.z / d.z;
    if (t < 0 || t > 4.5) return null;
    const lx = o.x + d.x * t;
    const ly = o.y + d.y * t;
    if (Math.abs(lx) > this.widthM * 0.5 || Math.abs(ly) > this.heightM * 0.5) return null;

    const cx = (lx / this.widthM + 0.5) * this.W;
    const cy = (0.5 - ly / this.heightM) * this.H;
    const wp = new THREE.Vector3(lx, ly, 0).applyMatrix4(this.mesh.matrixWorld);
    const dist = wp.distanceTo(ray.origin);

    let sliderVal = null;
    if (this._sliderRect) {
      const sr = this._sliderRect;
      if (cx >= sr.x - 12 && cx <= sr.x + sr.w + 12 && cy >= sr.y - 14 && cy <= sr.y + sr.h + 14) {
        sliderVal = THREE.MathUtils.clamp((cx - sr.x) / sr.w, 0, 1);
      }
    }
    const btn = this.buttons.find((b) => cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h);
    return { dist, point: wp, button: btn ? btn.id : null, sliderVal };
  }

  draw(state) {
    const c = this.ctx;
    const W = this.W;
    const H = this.H;
    this.buttons = [];
    this._sliderRect = null;
    c.clearRect(0, 0, W, H);

    // Translucent Matrix obsidian glass frame with corner brackets
    c.fillStyle = 'rgba(2, 10, 5, 0.84)';
    c.beginPath();
    c.roundRect(6, 6, W - 12, H - 12, 20);
    c.fill();
    c.strokeStyle = 'rgba(0, 255, 85, 0.45)';
    c.lineWidth = 2.5;
    c.stroke();

    // Glowing corner brackets
    c.strokeStyle = '#00ff55';
    c.lineWidth = 4;
    const L = 28;
    const corners = [
      [14, 14, 1, 1],
      [W - 14, 14, -1, 1],
      [14, H - 14, 1, -1],
      [W - 14, H - 14, -1, -1],
    ];
    for (const [x, y, dx, dy] of corners) {
      c.beginPath();
      c.moveTo(x + dx * L, y);
      c.lineTo(x, y);
      c.lineTo(x, y + dy * L);
      c.stroke();
    }

    // Row 1: 5 Realm Portal Tabs
    const realms = state.realms;
    const padX = 28;
    const gap = 12;
    const tabW = (W - padX * 2 - gap * (realms.length - 1)) / realms.length;
    const tabY = 22;
    const tabH = 58;
    realms.forEach((r, i) => {
      const x = padX + i * (tabW + gap);
      const id = `realm:${i}`;
      const active = i === state.realmIndex;
      const hover = this.hoverId === id;
      c.beginPath();
      c.roundRect(x, tabY, tabW, tabH, 10);
      c.fillStyle = active
        ? 'rgba(0, 255, 85, 0.24)'
        : hover
          ? 'rgba(0, 255, 85, 0.14)'
          : 'rgba(0, 30, 14, 0.55)';
      c.fill();
      c.strokeStyle = active ? '#00ff55' : hover ? '#88ffaa' : 'rgba(0, 255, 85, 0.28)';
      c.lineWidth = active ? 3 : 1.5;
      c.stroke();

      c.fillStyle = active ? '#d8ffe6' : '#85e6a5';
      c.font = `800 22px ${FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(r.shortLabel, x + tabW / 2, tabY + tabH / 2 + 1);
      this.buttons.push({ id, x, y: tabY, w: tabW, h: tabH });
    });

    // Row 2: Live Telemetry + Insight line
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillStyle = '#00f0ff';
    c.font = `700 24px ${FONT}`;
    c.fillText(state.telemetry || '', padX + 4, 114);

    c.fillStyle = '#c8ffe0';
    c.font = `600 25px ${FONT}`;
    c.fillText(state.insight || '', padX + 4, 156);

    // Row 3: Primary Parameter Slider Bar
    if (state.slider) {
      const sy = 198;
      const sh = 50;
      c.fillStyle = '#88e8aa';
      c.font = `700 22px ${FONT}`;
      c.textAlign = 'left';
      c.fillText(state.slider.label, padX + 4, sy + sh / 2);

      const barX = 290;
      const barW = W - barX - 180;
      const barY = sy + 14;
      const barH = 22;
      this._sliderRect = { x: barX, y: barY, w: barW, h: barH };

      c.fillStyle = 'rgba(0, 40, 18, 0.9)';
      c.beginPath();
      c.roundRect(barX, barY, barW, barH, 11);
      c.fill();
      c.strokeStyle = 'rgba(0, 255, 85, 0.45)';
      c.lineWidth = 2;
      c.stroke();

      const fillW = Math.max(12, barW * state.slider.value);
      const grad = c.createLinearGradient(barX, 0, barX + barW, 0);
      grad.addColorStop(0, '#00ff55');
      grad.addColorStop(0.7, '#00f0ff');
      grad.addColorStop(1, '#ff1e42');
      c.fillStyle = grad;
      c.beginPath();
      c.roundRect(barX, barY, fillW, barH, 11);
      c.fill();

      // Glowing handle knob
      const kx = barX + barW * state.slider.value;
      c.beginPath();
      c.arc(kx, barY + barH / 2, 16, 0, Math.PI * 2);
      c.fillStyle = '#e8fff0';
      c.fill();
      c.strokeStyle = '#00ff55';
      c.lineWidth = 3;
      c.stroke();

      // Value readout
      c.fillStyle = '#ffffff';
      c.font = `800 24px ${FONT}`;
      c.textAlign = 'right';
      c.fillText(state.slider.readout, W - padX - 4, sy + sh / 2);
    }

    // Row 4: Realm Actions + System Buttons
    const actions = [
      ...(state.actions || []),
      { id: 'sys:recenter', label: '正面補正' },
      { id: 'sys:mute', label: state.muted ? '音 OFF' : '音 ON' },
      { id: 'sys:hide', label: 'B/Y:隠す' },
    ];
    const ay = 286;
    const ah = 64;
    const aw = (W - padX * 2 - gap * (actions.length - 1)) / actions.length;
    actions.forEach((a, i) => {
      const x = padX + i * (aw + gap);
      const hover = this.hoverId === a.id;
      const isHot = a.hot;
      c.beginPath();
      c.roundRect(x, ay, aw, ah, 10);
      c.fillStyle = isHot
        ? 'rgba(255, 30, 66, 0.32)'
        : a.active
          ? 'rgba(0, 240, 255, 0.25)'
          : hover
            ? 'rgba(0, 255, 85, 0.22)'
            : 'rgba(0, 35, 16, 0.65)';
      c.fill();
      c.strokeStyle = isHot ? '#ff2a4b' : a.active ? '#00f0ff' : hover ? '#ffffff' : 'rgba(0, 255, 85, 0.42)';
      c.lineWidth = isHot || a.active ? 2.5 : 1.5;
      c.stroke();

      c.fillStyle = isHot ? '#ffd6de' : '#e8fff0';
      c.font = `800 22px ${FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(a.label, x + aw / 2, ay + ah / 2 + 1);
      this.buttons.push({ id: a.id, x, y: ay, w: aw, h: ah });
    });

    this.tex.needsUpdate = true;
  }

  update(state) {
    this.mesh.visible = this.app.xrActive && !this.hiddenByUser;
    if (!this.mesh.visible) return;
    const key = JSON.stringify([
      state.realmIndex,
      state.telemetry,
      state.insight,
      state.slider?.value?.toFixed(3),
      state.slider?.readout,
      state.actions?.map((a) => `${a.id}:${a.active}:${a.label}`),
      state.muted,
      this.hoverId,
    ]);
    if (key !== this._lastStateKey) {
      this._lastStateKey = key;
      this.draw(state);
    }
  }
}
