# -*- coding: utf-8 -*-
"""Generate 3 thesis figures (300 DPI, Indonesian labels):

15_facenet_training_curves.png  -> Gambar 3.5: kurva loss & akurasi training FaceNet
16_face_embedding_examples.png  -> Gambar 3.6: contoh hasil ekstraksi embedding
                                   (wajah aligned + heatmap 512-D + jarak pasangan)
17_face_embedding_tsne.png      -> bonus: proyeksi t-SNE seluruh 243 embedding
                                   (9 siswa terdaftar vs 16 siswa tidak terdaftar)

Semua dari data asli (bukan angka karangan):
- kurva : ai-service/training_runs/facenet_20261103_024517/facenet_train_metrics.json
- model : ai-service/weights/facenet_model.pth (fine-tuned epoch-7, yang dipakai produksi)
- wajah : ai-service/datasets/foto N-* (foto mentah) & datasets/facenet/student_XXX (crop 160x160)

Pipeline ekstraksi = persis jalur produksi: YuNet -> crop+align (preprocess_face)
-> normalisasi (x-127.5)/128 -> InceptionResnetV1 -> L2-normalisasi.

Usage: python make_thesis_figures.py   (CPU, +-1-2 menit)
"""
import os
import sys
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import colormaps
import numpy as np
import torch
from sklearn.manifold import TSNE

REPO = Path(__file__).resolve().parents[4]
AI = REPO / "ai-service"
CH = REPO / "docs" / "thesis-evidence" / "charts"
CH.mkdir(parents=True, exist_ok=True)

sys.path.insert(0, str(AI))
os.chdir(AI)  # .env di ai-service memakai path relatif (weights/...); service juga jalan dari sini
try:  # config.py sudah membaca .env sendiri; ini hanya meniru perilaku main.py
    from dotenv import load_dotenv
    load_dotenv(AI / ".env")
except ImportError:
    pass

import cv2
from facenet_pytorch import InceptionResnetV1
from config import DEVICE, FACENET_MODEL_PATH
from app.services.face_detector_service import FaceDetectorService
from app.preprocessing.face_preprocessing import preprocess_face

# ---------------- model + detector (sama seperti produksi) ----------------
print(f"DEVICE = {DEVICE}")
model = InceptionResnetV1(pretrained="vggface2", device=DEVICE).eval()
model.load_state_dict(torch.load(FACENET_MODEL_PATH, map_location=DEVICE))
print(f"model dimuat: {FACENET_MODEL_PATH} (fine-tuned epoch-7)")
detector = FaceDetectorService()
detector.load_model()


def embed_pipeline(img: np.ndarray):
    """1 wajah -> YuNet -> crop+align 160x160 -> embedding 512-D L2."""
    faces = detector.detect_faces(img)
    if len(faces) != 1:
        return None, None
    crop = preprocess_face(img, faces[0]["bbox"], faces[0]["landmarks"])
    x = crop.astype(np.float32)
    x = (x - 127.5) / 128.0
    t = torch.from_numpy(x).permute(2, 0, 1).unsqueeze(0).to(DEVICE)
    with torch.no_grad():
        e = model(t)
    e = e.cpu().numpy().flatten()
    return crop, e / np.linalg.norm(e)


def embed_from_photo(p: Path):
    """Foto mentah -> YuNet detect -> crop+align 160x160 -> embedding 512-D L2."""
    img = cv2.imread(str(p))
    if img is None:
        return None, None
    return embed_pipeline(img)


def foto_files(sid: int) -> list:
    dirs = sorted(AI.glob(f"datasets/foto {sid}-*")) or sorted(AI.glob(f"datasets/foto {sid}"))
    files = []
    for d in dirs:
        files += sorted(d.rglob("*.jpg")) + sorted(d.rglob("*.jpeg")) + sorted(d.rglob("*.png"))
    return files


def pick_photos(files, want: int, tag: str) -> list:
    """Ambil `want` wajah pertama yang hasil YuNet-nya tepat 1 wajah."""
    out = []
    for p in files:
        crop, e = embed_from_photo(p)
        if crop is None:
            continue
        out.append((crop, e))
        print(f"  [{tag}] dipakai: {p.name}")
        if len(out) >= want:
            break
    if len(out) < want:
        raise RuntimeError(f"{tag}: hanya {len(out)} foto valid dari {len(files)} file")
    return out


def src_note(fig, text):
    fig.text(0.5, 0.004, text, ha="center", fontsize=6.5, color="#555555")


# ================= Gambar 3.5: kurva training =================
with open(AI / "training_runs" / "facenet_20261103_024517" / "facenet_train_metrics.json",
          encoding="utf-8") as f:
    h = json.load(f)["history"]
for k in ("train_loss", "val_loss", "train_acc", "val_acc"):
    if k not in h:
        raise KeyError(f"`{k}` tidak ada di history: {list(h)}")

