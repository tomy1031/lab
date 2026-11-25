# KOTEI DUEL（工程デュエル）— V字の約束　設計書

- 対象：株式会社ネクストメイクの新入社員研修（カンボジアなどの IT 学生・JLPT N4、および日本人の新人）
- 形：1 人用（対 CPU）のデュエル・カードゲーム。PC（マウス／タッチ）と VR（Meta Quest）。three.js + WebXR、ビルドなし、オフライン可。
- データ：`js/data/cards.js`・`chapters.js`・`lessons.js`・`quiz.js`・`tutorial.js`（この設計書の表は、データから自動で作った写し。**正はデータファイル**）
- この設計書の表は読みやすさのためにふりがなを外してある。ゲーム内の文字列（データ）は、漢字を含む語すべてに `{漢字|かんじ}` が付いている（検査ずみ）。

---

## 0. 2 分でわかるルール（プレイヤーに見せる説明の全文）

1. 机の **V字** に、**工程カード** を左から順番に置いて、**リリース** まで進めます。リリースのあと、決まったターンのあいだ **信頼** を守れば勝ちです。
2. 工程を置くと **バグ** が入ります。バグは、工程が 1 つ進むたびに **大きさが 2 倍**（1→2→4→8）。**レビュー** ですぐ直すのが一番安い（工数 1）。V字の **向かい側のテスト** を置くとバグが見つかり、**大きさと同じ工数** で直せます。残したままリリースすると **本番障害** になります。
3. 相手（お客さま・トラブルの化身）は **トラブル** を出します。トラブルは毎ターン、**圧力** の数だけ信頼を減らします。**なかま** で「対応」して圧力を下げます。
4. **そなえ** をふせておくと、相手のカードに **わりこみ** できます（変更管理、議事録 など）。
5. 信頼が 0 になると負け。**納期** のターンまでにリリースできないと、毎ターン信頼が減ります。

この 5 つだけで第 1 章（チュートリアル）は遊べる。承認・とばす・たくらみ は第 2 章以降でヒントとして 1 つずつ出す。

---

## 1. タイトルと世界観

- **タイトル**：KOTEI DUEL（工程デュエル）／副題「V字の約束（The Promise of the V）」
  - 別案：「V-ROAD — リリースへの道」「プロジェクト・デュエル：納期の向こうへ」
- **舞台**：IT 会社「ネクストメイク」（大阪・東京・プノンペン）。プレイヤーは **新人のプロジェクトリーダー**。スーパー「ゴッドマート」のアプリを作る案件を、要件定義から運用まで担当する。机の上の V字 は、プロジェクトそのもの。
- **登場人物**（研修教材の設定を受け継ぐ）
  - **あなた**：新人リーダー。なまえは自由。
  - **ヘンディ先輩（PM）**：案内役。口ぐせは「よかった。次はこうすると、もっといい」。ほめてから直す。失敗を責めない。
  - **営業の山田さん**：お金と日程の話が得意な先輩。
  - **藤木取締役**：悪い報告を「早く教えてくれてありがとう」と受け止める人。
  - **神社長**（ゴッドマート）：悪人ではない。IT を知らないので、ふんわり・思いつき・値切りが出てしまう **お客さま**。勝つと「わかってくれる」。
  - **トラブルの化身**：デスマーチ、バグキング、本番の魔物ショウガイ。人ではなく「よくある失敗」が形になったもの（先輩や同僚を敵にしない、という教材の方針を守る）。
- **トーン**：コミカルで誇張はするが、「日本の職場はこわい」ではなく「こうすれば参加できる」。負けたときの台詞は必ず「次はこうしよう」で終わる。
- **独自の言葉**（遊戯王の固有の用語・名前・絵柄は使わない）

| このゲームの言葉 | 意味 | 英語表示 |
|---|---|---|
| 信頼（しんらい） | プレイヤーの持ち点。0 で負け | Trust |
| 工数（こうすう） | 毎ターン戻る資源。カード・工程・修正に使う | Effort |
| 納期（のうき） | リリースの期限のターン | Deadline |
| V字（ブイじ）／工程デッキ | 工程カードを置く盤／工程カードの置き場（山札とは別） | The V / Stage deck |
| 工程（こうてい）カード | V字に置くカード（要件定義〜リリース） | Stage |
| なかま／チーム | プレイヤーのユニット／その場（3 人） | Member / Team |
| 力（ちから） | なかまの対応力 | Power |
| わざ | 1 回使いきりのカード | Skill |
| そなえ（ガード／資料） | ふせて待つカード／おもてで効きつづけるカード | Guard / Document |
| トラブル／圧力（あつりょく） | 相手のユニット／その強さ（＝攻撃＝のこり） | Trouble / Pressure |
| イベント | 相手の 1 回きりのカード | Event |
| たくらみ | 相手がふせるカード | Plot |
| タイプ | あいまい・変更・お金・納期・人・品質・本番 の 7 つ | Type |
| 対応（たいおう） | なかまがトラブルの圧力を下げること | Respond |
| わりこみ | 相手の行動に、ふせたカードで応じること（連続は 4 枚まで） | Cut-in |
| 承認（しょうにん） | 工程に「合意のハンコ」を押すこと | Approve |
| 本番障害（ほんばんしょうがい） | リリース時に残っていたバグが変わったトラブル | Production incident |
| 教訓（きょうくん）カード／図鑑 | 学びの解説カード／集めた教訓の一覧 | Lesson / Lesson Book |

---

## 2. 学習目標と、それを体感させるルール／カード

「説明を読む」のではなく「そうしないと損をする」形でルールに入れてある。

| # | 工程 | 学んでほしいこと | 体感させるルール（R）・カード（C） | 教訓 |
|---|---|---|---|---|
| 1 | 全体 | 開発は順番に進む。前の工程が次の土台 | R：V字に左から順に置く（1 ターン 1 工程）。テスト・リリースは「製造」がないと置けない | L01 |
| 2 | 全体 | **V字の対応**（設計⇔テスト） | R：テスト工程は「同じ高さの左の工程」のバグだけを見つける。盤面が V の形で、ペアが線で結ばれる | L02 |
| 3 | 全体 | **バグは後で見つけるほど高い** | R：バグは工程が進むたび 2 倍（最大 8）。直すコスト＝大きさ。レビューなら 1。残すと本番障害（圧力＝大きさ） | L02 |
| 4 | 要件定義 | **要件定義を飛ばすと後で痛い** | R：工程は「とばす」こともできるが、とばした設計工程は「穴」になってバグ 2 つが入り、**どのテスト・見つける効果でも見つからない**（設計書がないとテストできない）→ 大きさ 8 の本番障害になる | L03 |
| 5 | 要件定義 | あいまいな言葉をはっきりさせる／なぜを聞く | C：「ふんわり要望」がいる間、要件定義・設計に入るバグ +1 → 先に「なぜ？を聞く」「5W1H」で解決してから置く | L04 L05 |
| 6 | 要件定義 | **合意（承認）してから進む** | R：工程を「承認」（工数 1）すると、相手の「あいまい」カードでバグを足されず、こわされない。C：「言った・言わない」「ちゃぶ台返し」「思っていたのと違う」は未承認の工程だけに効く | L06 L07 |
| 7 | 見積もり | 工数は積み上げ／バッファ／根拠なく値引きしない | R：工数と納期が資源。C：「強引な値切り」は毎ターン工数 −1、「無茶な納期」は納期 −1。「見積もりの根拠」で無効、「バッファ」で納期 +1、「見積書」で工数 +1 | L08 L09 |
| 8 | 管理 | **仕様変更は変更管理で受ける** | C：「変更」イベントは承認ずみでもバグを入れる。止められるのは「変更管理」だけで、**承認ずみの工程がないと発動できない**（合意＝基準があるから「変更」と言える）。発動すると納期 +1（費用と日程をもらう） | L10 |
| 9 | 設計 | 絵で見せる／例外も設計／勝手に決めない | C：「ワイヤーフレーム」（レビュー＋承認）、「読み合わせ」（最初の工程のバグを小さいうちに全部直す）、「A案・B案の提案」 | L11〜L14 |
| 10 | 製造 | 読めるコード・規約／「動いた」は完成ではない | R：製造はバグが 3 つ入る（一番多い）。C：「コーディング規約」「プログラマー」で −1。レビューは 1 ターン 1 回なので、テストまで残るバグが出る | L16 |
| 11 | 管理 | **急ぐと余計に遅れる**（残業・突貫） | C：「残業でカバー」（工数 +3、でもバグ +1・なかまが疲れる）、「突貫作業」（工程をもう 1 つ置けるがバグ +1）。使うと得に見えて、あとで高くつく | L17 |
| 12 | 報連相 | **悪い報告ほど早く** | R：出たばかりのトラブルには NEW マーク。C：「すぐ報告」（コスト 0）は NEW のトラブルだけを解決できる。「抱え込み」「サイレント障害」は攻撃のたびに圧力 +2／+3 で育つ | L29 |
| 13 | 報連相 | 相談は 30 分ルール／連絡は事実で | C：「相談」（小さいバグを直す＋1 枚ひく）、「連絡」（2 枚ひく）、「藤木取締役」 | L30 L31 |
| 14 | テスト | リストでもれなく／バグ報告は具体的に／直したら再テスト | R：見つかったバグしか直せない。テストのあとに入ったバグは「？」のまま。C：「再テスト」「バグ票」「テスト仕様書」「『なんか変です』（直すコスト +1）」 | L19 L20 |
| 15 | テスト | テスト中の機能追加は新しいバグのもと | C：「テスト中の機能追加」は製造に見つかっていないバグ +2 → 再テストしないと本番障害に | L10 |
| 16 | リリース | **手順書・ダブルチェック・切り戻し** | R：相手の「たくらみ」はリリースの瞬間に発動する（設定値のミス／古い手順書／切り替わらない予備機／金曜の夕方）。C：「リリース手順書」「リハーサル」でこわす、「ダブルチェック」で無効、「切り戻し計画」で大きなダメージを 0 に | L23〜L26 |
| 17 | 運用 | **リリース後も仕事は続く** | R：リリースしても勝ちではない。運用ターンを守りきって勝ち。残ったバグは本番障害として攻撃してくる。C：「監視」「ログ分析」「なぜなぜ分析」「改善提案」 | L27 L28 |
| 18 | 全体 | 納期を守る／守れないなら早く相談 | R：納期を過ぎると毎ターン信頼 −2、−3、−4…。「バッファ」「変更管理」で納期をのばせる | L08 |

---

## 3. ルール全文

### 3.1 用意するもの・場

プレイヤー側
- **信頼**：20（＝最大値。回復しても 20 を超えない）
- **工数**：ターンの始めに決まる数まで戻る（1 ターン目 3、毎ターン +1、上限 6）。使い残しは次のターンに持ちこせない。
- **納期**：章ごとに決まるターン数（例：11）。
- **工程デッキ**：その章の V字（トラック）の工程カードを、置く順番に並べて見せておく場所。山札ではない。いつでも見える。
- **V字**：工程カードを置くマス。左うで（決める・設計する）→ 底（製造）→ 右うで（テスト）→ リリース。
- **チーム**：なかまの場。3 人まで。
- **そなえ場**：ガード（うら向き）と資料（おもて向き）を合わせて 3 枚まで。
- **山札**（章ごとに決まった 24〜30 枚。第 1 章は 16 枚）・**手札**（最初 4 枚、上限 7 枚）・**捨て札**。山札がなくなったら、捨て札を切り直して山札にする（ペナルティなし）。

相手（CPU）側
- **トラブル場**：3 体まで。　**たくらみ場**：2 枚まで（うら向き）。
- **行動力**：相手の資源（1 ターン目 2、2 ターンごとに +1、上限 4。章で変わる）。
- **山札**（章ごとの 3 つの束＝序盤・中盤・終盤。束の中だけを切る）・**手札**（最初 3 枚。プレイヤーには枚数だけ見える）。

### 3.2 カードの種類

| kind | 名前 | 持ち主 | 使い方 |
|---|---|---|---|
| stage | 工程 | プレイヤー | 工程デッキから V字に置く。1 ターンに 1 つ。コストあり。`group`＝design（決める）／make（作る）／test（確かめる）／release |
| unit | なかま | プレイヤー | コストを払ってチームに出す。数値は **力**。1 ターンに 1 回「対応」できる（出したターンから） |
| skill | わざ | プレイヤー | コストを払って使い、効果を解決して捨て札へ |
| guard | そなえ：ガード | プレイヤー | コストを払って **うら向き** でそなえ場に置く。`trigger` の条件が起きたとき発動できる（発動にコストはいらない）。1 回で捨て札 |
| doc | そなえ：資料 | プレイヤー | コストを払って **おもて向き** でそなえ場に置く。場にある間ずっと効く |
| trouble | トラブル | 相手 | 行動力を払ってトラブル場に出す。数値は **圧力**（攻撃の強さ＝のこりの大きさ）。**タイプ** を 1 つ持つ |
| event | イベント | 相手 | 行動力を払って使う 1 回きりのカード。タイプを持つ |
| plot | たくらみ | 相手 | 行動力を払ってうら向きに置く。条件が起きたら必ず発動する |
| bug | バグ（トークン） | — | 工程の上に置かれる。`size`（1・2・4・8）と `found`（見つかったか）を持つ |

### 3.3 ゲームの始め方

1. 章のデータから山札を作って切る（seed つき乱数。第 1 章だけは順番固定）。プレイヤーは 4 枚、相手は 3 枚ひく。
2. プレイヤーが先攻。ターン数は「プレイヤーのターン＋相手のターン」で 1 と数える。

### 3.4 プレイヤーのターン

**(1) スタート**（この順番）
1. ターン数 +1。20 ターンを超えたら負け（安全装置）。
2. 工数 ＝ min(6, 3 + (ターン数 − 1)) ＋ 場の効果（値切り −1 など）＋「次のターンの工数」のたくわえ（予算の削減 −2 など）。0 より小さくならない。
3. なかまの「対応ずみ」を戻す。このターンだけの力の増減を消す。「つかれ」を 1 段階回復する。
4. カードを 1 枚ひく（1 ターン目もひく）。
5. **納期の確認**：まだリリースしていなくて、ターン数 ＞ 納期 なら、信頼 −(2 ＋ これまでに遅れたターン数)。つまり −2、−3、−4…。
6. 「ターンの始め」の効果（見積書、課題管理表）。

**(2) メイン**（好きな順番で、何回でも。ただし回数の決まりがあるものは下に書く）

| 行動 | 内容 | 回数 |
|---|---|---|
| **工程を置く** | 工程デッキの「次の工程」（またはそれより先の工程＝とばす）を選び、コストを払って V字に置く → 3.6 | 1 ターンに 1 つ（「突貫作業」で +1） |
| **レビュー** | 工数 1。**一番新しい「つくる工程」**（design / make）にある、見つかっていないバグを 1 つ取りのぞく | 1 ターンに 1 回 |
| **承認** | 工数 1。置いてある「つくる工程」1 つ（未承認のもの）に承認のハンコを押す。相手の「たくらみ」（聞いてないよ）がわりこむことがある | 制限なし |
| **バグを直す** | 見つかっているバグ 1 つを選び、工数を **バグの大きさ** だけ払って取りのぞく（テスト仕様書で −1、「なんか変です」で +1、最低 1） | 制限なし |
| **カードを出す** | 手札のカードのコストを払って出す。なかま→チーム、わざ→解決して捨て札、ガード→うら向きでそなえ場、資料→おもて向きでそなえ場。場がいっぱいのときは、今あるカード 1 枚を選んで捨て札にすれば出せる | 制限なし |
| **対応** | 対応ずみでなく、つかれていないなかま 1 人と、相手のトラブル 1 体を選ぶ。トラブルの圧力を、なかまの力の分だけ下げる。圧力が 0 以下になったら **解決**（相手の捨て札へ）。なかまは傷つかない | なかま 1 人につき 1 ターン 1 回 |
| **ターン終了** | (3) へ | — |

**(3) エンド**
1. 「ターンの終わり」の効果（レビュアー、CI）。
2. 手札が 7 枚を超えていたら、選んで捨てる。
3. **運用の確認**：リリースずみで、今がリリースしたターンでないなら、運用の残りターン −1。0 になったら **勝ち**。

### 3.5 相手のターン

1. **スタート**：行動力 ＝ min(上限, 最初の値 ＋ floor((ターン数 − 1) / 2))。カードを 1 枚ひく（章で決めたターンからは 2 枚）。
2. **メイン**：CPU は 3.10 の決まりでカードを出す。トラブルは場に出る。イベントは効果を解決する。たくらみはうら向きで置く。プレイヤーは、出されたトラブル・イベントに対してガードで **わりこみ** できる（3.8）。
3. **こうげき**：場のトラブルが、出した順に 1 体ずつ攻撃する。**このターンに出たトラブルは攻撃しない**（「とつぜん」を持つものは攻撃する）。攻撃＝信頼を圧力の数だけ減らす。攻撃のあと、そのトラブルの「攻撃するたび」の効果を解決する。プレイヤーは攻撃に対してガードでわりこみできる。
4. **エンド**：このターンに出て、まだ攻撃していないトラブルに **NEW** マークを付ける（次のプレイヤーのターンの間だけ）。それ以外の NEW マークを外す。本番障害などのトークンには NEW マークは付かない。

### 3.6 工程を置く（くわしく）

`ptr` を「次に置く工程の番号」とする（最初は 0）。番号 `k`（`k ≥ ptr`）の工程を置く手順：

0. **置ける条件**：リリース前である／このターンの工程の回数が残っている／工数がコスト以上ある／テスト（test）とリリース（release）は「製造」（make）が置かれていないと置けない／「製造」をとばすことはできない（`ptr ≤ j < k` の中に make があってはいけない）。
   - 工程のコスト ＝ カードのコスト ＋ 場の効果（SE −1、終わらない要件定義 +1）。0 より小さくならない。
1. コストを払う。このターンの工程の回数 +1。
2. **リリースのときだけ**：①「リリースを置くとき」の効果（リリース手順書）→ ② 相手の「たくらみ」（trigger: release）がわりこむ。リリースが無効にされたら、**ここで終わり**（コストと回数は戻らない。`ptr` はそのまま。次のターンにもう一度置ける）。
3. **とばした工程の処理**：`ptr ≤ j < k` の工程のうち design のものは「**穴**」になる。穴にはバグ 2 つ（大きさ 1、見つかっていない）が入る。穴はあとから埋められない。穴のバグは、対応するテストを置いても、「見つける」効果（再テスト・CI）でも見つからない（＝お金を払って直すこともできない）。「直す」効果（相談など、見つかっているかを問わないもの）でだけ取りのぞける。穴は承認できず、「新しい工程」「最初の工程」としても選ばれない。とばした test の工程は、ただ置かれないだけ（バグは入らないが、見つける機会がなくなる）。
4. **バグが育つ**：盤面の **見つかっていない** バグすべての大きさを 2 倍にする（最大 8）。見つかっているバグは育たない。
5. 工程カードを V字に置く。`ptr = k + 1`。
6. **バグが入る**（design / make のとき）：数 ＝ max(0, カードの `inject` ＋ 場の効果) ＋ （突貫作業の 2 つ目の工程なら +1）。大きさ 1・見つかっていない。
   - 突貫作業で置いた 2 つ目の工程が test / release のときは、その +1 は「一番新しいつくる工程」に入る。
7. **テストが見つける**（test のとき）：その章のトラックの `pair[この工程]` にある工程（穴は除く）のバグを、すべて「見つかった」にする。
8. 工程カード自身の「置いたとき」の効果（リリース：信頼 +2）。次に、なかま・資料の「工程を置くたび」の効果（テスター）。
9. **リリースのとき**：`released = true`、運用の残りターン ＝ 章の `ops`。盤面に残っているすべてのバグ（見つかっている・いない、穴のバグも）を、大きい順に 1 つずつ **本番障害**（圧力＝バグの大きさ）にして相手のトラブル場に出す。場がいっぱいなら、その分は **すぐに信頼を大きさの分だけ減らす**（1 つずつ。「切り戻し計画」でわりこみできる）。「運用・保守」カードを V字の先に自動で置く（表示だけ）。

バグの大きさの例（本物の V、だれもレビューしなかったとき）：

| バグが入った工程 | 見つけるテスト | 置かれるまでに進む工程 | 見つかったときの大きさ＝直すコスト |
|---|---|---|---|
| 製造 | 単体テスト | 1 | 2 |
| 詳細設計 | 単体テスト | 2 | 4 |
| 基本設計 | 結合テスト | 4 | 8 |
| 要件定義 | 受入テスト | 6 | 8（上限） |
| （レビューで直す） | — | 0 | **1** |

### 3.7 承認（合意のハンコ）

- 承認された工程は、**相手のカードの効果で** ① バグを足されない（`addBug`。ただし `force: true` の効果＝「変更」タイプは防げない）、② こわされない（`breakStage`）。
- 自分のカード（残業、突貫）や、工程を置いたときに入るバグは防げない。
- 承認は「かくれたステークホルダー」で 1 つ消されることがある。
- 「変更管理」は、承認ずみの工程が 1 つ以上あるときだけ発動できる。

### 3.8 わりこみ（連続の解決）

- **わりこみできる行動** と、それに応じられるカード：

| 行動（した側） | 応じる側 | trigger |
|---|---|---|
| 相手がイベントを使う | プレイヤーのガード | `event` / `event:<タイプ>` |
| 相手がトラブルを手札から出す（トークンは除く） | プレイヤーのガード | `trouble` / `trouble:<タイプ>` |
| 相手のトラブルが攻撃する | プレイヤーのガード | `attack` |
| 相手の効果で、信頼が 1 回に N 以上減る（攻撃・イベント・たくらみ・本番障害のあふれ。納期遅れは除く） | プレイヤーのガード | `damage:<N>` |
| 相手のたくらみが発動する | プレイヤーのガード | `plot` |
| プレイヤーのガードが発動する | 相手のたくらみ | `guard` |
| プレイヤーが「承認」をする（承認ボタン、または承認の効果）。承認できる工程があるときだけ。無効になるのは**承認だけ**（ボタンの工数は戻らない。カードのほかの効果は起きる） | 相手のたくらみ | `approve` |
| プレイヤーがリリースを置く | 相手のたくらみ | `release` |

- **手順**：行動 A に対して、応じる側は条件に合うふせカードを **1 枚だけ** 発動できる（プレイヤーは「発動する／しない」を選ぶ。CPU は必ず発動する。条件に合うカードが 2 枚以上あれば、プレイヤーは選ぶ、CPU は先に置いたほう）。発動したカード B も「行動」なので、相手がさらにわりこめる。**全部で 4 枚（A を入れて）まで**。
- **解決**：あとから出たカードから順に解決する。`negate` を持つカードが解決されると、**その 1 つ前の行動が無効** になる（効果は何も起きず、カードは捨て札へ。払ったコストは戻らない）。無効にされたカードの効果は解決しない。
- 発動したガード／たくらみは、解決が終わったら捨て札へ。
- `need` の条件（変更管理の `hasApproved`）を満たさないガードは発動できない。
- 例：相手「突然の仕様変更」→ プレイヤー「変更管理」→ 相手「鶴の一声」→ プレイヤー「ダブルチェック」。解決：ダブルチェックが鶴の一声を無効 → 変更管理が解決（仕様変更を無効、納期 +1）→ 仕様変更は何もしない。

### 3.9 勝ち・負け

- **勝ち**：リリースして、運用の残りターンが 0 になる（プレイヤーのエンドで数える）。第 8 章はリリースずみで始まり、6 ターン守る。
- **負け**：信頼が 0 以下になる（すぐ）。または 20 ターンを超える。
- 勝ったときの評価（★1〜3、クリアには関係ない）：★1 クリア／★2 信頼 12 以上／★3 本番障害 0 かつ納期遅れなし。

### 3.10 CPU（相手）の考え方

相手のメインで、次をくり返す（最大 10 回）。
1. 手札のうち「行動力が足りる／`ai.when` の条件を満たす／トラブルなら場に空きがある／たくらみなら場に空きがある」カードを候補にする。
2. 候補を `ai.prio` の大きい順、同じならコストの大きい順、それも同じなら手札に入った順に並べ、先頭の 1 枚を出す。
3. 候補がなくなったら終わり。

