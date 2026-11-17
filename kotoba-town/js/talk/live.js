// Gemini Live (BidiGenerateContent) client over a raw WebSocket.
// Works in the browser and in Node ≥ 22 (global WebSocket) — the same code is exercised against the
// real API by the voice workflow's self-check, so what runs on the headset is what was verified.
//
// Wire format = the one @google/genai sends (camelCase JSON, v1beta, `?key=`):
//   → { setup: { model, generationConfig, systemInstruction, tools, realtimeInputConfig, … } }
//   ← { setupComplete: {} }
//   → { realtimeInput: { audio: { data, mimeType: 'audio/pcm;rate=16000' } } }
//   → { clientContent: { turns: [...], turnComplete } }
//   → { toolResponse: { functionResponses: [{ id, name, response }] } }
//   ← { serverContent: { modelTurn, inputTranscription, outputTranscription, turnComplete, interrupted } }
//   ← { toolCall: { functionCalls: [{ id, name, args }] } } · { goAway } · { usageMetadata }

/**
 * Models, newest first (same order as nexmax-academy's src/lib/ai/models.ts, checked 2026-09).
 * gemini-3.8-live is GA; it rejects thinkingConfig / enableAffectiveDialog / proactivity:false, so
 * none of those are ever sent.
 */
export const LIVE_MODELS = [
  'gemini-3.8-live',
  'gemini-3.1-flash-live-preview',
  'gemini-2.5-flash-native-audio-preview-12-2025',
  'gemini-2.5-flash-live',
];

const WS_BASE = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const SETUP_TIMEOUT_MS = 9000;

const decoder = new TextDecoder();

async function frameText(data) {
  if (typeof data === 'string') return data;
  if (data instanceof ArrayBuffer) return decoder.decode(data);
  if (ArrayBuffer.isView(data)) return decoder.decode(data);
  if (data && typeof data.text === 'function') return data.text(); // Blob
  return String(data);
}

/** Why a connection closed, without ever echoing the key. */
export function closeReason(ev) {
  const reason = typeof ev?.reason === 'string' ? ev.reason : '';
  if (/api key|API_KEY|permission|unauthori[sz]ed|PERMISSION_DENIED/i.test(reason)) return 'badKey';
  if (/quota|exhaust|rate.?limit|too many/i.test(reason)) return 'rateLimited';
  if (/not found|not supported|unsupported|invalid model/i.test(reason)) return 'modelNotFound';
  if (ev?.code === 1008) return 'badKey';
  return reason ? 'closed' : 'network';
}

/**
 * One open Live connection. Events are delivered to `handlers`:
 *   onAudio(base64Pcm24k), onInputText(text), onOutputText(text), onToolCall(calls[]),
 *   onTurnComplete(), onInterrupted(), onGenerationComplete(), onGoAway(timeLeft), onClose(reason, ev)
 */
export class LiveSession {
  constructor(ws, model, handlers) {
    this.ws = ws;
    this.model = model;
    this.handlers = handlers;
    this.open = true;
  }

  send(obj) {
    if (!this.open || this.ws.readyState !== 1) return false;
    this.ws.send(JSON.stringify(obj));
    return true;
  }

  /** 16-bit mono PCM @16 kHz, base64. */
  sendAudio(base64) {
    return this.send({ realtimeInput: { audio: { data: base64, mimeType: 'audio/pcm;rate=16000' } } });
  }

  /** Tell the server the mic paused (flushes automatic activity detection). */
  sendAudioStreamEnd() {
    return this.send({ realtimeInput: { audioStreamEnd: true } });
  }

  /** Append text to the conversation. turnComplete:true asks the model to respond now. */
  sendText(text, turnComplete = false, role = 'user') {
    return this.send({ clientContent: { turns: [{ role, parts: [{ text }] }], turnComplete } });
  }

  sendToolResponse(functionResponses) {
    return this.send({ toolResponse: { functionResponses } });
  }

  close() {
    this.open = false;
    try { this.ws.close(1000, 'bye'); } catch { /* already closed */ }
  }

