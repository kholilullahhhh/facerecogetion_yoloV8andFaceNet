# -*- coding: utf-8 -*-
"""Generate all research charts (300 DPI PNG) from REAL evidence files.

Input (read-only):
- ..../raw-results/dataset_scan.json          (dataset audit scan)
- ..../raw-results/api_latency_results.json   (live benchmark)
- ai-service/training_runs/facenet_eval_20261103_025239/facenet_metrics.json
- ai-service/training_runs/yolo_20261103_025549/run/results.csv + ultralytics plots
- ai-service/weights/face_detection_yunet_2023mar.onnx  (for detection grid)

Output: docs/thesis-evidence/charts/*.png (300 dpi) + copies of ultralytics plots -> raw-results/yolo_run_plots/

Usage: python make_charts.py   (from docs/thesis-evidence/raw-results/audit_scripts/)
"""
import csv
import json
import shutil
from pathlib import Path

import cv2
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

REPO = Path(__file__).resolve().parents[4]
RAW = Path(__file__).resolve().parent.parent          # raw-results/
CH = RAW.parent / "charts"
CH.mkdir(parents=True, exist_ok=True)

SCAN = json.load(open(RAW / "dataset_scan.json", encoding="utf-8"))
LAT = json.load(open(RAW / "api_latency_results.json", encoding="utf-8"))
EVAL_DIR = sorted((REPO / "ai-service" / "training_runs").glob("facenet_eval_*"))[-1]
MET = json.load(open(EVAL_DIR / "facenet_metrics.json", encoding="utf-8"))
YOLO_RUN = sorted((REPO / "ai-service" / "training_runs").glob("yolo_*"))[-1] / "run"
YUNET = REPO / "ai-service" / "weights" / "face_detection_yunet_2023mar.onnx"

DPI = 300


def src_note(fig, text):
    fig.text(0.5, 0.005, text, ha="center", fontsize=6.5, color="#555555")


def save(fig, name):
    fig.savefig(CH / name, dpi=DPI, bbox_inches="tight")
    plt.close(fig)
    print("chart ->", name)


# 1. dataset distribution per student -----------------------------------------
raw = SCAN["raw"]["per_student"]
face = SCAN["facenet"]["per_student"]
raw_ids = [s["student"] for s in raw]
raw_n = [s["photos"] for s in raw]
face_by = {s["student"]: s["crops"] for s in face}
face_n = [face_by.get(i, 0) for i in raw_ids]

fig, ax = plt.subplots(figsize=(12, 4.6))
x = np.arange(len(raw_ids))
ax.bar(x - 0.2, raw_n, 0.4, label="Foto asli (datasets mentah)", color="#4C72B0")
ax.bar(x + 0.2, face_n, 0.4, label="Crop wajah 160x160 (dataset facenet)", color="#DD8452")
ax.set_xticks(x, raw_ids, rotation=0, fontsize=8)
ax.set_xlabel("ID siswa (anonim, folder dataset)")
ax.set_ylabel("Jumlah gambar (unit)")
ax.set_title("Distribusi dataset per siswa — dataset mentah vs hasil preprocessing YuNet+align")
ax.legend(); ax.grid(axis="y", alpha=.3)
src_note(fig, "Sumber: raw-results/dataset_scan.json (scan_file: ai-service/datasets & datasets); 25 folder = 247 foto asli, 243 crop valid.")
save(fig, "01_dataset_distribution_per_student.png")

# 2. valid vs failed -----------------------------------------------------------
single = [s["single_face"] for s in raw]
multi = [s["multi_face"] for s in raw]
noface = [s["no_face"] for s in raw]
fig, ax = plt.subplots(figsize=(12, 4.6))
ax.bar(x, single, label="Terdeteksi 1 wajah (dipakai)", color="#55A868")
ax.bar(x, multi, bottom=single, label=">1 wajah (diproses utama saja)", color="#E8B74F")
ax.bar(x, noface, bottom=np.array(single) + np.array(multi), label="0 wajah (gagal / background)", color="#C44E52")
ax.set_xticks(x, raw_ids, fontsize=8)
ax.set_xlabel("ID siswa (anonim)"); ax.set_ylabel("Jumlah foto (unit)")
ax.set_title("Hasil verifikasi deteksi wajah YuNet pada 247 foto mentah")
ax.legend(); ax.grid(axis="y", alpha=.3)
src_note(fig, "Sumber: raw-results/dataset_scan.json — face count cv2.FaceDetectorYN (threshold 0.5, sisi maks 960 px).")
save(fig, "02_dataset_valid_failed.png")

