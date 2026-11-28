// Load lessons and the voice index; text helpers (romaji) for display.
import { resolveCharacter, audioPath } from './lines.js';

export const LESSON_COUNT = 20;
/** ITビジネス編: 10 project episodes + 2 interviews. */
export const BUSINESS_COUNT = 12;
const base = new URL('../../', import.meta.url);

async function loadSeries(dir, prefix, count = LESSON_COUNT) {
  const out = [];
  for (let n = 1; n <= count; n++) {
    const id = `${prefix}${String(n).padStart(2, '0')}`;
    try {
      const r = await fetch(new URL(`data/${dir}/${id}.json`, base));
      if (r.ok) out.push({ id, ...(await r.json()) });
    } catch { /* missing unit */ }
  }
  return out;
}

/** みんなの日本語編 (lessons 1–20). */
export async function loadLessons() {
  return (await loadSeries('lessons', 'l')).map((L) => ({ ...L, course: 'minna', no: L.lesson }));
}

/** ITビジネス編 (episodes in story order). storyKey = A, B … in order of appearance. */
export async function loadBusiness() {
  const units = await loadSeries('business', 'b', BUSINESS_COUNT);
  const stories = [...new Set(units.map((u) => u.storyJa))];
  return units.map((u) => ({ ...u, course: 'it', no: u.unit, storyKey: String.fromCharCode(65 + stories.indexOf(u.storyJa)) }));
}

export async function loadCourses() {
  const [minna, it] = await Promise.all([loadLessons(), loadBusiness()]);
  return [
    { id: 'minna', titleJa: 'みんなの日本語編', titleEn: 'Minna no Nihongo I', units: minna },
    { id: 'it', titleJa: 'ITビジネス編', titleEn: 'IT business', units: it },
  ].filter((c) => c.units.length);
}

/** The free-talk room's partners, topics and twists (data/freetalk.json), or null when it is missing. */
export async function loadFreeTalk() {
  try {
    const r = await fetch(new URL('data/freetalk.json', base));
    const d = r.ok ? await r.json() : null;
    return d?.topics?.length && d.partners ? d : null;
  } catch { return null; }
}

let voiceIndex = null;
export async function loadVoiceIndex() {
  if (voiceIndex) return voiceIndex;
  try {
    const r = await fetch(new URL('audio/voice/index.json', base));
    voiceIndex = r.ok ? await r.json() : {};
  } catch { voiceIndex = {}; }
  return voiceIndex;
}

/** URL of a pre-generated line, or null if it has not been recorded (yet). */
export function voiceUrl(lineId) {
  if (!voiceIndex?.[lineId]) return null;
  return new URL(audioPath(lineId), base).href;
}

export function charactersOf(variant) {
  return variant.characters.map((c) => resolveCharacter(c)).filter(Boolean);
}

// ------------------------------------------------------------------- romaji
const K = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o', か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko', さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so',
  た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to', な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no', は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo', や: 'ya', ゆ: 'yu', よ: 'yo', ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro', わ: 'wa', を: 'o', ん: 'n',
  が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go', ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo', だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
  ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo', ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po', ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o', ゔ: 'vu',
};
const Y = { ゃ: 'ya', ゅ: 'yu', ょ: 'yo' };

/** Kana → Hepburn-ish romaji (particles は/へ/を read as wa/e/o when standing alone). */
export function toRomaji(kana) {
  const s = String(kana || '').replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  const words = s.split(/(\s+|[、。！？「」…・])/);
  return words.map((w) => {
    if (w === 'は') return 'wa';
    if (w === 'へ') return 'e';
    if (w === 'を') return 'o';
    let out = '';
    for (let i = 0; i < w.length; i++) {
      const c = w[i]; const n = w[i + 1];
      if (c === 'っ') { const nx = K[n] || ''; out += nx ? nx[0] === 'c' ? 't' : nx[0] : ''; continue; }
      if (c === 'ー') { const v = out.match(/[aeiou]$/); out += v ? v[0] : '-'; continue; }
      if (Y[n] && K[c]) {
        const b = K[c];
        out += b.endsWith('i') ? (/^(shi|chi|ji)$/.test(b) ? b.slice(0, -1) + Y[n].slice(1) : b.slice(0, -1) + Y[n]) : b + Y[n];
        i++; continue;
      }
      if (c === 'は' && i === w.length - 1 && w.length > 1 && /^(わたし|これ|それ|あれ|ここ|そこ|あそこ|きょう|こんにち|こんばん)/.test(w)) { out += /^(こんにち|こんばん)/.test(w) ? 'wa' : ' wa'; continue; }
      out += K[c] ?? (/[、]/.test(c) ? ',' : /[。]/.test(c) ? '.' : /[！]/.test(c) ? '!' : /[？]/.test(c) ? '?' : c);
    }
    return out;
  }).join('').replace(/\s+/g, ' ').trim();
}
