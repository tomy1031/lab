// ui/s-sleep.js — sleep dialog (DESIGN §4.6): until morning / 2 h / 4 h / 8 h, with warnings from actions.sleepCheck().
import { h } from './dom.js';
import { toast } from './common.js';

export default function sleep(ctx) {
  const { game, screens } = ctx;
  let chk = { ok: true, reasons: [] };
  try { chk = game.actions?.sleepCheck?.() || chk; } catch { /* ignore */ }
  const hour = game.clock?.hour ?? 22;
  const toMorning = ((6 - hour) % 24 + 24) % 24 || 24;
  const opts = [['朝まで', { until: 6 }, toMorning, '🌅'], ['2 時間', { hours: 2 }, 2, '🛋'], ['4 時間', { hours: 4 }, 4, '🌙'], ['8 時間', { hours: 8 }, 8, '😴']];
  const wake = (n) => { const w = (hour + n) % 24; return `${String(Math.floor(w)).padStart(2, '0')}:${String(Math.floor((w % 1) * 60)).padStart(2, '0')} ごろに 起きる`; };
  const go = async (arg) => {
    screens.hide();
    try { await game.actions?.sleep?.(arg); } catch (e) { console.error(e); toast(game, `寝られませんでした：${e.message || e}`, 'warn'); }
  };
  const el = h('div', { class: 'sheet narrow sleep-sheet', tabindex: '-1' },
    h('div', { class: 'sheet-head' }, h('h2', { class: 'title' }, '🌙 どれくらい 寝る？')),
    h('div', { class: 'sheet-body col gap' },
      (chk.reasons || []).length ? h('div', { class: `sleep-warn ${chk.ok ? 'soft' : 'hard'}` }, (chk.reasons || []).map((r) => h('div', null, `${chk.ok ? '△' : '✕'} ${r}`))) : null,
      opts.map(([label, arg, n, icon], i) => h('button', { class: `btn ${i === 0 ? 'primary' : ''} sleep-opt`, disabled: !chk.ok || null, 'data-autofocus': i === 0 ? '' : null, onclick: () => go(arg) },
        h('span', { class: 'so-i' }, icon), h('span', { class: 'so-l' }, label), h('span', { class: 'so-s' }, wake(n)))),
      h('button', { class: 'btn ghost', onclick: () => screens.hide() }, 'やめる')));
  return { el, cls: 'center' };
}
