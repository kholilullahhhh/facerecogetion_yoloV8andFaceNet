# -*- coding: utf-8 -*-
"""AUDIT DATASET (read-only evidence scan).

Scans three datasets and writes aggregates + per-image raw results:
1. RAW   : ai-service/datasets/foto N-*/**  (original webcam/phone photos)
2. YOLO  : datasets/yolo/images/{train,val} + labels (letterboxed 640, YuNet auto-labels)
3. FACES : datasets/facenet/student_XXX   (160x160 production crops)

Per image: readable?, resolution, format, YuNet face count (n_faces),
top-face confidence, bbox, roll angle from eye landmarks, area ratio,
mean brightness (0-255). Aggregate JSON -> raw-results/dataset_scan.json.

Usage:  python scan_dataset.py   (from docs/thesis-evidence/raw-results/audit_scripts/)
NO data is modified. Read-only on images; YuNet ONNX is used in-memory.
"""
import json
import sys
from collections import Counter
from pathlib import Path

import cv2
import numpy as np

REPO = Path(__file__).resolve().parents[4]   # .../docs/thesis-evidence/raw-results/audit_scripts -> repo root
RAW_ROOT = REPO / "ai-service" / "datasets"
YIYO_ROOT = REPO / "datasets" / "yolo"
FACE_ROOT = REPO / "datasets" / "facenet"
YUNET = REPO / "ai-service" / "weights" / "face_detection_yunet_2023mar.onnx"
OUT = Path(__file__).resolve().parent.parent  # raw-results/
OUT.mkdir(parents=True, exist_ok=True)

MAX_SIDE = 960
CONF = 0.5

det = cv2.FaceDetectorYN.create(str(YUNET), "", (320, 320), score_threshold=CONF)


def scan_image(p: Path, label_faces=True):
    img = cv2.imread(str(p))
    rec = {"path": str(p.relative_to(REPO)).replace("\\", "/"), "readable": img is not None}
    if img is None:
        rec["error"] = "cv2.imread returned None"
        return rec, None
    h, w = img.shape[:2]
    rec.update({"w": int(w), "h": int(h), "res": f"{w}x{h}",
                "bytes": p.stat().st_size, "ext": p.suffix.lower()})
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    rec["brightness_mean"] = round(float(gray.mean()), 1)
    rec["brightness_std"] = round(float(gray.std()), 1)
    rec["sharpness_laplacian"] = round(float(cv2.Laplacian(gray, cv2.CV_64F).var()), 1)
    ann = None
    if label_faces:
        scale = min(1.0, MAX_SIDE / max(h, w))
        small = img if scale >= 1.0 else cv2.resize(
            img, (int(round(w * scale)), int(round(h * scale))), interpolation=cv2.INTER_AREA)
        det.setInputSize((small.shape[1], small.shape[0]))
        _, faces = det.detect(small)
        n = 0 if faces is None else len(faces)
        rec["n_faces_yunet"] = int(n)
        if n:
            f = faces[0]
            conf = float(f[14])
            det_box = {
                "x1": int(max(0, f[0] / scale)), "y1": int(max(0, f[1] / scale)),
                "x2": int(min(w, (f[0] + f[2]) / scale)), "y2": int(min(h, (f[1] + f[3]) / scale)),
            }
            re = (float(f[4]) / scale, float(f[5]) / scale)
            le = (float(f[6]) / scale, float(f[7]) / scale)
            roll = float(np.degrees(np.arctan2(le[1] - re[1], le[0] - re[0])))
            bbox_area = (det_box["x2"] - det_box["x1"]) * (det_box["y2"] - det_box["y1"])
            rec.update({"face_conf": round(conf, 4), "bbox": det_box,
                        "roll_deg": round(roll, 2),
                        "face_area_ratio": round(bbox_area / (w * h), 5)})
            ann = {"bbox": det_box, "roll": roll, "conf": conf}
    return rec, ann


def scan_raw():
    folders = sorted([d for d in RAW_ROOT.iterdir() if d.is_dir()],
                     key=lambda d: int(d.name.replace("foto ", "").split("-")[0]))
    students, per_image = [], []
    for d in folders:
        sid = int(d.name.replace("foto ", "").split("-")[0])
        files = sorted(list(d.rglob("*.jpg")) + list(d.rglob("*.jpeg")) + list(d.rglob("*.png")))
        s = {"student": f"s{sid:03d}", "photos": len(files), "readable": 0,
             "no_face": 0, "single_face": 0, "multi_face": 0,
             "resolutions": Counter(), "brightness": [], "roll": [], "corrupt": []}
        for p in files:
            rec, _ = scan_image(p)
            per_image.append(rec)
            if not rec["readable"]:
                s["corrupt"].append(rec["path"]); continue
            s["readable"] += 1
            s["resolutions"][rec["res"]] += 1
            s["brightness"].append(rec["brightness_mean"])
            nf = rec.get("n_faces_yunet", 0)
            if nf == 0:
                s["no_face"] += 1
            elif nf == 1:
                s["single_face"] += 1
            else:
                s["multi_face"] += 1
            if "roll_deg" in rec:
                s["roll"].append(rec["roll_deg"])
        s["resolutions"] = dict(s["resolutions"])
        b = np.array(s.pop("brightness"), dtype=float)
        r = np.array(s.pop("roll"), dtype=float)
        s["brightness"] = {"mean": round(float(b.mean()), 1), "min": round(float(b.min()), 1),
                           "max": round(float(b.max()), 1),
                           "pct_dark_lt120": int((b < 120).sum()),
                           "pct_normal_120_190": int(((b >= 120) & (b <= 190)).sum()),
                           "pct_bright_gt190": int((b > 190).sum())} if len(b) else {}
        s["roll_deg"] = {"min": round(float(r.min()), 1), "max": round(float(r.max()), 1),
                         "std": round(float(r.std()), 1),
                         "pct_abs_gt5deg": int((np.abs(r) > 5).sum())} if len(r) else {}
        students.append(s)
    return students, per_image


