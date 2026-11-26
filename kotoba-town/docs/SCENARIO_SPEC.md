# Kotoba Town — scenario authoring spec

Kotoba Town (ことばタウン) is a WebXR (Meta Quest / PC browser) Japanese speaking-practice game.
The learner stands *inside* a 3D situation (an office lobby, a station platform, a neighbour's door…),
an NPC speaks to them with a **pre-generated voice line**, the learner **answers out loud** (the mic is
open for the whole session), and **Gemini Live** listens, judges the answer and picks the branch.
The engine then plays the next pre-generated line. When the learner goes off-script, Gemini Live
answers in the NPC's own voice, then the script resumes.

Content covers *Minna no Nihongo I*, lessons 1–10. One JSON file per lesson:
`kotoba-town/data/lessons/lNN.json` (`l01.json` … `l10.json`). Research notes go to
`kotoba-town/docs/research/lNN.md`.

Run `node kotoba-town/tools/validate.mjs` after writing; it must print `OK`.

---

## 1. Ground rules

1. **Original writing only.** Do not copy the textbook's dialogues, its characters (Mike Miller,
   Santos, Yamada Ichirō, Satō Keiko, Kimura Izumi, Karina, Wang, Schmidt …) or its company/school
   names (IMC, Power Electric, Sakura University, Fuji University, Apple Bank …). Write new scenes that
   exercise the same grammar. Use the **town cast** in §4.
2. **Level discipline.** NPC lines in lesson *N* may only use grammar from lessons 1…*N* plus fixed
   greetings/set phrases that the textbook introduces as chunks (はじめまして, どうぞ よろしく,
   すみません, ありがとう ございます, いらっしゃいませ, おねがいします, しつれいします, etc.).
   Prefer vocabulary from lessons 1…*N*. Polite です／ます style only (no plain form; no て-form, it is
   lesson 14; no たい, lesson 13; no adjective past in lessons < 12).
3. **Short lines.** One NPC line ≤ 45 characters of Japanese (a line is one audio clip). Split long
   turns into several lines in the same `say` array.
4. **Every learner turn practises this lesson's grammar.** Each `listen` names the grammar ids it
   targets. Across a variant, every grammar point of the lesson should be targeted at least once
   across the 3 variants.
5. **Branch, don't railroad.** Each `listen` has 2–4 branches that react to *different reasonable
   answers* (yes vs no, which item, which time, polite decline vs accept …) — not "correct vs wrong".
   Grammar mistakes are handled by the judge, not by branches.
6. **Natural Japanese.** The NPCs are real people in a real place. They say what a Japanese person
   would actually say there (店員: いらっしゃいませ, 駅員: 2番線です, etc.), slowed down to the
   learner's level.
7. Everything shown to the learner in English (brief, missions, tips, translations) is short, warm
   and clear.

## 2. File format (`lNN.json`)

```jsonc
{
  "lesson": 1,
  "titleJa": "はじめまして",          // lesson title shown on the lesson card (original, not the textbook's)
  "titleEn": "Nice to meet you",
  "summaryEn": "Introduce yourself: name, country, job. Ask others about theirs.",
  "grammar": [                        // ids are g1, g2, … ; the judge sees these
    { "id": "g1", "pattern": "N1は N2です", "meaningEn": "N1 is N2 (topic marker は)",
      "exampleJa": "わたしは アナです。", "exampleEn": "I am Ana." }
  ],
  "vocab": [                          // 10–25 key words used in this lesson's scenes
    { "ja": "会社員", "kana": "かいしゃいん", "en": "company employee" }
  ],
  "tipsEn": [                         // 1–3 culture tips shown on loading screens
    "Bowing slightly while saying はじめまして is natural; a handshake is not expected."
  ],
  "research": {
    "sources": ["https://…", "https://…"],   // the pages you actually read
    "notesEn": "What lesson 1 covers and which real-life situations fit it (3–6 sentences)."
  },
  "variants": [ /* exactly 3 variant objects, see below */ ]
}
```

### Variant

