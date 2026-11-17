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
          branch: { type: 'STRING', description: "Id of the branch in the latest [TURN] note whose meaning matches the learner's answer. If none fits: repeat (asked to hear it again), dont_know (said they don't understand / asked for help), english (clearly answered in English or another language — NOT accented Japanese, which is still Japanese), asks_npc (asked you a question or commented instead of answering), off_topic (Japanese but unrelated to the task), unclear (silence, noise, unintelligible). In free talk use free." },
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

// ------------------------------------------------------------ interviews
/** What a Japanese interviewer looks at (ITビジネス編 Story C). Ids are used in the episode data. */
export const RUBRIC_INFO = {
  manners: { ja: '入退室・あいさつ', en: 'Entering & greeting', descEn: 'Says 失礼します when entering, sitting and leaving; gives their name with 申します; thanks at the end (本日は ありがとう ございました).' },
  conclusion: { ja: '結論から 話す', en: 'Answer first', descEn: 'Starts with the direct answer to the question, then the reason.' },
  specific: { ja: '具体的に 話す', en: 'Concrete', descEn: 'Gives a real experience, numbers or an example (what they did and the result), not only general words.' },
  company: { ja: '会社と 結びつける', en: 'Fits the company', descEn: 'Connects the answer to this company and this job: why here, what they can do here.' },
  keigo: { ja: '面接の ことばづかい', en: 'Interview language', descEn: 'Polite です・ます, 申します, 御社 when speaking (貴社 is for writing), no casual forms.' },
  length: { ja: '長さ・わかりやすさ', en: 'Length & clarity', descEn: 'About 20–60 seconds in a clear order (結論 → 理由・例 → ひとこと); not one word, not rambling.' },
  attitude: { ja: '前向きな 姿勢', en: 'Positive attitude', descEn: 'Motivated, positive wording; turns a weakness into what they are doing about it.' },
  composure: { ja: '落ち着き', en: 'Composure', descEn: 'Under pressure stays calm and polite: accepts the point, restates with evidence, does not argue, over-apologise or go silent.' },
};
export const VERDICTS = {
  pass: { ja: 'つぎに すすめそう', en: 'Likely to pass this round', color: '#4caf7d' },
  borderline: { ja: 'もう 一歩', en: 'Could go either way', color: '#f0a43a' },
  not_yet: { ja: 'まだ きびしい', en: 'Not yet', color: '#e0705c' },
};

/**
 * The function declarations for a session. Interviews add an interviewer's evaluation to each verdict and
 * to the final report. Live models that think in the background only take non-blocking functions.
 */
export function judgeTool({ interview = false, nonBlocking = false } = {}) {
  const decl = JSON.parse(JSON.stringify(JUDGE_TOOL.functionDeclarations));
  if (interview) {
    Object.assign(decl[0].parameters.properties, {
      criteria_met: { type: 'STRING', description: "Comma-separated ids of this question's interview criteria (see the [TURN] note) that the answer met well. Empty if none." },
      criteria_missed: { type: 'STRING', description: "Comma-separated ids of this question's interview criteria that the answer should improve. Empty if none." },
      improve_en: { type: 'STRING', description: 'As the interviewer: the single most useful, concrete improvement for this answer in a real interview (English, max 25 words). Honest and kind. If it was already strong, say what made it strong.' },
      better_answer: { type: 'STRING', description: "A better version of THIS learner's answer for a real interview, in Japanese, 2–3 short sentences at their level, keeping their own facts (do not invent big new facts)." },
    });
    decl[0].parameters.required.push('improve_en', 'better_answer');
    Object.assign(decl[1].parameters.properties, {
      verdict: { type: 'STRING', enum: ['pass', 'borderline', 'not_yet'], description: 'Honest result if this were a real interview: pass = would likely go to the next round; borderline = could go either way; not_yet = would likely not pass yet.' },
      verdict_reason_en: { type: 'STRING', description: 'Why (1–2 sentences, English), naming the decisive answers.' },
      criteria_scores: {
        type: 'ARRAY',
        description: 'One entry for every criterion in the rubric of this interview.',
        items: { type: 'OBJECT', properties: { id: { type: 'STRING' }, score: { type: 'INTEGER', description: '1 (poor) … 5 (excellent)' }, comment_en: { type: 'STRING', description: 'One short sentence with a concrete example from their answers.' } }, required: ['id', 'score'] },
      },
      top_improvements_en: { type: 'ARRAY', items: { type: 'STRING' }, description: 'The 2–3 most important improvements, most important first, each concrete (English).' },
      rewrite_question_ja: { type: 'STRING', description: 'The interview question whose answer most needs work, in Japanese as it was asked.' },
      rewrite_answer_ja: { type: 'STRING', description: "A model answer to that question built from the learner's own facts (Japanese, 3–4 short sentences at their level)." },
    });
    decl[1].parameters.required.push('verdict', 'criteria_scores', 'top_improvements_en');
  }
  if (nonBlocking) for (const d of decl) d.behavior = 'NON_BLOCKING';
  return { functionDeclarations: decl };
}

