// js/core/xr.js — entering / leaving immersive VR (§10.14 step 7, §10.16, OPUS-A).
import { DEVICE_RENDER } from './config.js';

export function createXR(ctx) {
  const { renderer, events } = ctx;
  let session = null;
  let supported = false;

  const supportedPromise = (async () => {
    try {
      if (!navigator.xr || !navigator.xr.isSessionSupported) return false;
      supported = await navigator.xr.isSessionSupported('immersive-vr');
      return supported;
    } catch { return false; }
  })();

  function qualityLevel() {
    const dev = DEVICE_RENDER[ctx.flags.device] || DEVICE_RENDER.pc;
    let q = ctx.settings.get('quality');
    if (q === 'auto' || !dev.scale[q]) q = dev.auto;
    return { dev, q };
  }

  function hasHands(s) {
    for (const src of s.inputSources) if (src.hand) return true;
    return false;
  }

  async function enter() {
    if (session) return session;
    if (!navigator.xr) throw new Error('WebXR is not available');
    const { dev, q } = qualityLevel();
    try { renderer.xr.setFramebufferScaleFactor(dev.scale[q] || 1); } catch { /* ignore */ }
    try { renderer.xr.setFoveation(dev.foveation); } catch { /* ignore */ }
    const s = await navigator.xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers'],
    });
    session = s;
    s.addEventListener('end', onEnd);
    s.addEventListener('visibilitychange', () => {
      // Meta button / headset off → pause; back → resume (only what we paused ourselves)
      if (s.visibilityState === 'visible') { if (ctx.pauseReason === 'xr-blur') ctx.setPaused(false, 'xr-visible'); }
      else if (!ctx.paused) ctx.setPaused(true, 'xr-blur');
    });
    s.addEventListener('inputsourceschange', () => {
      const ht = hasHands(s);
      if (ht !== ctx.flags.handTracking) {
        ctx.flags.handTracking = ht;
        ctx.input && (ctx.input.mode = ht ? 'xr-hands' : 'xr-controllers');
      }
    });
    await renderer.xr.setSession(s);
    try { renderer.xr.setFoveation(dev.foveation); } catch { /* ignore */ }
    try {
      const want = dev.fps[q] || 72;
      if (s.updateTargetFrameRate && s.supportedFrameRates && [...s.supportedFrameRates].includes(want)) await s.updateTargetFrameRate(want).catch(() => {});
      else if (s.updateTargetFrameRate) await s.updateTargetFrameRate(72).catch(() => {});
    } catch { /* not supported */ }
    ctx.flags.xr = true;
    ctx.flags.handTracking = hasHands(s);
    // a software GL (emulators, CI) can't hold any VR frame rate: start at the lowest level
    try {
      const gl = renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const name = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
      if (/swiftshader|llvmpipe|software/i.test(name)) ctx.loop?.setPerfLevel?.(2, true);
    } catch { /* no info */ }
    if (ctx.input) ctx.input.mode = ctx.flags.handTracking ? 'xr-hands' : 'xr-controllers';
    events.emit('xr:start', { handTracking: ctx.flags.handTracking });
    return s;
  }

  function onEnd() {
    session = null;
    ctx.flags.xr = false;
    ctx.flags.handTracking = false;
    if (ctx.input) ctx.input.mode = 'desktop';
    events.emit('xr:end', {});
  }

  return {
    get session() { return session; },
    get active() { return !!session; },
    get supported() { return supported; },
    supportedPromise,
    enter,
    async exit() { if (session) await session.end().catch(() => {}); },
  };
}
