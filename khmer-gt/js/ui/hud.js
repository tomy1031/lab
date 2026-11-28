// js/ui/hud.js — Gran Turismo style racing HUD: live tachometer, gear, speed, ERS gauge, standings, minimap, start lights & hand preview
import { clamp } from '../engine/gesture-math.js';

export function formatTime(sec) {
  if (!isFinite(sec) || sec <= 0) return '--:--.---';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec - Math.floor(sec)) * 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

export class RaceHUD {
  constructor() {
    this.el = {
      root: document.getElementById('hud'),
      posNum: document.getElementById('hud-pos'),
      lapText: document.getElementById('hud-lap'),
      timeText: document.getElementById('hud-time'),
      bestText: document.getElementById('hud-best'),
      standings: document.getElementById('hud-standings'),
      speed: document.getElementById('hud-speed'),
      gear: document.getElementById('hud-gear'),
      rpmFill: document.getElementById('hud-rpm-fill'),
      rpmVal: document.getElementById('hud-rpm-val'),
      ersFill: document.getElementById('hud-ers-fill'),
      throttleBar: document.getElementById('hud-throttle'),
      brakeBar: document.getElementById('hud-brake'),
      sourceBadge: document.getElementById('hud-source'),
      draftBadge: document.getElementById('hud-draft'),
      wrongWay: document.getElementById('hud-wrongway'),
      startOverlay: document.getElementById('start-lights'),
      startPods: [...document.querySelectorAll('#start-lights .light-pod')],
      banner: document.getElementById('hud-banner'),
      minimap: document.getElementById('minimap-canvas'),
      handPreviewWrap: document.getElementById('hand-preview-wrap'),
      handPreview: document.getElementById('hand-preview-canvas'),
    };
    this._bannerTimer = 0;
  }

  setVisible(v) {
    this.el.root.classList.toggle('hidden', !v);
  }

  showBanner(title, sub = '') {
    this.el.banner.innerHTML = `<div class="banner-main">${title}</div>${sub ? `<div class="banner-sub">${sub}</div>` : ''}`;
    this.el.banner.classList.add('show');
    this._bannerTimer = 2.6;
  }

  update(dt, { race, spline, input, handTracker, course }) {
    if (!race || !race.player) return;
    const p = race.player;

    if (this._bannerTimer > 0) {
      this._bannerTimer -= dt;
      if (this._bannerTimer <= 0) this.el.banner.classList.remove('show');
    }

    // Start 5-light overlay
    const showLights = race.state === 'countdown' || (race.state === 'racing' && race.raceTime < 0.9);
    this.el.startOverlay.classList.toggle('hidden', !showLights);
    if (showLights) {
      const green = race.state === 'racing';
      this.el.startPods.forEach((pod, i) => {
        pod.classList.toggle('red', !green && i < race.lightsLit);
        pod.classList.toggle('green', green);
      });
    }

    // Position, Lap & Timers
    this.el.posNum.textContent = String(p.position);
    this.el.lapText.textContent = `${p.lap} / ${race.totalLaps}`;
    this.el.timeText.textContent = formatTime(race.raceTime);
    this.el.bestText.textContent = formatTime(p.bestLap);

    // Compact Live Standings (Top 4 + player if lower)
    const sorted = race.getStandings();
    let html = '';
    sorted.forEach((c, idx) => {
      if (idx >= 5 && !c.isPlayer) return;
      const cls = c.isPlayer ? 'st-row me' : 'st-row';
      html += `<div class="${cls}"><span class="st-p">${idx + 1}</span><span class="st-name">${c.name}</span><span class="st-car">${c.spec.name.split(' ')[0]}</span></div>`;
    });
    this.el.standings.innerHTML = html;

    // Speedometer, Gear, RPM Bar & Pedal Telemetry
    this.el.speed.textContent = String(p.kmh);
    this.el.gear.textContent = p.gear === 0 ? 'R' : String(p.gear);
    this.el.gear.classList.toggle('boosting', p.boosting);

    const rpmPct = clamp(p.rpmNorm * 100, 4, 100);
    this.el.rpmFill.style.width = `${rpmPct}%`;
    this.el.rpmFill.classList.toggle('redline', p.rpmNorm > 0.85);
    this.el.rpmVal.textContent = `${p.rpm} RPM`;

    this.el.ersFill.style.width = `${clamp(p.ers * 100, 0, 100)}%`;
    this.el.ersFill.classList.toggle('active', p.boosting);

    this.el.throttleBar.style.height = `${clamp((input.throttle || 0) * 100, 0, 100)}%`;
    this.el.brakeBar.style.height = `${clamp((input.brake || 0) * 100, 0, 100)}%`;

    // Source badge & status alerts
    const srcLabel = {
      'vr-hands': 'VR ハンド操作',
      'vr-controllers': 'VR コントローラー',
      'hand-camera': 'カメラ・ハンドジェスチャー',
      gamepad: 'ゲームパッド',
      touch: 'タッチ操作',
      keyboard: 'キーボード',
    };
    this.el.sourceBadge.textContent = srcLabel[input.source] || 'キーボード';
    this.el.draftBadge.classList.toggle('hidden', p.slipstream < 0.25 && !p.boosting);
    this.el.draftBadge.textContent = p.boosting ? 'ERS OVERDRIVE' : 'SLIPSTREAM';
    this.el.wrongWay.classList.toggle('hidden', !race.wrongWay);

    // Track Minimap
    this.drawMinimap(spline, race.cars, course);

    // Camera Hand Preview
    const showHandPreview = !!(handTracker && handTracker.ready);
    this.el.handPreviewWrap.classList.toggle('hidden', !showHandPreview);
    if (showHandPreview) {
      handTracker.drawPreview(this.el.handPreview, input.steer);
    }
  }

  drawMinimap(spline, cars, course) {
    const cv = this.el.minimap;
    if (!cv || !spline) return;
    const ctx = cv.getContext('2d');
    const W = cv.width;
    const H = cv.height;
    ctx.clearRect(0, 0, W, H);

    const b = spline.bounds;
    const pad = 16;
    const scale = Math.min((W - pad * 2) / Math.max(1, b.w), (H - pad * 2) / Math.max(1, b.h));
    const ox = (W - b.w * scale) * 0.5 - b.minX * scale;
    const oy = (H - b.h * scale) * 0.5 - b.minZ * scale;

    // Track loop outline
    ctx.beginPath();
    for (let i = 0; i < spline.N; i += 3) {
      const p = spline.samples[i].pos;
      const x = p.x * scale + ox;
      const y = p.z * scale + oy;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.strokeStyle = course.isCyber ? '#00f0ff' : '#d4a84b';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // Start line marker
    const s0 = spline.samples[0].pos;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(s0.x * scale + ox - 3, s0.z * scale + oy - 3, 6, 6);

    // Cars
    for (const c of cars) {
      const x = c.worldPos.x * scale + ox;
      const y = c.worldPos.z * scale + oy;
      ctx.beginPath();
      ctx.arc(x, y, c.isPlayer ? 5.2 : 3.4, 0, Math.PI * 2);
      ctx.fillStyle = c.isPlayer ? '#ff2b3a' : '#e6ebf2';
      ctx.fill();
      if (c.isPlayer) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }
    }
  }
}
