// js/ui/hud.js — VR HUD (§10.11): ① the left-forearm band ② a small panel that lazily follows, lower-left, 1.2 m ahead.
// Never glued to the head. Redrawn only when what it shows changes (≤ 5 Hz). (OPUS-B)
import * as THREE from 'three';
import { makePanel, card, text, gauge, hearts, wrap, C } from './text.js';

const GAIT = { idle: '休み', walk: '歩き WALK', jog: '駆け足 JOG', sprint: '全力 SPRINT' };
const TIER = ['', '追い風 I', '追い風 II'];

export function createHud(ctx, S) {
  const root = new THREE.Group();
  root.name = 'ui:hud';
  ctx.scene.add(root);
  // HUD boards always read on top of grass and slopes (no depth test)
  const float = makePanel(ctx, 512, 300, 0.46, { depthTest: false, renderOrder: 60 });
  const band = makePanel(ctx, 256, 112, 0.115, { depthTest: false, renderOrder: 61 });
  root.add(float.mesh);
  float.mesh.visible = false;
  band.mesh.visible = false;
  let bandParent = null;
  const _h = new THREE.Vector3(), _t = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _f = new THREE.Vector3();
  let sigF = '', sigB = '', drawT = 0, placed = false;

  function drawFloat() {
    const g = float.g, W = float.w, H = float.h;
    g.clearRect(0, 0, W, H);
    card(g, 4, 4, W - 8, H - 8, 26);
    const v = S.vitals;
    hearts(g, 22, 18, 36, v.hp, v.maxHp, 8);
    const rows = Math.ceil(v.maxHp / 4) > 8 ? 2 : 1;
    let y = 18 + rows * 37 + 8;
    // tailwind
    text(g, '追い風', 22, y + 20, { size: 20, color: C.cyan });
    text(g, 'TAILWIND', 92, y + 20, { size: 13, color: C.dim, weight: 500 });
    if (v.tier) text(g, TIER[v.tier], W - 24, y + 20, { size: 20, color: C.gold, align: 'right' });
    gauge(g, 22, y + 30, W - 44, 16, v.stamina / Math.max(1, v.maxStamina), v.tier >= 2 ? C.gold : C.cyan, undefined, [50 / v.maxStamina, 100 / v.maxStamina].filter((m) => m < 1));
    y += 64;
    // cadence + gait
    text(g, `${S.cadence}`, 22, y + 36, { size: 44, weight: 800, color: C.white });
    text(g, 'spm', 22 + g.measureText(`${S.cadence}`).width + 8, y + 36, { size: 18, color: C.dim });
    text(g, GAIT[S.gait] || '', 150, y + 34, { size: 20, color: S.gait === 'idle' ? C.dim : C.gold });
    text(g, `${S.stepsToday.toLocaleString()} 歩`, W - 24, y + 22, { size: 22, color: C.ink, align: 'right' });
    text(g, `${S.kcalToday.toFixed(0)} kcal 目安`, W - 24, y + 46, { size: 16, color: C.dim, align: 'right' });
    y += 62;
    // objective / trial / boss
    if (S.trial) {
      const t = S.trial;
      text(g, t.name, 22, y + 22, { size: 20, color: C.gold, maxW: 300 });
      text(g, t.label, W - 24, y + 22, { size: 20, color: C.white, align: 'right' });
      gauge(g, 22, y + 34, W - 44, 12, t.k, C.gold);
    } else if (S.boss && S.boss.phase === 2) {
      text(g, '殻をはがせ — その場で駆け足 140+', 22, y + 22, { size: 19, color: C.gold, maxW: W - 44 });
      gauge(g, 22, y + 34, W - 44, 12, S.boss.k, C.cyan);
    } else if (S.objective && S.objective.text) {
      text(g, S.objective.text, 22, y + 22, { size: 19, color: C.ink, maxW: W - 130 });
      if (S.objDist != null) text(g, S.objDist >= 1000 ? `${(S.objDist / 1000).toFixed(1)} km` : `${Math.round(S.objDist)} m`, W - 64, y + 22, { size: 18, color: C.gold, align: 'right' });
      // arrow relative to where you face
      if (S.objDist != null) {
      g.save();
      g.translate(W - 38, y + 14);
      g.rotate(S.objBearing || 0);
      g.beginPath(); g.moveTo(0, -14); g.lineTo(10, 10); g.lineTo(0, 4); g.lineTo(-10, 10); g.closePath();
      g.fillStyle = C.gold; g.fill(); g.lineWidth = 3; g.strokeStyle = 'rgba(14,20,48,0.8)'; g.stroke();
      g.restore();
      }
    }
    float.flush();
  }
  function drawBand() {
    const g = band.g, W = band.w, H = band.h;
    g.clearRect(0, 0, W, H);
    card(g, 2, 2, W - 4, H - 4, 18, 'rgba(27,36,64,0.9)');
    const v = S.vitals;
    hearts(g, 10, 8, 26, v.hp, v.maxHp, 8);
    gauge(g, 12, 66, 150, 12, v.stamina / Math.max(1, v.maxStamina), v.tier >= 2 ? C.gold : C.cyan);
    text(g, `${S.cadence}`, W - 14, 92, { size: 34, weight: 800, align: 'right', color: C.white });
    text(g, 'spm', W - 14, 104, { size: 12, align: 'right', color: C.dim });
    text(g, TIER[v.tier] || 'TAILWIND', 12, 100, { size: 14, color: v.tier ? C.gold : C.dim });
    band.flush();
  }

  return {
    float, band,
    update(dt, vr) {
      // hidden while the wrist menu is open (it shows the same things, and they would overlap)
      const showFloat = vr && S.hudVisible && !S.menuOpen && ctx.settings && ctx.settings.get('hudMode') !== 'wrist';
      float.mesh.visible = !!showFloat;
      const left = ctx.input && ctx.input.hands && ctx.input.hands.left;
      const showBand = vr && S.hudVisible && left && left.tracked && left.object3D;
      if (showBand && bandParent !== left.object3D) {
        bandParent = left.object3D;
        bandParent.add(band.mesh);
        // on the top of the left forearm, tilted toward the eyes
        band.mesh.position.set(0, 0.035, 0.11);
        band.mesh.rotation.set(-Math.PI / 2 + 0.5, 0, 0);
      }
      band.mesh.visible = !!showBand;
      drawT -= dt;
      if (drawT <= 0 && (showFloat || showBand)) {
        drawT = 0.2;
        const v = S.vitals;
        const sb = `${v.hp}|${v.maxHp}|${Math.round(v.stamina)}|${v.tier}|${S.cadence}`;
        if (showBand && sb !== sigB) { sigB = sb; drawBand(); }
        const sf = `${sb}|${S.gait}|${S.stepsToday}|${Math.round(S.kcalToday)}|${S.objective ? S.objective.text : ''}|${Math.round((S.objDist || 0) / 5)}|${Math.round((S.objBearing || 0) * 8)}|${S.trial ? S.trial.label + S.trial.k.toFixed(2) : ''}|${S.boss ? S.boss.k.toFixed(2) + S.boss.phase : ''}`;
        if (showFloat && sf !== sigF) { sigF = sf; drawFloat(); }
      }
      if (showFloat) {
        const head = ctx.input.head;
        _h.copy(head.pos);
        const yaw = head.yaw ?? 0;
        // lower-left of the view, 1.2 m out (yaw only: looking around does not drag it)
        const a = yaw - 0.42;
        _t.set(_h.x + Math.sin(a) * 1.2, _h.y - 0.45, _h.z - Math.cos(a) * 1.2);
        // snap after a teleport / respawn instead of flying across the map
        if (!placed || float.mesh.position.distanceToSquared(_t) > 9) { float.mesh.position.copy(_t); placed = true; }
        const k = 1 - Math.exp(-dt / 0.45);
        float.mesh.position.lerp(_t, k);
        float.mesh.lookAt(_h);
      } else placed = false;
    },
    forceDraw() { sigF = sigB = ''; drawT = 0; },
    hideAll() { float.mesh.visible = false; band.mesh.visible = false; },
  };
}