# 3. TOP-1 / closed-set comparison ---------------------------------------------
models = list(MET.keys())
idacc = [MET[m]["summary"]["closed_set_ID_acc"] * 100 for m in models]
fig, ax = plt.subplots(figsize=(7.5, 5))
bars = ax.bar(models, idacc, color=["#888888", "#DD8452", "#C9CBCF", "#B0BEC5"][:len(models)])
for b, v in zip(bars, idacc):
    ax.text(b.get_x() + b.get_width() / 2, v + .8, f"{v:.1f}%", ha="center", fontsize=9)
ax.set_ylim(0, 105); ax.set_ylabel("Akurasi (% cermin query mendaftar)")
ax.set_xlabel("Model embedding (protokol leave-one-out 1:N, min euclidean)")
ax.set_title("Perbandingan akurasi identifikasi closed-set (TOP-1, 93 query)")
src_note(fig, f"Sumber: {EVAL_DIR.name}/facenet_metrics.json; query 93 crop siswa terdaftar, galeri = seluruh crop (leave-one-out).")
save(fig, "03_top1_recognition_comparison.png")

# 4-6. FAR / TAR / FRR sweep ----------------------------------------------------
def curve(m):
    d = MET[m]
    gd = np.array(d["genuine_d"]); im = np.array(d["impostor_d"]); un = np.array(d["unknown_min_dist"])
    imp_all = np.concatenate([im, un])
    ths = np.linspace(0.0, 1.6, 321)
    far_all = [(imp_all <= t).mean() for t in ths]
    far_un = [(un <= t).mean() for t in ths]
    tar = [(gd <= t).mean() for t in ths]
    frr = [1 - v for v in tar]
    return ths, np.array(far_all), np.array(far_un), np.array(tar), np.array(frr)

cur = {m: curve(m) for m in MET}
for m, label in [("baseline", "Seperti model lama"), ("facenet_ep07", "FaceNet hasil fine-tuning (deploy)")]:
    ths, fa, fu, tar, frr = cur[m]
    fig, ax = plt.subplots(figsize=(7.5, 5))
    ax.plot(ths, fa, label="FAR semua impostor", color="#C44E52")
    ax.plot(ths, fu, label="FAR impostor tidak terdaftar (open-set)", color="#E8B74F", ls="--")
    ax.plot(ths, tar, label="TAR / GAR (query genuin)", color="#55A868")
    ax.plot(ths, frr, label="FRR (salah tolak genuin)", color="#4C72B0", ls=":")
    prod = 0.8 if m == "baseline" else 1.0
    ax.axvline(prod, color="k", ls="-.", lw=1)
    ax.annotate(f"thr aktif produksi: {prod}", (prod, .02), fontsize=7, rotation=90)
    ax.set_xlabel("Threshold jarak Euclidean [0..2]")
    ax.set_ylabel("Rasio kumulatif (0-1)")
    ax.set_title(f"Kurva FAR/TAR/FRR terhadap threshold — {label}")
    ax.legend(fontsize=8); ax.grid(alpha=.3)
    src_note(fig, f"Sumber: {EVAL_DIR.name}/facenet_metrics.json ({m}); 93 pasangan genuin (LOO), 3.836 pasangan impostor antar siswa terdaftar, 150 crop impostor open-set.")
    fname = "04" if m == "baseline" else "05"
    save(fig, f"{fname}_far_tar_frr_threshold_{m}.png")