def scan_yolo():
    out = {"splits": {}, "per_image": []}
    for split in ("train", "val"):
        imgs = sorted((YIYO_ROOT / "images" / split).glob("*.jpg"))
        labs = sorted((YIYO_ROOT / "labels" / split).glob("*.txt"))
        lab_by_img = {p.stem: p for p in labs}
        counts, empty, boxes, all_classes = [], 0, 0, set()
        meta = []
        for p in imgs:
            lab = lab_by_img.get(p.stem)
            txt = lab.read_text().strip() if lab else ""
            n_box = len([l for l in txt.splitlines() if l.strip()]) if txt else 0
            classes = set()
            for l in txt.splitlines() if txt else []:
                t = l.split()
                if len(t) == 5:
                    classes.add(t[0]); boxes += 1
            counts.append(n_box)
            if n_box == 0:
                empty += 1
            rec, _ = scan_image(p, label_faces=True)
            rec["split"] = split
            rec["label_boxes"] = n_box
            rec["label_classes"] = sorted(classes)
            rec["path"] = str(p.relative_to(REPO)).replace("\\", "/")
            meta.append(rec)
        img_sizes = Counter(f"{r['w']}x{r['h']}" for r in meta if r["readable"])
        split_classes = sorted({c for r in meta for c in r.get("label_classes", [])})
        out["splits"][split] = {
            "images": len(imgs), "labels": len(labs), "empty_labels": empty,
            "total_boxes": boxes, "classes": split_classes,
            "image_sizes": dict(img_sizes),
            "boxes_per_image": {"min": min(counts), "max": max(counts),
                                "mean": round(float(np.mean(counts)), 2)},
        }
        out["per_image"] += meta
    return out


def scan_facenet():
    students, per_image = [], []
    dirs = sorted([d for d in FACE_ROOT.iterdir() if d.is_dir()])
    for d in dirs:
        sid = int(d.name.replace("student_", ""))
        files = sorted(list(d.glob("*.jpg")) + list(d.glob("*.jpeg")) + list(d.glob("*.png")))
        s = {"student": f"s{sid:03d}", "enrolled_id": sid <= 10, "crops": len(files),
             "readable": 0, "not_160x160": 0, "corrupt": [], "sizes": Counter(),
             "brightness": []}
        for p in files:
            rec, _ = scan_image(p)
            rec["path"] = str(p.relative_to(REPO)).replace("\\", "/")
            per_image.append(rec)
            if not rec["readable"]:
                s["corrupt"].append(rec["path"]); continue
            s["readable"] += 1
            key = "160x160" if (rec["w"], rec["h"]) == (160, 160) else f"{rec['w']}x{rec['h']}"
            if key != "160x160":
                s["not_160x160"] += 1
            s["sizes"][key] += 1
            s["brightness"].append(rec["brightness_mean"])
        s["sizes"] = dict(s["sizes"])
        b = np.array(s.pop("brightness"), dtype=float)
        s["brightness"] = {"mean": round(float(b.mean()), 1)} if len(b) else {}
        students.append(s)
    return students, per_image


def main():
    print("[1/3] scanning RAW (247 photos expected)...", flush=True)
    raw_students, raw_per_image = scan_raw()
    print("[2/3] scanning YOLO (247 expected)...", flush=True)
    yolo = scan_yolo()
    print("[3/3] scanning FACES (243 expected)...", flush=True)
    face_students, face_per_image = scan_facenet()

    total_raw = sum(s["photos"] for s in raw_students)
    result = {
        "scan_datetime": __import__("datetime").datetime.now().isoformat(timespec="seconds"),
        "raw": {
            "root": str(RAW_ROOT),
            "total_folders": len(raw_students),
            "total_photos": total_raw,
            "per_student": raw_students,
        },
        "yolo": {"root": str(YIYO_ROOT), **yolo},
        "facenet": {"root": str(FACE_ROOT),
                    "total_students": len(face_students),
                    "total_crops": sum(s["crops"] for s in face_students),
                    "per_student": face_students},
        "per_image": {"raw": raw_per_image, "facenet": face_per_image,
                      "yolo": yolo["per_image"]},
    }
    with open(OUT / "dataset_scan.json", "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False, default=str)
    print(f"[done] -> {OUT / 'dataset_scan.json'}")
    print("yolo splits:", json.dumps(result["yolo"]["splits"], default=str))
    print("facenet total_crops =", result["facenet"]["total_crops"])


if __name__ == "__main__":
    sys.exit(main())
