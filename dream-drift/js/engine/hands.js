// engine/hands.js — webcam + MediaPipe HandLandmarker. Gives driving controls (via GestureInterpreter),
// a hand cursor for the menus (index fingertip; pinch to click) and draws the little camera preview.
import { GestureInterpreter, LM, classify } from './gesture-math.js';

const MP_VER = '0.10.35';
const MP_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const CONNECTIONS = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]];

export class HandTracker {
  constructor() {
    this.status = 'off'; // off | camera | model | ready | error
    this.error = '';
    this.video = null; this.stream = null; this.landmarker = null;
    this.interp = new GestureInterpreter();
    this.hands = [];
    this.lastVideoTime = -1; this.lastTs = 0; this.lastDetect = 0;
    this.ctl = this.interp.out;
    this.cursor = { x: 0.5, y: 0.5, visible: false, pinch: false, clicked: false };
    this.aspect = 4 / 3;
    this.detectMs = 0;
  }

  get ready() { return this.status === 'ready'; }

  async start(onStatus = () => {}) {
    if (this.status === 'ready' || this.status === 'camera' || this.status === 'model') return;
    try {
      this.status = 'camera'; onStatus(this.status);
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('このブラウザでは カメラが 使えません');
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
      catch (e) { this.landmarker = await vision.HandLandmarker.createFromOptions(fileset, opts('CPU')); }
      this.status = 'ready'; onStatus(this.status);
    } catch (e) {
      this.status = 'error';
      this.error = e && e.name === 'NotAllowedError' ? 'カメラの 使用が 許可されませんでした' : (e && e.message) || String(e);
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
    try { this.landmarker?.close(); } catch (e) { /* ignore */ }
    this.landmarker = null; this.video = null; this.status = 'off';
    this.hands = [];
  }

  // call every animation frame; runs detection when the camera has a new frame
  poll() {
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
      } catch (e) { this.hands = []; }
      this.ctl = this.interp.update(this.hands, dt, this.aspect);
      this.updateCursor(dt);
    }
    return this.ctl;
  }

  // index fingertip → screen (mirrored, central part of the image spans the whole screen)
  updateCursor(dt) {
    const c = this.cursor;
    c.clicked = false;
    if (!this.hands.length) { c.visible = false; c.pinch = false; return; }
    // prefer a pointing hand
    let h = this.hands[0];
    for (const x of this.hands) if (classify(x, this.aspect) === 'point') h = x;
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

  // draw the mirrored camera image, the hand skeletons and a steering-wheel gauge
  drawPreview(canvas, steer = 0) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    if (this.video && this.video.readyState >= 2) {
      ctx.translate(W, 0); ctx.scale(-1, 1);
      ctx.globalAlpha = 0.85;
      ctx.drawImage(this.video, 0, 0, W, H);
      ctx.globalAlpha = 1;
      ctx.lineWidth = Math.max(2, W / 110);
      for (const h of this.hands) {
        const pose = classify(h, this.aspect);
        ctx.strokeStyle = pose === 'peace' ? '#ffe14d' : '#6ff0ff';
        ctx.beginPath();
        for (const [a, b] of CONNECTIONS) { ctx.moveTo(h[a].x * W, h[a].y * H); ctx.lineTo(h[b].x * W, h[b].y * H); }
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        for (const p of h) { ctx.beginPath(); ctx.arc(p.x * W, p.y * H, W / 140 + 1, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    } else {
      ctx.fillStyle = '#1b1f3a'; ctx.fillRect(0, 0, W, H);
    }
    // wheel gauge
    const r = Math.min(W, H) * 0.2, cx = W / 2, cy = H - r - 6;
    ctx.translate(cx, cy);
    ctx.rotate(steer * 1.2);
    ctx.lineWidth = r * 0.22;
    ctx.strokeStyle = this.hands.length ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.moveTo(0, 0); ctx.lineTo(0, r); ctx.stroke();
    ctx.fillStyle = '#ff5fa2'; ctx.beginPath(); ctx.arc(0, -r, r * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}
