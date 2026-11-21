# 05 — Evaluasi Model (FaceNet & YOLO) + Latensi + Uji Edge-Case

**Tanggal:** 5 November 2026 · **Sumber:** `ai-service/training_runs/facenet_eval_20261103_025239/facenet_metrics.json` (evaluasi 03-11-2026), `yolo_20261103_025549/`, benchmark live `raw-results/api_latency_results.json`, uji edge `raw-results/eer_validation.txt`.
**Prinsip:** angka di bawah persis dari file; saya tidak menggaktu atau menghalahire ekstrapilasi. Uji tambahan yang saya jalankan sendiri ditandai ✳.

---

## 1. Protokol evaluasi FaceNet (penting — batas validitas)

- **Probe/query:** 93 crop wajah (160×160) milik **9 siswa terdaftar** (s001–s010 tanpa s008).
- **Closed-set (LOO/id-Hit):** tiap query dibandingkan (jarak Euclidean min) ke galeri embedding dari crop **gemeinten lain** → pair genuin **93**, pasangan impostor antar siswa terdaftar **3,836**.
- **Open-set:** ditambah **150 crop dari siswa tidak terdaftar** (s011–s026) sebagai "unknown" — mengukur FAR sebenarnya (tak boleh jadi siapa pun).
- Metrik: AUC (ROC), EER + EER-threshold, GAR@best-threshold, distribusi jarak, akurasi cleosed-set, confusion matrix.
- **Perangkat:** CPU (Intel Core 5 120U).

> **Zadrata acceptacy (jujur):** karena query & galeri bahan crop **dataset enrollment yang sama** dengan struktur ter-L-I-O, PAKU AKURASI IDENTIFIKO Iapis ini valid sebagai *aukv-internal*; AKURASI GENERALISASI (foto foto baru) masih BUTUH uji independent (dok 10 kategori C). Fullscale eval end-to-end (`scripts/fullscale_eval.py`) **belum pernah menghasilkan output JSON** — tersimpan sebagai dua unit.

## 2. Hasil per model (semua dari `facenet_metrics.json`)

| Model | AUC | EER | EER-threshold | GAR@best | mean genuin | max genuin | mean impostor | min impostor | mean unknown-min |
|---|---|---|---|---|---|---|---|---|---|
| baseline (pretrained) | 0.9850 | 6.85% | 0.8548 | 92.47% | 0.5188 | 1.1664 | 1.0978 | 0.5822 | 0.8137 |
| **facenet_ep07 (deploy)** | **0.9975** | **1.82%** | 1.1578 | **97.85%** | 0.7828 | 1.2808 | 1.4272 | 0.7506 | 1.0323 |
| facenet_ep15 | 0.9836 | 5.40% | 1.0235 | 96.77% | 0.7760 | 1.1409 | 1.2958 | — | 0.8352 |
| facenet_ep30 | 0.9968 | 2.99% | 1.1580 | 97.85% | 0.8073 | 1.2056 | 1.4055 | — | 0.9896 |

Protokol: 93 pasangan genuin, 3,836 impostor, 150 unknown. akurasi closed-set ID dari我国 chart 03 (`charts/03_top1_recognition_comparison.png`).

**Confusion matrix (ep07):** 9×9, diagonal sepenuhnya sempurna dalam closed-set-LOO — chart 10 (`charts/10_confusion_matrix_finetuned.png`).

## 3. Titik kerja (operating points) — ✳ dari array asli (overflow semua in impostor incl. unknown)

| Threshold | baseline FAR | baseline FRR | ep07 FAR | ep07 FRR | Tar ep07 |
|---|---|---|---|---|---|
| 0.80 | 5.57% | 6.45% | 0.15% | 39.78% | 60.22% |
| 1.00 (aktif) | 30.11% | 1.08% | **1.30%** | **13.98%** | **86.02%** |
| 1.16 (≈EER) | — | — | ~6.2% | ~2.2% | ~97.8% |
| 1.20 | 72.75% | 0.00% | 6.65% | 2.15% | 97.85% |

CSV: `tables/threshold_operating_points.csv`; graf 04–07 (`charts/04…07.png`). Makna: s/d 1.0, model ep07 menekan FAR ke 1.30% (open-set) dengan FRR 13.98% @LOO — sesuai kebutuhan absensi (mau anti-numan).

