# NEXTMAKE Investor MV

株式会社ネクストメイク（大阪）に出資したくなる100秒のミュージックビデオです。
公開情報を調べて構成し、映像・BGMともにこのリポジトリのコードから生成しています。

- **完成動画**：[`output/nextmake_mv.mp4`](output/nextmake_mv.mp4)（1920×1080 / 30fps / 100秒 / 28MB / 音量 −14 LUFS）
- **共有用の軽量版**：[`output/nextmake_mv_720p.mp4`](output/nextmake_mv_720p.mp4)（1280×720 / 10MB。チャットやメールで送る用）
- **ポスター画像**：[`output/poster.jpg`](output/poster.jpg)
- **調査メモ（出典つき）**：[`docs/research.md`](docs/research.md)
- **絵コンテ**：[`docs/storyboard.md`](docs/storyboard.md)

## ストーリー

1. **課題**：2030年、日本のIT人材は最大79万人不足する（経済産業省の試算）
2. **答え**：大阪発のIT企業が、日本と世界の才能をつなぐ
3. **沿革**：8年で大阪から東京・ベトナム・カンボジア・ウズベキスタンへ
4. **国家プロジェクト**：カンボジア郵便電気通信省が出資する「Japanese IT Pathway」。参加学生78名、120社以上が参加したフォーラムを主催
5. **5つの新規事業**：NMClaw（AI）／IDO（観光DX）／Verify（国連賞受賞プラットフォームを日本初導入）／セキュリティドローン／Internship Lab
6. **成長のエンジン**：育てる → つくる → 事業化する → 届ける の循環
7. **ミッション → CTA**：「人、文化、技術をつなぎ、まだ見ぬ価値を社会へ届ける。」／INVEST IN THE NEXT.

## 仕組み

| ファイル | 役割 |
|---|---|
| `scripts/make_music.py` | オリジナルBGMをnumpyで合成（120 BPM、Dマイナー→Fメジャーで終わる。シンセパッド、アルペジオ、ベース、ドラム、ライザー、インパクト）。ドロップは16/32/56/92秒 |
| `src/index.html` + `src/mv.js` | モーショングラフィックス本体。`MV.seek(t)` で時刻tの1フレームを描画（時間だけで決まるので毎回同じ映像になります） |
| `scripts/render.cjs` | Headless Chromiumで全3,000フレームを並列キャプチャし、ffmpeg（x264）で音声と合成 |
| `scripts/subset_fonts.py` | Noto Sans JP / Noto Serif JP / Montserrat を使用文字だけにサブセット化 |
| `scripts/build.sh` | BGM → フォント → 動画 を一括実行 |

### ブラウザでプレビュー

```bash
cd src && npx http-server -p 8080   # もしくは任意の静的サーバー
# http://localhost:8080/ を開いて ▶ Play（BGM付き・シークバーあり）
```

### 再レンダリング

```bash
pip install numpy scipy fonttools brotli
npm i -g playwright
./scripts/build.sh            # output/nextmake_mv.mp4 を生成（4並列で数分）
```

## 素材・権利

- 写真・イラストは公式サイト（nextmake.site）とPR TIMESのプレスリリースに掲載されている画像です（依頼者の指示によりWeb上の素材を使用）。
- ロゴは公式ロゴ画像をもとにSVGで再作成しました。
- BGMはこのリポジトリで合成したオリジナル曲で、第三者の楽曲は使っていません。
- フォントはSIL Open Font License、地図はNatural Earth（パブリックドメイン）です。
- 動画の最後に「公開情報をもとに制作したイメージ映像」である旨を表示しています。社外に出す前に、ネクストメイク社に内容と素材使用の確認をとってください。
