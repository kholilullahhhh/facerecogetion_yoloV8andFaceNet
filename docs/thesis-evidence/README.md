# THESIS RESEARCH EVIDENCE AUDIT — Paket Bukti Penelitian

**Topik skripsi:** Sistem Absensi Siswa Menggunakan Face Recognition Berbasis YOLOv8 dan FaceNet pada SMP Aisyiyah Paccinongang
**Tanggal audit:** 5 November 2026 · **Admin audit:** read-only (tidak mengubah source code, DB, konfigurasi, threshold)
**Repo:** `D:\unhas\facerecogetion_yoloV8andFaceNet`

---

## 1. Apa isi folder ini?

| File/Folder | Isi |
|---|---|
| `README.md` | File ini — indeks, sumber data, cara reproduksi |
| `01-project-audit.md` | Struktur project: backend Laravel, AI service FastAPI, frontend Next.js, skema DB, keamanan, versi |
| `02-dataset-analysis.md` | Audit tiga dataset (asli, YOLO, facenet) — jumlah, resolusi, valid/failed, variasi, anotasi, leakage |
| `03-model-configuration.md` | Konfigurasi model AKTUAL (YuNet, YOLOv8s, FaceNet) — bukan klaim, tapi hasil pembacaan kode |
| `04-enrollment-results.md` | Skema & alur enrollment wajah; status data DB (LIMITASI: MySQL mati saat audit) |
| `05-model-evaluation.md` | Hasil evaluasi FaceNet (LOO, open-set) + YOLO + latency benchmark + uji edge-case |
| `06-threshold-calibration.md` | Threshold aktif, jarak Euclidean, analisis EER (termasuk temuan bug polarity di `calculate_eer`) |
| `07-api-integration.md` | Integrasi Next.js → Laravel → FastAPI → MySQL; tabel endpoint; temuan halaman settings rusak |
| `08-system-testing.md` | Inventaris pengujian + tabel skenario/input/expected/actual/status + temuan perbaikan |
| `09-thesis-evidence-matrix.md` | Pemetaan 3.1.1–3.3 draft BAB III → status READY/PARTIAL/MISSING/INVALID |
| `10-missing-evidence.md` | Daftar data yang harus Anda siapkan (kategori A–E) |
| `tables/` | CSV hasil agregasi + `db_queries.sql` (query read-only untuk Anda jalankan) |
| `charts/` | 16 grafik Matplotlib 300 DPI + judul/label/sumber data |
| `screenshots/` | Checklist screenshot manual (10 halaman aplikasi) |
| `raw-results/` | JSON mentah + teks validasi + skrip audit yang dapat direproduksi |

## 2. Sumber data (semua angka dapat ditelusuri)

| Bukti | Sumber | Cara dibuat |
|---|---|---|
| Statistik dataset (247 foto, 25 folder, bbox, brightness, roll) | `raw-results/dataset_scan.json` | `scan_dataset.py` (scan file asli + inference YuNet in-memory) |
| Benchmark latensi (n=27, dim 512) | `raw-results/api_latency_results.json` | `run_api_benchmark.py` (HTTP live ke AI service :8001) |
| Metrik FaceNet (AUC/EER/LOO) | `ai-service/training_runs/facenet_eval_20261103_025239/facenet_metrics.json` | script training 03-11-2026 (day 1) |
| Metrik YOLO | `ai-service/training_runs/yolo_20261103_025549/` (`yolo_train_metrics.json`, `run/results.csv`) | training 03-11-2026 |
| Laporan training | `ai-service/training_runs/REPORT_2026-11-03.md` | day 1 |
| Validasi EER + uji edge-case | `raw-results/eer_validation.txt` | `validate_eer_and_negative_cases.py` |
| Status runtime live | `raw-results/runtime_check.json` | `check_runtime.py` (GET /health) |
| Audit kode backend/frontend | dokumen 01/07/08 (dengan referensi file:baris) | pembacaan kode + subaudit |
| Grafik | `charts/*.png` | `make_charts.py` (input = file di atas) |
| Tabel CSV | `tables/*.csv` | `make_tables.py` |

## 3. Cara mereproduksi (dari `docs/thesis-evidence/raw-results/audit_scripts/`)

