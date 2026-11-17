# ITビジネス編 b11 research notes — ふつうの 面接 (Story C, interview 1)

## What the episode trains
| id | skill | template |
|---|---|---|
| g1 | enter / sit / leave | 失礼します。／失礼いたします。 |
| g2 | name + greeting beside the chair | 〜と 申します。本日は よろしく お願いいたします。 |
| g3 | self-introduction (about 30 s) | 名前 → 大学・専攻 → 勉強した こと・作った もの → よろしく お願いいたします |
| g4 | motivation | 御社を 志望した 理由は、〜からです。御社は 〜ので、〜と 考えて おります。 |
| g5 | experience (team project) | 〜人の チームで 〜を 作りました。私は 〜を 担当しました。〜を 直しました。 |
| g6 | what you study now (a) | 今は 〜を 勉強して います。〜ながら 練習して います。 |
| g7 | weak point (b) | 私の 弱みは、〜 ところです。今は、〜ように して います。 |
| g8 | five-year goal (b) | 5年後は、〜に なりたいと 考えて おります。 |
| g9 | the candidate's own question | 〜に ついて、うかがっても よろしいでしょうか。／入社までに 〜 |
| g10 | closing thanks | 本日は お時間を いただき、ありがとう ございました。 |

## 1. Flow of the interview, entering and leaving
- **Knock three times**, slowly (two knocks are for checking a toilet); wait for 「どうぞ」／「どうぞ お入りください」, say 「失礼します／失礼いたします」, close the door facing it, bow. (Mynavi 転職 guide 07, Rikunabi 33146)
- **Beside the chair**: name and greeting — 「〇〇と 申します。よろしく お願いいたします」 (Mynavi; Rikunabi gives the student version 「〇〇大学の ××です。よろしく お願いいたします」). Mynavi's fuller version adds 「本日は お時間を いただき、ありがとう ございます」 → second model answer of the name turn.
- **Sit only when invited**: 「どうぞ おかけください」 → 「はい、失礼します」. Bag at the feet / beside the chair. (both)
- **Leaving**: thank while still seated (「本日は ありがとう ございました」／「本日は お時間を いただき…」), bow again standing beside the chair, 「失礼します／失礼いたします」 at the door; stay in interview mode until outside the building. (both) → the last learner turn asks for thanks + 失礼いたします, and the `stand` node follows it.
- Rounds: usually three or more interviews (Study in Japan); 一次 is run by young staff or HR and looks at manners, conversation, logical thinking and "would I like to work with this person" (Rikunabi 33062); 最終 is run by managers/executives, 30–60 min, and decides on motivation, fit with culture and long-term contribution (r-agent 3635).

