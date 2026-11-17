// The interviewer's final evaluation, written by a Gemini model that thinks before it answers.
// The conversation itself runs on Gemini Live (fast turn-taking); when the interview is over, the whole
// transcript goes to a reasoning model through the ordinary generateContent API, which returns the
// evaluation as JSON (verdict, a 1–5 score per criterion, what to improve, a better answer).
// Gemini Live's own Extended Thinking model cannot return structured results yet (its function calls fail
// and it only speaks), so this is the reliable way to get a considered evaluation.
// Browser-safe: plain fetch with the learner's own key (BYOK). No DOM.
import { RUBRIC_INFO, VERDICTS } from './judge.js';

const API = 'https://generativelanguage.googleapis.com/v1beta';
let modelCache = null;

/** Prefer the strongest general model that can think: newest "pro", then newest "flash". */
export function pickReviewModels(names) {
  const ok = names
    .map((n) => n.replace(/^models\//, ''))
    .filter((n) => /^gemini-\d/.test(n) && !/live|tts|image|embed|audio|vision|exp-\d|customtools|robotics|computer|nano|aqa/i.test(n));
  const ver = (n) => Number((n.match(/^gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);
  const rank = (n) => (/-pro/.test(n) ? 3 : /-flash(?!-lite)/.test(n) ? 2 : /lite/.test(n) ? 1 : 0);
  const stable = (n) => (/preview|latest/.test(n) ? 0 : 1);
  return ok.sort((a, b) => rank(b) - rank(a) || ver(b) - ver(a) || stable(b) - stable(a)).slice(0, 4);
}

async function listModels(apiKey, fetchImpl) {
  if (modelCache) return modelCache;
  const r = await fetchImpl(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': apiKey } });
  if (!r.ok) throw new Error(`models ${r.status}`);
  const j = await r.json();
  const names = (j.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => m.name);
  modelCache = pickReviewModels(names);
  return modelCache;
}

const SCHEMA = (rubric) => ({
  type: 'OBJECT',
  properties: {
    verdict: { type: 'STRING', enum: Object.keys(VERDICTS) },
    verdict_reason_en: { type: 'STRING' },
    criteria_scores: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { id: { type: 'STRING', enum: rubric }, score: { type: 'INTEGER' }, comment_en: { type: 'STRING' } }, required: ['id', 'score', 'comment_en'] },
    },
    top_improvements_en: { type: 'ARRAY', items: { type: 'STRING' } },
    rewrite_question_ja: { type: 'STRING' },
    rewrite_answer_ja: { type: 'STRING' },
    summary_en: { type: 'STRING' },
    strengths_en: { type: 'STRING' },
    stars: { type: 'INTEGER' },
  },
  required: ['verdict', 'verdict_reason_en', 'criteria_scores', 'top_improvements_en', 'rewrite_question_ja', 'rewrite_answer_ja', 'summary_en', 'strengths_en', 'stars'],
});

/** The prompt: who is interviewing whom, the rubric, and every question with the candidate's answer. */
export function reviewPrompt({ lesson, variant, turns }) {
  const rubric = (lesson.rubric || Object.keys(RUBRIC_INFO)).filter((id) => RUBRIC_INFO[id]);
  const qa = turns
    .filter((t) => t.questionJa !== undefined)
    .map((t, i) => [
      `Q${i + 1} (${(t.criteria || []).join(', ') || 'manners'}): ${t.questionJa || t.promptEn}`,
      `  Task for the candidate: ${t.promptEn}`,
      t.lookForEn ? `  Interviewers listen for: ${t.lookForEn}` : '',
      `  Candidate said: 「${t.heard || '(nothing)'}」`,
      `  Per-answer judge: score ${t.score}/3${t.criteriaMissed?.length ? `, to improve: ${t.criteriaMissed.join(', ')}` : ''}`,
    ].filter(Boolean).join('\n'))
    .join('\n');
  return {
    system: [
      'You are an experienced Japanese interviewer who also coaches foreign junior engineers (JLPT N4–N3).',
      'Evaluate the whole job interview below honestly, as a real interviewer in Japan would, then coach the candidate.',
      'Be specific: quote or refer to their actual answers. Be kind but direct — if an answer would hurt in a real interview, say so.',
      `Rubric (score each 1–5):\n${rubric.map((id) => `- ${id} (${RUBRIC_INFO[id].ja}): ${RUBRIC_INFO[id].descEn}`).join('\n')}`,
      'verdict: pass = would likely go to the next round; borderline = could go either way; not_yet = would likely not pass yet.',
      'top_improvements_en: the 2–3 changes that would raise the result most, most important first, each concrete (English, 1 sentence each).',
      "rewrite: pick the question whose answer most needs work and write a better answer in Japanese from the candidate's own facts (3–4 short sentences, polite interview Japanese at N4–N3, 御社 when speaking).",
      'summary_en and strengths_en: 1–2 sentences each. stars: 1–3 overall.',
    ].join('\n'),
    user: [
      `Interview: ${lesson.titleJa} / ${variant.titleJa} (${variant.titleEn}).`,
      `Situation: ${variant.briefEn}`,
      `Candidate's role: ${variant.roleEn}`,
      '',
      qa,
    ].join('\n'),
    rubric,
  };
}

function normalize(j, rubric) {
  const clamp = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
  const verdict = VERDICTS[j.verdict] ? j.verdict : 'borderline';
  const seen = new Map();
  for (const c of Array.isArray(j.criteria_scores) ? j.criteria_scores : []) {
    const id = String(c?.id || '').toLowerCase();
    if (rubric.includes(id) && !seen.has(id)) seen.set(id, { id, score: clamp(c.score, 1, 5, 3), commentEn: String(c.comment_en || '').trim() });
  }
  return {
    interview: true,
    verdict,
    verdictReasonEn: String(j.verdict_reason_en || '').trim(),
    criteria: rubric.filter((id) => seen.has(id)).map((id) => seen.get(id)),
    improvements: (Array.isArray(j.top_improvements_en) ? j.top_improvements_en : []).map((x) => String(x).trim()).filter(Boolean).slice(0, 3),
    rewrite: j.rewrite_answer_ja ? { questionJa: String(j.rewrite_question_ja || '').trim(), answerJa: String(j.rewrite_answer_ja).trim() } : null,
    summaryEn: String(j.summary_en || '').trim(),
    strengthsEn: String(j.strengths_en || '').trim(),
    improveEn: '',
    pronunciationEn: '',
    stars: clamp(j.stars, 1, 3, 2),
    source: 'live',
  };
}

/**
 * Ask a reasoning model for the interview evaluation. Resolves with a report object (same shape as
 * readReport's interview part) or null if no model could answer in time.
 */
export async function reviewInterview({ apiKey, lesson, variant, turns, level = 'HIGH', timeoutMs = 60000, fetchImpl = globalThis.fetch?.bind(globalThis), log = () => {} }) {
  if (!apiKey || !fetchImpl) return null;
  const { system, user, rubric } = reviewPrompt({ lesson, variant, turns });
  const deadline = Date.now() + timeoutMs;
  let models = [];
  try { models = await listModels(apiKey, fetchImpl); } catch (e) { log(`review: models ${e.message}`); }
  if (!models.length) models = ['gemini-2.5-pro', 'gemini-2.5-flash'];
  for (const model of models) {
    for (const thinking of [true, false]) {
      if (Date.now() > deadline - 3000) return null;
      const generationConfig = { responseMimeType: 'application/json', responseSchema: SCHEMA(rubric), temperature: 0.4 };
      if (thinking) generationConfig.thinkingConfig = /^gemini-2\./.test(model) ? { thinkingBudget: -1 } : { thinkingLevel: level };
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = setTimeout(() => ctrl?.abort(), Math.max(1000, deadline - Date.now()));
      const t0 = Date.now();
      try {
        const r = await fetchImpl(`${API}/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig }),
          signal: ctrl?.signal,
        });
        clearTimeout(timer);
        if (!r.ok) {
          const msg = (await r.text().catch(() => '')).slice(0, 200);
          log(`review: ${model}${thinking ? ' (thinking)' : ''} → ${r.status} ${msg}`);
          if (r.status === 400 && thinking) continue; // this model does not take the thinking setting: try without
          break; // next model
        }
        const j = await r.json();
        const text = (j.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
        const report = normalize(JSON.parse(text), rubric);
        report.model = model;
        report.reviewMs = Date.now() - t0;
        log(`review: ${model}${thinking ? ` (thinking ${level})` : ''} ✓ ${report.reviewMs} ms`);
        return report;
      } catch (e) {
        clearTimeout(timer);
        log(`review: ${model} ✗ ${String(e?.message || e).slice(0, 120)}`);
        break;
      }
    }
  }
  return null;
}
