# 07 — Integrasi API & Sistem (Next.js → Laravel → FastAPI → MySQL)

**Tanggal:** 5 November 2026 · **Konvensi respons:** sukses `{success:true, data:…}`; error `{success:false, message}` (juga FastAPI: `{detail}`).
**Konderektor utama:** AI_SERVICE_URL **http://localhost:8001** (`backend/.env:59`; default config `config/services.php:38-40`).

## 1. Alur data absensi (end-to-end)

```
1. Guru: /teacher/attendance → kamera (getUserMedia) → snapshot frame
2. POST /api/attendance/recognize {attendance_session_id, image}  (Bearer)
3. Laravel: validasi (sesi ada + aktif; foto jpeg/png ≤8MB) + authorize (guru↔sesi)
4. Laravel MEMBANGUN galeri dari MySQL:
   student (kelas sesi, status active) × faceEmbeddings
   → {student_id, student_name, embedding[512]}  → embeddings_json
5. POST {AI}/recognize (multipart image + embeddings_json, timeout 30s)
6. AI: YuNet deteksi → crop+align 160×160 → FaceNet 512-D → min-Euclidean vs galeri
   → {faces:[{bbox, detection_confidence, student_id?, student_name?, distance, matched}],
      processing_time_ms, timing{detection_ms, embedding_ms, matching_ms}}
7. Laravel per face: matched → DELETE-dupe-check → Attendance::create
   status = HADIR (≤ start+15 min) atau TERLAMBAT  / 'already_recorded'
8. Response → UI grid (kotak hijau dikenal / merah unknown)
```
Ref: `AttendanceController.php:225-336`, `routes.py:117-141`, `recognition_service.py:39-82`.

## 2. Tabel endpoint BACKEND (verifikasi `routes/api.php`)

| Endpoint | Method | Input | Output | Status audit |
|---|---|---|---|---|
| `/api/login` | POST | email, password | token Sanctum + user | kode; uji runtime TBD (MySQL mati) |
| `/api/logout`, `/api/me` | POST/GET | Bearer | — / user | kode |
| `/api/admin/...` CRUD (students, embeddings, teachers, classes, subjects, schedules) | REST | sesuai kontroler | list/detail | PARTIAL (endpoint embeddings audited detail; lainnya kode) |
| `/api/dashboard/{summary,chart,class-summary,recent}` | GET | Bearer | agregat | kode |
| `/api/attendance/sessions` | POST | schedule_id, date, start_time | session (201/200 idempotent) | kode |
| `/api/attendance/sessions`, `/{id}`, `/close` | GET/PUT | — | session(s) | kode |
| `/api/attendance/record` | POST | session_id, student_id, distance, status, conf (ops) | attendance (201/200 dupes) | kode (⚠ trust, 08) |
| `/api/attendance/recognize` | POST | **multipart**: attendance_session_id, image | faces[] + status tiap wajah | kode; benchmark terkait di 05 |
| `/api/reports/attendance`, `/export` | GET | filter | laporan/export | kode |

## 3. Tabel endpoint AI SERVICE (verifikasi `routes.py`)

| Endpoint | Method | Input | Output | Error | Benchmark (mean ms) |
|---|---|---|---|---|---|
| `/health` | GET | — | `status, yolo_loaded, facenet_loaded, device, threshold` | — | (<1) |
| `/detect` | POST | multipart `image` | `faces[] {bbox, confidence, landmarks{right_eye,left_eye}, class}`, `faces_expireded?faces_detected`, processing_time_ms | 400 image invalid | 619.4 |
| `/embedding` | POST | multipart `image` | `embedding[512], dimension` | **400** bila 0 wajah "No face detected in image" / >1 "Multiple faces…" / validasi gagal | 1066.0 |
| `/register-face` | POST | multipart `image`, query augment(true) | `embeddings_count (≤6), embeddings[512×n]` | 400 0/>1 wajah | (~sama + augment) |
| `/recognize` | POST | multipart `image` + `embeddings_json` (ops) | `faces[]{bbox, detection_confidence, student_id?, student_name?, distance, matched}` + timing | 400 invalid image/JSON | 1059.1 |
| `PUT /threshold` | PUT | json `{threshold}` 0.0–2.0 | `{threshold}` runtime | 400 di luar range | <1 |
| `POST /calibrate` | POST | json `embeddings_by_student` | EER + SET runtime threshold | 400/500 | — **JANGAN dipakai produksi** (bug EER + ubah runtime) |

