// data/fieldcraft.js — 知識で うまく なる 手の 作業の 定型セリフ・手順の 言葉（DESIGN §26）。
//
// 線は 文字列、または { normal, mild }（`butcherView` の 設定で 切りかわる。§25.5）。
// Placeholders: {who} = 獲物の 名前（TRAP_CARD）、{trap} = 罠の 名前（TRAP_CARD.set）。
// `mild` と TEACH・TRAIL_SPOT・TRAP_MORNING の 言葉は 血・内臓・死・殺 を 使わない（§25.5）。
// 仲間の 言い方は consult.js と 同じ：ナギ「あたし」（明るい）、トウコ 丁寧語（植物にくわしい。獣は 殺さない）、ゲン「おれ」（ぶっきらぼう）。

// 見回り（§26.8）の 結果の 札。
export const TRAP_CARD = {
  set:      { normal: '{trap}: 変わり なし。まだ 何も かかって いない', mild: '{trap}: 変わり なし。まだ 何も 入って いない' },
  empty:    { normal: '空はじき。ばね木が はねた あとだ。何も いない', mild: '空はじき。はじけて いた。何も いない' },
  baitGone: { normal: 'エサだけ 取られた。輪は 無事', mild: 'エサだけ なく なって いた' },
  caught:   { normal: '{who}が かかって いた', mild: '罠に {who}が 入って いた' },
  lost:     { normal: 'かかったが 逃げられた。輪が 切れて いた', mild: 'かかって いたが、ほかの 動物に 持って いかれた。羽根が 残って いた' },
  broken:   { normal: '罠が 壊れて いた。紐が 切れて いる', mild: '罠が こわれて いた。紐が ほどけて いる' },
};

// 原因の 手がかり（札の 2 行目。K1 以上で 出る）。
export const TRAP_CAUSE = {
  scent:          'まだ 人の においが 残って いる。6 時間 ほど 待とう',
  offTrail:       '道から 外れて いた。獣道の 上に 置くと かかりやすい',
  loopHeight:     '輪の 高さが 合って いなかった。鳥は 指 3 本、小さい けものは 指 1 本',
  triggerShallow: '引き金が 浅かった。風や 小さな 揺れで はじけて しまう',
  triggerDeep:    '引き金が 深すぎた。動いても 落ちない',
  wind:           '風が 強かった。空はじきが 多い 日だ',
  baitNearMouth:  'エサが 輪に 近すぎた。すぐ 取られて しまう',
  late12h:        '12 時間 以上 見に 来なかった。逃げられて しまう',
  stakeShallow:   '杭が 浅かった。かかった 獲物が 杭ごと 抜けて いった',
  looseKnot:      '結びが ゆるかった。しめの 引きは 短く、しっかり',
  flood:          '増水で 流された。魚かごは 石で おさえて おこう',
  narrowGood:     '道の 狭まりの そばで かかった。ここは 通り道だ',
  mouthWrong:     '口の 向きが 合って いなかった。川では 口を 下流へ',
  noBait:         'エサを 置いて いなかった。合う エサを 入れよう',
};

