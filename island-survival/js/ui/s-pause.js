// ui/s-pause.js — pause menu and settings.
import { h } from './dom.js';
import { head, toast, prefs } from './common.js';
import { loadSettings, saveSettings } from '../core/save.js';

export default function pause(ctx) {
  const { game, screens } = ctx;
  const msg = h('div', { class: 'pause-msg muted small', role: 'status' });
  const confirmRow = h('div', { class: 'confirm hidden' });
  const ask = (text, yes, label = 'はい') => {
    confirmRow.classList.remove('hidden');
    confirmRow.textContent = '';
    confirmRow.append(h('span', null, text), h('button', { class: 'btn danger small', onclick: yes }, label),
      h('button', { class: 'btn ghost small', onclick: () => confirmRow.classList.add('hidden') }, 'やめる'));
  };
  const canRetire = !!game.retire || !!game.sys;
  const el = h('div', { class: 'sheet narrow pause-sheet', tabindex: '-1' },
    h('div', { class: 'sheet-head' }, h('h2', { class: 'title' }, '一時停止'), h('span', { class: 'grow' })),
    h('div', { class: 'sheet-body col gap' },
      h('button', { class: 'btn primary xl', 'data-autofocus': '', onclick: () => screens.hide() }, 'つづける'),
      h('button', { class: 'btn teal', onclick: () => {
        const ok = game.save?.();
        msg.textContent = ok === false ? 'セーブに 失敗しました' : 'セーブしました';
        if (ok !== false) toast(game, 'セーブしました', 'good');
      } }, '💾 セーブ'),
      h('button', { class: 'btn', onclick: () => screens.show('settings', { from: 'pause' }) }, '⚙ 設定'),
      h('button', { class: 'btn', onclick: () => screens.show('gesture', { from: 'pause' }) }, '✋ ジェスチャーの 練習'),
      canRetire ? h('button', { class: 'btn ghost', onclick: () => ask('発煙筒で リタイアしますか？（スコア ×0.3）', () => { screens.hide(); game.retire?.(); }, 'リタイア') }, 'リタイアする') : null,
      h('button', { class: 'btn ghost', onclick: () => ask('セーブしていない 進行は 失われます。タイトルへ もどりますか？', () => {
        if (game.toTitle) { game.toTitle(); } else { screens.show('title'); game.startAmbientPreview?.(); }
      }, 'タイトルへ') }, 'タイトルへ'),
      confirmRow, msg));
  return { el, back() { screens.hide(); return true; } };
}

const VOL = [['master', '全体'], ['sfx', '効果音'], ['amb', '環境音'], ['voice', '声'], ['ui', '操作音']];

export function settings(ctx) {
  const { game, screens } = ctx;
  const s = loadSettings();
  const vol = { master: 0.9, sfx: 0.8, amb: 0.6, voice: 1, ui: 0.5, ...(game.audio?.volume || {}), ...(s.vol || {}) };
  const save = (patch) => { Object.assign(s, patch); saveSettings(s); game.settings = { ...(game.settings || {}), ...s }; try { game.applySettings?.(s); } catch { /* ignore */ } };
  const slider = (label, min, max, step, val, on, fmt = (v) => `${Math.round(v * 100)}%`) => {
    const out = h('output', { class: 'sl-out' }, fmt(val));
    const inp = h('input', { type: 'range', min, max, step, value: val, 'aria-label': label,
      oninput: (e) => { const v = +e.target.value; out.textContent = fmt(v); on(v); } });
    return h('label', { class: 'slider' }, h('span', { class: 'sl-l' }, label), inp, out);
  };
  const toggle = (label, val, on) => h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: val ? true : null, onchange: (e) => on(e.target.checked) }), h('span', null, label));

  const qual = (game.renderer?.quality) || s.quality || 'mid';
  const qSeg = h('div', { class: 'seg' }, [['low', '低'], ['mid', '中'], ['high', '高']].map(([v, l]) => h('button', { type: 'button', class: `seg-b${qual === v ? ' on' : ''}`,
    onclick: (e) => { save({ quality: v }); try { game.renderer?.setQuality?.(v); } catch { /* ignore */ } qSeg.querySelectorAll('.seg-b').forEach((b) => b.classList.remove('on')); e.currentTarget.classList.add('on'); } }, h('span', { class: 'seg-l' }, l))));

  const el = h('div', { class: 'sheet narrow settings-sheet', tabindex: '-1' },
    head('設定', screens),
    h('div', { class: 'sheet-body col gap' },
      h('section', { class: 'field' }, h('h3', { class: 'field-h' }, '音量'),
        VOL.map(([b, l]) => slider(l, 0, 1, 0.05, vol[b] ?? 0.7, (v) => { vol[b] = v; game.audio?.setVolume?.(b, v); save({ vol: { ...vol } }); }))),
      h('section', { class: 'field' }, h('h3', { class: 'field-h' }, '操作'),
        slider('マウス・視点の 感度', 0.3, 2.5, 0.05, s.sens ?? game.input?.sensitivity ?? 1, (v) => { if (game.input) game.input.sensitivity = v; save({ sens: v }); }, (v) => `×${(+v).toFixed(2)}`),
        slider('ジェスチャーの 感度', 0.5, 2, 0.05, s.gsens ?? 1, (v) => { game.hands?.motion?.setSensitivity?.(v); save({ gsens: v }); }, (v) => `×${(+v).toFixed(2)}`),
        toggle('カメラの 小窓を 出す（ジェスチャー時）', s.camPreview !== false, (v) => save({ camPreview: v }))),
      h('section', { class: 'field' }, h('h3', { class: 'field-h' }, '画面'),
        h('div', { class: 'row gap center-y' }, h('span', { class: 'muted small' }, '画質'), qSeg),
        toggle('画面の ゆれを 減らす', s.reduceShake, (v) => save({ reduceShake: v })),
        toggle('字幕を 出す', s.subtitles !== false, (v) => save({ subtitles: v }))),
      h('button', { class: 'btn ghost small', onclick: () => screens.show('gesture', { from: 'settings' }) }, '✋ ジェスチャーの 練習')));
  return { el };
}
