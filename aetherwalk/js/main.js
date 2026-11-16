// js/main.js — boots AETHERWALK (§10.14, OPUS-A): window.AW, ctx, every module (defensively), the loop,
// the landing page, ENTER VR / PC PREVIEW and the PWA hook. The only file that imports across owners.
const AW = (window.AW = window.AW || { ready: false, errors: [], debug: {} });
AW.ready = false;
AW.errors = AW.errors || [];
AW.debug = AW.debug || {};
const _seen = new Set();
function report(msg) {
  const s = String(msg);
  if (_seen.has(s)) return;
  _seen.add(s);
  AW.errors.push(s);
  console.warn('[AW]', s);
}
AW.report = report;
if (!AW._listening) {
  AW._listening = true;
  window.addEventListener('error', (e) => report(`error: ${e.message || e.error} @${(e.filename || '').replace(location.origin, '')}:${e.lineno || 0}`));
  window.addEventListener('unhandledrejection', (e) => report(`unhandledrejection: ${(e.reason && (e.reason.stack || e.reason.message)) || e.reason}`));
}

import * as THREE from 'three';
import { createEvents } from './core/events.js';
import { createSettings } from './core/settings.js';
import { createRng } from './core/rng.js';
import { createRenderer } from './core/renderer.js';
import { createInput } from './core/input.js';
import { createXR } from './core/xr.js';
import { createLoop } from './core/loop.js';
import { createZones, createTargets } from './core/registry.js';
import { installDebug } from './core/debug.js';
import { setupLanding } from './core/landing.js';
import { errMsg } from './core/util.js';
import { SPAWN_FALLBACK } from './core/config.js';
import * as stubs from './core/stubs.js';

function readFlags(params) {
  const ua = navigator.userAgent || '';
  const device = /Quest 3/i.test(ua) ? 'quest3' : /Quest/i.test(ua) ? 'quest2' : 'pc';
  const seed = params.has('seed') ? (parseInt(params.get('seed'), 10) || 7) : 7;
  return {
    desktop: params.has('desktop'),
    autoplay: params.has('autoplay'),
    nosound: params.has('nosound'),
    fresh: params.has('fresh'),
    xr: false,
    handTracking: false,
    device,
    seed,
  };
}

