# -*- coding: utf-8 -*-
"""Generate CSV tables in docs/thesis-evidence/tables from the raw evidence JSONs.

Outputs:
1. dataset_per_student.csv       <- dataset_scan.json (raw + facenet + yolo)
2. model_metrics_summary.csv     <- facenet_eval_20261103_025239/facenet_metrics.json
3. threshold_operating_points.csv <- facenet_metrics.json (FAR/FRR @ 0.8/1.0/1.16/1.2)
4. latency_summary.csv           <- api_latency_results.json

Usage: python make_tables.py   (from audit_scripts/)
"""
import csv
import json
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[4]
RAW = Path(__file__).resolve().parent.parent
TABLES = RAW.parent / "tables"
TABLES.mkdir(exist_ok=True)

scan = json.load(open(RAW / "dataset_scan.json", encoding="utf-8"))
MET = json.load(open(REPO / "ai-service" / "training_runs" / "facenet_eval_20261103_025239" / "facenet_metrics.json", encoding="utf-8"))
lat = json.load(open(RAW / "api_latency_results.json", encoding="utf-8"))

# 1. dataset per student -------------------------------------------------------
with open(TABLES / "dataset_per_student.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["student", "raw_photos", "raw_readable", "raw_single_face", "raw_multi_face",
                "raw_no_face", "facenet_crops", "brightness_mean", "brightness_min", "brightness_max",
                "pct_dark_lt120", "pct_normal_120_190", "pct_bright_gt190",
                "roll_min_deg", "roll_max_deg", "roll_std_deg", "roll_pct_abs_gt5deg"])
    face_by = {s["student"]: s for s in scan["facenet"]["per_student"]}
    for s in scan["raw"]["per_student"]:
        fc = face_by.get(s["student"], {})
        b = s.get("brightness", {}) or {}
        r = s.get("roll_deg", {}) or {}
        w.writerow([s["student"], s["photos"], s["readable"], s["single_face"], s["multi_face"],
                    s["no_face"], fc.get("crops", 0),
                    b.get("mean", ""), b.get("min", ""), b.get("max", ""),
                    b.get("pct_dark_lt120", ""), b.get("pct_normal_120_190", ""), b.get("pct_bright_gt190", ""),
                    r.get("min", ""), r.get("max", ""), r.get("std", ""), r.get("pct_abs_gt5deg", "")])
print("tables/dataset_per_student.csv")

# 2. model metrics summary ------------------------------------------------------
with open(TABLES / "model_metrics_summary.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["model", "AUC", "EER_pct", "EER_threshold", "best_threshold",
                "GAR_at_best_thr_pct", "genuine_mean_dist", "genuine_max_dist",
                "impostor_mean_dist", "impostor_min_dist", "unknown_mean_min_dist",
                "n_genuine_pairs", "n_impostor_pairs", "n_unknown_crops"])
    for m, d in MET.items():
        s = d["summary"]
        w.writerow([m, s["AUC"], round(s["EER"] * 100, 2), round(s["EER_threshold"], 4),
                    round(s["best_threshold"], 4), round(s["GAR@best_thr"] * 100, 2),
                    round(s["genuine_mean_dist"], 4), round(s["genuine_max_dist"], 4),
                    round(s["impostor_mean_dist"], 4), round(min(d["impostor_d"]), 4),
                    round(s["unknown_min_mean_dist"], 4), s["genuine_pairs"],
                    s["impostor_pairs"], s["unknown_crops"]])
print("tables/model_metrics_summary.csv")

# 3. threshold operating points -------------------------------------------------
with open(TABLES / "threshold_operating_points.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["model", "threshold", "FAR_all_pct", "FAR_enrolled_only_pct",
                "FAR_unknown_open_set_pct", "FRR_pct", "TAR_pct"])
    for m in ("baseline", "facenet_ep07"):
        d = MET[m]
        gd = np.array(d["genuine_d"]); im = np.array(d["impostor_d"]); un = np.array(d["unknown_min_dist"])
        imp_all = np.concatenate([im, un])
        for t in (0.8, 1.0, 1.16, 1.2):
            far_all = float((imp_all <= t).mean())
            far_enr = float((im <= t).mean())
            far_unk = float((un <= t).mean())
            frr = float((gd > t).mean())
            w.writerow([m, t, round(far_all * 100, 2), round(far_enr * 100, 2),
                        round(far_unk * 100, 2), round(frr * 100, 2), round((1 - frr) * 100, 2)])
print("tables/threshold_operating_points.csv")

# 4. latency summary -------------------------------------------------------------
def st(row_key, key):
    v = lat[row_key][key]
    if not v:
        return [""] * 5 + [0]
    return [v["mean"], v["median"], v["p95"], v["min"], v["max"], v["n"]]

with open(TABLES / "latency_summary.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["item", "mean_ms", "median_ms", "p95_ms", "min_ms", "max_ms", "n_samples",
                "source_field", "source_file"])
    rows = [
        ("POST /detect (resp)", st("detect", "stats_resp_ms"), "processing_time_ms"),
        ("POST /embedding (resp)", st("embedding", "stats_resp_ms"), "processing_time_ms"),
        ("POST /recognize (resp)", st("recognize", "stats_resp_ms"), "processing_time_ms"),
        ("POST /detect (wall)", st("detect", "stats_wall_ms"), "wall clock"),
        ("POST /embedding (wall)", st("embedding", "stats_wall_ms"), "wall clock"),
        ("POST /recognize (wall)", st("recognize", "stats_wall_ms"), "wall clock"),
        ("/recognize: detection stage", st("recognize", "stats_detection_ms"), "timing.detection_ms"),
        ("/recognize: embedding stage", st("recognize", "stats_embedding_ms"), "timing.embedding_ms"),
        ("/recognize: matching stage", st("recognize", "stats_matching_ms"), "timing.matching_ms"),
    ]
    for name, s, field in rows:
        w.writerow([name, s[0], s[1], s[2], s[3], s[4], s[5], field,
                    "raw-results/api_latency_results.json"])
print("tables/latency_summary.csv")

# extra: print yolo metrics for docs
print("\nYOLO:", json.dumps({k: v for k, v in json.load(open(
    next(iter(__import__("glob").glob(str(REPO / "ai-service" / "training_runs" / "yolo_*" / "yolo_train_metrics.json")))),
    encoding="utf-8")).items() if not isinstance(v, dict)}, default=str))