// 仕掛ける 手順の 段の 名前と 一行ヒント（K2 以上で 出る。§26.5）。
export const TRAP_STEP = {
  snare: {
    aim:     { name: 'ねらいを 決める', hint: '鳥か 小さい けものか。道の 主と 合わせて 決める' },
    stake:   { name: '杭を 打つ', hint: '道の わきに、斜めに 深く 打つ' },
    bend:    { name: 'ばね木を しならせる', hint: '力を 入れすぎず、帯の 中で じっと' },
    loop:    { name: '輪を 作る', hint: '引くと しまる 結び。しめすぎない' },
    size:    { name: '輪の 高さと 大きさ', hint: '鳥は 指 3 本、小さい けものは 指 1 本の 高さ' },
    trigger: { name: '引き金を かける', hint: 'そっと すべらせる。深さは 半分くらい' },
    bait:    { name: 'エサを 置く', hint: '輪の 向こう 10cm。輪には さわらない' },
  },
  deadfall: {
    bait:     { name: 'エサを 付ける', hint: '先に エサ棒の 先へ。石を 上げる 前に' },
    lift:     { name: '石を 起こす', hint: '平たい 石の はしを 持ち上げて、保つ' },
    assemble: { name: '4 の 字を 組む', hint: '立て棒、斜め棒、エサ棒の 順に かみ合わせる' },
    lower:    { name: 'そっと 下ろす', hint: '石の 重さを 少しずつ あずけて、手を ぬく' },
    notch:    { name: '切り欠きを 作る', hint: '3 本の 棒に、平らな 切り欠きを 入れる' },
  },
  fish_trap: {
    bait:   { name: 'エサを 結ぶ', hint: 'かごの まん中に つるす。口の そばは だめ' },
    place:  { name: '置き場所と 口の 向き', hint: '川は 口を 下流へ。入り江は 岩かげの 方へ' },
    stones: { name: '石で おさえる', hint: '両わきと 上に 石。かごを つぶさない' },
    rope:   { name: '引き綱を つなぐ', hint: '岸の 根や 杭へ。水から 上げる ための 綱' },
  },
  firelay: {
    type:    { name: '組み方を 選ぶ', hint: '円すい・井げた・星形。まずは 円すいが やさしい' },
    tinder:  { name: '火口を 置く', hint: 'まん中に 枯れ草を、ふんわりと' },
    pencil:  { name: '細い 枝を 立てかける', hint: '鉛筆の 太さの 枝を 3 本、三角に。すきまを あける' },
    finger:  { name: '指の 太さの 枝を 足す', hint: '指の 太さを 2 本。つめすぎない' },
  },
  coconut: {
    husk:    { name: '外皮を はぐ', hint: '杭に 打ちつけて、ねじる' },
    eye:     { name: '柔らかい 目を 探す', hint: '3 つの 目の うち、いちばん 柔らかい 1 つ' },
    drink:   { name: '飲む', hint: '水は 少しずつ。こぼさない よう' },
    equator: { name: '赤道を 割る', hint: '真ん中の 線を 回しながら たたく' },
  },
  knot: {
    wrap:    { name: '糸を 巻く', hint: '本線に 5 回。3 回 以下は ほどけやすい' },
    thread:  { name: '輪に 通す', hint: '糸の はしを 輪に くぐらせる' },
    tighten: { name: 'しめる', hint: 'しめる 前に 濡らすと 強い' },
  },
  signal: {
    color:  { name: '色を 選ぶ', hint: '地面と 反対の 色。白い 砂には 黒い 石' },
    stones: { name: '石を 並べる', hint: 'まっすぐ 線を 引く。角は はっきり' },
    core:   { name: '芯を 組む', hint: '乾いた 芯を 円すいに。生の 葉は わきに 置く' },
    green:  { name: '生葉を かぶせる', hint: '炎が 上がって から。白い 煙が 太く 出る' },
  },
  track: {
    who:  { name: 'だれの 跡か', hint: '形と 大きさを よく 見る' },
    when: { name: 'いつの 跡か', hint: 'ふちが 鋭い・つやが ある なら 新しい' },
  },
};

// K0 で 出る 「次は 何を？」の 3 つの 選択肢（§26.7）。
export const K0_GUESS = {
  snare:     ['杭から？', '輪から？', 'ばね木から？'],
  deadfall:  ['エサから？', '石を 起こすのから？', '棒を 組むのから？'],
  fish_trap: ['エサから？', '置き場所から？', '石から？'],
  firelay:   ['火口から？', '細い 枝から？', '薪から？'],
};

