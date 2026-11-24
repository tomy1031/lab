// gesture/hands.js — webcam + MediaPipe HandLandmarker (same setup as dream-drift). Every frame it runs
// detection on a new camera frame, feeds the MotionRecognizer, moves a fingertip cursor for the menus
// (pinch = click) and can draw a small mirrored preview with the hand skeletons.
import { MotionRecognizer } from './motion.js';
import { LM, classify } from './pose.js';

const MP_VER = '0.10.35';
// bundled with the game (vendor/mediapipe) so the hands work offline too (the PWA caches them on first use)
const MP_URL = new URL('../../vendor/mediapipe', import.meta.url).href;
const MODEL = new URL('../../vendor/mediapipe/hand_landmarker.task', import.meta.url).href;
const CONNECTIONS = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]];
const POSE_COLORS = { fist: '#ff8a3d', open: '#6ff0ff', point: '#b8ff6a', gun: '#ff4f6a', peace: '#ffe14d', call: '#d68aff', other: '#ffffff' };

export class HandTracker {
  constructor() {
    this.status = 'off'; // off | camera | model | ready | error
    this.error = '';
    this.video = null; this.stream = null; this.landmarker = null;
    this.motion = new MotionRecognizer();
    this.hands = []; this.handedness = [];
    this.lastVideoTime = -1; this.lastTs = 0;
    this.cursor = { x: 0.5, y: 0.5, visible: false, pinch: false, clicked: false };
    this.aspect = 4 / 3;
    this.detectMs = 0;
    this.events = [];
  }

  get ready() { return this.status === 'ready'; }

  async start(onStatus = () => {}) {
    if (this.status === 'ready' || this.status === 'camera' || this.status === 'model') return;
    try {
      this.status = 'camera'; onStatus(this.status);
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('このブラウザではカメラが使えません');
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false });
      const v = this.video = document.createElement('video');
      v.playsInline = true; v.muted = true; v.autoplay = true;
      v.srcObject = this.stream;
      await v.play();
      this.aspect = (v.videoWidth || 640) / (v.videoHeight || 480);
      this.status = 'model'; onStatus(this.status);
      const vision = await import(/* @vite-ignore */ `${MP_URL}/vision_bundle.mjs`);
      const fileset = await vision.FilesetResolver.forVisionTasks(`${MP_URL}/wasm`);
      const opts = (delegate) => ({
        baseOptions: { modelAssetPath: MODEL, delegate },
        runningMode: 'VIDEO', numHands: 2,
        minHandDetectionConfidence: 0.55, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
      });
      try { this.landmarker = await vision.HandLandmarker.createFromOptions(fileset, opts('GPU')); }
      catch { this.landmarker = await vision.HandLandmarker.createFromOptions(fileset, opts('CPU')); }
      this.status = 'ready'; onStatus(this.status);
    } catch (e) {
      this.status = 'error';
      this.error = e && e.name === 'NotAllowedError' ? 'カメラの使用が許可されませんでした' : (e && e.message) || String(e);
      onStatus(this.status, this.error);
      this.stopStream();
    }
  }

  stopStream() {
    if (this.stream) for (const t of this.stream.getTracks()) t.stop();
    this.stream = null;
  }
  stop() {
    this.stopStream();
    try { this.landmarker?.close(); } catch { /* ignore */ }
    this.landmarker = null; this.video = null; this.status = 'off';
    this.hands = [];
  }

  /** alias used by the gesture practice screen */
  update() { return this.poll(); }

  /** call every animation frame; returns the recogniser state (events are only fresh on frames with a new camera image) */
  poll() {
    this.events = [];
    if (this.status !== 'ready' || !this.video) return null;
    const v = this.video;
    if (v.readyState >= 2 && v.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = v.currentTime;
      let ts = performance.now();
      if (ts <= this.lastTs) ts = this.lastTs + 1;
      const dt = this.lastTs ? Math.min(0.2, (ts - this.lastTs) / 1000) : 1 / 30;
      this.lastTs = ts;
      try {
        const t0 = performance.now();
        const res = this.landmarker.detectForVideo(v, ts);
        this.detectMs = this.detectMs * 0.9 + (performance.now() - t0) * 0.1;
        this.hands = res.landmarks || [];
        this.handedness = (res.handednesses || res.handedness || []).map((h) => h?.[0]?.categoryName || null);
      } catch { this.hands = []; this.handedness = []; }
      const st = this.motion.update(this.hands, dt, this.aspect, this.handedness);
      this.events = st.events.slice();
      this.updateCursor(dt);
    }
    return this.motion.state;
  }

  /** feed synthetic hands (tests / debug) */
  feed(hands, dt = 1 / 30) {
    this.hands = hands;
    const st = this.motion.update(hands, dt, this.aspect);
    this.events = st.events.slice();
    this.updateCursor(dt);
    return st;
  }

  updateCursor(dt) {
    const c = this.cursor;
    c.clicked = false;
    if (!this.hands.length) { c.visible = false; c.pinch = false; return; }
    let h = this.hands[0];
    for (const x of this.hands) { const p = classify(x, this.aspect); if (p === 'point' || p === 'gun') h = x; }
    const tip = h[LM.INDEX_TIP];
    const tx = (1 - tip.x - 0.15) / 0.7, ty = (tip.y - 0.12) / 0.66;
    const k = c.visible ? 1 - Math.exp(-18 * dt) : 1;
    c.x += (Math.max(0, Math.min(1, tx)) - c.x) * k;
    c.y += (Math.max(0, Math.min(1, ty)) - c.y) * k;
    c.visible = true;
    const palm = Math.hypot((h[LM.WRIST].x - h[LM.MIDDLE_MCP].x) * this.aspect, h[LM.WRIST].y - h[LM.MIDDLE_MCP].y) || 0.1;
    const pd = Math.hypot((h[LM.THUMB_TIP].x - tip.x) * this.aspect, h[LM.THUMB_TIP].y - tip.y) / palm;
    const was = c.pinch;
    c.pinch = was ? pd < 0.5 : pd < 0.32;
    if (c.pinch && !was) c.clicked = true;
  }

  /** mirrored camera image + skeletons coloured by pose + a label of the last gesture */
  drawPreview(canvas, label = '') {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    if (this.video && this.video.readyState >= 2) {
      ctx.translate(W, 0); ctx.scale(-1, 1);
      ctx.globalAlpha = 0.8;
      ctx.drawImage(this.video, 0, 0, W, H);
      ctx.globalAlpha = 1;
      ctx.lineWidth = Math.max(2, W / 110);
      for (const h of this.hands) {
        const pose = classify(h, this.aspect);
        ctx.strokeStyle = POSE_COLORS[pose] || '#fff';
        ctx.beginPath();
        for (const [a, b] of CONNECTIONS) { ctx.moveTo(h[a].x * W, h[a].y * H); ctx.lineTo(h[b].x * W, h[b].y * H); }
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        for (const p of h) { ctx.beginPath(); ctx.arc(p.x * W, p.y * H, W / 150 + 1, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    } else {
      ctx.fillStyle = '#10202a'; ctx.fillRect(0, 0, W, H);
    }
    if (label) {
      ctx.font = `bold ${Math.round(H / 9)}px sans-serif`;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, H - H / 6, W, H / 6);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, W / 2, H - H / 12);
    }
    ctx.restore();
  }
}
