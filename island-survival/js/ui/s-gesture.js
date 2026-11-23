// ui/s-gesture.js — gesture practice: the camera preview (#cam-preview is moved in here while open), the gesture list with live highlighting.
import { h } from './dom.js';
import { head, toast } from './common.js';

const GESTURES = [
  ['pinch', 'つまむ', '親指と 人さし指で つまむ（メニューの クリック）'], ['grab', 'つかむ', '手を にぎる'], ['release', 'はなす', 'にぎった 手を ひらく'],
  ['swing', 'ふる', '腕を ふりおろす（斧・棒）'], ['push', '押す', '手を 前へ 出す'], ['pull', '引く', '手を 手前に 引く'], ['reel', '巻く', '円を えがく（リール）'],
  ['rub', 'こする', '両手を こすり合わせる（きりもみ）'], ['strike', '打ち合わせる', '両手の こぶしを ぶつける（火打ち）'], ['loose', '矢を はなつ', '弓を 引いて はなす'],
  ['shoot', '撃つ', '指で 銃の かたち'], ['wave', '手を ふる', '大きく 左右に ふる（合図）'], ['throw', '投げる', '腕を ふって 投げる（網）'],
];
const STATUS = { off: 'カメラは オフです', camera: 'カメラを 起動中…', model: 'モデルを 読みこみ中…', ready: '準備 OK！ 手を 映して みましょう', error: 'カメラが 使えません' };

export default function gesture(ctx) {
  const { game, screens } = ctx;
  const cv = document.getElementById('cam-preview');
  const origParent = cv?.parentNode, origNext = cv?.nextSibling, origHidden = cv?.classList.contains('hidden');
  const stage = h('div', { class: 'cam-stage' });
  const stat = h('div', { class: 'cam-status' });
  const btn = h('button', { class: 'btn primary', 'data-autofocus': '', onclick: async () => {
    const on = game.hands && game.hands.status !== 'off' && game.hands.status !== 'error';
    try { if (on) await (game.stopGestures?.() ?? game.hands.stop?.()); else await game.startGestures?.(); } catch (e) { console.error(e); toast(game, 'カメラを 開始できませんでした', 'warn'); }
  } }, '📷 カメラを 開始');
  const items = new Map();
  const list = h('div', { class: 'gesture-list' }, GESTURES.map(([id, name, how]) => {
    const it = h('div', { class: 'g-item', 'data-g': id }, h('b', null, name), h('span', { class: 'muted small' }, how));
    items.set(id, it); return it;
  }));
  const timers = new Map();
  if (cv) { stage.append(cv); cv.classList.remove('hidden'); cv.classList.add('big'); }
  else stage.append(h('p', { class: 'muted pad' }, 'カメラの 表示が ありません'));
  const el = h('div', { class: 'sheet wide gesture-sheet', tabindex: '-1' }, head('ジェスチャーの 練習', screens),
    h('div', { class: 'sheet-body gesture-body' }, h('div', { class: 'col gap' }, stage, stat, btn,
      h('p', { class: 'muted small' }, '明るい 場所で、手が 画面の 中に 入るように。つまむと メニューを クリックできます。')), list));
  return {
    el,
    update() {
      const hs = game.hands;
      const status = hs?.status || 'off';
      stat.textContent = hs ? (STATUS[status] || status) : 'ジェスチャーは まだ 使えません';
      btn.textContent = status === 'off' || status === 'error' || !hs ? '📷 カメラを 開始' : '⏹ カメラを とめる';
      if (hs?.ready && cv) { try { hs.drawPreview?.(cv); } catch { /* ignore */ } }
      const now = performance.now();
      for (const ev of hs?.events || []) {
        const t = typeof ev === 'string' ? ev : ev.type;
        if (items.has(t)) timers.set(t, now + 900);
      }
      if (hs?.cursor?.pinch) timers.set('pinch', now + 200);
      for (const [id, it] of items) it.classList.toggle('hit', (timers.get(id) || 0) > now);
    },
    close() {
      if (cv && origParent) {
        cv.classList.remove('big');
        if (origHidden || !game.hands?.ready) cv.classList.add('hidden');
        origParent.insertBefore(cv, origNext && origNext.parentNode === origParent ? origNext : null);
      }
    },
  };
}
