# 動かし方とセキュリティ（無料・いまのサブスクの範囲で）

## まず結論

| やり方 | お金 | Claude の使い方 | 複数人 | 向き |
|---|---|---|---|---|
| **A. claude.ai のアーティファクト版**（おすすめ・これから作る） | 0 円 | 各自の claude.ai アカウント（各自のサブスク） | ○（共有したメンバー） | 「Claude の中に埋め込む」「サブスク内」「サーバーを持たない」 |
| **B. 自分の PC か無料のサーバー ＋ Cloudflare** | サーバー 0 円・**Claude は会社の API キーの従量課金** | 会社の API キー | ○ | いまの作り（Claude Code で本当に作業する）をそのまま使う |
| **C. 自分の PC で自分だけ** | 0 円 | 自分のサブスク（`claude` にログイン） | ×（自分だけ） | 試す・個人で使う |

### サブスクの規約で気をつけること（2026 年 11 月に公式ページで確認）

- **1 人のサブスクのログインで、同僚の分まで AI を動かす使い方はできません。**
  - Claude Agent SDK のドキュメント：「事前の承認がない限り、第三者の開発者が claude.ai のログインや利用枠を自分の製品で提供することは認めていない。API キーで認証すること」
    （[Agent SDK quickstart](https://code.claude.com/docs/en/agent-sdk/quickstart.md)・[overview](https://code.claude.com/docs/en/agent-sdk/overview.md)）
  - 法務のページ：Free・Pro・Max の資格情報で、他の人の分のリクエストを流すことは認めていない。OAuth のログインは、その契約者本人の通常の利用のため
    （[Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance.md)）
  - 利用規約：アカウントのログイン情報を他人と共有しない（[Consumer Terms](https://www.anthropic.com/legal/consumer-terms)）
- そのため、**B で複数人が使うなら、会社の API キー**（`ANTHROPIC_API_KEY`。または Bedrock・Vertex）にします。
  - Max・Team などには Agent SDK 用の API クレジットが付くという案内もありますが、変更が保留中とされています。決める前に [ヘルプの記事](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan) を確認してください。
- **Claude Code on the web（クラウドのセッション）はサーバーの置き場所にはできません。** しばらく使わないと止まって消えます（[ドキュメント](https://code.claude.com/docs/en/claude-code-on-the-web.md)）。

---

## A. claude.ai のアーティファクト版（おすすめ）

claude.ai の「アーティファクト」（公開できる Web ページ）の中で、この会社を動かします。サーバーは持ちません。

- **ログイン**
  - claude.ai のアカウントでそのまま入ります。このアプリ専用のパスワードはありません。
  - Team・Enterprise なら、組織のメンバーに共有できます。
  - 個人プランでも、招待した人に共有できます。
  - 共有されていない人は開けません。
- **AI**
  - ページから Claude に頼む機能（`sample`）で、ネクマックスの分解と AI社員の作業を動かします。
  - 頼むときは、そのページを開いている本人のアカウントで動きます。最初の 1 回は本人の同意が出ます。
  - だれの利用枠から使われるかは、ドキュメントに明記されていません。ふつうは開いた本人の枠と考えられますが、要確認です。
- **データ**
  - アーティファクトの共有データベース（`db`）に、ゴール・タスク・記憶を入れます。
  - 書き込める人をルールで決めます。たとえば、読むのはメンバー全員、人間のタスクを完了にできるのは担当者と管理者、個人のメモは本人だけ、です。
- **リアルタイム**：いま開いている人どうしの「いる・いない」や、やり取りの光の粒は `room` で伝えます。
- **3D と画面**：いまの画面と 3D をそのまま載せます。
  - 絵とスクリプトはアーティファクトのファイルとして置きます（上限 16MB、いまは約 4MB）。
  - 外部の読み込みは許可されたものだけです。
- **守り**
  - こちらで動かすサーバーが無いので、ネットから攻撃される入口がありません。
  - ログインと共有の管理は claude.ai がします。
  - パスワードやクッキーをこちらで持ちません。
- **できなくなること**
  - Claude Code の道具（ファイルの読み書き、Web の検索）は使えません。成果物は文章としてデータベースに残します。
  - だれもページを開いていない間は、AI の仕事は進みません。開いている人のページが進行役になります。

作り直しには、司令塔（`server/company.ts`）をブラウザで動く形に移すことと、`db` のルール設計が要ります。

---

## B. 自分の PC か無料のサーバー ＋ Cloudflare（いまの作りのまま）

1. **置き場所**
   - 社内でいつも電源が入っている PC か Mac が手軽です。
   - 無料のクラウドなら Oracle Cloud の Always Free があります。ただし 2026 年に無料枠が半分（2 OCPU・12GB）になったという報道があり、[Oracle の公式ページ](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) で確認してください。
2. **起動**

   ```bash
   cd ai-company
   npm ci && npm run build
   NODE_ENV=production HOST=127.0.0.1 PORT=8787 TRUST_PROXY=1 COOKIE_SECURE=1 \
   ANTHROPIC_API_KEY=（会社の API キー） AI_ENGINE=claude AGENT_WEB=0 \
   npm start
   ```

   - `HOST=127.0.0.1` で、その PC の中だけで待ち受けます。ルーターのポートは開けません。
   - サーバーは、専用の一般ユーザー（管理者でない）で動かします。
3. **入口：Cloudflare Tunnel ＋ Cloudflare Access**
   - Zero Trust の無料プランは 50 人程度まで（[Cloudflare のプラン](https://www.cloudflare.com/plans/sase-zero-trust.md)）。
   - `cloudflared` をその PC に入れて、トンネルを作ります。外向きの通信だけなので、受け付ける口を開けずに済みます。
   - Access のアプリを作り、会社のメールアドレスのワンタイムコードか Google ログインに通った人だけを通します。
     - **アプリのログイン**と合わせて**二重の鍵**になります。
     - 同時に、ログイン画面に総当たりされることも防げます。
   - 公開する URL を `ALLOWED_ORIGINS=https://ai.example.com` に入れます。
4. **はじめにすること**
   - `data/credentials.txt` の初期パスワードで入ります。
   - 全員が右上の「パスワードを変更」で変えます。
   - 変えたら `credentials.txt` を消します。

## C. 自分の PC で自分だけ

`claude` に自分のサブスクでログインした PC で、`npm run dev` を実行します。外には公開しません。

---

## このアプリに入っている守り

| 種類 | 中身 |
|---|---|
| 待ち受け | 既定は `127.0.0.1`（その PC の中だけ）。外へは Tunnel などの入口を通す |
| ログイン | <ul><li>パスワードは scrypt でハッシュする。10 文字以上で、推測されやすいものは断る</li><li>ログイン名が無くても同じ時間をかける</li><li>失敗はログイン名ごとに 10 分で 8 回、接続元ごとに 10 分で 30 回まで</li></ul> |
| セッション | <ul><li>クッキーは HttpOnly・SameSite=Lax で、HTTPS のときは Secure</li><li>鍵はハッシュだけを保存する</li><li>使わないまま 14 日、または発行から 30 日で切れる</li><li>パスワードを変えると、ほかの端末は切れる</li></ul> |
| よそのサイトからの操作 | 書き込みと WebSocket は、Origin が自分でなければ 403（CSRF・WebSocket の乗っ取り対策） |
| ヘッダー | <ul><li>Content-Security-Policy：スクリプトは自分のサイトのものだけ。ほかのサイトの枠には入れない</li><li>X-Frame-Options・nosniff・Referrer-Policy・Permissions-Policy・HSTS（HTTPS 時）</li></ul> |
| 権限 | 人間の登録・退職・頭脳の切り替えは管理者だけ。人間のタスクを完了にできるのは担当者と管理者 |
| ファイル | <ul><li>成果物の閲覧は、そのゴールの作業フォルダの中だけ（`..` を断る）</li><li>`state.json` と `credentials.txt` は本人しか読めない（0600）</li></ul> |
| 画面への表示 | <ul><li>文章はすべてエスケープしてから表示する</li><li>AI が作った HTML は、スクリプトを止めた枠（sandbox）で表示する</li></ul> |
| AI社員の道具 | <ul><li>ファイルの読み書きと Web だけ。Bash は既定で無効</li><li>実行の直前に毎回検査する（`server/engine/guard.ts`）</li><li>作業フォルダの外へは出られない（`..`・絶対パス・シンボリックリンクも実体で判定）</li><li>Web は https だけ。社内ネットワーク・localhost・クラウドのメタデータには行かせない</li><li>1 タスクに予算の上限がある</li></ul> |
| エラー | 想定外のエラーの中身は返さない |
| 依存 | `npm audit` で既知の脆弱性 0 件（2026-11-05） |

### 残るリスクと運用のお願い

- **プロンプトインジェクション**
  - AI社員が読んだ Web ページに悪い指示が仕込まれていると、成果物の中身をゆがめられるおそれがあります。
  - 気になる仕事では `AGENT_WEB=0` にし、Web を使わせないでください。
  - 成果物は人間が確認してから外に出してください。人間のタスクの「最終承認」がそのためにあります。
- **更新**：月に 1 回は `npm audit` と `npm update` を実行し、OS の更新も入れてください。
- **バックアップ**：`data/state.json` を毎日、暗号化した場所にコピーしてください。
- **退職者**：ログインを止めるには、管理者が登録を外してください。Cloudflare Access の許可リストからも外してください。
