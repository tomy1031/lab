// ui/s-craft.js — crafting (C): inventory list · 6 slots · 7 methods · candidate cards · result card · recipe book (DESIGN §11.10).
import { h, clear } from './dom.js';
import { defOf, nameOf, rankOf, tagChips, head, toast, sleepMs } from './common.js';

export const METHODS = [
  ['tie', '結ぶ', '🪢', '紐になる物で 組み合わせる'], ['carve', '削る', '🔪', '鋭い道具を 手に 持って 削る・切る'], ['weave', '編む', '🧺', '細い物を 3 つ以上'],
  ['mix', '混ぜる', '🥣', '粉・液・やわらかい物を 混ぜる'], ['knap', '割る', '🪨', '硬い物で 叩き割る'], ['heat', '火にかける', '🔥', '火の そばで 焼く・煮る'], ['pack', '詰める', '📦', '容器や 土台に 詰める・ぬる'],
];
const KIND = { recipe: '型', crude: '近い 型', generic: 'ありあわせ' };

export default function craft(ctx) {
  const { game, screens } = ctx;
  const C = () => game.sys?.crafting;
  const P = () => game.sys?.player;
  const slots = Array(6).fill(null);
  let method = null, tab = 'bench', busy = false, result = null, pv = {};
  const listEl = h('div', { class: 'craft-list' });
  const slotsEl = h('div', { class: 'craft-slots' });
  const methodsEl = h('div', { class: 'methods' });
  const candEl = h('div', { class: 'cands' });
  const goBtn = h('button', { type: 'button', class: 'btn primary xl', onclick: () => doCraft() }, '作る');
  const prog = h('div', { class: 'bar big craft-prog hidden' }, h('i'));
  const bench = h('div', { class: 'craft-bench' },
    h('div', { class: 'craft-left' }, h('h3', { class: 'col-h' }, '持ち物'), listEl),
    h('div', { class: 'craft-mid' }, h('h3', { class: 'col-h' }, '作業台'), slotsEl, candEl, prog, goBtn),
    h('div', { class: 'craft-right' }, h('h3', { class: 'col-h' }, '手法'), methodsEl));
  const book = h('div', { class: 'book hidden' });
  const resultEl = h('div', { class: 'craft-result hidden' });
  const tabs = h('div', { class: 'tabs' },
    h('button', { class: 'tab', 'data-t': 'bench', onclick: () => { tab = 'bench'; render(); } }, '🛠 作業台'),
    h('button', { class: 'tab', 'data-t': 'book', onclick: () => { tab = 'book'; render(); } }, '📒 レシピ帳'));
  const el = h('div', { class: 'sheet wide craft-sheet', tabindex: '-1' }, head('錬成', screens, tabs), h('div', { class: 'sheet-body no-pad rel' }, bench, book, resultEl));

  const stackOf = (uid) => P()?.inv?.get?.(uid) || P()?.inv?.stacks?.find((s) => s.uid === uid);
  const used = (uid) => slots.filter((u) => u === uid).length;
  const chosen = () => slots.filter((u) => u != null);

  function refreshPreview() {
    pv = {};
    const uids = chosen();
    for (const [m] of METHODS) {
      try { pv[m] = uids.length ? C()?.preview?.(m, uids) || null : null; } catch (e) { pv[m] = null; console.error(e); }
    }
    if (!method) method = METHODS.find(([m]) => pv[m] && !pv[m].missingTool && pv[m].candidates?.length)?.[0] || null;
  }

  function renderList() {
    clear(listEl);
    const stacks = [...(P()?.inv?.stacks || [])];
    if (!stacks.length) listEl.append(h('p', { class: 'muted pad' }, '素材が ありません。'));
    for (const s of stacks) {
      const d = defOf(s.id, s); const left = s.n - used(s.uid);
      listEl.append(h('button', { type: 'button', class: `craft-item ${rankOf(s.q ?? 40).cls}`, disabled: left <= 0 || null, onclick: () => add(s.uid) },
        h('span', { class: 'ci-icon' }, d.icon || '📦'),
        h('span', { class: 'ci-main' }, h('span', { class: 'ci-name' }, nameOf(game, s), s.n > 1 ? h('em', null, ` ×${left}`) : null), h('span', { class: 'tags tiny' }, tagChips(s.attrs || d.attrs, 4)))));
    }
  }
  function add(uid) {
    const i = slots.indexOf(null);
    if (i < 0) { toast(game, 'スロットが いっぱいです', 'info'); return; }
    slots[i] = uid; method = null; render();
  }
  function renderSlots() {
    clear(slotsEl);
    slots.forEach((uid, i) => {
      const s = uid != null ? stackOf(uid) : null;
      const d = s ? defOf(s.id, s) : null;
      slotsEl.append(h('button', { type: 'button', class: `cslot${s ? ' full' : ''}`, 'aria-label': s ? `${nameOf(game, s)} を はずす` : '空きスロット', onclick: () => { if (s) { slots[i] = null; method = null; render(); } } },
        s ? [h('span', { class: 'cs-icon' }, d.icon || '📦'), h('span', { class: 'cs-name' }, nameOf(game, s))] : h('span', { class: 'cs-empty' }, '＋')));
    });
  }
  function renderMethods() {
    clear(methodsEl);
    for (const [m, label, icon, tip] of METHODS) {
      const r = pv[m];
      const missing = r?.missingTool;
      const none = chosen().length && r && !missing && !(r.candidates?.length);
      const dis = !chosen().length || !r || !!missing || none;
      methodsEl.append(h('button', { type: 'button', class: `method${method === m ? ' on' : ''}`, disabled: dis || null, title: missing ? `手に 持つ 道具が 必要：${missing}` : tip, onclick: () => { method = m; render(); } },
        h('span', { class: 'm-icon' }, icon), h('span', { class: 'm-label' }, label),
        missing ? h('span', { class: 'm-sub' }, `要：${missing}`) : h('span', { class: 'm-sub' }, tip)));
    }
  }
  function renderCands() {
    clear(candEl);
    const r = method ? pv[method] : null;
    const cs = (r?.candidates || []).slice(0, 3);
    if (!chosen().length) candEl.append(h('p', { class: 'muted pad center-text' }, '素材を スロットに おいて ください。\n性質タグの 組み合わせで 何かが できるかも。'));
    else if (!cs.length) candEl.append(h('p', { class: 'muted pad center-text' }, method ? 'この 組み合わせでは 何も できなさそうです。' : '手法を えらんで ください。'));
    cs.forEach((c, i) => {
      const rk = c.q != null ? rankOf(c.q) : null;
      candEl.append(h('div', { class: `cand${i === 0 ? ' top' : ''}${c.known === false ? ' unk' : ''}` },
        h('span', { class: 'cand-icon' }, c.known === false ? '？' : (c.icon || '✨')),
        h('div', { class: 'cand-main' }, h('div', { class: 'cand-name' }, c.known === false ? '？？？' : c.name, h('span', { class: `badge ${c.kind}` }, KIND[c.kind] || c.kind)),
          h('div', { class: 'muted small' }, c.hint || c.desc || '')),
        rk ? h('span', { class: `rank ${rk.cls}` }, `予想 ${rk.name}`) : null));
    });
    goBtn.disabled = busy || !(cs.length && method && !r?.missingTool);
  }

  async function doCraft() {
    if (busy || !method) return;
    busy = true; goBtn.disabled = true;
    prog.classList.remove('hidden');
    const t0 = performance.now(), dur = 1300;
    while (performance.now() - t0 < dur) { prog.firstChild.style.width = `${((performance.now() - t0) / dur) * 100}%`; await sleepMs(30); }
    prog.classList.add('hidden');
    let res = null;
    try { res = await C()?.craft?.(method, chosen()); } catch (e) { console.error(e); res = { ok: false, reason: String(e.message || e) }; }
    busy = false;
    res = res || { ok: false, reason: '作れませんでした' };
    result = res;
    if (res.ok !== false) { slots.fill(null); method = null; }
    showResult(res);
    render();
  }
  function showResult(res) {
    clear(resultEl);
    resultEl.classList.remove('hidden');
    if (res.ok === false) {
      resultEl.append(h('div', { class: 'res-card fail' }, h('h2', { class: 'title' }, 'うまく いかなかった…'), h('p', null, res.reason || ''), h('button', { class: 'btn', 'data-autofocus': '', onclick: closeResult }, 'もどる')));
      return;
    }
    const s = res.stack || {}; const d = defOf(s.id, s); const rk = rankOf(s.q ?? 40);
    const stats = Object.entries(s.stats || {}).map(([k, v]) => h('span', { class: 'tag' }, { sharp: '鋭さ', melee: '近接', chop: '伐採', power: '威力', range: '射程', liters: '容量' }[k] || k, h('b', null, v)));
    resultEl.append(h('div', { class: `res-card ${rk.cls}` },
      res.first ? h('div', { class: 'first-ribbon' }, '初めて 作った！') : null,
      h('div', { class: 'res-icon' }, d.icon || '✨'),
      h('h2', { class: `title ${rk.cls}` }, s.name || nameOf(game, s) || d.name),
      h('div', { class: `rank big ${rk.cls}` }, `${rk.name}（${Math.round(s.q ?? 0)}）`),
      stats.length ? h('div', { class: 'tags' }, stats) : null,
      h('div', { class: 'tags' }, tagChips(s.attrs || d.attrs, 8)),
      d.desc ? h('p', { class: 'muted small' }, d.desc) : null,
      h('button', { class: 'btn primary', 'data-autofocus': '', onclick: closeResult }, 'つづける')));
    resultEl.querySelector('[data-autofocus]')?.focus();
  }
  function closeResult() { resultEl.classList.add('hidden'); result = null; render(); }

  function renderBook() {
    clear(book);
    let entries = [];
    try { entries = C()?.book?.() || []; } catch (e) { console.error(e); }
    const known = entries.filter((e) => e.known).length;
    book.append(h('div', { class: 'book-head muted' }, `発見した 型：${known} / ${entries.length}`));
    const grid = h('div', { class: 'book-grid' });
    for (const e of entries) {
      grid.append(h('div', { class: `card book-card${e.known ? '' : ' unk'}` },
        h('div', { class: 'bk-icon' }, e.known ? (e.icon || '✨') : '？'),
        h('div', { class: 'bk-main' }, h('div', { class: 'bk-name' }, e.known ? e.name : '？？？'),
          h('div', { class: 'muted small' }, e.known ? (e.desc || e.recipe || '') : (e.hint || 'まだ ひらめいて いない')),
          e.known && e.method ? h('span', { class: 'badge soft' }, (METHODS.find((m) => m[0] === e.method) || [])[1] || e.method) : null,
          e.known && e.made ? h('span', { class: 'badge soft' }, `作った 数 ${e.made}`) : null)));
    }
    book.append(grid);
  }

  function render() {
    tabs.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.t === tab));
    bench.classList.toggle('hidden', tab !== 'bench'); book.classList.toggle('hidden', tab !== 'book');
    if (tab === 'book') { renderBook(); return; }
    refreshPreview(); renderList(); renderSlots(); renderMethods(); renderCands();
  }
  render();
  return { el, back() { if (!resultEl.classList.contains('hidden')) { closeResult(); return true; } return false; } };
}
