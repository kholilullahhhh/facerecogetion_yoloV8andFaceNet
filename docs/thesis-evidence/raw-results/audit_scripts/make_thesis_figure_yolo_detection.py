# -*- coding: utf-8 -*-
"""Gambar "Hasil Pengujian Deteksi Wajah YOLOv8" (300 DPI, label Indonesia).

Pipeline pembuatan (semua data asli, tidak ada angka karangan):
  1. Muat bobot yang di-DEPLOY: ai-service/weights/yolov8s.pt
     (= best.pt run yolo_20261103_025549, fine-tuned 20 epoch, 1 kelas "face").
  2. Jalankan prediksi pada SELURUH 51 citra validation split
     (datasets/yolo/images/val — split yang sama dgn Tabel 3.7),
     conf=0.25 & imgsz=640 (sama dgn mosaic val_batch bawaan Ultralytics).
  3. Cocokkan tiap deteksi ke ground truth (label YOLO, IoU>=0.5) -> TP/FP/FN.
  4. Pilih 4 panel: 3 citra dgn deteksi sempurna (TP=n_GT, FP=0, FN=0) +
     1 citra background tanpa wajah (0 deteksi = benar).

Output: docs/thesis-evidence/charts/19_yolo_detection_examples.png
Usage:  python make_thesis_figure_yolo_detection.py   (CPU, ~1-2 menit)
"""
import os
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

REPO = Path(__file__).resolve().parents[4]
AI = REPO / "ai-service"
VAL_IMG = REPO / "datasets" / "yolo" / "images" / "val"
VAL_LBL = REPO / "datasets" / "yolo" / "labels" / "val"
WEIGHTS = AI / "weights" / "yolov8s.pt"
OUT = REPO / "docs" / "thesis-evidence" / "charts" / "19_yolo_detection_examples.png"
OUT.parent.mkdir(parents=True, exist_ok=True)

os.chdir(AI)  # konsisten dgn CWD service (path relatif .env)
import cv2
from ultralytics import YOLO

CONF = 0.25
IMGSZ = 640
IOU_MATCH = 0.5

model = YOLO(str(WEIGHTS))
print(f"model dimuat: {WEIGHTS.name}")

def load_gt(p: Path, w: int, h: int):
    boxes = []
    if p.exists():
        for line in p.read_text(encoding="utf-8").splitlines():
            t = line.split()
            if len(t) >= 5:
                cx, cy, bw, bh = (float(v) for v in t[1:5])
                boxes.append((int((cx - bw / 2) * w), int((cy - bh / 2) * h),
                              int((cx + bw / 2) * w), int((cy + bh / 2) * h)))
    return boxes

def iou_xyxy(a, b):
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0, ix2 - ix1), max(0, iy2 - iy1)
    inter = iw * ih
    ua = (ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) * (by2 - by1) - inter
    return inter / ua if ua > 0 else 0.0

def match(tp_boxes, gt_boxes):
    """Greedy match IoU>=0.5 -> (TP, FP, FN, indeks pred yang cocok)."""
    pairs = []
    for i, p in enumerate(tp_boxes):
        for j, g in enumerate(gt_boxes):
            v = iou_xyxy(p, g)
            if v >= IOU_MATCH:
                pairs.append((v, i, j))
    used_p, used_g, matched = set(), set(), 0
    for v, i, j in sorted(pairs, reverse=True):
        if i not in used_p and j not in used_g:
            used_p.add(i); used_g.add(j); matched += 1
    return matched, len(tp_boxes) - matched, len(gt_boxes) - matched, used_p

# ---------- prediksi seluruh val split ----------
records = []
for img_path in sorted(VAL_IMG.glob("*.jpg")):
    img = cv2.imread(str(img_path))
    if img is None:
        continue
    h, w = img.shape[:2]
    res = model.predict(img, imgsz=IMGSZ, conf=CONF, device="cpu", verbose=False)[0]
    pred = [(int(x1), int(y1), int(x2), int(y2)) for x1, y1, x2, y2 in
            res.boxes.xyxy.cpu().numpy()] if res.boxes is not None and len(res.boxes) else []
    conf = res.boxes.conf.cpu().numpy().tolist() if res.boxes is not None and len(res.boxes) else []
    gt = load_gt(VAL_LBL / (img_path.stem + ".txt"), w, h)
    tp, fp, fn, matched_idx = match(pred, gt)
    records.append({"img": img, "path": img_path, "pred": pred, "conf": conf,
                    "gt": gt, "tp": tp, "fp": fp, "fn": fn, "matched": matched_idx})

tot = {k: sum(r[k] for r in records) for k in ("tp", "fp", "fn")}
tot["gt"] = sum(len(r["gt"]) for r in records)
print(f"51 citra @conf={CONF}: GT={tot['gt']} TP={tot['tp']} FP={tot['fp']} FN={tot['fn']}")

