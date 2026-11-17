# ITビジネス編 b07 research notes — 障害の 第一報（電話）

## What the episode trains
| id | skill | template |
|---|---|---|
| g1 | answer a business call | お電話 ありがとう ございます。みどりデザインの ＿＿です。 |
| g2 | fact questions (5W1H) | いつからですか／どの 画面ですか／何件ですか／今も 続いて いますか |
| g3 | 復唱 (repeat back) | 確認させて ください。〜から、〜が 〜、という ことですね。 |
| g4 | first answer + next contact time | すぐ 確認して、10時半までに ご連絡します。 |
| g5 | apology cushion | ご不便を おかけして、申し訳 ございません。 |
| g6 | ask what the customer needs now (b) | 今、いちばん お困りの ことは 何でしょうか。 |

## What the sources say
- **First report = symptom, scope, time, status, next update.** A first notice should give the affected function and users, the symptom the user sees, the time it started (or was detected), the current stage (investigating …), a verified workaround if any, and the time of the next update. It should not wait for the cause. (ai-agent-x)
- **Give a clock time, not 「進展が あり次第」.** Suggested intervals are about 30 minutes when a main function is down; the update is sent at the promised time even if nothing has changed, because a missed update damages trust more than the incident itself. (ai-agent-x; PagerDuty: every update says when the next one comes)
- **Don't assert what is not confirmed.** Cause, recovery time and data impact are not stated before they are confirmed; unconfirmed things are labelled 調査中／未確認. (ai-agent-x, Money Forward) → the branches where the learner says 「すぐ 直します」 make 西村 ask "the cause isn't known yet, is it?".
- **Phone handling.** Listen to the end, apologise for the inconvenience, check the facts with 5W1H, repeat back to avoid a gap in understanding, and if you cannot answer on the spot promise a call-back with a clear time. (LINE WORKS AiCall, アイミツ)
- **Initial response.** Identify the phenomenon, the scope and the level of response quickly; don't spend long on detailed investigation before reporting. (Money Forward)

## How it became the two variants
- a (0円 prices): calm; four fact questions in two turns, 復唱 of 「9時ごろ・15件・注文できる」, first answer with 10時半.
- b (payment fails): 西村 is hurried and gives the time herself; the learner asks screen and count, repeats back, asks what she needs most (she doesn't know what to tell customers), and gives her a sentence to use (「今 調べて います」) plus 10時半. A promise to fix is questioned (「10時半に 直る、という ことでしょうか」).
- The learner answers the phone first (n1 has no NPC line), as the receiver does in a real call.

## Sources
Read:
- https://www.ai-agent-x.com/media/saas-incident-status-page-communication/ (reached from funnel-ai.jp)
- https://docs.pagerduty.com/ops-guides/incident-response-guide/external-comms
- https://biz.moneyforward.com/work-efficiency/basic/?p=12010
- https://line-works.com/aicall/column/phone-complaints/
- https://imitsu.jp/matome/customer-service/complaint-response-phone

Found but not readable (HTTP 403), used only as search summaries: https://atsoho.com/blog/complaint-handling-phone
