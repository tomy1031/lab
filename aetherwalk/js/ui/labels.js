// js/ui/labels.js — "what is in my hand?" (playtest feedback): a small name label above the hand when you
// grab something or take it from a holster (2.5 s; the first 3 times per item also a one-line usage hint),
// and while a hand hovers a world item or a filled holster slot (item:hover from items/player).
// VR: one camera-facing panel 0.12 m above that hand (1 draw call, follows the latest hand).
// PC: a DOM label at the bottom of the screen on that hand's side. (OPUS-B)
import * as THREE from 'three';
import { makePanel, card, text, C } from './text.js';

const SHOW = 2.5, SHOW_HINT = 3.5, HINT_TIMES = 3;
const CSS = `
#aw-overlay .awui-label { position:fixed; bottom:200px; display:none; max-width:min(380px, 40vw); padding:8px 16px 9px 14px;
  background:rgba(27,36,64,0.8); border:1px solid rgba(255,215,106,0.35); border-left:5px solid #ffd76a; border-radius:12px; color:#f4ecd8; }
#aw-overlay .awui-label.left { left:18%; } #aw-overlay .awui-label.right { right:18%; }
#aw-overlay .awui-label .n { font-size:19px; font-weight:800; } #aw-overlay .awui-label .e { font-size:12px; color:#ffd76a; margin-left:8px; letter-spacing:.06em; }
#aw-overlay .awui-label .h { font-size:14px; margin-top:3px; } #aw-overlay .awui-label .he { font-size:11px; color:rgba(244,236,216,0.62); }
`;

export function createLabels(ctx, S, ui) {
  const panel = makePanel(ctx, 512, 184, 0.26, { depthTest: false, renderOrder: 70 });
  panel.mesh.visible = false;
  panel.mesh.name = 'ui:label';
  ctx.scene.add(panel.mesh);
  try { const r = ctx.renderer; if (r && typeof r.compile === 'function') r.compile(panel.mesh, ctx.camera, ctx.scene); } catch (e) { /* compiled on first use */ }
  const _h = new THREE.Vector3(), _t = new THREE.Vector3();
  const hover = { left: null, right: null };
  let grab = null;                 // { hand, itemId, hint, left }
  let lastHover = 'right', shownKey = '';

  // PC
  let dom = null;
  try {
    if (!document.getElementById('awui-label-style')) { const st = document.createElement('style'); st.id = 'awui-label-style'; st.textContent = CSS; document.head.appendChild(st); }
    const host = (ui.overlay && ui.overlay.root) || document.getElementById('aw-overlay');
    if (host) {
      dom = document.createElement('div');
      dom.className = 'awui-label right';
      dom.innerHTML = '<div><span class="n"></span><span class="e"></span></div><div class="h"></div><div class="he"></div>';
      host.appendChild(dom);
    }
  } catch (e) { dom = null; }

  function info(id) {
    const G = ctx.game;
    const d = G && G.itemInfo ? G.itemInfo(id) : null;
    return { name: (d && d.name) || id, en: (d && d.en) || '' };
  }
  function draw(hand, itemId, hint) {
    const g = panel.g, W = panel.w;
    g.clearRect(0, 0, W, panel.h);
    const { name, en } = info(itemId);
    const h = hint ? 176 : 92;
    card(g, 4, 4, W - 8, h, 22, 'rgba(27,36,64,0.8)', 'rgba(255,215,106,0.45)');
    g.fillStyle = C.gold; g.fillRect(16, 18, 7, h - 28);
    const wName = text(g, name, 38, 66, { size: 52, weight: 800, color: C.ink, maxW: 300 });
    if (en) text(g, en.toUpperCase(), 38 + wName + 14, 64, { size: 26, weight: 600, color: C.gold, maxW: W - 70 - wName });
    if (hint) {
      text(g, hint[0], 38, 120, { size: 34, weight: 600, color: C.ink, maxW: W - 56 });
      text(g, hint[1], 38, 158, { size: 24, weight: 500, color: C.dim, maxW: W - 56 });
    }
    panel.flush();
    if (dom) {
      dom.className = 'awui-label ' + (hand === 'left' ? 'left' : 'right');
      dom.querySelector('.n').textContent = name;
      dom.querySelector('.e').textContent = en ? en.toUpperCase() : '';
      dom.querySelector('.h').textContent = hint ? hint[0] : '';
      dom.querySelector('.he').textContent = hint ? hint[1] : '';
    }
  }

  const on = (n, f) => ctx.events && ctx.events.on(n, (p) => { try { f(p || {}); } catch (e) { /* never break the emitter */ } });
  on('item:grab', (p) => {
    if (!p.itemId || !p.hand) return;
    const G = ctx.game;
    let hint = null;
    const h = G && G.itemHint ? G.itemHint(p.itemId) : null;
    if (h && G.hintSeen && G.hintSeen(p.itemId) < HINT_TIMES) { G.hintSeen(p.itemId, true); hint = h; }
    grab = { hand: p.hand, itemId: p.itemId, hint, left: hint ? SHOW_HINT : SHOW };
    hover[p.hand] = null;
  });
  on('item:hover', (p) => {
    const hand = p.hand === 'left' ? 'left' : 'right';
    hover[hand] = p.itemId || null;
    if (p.itemId) lastHover = hand;
  });
  on('item:release', (p) => { if (grab && p.hand === grab.hand) grab.left = Math.min(grab.left, 0.6); });

  return {
    update(dt, vr) {
      if (grab) { grab.left -= dt; if (grab.left <= 0) grab = null; }
      // what to show: a fresh grab beats a hover
      let hand = null, itemId = null, hint = null;
      if (grab) { hand = grab.hand; itemId = grab.itemId; hint = grab.hint; }
      else if (hover[lastHover]) { hand = lastHover; itemId = hover[lastHover]; }
      else if (hover.left || hover.right) { hand = hover.right ? 'right' : 'left'; itemId = hover[hand]; }
      const show = !!itemId && S.hudVisible !== false;
      const key = show ? `${hand}|${itemId}|${hint ? 1 : 0}` : '';
      if (key !== shownKey) { shownKey = key; if (show) draw(hand, itemId, hint); }
      if (dom) dom.style.display = show && !vr ? 'block' : 'none';
      const H = show && vr && ctx.input && ctx.input.hands && ctx.input.hands[hand];
      if (!H || !H.tracked) { panel.mesh.visible = false; return; }
      // 0.12 m above the hand, nudged toward the eyes, facing them
      _h.copy(ctx.input.head.pos);
      _t.copy(H.pos); _t.y += 0.12 + (hint ? 0.02 : 0);
      _t.x += (_h.x - _t.x) * 0.06; _t.z += (_h.z - _t.z) * 0.06;
      panel.mesh.position.copy(_t);
      panel.mesh.lookAt(_h);
      panel.mat.opacity = grab ? Math.min(1, grab.left / 0.4) : 1;
      panel.mesh.visible = true;
    },
    hideAll() { panel.mesh.visible = false; if (dom) dom.style.display = 'none'; },
    panel,
  };
}
