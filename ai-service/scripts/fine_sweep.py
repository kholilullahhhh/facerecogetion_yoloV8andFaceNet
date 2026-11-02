# -*- coding: utf-8 -*-
"""Fine threshold sweep from saved fullscale_results.json (no re-embedding needed).
For thr < 0.8 every accepted unknown is inside false_accepts@0.8 list -> exact counts.
Run after fullscale_eval.py."""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))

with open(os.path.join(HERE, "fullscale_results.json"), encoding="utf-8") as f:
    r = json.load(f)

unk = sorted(x["dmin"] for x in r["unknown"]["false_accepts@0.8"])  # all unknown dmin <= 0.8
n_unk = r["unknown"]["n"]
worst_enr = max(v["worst_dmin"] for v in r["enrolled"]["per_student"].values() if v["n"])
print(f"enrolled n={r['enrolled']['n']} worst_dmin={worst_enr}  unknown n={n_unk} lowest_dmin={unk[0]}")
print("\nfine sweep (TAR is 100% for every thr >= worst_enr):")
for t in [0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80]:
    if t < worst_enr:
        continue
    acc = sum(1 for x in unk if x <= t)
    print(f"  thr={t:.2f}  TAR=100% ({r['enrolled']['n']}/{r['enrolled']['n']})   FAR={100*acc/n_unk:5.2f}% ({acc}/{n_unk})")
print("\n15 impostor terdekat:", [x for x in unk[:15]])