# separate FAR & TAR charts (cleaner per prompt request)
for m, tag in [("baseline", "baseline"), ("facenet_ep07", "finetuned_ep07")]:
    ths, fa, fu, tar, frr = cur[m]
    fig, ax = plt.subplots(figsize=(7.5, 5))
    ax.plot(ths, fa, label="FAR (semua impostor)", color="#C44E52", lw=2)
    ax.plot(ths, fu, label="FAR open-set", color="#E8B74F", lw=2, ls="--")
    ax.set_xlabel("Threshold jarak Euclidean"); ax.set_ylabel("FAR (0-1)")
    ax.set_title(f"FAR terhadap threshold — {tag}")
    ax.legend(); ax.grid(alpha=.3)
    src_note(fig, f"Sumber: {EVAL_DIR.name}/facenet_metrics.json ({m}).")
    save(fig, f"06_far_vs_threshold_{tag}.png")

    fig, ax = plt.subplots(figsize=(7.5, 5))
    ax.plot(ths, tar, label="TAR/genuin", color="#55A868", lw=2)
    ax.set_xlabel("Threshold jarak Euclidean"); ax.set_ylabel("TAR (0-1)")
    ax.set_title(f"TAR terhadap threshold — {tag}")
    ax.legend(); ax.grid(alpha=.3)
    src_note(fig, f"Sumber: {EVAL_DIR.name}/facenet_metrics.json ({m}).")
    save(fig, f"07_tar_vs_threshold_{tag}.png")

# 8. latency ---------------------------------------------------------------------
def st(d):
    return LAT[d]["stats_resp_ms"], LAT[d]["stats_wall_ms"]

fig, ax = plt.subplots(figsize=(9, 5))
endpoints = ["detect", "embedding", "recognize"]
means, med, p95 = [], [], []
for e in endpoints:
    s, _ = st(e)
    means.append(s["mean"]); med.append(s["median"]); p95.append(s["p95"])
x = np.arange(3)
ax.bar(x - 0.25, means, 0.25, label="mean", color="#4C72B0")
ax.bar(x, med, 0.25, label="median", color="#55A868")
ax.bar(x + 0.25, p95, 0.25, label="p95", color="#C44E52")
ax.set_xticks(x, [f"POST /{e}" for e in endpoints])
ax.set_ylabel("Waktu proses server (ms)"); ax.set_xlabel("Endpoint AI service")
ax.set_title(f"Latensi infensi AI service per endpoint (n=27 foto, CPU)")
for xi, m in zip(x, means):
    ax.text(xi - .25, m + 20, f"{m:.0f}", fontsize=8, ha="center")
ax.legend(fontsize=8); ax.grid(axis="y", alpha=.3)
src_note(fig, "Sumber: raw-results/api_latency_results.json — field processing_time_ms respons HTTP, AI service local:8001, threshold aktif 1.0.")
save(fig, "08_latency_per_endpoint.png")

fig, ax = plt.subplots(figsize=(9, 4.8))
rows = LAT["recognize"]["samples"]
detm = np.array([r["detection_ms"] for r in rows], float)
embm = np.array([r["embedding_ms"] for r in rows], float)
matm = np.array([r["matching_ms"] for r in rows], float)
bottom = np.zeros(len(rows))
for arr, lbl, c in [(detm, "detection_ms", "#4C72B0"), (embm, "embedding_ms", "#55A868"), (matm, "matching_ms", "#E8B74F")]:
    ax.bar(range(1, len(rows) + 1), arr, bottom=bottom, label=lbl, color=c)
    bottom += arr
total = detm + embm + matm
ax.plot(range(1, len(rows) + 1), total, "k.-", lw=.8, label="resp processing_time_ms")
ax.set_xlabel("Sampel uji (foto ke-i dari 27 foto test)")
ax.set_ylabel("Waktu (ms)")
ax.set_title("Breakdown latensi pipeline deteksi->embedding->pencocokan per sampel (POST /recognize)")
ax.legend(fontsize=8); ax.grid(axis="y", alpha=.3)
src_note(fig, "Sumber: raw-results/api_latency_results.json -> recognize.samples[.detection_ms/.embedding_ms/.matching_ms], galeri 30 embedding, CPU.")
save(fig, "09_latency_breakdown_stage.png")

