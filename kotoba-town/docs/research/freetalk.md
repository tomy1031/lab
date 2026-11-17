# Free-talk room — research notes

Content file: `data/freetalk.json` (20 partners, 65 topics: 42 chat + 23 role, 24 twists).
The room has no script. The data only steers the Gemini Live partner (`openerEn`, `situationEn`,
partner `newsJa`, twists) and gives the learner something to hold on to (`ideasEn`, `startersJa`, `wordsJa`).

## Sources read

Teaching conversation at beginner level

- https://marugoto.jpf.go.jp/assets/docs/teacher/feature/15_topics.pdf — the 15 topics of the JF Standard
  (Japan Foundation) with the levels each one is taught at. A1–A2: self and family, home and neighbourhood,
  free time, daily life, travel and transport, shopping, food, relationships, school, language and culture.
  Work, health and nature/weather come in at A2. Society and science/technology appear only at B1.
- https://www.jfstandard.jpf.go.jp/pdf/roleplay/202311_A2_1.pdf — JF role-play test, A2 sample. The role card is
  one short paragraph: where you are, what happened, what to do ("you found clothes in a colour you like at
  the department store, but the size does not fit; consult the clerk"). The tester adds a complication
  (that size is sold out; another colour is available). Passing well means reacting to it with a simple
  opinion of one's own.
- https://www.jfkl.org.my/wp-content/uploads/2023/01/211203_初級授業の「話す」について考えよう！.pdf — Japan Foundation
  Kuala Lumpur teacher seminar on speaking in beginner classes. Real conversation has a situation, a purpose,
  an information gap, reactions and a flow. Learners cannot use words they have not learnt, so vocabulary and
  phrases must be ready before free practice (example goal "invite a friend out": ひま, 予定, 〜ませんか,
  すみません、ちょっと…). For beginners the teacher should choose the topic; give a situation and time to prepare.
- https://www.jpf.go.jp/j/urawa/j_rsorcs/methods/dl/kaiwa_U2P1_text.pdf — JF online course on teaching
  conversation: role-play as practice with a set scene and role; for A2, vocabulary first, then a model, then
  the role-play.
- https://langoal.com/books/beginner-conversation.html — a beginner conversation textbook organised by scene
  (taking the train, asking the way, restaurant, hospital … 27 units): the same scenes the town already has.
- https://eikaiwa.weblio.jp/information/?p=63753 — a tutor's free-talk topic table by level; beginner topics are
  one's culture, school, favourite events, future dream. (Written for English lessons; used only for the idea
  of grading topics.)

Small talk in Japan

- https://cotoacademy.com/describe-talk-about-weather-in-japanese/ and
  https://toranomon-ls.com/mastering-small-talk-a-guide-for-japanese-learners — weather is the default opener
  with colleagues, neighbours and strangers (いい 天気ですね), then seasons and seasonal food, restaurants,
  travel, hobbies. Avoided with people you do not know well: salary, age, weight, politics, illness, and
  comparing Japan unfavourably with other countries.
- https://trykaiwa.com/blog/japanese-conversation-starters-that-work — openers that work are remarks about the
  shared situation, not personal questions.
  (These three are language-school blogs, not research; they agree with each other.)

Cambodia

