import sys, json, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(sys.argv[0])))
from wavload import load
from faster_whisper import WhisperModel
model_name, outdir = sys.argv[1], sys.argv[2]
m = WhisperModel(model_name, device="cpu", compute_type="int8", cpu_threads=4)
for p in sys.argv[3:]:
    b = os.path.splitext(os.path.basename(p))[0]
    out = os.path.join(outdir, b + ".json")
    if os.path.exists(out): continue
    t0 = time.time()
    a = load(p)
    segs, info = m.transcribe(a, language="ja", beam_size=5, vad_filter=True, word_timestamps=True,
                              condition_on_previous_text=False,
                              initial_prompt="カンボジアの学生の日本語の自己紹介です。私の名前は")
    res = []
    for s in segs:
        res.append({"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text,
                    "words": [[round(w.start, 2), round(w.end, 2), w.word, round(w.probability, 2)] for w in (s.words or [])]})
    json.dump({"file": b, "segments": res}, open(out, "w"), ensure_ascii=False, indent=0)
    with open(os.path.join(outdir, b + ".txt"), "w") as f:
        for s in res: f.write(f"[{s['start']:7.2f}-{s['end']:7.2f}] {s['text']}\n")
    print(b, "done", round(time.time() - t0), "s", flush=True)
