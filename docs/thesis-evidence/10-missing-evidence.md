# 10 — Daftar Data yang Harus Anda Siapkan (A–E)

**Dibuat:** 5 November 2026. Prinsip: TIDAK meminta data yang sebenarnya sudah tersedia (semua yang tersedia ada di kategori A).

---

## A. Sudah dikumpulkan otomatis oleh agent (tidak perlu Anda buat)

1. Statistik dataset lengkap — `raw-results/dataset_scan.json` (+ CSV `tables/dataset_per_student.csv`).
2. Benchmark latensi 27 foto, 3 endpoint, breakdown stage — `raw-results/api_latency_results.json` (+ CSV).
3. Konfigurasi model & kode — dok 03/01 (dengan referensi file:baris).
4. Metrik FaceNet 4 kandidat + confusion + sweep — `facenet_metrics.json` + charts 03–07/10.
5. Metrik YOLO + kurva — `yolo_train_metrics.json`, `run/results.csv`, charts 12/13, salinan plot native di `raw-results/yolo_run_plots/`.
6. Uji negative-case (400 tanpa wajah) + validasi EER — `raw-results/eer_validation.txt`.
7. Konfigurasi aplikasi & skema DB & keamanan — dok 01/04/07/08.
8. Diagram pipeline & grid deteksi — charts 11/14.
9. Status runtime layanan — `raw-results/runtime_check.json`.

## B. Membutuhkan akses manual dari Anda

1. **Nyala MySQL** (XAMPP Control Panel → Start MySQL; atau service `mysql`; port 3306). Lalu:
   - jalankan `docs/thesis-evidence/tables/db_queries.sql` (read-only): `mysql -u <user> -p attendance_face_recognition < …\db_queries.sql`
   - tempelkan hasil Q1–Q15 ke bagian kosong `04-enrollment-results.md` §3 (angka DB).
   - Khusus **Q6/Q7**: pastikan apakah embedding DB sudah di-regenerasi setelah 2026-11-03 (kalau belum → re-enroll seluruh siswa wajib, ikuti dulu alur seed/aplikasi).
2. **Paste draft BAB III** (file "Pasted text(20261104-174148).txt") — dok 09 menunggu untuk pemetaan final baris-per-baris.
3. **Kredensial akun admin/guru** — pakai sendiri saat mengambil screenshot (kategori D); JANGAN dikirimkan ke agent.
4. (Opsional) `php artisan test` + `composer run dev` kalau mau melihat baseline backend berjalan (audit sudah membaca kodenya).
5. Screenshot **常务 tidak perlu aplikasi berjalan khusus**: AI service sudah hidup; backend perlu `php artisan serve` (:8000); frontend `cmd /c npm run dev` (:3000) — catatan Windows PowerShell i policy; harus di jalankan
   Karena MySQL+ en-en-roll diperlukan for menampilkan data siswa asli.

## C. Eksperimen tambahan yang perlu dijalankan (dengan izin/regim, terurut prioritas)

1. **Set uji INDEPENDEN** (paling penting utk klaim generalisasi): foto BARU (relay manda dari sesi perem, bukan dari 247 lama):
   - untuk masing-masing 9 siswa terdaftar → 5–10 foto baru (variasi jarak & sudut ringan);
   - 20–50 foto wajah orang **tidak terdaftar** (valid misal teman satu keluaran/iwal mandi vs jilbab instructor dsb) utk FAR.
   - Setelah foto ini dipotret, jalankan `audit_scripts/run_api_benchmark.py` (dengan galeri capture) dan sweep threshold `validate_eer…`, atau minta agent menjalankan analitik FAR/FRR offlinenya — tolak kondisi.
2. **Uji stratified variasi kondisi:** per potret, 3–5 foto per kondisi — [
   (a) gelap (<120 brightness), (b) terang lampu (>190), (c) backlight/jendela,
   (d) kacamata (gelap/transparent), (e) jilbab menutup dagu, (f) kepala kiri/kanan/atas (±20°), (g) ekspresi Smile/nyengir]/b> (h) jarak jauh (wajah kecil, area<2%).
   Distance metrics per kondisi laporan kbaseUrl (agent akan menganalisis).
3. **Uji multi-wajah:** ambil 1–3 foto yang memuat 2 orang (`/detect` → harus 2 wajah; `/embedding` → harus 400; `/recognize` → 2 baris hasil). Dataset saat ini 0 multi-wajah — gunakan untuk screenshot D7/D8 yang nyata.
4. **Jalankan `ai-service/scripts/fullscale_eval.py`** setelah re-enroll (bukti end-to-end via API; sampai hari ini belum pernah menghasilkan output JSON — perlu angka di BAB IV).
5. **Sweep threshold ulang pada set independen** (menggunakan skrip B3) untuk menegaskan threshold 1.0 masih tepat.
6. (Minor) Pengiguas perbandingan detektor YuNet vs YOLO di foto full-res sama sekali (satu layangkan analysis CPU) — hanya jika draft akan membahas fallback dua kali lipat.

## D. Screenshot yang harus Anda ambil (nama file disarankan; simpan di `screenshots/`)

Checklist lengkap dengan langkah detail: `screenshots/README.md`. Ringkas:

1. `01_login.png` — halaman login.
2. `02_admin_dashboard.png` / `02b_teacher_dashboard.png`.
3. `03_daftar_siswa.png` — samar nama/NIS bila memampan prublikasikan.
4. `04_registrasi_wajah.png` — upload foto + notifikasi jumlah embedding tersimpan.
5. `05_deteksi_camera.png` — frame kamera saat wajah masuk kotak.
6. `06_recognized.png` —siswa DIKENAL — kartu hijau/jelas distance.
7. `07_unknown.png` — wajah TAK DIKENAL ditolak (kotak merah, tanpa baris attendance baru).
8. `08_absensi_tercatat.png` — baris baru di sesi (HADIR/TERLAMBAT).
9. `09_riwayat.png` — riwayat/sesi list.
10. `10_sesi_absensi.png` — buat + tutup sesi.
Bonus: `11_ai-down_error.png` hal saat AI mati (matikan service sementara) — bukti 503 UI.

## E. Klaim yang belum dapat dibuktikan (JANGAN ditulangkan dulu di skripsi)

| Klaim | Kenapa belum | Apa yang dikutipkan untuk perulusaannya |
|---|---|---|
| "Akurasi sistem di lapangan X%" | belum ada evaluasi dgn foto/ sesi independe | C1 + jalankan, lalu angka dari evaluasi baru |
| "Robust terhadap pencahayaan gelap/sudut/aksen/kacamata/jilbab" | tidak ada uji stratified (hanya distribusi dataset) | C2 |
| "Mampu menangani beberapa siswa sekaligus dalam 1 frame" | dataset 0 multi-wajah + belum diuji | C3 |
| "FAR x% dihre data riil absensi" | DB mati + attendance belum penuhi re-enroll | B1 + Q12/Q13 + Q14 |
| "Sistem teruji waktu beban ting" | tidak ada load test | buku (opsio kategori C) |
| "YOLOv8 yuUTA utama", "128-D", "Triplet Loss" | **kontradiksi bukti** | hapus/tuliskan fakta (dok 09 K1–K3) |

## Penutup

Paket bukti ini diciptakan tanpa mengarang data dan tanpa menjalankan operasi write-operasi service. Ketika kategori B+C terisi, mapping dok 09 final can*******