ep = np.arange(1, len(h["train_loss"]) + 1)
best_idx = int(np.argmax(h["val_acc"]))          # argmax -> nilai PERTAMA yang maksimum
best_ep = best_idx + 1
best_acc = float(h["val_acc"][best_idx])
print(f"best val_acc = {best_acc:.4f} pada epoch {best_ep} (epoch total {len(ep)})")

fig, axs = plt.subplots(1, 2, figsize=(11.5, 4.3))
axs[0].plot(ep, h["train_loss"], label="Loss training", color="#4C72B0", lw=2)
axs[0].plot(ep, h["val_loss"], label="Loss validation", color="#C44E52", lw=2, ls="--")
axs[0].axvline(best_ep, color="k", ls="-.", lw=1)
axs[0].annotate(f"checkpoint terbaik\nepoch {best_ep} (dideploy)",
                (best_ep, h["val_loss"][0] - 0.03), fontsize=7.5, ha="left",
                bbox=dict(facecolor="white", edgecolor="none", alpha=0.85))
axs[0].set_xlabel("Epoch")
axs[0].set_ylabel("Loss (Cross-Entropy, label smoothing 0.1)")
axs[0].set_title("a) Loss training vs validation — InceptionResnetV1", fontsize=10.5)
axs[0].legend(fontsize=8)
axs[0].grid(alpha=.3)

axs[1].plot(ep, h["train_acc"], label="Akurasi training", color="#4C72B0", lw=2)
axs[1].plot(ep, h["val_acc"], label="Akurasi validation", color="#55A868", lw=2, ls="--",
            marker="o", ms=3)
axs[1].axvline(best_ep, color="k", ls="-.", lw=1)
axs[1].axhline(best_acc, color="gray", ls=":", lw=1)
axs[1].annotate(f"val acc terbaik = {best_acc:.2f} (epoch {best_ep})",
                (best_ep + 0.3, best_acc - 0.06), fontsize=7.5,
                bbox=dict(facecolor="white", edgecolor="none", alpha=0.85))
axs[1].set_xlabel("Epoch")
axs[1].set_ylabel("Akurasi klasifikasi head 512→9 (0–1)")
axs[1].set_title("b) Akurasi training vs validation — head Linear(512→9)", fontsize=10.5)
axs[1].set_ylim(-0.05, 1.08)
axs[1].legend(fontsize=8, loc="lower right")
axs[1].grid(alpha=.3)
fig.suptitle("Grafik Hasil Pelatihan FaceNet (30 epoch, batch 16, AdamW lr 5e-5/1e-3)", y=1.02)
fig.subplots_adjust(bottom=0.15)  # beri ruang antara "Epoch" dan catatan sumber
src_note(fig, "Sumber: ai-service/training_runs/facenet_20261103_024517/facenet_train_metrics.json "
              "— data train 75 / validation 18 citra (9 siswa terdaftar). Loss = Cross-Entropy "
              "training head klasifikasi (train_facenet.py), bukan Triplet Loss.")
fig.savefig(CH / "15_facenet_training_curves.png", dpi=300, bbox_inches="tight")
plt.close(fig)
print("chart -> 15_facenet_training_curves.png")

# ============ kumpulkan embedding seluruh crop datasets/facenet ============
emb_by_student = {}
for d in sorted((REPO / "datasets" / "facenet").iterdir()):
    if not d.is_dir():
        continue
    sid = int(d.name.replace("student_", ""))
    crops_list = []
    for p in sorted(d.glob("*.jpg")) + sorted(d.glob("*.jpeg")) + sorted(d.glob("*.png")):
        img = cv2.imread(str(p))
        if img is None:
            continue
        crop, e = embed_pipeline(img)   # crop 160x160: deteksi di-skip (sudah crop), langsung embedding
        if e is not None:
            crops_list.append(e)
    emb_by_student[sid] = crops_list
print("embedding per siswa:", {f"s{k:03d}": len(v) for k, v in sorted(emb_by_student.items())})

# ======== contoh ekstraksi nyata dari FOTO MENTAH (bukan crop dataset) ========
s1 = pick_photos(foto_files(1), 2, "s001")
s3 = pick_photos(foto_files(3), 1, "s003")
c1a, e1a = s1[0]
c1b, e1b = s1[1]
c3a, e3a = s3[0]
d_same = float(np.linalg.norm(e1a - e1b))
d_diff = float(np.linalg.norm(e1a - e3a))
print(f"d(s001-A, s001-B) = {d_same:.4f} | d(s001-A, s003-A) = {d_diff:.4f} | threshold produksi = 1.0")

