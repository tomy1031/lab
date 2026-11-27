# じこしょうかい — 11人の スピーチ

日本語クラスの学生 11 人が日本語で自己紹介をしたスピーチ動画から、**名前を言うところ**と**その人らしさが出るところ**を 1 人約 30 秒ずつ選び、顔のアップと名前のカードをつけてつないだ動画です（5 分 35 秒）。

- 完成動画：[`output/self_intro_720p.mp4`](output/self_intro_720p.mp4)
- ページ（学生を選んで、その人から再生できる）：<https://tomy1031.github.io/lab/self-intro/>

## 構成

| 部分 | 長さ | 中身 |
|---|---|---|
| オープニング | 4.5 秒 | 方眼ノートにクラスの集合写真（ポラロイド）と「じこしょうかい／11人の スピーチ」 |
| 1 人ぶん × 11 | 約 28〜32 秒 | 名前カード 3 秒（顔のアップ・「じこしょうかい No.XX」・名前・フルネーム）→ 名前を言うところ → 人となりが出るところ |
| エンディング | 7 秒 | 「ありがとうございました」と 11 人の顔のポラロイド |

人となりの場面（字幕は [`plan.json`](plan.json) にすべてあります）：

| No. | 名前（スライドのフルネーム） | 使った場面 |
|---|---|---|
| 01 | サク（ティア モニリッティサク） | 兄の結婚式、彼女とパブストリートでデート／進撃の巨人・車の運転が好き、料理は下手 |
| 02 | ラチナ（ヴェン ピッチラチナ） | 日本のアニメ、うどんとカツ丼が好き／写真を撮るのが上手、スポーツは下手 |
| 03 | カロナ | シェムリアップとアンコールワットへ／スマートフォンは便利だけど高い、ゲームが楽しい |
| 04 | ソコーム メンホア | スポーツが大好き（ボウリング・バレーボール・サッカー・テニス） |
| 05 | ソニタ（ソム ソニタ） | ジブリが好き／コーロンと山が好き |
| 06 | ホザニー モサ | 日本の歌（スキマスイッチ、back number）が好き／スポーツは下手、パソコンは上手 |
| 07 | コネル（ベル・コネル） | 白くて元気な猫／日本の本が好き、英語は上手、日本語は下手 |
| 08 | リッティサク（オン チャンリッティサク） | 日本の漫画、漫画家の伊藤潤二が好き／絵が上手、スポーツは苦手 |
| 09 | ヴァンピレック（ジョップ ヴァンピレック） | アニメ・音楽・ゲームが好き、ゲームは上手、日本語は下手 |
| 10 | リープ | プラホック（カンボジアの発酵魚の料理）がきらい |
| 11 | リーヘン | アニメと漫画、ワンピースが一番、うどん／プログラミングは上手、料理は下手 |

ホザニー モサさんはスピーチの間ずっとマスクをしているので、カードの顔もマスク姿です。

## 作り方

1. **素材**：iCloud の共有アルバム（動画 13 本・写真 6 枚）を `scripts/fetch_sources.sh` で取得。IMG_2283（3 秒・誤操作）と IMG_2286（16 秒・IMG_2287 の言い直し）は使っていません。
2. **文字起こし**：`scripts/transcribe.py`（faster-whisper large-v3-turbo、日本語、単語ごとの時刻つき）。聞き取りにくいところは `scripts/tx_seg.py`（large-v3）でもう一度。
3. **名前**：音声だけだとゆれるので、スライドに書かれた名前（「わたしは ○○ です」・表紙のフルネーム）を高画質のコマで読んで確かめました。
4. **場面選び**：[`plan.json`](plan.json) に、使う秒数と字幕を 1 人ずつ書いています。字幕は話した日本語のままですが、助詞などの小さな言いまちがいは直しています。
5. **顔のアップ**：`scripts/findfaces.py`（YuNet）で 0.5 秒ごとに顔を探し、`scripts/facesheet.py` で並べた候補から、正面で笑顔、プロジェクターの光がかかっていないコマを選びました。切り抜いた顔は Real-ESRGAN（realesr-general-x4v3）で拡大し、元の画と 3:1 で混ぜています。
6. **映像**：`scripts/build.py` が原本（1080p）から切り出し、暗い部分を持ち上げるトーンカーブ・軽いノイズ除去・彩度を少し上げて、字幕（libass）と左上の名札を重ねます。
7. **声**：雑音を減らし（arnndn）、圧縮して −17 LUFS 前後にそろえます。切れ目は `scripts/refine.py` が音の大きさから声の始まりと終わりを探して合わせ、言い終わりのあとは無音にフェードしてから次へつなぐので、語尾が消えません。
8. **カード**：`scripts/cards.py`（Pillow）で 1 コマずつ描画。方眼ノートにポラロイドとマスキングテープ、名前は Klee One、札は Zen Maru Gothic。
9. **つなぎと音楽**：`scripts/make_all.py` が全体を 0.3〜0.5 秒のクロスフェードでつなぎ、BGM を重ねます。BGM はカードの間は −21 LUFS 前後、話している間は声より 18 dB ほど小さくしています。カードが出るときに小さなチャイム（`scripts/chime.py` で合成）。
10. **確認**：`scripts/verify.py` が完成動画から 1 人ずつコマを並べ、音声をもう一度文字起こしして字幕と並べ、区間ごとの音量を測ります。

```bash
cd self-intro
scripts/fetch_sources.sh          # 共有アルバムのリンクの期限は 2026-12-27
scripts/fetch_assets.sh           # フォント・モデル・BGM・チャイム
pip install faster-whisper opencv-python-headless pillow numpy spandrel
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
python3 scripts/make_all.py plan.json work      # → work/final.mp4
python3 scripts/verify.py plan.json work work/final.mp4
python3 scripts/publish_files.py plan.json work output ../site/self-intro.html   # サイト用の 720p・ポスター・顔・目次
python3 scripts/deliver.py plan.json work 納品                                  # 1080p・720p・1人ずつの動画
```

(文字起こしと顔さがしは `scripts/transcribe.py` と `scripts/findfaces.py`。結果は `plan.json` に反映済みなので、作り直すだけなら不要です。)

## 素材と権利

- 映像・写真：クラスで撮影したもの（iCloud 共有アルバム）。原本はリポジトリに入れていません。
- BGM：「パステルハウス」かずち（[OpenTracks（旧 DOVA-SYNDROME）](https://opentracks.com/bgm/detail/1021)）。動画の BGM としての利用は可・クレジット不要ですが、音源ファイル自体の再配布はできないため、`scripts/fetch_assets.sh` で公式ページから取得します（`music_src/` は Git に入れません）。
- フォント：Klee One・Zen Maru Gothic（SIL Open Font License）。
- モデル：YuNet（顔検出、Apache 2.0）、Real-ESRGAN（BSD 3-Clause）、RNNoise の arnndn モデル。