- こうげきは、出した順に全部のトラブルで攻撃する（選ばない）。
- たくらみは、条件が起きたら必ず発動する。
- `ai.when` があるので、「テスト中の機能追加」はテストを置いたあと、「ちゃぶ台返し」は新しい工程が未承認のとき、「本番」タイプのトラブルはリリース後、というように **その工程らしいタイミング** で出てくる。
- 乱数は山札を切るときと「手札を捨てる」ときだけ。seed を同じにすれば同じ試合になる。

### 3.11 言葉の決まり（カードの文の読み方）

- 「**新しい工程**」＝ 置いてある「つくる工程」（design / make、穴は除く）のうち、一番あとに置いたもの。テストを置いたあとは「製造」を指す。
  - ただし `breakStage`（こわす）と `latestUnapproved` の条件では、テストもふくめた「一番あとに置いた工程」を指す。
- 「**最初の工程**」＝ 置いてある工程（穴は除く）のうち、一番左のもの。
- 「**製造**に」＝ 製造が置いてあればそこ。なければ「新しい工程」。
- 「**見つけて直す**」＝ 見つかっているかどうかに関係なく、取りのぞく。
- 「**つかれる**」＝ そのなかまは、次の自分のターンが終わるまで対応できない（自分のターン中につかれたら、そのターンと次のターン）。
- 「**NEW**」＝ 前の相手ターンに出て、まだ 1 回も攻撃していないトラブル。
- 「**とつぜん**」＝ 出たターンにも攻撃する。
- 選ぶ対象がないとき、その効果は何もしない（カードは使える）。

---

## 4. 効果の部品（op）の仕様

カードの `effects` は `{ on, op, …引数, if? }` の配列。上から順に解決する。**op は下の 21 個だけ**。`cards.js` の `OPS` と同じ。

### 4.1 タイミング（on）

| on | いつ |
|---|---|
| `play` | わざ・イベント：使ったとき。なかま・資料・トラブル・工程：場に出たとき |
| `static` | 場にある間ずっと（`mod` 専用） |
| `turnStart` / `turnEnd` | 持ち主（プレイヤー）のターンの始め／終わり |
| `attack` | （トラブル）自分が攻撃して、ダメージを与えたあと。攻撃が無効にされたときは起きない |
| `stage` | プレイヤーが工程を置いたあと（3.6 の 8）。`group` があれば、その group の工程のときだけ |
| `release` | プレイヤーがリリースを置こうとしたとき（3.6 の 2 の①。たくらみより先） |
| `trouble` | 相手のトラブルが場に出たあと（トークンもふくむ）。`target: 'trigger'` はそのトラブル |
| `trigger` | ガード・たくらみが発動して解決されるとき |

### 4.2 部品の一覧

「対象の工程」`at`：`latest`（新しい工程）／`first`（最初の工程）／`make`（製造）／`all`（置いてある全部と穴）／`any`（`all` の中からプレイヤーが選ぶ。CPU と自動のときは大きいバグから）。
「対象のトラブル」`target`：`choose`（プレイヤーが選ぶ）／`all`／`strongest`（圧力が一番大きい 1 体）／`self`（このカード自身）／`trigger`（わりこみ・`on:'trouble'` のきっかけになったトラブル）。

| # | op | 引数 | 意味（正確に） |
|---|---|---|---|
| 1 | `trust` | `n`, `per?`, `max?` | プレイヤーの信頼を n だけ変える（＋は回復、最大値まで／−はダメージ）。`per:'unapproved'` のとき、n ×（未承認の「つくる工程」の数、`max` まで）。相手のカードによるマイナスは「相手の効果によるダメージ」（`damage:N` のわりこみ対象） |
| 2 | `effort` | `n` | プレイヤーの工数を n だけ変える。プレイヤーのターン中なら今の工数に（0 未満にならない）、相手のターン中なら「次のターンの工数」のたくわえに足す |
| 3 | `deadline` | `n` | 納期を n ターン動かす（＋はのびる） |
| 4 | `draw` | `n` | このカードの持ち主が n 枚ひく |
| 5 | `discard` | `n` | プレイヤーの手札から n 枚を **ランダムに** 捨てる（seed つき乱数） |
| 6 | `addBug` | `n`, `at`, `force?` | 対象の工程に、大きさ 1・見つかっていないバグを n 個入れる。相手のカードの効果で、対象が承認ずみで、`force` がないときは入らない（「承認ではね返した」演出）。対象の工程がなければ何もしない |
| 7 | `findBug` | `n`, `at` | 対象の工程（**穴は除く**）の見つかっていないバグを、大きい順に n 個「見つかった」にする（99＝全部） |
| 8 | `fixBug` | `n`, `at`, `maxSize?`, `foundOnly?` | 対象の工程のバグを、大きい順に n 個取りのぞく（工数はいらない）。`maxSize`：その大きさ以下だけ。`foundOnly`：見つかっているものだけ。`at:'any'` はプレイヤーがバグを選ぶ |
| 9 | `growBug` | `at` | `at:'unfound'`：見つかっていないバグすべての大きさを 2 倍（最大 8）。`at:'all'`：全部のバグ |
| 10 | `hitTrouble` | `n`, `target`, `bonusTag?`, `bonus?` | 対象のトラブルの圧力を n 下げる。タイプが `bonusTag` なら、さらに `bonus` 下げる。0 以下で解決 |
| 11 | `clearTrouble` | `target`, `tag?`, `newOnly?` | 対象のトラブルを解決する（圧力に関係なく）。`tag`：そのタイプだけ選べる。`newOnly`：NEW のものだけ選べる |
| 12 | `growTrouble` | `n`, `target` | 対象のトラブルの圧力を n 上げる |
| 13 | `summon` | `id`, `pressure?` | 相手のトラブル場にトークンを出す（圧力を指定できる）。場がいっぱいなら、かわりに信頼を圧力の分だけ減らす |
| 14 | `breakStage` | `n` | 一番あとに置いた工程（テストもふくむ、穴は除く）を取りのぞく（手戻り）。その工程の上のバグも消える。`ptr` はその工程の番号に戻る（その手前が穴なら、穴も消して `ptr` をさらに戻す）。n 回くり返す。**承認ずみの工程に当たったら、そこで止まる**。リリース後は何もしない |
| 15 | `approve` | `at`, `off?` | `at:'latest'` の工程（未承認・リリース前）を承認する。プレイヤーの承認には相手のたくらみ（`approve`）がわりこめる。無効にされたら承認だけが起きない。`off:true` のときは、承認ずみの工程のうち一番あとのものの承認を消す（わりこみなし） |
| 16 | `tire` | `target` | `strongest`：つかれていないなかまのうち、力が一番大きい 1 人をつかれさせる。`all`：全員 |
| 17 | `buff` | `n`, `target:'all'` | このターンの間、なかま全員の力 +n |
| 18 | `negate` | — | （`on:'trigger'` 専用）わりこみのきっかけになった行動を無効にする（3.8）。攻撃なら、その 1 回の攻撃が起きない。`damage:N` なら、そのダメージが 0 |
| 19 | `mod` | `what`, `n`, `group?`, `tags?` | （`on:'static'` 専用）場にある間の数値の変更。`what`：`stageCost`（工程のコスト。`group` が合う工程。`all` は全部）／`inject`（工程に入るバグ。`group`）／`fixCost`（バグを直すコスト）／`effortTurn`（ターン始めの工数）／`power`（なかま全員の力）／`powerVs`（**このなかまだけ**、`tags` のタイプのトラブルに対応するとき） |
| 20 | `extraStage` | `bug` | このターン、工程をもう 1 つ置ける。その 2 つ目の工程に、バグが `bug` 個よけいに入る |
| 21 | `clearPlot` | `n` | 相手のたくらみを、先に置かれたものから n 枚、おもてにして捨て札にする（発動はしない） |

### 4.3 条件（if / need / ai.when）

`always`／`released`／`notReleased`／`hasStage`（つくる工程が 1 つ以上ある）／`hasApproved`（承認ずみの工程がある）／`hasUnapproved`（未承認のつくる工程がある）／`firstUnapproved`（最初の工程が未承認で、リリース前）／`latestUnapproved`（一番あとに置いた工程が未承認で、リリース前）／`stage:<id>`（その工程が置いてある。例 `stage:pg`＝`st_pg`）／`testPlaced`（テストの工程が 1 つ以上あり、リリース前）／`nearRelease`（リリース前で、`ptr ≥ トラックの長さ − 3`）／`hasUnit`（なかまがいる）／`hasGuard`（ふせたガードがある）／`hasBug`／`hasUnfound`（見つかっていないバグがある）

### 4.4 発動条件（trigger）

配列で書く（どれか 1 つに合えばよい）。形は 3.8 の表のとおり：`event`・`event:<tag>`・`trouble`・`trouble:<tag>`・`attack`・`damage:<n>`・`plot`・`guard`・`approve`・`release`。

### 4.5 トラブルの数値・しるし

- `pressure`：圧力。`tag`：タイプ。`sudden: true`：「とつぜん」。`token: true`：山札に入らないトークン（本番障害）。
- カード面の数値欄：なかま＝［力］、トラブル＝［圧力］［タイプ］、工程＝［バグ（入る数）］、バグ＝［大きさ］。ラベルは `STAT_LABELS`・`TAGS`。

---

## 5. 全カード表

合計 90 種類。プレイヤー側 57 枚（工程 11・なかま 11・わざ 20・ガード 7・資料 8）、相手側 32 枚（トラブル 16・イベント 10・たくらみ 6）、バグ 1。
「effects（部品）」の列は `effects` を `on:op(引数)` の形で短く書いたもの。絵の列は `icon(+icon2) / bg / pattern`。表は読みやすさのためにふりがなを外してある（データにはすべて付いている）。


### 工程（stage・Stage）— 11 枚

| id | 名前 / English | 工程 | コスト | 数値・しるし | 効果（カードの文） | effects（部品） | フレーバー（教訓） / English | 絵 | 教訓・出典 |
|---|---|---|---|---|---|---|---|---|---|
| `st_rd` | **要件定義**<br>Requirements Definition | 要件定義 | 2 | バグ 1<br>group: design | 「何を作るか」を決める。置くとバグが 1 つ入る。 | — | ここがずれると、あとの工程が全部ずれます。まず「なぜ作るのか」を聞きましょう。<br>*If this is wrong, everything after it is wrong. Ask "why" first.* | clipboard+ear / teal / grid | L03<br>オンボーディング 要件定義／IPA 原理原則17ヶ条 |
| `st_bd` | **基本設計**<br>Basic Design | 基本設計 | 2 | バグ 1<br>group: design | 外から見える形（画面など）を決める。バグが 1 つ入る。 | — | お客さまには、むずかしい図ではなく画面の絵を見せます。<br>*Show the client pictures of screens, not difficult diagrams.* | wireframe / teal / grid | L12<br>オンボーディング 設計／@IT 再入門 第4回 |
| `st_dd` | **詳細設計**<br>Detailed Design | 詳細設計 | 2 | バグ 1<br>group: design | プログラムの中のしくみを決める。バグが 1 つ入る。 | — | うまく動くときだけでなく、エラーのとき（例外）も決めます。<br>*Design not only the normal case but also the error cases.* | flow / teal / circuit | L13<br>オンボーディング 設計 Q18 |
| `st_des` | **設計**<br>Design | 設計 | 2 | バグ 1<br>group: design | 「どう作るか」を決める設計図。置くとバグが 1 つ入る。 | — | 家を建てる前に設計図をかくのと同じです。<br>*Like drawing a blueprint before building a house.* | wireframe+flow / teal / grid | L01<br>オンボーディング 講義「システム開発の流れ」 |
| `st_pg` | **製造（コーディング）**<br>Coding | 製造 | 3 | バグ 3<br>group: make | 設計どおりにコードを書く。置くとバグが 3 つ入る。 | — | 「動いた」は「完成」ではありません。レビューとテストまでが製造です。<br>*"It runs" is not "it is done". Review and test are part of coding.* | code / teal / binary | L16<br>オンボーディング 開発 Q20-21 |
| `st_ut` | **単体テスト**<br>Unit Test | 単体テスト | 2 | バグ 0<br>group: test | 置くと、**詳細設計**と**製造**のバグを全部見つける。 | — | 部品を 1 つずつ確かめます。ここで見つけるのが、テストの中では一番安いです。<br>*Test each part alone. Finding bugs here is the cheapest of all tests.* | flask / teal / dots | L02<br>オンボーディング デュエル「単体テスト」／V字モデル |
| `st_it` | **結合テスト**<br>Integration Test | 結合テスト | 2 | バグ 0<br>group: test | 置くと、**基本設計**のバグを全部見つける。 | — | 部品をつないで確かめます。つなぐときは少しずつ。<br>*Connect the parts and test. Connect them little by little.* | link / teal / dots | L02<br>V字モデル／@IT 再入門 第5回 |
| `st_at` | **受入テスト**<br>Acceptance Test | 受入テスト | 2 | バグ 0<br>group: test | 置くと、**要件定義**のバグを全部見つける。 | — | お客さまが「頼んだものか」を確かめます。主役はお客さまです。<br>*The client checks "is this what we asked for?" The client is the main actor.* | handshake+check / teal / dots | L21<br>V字モデル／IPA 教訓 G2 |
| `st_tst` | **テスト**<br>Testing | テスト | 2 | バグ 0<br>group: test | 置くと、**設計**と**製造**のバグを全部見つける。 | — | テストは「たぶん大丈夫」ではだめです。リストを見て、もれなく確かめます。<br>*"Probably OK" is not a test. Check everything with a list.* | flask+checklist / teal / dots | L19<br>オンボーディング テスト Q23 |
| `st_rel` | **リリース**<br>Release | リリース | 1 | バグ 0<br>group: release | 本番に出す。信頼 +2。**残ったバグは「本番障害」になる。** | `play:trust(n=2)` | リリースはゴールではありません。今日から運用が始まります。<br>*Release is not the goal. Operation starts today.* | rocket / gold / rays | L23<br>オンボーディング リリース／保守 |
| `st_ops` | **運用・保守**<br>Operation & Maintenance | 運用・保守 | — | バグ 0<br>group: ops | リリースのあと自動で置かれる。決まったターン、信頼を守れば勝ち。 | — | システムは「作って終わり」ではありません。動きつづけるように守ります。<br>*A system is not finished when it is built. We keep it running.* | monitor+heart / gold / waves | L27<br>オンボーディング 保守運用 |

### なかま（unit・Member）— 11 枚

| id | 名前 / English | 工程 | コスト | 数値・しるし | 効果（カードの文） | effects（部品） | フレーバー（教訓） / English | 絵 | 教訓・出典 |
|---|---|---|---|---|---|---|---|---|---|
| `u_newbie` | **新人エンジニア**<br>New Engineer | 全体 | 1 | 力 1 | 出たとき：カードを 1 枚ひく。 | `play:draw(n=1)` | わからないことは、はずかしがらずに聞きます。それが一番早いです。<br>*Ask without shame when you do not know. It is the fastest way.* | person+laptop / blue / circuit | L30<br>オンボーディング 相談 |
| `u_yamada` | **営業の山田さん**<br>Yamada (Sales) | 見積もり | 2 | 力 2 | 「お金」「納期」のトラブルには 力 +2。 | `static:mod(what=powerVs,tags=okane+nouki,n=2)` | お金と日程の話は、早めに、はっきりします。にげると、あとでもめます。<br>*Talk about money and schedule early and clearly.* | person+phone / blue / dots | L09<br>オンボーディング キックオフ Q5 |
| `u_senpai` | **ヘンディ先輩（PM）**<br>Hendy (PM) | 管理 | 3 | 力 2 | 出たとき：新しい工程のバグを 1 つ直す。 | `play:fixBug(n=1,at=latest)` | 「よかった。次はこうすると、もっといい」。ほめてから直すのが先輩のやり方です。<br>*"Good. Next time, this will make it even better." Praise first, then fix.* | person+magnifier / blue / rays | L15<br>オンボーディング フィードバック方針 |
| `u_se` | **SE（設計の人）**<br>Systems Engineer | 基本設計 | 2 | 力 1 | 要件定義と設計の工程は コスト −1。 | `static:mod(what=stageCost,group=design,n=-1)` | お客さまの言葉を、作る人がわかる形に直します。<br>*Turns the client's words into a form the builders understand.* | person+wireframe / blue / grid | L12<br>役割の一般的な説明（SE） |
| `u_pg` | **プログラマー**<br>Programmer | 製造 | 2 | 力 2 | 「製造」に入るバグ −1。 | `static:mod(what=inject,group=make,n=-1)` | だれが読んでもわかるコードを書きます。自分だけの書き方はしません。<br>*Writes code anyone can read. No private style.* | person+code / blue / binary | L16<br>オンボーディング 開発 Q20 |
| `u_tester` | **テスター**<br>Tester | テスト | 2 | 力 1 | テストの工程を置くたび：見つけたバグを 1 つ ただで直す。 | `stage:fixBug(group=test,n=1,at=all,foundOnly=true)` | 「何をしたとき、どうなったか」をくわしく書きます。「なんか変」では直せません。<br>*Writes exactly what was done and what happened. "Something is odd" cannot be fixed.* | person+flask / blue / dots | L20<br>オンボーディング テスト Q24 |
| `u_reviewer` | **レビュアー**<br>Reviewer | 管理 | 3 | 力 1 | ターンの終わり：新しい工程のバグを 1 つ直す。 | `turnEnd:fixBug(n=1,at=latest)` | 仲間が読むだけで、まちがいの 約 6 割は見つかると言われます。<br>*Peer review is said to find about 60% of defects.* | person+eye / blue / hex | L15<br>Boehm & Basili 2001 |
| `u_ops` | **運用エンジニア**<br>Operations Engineer | 運用・保守 | 2 | 力 2 | 「本番」のトラブルには 力 +2。 | `static:mod(what=powerVs,tags=honban,n=2)` | まず元に戻す。次に原因をさがす。そして、くり返さないしくみを作ります。<br>*First recover. Then find the cause. Then prevent it from happening again.* | person+server / blue / waves | L28<br>ITIL（インシデント管理と問題管理） |
| `u_tantou` | **お客さまの担当者**<br>Client Contact | 要件定義 | 2 | 力 1 | 出たとき：新しい工程を承認する。 | `play:approve(at=latest)` | 「だれに連絡するか」「だれが決めるか」を最初に決めます。お客さまも仲間です。<br>*Decide first who to contact and who decides. The client is a teammate too.* | person+stamp / blue / rays | L06<br>オンボーディング キックオフ Q6／IPA 原理原則[9] |
| `u_nyam` | **ニャムさん（出向エンジニア）**<br>Nyam (Guest Engineer) | 製造 | 3 | 力 3 | （効果なし）力が高い、たよれる仲間。 | — | コードがとても上手。日本語は勉強中ですが、質問でチームを助けます。<br>*Great at code. Still learning Japanese, and helps the team by asking questions.* | person+sparkle / blue / circuit | L30<br>オンボーディング 質問ゲーム |
| `u_fujiki` | **藤木取締役**<br>Director Fujiki | 報連相 | 4 | 力 3 | 出たとき：トラブル 1 体の圧力 −3。信頼 +1。 | `play:hitTrouble(n=3,target=choose)`<br>`play:trust(n=1)` | 「正直に、早く教えてくれてありがとう」。早い報告には、打てる手がたくさんあります。<br>*"Thank you for telling me honestly and early." Early reports leave many options.* | person+crown / blue / rays | L29<br>オンボーディング 報告リスニング |

### わざ（skill・Skill）— 20 枚

| id | 名前 / English | 工程 | コスト | 数値・しるし | 効果（カードの文） | effects（部品） | フレーバー（教訓） / English | 絵 | 教訓・出典 |
|---|---|---|---|---|---|---|---|---|---|
| `s_review` | **セルフレビュー**<br>Self Review | 全体 | 0 | — | 新しい工程のバグを 1 つ見つけて直す。 | `play:fixBug(n=1,at=latest)` | 人に渡す前に、まず自分で確かめます。作ったすぐあとが一番安く直せます。<br>*Check it yourself before you hand it over. Right after making it is the cheapest time to fix.* | magnifier / green / grid | L15<br>オンボーディング 開発 Q21 |
| `s_peer` | **ピアレビュー**<br>Peer Review | 全体 | 1 | — | 新しい工程のバグを 2 つ見つけて直す。 | `play:fixBug(n=2,at=latest)` | 自分では気づけないまちがいを、仲間の目が見つけます。<br>*A teammate's eyes find the mistakes you cannot see yourself.* | magnifier+people / green / grid | L15<br>Boehm & Basili 2001（レビューで約6割） |
| `s_yomiawase` | **読み合わせ**<br>Read-through | 基本設計 | 2 | — | 最初の工程のバグ（大きさ 2 以下）を全部直す。 | `play:fixBug(n=99,at=first,maxSize=2)` | 設計の前に、要件定義書をみんなで読みます。ずれは小さいうちに見つけます。<br>*Before design, read the requirements together. Find gaps while they are small.* | book+people / green / dots | L11<br>@IT 再入門 第4回（読み合わせ） |
| `s_hearing` | **「なぜ？」を聞く**<br>Ask "Why?" | 要件定義 | 1 | — | 「あいまい」のトラブル 1 体を解決する。 | `play:clearTrouble(target=choose,tag=aimai)` | 「どうしたいか」より「なぜ必要か」を聞くと、本当の目的がわかります。<br>*Asking "why do you need it?" shows the real goal.* | ear+question / green / waves | L04<br>オンボーディング 要求定義 Q9／@IT 再入門 第3回 |
| `s_5w1h` | **5W1H の質問**<br>5W1H Questions | 要件定義 | 1 | — | トラブル 1 体の圧力 −2。「あいまい」なら −4。 | `play:hitTrouble(n=2,target=choose,bonusTag=aimai,bonus=2)` | いつ・どこで・だれが・何を・なぜ・どのように。聞きもれがなくなります。<br>*When, where, who, what, why, how. Nothing is left unasked.* | question+checklist / green / dots | L05<br>オンボーディング 5W1H ゲーム |
| `s_stamp` | **合意のハンコ**<br>Approval Stamp | 要件定義 | 0 | — | 新しい工程を承認する。信頼 +1。 | `play:approve(at=latest)`<br>`play:trust(n=1)` | 「この内容で進めます」と OK をもらいます。合意しないまま、次に進みません。<br>*Get the OK: "we go with this." Never move on without agreement.* | stamp / green / rays | L06<br>オンボーディング 要件定義 Q12／IPA 原理原則[2][4] |
| `s_report` | **すぐ報告**<br>Report at Once | 報連相 | 0 | — | 出たばかり（NEW）のトラブル 1 体を解決する。 | `play:clearTrouble(target=choose,newOnly=true)` | 悪い知らせほど早く言います。早ければ、みんなで直す時間があります。<br>*Bad news first, and fast. If it is early, there is time to fix it together.* | speech+bolt / green / rays | L29<br>オンボーディング 報告／金融庁 2021 |
| `s_soudan` | **相談（30 分ルール）**<br>Consult (30-min rule) | 報連相 | 1 | — | バグ 1 つ（大きさ 2 以下）を直す。カードを 1 枚ひく。 | `play:fixBug(n=1,at=any,maxSize=2)`<br>`play:draw(n=1)` | 30 分考えてだめなら相談します。何を調べたかも一緒に伝えます。<br>*Think for 30 minutes, then ask. Say what you already tried.* | speech+clock / green / dots | L30<br>オンボーディング 相談（30分ルール） |
| `s_renraku` | **連絡（事実を短く）**<br>Share the Facts | 報連相 | 1 | — | カードを 2 枚ひく。 | `play:draw(n=2)` | いつ・何が・どうなる・何をしてほしい。気持ちではなく事実と数字を書きます。<br>*When, what, what happens, what you need. Facts and numbers, not feelings.* | mail+bell / green / grid | L31<br>オンボーディング 連絡 |
| `s_buffer` | **バッファ（予備の時間）**<br>Buffer | 見積もり | 1 | — | 納期を 1 ターンのばす。 | `play:deadline(n=1)` | 開発にトラブルはつきものです。「何のための予備か」を説明できるようにします。<br>*Trouble always happens. Be ready to explain what the buffer is for.* | hourglass+shield / green / waves | L08<br>オンボーディング 見積もり Q14 |
| `s_wire` | **ワイヤーフレーム（画面の絵）**<br>Wireframe | 基本設計 | 1 | — | 新しい工程のバグを 1 つ直し、その工程を承認する。 | `play:fixBug(n=1,at=latest)`<br>`play:approve(at=latest)` | 文章より絵。作る前に見せれば「思っていたのと違う」を防げます。<br>*Pictures beat text. Show it before building to prevent "not what I imagined".* | wireframe+eye / green / grid | L12<br>オンボーディング 設計 Q16 |
| `s_pairpro` | **ペアプログラミング**<br>Pair Programming | 製造 | 1 | — | このターン、なかま全員の力 +1。カードを 1 枚ひく。 | `play:buff(n=1,target=all)`<br>`play:draw(n=1)` | 2 人で 1 つのコードを書きます。知識が広がり、「あの人しかわからない」が減ります。<br>*Two people, one code. Knowledge spreads; "only he knows" goes away.* | people+laptop / green / circuit | L18<br>オンボーディング デュエル「ペアプログラミング」 |
| `s_retest` | **再テスト**<br>Regression Test | テスト | 1 | — | 全部の工程のバグを見つける。 | `play:findBug(n=99,at=all)` | 1 つ直すと、ほかがこわれることがあります。直したら、まわりももう一度確かめます。<br>*Fixing one thing can break another. After a fix, test around it again.* | flask+rollback / green / dots | L19<br>オンボーディング まなびの島（テスト） |
| `s_bugreport` | **バグ票（再現手順つき）**<br>Bug Ticket | テスト | 1 | — | 見つかっているバグ 1 つ（大きさ 4 以下）を直す。 | `play:fixBug(n=1,at=all,foundOnly=true,maxSize=4)` | 「何をしたか・どうなるはずか・どうなったか」を書くと、すぐ原因が見つかります。<br>*Write "what I did, what should happen, what happened" and the cause is found fast.* | bug+doc / green / binary | L20<br>オンボーディング テスト Q24 |
| `s_overtime` | **残業でカバー**<br>Overtime | 管理 | 0 | — | 工数 +3。でも新しい工程にバグ +1、なかま 1 人がつかれる。 | `play:effort(n=3)`<br>`play:addBug(n=1,at=latest,force=true)`<br>`play:tire(target=strongest)` | つかれた頭はまちがえます。休ませない計画は、チームをこわします。<br>*A tired head makes mistakes. A plan without rest breaks the team.* | moon+coffee / gray / waves | L17<br>オンボーディング 要件定義 Q10 |
| `s_rush` | **突貫作業**<br>Crash Work | 管理 | 1 | — | このターン、工程をもう 1 つ置ける。その工程にバグ +1。 | `play:extraStage(bug=1)` | 急いで作ると、あとで直す時間のほうが長くなります。<br>*Rush now, and you spend longer fixing later.* | bolt+hammer / gray / fire | L17<br>Boehm & Basili 2001（避けられた手戻り 40〜50%） |
| `s_log` | **ログ分析**<br>Log Analysis | 運用・保守 | 1 | — | トラブル 1 体の圧力 −2。「本番」なら −5。 | `play:hitTrouble(n=2,target=choose,bonusTag=honban,bonus=3)` | 原因がわからないのに全部直しません。まず記録（ログ）を見ます。<br>*Do not rewrite everything without knowing the cause. Read the logs first.* | scroll+magnifier / green / binary | L28<br>オンボーディング 保守 Q28 |
| `s_naze` | **なぜなぜ分析**<br>5 Whys | 運用・保守 | 2 | — | 「本番」のトラブル 1 体を解決する。カードを 1 枚ひく。 | `play:clearTrouble(target=choose,tag=honban)`<br>`play:draw(n=1)` | 「なぜ」をくり返して、本当の原因をさがします。人ではなく、しくみを直します。<br>*Repeat "why" to reach the real cause. Fix the system, not the person.* | question+gear / green / hex | L28<br>トヨタ生産方式由来の一般的な手法 |
| `s_kaizen` | **改善提案**<br>Improvement Proposal | 運用・保守 | 2 | — | 信頼 +2。リリースのあとなら、さらに +2。 | `play:trust(n=2)`<br>`play:trust(n=2,if=released)` | データを見て「ここを直すと、もっとよくなります」と言います。次の仕事につながります。<br>*Look at the data and say "fixing this will make it better." It leads to the next job.* | chart+sparkle / green / rays | L27<br>オンボーディング 保守 Q30 |
| `s_rehearsal` | **リハーサル**<br>Rehearsal | リリース | 1 | — | 相手の「たくらみ」を 1 枚めくって、こわす。 | `play:clearPlot(n=1)` | 本番と同じ手順・同じ量で練習します。わなは本番の前に見つけます。<br>*Practice with the same steps and the same volume as the real day. Find the traps first.* | target+clock / green / hex | L24<br>移行リハーサル／みずほ 2021 の教訓 |

