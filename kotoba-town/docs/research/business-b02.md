# ITビジネス編 b02 research notes — 要件を 聞く（ヒアリング）

## What I looked for
How requirement hearings (要件ヒアリング) are run in Japan, what to ask, how to handle vague wishes, how and what to
repeat back (復唱), and what happens after the meeting (議事録).

## What I learned
- **Flow:** state the purpose → prepared questions (a hearing sheet) → dig into vague points → confirm → minutes the
  same or next business day, with decisions, open points and TODOs kept apart and confirmed by the participants
  (this prevents 言った・言わない).
- **Vague words must be made concrete.** 「簡単に」「柔軟に」「いい感じに」 are turned into who / which case / which
  number with 5W1H. Showing a hypothesis or an example that the client can correct is a recognised technique.
- **Open vs closed questions.** Open questions to a non-technical client produce long or off-target answers; closed,
  concrete questions (often a hypothesis: "〜ですか") keep the hearing on time — but a bare hypothesis can make the
  client uneasy, so say what you are asking about first.
- **例説 (explaining by example):** abstract words hide different understandings; a concrete example exposes them.
- **復唱:** dates, times, numbers, names and contact details are always repeated back
  (「復唱いたします。…で よろしいでしょうか」). Key conditions are stated with the exact value
  (「納品日は 8月31日で よろしいでしょうか」).
- **Foreign engineers:** fast, indirect meeting talk is where information is lost; repeat-back is a courtesy and a
  safety net at once.

## How the variants train it
| variant | situation | skills (grammar ids) |
|---|---|---|
| b02a はっきり | Sakamoto sits with you and answers clearly. | g1 state the purpose · g2 concrete questions · g3 repeat back each answer · g4 propose a cancel rule when he asks you · g5 ask for the start date |
| b02b いい感じに | Sakamoto is busy behind the counter: 「いい感じに」「忙しくない とき」「おまかせします」「早く」. | g2 number questions · g3 repeat back · g4 propose and check (〜で よろしいでしょうか) · g5 pin the date |

Branch design:
- Open question ("どんな アプリが いいですか") → a: he gives a wish, not a spec; b: he stays vague and Murakami models a
  concrete question.
- Asked the café's opening hours instead of booking hours → he gives both (店は 7時から 19時、予約は 10時から 17時だけ) —
  the trap that returns in b03a.
- Did not repeat back → the client checks himself (「席の 話は 大丈夫ですか」).
- b: proposed the opening hours → he corrects them (朝と 夜は 忙しい); proposed nothing after 「おまかせ」 → Murakami
  supplies the usual rule; proposed a date vs asked for one → different replies, same result.
- Sakamoto is never unclear out of carelessness: he is busy, not technical, and trusts the team.

## Facts used / introduced
- Shared (exact): 4 tables, up to 4 people each; bookings 10時から 17時まで; café open 7時から 19時; up to 2週間 先;
  cancel in the app until 前の日; release 12月1日.
- New: Sakamoto's reason for the date — year-end is busy (年末は 予約が 多い／忙しい); mornings and evenings are the busy
  hours; Murakami promises to send the 議事録.

## Sources read
- https://crexgroup.com/ja/development/project/requirements-definition-hearing-tips/ — five steps, question areas, making vague wishes concrete, minutes
- https://news.mynavi.jp/techplus/article/communication-6/ — open vs closed questions in client hearings
- https://dev.classmethod.jp/articles/org-catalog-explanation-by-example/ — 例説: aligning on abstract words with examples
- https://job.rikunabi.com/contents/manners/1007/ — 復唱 of dates, numbers and names; the set phrase
- https://www.luft.co.jp/media/recognition-paraphrasing/ — confirm key conditions with exact values
- https://www.itmedia.co.jp/news/articles/2403/15/news179_2.html — a foreign engineer on meetings in Japanese

Pages that refused access (not used): Indeed article on foreign staff, tokyodev.com article, METI PDF.
