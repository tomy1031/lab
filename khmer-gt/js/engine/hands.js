// js/engine/hands.js — Webcam + MediaPipe HandLandmarker for controller-free driving AND menu pointer (pinch / dwell click)
import { GestureInterpreter, LM, classifyHand, clamp } from './gesture-math.js';

const MP_VER = '0.10.35';
const MP_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

export class HandTracker {
  constructor() {
    this.status = 'off'; // off | camera | model | ready | error
    this.error = '';
    this.video = null;
    this.stream = null;
    this.landmarker = null;
    this.interp = new GestureInterpreter();
    this.hands = [];
    this.lastVideoTime = -1;
    this.lastTs = 0;
    this.aspect = 4 / 3;
    this.ctl = this.interp.out;
    this.cursor = {
      x: 0.5,
      y: 0.5,
      visible: false,
      pinch: false,
      clicked: false,
      dwellProgress: 0,
    };
  }

  get ready() {
    return this.status === 'ready';
  }

  async start(onStatus = () => {}) {
    if (this.status === 'ready' || this.status === 'camera' || this.status === 'model') return;
    try {
      this.status = 'camera';
      onStatus(this.status);
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('このブラウザではカメラが利用できません');
      }
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      const v = (this.video = document.createElement('video'));
      v.playsInline = true;
      v.muted = true;
      v.autoplay = true;
      v.srcObject = this.stream;
      await v.play();
      this.aspect = (v.videoWidth || 640) / Math.max(1, v.videoHeight || 480);

      this.status = 'model';
      onStatus(this.status);
      const vision = await import(/* @vite-ignore */ `${MP_URL}/vision_bundle.mjs`);
      const fileset = await vision.FilesetResolver.forVisionTasks(`${MP_URL}/wasm`);
      const opts = (delegate) => ({
        baseOptions: { modelAssetPath: MODEL, delegate },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.52,
        minHandPresenceConfidence: 0.48,
        minTrackingConfidence: 0.48,
      });
      try {
        this.landmarker = await vision.HandLandmarker.createFromOptions(fileset, opts('GPU'));
      } catch {
        this.landmarker = await vision.HandLandmarker.createFromOptions(fileset, opts('CPU'));
      }
      this.status = 'ready';
      onStatus(this.status);
    } catch (e) {
      this.status = 'error';
      this.error = e?.name === 'NotAllowedError'
        ? 'カメラへのアクセスが拒否されました'
        : (e?.message || String(e));
      onStatus(this.status, this.error);
      this.stopStream();
    }
  }

  stopStream() {
    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop();
    }
    this.stream = null;
  }

  stop() {
    this.stopStream();
    try { this.landmarker?.close(); } catch { /* ignore */ }
    this.landmarker = null;
    this.video = null;
    this.hands = [];
    this.interp.reset();
    this.cursor.visible = false;
    this.status = 'off';
  }

  poll() {
    if (this.status !== 'ready' || !this.video) return null;
    const v = this.video;
    if (v.readyState >= 2 && v.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = v.currentTime;
      let ts = performance.now();
      if (ts <= this.lastTs) ts = this.lastTs + 1;
      const dt = this.lastTs ? clamp((ts - this.lastTs) / 1000, 0.005, 0.2) : 1 / 30;
      this.lastTs = ts;
      try {
        const res = this.landmarker.detectForVideo(v, ts);
        this.hands = res.landmarks || [];
      } catch {
        this.hands = [];
      }
      this.ctl = this.interp.update(this.hands, dt, this.aspect, { mirrored: true });
      this.updateCursor(dt);
    }
    return this.ctl;
  }

  updateCursor(dt) {
    const c = this.cursor;
    c.clicked = false;
    if (!this.hands.length) {
      c.visible = false;
      c.pinch = false;
      return;
    }
    let h = this.hands[0];
    for (const candidate of this.hands) {
      if (classifyHand(candidate, this.aspect) === 'point') {
        h = candidate;
        break;
      }
    }
    const tip = h[LM.INDEX_TIP];
    const tx = clamp((1 - tip.x - 0.14) / 0.72, 0, 1);
    const ty = clamp((tip.y - 0.12) / 0.72, 0, 1);
    const k = c.visible ? 1 - Math.exp(-18 * dt) : 1;
    c.x += (tx - c.x) * k;
    c.y += (ty - c.y) * k;
    c.visible = true;

    const palm = Math.hypot((h[LM.WRIST].x - h[LM.MIDDLE_MCP].x) * this.aspect, h[LM.WRIST].y - h[LM.MIDDLE_MCP].y) || 0.1;
    const pd = Math.hypot((h[LM.THUMB_TIP].x - tip.x) * this.aspect, h[LM.THUMB_TIP].y - tip.y) / palm;
    const wasPinch = c.pinch;
    c.pinch = wasPinch ? pd < 0.48 : pd < 0.33;
    if (c.pinch && !wasPinch) c.clicked = true;
  }

  drawPreview(canvas, steer = 0) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.save();
    ctx.clearRect(0, 0, W, H);

    // Mirrored webcam feed
    if (this.video && this.video.readyState >= 2) {
      ctx.save();
      ctx.translate(W, 0);
      ctx.scale(-1, 1);
      ctx.globalAlpha = 0.72;
      ctx.drawImage(this.video, 0, 0, W, H);
      ctx.restore();
    } else {
      ctx.fillStyle = '#0d1118';
      ctx.fillRect(0, 0, W, H);
    }

    // Virtual GT steering ring overlay
    const cx = W * 0.5;
    const cy = H * 0.55;
    const rad = Math.min(W, H) * 0.34;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(steer * 0.85);
    ctx.strokeStyle = this.ctl.brake > 0.3 ? '#ff3b4a' : this.ctl.boost ? '#00f0ff' : '#d4a84b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, rad, 0, Math.PI * 2);
    ctx.stroke();
    // Top center marker
    ctx.fillStyle = '#ff3b4a';
    ctx.fillRect(-4, -rad - 3, 8, 10);
    // Horizontal spokes
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-rad + 4, 0);
    ctx.lineTo(rad - 4, 0);
    ctx.moveTo(0, 0);
    ctx.lineTo(0, rad - 4);
    ctx.stroke();
    ctx.restore();

    // Hand skeletons
    for (const lm of this.hands) {
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 2;
      for (const [a, b] of CONNECTIONS) {
        ctx.beginPath();
        ctx.moveTo((1 - lm[a].x) * W, lm[a].y * H);
        ctx.lineTo((1 - lm[b].x) * W, lm[b].y * H);
        ctx.stroke();
      }
      ctx.fillStyle = '#ffffff';
      for (const p of lm) {
        ctx.beginPath();
        ctx.arc((1 - p.x) * W, p.y * H, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Pose badge
    const labels = {
      none: '手をカメラに見せてください',
      drive: '両手ハンドル — アクセルON',
      'one-hand': '片手ハンドル — アクセルON',
      brake: 'パー ✋ — ブレーキ',
      boost: '✌️/👍 — ERS ブースト！',
    };
    ctx.fillStyle = 'rgba(8, 11, 18, 0.78)';
    ctx.fillRect(0, H - 24, W, 24);
    ctx.fillStyle = this.ctl.boost ? '#00f0ff' : this.ctl.brake > 0.3 ? '#ff6470' : '#f3d182';
    ctx.font = '700 11px "Noto Sans JP", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labels[this.ctl.pose] || '', W * 0.5, H - 12);
    ctx.restore();
  }
}
