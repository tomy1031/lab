// js/core/debug.js — window.AW.debug (§10.15, OPUS-A). Names are fixed by the contract; the extras at the
// bottom are OPUS-A test helpers. Tests talk to the game only through these.
import * as THREE from 'three';
import { wrapDeg360, DEG } from './util.js';
import { createDummy } from './stubs.js';
const SRGB = Uint8Array.from({ length: 256 }, (_, v) => { const l = v / 255; return Math.round(255 * (l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055)); });

// names of everything OPUS-A draws (hands, items, their effects, comfort aids)
const MINE = /^(glove-|item-|items-|glow-sprites|item-shadows|item-streaks|gems$|swing-trail|vignette|center-ring|holster-|grab-aim-|bowstring|flame-cone|torch-glow|torch-core|bomb-spark|gale$|gem$)/;
const LOGGED = ['step', 'gait', 'hit', 'swing', 'item:grab', 'item:release', 'item:throw', 'item:consume', 'item:use',
  'item:ignite', 'item:extinguish', 'item:cook', 'item:return', 'item:pickup', 'projectile:fire', 'explosion', 'gust',
  'player:duck', 'player:glide', 'player:land', 'player:teleport', 'region:enter', 'pause', 'perf:level', 'xr:start', 'xr:end'];

function plain(v, depth = 0) {
  if (v == null || typeof v !== 'object') return v;
  if (v.isVector3) return [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)];
  if (v.isVector2) return [v.x, v.y];
  if (depth > 2) return undefined;
  if (Array.isArray(v)) return v.slice(0, 20).map((x) => plain(x, depth + 1));
  if (v.isObject3D || v.isMaterial || v.isBufferGeometry) return undefined;
  const o = {};
  for (const k of Object.keys(v)) {
    if (k === 'def' || k === 'object3D' || k === 'target' || k === 'sphere' || k === 'owner') continue;
    const x = plain(v[k], depth + 1);
    if (x !== undefined && typeof x !== 'function') o[k] = x;
  }
  return o;
}

