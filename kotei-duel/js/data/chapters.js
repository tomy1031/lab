// js/data/chapters.js — キャンペーンの章・V字（トラック）・デッキ（設計：docs/DESIGN.md 7 章）
// 文字列はふりがなマークアップ。カード id は cards.js、教訓 id は lessons.js を参照。

// ---- V字の形（トラック）。stages は置く順番。pair は「テスト工程 → 見つける相手の工程」----
export const TRACKS = {
  mini: { // チュートリアル用の小さな V
    label: '{小|ちい}さな V', en: 'Mini V',
    stages: ['st_des', 'st_pg', 'st_tst', 'st_rel'],
    pair: { st_tst: ['st_des', 'st_pg'] },
  },
  mid: { // 研修の 7 ステップに近い V
    label: '{中|ちゅう}くらいの V', en: 'Medium V',
    stages: ['st_rd', 'st_des', 'st_pg', 'st_tst', 'st_at', 'st_rel'],
    pair: { st_tst: ['st_des', 'st_pg'], st_at: ['st_rd'] },
  },
  full: { // 現場の V字モデル
    label: '{本物|ほんもの}の V', en: 'Full V',
    stages: ['st_rd', 'st_bd', 'st_dd', 'st_pg', 'st_ut', 'st_it', 'st_at', 'st_rel'],
    pair: { st_ut: ['st_dd', 'st_pg'], st_it: ['st_bd'], st_at: ['st_rd'] },
  },
};

// ---- どの章でも同じ数値（章の rules で上書きできる）----
export const DEFAULT_RULES = {
  trust: 20,          // 信頼（最初の値＝最大値）
  hand: 4,            // 最初の手札（先攻 1 ターン目もカードを 1 枚ひく）
  handMax: 7,         // 手札の上限（ターンの終わりに超えた分を捨てる）
  effortStart: 3,     // 1 ターン目の工数
  effortGrow: 1,      // 毎ターン増える工数
  effortCap: 6,       // 工数の上限
  teamSlots: 3,       // なかまの場
  backSlots: 3,       // そなえの場（ガード＋資料）
  fieldSlots: 3,      // 相手のトラブルの場
  plotSlots: 2,       // 相手のたくらみの場
  bugMax: 8,          // バグの大きさの上限
  skipBugs: 2,        // とばした「つくる工程」1 つにつき入るバグ
  latePenalty: 2,     // 納期遅れ 1 ターン目の信頼ダメージ（そのあと毎ターン +1）
  turnLimit: 20,      // これを超えたら負け（安全装置）
  enemyHand: 3,       // 相手の最初の手札
  enemyApStart: 2,    // 相手の 1 ターン目の行動力
  enemyApEvery: 2,    // 何ターンごとに行動力 +1 か
  enemyApCap: 4,      // 相手の行動力の上限
  enemyDraw2From: 5,  // このターンから相手は毎ターン 2 枚ひく
};

// デッキを短く書くための小さな関数： x('s_review', 3) → 3 枚
const x = (id, n = 1) => Array(n).fill(id);

