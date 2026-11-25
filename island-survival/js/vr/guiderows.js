// vr/guiderows.js — what each controller button does right now (DESIGN §27.6), for the guide cards in the headset
// (vr/guide.js). Pure data, so tests can read it without three.js.

/** what each button does now → { left: { title, rows }, right: { title, rows } }; rows: { key, text } */
export function guideRows(s = {}) {
  const walk = { step: '足踏みで 歩く', arms: '両腕を 交互に 振って 歩く', both: '足踏み・腕振りで 歩く' }[s.move];
  if (s.mode === 'menu') {
    return {
      right: { title: '右手：メニュー', rows: [{ key: 'trigger', text: 'レーザーで 押す' }, { key: 'stick', text: '↑↓ スクロール' }, { key: 'b', text: '閉じる' }] },
      left: { title: '左手：メニュー', rows: [{ key: 'y', text: '閉じる' }, { key: 'watch', text: '手首の 時計：体の ようす' }] },
    };
  }
  if (s.mode === 'work') {
    return {
      right: { title: '右手：作業台', rows: [{ key: 'trigger', text: '押す・つかむ（レーザーの先）' }, { key: 'stick', text: '←→ 左右・回す ↑↓ 力' }, { key: 'a', text: 'たたく（Space）' }, { key: 'b', text: 'やめる' }] },
      left: { title: '左手：作業台', rows: [{ key: 'y', text: 'やめる' }, { key: 'info', text: '見出しの「おまかせ」で 仕上げ' }] },
    };
  }
  if (s.mode === 'place') {
    return {
      right: { title: '右手：置く 場所', rows: [{ key: 'trigger', text: 'ここに 置く' }, { key: 'stick', text: '←→ 回す' }, { key: 'grip', text: 'やめる' }, { key: 'b', text: 'やめる' }] },
      left: { title: '左手：置く 場所', rows: [{ key: 'stick', text: '歩いて 場所を 決める' }, { key: 'y', text: 'やめる' }] },
    };
  }
  if (s.mode === 'activity') {
    return {
      right: { title: '右手：作業中', rows: [{ key: 'trigger', text: '押しつづけて 作業' }, { key: 'a', text: '押しつづけても 作業' }, { key: 'swing', text: '振る：切る・たたく・こする' }, { key: 'b', text: 'やめる' }] },
      left: { title: '左手：作業中', rows: [{ key: 'y', text: 'やめる' }, { key: 'info', text: '歩くと やめる（釣り・網は 別）' }] },
    };
  }
  const ranged = { gun: '撃つ', bow: '矢を 放つ', rod: '竿を 振る', net: '網を 投げる', spear: '突く', harpoon: '突く' }[s.held];
  const aimGrip = { gun: '構える', bow: '弓を 引く', spear: '投げる 力を ためる' }[s.held] || '構える・弓を 引く';
  return {
    right: { title: '右手', rows: [
      { key: 'trigger', text: ranged || (s.target ? '指した 物の 行動を する' : '持った 道具を 使う') },
      { key: 'a', text: '選んだ 行動（長押し：続ける）' },
      { key: 'grip', text: aimGrip },
      { key: 'stick', text: '←→ 向き ↑↓ 選ぶ 押す：跳ぶ' },
      { key: 'b', text: 'メニュー' },
    ] },
    left: { title: '左手', rows: [
      { key: 'stick', text: walk ? `歩く（押す：走る）・${walk}` : '歩く（押す：走る）' },
      { key: 'x', text: '仲間を 呼ぶ' },
      { key: 'y', text: 'メニュー' },
      { key: 'watch', text: '手首の 時計：体の ようす' },
    ] },
  };
}
