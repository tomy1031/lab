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
      game.xr?.supported ? h('button', { class: 'btn teal', onclick: () => game.enterVR?.() }, '🥽 VR で 遊ぶ') : null,
      h('button', { class: 'btn', onclick: () => screens.show('settings', { from: 'pause' }) }, '⚙ 設定'),
      h('button', { class: 'btn', onclick: () => screens.show('gesture', { from: 'pause' }) }, '✋ ジェスチャーの 練習'),
      canRetire ? h('button', { class: 'btn ghost', onclick: () => ask('発煙筒で リタイアしますか？（スコア ×0.3）', () => { screens.hide(); game.retire?.(); }, 'リタイア') }, 'リタイアする') : null,
      h('button', { class: 'btn ghost', onclick: () => ask('セーブしていない 進行は 失われます。タイトルへ もどりますか？', () => {
        if (game.toTitle) { game.toTitle(); } else { screens.show('title'); game.startAmbientPreview?.(); }
      }, 'タイトルへ') }, 'タイトルへ'),
      confirmRow, msg));
  return { el, back() { screens.hide(); return true; } };
}

export const HANDWORK = [['manual', '手で やる', '研ぐ・打つ・結ぶ を 自分の 手で。上手なら 品質が 上がる'], ['assist', '半自動', '最初の ひと区切りだけ 自分で。あとは 同じ 調子で 続ける'], ['auto', 'おまかせ', '短い アニメで 自動。品質は ふつう']];
export const BUTCHER_VIEW = [['normal', 'ふつう', '紙の 図で 手順を 行う。色は ひかえめ'], ['mild', 'ひかえめ', '影絵と 点線で 手順を 行う。赤い 色や 生々しい 言葉は 出ない'], ['skip', '省略', '手順を とばして 結果だけ 受け取る']];
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

  const isTouch = () => !!game.input?.touch || (game.setup?.control === 'touch');
  const hwNow = s.handwork || (isTouch() ? 'assist' : 'manual');
  const bvNow = s.butcherView || 'mild';
  const pick = (opts, cur, key, descEl) => {
    const wrap = h('div', { class: 'seg', role: 'group' });
    const show = (v) => { descEl.textContent = (opts.find((o) => o[0] === v) || [])[2] || ''; };
    for (const [v, l] of opts) {
      wrap.append(h('button', { type: 'button', class: `seg-b${cur === v ? ' on' : ''}`, 'aria-pressed': cur === v ? 'true' : 'false',
        onclick: () => { save({ [key]: v }); wrap.querySelectorAll('.seg-b').forEach((b) => { b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); }); const me = wrap.children[opts.findIndex((o) => o[0] === v)]; me.classList.add('on'); me.setAttribute('aria-pressed', 'true'); show(v); } }, h('span', { class: 'seg-l' }, l)));
    }
    show(cur);
    return wrap;
  };
  const hwDesc = h('p', { class: 'muted small opt-desc' });
  const bvDesc = h('p', { class: 'muted small opt-desc' });

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
      h('section', { class: 'field' }, h('h3', { class: 'field-h' }, '手の 作業'),
        pick(HANDWORK, hwNow, 'handwork', hwDesc), hwDesc,
        toggle('作業の ヒントを 出す', s.hints !== false, (v) => save({ hints: v }))),
      h('section', { class: 'field' }, h('h3', { class: 'field-h' }, '解体の 表現'),
        pick(BUTCHER_VIEW, bvNow, 'butcherView', bvDesc), bvDesc),
      h('button', { class: 'btn ghost small', onclick: () => screens.show('gesture', { from: 'settings' }) }, '✋ ジェスチャーの 練習'),
      offlineSection()));
  return { el };
}

/** オフライン: the state of the PWA cache and the optional hand-gesture pack */
function offlineSection() {
  const P = window.ISLE?.pwa;
  const status = h('p', { class: 'muted small' }, !P?.supported ? 'この ページは オフライン用の 版では ありません（lab サイトの 版で 使えます）' : P.ready ? 'オフラインで 遊べます。ホーム画面に 追加すると アプリの ように 開けます。' : 'オフライン用に ファイルを 保存中…');
  const handBtn = h('button', { class: 'btn ghost small', disabled: !P?.supported || null, onclick: async () => {
    handBtn.disabled = true; handBtn.textContent = '保存中…';
    const off = P.on((type, d) => { if (type === 'extra') { handBtn.textContent = `保存中…（${d.done}/${d.total}）`; if (d.done >= d.total) { handBtn.textContent = '✓ 手の 認識も オフラインで 使えます'; off(); } } });
    if (!(await P.cacheHands())) { handBtn.textContent = 'いまは 保存できません'; handBtn.disabled = false; }
  } }, '✋ 手の 認識も オフライン用に 保存（約 19 MB）');
  if (P?.supported) P.handsCached().then((ok) => { if (ok) { handBtn.textContent = '✓ 手の 認識も オフラインで 使えます'; handBtn.disabled = true; } });
  return h('section', { class: 'field' }, h('h3', { class: 'field-h' }, 'オフライン'), status, handBtn);
}
