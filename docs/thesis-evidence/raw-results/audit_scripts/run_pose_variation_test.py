# -*- coding: utf-8 -*-
"""Uji Variasi Posisi Wajah (Tabel 3.10) — simulasi yaw via warp perspektif.

Protokol (identik dgn uji pencahayaan / evaluasi resmi):
  - Model   : weights/facenet_model.pth (fine-tuned ep07, terdeploy), threshold 1.0
  - Query   : 93 crop LOO (9 siswa terdaftar), datasets/facenet
  - Galeri  : embedding crop ASLI (tanpa transformasi) semua siswa; argmin global;
              LOO (embedding crop itu sendiri dikecualikan)
  - Dikenali: identitas argmin = asli DAN dmin <= 1.0 (perilaku find_best_match)
  - Kondisi :
      Menghadap depan : crop asli (jangkar konsistensi = 77/93 = 82.80%)
      Menoleh kiri    : warp perspektif — sisi kanan citra dimampatkan 30 px (of 160)
      Menoleh kanan   : cermin (sisi kiri dimampatkan 30 px)
      -> foreshortening ~19% pada satu sisi, setara yaw moderat (~20 derajat);
         border replicate agar tidak muncul palang hitam.

Output: docs/thesis-evidence/tables/pose_variation_test.csv
Usage: python run_pose_variation_test.py   (CPU ~1 menit)
"""
import os
import sys
import csv
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
AI = REPO / "ai-service"
OUT_CSV = REPO / "docs" / "thesis-evidence" / "tables" / "pose_variation_test.csv"
OUT_CSV.parent.mkdir(parents=True, exist_ok=True)

os.chdir(AI)
sys.path.insert(0, str(AI))
try:
    from dotenv import load_dotenv
    load_dotenv(AI / ".env")
except ImportError:
    pass

import cv2
import numpy as np
import torch
from facenet_pytorch import InceptionResnetV1
from config import DEVICE, FACENET_MODEL_PATH, FACE_MATCH_THRESHOLD

THR = float(FACE_MATCH_THRESHOLD)
SHIFT = 30  # px dari 160 (~19%) — sisi wajah yang menjauh dimampatkan
print(f"DEVICE={DEVICE} | threshold={THR} | shift_yaw={SHIFT}px")

model = InceptionResnetV1(pretrained="vggface2", device=DEVICE).eval()
model.load_state_dict(torch.load(FACENET_MODEL_PATH, map_location=DEVICE))


def embed_u8(img_u8: np.ndarray) -> np.ndarray:
    x = img_u8.astype(np.float32)
    x = (x - 127.5) / 128.0
    t = torch.from_numpy(x).permute(2, 0, 1).unsqueeze(0).to(DEVICE)
    with torch.no_grad():
        e = model(t).cpu().numpy().flatten()
    return e / np.linalg.norm(e)


def warp_yaw(img: np.ndarray, side: str) -> np.ndarray:
    """Simulasi menoleh: sisi `side` ('right'/'left') dimampatkan SHIFT px."""
    h, w = img.shape[:2]
    src = np.float32([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]])
    if side == "right":
        dst = np.float32([[0, 0], [w - 1 - SHIFT, 0], [w - 1 - SHIFT, h - 1], [0, h - 1]])
    else:
        dst = np.float32([[SHIFT, 0], [w - 1, 0], [w - 1, h - 1], [SHIFT, h - 1]])
    M = cv2.getPerspectiveTransform(src, dst)
    return cv2.warpPerspective(img, M, (w, h), borderMode=cv2.BORDER_REPLICATE)


# ---------- muat crop siswa terdaftar ----------
by_sid = {}
root = REPO / "datasets" / "facenet"
for d in sorted(root.iterdir()):
    if not d.is_dir():
        continue
    sid = int(d.name.replace("student_", ""))
    if sid > 10:
        continue
    crops = []
    for p in sorted(d.glob("*.jpg")) + sorted(d.glob("*.jpeg")) + sorted(d.glob("*.png")):
        img = cv2.imread(str(p))
        if img is not None and img.shape[:2] == (160, 160):
            crops.append(img)
    if crops:
        by_sid[sid] = crops

n_query = sum(len(v) for v in by_sid.values())
print(f"crop dimuat: {n_query} dari {len(by_sid)} siswa")
assert n_query == 93

gallery = {sid: [embed_u8(c) for c in crops] for sid, crops in by_sid.items()}
all_vecs, all_sids = [], []
for sid in sorted(gallery):
    for e in gallery[sid]:
        all_vecs.append(e)
        all_sids.append(sid)
all_vecs = np.stack(all_vecs)
all_sids = np.array(all_sids)
own_idx = {sid: [k for k, s in enumerate(all_sids) if s == sid] for sid in by_sid}

CONDITIONS = {
    "Menghadap depan": lambda c: c,
    "Menoleh kiri":    lambda c: warp_yaw(c, "left"),
    "Menoleh kanan":   lambda c: warp_yaw(c, "right"),
}

rows = []
for cname, fn in CONDITIONS.items():
    ok = unknown = wrong = 0
    dmin_list = []
    for sid, crops in by_sid.items():
        for i, c in enumerate(crops):
            q = embed_u8(fn(c))
            d = np.linalg.norm(all_vecs - q, axis=1)
            d[own_idx[sid][i]] = np.inf
            j = int(np.argmin(d))
            dmin = float(d[j])
            dmin_list.append(dmin)
            if dmin <= THR:
                if all_sids[j] == sid:
                    ok += 1
                else:
                    wrong += 1
            else:
                unknown += 1
    n = len(dmin_list)
    rows.append({
        "condition": cname, "n_test": n,
        "recognized": ok, "not_recognized": n - ok,
        "accuracy_pct": round(100.0 * ok / n, 2),
        "mean_min_dist": round(float(np.mean(dmin_list)), 4),
        "unknown_rejected": unknown, "wrong_identity": wrong,
    })
    print(f"{cname:16s}: {ok}/{n} = {100.0*ok/n:.2f}% | unknown {unknown} | salah-id {wrong} | "
          f"mean dmin {np.mean(dmin_list):.4f}")

with open(OUT_CSV, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0]))
    w.writeheader()
    w.writerows(rows)
print("csv ->", OUT_CSV)
print("DONE")