```jsonc
{
  "id": "l01a",                       // lesson id + a/b/c
  "titleJa": "あたらしい かいしゃ",     // kana-friendly title
  "titleEn": "First day at the office",
  "scene": "office",                  // one of the scene ids in §3
  "setup": { "time": "morning", "season": "spring", "weather": "clear" },
                                      // time: morning|noon|evening|night  season: spring|summer|autumn|winter
                                      // weather: clear|cloudy|rain
  "call": false,                      // true = the NPC is on the phone (voice only, phone UI), see §5
  "briefEn": "It's your first day at a design company in Tokyo. Your new colleague meets you in the lobby.",
  "roleEn": "You are a new employee from abroad. Use your own name and country.",
  "missionsEn": [                     // 2–4 checklist items shown in the HUD; each maps to grammar
    { "text": "Tell her your name and country", "grammar": ["g1"] },
    { "text": "Ask whether she is a designer", "grammar": ["g3"] }
  ],
  "characters": ["aoki"],             // cast ids (§4). First one = main partner (Gemini Live speaks as them)
  "positions": { "aoki": "npc1" },    // scene slots (§3); omit to use npc1, npc2 … in order
  "start": "n1",
  "nodes": [ /* see Node */ ],
  "freeTalk": {                       // optional open conversation after the script (Live voice)
    "openerJa": "ほかに しつもんは ありますか。", // pre-generated line that opens free talk
    "openerEn": "Do you have any other questions?",
    "topicEn": "Chat about the office and Tokyo; stay within lesson 1 grammar.",
    "maxTurns": 4
  }
}
```

### Node

A node is: the NPC(s) say 0–3 lines, then either the learner answers (`listen`), or the story moves on
(`next` / `nextRandom`), or it ends (`end`).

```jsonc
{
  "id": "n1",
  "say": [
    { "who": "aoki", "ja": "はじめまして。青木です。", "kana": "はじめまして。あおきです。",
      "en": "Nice to meet you. I'm Aoki.", "gesture": "bow" },
    { "who": "aoki", "ja": "どうぞ よろしく おねがいします。", "kana": "どうぞ よろしく おねがいします。",
      "en": "Pleased to meet you.",
      "alts": [                       // optional: alternative wordings, one is picked at random each play
        { "ja": "よろしく おねがいします。", "kana": "よろしく おねがいします。", "en": "Pleased to meet you." }
      ] }
  ],
  "focus": "logo_wall",               // optional prop id (§3) the camera hint/arrow points at
  "listen": {
    "promptEn": "Introduce yourself: your name and your country.",
    "grammar": ["g1"],
    "hintJa": "はじめまして。わたしは ＿＿です。＿＿じんです。",   // fill-in template shown after 1 miss
    "modelAnswers": [                  // 1–3 full model answers (shown after 2 misses, used by offline mode)
      "はじめまして。わたしは リンです。カンボジアじんです。どうぞ よろしく おねがいします。"
    ],
    "branches": [                      // 2–4; the judge picks one by meaning
      { "id": "full", "whenEn": "Learner said their name AND their nationality or country.", "next": "n2",
        "exampleJa": "わたしは リンです。カンボジアじんです。" },
      { "id": "name_only", "whenEn": "Learner said only their name.", "next": "n2_ask_country",
        "exampleJa": "リンです。" }
    ],
    "fallback": "n2_ask_country"       // used when the learner can't manage after 3 tries
  }
},
{ "id": "n2", "say": [ … ], "next": "n3" },
{ "id": "n2b", "say": [ … ], "nextRandom": ["n3a", "n3b"] },    // vary the order/topic between plays
{ "id": "end_good", "say": [ … ], "end": true }
```

Rules:
- `kana` = the same sentence in hiragana/katakana only, with a space between phrases (分かち書き),
  like a beginner textbook. Names in katakana stay katakana.
- `en` = natural English translation.
- `gesture` (optional): one of `bow_light`, `bow`, `nod`, `wave`, `point`, `offer`, `receive`,
  `think`, `laugh`, `surprised`, `shake_head`, `beckon`, `phone`. `point` needs `"target": "<prop id>"`.
- `who` must be one of the variant's `characters`.
- `tts` (optional): reading override for the voice generator if the kanji reading is ambiguous
  (e.g. `"tts": "にばんせんです。"`). Usually omit.
- Every node except `end` nodes needs exactly one of `listen`, `next`, `nextRandom`.
- All paths must reach an `end` node. Aim for 4–6 `listen` turns per variant along any path, and
  **12–18 spoken lines** in the whole variant (count `alts` too) — voice generation has a budget.
- Every branch has `exampleJa`: one short, correct learner answer (lesson level, kana-friendly) that
  would take that branch. It is shown as a reply choice in offline practice mode and helps the judge.
- `branches[].next` and `fallback` must exist. A branch may loop back (e.g. to ask again).
- Universal learner moves are handled by the engine — **do not write branches for them**:
  "もう いちど おねがいします" (repeat), "わかりません", silence, English, or unrelated speech.
  The engine uses the cast's utility lines (§4) for those.

## 3. Scene catalog

