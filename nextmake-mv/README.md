# NEXTMAKE Films

株式会社ネクストメイク（大阪）の、公開情報をもとにつくったショートフィルム4本です。
映像・音楽・レンダリングはすべてこのリポジトリのコードから生成しています。

| | 01「Invest in the Next」 | 02「やるか、やらないか。」 | 03 NMClaw | 04 IDO（観光DX） |
|---|---|---|---|---|
| 目的 | 投資家向けMV | 代表・松井亮のポートレート | AI業務基盤のプロモーション | 観光DXのプロモーション |
| 尺 | 100秒 | 144秒 | 86秒 | 100秒 |
| 完成動画 | [01](output/01_invest_in_the_next.mp4) | [02](output/02_yaruka_yaranaika.mp4) | [03](output/03_nmclaw_promo.mp4) | [04](output/04_ido_promo.mp4) |
| 共有用720p | [01](output/01_invest_in_the_next_720p.mp4) | [02](output/02_yaruka_yaranaika_720p.mp4) | [03](output/03_nmclaw_promo_720p.mp4) | [04](output/04_ido_promo_720p.mp4) |
| 絵コンテ | [storyboard](docs/storyboard.md) | [ceo_film](docs/ceo_film.md) | [promos](docs/promos.md) | [promos](docs/promos.md) |
| 音楽 | [music_invest](scripts/music_invest.py) | [music_ceo](scripts/music_ceo.py) | [music_nmclaw](scripts/music_nmclaw.py)（3曲を切り替え） | [music_ido](scripts/music_ido.py)（3曲を切り替え） |

調査メモ：
- 会社：[`docs/research.md`](docs/research.md)
- 代表の発言（公式YouTubeの字幕から引用候補40件）：[`docs/ceo_transcript_notes.md`](docs/ceo_transcript_notes.md)
- 自伝マンガの読解：[`docs/ceo_manga_notes.md`](docs/ceo_manga_notes.md)

## デザイン

4本とも同じデザインシステム（[`src/common/`](src/common)）を使っています。プロモーション2本では、製品UIのモック部品（[`src/common/ui.js`](src/common/ui.js)）も使っています。

- **色**：墨色（#0b0e14）と生成り色の紙（#f2f0eb）の2色が基本です。ロゴの青（#1668c4）は、ロゴとURLにだけ使います。
- **書体**：
  - 言葉は明朝体（Noto Serif JP）
  - 補足は細めのゴシック（Noto Sans JP）
  - 数字と英字は細いMontserrat
  - 大文字の英字ラベルは字間を広く取ります
- **動き**：
  - 文字は、見えない枠の下から行ごとに上がってくる（マスク）か、1文字ずつ淡く現れる
  - 写真は、切り抜き（クリップパス）で開いて入れ替わる
  - 写真には、ゆっくりした寄りだけをかける
  - 罫線は、引かれるように伸びる
  - フラッシュや画面の揺れは使いません
- **写真**：すべての写真の彩度とコントラストを揃えています。フィルムの粒子と周辺減光をわずかに加えています。
- **02だけの特徴**：
  - 写真の場面は2.39:1のシネマスコープで、黒帯の上に章名を出す
  - モットーは縦書き
  - 締めは紙の地

## 仕組み

| ファイル | 役割 |
|---|---|
| `src/common/lib.js` `base.css` | 共通の動きとデザインシステム。`MV.seek(t)` が時刻tの1フレームを描画します（時間だけで決まるので、何度描いても同じ映像になります） |
| `src/invest/film.js` | 01のシーン構成 |
| `src/ceo/film.js` | 02のシーン構成 |
| `src/nmclaw/film.js` `src/ido/film.js` | 03・04のシーン構成 |
| `scripts/synth.py` | numpyで書いた小さなシンセサイザー。ピアノ、FMベル、エレピ、ストリングス、ドラム、リバーブに加え、箏（弦をはじく音の物理モデル）、尺八、太鼓、UIの効果音 |
| `scripts/render.cjs` | Headless Chromiumでフレームを並列キャプチャし、ffmpegでエンコード |
| `scripts/subset_fonts.py` | 使っている文字だけを残してフォントを小さくする |
| `scripts/build.sh` | 音楽 → フォント → 4本の動画 を一括で実行 |

### ブラウザでプレビュー

```bash
cd src && npx http-server -p 8080
# http://localhost:8080/invest/ ・ /ceo/ ・ /nmclaw/ ・ /ido/   ▶ Play（音楽付き・シーク可）
```

### 再レンダリング

```bash
pip install numpy scipy fonttools brotli
npm i -g playwright
./scripts/build.sh            # output/ に4本を生成（4並列で1本あたり10〜20分）
```

## 素材・権利

- 写真・イラスト・マンガのコマは、公式サイト（nextmake.site）とPR TIMESのプレスリリースに掲載されている画像です（依頼者の指示により、Web上の素材を使っています）。
- 04の三好市の風景写真は、Wikimedia CommonsのCCライセンス作品です。クレジットは映像の最後と[`docs/promos.md`](docs/promos.md)に記載しています。
- 代表の発言は、公式YouTubeチャンネルの動画から引用し、読みやすく整えています。YouTubeの映像と音声そのものは使っていません。
- ロゴは公式ロゴ画像をもとに、SVGで作り直しました。
- 音楽はすべてこのリポジトリで合成したオリジナルです。
- フォントはSIL Open Font License、地図はNatural Earth（パブリックドメイン）です。
- 社外に出す前に、ネクストメイク社と松井氏本人に、内容と素材の使用について確認をとってください。
