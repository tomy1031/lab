// js/ui/talk.js — the speech bubble (DESIGN_V2 §1.7, OPUS-B). One camera-facing panel 0.4 m up and to the right of
// the speaker's head (1 draw call): at 3 m their name and 「…」, while talking the line (2 rows at most), for a
// question the answer hint. PC: a DOM bubble at the top and the keys E (talk / next), Y (yes), N (no).
import * as THREE from 'three';
import { makePanel, card, text, C } from './text.js';

const CSS = `
#aw-overlay .awui-talk { position:fixed; left:50%; top:16%; transform:translateX(-50%); display:none; pointer-events:none; min-width:260px;
  max-width:min(560px, 70vw); padding:10px 18px 12px; background:rgba(27,36,64,0.86); border:1px solid rgba(255,215,106,0.45);
  border-radius:16px; color:#f4ecd8; text-align:center; }
#aw-overlay .awui-talk .nm { font-size:13px; color:#ffd76a; letter-spacing:.08em; font-weight:700; }
#aw-overlay .awui-talk .ln { font-size:22px; font-weight:700; margin-top:2px; }
#aw-overlay .awui-talk .ht { font-size:12px; color:rgba(244,236,216,0.7); margin-top:4px; }
`;

/** split a line (≤ 24 chars) into at most two rows, at a comma / stop near the middle when there is one */
export function wrapLine(s, max = 13) {
  if (!s || s.length <= max) return [s || ''];
  const mid = s.length / 2;
  let cut = -1, best = 99;
  for (let i = 3; i < s.length - 2; i++) if ('、。？！…'.includes(s[i])) { const d = Math.abs(i + 1 - mid); if (d < best) { best = d; cut = i + 1; } }
  if (cut < 0 || best > 5) cut = Math.ceil(mid);
  return [s.slice(0, cut), s.slice(cut)];
}

