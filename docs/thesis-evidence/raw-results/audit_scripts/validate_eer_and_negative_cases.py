# -*- coding: utf-8 -*-
"""Cross-check ai-service calculate_eer semantics + negative-case /embedding test."""
import json
from pathlib import Path

import httpx
import numpy as np
from sklearn.metrics import roc_curve

REPO = Path(__file__).resolve().parents[4]
MET = json.load(open(REPO / "ai-service" / "training_runs" / "facenet_eval_20261103_025239" / "facenet_metrics.json", encoding="utf-8"))
SCAN = json.load(open(Path(__file__).resolve().parent.parent / "dataset_scan.json", encoding="utf-8"))

print("=== calculate_eer replica (identical pairs: genuine + enrolled-impostor ONLY) ===")
for m in ["baseline", "facenet_ep07"]:
    d = MET[m]
    gd, im = d["genuine_d"], d["impostor_d"]
    all_d = np.array(gd + im)
    labels = np.array([1] * len(gd) + [0] * len(im))
    fpr, tpr, thr = roc_curve(labels, all_d, pos_label=1)
    fnr = 1 - tpr
    i = int(np.nanargmin(np.abs(fpr - fnr)))
    print(f"{m}: calculate_eer -> thr={thr[i]:.4f} eer={((fpr[i] + fnr[i]) / 2):.4f} fpr@={fpr[i]:.4f} fnr@={fnr[i]:.4f}")
    gd = np.array(gd); im = np.array(im)
    ths = np.linspace(0, 2, 4001)
    far = np.array([(im <= t).mean() for t in ths])
    frr = np.array([(gd > t).mean() for t in ths])
    k = int(np.argmin(np.abs(far - frr)))
    print(f"{m}: pair-sweep   -> thr={ths[k]:.4f} EER={((far[k] + frr[k]) / 2):.4f}  (FAR=FRR crossing)")

print("\n=== first 6 roc points (baseline) to expose polarity ===")
d = MET["baseline"]
all_d = np.array(d["genuine_d"] + d["impostor_d"])
labels = np.array([1] * len(d["genuine_d"]) + [0] * len(d["impostor_d"]))
fpr, tpr, thr = roc_curve(labels, all_d, pos_label=1)
for j in range(0, 6):
    print(f"  thr={thr[j]:>9.3f} fpr={fpr[j]:.3f} tpr={tpr[j]:.3f}")

print("\n=== negative case: photo with NO face -> /embedding expect 400 ===")
no_face = [r for r in SCAN["per_image"]["raw"] if r.get("n_faces_yunet") == 0]
f = REPO / no_face[0]["path"]
print("file:", str(f))
data = f.read_bytes()
c = httpx.Client(timeout=60)
r = c.post("http://127.0.0.1:8001/embedding", files={"image": ("n.jpg", data, "image/jpeg")})
print("HTTP status:", r.status_code)
print("body:", json.dumps(r.json(), ensure_ascii=False))

print("\n=== multi-face case: /embedding on an image with >1 faces expect 400 ===")
multi = [r for r in SCAN["per_image"]["raw"] if r.get("n_faces_yunet", 0) >= 2]
if multi:
    f = REPO / multi[0]["path"]
    data = f.read_bytes()
    r = c.post("http://127.0.0.1:8001/embedding", files={"image": ("m.jpg", data, "image/jpeg")})
    print("file:", str(f), "| n_faces:", multi[0]["n_faces_yunet"])
    print("HTTP status:", r.status_code)
    print("body:", json.dumps(r.json(), ensure_ascii=False))
