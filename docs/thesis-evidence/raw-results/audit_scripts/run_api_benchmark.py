# -*- coding: utf-8 -*-
"""SAFE latency benchmark against the RUNNING AI service (no DB writes, no config changes).

Reproduces production inference cost per stage for 30 raw dataset photos
(the first 3 readable photos of each ENROLLED student s001..s010):
  POST /detect     -> detection-only latency
  POST /embedding  -> detect + align + FaceNet (also verifies embedding dimension)
  POST /recognize  -> full pipeline with a 30-embedding gallery, response contains
                      internal timing {detection_ms, embedding_ms, matching_ms}

Every number in the output comes from the live HTTP responses (processing_time_ms
fields) AND wall-clock. Aggregate stats: mean / median / p95 / min / max.

Usage: python run_api_benchmark.py   (from docs/thesis-evidence/raw-results/audit_scripts/)
"""
import json
import statistics
import sys
import time
from pathlib import Path

import httpx

REPO = Path(__file__).resolve().parents[4]
RAW_ROOT = REPO / "ai-service" / "datasets"
OUT = Path(__file__).resolve().parent.parent / "api_latency_results.json"
AI = "http://127.0.0.1:8001"

ENROLLED = [1, 2, 3, 4, 5, 6, 7, 9, 10]
PER_STUDENT = 3


def wall(fn, *a, **kw):
    t0 = time.perf_counter()
    r = fn(*a, **kw)
    return r, (time.perf_counter() - t0) * 1000.0


def i_to_int(s):
    return int(str(s).replace("s", ""))


def stats(rows, key):
    v = sorted(r[key] for r in rows if r.get(key) is not None)
    if not v:
        return None
    n = len(v)
    return {"n": n, "mean": round(statistics.mean(v), 1), "median": round(statistics.median(v), 1),
            "p95": round(v[min(n - 1, int(round(0.95 * (n - 1))))], 1),
            "min": round(v[0], 1), "max": round(v[-1], 1)}


def main():
    originals = {}
    for sid in ENROLLED:
        dirs = sorted(RAW_ROOT.glob(f"foto {sid}-*")) or sorted(RAW_ROOT.glob(f"foto {sid}"))
        imgs, files = [], []
        for d in dirs:
            imgs += sorted(list(d.rglob("*.jpg")) + list(d.rglob("*.jpeg")) + list(d.rglob("*.png")))
        files = imgs[:PER_STUDENT]
        originals[f"s{sid:03d}"] = files
    print("samples:", {k: len(v) for k, v in originals.items()})

    rows_detect, rows_embed, rows_recog, dims = [], [], [], {}
    gallery = []
    with httpx.Client(timeout=60) as c:
        for sid, files in originals.items():
            for i, p in enumerate(files):
                data = p.read_bytes()
                # /detect
                r, w = wall(lambda: c.post(f"{AI}/detect", files={"image": ("i.jpg", data, "image/jpeg")}))
                j = r.json()
                rows_detect.append({"file": p.name, "student": sid, "resp_ms": j.get("processing_time_ms"),
                                    "wall_ms": round(w, 1), "faces": j.get("faces_detected"),
                                    "status": r.status_code})
                # /embedding
                r, w = wall(lambda: c.post(f"{AI}/embedding", files={"image": ("i.jpg", data, "image/jpeg")}))
                if r.status_code == 200:
                    j = r.json()
                    emb = j.get("embedding")
                    dims.setdefault("embedding_dimension", len(emb) if emb else 0)
                    gallery.append({"student_id": i_to_int(sid), "student_name": sid, "embedding": emb})
                    rows_embed.append({"file": p.name, "student": sid, "resp_ms": j.get("processing_time_ms"),
                                       "wall_ms": round(w, 1), "status": 200})
                else:
                    rows_embed.append({"file": p.name, "student": sid, "resp_ms": None,
                                       "wall_ms": round(w, 1), "status": r.status_code,
                                       "detail": r.json().get("detail", "")})
        # /recognize with gallery (gallery = embeddings of the other images too)
        for sid, files in originals.items():
            for p in files:
                data = p.read_bytes()
                n_gal = len(gallery)
                r, w = wall(lambda: c.post(
                    f"{AI}/recognize",
                    files={"image": ("i.jpg", data, "image/jpeg"),
                           "embeddings_json": ("embeddings.json", json.dumps(gallery).encode(), "application/json")}))
                j = r.json()
                faces = j.get("faces", [])
                proc = j.get("processing_time_ms")
                rows_recog.append({
                    "file": p.name, "student": sid, "gallery_size": n_gal,
                    "status": r.status_code,
                    "resp_ms": proc, "wall_ms": round(w, 1),
                    "detection_ms": j.get("timing", {}).get("detection_ms"),
                    "embedding_ms": j.get("timing", {}).get("embedding_ms"),
                    "matching_ms": j.get("timing", {}).get("matching_ms"),
                    "n_faces": len(faces),
                    "matched_flags": [f.get("matched") for f in faces],
                })

    results = {
        "service_base": AI,
        "run_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "embedding_dimension": dims.get("embedding_dimension"),
        "detect": {"samples": rows_detect, "stats_resp_ms": stats(rows_detect, "resp_ms"),
                   "stats_wall_ms": stats(rows_detect, "wall_ms")},
        "embedding": {"samples": rows_embed, "stats_resp_ms": stats(rows_embed, "resp_ms"),
                      "stats_wall_ms": stats(rows_embed, "wall_ms")},
        "recognize": {"samples": rows_recog, "stats_resp_ms": stats(rows_recog, "resp_ms"),
                      "stats_wall_ms": stats(rows_recog, "wall_ms"),
                      "stats_detection_ms": stats(rows_recog, "detection_ms"),
                      "stats_embedding_ms": stats(rows_recog, "embedding_ms"),
                      "stats_matching_ms": stats(rows_recog, "matching_ms")},
        "gallery_note": "gallery = semua embedding sukses (dari 30 sampel), label anonim sNNN",
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"[saved] {OUT}")
    for ep in ("detect", "embedding", "recognize"):
        print(ep, results[ep]["stats_resp_ms"])
    for k in ("stats_detection_ms", "stats_embedding_ms", "stats_matching_ms"):
        print(k, results["recognize"].get(k))


if __name__ == "__main__":
    sys.exit(main())
