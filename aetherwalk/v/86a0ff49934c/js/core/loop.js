// js/core/loop.js — the main loop (§10.13, OPUS-A).
// input → player → items → game → world → ui/audio → render → stats / auto quality.
// Every update is wrapped: a throwing module is reported once per message and keeps being called.
import { errMsg } from './util.js';

export function createLoop(ctx, report) {
  const { renderer, scene, camera, events } = ctx;
  const reported = new Set();
  const stats = { fps: 0, frameMs: 0, drawCalls: 0, triangles: 0, perfLevel: 0, frames: 0 };
  let last = 0, t0 = 0;
  let fpsCount = 0, fpsStart = 0;
  let firstFrameResolve = null;
  const firstFrame = new Promise((r) => { firstFrameResolve = r; });
  // auto quality (XR only; desktop rAF is vsync-bound and never "fast" by interval)
  const perf = { sum: 0, n: 0, windowStart: 0, goodSince: -1, level: 0, lastDrop: -1e9, holdMul: 1, auto: true };

  function guard(name, fn) {
    try { fn(); } catch (e) {
      const msg = `${name}: ${errMsg(e)}`;
      if (!reported.has(msg)) { reported.add(msg); report(msg); }
    }
  }

  function setPerfLevel(level, why = 'auto') {
    level = Math.max(0, Math.min(2, level | 0));
    if (level === perf.level) return;
    perf.level = level;
    stats.perfLevel = level;
    guard('world.setQuality', () => ctx.world?.setQuality?.(level));
    events.emit('perf:level', { level, why });
  }

  function autoPerf(now, frameSec) {
    if (!ctx.flags.xr && !ctx.params.has('autoperf')) return;
    if (!perf.auto) return;
    perf.sum += frameSec; perf.n++;
    if (now - perf.windowStart < 2) return;
    const avgMs = (perf.sum / perf.n) * 1000;
    perf.sum = 0; perf.n = 0; perf.windowStart = now;
    if (avgMs > 15) {
      if (perf.level < 2) {
        // dropping right after a recovery → wait longer before the next recovery
        if (now - perf.lastRecover < 6) perf.holdMul = Math.min(8, perf.holdMul * 2);
        perf.lastDrop = now;
        setPerfLevel(perf.level + 1);
      }
      perf.goodSince = -1;
    } else if (avgMs < 11.5 || (ctx.flags.xr && avgMs < 14.4)) {
      // at 72 Hz the frame interval is 13.9 ms: hitting the target rate counts as "fast"
      if (perf.goodSince < 0) perf.goodSince = now;
      if (perf.level > 0 && now - perf.goodSince >= 10 * perf.holdMul) {
        perf.goodSince = now; perf.lastRecover = now;
        setPerfLevel(perf.level - 1);
      }
    } else perf.goodSince = -1;
  }

  function frame(time, xrFrame) {
    const nowMs = performance.now();
    const now = nowMs / 1000;
    if (!t0) { t0 = now; last = now; fpsStart = now; perf.windowStart = now; }
    const raw = Math.max(0, now - last);
    last = now;
    const dt = Math.min(raw, 0.05);
    const clock = ctx.clock;
    clock.time = now - t0;
    clock.dt = dt;
    clock.rawDt = Math.min(raw, 0.25);
    clock.frame++;
    const sim = ctx.paused ? 0 : dt;
    clock.sim = sim;
    // real elapsed time for systems tied to the body (stepping speed must follow real cadence even when the
    // frame rate collapses): 0 when paused, at most 0.5 s, callers sub-step it at ≤ 0.05 s
    clock.real = ctx.paused ? 0 : Math.min(raw, 0.5);

    for (let i = 0; i < pre.length; i++) { const x = pre[i]; guard(x.name, () => x.fn(dt, sim)); }
    guard('input', () => { ctx.input.setFrame(xrFrame || null); ctx.input.update(dt); });
    guard('player', () => ctx.player?.update(sim));
    guard('items', () => ctx.items?.update(sim));
    guard('game', () => ctx.game?.update(sim));
    guard('world', () => ctx.world?.update(sim, ctx));
    guard('ui', () => ctx.ui?.update(dt));
    guard('audio', () => ctx.audio?.update(dt));
    for (let i = 0; i < extra.length; i++) { const x = extra[i]; guard(x.name, () => x.fn(dt, sim)); }

    guard('render', () => renderer.render(scene, camera));

    const info = renderer.info.render;
    stats.drawCalls = info.calls;
    stats.triangles = info.triangles;
    stats.frames++;
    fpsCount++;
    if (now - fpsStart >= 1) {
      stats.fps = Math.round(fpsCount / (now - fpsStart));
      fpsCount = 0; fpsStart = now;
    }
    stats.frameMs = raw * 1000;
    autoPerf(now, raw);
    if (firstFrameResolve) { const r = firstFrameResolve; firstFrameResolve = null; r(); }
  }

  const extra = [], pre = [];
  return {
    stats,
    firstFrame,
    start() { renderer.setAnimationLoop(frame); },
    stop() { renderer.setAnimationLoop(null); },
    setPerfLevel(level, keepAuto = false) { if (!keepAuto) perf.auto = false; setPerfLevel(level, keepAuto ? 'auto' : 'manual'); },
    setAutoPerf(b) { perf.auto = !!b; },
    get perfLevel() { return perf.level; },
    /** extra per-frame hooks (name, fn(dt, sim)), e.g. desktop controls */
    addHook(name, fn, phase = 'post') { (phase === 'pre' ? pre : extra).push({ name, fn }); },
  };
}
