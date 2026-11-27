"""Sample frames every 0.5s from a 1080p video, detect faces (YuNet if available, else Haar), and save the top candidates."""
import cv2, sys, os, json, numpy as np
vid, outdir, model = sys.argv[1], sys.argv[2], sys.argv[3]
b = os.path.splitext(os.path.basename(vid))[0]
cap = cv2.VideoCapture(vid)
fps = cap.get(cv2.CAP_PROP_FPS); n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
det = cv2.FaceDetectorYN.create(model, "", (1920, 1080), 0.7, 0.3, 50)
cands = []
step = int(round(fps / 2))
i = 0
while True:
    ok = cap.grab()
    if not ok: break
    if i % step == 0:
        ok, fr = cap.retrieve()
        if not ok: break
        h, w = fr.shape[:2]
        det.setInputSize((w, h))
        _, faces = det.detect(fr)
        if faces is not None:
            for f in faces:
                x, y, fw, fh = [int(v) for v in f[:4]]; score = float(f[-1])
                if fw < 40: continue
                x0, y0 = max(0, x), max(0, y)
                crop = cv2.cvtColor(fr[y0:y0+fh, x0:x0+fw], cv2.COLOR_BGR2GRAY)
                if crop.size == 0: continue
                sharp = cv2.Laplacian(crop, cv2.CV_64F).var()
                # landmarks: right eye, left eye, nose, mouth r, mouth l → frontalness from nose centering
                le, re, nose = f[4:6], f[6:8], f[8:10]
                eyemid = (le + re) / 2; eyed = np.linalg.norm(le - re) + 1e-6
                yaw = abs(nose[0] - eyemid[0]) / eyed
                cands.append(dict(t=round(i / fps, 2), x=x, y=y, w=fw, h=fh, score=round(score, 3), sharp=round(sharp, 1), yaw=round(float(yaw), 3)))
    i += 1
json.dump(cands, open(os.path.join(outdir, b + "_faces.json"), "w"))
print(b, len(cands), "faces")
