# 04 — Enroll: Database, Skema, dan Hasil Enrollment

**Status data kuantitatif: ⚠ NOT VERIFIED untuk angka DB** — MySQL tidak berjalan saat audit (port 3306 tidak membuka; tidak ada proses `mysqld`). Tidak ada angka DB yang dipalsukan. Semua query read-only sudah tersedia di `tables/db_queries.sql`

## 1. Alur enrollment wajah (verifikasi kode)

```
Admin UI: /admin/students/[id]/face-registration
  → POST /api/admin/students/{id}/embeddings   (multipart images[] ← Laravel, Bearer Sanctum, role admin)
     FaceEmbeddingController@store  (validasi jpeg/png ≤ 8 MB)
       → for each file: POST {AI_SERVICE_URL}/register-face   (multipart 'image', augment=true)
            AI: deteksi YuNet (harus tepat 1 wajah) → crop+align → resize 160×160
                → FaceNet → 1 + 5 embedding augmentasi (maks 6/foto)
       → kumpulkan seluruh embedding → INSERT face_embeddings (JSON 512 elemen, model_name='facenet', model_version='1.0')
           sebagian sukses masih disimpan; semuanya gagal → HTTP 422 + daftar error
```
Ref: `FaceEmbeddingController.php:23-101`, `routes.py:90-114`, `recognition_service.py:89-107`, `face_preprocessing.py:134-157`.

## 2. Skema relevan (migrasi ter-semua)

- `face_embeddings`: `id`, `student_id` FK cascade, **`embedding` JSON** (512 elemen), `model_name` default 'facenet', `model_version` default '1.0', `source_image` nullable, `timestamps` — `2024_01_01_000060_create_face_embeddings_table.php`.
- `attendances`: unique `(attendance_session_id, student_id)`; `distance`, `recognition_confidence` float nullable; `captured_image` **tidak pernah diisi** (lihat dok 08) — `2024_01_01_000080*.php`.
- `students`, `classes`, `schedules`, `attendance_sessions`: relasi jadwal→kelas→siswa (dok 01 §3.3).

## 3. Data yang TIDAK terverifikasi (harus diisi oleh Anda — MySQL nyala)

Punya angka-angka ini di **BAB III/IV hanya setelah** dijalankan query read-only di `tables/db_queries.sql`:

| Pertanyaan riset | Query di file | Masalah |
|---|---|---|
| Jumlah siswa terdaftar | Q1 | |
| Jumlah embedding aktif total | Q2 | |
| Embedding per siswa (data per-ID) | Q3 | |
| Dimensi setiap embedding (=512?) | Q4, Q5 | 
| Sebaran model_name/model_version | Q6 | deteksi embedding lawas (prás-finetune) |
| Embedding dibuat sebelum/after 2026-11-03 03:00 | Q7 | **re-enroll post-deploy** |
| Duplikat embedding per siswa | Q8 | pintek di model yang ani |
| Jumlah sesi absensi / rekaman attendance | Q9-Q11 | BAB IV |
| Jumlah absensi per status (HADIR/TERLAMBAT…) | Q12 | |
| Rata-rata/serpa jarak deteksi di DB | Q13 | deskripsi utk pembahasan |
| captured_image yang tidak pernah terisi | Q14 | bukti teknya jel hati |
| Distribusi siswa per class | Q15 | konteks |

Kredensial MySQL Anda (backend/.env) TIDAK dibagikan di ini. Cara run
```bash
# mysql CLI
mysql -u <user> -p attendance_face_recognition < docs/thesis-evidence/tables/db_queries.sql
# atau bukadan tinker read-only (sahul sampel):
php artisan tinker --execute 'echo json_encode(App\Models\Student::count());'
```
Setelah angkanya diperoleh: copy paste hasil ke bagian在这个 doc (saya tak menulisки angka).

## 4. Fakta terverifikasi tanpa DB

| Bukti | Angka | Referensi |
|---|---|---|
| Dimensi embedding yang dihasilkan model saat ini | **512** (27/27 sampel via API) | `api_latency_results.json` → `embedding_dimension` |
| Jumlah maks embedding per foto enrollment | 6 (1 asli + 5 augmentai) | `routes.py:106` + kode augmentasi |
| Service yang diyiak /register-face menggunakan model fine-tuned | ya (sejak 03-11-2026) | dok 03 |

## 5. Ketergantungan kritis: **re-enrollment terpengap ketika model berubah**

`REPORT_2026-11-03.md` §Catatan Operasional 1 — Embedding DB **lama dibangun dgn model bau (pretrained)** tidak kompatibel dengan model fine-tuned: ruang jaraknya berubah total (bahkan mean jarak genuine 0.52 → 0.78). Jika DB masih memuat embedding pra-0302026, recognize bakal gagal cocok/หมระ. Query Q6/Q7 menentukan statusnya. Tindakan (butuh izin Anda; **bukan bagian audit ini**): re-enroll seluruh siswa via UI, hapus embedding lawas.

**Pesan penting untuk skripsi:** klik-ประ simple a`re-enroll sehabis ganti bobot` bukti discontinuity ruang embedding & caveat di sisi-baru (dibangun data attendances terakhir).