def prefix(r):
    return r["path"].stem.split("_")[0]   # s01, s02, ...

perfect = [r for r in records if len(r["gt"]) > 0 and r["tp"] == len(r["gt"]) and r["fp"] == 0]
perfect.sort(key=lambda r: (-len(r["gt"]), r["path"].name))
# variasi: satu citra terbaik per siswa (prefix sNN)
picked, seen = [], set()
for r in perfect:
    p = prefix(r)
    if p not in seen:
        seen.add(p)
        picked.append(r)
    if len(picked) == 3:
        break
picked_ids = {id(r) for r in picked}
for r in perfect:  # isi sisa slot dengan perfect lain
    if len(picked) >= 3:
        break
    if id(r) not in picked_ids:
        picked.append(r); picked_ids.add(id(r))
# panel terakhir: contoh kasus tidak sempurna (FN/FP) — prioritaskan FN
imperfect = [r for r in records if r["fp"] > 0 or r["fn"] > 0]
imperfect.sort(key=lambda r: (-(r["fn"] + r["fp"]), r["path"].name))
print("kasus tidak sempurna (51 citra):",
      [(r["path"].name, r["tp"], r["fp"], r["fn"]) for r in imperfect])
if imperfect:
    picked.append(imperfect[0])

chosen = picked[:4]
print("panel:", [r["path"].name for r in chosen])

# ---------- gambar ----------
fig, axs = plt.subplots(2, 2, figsize=(11.5, 9.0))
for ax, r in zip(axs.flat, chosen):
    img = r["img"].copy()
    h, w = img.shape[:2]
    lw = max(2, w // 450)
    fs = max(0.55, w / 2600)
    # kotak: hijau = cocok GT (TP), oranye = FP (deteksi ganda / salah)
    label_rects = []
    for i, ((x1, y1, x2, y2), c) in enumerate(zip(r["pred"], r["conf"])):
        is_fp = i not in r["matched"]
        col = (0, 140, 255) if is_fp else (36, 160, 60)
        lab = f"face {c:.2f}" + (" (FP)" if is_fp else "")
        cv2.rectangle(img, (x1, y1), (x2, y2), col, lw)
        (tw, th), _ = cv2.getTextSize(lab, cv2.FONT_HERSHEY_SIMPLEX, fs, 1)
        ty = y1 - 6
        rect = (x1, ty - th - 4, x1 + tw + 4, ty + 4)
        # hindari tumpang tindih label: jika tabrakan, taruh di bawah kotak
        if any(not (rect[2] < o[0] or rect[0] > o[2] or rect[3] < o[1] or rect[1] > o[3])
               for o in label_rects):
            ty = min(y2 + th + 8, h - 4)
            rect = (x1, ty - th - 4, x1 + tw + 4, ty + 4)
        label_rects.append(rect)
        cv2.rectangle(img, rect[:2], rect[2:], col, -1)
        cv2.putText(img, lab, (x1 + 2, ty), cv2.FONT_HERSHEY_SIMPLEX, fs,
                    (255, 255, 255), 1, cv2.LINE_AA)
    ngt = len(r["gt"])
    if ngt == 0:
        title = f"{r['path'].stem[:3]} — tanpa wajah (background) → 0 deteksi (benar)"
    else:
        title = (f"{r['path'].stem[:3]} — {ngt} wajah → terdeteksi {r['tp']} "
                 f"(FP {r['fp']}, FN {r['fn']})")
    ax.imshow(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
    ax.set_title(title, fontsize=9.5)
    ax.axis("off")

fig.suptitle("Hasil Pengujian Deteksi Wajah — YOLOv8s fine-tuned pada citra validation split",
             fontsize=13, y=0.995)
fig.text(0.5, 0.004,
         f"Sumber: bobot terdeploy ai-service/weights/yolov8s.pt (best.pt run yolo_20261103_025549) dijalankan pada 51 citra "
         f"datasets/yolo/images/val, conf={CONF}, imgsz={IMGSZ}, CPU — kotak hijau = deteksi cocok ground truth (kelas \"face\"), "
         f"oranye = false positive. Rekap 51 citra @conf 0.25: GT {tot['gt']} · TP {tot['tp']} · FP {tot['fp']} · FN {tot['fn']} "
         f"(IoU ≥ 0.5 terhadap label ground truth).",
         ha="center", fontsize=6.5, color="#555555")
fig.tight_layout(rect=(0, 0.015, 1, 0.97))
fig.savefig(OUT, dpi=300, bbox_inches="tight")
plt.close(fig)
print("chart ->", OUT.name)
print("DONE")