// 仲間が 作業中に 次の 段を 教える 一言（§26.7・§25.4）。罠は 段ごと、ほかは 段ごと。
export const TEACH = {
  nagi: {
    snare: {
      stake:   'ここ、杭を 斜めに。ぬけにくい 深さまで 打つよ！',
      bend:    'ばね木は 力 入れすぎないでね。帯の 中で ゆっくり。',
      loop:    '引くと しまる 結び！ しめすぎると 輪が しまらないよ。',
      size:    '輪、低すぎ ない？ 鳥なら 指 3 本ぶん 上だよ。',
      trigger: '引き金は そーっと。速いと はじけちゃうよ！',
      bait:    'エサは 輪の 向こう 10cm。輪には さわらないでね。',
    },
    deadfall: {
      bait:     'エサは 先に つけて！ 石を 上げて からだと 危ないよ。',
      lift:     '石の はしを 持ち上げて、保つ。ゆっくりね。',
      assemble: '立て棒、斜め棒、エサ棒の 順！ かみ合わせて。',
      lower:    'そっと 下ろすの。急に はなすと くずれちゃうよ。',
      notch:    '切り欠きは 平らに。3 本とも 同じ 深さでね！',
    },
    fish_trap: {
      bait:   'エサは かごの まん中。口の そばだと 外から 取られるよ。',
      place:  '川なら 口は 下流！ においで 魚が 上って くるから。',
      stones: '石は 両わきと 上。かごを つぶさない ように ね。',
      rope:   '引き綱は 岸の 杭へ。流されても これで 拾えるよ。',
    },
    firelay: {
      type:   '最初は 円すいが いいよ。',
      tinder: '火口は まん中に ふんわり 置いてね。',
      pencil: '鉛筆くらいの 枝を 3 本、三角に 立てて。',
      finger: '指の 太さの 枝は すきまを あけて。つめすぎない！',
    },
    coconut: {
      husk:    '杭に 打ちつけて、ねじると はがれるよ。',
      eye:     '3 つの 目の どれが 柔らかいか、よく 見て。',
      drink:   '飲むのは 柔らかい 目から。こぼさないでね。',
      equator: '赤道の 線を 回しながら たたくと、きれいに 割れるよ。',
    },
    knot: {
      wrap:    '5 回 巻くと 強いよ。3 回だと すぐ ほどける！',
      thread:  'はしを 輪に くぐらせて。',
      tighten: 'しめる 前に 濡らすと 強くなるんだよ。',
    },
    signal: {
      color:  '地面と 反対の 色なら 遠くからも 見えるよ。',
      stones: 'まっすぐ 線を 引いて。角は はっきりね。',
      core:   '乾いた 芯を 円すいに。生の 葉は わきに 置いといて。',
      green:  '炎が 上がって から 生葉を かぶせるよ！',
    },
    tracks: '2 つに 割れた ひづめなら ヤギか イノシシ。ふんの 形も 見てみて。',
  },
  touko: {
    snare: {
      stake:   '杭は 斜めに 打つと 安定します。',
      bend:    '力は ほどほどに。帯の 中で 落ち着いて。',
      loop:    'しめる 結びは 引きを 短く、しっかりと。',
      size:    '鳥は 指 3 本ぶん、小さい けものは 指 1 本ぶんの 高さが 目安です。',
      trigger: '引き金は ゆっくり。速いと はじけて しまいますよ。',
      bait:    'エサは 野イチゴや 木の実が 合うと 思います。輪から 10cm ほど 離して。',
    },
    deadfall: {
      bait:     'エサは 先に 付けて おくと 安心です。',
      lift:     '石は 平らな 物を 選んで、ゆっくり 持ち上げて。',
      assemble: '棒は 立て棒、斜め棒、エサ棒の 順に 組みます。',
      lower:    'そっと 下ろして。急ぐと 石が くずれて しまいます。',
      notch:    '切り欠きは 平らに。そろえると 組みやすいですよ。',
    },
    fish_trap: {
      bait:   'エサは かごの まん中に。口の 近くでは 先に 食べられて しまいます。',
      place:  '川の 流れは 口を 下流へ。魚が においを たどって 入ります。',
      stones: '石は 両わきと 上に。かごは やさしく 押さえて。',
      rope:   '引き綱は 岸の 根に。見失わない ための 印ですよ。',
    },
    firelay: {
      type:   '円すいが いちばん 組みやすいと 思います。',
      tinder: '火口は 枯れ草を ふんわり まん中に。',
      pencil: '鉛筆くらいの 枝を、三角に 立てかけましょう。',
      finger: '枝の 間に すきまを 残して。空気が 通りますから。',
    },
    coconut: {
      husk:    '杭に 当てて ねじると、外皮が はがれます。',
      eye:     '3 つの 目の うち、柔らかい 1 つを 探して ください。',
      drink:   '水は 少しずつ 飲みましょう。',
      equator: '赤道の 線に そって、回しながら 割ります。',
    },
    knot: {
      wrap:    '糸は 5 回 巻くと 安心です。',
      thread:  'はしを 輪に くぐらせて ください。',
      tighten: 'しめる 前に 濡らすと、ほどけに くいですよ。',
    },
    signal: {
      color:  '地面と 反対の 色が 目立ちますね。',
      stones: '線は まっすぐ、角は はっきりと。',
      core:   '芯は 乾いた 物を。生の 葉は 後で のせますね。',
      green:  '炎が 上がって から、生葉を かぶせて ください。',
    },
    tracks: '形と 大きさを 見ると、だれの 跡か 分かりますよ。ふんの 形も ヒントです。',
  },
  gen: {
    snare: {
      stake:   '杭は 斜めに 打て。ぬけたら 終わりだ。',
      bend:    'ばね木は 力 入れすぎるな。帯の 中で じっと。',
      loop:    '引くと しまる 結びだ。しめすぎるな。',
      size:    '輪は 低すぎる。鳥なら 指 3 本ぶん 上だ。',
      trigger: '引き金は そっと かけろ。速いと はじける。',
      bait:    'エサは 輪の 向こう 10cm。輪には さわるな。',
    },
    deadfall: {
      bait:     'エサは 先に 付けろ。石を 上げて からでは 危ない。',
      lift:     '石の はしを 持ち上げて、保て。',
      assemble: '立て棒、斜め棒、エサ棒の 順だ。',
      lower:    'そっと 下ろせ。急に はなすな。',
      notch:    '切り欠きは 平らに。3 本とも 同じ 深さだ。',
    },
    fish_trap: {
      bait:   'エサは まん中だ。口の そばは 取られる。',
      place:  '川なら 口は 下流。魚は 上って くる。',
      stones: '石は 両わきと 上。かごを つぶすな。',
      rope:   '引き綱は 岸の 杭へ。流されても 拾える。',
    },
    firelay: {
      type:   '円すいから やれ。',
      tinder: '火口は まん中に ふんわり。',
      pencil: '鉛筆の 太さの 枝を 3 本、三角に。',
      finger: '指の 太さの 枝は すきまを あけろ。つめるな。',
    },
    coconut: {
      husk:    '杭に 打ちつけて、ねじれ。',
      eye:     '3 つの 目の どれが 柔らかいか、よく 見ろ。',
      drink:   '飲むのは 柔らかい 目からだ。',
      equator: '赤道を 回しながら たたけ。',
    },
    knot: {
      wrap:    '5 回 巻け。3 回では ほどける。',
      thread:  'はしを 輪に くぐらせろ。',
      tighten: 'しめる 前に 濡らせ。強くなる。',
    },
    signal: {
      color:  '地面と 反対の 色だ。遠くから 見える。',
      stones: 'まっすぐ 線を 引け。角は はっきりと。',
      core:   '乾いた 芯を 円すいに。生葉は わきだ。',
      green:  '炎が 上がって から 生葉を かぶせろ。',
    },
    tracks: '2 つに 割れた ひづめなら ヤギか イノシシだ。ふんも 見ろ。',
  },
};