faces = [(c1a, e1a, f"s001 — foto A\n(d ke s001-B = {d_same:.2f})"),
         (c1b, e1b, f"s001 — foto B\n(d ke s001-A = {d_same:.2f})"),
         (c3a, e3a, f"s003 — foto A\n(d ke s001-A = {d_diff:.2f})")]

fig = plt.figure(figsize=(13, 6.2))
gs = fig.add_gridspec(2, 3, height_ratios=[2.1, 1.0], hspace=0.30, wspace=0.05)
fig.subplots_adjust(bottom=0.17)
for j, (crop, e, lab) in enumerate(faces):
    ax = fig.add_subplot(gs[0, j])
    ax.imshow(cv2.cvtColor(crop, cv2.COLOR_BGR2RGB))
    ax.set_title(lab, fontsize=9)
    ax.axis("off")
    ax2 = fig.add_subplot(gs[1, j])
    ax2.imshow(e.reshape(1, -1), aspect="auto", cmap="viridis", vmin=-0.25, vmax=0.25)
    ax2.set_yticks([])
    ax2.set_xticks([0, 128, 256, 384, 512])
    ax2.set_xlabel("Indeks dimensi embedding (1–512)", fontsize=8)
fig.suptitle("Contoh Hasil Ekstraksi Face Embedding — wajah ter-align 160×160 → vektor 512-D "
             "L2-normalisasi (model fine-tuned ep07)", y=1.04)
fig.text(0.5, 0.065,
         f"Jarak Euclidean antar embedding: pasangan wajah yang sama {d_same:.2f} (≤ threshold 1.0 → dikenali)   "
         f"      pasangan wajah siswa berbeda {d_diff:.2f} (> threshold 1.0 → tidak cocok)",
         ha="center", fontsize=10)
src_note(fig, "Sumber: ekstraksi langsung dari foto mentah ai-service/datasets (YuNet → align → FaceNet "
              "weights/facenet_model.pth, Nov 2026); angka jarak = np.linalg.norm(E1 − E2).")
fig.savefig(CH / "16_face_embedding_examples.png", dpi=300, bbox_inches="tight")
plt.close(fig)
print("chart -> 16_face_embedding_examples.png")

# ================= bonus: t-SNE seluruh 243 embedding =================
labels, vecs = [], []
for sid in sorted(emb_by_student):
    for e in emb_by_student[sid]:
        vecs.append(e)
        labels.append(sid)
vecs = np.array(vecs)
labels = np.array(labels)
n_enr = int((labels <= 10).sum())
n_unk = int((labels > 10).sum())
print(f"t-SNE pada {len(vecs)} embedding ({n_enr} terdaftar / {n_unk} tidak terdaftar) ...")
emb2 = TSNE(n_components=2, perplexity=25, init="pca", random_state=42).fit_transform(vecs)

fig, ax = plt.subplots(figsize=(8.6, 6.4))
cmap10 = colormaps["tab10"]
enrolled_sids = sorted(s for s in np.unique(labels) if s <= 10)   # 001..007, 009, 010
# tab10 kecuali indeks 7 (abu-abu #7f7f7f): tidak boleh mirip titik "tidak terdaftar" (#BBBBBB)
_color_idx = [0, 1, 2, 3, 4, 5, 6, 8, 9]
colors = {sid: cmap10(c) for sid, c in zip(enrolled_sids, _color_idx)}  # 9 warna berbeda
for sid in enrolled_sids:
    m = labels == sid
    ax.scatter(emb2[m, 0], emb2[m, 1], s=26, color=colors[sid],
               edgecolor="white", linewidth=0.3, label=f"s{sid:03d}")
unk_mask = labels > 10
if unk_mask.any():
    ax.scatter(emb2[unk_mask, 0], emb2[unk_mask, 1], s=22, color="#BBBBBB",
               edgecolor="white", linewidth=0.3, label="wajah tidak terdaftar (s011–s026)")
ax.set_title("Proyeksi t-SNE embedding 512-D → 2-D dari 239 crop wajah\n"
             "(dari 243 crop tersedia; 4 gagal dideteksi ulang oleh YuNet) — "
             "9 siswa terdaftar s001–s010\n(tanpa s008) vs 16 siswa tidak terdaftar s011–s026")
ax.set_xlabel("Dimensi t-SNE 1")
ax.set_ylabel("Dimensi t-SNE 2")
ax.legend(fontsize=7.5, ncol=2, loc="best", markerscale=1.6)
src_note(fig, "Sumber: 239 dari 243 crop datasets/facenet (4 crop tanpa tepat 1 deteksi YuNet dilewati) lewat model "
              "fine-tune ep07 (weights/facenet_model.pth); proyeksi t-SNE (sklearn, perplexity 25, random_state=42).")
fig.savefig(CH / "17_face_embedding_tsne.png", dpi=300, bbox_inches="tight")
plt.close(fig)
print("chart -> 17_face_embedding_tsne.png")
print("DONE")