# 9. confusion matrix -------------------------------------------------------------
r = MET["facenet_ep07"]
ids = r["confusion"]["labels"]
cm = np.zeros((len(ids), len(ids)), int)
for p, t in zip(r["confusion"]["pred"], r["confusion"]["true"]):
    cm[t, p] += 1
fig, ax = plt.subplots(figsize=(8.5, 7.2))
im = ax.imshow(cm, cmap="Greens")
ax.set_xticks(range(len(ids)), ids, rotation=90, fontsize=8)
ax.set_yticks(range(len(ids)), ids, fontsize=8)
for i in range(len(ids)):
    for j in range(len(ids)):
        if cm[i, j]:
            ax.text(j, i, cm[i, j], ha="center", va="center", fontsize=8,
                    color="white" if cm[i, j] > cm.max() * .6 else "black")
ax.set_xlabel("Prediksi tetangga terdekat 1:N"); ax.set_ylabel("Identitas sebenarnya")
ax.set_title("Confusion matrix identifikasi closed-set — FaceNet fine-tuned ep07 (LOO)")
fig.colorbar(im, ax=ax, fraction=.046)
src_note(fig, f"Sumber: {EVAL_DIR.name}/facenet_metrics.json (facenet_ep07.pred_ids/true_ids). acc={r['summary']['closed_set_ID_acc']*100:.1f}%")
save(fig, "10_confusion_matrix_finetuned.png")

# 10. pipeline diagram ------------------------------------------------------------
fig, ax = plt.subplots(figsize=(12.5, 6.2))
ax.axis("off")
boxes = [
    (0.01, "Kamera/Webcam\nNext.js (teacher)\ngetUserMedia,\nsnapshot tiap 2 detik"),
    (0.175, "Backend Laravel\nPOST /api/attendance/recognize\n(validasi, sesi aktif, multipart)"),
    (0.34, "AI Service FastAPI\n/recognize (multipart image\n+ embeddings_json)"),
    (0.505, "Preprocessing\nYuNet 960px + score 0.5\nalign mata + Lanczos 160x160"),
    (0.67, "FaceNet embedding\n512-D, L2-norm,\nnormalisasi (x-127.5)/128"),
    (0.835, "Pencocokan 1:N\njarak Euclidean min\nth=1.0 (aktif)"),
]
for i, (xf, t) in enumerate(boxes[:-1]):
    ax.add_patch(plt.Rectangle((xf, 0.3), 0.15, 0.36, fill=True,
                               color=["#DCE7F5", "#E8F3E8", "#FBEDD8", "#F5E0E0", "#EFE5F5"][i],
                               ec="#555"))
    ax.text(xf + 0.075, 0.48, t, ha="center", va="center", fontsize=8.2)
    ax.annotate("", xy=(xf + 0.165, 0.48), xytext=(xf + 0.15, 0.48),
                arrowprops=dict(arrowstyle="->", lw=1.4, color="#333"))
# matching -> decisions box
xf, t = boxes[-1]
ax.add_patch(plt.Rectangle((xf, 0.3), 0.15, 0.36, fill=True, color="#E5F1F8", ec="#555"))
ax.text(xf + 0.075, 0.48, t, ha="center", va="center", fontsize=8.2)
ax.annotate("", xy=(xf + 0.165, 0.48), xytext=(xf + 0.15, 0.48),
            arrowprops=dict(arrowstyle="->", lw=1.4, color="#333"))
# HADIR/TERLAMBAT + DB
ax.add_patch(plt.Rectangle((0.835, 0.02), 0.15, 0.19, fill=True, color="#E5F8E5", ec="#555"))
ax.text(0.91, 0.115,
        "Laravel: Attendance.create\nstatus = HADIR/TERLAMBAT\n(start+15menit), distance &\nconfidence disimpan\nMySQL: attendances",
        ha="center", va="center", fontsize=7.4)
