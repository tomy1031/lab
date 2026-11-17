# ITビジネス編 b01 research notes — 朝会で 報告する

## What I looked for
How Japanese IT teams run the 朝会 (daily stand-up), what a new engineer is expected to say, how blockers are
handled, and what foreign engineers find hard about it.

## What I learned
- **Three items, in order.** Japanese teams almost always use 昨日やったこと → 今日やること → 困っていること／気になること.
  The Scrum Guide itself only fixes the 15-minute limit and the goal (inspect progress, make a plan for the day);
  the three items are a team convention, not a rule.
- **The third item is the valuable one.** Even small worries should be said. A blocker raised in the stand-up gets one
  of three outcomes: solved on the spot by a one-line tip, given an owner and a time after the meeting
  ("今日 11時から 30分 話す"), or consciously dropped.
- **A short question can dissolve a big problem** — a reason the stand-up cannot be replaced by a written report.
- **No news is bad news.** On a Japanese dev team silence reads as risk. Report mid-task and early, even unfinished
  (「まだ 途中なんですが」). 報告 = finished result, 連絡 = a fact others need, 相談 = input before deciding.
- **For newcomers, the stand-up is hard listening.** You follow fast talk while preparing your own turn; being able
  to take part naturally is described as a sign of being a full team member. A foreign engineer interviewed by ITmedia
  says meetings were where he first could not follow the Japanese.
- Not confirmed by a source I could open: the often-quoted "ask after 15 minutes" rule. I did not use it as a fact;
  the scenario uses "about an hour of trying" from the learner's brief instead.

## How the variants train it
| variant | situation | skills (grammar ids) |
|---|---|---|
| b01a 順調 | Fujita reports first (a model). Learner reports yesterday/today, gives a forecast, says there is no blocker, receives a notice from Aoki. | g1 report order · g3 forecast with a time · g2 "nothing blocks me" · g4 acknowledge + repeat back |
| b01b エラー | Aoki reports first. Learner is blocked by the save error. | g1 · g2 say the blocker · g5 describe it concretely · g6 what you tried · g7 ask Fujita for 15 minutes after the meeting |

Branch design (reacts to what the learner chose to say):
- Left out yesterday or today → Murakami asks for exactly the missing half.
- Forecast without a time → she asks for a new forecast this evening instead of pressing.
- b: did not mention the blocker → Murakami asks; still hidden → Fujita asks directly whether saving works; still
  "fine" → the meeting ends with "小さな ことでも、早めに 教えて ください" (the cost of hiding is that nothing gets solved).
- b: vague "it doesn't work" → Fujita narrows it with a closed question (どの 操作で？).
- b: "I'll keep trying alone" → Murakami says an hour is enough and asks Fujita to help.
- Nobody solves the bug in the meeting; the hint (日付の 形式) is left for b04.

## Facts used / introduced
- Shared: app さかもと予約; the bug = 予約フォームで 日付を 選んで 保存すると エラーが 出る.
- New: the learner finished the ログイン画面 the day before; the 予約フォーム is the current task (a: forecast 明日の 昼まで);
  the learner spent about 1時間 and rechecked the ライブラリの 設定; Fujita agreed to look at it after the stand-up
  (「席に 来て ください」); Aoki changed the button colour of the booking form; Fujita built the saving of booking data.

## Sources read
- https://dev.classmethod.jp/articles/daily-scrum — three items; three ways to handle a raised problem
- https://blogs.itmedia.co.jp/hiranabe/2012/02/daily-scrum-or-standup-meeting.html — standing, fixed time and place; short Q&A solves problems
- https://scrumguides.org/scrum-guide.html — Daily Scrum: 15 minutes, no fixed format, details discussed afterwards
- https://dev.to/jun_f_kirk/on-a-japanese-dev-team-no-news-is-bad-news-438j — silence = risk; report early; まだ途中なんですが
- https://zenn.dev/yumainaura/articles/qiita-2018-03-17t04_25_02-09_00 — why stand-ups are hard for beginners
- https://www.itmedia.co.jp/news/articles/2403/15/news179_2.html — a foreign engineer on not following meetings at first

Pages that refused access (not used): codezine.jp stand-up articles, mynavi-agent 報連相 article, METI PDF on foreign staff.
