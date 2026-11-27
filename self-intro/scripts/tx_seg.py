import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wavload import load
from faster_whisper import WhisperModel
m = WhisperModel(sys.argv[1], device="cpu", compute_type="int8", cpu_threads=4)
for spec in sys.argv[2:]:
    p, a, b = spec.split(':'); a, b = float(a), float(b)
    x = load(p)[int(a * 16000):int(b * 16000)]
    segs, _ = m.transcribe(x, language="ja", beam_size=5, condition_on_previous_text=False, temperature=0)
    print(os.path.basename(p), a, b, '|', ' '.join(s.text for s in segs))