### そなえ（guard・Guard）— 7 枚

| id | 名前 / English | 工程 | コスト | 数値・しるし | 効果（カードの文） | effects（部品） | フレーバー（教訓） / English | 絵 | 教訓・出典 |
|---|---|---|---|---|---|---|---|---|---|
| `g_change` | **変更管理**<br>Change Control | 管理 | 1 | 発動: event:henkou<br>条件: hasApproved | 相手の「変更」イベントを無効にし、納期 +1。**承認ずみの工程が必要。** | `trigger:negate()`<br>`trigger:deadline(n=1)` | 「できません」ではなく「追加の時間とお金はこれです」と見せて相談します。<br>*Not "we can't" — show "this is the extra time and cost" and discuss.* | shield+scroll / pink / hex | L10<br>変更管理（CR）／旭川医大事件の教訓 |
| `g_minutes` | **議事録**<br>Meeting Minutes | 要件定義 | 1 | 発動: event:aimai | 相手の「あいまい」イベントを無効にする。信頼 +1。 | `trigger:negate()`<br>`trigger:trust(n=1)` | 決まったこと・宿題・担当・期限を書いて、その日に送ります。「言った言わない」がなくなります。<br>*Write decisions, to-dos, owners and dates, and send it the same day. No more "I never said that".* | doc+pen / pink / grid | L07<br>オンボーディング デュエル「議事録の確認」／議事録の実務 |
| `g_basis` | **見積もりの根拠**<br>Basis of Estimate | 見積もり | 1 | 発動: event:okane/event:nouki/trouble:okane/trouble:nouki | 相手の「お金」「納期」のカードを無効にする。 | `trigger:negate()` | 「何人が何日働くか」を積み上げた数字です。理由なく安くしません。<br>*The number is built from "how many people for how many days". No discount without a reason.* | calculator+shield / pink / grid | L09<br>オンボーディング 見積もり Q13・Q15／IPA 原理原則[6] |
| `g_phase2` | **フェーズ 2 の提案**<br>Propose Phase 2 | 要件定義 | 1 | 発動: trouble:henkou | 相手の「変更」トラブルを無効にする。カードを 1 枚ひく。 | `trigger:negate()`<br>`trigger:draw(n=1)` | 「今回は大事なものから。残りは次のアップデートにしましょう」。やらないことを決めるのも仕事です。<br>*"The most important first; the rest in the next update." Deciding what not to do is also work.* | calendar+flag / pink / waves | L10<br>オンボーディング 要件定義 Q10／テスト Q22 |
| `g_abplan` | **A 案・B 案の提案**<br>Plan A or Plan B | 基本設計 | 1 | 発動: attack | トラブルの攻撃を 1 回無効にし、その圧力 −2。 | `trigger:negate()`<br>`trigger:hitTrouble(n=2,target=trigger)` | 勝手に決めず、「A 案と B 案、どちらにしますか」と自分の案を持っていきます。<br>*Do not decide alone. Bring your own options: "Plan A or Plan B?"* | puzzle+speech / pink / dots | L14<br>オンボーディング 設計 Q17 |
| `g_rollback` | **切り戻し計画**<br>Rollback Plan | リリース | 2 | 発動: damage:4 | 信頼が 1 回で 4 以上減るとき、それを 0 にする。 | `trigger:negate()` | あわてて本番を直しません。準備した計画どおり、安全に元に戻します。<br>*Do not fix production in a panic. Go back safely, as planned.* | rollback+shield / pink / hex | L26<br>オンボーディング リリース Q27／ドコモ 2021 |
| `g_double` | **ダブルチェック（指差し確認）**<br>Double Check | リリース | 1 | 発動: plot | 相手の「たくらみ」が発動したとき、それを無効にする。 | `trigger:negate()` | 作業する人と確かめる人の 2 人で。指で差して声に出すと、ミスは 約 6 分の 1 になります。<br>*One works, one checks. Pointing and calling cuts mistakes to about one sixth.* | people+check / pink / rays | L25<br>鉄道総研の実験（厚労省 職場のあんぜんサイト） |

### 資料（doc・Document）— 8 枚

| id | 名前 / English | 工程 | コスト | 数値・しるし | 効果（カードの文） | effects（部品） | フレーバー（教訓） / English | 絵 | 教訓・出典 |
|---|---|---|---|---|---|---|---|---|---|
| `d_hearing` | **ヒアリングシート**<br>Hearing Sheet | 要件定義 | 1 | — | 要件定義と設計の工程に入るバグ −1。 | `static:mod(what=inject,group=design,n=-1)` | 聞きたいことをリストにして持っていきます。聞き忘れを防ぐ、プロの準備です。<br>*Bring a list of questions. Professional preparation that prevents forgotten questions.* | checklist+ear / gold / grid | L05<br>オンボーディング 社内MTG Q3 |
| `d_estimate` | **見積書（根拠つき）**<br>Estimate with Basis | 見積もり | 2 | — | あなたのターンの始め：工数 +1。 | `turnStart:effort(n=1)` | 作業を細かく分けて、時間を足します。テストや会議の時間も入れ忘れません。<br>*Break the work down and add up the time. Do not forget testing and meetings.* | calculator+gantt / gold / grid | L08<br>オンボーディング 見積もり Q13（WBS・人日） |
| `d_kiyaku` | **コーディング規約**<br>Coding Rules | 製造 | 1 | — | 「製造」に入るバグ −1。 | `static:mod(what=inject,group=make,n=-1)` | チームのルールで書きます。書いた人しか読めないコードは、だれも直せません。<br>*Write by the team's rules. Code only its author can read cannot be fixed by anyone.* | book+code / gold / binary | L16<br>オンボーディング 開発 Q20 |
| `d_testcase` | **テスト仕様書**<br>Test Specification | テスト | 1 | — | バグを直すコスト −1（最低 1）。 | `static:mod(what=fixCost,n=-1)` | 正しい結果は、テストの前に書きます。証拠（エビデンス）も残します。<br>*Write the expected result before the test. Keep the evidence too.* | checklist+flask / gold / dots | L19<br>オンボーディング テスト Q23／テストの実務（期待結果・エビデンス） |
| `d_ci` | **CI（自動テスト）**<br>CI (Automated Tests) | 製造 | 2 | — | ターンの終わり：バグを 1 つ見つける（大きいものから）。 | `turnEnd:findBug(n=1,at=all)` | コードを出すたびに、機械が自動でテストします。合格したコードだけをつなぎます。<br>*A machine tests every push. Only code that passes gets merged.* | robot+check / gold / circuit | L18<br>オンボーディング デュエル「CI/CD パイプライン」 |
| `d_kadai` | **課題管理表**<br>Issue List | 管理 | 2 | — | あなたのターンの始め：一番強いトラブルの圧力 −1。 | `turnStart:hitTrouble(n=1,target=strongest)` | 問題には、かならず担当と期限をつけます。書いてあれば、忘れません。<br>*Every issue gets an owner and a due date. If it is written, it is not forgotten.* | clipboard+flag / gold / grid | L32<br>オンボーディング デュエル「課題管理表」／課題管理の実務 |
| `d_procedure` | **リリース手順書**<br>Release Runbook | リリース | 1 | — | リリースを置くとき、まず相手の「たくらみ」を 1 枚こわす。 | `release:clearPlot(n=1)` | だれが・何時に・どの順番でやるか。手順書にないことは、本番ではしません。<br>*Who, at what time, in what order. Never do in production what is not in the runbook.* | scroll+rocket / gold / grid | L24<br>オンボーディング リリース Q26／KDDI 2022／IPA 教訓 G6 |
| `d_monitor` | **監視（アラート）**<br>Monitoring | 運用・保守 | 2 | — | トラブルが出るたび、その圧力 −1。 | `trouble:hitTrouble(n=1,target=trigger)` | 異常は早く気づくほど小さいです。「少しだけこわれた」も見つけられるようにします。<br>*The sooner you notice, the smaller it is. Catch "half-broken" states too.* | monitor+bell / gold / waves | L27<br>オンボーディング 保守運用／IPA 教訓 T11／ANA 2016 |

### トラブル（trouble・Trouble）— 16 枚

| id | 名前 / English | 工程 | コスト | 数値・しるし | 効果（カードの文） | effects（部品） | フレーバー（教訓） / English | 絵 | 教訓・出典 |
|---|---|---|---|---|---|---|---|---|---|
| `t_fuwa` | **ふんわり要望**<br>Vague Request | 要件定義 | 1 | 圧力 2<br>タイプ あいまい<br>AI: notReleased・優先 5 | 場にいる間：要件定義と設計の工程に入るバグ +1。 | `static:mod(what=inject,group=design,n=1)` | 「いい感じにして」は、人によって意味が違います。「具体的には？」と聞きましょう。<br>*"Make it nice" means something different to everyone. Ask "what exactly?"* | fog / purple / waves | L04<br>オンボーディング 要求定義 Q8／IPA 原理原則[13] |
| `t_omoitsuki` | **思いつきのアイデア**<br>Sudden Idea | 受入テスト | 1 | 圧力 2<br>タイプ 変更<br>AI: hasStage・優先 4 | 攻撃するたび：新しい工程にバグ +1（承認ずみでも）。 | `attack:addBug(n=1,at=latest,force=true)` | 「あ、これも追加して！」。まず「急ぎますか」と聞いて、次のアップデートを提案します。<br>*"Oh, add this too!" Ask "is it urgent?" and offer the next update.* | sparkle+exclaim / purple / rays | L10<br>オンボーディング テスト Q22 |
| `t_negiri` | **強引な値切り**<br>Hard Bargain | 見積もり | 2 | 圧力 2<br>タイプ お金<br>AI: always・優先 5 | 場にいる間：あなたの工数は毎ターン −1。 | `static:mod(what=effortTurn,n=-1)` | すぐ半額にすると「最初から安くできたのでは」と疑われます。下げるなら機能も減らします。<br>*Cut the price at once and they wonder why it was not cheap from the start. Lower price means fewer features.* | scissors+money / purple / grid | L09<br>オンボーディング 見積もり Q15 |
| `t_nouki` | **無茶な納期**<br>Impossible Deadline | 見積もり | 2 | 圧力 3<br>タイプ 納期<br>AI: notReleased・優先 4 | 出たとき：納期が 1 ターン早くなる。 | `play:deadline(n=-1)` | 「来週までにできるよね？」に、なんでも「はい」と答えるのはプロではありません。<br>*"You can do it by next week, right?" Saying yes to everything is not professional.* | hourglass+fire / purple / fire | L08<br>オンボーディング 見積もり Q14 |
| `t_hidden` | **隠れたステークホルダー**<br>Hidden Stakeholder | 要件定義 | 3 | 圧力 4<br>タイプ あいまい<br>AI: hasApproved・優先 6 | 出たとき：新しい工程の承認を 1 つ消す。 | `play:approve(at=latest,off=true)` | 「わたしは聞いていない」。最後に決める人はだれか、最初に聞いておきます。<br>*"Nobody told me." Ask at the start who makes the final decision.* | mask+person / purple / hex | L06<br>オンボーディング デュエル「隠れたステークホルダー」／5W1H ゲーム |
| `t_owaranai` | **終わらない要件定義**<br>Endless Requirements | 要件定義 | 2 | 圧力 3<br>タイプ あいまい<br>AI: notReleased・優先 4 | 場にいる間：工程を置くコスト +1。 | `static:mod(what=stageCost,group=all,n=1)` | 「あれもこれも」で決まりません。「一番大事なのはどれですか」は、まほうの質問です。<br>*"This and that too" — nothing gets decided. "Which matters most?" is the magic question.* | tornado+clipboard / purple / waves | L10<br>オンボーディング 要件定義 Q10／IPA 原理原則[16] |
| `t_kakaekomi` | **抱え込み**<br>Hidden Delay | 報連相 | 1 | 圧力 1<br>タイプ 人<br>AI: always・優先 4 | 攻撃するたび：この圧力 +2。（小さいうちに解決しよう） | `attack:growTrouble(n=2,target=self)` | 「おこられるかも」と思って隠すと、最後に大きな問題になります。<br>*Hide it because you fear being scolded, and it becomes a big problem at the end.* | lock+person / purple / dots | L29<br>オンボーディング 開発 Q19／報告 |
| `t_deathmarch` | **デスマーチ**<br>Death March | 管理 | 3 | 圧力 4<br>タイプ 人<br>AI: hasUnit・優先 5 | 攻撃するたび：なかま 1 人がつかれる。この圧力 +1。 | `attack:tire(target=strongest)`<br>`attack:growTrouble(n=1,target=self)` | 安すぎる約束と短すぎる納期から始まります。人を足しても、すぐには速くなりません。<br>*It begins with a too-cheap promise and a too-short deadline. Adding people does not make it faster right away.* | fire+people / red / fire | L17<br>ヨードン『デスマーチ』／ブルックスの法則 |
| `t_zokujin` | **属人化**<br>Only-One-Knows | 製造 | 2 | 圧力 3<br>タイプ 人<br>AI: hasUnit・優先 4 | 場にいる間：なかま全員の力 −1。 | `static:mod(what=power,n=-1)` | 「あの人しかわからない」仕事は、その人が休むと止まります。書いて残し、教え合います。<br>*Work that "only he understands" stops when he is away. Write it down and teach each other.* | key+person / purple / hex | L18<br>ドキュメント文化（多重下請けでも知識を残す） |
| `t_nankahen` | **「なんか変です」**<br>"Something is Odd" | テスト | 1 | 圧力 2<br>タイプ 品質<br>AI: hasBug・優先 4 | 場にいる間：バグを直すコスト +1。 | `static:mod(what=fixCost,n=1)` | どこが変かわからないと、直す人は困ります。画面の写真も一緒に送りましょう。<br>*If nobody knows what is odd, the fixer is stuck. Send a screenshot too.* | question+bug / purple / dots | L20<br>オンボーディング テスト Q24／デュエル「なんか変です」 |
| `t_bugking` | **バグキング**<br>Bug King | テスト | 4 | 圧力 5<br>タイプ 品質<br>AI: stage:pg・優先 7 | 出たとき：見つかっていないバグが育つ。攻撃するたび：製造にバグ +1。 | `play:growBug(at=unfound)`<br>`attack:addBug(n=1,at=make,force=true)` | テストを減らすと元気になる王さま。見なかったことにしたバグが大好きです。<br>*A king who grows strong when tests are cut. He loves bugs that people pretend not to see.* | bug+crown / red / binary | L02<br>オンボーディング 開発 Q19（テストを削らない） |
| `t_silent` | **サイレント障害**<br>Silent Failure | 運用・保守 | 2 | 圧力 1<br>タイプ 本番<br>AI: released・優先 6 | 攻撃するたび：この圧力 +3。（気づくのが遅れると大変） | `attack:growTrouble(n=3,target=self)` | 全部こわれるより、「少しだけこわれる」ほうがこわいです。だれも気づかないからです。<br>*Half-broken is scarier than fully broken, because nobody notices.* | ghost+server / night / waves | L27<br>IPA 教訓 T11（サイレント障害）／ANA 2016 |
| `t_access` | **アクセス集中**<br>Traffic Spike | 運用・保守 | 3 | 圧力 4<br>タイプ 本番<br>とつぜん<br>AI: released・優先 5 | **とつぜん**：出たターンにすぐ攻撃する。 | — | 「何人が同時に使うか」は、目に見えない大事なルール（非機能要件）です。<br>*"How many users at once?" is an invisible but vital rule (a non-functional requirement).* | people+bolt / night / rays | L22<br>オンボーディング 要件定義 Q11／保守 Q30 |
| `t_claim` | **クレームの嵐**<br>Storm of Complaints | 運用・保守 | 2 | 圧力 3<br>タイプ 本番<br>AI: released・優先 4 | 攻撃するたび：あなたの手札が 1 枚捨てられる。 | `attack:discard(n=1)` | まず相手の気持ちを受け止めます。それから原因と、直る予定を伝えます。<br>*First accept how they feel. Then tell the cause and when it will be fixed.* | phone+tornado / night / fire | L31<br>オンボーディング まなびの島（トラブル対応の話し方） |
| `t_kankyou` | **環境のちがい**<br>Environment Gap | テスト | 2 | 圧力 3<br>タイプ 本番<br>AI: testPlaced・優先 4 | 攻撃するたび：この圧力 +1。 | `attack:growTrouble(n=1,target=self)` | テストの環境と本番が違うと、テストに合格しても本番で止まります。違いを表にします。<br>*If test and production differ, it can pass the test and still stop in production. List the differences.* | server+question / night / grid | L22<br>IPA 教訓 T6（本番環境とテスト環境の差異） |
| `t_incident` | **本番障害**<br>Production Incident | 運用・保守 | — | 圧力 2<br>タイプ 本番 | リリースのとき残っていたバグ。圧力＝バグの大きさ。 | — | リリースのあとに見つかったバグを直すのは、設計のときに直すより、ずっと高くつきます。<br>*Fixing a bug after release costs far more than fixing it during design.* | fire+server / red / fire | L02<br>Boehm & Basili 2001（しばしば100倍）／IPA 要件定義ガイド 事例5（約13倍） |

### イベント（event・Event）— 10 枚

| id | 名前 / English | 工程 | コスト | 数値・しるし | 効果（カードの文） | effects（部品） | フレーバー（教訓） / English | 絵 | 教訓・出典 |
|---|---|---|---|---|---|---|---|---|---|
| `e_ittaiwanai` | **「言った・言わない」**<br>"I Never Said That" | 要件定義 | 1 | タイプ あいまい<br>AI: firstUnapproved・優先 6 | 最初の工程にバグ +2。（承認ずみなら効かない） | `play:addBug(n=2,at=first)` | 口だけの約束は、あとで食い違います。書いて、送って、確かめます。<br>*Spoken promises drift apart later. Write, send, confirm.* | speech+cross / orange / waves | L07<br>議事録の実務／IPA 原理原則[12] |
| `e_omottetano` | **「思っていたのと違う」**<br>"Not What I Imagined" | 基本設計 | 2 | タイプ あいまい<br>AI: hasUnapproved・優先 5 | 承認されていない工程 1 つにつき 信頼 −1（最大 4）。 | `play:trust(n=-1,per=unapproved,max=4)` | 作ってから見せると、こうなります。作る前に絵で見せて、OK をもらいましょう。<br>*This happens when you show it after building. Show a picture first and get the OK.* | wireframe+cross / orange / grid | L12<br>オンボーディング 設計 Q16 |
| `e_chabudai` | **ちゃぶ台返し**<br>Flip the Table | 要件定義 | 3 | タイプ あいまい<br>AI: latestUnapproved・優先 7 | 新しい工程を 1 つこわす（手戻り）。承認ずみなら効かない。 | `play:breakStage(n=1)` | 「全部やり直し！」。合意の記録があれば、落ち着いて話し合えます。<br>*"Redo everything!" With a record of agreement, you can talk calmly.* | table+bolt / orange / fire | L06<br>オンボーディング デュエル「ちゃぶ台返し」 |
| `e_meteor` | **メテオフォール**<br>Meteor Fall | 要件定義 | 5 | タイプ あいまい<br>AI: latestUnapproved・優先 8 | 新しい工程を 2 つまでこわす（承認ずみで止まる）。信頼 −2。 | `play:breakStage(n=2)`<br>`play:trust(n=-2)` | 上からふってくる「これじゃない」。目的と合意を最初に作っておくことが、一番の守りです。<br>*A "this is not it" falling from above. Purpose and agreement made at the start are the best shield.* | meteor / orange / fire | L03<br>オンボーディング デュエル「メテオフォール」／特許庁システムの教訓 |
| `e_spec` | **突然の仕様変更**<br>Sudden Spec Change | 管理 | 2 | タイプ 変更<br>AI: hasStage・優先 5 | 新しい工程にバグ +2（承認ずみでも）。 | `play:addBug(n=2,at=latest,force=true)` | 変更は「悪」ではありません。時間とお金への影響を見せて、決めてもらいます。<br>*Change is not evil. Show its effect on time and cost, and let them decide.* | tornado+doc / orange / waves | L10<br>変更管理／日経コンピュータ調査（仕様変更が相次いだ） |
| `e_addfeature` | **テスト中の機能追加**<br>New Feature During Test | テスト | 2 | タイプ 変更<br>AI: testPlaced・優先 6 | 「製造」にバグ +2（見つかっていない）。 | `play:addBug(n=2,at=make,force=true)` | テスト中にコードを変えると、今まで動いていた所までこわれます。<br>*Change code during testing and even parts that worked will break.* | wrench+flask / orange / binary | L10<br>オンボーディング テスト Q22 |
| `e_budget` | **予算の削減**<br>Budget Cut | 見積もり | 2 | タイプ お金<br>AI: notReleased・優先 4 | 次のあなたのターン、工数 −2。 | `play:effort(n=-2)` | 「やっぱり安くして」。お金を減らすなら、作る範囲も一緒に減らします。<br>*"Make it cheaper after all." Less money means less scope, together.* | money+scissors / orange / grid | L09<br>オンボーディング デュエル「予算の削減」 |
| `e_tanshuku` | **納期の短縮**<br>Deadline Moved Up | 見積もり | 2 | タイプ 納期<br>AI: notReleased・優先 4 | 納期が 1 ターン早くなる。 | `play:deadline(n=-1)` | 時間がないからとテストを削ると、バグがそのままお客さまに届きます。<br>*Cut testing because there is no time, and the bugs go straight to the customer.* | calendar+bolt / orange / fire | L08<br>オンボーディング 開発 Q19 |
| `e_warikomi` | **割り込み作業**<br>Interruption | 管理 | 1 | タイプ 人<br>AI: hasUnit・優先 3 | 一番強いなかま 1 人がつかれる（次のターン対応できない）。 | `play:tire(target=strongest)` | 「ちょっとこれもお願い」が重なると、本当の仕事が止まります。優先順位を確かめます。<br>*Too many "just one more thing" requests stop the real work. Confirm the priority.* | bell+person / orange / dots | L32<br>優先順位の確認（オンボーディング 要件定義） |
| `e_houchi` | **見なかったことにする**<br>Pretend Not to See | テスト | 1 | タイプ 品質<br>AI: hasUnfound・優先 5 | 見つかっていないバグが全部育つ（大きさ 2 倍）。 | `play:growBug(at=unfound)` | バグを隠すと、あとでもっと大きくなって自分に返ってきます。<br>*Hide a bug and it comes back to you bigger.* | eye+cross / orange / binary | L02<br>オンボーディング テスト Q24 |