async function boot() {
  const params = new URLSearchParams(location.search);
  const flags = readFlags(params);
  const events = createEvents(report);
  const settings = createSettings({ events, fresh: flags.fresh });
  const q = params.get('quality');
  if (q && ['low', 'mid', 'high', 'auto'].includes(q)) settings.override('quality', q);
  const rng = createRng(flags.seed);
  const stage = document.getElementById('aw-stage') || document.body;
  const { renderer, scene, camera, rig } = createRenderer(stage);

  const ctx = {
    renderer, scene, camera, rig, events, settings, rng, THREE,
    clock: { time: 0, dt: 0, frame: 0, rawDt: 0, sim: 0 },
    flags, params,
    paused: false, pauseReason: null,
    setPaused(b, reason = 'user') {
      b = !!b;
      if (ctx.paused === b) { if (b) ctx.pauseReason = reason; return; }
      ctx.paused = b;
      ctx.pauseReason = b ? reason : null;
      events.emit('pause', { paused: b, reason });
    },
    progress: (label, ratio) => landing?.progress(label, ratio),
    input: null, zones: createZones(), targets: createTargets(),
    world: null, art: null, player: null, items: null, game: null, ui: null, audio: null,
    report,
  };
  AW.ctx = ctx;
  let landing = null;
  ctx.input = createInput(ctx);
  ctx.xr = createXR(ctx);
  const loop = createLoop(ctx, report);
  ctx.loop = loop;
  landing = setupLanding(ctx);
  ctx.progress('起動中 starting', 0.05);
  installDebug(ctx, loop);

  // ── modules, in contract order: world → player → items → game → ui → audio ──
  // ?stub=world,game,… forces stand-ins (isolated testing of one owner's part)
  const forced = new Set((params.get('stub') || '').split(',').filter(Boolean));
  async function safeCreate(name, importer, fnName, stub, ratio) {
    ctx.progress(`${name}`, ratio);
    if (forced.has(name)) { const s = await stub(ctx); s.isStub = true; return s; }
    try {
      const mod = await importer();
      const fn = mod && mod[fnName];
      if (typeof fn !== 'function') throw new Error(`${fnName}() not exported`);
      const obj = await fn(ctx);
      if (!obj || typeof obj !== 'object') throw new Error(`${fnName}() returned nothing`);
      return obj;
    } catch (e) {
      report(`${name}: create failed: ${errMsg(e)}`);
      const s = await stub(ctx);
      s.isStub = true;
      return s;
    }
  }
  ctx.world = await safeCreate('world', () => import('./world/index.js'), 'createWorld', stubs.createStubWorld, 0.15);
  ctx.art = ctx.world.art || stubs.createStubArt();
  if (!ctx.world.art) ctx.world.art = ctx.art;
  ctx.player = await safeCreate('player', () => import('./player/index.js'), 'createPlayer', stubs.createStubPlayer, 0.55);
  ctx.items = await safeCreate('items', () => import('./items/index.js'), 'createItems', stubs.createStubItems, 0.65);
  ctx.game = await safeCreate('game', () => import('./game/index.js'), 'createGame', stubs.createStubGame, 0.75);
  ctx.ui = await safeCreate('ui', () => import('./ui/index.js'), 'createUI', stubs.createStubUI, 0.85);
  ctx.audio = await safeCreate('audio', () => import('./audio/index.js'), 'createAudio', stubs.createStubAudio, 0.9);

  // ── start() of every module (cross-module setup) ──
  let teleported = false;
  const offTp = events.on('player:teleport', () => { teleported = true; });
  for (const name of ['world', 'player', 'items', 'game', 'ui', 'audio']) {
    const m = ctx[name];
    if (m && typeof m.start === 'function') {
      try { await m.start(); } catch (e) { report(`${name}.start: ${errMsg(e)}`); }
    }
  }
  offTp();

  // ── where to stand: ?pos > save (game.start may have teleported) > spawn point ──
  try {
    const pos = params.get('pos');
    if (pos) {
      const [x, z, yaw] = pos.split(',').map(Number);
      if (Number.isFinite(x) && Number.isFinite(z)) ctx.player.teleport(x, z, Number.isFinite(yaw) ? yaw : 0);
    } else if (!teleported) {
      const sp = ctx.world.spawnPoints?.player || SPAWN_FALLBACK;
      ctx.player.teleport(sp.x, sp.z, sp.yaw ?? 0);
    }
    if (params.has('t')) {
      const t = parseFloat(params.get('t'));
      if (Number.isFinite(t)) ctx.world.setTimeOfDay(t);
    }
  } catch (e) { report(`initial position: ${errMsg(e)}`); }

  // ── run ──
  ctx.progress('描画 rendering', 0.95);
  loop.start();
  await loop.firstFrame;
  AW.ready = true;
  ctx.progress('準備完了 ready', 1);
  events.emit('ready', {});
  landing.onReady();

  if (flags.desktop || flags.autoplay) landing.startDesktop();
  if (flags.autoplay) {
    try { if (ctx.game?.bot && !ctx.game.bot.enabled) ctx.game.bot.start(); } catch (e) { report(`bot.start: ${errMsg(e)}`); }
  }

  // pause when the page is hidden (§2.8); resume what we paused ourselves
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { if (!ctx.paused && !ctx.flags.xr) ctx.setPaused(true, 'hidden'); }
    else if (ctx.pauseReason === 'hidden') ctx.setPaused(false, 'visible');
  });

  // first user gesture → audio
  const resume = () => { try { ctx.audio?.resume?.(); } catch { /* ignore */ } };
  window.addEventListener('pointerdown', resume, { once: true });
  window.addEventListener('keydown', resume, { once: true });

  // PWA last, never fatal
  try {
    const { initPWA } = await import('./pwa.js');
    initPWA({ onStatus: landing.pwaStatus, onUpdate: landing.pwaUpdate, onInstallable: landing.pwaInstallable });
  } catch (e) { console.info('[AW] pwa unavailable', e && e.message); }
}

boot().catch((e) => {
  report(`boot: ${errMsg(e)}`);
  const el = document.getElementById('aw-progress-label');
  if (el) el.textContent = '起動に失敗しました boot failed: ' + (e && e.message);
});
