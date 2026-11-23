// ui/s-result.js — ending (DESIGN §15): rescued / died / retired — headline, days, cause review, score breakdown, achievements.
import { h } from './dom.js';

const HEAD = { rescued: ['🚢', '生きて 帰れた'], died: ['🕯', '力 尽きた'], retired: ['🔥', 'リタイア'] };
export default function result(ctx, data = {}) {
  const { game, screens } = ctx;
  const type = data.type || (data.dead ? 'died' : 'rescued');
  const [icon, defHead] = HEAD[type] || HEAD.rescued;
  const sc = data.score;
  const again = () => {
    screens.show('loading', { text: 'もう一度 島へ…' });
    const run = game.restartGame ? game.restartGame() : game.newGame?.({ ...(game.setup || {}) });
    Promise.resolve(run).then(() => { if (screens.current === 'loading') screens.hide(); }).catch((e) => { console.error(e); screens.show('title'); });
  };
  const toTitle = () => { if (game.toTitle) game.toTitle(); else { screens.show('title'); game.startAmbientPreview?.(); } };
  const el = h('div', { class: `sheet result-sheet res-${type}`, tabindex: '-1' },
    h('div', { class: 'sheet-body result-body' },
      h('div', { class: 'res-hero' }, h('div', { class: 'res-big-icon' }, icon), h('h1', { class: 'title' }, data.headline || defHead),
        data.sub ? h('p', { class: 'res-sub' }, data.sub) : null,
        h('div', { class: 'muted' }, [data.days != null ? `${data.days} 日 生きのびた` : null, data.seed != null ? `シード ${data.seed}` : null].filter(Boolean).join('　／　'))),
      (data.review || []).length ? h('div', { class: 'paper-inset pad review' }, h('h3', null, type === 'died' ? '死因の ふりかえり' : 'ふりかえり'), h('ul', null, data.review.map((r) => h('li', null, r)))) : null,
      sc ? h('div', { class: 'paper-inset pad score' }, h('div', { class: 'score-top' }, h('div', null, h('div', { class: 'muted small' }, 'スコア'), h('b', { class: 'score-total' }, String(sc.total))), sc.rank ? h('div', { class: 'score-rank' }, sc.rank) : null),
        h('table', { class: 'tbl' }, h('tbody', null, (sc.parts || []).map((p) => h('tr', null, h('td', null, p.label), h('td', { class: 'num' }, String(p.value))))))) : null,
      (data.records || []).length ? h('div', { class: 'paper-inset pad' }, h('h3', null, '島での 記録'), (data.records).map((r) => h('div', { class: 'kv' }, h('span', { class: 'k' }, r.label), h('span', { class: 'v' }, String(r.value))))) : null,
      (data.achievements || []).length ? h('div', { class: 'paper-inset pad' }, h('h3', null, '🏅 実績'), h('div', { class: 'ach-list' }, data.achievements.map((a) => h('div', { class: 'ach' }, h('b', null, a.name || a), a.desc ? h('span', { class: 'muted small' }, a.desc) : null)))) : null,
    ),
    h('div', { class: 'sheet-foot' },
      data.canRetry && game.retryFromMorning ? h('button', { class: 'btn teal', onclick: () => { screens.hide(); game.retryFromMorning(); } }, 'その日の 朝から やり直す') : null,
      h('button', { class: 'btn primary', 'data-autofocus': '', onclick: again }, 'もう一度'),
      h('button', { class: 'btn', onclick: toTitle }, 'タイトルへ')));
  return { el, cls: 'solid' };
}
