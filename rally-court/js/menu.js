// js/menu.js — the start page's menu (PC / before entering VR), built from the same settings list as the VR panel.
import { GROUPS, SETTINGS, formatValue } from './config.js';
import { visibleItems } from './vrmenu.js';

export function buildMenu(root, settings) {
  let tab = 'play';
  const tabs = root.querySelector('.tabs');
  const list = root.querySelector('.items');
  const help = root.querySelector('.help');
  function render() {
    tabs.innerHTML = '';
    for (const [k, label] of GROUPS) {
      const b = document.createElement('button');
      b.className = 'tab' + (k === tab ? ' on' : '');
      b.textContent = label;
      b.onclick = () => { tab = k; render(); };
      tabs.appendChild(b);
    }
    list.innerHTML = '';
    for (const s of visibleItems(tab, settings.get('moveMode'))) {
      const row = document.createElement('div');
      row.className = 'row' + (settings.isDefault(s.key) ? '' : ' changed');
      row.dataset.key = s.key;
      const lab = document.createElement('div');
      lab.className = 'label';
      lab.textContent = s.label;
      row.appendChild(lab);
      const ctl = document.createElement('div');
      ctl.className = 'ctl';
      const v = settings.get(s.key);
      if (s.type === 'choice') {
        ctl.classList.add('seg');
        for (const [ov, ol] of s.options) {
          const b = document.createElement('button');
          b.textContent = ol;
          b.className = ov === v ? 'on' : '';
          b.onclick = () => { settings.set(s.key, ov); render(); };
          ctl.appendChild(b);
        }
      } else if (s.type === 'toggle') {
        const b = document.createElement('button');
        b.className = 'toggle' + (v ? ' on' : '');
        b.setAttribute('role', 'switch'); b.setAttribute('aria-checked', String(!!v));
        b.textContent = v ? 'オン' : 'オフ';
        b.onclick = () => { settings.set(s.key, !settings.get(s.key)); render(); };
        ctl.appendChild(b);
      } else {
        const r = document.createElement('input');
        r.type = 'range'; r.min = s.min; r.max = s.max; r.step = s.step; r.value = v;
        r.setAttribute('aria-label', s.label);
        const out = document.createElement('span');
        out.className = 'val';
        out.textContent = formatValue(s, v);
        r.oninput = () => { settings.set(s.key, Number(r.value)); out.textContent = formatValue(s, settings.get(s.key)); row.classList.toggle('changed', !settings.isDefault(s.key)); };
        ctl.appendChild(r); ctl.appendChild(out);
      }
      row.appendChild(ctl);
      row.onmouseenter = () => showHelp(s);
      row.onfocus = () => showHelp(s);
      list.appendChild(row);
    }
    const reset = document.createElement('button');
    reset.className = 'reset';
    reset.textContent = 'このタブを初期値に戻す';
    reset.onclick = () => { settings.reset(tab); render(); };
    list.appendChild(reset);
  }
  function showHelp(s) {
    help.textContent = `${s.label}：${s.help || ''}（初期値 ${formatValue(s, s.def)}）`;
  }
  settings.onChange((k) => { if (k === 'moveMode') render(); });
  render();
  return { render };
}