Use only these scene ids, slots and prop ids (source of truth: `SCENES` in `js/content/cast.js`). Props can be `focus` / `point` targets. Distance words
matter for lessons 2–3 (これ／それ／あれ, ここ／そこ／あそこ): each prop lists where it is
relative to the learner (`near` = within the learner's reach → これ/ここ; `npc` = by the NPC → それ/そこ;
`far` = away from both → あれ/あそこ).

| scene | what it looks like | slots | props (zone) |
|---|---|---|---|
| `office` | Bright modern office in Tokyo: lobby with reception counter and logo wall, glass meeting room, open desks, city view | `npc1` facing learner across a small table, `npc2` beside npc1, `reception` behind the counter | `business_card` (near), `my_desk` (near), `pc` (near), `logo_wall` (far), `coffee_machine` (far), `whiteboard` (far), `plant` (npc), `clock` (far), `calendar` (npc), `phone_desk` (npc), `aoki_desk` (npc), `cup` (npc), `meeting_room` (far), `toilet_sign` (far), `elevator` (far), `door` (far) |
| `classroom` | Japanese language school classroom, desks with everyday objects, whiteboard, map of Japan | `teacher` at the front, `npc1` classmate on the left, `npc2` classmate on the right | `book` (near), `dictionary` (near), `notebook` (near), `pen` (near), `pencil` (near), `key` (near), `umbrella` (npc), `bag` (npc), `watch` (npc), `camera` (npc), `magazine` (npc), `newspaper` (far), `whiteboard` (far), `map_japan` (far), `clock` (far), `chocolate` (near), `coffee` (npc), `eraser` (near) |
| `apartment` | Open-air corridor of a Japanese apartment building (マンション), doors with nameplates, intercom, evening street below | `npc1` at the neighbour's door, `npc2` behind npc1 | `gift` (near), `door_neighbor` (npc), `intercom` (near), `nameplate` (npc), `my_door` (near), `bicycle` (far), `mailbox` (far), `umbrella_stand` (npc), `stairs` (far) |
| `depato` | Department store floor: wine & food counter, ties/umbrella/bag counters, escalator, floor guide | `clerk` behind the counter, `npc1` next to the learner (another customer / friend) | `wine_fr` (npc), `wine_it` (npc), `wine_jp` (npc), `tie_blue` (near), `tie_red` (near), `watch_case` (npc), `umbrella_rack` (far), `bag_shelf` (far), `floor_guide` (near), `escalator` (far), `elevator` (far), `register` (npc), `toilet_sign` (far) |
| `museum` | Art museum entrance hall: ticket counter, opening-hours sign, posters, gate | `counter` behind the ticket counter, `npc1` beside the learner | `hours_sign` (npc), `ticket` (npc), `poster` (far), `brochure` (near), `clock` (far), `gate` (far), `locker` (far), `painting` (far), `cafe_sign` (far) |
| `station` | Commuter train station: ticket gates, ticket machines, route map, departure board, platforms 1–4, a train arrives | `staff` at the gate window, `npc1` passenger near the learner | `departure_board` (far), `route_map` (npc), `ticket_machine` (near), `ticket_gate` (npc), `platform_sign` (far), `train` (far), `clock` (far), `bench` (near), `vending_machine` (far), `bus_stop_sign` (far), `platform_sign_2` (far), `post_office` (far), `bank` (far), `supermarket` (far) |
| `cafe` | Small warm café near the office: counter, menu board with prices, cake case, tables by the window | `counter` behind the counter, `npc1` at the learner's table (sitting across), `npc2` | `menu_board` (npc), `cake_case` (npc), `coffee_cup` (near), `tea_cup` (near), `table` (near), `window` (far), `poster_concert` (far), `newspaper` (far), `register` (npc), `cd_player` (npc), `clock` (far) |
| `park` | City park in cherry-blossom season (or autumn leaves): path, benches, pond, a castle tower in the distance, food stalls | `npc1` in front of the learner on the path, `npc2` on the bench | `sakura` (npc), `bench` (near), `pond` (far), `castle` (far), `vending_machine` (far), `food_stall` (far), `picnic_sheet` (near), `bento` (near), `camera` (near), `bicycle` (far), `drinks` (near) |
| `home` | Japanese family home: genkan (entry step, shoe box, slippers), living room with sofa and low table, dining table, kitchen, garden window | `host` (front), `host2` (beside host) | `genkan` (near), `slippers` (near), `gift` (near), `sofa` (npc), `table` (near), `tea` (near), `cake` (near), `spoon` (near), `tv` (far), `photo` (npc), `clock` (far), `garden` (far), `kitchen` (far), `piano` (far), `shoes` (npc) |
| `konbini` | Convenience store / small supermarket: aisles, drink fridges, spice corner, onigiri, register, ATM, copy machine | `clerk` behind the register, `npc1` shopper in the aisle | `register` (npc), `atm` (far), `copy_machine` (far), `drinks_fridge` (far), `spices` (far), `onigiri` (near), `bento` (near), `bread` (npc), `magazines` (far), `basket` (near), `toilet_sign` (far), `entrance` (far), `box` (far), `cat` (far), `umbrella_stand` (far), `batteries` (far) |