### たくらみ（plot・Plot）— 6 枚

| id | 名前 / English | 工程 | コスト | 数値・しるし | 効果（カードの文） | effects（部品） | フレーバー（教訓） / English | 絵 | 教訓・出典 |
|---|---|---|---|---|---|---|---|---|---|
| `p_tsuru` | **鶴の一声**<br>The Boss Has Spoken | 管理 | 2 | タイプ あいまい<br>発動: guard<br>AI: hasGuard・優先 5 | あなたのガードが発動したとき、それを無効にする。 | `trigger:negate()` | 上の人の一言で、決まったことがひっくり返ります。決める人を会議に呼びましょう。<br>*One word from the top flips what was decided. Invite the decision-maker to the meeting.* | boss+speech / night / rays | L06<br>キーマンの不在（要件定義のよくある失敗） |
| `p_kiitenai` | **「聞いてないよ」**<br>"Nobody Told Me" | 要件定義 | 1 | タイプ あいまい<br>発動: approve<br>AI: notReleased・優先 5 | あなたが承認するとき、その承認を無効にする。信頼 −1。 | `trigger:negate()`<br>`trigger:trust(n=-1)` | 関係する人全員の合意がないまま、次の工程に入ってはいけません。<br>*Never enter the next phase without agreement from everyone involved.* | ear+cross / night / dots | L06<br>IPA 原理原則[4] |
| `p_old_manual` | **古い手順書**<br>Outdated Runbook | リリース | 2 | タイプ 本番<br>発動: release<br>AI: nearRelease・優先 6 | あなたがリリースを置くとき、リリースを失敗させる。信頼 −2。 | `trigger:negate()`<br>`trigger:trust(n=-2)` | 新しい手順書と古い手順書。最新版かどうかは、目ではなく証拠で確かめます。<br>*A new runbook and an old one. Confirm "is it the latest?" with evidence, not by eye.* | scroll+warning / night / grid | L24<br>KDDI 2022（新旧 2 種類の手順書） |
| `p_setting` | **設定値のミス**<br>Wrong Setting | リリース | 2 | タイプ 本番<br>発動: release<br>AI: nearRelease・優先 6 | あなたがリリースを置くとき：信頼 −5。 | `trigger:trust(n=-5)` | 数字 1 つのまちがいで、大きなシステムが止まります。本番の作業は 2 人で確かめます。<br>*One wrong number can stop a huge system. Two people check production work.* | gear+warning / night / circuit | L25<br>東証 2020（設定値の誤り） |
| `p_failover` | **切り替わらない予備機**<br>Backup That Won't Switch | リリース | 3 | タイプ 本番<br>発動: release<br>AI: nearRelease・優先 5 | あなたがリリースを置くとき：圧力 5 の「本番障害」が出る。 | `trigger:summon(id=t_incident,pressure=5)` | 予備の機械は、「本当に切り替わる」ことを試して、初めて予備になります。<br>*A backup machine becomes a backup only after you test that it really switches.* | server+cross / night / circuit | L26<br>東証 2020／IPA 教訓 T7 |
| `p_friday` | **金曜の夕方リリース**<br>Friday Evening Release | リリース | 1 | タイプ 本番<br>発動: release<br>AI: nearRelease・優先 4 | あなたがリリースを置くとき：なかま全員がつかれる。 | `trigger:tire(target=all)` | 週末は人が集まりません。使う人が少なく、すぐ動ける時間を選びます。<br>*Nobody is around on the weekend. Choose a time with few users and people ready to act.* | calendar+moon / night / waves | L23<br>オンボーディング リリース Q25／金曜リリースの慣習 |

### バグ（bug・Bug）— 1 枚

| id | 名前 / English | 工程 | コスト | 数値・しるし | 効果（カードの文） | effects（部品） | フレーバー（教訓） / English | 絵 | 教訓・出典 |
|---|---|---|---|---|---|---|---|---|---|
| `bug` | **バグ**<br>Bug | 全体 | — | 大きさ 1 | 工程が 1 つ進むたび、大きさ 2 倍（最大 8）。直すコスト＝大きさ。 | — | 人が作るものには、かならずまちがいが入ります。大事なのは、早く見つけることです。<br>*Anything people make contains mistakes. What matters is finding them early.* | bug / red / binary | L02<br>Boehm & Basili 2001／IPA 要件定義ガイド 事例5 |


### 5.1 追加してほしい図案（なくても今の図案で足りる。あると良くなるもの）

| 図案名 | 絵 | 使うカード |
|---|---|---|
| `hanko` | 丸い赤いハンコのあと（「OK」） | 承認ずみの工程のしるし（今は `stamp` で代用） |
| `megaphone` | メガホン | すぐ報告（今は `speech`＋`bolt`） |
| `two_people_check` | 2 人と指差しの手 | ダブルチェック（今は `people`＋`check`） |
| `siren` | 回る赤いランプ | 本番障害・アクセス集中（今は `fire`＋`server`） |
| `egg_bug` | ひびの入った卵（見つかっていないバグ） | バグのトークン「？」の表示 |
| `seedling` | 芽（育てる） | 改善提案、運用・保守 |

### 5.2 枠の色の希望

`KINDS` に書いた。工程＝青緑（#0f8fa8）、たくらみ＝暗い紺（#3a3f6b）を新しく足してほしい。ほかは実装ずみの色（unit 青／skill 緑／guard 桃／doc 金茶／enemy 紫→トラブル／event 橙／bug 赤）。未実装のときは `KINDS[kind].style` の色で代用できる。

---

## 6. チュートリアルの台本（第 1 章）

- 山札の順番は固定（`chapters.js` の ch1、`fixedOrder`）。台本どおりに進めると 5 ターンで勝つ。**参照エンジンで台本を自動実行して、全ステップが合法で、信頼 20 のまま勝つことを確かめてある**。
- 1 ステップ＝吹き出し 1 つ。`want` の操作以外はできない（光っている所だけ押せる）。`next` は「OK」を押す。
- 学ぶ順番：V字と信頼・工数 → 工程を置く → バグと 2 倍 → セルフレビュー → なかま → トラブル → すぐ報告（NEW）→ 製造 → レビューのボタン → 対応 → テスト（V字の対応・バグが育った）→ 直す（コスト＝大きさ）→ ガードをふせる → わりこみ発動 → リリース → 運用 → 勝ち。

| # | とき | 話す人 | 光る所 | 求める操作 | 表示する文 | English | 教訓 |
|---|---|---|---|---|---|---|---|
| t00 | T1 自分 | ヘンディ先輩 | `v:all` | OK | ようこそ！ この机の V字が、あなたの**プロジェクト**です。左から順番に工程カードを置いて、**リリース**まで進めましょう。 | Welcome! The V on the table is your project. Place stage cards from the left, all the way to Release. |  |
| t01 | T1 自分 | ヘンディ先輩 | `hud:trust` | OK | これはお客さまの**信頼**です。0 になると負けです。右の数字は**工数**。カードを出すと減り、毎ターン戻ります。 | This is the client's Trust — at 0 you lose. Next to it is Effort: you spend it to play cards, and it refills every turn. |  |
| t02 | T1 自分 | ヘンディ先輩 | `track:st_des` | place 設計 | まず「**設計**」を V字に置きましょう。コストは 2 です。カードを選んで、光っているマスに置きます。 | First, place "Design" on the V. It costs 2. Pick the card and put it on the glowing slot. |  |
| t03 | T1 自分 | ヘンディ先輩 | `bug:st_des` | OK | あっ、赤い**バグ**が 1 つ入りました。人が作るものには、かならずまちがいが入ります。今の大きさは 1。でも工程が進むたびに **2 倍**になります。 | A red Bug got in. Everything people make contains mistakes. Its size is 1 now — but it doubles every time you place a stage. | L02 |
| t04 | T1 自分 | ヘンディ先輩 | `hand:s_review` | play セルフレビュー | 小さいうちに直しましょう。手札の「**セルフレビュー**」（コスト 0）を使います。 | Fix it while it is small. Play "Self Review" (cost 0) from your hand. |  |
| t05 | T1 自分 | ヘンディ先輩 | `hand:u_newbie` | play 新人エンジニア | いいですね！ バグが消えました。次は**なかま**です。「新人エンジニア」（コスト 1）をチームに出しましょう。出たとき、カードを 1 枚ひきます。 | Nice — the bug is gone. Now a Member: play "New Engineer" (cost 1) to your team. It draws a card when it enters. |  |
| t06 | T1 自分 | ヘンディ先輩 | `btn:endTurn` | endTurn | 工数が 0 になりました。「**ターン終了**」を押しましょう。工程は 1 ターンに 1 つまで置けます。 | Effort is 0. Press "End Turn". You can place one stage per turn. |  |
| t07 | T1 相手<br>(enemyPlay:t_fuwa) | 神社長 | `field:t_fuwa` | OK | 神社長「とにかく、いい感じに頼むぞ！」 ——相手が**トラブル**「ふんわり要望」を出しました。トラブルは毎ターン、圧力の数だけ信頼を減らします（出たターンは攻撃しません）。 | The enemy played a Trouble, "Vague Request". Each turn a Trouble cuts your Trust by its Pressure (not on the turn it appears). |  |
| t08 | T2 自分 | ヘンディ先輩 | `hand:s_report` | play すぐ報告 → ふんわり要望 | トラブルに **NEW** のマークがついています。出たばかりなら「**すぐ報告**」（コスト 0）で解決できます。悪い知らせほど早く、です。 | The Trouble has a NEW mark. While it is new, "Report at Once" (cost 0) resolves it. Bad news early! | L29 |
| t09 | T2 自分 | ヘンディ先輩 | `track:st_pg` | place 製造（コーディング） | 次の工程「**製造**」を置きましょう（コスト 3）。コードを書く工程です。 | Place the next stage, "Coding" (cost 3). |  |
| t10 | T2 自分 | ヘンディ先輩 | `hand:s_review` | play セルフレビュー | バグが 3 つも入りました。コードを書く工程は、バグが一番多いです。「セルフレビュー」で 1 つ直しましょう。 | Three bugs got in — coding breeds the most. Fix one with "Self Review". |  |
| t11 | T2 自分 | ヘンディ先輩 | `btn:review` | review | カードがなくても、工程をえらんで「**レビュー**」ボタン（工数 1）で、新しい工程のバグを 1 つ直せます（1 ターンに 1 回）。製造のカードを選んで、レビューを押しましょう。 | Even without a card: select the newest stage and press "Review" (1 Effort) to fix one bug there, once per turn. |  |
| t12 | T2 自分 | ヘンディ先輩 | `btn:endTurn` | endTurn | バグが 1 つ残りましたが、工数がありません。ターンを終わりましょう。残ったバグがどうなるか、見ていてください。 | One bug is left, but you are out of Effort. End the turn — and watch what happens to that bug. |  |
| t13 | T2 相手<br>(enemyPlay:t_fuwa) | 神社長 | `field:t_fuwa` | OK | 神社長「もっと、こう、シュッとした感じで！」 ——また「ふんわり要望」です。 | "Make it more... you know, sleek!" Another "Vague Request". |  |
| t14 | T3 自分 | ヘンディ先輩 | `team:u_newbie` | attack 新人エンジニア → ふんわり要望 | 今度は「すぐ報告」がありません。**なかま**で対応しましょう。「新人エンジニア」を選んで、トラブルを指します。なかまの力の分だけ、圧力が下がります。 | No "Report at Once" this time. Use a Member: select "New Engineer", then the Trouble. Its Pressure drops by the Member's Power. |  |
| t15 | T3 自分 | ヘンディ先輩 | `track:st_tst` | place テスト | 圧力が 2 から 1 になりました。では V字の右側、「**テスト**」を置きましょう（コスト 2）。 | Pressure went from 2 to 1. Now place "Testing" on the right side of the V (cost 2). |  |
| t16 | T3 自分 | ヘンディ先輩 | `bug:st_pg` | OK | 見てください！ テストが、V字の向かい側（設計と製造）のバグを**見つけました**。でも工程が 1 つ進んだので、バグは 1 → **2** に育っています。 | Look! The test found the bug on the opposite side of the V. But one stage has passed, so the bug grew from 1 to 2. | L02 |
| t17 | T3 自分 | ヘンディ先輩 | `btn:fix` | fix 製造（コーディング） | 見つかったバグは、工数を払って直せます。コストは**バグの大きさ**です。バグを選んで「直す」（工数 2）。さっきレビューなら 1 でしたね。 | A found bug can be fixed by paying Effort equal to its size. Select the bug and press "Fix" (2 Effort). A review would have cost 1. |  |
| t18 | T3 自分 | ヘンディ先輩 | `hand:g_abplan` | play A 案・B 案の提案 | 最後に**そなえ**です。「A 案・B 案の提案」（コスト 1）を、うら向きでふせましょう。相手のターンに発動できるカードです。 | Last, a Guard. Set "Plan A or Plan B" (cost 1) face-down. It can be activated on the enemy's turn. |  |
| t19 | T3 自分 | ヘンディ先輩 | `btn:endTurn` | endTurn | ターン終了です。「ふんわり要望」が攻撃してきますよ。 | End the turn. "Vague Request" is about to attack. |  |
| t20 | T3 相手<br>(enemyAttack:t_fuwa) | ヘンディ先輩 | `back:g_abplan` | guard A 案・B 案の提案 | 「ふんわり要望」の攻撃！ ふせたカードが光りました。「**発動する**」を選びましょう。 | "Vague Request" attacks! Your set card is glowing. Choose "Activate". | L14 |
| t21 | T3 相手 | ヘンディ先輩 | `field:t_kakaekomi` | OK | ナイス！ 攻撃を止めて、トラブルも解決しました。——でも、さっき相手が出した「抱え込み」に注意。放っておくと毎ターン 大きくなるトラブルです。 | Nice! You stopped the attack and resolved the Trouble. But watch the "Hidden Delay" the enemy just played: it grows every turn if ignored. |  |
| t22 | T4 自分 | ヘンディ先輩 | `hand:s_report` | play すぐ報告 → 抱え込み | 「抱え込み」は NEW です。「すぐ報告」で、小さいうちに解決しましょう。 | "Hidden Delay" is NEW. Resolve it while it is small with "Report at Once". |  |
| t23 | T4 自分 | ヘンディ先輩 | `track:st_rel` | place リリース | V字にバグは 1 つもありません。いよいよ「**リリース**」です（コスト 1）。もしバグが残っていたら、ここで「本番障害」というトラブルになります。 | No bugs on the V. Time to "Release" (cost 1). Any bugs left now would turn into "Production Incident" troubles. | L23 |
| t24 | T4 自分 | ヘンディ先輩 | `hud:ops` | OK | リリースできました！ でも、まだ終わりではありません。ここから**運用**です。あと 1 ターン、信頼を守れば勝ちです。 | Released! But it is not over: Operation begins. Protect your Trust for 1 more turn to win. | L27 |
| t25 | T4 自分 | ヘンディ先輩 | `btn:endTurn` | endTurn | 本当は、残りの工数でなかまを出したり、そなえをふせたりできます。今日はここで、ターン終了を押しましょう。 | Normally you could spend the Effort left on Members or Guards. For today, press End Turn. |  |
| t26 | T5 自分 | ヘンディ先輩 | `btn:endTurn` | endTurn | トラブルはありません。安心してターンを終わりましょう。 | No troubles. End the turn with confidence. |  |
| t27 | 勝ったとき | ヘンディ先輩 | `v:all` | OK | おめでとう、プロジェクト成功です！ 今日のまとめ：① V字を左から順番に ② バグは小さいうちに ③ 悪い知らせは早く。次の章からは、自分で考えて進めましょう！ | Congratulations — project success! Today: (1) the V in order, (2) fix bugs while small, (3) bad news early. From the next chapter, you decide. | L01 |


第 2 章からは一手ずつの案内はしない。はじめて起きたことに 1 回だけヒントを出す（`HINTS`）：

| id | きっかけ | 章 | 文 | English |
|---|---|---|---|---|
| h_approve | `firstDesignPlaced` | ch2 | 工程をえらんで「**承認**」（工数 1）を押すと、ハンコがつきます。承認ずみの工程は、相手の「あいまい」カードでバグを足されず、こわされません。 | Select a stage and press "Approve" (1 Effort) to stamp it. An approved stage cannot be bugged or broken by the enemy's "Vague" cards. |
| h_fuwa | `designWithFuwa` | ch2 | 「ふんわり要望」がいる間は、要件定義・設計に入るバグが +1 されます。先に解決してから置くと安全です。 | While "Vague Request" is in play, Requirements/Design stages get +1 bug. Resolve it first. |
| h_skip | `canSkip` | ch2 | 工程は**とばす**こともできます。でも、とばした設計の工程にはバグが 2 つ入り、テストでも見つけられません。急がば回れ、です。 | You may skip a stage — but a skipped design stage gets 2 bugs that no test can find. More haste, less speed. |
| h_deadline | `deadlineNear` | ch3 | 砂時計が**納期**です。納期のターンまでにリリースできないと、毎ターン信頼が減ります（2、3、4…と増えます）。 | The hourglass is the Deadline. If you have not released by that turn, you lose Trust every turn (2, 3, 4...). |
| h_fullv | `start` | ch4 | 本物の V字のペア：詳細設計⇔単体テスト、基本設計⇔結合テスト、要件定義⇔受入テスト。上の工程のバグほど、見つかるのが遅くなります。 | Pairs on the full V: Detailed Design ⇔ Unit Test, Basic Design ⇔ Integration Test, Requirements ⇔ Acceptance Test. Higher bugs are found later. |
| h_change | `firstChangeEvent` | ch6 | 「変更」のイベントは、承認ずみの工程にもバグを入れます。止められるのは「変更管理」だけ。そして変更管理には、承認ずみの工程が必要です。 | "Change" events add bugs even to approved stages. Only "Change Control" stops them — and it needs an approved stage. |
| h_retest | `bugAfterTest` | ch6 | テストのあとに入ったバグは、見つかっていません（？マーク）。「再テスト」で見つけるか、製造のバグなら「レビュー」で直しましょう。 | Bugs that get in after the test are hidden ("?" mark). Find them with "Regression Test", or review them if they are in Coding. |
| h_plot | `firstPlot` | ch7 | 相手がカードをふせました。「**たくらみ**」です。あなたがリリースを置くときなどに発動します。「リハーサル」でこわすか、「ダブルチェック」で無効にできます。 | The enemy set a card: a Plot. It triggers when you release, for example. Break it with "Rehearsal" or negate it with "Double Check". |
| h_ops | `start` | ch8 | この章はリリースのあとから始まります。6 ターン、信頼を守りましょう。「監視」を置くと、トラブルが出たとき、すぐ弱くできます。 | This chapter starts after the release. Protect your Trust for 6 turns. "Monitoring" weakens troubles the moment they appear. |


---

## 7. キャンペーン（全 9 章）

- 章をクリアすると次の章が開く。各章のプレイヤーのデッキは決まっている（`playerDeck`。デッキを組む画面は作らなくてよい。余裕があれば「図鑑でカードを見る」だけ）。
- V字は 3 種類：**小さな V**（設計→製造→テスト→リリース）、**中くらいの V**（要件定義→設計→製造→テスト→受入テスト→リリース。研修の 7 ステップに近い）、**本物の V**（要件定義→基本設計→詳細設計→製造→単体→結合→受入→リリース）。
- 見積もりは V字のマスではなく、資源（工数・納期）を守る章として入れた（第 3 章）。


### 第 1 章　はじめての案件（Your First Project）

| 項目 | 内容 |
|---|---|
| ねらい（学び） | ルールを一手ずつ体で覚える。V字・バグの 2 倍・レビュー・テストの対応・すぐ報告・わりこみ・リリース・運用、を全部 1 回ずつ。 |
| 舞台 | ネクストメイク 大阪オフィスの会議室（Meeting room, Nextmake Osaka office） |
| 相手 | **せっかちな神社長**（President Kami, in a Hurry）。像：boss+hourglass / purple / rays。台詞「とにかく早く！ チラシのページを作ってくれ！」 |
| V字 | 小さな V：設計 → 製造（コーディング） → テスト → リリース。ペア：テスト⇔設計・製造（コーディング） |
| 勝利条件 | V字に工程を 4 つ置いてリリースし、1 ターン運用する。（Place the 4 stages on the V, release, and operate for 1 turn.） |
| 数値 | 信頼 20／納期 6 ターン／運用 1 ターン／工数 3 から／相手の行動力 1→上限 2／相手が 2 枚ひくのは なし／山札の順番固定（チュートリアル） |
| 新しいカード | 設計、製造（コーディング）、テスト、リリース、セルフレビュー、すぐ報告、相談（30 分ルール）、新人エンジニア、ヘンディ先輩（PM）、ニャムさん（出向エンジニア）、A 案・B 案の提案、残業でカバー、突貫作業 |
| プレイヤーのデッキ（16 枚） | セルフレビュー×3、新人エンジニア×2、すぐ報告×3、A 案・B 案の提案×2、ヘンディ先輩（PM）、ニャムさん（出向エンジニア）、残業でカバー、相談（30 分ルール）×2、突貫作業 |
| CPU のデッキ（8 枚） | 序盤：ふんわり要望、抱え込み、「なんか変です」、ふんわり要望、見なかったことにする、「なんか変です」、見なかったことにする、抱え込み<br>（この順番のまま。切らない） |
| 開始時の台詞 | 山田さん「新しい案件だよ。スーパー『ゴッドマート』のチラシのページを作る小さな仕事だ」<br>ヘンディ先輩「最初だから、一手ずつ一緒にやりましょう。失敗しても大丈夫です」<br>*A small first job: a flyer page for the supermarket "God Mart". Hendy will guide you move by move.* |
| 勝ったとき | 神社長「おお、ちゃんと動くじゃないか！」<br>ヘンディ先輩「バグを早く見つけましたね。それがプロの仕事です」<br>*It works! You found the bugs early — that is professional work.* |
| 負けたとき | ヘンディ先輩「大丈夫。失敗も勉強です。バグが小さいうちに直すと、もっと楽になりますよ」<br>*It is OK — failure is study too. Fix bugs while they are small and it gets easier.* |
| クリア後の教訓 | L01「システムは順番に作る」、L02「バグは早く見つけるほど安い」、L15「レビューは一番安いバグとり」、L29「悪い報告ほど早く」 |
| ボットの結果 | ていねい 勝率 100%・平均 5.0 ターン／ざつ 100%／とばす 100% |

