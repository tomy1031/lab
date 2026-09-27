# 事業プロモーション：03 NMClaw／04 IDO（観光DX）

どちらも曲を途中で切り替えています。場面の区切りに合わせて、曲・テンポ・楽器がまとめて変わります。

---

## 03 NMClaw「話すだけで、会社の情報が整理される。」（86秒）

画面のUIは、公式サイトに書かれている製品の流れ（入力 → 理解 → 振り分け → 蓄積 → 可視化）と6つの機能を、HTMLで動く画面として作り直したものです。社名や金額はすべて架空のサンプルです。

| 時間 | 場面 | 音楽 |
|---|---|---|
| 0–16 | **課題**：散らばるメモ・チャット・通知 →「情報が、人にとどまる」「入力と報告に、時間がかかる」「経営状況が、見えにくい」→ 断片がひとつの点に集まる | **Cue A 課題**：時計の刻み、通知音、低いドローン、各課題で不協和なピアノ → 15.5秒で無音 |
| 16–24 | **音声入力**：点がマイクになる。話しかけると波形と文字起こしが出る | **Cue B デモ**（120 BPM・ヘ長調）：チャイムで開始。ベルのアルペジオとストリングス |
| 24–32 | **AIヒアリング**：「先方のご担当者は？」→「佐藤さんです」→ タスクを登録 | ハーフテンポのキック。吹き出しごとに効果音 |
| 32–44 | **自動振り分け**：顧客・案件・金額・期日・タスク・日報が、5枚のカードへ飛んで入る | 4つ打ち。カードに入るたびに音階（F G A C D F）が1音ずつ上がる |
| 44–56 | **ダッシュボード**：KPI、売上推移、案件ステータス、AI週次サマリー、期日アラート | ドロップ：ピアノとベルのフック、手拍子 |
| 56–68 | **6つの機能** | 同じグルーヴ。タイルが強調されるたびにピン音 |
| 68–76 | **入力から可視化までの流れ** | 厚みを減らし、スウェルで次へ |
| 76–86 | **エンドカード**：NMClaw「情報を、価値へ。」とご相談の案内 | **Cue C エンド**：Fmaj9で解決。ピアノとベルの動機、ロゴでチャイム |

音楽：[`scripts/music_nmclaw.py`](../scripts/music_nmclaw.py)／映像：[`src/nmclaw/film.js`](../src/nmclaw/film.js)

## 04 IDO「ひとつのQRから、街の物語がひらく。」（100秒）

| 時間 | 場面 | 音楽 |
|---|---|---|
| 0–15 | **伝承**：祖谷渓・落合集落・かずら橋の実写に、縦書きで「名所の背景には、人々の営みがある。」「歴史を知ると、街の歩き方が変わる。」 | **Cue A 伝承**：都節音階（D E♭ G A B♭）の箏、尺八、川のせせらぎ |
| 16–26 | **IDOの4つの意味**：異土・移動・緯度・I do が1語ずつ縦書きで立ち上がる | 1語ごとに太鼓と箏。連打でいったん止める |
| 26–46 | **体験①〜④**：QRを読み取る → 無料で物語の一部を見る → ガイドチケットを購入 → 6つのガイドがひらく（三好市の実写を並べて） | **Cue B 旅**（96 BPM・ニ長調ペンタトニック）：QRのチャイムで開始。箏のリフ、ナイロン弦、軽い打楽器。読み取り・購入・解錠のたびに効果音（解錠は音階を上がる） |
| 46–56 | **体験⑤⑥**：イラストの地図で歩くルートと食・宿・土産・体験のピン → 日本語 ⇄ English の切り替え | 竹笛（尺八）の旋律が加わる |
| 56–66 | **三好市の実写モンタージュ**：「見る観光から、物語をたどる観光へ。」 | いちばん厚くなる。最後は箏のグリッサンドで次へ |
| 66–78 | **地域還元の循環**：チケット購入 → 体験 → 回遊 → 売上の一部を地域へ → 文化・観光資源を保全 | **Cue C 還る**：ストリングス、箏のアルペジオ、ピアノ |
| 78–86 | **導入事例：徳島県三好市**／「大きな設備を増やさず、街全体を観光体験に。」 | |
| 86–100 | **エンドカード**：IDO「文化を、体験へ。」とご相談の案内 → 写真クレジット | ニ長調で解決。落款で箏とチャイム |

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
- 公式サイトの三好市の導入事例には、どの名所の物語を扱っているかまでは書かれていません。そのため、映像の中の実写は「三好市の風景」として見せています。特定のスポットがガイドに含まれているとは表現していません。
- CC BY-SAの写真を使った映像を公開するときは、映像そのものも同じライセンスの扱いになる場合があります。公開前に確認してください。