export function installDebug(ctx, loop) {
  const AW = window.AW;
  AW.ctx = ctx;
  const d = AW.debug = AW.debug || {};
  const log = {};
  const dummies = [];
  for (const name of LOGGED) {
    log[name] = [];
    ctx.events.on(name, (p) => {
      const arr = log[name];
      if (arr.length >= 60) arr.shift();
      arr.push({ t: +ctx.clock.time.toFixed(3), ...plain(p || {}) });
    });
  }
  const pl = () => ctx.player;

  Object.assign(d, {
    teleport(x, z, yawDeg = 0) { pl().teleport(+x, +z, +yawDeg || 0); return d.state(); },
    setTime(hours) { ctx.world?.setTimeOfDay?.(+hours); },
    hud(visible = true) {
      try { ctx.ui?.setHudVisible?.(!!visible); } catch (e) { AW.errors.push('ui.setHudVisible: ' + e.message); }
      document.body.classList.toggle('aw-nohud', !visible);
    },
    state() {
      const p = pl() || {};
      const v = ctx.game?.vitals || {};
      const pos = p.pos || ctx.rig.position;
      const held = ctx.items?.held || {};
      const en = ctx.game?.enemies;
      let enemies = 0;
      try { enemies = en ? (typeof en.count === 'number' ? en.count : (en.list || []).length) : 0; } catch { enemies = 0; }
      return {
        x: +pos.x.toFixed(3), y: +pos.y.toFixed(3), z: +pos.z.toFixed(3),
        yaw: +wrapDeg360((p.yaw ?? 0) / DEG).toFixed(1),
        hp: v.hp ?? 0, stamina: v.stamina ?? 0,
        steps: p.steps ?? 0, cadence: Math.round(p.cadence ?? 0), speed: +(p.speed ?? 0).toFixed(3),
        region: safe(() => ctx.world.regionAt(pos.x, pos.z), 'meadow'),
        time: +(ctx.world?.time ?? 0).toFixed(3),
        fps: loop.stats.fps, drawCalls: loop.stats.drawCalls, triangles: loop.stats.triangles,
        maxHp: v.maxHp ?? 0, maxStamina: v.maxStamina ?? 0,
        gait: p.gait || 'idle', grounded: !!p.grounded, gliding: !!p.gliding, ducking: !!p.ducking,
        held: { left: held.left ? held.left.id : null, right: held.right ? held.right.id : null },
        enemies,
        stage: ctx.game?.quest?.stage ?? 0,
        checkpoint: ctx.game?.checkpoint ?? null,
        paused: !!ctx.paused,
        mode: ctx.input?.mode || 'desktop',
        perfLevel: loop.perfLevel,
        // extras (OPUS-A)
        headHeight: +(p.headHeight ?? 0).toFixed(3), standHeight: +(p.standHeight ?? 0).toFixed(3), lean: +(p.lean ?? 0).toFixed(2),
      };
    },
    simulateSteps(spm = 120, seconds = 3) { pl().simulateSteps(+spm, +seconds); },
    give(itemId, count = 1) { return ctx.game?.inventory?.add?.(itemId, count) ?? 0; },
    equip(itemId, hand = 'right') {
      const inv = ctx.game?.inventory;
      if (inv && !inv.has?.(itemId) && ctx.items?.defs?.[itemId]) inv.add(itemId, 1);
      const inst = ctx.items?.equip?.(itemId, hand);
      return inst ? inst.uid : null;
    },
    spawnEnemy(type = 'husk', dx = 0, dz = -3) {
      const p = pl().pos;
      const e = ctx.game?.enemies?.spawn?.(type, p.x + dx, p.z + dz);
      return e ? (e.id ?? true) : null;
    },
    vista(id) {
      const v = (ctx.world?.vistas || []).find((x) => x.id === id);
      if (!v) return false;
      pl().teleport(v.x, v.z, v.yaw, ctx.world.groundAt ? ctx.world.groundAt(v.x, v.z, Infinity) + (v.lift || 0) : undefined);
      if (v.time != null) ctx.world.setTimeOfDay(v.time);
      // the suggested look-up angle (§10.7 vistas[].pitch); desktop / tests only — VR never turns the head
      if (!ctx.flags.xr) ctx.input.virtual.setLook(v.yaw, v.pitch || 0);
      return true;
    },
    landmarks() { return (ctx.world?.landmarkList || []).map((l) => ({ id: l.id, kind: l.kind, name: l.name, x: l.x, y: l.y, z: l.z })); },
    vistas() { return (ctx.world?.vistas || []).map((v) => ({ id: v.id, name: v.name, x: v.x, z: v.z, yaw: v.yaw, time: v.time, pitch: v.pitch || 0 })); },
    heightAt(x, z) { return ctx.world.heightAt(+x, +z); },
    setStage(n) { return ctx.game?.debug?.setStage ? ctx.game.debug.setStage(n) : ctx.game?.quest?.setStage?.(+n); },
    awakenTower(id) {
      const g = ctx.game;
      if (g?.debug?.awakenTower) return g.debug.awakenTower(id);
      if (g?.towers?.awaken) return g.towers.awaken(id);
      if (g?.awakenTower) return g.awakenTower(id);
      const prop = ctx.world?.props?.byId?.[id];
      prop?.setState?.('awake', true);
      return !!prop;
    },
    damage(n = 1) { return ctx.game?.vitals?.damage?.(+n, { source: 'world', type: 'debug', dir: null, enemyId: null }); },
    heal(n = 99) { return ctx.game?.vitals?.heal?.(+n); },
    god(b = true) {
      const v = ctx.game?.vitals;
      if (!v) return;
      if (ctx.game?.debug?.god) return ctx.game.debug.god(b);
      try { v.invulnerable = !!b; } catch { /* read-only */ }
    },
    swing(hand = 'right', kind = 'slashH') { return ctx.input.virtual.swing(hand, kind); },
    pause(b = true) { ctx.setPaused(!!b, 'debug'); },
    save() { return ctx.game?.save?.(); },
    reset() { return ctx.game?.reset?.(); },
    quality(level) {
      if (typeof level === 'string' && !/^\d$/.test(level)) { ctx.settings.override('quality', level); return; }
      loop.setPerfLevel(+level);
    },

    // ── OPUS-A extras ──
    /** recent copies of selected events: AW.debug.events('hit') */
    events(name) { return name ? (log[name] || []).slice() : Object.fromEntries(Object.entries(log).map(([k, v]) => [k, v.length])); },
    clearEvents() { for (const k of Object.keys(log)) log[k].length = 0; },
    /** a practice dummy (never dies) at player + (dx, dz) */
    spawnDummy(dx = 0, dz = -1.3) {
      const p = pl().pos;
      const dm = createDummy(ctx, p.x + dx, p.z + dz, { hp: Infinity, kind: 'dummy' });
      dummies.push(dm);
      return dm.id;
    },
    dummyState(id) { const dm = id ? dummies.find((x) => x.id === id) : dummies[dummies.length - 1]; return dm ? plain(dm.state) : null; },
    spawnItem(itemId, dx = 0, dz = -0.6, dy = 1.0, state) {
      const p = pl().pos;
      const it = ctx.items?.spawn?.(itemId, { pos: new THREE.Vector3(p.x + dx, p.y + dy, p.z + dz), state });
      return it ? it.uid : null;
    },
    items() { return (ctx.items?.worldItems || []).map((i) => ({ uid: i.uid, id: i.id, pos: plain(i.pos), heldBy: i.heldBy, state: plain(i.state), sleeping: i.sleeping })); },
    heldItem(hand = 'right') { const i = ctx.items?.held?.[hand]; return i ? { uid: i.uid, id: i.id, state: plain(i.state) } : null; },
    addZone(kind, dx = 0, dy = 1.2, dz = -0.5, r = 0.4) {
      const p = pl().pos;
      const z = ctx.zones.add({ kind, pos: new THREE.Vector3(p.x + dx, p.y + dy, p.z + dz), r, owner: 'debug' });
      return ctx.zones.list.indexOf(z);
    },
    clearZones() { for (const z of ctx.zones.list.filter((z) => z.owner === 'debug')) ctx.zones.remove(z); },
    /** move a virtual hand to a world point relative to the player (desktop / tests) */
    handTo(hand, dx, dy, dz) { const p = pl().pos; ctx.input.virtual.setHandTarget(hand, dx == null ? null : new THREE.Vector3(p.x + dx, p.y + dy, p.z + dz)); },
    handToMouth(hand = 'right') { ctx.player?.desktop?.toMouth?.(hand); },
    press(btn, ms = 150) { ctx.input.virtual.press(btn, ms); },
    hold(btn, down = true) { ctx.input.virtual.hold(btn, down); },
    look(yawDeg, pitchDeg = 0) { ctx.input.virtual.setLook(yawDeg, pitchDeg); },
    /** what OPUS-A draws right now (§7.6 budget: ≤ 16 draw calls, ≤ 8k triangles), counted from the scene */
    budget() {
      let drawCalls = 0, triangles = 0;
      const names = [];
      const vis = (o) => { for (let x = o; x; x = x.parent) { if (!x.visible) return false; if (x === ctx.scene) return true; } return false; };
      ctx.scene.traverse((o) => {
        if (!(o.isMesh || o.isLine) || !MINE.test(o.name || '') || !vis(o)) return;
        const n = o.isInstancedMesh ? o.count : 1;
        if (n <= 0) return;
        drawCalls++;
        const g = o.geometry;
        const t = o.isLine ? 0 : (g.index ? g.index.count : g.attributes.position.count) / 3;
        triangles += t * n;
        names.push(o.name);
      });
      return { drawCalls, triangles: Math.round(triangles), names };
    },
    stats() { return { ...loop.stats }; },
    /** screen coverage of the meshes whose name matches `pattern` (rendered alone, from the current camera):
     *  { frac, bottom10, topRow (0 = top, 1 = bottom), bbox, biggestColor (largest single-colour share of the screen) } */
    coverage(pattern = '^glove-', width = 320, minLum = 1) {
      const re = new RegExp(pattern);
      const r = ctx.renderer, scene = ctx.scene, cam = ctx.camera;
      const size = r.getSize(new THREE.Vector2());
      const w = width, h = Math.max(1, Math.round(width * size.y / size.x));
      const hidden = [];
      scene.traverse((o) => {
        if (!(o.isMesh || o.isLine || o.isPoints || o.isSprite) || !o.visible) return;
        if (!re.test(o.name || '')) { o.visible = false; hidden.push(o); }
      });
      const bg = scene.background, fog = scene.fog;
      scene.background = null; scene.fog = null;
      const cc = r.getClearColor(new THREE.Color()), ca = r.getClearAlpha();
      const rt = new THREE.WebGLRenderTarget(w, h);
      r.setRenderTarget(rt);
      r.setClearColor(0x000000, 0);
      r.clear();
      r.render(scene, cam);
      const px = new Uint8Array(w * h * 4);
      r.readRenderTargetPixels(rt, 0, 0, w, h, px);
      // the target holds linear colour; encode to sRGB so colours (and dark faces) are judged as they appear on screen
      for (let i = 0; i < px.length; i += 4) { px[i] = SRGB[px[i]]; px[i + 1] = SRGB[px[i + 1]]; px[i + 2] = SRGB[px[i + 2]]; }
      r.setRenderTarget(null);
      r.setClearColor(cc, ca);
      scene.background = bg; scene.fog = fog;
      for (const o of hidden) o.visible = true;
      rt.dispose();
      let n = 0, bottom = 0, top = h, minX = w, maxX = -1, minY = h, maxY = -1;
      const hist = new Map();
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (px[i + 3] === 0 && px[i] + px[i + 1] + px[i + 2] === 0) continue;
        if (minLum > 1 && Math.max(px[i], px[i + 1], px[i + 2]) < minLum) continue;
        n++;
        const row = h - 1 - y;                       // readPixels is bottom-up
        if (row >= h * 0.9) bottom++;
        if (row < top) top = row;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, row); maxY = Math.max(maxY, row);
        const key = (px[i] >> 4) << 8 | (px[i + 1] >> 4) << 4 | (px[i + 2] >> 4);
        hist.set(key, (hist.get(key) || 0) + 1);
      }
      let big = 0;
      for (const v of hist.values()) big = Math.max(big, v);
      // largest connected patch of one colour (a "single-colour face")
      const lab = new Int32Array(w * h).fill(-1);
      const keyAt = (i) => (px[i * 4 + 3] === 0 && px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2] === 0) ? -1 : ((px[i * 4] >> 4) << 8 | (px[i * 4 + 1] >> 4) << 4 | (px[i * 4 + 2] >> 4));
      let face = 0, faceKey = -1, faceAt = -1;
      const stack = [];
      for (let i0 = 0; i0 < w * h; i0++) {
        if (lab[i0] !== -1) continue;
        const k = keyAt(i0);
        if (k < 0) { lab[i0] = -2; continue; }
        let size = 0;
        stack.push(i0); lab[i0] = i0;
        while (stack.length) {
          const i = stack.pop(); size++;
          const x = i % w, y = (i / w) | 0;
          const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
          for (const j of nb) if (j >= 0 && lab[j] === -1 && keyAt(j) === k) { lab[j] = i0; stack.push(j); }
        }
        if (size > face) { face = size; faceKey = k; faceAt = i0; }
      }
      const T = w * h;
      return { frac: +(n / T).toFixed(4), bottom10: +(bottom / T).toFixed(4), topRow: n ? +(top / h).toFixed(3) : null,
        bbox: n ? [+(minX / w).toFixed(3), +(minY / h).toFixed(3), +(maxX / w).toFixed(3), +(maxY / h).toFixed(3)] : null,
        biggestColor: +(big / T).toFixed(4), biggestFace: +(face / T).toFixed(4),
        faceColor: faceKey < 0 ? null : '#' + faceKey.toString(16).padStart(3, '0'),
        faceAt: faceAt < 0 ? null : [+((faceAt % w) / w).toFixed(3), +(1 - ((faceAt / w) | 0) / h).toFixed(3)] };
    },
  });
  function safe(fn, dflt) { try { return fn(); } catch { return dflt; } }
  return d;
}
