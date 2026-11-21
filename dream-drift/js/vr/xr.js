// vr/xr.js — entering and leaving immersive VR (Meta Quest and other WebXR headsets)
export class XRManager {
  constructor(renderer) {
    this.renderer = renderer;
    this.r = renderer.r;
    this.session = null;
    this.supported = false;
    this.onStart = null; this.onEnd = null; this.onBlur = null;
    this.ready = (async () => {
      try { this.supported = !!(navigator.xr && await navigator.xr.isSessionSupported('immersive-vr')); }
      catch (e) { this.supported = false; }
      return this.supported;
    })();
  }

  get presenting() { return !!this.session; }

  // must be called from a click / button handler (browsers require a user gesture)
  async enter() {
    if (this.session) return this.session;
    if (!navigator.xr) throw new Error('WebXR が 使えない ブラウザです');
    const r = this.r;
    r.xr.enabled = true;
    // seated play: 'local' puts the origin at the head, so the driver's seat can be lined up with it
    r.xr.setReferenceSpaceType('local');
    try { r.xr.setFramebufferScaleFactor(0.9); } catch (e) { /* only before a session */ }
    const s = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'hand-tracking'] });
    this.session = s;
    s.addEventListener('end', () => {
      this.session = null;
      this.onEnd?.();
    });
    s.addEventListener('visibilitychange', () => {
      // Meta button / headset taken off → the race pauses
      if (s.visibilityState !== 'visible') this.onBlur?.();
    });
    await r.xr.setSession(s);
    try { r.xr.setFoveation(1); } catch (e) { /* not supported */ }
    try {
      if (s.updateTargetFrameRate && s.supportedFrameRates) {
        const rates = [...s.supportedFrameRates];
        const want = rates.includes(72) ? 72 : rates[0];
        if (want) await s.updateTargetFrameRate(want).catch(() => {});
      }
    } catch (e) { /* not supported */ }
    // software GL (emulators, CI) renders VR very slowly; nothing to tune there, only remember it
    try {
      const gl = r.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      this.software = /swiftshader|llvmpipe|software/i.test(String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)));
    } catch (e) { this.software = false; }
    this.onStart?.(s);
    return s;
  }

  exit() { if (this.session) this.session.end().catch(() => {}); }

  handTracking() {
    if (!this.session) return false;
    for (const src of this.session.inputSources) if (src.hand) return true;
    return false;
  }
}
