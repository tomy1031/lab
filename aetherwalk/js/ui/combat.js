// js/ui/combat.js — combat cues (OPUS-B): a warm vignette pulse when you step into a fire's safe zone (a faint
// cool one when you leave it), the first-time hint 「火のそば — 凪は近づけない」, and the combo count.
// VR: one head-locked quad, drawn only while it pulses (~1.4 s); the combo goes on the float panel (hud.js).
// PC: CSS overlays.
import * as THREE from 'three';

const PULSE = 1.4, WARM = 0xffa04a, COOL = 0x8fb4ff;
const CSS = `
#aw-overlay .awui-zone { position:fixed; inset:0; pointer-events:none; opacity:0; display:none;
  background:radial-gradient(ellipse at center, rgba(0,0,0,0) 52%, var(--zc, rgba(255,160,74,0.5)) 100%); }
#aw-overlay .awui-combo { position:fixed; right:22%; top:44%; display:none; pointer-events:none; color:#ffd76a; font-weight:800;
  font-size:30px; text-shadow:0 2px 6px rgba(14,20,48,0.8); letter-spacing:.02em; }
#aw-overlay .awui-combo small { font-size:13px; margin-left:6px; letter-spacing:.12em; color:#f4ecd8; }
`;

export function createCombatCues(ctx, S, ui) {
  // ── VR: a soft ring of colour around the view, 0.3 m in front of the eyes ──
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 40, 128, 128, 128);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.05)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, color: WARM, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.15), mat);
  quad.name = 'ui:zonecue';
  quad.position.set(0, 0, -0.3);
  quad.renderOrder = 95;
  quad.frustumCulled = false;
  quad.visible = false;
  if (ctx.camera) ctx.camera.add(quad);
  try { const r = ctx.renderer; if (r && r.compile) r.compile(quad, ctx.camera, ctx.scene); } catch (e) { /* compiled on first use */ }

  // ── PC ──
  let zoneEl = null, comboEl = null;
  try {
    if (!document.getElementById('awui-combat-style')) { const st = document.createElement('style'); st.id = 'awui-combat-style'; st.textContent = CSS; document.head.appendChild(st); }
    const host = (ui.overlay && ui.overlay.root) || document.getElementById('aw-overlay');
    if (host) {
      zoneEl = document.createElement('div'); zoneEl.className = 'awui-zone'; host.appendChild(zoneEl);
      comboEl = document.createElement('div'); comboEl.className = 'awui-combo'; host.appendChild(comboEl);
    }
  } catch (e) { zoneEl = comboEl = null; }

  let pulseT = 0, peak = 0;
  function pulse(warm) {
    pulseT = PULSE; peak = warm ? 0.5 : 0.28;
    mat.color.setHex(warm ? WARM : COOL);
    if (zoneEl) zoneEl.style.setProperty('--zc', warm ? 'rgba(255,160,74,0.5)' : 'rgba(143,180,255,0.32)');
  }
  const on = (n, f) => ctx.events && ctx.events.on(n, (p) => { try { f(p || {}); } catch (e) { /* never break the emitter */ } });
  on('safe:enter', (p) => {
    if (p.quiet) return;
    pulse(true);
    const Q = ctx.game && ctx.game.quest;
    if (Q && !Q.flags.safeHint) {
      Q.flags.safeHint = true;
      ui.toast('火のそば — 凪は近づけない', { sub: 'BY THE FIRE · THE NAGI KEEP AWAY', kind: 'info', ms: 4500, tag: 'safe' });
    }
  });
  on('safe:leave', (p) => { if (!p.quiet) pulse(false); });
  on('combat:combo', (p) => { S.combo = p.n || 0; S.comboT = p.n ? 2 : 0; if (comboEl && p.n >= 2 && !(S.counterT > 0)) comboEl.innerHTML = `×${p.n}<small>COMBO</small>`; });
  // 返し斬り (DESIGN_V2 §4.2): the combo line says 返し！ for a moment
  on('counter', () => { S.counterT = 1.6; if (comboEl) comboEl.innerHTML = '返し！<small>COUNTER</small>'; });

  return {
    update(dt, vr) {
      if (pulseT > 0) {
        pulseT = Math.max(0, pulseT - dt);
        const t = PULSE - pulseT, k = t < 0.25 ? t / 0.25 : pulseT / (PULSE - 0.25);
        const a = peak * Math.max(0, Math.min(1, k));
        mat.opacity = a;
        quad.visible = !!vr && a > 0.005 && S.hudVisible !== false;
        if (zoneEl) { zoneEl.style.display = !vr && a > 0.005 ? 'block' : 'none'; zoneEl.style.opacity = String(a / peak); }
      } else if (quad.visible || (zoneEl && zoneEl.style.display === 'block')) {
        quad.visible = false; if (zoneEl) zoneEl.style.display = 'none';
      }
      if (S.comboT > 0) { S.comboT -= dt; if (S.comboT <= 0) S.combo = 0; }
      if (S.counterT > 0) { S.counterT -= dt; if (S.counterT <= 0 && comboEl && S.combo >= 2) comboEl.innerHTML = `×${S.combo}<small>COMBO</small>`; }
      if (comboEl) comboEl.style.display = !vr && (S.combo >= 2 || S.counterT > 0) && S.hudVisible !== false ? 'block' : 'none';
    },
    hideAll() { quad.visible = false; if (zoneEl) zoneEl.style.display = 'none'; if (comboEl) comboEl.style.display = 'none'; },
    pulse,
  };
}
