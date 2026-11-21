# 01 — Audit Struktur Project

**Tanggal:** 5 November 2026 · **Metode:** pembacaan source code read-only (semua klaim menyertakan file, dan baris bila krusial).
**Cakupan:** backend Laravel, AI service FastAPI, frontend Next.js, skema database, konfigurasi, dokumentasi dalam repo.

---

## 1. Ringkasan tiga layanan (status saat audit 05-11-2026)

| Layanan | Stack (terverifikasi) | Port | Status |
|---|---|---|---|
| `backend/` | Laravel `^13.17` (`composer.json:10`), PHP 8.3, Sanctum, MySQL | 8000 | hidup (sebelumnya); MySQL **mati** |
| `ai-service/` | Python 3.11, FastAPI, PyTorch, ultralytics, OpenCV | **8001** (`ai-service/.env: AI_PORT=8001`) | **hidup** — `/health` 200 `healthy`, threshold 1.0 (bukti `raw-results/runtime_check.json`) |
| `frontend/` | Next `16.3.4`, React `19.2.8`, Tailwind `^4` (`frontend/package.json`) | 3000 | dev mode |

DB lokal (lintas `backend/.env`): `DB_CONNECTION=mysql`, database `attendance_face_recognition`. Catatan konfigurasi lain (tests `.phpunit.xml` = SQLite in-memory; `docker-compose.yml` = postgres) — **tidak semuanya konsisten**, primary source saat ini adalah `backend/.env` = MySQL.

## 2. Struktur repo yang relevan penelitian

```
backend/         → autentikasi + CRUD + orkestrasi absensi (.endpoint → MySQL; panggil AI via HTTP)
ai-service/      → deteksi wajah + embedding + matching (publik, tanpa auth, dipakai backend)
  app/api/routes.py         → 7 endpoint AI
  app/services/             → face_detector_service.py (YuNet), yolo_service.py, facenet_service.py, recognition_service.py
  app/preprocessing/        → face_preprocessing.py (crop-align-resize, augmentasi)
  app/utils/                → distance.py (Euclidean, find_best_match), calibration.py (EER — ada bug, lihat 06)
  weights/                  → yunet ONNX (232,589 B), facenet_model.pth (112,007,507 B = fine-tuned ep07), yolov8s.pt (22,516,202 B fine-tuned)
  training_runs/            → artefak training 03-11-2026 (JSON, PNG, laporan)
  scripts/                  → train/eval scripts (fullscale_eval.py tidak pernah menghasilkan output JSON — lihat 05)
  datasets/                 → 25 folder "foto N-*" = 247 foto asli siswa (RAW)
frontend/        → web app admin/guru (Next 16 App Router)
datasets/        → datasets/yolo (train/val + label), datasets/facenet (crop 160×160 per siswa)
docs/thesis-evidence/ → paket ini
```

`ai-service/requirements.txt` sedikit menyimpang dari lingkungan terpasang: pin `opencv-python-headless>=4.9.0,<5.0.0` tetapi runtime terpasang **OpenCV 5.0.0** (terlihat di log runtime; konsekuensinya `CascadeClassifier`/Haar tidak tersedia — dibaca di kode). ENV `backend/.env` TIDAK dibongkar; hanya kunci non-rapi yang dikutip (`AI_SERVICE_URL=http://localhost:8001` — baris 59).

## 3. Backend Laravel

### 3.1 Daftar endpoint (`backend/routes/api.php`, 52 baris — verifikasi penuh)

