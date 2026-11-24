// Builds docs/DESIGN.md from DESIGN.tpl.md + the data files + a fresh balance run.
import fs from 'node:fs';
import { CARDS, CARD_BY_ID, KINDS, PHASES, TAGS } from '../../js/data/cards.js';
import { CHAPTERS, TRACKS, DEFAULT_RULES } from '../../js/data/chapters.js';
import { LESSONS, LESSON_BY_ID, LESSON_ON } from '../../js/data/lessons.js';
import { QUIZ } from '../../js/data/quiz.js';
import { TUTORIAL, HINTS, SPEAKERS } from '../../js/data/tutorial.js';
import { playGame } from './bot.mjs';

const N = +(process.argv[2] || 1000);
const P = (s) => String(s ?? '').replace(/\{([^{}|]+)\|([^{}]+)\}/g, '$1');
const cell = (s) => P(s).replace(/\|/g, '／').replace(/\n/g, ' ');
const nm = (id) => `${P(CARD_BY_ID[id].name)}`;
const efStr = (ef) => {
  const { on, op, ...a } = ef;
  const args = Object.entries(a).map(([k, v]) => `${k}=${Array.isArray(v) ? v.join('+') : v}`).join(',');
  return `${on}:${op}(${args})`;
};
const stats = (c) => {
  const o = [];
  if (c.kind === 'unit') o.push(`力 ${c.power}`);
  if (c.kind === 'trouble') o.push(`圧力 ${c.pressure}`);
  if (c.tag) o.push(`タイプ ${P(TAGS[c.tag].label)}`);
  if (c.kind === 'stage') o.push(`バグ ${c.inject}`);
  if (c.kind === 'bug') o.push(`大きさ ${c.size}`);
  if (c.sudden) o.push('とつぜん');
  if (c.trigger) o.push(`発動: ${c.trigger.join('/')}`);
  if (c.need) o.push(`条件: ${c.need}`);
  if (c.ai) o.push(`AI: ${c.ai.when}・優先 ${c.ai.prio}`);
  if (c.group) o.push(`group: ${c.group}`);
  return o.join('<br>');
};
const artStr = (a) => `${a.icon}${a.icon2 ? '+' + a.icon2 : ''} / ${a.bg} / ${a.pattern}`;

const parts = {};
parts.count = `${CARDS.length} 種類`;

