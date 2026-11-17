# ITビジネス編 b03 research notes — 認識を 合わせる

## What I looked for
How Japanese teams confirm shared understanding (認識合わせ) after a client meeting, the polite phrases for it, and
what to do when two people remember a requirement differently.

## What I learned
- **認識 is a wide word.** It can mean "I noticed", "I understand why" or "I accept". Aligning it means going through
  purpose, scope, date, amount/number, owner and next action one by one, with the exact value.
- **Phrases:** 「私の 理解では…」 to show your premise; 「こちらの 理解で よろしいでしょうか」 to check;
  「前提に 相違が あるようです」 to name a difference gently. "同じ 認識です" alone is not enough — list the items.
- **Write it down.** What was agreed orally goes into mail/chat/minutes with date, owner and action; minutes separate
  decisions, open points (持ち帰り) and TODOs, and are confirmed by everyone.
- **例説:** people use the same word for different things and only notice later; a concrete example or question
  ("is that the opening hours?") exposes the gap early.
- **Share uncertain points at once** rather than after they are tidy — an early conversation is cheap, a late
  discovery costs the schedule.
- A difference between two memories is not yet anyone's mistake: the client may have said both, at different times.

## How the variants train it
| variant | situation | skills (grammar ids) |
|---|---|---|
| b03a 同じ | Learner summarises for Murakami and Aoki; everything matches. | g1 one-sentence overview · g2 exact numbers and date · g3 polite correction (opening hours vs booking hours) · g4 この 理解で よろしいでしょうか · g5 minutes today |
| b03b ちがう | Aoki heard 「キャンセルは 電話だけ」 from Sakamoto the day before. | g1/g2 summary · g6 メモでは〜ですが、確認させて ください · g7 who/how/when to check · g8 only the cancel screen waits |

Branch design:
- a: agreed that booking hours = opening hours → Murakami restates both; vague release date → she asks for the date;
  "以上です" without a check → she teaches the closing question; minutes without a time → 今日中に.
- b: three reactions to the mismatch — wants to check / insists the notes are right / gives in at once — each gets a
  different reply from Murakami (both heard it; he may have changed his mind; don't decide yet).
- b: no time for the check → 「いつ 聞けますか。青木さんの 作業が 止まって しまいます」; "tomorrow" → today, with help.
- b: "wait with everything" or "go ahead with everything" → only the cancel screen waits.
- Neither Aoki nor the learner is wrong: Sakamoto said 「電話の ほうが 安心」 to Aoki after the hearing.

## Facts used / introduced
- Shared (exact): the six requirements and the release date 12月1日; the open point "キャンセルは 電話だけ？".
- New: Aoki talked with Sakamoto at the café the day after the hearing; in b03b the learner will phone Sakamoto today
  and the cancel screen design waits while the other screens go ahead; in b03a the learner shares the 議事録 today.
- Left open on purpose: the answer to the cancel question (the shared facts keep "cancel in the app until the day before").

## Sources read
- https://www.luft.co.jp/media/recognition-paraphrasing/ — meanings of 認識, confirmation phrases, order of items to align
- https://dev.classmethod.jp/articles/org-catalog-explanation-by-example/ — 例説
- https://crexgroup.com/ja/development/project/requirements-definition-hearing-tips/ — paraphrase/summarise, minutes with decisions vs open points
- https://job.rikunabi.com/contents/manners/1007/ — repeat-back frame 〜で よろしいでしょうか
- https://dev.to/jun_f_kirk/on-a-japanese-dev-team-no-news-is-bad-news-438j — share unfinished or uncertain points early
