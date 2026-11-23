// js/game/npcs.data.js — the named people of the island (DESIGN_V2 §1.2, §1.5; all original, OPUS-B).
// talks: the first entry whose when(s) matches is spoken. s = { n (bells rung), stage, met, drill, has(id), said(talkId) }.
// lines: 2–4 lines, ≤ 24 characters each (a function of s when the words depend on progress).
// After the last line: ask (a yes / no question: nod or A = yes, shake or B = no) → yes / no actions, or action.
// Actions: 'smith' (Gando's tempering page, with the shield drill), 'drill' (start the drill now).
// Looks come from world.folk (named ids pick their own look); positions from world.spawnPoints.npcs.

const LEFT = ['', '三', '二', '一'];

export const NPC_DEFS = {
  gando: {
    name: 'ガンド爺', en: 'OLD GANDO', kind: 'elder', pitch: 0.72, idle: 'work',
    talks: [
      { id: 'first', when: (s) => !s.met && s.has('sword'),
        lines: ['おお、歩ける者がまだおったか。', 'その剣、風が宿っとる。大事にせい。', '盾の使い方なら、木人で教えてやる。'], action: 'smith' },
      { id: 'first0', when: (s) => !s.met,
        lines: ['おお、歩ける者がまだおったか。', '台座の剣を見たか。風が宿っとる。', '盾の使い方なら、木人で教えてやる。'] },
      { id: 'drilled', when: (s) => s.drill >= 1 && !s.said('drilled'),
        lines: ['受けるな、迎えにいけ。', '当たる瞬間に押し出すんじゃ。'], action: 'smith' },
      { id: 'shield', when: (s) => s.has('shield') && s.has('sword') && s.drill === 0,
        lines: ['盾を持ってきたか。', '木人で盾の稽古をつけてやろう。'], ask: '稽古をするか？', yes: 'drill', no: 'smith' },
      { id: 'n4', when: (s) => s.n >= 4, lines: ['四つとも鳴ったか……ええ音じゃ。', '最後の戦い、岸から鈴で送るぞ。'], action: 'smith' },
      { id: 'n1', when: (s) => s.n >= 1, lines: ['鐘の音が戻ってきたのう。', 'かけらがあれば、剣を鍛え直すぞ。'], action: 'smith' },
      { id: 'idle', when: () => true, lines: ['かけらがあれば、剣を鍛え直すぞ。', '盾の稽古も、いつでもつけてやる。'], action: 'smith' },
    ],
  },
  towa: {
    name: 'トワ', en: 'TOWA', kind: 'adult', pitch: 1.35, idle: 'idle',
    // after the sword she comes to the camp; with bells rung she waits at the foot of the next tower; four: the pier
    appear: (s) => s.has('sword') || s.stage >= 2,
    talks: [
      { id: 'n4', when: (s) => s.n >= 4, lines: ['橋がかかった……。', 'みんな岸で鈴を鳴らすから。', '鈴に合わせて走って。風は足から起きるの。'] },
      { id: 'n1', when: (s) => s.n >= 1,
        lines: (s) => ['聞こえた？島がひとつ息をしたよ。',
          s.n === 1 ? 'あと三つ。森、峡谷、それから雪の上。' : `あと${LEFT[s.n] || '少し'}つ。もうすぐだね。`, '先に行って待ってるね。'] },
      { id: 'camp', when: () => true, lines: ['あなたが風渡り？ほんとうにいたんだ！', 'あの丘の塔、鐘が止まったままなの。', '足で昇るんだよ。走るみたいに。'] },
    ],
  },
  mio: {
    name: 'ミオ', en: 'MIO', kind: 'child', pitch: 1.65, idle: 'run', twin: 'sora',
    talks: [
      { id: 'n1', when: (s) => s.n >= 1, lines: ['鐘、聞こえたよ！', '旗がね、ちょっとだけ動いたの！'] },
      { id: 'camp', when: () => true, lines: ['ねえねえ、走るの速い？', '風が戻ったら、競争しようね！'] },
    ],
  },
  sora: {
    name: 'ソラ', en: 'SORA', kind: 'child', pitch: 1.5, idle: 'run', twin: 'mio',
    talks: [
      { id: 'n1', when: (s) => s.n >= 1, lines: ['ガンド爺がにこにこしてる。', '鐘の音、もっと聞きたいな。'] },
      { id: 'camp', when: () => true, lines: ['ミオはすぐ走っていっちゃうの。', '火のそばなら、こわくないよ。'] },
    ],
  },
};
export const NPC_IDS = Object.keys(NPC_DEFS);
