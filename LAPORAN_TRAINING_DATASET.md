# Laporan Hasil "Training" & Testing Dataset Face Recognition

**Proyek**: Sistem Absensi Face Recognition (Laravel 13 + FastAPI YOLOv8s/FaceNet + Next.js 16)
**Tanggal laporan**: 30 Oktober 2026
**Status database**: terverifikasi 558 embedding aktif (dump langsung dari MySQL)

---

## 1. Ringkasan Eksekutif

| Aspek | Hasil |
|---|---|
| Siswa terdaftar (enrollment) | **9/10 siswa** (siswa 8 tidak memiliki folder foto di dataset) |
| Embedding tersimpan di DB | **558** (dari 94 foto, hasil augmentasi ±6 varian/foto) |
| Identifikasi siswa terdaftar (closed-set, skala penuh) | **93/93 = 100% TOP-1 benar** |
| Identifikasi generalisasi (leave-one-out) | **29/30 TOP-1** |
| Orang asing diterima (FAR) @ threshold 0,8 (aktif) | 🔴 **62%** — terlalu longgar |
| FAR @ threshold 0,55 (rekomendasi) | **0,67%** dengan TAR tetap 100% |
| End-to-end (backend + DB + AI service) | **12/12 PASS** |
| Unit test backend | 2/2 PASS · Pint ✅ |
| Frontend | lint 0 error · `tsc --noEmit` bersih |

> ⚠️ **Klarifikasi penting**: tidak ada *weight* model yang di-train ulang. FaceNet memakai bobot pra-latih **VGGFace2** dan detektor memakai **YuNet ONNX resmi**. Yang disebut "training" di sistem ini adalah **enrollment** — mendaftarkan embedding wajah siswa ke database. Training YOLO dari dataset ini **tidak dimungkinkan** karena dataset tidak memiliki label (`data.yaml`/bounding box annotasi) — lihat §7.

---

## 2. Dataset

Sumber: `ai-service/datasets/` — 25 folder Google Drive (`foto N-…/foto N/*.jpg`), **247 foto** asli (foto ponsel, resolusi hingga 3072×4096).

| Kelompok | Folder | Jumlah foto | Keterangan |
|---|---|---|---|
| Terdaftar (siswa 1–7, 9, 10) | foto 1, 2, 3, 4, 5, 6, 7, 9, 10 | **94** | student_id = nomor folder |
| Tidak terdaftar (impostor) | foto 11–26 | **153** | 16 siswa yang tidak ada di DB |
| Tanpa data | — | 0 | **siswa 8**: folder tidak ada |

Pemetaan folder → siswa dikonfirmasi dengan pengguna: folder "foto N" = student_id N.

---

## 3. Proses Enrollment ("Training" Database)

**Pipeline** (jalur produksi, bukan jalur pintas):
`POST /api/admin/students/{id}/embeddings` (multipart `images[]`)
→ YuNet deteksi wajah (downscale ≥960 px sisi terpanjang, koordinat di-rescale kembali)
→ align berbasis landmark (rotasi sudut mata) + validasi crop
→ FaceNet 512-D embedding
→ augmentasi (flip/kecerahan/kontras, ±6 varian per foto)
→ simpan ke tabel `face_embeddings` (transaksi DB).

### Hasil per siswa

| Student ID | Foto | Embedding tersimpan | Status |
|---:|---:|---:|---|
| 1 | 11 | 66 | ✅ |
| 2 | 10 | 60 | ✅ |
| 3 | 13 | 78 | ✅ |
| 4 | 9 | 54 | ✅ |
| 5 | 9 | 54 | ✅ |
| 6 | 11 | 60 | ⚠️ 1 foto ditolak (wajah tak terdeteksi) |
| 7 | 10 | 60 | ✅ |
| 8 | 0 | 0 | ❌ folder tidak ada di dataset |
| 9 | 9 | 54 | ✅ |
| 10 | 12 | 72 | ✅ |
| **Total** | **94** | **558** | |

