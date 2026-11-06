# Charity UNDOKAI 2026 — Instagram reel「運動会 絆」

This is a 30-second Instagram Reel to recruit AUPP students for the Charity UNDOKAI on 28 Nov 2026 (AUPP × Osaka Sangyo University). The theme is **絆 (KIZUNA = bond)**. The text is in English, and kanji are used only as design elements: 運動会, 絆, 協力, 仲間, 思い出.

| | |
|---|---|
| Finished video | [output/undokai_2026_reel.mp4](output/undokai_2026_reel.mp4) (1080×1920, 30 fps, 29.97 s, H.264 + AAC) |
| 720p share copy | [output/undokai_2026_reel_720p.mp4](output/undokai_2026_reel_720p.mp4) |
| Cover candidates | [cover_hook.jpg](output/cover_hook.jpg) (title over the cavalry) ・ [cover_info.jpg](output/cover_info.jpg) (date and place) |

## Storyboard

Every cut and pop lands on the beat of the BGM (165 BPM).

| Time | Footage (Undokai 2025) | On screen |
|---|---|---|
| 0.0–3.1 s | A cavalry team (騎馬) charging at the camera, then the battle clash | The banner's 運動会・絆 title slams in with confetti, then shrinks to a badge |
| 3.1–4.6 s | Opening ceremony: team flags, the Japanese and Cambodian flags | **JAPAN × CAMBODIA** |
| 4.6–6.7 s | Team intro clips | RED / BLUE / WHITE TEAM cards on striped team colours |
| 6.7–14.7 s | Building the human horse → the lift (2× speed) → riding → battle | Hanko stamp **協力 TEAMWORK** |
| 14.7–16.2 s | Tug-of-war photo; the card jerks on every beat | PULL! |
| 16.2–20.6 s | Flag runner → three photos of friends drop in → flag bearer | **仲間 FRIENDS** |
| 20.6–23.5 s | Polaroids of last year drop onto a pile of medals | **思い出 MEMORIES** |
| 23.5–30.0 s | End card: the banner re-laid out vertically (sky, cherry blossoms and Japanese flag, daisies and Cambodian flag) | Date, time, place, how to join (1 school supply), **JOIN US!**, logos. The 絆 sun pulses on the song's final hit |

The speech concept (the five students' messages) is told through the footage, not through text:

- Exchange between the two countries: JAPAN × CAMBODIA
- Helping each other: 協力 (the human horse can't stand without everyone)
- Laughing and cheering together: 仲間
- Memories for life: 思い出
- Glad I joined: JOIN US!

The end card keeps important text within the area Instagram's UI doesn't cover: below the top ~220 px and above the caption area.

## Music

The BGM is the provided "Kusikos Post (TikTok version)". It is cut to 30 s on the beat: the track plays from its first bar to 22.0 s, then jumps exactly 192 beats ahead to the same spot in the last phrase (the point where the spectra match best). This lets the song's own final hit land at 28.93 s, under the end card. Loudness is −14 LUFS (Instagram's level).

## How it's built

| File | Role |
|---|---|
| `scripts/fetch_media.py` | Downloads the shared iCloud album (13 videos, 21 photos) into `media_src/icloud/` through iCloud's public link API. No login needed |
| `scripts/prep_photos.py` | Converts HEIC to JPEG, applies the photo's orientation, and uses the edited version when one exists in the album |
| `scripts/make_assets.py` | Cuts parts out of the banner: the 運動会 brush lettering, UNDOKAI, the 絆 sun, and the bottom corners. Takes the logos from the poster |
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
- **Banner, poster and logos**: the event's own materials (`assets/banner.png`, `assets/poster.png`).
- **BGM**: the provided mp3. It is not in git because its license is unconfirmed. Kusikos Post itself (Necke, early 1900s) is in the public domain, but this arrangement and recording belong to their creator. Before posting, check that the creator allows its use, or use a version of the song from Instagram's music library.
- **Fonts**: Poppins, Yuji Syuku (subset to the 8 kanji used) and Permanent Marker are under the SIL Open Font License. Luckiest Guy is under the Apache License 2.0.
