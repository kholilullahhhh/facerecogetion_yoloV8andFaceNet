# 06 — Threshold & Kalibrasi (Jarak Euclidean, EER)

**Tanggal:** 5 November 2026 · **Batas audit:** threshold PRODUKSI tidak diubah; `PUT /threshold` dan `POST /calibrate` tidak dipanggil (keduanya memodifikasi runtime service yang hidup). Analisis dilakukan offline dari data array asli.

---

## 1. Threshold aktif & titik keputusan

| Item | Nilai | Bukti |
|---|---|---|
| Threshold produksi | **1.0** | `ai-service/.env` (`FACE_MATCH_THRESHOLD=1.0`); `config.py:13` membacanya; runtime `/health` = 1.0 (GET 05-11-2026, `raw-results/runtime_check.json`) |
| Metrik jarak | Euclidean antar embedding 512-D (L2-normalized) | `app/utils/distance.py:4-7` |
| Pemilihan kandidat | jarak minimum ke SEMUA embedding galeri (bukan rata-rata/vote) | `find_best_match` `:39-47` |
| Keputusan | `min_distance ≤ threshold` → matched (student_id dari galeri); else `unknown` | `:49-62` (threshold=1.0 dipakai via `recognition_service.threshold` `routes`/`recognition_service.py:22,59-63`) |
| Ukuran skala | embedding L2-norm ⇒ jarak ∈ [0, ~2] | dok 03 |
| Runtime-only | `PUT /threshold` mengubah nilai in-memory (tidak persist); `/calibrate` juga set runtime | `routes.py:144-153,156-177` |

## 2. Titik kerja threshold 1.0 (LOAD dari `facenet_metrics.json`, LOO+open-set)

| Model | FAR (semua impostor+unknown) | FRR | TAR |
|---|---|---|---|
| baseline | 30.11% | 1.08% | 98.92% |
| **ep07 (aktif)** | **1.30%** | **13.98%** | **86.02%** |

→ Dengan threshold 1.0 pada model fine-tuned: **FAR 1.3%** (anti-numan baik), FRR 14% (LOO — wajah yang terlalu jauh dari galeri akan ditolak; FRR aktual lapangan biasanya lebih rendah karena kualitas foto enrollment lebih mendekati). Graf 04/05 (`charts/04_far_tar_frr_threshold_baseline.png`, `charts/05_…_facenet_ep07.png`).

**Jangan mencampur angka-angka ini dengan "teorinya":** threshold hasil optimal-FAR (sweep chart 06/07) ≠ threshold EER. Mereka beda jumlah/operating.

## 3. EER — empat sumber, hasilnya beda, satu bermasalah

| Sumber | baseline thr @EER | ep07 thr @EER | EER baseline | EER ep07 | Catatan |
|---|---|---|---|---|---|
| **(A) training script** — `facenet_metrics.json` `EER_threshold`/`EER` | 0.8548 | 1.1578 | 6.85% | **1.82%** | angka resmi yang dipakai day-1 |
| **(B) sweep pair, impostor terdaftar** ✳ | 0.8465 | 1.1755 | 6.45% | 2.14% | recomputasi saya dari array asli |
| **(C) sweep pair, tambah 150 unknown** ✳ | 0.8165 | 1.1345 | 6.46% | 4.30% | lebih konservatif (impostor open-set) |
| **(D) `calculate_eer` (ai-service)** ✳ replica | 0.8560 | 1.1581 | **"93.15%" INVALID** | **"98.18%" INVALID** | **POLARITY BUG** (§4) |

Kesimpulan riset: nilainya konvergen di sekitar **thr ≈ 0.85 (pretrained)** dan **thr ≈ 1.16–1.18 (fine-tuned)** — dgn presisi grid dan definisi impostor menyebabkan区 0.1–2 poin persentase. Demo EER "$% (A)" termasuk bisa; TODO: state protocol via (B) di BAB (angka terlebih terkontrolkal).

Bukti mentah: `raw-results/eer_validation.txt`; skrip reproduksi `audit_scripts/validate_eer_and_negative_cases.py`.

## 4. Temuan: `calculate_eer` bermasalah (polarity terbalik)

`ai-service/app/utils/calibration.py:12-31` melempar **jarak** langsung sebagai score ke `sklearn.metrics.roc_curve(pos_label=1)`, padahal ROC bertipe "higher score = lebih positif" — kebalikan makna jarak (kecil = genuin). Efeknya:

```
thr= 1.516 fpr=0.000 tpr=0.000    ← fpr & tpr selalu saling "tertukar"
thr= 1.376 fpr=0.035 tpr=0.000
thr= 1.166 fpr=0.356 tpr=0.000
...
eer = argmin|fpr−fnr| → 0.9315 / 0.9818   ← mustahil (EER 93–98%)
optimal_threshold ≈ 0.856 / 1.158        ← kebetulan masih dekat benar
```
(fpr/fnr lengkap di `eer_validation.txt`.)

Consequensi: `POST /calibrate` (yang memanggilnya HATRICS pick `optimal_threshold` ke runtime) hasil **EER-nya tidak.valid**; hanya threshold yang berapiraksi plausibel. Rekomendasi fix (dengan izin; BUKAN bagian audit): pass `-distance` sebagai score, atau hitung FAR/FRR langsung dengan sweep pair (metode B) — lalu calibrate tetap jangan dilakukan halaman production tanpa freeze di DB.

### TRADING births:

- (from day-1): . Kalibrasi digunakan dilakukan vacances offlina (values wahr. sweep pair di tabel §3) dan disimpan sebagai konfig kasus `.env` (diterapkan di restart).
- tidak ejaji 'yes أ tn finish'/calibrate to production.

## 5. Mekanisme yang belum terbukti dalam system

- **Tidak ada fallback matching kedua** (hanya min-distance satu metrik).
- **Tidak ada margin/uncertainty envelope** — sebuah kandidat yang jaraknya sedikit di atas threshold langsung "unknown" — perlu pengujian hasil produced di lapangan (kategori D screenshots "wajah tidak dikenal").
- **Belum ada penamaan normal matcher benchmark** dgn data lapangan dalam sebuah hari/sesi aktual (butuh data DB yang ada, MySQL akan aktif).