// ---- cards
{
  const order = ['stage', 'unit', 'skill', 'guard', 'doc', 'trouble', 'event', 'plot', 'bug'];
  let out = '';
  for (const k of order) {
    const cs = CARDS.filter((c) => c.kind === k);
    out += `\n### ${P(KINDS[k].label)}（${k}・${KINDS[k].en}）— ${cs.length} 枚\n\n`;
    out += '| id | 名前 / English | 工程 | コスト | 数値・しるし | 効果（カードの文） | effects（部品） | フレーバー（教訓） / English | 絵 | 教訓・出典 |\n|---|---|---|---|---|---|---|---|---|---|\n';
    for (const c of cs) {
      out += `| \`${c.id}\` | **${cell(c.name)}**<br>${cell(c.en)} | ${cell(PHASES[c.phase].label)} | ${c.cost ?? '—'} | ${stats(c) || '—'} | ${cell(c.text)} | ${c.effects.length ? c.effects.map((e) => '`' + efStr(e) + '`').join('<br>') : '—'} | ${cell(c.flavor)}<br>*${cell(c.flavorEn)}* | ${artStr(c.art)} | ${c.lesson}<br>${cell(c.source)} |\n`;
    }
  }
  parts.cards = out;
}
// ---- tutorial
{
  const want = (w) => w.type === 'next' ? 'OK' : w.type + (w.stage ? ' ' + nm(w.stage) : '') + (w.card ? ' ' + nm(w.card) : '') + (w.unit ? ' ' + nm(w.unit) : '') + (w.target ? ' → ' + nm(w.target) : '');
  let out = '| # | とき | 話す人 | 光る所 | 求める操作 | 表示する文 | English | 教訓 |\n|---|---|---|---|---|---|---|---|\n';
  for (const t of TUTORIAL) out += `| ${t.id} | ${t.when.over ? '勝ったとき' : `T${t.when.turn}${t.when.side === 'p' ? ' 自分' : ' 相手'}`}${t.auto ? '<br>(' + t.auto + ')' : ''} | ${P(SPEAKERS[t.speaker].name)} | \`${t.focus}\` | ${want(t.want)} | ${cell(t.say)} | ${cell(t.en)} | ${t.lesson || ''} |\n`;
  parts.tutorial = out;
  let h = '| id | きっかけ | 章 | 文 | English |\n|---|---|---|---|---|\n';
  for (const t of HINTS) h += `| ${t.id} | \`${t.on}\` | ${t.chapter} | ${cell(t.say)} | ${cell(t.en)} |\n`;
  parts.hints = h;
}
// ---- balance (run once, reuse in chapters)
const BAL = {};
{
  for (const ch of CHAPTERS) for (const style of ['good', 'careless', 'skipper']) {
    let w = 0, turns = 0, tr = 0, inc = 0, late = 0, fix = 0, rel = 0, relN = 0, dmg = 0, gd = 0;
    for (let s = 1; s <= N; s++) { const S = playGame(ch.id, s, style); if (S.over === 'win') { w++; tr += S.trust; } turns += S.turn; inc += S.stats.incidents; late += S.stats.lateTurns; fix += S.stats.fixSpent; if (S.stats.releaseTurn) { rel += S.stats.releaseTurn; relN++; } dmg += S.stats.dmg; gd += S.stats.guards; }
    BAL[ch.id + style] = { win: (100 * w / N).toFixed(0), turns: (turns / N).toFixed(1), trust: w ? (tr / w).toFixed(1) : '—', rel: relN ? (rel / relN).toFixed(1) : '—', inc: (inc / N).toFixed(1), late: (late / N).toFixed(2), fix: (fix / N).toFixed(1), dmg: (dmg / N).toFixed(1), gd: (gd / N).toFixed(1) };
  }
  const SN = { good: 'ていねい', careless: 'ざつ', skipper: 'とばす' };
  let out = `| 章 | ボット | 勝率 | 平均ターン | 勝ったときの信頼 | リリースしたターン | 本番障害（大きさの合計） | 納期遅れ（ターン） | 修正に使った工数 | 受けたダメージ | そなえの発動 |\n|---|---|---|---|---|---|---|---|---|---|---|\n`;
  for (const ch of CHAPTERS) for (const st of ['good', 'careless', 'skipper']) { const b = BAL[ch.id + st]; out += `| ${ch.no} | ${SN[st]} | **${b.win}%** | ${b.turns} | ${b.trust} | ${b.rel} | ${b.inc} | ${b.late} | ${b.fix} | ${b.dmg} | ${b.gd} |\n`; }
  parts.balance = out + `\n（${N} 試合ずつ。seed 1〜${N}。参照エンジン \`engine.mjs\` ＋ ボット \`bot.mjs\` による。第 8 章は「リリースのあと」から始まるので、リリースしたターンは —）\n`;
}
// ---- chapters
{
  const AIM = {
    ch1: 'ルールを一手ずつ体で覚える。V字・バグの 2 倍・レビュー・テストの対応・すぐ報告・わりこみ・リリース・運用、を全部 1 回ずつ。',
    ch2: '「ふんわり」のまま決めるとバグが増える。なぜ？を聞く → 書く → 承認、の順番。承認ずみの工程は、言った言わない・ちゃぶ台返しから守られる。',
    ch3: '工数と納期は「守る資源」。値切り・無茶な納期を、根拠（見積もりの根拠）と予備（バッファ）で受ける。安請け合いは自分の首をしめる。',
    ch4: '本物の V字。設計とテストのペア（詳細⇔単体、基本⇔結合、要件⇔受入）を覚える。上のバグほど見つかるのが遅く、大きくなる。絵で見せて承認をとる。',
    ch5: '遅れ・問題を一人で抱えない。「抱え込み」は毎ターン育つ。すぐ報告・相談・連絡で小さいうちに解決。残業・突貫は得に見えて高くつく。',
    ch6: 'テスト中の変更は新しいバグのもと。承認（基準）があるから変更管理で受けられる。テストのあとに入ったバグは再テストで見つける。',
    ch7: '本番作業の怖さ。リリースの瞬間に発動する「たくらみ」（設定値のミス、古い手順書、切り替わらない予備機、金曜の夕方）を、手順書・リハーサル・ダブルチェック・切り戻し計画で防ぐ。',
    ch8: 'リリースしても終わりではない。監視で早く気づき、ログで原因を見て、なぜなぜで仕組みを直す。サイレント障害は小さいうちに。',
    ch9: '要件定義から運用まで通しで。今まで学んだことを全部使う。',
  };
  let out = '';
  for (const ch of CHAPTERS) {
    const R = { ...DEFAULT_RULES, ...ch.rules };
    const tr = TRACKS[ch.track];
    const cnt = (arr) => { const m = new Map(); arr.forEach((x) => m.set(x, (m.get(x) || 0) + 1)); return [...m].map(([id, n]) => `${nm(id)}${n > 1 ? '×' + n : ''}`).join('、'); };
    const ruleBits = [`信頼 ${R.trust}`, `納期 ${R.deadline > 50 ? 'なし' : R.deadline + ' ターン'}`, `運用 ${R.ops} ターン`, `工数 ${R.effortStart} から`, `相手の行動力 ${R.enemyApStart}→上限 ${R.enemyApCap}`, `相手が 2 枚ひくのは ${R.enemyDraw2From > 50 ? 'なし' : R.enemyDraw2From + ' ターン目から'}`];
    if (R.fixedOrder) ruleBits.push('山札の順番固定（チュートリアル）');
    if (R.startReleased) ruleBits.push('リリースずみで開始（V字は全部置かれ承認ずみ）。最初からいるトラブル：' + R.startTroubles.map((t) => `${nm(t.id)}（圧力 ${t.pressure}）`).join('、'));
    const b = BAL[ch.id + 'good'];
    out += `\n### 第 ${ch.no} 章　${P(ch.title)}（${ch.en}）\n\n`;
    out += `| 項目 | 内容 |\n|---|---|\n`;
    out += `| ねらい（学び） | ${AIM[ch.id]} |\n`;
    out += `| 舞台 | ${cell(ch.place)}（${ch.placeEn}） |\n`;
    out += `| 相手 | **${cell(ch.enemy.name)}**（${ch.enemy.en}）。像：${artStr(ch.enemy.art)}。台詞「${cell(ch.enemy.say).replace(/^「|」$/g, '')}」 |\n`;
    out += `| V字 | ${P(tr.label)}：${tr.stages.map(nm).join(' → ')}。ペア：${Object.entries(tr.pair).map(([t, ds]) => `${nm(t)}⇔${ds.map(nm).join('・')}`).join('、')} |\n`;
    out += `| 勝利条件 | ${cell(ch.goal)}（${ch.goalEn}） |\n`;
    out += `| 数値 | ${ruleBits.join('／')} |\n`;
    out += `| 新しいカード | ${ch.newCards.length ? ch.newCards.map(nm).join('、') : '（なし。今までの全部から選んだデッキ）'} |\n`;
    out += `| プレイヤーのデッキ（${ch.playerDeck.length} 枚） | ${cnt(ch.playerDeck)} |\n`;
    out += `| CPU のデッキ（${ch.enemy.deck.flat().length} 枚） | ${ch.enemy.deck.map((seg, i) => `${['序盤', '中盤', '終盤'][i] || '束'}：${seg.map(nm).join('、')}`).join('<br>')}${R.fixedOrder ? '<br>（この順番のまま。切らない）' : '<br>（束の中だけを切る）'} |\n`;
    out += `| 開始時の台詞 | ${ch.intro.map(cell).join('<br>')}<br>*${ch.introEn}* |\n`;
    out += `| 勝ったとき | ${ch.win.map(cell).join('<br>')}<br>*${ch.winEn}* |\n`;
    out += `| 負けたとき | ${ch.lose.map(cell).join('<br>')}<br>*${ch.loseEn}* |\n`;
    out += `| クリア後の教訓 | ${ch.lessons.map((l) => `${l}「${P(LESSON_BY_ID[l].title)}」`).join('、')} |\n`;
    out += `| ボットの結果 | ていねい 勝率 ${b.win}%・平均 ${b.turns} ターン／ざつ ${BAL[ch.id + 'careless'].win}%／とばす ${BAL[ch.id + 'skipper'].win}% |\n`;
  }
  parts.chapters = out;
}
// ---- lessons
{
  let out = '';
  const opens = {};
  for (const [k, v] of Object.entries(LESSON_ON)) (opens[v] ||= []).push(k);
  for (const l of LESSONS) {
    const byCard = CARDS.filter((c) => c.lesson === l.id).map((c) => nm(c.id));
    out += `\n#### ${l.id}　${P(l.title)}（${P(PHASES[l.phase].label)}・図案 ${l.icon}）\n\n${P(l.body)}\n\n*${l.en}*\n\n- 出典：${P(l.source)}\n- ひらくとき：${[byCard.length ? 'カード（' + byCard.join('、') + '）' : '', opens[l.id] ? 'できごと（' + opens[l.id].join('、') + '）' : '', CHAPTERS.filter((c) => c.lessons.includes(l.id)).map((c) => '第' + c.no + '章クリア').join('、')].filter(Boolean).join('／')}\n`;
  }
  parts.lessons = out;
}
// ---- quiz
{
  let out = '';
  for (const ch of CHAPTERS) {
    const qs = QUIZ.filter((q) => q.chapter === ch.id);
    out += `\n### 第 ${ch.no} 章　${P(ch.title)}（${qs.length} 問）\n\n`;
    qs.forEach((q, i) => {
      out += `${i + 1}. **${P(q.q)}**\n`;
      q.choices.forEach((c, j) => { out += `   - ${j === q.answer ? '✅' : '　'} ${'ABC'[j]}. ${P(c)}\n`; });
      out += `   - 解説：${P(q.explain)}（教訓 ${q.lesson}）\n   - *${q.en}*\n`;
    });
  }
  parts.quiz = out;
}
let tpl = fs.readFileSync(new URL('./DESIGN.tpl.md', import.meta.url), 'utf8');
for (const [k, v] of Object.entries(parts)) { const key = `<!--GEN:${k}-->`; if (!tpl.includes(key)) throw new Error('missing ' + key); tpl = tpl.split(key).join(v); }
if (/<!--GEN:/.test(tpl)) throw new Error('unfilled GEN');
fs.writeFileSync(new URL('../../docs/DESIGN.md', import.meta.url), tpl);
console.log('wrote DESIGN.md', tpl.length, 'chars');
