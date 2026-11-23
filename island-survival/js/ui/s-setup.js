// ui/s-setup.js — game setup (DESIGN §2, §21.1): take-along items, companion, days, difficulty … + live severity / score multiplier.
import { h } from './dom.js';
import { getStarters, calcSetup, stars, prefs, head, toast } from './common.js';
import { loadSettings, getApiKey, setApiKey } from '../core/save.js';

let remembered = null; // survives opening the gesture practice screen and coming back

const COUNTS = [[0, '0 個', '裸一貫'], [1, '1 個', 'ひとつだけ'], [2, '2 個', 'ふたつ'], [3, '3 個', 'みっつ'], ['all', '全部', 'お試し']];
const DAYS = [[3, '3 日', 'おためし'], [7, '7 日', ''], [14, '14 日', ''], [30, '30 日', ''], [60, '60 日', ''], [100, '100 日', ''], [0, '無制限', '遭難']];
const DAYLEN = [[12, '12 分'], [24, '24 分'], [36, '36 分'], [48, '48 分'], [72, '72 分']];
const DIFFS = [['easy', 'のんびり', '病気も 減りも ゆるやか'], ['normal', 'ふつう', ''], ['hard', 'きびしい', ''], ['extreme', '極限', '']];
const SEASONS = [['dry', '乾季'], ['wet', '雨季'], ['auto', 'おまかせ']];
const COMPS = [['none', 'なし', ''], ['nagi', 'ナギ', '海の人'], ['touko', 'トウコ', '草木の人'], ['gen', 'ゲン', '大工']];
const AMMOS = [[12, '12 発'], [30, '30 発'], ['inf', '無限']];