## 4. Contoh payload (dari kode, disanitasi)

**POST /api/attendance/sessions** `{ "schedule_id": 1, "date": "2026-11-05", "start_time": "07:00" }`
**POST /api/attendance/recognize** multipart: `attendance_session_id=5`, `image=@frame.jpg` — response:
```json
{ "success": true, "processing_time_ms": 1053.2,
  "faces": [ {"bbox":{"x1":..,"y1":..,"x2":..,"y2":..}, "detection_confidence":0.947,
              "matched": true, "student_id": 12, "student_name":"Siswa A (anonim)",
              "distance": 0.86, "status":"recorded"} ] }
```
**POST {AI}/register-face** multipart `image=@foto.jpg&augment=true` → `{"embeddings_count":6, "embeddings":[[~ […512…], …]}`.
**400 AI:** `{"detail":"No face detected in image"}` (bukti `eer_validation.txt`).

## 5. Manajemen error integrasi

| Kegagalan | Perilaku (kode) | Evaluasi |
|---|---|---|
| AI tidak hidup / timeout | Laravel per-call `Http::timeout(30)`, `!successful` → **503** `{message:"AI Service tidak merespons."}` | baik: 503 dikenal UI; UI tetap `Gagal koneksi` — baik |
| exception HTTP client | di-catch → **503** `"...: {$e->getMessage()}"` (:286) | ⚠ pesan internal bocor ke client |
| Embedding di store_req sebagian gagal | `errors[]` berisi teks error AI/`$e->getMessage()` (:55, :61) | ⚠ bocor juga; tapi mudah disanitasi |
| foto invalid/no face | **400/422** dgn detail | baik |
| duplikat attendance | unique (session, student) + catch rc (:321) + pre-check | baik |

## 6. 🚩 TEMUAN: Halaman Frontend `/admin/settings/model` RUSAK (dokumen 08 juga)

Implementasi di `frontend/src/app/admin/settings/model/page.tsx:28,45`:

```ts
api.get("/health")          //  → BASE_URL = http://localhost:8000/api →  /api/health      → 404
api.put("/threshold", …)    //  → /api/threshold → 404
```
- `routes/api.php` **tidak** punya `/health` maupun `/threshold`; dua URL tersebut milik **AI service di :8001**. Axios di-grail satu baseURL backend ⇒ 404 pasti.
- Windcatch: halama ini SELALU menampilkan "AI Service tidak tersedia" (meski AI sehat — runtime_check.json), dan "Simpan Threshold" selalu gagal.
- UI juga menampilkan klaim lama: "YOLOv8 (Deksi Wajah)", "VGGFace2 (Pretrained)", "128D" — ketiganya tidak sesuai dok soll (dok 03).
- Perbaikan yang disarankan (masih irrelevant untuk audit): route proxy 2 endpoint di backend (ke AI service), atau felistik konstruksi URL untuk `/health` saja. **Tidak diimplementasi (audit-file-only)**.

## 7. Catatan arsitektur tambahan

- CORS AI service mengizinkan `localhost:3000` & `localhost:8000` (`.env`). Frontend **tidak** memanggil AI langsung di jalur absensi (semua via backend) — satu-satunya akses langsung frontend ke AI yang diinginkan = settings (tapak 6).
- Baik pipeline sebenarnya `embeddings_json` dibangun dari **MySQL** (tidak mungkin fake vous pas recruitment jika client MySQL dibekah menm的服务).
- **Namun** AI/`/recognize` API memakai `embeddings_json` dari caller — jika AI service bisa diakpublik (tanpa auth), siapabel-fake galeri (data-client). Jadi: **jangan expose AI ke jaringan publik** — dok 08/10.
