# 事業プロモーション：03 NMClaw／04 IDO（観光DX）

03は、フリーBGMを1曲、映像に合わせて編集して使っています。04は、このリポジトリで合成した曲を途中で切り替えています（場面の区切りに合わせて、曲・テンポ・楽器がまとめて変わります）。

---

## 03 NMClaw「話すだけで、会社の情報が整理される。」（86秒）

画面のUIは、公式サイトに書かれている製品の流れ（入力 → 理解 → 振り分け → 蓄積 → 可視化）と6つの機能を、HTMLで動く画面として作り直したものです。社名や金額はすべて架空のサンプルです。

文字を読まなくても流れが分かるよう、各場面に図解アニメーションを入れています。場面の切り替えは曲の小節の頭（16秒から約1.87秒ごと）に揃え、青い縁の付いたワイプでつないでいます。

| 時間 | 場面 | 図解・動き |
|---|---|---|
| 0–2.9 | 導入 | メモ・チャット・通知・表計算の断片が、暗い画面に散らばって漂う |
| 2.9–6.6 | **課題1** 情報が、人にとどまる。 | 営業・現場・事務の3人のまわりをメモが回り続ける。経営者へ伸びる線は途中で途切れ（×印）、経営者の頭に「？」 |
| 6.6–10.4 | **課題2** 入力と報告に、時間がかかる。 | 1件の報告が、日報・案件管理表・報告チャット・顧客台帳へ4回打ち直される（1回目〜4回目）。横の時計は針が回り続け、使った時間が赤く埋まっていく |
| 10.4–14.1 | **課題3** 経営状況が、見えにくい。 | 「現場」と「経営」の2本の時間軸。現場の出来事は、数日遅れて経営の軸に届く（集計待ち）。最後に「今日」と経営が把握している時点の差が「判断が、後手に」として示される |
| 14.1–16 | 転換 | 断片がすべて1点に吸い込まれる |
| 16–23.5 | **01 音声入力** | 点が白い円に広がって画面が開く（曲のサビと同時）。話しかけると、波紋が部屋いっぱいに広がり、文字起こしが進む |
| 23.5–31 | **02 AIが理解し、聞き返す** | 文字起こしがスマホから飛び出して大きく表示される。AIが「顧客・案件・金額・期日」に1拍ずつマーカーを引き、項目カードが埋まる。担当者の欄だけ空いてオレンジに点滅し、点線でスマホの質問へつながる →「佐藤さんです」で埋まり、タスクが作られる |
| 31–42.2 | **03 自動振り分け** | 左の6項目から、中央の「NMClaw AI」を通って右の5つの台帳へ、光る粒が2拍ごとに流れる。届くたびに台帳の件数が増える。中央の下には「会社のルール」 |
| 42.2–53.4 | **04 ダッシュボード** | 画面が手前に起き上がり、数字が回り、棒グラフと折れ線が伸びる。後半はカメラがAIの要約と期日アラートへ寄り、ベルが鳴る |
| 53.4–68.4 | **05 6つの機能** | 各機能に動くアイコン（マイクと波形／質問→回答→チェック／1本の流れが3つへ分かれる／要約が書かれていく／ベルとチェックリスト／伸びる棒グラフ）。1小節ごとに1機能ずつ拡大し、下の進捗バーが伸びる |
| 68.4–76 | **06 流れ** | 5つの工程を結ぶパイプの上を、データ（音声メモ → 顧客・案件・金額・期日 → 5つの項目へ → 会社のデータに）が2拍ごとに進み、通過した工程が青く点灯する。最後にグラフが立ち上がる |
| 76–86 | **エンドカード** | NMClaw「情報を、価値へ。」とご相談の案内 |

**曲：「Future Next」作曲：FLASH☆BEAT**（OpenTracks〈旧DOVA-SYNDROME〉のフリーBGM、128 BPM）。作曲者の説明は「近未来を彷彿とさせるなか、ピアノが心地よいエレクトロ」です。

- 前の版の合成音楽は「不自然」とのご指摘を受け、実際に制作された曲に差し替えました。効果音もなくし、曲だけにしています。
- 編集は小節の頭どうしでつないでいます。つなぎ目の前後の類似度は0.98です。
- 音量は −15 LUFS です。
- 音源ファイルの再配布はライセンスで禁止されているため、曲はGitに入れていません。`scripts/fetch_music.py` で取得します。