export function createToasts(ctx, S) {
  // VR placement (ART_REVIEW B-P2-7): nothing within 10° of the gaze.
  //   title — 13° above the gaze, 2.2 m, 0.9 m wide, 2.4 s     toast — 18° below, 1.4 m, 0.5 m wide, one at a time
  // Both follow the head's direction about 0.6 s late. Smallest text ≥ 1.1° (≈ 22 px on Quest 2).
  const root = new THREE.Group();
  root.name = 'ui:toasts';
  ctx.scene.add(root);
  const TOAST_D = 1.4, TITLE_D = 2.2, TOAST_DOWN = 18 * Math.PI / 180, TITLE_UP = 13 * Math.PI / 180;
  const toast = makePanel(ctx, 1024, 256, 0.5, { renderOrder: 62, depthTest: false });
  const title = makePanel(ctx, 1024, 200, 0.9, { renderOrder: 62, depthTest: false });
  root.add(toast.mesh, title.mesh);
  toast.mesh.visible = title.mesh.visible = false;
  const _h = new THREE.Vector3(), _f = new THREE.Vector3();
  let curT = null, curTitle = null, gYaw = 0, gPitch = 0, gInit = false;
  const BG = 'rgba(27,36,64,0.8)';

  function drawToast(t) {
    const g = toast.g, W = toast.w, H = toast.h;
    g.clearRect(0, 0, W, H);
    const accent = t.kind === 'warn' ? '#ffb347' : t.kind === 'quest' ? C.cyan : C.gold;
    card(g, 6, 6, W - 12, H - 12, 34, BG, accent);
    g.fillStyle = accent; g.fillRect(30, 34, 8, H - 68);
    // one line at 74 px if it fits, else up to two lines at 60 px
    let size = 74, ls = wrap(g, String(t.text || ''), W - 104, size, 700);
    if (ls.length > 1) { size = 60; ls = wrap(g, String(t.text || ''), W - 104, size, 700).slice(0, 2); }
    let y = ls.length > 1 ? (t.sub ? 78 : 112) : (t.sub ? 112 : 150);
    for (const L of ls) { text(g, L, 62, y, { size, weight: 700, color: C.ink, maxW: W - 96 }); y += size * 1.12; }
    if (t.sub) text(g, String(t.sub), 62, H - 36, { size: 56, weight: 500, color: C.gold, maxW: W - 96 });   // 1.12° ≈ 23 px on Quest 2
    toast.flush();
  }
  function drawTitle(t) {
    const g = title.g, W = title.w, H = title.h;
    g.clearRect(0, 0, W, H);
    card(g, 6, 6, W - 12, H - 12, 40, BG, null);
    g.fillStyle = C.gold; g.fillRect(W / 2 - 150, 16, 300, 4);
    text(g, String(t.text || ''), W / 2, 112, { size: 92, weight: 800, align: 'center', color: C.ink, maxW: W - 60 });
    if (t.sub) text(g, String(t.sub), W / 2, 178, { size: 50, weight: 500, align: 'center', color: C.gold, maxW: W - 60 });
    title.flush();
  }
  function place(mesh, dist, dPitch) {
    const p = Math.max(-1.2, Math.min(1.1, gPitch + dPitch));
    _f.set(Math.sin(gYaw) * Math.cos(p), Math.sin(p), -Math.cos(gYaw) * Math.cos(p));
    mesh.position.copy(_h).addScaledVector(_f, dist);
    mesh.lookAt(_h);
  }

  return {
    toast, title,
    hideAll() { toast.mesh.visible = false; title.mesh.visible = false; },
    update(dt, vr) {
      // queues (shared with the PC overlay)
      if (curT) { curT.left -= dt * 1000; if (curT.left <= 0) curT = null; }
      if (!curT && S.toastQueue.length) { curT = S.toastQueue.shift(); curT.left = curT.ms || 3000; if (vr) drawToast(curT); curT.drawn = vr; }
      if (curT && vr && !curT.drawn) { drawToast(curT); curT.drawn = true; }
      if (curTitle) { curTitle.left -= dt * 1000; if (curTitle.left <= 0) curTitle = null; }
      if (!curTitle && S.titleQueue.length) { curTitle = S.titleQueue.shift(); curTitle.left = curTitle.ms || 2400; if (vr) drawTitle(curTitle); curTitle.drawn = vr; }
      if (curTitle && vr && !curTitle.drawn) { drawTitle(curTitle); curTitle.drawn = true; }
      toast.mesh.visible = !!(vr && curT && S.hudVisible);
      title.mesh.visible = !!(vr && curTitle && S.hudVisible);
      S.currentToast = curT; S.currentTitle = curTitle;
      if (!vr) { gInit = false; return; }
      // the gaze, followed ~0.6 s late
      const head = ctx.input.head;
      _h.copy(head.pos);
      _f.set(0, 0, -1).applyQuaternion(head.quat);
      const yaw = Math.atan2(_f.x, -_f.z), pitch = Math.asin(Math.max(-1, Math.min(1, _f.y)));
      if (!gInit) { gYaw = yaw; gPitch = pitch; gInit = true; }
      const k = 1 - Math.exp(-dt / 0.3);
      let dy = yaw - gYaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      gYaw += dy * k; gPitch += (pitch - gPitch) * k;
      if (toast.mesh.visible) {
        place(toast.mesh, TOAST_D, -TOAST_DOWN);
        toast.mat.opacity = Math.max(0, Math.min(1, curT.left / 300, ((curT.ms || 3000) - curT.left) / 200));
      }
      if (title.mesh.visible) {
        place(title.mesh, TITLE_D, TITLE_UP);
        title.mat.opacity = Math.max(0, Math.min(1, ((curTitle.ms || 2400) - curTitle.left) / 300, curTitle.left / 600));
      }
    },
  };
}
