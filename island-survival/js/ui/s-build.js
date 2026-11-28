// ui/s-build.js — build menu (B): list from game.sys.building.defs(); "置く" starts placing and closes the menu.
import { h, clear } from './dom.js';
import { head, toast } from './common.js';

const matChip = (m) => {
  if (typeof m === 'string') return h('span', { class: 'mat' }, m);
  const have = m.have, need = m.need;
  const ok = have == null || have >= need;
  return h('span', { class: `mat ${ok ? 'ok' : 'short'}` }, `${m.icon ? m.icon + ' ' : ''}${m.label || m.name}`, need != null ? h('b', null, have != null ? ` ${have}/${need}` : ` ×${need}`) : null);
};

export default function build(ctx) {
  const { game, screens } = ctx;
  const B = game.sys?.building;
  let defs = [];
  try { defs = B?.defs?.() || []; } catch (e) { console.error(e); }
  const body = h('div', { class: 'build-list' });
  for (const pr of ['P0', 'P1', 'P2']) {
    const group = defs.filter((d) => (d.p || 'P0') === pr);
    if (!group.length) continue;
    body.append(h('h3', { class: 'group-h' }, { P0: '建てられる もの', P1: 'もっと 先に 建てられる もの', P2: 'いつか' }[pr]));
    const grid = h('div', { class: 'build-grid' });
    for (const d of group) {
      const mats = Array.isArray(d.materials) ? d.materials : (d.materials ? [d.materials] : []);
      const short = mats.some((m) => typeof m === 'object' && m.have != null && m.have < m.need);
      grid.append(h('div', { class: `card build-card${d.locked ? ' dis' : ''}` },
        h('div', { class: 'bc-top' }, h('span', { class: 'bc-icon' }, d.icon || '🏠'), h('div', { class: 'bc-title' }, h('b', null, d.name), h('span', { class: 'muted small' }, d.minutes != null ? `所要 ${d.minutes >= 60 ? `${Math.round(d.minutes / 6) / 10} 時間` : `${d.minutes} 分`}` : ''))),
        h('div', { class: 'mats' }, mats.map(matChip)),
        d.effect ? h('p', { class: 'bc-effect small' }, d.effect) : null,
        h('button', { type: 'button', class: `btn small ${short ? '' : 'primary'}`, disabled: d.locked || null, onclick: () => {
          try { B?.startPlacing?.(d.id); } catch (e) { console.error(e); toast(game, '置けませんでした', 'warn'); return; }
          screens.hide();
        } }, short ? '置く（素材が たりない）' : '置く')));
    }
    body.append(grid);
  }
  if (!defs.length) body.append(h('p', { class: 'muted pad' }, 'まだ 建てられる ものは ありません。'));
  const el = h('div', { class: 'sheet wide build-sheet', tabindex: '-1' }, head('建築', screens),
    h('div', { class: 'sheet-body' }, h('p', { class: 'muted small' }, '置く 場所を えらぶと 骨組みが できます。素材を 持って 近づき E で 納めましょう。'), body));
  return { el };
}
