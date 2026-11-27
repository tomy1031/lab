import json, sys
d = json.load(open(sys.argv[1])); a, b = float(sys.argv[2]), float(sys.argv[3])
line = []
for s in d['segments']:
    for w in s['words']:
        if a <= w[0] <= b:
            line.append(f"{w[0]:.1f}{w[2]}")
print(' '.join(line))
