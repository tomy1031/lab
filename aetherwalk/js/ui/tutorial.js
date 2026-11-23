// js/ui/tutorial.js — the lesson you can read in VR (playtest feedback): a board standing on the stone stage
// in front of the spawn with the 5 steps as a checklist (the current one lit), gold arrows + soft rings on
// the next thing to do, a chime and sparkle per step, then 「手ほどき 完了」 and the main quest's first card
// (light the branch → the campfire → grip the sword) in the same place. (OPUS-B)
// Draw calls: board 1 + stand 1 + arrows 1 + rings 1, only in stages 0–1 and only near the stage.
import * as THREE from 'three';
import { card, text, roundRect, C, font } from './text.js';

const W = 1024, H = 768, BOARD_W = 1.0;
const GOLD = 0xffd76a;

export function createTutorial(ctx, S, ui) {
  const art = ctx.art || (ctx.world && ctx.world.art);
  const root = new THREE.Group();
  root.name = 'ui:tutorial';
  root.visible = false;
  ctx.scene.add(root);

  // ── the board ──
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  let boardMat = null;
  try { if (art && typeof art.basic === 'function') boardMat = art.basic({ map: tex, transparent: true, side: THREE.DoubleSide }); } catch (e) { boardMat = null; }
  if (!boardMat) boardMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  boardMat.forceSinglePass = true;   // transparent DoubleSide would otherwise cost 2 draw calls
  const BOARD_H = BOARD_W * H / W;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_W, BOARD_H), boardMat);
  board.renderOrder = 15;
  root.add(board);
  // a little wooden stand (two posts and a top rail)
  let standMat = null;
  try { if (art && typeof art.material === 'function') standMat = art.material({ color: 0x8a6440 }); } catch (e) { standMat = null; }
  if (!standMat) standMat = new THREE.MeshLambertMaterial({ color: 0x8a6440, flatShading: true });
  let stand = null;

  // ── markers: bobbing gold arrows + soft ground rings (instanced) ──
  const arrowGeo = (() => {
    const head = new THREE.ConeGeometry(0.1, 0.2, 6).rotateX(Math.PI).translate(0, 0.1, 0);
    const shaft = new THREE.CylinderGeometry(0.035, 0.035, 0.2, 6).translate(0, 0.3, 0);
    const a = head.toNonIndexed(), b = shaft.toNonIndexed();
    const pos = new Float32Array(a.attributes.position.count * 3 + b.attributes.position.count * 3);
    pos.set(a.attributes.position.array, 0); pos.set(b.attributes.position.array, a.attributes.position.count * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    return geo;
  })();
  let arrowMat = null, ringMat = null;
  try { if (art && typeof art.basic === 'function') { arrowMat = art.basic({ color: GOLD }); ringMat = art.basic({ color: GOLD, transparent: true, opacity: 0.8 }); } } catch (e) { arrowMat = ringMat = null; }
  if (!arrowMat) arrowMat = new THREE.MeshBasicMaterial({ color: GOLD });
  if (!ringMat) ringMat = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.8, depthWrite: false });   // faces up; single pass
  const arrows = new THREE.InstancedMesh(arrowGeo, arrowMat, 4);
  const rings = new THREE.InstancedMesh(new THREE.RingGeometry(0.72, 1.0, 40).rotateX(-Math.PI / 2), ringMat, 4);
  for (const m of [arrows, rings]) { m.frustumCulled = false; m.count = 0; m.renderOrder = 14; ctx.scene.add(m); }
  rings.renderOrder = 13;
  arrows.name = 'ui:tutorial:arrows'; rings.name = 'ui:tutorial:rings';
  // compile these shaders now, under the loading screen: they first show a few frames after start, and a
  // first-use compile there was a multi-second stall in SwiftShader (a visible hitch on Quest)
  try { const r = ctx.renderer; if (r && typeof r.compile === 'function') for (const o of [root, arrows, rings]) r.compile(o, ctx.camera, ctx.scene); } catch (e) { /* first render compiles instead */ }

  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _h = new THREE.Vector3(), _e = new THREE.Euler();
  const targets = [];
  let placed = false, mode = 'none', fade = 0, fadeTo = 0, pendingMode = null, sig = '', drawT = 0, t = 0;

  /** stand the board at (x, z), turned toward (lx, lz) at eye height */
  function placeAt(x, z, lx, lz) {
    let gy = 0;
    try { gy = ctx.world.groundAt ? ctx.world.groundAt(x, z, 1e4) : ctx.world.heightAt(x, z); } catch (e) { gy = 0; }
    if (!Number.isFinite(gy)) gy = 0;
    const cy = gy + 1.42;
    root.position.set(x, cy, z);
    let ey = cy + 0.2;
    try { ey = ctx.world.heightAt(lx, lz) + 1.62; } catch (e) { /* stub */ }
    root.lookAt(lx, ey, lz);
    // stand: posts from the ground to the board, a rail on top
    const postH = cy - BOARD_H / 2 - gy + 0.06;
    const parts = [
      new THREE.BoxGeometry(0.06, postH, 0.06).translate(-0.44, -BOARD_H / 2 - postH / 2 + 0.03, -0.03),
      new THREE.BoxGeometry(0.06, postH, 0.06).translate(0.44, -BOARD_H / 2 - postH / 2 + 0.03, -0.03),
      new THREE.BoxGeometry(BOARD_W + 0.08, 0.05, 0.07).translate(0, BOARD_H / 2 + 0.02, -0.03),
    ].map((q) => q.toNonIndexed());
    let n = 0; for (const q of parts) n += q.attributes.position.count;
    const pos = new Float32Array(n * 3); let o = 0;
    for (const q of parts) { pos.set(q.attributes.position.array, o); o += q.attributes.position.array.length; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    if (stand) { stand.geometry.dispose(); stand.geometry = geo; } else { stand = new THREE.Mesh(geo, standMat); root.add(stand); }
    return true;
  }
  function place() {
    const sp = ctx.world && ctx.world.spawnPoints && ctx.world.spawnPoints.player;
    if (!sp) return false;
    const yaw = (sp.yaw || 0) * Math.PI / 180;
    const fx = Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = Math.sin(yaw);
    // ahead and a little to the right, so the walk north and the lesson's branch stay in view
    return placeAt(sp.x + fx * 1.9 + rx * 0.95, sp.z + fz * 1.9 + rz * 0.95, sp.x, sp.z);
  }
  /** DESIGN_V2 §4.6: during Gando's drill the board stands beside the dummy (one more card) */
  function placeByDummy(D) {
    const c = D.dummy && D.dummy.c, pl = ctx.player && ctx.player.pos;
    if (!c || !pl) return false;
    let dx = pl.x - c.x, dz = pl.z - c.z, L = Math.hypot(dx, dz);
    if (L < 0.5) { dx = 0; dz = 1; L = 1; }
    dx /= L; dz /= L;
    // 1.5 m to the dummy's side, a little toward you, facing where you stand to train (2.6 m out)
    const sx = c.x - dz * 1.5 + dx * 0.6, sz = c.z + dx * 1.5 + dz * 0.6;
    return placeAt(sx, sz, c.x + dx * 2.6, c.z + dz * 2.6);
  }
  function drawGuard(D) {
    frame('盾の稽古', 'SHIELD DRILL');
    const p = D.progress;
    text(g, '受けるな、迎えにいけ', 48, 182, { size: 54, weight: 800, color: C.gold, maxW: W - 96 });
    text(g, '当たる瞬間に、盾を相手へ押し出す', 48, 248, { size: 40, weight: 700, color: C.white, maxW: W - 96 });
    text(g, "DON'T JUST TAKE IT · PUSH THE SHIELD OUT AS IT LANDS", 50, 286, { size: 24, weight: 500, color: C.dim, maxW: W - 100 });
    // perfect parries: three marks
    for (let i = 0; i < p.need; i++) check(90 + i * 78, 370, 28, i < p.good);
    text(g, `ジャスト ${Math.min(p.good, p.need)} / ${p.need}`, 90 + p.need * 78, 382, { size: 38, weight: 700, color: C.ink });
    const broken = p.phase === 'broken';
    if (broken) { roundRect(g, 30, 420, W - 60, 92, 18); g.fillStyle = 'rgba(255,215,106,0.2)'; g.fill(); g.lineWidth = 4; g.strokeStyle = C.gold; g.stroke(); }
    text(g, '崩れたら 返し斬り — 強く斬る', 60, 476, { size: 42, weight: broken ? 800 : 600, color: broken ? C.gold : C.ink, maxW: W - 120 });
    text(g, 'WHEN IT BREAKS · A HARD COUNTER STRIKE', 62, 504, { size: 22, weight: 500, color: C.dim, maxW: W - 120 });
    text(g, '赤い予告の最後に 金の光と高い音 — それが合図', 48, H - 92, { size: 32, weight: 600, color: C.ink, maxW: W - 96 });
    text(g, 'THE GOLD LIGHT AND HIGH NOTE AT THE END OF THE WARNING: NOW', 48, H - 52, { size: 22, weight: 500, color: C.dim, maxW: W - 96 });
  }

  // ── drawing ──
  function check(cx, cy, r, on) {
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fillStyle = on ? 'rgba(127,233,255,0.9)' : 'rgba(244,236,216,0.12)'; g.fill();
    g.lineWidth = 3; g.strokeStyle = on ? C.cyan : 'rgba(244,236,216,0.45)'; g.stroke();
    if (on) {
      g.beginPath(); g.moveTo(cx - r * 0.45, cy); g.lineTo(cx - r * 0.1, cy + r * 0.38); g.lineTo(cx + r * 0.5, cy - r * 0.4);
      g.lineWidth = 6; g.strokeStyle = '#0e1430'; g.lineCap = 'round'; g.stroke(); g.lineCap = 'butt';
    }
  }
  function frame(title, en) {
    g.clearRect(0, 0, W, H);
    card(g, 6, 6, W - 12, H - 12, 36, 'rgba(27,36,64,0.86)', C.gold);
    g.fillStyle = C.gold; g.fillRect(40, 118, W - 80, 4);
    text(g, title, 48, 92, { size: 70, weight: 800, color: C.white });
    g.font = font(70, 800);
    text(g, en, 48 + g.measureText(title).width + 22, 90, { size: 34, weight: 600, color: C.gold });
  }
  function rows(list, done, cur, progress) {
    for (let i = 0; i < list.length; i++) {
      const y = 140 + i * 98, isCur = i === cur, isDone = done(i);
      if (isCur) { roundRect(g, 30, y + 4, W - 60, 90, 18); g.fillStyle = 'rgba(255,215,106,0.2)'; g.fill(); g.lineWidth = 4; g.strokeStyle = C.gold; g.stroke(); }
      check(78, y + 49, 24, isDone);
      if (!isDone) text(g, String(i + 1), 78, y + 61, { size: 32, weight: 800, align: 'center', color: isCur ? C.gold : C.dim, shadow: false });
      const col = isDone ? 'rgba(244,236,216,0.5)' : isCur ? C.white : 'rgba(244,236,216,0.85)';
      text(g, list[i].text, 122, y + 50, { size: 44, weight: isCur ? 800 : 600, color: col, maxW: W - 300 });
      text(g, list[i].en, 124, y + 82, { size: 24, weight: 500, color: isCur ? C.gold : C.dim, maxW: W - 300 });
      const pr = progress && progress(i);
      if (pr) text(g, pr, W - 56, y + 60, { size: 36, weight: 700, color: isCur ? C.gold : C.dim, align: 'right' });
      else if (isCur) text(g, '◀ いま', W - 56, y + 60, { size: 32, weight: 700, color: C.gold, align: 'right' });
    }
  }
  function drawTutorial(Q) {
    frame('はじめの手ほどき', 'TUTORIAL');
    const cur = Q.tutIndex();
    rows(Q.TUT, (i) => Q.tutDone(i), cur, (i) => {
      if (i === 0 && !Q.tutDone(0)) return `${Math.min(16, Q.tut.walk)} / 16 歩`;
      if (i === 1 && !Q.tutDone(1) && Q.tutDone(0)) return `${Math.min(10, Q.tut.run)} / 10`;
      return null;
    });
    text(g, 'スキップ：手首メニュー → 記録', 48, H - 52, { size: 32, weight: 600, color: C.dim });
    text(g, 'SKIP: WRIST MENU → STATS', W - 48, H - 52, { size: 24, weight: 500, color: C.dim, align: 'right' });
  }
  function drawMain(Q) {
    frame('旅のはじまり', 'MAIN QUEST');
    let cur = 0;
    while (cur < 3 && Q.mainDone(cur)) cur++;
    // the step to do right now (phase-aware: take / light / carry (with the distance) / touch / relight / sword)
    const h = Q.campHint;
    const now = h && h.text ? h.text + (h.phase === 'carry' ? `（あと ${Math.max(1, Math.round(h.dist))} m）` : '') : '野営地の焚き火に火を灯し、台座の剣を手に入れよう';
    text(g, '▶ ' + now, 48, 174, { size: 38, weight: 800, color: C.gold, maxW: W - 96 });
    for (let i = 0; i < 3; i++) {
      const y = 200 + i * 104, isDone = Q.mainDone(i), isCur = i === cur;
      if (isCur) { roundRect(g, 30, y + 6, W - 60, 92, 18); g.fillStyle = 'rgba(255,215,106,0.2)'; g.fill(); g.lineWidth = 4; g.strokeStyle = C.gold; g.stroke(); }
      check(78, y + 52, 24, isDone);
      if (!isDone) text(g, String(i + 1), 78, y + 64, { size: 32, weight: 800, align: 'center', color: isCur ? C.gold : C.dim, shadow: false });
      text(g, Q.MAIN1[i].text, 122, y + 54, { size: 44, weight: isCur ? 800 : 600, color: isDone ? 'rgba(244,236,216,0.5)' : C.white, maxW: W - 170 });
      text(g, Q.MAIN1[i].en, 124, y + 86, { size: 24, weight: 500, color: isCur ? C.gold : C.dim, maxW: W - 170 });
    }
    text(g, '金の矢印をたどろう・道しるべの鈴を振るか X ボタン', 48, H - 92, { size: 32, weight: 600, color: C.ink, maxW: W - 96 });
    text(g, 'FOLLOW THE GOLD ARROWS · SHAKE THE WAYBELL OR PRESS X', 48, H - 52, { size: 24, weight: 500, color: C.dim, maxW: W - 96 });
  }
  function draw(Q) {
    if (mode === 'tutorial') drawTutorial(Q); else if (mode === 'main') drawMain(Q); else if (mode === 'guard' && ctx.game && ctx.game.drill) drawGuard(ctx.game.drill);
    tex.needsUpdate = true;
  }
  function signature(Q) {
    if (mode === 'tutorial') return `t|${Q.tutIndex()}|${Math.min(16, Q.tut.walk)}|${Math.min(10, Q.tut.run)}|${Q.tutDone(2)}${Q.tutDone(3)}${Q.tutDone(4)}`;
    if (mode === 'guard') { const D = ctx.game && ctx.game.drill; return D ? `g|${D.progress.good}|${D.progress.phase}` : ''; }
    if (mode === 'main') { const h = Q.campHint || {}; return `m|${Q.mainDone(0)}${Q.mainDone(1)}${Q.mainDone(2)}|${h.phase}|${h.phase === 'carry' ? Math.round(h.dist / 5) : 0}`; }
    return '';
  }
  function setMode(m) { if (mode === m) return; pendingMode = m; fadeTo = 0; }

  // the board's row i in world space (for the sparkle)
  function rowWorld(i, out) { return board.localToWorld(out.set(-BOARD_W / 2 + 0.08, BOARD_H / 2 - (140 + i * 98 + 49) / W * BOARD_W, 0.01)); }

  // ── events ──
  const on = (n, f) => ctx.events && ctx.events.on(n, (p) => { try { f(p || {}); } catch (e) { /* never break the emitter */ } });
  on('tutorial:step', (p) => {
    sig = '';
    if (!placed) return;
    rowWorld(p.index | 0, _p);
    try { ctx.world.fx.emit('shard', _p, { count: 14, color: GOLD, speed: 1.4 }); } catch (e) { /* stub */ }
    try { ctx.audio && ctx.audio.play && ctx.audio.play('sting:item'); } catch (e) { /* ignore */ }
  });
  on('tutorial:done', (p) => {
    if (!p.skipped) {
      ui.title('手ほどき 完了', 'TUTORIAL COMPLETE', 2600);
      if (placed) { try { ctx.world.fx.emit('shard', root.position, { count: 40, color: GOLD, speed: 2.2 }); } catch (e) { /* stub */ } }
    }
    ui.title('旅のはじまり', 'MAIN QUEST · 野営地の焚き火に火を灯そう', 3200);
    setMode('main');
  });

  return {
    update(dt, vr) {
      t += dt;
      const game = ctx.game, Q = game && game.quest;
      if (!Q || !Q.TUT) { root.visible = false; arrows.count = rings.count = 0; return; }
      // which card: the lesson (stage 0), the first main step (stage 1), nothing after
      const D = ctx.game && ctx.game.drill;
      const want = D && D.active ? 'guard' : Q.stage === 0 ? 'tutorial' : Q.stage === 1 ? 'main' : 'none';
      if (mode === 'none' && want !== 'none' && !pendingMode) { mode = want; fadeTo = 1; sig = ''; drawT = 0; if (want === 'guard') placed = placeByDummy(D); }
      else if (want !== mode && !pendingMode) setMode(want);
      if (!placed && want !== 'none') placed = place();
      // fades (switch card while invisible)
      fade += (fadeTo - fade) * Math.min(1, dt * 4);
      if (pendingMode && fade < 0.03) {
        const was = mode;
        mode = pendingMode; pendingMode = null; sig = ''; drawT = 0; fadeTo = mode === 'none' ? 0 : 1;
        // move the board while it is invisible: beside the drill dummy, or back to the start
        if (mode === 'guard') placed = placeByDummy(D);
        else if (was === 'guard' && mode !== 'none') placed = place();
      }
      const pl = ctx.player && ctx.player.pos;
      const near = placed && pl ? Math.hypot(pl.x - root.position.x, pl.z - root.position.z) < 70 : false;
      root.visible = placed && near && mode !== 'none' && fade > 0.02 && S.hudVisible !== false;
      if (root.visible) {
        boardMat.opacity = fade;
        drawT -= dt;
        if (drawT <= 0) {
          drawT = 0.25;
          const s = signature(Q);
          if (s !== sig) { sig = s; draw(Q); }
        }
      }
      // markers
      let n = 0;
      if (Q.guideTargets && (Q.stage === 0 || Q.stage === 1) && S.hudVisible !== false) {
        Q.guideTargets(targets);
        const head = ctx.input && ctx.input.head && ctx.input.head.pos;
        for (const tg of targets) {
          if (n >= 4) break;
          const d = head ? Math.hypot(tg.x - head.x, tg.y - head.y, tg.z - head.z) : 5;
          const k = Math.min(7, Math.max(1, d / 7)) * (tg.primary ? 1 : 0.75);
          const bob = Math.sin(t * 7 + n) * 0.06 * k;
          _e.set(0, t * 1.4 + n, 0); _q.setFromEuler(_e);
          _s.setScalar(k);
          _m.compose(_p.set(tg.x, tg.y + 0.42 * k + bob, tg.z), _q, _s);
          arrows.setMatrixAt(n, _m);
          let ry, rr;
          if (tg.kind === 'bowl') {
            // up close with a burning torch: a pulsing ring hovering at the fire bowl's rim — "touch here"
            ry = tg.y - 0.18;
            rr = 0.62 * (1 + 0.14 * Math.sin(t * 6));
          } else {
            // the floor under it (terrain or the stone stage / a platform)
            let gy = tg.y - 0.15;
            try { gy = ctx.world.groundAt ? ctx.world.groundAt(tg.x, tg.z, tg.y + 0.3) : ctx.world.heightAt(tg.x, tg.z); } catch (e) { /* stub */ }
            if (!Number.isFinite(gy) || gy > tg.y) gy = tg.y - 0.15;
            ry = gy + 0.035;
            rr = (tg.kind === 'fire' ? 0.75 : tg.kind === 'pedestal' ? 0.85 : 0.38) * (1 + 0.08 * Math.sin(t * 3 + n)) * Math.max(1, k * 0.6);
          }
          _s.set(rr, 1, rr);
          _q.identity();
          _m.compose(_h.set(tg.x, ry, tg.z), _q, _s);
          rings.setMatrixAt(n, _m);
          n++;
        }
      }
      arrows.count = rings.count = n;
      if (n) { arrows.instanceMatrix.needsUpdate = true; rings.instanceMatrix.needsUpdate = true; }
    },
    hideAll() { root.visible = false; arrows.count = rings.count = 0; },
    get mode() { return mode; },
    board, root,
  };
}