## 2. Frequent questions and what interviewers listen for
- Rikunabi 33062 top questions and intent: ガクチカ (how you approach a problem, whether it carries over to work); 長所・短所 (objective self-analysis, fit); 志望動機 (match with the company, likely to stay); the candidate's questions (initiative — do not say you have none). Five-years-from-now is on its longer list.
- Engineer new-grad interviews (paiza): why this company (a concrete experience, not "I like X"), what you worked on (what, why, result — programming experience is useful), strengths/weaknesses (weakness paired with an improvement already under way), **recent technology you are studying** (having nothing to name reads as low motivation to learn alone), five years from now (linked to the company's work). → 藤田's two questions in b11a and the `lookForEn` of each.
- Final interview (r-agent 3635): why this company (commitment, understanding of the firm), career vision after joining, how you will use your skills, what you value. Earlier rounds check skills and experience; the final checks will to join and fit. → b11b drops the self-introduction and starts from 志望動機, then 弱み and 5年後.
- 逆質問 (Mynavi guide 17): intent = fit, values, real interest, communication. Prepare several, ask 2–3. To team members/HR ask about the role, skills needed and how people work; to executives ask about policy, vision, plans (with a soft 「うかがっても よろしいでしょうか」). Bad: only salary/holidays/overtime, things on the website, yes/no questions, "no questions". → the four branches of the 逆質問 turn (work / team or expectations / conditions only / none), each with a kind, realistic answer. r-agent adds that vague or HR-type questions do not suit a final interview.
- International students (Study in Japan): sample questions include "why did you study in / want to work for a Japanese company" and **"how long do you want to work in Japan"**; answers are best built as conclusion → episode → summary; practise aloud and record yourself. → 小川's 「長く 働いて ほしいと 考えて います。5年後…」 and the `goal_only` branch where he says he hopes the learner stays in Japan.
- Foreign applicants, employer side (treeglobalpartners): **residence status and its expiry are checked as a matter of course**, plus earliest start date; Japanese ability is judged in the conversation itself (JLPT alone is not enough); long-term plans are asked as a career-vision question, not as pressure. Not to be asked: nationality/origin as a criterion, religion, family, marriage. → tip about the residence-status question (the improper questions are b12's topic).
- izanau lists what small employers typically ask foreign applicants (why us, visa, why Japan, part-time jobs, future plans / will you go home). Used only as confirmation that visa and "will you stay" questions are common; the article's own opinions were not used.

## 3. Interview language and answer shape
- **御社 in speech, 貴社 in writing** (Mynavi caripedia 20): 御社 in interviews, calls and briefings; 貴社 in emails and résumés. If you slip, say 「失礼いたしました」 and restate. hataractive's sample answers also use 御社 throughout. → vocab, tip, `pitfallsEn` of the 志望動機 turns.
- **Self-introduction**: about one minute at most; for new graduates: school, faculty, name, one key thing, a closing line; no long life history (hataractive 1886). Model answers here are 3–4 short sentences (≈ 20–30 s) because of the learner's level.
- **Length / PREP**: 30 s ≈ 120–150 characters, 1 min ≈ 250–300; structure = conclusion → reason → concrete experience → how you will use it after joining (onecareer 4105). → `conclusion`, `specific`, `length` criteria; model answers of 2–4 sentences.

## How it became the two variants
- **b11a 一次面接** (村上 + 藤田): 入室 → 名乗り → 着席 → 自己紹介 → 志望動機 → チームの プロジェクト (藤田) → second technical question (藤田) → 逆質問 → お礼・退室. 9–10 learner turns, 27 spoken lines.
  - 自己紹介 without what was studied → 村上: 「大学では 何を 勉強しましたか。」 (extra turn).
  - 志望動機 linked to the company → 「うちの 仕事を よく 調べて くださって いますね」; generic → 村上 tells what the company makes (a fact the learner can use in the final interview).
  - Project answer with own role → 藤田 moves on to 「今は、どんな 技術を 勉強して いますか」; role unclear → 「その 中で、あなたは 何を 担当しましたか」 instead (same number of turns).
- **b11b 最終面接** (小川 + 村上): 入室 → 名乗り → 着席 → 志望動機 → 弱み (村上) → 5年後 → 逆質問 → お礼・退室. 8–10 learner turns, 29 spoken lines.
  - Generic 志望動機 → 小川: 「なぜ みどりデザインなのですか。」
  - 弱み without an improvement → 村上: 「その 弱みを 直す ために、今 何を して いますか。」; "no weak point" → 「だれにでも 苦手な ことは ありますよ…」.
  - 5年後: goal + staying / goal only (小川 says he hopes for a long career in Japan) / vague.

## Facts introduced here
- みどりデザイン makes websites and apps for small shops in town; new engineers start on small sites with a senior; the team uses React. Results: 一次 within one week by email, 最終 within three days.
- Learner profile as in BUSINESS_SPEC (Phnom Penh, web development, 3-person booking-site project, front end, bug fixed before the deadline, café job, N3 → N2, weak point = shy about asking, team leader in 5 years).

## Sources
Read:
- https://tenshoku.mynavi.jp/knowhow/mensetsu/guide/07/ — entering, greeting, seating, bag, leaving; exact phrases
- https://job.rikunabi.com/contents/interview/33146/ — same for new graduates (どうぞ お入りください, どうぞ おかけください → はい、失礼します)
- https://job.rikunabi.com/contents/interview/33062/ — what a first interview checks; top questions and their intent
- https://www.r-agent.com/guide/article3635/ — final interview: who, what is judged, questions, 逆質問 to executives
- https://tenshoku.mynavi.jp/knowhow/mensetsu/guide/17/ — 逆質問: intent, number, good/bad examples by interviewer
- https://www.studyinjapan.go.jp/ja/work-in-japan/employment/recruitment-tests.html — interviews for international students; "how long in Japan"; conclusion → episode → summary
- https://treeglobalpartners.com/articles/gaikokujin-saiyo-mensetsu/ — residence status check, judging Japanese, questions to avoid
- https://izanau.com/ja/article/view/gaikokujin-mensetsu-shitsumon — typical questions to foreign applicants (confirmation only)
- https://paiza.jp/student/advice/interview-tips-faq — engineer new-grad questions; "what are you studying now"
- https://onecareer.jp/articles/4105 — answer length in characters, PREP
- https://hataractive.jp/mensetsu/1886 — self-introduction contents and length; 御社 in sample answers
- https://tenshoku.mynavi.jp/knowhow/caripedia/20/ — 御社 (spoken) vs 貴社 (written); what to do after a slip

Not readable (HTTP 503): https://doda.jp/guide/mensetsu/question/06.html . Search summaries only (not opened): baitoru.com 3219 (two knocks = toilet), career-tasu.jp guide 077 (consistency with earlier rounds).