const rubricLines = (ids) => ids.filter((id) => RUBRIC_INFO[id]).map((id) => `- ${id} (${RUBRIC_INFO[id].ja}): ${RUBRIC_INFO[id].descEn}`);

/** System instruction for the main character of a variant. */
/** Who the learner is and what they can handle — differs per course. */
export function learnerLevel(lesson) {
  if (lesson.format === 'interview') {
    return `The learner is a final-year IT student / junior engineer from abroad (${lesson.levelEn || 'around JLPT N4–N3'}) practising a JOB INTERVIEW in Japanese: 「${lesson.titleJa}」 (${lesson.titleEn}) — ${lesson.summaryEn}`;
  }
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
    '- Each time the learner finishes speaking, IMMEDIATELY call `judge_reply` (no speech before it). Judge meaning first, then grammar. Be fair to beginners: accept simple but correct answers; a foreign accent is fine.',
    '- `heard` must be exactly the words the learner said in their LAST utterance. NEVER copy or complete the example answers from the [TURN] note: they only show what a good answer could look like. If the learner repeated something unrelated, said only part of an answer, or their words do not answer the task, choose off_topic or unclear and score it honestly, even if an example would fit the question.',
    `- After the function result, obey its "say" field: "nothing" = say nothing at all. "react" = reply in character with ONE short polite sentence (です/ます, ${lv} level, max 15 words) that answers what the learner said or asked; do not ask a new question. "chat" = reply in character with 1–2 short sentences at the learner's level, then ask one simple question back.`,
    '- The learner ALWAYS speaks Japanese, with a foreign accent (often South-East Asian). Hear every utterance as Japanese: if it sounds like another language, it is accented Japanese — find the closest Japanese words and write `heard` in Japanese (kana/kanji). Choose the english branch only when they clearly said English words or sentences.',
    '- Speak only Japanese, slowly and clearly, as you would to a beginner. Never speak English.',
    '- When a note starts with [END], call `final_report` once, then say nothing.',
    ...(lesson.format === 'interview' ? [
      'This session is a JOB INTERVIEW and you are the interviewer. Judge every answer as a real Japanese interviewer would, against the interview criteria listed in each [TURN] note, and fill criteria_met, criteria_missed, improve_en and better_answer honestly: if an answer would hurt in a real interview, say so clearly (kind but direct). The score (0–3) covers both the Japanese and the quality of the answer as an interview answer.',
      'The criteria:',
      ...rubricLines(lesson.rubric || Object.keys(RUBRIC_INFO)),
      'When you are asked to react, stay in your interviewer role and persona: one short sentence. A strict interviewer may be curt and cold, but never rude, insulting or discriminatory.',
      'In final_report give a score for every rubric criterion and an honest verdict as if this were a real interview.',
    ] : []),
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
    listen.criteria?.length ? `Interview criteria for this question: ${listen.criteria.filter((id) => RUBRIC_INFO[id]).map((id) => `${id} (${RUBRIC_INFO[id].en})`).join(', ')}` : '',
    listen.lookForEn ? `Interviewers listen for: ${listen.lookForEn}` : '',
    listen.pitfallsEn ? `Typical mistakes: ${listen.pitfallsEn}` : '',
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

export function endNote({ turns, rubric = null }) {
  const recap = turns.map((t, i) => `${i + 1}. ${t.questionJa ? `question ${quote(t.questionJa)} | ` : ''}task: ${t.promptEn} | heard: ${quote(t.heard || '')} | score ${t.score}${t.criteriaMissed?.length ? ` | to improve: ${t.criteriaMissed.join(',')}` : ''}`).join('\n');
  if (rubric) {
    return `[END] The interview is over. Recap of the candidate's answers:\n${recap}\nRubric ids for criteria_scores: ${rubric.join(', ')}.\nCall final_report now, as the interviewer: an honest verdict, a 1–5 score for every rubric criterion, the 2–3 most important improvements, and a better model answer for the weakest question built from the candidate's own facts.`;
  }
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
    criteriaMet: ids(args?.criteria_met),
    criteriaMissed: ids(args?.criteria_missed),
    improveEn: String(args?.improve_en || '').trim(),
    betterAnswer: String(args?.better_answer || '').trim(),
    source: 'live',
  };
}

