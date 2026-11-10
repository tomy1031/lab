// js/ui/index.js — createUI(ctx) (§10.11, OPUS-B): VR HUD (wrist band + lazy float panel), toasts and
// titles 2 m ahead, the left-wrist menu, and the PC overlay. Listens to events; others call toast/title only.
import * as THREE from 'three';
import { createHud, createToasts } from './hud.js';
import { createWrist } from './wrist.js';
import { createOverlay } from './overlay.js';

const REGION_NAMES = {
  meadow: ['目覚めの丘', 'MEADOW OF WAKING'], forest: ['囁きの森', 'WHISPERING FOREST'], lake: ['鏡の湖', 'MIRROR LAKE'],
  canyon: ['茜の峡谷', 'MADDER CANYON'], peaks: ['霜の峰', 'FROST PEAKS'], coast: ['潮騒の浜', 'TIDESONG COAST'], sea: ['海', 'THE SEA'],
};

export async function createUI(ctx) {
  const S = {
    vitals: { hp: 12, maxHp: 12, stamina: 0, maxStamina: 100, tier: 0 },
    cadence: 0, gait: 'idle', stepsToday: 0, kcalToday: 0, kmToday: 0, activeToday: 0,
    objective: null, objDist: null, objBearing: 0,
    trial: null, trialT: 0, boss: null, cooldown: null,
    toastQueue: [], titleQueue: [], currentToast: null, currentTitle: null,
    hudVisible: true, domMenu: null,
  };
  const forceVR = !!(ctx.params && ctx.params.has && ctx.params.has('vrhud'));
  let ui = null;
  const hud = createHud(ctx, S);
  const toasts = createToasts(ctx, S);
  const _h = new THREE.Vector3();

  // white "return to the wind" fade for VR: a small inside-out sphere on the camera
  const fadeMat = new THREE.MeshBasicMaterial({ color: 0xfffbe8, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false, fog: false });
  const fadeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), fadeMat);
  fadeMesh.renderOrder = 100; fadeMesh.visible = false; fadeMesh.frustumCulled = false;
  if (ctx.camera) ctx.camera.add(fadeMesh);
  let fade = 0, fadeTarget = 0, activeRun = 0, nudged = false, lastRegionT = -99;

  function toast(text, opts = {}) {
    if (!text) return;
    const t = typeof opts === 'string' ? { sub: opts } : opts;
    // drop exact repeats waiting in the queue; keep the queue short
    if (S.toastQueue.some((q) => q.text === text) || (S.currentToast && S.currentToast.text === text)) return;
    S.toastQueue.push({ text, sub: t.sub || '', kind: t.kind || 'info', ms: t.ms || 3000, tag: t.tag || null });
    while (S.toastQueue.length > 4) S.toastQueue.shift();
  }
  function title(text, sub = '', ms = 3200) {
    if (!text) return;
    S.titleQueue.push({ text, sub, ms });
    while (S.titleQueue.length > 2) S.titleQueue.shift();
  }

  ui = {
    S,
    get menuOpen() { return ui.wrist.open; },
    setHudVisible(b) { S.hudVisible = !!b; document.body.classList.toggle('aw-nohud', !b); if (!b && ui.wrist.open) ui.closeMenu(); },
    toast, title,
    openMenu(page = 'map') {
      const ok = ui.wrist.openMenu(page);
      if (ok && !isVR()) { try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* ignore */ } }
      return ok;
    },
    closeMenu() { ui.wrist.closeMenu(); },
    guide() {
      const ok = ctx.game && ctx.game.quest && ctx.game.quest.guide ? ctx.game.quest.guide() : false;
      if (!ok) toast('いまは道しるべがない', { sub: 'NO DESTINATION', kind: 'info', ms: 1800 });
    },
    startCooldown() {
      ui.closeMenu();
      if (S.cooldown) return;
      S.cooldown = { left: 60 };
      toast('今日はここまで — 60 秒、ゆっくり足踏みしよう', { sub: 'COOL DOWN', kind: 'quest', ms: 4000 });
    },
    update,
  };
  ui.wrist = createWrist(ctx, S, ui);
  ui.overlay = createOverlay(ctx, S, ui);
  ui.hud = hud;

  function isVR() { return !!(ctx.renderer && ctx.renderer.xr && ctx.renderer.xr.isPresenting) || !!(ctx.flags && ctx.flags.xr); }

  // ── events ──
  const on = (n, f) => ctx.events && ctx.events.on(n, (p) => { try { f(p || {}); } catch (e) { /* never break the emitter */ } });
  on('ui:toast', (p) => toast(p.text, p));
  on('ui:title', (p) => title(p.text, p.sub, p.ms));
  on('vitals', (p) => { Object.assign(S.vitals, p); });
  on('quest:objective', (p) => { S.objective = p && p.text ? p : null; });
  on('quest:stage', (p) => {
    if (p && p.stage === 0 && p.text) { toast('その場で足踏みして歩こう', { sub: 'STEP IN PLACE TO WALK', kind: 'quest', ms: 5000, tag: 'tut' }); return; }
    // the lesson is over: drop its leftover hints
    for (let i = S.toastQueue.length - 1; i >= 0; i--) if (S.toastQueue[i].tag === 'tut') S.toastQueue.splice(i, 1);
    if (S.currentToast && S.currentToast.tag === 'tut') S.currentToast.left = Math.min(S.currentToast.left, 200);
  });
  on('region:enter', (p) => {
    const n = REGION_NAMES[p.region];
    if (!n || p.region === 'sea') return;
    const now = ctx.clock ? ctx.clock.time : 0;
    if (now - lastRegionT < 8) return;
    lastRegionT = now;
    title(n[0], n[1]);
  });
  on('shrine:start', (p) => { S.trial = { id: p.id, name: trialName(p.id), label: '', k: 0 }; S.trialT = 4; });
  on('shrine:progress', (p) => {
    const name = trialName(p.id);
    const tl = Number.isFinite(p.timeLeft) ? p.timeLeft : 0;
    const isRace = String(p.id).startsWith('seed_');
    let label;
    if (isRace) label = `${p.value}/${p.goal}  ·  ${Math.ceil(tl)} 秒`;
    else if (String(p.id) === 'shrine_canyon') label = `${p.value} よけた · 残り ${tl}`;
    else if (String(p.id) === 'shrine_coast') label = `${p.value}/${p.goal} · 矢 ${tl}`;
    else if (String(p.id) === 'shrine_meadow') label = `${Math.floor(p.value)}/${p.goal} 秒 · ${Math.ceil(tl)}`;
    else label = `${Math.floor(p.value)}/${p.goal} · ${Math.ceil(tl)} 秒`;
    S.trial = { id: p.id, name, label, k: Math.max(0, Math.min(1, p.value / Math.max(1, p.goal))) };
    S.trialT = 3;
  });
  on('shrine:complete', () => { S.trial = null; });
  on('shrine:fail', () => { S.trial = null; });
  on('race:start', (p) => { S.trial = { id: p.id, name: '走り輪 RACE', label: `0/${p.rings}`, k: 0 }; S.trialT = 3; });
  on('player:damage', () => {
    ui.overlay.flash();
    // a short rumble on both hands when a blow lands
    try { ctx.input && ctx.input.haptic && (ctx.input.haptic('left', 0.6, 90), ctx.input.haptic('right', 0.6, 90)); } catch (e) { /* ignore */ }
  });
  on('player:death', () => {
    fadeTarget = 1;
    ui.overlay.fade(true);
    if (ui.wrist.open) ui.closeMenu();
    title('風に還る', 'RETURNING TO THE WIND', 2000);
  });
  on('player:respawn', () => { fadeTarget = 0; ui.overlay.fade(false); toast('目を覚ました — 何も失っていない', { sub: 'NOTHING IS LOST · HP 全回復', kind: 'info', ms: 3500 }); });
  on('enemy:telegraph', (p) => {
    if (isVR() || !p.pos || !ctx.player || !ctx.player.pos) return;
    const pl = ctx.player.pos;
    const dx = p.pos.x - pl.x, dz = p.pos.z - pl.z;
    if (Math.hypot(dx, dz) > 18) return;
    const look = ctx.input && ctx.input.head ? ctx.input.head.yaw : (ctx.player.yaw || 0);
    let a = Math.atan2(dx, -dz) - look;
    a = Math.atan2(Math.sin(a), Math.cos(a));
    if (Math.abs(a) > 0.6) ui.overlay.warn(a, p.duration || 1);
  });
  // small celebrations: every 1,000 steps and every 10 active minutes today
  let mkSteps = -1, mkActive = -1;
  on('stats:tick', () => {
    const st = ctx.game && ctx.game.stats;
    if (!st || !st.today) return;
    const d = st.today();
    const ks = Math.floor(d.steps / 1000), ka = Math.floor(d.activeSec / 600);
    if (mkSteps < 0) { mkSteps = ks; mkActive = ka; return; }
    if (ks > mkSteps) { mkSteps = ks; toast(`今日 ${(ks * 1000).toLocaleString()} 歩！`, { sub: `${ks * 1000} STEPS TODAY · ${d.distance.toFixed(2)} km · ${Math.round(d.kcal)} kcal（目安）`, kind: 'item', ms: 3500 }); }
    if (ka > mkActive) { mkActive = ka; toast(`アクティブ ${ka * 10} 分`, { sub: `${ka * 10} ACTIVE MINUTES TODAY`, kind: 'item', ms: 3500 }); }
  });
  on('xr:start', () => { hud.forceDraw(); ui.wrist.redraw(); });
  on('settings:change', () => { if (ui.wrist.open) ui.wrist.redraw(); });
  on('inventory:change', () => { if (ui.wrist.open) ui.wrist.redraw(); });
  on('item:pickup', () => { if (ui.wrist.open) ui.wrist.redraw(); });
  on('tower:awake', () => ui.wrist.redraw());
  on('map:reveal', () => ui.wrist.redraw());

  function trialName(id) {
    const sh = ctx.game && ctx.game.shrines && ctx.game.shrines.byId && ctx.game.shrines.byId(id);
    if (sh && sh.info) return sh.info.name;
    if (String(id).startsWith('seed_')) return '走り輪 RACE';
    return '試し TRIAL';
  }

  // ── per frame (real time; runs while paused) ──
  function update(dt) {
    const vr = isVR() || forceVR;
    const pl = ctx.player, game = ctx.game;
    if (pl) { S.cadence = Math.round(pl.cadence || 0); S.gait = pl.gait || 'idle'; }
    if (game && game.vitals) {
      const v = game.vitals;
      S.vitals.hp = v.hp; S.vitals.maxHp = v.maxHp; S.vitals.stamina = v.stamina; S.vitals.maxStamina = v.maxStamina; S.vitals.tier = v.tier;
    }
    if (game && game.stats && game.stats.today) {
      const d = game.stats.today();
      S.stepsToday = d.steps; S.kcalToday = d.kcal; S.kmToday = d.distance || 0; S.activeToday = d.activeSec;
      // a gentle nudge after 20 minutes of continuous movement (never forced)
      if (game.stats.activeNow && dt > 0) activeRun += dt; else activeRun = Math.max(0, activeRun - dt * 4);
      if (!nudged && activeRun > 20 * 60) { nudged = true; toast('20 分動き続けました — ひと休みしませんか', { sub: 'TAKE A BREATHER? 景色を眺めて休もう', kind: 'info', ms: 6000 }); }
    }
    if (game && game.quest) {
      S.objective = game.quest.objective && game.quest.objective.text ? game.quest.objective : null;
      if (game.quest.stage > 0) {
        for (let i = S.toastQueue.length - 1; i >= 0; i--) if (S.toastQueue[i].tag === 'tut') S.toastQueue.splice(i, 1);
        if (S.currentToast && S.currentToast.tag === 'tut' && S.currentToast.left > 200) S.currentToast.left = 200;
      }
    }
    if (S.objective && pl && pl.pos) {
      const dx = S.objective.x - pl.pos.x, dz = S.objective.z - pl.pos.z;
      S.objDist = Math.hypot(dx, dz);
      if (S.objDist < 4) S.objDist = null;          // you are there: no distance or arrow
      const look = ctx.input && ctx.input.head && Number.isFinite(ctx.input.head.yaw) ? ctx.input.head.yaw : (pl.yaw || 0);
      const a = Math.atan2(dx, -dz) - look;
      S.objBearing = Math.atan2(Math.sin(a), Math.cos(a));
    } else S.objDist = null;
    if (S.trial && dt > 0) { S.trialT -= dt; if (S.trialT <= 0 && !(game && game.shrines && game.shrines.active) && !(game && game.seeds && game.seeds.race)) S.trial = null; }
    const B = game && game.boss;
    S.boss = B && B.active ? (S.boss && S.boss.phase === B.phase ? Object.assign(S.boss, { k: B.gauge / B.goal }) : { phase: B.phase, k: B.gauge / B.goal }) : null;
    // cool-down walk
    if (S.cooldown && dt > 0 && !ctx.paused) {
      S.cooldown.left -= dt;
      if (S.cooldown.left <= 0) {
        S.cooldown = null;
        const st = game && game.stats;
        if (st) {
          const s = st.session;
          title('おつかれさま', 'WELL WALKED', 4500);
          toast(`今回：${s.steps.toLocaleString()} 歩・${s.distance.toFixed(2)} km・${Math.round(s.kcal)} kcal（目安）・${Math.floor(s.activeSec / 60)} 分`, { sub: `最高ケイデンス ${s.bestCadence} spm · 倒した凪 ${s.kills}`, kind: 'quest', ms: 9000 });
        }
        game && game.save && game.save();
      }
    }
    hud.update(dt, vr);
    toasts.update(dt, vr);
    ui.wrist.update(dt, vr);
    ui.overlay.update(dt, isVR());
    // fade
    fade += (fadeTarget - fade) * Math.min(1, dt * (fadeTarget > fade ? 2.5 : 1.5));
    fadeMat.opacity = fade;
    fadeMesh.visible = vr && fade > 0.01;
  }
  return ui;
}
