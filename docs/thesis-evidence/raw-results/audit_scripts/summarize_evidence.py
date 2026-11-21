# -*- coding: utf-8 -*-
"""One-shot aggregator: prints every aggregate number used in docs/thesis-evidence/*.md.

Sources (read-only):
- docs/thesis-evidence/raw-results/dataset_scan.json
- docs/thesis-evidence/raw-results/api_latency_results.json
- ai-service/training_runs/facenet_eval_20261103_025239/facenet_metrics.json
- ai-service/training_runs/yolo_*/yolo_train_metrics.json

Usage: python summarize_evidence.py
"""
from collections import Counter
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[4]
RAW = Path(__file__).resolve().parent.parent

print("=" * 70)
scan = __import__("json").load(open(RAW / "dataset_scan.json", encoding="utf-8"))
raw_st = scan["raw"]["per_student"]
tot = Counter()
for s in raw_st:
    for k in ("photos", "readable", "no_face", "single_face", "multi_face"):
        tot[k] += s.get(k, 0)
print(f"RAW students={len(raw_st)} photos={tot['photos']} readable={tot['readable']} "
      f"single={tot['single_face']} multi={tot['multi_face']} no_face={tot['no_face']}")
res = Counter()
bs = Counter()
roll = []
for r in scan["per_image"]["raw"]:
    if not r.get("readable"):
        continue
    res[r["res"]] += 1
    b = r.get("brightness_mean")
    if b is not None:
        bs["dark_lt120" if b < 120 else "normal_120_190" if b <= 190 else "bright_gt190"] += 1
    if r.get("roll_deg") is not None:
        roll.append(r["roll_deg"])
print("raw resolutions:", res.most_common())
print("brightness buckets:", dict(bs))
roll = np.array(roll)
print(f"roll: n={len(roll)} min={roll.min():.1f} max={roll.max():.1f} mean={roll.mean():.2f} std={roll.std():.2f} abs>5deg={(np.abs(roll) > 5).sum()}")
nf = Counter(str(r.get("n_faces_yunet")) for r in scan["per_image"]["raw"] if r.get("readable"))
print("face counts per image:", dict(nf))
multis = [(r["path"], r["n_faces_yunet"]) for r in scan["per_image"]["raw"] if r.get("n_faces_yunet", 0) >= 2]
print("multi-face images:", len(multis))
for p, n in multis[:6]:
    print("   ", n, p)
nofaces = [r["path"] for r in scan["per_image"]["raw"] if r.get("n_faces_yunet") == 0]
print("no-face images:", len(nofaces))
for p in nofaces[:6]:
    print("   ", p)
f = scan["facenet"]
sizes = Counter()
for s in f["per_student"]:
    for k, v in s.get("sizes", {}).items():
        sizes[k] += v
print(f"FACENET students={f['total_students']} crops={f['total_crops']} sizes={sizes.most_common(4)}")
print("facenet students:", [s["student"] for s in f["per_student"]])
y = scan["yolo"]["splits"]
print("YOLO:", {k: {kk: v[kk] for kk in ("images", "labels", "empty_labels", "total_boxes", "classes", "boxes_per_image")} for k, v in y.items()})
empty = [r["path"] for r in scan["per_image"]["yolo"] if r.get("label_boxes") == 0]
print("yolo empty labels:", empty)

print("=" * 70)
MET = __import__("json").load(open(REPO / "ai-service" / "training_runs" / "facenet_eval_20261103_025239" / "facenet_metrics.json", encoding="utf-8"))
print("EVAL root keys:", list(MET.keys()))
for m, v in MET.items():
    if isinstance(v, dict) and "summary" in v:
        print(f"[{m}] summary:", {k: v["summary"].get(k) for k in list(v["summary"].keys())[:12]})
        for k in ("meta", "config", "protocol"):
            if k in v:
                print("   ", k, str(v[k])[:400])
        c = v.get("confusion") or {}
        if c:
            print("    confusion labels:", c.get("labels"), "n_pred:", len(c.get("pred", []) or []))
for m in ("baseline", "facenet_ep07"):
    d = MET.get(m)
    if not d:
        continue
    gd = np.array(d["genuine_d"]); im = np.array(d["impostor_d"]); un = np.array(d.get("unknown_min_dist", []))
    print(f"[{m}] n_genuine={len(gd)} n_impostor={len(im)} n_unknown={len(un)}")
    print(f"    genuine  mean={gd.mean():.4f} median={np.median(gd):.4f} max={gd.max():.4f}")
    print(f"    impostor mean={im.mean():.4f} median={np.median(im):.4f} min={im.min():.4f}")
    if len(un):
        print(f"    unknown  mean={un.mean():.4f} median={np.median(un):.4f} min={un.min():.4f}")
    imp_all = np.concatenate([im, un]) if len(un) else im
    for t in (0.8, 1.0, 1.2):
        far = float((imp_all <= t).mean()); frr = float((gd > t).mean())
        print(f"    @thr={t}: FAR={far:.4f} FRR={frr:.4f}")

print("=" * 70)
import glob as _g
yt_paths = _g.glob(str(REPO / "ai-service" / "training_runs" / "yolo_*" / "yolo_train_metrics.json"))
yt = __import__("json").load(open(yt_paths[-1], encoding="utf-8"))
print("YOLO train metrics:", {k: yt[k] for k in yt if not isinstance(yt[k], (dict, list))})
for k, v in yt.items():
    if isinstance(v, dict):
        print("  ", k, str(v)[:300])

print("=" * 70)
lat = __import__("json").load(open(RAW / "api_latency_results.json", encoding="utf-8"))
print("latency dim:", lat["embedding_dimension"])
for ep in ("detect", "embedding", "recognize"):
    print(ep, lat[ep]["stats_resp_ms"])
for k in ("stats_detection_ms", "stats_embedding_ms", "stats_matching_ms"):
    print(k, lat["recognize"][k])
