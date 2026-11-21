# -*- coding: utf-8 -*-
"""Uji Variasi Pencahayaan (Tabel 3.9) — simulasi kecerahan terkendali.

Protokol (mengikuti evaluasi resmi + jalur produksi):
  - Model   : ai-service/weights/facenet_model.pth (fine-tuned ep07, terdeploy)
  - Query   : 93 crop wajah 9 siswa terdaftar (s001-s010 tanpa s008), datasets/facenet
  - Galeri  : embedding crop lain siswa yang sama (LOO, crop TANPA transformasi)
              -> meniru kondisi nyata: enrollment pencahayaan normal, query bervariasi
  - Keputusan: jarak Euclidean minimum; dikenali benar jika identitas argmin = asli
              DAN dmin <= threshold produksi 1.0 (FACE_MATCH_THRESHOLD .env)
  - Kondisi :
      Normal : citra asli (baseline, cross-check TAR resmi 86.02%)
      Terang : kecerahan x1.3 (cv2, clip 0-255)
      Redup  : kecerahan x0.6 (cv2, clip 0-255)

Output:
  docs/thesis-evidence/tables/lighting_variation_test.csv
Usage: python run_lighting_variation_test.py   (CPU ~1 menit)
"""
import os
import sys
import csv
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
AI = REPO / "ai-service"
OUT_CSV = REPO / "docs" / "thesis-evidence" / "tables" / "lighting_variation_test.csv"
OUT_CSV.parent.mkdir(parents=True, exist_ok=True)

os.chdir(AI)  # CWD service (path relatif .env)
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
print(f"DEVICE={DEVICE} | threshold={THR} | model={Path(FACENET_MODEL_PATH).name}")

model = InceptionResnetV1(pretrained="vggface2", device=DEVICE).eval()
model.load_state_dict(torch.load(FACENET_MODEL_PATH, map_location=DEVICE))


def embed_u8(img_u8: np.ndarray) -> np.ndarray:
    """uint8 BGR 160x160 -> embedding 512-D L2 (normalisasi sama dgn produksi)."""
    x = img_u8.astype(np.float32)
    x = (x - 127.5) / 128.0
    t = torch.from_numpy(x).permute(2, 0, 1).unsqueeze(0).to(DEVICE)
    with torch.no_grad():
        e = model(t).cpu().numpy().flatten()
    return e / np.linalg.norm(e)


# ---------- muat crop siswa terdaftar ----------
by_sid = {}
root = REPO / "datasets" / "facenet"
for d in sorted(root.iterdir()):
    if not d.is_dir():
        continue
    sid = int(d.name.replace("student_", ""))
    if sid > 10:
        continue  # hanya siswa terdaftar
    crops = []
    for p in sorted(d.glob("*.jpg")) + sorted(d.glob("*.jpeg")) + sorted(d.glob("*.png")):
        img = cv2.imread(str(p))
        if img is not None and img.shape[:2] == (160, 160):
            crops.append(img)
    if crops:
        by_sid[sid] = crops

n_query = sum(len(v) for v in by_sid.values())
print(f"crop dimuat: {n_query} dari {len(by_sid)} siswa")
assert n_query == 93, f"protokol LOO resmi memakai 93 crop, dapat {n_query}"

# galeri embedding (crop asli, TANPA transformasi) per siswa
gallery = {sid: [embed_u8(c) for c in crops] for sid, crops in by_sid.items()}

CONDITIONS = {
    "Normal": lambda c: c,
    "Terang": lambda c: np.clip(c.astype(np.float32) * 1.3, 0, 255).astype(np.uint8),
    "Redup":  lambda c: np.clip(c.astype(np.float32) * 0.6, 0, 255).astype(np.uint8),
}

# ---------- blok utama: argmin GLOBAL atas galeri semua siswa ----------
all_vecs, all_sids = [], []
for sid in sorted(gallery):
    for e in gallery[sid]:
        all_vecs.append(e)
        all_sids.append(sid)
all_vecs = np.stack(all_vecs)
all_sids = np.array(all_sids)

rows = []
for cname, fn in CONDITIONS.items():
    ok = unknown = wrong = 0
    dmin_list = []
    for sid, crops in by_sid.items():
        gvecs = np.stack(gallery[sid])
        for i, c in enumerate(crops):
            q = embed_u8(fn(c))
            d = np.linalg.norm(all_vecs - q, axis=1)
            # LOO: kecualikan embedding crop ke-i siswa yang sama (foto aslinya sendiri)
            idx_own = [k for k, s in enumerate(all_sids) if s == sid]
            d[idx_own[i]] = np.inf
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
    print(f"{cname:7s}: {ok}/{n} = {100.0*ok/n:.2f}% | unknown {unknown} | salah-id {wrong} | "
          f"mean dmin {np.mean(dmin_list):.4f}")

with open(OUT_CSV, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0]))
    w.writeheader()
    w.writerows(rows)
print("csv ->", OUT_CSV)
print("DONE")
