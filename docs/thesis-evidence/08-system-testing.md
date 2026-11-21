# 08 — Audit Pengujian Sistem

**Tanggal:** 5 November 2026 · **Status legenda:** ✔ telah dijalankan dan diamati; ◐ kode tersertifikasi (belum diuji runtime); ✘ belum ada.

## 1. Inventaris aset pengujian

| Jenis | Tersedia | Catatan |
|---|---|---|
| Unit/integration test backend | **2 ExampleTest boilerplate** (`backend/tests/Unit/ExampleTest.php`, `Feature/ExampleTest.php`) — berjalan di SQLite | tidak cakup fungsi face/attendance |
| Test frontend | **TIDAK ADA** (tidak jest/playwright config) | |
| Test AI service | TIDAK ada pytest; evaluasi via script training/eval (`scripts/evaluate_facenet.py` dsb. → JSON bf training_runs) | |
| Uji eksperimen ML | LOO eval + threshold sweep (dok 05) | |
| Benchmark latensi | audit benchmark (dok 05 §6) | |
| Performa load multi-sesi | ✘ tidak ada | kategori C |

## 2. Tabel pengujian fungsional (skenario nyata)

| No. | Skenario | Input | Expected | Actual | Status | Bukti |
|---|---|---|---|---|---|---|
| 1 | AI service bebas berjalan w/ dua model | GET /health | healthy, threshold aktif | healthy, yolo+facenet loaded, threshold 1.0 | ✔ | `runtime_check.json` |
| 2 | Deteksi wajah foto siswa | 27 foto raw via /detect | ≥1 wajah/foto | 27/27 terdeteksi | ✔ | `api_latency_results.json` |
| 3 | Ekstraksi embedding | 27 foto via /embedding | 200, dim 512 | 27/27 OK, dimension=512 | ✔ | idem |
| 4 | Recognition 1:N w/ galeri | 27 foto + galeri 60 emb | faces matched flag dari jarak | hasil+distances+flags tercatat per sampel | ✔ (kesesuaian frasa identitas? per-sampel disimpan) | idem |
| 5 | Foto tanpa wajah → /embedding | 1 foto 0-wajah | 400 | **400** `{"detail":"No face detected in image"}` | ✔ | `eer_validation.txt` |
| 6 | Foto multi-wajah → /embedding | foto ≥2 wajah | 400 "Multiple faces…" | 400 ≤ butuh foto uji (dataset tidak punya) | ◐ | `routes.py:71-72` |
| 7 | Deteksi/full + alignment visual | grid 4 siswa | bbox+landmark+crops 160 timelapse | grid bagus, roll −2.5..−4.1° contoh | ✔ | `charts/14_detection_alignment_grid.png` |
| 8 | Login (endpoint+rate limit) | kredensial role | token + role redirect | **tidak diuji** — MySQL mati | ✘ | — |
| 9 | CRUD siswa/cls/guru | HTTP | 200/403 per role | tak diuji runtime | ✘ | kode diaudit (dok 01) |
| 10 | Pembuatan/closing sesi | API | idempotent/closed | tak diuji runtime | ✘ | kode audited |
| 11 | Absensi end-to-end (dapat di-capai) | kamera → /recognize | re crowd 1 baris/siswa/sesi | tak diuji runtime | ✘ | — |
| 12 | Wajah instic 3rd party | foto orang tak mendaftar | matched=false | **terverifikasi via data evaluasi** open-set FAR@1.0 = 1.30% (bukan UI) | ✔(eval) | dok 05 §3 |
| 13 | Otorisasi guru ↔ sesi | token guru lain | 403 | kode PASS design; runtime TBD | ◐ | `AttendanceController:134-141` |
| 14 | YOLO fallback aktif ketika YuUnit di-load gagal | — | fallback YOLO | kode jaim; tidak direproduksi runtime | ◐ | `recognition_service.py:29-34` |

**Kesimpulan:** sisi **AI service** telah teruji kuantitatif (no. 1–7, 12); sisi **aplikasi web end-to-end** masih perlu uji manual Anda (screenshots D + gunakan data DB setelah MySQL nyala) — checklist lengkap di `screenshots/README.md` & dok 10.

## 3. Hasil performa (ringkas; detail dok 05 §6)

| Bentuk uji | Hasil |
|---|---|
| Latensi /detect /embedding /recognize (CPU, 27 f.) | 619 / 1066 / 1059 ms (mean, respons server) |
| Breakdown stage /recognize | detection 428 / embedding 428 / matching 2.3 ms |
| eugen distance inkremental (galeri 30 emb) | kira-kira 2 ms per wajah |
| YOLO fallback inference | ± 1220 ms/foto (CPU, REPORT) |

## 4. Daftar temuan audit — insyaf menghorm private untuk rapi posture; tidak diubah saat audit

| # | Lokasi | Temuan | Dampak | Rekomendasi (tidak diimplementasi) |
|---|---|---|---|---|
| F1 | `AttendanceController::recordAttendance` :145-151 | endpoint `/record` menerima **distance & status dari client** (teacher/bearer) | seorang teacher/botox bisa simpan absensi dgn data jarak apa saja (tidak mengekll的证据) | buat /record hanya untuk admin/fix conclusive; atau ambil distance dari AI sebelum nulis |
| F2 | `FaceEmbeddingController:55,61` & `AttendanceController:286` | teks exception AI dikirim mentah ke client | information disclosure (schema/path/baehasa) | map ke pesan generik, log internal |
| F3 | `attendance.captured_image` (migrasi :19) | kolom ada tapi **tidak pernah ditulis** (grep: tidak ada assignment) | bukti visual absensi hilang | simpan path snapshot saat recognize (perlu izin datou profesional storage), atau hapus kolom |
| F4 | `routes/api.php` | hanya login yang di-throttle | endpoint berat (recognize/embed transactions) bisa flood | rate limite per user / IP |
| F5 | `routes.py` AI | **AI service tanpa autentikasi**; `/recognize` menerima `embeddings_json` dari caller | jika diakses langsung dari luar, biod kuasabel custom gallery | bind ke localhost / dinding firewall, atau minimum token statik |
| F6 | `admin/settings/model` page.tsx | memanggil /health,/threshold di Laravel (404) + pengalaman status lama "128-D" | halaman selalu "gagal"; wis aks Satya | proxy route ke AI; perbarui teks (512-D, fine-tuned) |
| F7 | `recognition_service.py:56,64` | `timing["embedding_ms"]`/`matching_ms` **ditimpa di tiap iterasi wajah** (bila >1 wajah nilainya jadi wajah terakhir) | metrik timing multi-wajah sedikit bias | akumulasi (+=) помимо tampil |
| F8 | `calibration.py` | polarity EER bermasalah (dok 06) | /calibrate set threshold nmakanya plausibel tapi reporting EER salah | perbaiki polaritas (pakai −distance atau sweep pair) |

## 5. Yang perlu dijawab di BAB Gesprüne, tapi belum bukan bacil data (triage ke dok 10)

- Akurasi end-to-end (sistem ≠ seluruh modification) konsisten per sesi absensi nyata (TBC setelah MySQL nyala + seseorang migrasi d桥).
- Farer/A/FRR-Ops TERKAIT dia ddi gambare ujian (screenshots).
- Test ber-laterales (setiap role, dan most).