音楽：[`scripts/music_nmclaw.py`](../scripts/music_nmclaw.py)／映像：[`src/nmclaw/film.js`](../src/nmclaw/film.js)

## 04 IDO「ひとつのQRから、街の物語がひらく。」（100秒）

公式サイトの体験の流れ（QRを読み取る → 動画を再生 → 購入 → ガイド → 街歩き → 周辺情報）に沿って、**現地でQRを読み取るところ**から見せています。

| 時間 | 場面 | 図解・動き | 音楽 |
|---|---|---|---|
| 0–15 | **伝承**：祖谷渓・落合集落・かずら橋の実写に、縦書きで「名所の背景には、人々の営みがある。」「歴史を知ると、街の歩き方が変わる。」 | 実写にゆっくり寄る | **Cue A 伝承**：都節音階（D E♭ G A B♭）の箏、尺八、川のせせらぎ |
| 16–26 | **IDOの4つの意味**：異土・移動・緯度・I do | 1語ずつ縦書きで立ち上がる | 1語ごとに太鼓と箏。連打でいったん止める |
| 26–36 | **01 現地でQRを読み取る** | ①かずら橋の入口に、QR付きの立て札（「観光地に設置されたQRコード」と注記）→ ②スマホを構えると、画面がカメラの映像になり、立て札のQRが枠に入って読み取られる → ③その場で物語の動画が始まり、昔の風景写真がスマホから周りへ浮かび出る。画面下の3つの工程（①QRを見つける　②スマホのカメラでかざす〈アプリ不要〉　③その場所の物語が、その場で始まる）が順に点灯する | **Cue B 旅**（96 BPM・ニ長調ペンタトニック）：QRのチャイムで開始。読み取り（29.75秒）と再生（31秒）で効果音 |
| 36–41 | **02 ガイドチケット** | 左のスマホで指先が「購入する」をタップ → 右に並んだ6つのガイドのうち、無料で見たSTORY 01以外の5つがロック付きの白黒から、1つずつ色づいてひらく（ひらいたガイド 1/6 → 6/6） | タップ、購入、ひらくたびにベルが音階を上がる |
| 41–51 | **03 街歩き** | 地図の上を歩く人のマークが進み、スポットごとのQRを読み取る。そのたびに波紋が広がり、その場所の物語カード（▶ 再生中）が出てチェックが付く。道中の食・宿・土産・体験のピンも立つ | スポットごとに箏がひとつ鳴る |
| 51–56 | **04 多言語** | スマホの字幕と下の大きな字幕カードが、日本語 ⇄ English で入れ替わる。回る地球アイコン | 切り替えごとにクリック音 |
| 56–66 | **写真の連続**：「見る観光から、物語をたどる観光へ。」 | 1枚ごとに地名（祖谷のかずら橋、大歩危、小歩危、落合集落、奥祖谷など）とピン、進み具合の目盛り | いちばん厚くなる。最後は箏のグリッサンドで次へ |
| 66–78 | **地域還元の循環** | 5つの工程をアイコン付きの円でつなぎ、線が引かれると粒が円を巡る。「売上の一部を地域へ還元」から中央の「地域の未来へ」へ粒が流れ込む | **Cue C 還る**：ストリングス、箏のアルペジオ、ピアノ |
| 78–86 | **導入事例：徳島県三好市** | 四国の地図の輪郭が描かれ、徳島県が塗られ、三好市にピンが落ちる | |
| 86–100 | **エンドカード**：IDO「文化を、体験へ。」→ 写真クレジット | | ニ長調で解決。落款で箏とチャイム |

音楽：[`scripts/music_ido.py`](../scripts/music_ido.py)／映像：[`src/ido/film.js`](../src/ido/film.js)

### 写真クレジット（Wikimedia Commons）

三好市の風景写真は、以下の作品を各ライセンスに従って使っています（トリミング・色調補正あり）。映像の最後にもクレジットを表示しています。

