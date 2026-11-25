// js/faces.js — turns a card of the data (js/data/cards.js) into what the card face shows (js/cardmesh.js):
// the frame colour of its kind, its stage / type line, the numbers at the bottom, the text, the picture.
import { CARD_BY_ID, KINDS, PHASES, TAGS, STAT_LABELS } from './data/cards.js';
import { plain } from './text.js';

const C = (id) => CARD_BY_ID[id];

export function kindLabel(c) { return (KINDS[c.kind] || {}).label || ''; }

// opts: { stage, hole, plan, unit, trouble, D }
export function cardFace(id, opts = {}) {
  if (id === 'back' || id === 'pile') return { id, type: 'unit', name: '' };
  const c = C(id);
  if (!c) return { id, type: 'unit', name: id };
  const k = KINDS[c.kind] || {};
  const face = {
    id, kind: c.kind, name: c.name, en: c.en, cost: c.cost, text: c.text, art: c.art,
    type: c.kind, frame: k.frame, frame2: k.frame2, typeLabel: k.label,
    phaseLabel: c.kind === 'trouble' || c.kind === 'event' || c.kind === 'plot' ? (TAGS[c.tag] ? 'タイプ：' + plain(TAGS[c.tag].label) : '') : PHASES[c.phase] && c.phase !== 'all' ? plain(PHASES[c.phase].label) : '',
    stats: [],
  };
  if (c.kind === 'unit') {
    face.stats.push({ label: STAT_LABELS.power.label, value: c.power, bg: 'rgba(20,50,140,0.75)' });
  }
  if (c.kind === 'trouble') {
    face.stats.push({ label: STAT_LABELS.pressure.label, value: c.pressure, bg: 'rgba(80,20,140,0.8)' });
    if (TAGS[c.tag]) face.stats.push({ label: plain(TAGS[c.tag].label), value: '', bg: TAGS[c.tag].color, color: '#16122a' });
  }
  if (c.kind === 'stage' && c.inject) face.stats.push({ label: 'バグ', value: '+' + c.inject, bg: 'rgba(160,20,30,0.8)' });
  if (c.kind === 'stage' && c.group === 'test') face.stats.push({ label: '{見|み}つける', value: '◎', bg: 'rgba(10,110,90,0.85)' });
  if (opts.hole) {
    face.name = '（とばした）' + plain(c.name);
    face.text = '**{穴|あな}**：{設計書|せっけいしょ}がないので、ここのバグはテストで{見|み}つからない。';
    face.frame = '#3a0d12'; face.frame2 = '#140405';
    face.art = { icon: 'cross', bg: 'red', pattern: 'fire' };
    face.cost = null; face.stats = [];
    face.faceKey = 'hole';
  }
  if (opts.plan) face.faceKey = 'plan';
  return face;
}

// a one-line summary for logs and buttons
export function cardName(id) { const c = C(id); return c ? c.name : id; }