// 獣道の 上を 通った とき、狩りの 仲間が 言う 一言（§26.3）。
export const TRAIL_SPOT = {
  nagi:  'ここ、通り道だ！ 草が 倒れて 筋に なってるよ。',
  touko: 'ここ、獣道ですね。草の 倒れた 筋が 続いて います。',
  gen:   'ここ、通り道だ。草が 寝てる。罠は この上だ。',
};

// 朝の 声かけ（§26.8）。「罠、見に 行く？」。
export const TRAP_MORNING = {
  nagi:  '罠、見に 行く？ 朝の うちなら 逃げにくいよ！',
  touko: '罠を 見に 行きましょうか。朝の うちが いいと 思います。',
  gen:   '罠、見に 行くぞ。朝の うちだ。',
};

// 足跡・ふんの 手がかり（§26.3）。K1 の 見分けの 言葉と K2 の 印。
export const TRACKS = {
  goat: {
    name: 'ヤギ',
    track: '2 つに 割れた ひづめ。大きめで 深い',
    scat: '丸くて 小さい 粒が たくさん',
  },
  boar: {
    name: 'イノシシ',
    track: '2 つに 割れた ひづめ。大きく 泥が 深い',
    scat: '太い 塊。木の実の かけらが 混ざる',
  },
  junglefowl: {
    name: '野鶏',
    track: '3 本指。細く、先に 小さな 爪',
    scat: '細い 白っぽい 筋が 付いた 小さな 粒',
  },
  seabird: {
    name: '海鳥',
    track: '3 本指に 水かきの 跡。砂の 上に 点々',
    scat: '白い ふん。岩に 付く',
  },
  rat: {
    name: '大ネズミ',
    track: '4 本指の 小さい 足跡。小さな 粒が たくさん',
    scat: '細長い 黒い 粒。あちこちに ちらばる',
  },
  monitor: {
    name: 'トカゲ',
    track: '5 本指。長い 尾の 引きずり跡',
    scat: '細長く、先が 白い',
  },
  coconut_crab: {
    name: 'ヤシガニ',
    track: '横に 並んだ 点線。ひづめの ない 小さな 足跡',
    scat: 'ヤシの 繊維の かけら',
  },
};