export const CHAPTERS = [
  // ------------------------------------------------------------------ 1
  {
    id: 'ch1', no: 1, track: 'mini', tutorial: true,
    title: 'はじめての{案件|あんけん}', en: 'Your First Project',
    phase: 'all',
    place: 'ネクストメイク {大阪|おおさか}オフィスの{会議室|かいぎしつ}', placeEn: 'Meeting room, Nextmake Osaka office',
    enemy: {
      name: 'せっかちな{神|かみ}{社長|しゃちょう}', en: 'President Kami, in a Hurry',
      art: { icon: 'boss', icon2: 'hourglass', bg: 'purple', pattern: 'rays' },
      say: '「とにかく{早|はや}く！ チラシのページを{作|つく}ってくれ！」',
      // チュートリアルは順番を固定（shuffle しない）
      deck: [['t_fuwa', 't_kakaekomi', 't_nankahen', 't_fuwa', 'e_houchi', 't_nankahen', 'e_houchi', 't_kakaekomi']],
    },
    rules: { deadline: 6, ops: 1, fixedOrder: true, enemyApStart: 1, enemyApCap: 2, enemyDraw2From: 99 },
    // チュートリアルの山札は上から順番（最初の 4 枚が手札）
    playerDeck: ['s_review', 'u_newbie', 's_report', 'g_abplan', 's_review', 'u_senpai', 'u_nyam', 's_overtime', 's_report', 's_soudan', 's_review', 's_rush', 's_soudan', 'u_newbie', 'g_abplan', 's_report'],
    newCards: ['st_des', 'st_pg', 'st_tst', 'st_rel', 's_review', 's_report', 's_soudan', 'u_newbie', 'u_senpai', 'u_nyam', 'g_abplan', 's_overtime', 's_rush'],
    goal: 'V{字|じ}に{工程|こうてい}を 4 つ{置|お}いてリリースし、1 ターン{運用|うんよう}する。',
    goalEn: 'Place the 4 stages on the V, release, and operate for 1 turn.',
    intro: [
      '{山田|やまだ}さん「{新|あたら}しい{案件|あんけん}だよ。スーパー『ゴッドマート』のチラシのページを{作|つく}る{小|ちい}さな{仕事|しごと}だ」',
      'ヘンディ{先輩|せんぱい}「{最初|さいしょ}だから、{一手|いって}ずつ{一緒|いっしょ}にやりましょう。{失敗|しっぱい}しても{大丈夫|だいじょうぶ}です」',
    ],
    introEn: 'A small first job: a flyer page for the supermarket "God Mart". Hendy will guide you move by move.',
    win: ['{神|かみ}{社長|しゃちょう}「おお、ちゃんと{動|うご}くじゃないか！」', 'ヘンディ{先輩|せんぱい}「バグを{早|はや}く{見|み}つけましたね。それがプロの{仕事|しごと}です」'],
    winEn: 'It works! You found the bugs early — that is professional work.',
    lose: ['ヘンディ{先輩|せんぱい}「{大丈夫|だいじょうぶ}。{失敗|しっぱい}も{勉強|べんきょう}です。バグが{小|ちい}さいうちに{直|なお}すと、もっと{楽|らく}になりますよ」'],
    loseEn: 'It is OK — failure is study too. Fix bugs while they are small and it gets easier.',
    lessons: ['L01', 'L02', 'L15', 'L29'],
  },
  // ------------------------------------------------------------------ 2
  {
    id: 'ch2', no: 2, track: 'mid',
    title: 'ふんわりした{要望|ようぼう}', en: 'The Vague Request',
    phase: 'rd',
    place: 'ゴッドマート {本社|ほんしゃ}の{応接室|おうせつしつ}', placeEn: 'Reception room, God Mart HQ',
    enemy: {
      name: 'ふんわりした{神|かみ}{社長|しゃちょう}', en: 'President Kami, Vague',
      art: { icon: 'boss', icon2: 'fog', bg: 'purple', pattern: 'waves' },
      say: '「とにかく{使|つか}いやすいアプリにしてくれ！ いい{感|かん}じに！」',
      deck: [
        ['t_fuwa', 't_fuwa', 'e_ittaiwanai', 't_omoitsuki', 'e_ittaiwanai'],
        ['t_fuwa', 'e_omottetano', 't_owaranai', 'e_ittaiwanai', 'e_omottetano', 't_omoitsuki'],
        ['e_chabudai', 't_fuwa', 'e_omottetano', 't_owaranai', 'e_chabudai', 't_omoitsuki'],
      ],
    },
    rules: { deadline: 9, ops: 1, enemyApStart: 1, enemyApCap: 3, enemyDraw2From: 6 },
    playerDeck: [...x('s_review', 3), ...x('s_hearing', 2), ...x('s_5w1h', 2), ...x('s_stamp', 3), ...x('g_minutes', 2), ...x('d_hearing', 2), ...x('u_tantou', 2), ...x('u_newbie', 2), 'u_senpai', 'u_nyam', ...x('s_report', 2), 's_soudan', 'g_abplan'],
    newCards: ['st_rd', 'st_at', 's_hearing', 's_5w1h', 's_stamp', 'g_minutes', 'd_hearing', 'u_tantou'],
    goal: '{要件定義|ようけんていぎ}から{始|はじ}めてリリースし、1 ターン{運用|うんよう}する。',
    goalEn: 'Start from Requirements, release, and operate for 1 turn.',
    intro: [
      '{神|かみ}{社長|しゃちょう}「ポイント{機能|きのう}とネットスーパーを{入|い}れたいんじゃ！ あとは、いい{感|かん}じに{頼|たの}む！」',
      'ヘンディ{先輩|せんぱい}「『いい{感|かん}じ』のまま{進|すす}むと、バグが{増|ふ}えます。{聞|き}いて、{書|か}いて、ハンコをもらいましょう」',
    ],
    introEn: '"Make it nice!" Moving on with "nice" breeds bugs. Ask, write it down, and get the stamp.',
    win: ['{神|かみ}{社長|しゃちょう}「わしが{本当|ほんとう}にほしかったのは、これじゃ！」', '{山田|やまだ}さん「『なぜ』を{聞|き}いたのがよかったね」'],
    winEn: '"This is what I really wanted!" Asking "why" made the difference.',
    lose: ['ヘンディ{先輩|せんぱい}「おしい！ {要件定義|ようけんていぎ}を{置|お}く{前|まえ}に『ふんわり{要望|ようぼう}』を{解決|かいけつ}すると、バグが{減|へ}りますよ」'],
    loseEn: 'Close! Clear the "Vague Request" before placing Requirements and fewer bugs get in.',
    lessons: ['L03', 'L04', 'L05', 'L06', 'L07'],
  },
  // ------------------------------------------------------------------ 3
  {
    id: 'ch3', no: 3, track: 'mid',
    title: '{値切|ねぎ}りと{無茶|むちゃ}な{納期|のうき}', en: 'Bargains and Impossible Deadlines',
    phase: 'est',
    place: 'ゴッドマート {社長室|しゃちょうしつ}', placeEn: 'The president\'s office, God Mart',
    enemy: {
      name: 'ねぎってくる{神|かみ}{社長|しゃちょう}', en: 'President Kami, the Bargainer',
      art: { icon: 'boss', icon2: 'scissors', bg: 'purple', pattern: 'grid' },
      say: '「うーん、{高|たか}いな…。{半額|はんがく}で、{来月|らいげつ}までにできんか？」',
      deck: [
        ['t_negiri', 'e_budget', 't_nouki', 't_negiri', 'e_tanshuku'],
        ['t_nouki', 'e_budget', 't_omoitsuki', 't_fuwa', 'e_omottetano', 'e_tanshuku'],
        ['t_owaranai', 'e_budget', 't_negiri', 'e_tanshuku', 't_omoitsuki', 'e_spec'],
      ],
    },
    rules: { deadline: 9, ops: 1, enemyApCap: 3 },
    playerDeck: [...x('s_review', 3), ...x('s_stamp', 2), 's_hearing', 's_5w1h', ...x('u_yamada', 2), ...x('s_buffer', 2), ...x('d_estimate', 2), ...x('g_basis', 3), ...x('g_phase2', 2), 'g_minutes', 'd_hearing', 'u_tantou', 'u_senpai', 'u_nyam', 's_report', 's_overtime'],
    newCards: ['u_yamada', 's_buffer', 'd_estimate', 'g_basis', 'g_phase2'],
    goal: '{工数|こうすう}と{納期|のうき}を{守|まも}りながらリリースし、1 ターン{運用|うんよう}する。',
    goalEn: 'Protect your effort and deadline, release, and operate for 1 turn.',
    intro: [
      '{神|かみ}{社長|しゃちょう}「{少|すこ}し{高|たか}いな…。もっと{安|やす}く、もっと{早|はや}くならんか？」',
      '{山田|やまだ}さん「すぐ{半額|はんがく}にしてはだめだよ。{数字|すうじ}の{理由|りゆう}を{見|み}せて、{機能|きのう}を{相談|そうだん}しよう」',
    ],
    introEn: '"A bit expensive... cheaper and faster?" Do not halve the price. Show the basis and discuss the scope.',
    win: ['{神|かみ}{社長|しゃちょう}「なるほど、{理由|りゆう}がわかった。この{値段|ねだん}で{頼|たの}む」', '{山田|やまだ}さん「{根拠|こんきょ}があると、お{互|たが}いに{安心|あんしん}だね」'],
    winEn: '"I see the reason. Go ahead at this price." A clear basis makes both sides feel safe.',
    lose: ['{山田|やまだ}さん「{工数|こうすう}を{減|へ}らされたままだと{苦|くる}しいね。『{見積|みつ}もりの{根拠|こんきょ}』をふせておこう」'],
    loseEn: 'It is hard with reduced effort. Set "Basis of Estimate" face-down next time.',
    lessons: ['L08', 'L09', 'L10'],
  },
  // ------------------------------------------------------------------ 4
  {
    id: 'ch4', no: 4, track: 'full',
    title: '「{思|おも}っていたのと{違|ちが}う」', en: '"Not What I Imagined"',
    phase: 'bd',
    place: 'ネクストメイク {東京|とうきょう}オフィスの{設計|せっけい}ルーム', placeEn: 'Design room, Nextmake Tokyo office',
    enemy: {
      name: '{想像|そうぞう}できない{神|かみ}{社長|しゃちょう}', en: 'President Kami, Who Can\'t Picture It',
      art: { icon: 'boss', icon2: 'question', bg: 'purple', pattern: 'dots' },
      say: '「{文章|ぶんしょう}ではわからん。できてから{見|み}るよ」',
      deck: [
        ['t_fuwa', 'e_ittaiwanai', 'p_kiitenai', 't_fuwa', 'e_omottetano'],
        ['e_omottetano', 'e_chabudai', 't_hidden', 'e_ittaiwanai', 't_omoitsuki', 'e_omottetano', 'p_kiitenai'],
        ['e_chabudai', 't_owaranai', 'e_spec', 'e_omottetano', 't_hidden', 'e_meteor'],
      ],
    },
    rules: { deadline: 11, ops: 1 },
    playerDeck: [...x('s_review', 3), ...x('s_peer', 2), ...x('s_wire', 2), 's_yomiawase', ...x('s_stamp', 2), ...x('u_se', 2), 'u_tantou', 'u_senpai', 'u_nyam', 'u_newbie', ...x('g_abplan', 2), ...x('g_minutes', 2), 's_hearing', 's_5w1h', 'd_hearing', 's_report', 'g_phase2'],
    newCards: ['st_bd', 'st_dd', 'st_ut', 'st_it', 'u_se', 's_wire', 's_yomiawase', 's_peer'],
    goal: '{本物|ほんもの}の V{字|じ}（7 {工程|こうてい}）を{進|すす}めてリリースし、1 ターン{運用|うんよう}する。',
    goalEn: 'Advance through the full V (7 stages), release, and operate for 1 turn.',
    intro: [
      'ヘンディ{先輩|せんぱい}「ここからは{本物|ほんもの}の V{字|じ}です。{設計|せっけい}が 2 つ、テストが 3 つに{分|わ}かれます」',
      'ヘンディ{先輩|せんぱい}「{左|ひだり}の{設計|せっけい}と、{右|みぎ}のテストは、{同|おな}じ{高|たか}さどうしがペアです。{覚|おぼ}えてくださいね」',
    ],
    introEn: 'Now the real V: two design stages, three test stages. Design on the left pairs with the test at the same height on the right.',
    win: ['{神|かみ}{社長|しゃちょう}「{絵|え}で{見|み}せてくれたから、よくわかったぞ」', 'ヘンディ{先輩|せんぱい}「{設計|せっけい}のうちに{直|なお}したバグは、たった 1 でしたね」'],
    winEn: '"The pictures made it clear." Bugs fixed during design cost only 1.',
    lose: ['ヘンディ{先輩|せんぱい}「{設計|せっけい}のバグは、テストまで{待|ま}つと 8 になります。{置|お}いたターンにレビューしましょう」'],
    loseEn: 'A design bug becomes 8 if you wait for the test. Review on the turn you place the stage.',
    lessons: ['L02', 'L11', 'L12', 'L13', 'L14'],
  },
  // ------------------------------------------------------------------ 5
  {
    id: 'ch5', no: 5, track: 'full',
    title: 'デスマーチの{影|かげ}', en: 'Shadow of the Death March',
    phase: 'pg',
    place: '{夜|よる}の{開発|かいはつ}ルーム', placeEn: 'The dev room at night',
    enemy: {
      name: '{炎上|えんじょう}の{化身|けしん} デスマーチ', en: 'Death March, Spirit of the Burning Project',
      art: { icon: 'fire', icon2: 'ghost', bg: 'red', pattern: 'fire' },
      say: '「だまっていれば、ばれないさ…。{一人|ひとり}でがんばれ…」',
      deck: [
        ['t_kakaekomi', 'e_warikomi', 't_kakaekomi', 't_zokujin', 'e_tanshuku'],
        ['t_deathmarch', 't_kakaekomi', 'e_warikomi', 'e_houchi', 't_nouki', 't_zokujin'],
        ['t_deathmarch', 'e_houchi', 't_kakaekomi', 'e_spec', 'e_warikomi', 'e_tanshuku'],
      ],
    },
    rules: { deadline: 11, ops: 1 },
    playerDeck: [...x('s_review', 3), ...x('s_report', 3), ...x('s_soudan', 2), ...x('s_renraku', 2), 's_pairpro', ...x('u_pg', 2), 'u_nyam', 'u_fujiki', 'u_senpai', 'u_se', 'd_kiyaku', 'd_ci', 'd_kadai', 's_peer', 's_stamp', 'g_abplan', 's_overtime', 's_rush'],
    newCards: ['u_pg', 'u_fujiki', 's_renraku', 's_pairpro', 'd_kiyaku', 'd_ci', 'd_kadai'],
    goal: 'トラブルを{小|ちい}さいうちに{解決|かいけつ}しながらリリースし、1 ターン{運用|うんよう}する。',
    goalEn: 'Resolve troubles while they are small, release, and operate for 1 turn.',
    intro: [
      'エンジニア「すみません…{開発|かいはつ}が{少|すこ}し{遅|おく}れています…」',
      'ヘンディ{先輩|せんぱい}「{言|い}ってくれてありがとう。{悪|わる}い{知|し}らせほど{早|はや}く。『{抱|かか}え{込|こ}み』は{出|で}たターンに{解決|かいけつ}しましょう」',
    ],
    introEn: '"Sorry, we are a little behind..." Thank you for telling me. Bad news early — resolve "Hidden Delay" the turn it appears.',
    win: ['{藤木|ふじき}{取締役|とりしまりやく}「{正直|しょうじき}に、{早|はや}く{教|おし}えてくれたから{間|ま}に{合|あ}いましたね」', 'エンジニア「{相談|そうだん}してよかったです！」'],
    winEn: '"You told us honestly and early, so we made it." "I am glad I asked!"',
    lose: ['ヘンディ{先輩|せんぱい}「『{抱|かか}え{込|こ}み』は{毎|まい}ターン +2 で{育|そだ}ちます。『すぐ{報告|ほうこく}』はコスト 0 ですよ」'],
    loseEn: '"Hidden Delay" grows by 2 every turn. "Report at Once" costs 0.',
    lessons: ['L16', 'L17', 'L18', 'L29', 'L30', 'L31', 'L32'],
  },
  // ------------------------------------------------------------------ 6
  {
    id: 'ch6', no: 6, track: 'full',
    title: 'バグキングの{城|しろ}', en: 'Castle of the Bug King',
    phase: 'tst',
    place: 'テストルーム（{検証環境|けんしょうかんきょう}）', placeEn: 'The test room (staging environment)',
    enemy: {
      name: 'バグキングと{思|おも}いつきの{神|かみ}{社長|しゃちょう}', en: 'The Bug King & President Kami\'s Ideas',
      art: { icon: 'bug', icon2: 'crown', bg: 'red', pattern: 'binary' },
      say: '「テストなんて{減|へ}らせばいい。あ、このボタンも{追加|ついか}して！」',
      deck: [
        ['t_nankahen', 'e_houchi', 't_omoitsuki', 'e_spec', 't_fuwa'],
        ['e_houchi', 't_bugking', 't_nankahen', 'e_spec', 't_omoitsuki', 'e_tanshuku'],
        ['e_addfeature', 't_kankyou', 'e_addfeature', 'e_houchi', 't_nankahen', 't_omoitsuki'],
      ],
    },
    rules: { deadline: 11, ops: 1 },
    playerDeck: [...x('s_review', 3), ...x('s_peer', 2), ...x('s_retest', 2), ...x('s_bugreport', 2), ...x('u_tester', 2), 'u_reviewer', 'u_pg', 'u_nyam', ...x('d_testcase', 2), 'd_ci', ...x('g_change', 2), ...x('s_stamp', 2), 'g_phase2', 's_soudan', 's_report', 'u_senpai'],
    newCards: ['u_tester', 'u_reviewer', 's_retest', 's_bugreport', 'd_testcase', 'g_change'],
    goal: 'バグを{見|み}つけて{直|なお}し、リリースして 1 ターン{運用|うんよう}する。',
    goalEn: 'Find and fix the bugs, release, and operate for 1 turn.',
    intro: [
      '{神|かみ}{社長|しゃちょう}「おお！ ここに『{今日|きょう}のチラシ』ボタンを{追加|ついか}してくれ！」',
      'ヘンディ{先輩|せんぱい}「テスト{中|ちゅう}の{変更|へんこう}は、{新|あたら}しいバグのもとです。{承認|しょうにん}があれば『{変更管理|へんこうかんり}』で{受|う}けられます」',
    ],
    introEn: '"Add a button here!" Changes during testing breed new bugs. With an approval, "Change Control" can take it.',
    win: ['{神|かみ}{社長|しゃちょう}「ボタンは{次|つぎ}のアップデートでいい。{今|いま}はテストに{集中|しゅうちゅう}してくれ」', 'テスター「リストどおり、もれなく{確|たし}かめました！」'],
    winEn: '"The button can wait for the next update." "Everything on the list is checked!"',
    lose: ['ヘンディ{先輩|せんぱい}「テストのあとに{入|はい}ったバグは、{見|み}つかっていません。『{再|さい}テスト』で{見|み}つけましょう」'],
    loseEn: 'Bugs that got in after the test are still hidden. Use "Regression Test" to find them.',
    lessons: ['L02', 'L10', 'L19', 'L20', 'L21', 'L22'],
  },
  // ------------------------------------------------------------------ 7
  {
    id: 'ch7', no: 7, track: 'full',
    title: '{本番|ほんばん}の{夜|よる}', en: 'The Night of the Release',
    phase: 'rel',
    place: '{夜中|よなか}のサーバールーム', placeEn: 'The server room at midnight',
    enemy: {
      name: '{本番|ほんばん}の{魔物|まもの} ショウガイ', en: 'Shougai, the Demon of Production',
      art: { icon: 'server', icon2: 'ghost', bg: 'night', pattern: 'circuit' },
      say: '「{手順書|てじゅんしょ}？ {見|み}なくてもできるだろう…？」',
      deck: [
        ['t_nouki', 'e_spec', 't_kakaekomi', 'e_warikomi', 't_nankahen'],
        ['p_setting', 't_kankyou', 'e_tanshuku', 'p_old_manual', 'e_houchi', 't_omoitsuki'],
        ['p_failover', 'p_friday', 't_access', 't_kankyou', 't_silent', 't_claim', 't_access'],
      ],
    },
    rules: { deadline: 11, ops: 2 },
    playerDeck: [...x('s_review', 3), 's_peer', ...x('s_rehearsal', 2), ...x('d_procedure', 2), ...x('g_double', 3), ...x('g_rollback', 2), 'u_tester', 'u_pg', 'u_nyam', 'u_senpai', ...x('u_ops', 2), 'd_testcase', 's_bugreport', 's_stamp', ...x('s_report', 2), 's_buffer', 's_retest'],
    newCards: ['d_procedure', 'g_double', 'g_rollback', 's_rehearsal', 'u_ops'],
    goal: '{相手|あいて}の「たくらみ」をよけてリリースし、2 ターン{運用|うんよう}する。',
    goalEn: 'Dodge the enemy\'s Plots, release, and operate for 2 turns.',
    intro: [
      '{山田|やまだ}さん「いよいよリリースだね。{当日|とうじつ}あわてないように、{何|なに}を{準備|じゅんび}する？」',
      'ヘンディ{先輩|せんぱい}「{手順書|てじゅんしょ}、ダブルチェック、{切|き}り{戻|もど}し{計画|けいかく}。{相手|あいて}は『たくらみ』をふせてきますよ」',
    ],
    introEn: 'Release day is near. Runbook, double check, rollback plan — the enemy will set Plots face-down.',
    win: ['エンジニア「{手順書|てじゅんしょ}どおり、{指|ゆび}を{差|さ}して{確認|かくにん}しました。{本番|ほんばん}、{問題|もんだい}なしです！」', '{神|かみ}{社長|しゃちょう}「{朝|あさ}{起|お}きたら、もう{動|うご}いておった！」'],
    winEn: '"By the runbook, pointing and calling. Production is all green!" "It was running when I woke up!"',
    lose: ['ヘンディ{先輩|せんぱい}「リリースの{前|まえ}に『リハーサル』でたくらみをこわすか、『ダブルチェック』をふせておきましょう」'],
    loseEn: 'Before release, break Plots with "Rehearsal" or set "Double Check" face-down.',
    lessons: ['L23', 'L24', 'L25', 'L26'],
  },
  // ------------------------------------------------------------------ 8
  {
    id: 'ch8', no: 8, track: 'mid',
    title: '{運用|うんよう}はつづく', en: 'Operation Goes On',
    phase: 'ops',
    place: '{運用|うんよう}センター（{監視|かんし}ルーム）', placeEn: 'Operations center (monitoring room)',
    enemy: {
      name: '{本番|ほんばん}の{魔物|まもの} ショウガイ（{運用|うんよう}{編|へん}）', en: 'Shougai, Operation Mode',
      art: { icon: 'ghost', icon2: 'server', bg: 'night', pattern: 'waves' },
      say: '「リリースしたら{終|お}わり、だと{思|おも}ったか…？」',
      deck: [
        ['t_silent', 't_claim', 'e_warikomi', 't_access', 't_silent'],
        ['t_access', 'e_budget', 't_claim', 't_silent', 't_kankyou', 'e_warikomi'],
        ['t_access', 't_silent', 't_claim', 't_kankyou', 't_access', 't_silent'],
      ],
    },
    // この章はリリースずみで始まる（V字は全部置かれている）。最初から「本番障害」が 1 体いる。
    rules: { deadline: 99, ops: 6, startReleased: true, startTroubles: [{ id: 't_incident', pressure: 4 }, { id: 't_silent', pressure: 1 }], effortStart: 4, enemyApStart: 4, enemyApCap: 6, enemyDraw2From: 1 },
    playerDeck: [...x('u_ops', 3), 'u_nyam', 'u_senpai', 'u_fujiki', ...x('s_log', 3), ...x('s_naze', 2), ...x('s_kaizen', 2), ...x('d_monitor', 2), 'd_kadai', ...x('s_report', 3), ...x('g_rollback', 2), 'g_abplan', 's_renraku', 's_pairpro'],
    newCards: ['st_ops', 's_log', 's_naze', 's_kaizen', 'd_monitor'],
    goal: 'リリースのあとの 6 ターン、{信頼|しんらい}を{守|まも}りきる。',
    goalEn: 'Protect your trust for 6 turns after the release.',
    intro: [
      '{神|かみ}{社長|しゃちょう}「アプリのおかげでお{客|きゃく}さんが{増|ふ}えたぞ！ じゃが、たまに『ポイントがつかない』と{言|い}われるんじゃ…」',
      'ヘンディ{先輩|せんぱい}「ここからは{運用|うんよう}です。{監視|かんし}で{早|はや}く{気|き}づき、ログを{見|み}て、{直|なお}します」',
    ],
    introEn: '"More customers thanks to the app! But sometimes points are not added..." Operation begins: notice early with monitoring, read the logs, fix.',
    win: ['{神|かみ}{社長|しゃちょう}「すぐ{直|なお}してくれて{助|たす}かった。{次|つぎ}は{何|なに}をよくできる？」', 'ヘンディ{先輩|せんぱい}「{育|そだ}てていくのが、IT の{仕事|しごと}のいいところですね」'],
    winEn: '"Thanks for the quick fix. What can we improve next?" Growing a system is the best part of IT work.',
    lose: ['ヘンディ{先輩|せんぱい}「『サイレント{障害|しょうがい}』は{小|ちい}さいうちに。『{監視|かんし}』を{置|お}くと、{出|で}た{瞬間|しゅんかん}に{弱|よわ}くできます」'],
    loseEn: 'Hit "Silent Failure" while it is small. "Monitoring" weakens troubles the moment they appear.',
    lessons: ['L27', 'L28', 'L29', 'L31'],
  },
  // ------------------------------------------------------------------ 9
  {
    id: 'ch9', no: 9, track: 'full', final: true,
    title: '{通|とお}しプロジェクト：ゴッドマート・アプリ', en: 'The Whole Project: God Mart App',
    phase: 'all',
    place: 'ゴッドマート {本社|ほんしゃ} {大会議室|だいかいぎしつ}', placeEn: 'Main conference room, God Mart HQ',
    enemy: {
      name: '{神|かみ}{社長|しゃちょう}（{本気|ほんき}）', en: 'President Kami, Serious',
      art: { icon: 'boss', icon2: 'meteor', bg: 'purple', pattern: 'rays' },
      say: '「お{客様|きゃくさま}は{神様|かみさま}じゃ！ AI で、いい{感|かん}じに、{安|やす}く、{早|はや}く！」',
      deck: [
        ['t_fuwa', 'e_ittaiwanai', 't_negiri', 'p_kiitenai', 't_nouki', 'e_budget'],
        ['e_omottetano', 't_hidden', 'e_chabudai', 't_kakaekomi', 'e_spec', 't_deathmarch', 'p_tsuru', 'e_houchi'],
        ['e_addfeature', 't_bugking', 'p_setting', 'e_meteor', 'p_old_manual', 't_omoitsuki', 't_access', 't_silent', 't_claim'],
      ],
    },
    rules: { deadline: 12, ops: 3 },
    playerDeck: [...x('s_review', 3), 's_peer', 's_wire', ...x('s_stamp', 2), 's_hearing', 'd_hearing', 'g_minutes', 'g_basis', 'g_change', 'g_double', 'g_rollback', 'd_procedure', 's_rehearsal', ...x('s_report', 2), 's_bugreport', 's_retest', 'u_tantou', 'u_yamada', 'u_senpai', 'u_tester', 'u_ops', 'u_nyam', 'u_fujiki', 's_log', 'd_estimate', 'g_abplan'],
    newCards: [],
    goal: '{要件定義|ようけんていぎ}からリリースまで{通|とお}して{進|すす}め、3 ターン{運用|うんよう}する。',
    goalEn: 'Run the whole project from Requirements to Release, then operate for 3 turns.',
    intro: [
      '{神|かみ}{社長|しゃちょう}「いよいよ{本番|ほんばん}のアプリじゃ！ ポイント、ネットスーパー、AI の{晩|ばん}ごはん、{全部|ぜんぶ}{入|い}れてくれ！ {予算|よさん}はあまりないがな！」',
      'ヘンディ{先輩|せんぱい}「{今|いま}まで{学|まな}んだことを{全部|ぜんぶ}{使|つか}いましょう。{合意|ごうい}、レビュー、{報告|ほうこく}、{手順書|てじゅんしょ}。あなたならできます」',
    ],
    introEn: 'The real app at last: points, online store, AI dinner ideas — on a small budget. Use everything you learned: agreement, review, reporting, runbook.',
    win: ['{神|かみ}{社長|しゃちょう}「{無事|ぶじ}にリリースできた！ {君|きみ}たちは{本当|ほんとう}のプロじゃ！」', 'ヘンディ{先輩|せんぱい}「おめでとう！ {明日|あした}からは、{本物|ほんもの}の{現場|げんば}で{会|あ}いましょう」'],
    winEn: '"A safe release! You are true professionals!" Congratulations — see you in the real workplace tomorrow.',
    lose: ['ヘンディ{先輩|せんぱい}「あと{少|すこ}しでした。どこでバグが{育|そだ}ったか、{図鑑|ずかん}でふり{返|かえ}ってみましょう」'],
    loseEn: 'So close. Look back in the Lesson Book to see where the bugs grew.',
    lessons: ['L01', 'L02', 'L06', 'L10', 'L15', 'L24', 'L27', 'L29', 'L33'],
  },
];

export const CHAPTER_BY_ID = Object.fromEntries(CHAPTERS.map((c) => [c.id, c]));