- https://en.wikipedia.org/wiki/Pchum_Ben and
  https://www.smithsonianmag.com/travel/festivals-dead-around-world-180953160/ — Pchum Ben (15 days, ending on
  the 15th day of the 10th Khmer month, September–October): families bring food to the pagoda for their
  ancestors; second in importance only to Khmer New Year. Obon belongs to the same family of festivals
  (ancestors' spirits return; people go back to their hometowns).
- https://helloangkor.com/events-festivals-and-holidays/sankranta-festival-khmer-new-year/ and
  https://intocambodia.org/content/khmer-new-year — Khmer New Year, three days in mid-April (14–16 April in 2026):
  going home, offerings at the pagoda, bathing Buddha statues, water splashing, traditional games
  (chol chhoung, bos angkunh), num ansom and kralan. (Travel sites; day-by-day details not used.)
- https://phnompenhpost.com/supplements-special-reports/young-cambodians-learning-japanese-widen-their-career-prospects,
  https://www.jica.go.jp/activities/schemes/tech_pro/japancenter/article/2023/1529766_36482.html,
  https://agora-web.jp/?p=171753 — Japanese is learnt mainly for careers: the CJCC job fair draws about
  3,000 job seekers and a dozen Japanese companies; IT universities place graduates at Japanese firms.

Not found: a study of what Cambodian learners themselves most like to talk about, or of anime as a motive
for Cambodian learners. The anime, music and phone topics are therefore ordinary young-adult topics, not a
research finding. The Pchum Ben / Obon comparison rests on general descriptions, so the topic only asks
"what is similar, what is different" and lets the learner be the expert.

## What went into the content

- **Every topic carries its own scaffolding** (`ideasEn`, `startersJa`, `wordsJa`), because the JF seminar's
  main point is that beginners can only talk freely after the words and phrases are in reach.
- **Role-plays are role cards**: place, who the learner is, what they want, plus one complication that the
  partner brings (the first date does not suit the friend, the size is sold out, the manager asks about the
  state of the task before granting the day off). The complication is written into `situationEn`/`openerEn`
  as guidance; no lines are scripted.
- **Chat topics open the Japanese way**: `openerEn` has the partner remark on something or tell a small thing
  about themselves before asking. Partner `newsJa` gives each character something true to bring up.
- **The learner is the expert on Cambodia** in `khmer_food`, `new_year_compare`, `obon_pchum_ben`, `seasons`,
  `commute`, `angkor_guide`, `manners_compare`: an information gap that is real, since the partner does not know.
- **Avoided**: salary, age, religion as belief, politics, war history, romance. `manners_compare` and
  `city_or_country` ask for opinions but tell the partner not to judge either country.
  The learner does not drink alcohol in `izakaya_order` (students; many are under the drinking age in Japan).
- **Twists** are small, harmless interruptions tied to scene props (the konbini cat, the café concert poster,
  the station announcement). The earthquake item is only a test announcement for a drill.

## How topics map to levels

| level | means | what the topics ask for | examples |
|---|---|---|---|
| easy | N5, lessons 1–10 | facts about oneself in です／ます: what, when, where, with whom, likes; fixed service phrases | `self_intro`, `daily_routine`, `favorite_food`, `family`, `weather_today`, `commute`, `cafe_order`, `konbini_shopping`, `home_visit` |
| normal | N4, up to about lesson 25 | wishes (たい), experience (たことが ある), sequences (て), comparing, giving a reason, asking permission, explaining a problem | `seasons`, `new_year_compare`, `it_study`, `dream_job`, `angkor_guide`, `station_lost`, `depato_exchange`, `teacher_advice`, `ask_day_off`, `bug_help`, `interview_casual` |
| hard | N3 | opinions with reasons (と 思います), hypotheticals (たら), abstract comparison, formal interview language | `obon_pchum_ben`, `ai_and_work`, `manners_compare`, `lottery`, `desert_island`, `city_or_country`, `interview_strict`, `interview_hr` |

Counts: easy 33 topics (21 chat, 12 role), normal 57 (36 chat, 21 role), hard 47 (27 chat, 20 role).
A topic listed for several levels is meant to be steered by the engine: same subject, harder follow-up questions.
`startersJa` are written for the lowest level a topic lists. In easy topics they stay inside lessons 1–10,
with one exception: `travel_wish` uses 〜たいです (lesson 13) because the topic cannot be talked about without it.

## Partners

- `worksAt` is set only where the scene has a staff-type slot for that person: `hayakawa` classroom,
  `nishimura` depato, `okada` station, `ueda` museum, `sakamoto` cafe, `noguchi` konbini, `ishida` clinic,
  `nakano` izakaya. Colleagues and interviewers (`aoki`, `ogawa`, `fujita`, `murakami`, `kuroiwa`, `shiraishi`)
  have `null`: the office and interview room give them ordinary `npc` slots.
- `casual: true` for `fujita`, `ana`, `minh`, `noguchi` (the four the scenario spec lets speak plain style from
  lesson 20). `noguchi` is also staff at the konbini; in the two konbini role-plays he should stay polite.
- `newsJa` uses lesson 1–10 grammar only (ます／ました, あります／います, adjectives in the present, もらいました).
- Details not in `cast.js` were invented to give people something to talk about and should be treated as
  canon from now on if kept: Ogawa's daughter, Okada's and Sakamoto's grandchildren, Nakano's son,
  Shiraishi's cat Kuro, Kuroiwa's shogi, Murakami's yoga, Ueda's French, Fujita's guitar.
