// js/audio/index.js — createAudio(ctx) (§9, §10.11, OPUS-B): all sound is synthesized with WebAudio.
// ?nosound → no AudioContext at all. The context is made on the first user gesture (resume()).
import * as THREE from 'three';
import { createSynth, createPannerPool } from './synth.js';
import { createSfx } from './sfx.js';
import { createStingers } from './stingers.js';
import { createAmbience } from './ambience.js';

export async function createAudio(ctx) {
  const nosound = !!(ctx.flags && ctx.flags.nosound) || !!(ctx.params && ctx.params.has && ctx.params.has('nosound'));
  if (nosound) {
    return { nosound: true, muted: true, resume() {}, setMuted() {}, play() {}, update() {} };
  }
  let ac = null, S = null, buses = null, pool = null, sfx = null, sting = null, amb = null, muted = false;
  const _p = new THREE.Vector3(), _f = new THREE.Vector3(), _u = new THREE.Vector3(), _q = new THREE.Quaternion();
  let runFor = 0, runGrace = 0, beatN = 0, combat = false, combatOff = 0, combatT = 0, vistaT = 0, lastVista = null, stepN = 0;

  function vol(key, d) { const v = ctx.settings && ctx.settings.get ? ctx.settings.get(key) : d; return Number.isFinite(+v) ? +v : d; }
  function applyVolumes() {
    if (!buses) return;
    const t = ac.currentTime;
    buses.master.gain.setTargetAtTime(muted ? 0 : vol('volMaster', 0.8), t, 0.05);
    buses.sfx.gain.setTargetAtTime(vol('volSfx', 1), t, 0.05);
    buses.music.gain.setTargetAtTime(vol('volMusic', 0.7), t, 0.05);
    buses.amb.gain.setTargetAtTime(vol('volSfx', 1) * (ctx.paused ? 0.3 : 0.75), t, 0.3);
  }
  function init() {
    if (ac) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { ac = new AC({ latencyHint: 'interactive' }); } catch (e) { return false; }
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 3;
    comp.connect(ac.destination);
    buses = { master: ac.createGain() };
    buses.master.connect(comp);
    for (const k of ['sfx', 'music', 'amb']) { buses[k] = ac.createGain(); buses[k].connect(buses.master); }
    S = createSynth(ac, buses.sfx);
    pool = createPannerPool(ac, buses.sfx, 8);
    sfx = createSfx(S, buses);
    sting = createStingers(S, buses);
    amb = createAmbience(S, buses, ctx, sfx);
    applyVolumes();
    return true;
  }
  const live = () => !!ac && ac.state === 'running';

  /** play(name, { pos, gain, pitch }) — names: any sfx key, or 'sting:<name>' */
  function play(name, opts = {}) {
    if (!live() || muted) return;
    try {
      if (name.startsWith('sting:')) { sting.play(name.slice(6), opts.gain ?? 1); return; }
      const f = sfx[name];
      if (!f) return;
      const o = { ...opts };
      if (opts.pos) o.dest = pool.at(opts.pos, opts.dur || 1.5);
      f(o);
    } catch (e) { /* never let sound break the game */ }
  }

  const A = {
    get context() { return ac; },
    get muted() { return muted; },
    resume() {
      if (!init()) return;
      if (ac.state !== 'running') ac.resume().catch(() => {});
    },
    setMuted(b) { muted = !!b; applyVolumes(); },
    play,
    update,
  };

  function update(dt) {
    if (!live()) return;
    // the listener is the head
    const cam = ctx.camera;
    if (cam) {
      cam.getWorldPosition(_p);
      cam.getWorldQuaternion(_q);
      _f.set(0, 0, -1).applyQuaternion(_q);
      _u.set(0, 1, 0).applyQuaternion(_q);
      const L = ac.listener;
      if (L.positionX) {
        L.positionX.value = _p.x; L.positionY.value = _p.y; L.positionZ.value = _p.z;
        L.forwardX.value = _f.x; L.forwardY.value = _f.y; L.forwardZ.value = _f.z;
        L.upX.value = _u.x; L.upY.value = _u.y; L.upZ.value = _u.z;
      } else if (L.setPosition) { L.setPosition(_p.x, _p.y, _p.z); L.setOrientation(_f.x, _f.y, _f.z, _u.x, _u.y, _u.z); }
    }
    try { amb.update(dt); } catch (e) { /* ignore */ }
    const pl = ctx.player;
    // running ≥ 30 s → a quiet beat in step with you (settings.runBeat)
    if (pl && (pl.gait === 'jog' || pl.gait === 'sprint')) { runFor += dt; runGrace = 1.5; }
    else if ((runGrace -= dt) <= 0) runFor = 0;
    // combat start / end stingers
    combatT -= dt;
    if (combatT <= 0) {
      combatT = 0.5;
      const G = ctx.game;
      const now = !!(G && G.enemies && G.enemies.inCombat && G.enemies.inCombat());
      if (now && !combat) { combat = true; combatOff = 0; play('sting:combatStart', { gain: 0.8 }); }
      else if (!now && combat) { combatOff += 0.5; if (combatOff > 3) { combat = false; play('sting:combatEnd', { gain: 0.8 }); } }
      else combatOff = 0;
      // standing at a vista
      vistaT -= 0.5;
      const vs = ctx.world && ctx.world.vistas;
      if (vs && pl && pl.pos && vistaT <= 0) {
        let at = null;
        for (const v of vs) if (Math.hypot(v.x - pl.pos.x, v.z - pl.pos.z) < 7) { at = v; break; }
        if (at && at !== lastVista) { lastVista = at; vistaT = 30; play('sting:vista'); }
        else if (!at) lastVista = null;
      }
    }
  }

  // ── events → sounds ──
  const on = (n, f) => ctx.events && ctx.events.on(n, (p) => { if (live()) { try { f(p || {}); } catch (e) { /* ignore */ } } });
  on('settings:change', (p) => { if (/^vol/.test(p.key)) applyVolumes(); });
  ctx.events?.on?.('pause', () => { if (buses) applyVolumes(); });
  ctx.events?.on?.('xr:start', () => A.resume());
  on('step', (p) => {
    stepN++;
    const pl = ctx.player;
    let surface = p.surface;
    if (!surface && ctx.world && ctx.world.surfaceAt && pl && pl.pos) { try { surface = ctx.world.surfaceAt(pl.pos.x, pl.pos.z); } catch (e) { surface = 'grass'; } }
    if (ctx.game && ctx.game.towers && ctx.game.towers.onLift) surface = 'wood';
    play('step', { surface, strength: p.strength ?? 0.6, foot: p.foot || (stepN % 2 ? 'L' : 'R'), running: (p.cadence || 0) >= 110 });
    if (runFor > 30 && !(ctx.settings && ctx.settings.get && ctx.settings.get('runBeat') === false)) play('beat', { strong: (beatN++ % 2) === 0 });
  });
  on('swing', (p) => play('swing', { speed: p.speed }));
  on('hit', (p) => {
    if (p.targetKind === 'projectile') { play('deflect', { pos: p.point }); return; }
    const armor = p.part === 'armor' || p.blocked;
    const type = armor ? 'armor' : (p.type === 'blunt' || p.type === 'blast') ? 'blunt' : 'slash';
    play('hit', { type, strong: (p.damage || 0) >= 7 || p.killed, pos: p.point });
  });
  on('block', (p) => play(p.itemId === 'deflect' ? 'deflect' : 'block', { parry: !!p.parry }));
  on('enemy:telegraph', (p) => play('telegraph', { type: p.type, duration: p.duration || 1, pos: p.pos, dur: (p.duration || 1) + 0.2 }));
  on('enemy:attack', (p) => { const e = findEnemy(p.id); play('attack', { pos: e ? e.center : undefined }); });
  on('player:damage', () => play('hurt'));
  on('player:dodge', () => play('dodge'));
  on('player:death', () => play('death'));
  on('player:respawn', () => play('respawn'));
  on('player:heal', (p) => { if ((p.amount || 0) >= 2) play('heal'); });
  on('enemy:death', (p) => play('enemyDeath', { pos: p.pos }));
  on('explosion', (p) => play('explosion', { pos: p.pos, dur: 1.2 }));
  on('projectile:fire', (p) => {
    if (p.kind === 'arrow' && (p.by === 'player' || !p.by)) play('bowRelease');
    else if (p.kind === 'bolt') play('bolt', { pos: p.pos });
    else if (p.kind === 'gale') play('fan');
  });
  on('item:grab', (p) => { if (p.from === 'holster') play('holsterOut'); if (p.itemId === 'bow' && p.from === 'holster') play('bowDraw'); });
  on('item:release', (p) => { if (p.to === 'holster' || p.to === 'bag') play('holsterIn'); });
  on('item:consume', (p) => play(p.how === 'drink' || p.itemId === 'flask' ? 'drink' : 'eat'));
  on('item:use', (p) => {
    if (p.action === 'ring') play('waybell');
    else if (p.action === 'fan') play('fan');
    else if (p.action === 'fuse') play('fireLit');
    else if (p.action === 'pour' || p.action === 'fill') play('drink');
  });
  on('item:ignite', () => play('fireLit'));
  on('fire:lit', (p) => play('fireLit', { pos: p.pos }));
  on('tower:lift', (p) => { if (ctx.game && ctx.game.towers && ctx.game.towers.onLift) play('lift', { ratio: p.ratio || 0 }); });
  on('tower:awake', () => { play('towerBell'); setTimeout(() => play('sting:bell'), 900); });
  on('bell:ring', (p) => { if (!p.strong) play('bellSmall', { pos: p.pos }); else if (String(p.id).startsWith('seed')) play('bellSmall', { pos: p.pos }); else play('towerBell'); });
  on('shrine:start', () => play('sting:quest', { gain: 0.8 }));
  on('shrine:beat', () => play('tick'));
  on('shrine:miss', () => play('miss'));
  on('shrine:complete', () => play('sting:shrine'));
  on('race:ring', () => play('tick'));
  on('seed:found', () => play('sting:seed'));
  on('chest:open', () => play('sting:chest'));
  on('item:pickup', (p) => play(p.itemId === 'shard' ? 'shard' : 'item'));
  on('region:enter', () => play('sting:region', { gain: 0.8 }));
  on('time:phase', (p) => { if (p.phase === 'dawn') play('sting:dawn'); });
  on('quest:stage', (p) => { if (p.stage > 0) play('sting:quest'); });
  on('boss:defeated', () => play('sting:ending'));
  on('ui:click', () => play('click'));
  on('ui:menu', () => play('click'));

  function findEnemy(id) {
    const L = ctx.game && ctx.game.enemies && ctx.game.enemies.list;
    if (!L) return null;
    for (const e of L) if (e.id === id) return e;
    return null;
  }
  return A;
}