Scene sounds and lighting follow `setup.time`, `season`, `weather` automatically.

## 4. Town cast (recurring characters)

Use these people. They live in the same town, so they can appear in several lessons (that is the
point — the learner gets to know them). You may add **at most one new character per lesson** if a
scene truly needs it: then give it a full object instead of an id in `characters` (same fields as
below, plus `look` — the format is documented above `CAST` in `kotoba-town/js/content/cast.js`). Prefer the cast.

| id | name (ja / kana) | who | voice | speech style |
|---|---|---|---|---|
| `mori_aya` | 森 あや / もり あや | Next-door neighbour, mid-30s, warm, works part-time at a flower shop | Aoede | gentle, chatty, a little curious |
| `mori_shun` | 森 しゅん / もり しゅん | Aya's husband, 40s, bank employee, likes baseball and cooking | Iapetus | calm, polite, dry humour |
| `aoki` | 青木 みお / あおき みお | Colleague at the design company, 26, cheerful, team's designer | Laomedeia | bright, quick to laugh |
| `ogawa` | 小川 まさる / おがわ まさる | Department manager (部長), 55, glasses, kind but formal | Charon | measured, formal |
| `fujita` | 藤田 れん / ふじた れん | Colleague/friend, 29, engineer, loves music, soccer and ramen | Puck | relaxed, friendly |
| `hayakawa` | 早川 ともこ / はやかわ ともこ | Japanese teacher at the language school, 40s | Sulafat | clear, encouraging, teacher-like |
| `ana` | アナ・シルバ | Classmate from Brazil, 23, also learning Japanese (speaks simply) | Autonoe | enthusiastic |
| `minh` | グエン・ミン | Classmate from Vietnam, 25, engineer student (speaks simply) | Umbriel | easy-going |
| `nishimura` | 西村 さき / にしむら さき | Department store clerk, 30s, uniform with scarf | Despina | very polite shop Japanese |
| `okada` | 岡田 ひろし / おかだ ひろし | Station staff, 50s, uniform and cap | Alnilam | brisk, helpful |
| `ueda` | 上田 なな / うえだ なな | Museum receptionist, late 20s | Erinome | crisp, polite |
| `sakamoto` | 坂本 じろう / さかもと じろう | Owner of the café, 60s, beard, apron | Achird | warm, grandfatherly |
| `hara` | 原 きよ / はら きよ | Elderly lady who walks in the park every day, 70s | Vindemiatrix | slow, kind |
| `noguchi` | 野口 たくみ / のぐち たくみ | Konbini clerk, 20, university student | Zubenelgenubi | casual-polite |
| `takeuchi` | 竹内 えみ / たけうち えみ | Office worker the learner meets around town (station, café, park), 40s | Kore | efficient, kind |

Utility lines (generated once per cast member, used by the engine — do not write them):
`again` すみません、もう いちど おねがいします。 / `slow` ゆっくりで いいですよ。 /
`hmm` ええと……。 / `ok` はい。 / `sodesuka` そうですか。

## 5. Phone calls (`"call": true`)

Lesson 4-style phone calls: the learner stands in the scene (e.g. `office` at their desk) holding a
smartphone; the main character's voice comes out of the phone and a call card with their portrait is
shown. Use `positions` to leave the character out of the room (`"positions": { "ueda": "phone" }`).

## 6. How the judge uses your data (so you write it well)

For every `listen`, Gemini Live hears the learner's audio together with: the NPC's last lines, the
`promptEn`, the target grammar (`pattern` + `meaningEn`), the `modelAnswers`, and each branch's
`whenEn`. It returns: what it heard, which branch matches, a 0–3 score, a corrected sentence and a
short English tip. So:
- `whenEn` must describe the **meaning** of the learner's answer, be mutually exclusive, and cover the
  plausible answers.
- `modelAnswers` must be correct, natural and *at this lesson's level*.
- `promptEn` tells the learner what to do without giving the Japanese away.

---

## 7. Lessons 11–20 (second half of 『みんなの日本語 初級I』 up to lesson 20)

