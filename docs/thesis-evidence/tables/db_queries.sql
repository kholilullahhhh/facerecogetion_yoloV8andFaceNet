-- =============================================================
-- db_queries.sql — QUERY READ-ONLY untuk verifikasi evidence DB
-- =============================================================
-- Semua perintah di bawah ini SELECT-only. TIDAK ada INSERT/UPDATE/DELETE.
-- Cara jalankan:
--   mysql -u <user> -p attendance_face_recognition < db_queries.sql
--   (atau per-pernyataan di HeidiSQL / phpMyAdmin / DBeaver)
-- HATI-HATI: hasil beberapa query memuat NAMA SISWA (Q3b, Q16) —
-- jangan tempel langsung ke dokumen publik; ganti dengan ID anonim.

-- Q1 — Jumlah siswa & status
SELECT COUNT(*) AS total_students FROM students;
SELECT status, COUNT(*) AS n FROM students GROUP BY status;

-- Q2 — Jumlah total embedding wajah
SELECT COUNT(*) AS total_face_embeddings FROM face_embeddings;

-- Q3a — Embedding per siswa (ID saja, aman)
SELECT student_id, COUNT(*) AS embedding_count
FROM face_embeddings GROUP BY student_id ORDER BY student_id;

-- Q3b — Embedding per siswa dgn nama (PRIVAT — anonimkan sebelum lampir)
SELECT s.id, s.name, COUNT(fe.id) AS embedding_count,
       MIN(fe.created_at) AS first_created, MAX(fe.created_at) AS last_created
FROM students s LEFT JOIN face_embeddings fe ON fe.student_id = s.id
GROUP BY s.id, s.name ORDER BY s.id;

-- Q4 — Distribusi dimensi embedding (harus semua 512 utk model baru)
SELECT JSON_LENGTH(embedding) AS dimension, COUNT(*) AS n
FROM face_embeddings GROUP BY dimension;

-- Q5 — Cek tipe elemen pertama & 3 baris sampel (tanpa mengungkap nilai)
SELECT id, student_id, JSON_LENGTH(embedding) AS dim,
       JSON_TYPE(JSON_EXTRACT(embedding, '$[0]')) AS first_elem_type
FROM face_embeddings ORDER BY id LIMIT 3;

-- Q6 — Sebaran model_name/model_version (deteksi embedding lawas pra-finetune)
SELECT model_name, model_version, COUNT(*) AS n,
       MIN(created_at) AS first_created, MAX(created_at) AS last_created
FROM face_embeddings GROUP BY model_name, model_version;

-- Q7 — Embedding dibuat setelah deploy fine-tuned (2026-11-03 03:00)
SELECT COUNT(*) AS embeddings_after_deploy
FROM face_embeddings WHERE created_at >= '2026-11-03 03:00:00';

-- Q8 — Duplikat embedding (hash identik per siswa)
SELECT student_id, h, COUNT(*) AS cnt FROM (
    SELECT student_id, MD5(CONVERT(embedding USING utf8mb4)) AS h
    FROM face_embeddings
) x GROUP BY student_id, h HAVING cnt > 1 ORDER BY student_id;

-- Q9 — Sesi absensi
SELECT COUNT(*) AS total_sessions,
       SUM(status = 'active') AS active_sessions,
       SUM(status = 'closed') AS closed_sessions
FROM attendance_sessions;

-- Q10 — Total rekaman attendance
SELECT COUNT(*) AS total_attendance_records FROM attendances;

-- Q11 — Kehadiran per sesi
SELECT attendance_session_id, COUNT(*) AS students_present,
       MIN(detected_at) AS first_detect, MAX(detected_at) AS last_detect
FROM attendances GROUP BY attendance_session_id ORDER BY attendance_session_id;

-- Q12 — Sebaran status kehadiran
SELECT status, COUNT(*) AS n FROM attendances GROUP BY status;

-- Q13 — Statistik jarak recognition (evidence FAR/FRR lapangan kasar)
SELECT COUNT(distance) AS n_records,
       ROUND(MIN(distance),4) AS min_distance,
       ROUND(AVG(distance),4) AS avg_distance,
       ROUND(MAX(distance),4) AS max_distance
FROM attendances WHERE distance IS NOT NULL;

-- Q14 — Bukti captured_image tidak pernah diisi (ekspektasi: 0)
SELECT COUNT(*) AS rows_with_captured_image
FROM attendances WHERE captured_image IS NOT NULL;

-- Q15 — Distribusi siswa per kelas
SELECT c.id, c.name, COUNT(s.id) AS students
FROM classes c LEFT JOIN students s ON s.class_id = c.id
GROUP BY c.id, c.name ORDER BY c.name;

-- Q16 — 20 rekaman attendance terbaru (PRIVAT — id saja)
SELECT a.attendance_session_id, a.student_id, a.status,
       ROUND(a.distance,4) AS distance, a.detected_at
FROM attendances a ORDER BY a.detected_at DESC LIMIT 20;

-- Q17 — Pengguna per role (tanpa kredensial)
SELECT role, COUNT(*) AS n FROM users GROUP BY role;
