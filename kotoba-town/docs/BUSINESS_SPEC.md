# ITビジネス編 — scenario spec

A second course in Kotoba Town, separate from みんなの日本語編. The learner works as a **new engineer
from abroad** in the development team of **みどりデザイン** (a small company in Kotoba Town that designs
and builds websites and apps). They practise the Japanese of IT work — 報連相, stand-ups, requirement
hearings, consulting a senior, reporting a delay, handling a change request, incident calls, apologising
and explaining to a customer, retrospectives — in situations that **follow one project from start to
end, with the same people**.

Everything in `docs/SCENARIO_SPEC.md` applies (node format, branches, judge, gestures, scenes, cast,
`exampleJa` on every branch, original writing only), **except** what this file changes.

## Files

- `kotoba-town/data/business/b01.json` … `b10.json`, one per episode, in story order.
- Validate with `node kotoba-town/tools/validate.mjs b01 b02 …` → must print OK.
- Research notes: `kotoba-town/docs/research/business-bNN.md` (sources you actually read).

## Episode file

```jsonc
{
  "course": "it",
  "unit": 1,                       // episode number = file number
  "storyJa": "喫茶さかもとの 予約アプリ", "storyEn": "A booking app for Café Sakamoto",
  "episodeJa": "第1話", "episodeEn": "Episode 1",
  "titleJa": "朝会で 報告する", "titleEn": "Report at the morning stand-up",
  "summaryEn": "Say what you did, what you'll do and what blocks you — short and in order.",
  "levelEn": "Business Japanese for junior engineers (around JLPT N4–N3): polite です・ます, set phrases of 報連相.",
  "previouslyEn": "One or two sentences: what happened in the story before this episode (empty for episode 1).",
  "grammar": [ … ],                // the PHRASES / SKILLS this episode trains (same shape: id g1…, pattern, meaningEn, exampleJa, exampleEn)
  "vocab": [ … ],                  // 10–25 work words (仕様, 締め切り, 不具合, 確認, 共有 …)
  "tipsEn": [ … ],                 // business-culture tips (e.g. "Bad news first and early — 悪い 報告ほど 早く.")
  "research": { "sources": [...], "notesEn": "..." },
  "variants": [ /* exactly 2 */ ]
}
```

- **2 variants per episode = 2 patterns of the same moment in the story** (e.g. a: things go
  smoothly, b: there is a problem / the other person is busy, upset or vague). Ids `b01a`, `b01b`.
- Each variant still branches (2–4 branches per learner turn) and has 4–6 learner turns,
  **14–20 spoken lines** (count alts). Lines ≤ 55 characters.
