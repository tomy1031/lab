// companion/memory.js — the companion's memory: a compressed long-term summary, a list of key facts, the
// relationship values and the recent raw log (conversation lines + things that happened).
//
// When the raw log grows past a limit (or at night when you sleep), it is compressed: a short-lived Gemini
// Live session reads the old summary + facts + the raw log as TEXT and answers with a `save_memory` tool
// call (text → text extraction). Live models speak audio, so the tool call is how we get clean text back;
// the audio is never played. Without a key (or if Live fails) a local fallback keeps the most important
// lines so the memory still stays small.
import { connectLive } from './live.js';

const LIMIT_CHARS = 5200;     // raw log size that triggers a compression
const KEEP_RECENT = 12;       // raw lines kept after compressing (continuity)
const MAX_FACTS = 32;
const MAX_SUMMARY = 1600;

const IMPORTANT = /(約束|好き|嫌い|名前|家族|夢|怖|ありがとう|ごめん|けが|ケガ|病気|助け|死|救助|船|火|誕生|秘密|大事|嬉し|悲し|怒|promise|love|hate|name)/;

export class CompanionMemory {
  constructor(key, companionName = '仲間') {
    this.key = key;
    this.name = companionName;
    this.data = { summary: '', facts: [], relation: { trust: 50, affection: 50 }, recent: [], compressions: 0, lastCompressDay: 0, playerName: '' };
    this.busy = false;
    this.log = [];
    this.load();
  }

  load() {
    try { const raw = localStorage.getItem(this.key); if (raw) Object.assign(this.data, JSON.parse(raw)); } catch { /* ignore */ }
  }
  save() {
    try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch { /* ignore */ }
  }
  reset() { this.data = { summary: '', facts: [], relation: { trust: 50, affection: 50 }, recent: [], compressions: 0, lastCompressDay: 0, playerName: '' }; this.save(); }

  /** who: 'player' | 'companion' | 'event'; when: { day, hour } */
  add(who, text, when = {}) {
    text = String(text || '').trim();
    if (!text) return;
    const last = this.data.recent[this.data.recent.length - 1];
    // merge streaming fragments from the same speaker
    if (last && last.who === who && who !== 'event' && last.open) { last.text += text; return; }
    this.data.recent.push({ who, text, day: when.day ?? 0, hour: when.hour ?? 0, open: who !== 'event' });
    if (this.data.recent.length % 8 === 0) this.save();
  }
  /** close the current streaming line of a speaker (turn complete) */
  closeTurn() { for (const r of this.data.recent) r.open = false; this.save(); }

  addFact(text, day = 0, weight = 1) {
    text = String(text || '').trim();
    if (!text) return;
    if (this.data.facts.some((f) => f.text === text)) return;
    this.data.facts.push({ text, day, weight });
    this.trimFacts();
    this.save();
  }
  trimFacts() {
    const f = this.data.facts;
    if (f.length > MAX_FACTS) { f.sort((a, b) => (b.weight - a.weight) || (b.day - a.day)); f.length = MAX_FACTS; }
  }

  adjust(trust = 0, affection = 0) {
    const r = this.data.relation;
    r.trust = Math.max(0, Math.min(100, r.trust + trust));
    r.affection = Math.max(0, Math.min(100, r.affection + affection));
  }

  recentChars() { return this.data.recent.reduce((s, r) => s + r.text.length + 8, 0); }
  needsCompression() { return this.recentChars() > LIMIT_CHARS || this.data.recent.length > 160; }

  /** the memory as text for the companion's instructions */
  contextText(maxRecent = 24) {
    const d = this.data;
    const out = [];
    if (d.playerName) out.push(`相手（プレイヤー）の名前：${d.playerName}`);
    if (d.summary) out.push(`【これまでの記憶（要約）】\n${d.summary}`);
    if (d.facts.length) out.push(`【覚えている大事なこと】\n${d.facts.map((f) => `- (${f.day}日目) ${f.text}`).join('\n')}`);
    out.push(`【関係】信頼 ${Math.round(d.relation.trust)}/100・親しみ ${Math.round(d.relation.affection)}/100`);
    const rec = d.recent.slice(-maxRecent);
    if (rec.length) out.push(`【最近のできごとと会話】\n${rec.map((r) => `${r.day}日目${r.hour}時 ${r.who === 'player' ? 'あなた' : r.who === 'companion' ? this.name : '＊'}：${r.text}`).join('\n')}`);
    return out.join('\n\n');
  }

  rawLogText(lines = this.data.recent) {
    return lines.map((r) => `${r.day}日目${r.hour}時 ${r.who === 'player' ? 'プレイヤー' : r.who === 'companion' ? this.name : 'できごと'}：${r.text}`).join('\n');
  }

  /**
   * Compress the raw log. With an API key: Gemini Live text→text extraction via a tool call.
   * Returns { ok, how: 'live' | 'local', reason? }.
   */
  async compress({ apiKey, day = 0, persona = '', timeoutMs = 25000 } = {}) {
    if (this.busy || this.data.recent.length < 4) return { ok: false, reason: 'nothing' };
    this.busy = true;
    const cut = Math.max(0, this.data.recent.length - KEEP_RECENT);
    const toFold = this.data.recent.slice(0, cut);
    try {
      if (apiKey) {
        const res = await this.compressLive(apiKey, toFold, persona, timeoutMs).catch((e) => ({ ok: false, reason: e?.message || String(e) }));
        if (res.ok) {
          this.apply(res.out, day, cut);
          return { ok: true, how: 'live' };
        }
        this.log.push(`live compression failed: ${res.reason}`);
      }
      this.compressLocal(toFold, day, cut);
      return { ok: true, how: 'local' };
    } finally {
      this.busy = false;
      this.save();
    }
  }

