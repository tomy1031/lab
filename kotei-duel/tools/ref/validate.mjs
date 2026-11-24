import { CARDS, CARD_BY_ID, OPS, TIMINGS, KINDS, PHASES, TAGS, STAT_LABELS } from '../../js/data/cards.js';
import { CHAPTERS, TRACKS } from '../../js/data/chapters.js';
import { LESSONS, LESSON_BY_ID, LESSON_ON } from '../../js/data/lessons.js';
import { QUIZ } from '../../js/data/quiz.js';
import { TUTORIAL, HINTS, SPEAKERS } from '../../js/data/tutorial.js';
const ICONS = 'star, doc, clipboard, checklist, magnifier, people, person, boss, handshake, ear, speech, question, exclaim, gear, code, laptop, bug, net, shield, flask, link, puzzle, server, database, rocket, cloud, fog, hourglass, clock, calendar, money, calculator, chart, gantt, warning, fire, bolt, meteor, tornado, ghost, eye, check, cross, stamp, book, scroll, key, lock, flag, wrench, monitor, wireframe, flow, vmodel, mail, phone, bell, robot, pen, scissors, table, rollback, heart, trophy, sparkle, sword, hammer, target, bridge, box, coffee, moon, crown, sun, mask'.split(', ');
const BG = 'blue, green, pink, gold, purple, red, orange, teal, gray, night'.split(', ');
const PAT = 'grid, circuit, rays, dots, waves, hex, fire, binary'.split(', ');
let errs = 0; const E = (...a) => { errs++; console.log('ERR', ...a); };
const RE = /\{([^{}|]+)\|([^{}]+)\}/g;
const plain = (s) => String(s).replace(RE, '$1');
const KANJI = /[㐀-鿿々]/;
function jp(s, where, maxPlain) {
  if (typeof s !== 'string') return E(where, 'not a string');
  const rest = s.replace(RE, '');
  if (KANJI.test(rest)) E(where, 'kanji without furigana:', rest.match(/[㐀-鿿々]+/g).join(' '), '|', s.slice(0, 60));
  for (const m of s.matchAll(RE)) { if (!KANJI.test(m[1])) E(where, 'ruby base has no kanji', m[0]); if (/[^぀-ゟー]/.test(m[2])) E(where, 'reading not hiragana', m[0]); }
  if (/[{}|]/.test(rest)) E(where, 'broken markup', s);
  if ((s.match(/\*\*/g) || []).length % 2) E(where, 'odd **');
  if (maxPlain && plain(s).replace(/\*\*/g, '').length > maxPlain) E(where, 'too long', plain(s).length, '>', maxPlain);
}
const art = (a, where) => { if (!a) return E(where, 'no art'); if (!ICONS.includes(a.icon)) E(where, 'icon', a.icon); if (a.icon2 && !ICONS.includes(a.icon2)) E(where, 'icon2', a.icon2); if (!BG.includes(a.bg)) E(where, 'bg', a.bg); if (!PAT.includes(a.pattern)) E(where, 'pattern', a.pattern); };
const ids = new Set();
for (const c of CARDS) {
  const w = 'card ' + c.id;
  if (ids.has(c.id)) E(w, 'dup'); ids.add(c.id);
  if (!KINDS[c.kind]) E(w, 'kind'); if (!PHASES[c.phase]) E(w, 'phase', c.phase);
  jp(c.name, w + ' name', 16); jp(c.text, w + ' text', 46); jp(c.flavor, w + ' flavor', 70);
  if (!c.en || !c.flavorEn) E(w, 'en'); if (/[぀-鿿]/.test(c.en + c.flavorEn)) E(w, 'jp in en');
  art(c.art, w); if (!LESSON_BY_ID[c.lesson]) E(w, 'lesson', c.lesson); if (!c.source) E(w, 'source');
  if ((c.flavor.match(/。/g) || []).length > 3) E(w, 'flavor >3 sentences');
  for (const ef of c.effects) { if (!OPS.includes(ef.op)) E(w, 'op', ef.op); if (!TIMINGS.includes(ef.on)) E(w, 'on', ef.on); if (ef.op === 'summon' && !CARD_BY_ID[ef.id]) E(w, 'summon id'); }
  if (['guard', 'plot'].includes(c.kind) && !Array.isArray(c.trigger)) E(w, 'trigger');
  if (['trouble', 'event', 'plot'].includes(c.kind)) { if (!TAGS[c.tag]) E(w, 'tag'); if (!c.token && !c.ai) E(w, 'ai'); }
  if (c.kind === 'unit' && typeof c.power !== 'number') E(w, 'power'); if (c.kind === 'trouble' && typeof c.pressure !== 'number') E(w, 'pressure');
}
for (const o of [KINDS, PHASES, TAGS, STAT_LABELS]) for (const [k, v] of Object.entries(o)) jp(v.label, 'label ' + k);
for (const [k, t] of Object.entries(TRACKS)) { jp(t.label, 'track ' + k); for (const s of t.stages) if (!CARD_BY_ID[s]) E('track', s); for (const [a, b] of Object.entries(t.pair)) { if (!t.stages.includes(a)) E('pair', a); b.forEach((x) => t.stages.includes(x) || E('pair', x)); } }
const used = new Set();
for (const ch of CHAPTERS) {
  const w = ch.id;
  for (const f of ['title', 'place', 'goal']) jp(ch[f], w + ' ' + f);
  jp(ch.enemy.name, w + ' enemy'); jp(ch.enemy.say, w + ' say'); art(ch.enemy.art, w);
  for (const f of ['intro', 'win', 'lose']) ch[f].forEach((s, i) => jp(s, `${w} ${f}${i}`, 90));
  for (const f of ['en', 'placeEn', 'goalEn', 'introEn', 'winEn', 'loseEn']) if (!ch[f]) E(w, f);
  for (const id of [...ch.playerDeck, ...ch.newCards, ...ch.enemy.deck.flat()]) { if (!CARD_BY_ID[id]) E(w, 'card', id); used.add(id); }
  for (const id of ch.playerDeck) { if (!['unit', 'skill', 'guard', 'doc'].includes(CARD_BY_ID[id].kind)) E(w, 'player deck kind', id); if (ch.playerDeck.filter((x) => x === id).length > 3) E(w, '>3 copies', id); }
  for (const id of ch.enemy.deck.flat()) if (!['trouble', 'event', 'plot'].includes(CARD_BY_ID[id].kind)) E(w, 'enemy deck kind', id);
  for (const l of ch.lessons) if (!LESSON_BY_ID[l]) E(w, 'lesson', l);
  TRACKS[ch.track].stages.forEach((s) => used.add(s));
  if (!QUIZ.some((q) => q.chapter === ch.id)) E(w, 'no quiz');
}
// every card unlocked at or before its first use in a player deck
const unlocked = new Set();
for (const ch of CHAPTERS) { ch.newCards.forEach((c) => unlocked.add(c)); for (const id of ch.playerDeck) if (!unlocked.has(id)) E(ch.id, 'uses locked card', id); }
for (const c of CARDS) if (!used.has(c.id) && !c.token && c.id !== 'st_ops') E('unused card', c.id);
for (const c of CARDS) if (['unit', 'skill', 'guard', 'doc', 'stage'].includes(c.kind) && !unlocked.has(c.id)) E('never unlocked', c.id);
for (const l of LESSONS) { const w = 'lesson ' + l.id; jp(l.title, w + ' title', 24); jp(l.body, w + ' body', 150); if (!l.en || !l.source) E(w, 'en/source'); if (!PHASES[l.phase]) E(w, 'phase'); if (!ICONS.includes(l.icon)) E(w, 'icon'); }
for (const v of Object.values(LESSON_ON)) if (!LESSON_BY_ID[v]) E('LESSON_ON', v);
const usedLessons = new Set([...CARDS.map((c) => c.lesson), ...CHAPTERS.flatMap((c) => c.lessons), ...Object.values(LESSON_ON)]);
for (const l of LESSONS) if (!usedLessons.has(l.id)) E('lesson unused', l.id);
QUIZ.forEach((q, i) => { const w = 'quiz ' + i; jp(q.q, w + ' q', 70); q.choices.forEach((c, j) => jp(c, w + ' c' + j, 50)); jp(q.explain, w + ' ex', 100); if (!(q.answer >= 0 && q.answer < q.choices.length)) E(w, 'answer'); if (!q.en) E(w, 'en'); if (!LESSON_BY_ID[q.lesson]) E(w, 'lesson'); if (!CHAPTERS.some((c) => c.id === q.chapter)) E(w, 'chapter'); });
TUTORIAL.forEach((t) => { jp(t.say, 'tut ' + t.id, 130); if (!t.en) E('tut', t.id); if (t.lesson && !LESSON_BY_ID[t.lesson]) E('tut lesson', t.id); for (const k of ['card', 'stage', 'unit', 'target']) if (t.want[k] && !CARD_BY_ID[t.want[k]]) E('tut card', t.id, t.want[k]); });
HINTS.forEach((t) => { jp(t.say, 'hint ' + t.id, 130); if (!t.en) E('hint', t.id); });
Object.values(SPEAKERS).forEach((s) => { jp(s.name, 'speaker'); art(s.art, 'speaker'); });
const kinds = {}; CARDS.forEach((c) => { kinds[c.kind] = (kinds[c.kind] || 0) + 1; });
console.log('cards', CARDS.length, JSON.stringify(kinds), 'lessons', LESSONS.length, 'quiz', QUIZ.length, 'tutorial', TUTORIAL.length, 'hints', HINTS.length);
const tl = CARDS.map((c) => plain(c.text).replace(/\*\*/g, '').length); console.log('card text length: avg', (tl.reduce((a, b) => a + b) / tl.length).toFixed(1), 'max', Math.max(...tl));
console.log(errs ? `${errs} ERRORS` : 'ALL OK');
process.exit(errs ? 1 : 0);