### 第 2 章　ふんわりした要望（The Vague Request）

| 項目 | 内容 |
|---|---|
| ねらい（学び） | 「ふんわり」のまま決めるとバグが増える。なぜ？を聞く → 書く → 承認、の順番。承認ずみの工程は、言った言わない・ちゃぶ台返しから守られる。 |
| 舞台 | ゴッドマート 本社の応接室（Reception room, God Mart HQ） |
| 相手 | **ふんわりした神社長**（President Kami, Vague）。像：boss+fog / purple / waves。台詞「とにかく使いやすいアプリにしてくれ！ いい感じに！」 |
| V字 | 中くらいの V：要件定義 → 設計 → 製造（コーディング） → テスト → 受入テスト → リリース。ペア：テスト⇔設計・製造（コーディング）、受入テスト⇔要件定義 |
| 勝利条件 | 要件定義から始めてリリースし、1 ターン運用する。（Start from Requirements, release, and operate for 1 turn.） |
| 数値 | 信頼 20／納期 9 ターン／運用 1 ターン／工数 3 から／相手の行動力 1→上限 3／相手が 2 枚ひくのは 6 ターン目から |
| 新しいカード | 要件定義、受入テスト、「なぜ？」を聞く、5W1H の質問、合意のハンコ、議事録、ヒアリングシート、お客さまの担当者 |
| プレイヤーのデッキ（24 枚） | セルフレビュー×3、「なぜ？」を聞く×2、5W1H の質問×2、合意のハンコ×3、議事録×2、ヒアリングシート×2、お客さまの担当者×2、新人エンジニア×2、ヘンディ先輩（PM）、ニャムさん（出向エンジニア）、すぐ報告×2、相談（30 分ルール）、A 案・B 案の提案 |
| CPU のデッキ（17 枚） | 序盤：ふんわり要望、ふんわり要望、「言った・言わない」、思いつきのアイデア、「言った・言わない」<br>中盤：ふんわり要望、「思っていたのと違う」、終わらない要件定義、「言った・言わない」、「思っていたのと違う」、思いつきのアイデア<br>終盤：ちゃぶ台返し、ふんわり要望、「思っていたのと違う」、終わらない要件定義、ちゃぶ台返し、思いつきのアイデア<br>（束の中だけを切る） |
| 開始時の台詞 | 神社長「ポイント機能とネットスーパーを入れたいんじゃ！ あとは、いい感じに頼む！」<br>ヘンディ先輩「『いい感じ』のまま進むと、バグが増えます。聞いて、書いて、ハンコをもらいましょう」<br>*"Make it nice!" Moving on with "nice" breeds bugs. Ask, write it down, and get the stamp.* |
| 勝ったとき | 神社長「わしが本当にほしかったのは、これじゃ！」<br>山田さん「『なぜ』を聞いたのがよかったね」<br>*"This is what I really wanted!" Asking "why" made the difference.* |
| 負けたとき | ヘンディ先輩「おしい！ 要件定義を置く前に『ふんわり要望』を解決すると、バグが減りますよ」<br>*Close! Clear the "Vague Request" before placing Requirements and fewer bugs get in.* |
| クリア後の教訓 | L03「要件定義が一番大事」、L04「あいまいな言葉を、はっきりさせる」、L05「聞く前に準備する」、L06「合意してから進む」、L07「議事録で「言った言わない」を防ぐ」 |
| ボットの結果 | ていねい 勝率 84%・平均 8.0 ターン／ざつ 0%／とばす 40% |

### 第 3 章　値切りと無茶な納期（Bargains and Impossible Deadlines）

| 項目 | 内容 |
|---|---|
| ねらい（学び） | 工数と納期は「守る資源」。値切り・無茶な納期を、根拠（見積もりの根拠）と予備（バッファ）で受ける。安請け合いは自分の首をしめる。 |
| 舞台 | ゴッドマート 社長室（The president's office, God Mart） |
| 相手 | **ねぎってくる神社長**（President Kami, the Bargainer）。像：boss+scissors / purple / grid。台詞「うーん、高いな…。半額で、来月までにできんか？」 |
| V字 | 中くらいの V：要件定義 → 設計 → 製造（コーディング） → テスト → 受入テスト → リリース。ペア：テスト⇔設計・製造（コーディング）、受入テスト⇔要件定義 |
| 勝利条件 | 工数と納期を守りながらリリースし、1 ターン運用する。（Protect your effort and deadline, release, and operate for 1 turn.） |
| 数値 | 信頼 20／納期 9 ターン／運用 1 ターン／工数 3 から／相手の行動力 2→上限 3／相手が 2 枚ひくのは 5 ターン目から |
| 新しいカード | 営業の山田さん、バッファ（予備の時間）、見積書（根拠つき）、見積もりの根拠、フェーズ 2 の提案 |
| プレイヤーのデッキ（25 枚） | セルフレビュー×3、合意のハンコ×2、「なぜ？」を聞く、5W1H の質問、営業の山田さん×2、バッファ（予備の時間）×2、見積書（根拠つき）×2、見積もりの根拠×3、フェーズ 2 の提案×2、議事録、ヒアリングシート、お客さまの担当者、ヘンディ先輩（PM）、ニャムさん（出向エンジニア）、すぐ報告、残業でカバー |
| CPU のデッキ（17 枚） | 序盤：強引な値切り、予算の削減、無茶な納期、強引な値切り、納期の短縮<br>中盤：無茶な納期、予算の削減、思いつきのアイデア、ふんわり要望、「思っていたのと違う」、納期の短縮<br>終盤：終わらない要件定義、予算の削減、強引な値切り、納期の短縮、思いつきのアイデア、突然の仕様変更<br>（束の中だけを切る） |
| 開始時の台詞 | 神社長「少し高いな…。もっと安く、もっと早くならんか？」<br>山田さん「すぐ半額にしてはだめだよ。数字の理由を見せて、機能を相談しよう」<br>*"A bit expensive... cheaper and faster?" Do not halve the price. Show the basis and discuss the scope.* |
| 勝ったとき | 神社長「なるほど、理由がわかった。この値段で頼む」<br>山田さん「根拠があると、お互いに安心だね」<br>*"I see the reason. Go ahead at this price." A clear basis makes both sides feel safe.* |
| 負けたとき | 山田さん「工数を減らされたままだと苦しいね。『見積もりの根拠』をふせておこう」<br>*It is hard with reduced effort. Set "Basis of Estimate" face-down next time.* |
| クリア後の教訓 | L08「見積もりは積み上げて、予備を入れる」、L09「値切りには根拠で答える」、L10「変更は「変更管理」で受ける」 |
| ボットの結果 | ていねい 勝率 93%・平均 7.7 ターン／ざつ 5%／とばす 17% |

### 第 4 章　「思っていたのと違う」（"Not What I Imagined"）

| 項目 | 内容 |
|---|---|
| ねらい（学び） | 本物の V字。設計とテストのペア（詳細⇔単体、基本⇔結合、要件⇔受入）を覚える。上のバグほど見つかるのが遅く、大きくなる。絵で見せて承認をとる。 |
| 舞台 | ネクストメイク 東京オフィスの設計ルーム（Design room, Nextmake Tokyo office） |
| 相手 | **想像できない神社長**（President Kami, Who Can't Picture It）。像：boss+question / purple / dots。台詞「文章ではわからん。できてから見るよ」 |
| V字 | 本物の V：要件定義 → 基本設計 → 詳細設計 → 製造（コーディング） → 単体テスト → 結合テスト → 受入テスト → リリース。ペア：単体テスト⇔詳細設計・製造（コーディング）、結合テスト⇔基本設計、受入テスト⇔要件定義 |
| 勝利条件 | 本物の V字（7 工程）を進めてリリースし、1 ターン運用する。（Advance through the full V (7 stages), release, and operate for 1 turn.） |
| 数値 | 信頼 20／納期 11 ターン／運用 1 ターン／工数 3 から／相手の行動力 2→上限 4／相手が 2 枚ひくのは 5 ターン目から |
| 新しいカード | 基本設計、詳細設計、単体テスト、結合テスト、SE（設計の人）、ワイヤーフレーム（画面の絵）、読み合わせ、ピアレビュー |
| プレイヤーのデッキ（25 枚） | セルフレビュー×3、ピアレビュー×2、ワイヤーフレーム（画面の絵）×2、読み合わせ、合意のハンコ×2、SE（設計の人）×2、お客さまの担当者、ヘンディ先輩（PM）、ニャムさん（出向エンジニア）、新人エンジニア、A 案・B 案の提案×2、議事録×2、「なぜ？」を聞く、5W1H の質問、ヒアリングシート、すぐ報告、フェーズ 2 の提案 |
| CPU のデッキ（18 枚） | 序盤：ふんわり要望、「言った・言わない」、「聞いてないよ」、ふんわり要望、「思っていたのと違う」<br>中盤：「思っていたのと違う」、ちゃぶ台返し、隠れたステークホルダー、「言った・言わない」、思いつきのアイデア、「思っていたのと違う」、「聞いてないよ」<br>終盤：ちゃぶ台返し、終わらない要件定義、突然の仕様変更、「思っていたのと違う」、隠れたステークホルダー、メテオフォール<br>（束の中だけを切る） |
| 開始時の台詞 | ヘンディ先輩「ここからは本物の V字です。設計が 2 つ、テストが 3 つに分かれます」<br>ヘンディ先輩「左の設計と、右のテストは、同じ高さどうしがペアです。覚えてくださいね」<br>*Now the real V: two design stages, three test stages. Design on the left pairs with the test at the same height on the right.* |
| 勝ったとき | 神社長「絵で見せてくれたから、よくわかったぞ」<br>ヘンディ先輩「設計のうちに直したバグは、たった 1 でしたね」<br>*"The pictures made it clear." Bugs fixed during design cost only 1.* |
| 負けたとき | ヘンディ先輩「設計のバグは、テストまで待つと 8 になります。置いたターンにレビューしましょう」<br>*A design bug becomes 8 if you wait for the test. Review on the turn you place the stage.* |
| クリア後の教訓 | L02「バグは早く見つけるほど安い」、L11「設計の前に読み合わせ」、L12「画面は絵で見せる」、L13「エラーのときも設計する」、L14「勝手に決めない。案を持って聞く」 |
| ボットの結果 | ていねい 勝率 90%・平均 10.7 ターン／ざつ 0%／とばす 16% |

### 第 5 章　デスマーチの影（Shadow of the Death March）

| 項目 | 内容 |
|---|---|
| ねらい（学び） | 遅れ・問題を一人で抱えない。「抱え込み」は毎ターン育つ。すぐ報告・相談・連絡で小さいうちに解決。残業・突貫は得に見えて高くつく。 |
| 舞台 | 夜の開発ルーム（The dev room at night） |
| 相手 | **炎上の化身 デスマーチ**（Death March, Spirit of the Burning Project）。像：fire+ghost / red / fire。台詞「だまっていれば、ばれないさ…。一人でがんばれ…」 |
| V字 | 本物の V：要件定義 → 基本設計 → 詳細設計 → 製造（コーディング） → 単体テスト → 結合テスト → 受入テスト → リリース。ペア：単体テスト⇔詳細設計・製造（コーディング）、結合テスト⇔基本設計、受入テスト⇔要件定義 |
| 勝利条件 | トラブルを小さいうちに解決しながらリリースし、1 ターン運用する。（Resolve troubles while they are small, release, and operate for 1 turn.） |
| 数値 | 信頼 20／納期 11 ターン／運用 1 ターン／工数 3 から／相手の行動力 2→上限 4／相手が 2 枚ひくのは 5 ターン目から |
| 新しいカード | プログラマー、藤木取締役、連絡（事実を短く）、ペアプログラミング、コーディング規約、CI（自動テスト）、課題管理表 |
| プレイヤーのデッキ（25 枚） | セルフレビュー×3、すぐ報告×3、相談（30 分ルール）×2、連絡（事実を短く）×2、ペアプログラミング、プログラマー×2、ニャムさん（出向エンジニア）、藤木取締役、ヘンディ先輩（PM）、SE（設計の人）、コーディング規約、CI（自動テスト）、課題管理表、ピアレビュー、合意のハンコ、A 案・B 案の提案、残業でカバー、突貫作業 |
| CPU のデッキ（17 枚） | 序盤：抱え込み、割り込み作業、抱え込み、属人化、納期の短縮<br>中盤：デスマーチ、抱え込み、割り込み作業、見なかったことにする、無茶な納期、属人化<br>終盤：デスマーチ、見なかったことにする、抱え込み、突然の仕様変更、割り込み作業、納期の短縮<br>（束の中だけを切る） |
| 開始時の台詞 | エンジニア「すみません…開発が少し遅れています…」<br>ヘンディ先輩「言ってくれてありがとう。悪い知らせほど早く。『抱え込み』は出たターンに解決しましょう」<br>*"Sorry, we are a little behind..." Thank you for telling me. Bad news early — resolve "Hidden Delay" the turn it appears.* |
| 勝ったとき | 藤木取締役「正直に、早く教えてくれたから間に合いましたね」<br>エンジニア「相談してよかったです！」<br>*"You told us honestly and early, so we made it." "I am glad I asked!"* |
| 負けたとき | ヘンディ先輩「『抱え込み』は毎ターン +2 で育ちます。『すぐ報告』はコスト 0 ですよ」<br>*"Hidden Delay" grows by 2 every turn. "Report at Once" costs 0.* |
| クリア後の教訓 | L16「みんなが読めるコードを書く」、L17「無理な計画は、チームをこわす」、L18「「あの人しかわからない」をなくす」、L29「悪い報告ほど早く」、L30「相談は 30 分ルール」、L31「連絡は事実と数字で」、L32「課題には担当と期限」 |
| ボットの結果 | ていねい 勝率 75%・平均 9.0 ターン／ざつ 0%／とばす 0% |

### 第 6 章　バグキングの城（Castle of the Bug King）

| 項目 | 内容 |
|---|---|
| ねらい（学び） | テスト中の変更は新しいバグのもと。承認（基準）があるから変更管理で受けられる。テストのあとに入ったバグは再テストで見つける。 |
| 舞台 | テストルーム（検証環境）（The test room (staging environment)） |
| 相手 | **バグキングと思いつきの神社長**（The Bug King & President Kami's Ideas）。像：bug+crown / red / binary。台詞「テストなんて減らせばいい。あ、このボタンも追加して！」 |
| V字 | 本物の V：要件定義 → 基本設計 → 詳細設計 → 製造（コーディング） → 単体テスト → 結合テスト → 受入テスト → リリース。ペア：単体テスト⇔詳細設計・製造（コーディング）、結合テスト⇔基本設計、受入テスト⇔要件定義 |
| 勝利条件 | バグを見つけて直し、リリースして 1 ターン運用する。（Find and fix the bugs, release, and operate for 1 turn.） |
| 数値 | 信頼 20／納期 11 ターン／運用 1 ターン／工数 3 から／相手の行動力 2→上限 4／相手が 2 枚ひくのは 5 ターン目から |
| 新しいカード | テスター、レビュアー、再テスト、バグ票（再現手順つき）、テスト仕様書、変更管理 |
| プレイヤーのデッキ（25 枚） | セルフレビュー×3、ピアレビュー×2、再テスト×2、バグ票（再現手順つき）×2、テスター×2、レビュアー、プログラマー、ニャムさん（出向エンジニア）、テスト仕様書×2、CI（自動テスト）、変更管理×2、合意のハンコ×2、フェーズ 2 の提案、相談（30 分ルール）、すぐ報告、ヘンディ先輩（PM） |
| CPU のデッキ（17 枚） | 序盤：「なんか変です」、見なかったことにする、思いつきのアイデア、突然の仕様変更、ふんわり要望<br>中盤：見なかったことにする、バグキング、「なんか変です」、突然の仕様変更、思いつきのアイデア、納期の短縮<br>終盤：テスト中の機能追加、環境のちがい、テスト中の機能追加、見なかったことにする、「なんか変です」、思いつきのアイデア<br>（束の中だけを切る） |
| 開始時の台詞 | 神社長「おお！ ここに『今日のチラシ』ボタンを追加してくれ！」<br>ヘンディ先輩「テスト中の変更は、新しいバグのもとです。承認があれば『変更管理』で受けられます」<br>*"Add a button here!" Changes during testing breed new bugs. With an approval, "Change Control" can take it.* |
| 勝ったとき | 神社長「ボタンは次のアップデートでいい。今はテストに集中してくれ」<br>テスター「リストどおり、もれなく確かめました！」<br>*"The button can wait for the next update." "Everything on the list is checked!"* |
| 負けたとき | ヘンディ先輩「テストのあとに入ったバグは、見つかっていません。『再テスト』で見つけましょう」<br>*Bugs that got in after the test are still hidden. Use "Regression Test" to find them.* |
| クリア後の教訓 | L02「バグは早く見つけるほど安い」、L10「変更は「変更管理」で受ける」、L19「テストはリストで、もれなく」、L20「バグの報告は具体的に」、L21「受入テストの主役はお客さま」、L22「目に見えないルールと、本番との違い」 |
| ボットの結果 | ていねい 勝率 67%・平均 10.2 ターン／ざつ 1%／とばす 0% |

### 第 7 章　本番の夜（The Night of the Release）

| 項目 | 内容 |
|---|---|
| ねらい（学び） | 本番作業の怖さ。リリースの瞬間に発動する「たくらみ」（設定値のミス、古い手順書、切り替わらない予備機、金曜の夕方）を、手順書・リハーサル・ダブルチェック・切り戻し計画で防ぐ。 |
| 舞台 | 夜中のサーバールーム（The server room at midnight） |
| 相手 | **本番の魔物 ショウガイ**（Shougai, the Demon of Production）。像：server+ghost / night / circuit。台詞「手順書？ 見なくてもできるだろう…？」 |
| V字 | 本物の V：要件定義 → 基本設計 → 詳細設計 → 製造（コーディング） → 単体テスト → 結合テスト → 受入テスト → リリース。ペア：単体テスト⇔詳細設計・製造（コーディング）、結合テスト⇔基本設計、受入テスト⇔要件定義 |
| 勝利条件 | 相手の「たくらみ」をよけてリリースし、2 ターン運用する。（Dodge the enemy's Plots, release, and operate for 2 turns.） |
| 数値 | 信頼 20／納期 11 ターン／運用 2 ターン／工数 3 から／相手の行動力 2→上限 4／相手が 2 枚ひくのは 5 ターン目から |
| 新しいカード | リリース手順書、ダブルチェック（指差し確認）、切り戻し計画、リハーサル、運用エンジニア |
| プレイヤーのデッキ（26 枚） | セルフレビュー×3、ピアレビュー、リハーサル×2、リリース手順書×2、ダブルチェック（指差し確認）×3、切り戻し計画×2、テスター、プログラマー、ニャムさん（出向エンジニア）、ヘンディ先輩（PM）、運用エンジニア×2、テスト仕様書、バグ票（再現手順つき）、合意のハンコ、すぐ報告×2、バッファ（予備の時間）、再テスト |
| CPU のデッキ（18 枚） | 序盤：無茶な納期、突然の仕様変更、抱え込み、割り込み作業、「なんか変です」<br>中盤：設定値のミス、環境のちがい、納期の短縮、古い手順書、見なかったことにする、思いつきのアイデア<br>終盤：切り替わらない予備機、金曜の夕方リリース、アクセス集中、環境のちがい、サイレント障害、クレームの嵐、アクセス集中<br>（束の中だけを切る） |
| 開始時の台詞 | 山田さん「いよいよリリースだね。当日あわてないように、何を準備する？」<br>ヘンディ先輩「手順書、ダブルチェック、切り戻し計画。相手は『たくらみ』をふせてきますよ」<br>*Release day is near. Runbook, double check, rollback plan — the enemy will set Plots face-down.* |
| 勝ったとき | エンジニア「手順書どおり、指を差して確認しました。本番、問題なしです！」<br>神社長「朝起きたら、もう動いておった！」<br>*"By the runbook, pointing and calling. Production is all green!" "It was running when I woke up!"* |
| 負けたとき | ヘンディ先輩「リリースの前に『リハーサル』でたくらみをこわすか、『ダブルチェック』をふせておきましょう」<br>*Before release, break Plots with "Rehearsal" or set "Double Check" face-down.* |
| クリア後の教訓 | L23「リリースは「いつ」が大事」、L24「手順書どおりに。練習してから本番」、L25「本番の作業は 2 人で」、L26「元に戻す準備をしておく」 |
| ボットの結果 | ていねい 勝率 66%・平均 10.2 ターン／ざつ 0%／とばす 0% |

### 第 8 章　運用はつづく（Operation Goes On）

| 項目 | 内容 |
|---|---|
| ねらい（学び） | リリースしても終わりではない。監視で早く気づき、ログで原因を見て、なぜなぜで仕組みを直す。サイレント障害は小さいうちに。 |
| 舞台 | 運用センター（監視ルーム）（Operations center (monitoring room)） |
| 相手 | **本番の魔物 ショウガイ（運用編）**（Shougai, Operation Mode）。像：ghost+server / night / waves。台詞「リリースしたら終わり、だと思ったか…？」 |
| V字 | 中くらいの V：要件定義 → 設計 → 製造（コーディング） → テスト → 受入テスト → リリース。ペア：テスト⇔設計・製造（コーディング）、受入テスト⇔要件定義 |
| 勝利条件 | リリースのあとの 6 ターン、信頼を守りきる。（Protect your trust for 6 turns after the release.） |
| 数値 | 信頼 20／納期 なし／運用 6 ターン／工数 4 から／相手の行動力 4→上限 6／相手が 2 枚ひくのは 1 ターン目から／リリースずみで開始（V字は全部置かれ承認ずみ）。最初からいるトラブル：本番障害（圧力 4）、サイレント障害（圧力 1） |
| 新しいカード | 運用・保守、ログ分析、なぜなぜ分析、改善提案、監視（アラート） |
| プレイヤーのデッキ（24 枚） | 運用エンジニア×3、ニャムさん（出向エンジニア）、ヘンディ先輩（PM）、藤木取締役、ログ分析×3、なぜなぜ分析×2、改善提案×2、監視（アラート）×2、課題管理表、すぐ報告×3、切り戻し計画×2、A 案・B 案の提案、連絡（事実を短く）、ペアプログラミング |
| CPU のデッキ（17 枚） | 序盤：サイレント障害、クレームの嵐、割り込み作業、アクセス集中、サイレント障害<br>中盤：アクセス集中、予算の削減、クレームの嵐、サイレント障害、環境のちがい、割り込み作業<br>終盤：アクセス集中、サイレント障害、クレームの嵐、環境のちがい、アクセス集中、サイレント障害<br>（束の中だけを切る） |
| 開始時の台詞 | 神社長「アプリのおかげでお客さんが増えたぞ！ じゃが、たまに『ポイントがつかない』と言われるんじゃ…」<br>ヘンディ先輩「ここからは運用です。監視で早く気づき、ログを見て、直します」<br>*"More customers thanks to the app! But sometimes points are not added..." Operation begins: notice early with monitoring, read the logs, fix.* |
| 勝ったとき | 神社長「すぐ直してくれて助かった。次は何をよくできる？」<br>ヘンディ先輩「育てていくのが、IT の仕事のいいところですね」<br>*"Thanks for the quick fix. What can we improve next?" Growing a system is the best part of IT work.* |
| 負けたとき | ヘンディ先輩「『サイレント障害』は小さいうちに。『監視』を置くと、出た瞬間に弱くできます」<br>*Hit "Silent Failure" while it is small. "Monitoring" weakens troubles the moment they appear.* |
| クリア後の教訓 | L27「作って終わりではない」、L28「まず復旧、次に原因、そして再発防止」、L29「悪い報告ほど早く」、L31「連絡は事実と数字で」 |
| ボットの結果 | ていねい 勝率 95%・平均 5.9 ターン／ざつ 24%／とばす 95% |

### 第 9 章　通しプロジェクト：ゴッドマート・アプリ（The Whole Project: God Mart App）