| # | Method | URI | Middleware | Controller | Catatan |
|---|---|---|---|---|---|
| 1 | POST | `/api/login` | `throttle:10,1` | AuthController::login | publik, rate-limit 10/menit |
| 2 | POST | `/api/logout` | `auth:sanctum` | AuthController::logout | |
| 3 | GET | `/api/me` | `auth:sanctum` | AuthController::me | validasi token |
| 4–8 | GET/POST | `/api/admin/students` (+`{student}`) | `auth:sanctum` + `admin` | StudentController | apiResource penuh |
| 9–11 | GET/POST/DELETE | `/api/admin/students/{student}/embeddings` (+`{embedding}`) | idem | FaceEmbeddingController | `only(index,store,destroy)` |
| 12–15 | CRUD | `/api/admin/teachers` (+`{teacher}`) | idem | TeacherController | apiResource |
| 16–19 | CRUD | `/api/admin/classes` (+`{class}`) | idem | ClassController | |
| 20–23 | CRUD | `/api/admin/subjects` (+`{subject}`) | idem | SubjectController | |
| 24–27 | CRUD | `/api/admin/schedules` (+`{schedule}`) | idem | ScheduleController | |
| 28–31 | GET | `/api/dashboard/summary`,`/chart`,`/class-summary`,`/recent` | `auth:sanctum` | DashboardController | |
| 32 | GET | `/api/schedules` | `auth:sanctum` | ScheduleController::mySchedules | |
| 33 | POST | `/api/attendance/sessions` | `auth:sanctum` | AttendanceController::storeSession | idempotent (lockForUpdate) |
| 34–36 | GET/PUT | `/api/attendance/sessions`(,`/{session}`), `/close` | idem | getSessions/getSession/closeSession | scoping guru |
| 37 | POST | `/api/attendance/record` | idem | recordAttendance | manual, credit client distance (⚠ 08) |
| 38 | POST | `/api/attendance/recognize` | idem | recognizeAndRecord | pipeline AI end-to-end |
| 39–40 | GET | `/api/reports/attendance`(,`/export`) | idem | ReportController | |
| 41 | PUT | `/api/teacher/profile` | `auth:sanctum` | AuthController::updateProfile | |

Perhatian: **TIDAK ADA route `/api/health`, `/api/threshold`, `/api/calibrate`** — penting untuk temuan halaman frontend settings (dok 07).

### 3.2 Controller Inti

- `AttendanceController` (354 baris) — `recognizeAndRecord()` (:225) memvalidasi sesi aktif + gambar (jpeg/png ≤ 8192 KB), **membangun galeri embedding dari DB** (siswa kelas sesi × `faceEmbeddings`), kirim multipart `image` + `embeddings_json` ke `config('services.ai.url')` (:247, :268-273), hasil tiap wajah dijadikan baris `attendances` (status HADIR/TERLAMBAT via `determineAttendanceStatus()` :338 — start + 15 menit → TERLAMBAT). AI gagal → **503** (:279, :287). Duplikat ditangani unique index + catch `UniqueConstraintViolationException` (:321).
- `FaceEmbeddingController` (119 baris) — store validasi `images.*` mimes jpeg/jpg/png max 8192 (:25-27), per file POST ke AI `/register-face` (:42-46), 1 file → hingga **6 embedding** (1 asli + 5 augmentasi) disimpan via `FaceEmbedding::create` (model_version '1.0', :80-88). Semua gagal → 422; sebagian sukses → save + daftar errors. `destroy` memeriksa ownership (:105).
- `AuthController` — login/logout/me/profile.

### 3.3 Migrasi & skema database (`backend/database/migrations/`)

| Tabel | Kolom kunci | File migrasi |
|---|---|---|
| `users` | role enum `ADMIN/GURU` (default GURU) | `0001_01_01_000000_create_users_table.php` |
| `students` | FK class, name/nis… | `2024_01_01_000030_create_students_table.php` |
| `teachers`,`classes`,`subjects`,`schedules` | FK relasi jadwal | `...000010/20/40/50_*.php` |
| `face_embeddings` | `student_id` FK cascade, **`embedding` JSON**, `model_name` (default 'facenet'), `model_version` (default '1.0'), `source_image` nullable, timestamps | `2024_01_01_000060_create_face_embeddings_table.php` |
| `attendance_sessions` | FK schedule, FK teacher, `date`, `start_time`, `end_time` nullable, `status` enum active/closed | `2024_01_01_000070_create_attendance_sessions_table.php` |
| `attendances` | FK session+student, `status` enum HADIR/TERLAMBAT/IZIN/SAKIT/ALPA, `distance` float nullable, `recognition_confidence` float nullable, `detected_at`, `captured_image` nullable, **unique(session, student)** | `2024_01_01_000080_create_attendances_table.php` |
| `personal_access_tokens` | Sanctum | `2026_09_08_074004_*.php` |

Implicasi riset: embedding disimpan sebagai **JSON 512 elemen** (bukan binary/128-D); jarak & label di data `attendances` (distance, recognition_confidence) bisa dianalisis mundur untuk BAB IV.

### 3.4 Keamanan