  async _dispatch(raw) {
    let msg;
    try { msg = JSON.parse(await frameText(raw)); } catch { return; }
    const h = this.handlers;
    const sc = msg.serverContent;
    if (sc) {
      for (const part of sc.modelTurn?.parts || []) {
        if (part.inlineData?.data) h.onAudio?.(part.inlineData.data, part.inlineData.mimeType);
        if (part.text) h.onModelText?.(part.text);
      }
      if (sc.inputTranscription?.text) h.onInputText?.(sc.inputTranscription.text);
      if (sc.outputTranscription?.text) h.onOutputText?.(sc.outputTranscription.text);
      if (sc.interrupted) h.onInterrupted?.();
      if (sc.generationComplete) h.onGenerationComplete?.();
      if (sc.turnComplete) h.onTurnComplete?.();
    }
    if (msg.toolCall?.functionCalls?.length) h.onToolCall?.(msg.toolCall.functionCalls);
    if (msg.toolCallCancellation) h.onToolCancel?.(msg.toolCallCancellation.ids || []);
    if (msg.goAway) h.onGoAway?.(msg.goAway.timeLeft);
    if (msg.sessionResumptionUpdate?.resumable && msg.sessionResumptionUpdate.newHandle) h.onResumption?.(msg.sessionResumptionUpdate.newHandle);
    if (msg.usageMetadata) h.onUsage?.(msg.usageMetadata);
  }
}

/** Open one model; resolves after setupComplete, rejects with { reason } otherwise. */
function openModel({ apiKey, model, setup, handlers, WebSocketImpl }) {
  return new Promise((resolve, reject) => {
    const WS = WebSocketImpl || globalThis.WebSocket;
    if (!WS) { reject({ reason: 'noWebSocket' }); return; }
    let ws;
    try {
      ws = new WS(`${WS_BASE}?key=${encodeURIComponent(apiKey)}`);
    } catch {
      reject({ reason: 'network' });
      return;
    }
    ws.binaryType = 'arraybuffer';
    let session = null;
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch { /* ignore */ }
      reject({ reason: 'timeout' });
    }, SETUP_TIMEOUT_MS);

    ws.onopen = () => {
      const body = { ...setup, model: `models/${model}` };
      ws.send(JSON.stringify({ setup: body }));
    };
    ws.onmessage = async (ev) => {
      if (!settled) {
        let msg = null;
        try { msg = JSON.parse(await frameText(ev.data)); } catch { /* ignore */ }
        if (msg && msg.setupComplete !== undefined) {
          settled = true;
          clearTimeout(timer);
          session = new LiveSession(ws, model, handlers);
          resolve(session);
        }
        return;
      }
      session?._dispatch(ev.data);
    };
    ws.onerror = () => { /* onclose follows with the reason */ };
    ws.onclose = (ev) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject({ reason: closeReason(ev), code: ev.code });
        return;
      }
      if (session) {
        const wasOpen = session.open;
        session.open = false;
        handlers.onClose?.(wasOpen ? closeReason(ev) : 'closedByUs', ev);
      }
    };
  });
}

/**
 * Connect, trying models in order. Returns { ok:true, session } or { ok:false, reason, tried }.
 * A bad key stops at once (every model would refuse it the same way).
 */
export async function connectLive({ apiKey, setup, handlers = {}, models = LIVE_MODELS, preferred, WebSocketImpl }) {
  if (!apiKey) return { ok: false, reason: 'noKey', tried: [] };
  const order = preferred ? [preferred, ...models.filter((m) => m !== preferred)] : models;
  const tried = [];
  let last = 'modelNotFound';
  for (const model of order) {
    try {
      const session = await openModel({ apiKey, model, setup, handlers, WebSocketImpl });
      return { ok: true, session, model, tried };
    } catch (e) {
      last = e?.reason || 'network';
      tried.push(`${model}:${last}`);
      if (last === 'badKey') break;
    }
  }
  return { ok: false, reason: last, tried };
}

// ---------------------------------------------------------------- PCM helpers

/** Float32 [-1,1] → Int16 little-endian bytes. */
export function floatToPcm16(f32) {
  const out = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

export function bytesToBase64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) bin += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  return btoa(bin);
}

export function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** base64 PCM16 → Float32 samples. */
export function pcm16Base64ToFloat(b64) {
  const bytes = base64ToBytes(b64);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = bytes.byteLength >> 1;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = view.getInt16(i * 2, true) / 0x8000;
  return out;
}

/** Linear resample (good enough for speech going to an ASR front end). */
export function resample(f32, fromRate, toRate) {
  if (fromRate === toRate) return f32;
  const ratio = fromRate / toRate;
  const n = Math.floor(f32.length / ratio);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i * ratio;
    const i0 = Math.floor(x);
    const i1 = Math.min(i0 + 1, f32.length - 1);
    const t = x - i0;
    out[i] = f32[i0] * (1 - t) + f32[i1] * t;
  }
  return out;
}