const ids = (v) => String(v || '').split(/[,\s]+/).map((x) => x.trim().toLowerCase()).filter((x) => RUBRIC_INFO[x]);
const list = (v) => (Array.isArray(v) ? v : typeof v === 'string' && v ? v.split(/\n+/) : []).map((x) => String(x).replace(/^[-•\d.\s]+/, '').trim()).filter(Boolean);

export function readReport(args) {
  return {
    stars: clampInt(args?.stars, 1, 3, 2),
    summaryEn: String(args?.summary_en || '').trim(),
    strengthsEn: String(args?.strengths_en || '').trim(),
    improveEn: String(args?.improve_en || '').trim(),
    pronunciationEn: String(args?.pronunciation_en || '').trim(),
    ...(args?.verdict || args?.criteria_scores ? readInterview(args) : {}),
    ...(args?.corrections || args?.next_words || args?.good_ja ? readFree(args) : {}),
    source: 'live',
  };
}

function readInterview(args) {
  const verdict = VERDICTS[String(args.verdict || '').toLowerCase()] ? String(args.verdict).toLowerCase() : 'borderline';
  const scores = (Array.isArray(args.criteria_scores) ? args.criteria_scores : [])
    .map((c) => ({ id: String(c?.id || '').trim().toLowerCase(), score: clampInt(c?.score, 1, 5, 3), commentEn: String(c?.comment_en || '').trim() }))
    .filter((c) => RUBRIC_INFO[c.id]);
  return {
    interview: true,
    verdict,
    verdictReasonEn: String(args.verdict_reason_en || '').trim(),
    criteria: [...new Map(scores.map((c) => [c.id, c])).values()],
    improvements: list(args.top_improvements_en).slice(0, 3),
    rewrite: args.rewrite_answer_ja ? { questionJa: String(args.rewrite_question_ja || '').trim(), answerJa: String(args.rewrite_answer_ja).trim() } : null,
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

/**
 * Interview evaluation computed locally (no key, or Live did not answer in time): every criterion gets the
 * scores of the questions that test it; the weakest question's typical mistake becomes the advice.
 */
export function offlineInterviewReport(turns, rubric) {
  const base = offlineReport(turns);
  const toFive = (score) => [1, 2, 4, 5][score] ?? 3;
  const criteria = rubric.map((id) => {
    const rel = turns.filter((t) => t.criteria?.includes(id));
    if (!rel.length) return { id, score: 3, commentEn: 'Not tested in this interview.' };
    const pts = rel.map((t) => (t.criteriaMet?.includes(id) ? 5 : t.criteriaMissed?.includes(id) ? 2 : toFive(t.score)));
    const avg = pts.reduce((a, b) => a + b, 0) / pts.length;
    const worst = rel.reduce((a, b) => (b.score < a.score ? b : a));
    return { id, score: Math.max(1, Math.min(5, Math.round(avg))), commentEn: avg >= 4 ? 'Solid across the questions.' : worst.pitfallsEn || 'Practise this with the model answers.' };
  });
  const scored = turns.filter((t) => typeof t.score === 'number');
  const avg = scored.length ? scored.reduce((s2, t) => s2 + t.score, 0) / scored.length : 0;
  const verdict = avg >= 2.3 ? 'pass' : avg >= 1.6 ? 'borderline' : 'not_yet';
  // the weakest answers first; on a tie, real questions before the door/greeting manners
  const mannersOnly = (t) => (t.criteria || []).every((c) => c === 'manners');
  const weakest = [...scored].sort((a, b) => a.score - b.score || mannersOnly(a) - mannersOnly(b));
  const improvements = [...new Set(weakest.filter((t) => t.score <= 2).map((t) => t.improveEn || t.pitfallsEn).filter(Boolean))].slice(0, 3);
  const w = weakest[0];
  return {
    ...base,
    interview: true,
    verdict,
    verdictReasonEn: verdict === 'pass' ? 'Most answers were clear and complete.' : verdict === 'borderline' ? 'Some answers were good, others too short or unclear.' : 'Several answers did not yet answer the question clearly.',
    criteria,
    improvements: improvements.length ? improvements : ['Answer first, then give one concrete example.'],
    rewrite: w ? { questionJa: w.questionJa || '', answerJa: w.betterAnswer || w.modelAnswer || '' } : null,
  };
}

// ------------------------------------------------------------ free-talk room
/** How the partner talks at each level of the free-talk room. */
export const FREE_LEVELS = {
  easy: {
    ja: 'やさしい', en: 'Easy · N5',
    guide: 'The learner is a beginner (around JLPT N5, Minna no Nihongo lessons 1–10). Speak slowly and very simply: short です/ます sentences, basic everyday words, one idea per sentence, no long chains, no keigo. If they struggle, ask a yes/no question or give two choices (AですかBですか).',
  },
  normal: {
    ja: 'ふつう', en: 'Normal · N4',
    guide: 'The learner is around JLPT N4 (Minna no Nihongo up to about lesson 25: て-form, ない-form, dictionary and た-forms, 〜たい, 〜たことが あります, 〜と 思います). Speak at a gentle pace in short, natural sentences.',
  },
  hard: {
    ja: 'むずかしい', en: 'Hard · N3',
    guide: 'The learner is around JLPT N3. Talk naturally at a relaxed everyday pace with opinions, reasons and common spoken expressions; still keep each turn short so they get to talk.',
  },
};

/** The free-talk room's functions: the usual verdict per utterance, and an end report with corrections and words. */
export function freeTool({ nonBlocking = false } = {}) {
  const decl = JSON.parse(JSON.stringify(JUDGE_TOOL.functionDeclarations));
  Object.assign(decl[1].parameters.properties, {
    good_ja: { type: 'ARRAY', items: { type: 'STRING' }, description: '1–3 things the learner said well, quoted in Japanese as they said them.' },
    corrections: {
      type: 'ARRAY',
      description: 'The 2–4 most useful fixes from the conversation, most useful first.',
      items: { type: 'OBJECT', properties: { heard: { type: 'STRING', description: 'What the learner said (Japanese).' }, better: { type: 'STRING', description: 'A natural, correct way to say it (Japanese).' }, tip_en: { type: 'STRING', description: 'Why, in one short English sentence.' } }, required: ['heard', 'better'] },
    },
    next_words: {
      type: 'ARRAY',
      description: '3–5 words or phrases that would have helped in this conversation.',
      items: { type: 'OBJECT', properties: { ja: { type: 'STRING' }, kana: { type: 'STRING' }, en: { type: 'STRING' } }, required: ['ja', 'en'] },
    },
    level_en: { type: 'STRING', description: 'One short sentence: how their speaking sounded today (e.g. "Solid N5 — ready to add て-form").' },
  });
  if (nonBlocking) for (const d of decl) d.behavior = 'NON_BLOCKING';
  return { functionDeclarations: decl };
}

/**
 * System instruction for the free-talk room: the partner is played live, nothing is scripted.
 * partner = resolved cast entry; info = data/freetalk.json partners[id]; topic = a topic entry (or the "anything" topic).
 */
export function freeSystemInstruction({ partner, info = {}, place, setupEn = '', topic, level = 'easy', style = 'polite', learnerName = '', news = [], mood = '' }) {
  const L = FREE_LEVELS[level] || FREE_LEVELS.easy;
  const casual = style === 'casual';
  return [
    `You are ${partner.nameJa}（${partner.kana}）, ${partner.roleEn}. Persona (Japanese): ${partner.personaJa}${partner.styleJa ? ` Speaking style: ${partner.styleJa}` : ''}`,
    `This is "Kotoba Town", a Japanese speaking-practice game set in a small Japanese town. Right now you and the learner have a FREE CONVERSATION by voice — nothing is scripted. The learner is an IT student from Cambodia who studies Japanese${learnerName ? `; their name is ${learnerName}` : ''}.`,
    `Place: ${place}${setupEn ? ` (${setupEn})` : ''}.${info.relationEn ? ` Who you are to the learner: ${info.relationEn}.` : ''}${info.likesEn ? ` You like: ${info.likesEn}.` : ''}`,
    mood ? `Today you are ${mood} — let it colour how you talk, without overdoing it.` : '',
    news.length ? `Small things from your own life today that you may mention naturally, one at a time, only when it fits: ${news.map((n) => `「${n}」`).join(' ')}` : '',
    `Level: ${L.guide}`,
    casual
      ? 'Style: you are friends of about the same age — talk in friendly plain style (普通形, like lesson 20 of Minna no Nihongo: 〜だよ、〜する？、〜した). The learner may answer in plain style too; both styles are fine from them.'
      : 'Style: polite です/ます style.',
    topicLines(topic),
    'How to talk:',
    '- Be a warm, real conversation partner: react to what the learner says (へえ、そうなんですか／いいですね／たいへんでしたね), share a little about yourself, then usually ask ONE follow-up question. Keep every turn short: 1–3 short sentences, so the learner talks more than you.',
    '- Speak only Japanese, slowly and clearly. Never speak English and never translate.',
    '- Do not correct the learner out loud and do not explain grammar — the app shows corrections on the screen. Keep the conversation going. If they ask what a word means, explain it simply in Japanese.',
    '- If you did not understand, do not pretend: say so kindly and check (すみません、〜ですか？／もう いちど いいですか).',
    '- If the learner is stuck, help: ask a simpler yes/no question, or offer two choices.',
    '- Follow the learner if they change the topic. Keep it friendly and safe: no politics, religion, romance or upsetting subjects.',
    'How this session works:',
    '- The app sends notes in square brackets ([START], [TOPIC], [TWIST], [NUDGE], [END]). They are instructions for you, never words of the learner. Follow them.',
    '- Each time the learner finishes speaking, IMMEDIATELY call `judge_reply` (no speech before it). Use branch "free" for any Japanese answer (or repeat / dont_know / english / unclear). `heard` = exactly their words, in Japanese. Score their Japanese for their level (0–3). correction = a natural, correct way to say what they meant' + (casual ? ' (plain style is fine)' : ' (です/ます)') + '. tip_en = one short, kind English tip.',
    '- After the function result, obey its "say" field: "nothing" = say nothing at all; otherwise follow its instruction and reply in character.',
    '- The learner ALWAYS speaks Japanese, with a foreign accent (often South-East Asian). Hear every utterance as Japanese: if it sounds like another language, it is accented Japanese — find the closest Japanese words. Choose the english branch only when they clearly said English words or sentences.',
    '- When a note starts with [END], call `final_report` once, then say nothing.',
  ].filter(Boolean).join('\n');
}

function topicLines(topic) {
  if (!topic || topic.id === 'any') return 'Topic: anything — start from something in your own life today or the place you are in, and follow whatever the learner likes to talk about.';
  return [
    `Topic: ${topic.titleJa} (${topic.titleEn}).${topic.kind === 'role' ? ' This is a ROLE-PLAY: stay in your real role and let the learner do their part.' : ''}`,
    topic.situationEn ? `Situation: ${topic.situationEn}` : '',
    topic.openerEn ? `How you open: ${topic.openerEn}` : '',
    topic.ideasEn?.length ? `The learner may want to: ${topic.ideasEn.join('; ')}.` : '',
  ].filter(Boolean).join('\n');
}

/** What the partner should say back, per kind of verdict (free-talk room). */
export function freeReplyInstruction(result, { level = 'easy', style = 'polite' } = {}) {
  const lv = (FREE_LEVELS[level] || FREE_LEVELS.easy).en;
  const st = style === 'casual' ? 'friendly plain style' : 'polite です/ます';
  const heard = result.heard ? `「${result.heard}」` : 'what they said';
  switch (result.branch) {
    case 'repeat': return `The learner asked you to repeat. Say your last sentence again, slower and in simpler words (${st}).`;
    case 'dont_know': return `The learner did not understand. Say it again in much simpler Japanese (shorter sentences, easier words) or ask a yes/no question (${st}, ${lv}).`;
    case 'english': return `The learner used English (${heard}). In one short Japanese sentence give them the Japanese words for it, then ask your question again simply (${st}). No English.`;
    case 'unclear': return `You did not catch what the learner said. Say so kindly in one short sentence and ask them to say it again (${st}).`;
    default: return `Reply in character to ${heard} as in a real conversation: react to it, maybe share something about yourself, then usually ask ONE follow-up question. 1–3 short sentences, ${st}, ${lv} level. No greetings.`;
  }
}

/** The [END] note of the free-talk room. */
export function freeEndNote({ turns, topics = [] }) {
  const recap = turns.map((t, i) => `${i + 1}. heard: ${quote(t.heard || '')} | score ${t.score}${t.correction && t.correction !== t.heard ? ` | better: ${quote(t.correction)}` : ''}`).join('\n');
  return `[END] The free conversation is over${topics.length ? ` (topics: ${topics.join(', ')})` : ''}. The learner's utterances:\n${recap || '(none)'}\nCall final_report now: stars, a short encouraging summary, strengths, what to practise next, 1–3 things they said well (good_ja), the 2–4 most useful corrections, 3–5 useful words for next time, and a one-line level note.`;
}

/** Free-talk report computed locally (Live did not answer in time). */
export function offlineFreeReport(turns, words = []) {
  const base = offlineReport(turns);
  const fixes = turns.filter((t) => t.correction && t.heard && similarity(t.correction, t.heard) < 0.95);
  return {
    ...base,
    summaryEn: turns.length ? `You talked ${turns.length} time${turns.length > 1 ? 's' : ''} in Japanese. ${base.summaryEn}` : 'Next time, try to say a few sentences — any Japanese is good practice!',
    free: true,
    good: turns.filter((t) => t.score >= 3).map((t) => t.heard).slice(0, 3),
    corrections: fixes.sort((a, b) => a.score - b.score).slice(0, 4).map((t) => ({ heard: t.heard, better: t.correction, tipEn: t.tipEn || '' })),
    words: words.slice(0, 5).map((w) => ({ ja: w.ja, kana: w.kana || '', en: w.en })),
    levelEn: '',
  };
}

function readFree(args) {
  const arr = (v) => (Array.isArray(v) ? v : []);
  return {
    free: true,
    good: list(args.good_ja).slice(0, 3),
    corrections: arr(args.corrections).map((c) => ({ heard: String(c?.heard || '').trim(), better: String(c?.better || '').trim(), tipEn: String(c?.tip_en || '').trim() })).filter((c) => c.better).slice(0, 4),
    words: arr(args.next_words).map((w) => ({ ja: String(w?.ja || '').trim(), kana: String(w?.kana || '').trim(), en: String(w?.en || '').trim() })).filter((w) => w.ja).slice(0, 5),
    levelEn: String(args.level_en || '').trim(),
  };
}
