// ui/s-journal.js — diary (J / N): day-by-day log from game.sys.journal.days + stats.
import { h } from './dom.js';
import { head } from './common.js';

const KIND = { event: '✦', eat: '🍴', craft: '🔧', build: '🏠', warn: '⚠', sick: '🤒', weather: '☁', talk: '💬', find: '🔎', fish: '🎣', hunt: '🏹', sleep: '🌙', fire: '🔥' };
export default function journal(ctx) {
  const { game, screens } = ctx;
  const J = game.sys?.journal;
  const days = [...(J?.days || [])].sort((a, b) => b.day - a.day);
  let stats = null;
  try { stats = typeof J?.stats === 'function' ? J.stats() : J?.stats; } catch { /* ignore */ }
  if (!stats) stats = { '記された 出来事': days.reduce((a, d) => a + (d.lines?.length || 0), 0), '過ごした 日数': days.length };
  const pad2 = (n) => String(Math.floor(n)).padStart(2, '0');
  const hh = (hr) => `${pad2(hr)}:${pad2((hr % 1) * 60)}`;
  const list = h('div', { class: 'journal-list' }, days.length ? days.map((d) => h('section', { class: 'jday' },
    h('h3', { class: 'jday-h' }, `${d.day} 日目`, d.title ? h('span', { class: 'muted small' }, `　${d.title}`) : null),
    (d.lines || []).map((l) => h('div', { class: `jline k-${l.kind || 'event'}` }, h('time', null, hh(l.hour ?? 0)), h('span', { class: 'jk' }, KIND[l.kind] || '・'), h('span', { class: 'jt' }, l.text))))) :
    h('p', { class: 'muted pad' }, 'まだ 何も 書かれていません。今日の ことは 夜に まとめて 書き留められます。'));
  const side = h('div', { class: 'journal-side paper-inset pad' }, h('h3', null, 'ここまでの 記録'),
    Object.entries(stats).map(([k, v]) => h('div', { class: 'kv' }, h('span', { class: 'k' }, k), h('span', { class: 'v' }, String(v)))));
  const el = h('div', { class: 'sheet wide journal-sheet', tabindex: '-1' }, head('日記', screens), h('div', { class: 'sheet-body journal-body' }, list, side));
  return { el };
}