| 項目 | 内容 |
|---|---|
| ねらい（学び） | 要件定義から運用まで通しで。今まで学んだことを全部使う。 |
| 舞台 | ゴッドマート 本社 大会議室（Main conference room, God Mart HQ） |
| 相手 | **神社長（本気）**（President Kami, Serious）。像：boss+meteor / purple / rays。台詞「お客様は神様じゃ！ AI で、いい感じに、安く、早く！」 |
| V字 | 本物の V：要件定義 → 基本設計 → 詳細設計 → 製造（コーディング） → 単体テスト → 結合テスト → 受入テスト → リリース。ペア：単体テスト⇔詳細設計・製造（コーディング）、結合テスト⇔基本設計、受入テスト⇔要件定義 |
| 勝利条件 | 要件定義からリリースまで通して進め、3 ターン運用する。（Run the whole project from Requirements to Release, then operate for 3 turns.） |
| 数値 | 信頼 20／納期 12 ターン／運用 3 ターン／工数 3 から／相手の行動力 2→上限 4／相手が 2 枚ひくのは 5 ターン目から |
| 新しいカード | （なし。今までの全部から選んだデッキ） |
| プレイヤーのデッキ（30 枚） | セルフレビュー×3、ピアレビュー、ワイヤーフレーム（画面の絵）、合意のハンコ×2、「なぜ？」を聞く、ヒアリングシート、議事録、見積もりの根拠、変更管理、ダブルチェック（指差し確認）、切り戻し計画、リリース手順書、リハーサル、すぐ報告×2、バグ票（再現手順つき）、再テスト、お客さまの担当者、営業の山田さん、ヘンディ先輩（PM）、テスター、運用エンジニア、ニャムさん（出向エンジニア）、藤木取締役、ログ分析、見積書（根拠つき）、A 案・B 案の提案 |
| CPU のデッキ（23 枚） | 序盤：ふんわり要望、「言った・言わない」、強引な値切り、「聞いてないよ」、無茶な納期、予算の削減<br>中盤：「思っていたのと違う」、隠れたステークホルダー、ちゃぶ台返し、抱え込み、突然の仕様変更、デスマーチ、鶴の一声、見なかったことにする<br>終盤：テスト中の機能追加、バグキング、設定値のミス、メテオフォール、古い手順書、思いつきのアイデア、アクセス集中、サイレント障害、クレームの嵐<br>（束の中だけを切る） |
| 開始時の台詞 | 神社長「いよいよ本番のアプリじゃ！ ポイント、ネットスーパー、AI の晩ごはん、全部入れてくれ！ 予算はあまりないがな！」<br>ヘンディ先輩「今まで学んだことを全部使いましょう。合意、レビュー、報告、手順書。あなたならできます」<br>*The real app at last: points, online store, AI dinner ideas — on a small budget. Use everything you learned: agreement, review, reporting, runbook.* |
| 勝ったとき | 神社長「無事にリリースできた！ 君たちは本当のプロじゃ！」<br>ヘンディ先輩「おめでとう！ 明日からは、本物の現場で会いましょう」<br>*"A safe release! You are true professionals!" Congratulations — see you in the real workplace tomorrow.* |
| 負けたとき | ヘンディ先輩「あと少しでした。どこでバグが育ったか、図鑑でふり返ってみましょう」<br>*So close. Look back in the Lesson Book to see where the bugs grew.* |
| クリア後の教訓 | L01「システムは順番に作る」、L02「バグは早く見つけるほど安い」、L06「合意してから進む」、L10「変更は「変更管理」で受ける」、L15「レビューは一番安いバグとり」、L24「手順書どおりに。練習してから本番」、L27「作って終わりではない」、L29「悪い報告ほど早く」、L33「品質は、みんなで最初から作る」 |
| ボットの結果 | ていねい 勝率 63%・平均 12.1 ターン／ざつ 0%／とばす 9% |


---

## 8. 現場の教訓（図鑑）

- ひらくとき：① ガードが発動したとき（そのカードの `lesson`）② 失敗したとき（`LESSON_ON`：バグが育った、本番障害が出た、工程をこわされた、納期に遅れた、など）③ 章をクリアしたとき（章の `lessons` を全部）④ チュートリアルの決まったステップ。
- 1 試合の中で同じ教訓は 1 回だけ出す。出た教訓は図鑑に残る（集めた数／33）。
- 表示：金色の「教訓」カードがめくれて、タイトル → 本文（2〜3 文）→ 英語 1 行 → 出典。PC は右のパネル、VR は大きな板。試合は止まる（OK で続き）。設定で「試合中は短く（タイトルだけ）」にできる。


#### L01　システムは順番に作る（全体・図案 vmodel）

システム開発は、プログラミングだけではありません。決める → 設計する → 作る → 確かめる → 出す → 守る、の順番で進みます。前の工程が、次の工程の土台になります。

*Building a system is not only programming: decide, design, build, test, release, operate — each step is the base for the next.*

- 出典：オンボーディング講義「システム開発の流れ」（ウォーターフォール）
- ひらくとき：カード（設計）／第1章クリア、第9章クリア

#### L02　バグは早く見つけるほど安い（全体・図案 bug）

まちがいは、工程が進むほど直すのが大変になります。リリースのあとに直すと、設計のときの何十倍もかかると言われます。V字の左（設計）のまちがいは、同じ高さの右（テスト）で見つかります。だから、作ったらすぐレビューします。

*The later a defect is found, the more it costs — often many times more after release. Review right after you make something.*

- 出典：Boehm & Basili (2001)「リリース後の修正はしばしば100倍」／IPA 要件定義ガイド第2版 事例5（システムテストで約13倍）／V字モデル
- ひらくとき：カード（単体テスト、結合テスト、バグキング、本番障害、見なかったことにする、バグ）／できごと（firstBug、bugGrew、testFound、incident）／第1章クリア、第4章クリア、第6章クリア、第9章クリア

#### L03　要件定義が一番大事（要件定義・図案 clipboard）

「何を作るか」を決めないでコードを書くと、あとで全部作り直しになります。日本の調査では、予定より遅れた理由の半分以上が要件定義の問題でした。まず「なぜ作るのか」を確かめます。

*Coding before deciding "what to build" leads to a full redo. In a Japanese survey, over half of schedule delays came from requirements.*

- 出典：JUAS ソフトウェアメトリックス調査 2016（IPA 要件定義ガイド経由）／オンボーディング 要件定義
- ひらくとき：カード（要件定義、メテオフォール）／できごと（skipStage）／第2章クリア

#### L04　あいまいな言葉を、はっきりさせる（要件定義・図案 fog）

「使いやすく」「いい感じに」は、人によって意味が違います。「具体的には？」「なぜ必要ですか？」と聞きます。数字にできることは、数字にします。

*"Easy to use" means different things to different people. Ask "what exactly?" and "why?" Put numbers on what can be numbered.*

- 出典：オンボーディング 要求定義 Q8・Q9／IPA 原理原則17ヶ条 [12][13]
- ひらくとき：カード（「なぜ？」を聞く、ふんわり要望）／第2章クリア

#### L05　聞く前に準備する（要件定義・図案 checklist）

打ち合わせの前に、お客さまのことを調べ、質問のリストを作ります。5W1H（いつ・どこで・だれが・何を・なぜ・どのように）で聞くと、聞きもれが減ります。納期と予算は早めに聞きます。

*Before the meeting, research the client and prepare a question list. 5W1H prevents gaps. Ask about deadline and budget early.*

- 出典：オンボーディング 社内ミーティング Q1〜Q3／5W1H 質問ゲーム
- ひらくとき：カード（5W1H の質問、ヒアリングシート）／第2章クリア

#### L06　合意してから進む（要件定義・図案 stamp）

書類ができたら、お客さまに見せて「この内容で進めます」と OK（承認）をもらいます。最後に決める人はだれかも、最初に聞きます。合意のないまま次の工程に入ると、「そんなの頼んでない」になります。

*Show the document and get the OK. Ask early who makes the final decision. Without agreement you will hear "I never asked for that".*

- 出典：オンボーディング 要件定義 Q12／IPA 原理原則17ヶ条 [2][4]
- ひらくとき：カード（お客さまの担当者、合意のハンコ、隠れたステークホルダー、ちゃぶ台返し、鶴の一声、「聞いてないよ」）／できごと（stageBroken、approveBlocked）／第2章クリア、第9章クリア

#### L07　議事録で「言った言わない」を防ぐ（要件定義・図案 doc）

会議で決まったこと・宿題・担当・期限を書いて、その日のうちに送ります。口だけの約束は、あとで食い違います。日づけ・お金・数字は、くり返して確かめます。

*Write down decisions, to-dos, owners and due dates, and send them the same day. Repeat dates, money and numbers to confirm.*

- 出典：オンボーディング デュエル「議事録の確認」・おうむ返し／議事録の一般的な実務
- ひらくとき：カード（議事録、「言った・言わない」）／第2章クリア

#### L08　見積もりは積み上げて、予備を入れる（見積もり・図案 calculator）

IT の値段は、ほとんどが「人が働く時間（工数）」です。作業を細かく分けて「何人が何日」を足します。トラブルのために、予備の時間（バッファ）を入れます。その場で値段や日にちを約束しません。

*IT cost is mostly people's time. Break the work down, add it up, and include a buffer. Never promise a price or date on the spot.*

- 出典：オンボーディング 見積もり Q13・Q14／IPA 原理原則17ヶ条 [5][6]
- ひらくとき：カード（バッファ（予備の時間）、見積書（根拠つき）、無茶な納期、納期の短縮）／できごと（late）／第3章クリア

#### L09　値切りには根拠で答える（見積もり・図案 money）

「高い」と言われたら、数字の理由をていねいに説明します。予算に合わないときは、値段だけ下げずに「機能を減らす」提案をします。安すぎる約束は、あとでチームを苦しめます。

*When told "too expensive", explain the basis. If the budget does not fit, offer fewer features — not just a lower price.*

- 出典：オンボーディング 見積もり Q15／キックオフ Q5
- ひらくとき：カード（営業の山田さん、見積もりの根拠、強引な値切り、予算の削減）／第3章クリア

#### L10　変更は「変更管理」で受ける（管理・図案 tornado）

決めたあとの追加や変更は、すぐ作らず、時間とお金への影響を調べて相談します。急ぎでなければ「次のアップデート（フェーズ 2）」を提案します。合意した書類があるから、「これは変更です」と言えます。

*Do not build late changes right away: check the impact on time and cost, and discuss. The agreed document is what lets you say "this is a change".*

- 出典：オンボーディング テスト Q22・要件定義 Q10／変更管理の実務／IPA 原理原則17ヶ条 [16]／旭川医大の裁判の教訓
- ひらくとき：カード（変更管理、フェーズ 2 の提案、思いつきのアイデア、終わらない要件定義、突然の仕様変更、テスト中の機能追加）／できごと（changeNoBase）／第3章クリア、第6章クリア、第9章クリア

#### L11　設計の前に読み合わせ（基本設計・図案 book）

設計を始める前に、要件定義書を関係する人みんなで読みます。わからない所や、考えの違いを先に見つけるためです。「書いていないこと」は作られません。

*Before design, read the requirements together to find unclear points and differences first. What is not written will not be built.*

- 出典：@IT「システム開発プロジェクトの進め方 再入門」第4回／IPA 原理原則17ヶ条 [12]
- ひらくとき：カード（読み合わせ）／第4章クリア

#### L12　画面は絵で見せる（基本設計・図案 wireframe）

お客さまはプログラムや専門の図が読めません。「どこに何があるか」をかいた絵（ワイヤーフレーム）を見せます。作る前に見てもらえば、「思っていたのと違う」を防げます。

*Clients cannot read code or technical diagrams. Show a wireframe before building to prevent "not what I imagined".*

- 出典：オンボーディング 設計 Q16
- ひらくとき：カード（基本設計、SE（設計の人）、ワイヤーフレーム（画面の絵）、「思っていたのと違う」）／第4章クリア

#### L13　エラーのときも設計する（詳細設計・図案 flow）

アプリは、かならずエラーが起きます。うまく動くときだけでなく、「通信が切れたとき」などの例外も設計します。決めておかないと、トラブルのときアプリが止まります。

*Apps always hit errors. Design the exceptions too — like "when the connection drops" — or the app freezes in trouble.*

- 出典：オンボーディング 設計 Q18
- ひらくとき：カード（詳細設計）／第4章クリア

#### L14　勝手に決めない。案を持って聞く（基本設計・図案 puzzle）

決まっていないことを見つけたら、自分だけで決めません。「A 案と B 案、どちらにしますか」と、自分の案を持って聞きます。想像で作らず、質問します。

*When something is undecided, do not decide alone. Bring options: "Plan A or Plan B?" Ask instead of guessing.*

- 出典：オンボーディング 設計 Q17／IPA 原理原則17ヶ条 [12]
- ひらくとき：カード（A 案・B 案の提案）／第4章クリア

#### L15　レビューは一番安いバグとり（管理・図案 magnifier）

作ったら、まず自分で確かめます。次に仲間に見てもらいます。仲間のレビューで、まちがいの 約 6 割が見つかると言われます。レビューは人を責める場ではなく、一緒によくする場です。

*Check it yourself first, then ask a teammate. Peer review is said to find about 60% of defects. It is for improving together, not blaming.*

- 出典：Boehm & Basili (2001)／オンボーディング 開発 Q21・フィードバック方針
- ひらくとき：カード（ヘンディ先輩（PM）、レビュアー、セルフレビュー、ピアレビュー）／第1章クリア、第9章クリア

#### L16　みんなが読めるコードを書く（製造・図案 code）

コードは、あとで別の人が直します。チームのルール（規約）を守って、だれが読んでもわかるように書きます。「動いた」だけでは完成ではありません。レビューとテストまでやります。

*Someone else will fix your code later. Follow the team's rules so anyone can read it. "It runs" is not "done".*

- 出典：オンボーディング 開発 Q20・Q21
- ひらくとき：カード（製造（コーディング）、プログラマー、コーディング規約）／第5章クリア

#### L17　無理な計画は、チームをこわす（管理・図案 fire）

休みをなくして急いで作ると、まちがいが増えて、もっと遅れます。遅れているプロジェクトに人を足しても、すぐには速くなりません。無理だとわかったら、早く相談して、作る範囲を見直します。

*Rushing without rest makes more mistakes and more delay. Adding people to a late project does not speed it up at once. Re-plan the scope early.*

- 出典：オンボーディング 要件定義 Q10／ブルックスの法則／ヨードン『デスマーチ』
- ひらくとき：カード（残業でカバー、突貫作業、デスマーチ）／できごと（rush）／第5章クリア

#### L18　「あの人しかわからない」をなくす（製造・図案 people）

一人しか知らない仕事は、その人が休むと止まります。書いて残す、2 人で作る、自動テストを用意する。知識をチームのものにします。

*Work only one person understands stops when they are away. Write it down, pair up, automate tests — make knowledge the team's.*

- 出典：オンボーディング デュエル「ペアプログラミング」「CI/CD」／ドキュメント文化
- ひらくとき：カード（ペアプログラミング、CI（自動テスト）、属人化）／第5章クリア

#### L19　テストはリストで、もれなく（テスト・図案 checklist）

「たぶん大丈夫」はテストではありません。確かめることをリスト（テストケース）にして、正しい結果を先に書きます。バグを直したら、まわりももう一度確かめます。

*"Probably fine" is not testing. List the cases and write the expected results first. After a fix, test around it again.*

- 出典：オンボーディング テスト Q23・まなびの島／テストの一般的な実務
- ひらくとき：カード（テスト、再テスト、テスト仕様書）／第6章クリア

#### L20　バグの報告は具体的に（テスト・図案 bug）

「なんか変です」では、どこを直せばいいかわかりません。「何をしたとき、どうなったか」を書き、画面の写真もつけます。見つけたバグを隠してはいけません。

*"Something is odd" tells nobody what to fix. Write what you did and what happened, attach a screenshot, and never hide a bug.*

- 出典：オンボーディング テスト Q24
- ひらくとき：カード（テスター、バグ票（再現手順つき）、「なんか変です」）／第6章クリア

#### L21　受入テストの主役はお客さま（受入テスト・図案 handshake）

最後に、お客さまが「頼んだとおりか」「仕事で使えるか」を確かめます。何ができたら合格かは、テストの前に決めておきます。ここで見つかるのは要件のまちがいなので、直すのが一番高いです。

*At the end the client checks "is it what we asked for?" Agree on the pass criteria beforehand. Defects found here are requirement defects — the most expensive.*

- 出典：オンボーディング 受け入れテスト／IPA 高信頼化教訓 G2／V字モデル
- ひらくとき：カード（受入テスト）／第6章クリア

#### L22　目に見えないルールと、本番との違い（テスト・図案 server）

「何人が同時に使うか」「安全か」などの目に見えないルール（非機能要件）は、最初に決めます。あとから足すことはできません。テストの環境と本番の違いも、表にして確かめます。

*Decide invisible rules (performance, security) at the start — they cannot be bolted on later. List the differences between test and production too.*

- 出典：オンボーディング 要件定義 Q11／IPA 非機能要求グレード／IPA 高信頼化教訓 T6
- ひらくとき：カード（アクセス集中、環境のちがい）／第6章クリア

#### L23　リリースは「いつ」が大事（リリース・図案 rocket）

リリースの作業中は、エラーが起きやすいです。使う人が少ない時間を選びます。お客さまが一番多い時間や、人が集まれない時間は避けます。そして、リリースはゴールではなく運用の始まりです。

*Errors are likely during a release. Pick a time with few users and with people ready to respond. Release is the start of operation, not the goal.*

- 出典：オンボーディング リリース Q25／金曜リリースを避ける慣習（慣習であり法則ではない）
- ひらくとき：カード（リリース、金曜の夕方リリース）／第7章クリア

#### L24　手順書どおりに。練習してから本番（リリース・図案 scroll）

「だれが・何時に・どの順番で」を手順書に書き、本番と同じやり方でリハーサルします。手順書が最新版かどうかも確かめます。手順書にない操作は、本番ではしません。

*Write who/when/in what order in a runbook and rehearse like the real day. Check it is the latest version. Never do an unlisted operation in production.*

- 出典：オンボーディング リリース Q26／KDDI 通信障害 2022（古い手順書）／IPA 高信頼化教訓 G6／みずほ 2021（初めての作業）
- ひらくとき：カード（リハーサル、リリース手順書、古い手順書）／できごと（releaseFailed）／第7章クリア、第9章クリア

#### L25　本番の作業は 2 人で（リリース・図案 check）

作業する人と、確かめる人の 2 人でやります。指で差して、声に出して確認すると、押しまちがいは 約 6 分の 1 に減ります。数字 1 つの設定ミスが、大きなシステムを 1 日止めたこともあります。

*One person works, another checks. Pointing and calling cuts slips to about one sixth. One wrong setting once stopped a major system for a day.*

- 出典：鉄道総合技術研究所の実験 1994（厚生労働省 職場のあんぜんサイト）／東京証券取引所 2020（設定値の誤り）
- ひらくとき：カード（ダブルチェック（指差し確認）、設定値のミス）／第7章クリア

#### L26　元に戻す準備をしておく（リリース・図案 rollback）

本番で大きなエラーが出たら、あわてて直さず、すぐ連絡して、準備した計画どおり元に戻します（ロールバック）。予備の機械は、本当に切り替わるか試しておきます。戻す作業も本番の作業です。

*On a major error in production, do not patch in panic: report, then roll back as planned. Test that the backup really switches over. Rolling back is production work too.*

- 出典：オンボーディング リリース Q27／東京証券取引所 2020（切り替え失敗）／NTTドコモ 2021（切り戻し後の輻輳）／IPA 高信頼化教訓 T7
- ひらくとき：カード（切り戻し計画、切り替わらない予備機）／第7章クリア

#### L27　作って終わりではない（運用・保守・図案 monitor）

リリースのあとは、監視して、直して、よくしていく仕事が続きます。「少しだけこわれた」状態は気づきにくいので、監視で見つけられるようにします。データを見て改善を提案すると、次の仕事につながります。

*After release the work goes on: monitor, fix, improve. Half-broken states are hard to notice, so make monitoring catch them.*

- 出典：オンボーディング 保守運用 Q28〜Q30／IPA 高信頼化教訓 T11（サイレント障害）／ANA 2016
- ひらくとき：カード（運用・保守、改善提案、監視（アラート）、サイレント障害）／できごと（opsStart）／第8章クリア、第9章クリア

#### L28　まず復旧、次に原因、そして再発防止（運用・保守・図案 scroll）

障害のときは、まず使えるように戻します。次にログ（記録）を調べて原因をさがします。直すときは、テスト環境で確かめてから本番に入れます。「なぜ」をくり返して、人ではなくしくみを直します。

*In an incident: recover first, then find the cause in the logs. Verify the fix in a test environment before production. Fix the system, not the person.*

- 出典：オンボーディング 保守 Q28・Q29／ITIL（インシデント管理と問題管理）／なぜなぜ分析
- ひらくとき：カード（運用エンジニア、ログ分析、なぜなぜ分析）／第8章クリア

#### L29　悪い報告ほど早く（報連相・図案 speech）

遅れやバグを見つけたら、隠さずに、すぐ報告します。早ければ、みんなで直す時間があります。日本の大きな障害でも、「言うべきことを言わない」ことが原因の 1 つと言われました。

*When you find a delay or a bug, report at once. Early means there is time to fix it together. "Not saying what should be said" was named as a root cause of a major outage in Japan.*

- 出典：オンボーディング 報告・開発 Q19／金融庁 業務改善命令 2021-11-26
- ひらくとき：カード（藤木取締役、すぐ報告、抱え込み）／できごと（troubleGrew）／第1章クリア、第5章クリア、第8章クリア、第9章クリア

#### L30　相談は 30 分ルール（報連相・図案 clock）

一人で何時間も悩むと、チーム全体が遅れます。30 分考えてだめなら相談します。「何を調べたか」と「自分はこう思う」を一緒に伝えます。

*Struggling alone for hours delays the whole team. After 30 minutes, ask — and say what you tried and what you think.*

- 出典：オンボーディング 相談（30分ルール）
- ひらくとき：カード（新人エンジニア、ニャムさん（出向エンジニア）、相談（30 分ルール））／第5章クリア

#### L31　連絡は事実と数字で（報連相・図案 mail）

連絡は「いつ・何が・どうなる・何をしてほしいか」を書きます。「もうすぐ」ではなく「あと 15 分」。障害の最初の連絡は、完全でなくていいので早く出します。

*A notice says when, what, what happens, and what you need. Not "soon" but "in 15 minutes". The first incident report favors speed over completeness.*

- 出典：オンボーディング 連絡・障害の第一報
- ひらくとき：カード（連絡（事実を短く）、クレームの嵐）／第5章クリア、第8章クリア

#### L32　課題には担当と期限（管理・図案 flag）

決まっていないことや問題は、表に書いて、担当する人と期限をつけます。要望が多すぎるときは「一番大事なのはどれですか」と聞いて、順番を決めます。

*Write open issues in a list with an owner and a due date. When requests are too many, ask "which matters most?" and set priorities.*

- 出典：オンボーディング デュエル「課題管理表」・お客さまインタビュー第4話／課題管理の実務
- ひらくとき：カード（課題管理表、割り込み作業）／第5章クリア

#### L33　品質は、みんなで最初から作る（全体・図案 trophy）

よいシステムは、最後のテストだけでは作れません。聞く・書く・合意する・レビューする・報告する。毎日の小さな行動が、お客さまの信頼になります。失敗しても大丈夫。早く気づいて、次に生かしましょう。

*Quality is not made by the final test alone. Ask, write, agree, review, report — small daily actions become the client's trust.*

- 出典：このゲームのまとめ（オンボーディング全体／IPA 原理原則17ヶ条）
- ひらくとき：できごと（win、lose）／第9章クリア


### 8.1 出典（URL）

