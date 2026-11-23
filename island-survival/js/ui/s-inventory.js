// ui/s-inventory.js — inventory (Tab / I), body status tab, and the eat-confirmation card.
import { h, clear } from './dom.js';
import { defOf, nameOf, iconOf, rankOf, freshStage, cookName, PROC_NAMES, tagChips, fmtKg, head, toast } from './common.js';

const FILTERS = [['all', 'すべて'], ['food', '食べ物'], ['tool', '道具・服'], ['mat', '素材'], ['med', '薬']];
const catGroup = (d) => (['food', 'herb'].includes(d.cat) || d.food ? 'food' : ['tool', 'weapon', 'ammo', 'clothing', 'container'].includes(d.cat) ? 'tool' : ['medicine'].includes(d.cat) || d.med ? 'med' : 'mat');
const CAT_ORDER = { food: 0, tool: 1, med: 2, mat: 3 };

function stackInfo(game, st) {
  const d = defOf(st.id, st);
  return { d, name: nameOf(game, st), icon: d.icon || '📦', rank: rankOf(st.q ?? 40), group: catGroup(d) };
}

export default function inventory(ctx, data = {}) {
  const { game, screens } = ctx;
  const P = () => game.sys?.player;
  const stacksOf = () => [...(P()?.inv?.stacks || [])];
  let sel = data.uid ?? null, filter = 'all', tab = data.tab || 'items', sig = '';
  const list = h('div', { class: 'slot-grid' });
  const detail = h('div', { class: 'detail paper-inset' });
  const wbar = h('div', { class: 'wbar' }, h('div', { class: 'bar' }, h('i')), h('span', { class: 'wtxt small' }));
  const wearBox = h('div', { class: 'wear-strip' });
  const filt = h('div', { class: 'seg small' }, FILTERS.map(([v, l]) => h('button', { type: 'button', class: 'seg-b', 'data-v': v, onclick: () => { filter = v; renderList(); } }, h('span', { class: 'seg-l' }, l))));
  const itemsPane = h('div', { class: 'inv-main' },
    h('div', { class: 'inv-left' }, h('div', { class: 'row gap center-y wrap-row' }, wbar, filt), wearBox, list),
    detail);
  const bodyPane = h('div', { class: 'body-pane' });
  const tabs = h('div', { class: 'tabs' },
    h('button', { class: 'tab', 'data-t': 'items', onclick: () => { tab = 'items'; renderAll(); } }, '🎒 持ち物'),
    h('button', { class: 'tab', 'data-t': 'body', onclick: () => { tab = 'body'; renderAll(); } }, '❤ 体の 様子'));
  const el = h('div', { class: 'sheet wide inv-sheet', tabindex: '-1' }, head('持ち物', screens, tabs), h('div', { class: 'sheet-body no-pad' }, itemsPane, bodyPane));

  function renderList() {
    filt.querySelectorAll('.seg-b').forEach((b) => b.classList.toggle('on', b.dataset.v === filter));
    clear(list);
    let all = stacksOf().map((s) => ({ s, ...stackInfo(game, s) }));
    all.sort((a, b) => CAT_ORDER[a.group] - CAT_ORDER[b.group] || a.name.localeCompare(b.name, 'ja'));
    if (filter !== 'all') all = all.filter((x) => x.group === filter);
    if (!all.length) list.append(h('p', { class: 'muted pad' }, 'ここには なにも ありません。'));
    if (!all.some((x) => x.s.uid === sel)) sel = all[0]?.s.uid ?? null;
    for (const { s, name, icon, rank, d } of all) {
      const fs = s.fresh != null && d.food ? freshStage(s.fresh) : null;
      const cls = `slot ${rank.cls}${s.uid === sel ? ' sel' : ''}`;
      list.append(h('button', { type: 'button', class: cls, title: name, onclick: () => { sel = s.uid; renderList(); renderDetail(); } },
        h('span', { class: 'slot-icon' }, icon),
        s.n > 1 ? h('span', { class: 'slot-n' }, `×${s.n}`) : null,
        h('span', { class: 'slot-name' }, name),
        fs ? h('span', { class: 'slot-fresh', style: { '--c': fs.color, '--w': `${Math.max(6, s.fresh)}%` } }, h('i')) : null,
        s.wet > 40 ? h('span', { class: 'slot-wet', title: '濡れている' }, '💧') : null,
        s.done >= 30 ? h('span', { class: 'slot-cook' }, '🔥') : null));
    }
  }

  function line(k, v) { return h('div', { class: 'kv' }, h('span', { class: 'k' }, k), h('span', { class: 'v' }, v)); }

  function renderDetail() {
    clear(detail);
    const st = stacksOf().find((x) => x.uid === sel);
    if (!st) { detail.append(h('p', { class: 'muted pad' }, 'アイテムを えらんでください。')); return; }
    const { d, name, icon, rank } = stackInfo(game, st);
    const A = game.actions || {};
    const after = (fn, msg) => async () => {
      try { await fn?.(); } catch (e) { console.error(e); toast(game, `できませんでした：${e.message || e}`, 'warn'); }
      if (msg) toast(game, msg, 'info');
      renderAll();
    };
    const attrs = st.attrs || d.attrs;
    const info = [];
    info.push(line('重さ', `${fmtKg((d.weight || 0) * st.n)}（${st.n} 個）`));
    if (st.q != null) info.push(line('品質', h('span', { class: `rank ${rank.cls}` }, `${rank.name}（${Math.round(st.q)}）`)));
    if (st.fresh != null && d.food) { const fs = freshStage(st.fresh); info.push(line('鮮度', h('span', { class: 'fresh-line' }, h('span', { class: 'bar mini', style: { '--c': fs.color } }, h('i', { style: { width: `${st.fresh}%` } })), h('b', { style: { color: fs.color } }, fs.name)))); }
    if (st.done) info.push(line('火の通り', cookName(st.done)));
    if (st.proc && st.proc !== 'none') info.push(line('加工', PROC_NAMES[st.proc] || st.proc));
    if (st.wet > 5) info.push(line('濡れ', `${Math.round(st.wet)}%`));
    if (st.dur != null) info.push(line('耐久', `あと ${Math.round(st.dur)} 回`));
    if (st.water) info.push(line('水', `${st.water.cups ?? '?'} 杯${st.water.treat && st.water.treat !== 'none' ? `（${{ boil: '煮沸ずみ', filter: 'ろ過ずみ' }[st.water.treat] || st.water.treat}）` : ''}`));
    if (st.stats) { const t = Object.entries(st.stats).map(([k, v]) => `${{ sharp: '鋭さ', melee: '近接', chop: '伐採', power: '威力', range: '射程', liters: '容量' }[k] || k} ${v}`); info.push(line('性能', t.join('　'))); }

    const isFood = !!(d.food || attrs?.edible);
    const btn = (label, fn, cls = '') => h('button', { type: 'button', class: `btn small ${cls}`, onclick: fn }, label);
    const acts = [];
    if (isFood) acts.push(btn('🍴 食べる', () => screens.show('eat', { uid: st.uid, from: 'inventory' }), 'primary'));
    if (st.water || d.drink) acts.push(btn('💧 飲む', after(() => A.drink?.(st.uid))));
    if (d.tool || ['tool', 'weapon', 'ammo'].includes(d.cat)) acts.push(btn('✋ 持つ', after(() => A.equip?.(st.uid), `${name}を 手に 持った`)));
    if (d.wear) acts.push(btn('👕 着る', after(() => A.wear?.(st.uid))));
    if (d.med || d.cat === 'medicine') acts.push(btn('🩹 手当てに 使う', after(() => A.treat?.(st.uid))));
    if (A.canSharpen?.(st.uid)) acts.push(btn('🪨 研ぐ', after(() => A.sharpen?.(st.uid))));
    if (d.use || d.cat === 'medicine') acts.push(btn('使う', after(() => A.use?.(st.uid))));
    acts.push(btn('🔍 調べる', after(() => A.inspect?.(st.uid))));
    if (game.sys?.companion && game.sys.companion.present !== false) acts.push(btn('🤝 仲間に 渡す', after(() => A.giveToCompanion?.(st.uid, 1))));
    acts.push(btn('⬇ 置く', after(() => A.drop?.(st.uid, 1)), 'ghost'));
    if (['container'].includes(d.cat) || d.container) acts.push(btn('🪣 水を くむ', after(() => A.fillContainer?.(st.uid))));

    const hot = P()?.hotbar || [];
    const hotRow = h('div', { class: 'hot-assign' }, h('span', { class: 'muted small' }, 'ホットバー'),
      [1, 2, 3, 4, 5, 6].map((i) => h('button', { type: 'button', class: `btn mini${hot[i - 1] === st.uid ? ' on' : ''}`, 'aria-label': `スロット ${i} に 登録`, onclick: () => setHot(i - 1, st.uid) }, i)));
    detail.append(
      h('div', { class: 'd-head' }, h('div', { class: `d-icon ${rank.cls}` }, icon), h('div', null, h('h3', { class: `d-name ${rank.cls}` }, name), h('div', { class: 'muted small' }, d.cat ? ({ food: '食べ物', herb: '薬草', tool: '道具', weapon: '武器', ammo: '弾・矢', clothing: '衣類', container: '容器', material: '素材', medicine: '薬', fuel: '燃料', misc: 'その他' }[d.cat] || d.cat) : ''))),
      d.desc ? h('p', { class: 'd-desc' }, d.desc) : null,
      h('div', { class: 'tags' }, tagChips(attrs, 12)),
      h('div', { class: 'kvs' }, info),
      h('div', { class: 'acts' }, acts), hotRow);
  }
  function setHot(i, uid) {
    const p = P(); if (!p) return;
    try {
      if (p.setHotbar) p.setHotbar(i, uid);
      else { p.hotbar = p.hotbar || []; for (let k = 0; k < p.hotbar.length; k++) if (p.hotbar[k] === uid) p.hotbar[k] = null; p.hotbar[i] = uid; }
    } catch (e) { console.error(e); }
    renderDetail();
  }

  function renderWeight() {
    const p = P(); const w = p?.inv?.weight?.() ?? 0; const cap = p?.capacity ?? p?.inv?.capacity ?? 25;
    const f = wbar.querySelector('.bar'); f.firstChild.style.width = `${Math.min(100, (w / cap) * 100)}%`; f.classList.toggle('over', w > cap);
    wbar.querySelector('.wtxt').textContent = `${fmtKg(w)} / ${fmtKg(cap)}`;
    clear(wearBox);
    const wear = p?.wear || {};
    for (const [slot, label] of [['head', '頭'], ['body', '体'], ['cloak', '外套'], ['feet', '足'], ['bed', '寝具']]) {
      const s = wear[slot] != null ? p.inv.get?.(wear[slot]) : null;
      wearBox.append(h('span', { class: `wear-s${s ? ' on' : ''}` }, h('em', null, label), s ? `${iconOf(s)} ${nameOf(game, s)}` : '—'));
    }
  }

  function renderBody() {
    clear(bodyPane);
    const b = P()?.body; const s = b?.s || {};
    const rows = [['hp', '体力', '#e5484d'], ['food', '満腹', '#f08a24'], ['water', '水分', '#3b9be6'], ['rest', '睡眠', '#8c6cd9'], ['morale', '気力', '#e3b82a'], ['stamina', 'スタミナ', '#4fa86b'], ['hygiene', '清潔', '#56b0b8'], ['wet', '濡れ', '#6a8fb5']];
    bodyPane.append(h('div', { class: 'body-grid' },
      h('div', { class: 'paper-inset pad' }, h('h3', null, '全パラメータ'),
        rows.map(([k, l, c]) => h('div', { class: 'stat-row' }, h('span', null, l), h('div', { class: 'bar', style: { '--c': c } }, h('i', { style: { width: `${Math.max(0, Math.min(100, s[k] ?? 0))}%` } })), h('b', null, Math.round(s[k] ?? 0)))),
        h('div', { class: 'stat-row' }, h('span', null, '体温'), h('b', { class: 'big-temp' }, `${(s.bodyTemp ?? 36.8).toFixed(1)}℃`), h('span', { class: 'muted small' }, `体感 ${(b?.feel ?? 0).toFixed(0)}℃`))),
      h('div', { class: 'paper-inset pad' }, h('h3', null, '状態と 手当て'),
        (b?.visible?.() || []).length ? (b.visible()).map((c) => h('div', { class: 'cond' }, h('span', { class: 'cond-i' }, c.icon), h('div', null, h('b', null, `${c.name}${['', '（軽）', '（中）', '（重）'][c.sev] || ''}`, c.bleeding ? '　出血中' : ''), h('div', { class: 'muted small' }, c.treat || '')))) : h('p', { class: 'muted' }, 'いまは どこも 悪くありません。'))));
  }

  function renderAll() {
    tabs.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.t === tab));
    itemsPane.classList.toggle('hidden', tab !== 'items'); bodyPane.classList.toggle('hidden', tab !== 'body');
    if (tab === 'items') { renderWeight(); renderList(); renderDetail(); } else renderBody();
    sig = signature();
  }
  const signature = () => `${tab}|${stacksOf().map((s) => `${s.uid}:${s.n}:${Math.round(s.fresh ?? 0)}`).join(',')}`;
  renderAll();
  let acc = 0;
  return {
    el,
    update(dt) { acc += dt; if (acc < 0.5) return; acc = 0; if (tab === 'body') renderBody(); else if (signature() !== sig) renderAll(); },
    onKey(e) { if (/^Digit[1-6]$/.test(e.code) && sel != null && tab === 'items') { setHot(+e.code.slice(5) - 1, sel); return true; } return false; },
  };
}

