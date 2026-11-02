# -*- coding: utf-8 -*-
"""Threshold sweep off-line dari hasil evaluasi FaceNet (facenet_metrics.json)."""
import glob
import json
from pathlib import Path

import numpy as np

ev = sorted(glob.glob(str(Path(__file__).parent.parent / "training_runs" / "facenet_eval_*")))[-1]
r = json.load(open(Path(ev) / "facenet_metrics.json"))
print("run:", ev)
THRS = [0.8, 0.9, 1.0, 1.05, 1.1, 1.15785, 1.2, 1.3]
print(f"{'thr':>6} | {'GAR':>5} {'FAR_all':>8} {'FAR_unknown':>12} | {'ok-accept':>9} | {'wrong-accept':>13} | model")
for name in r:
    d = r[name]
    gd = np.array(d["genuine_d"])
    im = np.array(d["impostor_d"])
    un = np.array(d["unknown_min_dist"])
    pred = np.array(d["pred_ids"])
    true = np.array(d["true_ids"])
    for thr in THRS:
        ok = ((pred == true) & (gd <= thr)).mean()
        wrong = ((pred != true) & (gd <= thr)).mean()
        print(
            f"{thr:>6.2f} | {(gd <= thr).mean():>5.3f} "
            f"{(np.concatenate([im, un]) <= thr).mean():>8.3f} "
            f"{(un <= thr).mean():>12.3f} "
            f"| {ok:>9.3f} "
            f"| {wrong:>13.3f} | {name}"
        )
    print()