Same format, same rules (3 variants per lesson, original writing, town cast, `exampleJa` on every branch,
12–18 spoken lines, ≤ 45 characters per line, 4–6 learner turns). The **level discipline** moves with
the lesson: NPC lines in lesson *N* use grammar from lessons 1…*N* only.

| lesson | grammar it trains (research the details) | ideas for places (pick 3 different) |
|---|---|---|
| 11 | counters いくつ・〜つ・〜人・〜台・〜枚・〜回, periods 〜時間・〜日・〜週間・〜か月・〜年, 〜に 〜回, 〜だけ, 〜ぐらい | post/stamps & parcels at the konbini or depato, family size at home, how long you have studied Japanese |
| 12 | past of adjectives and nouns (〜かったです, 〜でした, 〜じゃ ありませんでした), comparisons AはBより, AとBと どちらが, 〜の ほうが, 〜の 中で 何が いちばん | after a trip or a festival (park, office), choosing between two things in a shop |
| 13 | 〜が ほしいです, 〜たいです, 〜へ 〜に 行きます (purpose) | ordering & paying 別々に (izakaya or café), weekend plans, a shopping wish |
| 14 | て-form, 〜て ください, 〜て います (in progress), 〜ましょうか | asking for help at the station/office, offering help, directions |
| 15 | 〜ても いいですか, 〜ては いけません, 〜て います (state: 住んで/結婚して/知って/働いて) | museum rules (写真を とっても いいですか), family talk at home, office rules |
| 16 | 〜て、〜て (sequence), 〜てから, adjective て-form (〜くて／〜で), AはBが〜 | how to use the ticket machine / ATM, describing a town or a person |
| 17 | ない-form, 〜ないで ください, 〜なければ なりません, 〜なくても いいです, 〜までに | at the clinic (the doctor's advice), deadlines at the office, home rules |
| 18 | dictionary form, 〜ことが できます, 趣味は 〜ことです, 〜まえに | hobbies chat, what you can do, before doing something |
| 19 | た-form, 〜たことが あります, 〜たり 〜たり します, 〜く なります／〜に なります | experiences (富士山, すし …), what you did at the weekend, getting better after being ill |
| 20 | plain (casual) style 普通形 between friends | friends at the izakaya or the park (藤田, アナ, ミン, 野口 speak casually; keep it natural) |

New since lesson 11:
- **New scenes** `clinic` and `izakaya` (see the catalog below and `SCENES` in `js/content/cast.js`).
- **New cast**: `ishida` 石田 みちこ (いしだ みちこ) — doctor at the town clinic, 50s, kind, clear (voice Achernar);
  `nakano` 中野 だいち (なかの だいち) — owner of the izakaya 「だいち」, 40s, cheerful, loud (voice Sadachbia).
- From lesson 20, friends may speak in plain style (that is the lesson). Elders and staff stay polite.

| scene | what it looks like | slots | props (zone) |
|---|---|---|---|
| `clinic` | A small town clinic: reception counter with a nurse window, waiting room with benches, magazines and a health poster; through a door the consultation room with the doctor's desk, monitor and an examination bed | `reception` behind the counter, `doctor` sitting at the desk in the consultation room, `npc1` beside the learner (a companion or another patient), `phone` | `insurance_card` (near), `questionnaire` (near), `thermometer` (near), `bench` (near), `medicine` (npc), `exam_bed` (npc), `doctor_desk` (npc), `clinic_sign` (far), `clock` (far), `poster` (far), `calendar` (far), `window` (far), `door` (far), `magazine` (far) |
| `izakaya` | A cosy izakaya: the learner sits at a low table; wooden counter with stools, hand-written menu strips on the wall, red lanterns, noren at the door, a fish tank | `staff` standing at the table, `npc1` sitting across, `npc2` sitting beside npc1, `phone` | `menu` (near), `beer` (near), `edamame` (near), `oshibori` (near), `chopsticks` (near), `yakitori` (npc), `sake` (npc), `menu_strips` (far), `lantern` (far), `counter` (far), `register` (far), `clock` (far), `noren` (far), `fish_tank` (far) |

**Moving the learner** (works in any lesson, not only interviews): a node may carry `"learner": "walk" | "sit" | "stand"`
(applied before that node's lines).
- `clinic`: the learner starts in the waiting room in front of the reception counter (talk to `reception`).
  `"learner": "walk"` moves them into the consultation room onto the patient stool in front of the doctor,
  then `"learner": "sit"` sits them down (talk to `doctor`). Put the walk on the node where the nurse calls them in.
- `izakaya`: the learner arrives standing at the end of the table; use `"learner": "sit"` on the first node
  (or when they are shown to the table) so they sit with the others.