- Autentikasi: Sanctum Bearer (`auth:sanctum`), token di tabel `personal_access_tokens`.
- Otorisasi: middleware `admin` membandingkan `role === 'ADMIN'` khusus grup CRUD; akses sesi kekurangan-teacher scoping (`authorizeSession()` :134-141; guru hanya sesi miliknya sendiri; admin bebas).
- Rate limiting: **hanya login** (`throttle:10,1`; :15). Endpoint berat (`/recognize`, `/embeddings`) tidak dibatasi (⚠ dok 08).
- Validasi upload: mimes jpeg/jpg/png, max 8192 KB (8 MB), di dua controller.
- Config AI: `config/services.php:38-40` membaca `AI_SERVICE_URL` (default `http://localhost:8000`; **.env berisi `http://localhost:8001`**, baris `.env:59` — sesuai porta service).

### 3.5 Testing

`backend/tests/` hanya `Unit/ExampleTest.php`, `Feature/ExampleTest.php`, `TestCase.php` (boilerplate). `php artisan test` berjalan di SQLite in-memory (phpunit.xml) — tidak menyentuh MySQL.

## 4. AI Service (FastAPI)

Endpoint (`ai-service/app/api/routes.py`): detail I/O di dok 07; ringkas: `GET /health`, `POST /detect`, `POST /embedding`, `POST /register-face`, `POST /recognize`, `PUT /threshold`, `POST /calibrate`.

Konfigurasi aktif (`ai-service/config.py` + `.env`, nilai non-secret):

| Key | Nilai aktif | Arti |
|---|---|---|
| `AI_PORT` | 8001 | porta serve |
| `FACE_MATCH_THRESHOLD` | **1.0** | threshold jarak Euclidean produksi |
| `DEVICE` | cpu | inference CPU |
| `CORS_ORIGINS` | ["http://localhost:3000","http://localhost:8000"] | origem diizinkan |
| `FACE_CROP_SIZE` | 160 | ukuran input FaceNet (kode) |
| `FACE_CONFIDENCE_THRESHOLD` | 0.5 | skor deteksi minimal (kode) |
| `MAX_FACES_PER_IMAGE` | 10 | cap wajah per gambar (kode) |
| `EMBEDDING_DIMENSION` | 512 | dimensi embedding (kode, asserted) |

Catatan versi: OpenCV terpasang 5.0.0 (ini membuat fallback Haar/off-eye-cascade jadi disable — `face_preprocessing.py:11`);

## 5. Frontend Next.js (19 halaman, verifikasi glob)

| Area | Route | Fungsi |
|---|---|---|
| Publik | `/` | landing (framer-motion) |
| Publik | `/login` | login email+password → redirect per role |
| Admin | `/admin/dashboard`, `/admin/reports`, `/admin/attendance` | ringkasan, laporan, absensi admin |
| Admin | `/admin/students` (+`/create`, `/[id]`, `/[id]/edit`) | CRUD siswa |
| Admin | `/admin/students/[id]/face-registration` | **registrasi wajah (upload foto)** |
| Admin | `/admin/teachers`, `/admin/classes`, `/admin/subjects`, `/admin/schedules` | CRUD master |
| Admin | `/admin/settings/model` | pengaturan model AI — **RUSAK** (dok 07) |
| Guru | `/teacher/dashboard`, `/teacher/attendance`, `/teacher/attendance/history`, `/teacher/profile` | sesi + absensi kamera |

Konvensi (verifikasi kode): axios (`frontend/src/lib/api.ts`) dengan Bearer token dari `localStorage['token']`; 401 → hapus token+user & redirect `/login`; endpoint terpaginasi dibaca `res.data.data.data`; success = `{success, data}`. Tidak ada test frontend (jest/playwright tidak dipasang).

## 6. Klaim yang menguak konflik termakan (perlu disetujui/dipermamaipai)

| Kanal | Klaim lawas | Fakta | Referensi |
|---|---|---|---|
| `AGENTS.md` repo | FaceNet 128-D | **512-D** (assert kode + respons API) | `facenet_service.py:72`,`routes.py:86` |
| UI `/admin/settings/model` | "YOLOv8 (Deteksi Wajah)", "VGGFace2 (Pretrained)", "128D" | YuNet utama; FaceNet = fine-tuned; 512-D | dok 03/07 |
| README repo | PostgreSQL | MySQL lokal (backend/.env) | `README`, `backend/.env` |
| Draft BAB III | "pipeline YOLOv8 + FaceNet pretrained" | YuNet + FaceNet fine-tune ep07 | dok 09 |