| ファイル | 作者 | ライセンス | 出典 |
|---|---|---|---|
| miyoshi_kazurabashi.jpg | Motokoka | CC BY-SA 4.0 | [Iya waddle bridge(Kazurabashi) 01](https://commons.wikimedia.org/wiki/File:Iya_waddle_bridge(Kazurabashi)_01.jpg) |
| miyoshi_kazura_walk.jpg | Motokoka | CC BY-SA 4.0 | [Iya waddle bridge(Kazurabashi) 02](https://commons.wikimedia.org/wiki/File:Iya_waddle_bridge(Kazurabashi)_02.jpg) |
| miyoshi_okuiya_bridge.jpg | 京浜にけ | CC BY-SA 3.0 | [Tokushima Miyoshi Okuiya Double Kazurabashi 5](https://commons.wikimedia.org/wiki/File:Tokushima_Miyoshi_Okuiya_Double_Kazurabashi_5.JPG) |
| miyoshi_iya_autumn.jpg | KimonBerlin | CC BY-SA 2.0 | [Iya Valley (6551493685)](https://commons.wikimedia.org/wiki/File:Iya_Valley_(6551493685).jpg) |
| miyoshi_iya_valley.jpg | KimonBerlin | CC BY-SA 2.0 | [Iya Valley (6551498255)](https://commons.wikimedia.org/wiki/File:Iya_Valley_(6551498255).jpg) |
| miyoshi_iya_observatory.jpg | Naokijp | CC BY-SA 4.0 | [Iya Valley seen from the Iya Valley Observatory 001](https://commons.wikimedia.org/wiki/File:Iya_Valley_seen_from_the_Iya_Valley_Observatory_001.jpg) |
| miyoshi_oboke.jpg | Naokijp | CC BY-SA 4.0 | [Ōboke Valleys 001](https://commons.wikimedia.org/wiki/File:%C5%8Cboke_Valleys_001.jpg) |
| miyoshi_koboke.jpg | Naokijp | CC BY-SA 4.0 | [Koboke Valleys 001](https://commons.wikimedia.org/wiki/File:Koboke_Valleys_001.jpg) |
| miyoshi_oboke_boat.jpg | ブルーノ・プラス | CC BY-SA 4.0 | [Oboke gorge pleasure boat and carp streamer](https://commons.wikimedia.org/wiki/File:Oboke_gorge_pleasure_boat_and_carp_streamer.jpg) |
| miyoshi_village.jpg | KimonBerlin | CC BY-SA 2.0 | [Iya Valley (6551525965)](https://commons.wikimedia.org/wiki/File:Iya_Valley_(6551525965).jpg) |
| miyoshi_ochiai.jpg | At by At | CC BY-SA 3.0 | [Higashi-Iya Ochiai 201303-1](https://commons.wikimedia.org/wiki/File:Higashi-Iya_Ochiai_201303-1.JPG) |
| miyoshi_thatch.jpg | Motokoka | CC BY-SA 4.0 | [Ochiai Village 4](https://commons.wikimedia.org/wiki/File:Ochiai_Village_4.jpg) |
| miyoshi_kazura_people.jpg | ume-y | CC BY 2.0 | [Iya Kazurabashi-4](https://commons.wikimedia.org/wiki/File:Iya_Kazurabashi-4.jpg) |
| miyoshi_upper_iya.jpg | KimonBerlin | CC BY-SA 2.0 | [Upper Iya valley (6551515693)](https://commons.wikimedia.org/wiki/File:Upper_Iya_valley_(6551515693).jpg) |

### 注意

- IDOの画面（QR、プレビュー、チケット、ガイド一覧、地図）は、公式サイトに書かれている体験の流れを再現したイメージです。実際のアプリ画面ではありません。物語のタイトルや字幕もイメージ用の文言です。
- かずら橋の入口に置いたQRの立て札は、読み取りの流れを説明するための合成（イメージ）です。実際にその場所に設置されているとは表現していません（映像内にも「※QRの設置場所・デザインはイメージです」と表示）。
- 四国の地図は Natural Earth（パブリックドメイン）の行政界データから作りました（`src/assets/shikoku.json`）。
- 公式サイトの三好市の導入事例には、どの名所の物語を扱っているかまでは書かれていません。そのため、映像の中の実写は「三好市の風景」として見せています。特定のスポットがガイドに含まれているとは表現していません。
- CC BY-SAの写真を使った映像を公開するときは、映像そのものも同じライセンスの扱いになる場合があります。公開前に確認してください。