// ------------------------------------------------------------------ eat confirmation card (DESIGN §7.4 / §20.3)
const BAND_CLS = ['good', 'ok', 'warn', 'bad'];
export function eat(ctx, data = {}) {
  const { game, screens } = ctx;
  const st = game.sys?.player?.inv?.get?.(data.uid);
  let card = null;
  try { card = game.actions?.eatCard?.(data.uid); } catch (e) { console.error(e); }
  card = card || { name: st ? nameOf(game, st) : '？？？', risk: { shown: 'unknown' }, warnings: [] };
  const d = st ? defOf(st.id, st) : { icon: '❓' };
  const r = card.risk || {};
  let riskEl;
  if (r.shown === 'percent') {
    const pct = r.p <= 1 ? r.p * 100 : r.p;
    const band = pct < 3 ? 0 : pct < 12 ? 1 : pct < 35 ? 2 : 3;
    riskEl = h('div', { class: `risk ${BAND_CLS[band]}` }, h('span', { class: 'risk-l' }, '発症率'), h('b', { class: 'risk-v' }, `${pct < 10 ? pct.toFixed(1).replace(/\.0$/, '') : Math.round(pct)}%`));
  } else if (r.shown === 'band') {
    const bi = r.band ?? 1;
    riskEl = h('div', { class: `risk ${BAND_CLS[bi] || 'ok'}` }, h('span', { class: 'risk-l' }, '危険の 目安'), h('b', { class: 'risk-v' }, r.label || ['安全そう', '少し 心配', 'あやしい', '危険'][bi]));
  } else if (r.shown === 'unknown') {
    riskEl = h('div', { class: 'risk bad' }, h('b', { class: 'risk-v' }, '正体不明。食べるのは 危険かも'));
  } else riskEl = h('div', { class: 'risk none muted' }, '危険の 目安は 分かりません');
  const back = () => (data.from ? screens.show(data.from) : screens.hide());
  const act = async (opts) => {
    try { await game.actions?.eat?.(data.uid, opts); } catch (e) { console.error(e); toast(game, `できませんでした：${e.message || e}`, 'warn'); }
    screens.hide();
  };
  const fs = st?.fresh != null ? freshStage(st.fresh) : null;
  const el = h('div', { class: 'sheet narrow eat-card', tabindex: '-1' },
    h('div', { class: 'sheet-body col gap' },
      h('div', { class: 'eat-head' }, h('span', { class: 'big-icon' }, d.icon || '🍴'), h('div', null, h('h2', { class: 'title' }, card.name || '？？？'),
        h('div', { class: 'muted small' }, [fs ? `鮮度：${fs.name}` : null, st?.done ? `火の通り：${cookName(st.done)}` : null, st?.proc && st.proc !== 'none' ? PROC_NAMES[st.proc] : null].filter(Boolean).join('　／　')))),
      h('div', { class: 'gains' }, card.foodGain != null ? h('span', { class: 'gain f' }, `満腹 +${Math.round(card.foodGain)}`) : null, card.waterGain ? h('span', { class: 'gain w' }, `水分 +${Math.round(card.waterGain)}`) : null),
      riskEl,
      (card.warnings || []).map((w) => h('div', { class: 'warn-line' }, '⚠ ', w)),
      h('div', { class: 'row gap wrap-row' },
        h('button', { class: 'btn primary', 'data-autofocus': '', onclick: () => act({}) }, '食べる'),
        h('button', { class: 'btn teal', onclick: () => act({ nibble: true }) }, 'かじって みる'),
        h('button', { class: 'btn ghost', onclick: back }, 'やめる'))));
  return { el, cls: 'center' };
}