export default function setup(ctx, data = {}) {
  const { game, screens } = ctx;
  const starters = getStarters(game);
  const coarse = matchMedia('(pointer: coarse)').matches;
  const saved = prefs.get().setup || {};
  const st = remembered || {
    count: 1, starters: ['knife'], ammo: 12, companion: 'none', days: 7, dayMinutes: 24, difficulty: 'normal', season: 'dry',
    seedMode: 'auto', seedText: '', control: coarse ? 'touch' : 'mouse', subtitles: true, micMode: 'auto', saveKey: false, apiKey: '', ...saved,
  };
  if (!st.apiKey) { try { st.apiKey = getApiKey(); if (st.apiKey) st.saveKey = true; } catch { /* ignore */ } }
  remembered = st;
  const upd = []; // refresh functions
  const refresh = () => { upd.forEach((f) => f()); try { const { apiKey, ...rest } = st; prefs.set({ setup: rest }); } catch { /* ignore */ } };

  const maxPick = () => (st.count === 'all' ? starters.length : st.count);
  function seg(key, opts, { onChange, cls = '' } = {}) {
    const wrap = h('div', { class: `seg ${cls}`, role: 'group' });
    const btns = opts.map(([v, label, sub, disabled]) => {
      const b = h('button', { type: 'button', class: 'seg-b', disabled: disabled || null, onclick: () => { if (disabled) return; st[key] = v; onChange?.(v); refresh(); } },
        h('span', { class: 'seg-l' }, label), sub ? h('span', { class: 'seg-s' }, sub) : null);
      wrap.appendChild(b);
      return [v, b];
    });
    upd.push(() => btns.forEach(([v, b]) => b.classList.toggle('on', st[key] === v)));
    return wrap;
  }
  const field = (label, ...kids) => h('section', { class: 'field' }, h('h3', { class: 'field-h' }, label), ...kids);

  // ---- take-along cards
  const hint = h('div', { class: 'pick-hint' });
  const cards = starters.map((s) => {
    const c = h('button', { type: 'button', class: 'card item-card', 'data-id': s.id, onclick: () => pick(s.id) },
      h('div', { class: 'ic-top' }, h('span', { class: 'ic-icon' }, s.icon), h('span', { class: 'ic-name' }, s.name)),
      h('div', { class: 'ic-meta' }, h('span', { class: 'stars' }, stars(s.star)), h('span', { class: 'mult' }, `×${s.score}`), s.p !== 'P0' ? h('span', { class: 'badge soft' }, s.p) : null),
      h('div', { class: 'ic-desc' }, s.desc),
      h('span', { class: 'ic-check' }, '✓'));
    return [s, c];
  });
  function pick(id) {
    if (st.count === 'all' || st.count === 0) return;
    const i = st.starters.indexOf(id);
    if (i >= 0) { st.starters.splice(i, 1); refresh(); return; }
    if (st.starters.length >= maxPick()) {
      if (maxPick() === 1) st.starters = [id];
      else { hintShake(); return; }
    } else st.starters.push(id);
    refresh();
  }
  const hintShake = () => { hint.classList.remove('shake'); void hint.offsetWidth; hint.classList.add('shake'); };
  upd.push(() => {
    if (st.count === 'all') st.starters = starters.map((s) => s.id);
    else if (st.count === 0) st.starters = [];
    else if (st.starters.length > st.count) st.starters = st.starters.slice(-st.count);
    else if (!st.starters.length && st.count) st.starters = [starters[0]?.id].filter(Boolean);
    cards.forEach(([s, c]) => {
      const on = st.starters.includes(s.id);
      c.classList.toggle('sel', on);
      c.classList.toggle('dis', st.count === 0);
      c.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    hint.textContent = st.count === 0 ? '何も 持たずに 上陸します（服と 腕時計と 日記帳だけ）。'
      : st.count === 'all' ? '全部 持っていきます（練習・お試し）。' : (st.starters.length >= st.count ? `${st.count} 個 えらびました。もう 一度 タップすると はずせます。` : `あと ${st.count - st.starters.length} 個 えらべます。`);
  });

  // ---- companion
  const compAvail = (id) => id === 'none' || game.companionAvailable?.(id) !== false;
  const compSeg = seg('companion', COMPS.map(([v, l, s]) => [v, l, compAvail(v) ? s : '準備中', !compAvail(v)]));

  // ---- seed
  const seedIn = h('input', { type: 'text', inputmode: 'numeric', maxlength: '8', placeholder: '数字 8 桁', class: 'inp', value: st.seedText || '',
    oninput: (e) => { st.seedText = e.target.value.replace(/\D/g, '').slice(0, 8); e.target.value = st.seedText; st.seedMode = st.seedText ? 'num' : 'auto'; refresh(); } });
  const dice = h('button', { type: 'button', class: 'btn small', onclick: () => { st.seedText = String(Math.floor(Math.random() * 1e8)).padStart(8, '0'); seedIn.value = st.seedText; st.seedMode = 'num'; refresh(); } }, '🎲 ふる');
  upd.push(() => { if (st.seedMode === 'auto' && document.activeElement !== seedIn) seedIn.value = ''; });

  // ---- API key
  const keyIn = h('input', { type: 'password', class: 'inp', autocomplete: 'off', placeholder: 'Gemini API キー（空でもよい）', value: st.apiKey || '', 'aria-label': 'Gemini API キー',
    oninput: (e) => { st.apiKey = e.target.value.trim(); } });
  const keyRes = h('div', { class: 'key-res small', role: 'status' });
  const testBtn = h('button', { type: 'button', class: 'btn small', onclick: async () => {
    if (!st.apiKey) { keyRes.className = 'key-res small bad'; keyRes.textContent = 'キーが 空です'; return; }
    keyRes.className = 'key-res small'; keyRes.textContent = 'しらべています…';
    try {
      const r = await game.testApiKey?.(st.apiKey);
      if (!r) { keyRes.textContent = 'この 環境では テストできません'; return; }
      keyRes.className = `key-res small ${r.ok ? 'good' : 'bad'}`;
      keyRes.textContent = r.ok ? `つながりました${r.model ? `（${r.model}）` : ''}` : `つながりません：${r.reason || '不明'}`;
    } catch (e) { keyRes.className = 'key-res small bad'; keyRes.textContent = `つながりません：${e.message || e}`; }
  } }, 'つながるか テスト');
  const saveChk = h('input', { type: 'checkbox', id: 'save-key', checked: st.saveKey || null, onchange: (e) => { st.saveKey = e.target.checked; } });

  const subChk = h('input', { type: 'checkbox', id: 'sub-on', checked: st.subtitles ? true : null, onchange: (e) => { st.subtitles = e.target.checked; } });

  const left = h('div', { class: 'setup-main' },
    field('持っていく数', seg('count', COUNTS, { cls: 'wrap5' })),
    field('持ち物', h('div', { class: 'item-grid' }, cards.map(([, c]) => c)), hint),
    field('弾の数（猟銃）', seg('ammo', AMMOS)),
    field('仲間', compSeg),
    field('日数', seg('days', DAYS, { cls: 'wrap' })),
    field('1 日の 長さ（現実の 時間）', seg('dayMinutes', DAYLEN)),
    field('難易度', seg('difficulty', DIFFS, { cls: 'wrap' })),
    field('季節の 始まり', seg('season', SEASONS)),
    field('島の シード', h('div', { class: 'row gap wrap-row' },
      seg('seedMode', [['auto', 'おまかせ'], ['num', '数字']], { onChange: (v) => { if (v === 'auto') seedIn.value = ''; else seedIn.focus(); } }), seedIn, dice)),
    field('操作', seg('control', [['mouse', 'マウス・キーボード'], ['touch', 'タッチ'], ['gesture', 'ハンドジェスチャー']], { cls: 'wrap' }),
      h('div', { class: 'row gap small-row', id: 'gesture-help' },
        h('button', { type: 'button', class: 'btn small', onclick: () => screens.show('gesture', { from: 'setup' }) }, '📷 カメラの 準備と 練習'),
        h('span', { class: 'muted small' }, 'カメラは 許可を もとめます。使えない ときは 自動で 代替操作に なります。'))),
    field('仲間と 声で 話す（Gemini Live API キー）',
      keyIn,
      h('div', { class: 'row gap wrap-row small-row' }, testBtn, h('label', { class: 'chk' }, saveChk, h('span', null, 'この ブラウザに 保存'))),
      keyRes,
      h('p', { class: 'muted small' }, 'キーは このブラウザの中だけに 保存され、Google の API 以外へは 送りません。なくても 遊べます（定型の 会話になります）。')),
    field('声・字幕', h('label', { class: 'chk' }, subChk, h('span', null, '字幕を 出す')),
      h('div', { class: 'row gap center-y' }, h('span', { class: 'muted small' }, 'マイク'), seg('micMode', [['auto', '自動'], ['ptt', '押して 話す']]))));

  // ---- summary (always visible)
  const sumStars = h('div', { class: 'sum-stars' });
  const sumMult = h('div', { class: 'sum-mult' });
  const sumParts = h('ul', { class: 'sum-parts' });
  const sumItems = h('div', { class: 'sum-items muted small' });
  upd.push(() => {
    const starterList = starters;
    const r = calcSetup(st, starterList);
    sumStars.textContent = '';
    sumStars.append(h('span', { class: 'stars big' }, stars(r.stars)), h('span', { class: 'sum-stars-l' }, ['', 'らくちん', 'おだやか', 'ふつう', 'きびしい', 'いのちがけ'][r.stars]));
    sumMult.textContent = `×${r.mult.toFixed(2)}`;
    sumParts.textContent = '';
    for (const p of r.parts) sumParts.append(h('li', null, h('span', null, p.label), h('b', null, `×${p.v.toFixed(2).replace(/0$/, '')}`)));
    const names = st.count === 'all' ? ['全部'] : starters.filter((s) => st.starters.includes(s.id)).map((s) => `${s.icon} ${s.name}`);
    sumItems.textContent = `持ち物：${names.length ? names.join('、') : 'なし（裸一貫）'}`;
  });
  const go = h('button', { type: 'button', class: 'btn primary xl go', onclick: () => start() }, '出発');
  const right = h('aside', { class: 'setup-sum' },
    h('div', { class: 'sum-card' },
      h('div', { class: 'sum-h' }, '予想される きびしさ'), sumStars,
      h('div', { class: 'sum-h' }, 'スコア倍率'), sumMult, sumParts, sumItems),
    go);

  async function start() {
    go.disabled = true;
    const seed = st.seedMode === 'num' && st.seedText ? parseInt(st.seedText, 10) : Math.floor(Math.random() * 1e8);
    const s = loadSettings();
    const out = {
      count: st.count, starters: st.count === 'all' ? starters.map((x) => x.id) : st.starters.slice(), ammo: st.ammo, companion: st.companion,
      days: st.days, dayMinutes: st.dayMinutes, difficulty: st.difficulty, season: st.season, seed, control: st.control,
      subtitles: !!st.subtitles, micMode: st.micMode, quality: s.quality || game.renderer?.quality, playerName: 'あなた',
    };
    if (st.apiKey) out.apiKey = st.apiKey;
    try { setApiKey(st.saveKey ? st.apiKey : ''); } catch { /* ignore */ }
    screens.show('loading', { text: '島に 向かっています…', progress: null });
    try {
      if (st.control === 'gesture') { try { await game.startGestures?.(); } catch (e) { console.warn(e); toast(game, 'カメラが 使えません。マウス・キーボードに きりかえます。', 'warn'); out.control = 'mouse'; } }
      await game.newGame(out);
      remembered = null;
      if (screens.current === 'loading') screens.hide();
    } catch (e) {
      console.error(e);
      toast(game, `はじめられませんでした：${e.message || e}`, 'warn');
      screens.show('setup', { from: 'title' });
    }
  }

  const el = h('div', { class: 'sheet setup-sheet', tabindex: '-1' },
    head('島へ 出発', screens), h('div', { class: 'sheet-body setup-body' }, left, right));
  refresh();
  return { el, cls: 'solid' };
}