```bash
cd docs/thesis-evidence/raw-results/audit_scripts

# 1) scan dataset (butuh ai-service venv: opencv, numpy; model YuNet)
python scan_dataset.py            # -> ../dataset_scan.json

# 2) benchmark latensi (butuh AI service hidup di 127.0.0.1:8001; tidak menulis DB)
python run_api_benchmark.py       # -> ../api_latency_results.json

# 3) validasi EER + uji foto tanpa wajah (read-only, aman)
python validate_eer_and_negative_cases.py  1> ../eer_validation.txt

# 4) cek runtime (GET /health)
python check_runtime.py           # -> ../runtime_check.json

# 5) regenerasi CSV + grafik 300 DPI
python make_tables.py             # -> ../../tables/*.csv
python make_charts.py             # -> ../../charts/*.png (+ salinan plot ultralytics)

# 6) rekap semua angka yang dipakai di dokumen
python summarize_evidence.py
```

## 4. Batasan penting audit (jangan meremehkan, ini bagian kejujuran riset)

1. **MySQL MATI saat audit** (port 3306 tidak merespons, tidak ada proses mysqld). Akibatnya semua agregat database (jumlah siswa, jumlah embedding, duplikat, dsb.) **bukan verified** — lihat `04` dan `10` (kategori B). Tabel `tables/db_queries.sql` sudah disiapkan; jalankan setelah MySQL menyala, lalu isi angkanya ke `04`.
2. **Draft BAB III tidak ada di repo** — file "Pasted text(20261104-174148).txt" tidak ditemukan di filesystem. Pemetaan di `09` memakai struktur subbab 3.1.1–3.3 yang dikutip di prompt audit. Tempelkan draft agar pemetaan final presisi.
3. **Evaluasi FaceNet memakai crop dataset enrollment dengan protokol leave-one-out** — valid sebagai eksperimen internal, tapi **bukan** bukti generalisasi ke foto baru (lihat `05` limitasi, dan kategori C di `10`).
4. **Endpoint `/calibrate` sengaja TIDAK dipanggil** — dia mengubah threshold runtime host aktif dan fungsi EER-nya bermasalah (bukti: `06`).
5. **Privasi:** foto siswa adalah data pribadi. Semua label memakai anonim `sNNN`; tidak ada nama siswa/tokok sensitif yang direplikasi ke dokumen ini..Protect: jangan tempel foto siswa tanpa penyamaran identitas di bab publikasi.
6. Setiap grafik menyertakan **judul, label sumbu, legend, satuan, dan sumber data**; setiap klaim dare di dokumen 01–10 dilengkapi referensi file (dan baris bila relevan).

## 5. Temuan paling menentukan (ringkas — detail per dokumen)

1. **Detektor utama produksi = YuNet ONNX, bukan YOLOv8** (`face_detector_service.py`; YuNet = fallback? TIDAK — YuNet utama, YOLO fallback). YOLOv8s fine-tuned **tetap ada** sebagai fallback dan eksperimen valid (mAP50 0.9935). Klaim draft "pipeline deteksi berbasis YOLOv8" harus direvisi → `09` (INVALID).
2. **FaceNet yang berjalan saat ini = hasil fine-tuning ep07** (deploy 03-11-2026, 512-D, InceptionResnetV1/VGGFace2, loss = cross-entropy head 9-kelas — **bukan Triplet Loss**) → `03`/`05`.
3. **Threshold aktif = 1.0** (jarak Euclidean; `/health` verifikasi 05-11-2026) — di bawah titik EER (~1.16–1.18) → tradeoff FRR dinaikkan untuk menekan FAR → `06`.
4. **`calculate_eer` bermasalah (polarity)** — menghasilkan EER 0.93–0.98 (mustahil) walau threshold-nya mendekati benar; beri catatan jika memakaiEK /calibrate → `06`.
5. **Halaman admin Settings → Model rusak**: memanggil `/health` & `/threshold` pada baseURL backend Laravel (404 — route tidak ada); juga menampilkan klaim lawas "128-D", "VGGFace2 Pretrained" → `07`.
6. **Enrollment post-deploy wajib di-re-enroll**: embedding lama tidak kompatibel dengan ruang embedding model baru (day-1 note). Status DB belum terverifikasi → `04`/`10`.
