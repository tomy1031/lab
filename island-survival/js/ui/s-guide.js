// ui/s-guide.js — field guide (K): category tabs, grid with silhouettes for K0, sketch + notes + look-alike links, completion % (DESIGN §20).
import { h, clear, svg } from './dom.js';
import { head } from './common.js';

const CATS = [['plant', '🌿', '植物'], ['mushroom', '🍄', 'キノコ'], ['sea', '🐟', '海の 生き物'], ['animal', '🦌', '動物・鳥'], ['danger', '🐍', '危険な 生き物']];
const CAT_ALIAS = { fish: 'sea', beast: 'animal', bird: 'animal', bug: 'danger', herb: 'plant', tree: 'plant' };
const LEVELS = ['未発見', '見つけた', '調べた', '確定'];
const SHAPES = {
  plant: ['M50 94 C50 72 47 62 50 52 M50 56 C16 50 12 24 50 6 C88 24 84 50 50 56 Z', 'M50 56 L50 14 M50 40 L34 28 M50 32 L66 22'],
  mushroom: ['M10 54 C10 18 90 18 90 54 Z M41 54 L38 90 L62 90 L59 54', 'M26 46 L74 46 M32 38 L68 38'],
  sea: ['M8 50 C28 18 66 20 84 50 C66 80 28 82 8 50 Z M84 50 L97 34 L97 66 Z', 'M26 50 C34 40 44 40 52 50 M22 44 L22 56'],
  animal: ['M18 58 C16 38 58 34 70 46 L82 36 L92 46 L80 56 C78 62 74 64 70 62 L70 88 L61 88 L61 68 L38 68 L38 88 L29 88 L29 66 C22 64 18 62 18 58 Z', 'M82 44 L84 44'],
  danger: ['M10 78 C10 56 38 66 46 50 C54 34 24 30 34 16 C46 4 78 14 74 34 C72 46 56 50 62 62 C68 72 90 66 92 82', 'M30 14 L36 6 L42 16'],
};
export function sketch(cat, color, silhouette, size = 96) {
  const [path, detail] = SHAPES[cat] || SHAPES.plant;
  const s = svg('svg', { viewBox: '0 0 100 100', width: size, height: size, class: 'sketch', 'aria-hidden': 'true' });
  const fill = silhouette ? '#3d3a33' : (color || '#8fb98a');
  s.append(svg('path', { d: path, fill, 'fill-opacity': silhouette ? 0.85 : 0.55, stroke: silhouette ? '#3d3a33' : '#3a362c', 'stroke-width': cat === 'danger' ? 5 : 2.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  if (!silhouette) s.append(svg('path', { d: detail, fill: 'none', stroke: '#3a362c', 'stroke-width': 1.4, 'stroke-linecap': 'round', opacity: 0.7 }));
  return s;
}
const catOf = (e) => CAT_ALIAS[e.cat] || e.cat || 'plant';

export default function guide(ctx, data = {}) {
  const { game, screens } = ctx;
  let entries = [];
  try { entries = game.sys?.knowledge?.entries?.() || []; } catch (e) { console.error(e); }
  let cat = data.cat || 'plant', sel = data.id || null;
  const byId = new Map(entries.map((e) => [e.id, e]));
  if (sel && byId.get(sel)) cat = catOf(byId.get(sel));
  const grid = h('div', { class: 'guide-grid' });
  const page = h('div', { class: 'guide-page paper-inset' });
  const prog = h('div', { class: 'guide-prog' });
  const tabs = h('div', { class: 'tabs scroll' }, CATS.map(([id, icon, label]) => h('button', { class: 'tab', 'data-t': id, onclick: () => { cat = id; sel = null; render(); } }, `${icon} ${label}`)));
  const el = h('div', { class: 'sheet wide guide-sheet', tabindex: '-1' }, head('島の 図鑑', screens, prog),
    h('div', { class: 'sheet-body no-pad' }, tabs, h('div', { class: 'guide-main' }, h('div', { class: 'guide-left' }, grid), page)));

  const nameOfE = (e) => (e.level <= 0 ? '？？？' : e.provisional ? `${e.name}？` : e.name);
  function render() {
    tabs.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.t === cat));
    const total = entries.length, k3 = entries.filter((e) => e.level >= 3).length, found = entries.filter((e) => e.level >= 1).length;
    prog.textContent = '';
    prog.append(h('span', { class: 'prog-pct' }, `${total ? Math.floor((k3 / total) * 100) : 0}%`), h('span', { class: 'muted small' }, ` 確定 ${k3} ／ 見つけた ${found} ／ 全 ${total}`));
    clear(grid);
    const list = entries.filter((e) => catOf(e) === cat);
    if (!list.length) grid.append(h('p', { class: 'muted pad' }, 'まだ 何も 載っていません。'));
    if (!sel || !list.some((e) => e.id === sel)) sel = list.find((e) => e.level > 0)?.id ?? list[0]?.id ?? null;
    for (const e of list) {
      grid.append(h('button', { type: 'button', class: `gcell k${e.level}${e.id === sel ? ' sel' : ''}`, onclick: () => { sel = e.id; render(); } },
        sketch(catOf(e), e.sketchColor, e.level <= 0, 56), h('span', { class: 'g-name' }, nameOfE(e)),
        e.level > 0 ? h('span', { class: `lv lv${e.level}` }, LEVELS[e.level]) : null));
    }
    renderPage(byId.get(sel));
  }
  function renderPage(e) {
    clear(page);
    if (!e) { page.append(h('p', { class: 'muted pad' }, '項目を えらんで ください。')); return; }
    const k = e.level || 0;
    const verdict = k >= 3 ? e.verdict : null;
    const vcls = verdict ? (/毒|危険|猛/.test(verdict) ? 'bad' : /薬/.test(verdict) ? 'med' : 'good') : '';
    page.append(
      h('div', { class: 'gp-head' }, h('div', { class: 'gp-sketch' }, sketch(catOf(e), e.sketchColor, k <= 0, 120)),
        h('div', null, h('h2', { class: 'title' }, nameOfE(e)), h('div', { class: 'row gap wrap-row' }, h('span', { class: `lv lv${k}` }, LEVELS[k]), verdict ? h('span', { class: `verdict ${vcls}` }, verdict) : null))),
      k <= 0 ? h('p', { class: 'muted' }, 'まだ 見つけていません。島を 歩いて 探そう。') : [
        e.foundAt ? h('div', { class: 'note' }, h('h4', null, '見つけた 場所'), h('p', null, e.foundAt)) : null,
        h('div', { class: 'note' }, h('h4', null, '見分け方'), h('p', null, k >= 2 ? (e.features || '—') : '「調べる」（E 長押し）と 見分けの 特徴が 分かります。')),
        h('div', { class: 'note' }, h('h4', null, '使い道・食べられるか'), h('p', null, k >= 3 ? (e.uses || '—') : '食べて 確かめる・薬として 使う・仲間に 聞く などで 確定します。')),
        lookalikes(e, k)]);
  }
  function lookalikes(e, k) {
    const la = [].concat(e.lookalike || []).filter(Boolean);
    if (!la.length || k < 2) return null;
    return h('div', { class: 'note' }, h('h4', null, '似て いる もの'), h('div', { class: 'row gap wrap-row' }, la.map((id) => {
      const o = byId.get(id);
      return o ? h('button', { class: 'btn small', onclick: () => { cat = catOf(o); sel = o.id; render(); } }, `↔ ${nameOfE(o)}`) : h('span', { class: 'tag' }, String(id));
    })));
  }
  render();
  return { el };
}
