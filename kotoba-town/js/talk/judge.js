// What Gemini Live is told, and how its verdicts are read. Pure functions — no DOM, no audio.
// Also the offline judge used when there is no API key (choice / Web Speech practice mode).

export const UNIVERSAL_BRANCHES = ['repeat', 'dont_know', 'english', 'asks_npc', 'off_topic', 'unclear'];

export const JUDGE_TOOL = {
  functionDeclarations: [
    {
      name: 'judge_reply',
      description: "Evaluate the learner's last utterance against the latest [TURN] note. Call this every time the learner finishes speaking, before saying anything.",
      parameters: {
        type: 'OBJECT',
        properties: {
          heard: { type: 'STRING', description: 'What the learner actually said, written in Japanese as you heard it (kana/kanji). If they spoke another language, write it as heard. Empty if nothing intelligible.' },
          branch: { type: 'STRING', description: "Id of the branch in the latest [TURN] note whose meaning matches the learner's answer. If none fits: repeat (asked to hear it again), dont_know (said they don't understand / asked for help), english (answered mainly in a language other than Japanese), asks_npc (asked you a question or commented instead of answering), off_topic (Japanese but unrelated to the task), unclear (silence, noise, unintelligible). In free talk use free." },
          score: { type: 'INTEGER', description: '0 = no usable answer; 1 = understandable but with clear mistakes or very incomplete; 2 = correct with small slips; 3 = natural and uses the target grammar correctly.' },
          grammar_used: { type: 'STRING', description: 'Comma-separated ids of the target grammar points (like g1,g2) the learner used correctly. Empty if none.' },
          correction: { type: 'STRING', description: 'A natural, correct version of what the learner meant, polite です/ます style at their level, in Japanese. If it was already correct, repeat it.' },
          tip_en: { type: 'STRING', description: 'One short, kind English tip (max 20 words): the single most useful fix, or specific praise if it was good.' },
        },
        required: ['heard', 'branch', 'score', 'correction', 'tip_en'],
      },
    },
    {
      name: 'final_report',
      description: 'Summarize how the learner did in this whole conversation. Call once when a note starts with [END].',
      parameters: {
        type: 'OBJECT',
        properties: {
          stars: { type: 'INTEGER', description: '1 = needs more practice, 2 = good, 3 = excellent.' },
          summary_en: { type: 'STRING', description: '2–3 sentences of encouraging overall feedback in English.' },
          strengths_en: { type: 'STRING', description: 'What they did well (1–2 short sentences).' },
          improve_en: { type: 'STRING', description: 'What to practise next (1–2 short sentences, name the grammar or words).' },
          pronunciation_en: { type: 'STRING', description: 'One short note on pronunciation and fluency, or empty.' },
        },
        required: ['stars', 'summary_en', 'strengths_en', 'improve_en'],
      },
    },
  ],
};

/** System instruction for the main character of a variant. */
/** Who the learner is and what they can handle — differs per course. */
export function learnerLevel(lesson) {
  if (lesson.course === 'it') {
    return `The learner is a junior engineer from abroad who works at みどりデザイン (a small web/app company in the town) and practises business Japanese for IT work (${lesson.levelEn || 'around JLPT N4–N3'}). This is episode ${lesson.unit} of the story 「${lesson.storyJa}」 (${lesson.storyEn}): ${lesson.titleEn} — ${lesson.summaryEn}${lesson.previouslyEn ? ` Story so far: ${lesson.previouslyEn}` : ''} Judge the business message too (conclusion first, clear facts, polite set phrases), not only grammar.`;
  }
  return `The learner is a beginner who has studied up to lesson ${lesson.lesson} of Minna no Nihongo I. Lesson theme: ${lesson.titleEn} — ${lesson.summaryEn}`;
}