export function createTalk(ctx, S, ui) {
  const panel = makePanel(ctx, 768, 260, 0.7, { depthTest: true, renderOrder: 60 });
  panel.mesh.name = 'ui:talk';
  panel.mesh.visible = false;
  ctx.scene.add(panel.mesh);
  try { const r = ctx.renderer; if (r && r.compile) r.compile(panel.mesh, ctx.camera, ctx.scene); } catch (e) { /* compiled on first use */ }
  const _h = new THREE.Vector3(), _t = new THREE.Vector3(), _r = new THREE.Vector3();
  let near = null;                 // { id, name, en }
  let line = null;                 // { id, name, en, text, ask, i, of }
  let shown = '';

  let dom = null;
  try {
    if (!document.getElementById('awui-talk-style')) { const st = document.createElement('style'); st.id = 'awui-talk-style'; st.textContent = CSS; document.head.appendChild(st); }
    const host = (ui.overlay && ui.overlay.root) || document.getElementById('aw-overlay');
    if (host) { dom = document.createElement('div'); dom.className = 'awui-talk'; dom.innerHTML = '<div class="nm"></div><div class="ln"></div><div class="ht"></div>'; host.appendChild(dom); }
  } catch (e) { dom = null; }

  const vrNow = () => !!(ctx.flags && ctx.flags.xr) || !!(ctx.renderer && ctx.renderer.xr && ctx.renderer.xr.isPresenting);
  function hint(ask) {
    if (ask) return vrNow() ? 'うなずく・A：はい　首をふる・B：いいえ' : 'Y：はい　N：いいえ';
    return vrNow() ? '指してトリガー・近くで見つめる：話す' : 'E：話す';
  }
  function draw() {
    const g = panel.g, W = panel.w, H = panel.h;
    g.clearRect(0, 0, W, H);
    const talking = !!line;
    const name = talking ? line.name : near ? near.name : '';
    const en = talking ? line.en : near ? near.en : '';
    const h = talking ? (line.ask ? 236 : 196) : 112;
    card(g, 4, 4, W - 8, h, 26, 'rgba(27,36,64,0.86)', 'rgba(255,215,106,0.5)');
    // the little tail toward the speaker (lower left)
    g.beginPath(); g.moveTo(46, h + 2); g.lineTo(70, h + 2); g.lineTo(40, h + 28); g.closePath(); g.fillStyle = 'rgba(27,36,64,0.86)'; g.fill();
    if (!talking) {
      text(g, name, 32, 66, { size: 48, weight: 800, color: C.gold });
      text(g, en, 36 + g.measureText(name).width + 12, 64, { size: 22, weight: 600, color: C.dim });
      text(g, '…', W - 40, 70, { size: 56, weight: 800, color: C.ink, align: 'right' });
      text(g, hint(false), 34, 100, { size: 20, weight: 500, color: C.dim, maxW: W - 70 });
    } else {
      text(g, `${name}  ${en}`, 32, 44, { size: 24, weight: 700, color: C.gold });
      const rows = wrapLine(line.text);
      rows.forEach((r, i) => text(g, r, 32, 104 + i * 62, { size: 54, weight: 800, color: line.ask ? C.gold : C.white, maxW: W - 64 }));
      if (line.ask) text(g, hint(true), 32, 222, { size: 24, weight: 600, color: C.ink, maxW: W - 64 });
      else if (line.of > 1) text(g, `${line.i + 1} / ${line.of}`, W - 30, 44, { size: 20, weight: 600, color: C.dim, align: 'right' });
    }
    panel.flush();
    if (dom) {
      dom.querySelector('.nm').textContent = `${name} ${en}`;
      dom.querySelector('.ln').textContent = talking ? line.text : '…';
      dom.querySelector('.ht').textContent = talking ? (line.ask ? hint(true) : '') : hint(false);
    }
  }

  const on = (n, f) => ctx.events && ctx.events.on(n, (p) => { try { f(p || {}); } catch (e) { /* never break the emitter */ } });
  on('npc:near', (p) => { near = p.id ? { id: p.id, name: p.name, en: p.en } : null; });
  on('npc:talk', (p) => { line = { id: p.id, name: p.name, en: p.en, text: p.line, ask: !!p.ask, i: p.i, of: p.of }; });
  on('npc:end', () => { line = null; });
  on('npc:menu', (p) => { if (p.page && ui.openMenu) ui.openMenu(p.page); });     // Gando's tempering page

  // PC keys
  try {
    window.addEventListener('keydown', (ev) => {
      if (vrNow() || ev.repeat) return;
      const N = ctx.game && ctx.game.npcs;
      if (!N) return;
      if (ev.code === 'KeyE') N.pressTalk();
      else if (ev.code === 'KeyY') N.answer(true);
      else if (ev.code === 'KeyN') N.answer(false);
    });
  } catch (e) { /* no window */ }

  return {
    update(dt, vr) {
      const N = ctx.game && ctx.game.npcs;
      const who = line ? line.id : near ? near.id : null;
      const npc = who && N && N.byId[who];
      const show = !!npc && npc.visible && S.hudVisible !== false;
      const key = show ? `${who}|${line ? line.i + '|' + line.text + '|' + line.ask : 'near'}` : '';
      if (key !== shown) { shown = key; if (show) draw(); }
      if (dom) dom.style.display = show && !vr ? 'block' : 'none';
      if (!show || !vr) { panel.mesh.visible = false; return; }
      // 0.4 m up and to the right of the head (as you see it), facing you
      _h.copy(ctx.input.head.pos);
      const hp = npc.folk.headPos;
      _r.set(hp.x - _h.x, 0, hp.z - _h.z).normalize();
      _t.set(-_r.z, 0, _r.x);                          // to your right of them
      panel.mesh.position.set(hp.x + _t.x * 0.32, hp.y + 0.3, hp.z + _t.z * 0.32);
      panel.mesh.lookAt(_h);
      panel.mesh.visible = true;
    },
    hideAll() { panel.mesh.visible = false; if (dom) dom.style.display = 'none'; },
    panel,
  };
}
