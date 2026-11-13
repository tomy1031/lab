# Charity UNDOKAI 2026 — Instagram reel「運動会 絆」

This is a 30-second Instagram Reel to recruit AUPP students for the Charity UNDOKAI on 28 Nov 2026 (AUPP × Osaka Sangyo University). The theme is **絆 (KIZUNA = bond)**. The text is in English, and kanji are used only as design elements: 運動会, 絆, 協力, 仲間, 思い出.

| | |
|---|---|
| Finished video | [output/undokai_2026_reel.mp4](output/undokai_2026_reel.mp4) (1080×1920, 30 fps, 29.97 s, H.264 + AAC) |
| 720p share copy | [output/undokai_2026_reel_720p.mp4](output/undokai_2026_reel_720p.mp4) |
| Cover candidates | [cover_hook.jpg](output/cover_hook.jpg) (title) ・ [cover_japan.jpg](output/cover_japan.jpg) (STUDENTS FROM JAPAN) ・ [cover_info.jpg](output/cover_info.jpg) (date and place) |

## Storyboard

Every cut and pop lands on the beat of the BGM (165 BPM). The main selling point is that **university students from Japan are coming**. There is no cavalry battle this year, so the cavalry appears only once, as a short shot for atmosphere.

| Time | Footage | On screen |
|---|---|---|
| 0.0–2.4 s | Flag runner (2025) | The banner's 運動会・絆 title slams in with confetti |
| 2.4–4.6 s | Animation: the Japanese flag's red circle, then a plane flying OSAKA → PHNOM PENH | **STUDENTS FROM JAPAN ARE COMING!** |
| 4.6–6.0 s | Group photo of the Osaka Sangyo students (peace signs, face paint) | OSAKA SANGYO UNIV. / SEE YOU AT AUPP! |
| 6.0–7.5 s | Two Osaka Sangyo students waving the team flags | LET'S PLAY TOGETHER! |
| 7.5–8.9 s | Opening ceremony: the Japanese and Cambodian flags (2025) | **JAPAN × CAMBODIA** |
| 8.9–11.1 s | Team intro clips (2025) | RED / BLUE / WHITE TEAM cards |
| 11.1–12.6 s | One cavalry lift at 2× speed (atmosphere only) | Hanko stamp **協力 TEAMWORK** |
| 12.6–15.5 s | Tug-of-war (the card jerks on every beat) → flag bearer | PULL! |
| 15.5–17.7 s | Three photos of friends drop in | **仲間 FRIENDS** |
| 17.7–19.8 s | Polaroids of last year drop onto a pile of medals | **思い出 MEMORIES** |
| 19.8–23.5 s | Split screen: the Japanese students on top, AUPP students below | JAPAN / CAMBODIA. The × in the middle becomes the **絆** sun (KIZUNA = BOND) |
| 23.5–30.0 s | End card: the banner re-laid out vertically | **PLAY WITH STUDENTS FROM JAPAN!**, date, time, place, how to join (1 school supply), **JOIN US!**, logos. The 絆 sun pulses on the song's final hit |

The speech concept (the five students' messages) is told through the footage, not through text:

- Exchange between the two countries: STUDENTS FROM JAPAN, JAPAN × CAMBODIA
- Helping each other: 協力 (the lift, the tug-of-war)
- Laughing and cheering together: 仲間
- Memories for life: 思い出
- A new bond: the split screen that turns into 絆
- Glad I joined: JOIN US!

The end card keeps important text within the area Instagram's UI doesn't cover: below the top ~220 px and above the caption area.

## Music

The BGM is the provided "Kusikos Post (TikTok version)". It is cut to 30 s on the beat: the track plays from its first bar to 22.0 s, then jumps exactly 192 beats ahead to the same spot in the last phrase (the point where the spectra match best). This lets the song's own final hit land at 28.93 s, under the end card. Loudness is −14 LUFS (Instagram's level).

## How it's built

| File | Role |
|---|---|
| `scripts/fetch_media.py` | Downloads the shared iCloud album (13 videos, 21 photos) into `media_src/icloud/` through iCloud's public link API. No login needed |
| `scripts/prep_photos.py` | Converts HEIC to JPEG, applies the photo's orientation, and uses the edited version when one exists in the album |
| `scripts/make_assets.py` | Cuts parts out of the banner: the 運動会 brush lettering, UNDOKAI, the 絆 sun, and the bottom corners. Takes the AUPP seal from `assets/logo_aupp.jpg` and the other logos from the poster |
| `scripts/music.py` | The 30 s BGM edit described above |
| `scripts/render.py` | Python compositor (OpenCV + Pillow). Video is decoded through ffmpeg, colour-graded, then cropped to 9:16 and zoom-punched. Adds text stickers, hanko stamps, polaroids and confetti, then encodes with x264 |
| `build.sh` | Runs everything in order |

```bash
pip install numpy scipy opencv-python-headless pillow pillow-heif pyloudnorm
# put the BGM at media_src/bgm_kusikos_post.mp3 (not in git)
./build.sh            # about 2 minutes
python3 scripts/render.py /tmp/stills --stills 1.0,8.0,26.5   # check single frames
```

## Materials and rights

- **Photos and videos**: the Undokai 2025 shared album (iCloud). They show the participants' faces, so the originals are not in git. Get them with `fetch_media.py`.
- **Osaka Sangyo students' photos**: provided by the organisers. Put them in `media_src/japan/` as `jp_group.jpg` and `jp_flags.jpg` (not in git). The photo of three people in front of the "INDOKAI di Yogyakarta" banner isn't used, because that banner is from a different event.
- **Banner, poster and logos**: the event's own materials (`assets/banner.png`, `assets/poster.png`). The AUPP seal comes from the official logo file `assets/logo_aupp.jpg` (provided by the organisers); only the seal is used in the logo row, because the wordmark would be too small to read there.
- **BGM**: the provided mp3. It is not in git because its license is unconfirmed. Kusikos Post itself (Necke, early 1900s) is in the public domain, but this arrangement and recording belong to their creator. Before posting, check that the creator allows its use, or use a version of the song from Instagram's music library.
- **Fonts**: Poppins, Yuji Syuku (subset to the 8 kanji used) and Permanent Marker are under the SIL Open Font License. Luckiest Guy is under the Apache License 2.0.