- IPA「超上流から攻める IT 化の原理原則 17 ヶ条」 https://www.ipa.go.jp/files/000005141.pdf
- IPA「ユーザのための要件定義ガイド 第 2 版」（2019。JUAS 2016 の調査、事例 5 の手戻りコスト） https://www.ipa.go.jp/files/000079352.pdf
- IPA「情報処理システム高信頼化教訓活用ガイドブック（IT サービス編）」（教訓 G2・G6・T6・T7・T11） https://www.ipa.go.jp/files/000051041.pdf
- IPA「非機能要求グレード」 https://www.ipa.go.jp/sec/softwareengineering/reports/20100416.html
- Boehm & Basili "Software Defect Reduction Top 10 List"（IEEE Computer, 2001） https://condor.depaul.edu/dmumaugh/readings/handouts/SE425/J81.pdf
- 厚生労働省 職場のあんぜんサイト「指差呼称」（鉄道総研 1994 の実験） https://anzeninfo.mhlw.go.jp/yougo/yougo72_1.html
- 金融庁 みずほ銀行・みずほ FG への業務改善命令（2021-11-26） https://www.fsa.go.jp/news/r3/ginkou/20211126/20211126.html
- JPX 調査委員会報告書（2020-11-30、arrowhead 障害） https://www2.jpx.co.jp/disc/86970/140120201130429759.pdf
- KDDI 総務省 WG 資料（2022 年 7 月の通信障害） https://www.soumu.go.jp/main_content/000842206.pdf
- 総務省 NTT ドコモ通信障害の資料（2021 年 10 月） https://www.soumu.go.jp/main_content/000777459.pdf
- @IT「明日から使えるシステム開発プロジェクトの進め方 再入門」 https://atmarkit.itmedia.co.jp/ait/series/1844/
- 社内オンボーディング教材（非公開）：講義「システム開発の流れ」、WATER FALL QUEST（全 30 問）、IT DUEL MONSTERS、まなびの島、報告・連絡・相談、質問ゲーム、5W1H ゲーム。**文は写さず、学びの中身を書き直した**。

数字の使い方の注意（調査メモより）：Boehm の「100 倍」は経験則なので、ゲーム内では「何十倍も」「しばしば」と書く。「金曜にリリースしない」は慣習であり法則ではない、と教訓 L23 の出典に書いた。実在の障害は、公開された事実を 1 文で教訓として書くだけにし、会社名はカード面には出さない（出典の欄と図鑑だけ）。

---

## 9. ふりかえりクイズ

- デュエルのあと（勝っても負けても）、その章の問題から **3 問**（seed で選ぶ。まちがえた問題は次回また出やすくする）。
- 3 択。答えたあと、正解・不正解どちらでも解説を出す（「おしい！」→ 解説 → 関連する教訓カードへのリンク）。全問正解で図鑑にシール。
- まちがえても罰はない（教材の方針：失敗も勉強）。


### 第 1 章　はじめての案件（5 問）

1. **バグを直すのが一番安いのは、いつですか。**
   - ✅ A. 作ったすぐあと（レビュー）
   - 　 B. テストのとき
   - 　 C. リリースのあと
   - 解説：バグは工程が進むたびに大きくなります。作ったすぐあとのレビューが一番安いです。（教訓 L02）
   - *When is a bug cheapest to fix? — Right after making it (review).*
2. **V字で、「設計」のバグを見つけるのはどの工程ですか。**
   - 　 A. リリース
   - ✅ B. 同じ高さの「テスト」
   - 　 C. どの工程でも見つからない
   - 解説：V字の左（設計）と右（テスト）は、同じ高さどうしがペアです。テストは設計書をもとに作ります。（教訓 L02）
   - *Which stage finds Design bugs on the V? — The Test at the same height.*
3. **バグを残したままリリースすると、どうなりますか。**
   - 　 A. 消える
   - 　 B. そのまま小さくなる
   - ✅ C. 「本番障害」になって信頼を減らす
   - 解説：リリースのあとのバグは、お客さまに直接迷惑をかけます。直すのも一番高くなります。（教訓 L02）
   - *What happens to bugs left at release? — They become production incidents.*
4. **「開発が少し遅れている」と気づきました。どうしますか。**
   - 　 A. 間に合うかもしれないので、だまっている
   - ✅ B. すぐ報告する
   - 　 C. テストの時間をなくす
   - 解説：悪い知らせほど早く言います。早ければ、みんなで直す時間があります。（教訓 L29）
   - *You notice a small delay. — Report it at once.*
5. **システム開発で、最初にすることは何ですか。**
   - ✅ A. 「何を作るか」を決める
   - 　 B. すぐコードを書く
   - 　 C. サーバーを買う
   - 解説：決めないで書き始めると、あとで全部作り直しになります。まず「何を作るか」です。（教訓 L01）
   - *What comes first in system development? — Decide what to build.*

### 第 2 章　ふんわりした要望（5 問）

1. **お客さまが「とにかく使いやすくして」と言いました。どうしますか。**
   - 　 A. 「わかりました」と言って、自分の好きなように作る
   - ✅ B. 「使いやすい」とは具体的に何か、聞く
   - 　 C. 「普通の画面にします」と答える
   - 解説：「使いやすい」も「普通」も、人によって違います。具体的に聞いて、イメージを合わせます。（教訓 L04）
   - *"Make it easy to use." — Ask what "easy to use" means exactly.*
2. **「AI の機能がほしい」と言われました。一番よい質問はどれですか。**
   - ✅ A. 「なぜ、その機能が必要ですか」
   - 　 B. 「AI は高いのでやめましょう」
   - 　 C. 「流行っているので入れましょう」
   - 解説：「なぜ」を聞くと本当の目的がわかり、もっと安くてよい方法を提案できます。すぐ断るのもよくありません。（教訓 L04）
   - *"We want an AI feature." — Ask why it is needed.*
3. **要件定義書ができました。次に何をしますか。**
   - 　 A. 返事を待たずに開発を始める
   - 　 B. エンジニアに渡して、あとは任せる
   - ✅ C. お客さまに見せて、承認（OK）をもらう
   - 解説：合意しないまま進むと「そんなの頼んでない」になります。承認された書類が、あとであなたを守ります。（教訓 L06）
   - *The requirements document is done. — Show it to the client and get approval.*
4. **「言った・言わない」を防ぐには、どうしますか。**
   - ✅ A. 議事録を書いて、その日に送る
   - 　 B. 大きな声で話す
   - 　 C. 全部覚えておく
   - 解説：決まったこと・宿題・担当・期限を書いて送ります。書いたものが残れば、あとで確かめられます。（教訓 L07）
   - *How to prevent "I never said that"? — Write minutes and send them the same day.*
5. **ゲームで「ふんわり要望」が場にいるまま要件定義を置くと、どうなりましたか。**
   - ✅ A. バグが多く入る
   - 　 B. 工数が増える
   - 　 C. 何も起きない
   - 解説：あいまいなまま決めると、まちがいが入ります。先に「なぜ？」を聞いて、はっきりさせてから決めます。（教訓 L03）
   - *Placing Requirements while "Vague Request" is in play? — More bugs get in.*

### 第 3 章　値切りと無茶な納期（5 問）

1. **まだ機能が決まっていないのに「全部でいくら？」と聞かれました。**
   - 　 A. 「100 万円で作ります」と約束する
   - ✅ B. 「機能のリストを作ってから計算します」と伝える
   - 　 C. お金の話はしないで帰る
   - 解説：何を作るか決まらないと、計算できません。その場で約束するのも、話からにげるのも、あとでトラブルになります。（教訓 L08）
   - *"How much in total?" before features are fixed. — "We will calculate after listing the features."*
2. **スケジュールを決めるとき、大切なことは何ですか。**
   - 　 A. お客さまが言った日にそのまま合わせる
   - ✅ B. 予備の時間（バッファ）を入れる
   - 　 C. テストの時間を入れない
   - 解説：開発にトラブルはつきものです。バッファを入れ、「何のための予備か」を説明できるようにします。（教訓 L08）
   - *What matters when setting a schedule? — Include a buffer.*
3. **見積もりを出したら「少し高いな」と言われました。**
   - 　 A. すぐ半額にする
   - 　 B. 怒る
   - ✅ C. 理由を説明し、合わないなら機能を減らす提案をする
   - 解説：理由なく安くすると、信用も利益もなくなります。お金を下げるなら、作る範囲も一緒に下げます。（教訓 L09）
   - *"A bit expensive." — Explain the basis; if it does not fit, propose fewer features.*
4. **IT の開発の値段は、おもに何で決まりますか。**
   - ✅ A. 人が働く時間（工数）
   - 　 B. パソコンの値段
   - 　 C. 営業の人のカン
   - 解説：「何人が何日働くか」を機能ごとに計算して足します。カンで決めてはいけません。（教訓 L08）
   - *What mainly decides the cost of IT development? — People's working time (effort).*
5. **要望が多すぎて、予算と納期に合いません。**
   - 　 A. 休みをなくして全部作る
   - ✅ B. 一番大事な機能を選び、残りはフェーズ 2 にする
   - 　 C. 納期を勝手にのばす
   - 解説：作る範囲（スコープ）をお客さまと一緒に決めるのが、リーダーの仕事です。（教訓 L10）
   - *Too many requests for the budget and deadline. — Pick the most important; the rest goes to Phase 2.*

### 第 4 章　「思っていたのと違う」（6 問）

1. **お客さまにアプリのイメージを伝えるには、何を見せますか。**
   - 　 A. データベースの図
   - ✅ B. 画面の絵（ワイヤーフレーム）
   - 　 C. プログラムのコード
   - 解説：お客さまは専門の図が読めません。相手がわかる形で伝えます。（教訓 L12）
   - *How do you show the client the app image? — A picture of the screens (wireframe).*
2. **設計の途中で、決まっていないルールを見つけました。**
   - 　 A. 自分で決めて書く
   - ✅ B. 「A 案と B 案、どちらにしますか」と聞く
   - 　 C. 気づかなかったことにする
   - 解説：勝手に決めず、自分の案を持って確認します。それがプロの提案です。（教訓 L14）
   - *You find an undecided rule during design. — Ask: "Plan A or Plan B?"*
3. **「カートに入れる」機能の設計で、忘れてはいけないものは？**
   - 　 A. きれいなアニメーション
   - ✅ B. 通信が切れたときなど、エラーのときの動き
   - 　 C. ボタンの色
   - 解説：うまく動くときだけの設計書は、半分しか書いていません。例外も決めます。（教訓 L13）
   - *What must not be forgotten in design? — Behaviour on errors (exceptions).*
4. **本物の V字で、「基本設計」とペアになるテストはどれですか。**
   - 　 A. 単体テスト
   - ✅ B. 結合テスト
   - 　 C. 受入テスト
   - 解説：詳細設計⇔単体テスト、基本設計⇔結合テスト、要件定義⇔受入テスト。同じ高さがペアです。（教訓 L02）
   - *Which test pairs with Basic Design? — Integration Test.*
5. **要件定義のバグを、受入テストまで放っておくと、大きさはどうなりましたか。**
   - 　 A. 1 のまま
   - 　 B. 2 になる
   - ✅ C. 8 になる
   - 解説：工程が進むたびに 2 倍です。V字の上のほうのバグほど、テストで見つかるのが遅くなります。だからレビューします。（教訓 L02）
   - *How big does a Requirements bug get if left until Acceptance Test? — 8.*
6. **設計を始める前にすると、よいことは何ですか。**
   - ✅ A. 要件定義書をみんなで読み合わせる
   - 　 B. すぐコードを書いてみる
   - 　 C. 一人で全部決める
   - 解説：読み合わせで、わからない所や考えの違いを先に見つけます。（教訓 L11）
   - *What is good to do before design starts? — Read the requirements together.*

### 第 5 章　デスマーチの影（5 問）

1. **エラーの原因がわかりません。一番よいのはどれですか。**
   - 　 A. 3 日間、一人で考える
   - ✅ B. 30 分考えてだめなら、調べたことを伝えて相談する
   - 　 C. 何も考えず、すぐ聞く
   - 解説：一人で悩みすぎるとチームが遅れます。でも、まず自分で調べて、「何をしたか」を伝えます。（教訓 L30）
   - *You cannot find the cause of an error. — Think 30 minutes, then ask and say what you tried.*
2. **ゲームの「抱え込み」は、放っておくとどうなりましたか。**
   - 　 A. 自然に消える
   - ✅ B. 毎ターン大きくなる
   - 　 C. 味方になる
   - 解説：言わない問題は、時間がたつほど大きくなります。小さいうちに報告すれば、すぐ解決できます。（教訓 L29）
   - *What happened to "Hidden Delay" when left alone? — It grew every turn.*
3. **よい「連絡」はどれですか。**
   - 　 A. 「すみません！ すごくあせっています…」
   - 　 B. 「もうすぐ直ります。がんばります」
   - ✅ C. 「ログイン画面でエラーが出ています。原因は調査中で、あと 30 分かかる見込みです」
   - 解説：連絡は気持ちではなく、事実と数字です。何が起きて、いつ直るかがわかれば、相手はすぐ動けます。（教訓 L31）
   - *Which is a good notice? — Facts and numbers: what happened, the cause status, and the estimate.*
4. **チームでコードを書くとき、大切なことは？**
   - 　 A. 自分だけの書き方で書く
   - ✅ B. だれが読んでもわかるように、ルールを守って書く
   - 　 C. できるだけ短く書く
   - 解説：コードはあとで別の人が直します。理由（なぜ）をコメントに残すのもよい方法です。（教訓 L16）
   - *What matters when coding in a team? — Follow the rules so anyone can read it.*
5. **開発が遅れています。やってはいけないのはどれですか。**
   - 　 A. チームで話し合い、お客さまにも正直に報告する
   - ✅ B. テストの時間をなくす
   - 　 C. 上司に相談して、予定を見直す
   - 解説：テストを削ると、バグがそのままお客さまに届きます。「残業でカバー」も、バグとつかれを増やします。（教訓 L17）
   - *Development is late. What must you NOT do? — Cut the testing time.*

### 第 6 章　バグキングの城（6 問）

1. **正しいテストのやり方はどれですか。**
   - 　 A. 1 回動かして、動いたら終わり
   - ✅ B. チェックするリスト（テストケース）を作り、順番に確かめる
   - 　 C. お客さまに配って見つけてもらう
   - 解説：リストを見ながら確かめると、もれがなくなります。バグのまま公開するのは、プロの仕事ではありません。（教訓 L19）
   - *Which is the right way to test? — Make a list of test cases and check them in order.*
2. **テスト中にバグを見つけました。どう報告しますか。**
   - 　 A. 「なんか変です」と言う
   - 　 B. 見なかったことにする
   - ✅ C. 「何をしたとき、どうなったか」を書き、画面の写真をつける
   - 解説：くわしく書くと、直す人がすぐ原因を見つけられます。隠すと、あとで大きな問題になります。（教訓 L20）
   - *You found a bug while testing. — Write what you did and what happened, with a screenshot.*
3. **テスト中に「このボタンも追加して」と言われました。**
   - 　 A. すぐ追加する
   - ✅ B. 「急ぎですか」と聞き、急ぎでなければ次のアップデートを提案する
   - 　 C. 「できません」とだけ言う
   - 解説：テスト中の変更は新しいバグのもとです。ただ断るのではなく、時間とお金への影響を見せて相談します。（教訓 L10）
   - *"Add this button" during testing. — Ask if it is urgent; if not, propose the next update.*
4. **バグを 1 つ直しました。次にすることは？**
   - 　 A. 直した所だけ確かめる
   - ✅ B. 直した所と、そのまわりをもう一度テストする
   - 　 C. 何もしない
   - 解説：1 つ直すと、ほかがこわれることがあります。だから「再テスト」をします。（教訓 L19）
   - *You fixed one bug. Next? — Test the fix and the area around it again.*
5. **ゲームの「変更管理」を使うには、何が必要でしたか。**
   - ✅ A. 承認ずみの工程
   - 　 B. なかま 3 人
   - 　 C. 信頼 20
   - 解説：合意した書類（ベースライン）があるから、「これは変更です」と言えます。合意が先、変更管理があとです。（教訓 L10）
   - *What did "Change Control" need in the game? — An approved stage.*
6. **受入テストで、確かめる主役はだれですか。**
   - 　 A. プログラマー
   - ✅ B. お客さま
   - 　 C. テスター
   - 解説：「頼んだものか」「仕事で使えるか」は、お客さまにしか決められません。作る側は手伝います。（教訓 L21）
   - *Who is the main actor in the Acceptance Test? — The client.*

### 第 7 章　本番の夜（5 問）

1. **リリースの作業は、いつやるのがよいですか。**
   - 　 A. お客さまが一番多い土曜の夕方
   - ✅ B. 使う人が少なく、すぐ対応できる時間
   - 　 C. いつでもよい
   - 解説：リリース中はエラーが起きやすいので、影響が一番小さい時間を選びます。（教訓 L23）
   - *When is a good time to release? — When few people use it and the team can respond.*
2. **リリースの日にあわてないために、準備するものは？**
   - ✅ A. 「だれが・何時に・どの順番で」を書いた手順書
   - 　 B. 言い訳のメール
   - 　 C. きれいに印刷した設計図
   - 解説：手順書を見ながら作業します。最新版かどうかも確かめます。手順書にないことは本番ではしません。（教訓 L24）
   - *What do you prepare for release day? — A runbook: who, when, in what order.*
3. **リリースの作業中に、大きなエラーが起きました。**
   - 　 A. 本番をその場で直そうとする
   - ✅ B. すぐ連絡して、準備した計画どおり元に戻す
   - 　 C. 見なかったことにして帰る
   - 解説：あせって本番をさわると、もっと大きなエラーになります。元に戻す準備（ロールバック）が大切です。（教訓 L26）
   - *A serious error during release. — Report at once and roll back as planned.*
4. **本番の作業で、ミスを減らす方法はどれですか。**
   - 　 A. 一人で、できるだけ速くやる
   - ✅ B. 2 人でやり、指で差して声に出して確かめる
   - 　 C. 夜中に一人でこっそりやる
   - 解説：指差し確認で、押しまちがいは 約 6 分の 1 になったという実験があります。（教訓 L25）
   - *How do you reduce mistakes in production work? — Two people; point and say it aloud.*
5. **「予備の機械があるから安心」。これは正しいですか。**
   - 　 A. 正しい。あれば安心
   - ✅ B. 本当に切り替わるか、試してはじめて安心
   - 　 C. 予備はいらない
   - 解説：予備に切り替わらなくて、1 日止まった大きなシステムもあります。試して、手順も決めておきます。（教訓 L26）
   - *"We have a backup machine, so we are safe." — Only after you test that it really switches.*

### 第 8 章　運用はつづく（5 問）

1. **リリースのあと「たまにポイントがつかない」と連絡が来ました。まず何をしますか。**
   - 　 A. 「気のせいです」と言う
   - 　 B. プログラムを全部書き直す
   - ✅ C. ログ（記録）を調べる
   - 解説：原因がわからないのに全部直すのは無駄です。まずログで、何が起きたかを確かめます。（教訓 L28）
   - *"Sometimes points are not added." First? — Check the logs.*
2. **バグの原因がわかりました。どこで直しますか。**
   - 　 A. 動いている本番を直接書きかえる
   - ✅ B. 自分の PC で直し、テスト環境で確かめてから本番に入れる
   - 　 C. 半年あとで直す
   - 解説：本番を直接さわるのは禁止です。かならずテスト環境で安全を確かめます。（教訓 L28）
   - *Where do you fix the bug? — Locally, verify in the test environment, then production.*
3. **ゲームの「サイレント障害」は、なぜこわいのですか。**
   - ✅ A. 最初は小さくて気づきにくく、放っておくと急に大きくなるから
   - 　 B. 最初から一番強いから
   - 　 C. 音がうるさいから
   - 解説：「少しだけこわれた」状態は見つけにくいです。だから監視して、早く気づけるようにします。（教訓 L27）
   - *Why is "Silent Failure" scary? — It starts small and unnoticed, then grows fast.*
4. **障害が起きたとき、最初の連絡で一番大事なことは？**
   - ✅ A. だれに・何が起きているか（事実）を早く伝える
   - 　 B. 完全に原因がわかるまで待つ
   - 　 C. 長いおわびの文を書く
   - 解説：最初の連絡は、完全でなくてよいので早く。わかっていること・わからないこと・次の連絡の時間を伝えます。（教訓 L31）
   - *What matters most in the first incident report? — Quickly state who is affected and what is happening.*
5. **アプリを使う人が増えてきました。次にするとよいことは？**
   - 　 A. 「このままで大丈夫」と言って終わる
   - ✅ B. データを見て、改善やサーバーの強化を提案する
   - 　 C. 別のアプリを最初から作り直す
   - 解説：システムは育てていくものです。データを見た提案が、次の仕事と信頼につながります。（教訓 L27）
   - *More people are using the app. Next? — Look at the data and propose improvements.*

### 第 9 章　通しプロジェクト：ゴッドマート・アプリ（6 問）

1. **予定より遅れたプロジェクトで、原因として一番多かったのは？（日本の調査）**
   - ✅ A. 要件定義の問題
   - 　 B. パソコンの故障
   - 　 C. 天気
   - 解説：遅れの理由の半分以上が要件定義の問題でした。最初にしっかり決めて、合意します。（教訓 L03）
   - *The most common cause of schedule delays (Japanese survey)? — Requirements problems.*
2. **V字モデルの正しいペアはどれですか。**
   - 　 A. 要件定義 ⇔ 単体テスト
   - ✅ B. 詳細設計 ⇔ 単体テスト
   - 　 C. 基本設計 ⇔ 受入テスト
   - 解説：詳細設計⇔単体、基本設計⇔結合、要件定義⇔受入。同じ高さがペアです。（教訓 L02）
   - *Which is a correct pair in the V-model? — Detailed Design ⇔ Unit Test.*
3. **日本の大きなシステム障害で、原因の 1 つとされた姿勢は？**
   - 　 A. 質問が多すぎる
   - ✅ B. 言うべきことを言わず、言われたことしかしない
   - 　 C. 報告が早すぎる
   - 解説：おかしいと思ったら、立場に関係なく声を上げます。それがチームとお客さまを守ります。（教訓 L29）
   - *An attitude named as a root cause of a major outage in Japan? — Not saying what should be said.*
4. **合意のあとで「やっぱりここを変えて」と言われました。**
   - 　 A. だまって全部受ける
   - ✅ B. 時間とお金への影響を調べて、相談して決める
   - 　 C. 無視する
   - 解説：これが「変更管理」です。変更は悪いことではありません。影響を見せて、一緒に決めます。（教訓 L10）
   - *"Change this after all" after agreement. — Check the impact on time and cost, then decide together.*
5. **リリースしました。プロジェクトは終わりですか。**
   - 　 A. 終わり。もう何もしない
   - ✅ B. いいえ。監視・障害対応・改善の運用が続く
   - 　 C. 次の日に全部消す
   - 解説：システムは「作って終わり」ではありません。使う人が安心して使いつづけられるように守ります。（教訓 L27）
   - *You released. Is the project over? — No: operation continues (monitoring, incidents, improvement).*
6. **品質のよいシステムを作るために、一番大切な考え方は？**
   - 　 A. 最後のテストでがんばればよい
   - ✅ B. 最初の工程から、合意・レビュー・報告を積み重ねる
   - 　 C. バグは出てから考える
   - 解説：品質は最後に足すものではなく、最初から少しずつ作るものです。（教訓 L33）
   - *The key idea for quality? — Build it from the first stage: agreement, review, reporting.*


---

## 10. 画面と操作（PC／VR）

### 10.1 机の上の配置（PC・VR 共通の 3D）

```
                        （相手：机の向こうに立つ像。お客さま／化身）
        相手の手札（うら・枚数）          相手の山札
   ┌─ たくらみ場（2）─┐   ┌──── トラブル場（3）────┐
   │  [裏]   [裏]     │   │  [トラブル][トラブル][  ]  │
   └──────────────────┘   └────────────────────────────┘
  ───────────────────── 机のまん中 ─────────────────────
   要件定義 ●┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄● 受入テスト   → [リリース] → (運用)
      基本設計 ●┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄● 結合テスト
         詳細設計 ●┄┄┄┄┄┄┄┄┄┄┄┄● 単体テスト          ← V字（まん中に大きく）
                      ● 製造
   ┌─ チーム（3）─────┐                ┌─ そなえ場（3）──┐
   │ [なかま][なかま][ ]│                │ [裏][資料][  ]   │
   └───────────────────┘                └──────────────────┘
   工程デッキ（左手前に、次の工程が一番上）      山札・捨て札（右手前）
                 ～ 手札（手前に扇形）～
   HUD： 信頼 ♥20   工数 ◆3/3   納期 ⌛あと 5 ターン   運用 ○○
```