  apply(out, day, cut) {
    const d = this.data;
    if (out.summary) d.summary = String(out.summary).slice(0, MAX_SUMMARY);
    if (Array.isArray(out.facts)) {
      const keep = d.facts.filter((f) => f.weight >= 3); // pinned facts survive
      d.facts = [...keep];
      for (const f of out.facts) {
        const text = typeof f === 'string' ? f : f?.text;
        const w = typeof f === 'object' && f?.importance ? Number(f.importance) : 1;
        if (text && !d.facts.some((x) => x.text === text)) d.facts.push({ text: String(text).slice(0, 140), day, weight: Math.max(1, Math.min(3, w)) });
      }
      this.trimFacts();
    }
    if (out.player_name) d.playerName = String(out.player_name).slice(0, 30);
    if (typeof out.trust_delta === 'number' || typeof out.affection_delta === 'number') this.adjust(clampDelta(out.trust_delta), clampDelta(out.affection_delta));
    d.recent = d.recent.slice(cut);
    d.compressions++;
    d.lastCompressDay = day;
  }

  compressLocal(lines, day, cut) {
    const d = this.data;
    const keep = lines.filter((r) => r.who === 'event' ? IMPORTANT.test(r.text) || /日目|救助|嵐|病気|完成|作った/.test(r.text) : IMPORTANT.test(r.text));
    const add = keep.slice(-14).map((r) => `${r.day}日目：${r.who === 'player' ? 'プレイヤー「' + r.text.slice(0, 50) + '」' : r.who === 'companion' ? '自分「' + r.text.slice(0, 50) + '」' : r.text.slice(0, 60)}`).join(' / ');
    d.summary = `${d.summary}${d.summary ? ' / ' : ''}${add}`.slice(-MAX_SUMMARY);
    d.recent = d.recent.slice(cut);
    d.compressions++;
    d.lastCompressDay = day;
  }

  compressLive(apiKey, lines, persona, timeoutMs) {
    return new Promise((resolve) => {
      let session = null, done = false, outText = '';
      const finish = (r) => { if (done) return; done = true; clearTimeout(timer); try { session?.close(); } catch { /* ignore */ } resolve(r); };
      const timer = setTimeout(() => finish(outText.length > 40 ? { ok: true, out: { summary: outText } } : { ok: false, reason: 'timeout' }), timeoutMs);
      const tool = {
        functionDeclarations: [{
          name: 'save_memory',
          description: 'Save the compressed long-term memory of the companion. Call exactly once.',
          parameters: {
            type: 'OBJECT',
            properties: {
              summary: { type: 'STRING', description: 'Updated long-term memory in Japanese, first person from the companion, at most 900 characters. Merge the old summary with the new log; keep what matters for the relationship and survival (promises, feelings, injuries, discoveries, shelter/base, failures, jokes worth remembering). Drop small talk.' },
              facts: { type: 'ARRAY', description: 'Up to 20 short key facts in Japanese (one line each).', items: { type: 'OBJECT', properties: { text: { type: 'STRING' }, importance: { type: 'INTEGER', description: '1 normal, 2 important, 3 never forget' } }, required: ['text'] } },
              player_name: { type: 'STRING', description: 'The player\'s name if it is known, else empty.' },
              trust_delta: { type: 'NUMBER', description: 'Change of trust toward the player caused by this log, −10…10.' },
              affection_delta: { type: 'NUMBER', description: 'Change of affection toward the player caused by this log, −10…10.' },
            },
            required: ['summary', 'facts'],
          },
        }],
      };
      const setup = {
        generationConfig: { responseModalities: ['AUDIO'], temperature: 0.3 },
        systemInstruction: { parts: [{ text: `You are a memory compressor for a game character. ${persona}\nYou never chat. When you receive the material, immediately call save_memory with the compressed memory (Japanese). Do not speak.` }] },
        tools: [tool],
        outputAudioTranscription: {},
      };
      const prompt = `【古い要約】\n${this.data.summary || '（なし）'}\n\n【覚えている事実】\n${this.data.facts.map((f) => `- ${f.text} (重要度${f.weight})`).join('\n') || '（なし）'}\n\n【新しいログ】\n${this.rawLogText(lines)}\n\n上の材料をまとめて save_memory を1回だけ呼んでください。`;
      connectLive({
        apiKey, setup,
        handlers: {
          onToolCall: (calls) => {
            const c = calls.find((x) => x.name === 'save_memory');
            if (c) {
              try { session?.sendToolResponse([{ id: c.id, name: c.name, response: { result: 'saved' } }]); } catch { /* ignore */ }
              finish({ ok: true, out: c.args || {} });
            }
          },
          onOutputText: (t) => { outText += t; },
          onClose: (reason) => finish({ ok: false, reason }),
        },
      }).then((res) => {
        if (!res.ok) { finish({ ok: false, reason: res.reason }); return; }
        session = res.session;
        if (done) { session.close(); return; }
        session.sendText(prompt, true);
      });
    });
  }
}

function clampDelta(v) { return typeof v === 'number' && isFinite(v) ? Math.max(-10, Math.min(10, v)) : 0; }
