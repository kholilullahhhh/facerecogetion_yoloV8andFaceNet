# Checklist Screenshot Manual (kategori D — wajib dari aplikasi ASLI)

Kamera/screenshot harus diambil dari aplikasi yang benar-benar berjalan. Jangan membuat mockup.
Semua PNG disimpan di folder `docs/thesis-evidence/screenshots/` dengan penamaan di bawah.

## Persiapan (urut)

1. **MySQL menyala** (XAMPP/Laragon/service) — tanpa ini kebanyakan halaman hanya spinner/kosong.
2. **AI service hidup** — sudah berjalan di :8001 (cek `http://127.0.0.1:8001/health` → `healthy`). Jangan memanggil `PUT /threshold` atau `/calibrate`.
3. **Backend**: `cd backend && php artisan serve` → http://localhost:8000
4. **Frontend**: `cd frontend && cmd /c npm run dev` → http://localhost:3000 (PowerShell bisa diblok policy; pakai cmd wrapper).
5. Login kredensial Anda sendiri (ADMIN → /admin/…; GURU → /teacher/…).

## Checklist

| # | File sasaran | Yang diambil | Tips kondisi |
|---|---|---|---|
| 1 | `01_login.png` | Halaman login murni (tanpa terisi kredensial) | |
| 2 | `02_admin_dashboard.png` + `02b_teacher_dashboard.png` | Dashboard masing-masing role | pastikan kartu statistik terlihat |
| 3 | `03_daftar_siswa.png` | Tabel daftar siswa | Jika akan dipublikasikan: blur nama/NIS |
| 4 | `04_registrasi_wajah.png` | Halaman registrasi wajah siswa + pesan "N embedding berhasil disimpan" | kirim 2–3 foto → embedding tercatat (6/foto) |
| 5 | `05_deteksi_camera.png` | Halaman absensi guru saat wajah masuk kamera (kotak deteksi terlihat) | pencahayaan normal |
| 6 | `06_recognized.png` | Hasil siswa DIKENAL — kartu/name hanya cekal kotak + stat (distance) | siswa re-enrolled dulu (lihat catatan DB) |
| 7 | `07_unknown.png` | Wajah TIDAK dikenal (kotak merah / unknown, dan tidak menambah baris absensi) | minta orang lain di depan kamera — atau foto orang luar |
| 8 | `08_absensi_tercatat.png` | Baris baru HADIR/TERLAMBAT di detail sesi (tok per 15 menit = TERLAMBAT) | buat sesi start_time lebih awal untuk demo TERLAMBAT |
| 9 | `09_riwayat.png` | Riwayat/daftar sesi + filter status | |
| 10 | `10_sesi_absensi.png` | Proses buat sesi & tombol tutup sesi | |
| 11 | `11_ai_down.png` (bonus) | UI saat AI mati → error 503 tampil | matikan uvicorn sementara → snapshot → pastor kembali hidup |

## Realitas yang perlu diingat

- Halaman `admin/settings/model` **selalu menampilkan "AI Service tidak tersedia"** (bug terdokumentasi, dok 07) — JADIKAN screenshot khusus `12_broken_settings.png` sebagai bukti temuan bug, bukan sebagai fitur.
- Jika attendance gagal mendeteksi (FRR): cek threshold galeri/disuta lalu simu ulang foto; jangan meneruskan penilaian manual.
- Setiap screenshot: 100% zoom, tanpa mask apapun yang membuat teks tidak terbaca (kecuali data pribadi).
- Private: foto/kartauslar siswa **tanpa** blur hanya boleh disimpan di repo lokal; untuk lampiran skripsi sink perlu izin institusi.