export function systemInstruction({ lesson, variant, character, learnerName }) {
  const lv = lesson.course === 'it' ? 'N4–N3 business' : `lesson-${lesson.lesson}`;
  return [
    `You are ${character.nameJa}（${character.kana}）, ${character.roleEn}. Persona (Japanese): ${character.personaJa}`,
    `This is "Kotoba Town", a Japanese speaking-practice game set in a small Japanese town. ${learnerLevel(lesson)}`,
    `Scene: ${variant.briefEn} The learner's role: ${variant.roleEn}${learnerName ? ` The learner's name is ${learnerName}.` : ''}`,
    'How this session works:',
    '- The app plays your scripted lines from recordings and moves the story forward. You never start a topic, never ask the next scripted question, and never speak first.',
    '- Before each learner turn the app sends a note that starts with [TURN]. It says what you just said, what the learner should do, the target grammar and the branch options.',
    '- Each time the learner finishes speaking, IMMEDIATELY call `judge_reply` (no speech before it). Judge meaning first, then grammar. Be fair to beginners: accept simple but correct answers; a foreign accent is fine. Never invent words the learner did not say.',
    `- After the function result, obey its "say" field: "nothing" = say nothing at all. "react" = reply in character with ONE short polite sentence (です/ます, ${lv} level, max 15 words) that answers what the learner said or asked; do not ask a new question. "chat" = reply in character with 1–2 short sentences at the learner's level, then ask one simple question back.`,
    '- Speak only Japanese, slowly and clearly, as you would to a beginner. Never speak English.',
    '- When a note starts with [END], call `final_report` once, then say nothing.',
  ].join('\n');
}

const quote = (s) => `「${s}」`;

/** The [TURN] note sent before the learner answers a scripted node. */
export function turnNote({ k, character, npcLines, listen, grammar }) {
  const g = (listen.grammar || []).map((id) => grammar.find((x) => x.id === id)).filter(Boolean);
  const lines = [
    `[TURN ${k}] Mode: script.`,
    npcLines.length
      ? `Just said: ${npcLines.map((l) => `${l.name && l.name !== character.nameJa ? `${l.name}` : `You (${character.nameJa})`}: ${quote(l.ja)} (${l.en})`).join(' ')}`
      : 'Nobody spoke just before this turn; the learner starts.',
    `The learner should: ${listen.promptEn}`,
    g.length ? `Target grammar: ${g.map((x) => `${x.id} ${quote(x.pattern)} = ${x.meaningEn}`).join('; ')}` : '',
    listen.modelAnswers?.length ? `Good answers look like: ${listen.modelAnswers.map(quote).join(' / ')}` : '',
    'Branches (choose by meaning):',
    ...listen.branches.map((b) => `- ${b.id}: ${b.whenEn}${b.exampleJa ? ` e.g. ${quote(b.exampleJa)}` : ''}`),
    `If no branch fits, use one of: ${UNIVERSAL_BRANCHES.join(', ')}.`,
  ];
  return lines.filter(Boolean).join('\n');
}

/** The [TURN] note for open conversation after the script. */
export function freeTalkNote({ k, character, freeTalk, lessonNo, course }) {
  return [
    `[TURN ${k}] Mode: free talk.`,
    `Topic: ${freeTalk.topicEn}`,
    course === 'it' ? `Chat naturally as ${character.nameJa}, in clear polite business Japanese for a junior engineer.` : `Chat naturally as ${character.nameJa}, using only grammar up to lesson ${lessonNo}.`,
    'For any Japanese answer use branch "free" (or english / unclear / repeat / dont_know). Score it as usual.',
  ].join('\n');
}

export function endNote({ turns }) {
  const recap = turns.map((t, i) => `${i + 1}. task: ${t.promptEn} | heard: ${quote(t.heard || '')} | score ${t.score}`).join('\n');
  return `[END] The conversation is over. Recap of the learner's turns:\n${recap}\nCall final_report now.`;
}

const clampInt = (v, lo, hi, d) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
};

