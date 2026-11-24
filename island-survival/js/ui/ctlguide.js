// ui/ctlguide.js — the controls guide on the screen (DESIGN §27.6): a small panel with the buttons of the control
// chosen (mouse + keys / touch / hand gestures), and, in a browser with VR (Meta Quest), how to get into the headset.
// H, the 「？ 操作」 button on the HUD or 設定 → 「操作ガイドを 出す」 shows / hides it; the choice is kept.
import { h, clear } from './dom.js';
import { loadSettings, saveSettings } from '../core/save.js';

const ROWS = {
  mouse: [['WASD', '歩く（Shift：走る　Space：跳ぶ　Ctrl：しゃがむ）'], ['マウス', '見回す'], ['E', '指した 物の 行動（ホイールで 選ぶ）'], ['左クリック', '道具を 使う（切る・撃つ・竿を 振る）'], ['右クリック', '構える・弓を 引く'],
    ['F', '食べる・飲む'], ['Tab', '持ち物'], ['C ／ B', '作る ／ 建てる'], ['Z', '寝る'], ['G ／ T', '仲間を 呼ぶ ／ 話す'], ['Esc', 'メニュー']],
  touch: [['左下を ドラッグ', '歩く（大きく 倒すと 走る）'], ['右側を ドラッグ', '見回す'], ['行動ボタン', '指した 物の 行動'], ['道具ボタン', '持った 道具を 使う'], ['右上の ボタン', '持ち物・作る・建てる・メニュー']],
  gesture: [['つまむ・つかむ', '拾う・集める'], ['こぶしを 振り下ろす', '切る・割る'], ['手を 前へ 突き出す', '突く・投げる'], ['両手を こする', '火おこし'], ['手を 振る', '仲間を 呼ぶ'], ['両手を 交互に 振る', '歩く（設定で オン）'], ['WASD ／ E', 'キーでも 動ける']],
};
const VR_ROWS = [['1', 'ゲームを 始める（Quest の ブラウザで）'], ['2', '右下の「🥽 VR」を トリガーで 押す'], ['3', 'ヘッドセットの 中では 手元に ボタンの ガイド']];

export class ControlsGuide {
  constructor(game) {
    this.game = game;
    this.el = h('div', { id: 'ctl-guide', class: 'hidden', role: 'note', 'aria-label': '操作ガイド' });
    this.btn = h('button', { id: 'ctl-guide-btn', type: 'button', class: 'btn small ghost', title: '操作ガイド（H）', onclick: () => this.toggle() }, '？ 操作');
    const hud = document.getElementById('hud');
    hud?.append(this.el, this.btn);
    this.on = loadSettings().ctlGuide !== false;
    this.sig = '';
    game.input?.on?.('help', () => this.toggle());
    this.render();
  }

  get mode() { const c = this.game.setup?.control; return c === 'touch' || this.game.input?.touch ? 'touch' : c === 'gesture' ? 'gesture' : 'mouse'; }

  toggle(on = !this.on) {
    this.on = !!on;
    try { saveSettings({ ...loadSettings(), ctlGuide: this.on }); } catch { /* ignore */ }
    this.game.settings = { ...(this.game.settings || {}), ctlGuide: this.on };
    this.render();
  }

  render() {
    const xr = !!this.game.xr?.supported;
    const sig = `${this.on}|${this.mode}|${xr}|${this.game.settings?.camArmWalk ? 1 : 0}`;
    this.el.classList.toggle('hidden', !this.on);
    this.btn.classList.toggle('on', this.on);
    if (sig === this.sig) return;
    this.sig = sig;
    clear(this.el);
    const rows = ROWS[this.mode].filter(([k]) => k !== '両手を 交互に 振る' || this.game.settings?.camArmWalk);
    this.el.append(h('div', { class: 'cg-head' }, h('b', null, '操作ガイド'), h('button', { type: 'button', class: 'cg-x', 'aria-label': 'ガイドを 閉じる（H）', onclick: () => this.toggle(false) }, '× H')));
    if (xr) this.el.append(h('div', { class: 'cg-vr' }, h('b', null, '🥽 VR（Meta Quest）'), VR_ROWS.map(([k, v]) => h('div', { class: 'cg-row' }, h('kbd', null, k), h('span', null, v)))));
    this.el.append(h('div', { class: 'cg-list' }, rows.map(([k, v]) => h('div', { class: 'cg-row' }, h('kbd', null, k), h('span', null, v)))));
  }

  /** once a second is plenty (the control can change from the settings) */
  update(dt) { this.t = (this.t || 0) - dt; if (this.t <= 0) { this.t = 1; this.render(); } }
}