ax.annotate("", xy=(0.91, 0.215), xytext=(0.91, 0.30), arrowprops=dict(arrowstyle="->", lw=1.4))
ax.add_patch(plt.Rectangle((0.01, 0.02), 0.30, 0.19, fill=True, color="#F8E5E5", ec="#555"))
ax.text(0.16, 0.115, "Unmatched / tidak dikenal -> wajah ditandai 'unknown',\n tidak dibuat data kehadiran (UI: kotak merah)",
        ha="center", va="center", fontsize=7.4)
ax.set_title("Pipeline absensi wajah (implementasi aktual — berdasarkan source code)", pad=14)
src_note(fig, "Sumber: ai-service/app/*, backend/app/Http/Controllers/Api/AttendanceController.php, frontend/src/app/teacher/attendance/page.tsx.")
save(fig, "11_system_pipeline_diagram.png")

# 11. YOLO training curves from results.csv ----------------------------------------
csvp = YOLO_RUN / "results.csv"
with open(csvp, encoding="utf-8") as f:
    rows = list(csv.DictReader(f))
prefix = rows[0].keys()
def col(name):
    for k in rows[0].keys():
        if k.strip() == name:
            return [float(r[k]) for r in rows]
    return []
ep = col("epoch")
fig, axs = plt.subplots(1, 2, figsize=(12.5, 4.6))
for c, lbl in [("train/box_loss", "train box_loss"), ("train/cls_loss", "train cls_loss"),
               ("train/dfl_loss", "train dfl_loss"), ("val/box_loss", "val box_loss"),
               ("val/cls_loss", "val cls_loss"), ("val/dfl_loss", "val dfl_loss")]:
    v = col(c)
    if v: axs[0].plot(np.array(ep) + 1, v, label=lbl)
axs[0].set_xlabel("epoch"); axs[0].set_ylabel("loss (unit relatif)")
axs[0].set_title("YOLOv8s fine-tune — kurva loss (20 epoch)"); axs[0].legend(fontsize=7); axs[0].grid(alpha=.3)
for c, lbl in [("metrics/precision(B)", "precision"), ("metrics/recall(B)", "recall"),
               ("metrics/mAP50(B)", "mAP50"), ("metrics/mAP50-95(B)", "mAP50-95")]:
    v = col(c)
    if v: axs[1].plot(np.array(ep) + 1, np.array(v) * 100, label=lbl)
axs[1].set_xlabel("epoch"); axs[1].set_ylabel("Persen (%)")
axs[1].set_title("YOLOv8s fine-tune — metric validasi per epoch"); axs[1].legend(fontsize=7); axs[1].grid(alpha=.3)
src_note(fig, f"Sumber: ai-service/training_runs/{YOLO_RUN.parent.name}/run/results.csv (hasil training 03-11-2026, n=196 train/51 val)")
save(fig, "12_yolo_training_curves.png")

# 12. YOLO final metrics bar --------------------------------------------------------
with open(sorted((REPO / "ai-service" / "training_runs").glob("yolo_*"))[-1] / "yolo_train_metrics.json", encoding="utf-8") as f:
    yt = json.load(f)
row = {k.strip(): v for k, v in yt["metrics_last_row"].items()}
labels = ["Precision", "Recall", "mAP@0.5", "mAP@0.5:0.95"]
keys = ["metrics/precision(B)", "metrics/recall(B)", "metrics/mAP50(B)", "metrics/mAP50-95(B)"]
vals = [float(row.get(k, 0)) * 100 for k in keys]
fig, ax = plt.subplots(figsize=(7.5, 5))
bars = ax.bar(labels, vals, color=["#4C72B0", "#55A868", "#4C72B0", "#8172B2"])
for b, v in zip(bars, vals):
    ax.text(b.get_x() + b.get_width() / 2, v + 1, f"{v:.2f}%", ha="center", fontsize=9)
ax.set_ylim(0, 110); ax.set_ylabel("Persen (%)")
ax.set_title("Metrik deteksi YOLOv8s hasil fine-tuning (51 gambar Val)")
ax.grid(axis="y", alpha=.3)
src_note(fig, f"Sumber: ai-service/training_runs/{YOLO_RUN.parent.name}/run/results.csv baris terakhir; validasi ultralytics best.pt.")
save(fig, "13_yolo_final_metrics.png")