- `briefEn` must make the situation and the learner's role clear *before* they speak (what they did
  yesterday, what the problem is, what numbers/dates to use). Give the learner the facts they need
  to say (e.g. "You finished the login screen yesterday; today you'll build the booking form; the
  calendar library gives an error"). Never make them guess hidden facts.
- `freeTalk` is welcome at the end of calm episodes (stand-up chat, retrospective).

## Level and language

- Natural Japanese **business** speech, slowed down for a junior engineer: polite です・ます, standard
  set phrases (お疲れさまです、〜について ご報告します、少し ご相談が あるのですが、〜という 理解で
  よろしいでしょうか、申し訳 ございません、承知しました、持ち帰って 確認します …). て-form, たい, ～ている,
  ～てください, ～と思います etc. are fine here. Avoid heavy 敬語 chains; one keigo phrase per line at most.
- Learner turns train **the shape of the message**, not only grammar: 結論から, 5W1H questions,
  復唱 (repeat back to confirm), 相談 = 状況 → 試したこと → 聞きたいこと, 報告 = 結論 → 理由 → 対策 → 見通し,
  apology = お詫び → 原因 → 対応 → 再発防止. Put these as `grammar` items (pattern = the template).
- `whenEn` branches react to **what the learner chose to say** (e.g. "gave the conclusion first
  and a new date" vs "only apologised without a date" vs "asked for help"), so the scene responds the way
  a real team would (the PM asks "いつまでに できそうですか" if no date was given).
- Keep NPCs kind and professional. Mistakes and bad outcomes belong to the situation (a bug, a library,
  a vague request), **never make a named character look incompetent**.

## Story bible (both writers follow this so the episodes connect)

Company: **みどりデザイン** (office scene). The learner joined the development team two weeks ago.

People (cast ids from `js/content/cast.js`):
| id | role in this course |
|---|---|
| `murakami` 村上 なおみ | Project leader (プロジェクトリーダー) of the team. The learner's main contact. Calm, clear, teaches 報連相. |
| `fujita` 藤田 れん | Senior engineer (先輩). Helps with technical problems; sometimes busy. |
| `aoki` 青木 みお | Designer on the project (画面の デザイン). |
| `ogawa` 小川 まさる | Department manager (部長). Escalations, big decisions. |
| `sakamoto` 坂本 じろう | Client of Story A: owner of 喫茶さかもと. Warm, not technical, says things vaguely. |
| `nishimura` 西村 さき | Client of Story B: at the department store she is also in charge of the store's online shop (ネットショップ担当). Very polite. |

**Story A 「喫茶さかもとの 予約アプリ」 (episodes 1–6)** — the café wants customers to book tables
from their phones.
1. `b01` 朝会で 報告する — `office`. Stand-up with 村上 (npc1), 藤田 (npc2), 青木 (npc3). Learner reports
   yesterday / today / 困っていること. a: on track. b: blocked by an error (asks for help after the meeting).
2. `b02` 要件を 聞く（ヒアリング） — `cafe`. 村上 and the learner visit 坂本 (`counter` or sitting `npc1`; 村上 `npc2`).
   Learner asks what the app must do: who books, how many seats/tables, which hours, how far ahead,
   cancel?, by when (締め切り). a: 坂本 answers clearly. b: 坂本 is vague ("いい感じに…") — learner must ask
   concrete questions and repeat back (復唱).
3. `b03` 認識を 合わせる — `office`, meeting with 村上 (npc1) and 青木 (npc2). Learner summarises the
   requirements from the hearing and confirms. a: all correct. b: one item differs (e.g. cancel by
   phone only) — learner says 「確認させて ください」 and proposes to ask 坂本.
4. `b04` 先輩に 相談する — `office`, 藤田 (npc1). The booking form fails to save on a date. Learner consults:
   状況 → 試したこと → 聞きたいこと. a: 藤田 helps right away. b: 藤田 is busy — learner asks for a time
   (「15分ほど お時間 いただけますか」) and sends the details first.
5. `b05` 遅れを 報告する — `office`. The calendar part will take longer. a: 村上 (npc1): small delay, learner
   reports 結論 → 理由 → 対策 → 新しい 見通し. b: bigger delay affecting the release date; 小川 部長 (npc2)
   joins; learner explains and suggests options (機能を 分けて 出す / 日程を ずらす).
6. `b06` デモと 仕様変更 — `cafe`, 坂本 + 村上. Demo of the app; 坂本 asks for a change. a: small change
   (a "メモ" field) — learner accepts with a time estimate. b: big change (online payment) — learner doesn't
   promise on the spot: 「持ち帰って、期間と 費用を 確認して ご連絡します」.

**Story B 「デパートの ネットショップ トラブル」 (episodes 7–10)** — after the café app, the team also
looks after the department store's online shop. One morning something goes wrong.
7. `b07` 障害の 第一報（電話） — `office`, `"call": true`, 西村 on the `phone` slot. The learner takes the
   call: listens, asks いつから・どの 画面・何件・今も か, repeats back, gives a first answer and a time for
   the next contact (「すぐ 確認して、10時半までに ご連絡します」). a: prices show wrong on some items.
   b: customers can't pay (more urgent) — learner also asks what the store needs right now.
8. `b08` 上司に エスカレーション — `office`, 小川 (npc1), 藤田 (npc2). Learner reports: 何が 起きた → 影響
   (how many customers/orders) → 今 して いる こと → お願いしたい こと. a: calm, 小川 decides. b: 小川 asks
   hard follow-up questions (原因は？ いつ 直る？) — learner answers honestly 「まだ わかりません。〜時に
   報告します」.
9. `b09` お客さまに 説明する — `depato`, 西村 (`clerk`). Learner apologises and explains: お詫び → 原因 (in
   plain words) → 対応 → 再発防止. a: 西村 is understanding. b: 西村 is worried about her customers and
   asks what to tell them — learner suggests a notice (お知らせ) and offers support.
10. `b10` ふりかえり（KPT） — `office`, 村上 (npc1), 藤田 (npc2), 青木 (npc3). Team retrospective of both
    projects: Keep / Problem / Try, 再発防止. a: learner shares a Keep and a Try. b: the team asks the
    learner what was hard for them as a newcomer — learner says it and proposes one improvement.
    Ends warmly (the team thanks the learner; 「これからも よろしく お願いします」).

Use facts consistently across episodes (app name 「さかもと予約」, release date, the error, numbers):
write them into `previouslyEn` and the lines.

### Shared facts (use exactly these)

Story A
- App name: **さかもと予約** (smartphone booking for 喫茶さかもと).
- Requirements agreed in the hearing (b02a / b03a): book from a smartphone; **4 tables, up to 4 people
  each**; booking hours **10時から 17時まで** (the café opens 7–19, but bookings only 10–17); book up to
  **2週間 先** (2 weeks ahead); **cancel in the app until the day before** (b03b: the summary says this,
  but 青木 remembers "電話だけ" — needs checking); release date **12月1日**.
- The bug (b01b, b04): on the booking form, after choosing a date, **保存すると エラーが 出る**
  (the calendar library returns the date in a different format). 藤田's hint: "日付の 形式を そろえて みて".
- The delay (b05): the calendar screen needs **3日** more → release **12月4日** (a). In b: **1週間** late; options:
  予約だけ 先に 出して、カレンダーは あとで / 全部 12月8日に.
- The change requests (b06): a = a メモ field for allergies/requests (半日 で できる); b = online payment
  (オンライン決済) — needs estimate of period and cost.

Story B (12月10日, a Wednesday)
- 9:40, 西村 calls. a: **some items show the wrong price (0円)** since about 9:00; **15 items**; orders still
  possible. b: **customers can't pay** (決済の 画面で エラー) since about 9:15; **about 30 orders** failed.
- First answer time: **10時半までに ご連絡します**.
- Cause found ~11:00, fixed 11:30: a = 価格データを 更新した ときの ミス (a wrong file); b = 決済サービスの
  設定が 期限切れ (an expired setting). Prevention: 更新の 前に 2人で 確認する / 期限を カレンダーで 管理する.