/** Normalise judge_reply args. */
export function readJudge(args, validBranches) {
  const branch = String(args?.branch || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  const ok = validBranches.includes(branch) || UNIVERSAL_BRANCHES.includes(branch) || branch === 'free';
  return {
    heard: String(args?.heard || '').trim(),
    branch: ok ? branch : 'unclear',
    score: clampInt(args?.score, 0, 3, 1),
    grammarUsed: String(args?.grammar_used || '').split(/[,\s]+/).filter((x) => /^g\d+$/.test(x)),
    correction: String(args?.correction || '').trim(),
    tipEn: String(args?.tip_en || '').trim(),
    source: 'live',
  };
}

export function readReport(args) {
  return {
    stars: clampInt(args?.stars, 1, 3, 2),
    summaryEn: String(args?.summary_en || '').trim(),
    strengthsEn: String(args?.strengths_en || '').trim(),
    improveEn: String(args?.improve_en || '').trim(),
    pronunciationEn: String(args?.pronunciation_en || '').trim(),
    source: 'live',
  };
}

// ------------------------------------------------------------ offline judge

export function normalizeJa(text) {
  return String(text || '')
    .normalize('NFKC')
    .replace(/[\s。、．，！？!?「」『』（）()・…〜~]/g, '')
    .replace(/[ァ-ン]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .toLowerCase();
}

function lcs(a, b) {
  const row = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let prev = 0;
    for (let j = 1; j <= b.length; j++) {
      const keep = row[j];
      row[j] = a[i - 1] === b[j - 1] ? prev + 1 : Math.max(row[j], row[j - 1]);
      prev = keep;
    }
  }
  return row[b.length];
}

export function similarity(a, b) {
  const x = normalizeJa(a);
  const y = normalizeJa(b);
  if (!x || !y) return 0;
  return lcs(x, y) / Math.max(x.length, y.length);
}

const ASK_AGAIN = /もう(いちど|一度)|もういっかい|ワンモア|once more|again|repeat/i;
const DONT_KNOW = /わかりません|分かりません|しりません|知りません|don'?t know|help/i;

/** Best-effort judge without Gemini (exact choice → that branch; free text → nearest example). */
export function offlineJudge(text, listen) {
  const said = String(text || '').trim();
  const base = { heard: said, score: 2, grammarUsed: listen.grammar || [], correction: said, tipEn: '', source: 'offline' };
  if (!said) return { ...base, branch: 'unclear', score: 0 };
  const tight = said.replace(/\s+/g, '');
  if (ASK_AGAIN.test(tight)) return { ...base, branch: 'repeat' };
  if (DONT_KNOW.test(tight)) return { ...base, branch: 'dont_know', score: 0 };
  if (/^[\x00-\x7f]+$/.test(said)) return { ...base, branch: 'english', score: 0 };
  let best = { id: 'unclear', sim: 0, ex: '' };
  for (const b of listen.branches) {
    for (const ex of [b.exampleJa, ...(b === listen.branches[0] ? listen.modelAnswers || [] : [])]) {
      if (!ex) continue;
      const sim = similarity(said, ex);
      if (sim > best.sim) best = { id: b.id, sim, ex };
    }
  }
  if (best.sim < 0.4) return { ...base, branch: 'off_topic', score: 1, tipEn: 'Try one of the suggested answers.' };
  return { ...base, branch: best.id, score: best.sim > 0.85 ? 3 : best.sim > 0.6 ? 2 : 1, correction: best.sim > 0.85 ? said : best.ex };
}

/** Report computed locally (no key, or Live did not answer). */
export function offlineReport(turns) {
  const scored = turns.filter((t) => typeof t.score === 'number');
  const avg = scored.length ? scored.reduce((s, t) => s + t.score, 0) / scored.length : 0;
  const stars = avg >= 2.4 ? 3 : avg >= 1.5 ? 2 : 1;
  const weak = scored.filter((t) => t.score <= 1).map((t) => t.promptEn);
  return {
    stars,
    summaryEn: stars === 3 ? 'Great conversation — you answered clearly and naturally!' : stars === 2 ? 'Nice work — you got your meaning across in most turns.' : 'Good start! Listen to the model answers and try again.',
    strengthsEn: scored.filter((t) => t.score >= 2).length ? `You answered ${scored.filter((t) => t.score >= 2).length} of ${scored.length} turns well.` : 'You kept going until the end.',
    improveEn: weak.length ? `Practise: ${weak.slice(0, 2).join('; ')}.` : 'Try the other variants of this lesson.',
    pronunciationEn: '',
    source: 'offline',
  };
}
