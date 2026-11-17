// Stable ids for every pre-generated voice line. Shared by the game (to find audio files)
// and by tools (voice manifest for the Gemini Live generator). Dependency-free.
import { CAST, UTILITY_LINES } from './cast.js';

/** Resolve a character reference (cast id string or inline object) to { id, ...card }. */
export function resolveCharacter(ref) {
  if (typeof ref === 'string') return CAST[ref] ? { id: ref, ...CAST[ref] } : null;
  if (ref && typeof ref === 'object' && ref.id) return { ...ref };
  return null;
}

/** Text the voice generator reads (the optional `tts` override wins). */
export const speechText = (line) => (line.tts || line.ja || '').trim();

/**
 * All spoken lines of one variant, in play order of the node list.
 * id = `<variant>/<node>_<i>` and for alternatives `<variant>/<node>_<i>_a<k>`.
 */
export function variantLines(variant) {
  const out = [];
  const chars = Object.fromEntries((variant.characters || []).map((c) => {
    const r = resolveCharacter(c);
    return [r?.id, r];
  }));
  const push = (id, line, who) => {
    const ch = chars[who];
    out.push({ id, who, voice: ch?.voice || 'Puck', ja: line.ja, kana: line.kana, en: line.en, text: speechText(line) });
  };
  for (const node of variant.nodes || []) {
    (node.say || []).forEach((line, i) => {
      push(`${variant.id}/${node.id}_${i}`, line, line.who);
      (line.alts || []).forEach((alt, k) => push(`${variant.id}/${node.id}_${i}_a${k}`, { ...alt, tts: alt.tts }, line.who));
    });
  }
  if (variant.freeTalk?.openerJa) {
    const main = resolveCharacter(variant.characters?.[0]);
    push(`${variant.id}/free_open`, { ja: variant.freeTalk.openerJa, kana: variant.freeTalk.openerKana, en: variant.freeTalk.openerEn }, main?.id);
  }
  return out;
}

/** Utility lines for a character (engine-owned). id = `_cast/<char>_<key>`. */
export function utilityLines(charId, voice) {
  return Object.entries(UTILITY_LINES).map(([key, l]) => ({
    id: `_cast/${charId}_${key}`, who: charId, voice, ja: l.ja, kana: l.kana, en: l.en, text: l.ja,
  }));
}

/** Path of the compressed audio file for a line id, relative to the game root. */
export const audioPath = (id) => `audio/voice/${id}.mp3`;
