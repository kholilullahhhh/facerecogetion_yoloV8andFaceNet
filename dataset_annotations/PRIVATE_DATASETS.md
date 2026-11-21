# Dataset Privat (Foto Asli)

Repo ini **publik**, sehingga foto asli siswa **tidak** disimpan di sini.
Dataset lengkap disimpan di **Google Drive privat** pemilik repo dan diberikan
hanya dengan izin/keperluan penelitian.

Paket anotasi (tanpa foto) tetap tersedia publik di folder
[`dataset_annotations/`](README.md).

## Arsip privat

| Arsip | Isi | File | Ukuran | SHA-256 |
|---|---|---:|---:|---|
| `yolo.zip` | `datasets/yolo` — gambar 640×640 + label YOLO (196 train / 51 val) | 497 | 12,7 MB | `7a90ed5890d27654e416dbf6d093301712dc53002a07944ea5ed7132c83bb974` |
| `facenet.zip` | `datasets/facenet` — 243 crop wajah 160×160 (student_001–026) | 243 | 2,8 MB | `024f1b4f7d4ef115ebdef8d20c7e7b64a0aa470664bd7a42b22606ee1a1a5705` |
| `hasil_per_foto.zip` | `bbox_export_20261121_140558/hasil_per_foto` — 247 foto beranotasi + 247 koordinat + index | 497 | 603,9 MB | `223cf225b842bdf99790164c574e51f4c29231b79be4802d86cb227544e5488a` |

Total: **1.237 file · ±624,6 MB**.

## Cara memulihkan

1. Unduh ketiga arsip dari Drive privat.
2. Verifikasi checksum (PowerShell):

   ```powershell
   Get-FileHash .\yolo.zip, .\facenet.zip, .\hasil_per_foto.zip -Algorithm SHA256
   ```

   Bandingkan dengan tabel di atas.

3. Ekstrak ke struktur berikut:

   ```text
   datasets/
   ├── yolo/                                  <- isi yolo.zip
   ├── facenet/                               <- isi facenet.zip
   └── bbox_export_20261121_140558/
       └── hasil_per_foto/                    <- isi hasil_per_foto.zip
   ```

4. Folder `datasets/` sudah di-ignore oleh git, jadi tidak akan ikut ter-commit.

## Akses

Hubungi pemilik repo (`kholilullahhhh`) untuk meminta akses. Akses diberikan
secara terbatas (bukan "anyone with the link") dan hanya untuk keperluan
penelitian dengan izin siswa/sekolah.

## Catatan privasi

- Foto asli dan crop wajah adalah data pribadi; jangan dipublikasikan,
  dibagikan ulang, atau diunggah ke layanan publik.
- Jangan menambahkan arsip ini ke repo GitHub publik.
- Jika repo ini diubah menjadi privat, tetap pertimbangkan izin tertulis
  sebelum mengunggah foto ke GitHub.
