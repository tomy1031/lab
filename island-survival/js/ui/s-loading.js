// ui/s-loading.js — show('loading', { text, progress }) ; calling it again updates in place.
import { h } from './dom.js';

export default function loading(ctx, data = {}) {
  const txt = h('div', { class: 'loading-text' });
  const bar = h('div', { class: 'bar big' }, h('i'));
  const sub = h('div', { class: 'loading-sub muted small' });
  const set = (d = {}) => {
    txt.textContent = d.text || '島を つくっています…';
    sub.textContent = d.sub || '';
    const p = d.progress;
    bar.classList.toggle('indet', p == null);
    bar.firstChild.style.width = p == null ? '' : `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%`;
  };
  set(data);
  const el = h('div', { class: 'loading-box' },
    h('div', { class: 'wave-logo' }, '🌴'),
    txt, bar, sub);
  return { el, cls: 'center dim', onData: set };
}
