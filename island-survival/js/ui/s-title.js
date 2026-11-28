// ui/s-title.js — title, credits, records.
import { h } from './dom.js';
import { loadRecords } from '../core/save.js';
import { head } from './common.js';

export default function title(ctx) {
  const { game, screens } = ctx;
  const has = !!game.hasSave?.();
  const menu = h('div', { class: 'title-menu' },
    h('button', { class: 'btn primary xl', 'data-autofocus': '', onclick: () => screens.show('setup', { from: 'title' }) }, 'はじめる'),
    has ? h('button', { class: 'btn teal xl', onclick: async () => {
      screens.show('loading', { text: 'セーブを よみこんでいます…' });
      try { await game.continueGame?.() ?? await game.loadGame?.(); if (screens.current === 'loading') screens.hide(); }
      catch (e) { console.error(e); screens.show('title'); }
    } }, 'つづきから') : null,
    h('div', { class: 'row gap center' },
      h('button', { class: 'btn ghost', onclick: () => screens.show('records', { from: 'title' }) }, '記録'),
      h('button', { class: 'btn ghost', onclick: () => screens.show('settings', { from: 'title' }) }, '設定'),
      h('button', { class: 'btn ghost', onclick: () => screens.show('credits', { from: 'title' }) }, 'クレジット')));
  const el = h('div', { class: 'title-box' },
    h('div', { class: 'title-sub' }, '— たったひとつの 持ち物で —'),
    h('h1', { class: 'logo' }, h('span', null, 'ひとつだけ'), h('span', { class: 'logo-island' }, '島')),
    h('div', { class: 'logo-en' }, 'ONE THING ISLAND'),
    menu,
    h('div', { class: 'title-foot muted small' }, 'マウス・キーボード / タッチ / ハンドジェスチャー / VR', window.ISLE?.pwa?.ready ? '　・　オフライン OK' : ''));
  return { el, cls: 'title-screen' };
}

export function credits(ctx) {
  const { screens } = ctx;
  const el = h('div', { class: 'sheet narrow', tabindex: '-1' },
    head('クレジット', screens),
    h('div', { class: 'sheet-body' },
      h('div', { class: 'credit-list' },
        h('h3', null, '仲間のモデル'),
        h('p', null, 'Seed-san model by VirtualCast, Inc.'), h('p', { class: 'muted small' }, 'VRM Public License 1.0'),
        h('p', null, 'VRM1_Constraint_Twist_Sample (c) 2022 pixiv Inc.'), h('p', { class: 'muted small' }, 'VRM Public License 1.0'),
        h('h3', null, '使っている もの'),
        h('p', null, 'three.js ／ @pixiv/three-vrm ／ MediaPipe ／ Gemini Live API'),
        h('p', null, 'フォント：Zen Maru Gothic'),
        h('p', { class: 'muted small' }, '音は すべて Web Audio で その場で つくっています。'))));
  return { el };
}

export function records(ctx) {
  const { screens } = ctx;
  const list = loadRecords();
  const body = list.length ? h('table', { class: 'tbl' },
    h('thead', null, h('tr', null, ['#', 'スコア', 'ランク', '日数', '結果'].map((t) => h('th', null, t)))),
    h('tbody', null, list.slice(0, 10).map((r, i) => h('tr', null,
      h('td', null, i + 1), h('td', null, r.score ?? '-'), h('td', null, r.rank ?? '-'), h('td', null, r.days ?? '-'), h('td', null, r.result ?? r.end ?? ''))))) :
    h('p', { class: 'muted center-text' }, 'まだ 記録は ありません。島から 生きて 帰ろう。');
  const el = h('div', { class: 'sheet narrow', tabindex: '-1' }, head('記録', screens), h('div', { class: 'sheet-body' }, body));
  return { el };
}