# 13. detection grid (raw -> YuNet bbox -> aligned crop) -----------------------------
det = cv2.FaceDetectorYN.create(str(YUNET), "", (320, 320), score_threshold=0.5)
RAW_ROOT = REPO / "ai-service" / "datasets"
chosen = []
for sid in [1, 3, 7, 10]:
    d = (sorted(RAW_ROOT.glob(f"foto {sid}-*")) or sorted(RAW_ROOT.glob(f"foto {sid}")))[0]
    p = sorted(list(d.rglob("*.jpg")))[0]
    chosen.append((sid, p))
fig, axs = plt.subplots(3, 4, figsize=(13, 8))
for j,(sid, p) in enumerate(chosen):
    img = cv2.imread(str(p))
    h, w = img.shape[:2]
    scale = min(1.0, 960 / max(h, w))
    small = img if scale >= 1 else cv2.resize(img, (int(w*scale), int(h*scale)), interpolation=cv2.INTER_AREA)
    det.setInputSize((small.shape[1], small.shape[0]))
    _, faces = det.detect(small)
    axs[0][j].imshow(cv2.cvtColor(img, cv2.COLOR_BGR2RGB)); axs[0][j].set_title(f"s{sid:03d} asli ({w}x{h})", fontsize=9); axs[0][j].axis("off")
    if faces is not None:
        f = faces[0]
        x1, y1, fw, fh = [v / scale for v in f[:4]]
        re = (f[4]/scale, f[5]/scale); le = (f[6]/scale, f[7]/scale)
        ang = np.degrees(np.arctan2(le[1]-re[1], le[0]-re[0]))
        vis = img.copy()
        cv2.rectangle(vis, (int(x1), int(y1)), (int(x1+fw), int(y1+fh)), (0, 200, 0), 3)
        for (ex, ey) in (re, le):
            cv2.circle(vis, (int(ex), int(ey)), max(3, int(min(w, h)*0.006)), (255, 0, 0), -1)
        axs[1][j].imshow(cv2.cvtColor(vis, cv2.COLOR_BGR2RGB))
        axs[1][j].set_title(f"YuNet bbox + landmark (score {f[14]:.2f}, roll {ang:.1f}\u00b0)", fontsize=9)
        crop = img[max(0, int(y1)):int(y1+fh), max(0, int(x1)):int(x1+fw)]
        if crop.size:
            angm = cv2.getRotationMatrix2D((crop.shape[1]//2, crop.shape[0]//2), ang, 1.0)
            rot = cv2.warpAffine(crop, angm, (crop.shape[1], crop.shape[0]), flags=cv2.INTER_CUBIC)
            crop = rot
        align = cv2.resize(crop, (160, 160), interpolation=cv2.INTER_LANCZOS4) if crop.size else np.zeros((160, 160, 3), np.uint8)
        axs[2][j].imshow(cv2.cvtColor(align, cv2.COLOR_BGR2RGB))
        axs[2][j].set_title("Crop + align mata -> 160x160 (input FaceNet)", fontsize=9)
    else:
        for i in (1, 2):
            axs[i][j].axis("off"); axs[i][j].set_title("tidak terdeteksi", fontsize=9)
    for i in range(3):
        axs[i][j].axis("off")
src_note(fig, "Sumber: foto asli ai-service/datasets + inference YuNet ONNX. Kotak = bbox, titik biru = landmark mata (kiri/kanan).")
fig.suptitle("Contoh anotasi deteksi & preprocessing (diproduksi langsung dari pipeline saat audit)", y=0.98)
fig.tight_layout()
save(fig, "14_detection_alignment_grid.png")

# copy ultralytics native plots -----------------------------------------------------
plots_dir = RAW / "yolo_run_plots"
plots_dir.mkdir(exist_ok=True)
for png in YOLO_RUN.glob("*.png"):
    shutil.copy2(png, plots_dir / png.name)
print("ultralytics plots copied ->", plots_dir)

print("\nAll charts in:", CH)
