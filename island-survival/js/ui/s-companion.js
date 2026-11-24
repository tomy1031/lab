// ui/s-companion.js — companion menu (E on the companion; DESIGN §13.5): talk / ask / give-receive / condition / treat.
import { h, clear } from './dom.js';
import { defOf, nameOf, rankOf, head, toast } from './common.js';
import { sheetPanel } from './s-setup.js';
import { sheetSummary, stageOf, STAGES } from '../sim/companion-sheet.js';

const MOOD = { happy: ['😊', 'うれしそう'], normal: ['🙂', 'ふつう'], tired: ['😪', 'つかれている'], scared: ['😨', 'おびえている'], angry: ['😠', 'おこっている'], sad: ['😢', 'しずんでいる'], sick: ['🤒', '具合が わるい'] };
const TABS = [['talk', '💬 話す'], ['ask', '📋 頼む'], ['swap', '🤝 渡す・もらう'], ['look', '👀 様子'], ['treat', '🩹 手当て']];

export default function companion(ctx, data = {}) {
  const { game, screens } = ctx;
  const C = game.sys?.companion;
  let tab = data.tab || 'talk';
  const pane = h('div', { class: 'comp-pane' });
  const bubble = h('div', { class: 'bubble hidden' });
  const nm = C?.name || C?.def?.name || '仲間';
  const tabs = h('div', { class: 'tabs scroll' }, TABS.map(([id, l]) => h('button', { class: 'tab', 'data-t': id, onclick: () => { tab = id; render(); } }, l)));
  const el = h('div', { class: 'sheet wide comp-sheet', tabindex: '-1' }, head(nm, screens, null), h('div', { class: 'sheet-body no-pad' }, tabs, bubble, pane));

  const status = () => {
    let s = {};
    try { s = C?.status?.() || {}; } catch { /* ignore */ }
    const body = C?.body?.s || C?.s || {};
    return { s: s.s || body, trust: s.trust ?? C?.trust ?? 40, affinity: s.affinity ?? C?.affinity ?? 20, mood: s.mood ?? C?.mood ?? 'normal', conditions: s.conditions || C?.body?.visible?.() || [], inv: s.inv || C?.inv?.stacks || C?.inventory?.stacks || [] };
  };
  const say = (t) => { if (!t) return; bubble.classList.remove('hidden'); bubble.textContent = typeof t === 'string' ? t : (t.text || ''); };
  const safe = async (fn) => { try { return await fn(); } catch (e) { console.error(e); toast(game, `できませんでした：${e.message || e}`, 'warn'); return null; } };

  function renderTalk() {
    let topics = []; try { topics = C?.topics?.() || []; } catch { /* ignore */ }
    if (!topics.length) topics = [{ id: 'hello', label: 'こんにちは' }, { id: 'weather', label: '天気の はなし' }, { id: 'island', label: 'この島の こと' }, { id: 'rescue', label: '助けは 来る？' }];
    const answerBox = h('div', { class: 'consult-answers' });
    pane.append(h('div', { class: 'topic-grid' }, topics.map((t) => h('button', { class: `btn ${t.id === 'consult' ? 'teal' : ''}`, onclick: async () => {
      const r = await safe(() => (C?.discuss ? C.discuss(t.id) : typeof C?.talk === 'function' ? C.talk(t.id) : null));
      clear(answerBox);
      if (r && typeof r === 'object') {
        // 相談 (§24.8): the companion's proposal with three answers
        say(r.text || '…');
        answerBox.append(...(r.choices || []).map((o) => h('button', { class: `btn ${o.id === 'ok' ? 'primary' : ''}`, onclick: async () => { const t2 = await safe(() => C?.answer?.(o.id)); if (t2) say(t2); clear(answerBox); if (o.id !== 'no') setTimeout(() => screens.hide(), 900); } }, o.label)));
      } else say(r || '…');
    } }, t.icon ? `${t.icon} ${t.label}` : t.label))), answerBox);
    if (C?.liveAvailable) {
      const mic = h('button', { class: 'btn teal mic', onclick: async () => {
        const on = !mic.classList.contains('live');
        mic.classList.toggle('live', on); mic.textContent = on ? '🎤 聞いています…（もう一度で おわり）' : '🎤 マイクで 話す';
        await safe(() => (on ? C.startMic?.() ?? C.startLive?.() : C.stopMic?.() ?? C.stopLive?.()));
      } }, '🎤 マイクで 話す');
      pane.append(mic, h('p', { class: 'muted small' }, 'ボタンを 押すと 声で 自由に 話せます。'));
    } else pane.append(h('p', { class: 'muted small' }, 'Gemini の キーが あると、声で 自由に 話せます。（設定画面で 入れられます）'));
  }
  function renderAsk() {
    let jobs = []; try { jobs = C?.jobs?.() || []; } catch { /* ignore */ }
    if (!jobs.length) pane.append(h('p', { class: 'muted pad' }, 'いまは 頼める 仕事が ありません。'));
    pane.append(h('div', { class: 'job-list' }, jobs.map((j) => h('button', { class: 'card job', disabled: j.available === false || null, onclick: async () => {
      await safe(() => C?.ask?.(j.id)); // the answer comes as the companion's own line (subtitle)
      screens.hide();
    } }, h('span', { class: 'job-i' }, j.icon || '📌'), h('span', null, h('b', null, j.label || j.name), h('span', { class: 'muted small block' }, j.available === false ? (j.reason || '今は できません') : (j.desc || '')))))));
  }
  function stackBtn(s, onclick) {
    const d = defOf(s.id, s);
    return h('button', { class: `craft-item ${rankOf(s.q ?? 40).cls}`, onclick }, h('span', { class: 'ci-icon' }, d.icon || '📦'), h('span', { class: 'ci-main' }, h('span', { class: 'ci-name' }, nameOf(game, s), s.n > 1 ? h('em', null, ` ×${s.n}`) : null)));
  }
  function renderSwap() {
    const mine = game.sys?.player?.inv?.stacks || [];
    const theirs = status().inv;
    pane.append(h('div', { class: 'swap' },
      h('div', null, h('h3', { class: 'col-h' }, 'あなたの 持ち物（渡す）'), h('div', { class: 'craft-list' }, mine.map((s) => stackBtn(s, async () => { await safe(() => game.actions?.giveToCompanion?.(s.uid, 1) ?? C?.give?.(s.uid, 1)); render(); })))),
      h('div', null, h('h3', { class: 'col-h' }, `${nm}の 持ち物（もらう）`), h('div', { class: 'craft-list' }, theirs.length ? theirs.map((s) => stackBtn(s, async () => { await safe(() => C?.take?.(s.uid, 1)); render(); })) : h('p', { class: 'muted pad' }, '何も 持っていません。')))));
  }
  const meter = (n, max, on, off, blur) => h('span', { class: 'meter', style: blur ? { filter: `blur(${blur}px)` } : null }, Array.from({ length: max }, (_, i) => {
    const f = Math.max(0, Math.min(1, n - i)); return h('span', { class: 'm-unit', style: { '--f': `${f * 100}%` } }, f > 0.66 ? on : f > 0.33 ? on : off);
  }));
  function renderLook() {
    const st = status();
    const [mi, ml] = MOOD[st.mood] || MOOD.normal;
    const bar = (l, k, c) => h('div', { class: 'stat-row' }, h('span', null, l), h('div', { class: 'bar', style: { '--c': c } }, h('i', { style: { width: `${Math.max(0, Math.min(100, st.s[k] ?? 0))}%` } })));
    const trustTxt = st.trust < 20 ? 'まだ 心を 開いていない' : st.trust < 60 ? '少しずつ 信じて くれている' : 'しっかり 信じて くれている';
    const stage = stageOf(st.affinity);
    const hearts = (n) => h('span', { class: 'hearts', role: 'img', 'aria-label': `${n} / 5` }, Array.from({ length: 5 }, (_, i) => h('i', { class: i < n ? 'on' : '' }, i < n ? '♥' : '♡')));
    let sheet = null; try { sheet = C?.sheet || game.sys?.companion?.sheet || null; } catch { /* ignore */ }
    const affTxt = ['まだ 遠慮が ある。頼まれた ことだけ やる', 'ふつうに 話せる。頼めば 分けて くれる', 'うちとけて きた。困って いると 自分から 助けて くれる', '仲が いい。先回りして 動いて くれる', 'かけがえの ない 相棒。自分が 空腹でも 半分 くれる'][stage - 1];
    pane.append(h('div', { class: 'look-grid' },
      h('div', { class: 'paper-inset pad' }, h('h3', null, `${nm}の 体調`), h('div', { class: 'mood' }, h('span', { class: 'mood-i' }, mi), h('b', null, ml)),
        bar('体力', 'hp', '#e5484d'), bar('満腹', 'food', '#f08a24'), bar('水分', 'water', '#3b9be6'), bar('睡眠', 'rest', '#8c6cd9'), bar('気力', 'morale', '#e3b82a'),
        st.conditions.length ? h('div', { class: 'tags' }, st.conditions.map((c) => h('span', { class: 'tag' }, `${c.icon || ''} ${c.name}`))) : h('p', { class: 'muted small' }, '特に 悪い ところは なさそう。')),
      h('div', { class: 'paper-inset pad' }, h('h3', null, '気もち'),
        h('div', { class: 'stat-row' }, h('span', null, '親密'), hearts(stage), h('span', { class: 'stage-name' }, STAGES[stage - 1].name)), h('p', { class: 'muted small' }, affTxt),
        h('div', { class: 'stat-row' }, h('span', null, '信頼'), meter(st.trust / 20, 5, '🛡', '▫', 1.4)), h('p', { class: 'muted small' }, trustTxt),
        h('p', { class: 'muted small' }, '※ はっきりした 数字は 見えません。')),
      sheet ? h('div', { class: 'paper-inset pad cs-wrap' }, h('h3', null, `${nm}の キャラクターシート`), sheetPanel(sheetSummary(sheet))) : null));
  }
  function renderTreat() {
    const meds = (game.sys?.player?.inv?.stacks || []).filter((s) => { const d = defOf(s.id, s); return d.med || d.cat === 'medicine'; });
    const st = status();
    pane.append(h('p', null, st.conditions.length ? `いまの 症状：${st.conditions.map((c) => c.name).join('、')}` : '特に 症状は 見あたりません。'),
      meds.length ? h('div', { class: 'craft-list' }, meds.map((s) => stackBtn(s, async () => { const r = await safe(() => C?.treat?.(s.uid)); if (r) say(r); toast(game, `${nm}を 手当てした`, 'good'); render(); })))
        : h('p', { class: 'muted pad' }, '手当てに 使える 薬や 包帯が ありません。'));
  }
  function render() {
    tabs.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.t === tab));
    clear(pane);
    if (!C) { pane.append(h('p', { class: 'muted pad' }, '仲間は いません。')); return; }
    ({ talk: renderTalk, ask: renderAsk, swap: renderSwap, look: renderLook, treat: renderTreat })[tab]();
  }
  render();
  return { el };
}