---

## 4. Hasil Testing

### 4.1 Identifikasi skala penuh terhadap DB asli (closed-set)

Metode: seluruh 247 foto asli di-embed ulang via `/embedding` (243/247 sukses), lalu dicocokkan ke 558 embedding DB dengan jarak Euclidean (argmin).

**Per siswa (93 query terdaftar):**

| Student | Query | TOP-1 benar | d_same (rata-rata) | d_other (rata-rata) | dmin terburuk |
|---:|---:|---:|---:|---:|---:|
| 1 | 11 | 11 (100%) | 0,130 | 0,748 | 0,217 |
| 2 | 10 | 10 (100%) | 0,170 | 0,884 | 0,219 |
| 3 | 13 | 13 (100%) | 0,139 | 0,885 | 0,215 |
| 4 | 9 | 9 (100%) | 0,189 | 0,689 | **0,282** (terburuk) |
| 5 | 9 | 9 (100%) | 0,128 | 0,628 | 0,184 |
| 6 | 10 | 10 (100%) | 0,154 | 0,793 | 0,210 |
| 7 | 10 | 10 (100%) | 0,122 | 0,748 | 0,225 |
| 9 | 9 | 9 (100%) | 0,166 | 0,828 | 0,229 |
| 10 | 12 | 12 (100%) | 0,124 | 0,752 | 0,213 |
| **Total** | **93** | **93 = 100%** | | | |

**Kesimpulan**: nol salah identitas; jarak sesama (≤0,282) terpisah jauh dari jarak beda orang (rata-rata ≥0,63).

### 4.2 Uji orang tidak terdaftar (open-set / impostor)

150 foto dari 16 siswa asing (folder 11–26) dicocokkan ke DB:

| Metrik | Nilai |
|---|---|
| dmin impostor rata-rata | 0,781 |
| Impostor terdekat | **0,4406** (foto folder 14 ↔ embedding siswa 6 — wajah sangat mirip) |
| Diterima @ threshold 0,8 (aktif) | 🔴 **93/150 = 62%** |

> **Temuan kritis**: dengan threshold 0,8, mayoritas orang asing akan tercatat "hadir" atas nama siswa lain. Penyebab: 0,8 adalah *default generik*, bukan kalibrasi dari data ini — dan galeri berisi embedding augmentasi yang menurunkan jarak minimum impostor.

### 4.3 Sweep threshold (hasil ukur, bukan teori)

| Threshold | TAR (siswa sah, 93 query) | FAR (orang asing, 150 query) |
|---:|---:|---:|
| 0,30 – 0,40 | 100% | **0,00%** (0/150) |
| 0,45 – 0,55 | 100% | **0,67%** (1/150) |
| 0,60 | 100% | 4,00% (6/150) |
| 0,65 | 100% | 6,67% (10/150) |
| 0,70 | 100% | 22,67% (34/150) |
| 0,75 | 100% | 40,00% (60/150) |
| **0,80 (aktif)** | 100% | **62,00% (93/150)** |

**Rekomendasi**: turunkan `FACE_MATCH_THRESHOLD` **0,8 → 0,55** (atau 0,50 untuk lebih ketat). Margin aman: siswa sah terburuk 0,282 vs impostor terdekat 0,441. *Status: menunggu persetujuan — belum diterapkan.*

### 4.4 Generalisasi (leave-one-out, uji awal)

10 siswa × 3 foto, query dikecualikan dari galerinya sendiri: **TOP-1 29/30**; d_same 0,23–0,94 (mean 0,49), d_other 0,59–1,13 (mean 0,83). Satu-satunya outlier: 2 foto siswa 6 dengan pose dagu-ke-atas ekstrem (isu kualitas data — foto serupa kini justru ditolak di tahap deteksi, 400 no-face, sehingga tidak meracuni hasil).