## 4. Validasi independen (✳ recomputic utk bukti integritas — `eer_validation.txt`)

Saya recomputic EER dari array di `facenet_metrics.json` dgn dua metode (semua tanpa ubah reading):

| Metode | baseline | ep07 |
|---|---|---|
| sweep tempas pair (impostor terdaftar saja) | EER 6.45% @ thr 0.8465 | EER 2.14% @ thr 1.1755 |
| sweep pair (impostor + unknown) | EER 6.46% @ thr 0.8165 | EER 4.30% @ thr 1.1345 |
| `calculate_eer` (ai-service) — POLARITY BUG | "EER 93.15%" tidakvalid @0.8560 | "EER 98.18%" nonvalid @1.1581 |

Kesimpulan: angka resmi dari training script (1.82% ep07, 6.85% baseline) **plausible & cross-check ≈ 2.1%, 6.5%** (beda dikit karena presisi grid); BUG di `calculate_eer` (bug, lihat dok 06) BUKAN memengaruhi hasil evaluasi training (script training sendiri), hanya endpoint `/calibrate`.

## 5. YOLOv8s fallback — hasil training (03-11-2026)

| Metrik (51 val) | Nilai |
|---|---|
| Precision | 0.99563 |
| Recall | 0.96078 |
| mAP@0.5 | **0.9935** |
| mAP@0.5:0.95 | 0.86019 |
| Konfig | 20 epoch, batch 4, imgsz 640 (CPU ≈ 13.9 jam) |
| Kegagalan label | 4 foto tanpa wajah = background (sacos) |

Paraf: mAP back-into-pipeline CATHI 640 letterbox (bukan frame kamera langsung). Bila dipakai, kecepatan onval CPU ≈ 1220 ms/gambar (REPORT). Viz: `charts/12`,`13` + salinan graf native `raw-results/yolo_run_plots/` (results.png, BoxPR/F1, confusion_matrix, val_batch pred).

## 6. Latensi end-to-end (✳ benchmark live, 27 foto, pipeline aktual YuNet→ FaceNet → matching, galeri 30 embedding, CPU)

| Tahap | mean | median | p95 | min–max (ms) |
|---|---|---|---|---|
| `POST /detect` (respons) | 619.4 | 622.6 | 745.3 | 379.5–791.1 |
| `POST /embedding` (resp) | 1066.0 | 1071.3 | 1218.0 | 711.4–1276.5 |
| `POST /recognize` (resp) | 1059.1 | 1077.9 | 1239.3 | 807.7–1250.3 |
| — deteksi (stage) | 428.3 | 445.2 | 482.9 | 319.5–513.6 |
| — embedding (stage) | 428.0 | 445.0 | 495.3 | 224.2–528.1 |
| — matching (stage) | 2.3 | 2.2 | 3.3 | 1.1–10.6 |

CSV `tables/latency_summary.csv`; graf 08/09. Full text data per-sampel disimpan, semua dapat replukasi via `run_api_benchmark.py`.

## 7. Uji kesesuaian fungsi (✳)

| Skenario | Hasil | Bukti |
|---|---|---|
| foto w/o wajah → `/embedding` | **HTTP 400** `{"detail":"No face detected in image"}` ✔ | `eer_validation.txt` |
| foto wajah tunggak normal | 200 + dim=512 (27/27) ✔ | `api_latency_results.json` |
| foto multi-wajah → `/embedding` | aturan kode = 400 (*untested*: dataset tak ber image ≥2 wajah — perlu test oleh Anda, kategori C) | `routes.py:71-72` |
| foto blur/terlalu kecil | validasi kode blokir (issues 'blurry'/'face_too_small') — belum diuji end-to-end | `face_preprocessing.py:113-131` |

## 8. Limitasi yang WAJIB ditulis di skripsi

1. Evaluasi FaceNet = LOO di crop enrollment; bukan generalisasi ke foto baru/sesi baru.
2. Kondisi lapangan (jeuelling, watermark, skala und), harus metter di merentest & uji stratified.
3. Latensi diukur CPU, 1 wajah, galeri 30 — boreal ke beberapa wajah/ galeri barisan besar.
4. Kinerja diperbahservice restart (`/calibrate` mengubah threshold runtime — BUKAN tersegel durables).
5. EER angka tersimis dgn presisi grid; nilai strategis beda 0.1–2 pp antar metode sweep (dl. tabel §4).
