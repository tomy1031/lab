# ITビジネス編 b08 research notes — 上司に エスカレーション

## What the episode trains
| id | skill | template |
|---|---|---|
| g1 | get the manager's attention | 今 よろしいでしょうか。〜の 件で、至急 ご報告が あります。 |
| g2 | what happened, conclusion first | [どこ]で、[いつ]から、[何]が 起きて います。 |
| g3 | impact in numbers | 〜が 〜件 入って います。 |
| g4 | what is being done / what the customer was told | 今、〜さんが 原因を 調べて います。〜と お伝えしました。 |
| g5 | ask for a decision or help | 〜しても よろしいでしょうか。／〜して いただけますか。 |
| g6 | honest "not yet" + next report (b) | まだ わかりません。10時半に もう一度 ご報告します。 |

## What the sources say
- **Report before the cause is known.** Symptom, affected function and users, start time, current handling and next update can all be told while the cause is still open. (ai-agent-x)
- **Separate confirmed from unconfirmed.** Write what was confirmed and what is still being checked separately; do not assert cause, recovery estimate or data impact. Label uncertain information 調査中／未確認 so nobody misreads it. (ai-agent-x, Money Forward)
- **Keep it short and ordered** so that everyone has the same picture; contact the people set out in the escalation flow, and consider notifying customers early if the impact is wide. (Money Forward)
- **Every update names the next one**, and updates without content are avoided. (PagerDuty)
- **Temporary measure first.** Limiting the impact comes before the permanent fix (Money Forward) → in a the learner proposes to stop selling the 15 items; the decision is the manager's.

## How it became the two variants
- a: four-part report (何が → 影響 → 今 して いる こと → お願い). 小川 repeats the key numbers back; if the learner forgets the order count, 藤田 supplies it; if the learner asks 「どう したら いいでしょうか」 without a proposal, 小川 decides and asks for the learner's own idea next time.
- b: 小川 is about to enter a meeting and asks 原因は？ and いつ 直りそうですか. A guessed cause is corrected by 藤田 (「まだ 調べて いる ところです」); a promised fix time gets 「それは 確かですか」. The honest answer with 10時半 is praised.

## Facts introduced here (not in the shared facts)
- a: **3 orders at 0円** have come in by 9:50 (the "impact" number); the request is to stop selling the 15 items until the cause is known.
- b: 藤田 is looking at the payment service settings; 小川 may bring in 村上 or join the 10:30 contact.

## Sources
Read:
- https://www.ai-agent-x.com/media/saas-incident-status-page-communication/
- https://biz.moneyforward.com/work-efficiency/basic/?p=12010
- https://docs.pagerduty.com/ops-guides/incident-response-guide/external-comms

Found but not readable (HTTP 403), used only as search summaries: https://allabout.co.jp/gm/gc/324406/ , https://codezine.jp/article/detail/19773?p=2 , https://handbook.gitlab.com/handbook/eta/css/incidents/ (search summary: what cannot be solved within about 10 minutes is escalated)
