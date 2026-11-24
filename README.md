# lab

作品の一覧と遊べるもの：**https://tomy1031.github.io/lab/**
（[`site/`](site/) のページと各ブランチの作品を `site/build.mjs` で組み立て、`gh-pages` ブランチから配信。更新は `sh site/publish.sh`、または GitHub Actions の「Publish lab site」）

| プロジェクト | 内容 |
|---|---|
| [nextmake-mv](nextmake-mv/) | 株式会社ネクストメイクのショートフィルム4本：01 投資家向けMV、02 代表・松井亮のポートレート、03 NMClawプロモーション、04 IDO（観光DX）プロモーション。調査メモ、音楽（オリジナルの合成と、フリーBGMの編集）、モーショングラフィックス、レンダリングスクリプト一式 |
| [yokohama-roll](yokohama-roll/) | ハマころ！ — ネクマックスが玉を押して横浜（みなとみらい〜中華街）を転がし、関東・日本・世界まで巻き込む three.js の 3D ゲーム（[あそぶ](https://tomy1031.github.io/lab/yokohama-roll/)） |
| [offbeat-grove](offbeat-grove/) | OFFBEAT GROVE 裏拍ボクササイズ — Meta Quest 3 向けの VR ボクササイズ（three.js / WebXR、オフライン対応）。森と湖の草原で音楽に合わせてパンチし、表拍・裏拍・シンコペーションを体で覚える。ずれを表拍・裏拍別に分析。曲は Web Audio で生成、自分の音楽ファイルでも遊べる（[あそぶ](https://tomy1031.github.io/lab/offbeat-grove/)） |
| [ai-company](https://github.com/tomy1031/lab/tree/claude/ai-employee-3d-visualization-bgkso0/ai-company)（別ブランチ） | NEXTMAKE AI COMPANY — AI社員と人間が一緒に働く 3D バーチャルオフィス（大阪・東京・プノンペン）。統括 AI のネクマックス（裏側は Claude Code）が仕事を分けて配る（[3D オフィスのデモ](https://tomy1031.github.io/lab/ai-company/)） |
| [starlight-lake](https://github.com/tomy1031/lab/tree/claude/jolly-faraday-yhmee4/starlight-lake)（別ブランチ） | Starlight Lake — Meta Quest 2/3 向けの視覚トレーニング VR ゲーム（three.js / WebXR）。論文の訓練法を章ごとのゲームにし、遊ぶ章もえらべる（[あそぶ](https://tomy1031.github.io/lab/starlight-lake/)・[研究ノート](https://tomy1031.github.io/lab/starlight-lake/docs/research.html)） |
| [star-weaver](https://github.com/tomy1031/lab/tree/claude/upbeat-wozniak-itsh33/star-weaver)（別ブランチ） | STAR WEAVER — Meta Quest 2/3 向けのリズムフィットネス VR（three.js / WebXR）。肩こり・腰痛に配慮し、前後の移動なしで遊べる。ホログラムのコーチとチュートリアル付き（[あそぶ](https://tomy1031.github.io/lab/star-weaver/)） |
| [aetherwalk](aetherwalk/) | AETHERWALK 風渡りの巡礼 — Meta Quest 2/3 向けのオープンワールド・フィットネス VR（three.js / WebXR）。その場で足踏みすると歩き、駆け足で走る。剣・盾・弓・爆弾・松明は腕を振って使い、部屋の中は歩き回らない（[あそぶ](https://tomy1031.github.io/lab/aetherwalk/)・[設計書](aetherwalk/docs/DESIGN.md)） |
| [kotoba-town](kotoba-town/) | ことばタウン — VR の まちで 日本語を 声に 出して 練習する（three.js / WebXR・Meta Quest と PC）。『みんなの日本語 I』第1〜10課の 30 場面で、まちの 人と Gemini Live で 会話し、判定と ふりかえりを もらう（[あそぶ](https://tomy1031.github.io/lab/kotoba-town/)） |
| [dream-drift](dream-drift/) | DREAM DRIFT ドリーム・ドリフト — 8台で走る カートレース（three.js / MediaPipe）。ゲームパッド・キーボード・タッチ、カメラの ハンドジェスチャー（見えない ハンドルを にぎって かたむける）、VR（Meta Quest：運転席に すわって ハンドルを にぎる）で あそべる。幻想的な 4 コース（雲の上の キャンディ・夜の ほたるの森・海底の 神殿・星海の ハイウェイ）とグランプリ（[あそぶ](https://tomy1031.github.io/lab/dream-drift/)） |
| [rally-court](rally-court/) | RALLY COURT リアル VR テニス — Meta Quest 2/3 向けの VR テニス（three.js / WebXR）。コントローラーを振ったとおりに当たり、ボールは空気抵抗・回転（マグヌス効果）・バウンドの摩擦まで計算。移動は足踏み・腕振り（落下地点へまっすぐ進む）／自動（自分の最高速度まで）／十字キーから選べ、数値はすべて調整できる。CPU との試合（5 段階）・ラリー練習・球出し・サーブ練習（[あそぶ](https://tomy1031.github.io/lab/rally-court/)） |
| [island-survival](island-survival/) | ひとつだけ島 — ONE THING ISLAND。無人島に 持っていける 道具は ひとつだけ（0〜3 個・全部 も 選べる）。一人称の 無人島サバイバル（three.js / MediaPipe / Gemini Live）。体・天候・病気・火・狩り・釣り・錬成・建築を 重ね、仲間（VRM）と 声で 話せる（[あそぶ](https://tomy1031.github.io/lab/island-survival/)） |
| [sky-atlas](sky-atlas/) | SKY ATLAS 世界の空を飛ぶ VR — Meta Quest 2/3 向け（three.js / WebXR、PC・スマホの画面でも）。本物の地形と衛星写真で世界中の空を飛ぶ。エリアをダウンロードすればオフラインでも飛べる（データはすべて保存してよいオープンデータ：Sentinel-2 cloudless・Terrain Tiles・国土地理院・USGS・IGN・swisstopo・OpenStreetMap）。飛び方は 9 種類（スーパーマン・空中浮遊・鳥・ムササビ・ほうき・グライダー・気球・ジェットパック・魔法のじゅうたん）（[あそぶ](https://tomy1031.github.io/lab/sky-atlas/)） |