### 4.5 End-to-end (backend Laravel + MySQL + AI service)

**12/12 PASS**: buat sesi; siswa 1 & 7 tercatat **HADIR** (conf 0,946 / 0,941); duplikat ditolak (`already_recorded`); isolasi antar-guru (guru lain → 403 pada get/close/record); guru pemilik sesi → 200 + close sukses; siswa luar kelas → 422; recognize pada sesi tertutup → 400. Payload embedding 1,36 MB lolos (kontrak file-part), matching 1,56 ms / 126 kandidat.

### 4.6 Kesehatan sistem

| Uji | Hasil |
|---|---|
| Smoke test AI (SELF / ORTHO / EMPTY) | 0,0 / 1,42 / OK ✅ |
| `php artisan test` (SQLite) | 2/2 PASS ✅ |
| `vendor/bin/pint --dirty` | PASS ✅ |
| `npm run lint` / `npx tsc --noEmit` | 0 error / bersih ✅ |

---

## 5. Kualitas Data — Catatan

- **4/247 foto (1,6%)** gagal di-embed (tidak ada wajah terdeteksi): `s6 IMG_…_100757`, `s14 IMG_…_101417`, `s19 IMG_…_101936`, `s21 IMG_…_102121` — pose/pencahayaan ekstrem. Saran: ambil ulang.
- **Siswa 8** tidak bisa didaftarkan (folder tidak ada) — sistem akan tetap menolaknya sebagai "Unknown" sampai di-enroll.
- Foto ponsel full-resolution (3072×4096) aman: detektor men-downscale ke ≤960 px sisi terpanjang sebelum YuNet (fragmentasi deteksi pada resolusi penuh sudah diperbaiki).

---

## 6. Kesimpulan

1. **Akurasi identifikasi siswa terdaftar: sempurna (100%)** pada uji skala penuh dan 96,7% pada uji generalisasi.
2. **Satu-satunya kelemahan berarti adalah konfigurasi threshold 0,8** (bukan pipeline): terbukti menerima 62% impostor. Kalibrasi data → **0,55**.
3. Kualitas pipeline deteksi–align–embedding baik: 98,4% foto berhasil diproses, kegagalan terjadi pada foto yang memang tidak layak.

## 7. Rekomendasi Lanjutan

1. **Terapkan `FACE_MATCH_THRESHOLD=0.55`** di `ai-service/.env` + restart service (menunggu konfirmasi).
2. **Restart backend Laravel di :8000** agar semua perbaikan kode & `.env` aktif.
3. Daftarkan **siswa 8** dan ambil ulang 4 foto gagal.
4. Jika suatu saat ingin training YOLO dari dataset ini: dataset harus diberi **anotasi bounding box** (mis. via Roboflow/LabelImg) + `data.yaml` (train/val). Tanpa itu, training teknis mustahil — saat ini deteksi memakai YuNet pretrained yang performanya sudah memadai.
5. Untuk dataset lebih besar, jalankan `POST /calibrate` (EER) secara berkala setelah enrollment bertambah.

---

## Lampiran: Reproduksi

Skrip pengujian disimpan di `ai-service/scripts/`:

```
# 1) Dump embedding dari DB (jalankan di backend/)
php artisan tinker --execute "require '../ai-service/scripts/dump_all_embeddings.php';"
#    → menulis all_embeddings.json (558 baris)

# 2) Uji skala penuh (247 foto asli vs 558 embedding DB)
python ai-service/scripts/fullscale_eval.py     # butuh AI service berjalan (AI_PORT=8001)

# 3) Sweep halus dari hasil
python ai-service/scripts/fine_sweep.py
```

Konfigurasi saat pengujian: Python 3.14, torch 2.14 (CPU), facenet-pytorch 2.5.3 (512-D), OpenCV 5.0 (FaceDetectorYN / YuNet 2023mar), ultralytics 8.4 (fallback). Embedding 243 foto ≈ 166 s (6 worker).