// 足跡・ふんの「いつの」（§26.3 K2）。
export const TRACK_AGE = {
  fresh: { name: '新しい', clue: 'ふちが 鋭い・つやが ある' },
  half:  { name: '半日くらい', clue: 'ふちが 少し 丸い・つやが 薄い' },
  old:   { name: '古い', clue: 'ふちが 丸く、かわいて いる' },
};

// 図鑑の 新しい 手順の 項目（guide.js GUIDE と 同じ 形。§26.7・§26.9・§26.3）。
export const HOWTO_MORE = {
  howto_read_tracks: {
    cat: 'animal', name: '足跡・ふんの 読み方', provisional: '足の 跡と 黒い 粒', verdict: 'other', howto: true,
    features: '足の 形と 大きさで、だれの 跡か 分かる。ふんの 形も 手がかり。',
    uses: '獣道の 場所と 新しさが 分かる。罠を 置く 道を 選べる。',
    lookalike: null, where: '砂・泥・濡れた 土の 上', when: '新しい 跡ほど 今の 動きを 教えて くれる',
    icon: '🐾', color: '#7a6a4a',
  },
  howto_coconut: {
    cat: 'plant', name: 'ヤシの実の 割り方', provisional: '硬い 大きな 実', verdict: 'food', howto: true,
    features: '外皮は 杭に 打ちつけて はがし、柔らかい 目を 石で 割る。振って 音が しない 実は 古い。',
    uses: '中の 水が 飲める。殻は 器に なる。赤道で きれいに 割れると 器が 2 つ 取れる。',
    lookalike: null, where: 'ヤシ林・浜', when: '落ちて すぐの 実は 水が 多い',
    icon: '🥥', color: '#8a6a3e',
  },
  howto_fish_knot: {
    cat: 'sea', name: '釣りの 結び', provisional: '糸と 針の 結び方', verdict: 'other', howto: true,
    features: '糸を 本線に 5 回 巻き、はしを 輪に 通して しめる。しめる 前に 濡らすと 強い。',
    uses: '針が 外れにくく なる。大物の ばらしが 減る。',
    lookalike: null, where: '釣りの 場所', when: '針を 付け替える とき',
    icon: '🎣', color: '#4a8fb0',
  },
  howto_signal: {
    cat: 'stone', name: '合図（SOS・狼煙）', provisional: '石の 並べ方と 煙の 上げ方', verdict: 'other', howto: true,
    features: 'SOS は 地面と 反対の 色の 石を 線に 並べる。狼煙は 乾いた 芯を 円すいに 組み、生葉で 白い 煙を 出す。',
    uses: '船や 遠くの 人に 気づいて もらえる。',
    lookalike: null, where: '浜・見晴らしの いい 所', when: '昼は 白い 煙、夜は 火の 明かり',
    icon: '🔥', color: '#e8743b',
  },
  howto_firstaid: {
    cat: 'plant', name: '手当て（包帯・添え木・湿布・トゲぬき）', provisional: 'ケガの 手当て', verdict: 'medicine', howto: true,
    features: '添え木は 関節を 2 つ またぐ 長さに。トゲは 入った 向きに そって 抜く。ケガは 先に 洗う。',
    uses: 'ケガの 治りが 早く なり、ばい菌が 入りにくい。',
    lookalike: null, where: 'どこでも（水が あると 楽）', when: 'ケガを 負った ら すぐ',
    icon: '🩹', color: '#c9a96a',
  },
  howto_trap_pit: {
    cat: 'animal', name: '落とし穴の 組み方', provisional: '地面の くぼみ（落とし穴）', verdict: 'food', howto: true,
    features: '穴を 掘り、棒を 格子に 組んで 葉で ふたを する。まん中に エサを 投げ入れる。土を うすく かけて においを 消す。',
    uses: 'イノシシ・ヤギが かかる。道の 上に 作ると かかりやすい。',
    lookalike: null, where: '密林の 獣道・草原', when: '夕方に 作って 朝 見回る',
    icon: '🕳️', color: '#7a6a4a',
  },
  howto_thatch: {
    cat: 'plant', name: '屋根の ふき方', provisional: '葉っぱの 屋根', verdict: 'other', howto: true,
    features: '下の 段から 上へ、葉を 3 分の 1 ずつ 重ねる。葉の 先は 下へ 向ける。',
    uses: '雨もりが 減る。雨宿りや 寝床を 守れる。',
    lookalike: null, where: '基地の 上', when: '雨の 前に',
    icon: '🌴', color: '#5f8f4a',
  },
  howto_preserve: {
    cat: 'sea', name: '干物・燻製の 仕込み', provisional: '魚を 干す 方法', verdict: 'food', howto: true,
    features: '魚は 厚さを そろえて 開き、すきまを あけて つるす。燻製は 白い 煙を 保つ。',
    uses: '食べ物が 長持ちする。風の 通る 日かげで 干すと よい。',
    lookalike: null, where: '浜・基地', when: '晴れた 日の 昼',
    icon: '🐟', color: '#c9a96a',
  },
  howto_tan: {
    cat: 'animal', name: '皮なめし', provisional: '固い 生皮', verdict: 'other', howto: true,
    features: '脂を かき取り、枠に 対角の 順で 張る。なめし液を もみこみ、乾かしてから しごいて やわらかく する。',
    uses: 'やわらかい 皮が 取れ、服や 水袋に 使える。',
    lookalike: null, where: '基地・川べり', when: '皮を 取った あと 早めに',
    icon: '🧶', color: '#a0764a',
  },
  howto_climb_palm: {
    cat: 'plant', name: 'ヤシの 登り方', provisional: '高い ヤシの木', verdict: 'other', howto: true,
    features: '左右の 足を 交互に 動かして 幹を 登る。足に 縄の 輪を かけると 登りやすい。濡れた 幹は すべる。',
    uses: 'ヤシの実を 取れる。高い 所から 見晴らしも 得られる。',
    lookalike: null, where: 'ヤシ林', when: '乾いた 日に',
    icon: '🌴', color: '#5f8f4a',
  },
  howto_still: {
    cat: 'stone', name: '蒸留器の 作り方（太陽の 水）', provisional: '穴と 幕（水を 取る 仕掛け）', verdict: 'other', howto: true,
    features: '穴の 底に 器を 置き、まわりに 葉や 海藻を 入れて 幕を かける。まん中に 小石を 置くと、しずくが 器に 落ちる。',
    uses: '海水や 湿った 葉から 水が 取れる。',
    lookalike: null, where: '日当たりの いい 砂地', when: '晴れた 日の 昼',
    icon: '☀️', color: '#e8b43b',
  },
};
