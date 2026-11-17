# b04 先輩に 相談する — research notes

Episode 4 of Story A 「喫茶さかもとの 予約アプリ」. Skill: consulting a senior engineer
(状況 → 試したこと → 聞きたいこと), and what to do when the senior is busy.

## Sources read

- https://zenn.dev/harryduck/articles/ae8e1d02e7aaa2 — a question template for asking senior engineers:
  困っていること (with the exact error text / screenshot) → 環境 → トライしたこと (and the result) → 備考・考察
  (your own guess). Share what you already searched so you don't get the same suggestion back; keep it
  short, in bullet points.
- https://zenn.dev/komenikusweet/articles/cecea647fc2db9 — an engineer's own order for asking a senior:
  ① check the other person's availability ② current state ③ the problem ④ what I tried / found
  ⑤ by when I need an answer. Decide how long to struggle alone, then ask.
- https://news.mynavi.jp/article/20230419-2590587/ — how to open a consultation with a boss/senior:
  first ask whether now is OK (「相談したいことがあるため、今、少々お時間いただいてもよろしいでしょうか」),
  name the topic, give the time needed (5分程度 / 30分程度) so they can decide now or later; if it is urgent
  say so; if now is bad, fix another time or send it in writing.

Search results seen but not opened (not used as sources): lifehacker.jp, president.jp and toyokeizai.net
pieces on "state the time you need" (e.g. 「30秒だけ いいですか」).

## What went into the scenario

- Opening phrase 「今 少し よろしいでしょうか。〜の 件で ご相談が あります」 (g1): availability first, then topic.
  A branch reacts when the learner skips it and starts with the problem.
- 状況 (g2) = screen + action + result, with the exact error text as a bonus branch (藤田 calls it
  「いい 手がかり」). 試したこと (g3) and one clear question (g4) follow; if the learner says what they tried
  but asks nothing, 藤田 asks 「聞きたい ことは 何ですか」.
- Variant b: 藤田 is in release work. The learner asks for 「15分ほど」 (g5), gets 3時, and offers to send the
  situation and what they tried by chat first — the written template from the Zenn article. Giving up
  ("一人で やって みます") gets 「一人で 悩まないで ください」.
- Both end with 復唱 + promise to report the result (g6).
- Nobody is made to look incompetent: the cause is the calendar library's date format (shared fact).

## Facts used / introduced

- Shared: booking form, choose a date → 保存 → error; hint 「日付の 形式を そろえて みて」.
- Introduced: the error text 「日付の 形式が 正しく ありません」; what the learner tried (read the library
  documentation; other dates give the same error); in b, 藤田 is busy with release work for another project
  and is free from 3時.
