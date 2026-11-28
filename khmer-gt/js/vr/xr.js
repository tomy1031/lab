// js/vr/xr.js — WebXR immersive-vr session manager with hand-tracking support (Meta Quest 2 / 3 / 3S & PCVR)

export class XRManager {
  constructor(renderer) {
    this.renderer = renderer;
    this.r = renderer.r;
    this.session = null;
    this.supported = false;
    this.onStart = null;
    this.onEnd = null;
    this.onBlur = null;

    this.ready = (async () => {
      try {
        this.supported = !!(navigator.xr && await navigator.xr.isSessionSupported('immersive-vr'));
      } catch {
        this.supported = false;
      }
      return this.supported;
    })();
  }

  get presenting() {
    return !!this.session;
  }

  async enter() {
    if (this.session) return this.session;
    if (!navigator.xr) throw new Error('このブラウザは WebXR に対応していません');

    const r = this.r;
    r.xr.enabled = true;
    r.xr.setReferenceSpaceType('local');
    try { r.xr.setFramebufferScaleFactor(0.95); } catch { /* ignore */ }

    const session = await navigator.xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'hand-tracking'],
    });
    this.session = session;

    session.addEventListener('end', () => {
      this.session = null;
      this.onEnd?.();
    });
    session.addEventListener('visibilitychange', () => {
      if (session.visibilityState !== 'visible') this.onBlur?.();
    });

    await r.xr.setSession(session);
    try { r.xr.setFoveation(1); } catch { /* ignore */ }
    try {
      if (session.updateTargetFrameRate && session.supportedFrameRates) {
        const rates = [...session.supportedFrameRates];
        const want = rates.includes(72) ? 72 : rates[0];
        if (want) await session.updateTargetFrameRate(want).catch(() => {});
      }
    } catch { /* ignore */ }

    this.onStart?.(session);
    return session;
  }

  exit() {
    if (this.session) this.session.end().catch(() => {});
  }

  hasHandTracking() {
    if (!this.session) return false;
    for (const s of this.session.inputSources) {
      if (s.hand) return true;
    }
    return false;
  }
}