- **V字**：マスは机に描いた光る台座。左うでと右うでの **同じ高さのマスを点線で結ぶ**（ペア）。テストを置くと、点線を光が走って、向かいの工程のバグが「？」から赤い虫に変わる（＝見つかった）。
- **バグ**：工程カードの上に乗る小さな赤い虫（トークン）。見つかっていないものは半透明の卵＋「？」。大きさ 1・2・4・8 で **体の大きさが変わり**、数字を背中に出す。工程を置いた瞬間に「ぷくっ」と 2 倍にふくらむ（音も 1 オクターブ下がる）。8 は炎をまとう。
- **承認**：工程カードの角に赤い丸の「承認」ハンコ。相手のあいまいカードが当たると、ハンコが光ってはね返す。
- **トラブル**：カードの上に立体の像（タイプの図案）。圧力の数字を頭の上に。NEW は黄色い「NEW!」の札。育つトラブルは攻撃のたびに像が大きくなる。
- **たくらみ**：うら向きのカードが暗く光る。発動のとき、めくれて赤い稲妻。
- **納期**：砂時計。残り 2 ターンで赤くなる。過ぎると割れて、毎ターン信頼にひびが入る演出。
- **HUD**：信頼（ハート＋数字のバー）、工数（宝石の数）、納期（砂時計＋「あと n ターン」）、運用（リリース後だけ、残りターンの丸）。PC は画面の上、VR は机の手前のふちに立つ小さな板。

### 10.2 PC モード

- 画面：左 70% が 3D の机（ななめ上から）。右 30% が HTML のパネル（ふりがな付き）。
  - パネル上：選んだカードの拡大（名前・効果・フレーバー・英語）。
  - パネル中：**今できること** のボタン（下の表）。
  - パネル下：ログ（「神社長が『ふんわり要望』を出した」など、1 行ずつ。ふりがな付き）。
- 操作（マウス／タッチ）：カードや場所を **1 回押して選ぶ → 光った所を押す**。ドラッグでも置ける。

| 選んだもの | 出るボタン／光る所 |
|---|---|
| 工程デッキの工程 | V字の置けるマスが光る（次のマス＝青。とばすマス＝黄色＋「とばすとバグ +2」の注意） |
| 手札のなかま・資料・ガード | チーム／そなえ場の空きが光る。「出す（コスト n）」 |
| 手札のわざ | 対象がいるものは対象が光る。「使う（コスト n）」 |
| チームのなかま（対応できる） | 相手のトラブルが光る。下がる圧力の予告（「3 → 1」）を出す |
| V字の新しい工程 | 「レビュー（工数 1）」「承認（工数 1）」 |
| V字の古い工程 | 「承認（工数 1）」 |
| 見つかっているバグ | 「直す（工数 n）」 |
| 何も選んでいない | 「ターン終了」。まだできることがあるときは「まだ工数が 2 あります」と小さく出す |

- わりこみ：相手の行動で条件に合うガードがあると、試合が止まり、ガードが浮き上がって光る。「**発動する**／しない」。3 秒の自動選択はしない（学習者が読む時間を守る）。
- 色だけに頼らない（形・文字でも区別）。ふりがな ON/OFF、英語の補助 ON/OFF、演出の速さ（ふつう／はやい）、音量。

### 10.3 VR モード（Meta Quest）

- 座っても立っても机に向かう。机の高さは最初に「机を合わせる」ボタンで調整。
- **手札**：左手（設定で右手）の前に扇形に浮かぶ。5 枚を超えると 2 段。レーザーで指すとカードが少し前に出て、**読める大きさの板**（幅 0.6 m、カード名＋効果文 2〜3 行＋英語 1 行）が手札の上に出る。
- **選ぶ**：レーザーで指して引き金。**つかむ**：グリップでカードをつかみ、V字のマスや場の上で離すと置ける（マスに近づくと吸いつく）。引き金 2 回（選ぶ→置き場所）でも同じことができる。
- **ボタン**：レビュー・承認・直す・ターン終了は、選んだものの横に出る **丸い大きなボタン**（直径 8 cm）。ターン終了は机の右のふちに常にある砂時計のボタン。
- **相手**：机の向こう 1.6 m に、章の `enemy.art` の図案で作った立体の像（お客さま＝王冠の人形、化身＝炎・虫・サーバーのゆうれい）。台詞は像の上の吹き出しの板。
- **解説の板**：教訓・クイズ・チュートリアルは、机の左奥の大きな板（1.2 m × 0.9 m、`Board`）。文は 2〜3 行。ボタンは板の下に大きく。
- **文字量**：カード面の効果文は平均 24 字・最大 36 字（検査ずみ）。教訓の本文は 150 字以内。
- 酔い対策：カメラは動かさない。演出はカード・像・光だけが動く。

### 10.4 演出（カットイン）

| できごと | 演出 |
|---|---|
| 工程を置く | カードが光り、**工程の立体の像** が台座からせり上がる（要件定義＝クリップボード、製造＝`</>`、テスト＝フラスコ、リリース＝ロケット）。画面に帯「**着工！ 要件定義**」。V字の線がそのマスまで光る |
| バグが入る／育つ | 赤い虫がポトッと落ちる／ぷくっと 2 倍。大きさ 4 以上で警告音 |
| レビュー・直す | 虫めがねの光が虫を消す。「レビュー！ コスト 1」／「修正！ コスト 4」と数字を見せる（差が目に入る） |
| テストが見つける | V字の点線を光が走る →「？」が虫に変わる。帯「**発見！ 単体テスト ⇔ 詳細設計・製造**」 |
| なかまを出す | 人の像が立ち上がる。対応は光の矢がトラブルへ飛ぶ |
| トラブルが出る | 紫のけむりから像。攻撃は机ごしに衝撃波 → 信頼のハートが欠ける |
| わりこみ | 時間が止まる（色が暗くなる）→ ふせたカードがめくれ、画面を横切る **カットインの帯**（カードの絵＋名前＋「そなえ発動！」）。相手のたくらみは赤い帯「たくらみ発動！」。4 枚まで積み重なり、上から順に割れていく |
| 承認ではね返す | ハンコが光り「合意ずみです！」 |
| リリース | ロケットが上がる。バグが残っていれば、虫が炎の「本番障害」に変わって相手の場へ飛ぶ |
| 勝ち／負け | 「PROJECT COMPLETE／プロジェクト成功！」→ 評価（★）→ 教訓 → クイズ。負けは「もう一度」ボタンを大きく。責める言葉は出さない |

---

## 11. 実装メモ

### 11.1 状態の持ち方（小さく・決定的に）

```js
state = {
  chapter, rules,            // 章と数値（DEFAULT_RULES に章の rules を重ねたもの）
  seed, rngState,            // mulberry32 など。乱数は「山札を切る」「手札を捨てる」だけ
  turn, side,                // 1.. / 'p' | 'e'
  over,                      // null | 'win' | 'lose'
  trust, effort, effortNext, // effortNext = 次のターンの工数に足す数（予算の削減など）
  deadline, late,            // late = これまでに遅れたターン数
  track, pair,               // TRACKS[章.track] の stages / pair
  ptr,                       // 次に置く工程の番号
  placed: [                  // 番号 = track の番号。置いていない所は undefined
    { id, idx, approved, skipped, bugs: [{ size, found }] } ],
  released, opsLeft, releaseTurn,
  stageUsed, extraStage, extraBug, reviewed,   // ターンごとの回数
  p: { deck, hand, discard,
       team: [{ id, acted, tired, buff }],     // tired: 0 | 1 | 2（ターン始めに −1）
       back: [{ id, down }] },                 // down=true はふせたガード
  e: { deck, hand, discard, ap,
       field: [{ uid, id, pressure, isNew, fresh }],
       plots: [{ id }] },
  seenLessons: [],           // この試合で出した教訓
}
```

- すべての行動は `apply(state, action) → events[]` の形にする（`action` 例：`{type:'place', idx}`、`{type:'play', card, target, replace}`、`{type:'review'}`、`{type:'approve', idx}`、`{type:'fix', idx, bug}`、`{type:'attack', unit, target}`、`{type:'endTurn'}`、`{type:'guard', use:true|false}`）。画面は `events`（「バグが育った」「わりこみ」など）を順番に再生するだけにすると、PC と VR で同じロジックを使え、テストも書きやすい。
- わりこみでプレイヤーの返事を待つ所だけ非同期になる。エンジン側は「返事待ち」の状態（`state.pending = { kind:'guard', options:[…] }`）を持ち、`{type:'guard'}` の行動で続きから解決する形にすると、決定的なまま止められる。
- 効果の実行は `run(effect, ctx)` の 1 つの switch（21 個）。`ctx = { side, card, self, target, trig }`。

### 11.2 設計のときに使った参照エンジン

- 設計の確認のために、上のルールを全部実装した小さなエンジン（`engine.mjs` 約 300 行。**ルールのあいまいな所はこのエンジンの動きが正**）、CPU、プレイヤー役のボット（`bot.mjs`）、チュートリアルの自動実行（`tut.mjs`）、データの検査（`validate.mjs`）、決定性の検査（`det.mjs`）を node で書いた。本体の `tools/sim.mjs` を作るときの土台にできる（場所は引き渡しのメモに書く）。**全カードの効果がこの 21 個の部品だけで動くこと**、全データが import できること、ふりがなの付け忘れがないことは、この道具で確かめた。

### 11.3 テストで確かめるべきこと

1. **データ**：全カードの `op`・`on`・`trigger`・条件が一覧にある／`art` の図案が実装にある／`lesson` の id がある／章のデッキのカードがある・解禁ずみ／漢字にふりがなの付け忘れがない／カードの文が 46 字以内。
2. **バグの決まり**：工程を置くと、見つかっていないバグだけが 2 倍、最大 8／見つかったバグは育たない／テストはペアの工程だけを見つける／穴のバグは見つからない／リリースで全部が本番障害になる（場がいっぱいなら直接ダメージ）。
3. **承認**：あいまいのイベントをはね返す／`force` は通る／ちゃぶ台返しは承認で止まる／変更管理は承認がないと発動できない。
4. **わりこみ**：4 枚の連続（仕様変更 → 変更管理 → 鶴の一声 → ダブルチェック）が正しく解決する／無効にされたリリースは `ptr` が進まず、次のターンに置ける／`damage:4` は 3 では発動しない。
5. **ターン**：工数の計算（値切り・見積書・予算の削減・残業）／納期遅れが −2、−3、−4／NEW は 1 ターンだけ／とつぜんは出たターンに攻撃／つかれの回復。
6. **手戻り**：`breakStage` のあと `ptr` が戻り、同じ工程を置き直せる。置き直すとまたバグが入る。
7. **チュートリアル**：`tutorial.js` の `want` を順番に実行すると、全部合法で、5 ターンで勝つ。
8. **決定性**：同じ seed・同じ行動の列なら、同じ結果になる。
9. **バランス**：ボット同士で各章 300 試合以上回し、12 章の表の範囲に入っていること（数値を変えたら必ず回す）。
10. **終わること**：どの章も 20 ターン以内に必ず終わる。プレイヤーが何もしなくても止まらない。

### 11.4 落とし穴（気をつける点）

- 「**新しい工程**」は、レビュー・バグの効果では「つくる工程」だけを見る。こわす効果ではテストもふくむ。ここを取り違えると、テストのあとでレビューが効かなくなる。
- **リリースの順番**：手順書（`on:'release'`）→ たくらみのわりこみ → 育つ → 置く → 信頼 +2 → バグが本番障害に。たくらみで信頼が 0 になったら、その場で負け。
- **本番障害は NEW ではない**（「すぐ報告」で消せない）。リリースしたターンのうちに、まだ対応していないなかまで叩ける。
- `effort` の op は、だれのターンかで行き先が変わる（今の工数／次のターン）。
- `damage:N` のわりこみは、トラブルの攻撃・イベント・たくらみ・本番障害のあふれ、のどれでも 1 回分のダメージに対して起きる。納期遅れは対象外。
- ガードは「ふせたとき」にコストを払う。発動はただ。相手のたくらみも同じ。
- 相手のトラブル場がいっぱいのとき、CPU はトラブルを手札に持ったままにする。
- 手札を捨てる効果（クレームの嵐）はランダム。ここだけプレイヤー側で乱数を使う。
- 第 8 章は `startReleased`：V字は全部置かれ（全部承認ずみ・バグなし）、最初から本番障害と「サイレント障害」がいる。工程の操作はない。
- 文字列はすべて `{漢字|かんじ}` と `**強調**` 入り。カード面は `text.js` の `fit` でおさまる長さにしてある。

---

## 12. バランス

### 12.1 基本の数値

| 項目 | 数値 |
|---|---|
| 信頼 | 20（最大 20） |
| 最初の手札／ターンのドロー／手札の上限 | 4 枚／1 枚（1 ターン目も）／7 枚 |
| 工数 | 1 ターン目 3 → 毎ターン +1 → 上限 6（3・4・5・6・6…） |
| 工程のコスト | 要件定義 2・基本設計 2・詳細設計 2・設計 2・製造 3・各テスト 2・リリース 1（本物の V の合計 16） |
| 工程に入るバグ | 要件定義 1・基本設計 1・詳細設計 1・設計 1・製造 3（本物の V の合計 6） |
| レビュー／承認 | 工数 1（レビューは 1 ターン 1 回）／工数 1 |
| バグ | 大きさ 1→2→4→8。直すコスト＝大きさ。とばした設計工程 1 つにつき 2 個 |
| 納期 | 小さな V：6／中くらいの V：9／本物の V：11（最終章 12）。遅れは −2、−3、−4… |
| 運用のターン | 1（第 7 章 2、第 8 章 6、第 9 章 3） |
| 相手の行動力 | 1 ターン目 2 → 2 ターンごとに +1 → 上限 4（第 1・2 章は 1 から。章で変わる） |
| 相手のドロー | 毎ターン 1 枚、5 ターン目から 2 枚（章で変わる） |
| プレイヤーの山札 | 24〜30 枚（第 1 章 16 枚）。同じカードは 3 枚まで |
| 1 試合の長さ | 小さな V：5 ターン（約 4〜5 分、案内つき）／中：7〜8 ターン（約 7〜9 分）／本物：10〜12 ターン（約 9〜12 分） |

### 12.2 シミュレーションの結果（各章 1000 試合、seed 1〜1000）

プレイヤー役のボット 3 種類：
- **ていねい**：毎ターン工程を置く。置いたらレビュー（カード→ボタン）と承認。見つかったバグは安い順に直す。トラブルは NEW のうちに報告、なかまで対応。ガード・資料を置く。最適ではない（人間の「ふつうに上手な人」くらい）。
- **ざつ**：レビュー・承認・修正・ガードを一切しない。工程となかまだけ。「残業」「突貫」は使う。
- **とばす**：最初のターンに「製造」まで工程をとばす。あとは「ていねい」と同じ。

| 章 | ボット | 勝率 | 平均ターン | 勝ったときの信頼 | リリースしたターン | 本番障害（大きさの合計） | 納期遅れ（ターン） | 修正に使った工数 | 受けたダメージ | そなえの発動 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | ていねい | **100%** | 5.0 | 20.0 | 4.0 | 0.0 | 0.00 | 0.0 | 0.0 | 0.0 |
| 1 | ざつ | **100%** | 5.0 | 6.0 | 4.0 | 14.0 | 0.00 | 0.0 | 15.0 | 0.0 |
| 1 | とばす | **100%** | 7.0 | 12.0 | 6.0 | 16.0 | 0.00 | 2.0 | 8.0 | 1.0 |
| 2 | ていねい | **84%** | 8.0 | 16.5 | 7.2 | 7.9 | 0.06 | 2.3 | 8.0 | 0.6 |
| 2 | ざつ | **0%** | 6.0 | — | 6.0 | 52.9 | 0.00 | 0.0 | 25.3 | 0.0 |
| 2 | とばす | **40%** | 9.1 | 11.8 | 8.7 | 23.2 | 0.17 | 3.5 | 17.9 | 1.1 |
| 3 | ていねい | **93%** | 7.7 | 14.7 | 6.8 | 0.5 | 0.25 | 2.8 | 8.0 | 1.0 |
| 3 | ざつ | **5%** | 6.6 | 2.1 | 6.8 | 18.3 | 0.02 | 0.0 | 23.5 | 0.0 |
| 3 | とばす | **17%** | 7.3 | 14.9 | 7.1 | 26.4 | 0.32 | 3.3 | 21.2 | 1.5 |
| 4 | ていねい | **90%** | 10.7 | 14.0 | 9.9 | 7.1 | 0.03 | 2.5 | 10.7 | 1.8 |
| 4 | ざつ | **0%** | 8.7 | — | 9.5 | 47.2 | 0.00 | 0.0 | 23.7 | 0.0 |
| 4 | とばす | **16%** | 11.0 | 11.7 | 10.9 | 42.7 | 0.11 | 1.9 | 24.8 | 1.9 |
| 5 | ていねい | **75%** | 9.0 | 15.3 | 8.6 | 2.0 | 0.23 | 1.7 | 10.1 | 0.5 |
| 5 | ざつ | **0%** | 6.8 | 1.7 | 8.0 | 12.7 | 0.05 | 0.0 | 23.0 | 0.0 |
| 5 | とばす | **0%** | 8.4 | — | 8.5 | 43.7 | 0.22 | 1.7 | 24.3 | 0.5 |
| 6 | ていねい | **67%** | 10.2 | 12.7 | 9.8 | 8.2 | 0.00 | 2.3 | 13.6 | 1.3 |
| 6 | ざつ | **1%** | 7.6 | 2.1 | 8.0 | 35.8 | 0.00 | 0.0 | 23.0 | 0.0 |
| 6 | とばす | **0%** | 10.1 | — | 10.2 | 49.0 | 0.00 | 1.7 | 25.1 | 1.4 |
| 7 | ていねい | **66%** | 10.2 | 11.6 | 8.9 | 11.0 | 0.03 | 1.8 | 14.2 | 1.3 |
| 7 | ざつ | **0%** | 7.9 | — | 8.6 | 21.8 | 0.04 | 0.0 | 22.8 | 0.0 |
| 7 | とばす | **0%** | 8.7 | — | 8.8 | 44.9 | 0.03 | 3.2 | 23.9 | 1.3 |
| 8 | ていねい | **95%** | 5.9 | 14.7 | — | 0.0 | 0.00 | 0.0 | 9.5 | 0.9 |
| 8 | ざつ | **24%** | 4.3 | 7.3 | — | 0.0 | 0.00 | 0.0 | 20.8 | 0.0 |
| 8 | とばす | **95%** | 5.9 | 14.7 | — | 0.0 | 0.00 | 0.0 | 9.5 | 0.9 |
| 9 | ていねい | **63%** | 12.1 | 11.8 | 10.4 | 5.6 | 0.08 | 3.0 | 15.4 | 1.5 |
| 9 | ざつ | **0%** | 8.7 | — | 9.5 | 35.7 | 0.00 | 0.0 | 24.0 | 0.0 |
| 9 | とばす | **9%** | 11.2 | 10.6 | 11.0 | 40.9 | 0.18 | 2.9 | 23.9 | 1.8 |

（1000 試合ずつ。seed 1〜1000。参照エンジン `engine.mjs` ＋ ボット `bot.mjs` による。第 8 章は「リリースのあと」から始まるので、リリースしたターンは —）


読み取れること
- **学びの向き**：ていねい ＞ とばす ＞ ざつ、が第 2〜9 章で成り立つ（第 1 章は案内つきの短い章なので、ざつでも勝てるが信頼が 6 まで減り、本番障害が 14 出る。第 8 章はリリース後から始まるので「とばす」は関係ない）。レビューも承認もしないと、第 2〜7・9 章の勝率は 0〜5%（本番障害の大きさの合計が 13〜53）。要件定義・設計をとばすと、テストで見つからない大きさ 8 の本番障害が出て、勝率が 0〜40% に落ちる。＝「要件定義を飛ばすと後で痛い」「バグは早く見つけるほど安い」がルールとして効いている。
- **むずかしさの坂**：ていねいボットの勝率は 100 → 84 → 93 → 90 → 75 → 67 → 66 → 95 → 63%。前半はやさしく、後半は 1〜2 回負けて学ぶ想定。第 8 章（運用）は操作が少ない息ぬきの章。人間はボットより「たくらみ」への備えが上手になれるので、第 7・9 章は体感ではもう少しやさしい。
- **長さ**：平均 8〜12 ターン。1 ターン（自分＋相手）を 50〜60 秒とすると、依頼の 8〜12 分におさまる。
- **そなえの発動**：1 試合に平均 0.5〜2 回。第 9 章では約 1 割の試合で 4 枚の連続わりこみ（突然の仕様変更 → 変更管理 → 鶴の一声 → ダブルチェック）が実際に起きる。
- **直した工数**：ていねいでも 1 試合に 2〜3（テストで見つけて直す分）。製造のバグ 3 つのうち 1〜2 つはレビューしきれず、単体テストで大きさ 2 で見つかる、という流れが毎回起きる（V字の対応を毎試合 1 回は体験する）。

### 12.3 頭の中で回した 1 試合（第 4 章、seed 1、ていねいボット。参照エンジンのログより）

| ターン | プレイヤー | 相手 | 学びの瞬間 |
|---|---|---|---|
| 1 | 要件定義を置く（バグ ?1）→ ピアレビューで直す → 合意のハンコ | ふんわり要望 ×2 | レビューはコスト 1 |
| 2 | ヘンディ先輩を出して対応（1 体解決）→ 議事録をふせる | たくらみをふせる／ふんわり要望が攻撃（信頼 −2） | ふんわりがいるので、設計を置かずに先に解決 |
| 3 | 対応（解決）→ SE → 基本設計（?1）→ レビュー → 合意のハンコ →「聞いてないよ」に承認だけ無効にされる（信頼 +1 は残る）→ 承認ボタンでもう一度 | — | 合意は 1 回でとれないこともある |
| 4 | 詳細設計（?1）→ レビュー → 承認 → A案・B案をふせる | たくらみをふせる | |
| 5 | 製造（?1 ×3）→ レビュー（残り 2）→ 承認 →「聞いてないよ」→ もう一度承認 | かくれたステークホルダー（製造の承認が消える） | 製造はバグが多い／決める人を先に聞く |
| 6 | すぐ報告で解決 → 単体テスト（製造のバグ 2 つを発見、大きさ 2）→ 承認 → 1 つ直す（工数 2） | ちゃぶ台返し → **議事録** で無効 | V字の対応／わりこみ |
| 7 | 結合テスト → セルフレビューで残りのバグを直す → 議事録をふせる | 終わらない要件定義・思いつきのアイデア | |
| 8 | なかま 2 人で対応 → 受入テスト（バグなし） | 突然の仕様変更（製造にバグ +2、見つかっていない）／攻撃を **A案・B案** で止める | テストのあとの変更は見つからない |
| 9 | リリース（バグが育って大きさ 2）→ 2 つが **本番障害** に → なかま 2 人で対応（1 体解決）→ A案・B案をふせる | 残りの本番障害の攻撃をガードで止める | 再テストしていれば 0 だった |
| 10 | 運用 1 ターン → **勝ち**（信頼 20） | | 作って終わりではない |

### 12.4 調整の記録（なぜ今の数値か）

1. 最初の案では「レビュー」「承認」をカードだけにしていた → ひけないと何もできず、要件定義のバグが 8 になって負ける試合が多かった（第 2 章の勝率 34%）。→ **レビューと承認をいつでも押せるボタン（工数 1）** にした。「やるべきことはいつでもできる。ただし工数がかかる」が、そのままルールになった。
2. とばしたときのバグを「次の工程に +2」にしていたら、とばすほうが勝率が高くなった（製造のバグは単体テストで安く見つかるため）。→ **とばした設計工程は「穴」になり、テストで見つからない** に変えた（設計書がなければテストできない）。これで とばす ＜ ていねい になった。
3. レビューが何回でもできると、テストで何も見つからず V字の対応を体験しない。→ **ボタンのレビューは 1 ターン 1 回**、製造のバグを 3 に。
4. 「すぐ報告」で本番障害（大きさ 8）をコスト 0 で消せてしまう穴があった。→ **トークンは NEW にならない**。
5. 相手が弱く、信頼がほとんど減らなかった。→ 行動力を 2 始まり、5 ターン目から 2 枚ドロー。

### 12.5 さらに調整するときのつまみ

- やさしくする：信頼 20 → 24／納期 +1／相手の `enemyApCap` −1／`enemyDraw2From` をおそく。
- むずかしくする：製造のバグ 3 → 4／相手の束に「見なかったことにする」を足す／運用ターン +1。
- 設定に「やさしい／ふつう」を置くなら、信頼 24／20 の切りかえだけで十分（ルールは変えない）。
