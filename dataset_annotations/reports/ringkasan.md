# Laporan Ekspor Bounding Box — `bbox_export_20261121_140558`

Dibuat: 2026-11-21 14:16:31  
Sumber: `D:\unhas\facerecogetion_yoloV8andFaceNet\ai-service\datasets` (247 foto mentah, tidak diubah)

## Ringkasan

| Item | Nilai |
|---|---|
| Total gambar | **247** |
| Train / Val | **196 / 51** |
| Total kotak wajah | **243** |
| Foto background (0 wajah) | 4 |
| Foto multi-wajah | 0 |
| Rata-rata wajah/gambar | 0.98 |
| Skor deteksi mean / min | 0.9172 / 0.5519 |
| Dimensi gambar | 3072x4096 (resolusi asli) |
| XML vs label mismatch | 0 |

## Berkas laporan

| Berkas | Isi |
|---|---|
| `boxes_pixels.csv` | **243 baris** — semua kotak wajah, koordinat piksel absolut + normalisasi |
| `images_manifest.csv` | **247 baris** — semua gambar + split + jumlah wajah |
| `summary_by_folder.csv` | **25 baris** — rekap per folder sumber |
| `contact_sheets/` | **11 lembar** berisi seluruh 247 gambar + kotak |

## Rekap per folder sumber

| Folder sumber | Split | Gambar | Wajah | Background |
|---|---|---|---|---|
| foto 1 | val | 11 | 11 | 0 |
| foto 10 | val | 12 | 12 | 0 |
| foto 11 | train | 11 | 11 | 0 |
| foto 12 | train | 9 | 9 | 0 |
| foto 13 | val | 9 | 9 | 0 |
| foto 14 | train | 10 | 9 | 1 |
| foto 15 | train | 9 | 9 | 0 |
| foto 16 | train | 10 | 10 | 0 |
| foto 17 | train | 10 | 10 | 0 |
| foto 18 | val | 9 | 9 | 0 |
| foto 19 | train | 9 | 8 | 1 |
| foto 2 | train | 10 | 10 | 0 |
| foto 20 | train | 9 | 9 | 0 |
| foto 21 | train | 9 | 8 | 1 |
| foto 22 | train | 10 | 10 | 0 |
| foto 23 | train | 10 | 10 | 0 |
| foto 24 | train | 10 | 10 | 0 |
| foto 25 | val | 10 | 10 | 0 |
| foto 26 | train | 9 | 9 | 0 |
| foto 3 | train | 13 | 13 | 0 |
| foto 4 | train | 9 | 9 | 0 |
| foto 5 | train | 9 | 9 | 0 |
| foto 6 | train | 11 | 10 | 1 |
| foto 7 | train | 10 | 10 | 0 |
| foto 9 | train | 9 | 9 | 0 |

## Contoh pembacaan koordinat

`s02_IMG_20260930_100136.jpg` (gambar 3072x4096): `xmin=1005, ymin=1211, xmax=2061, ymax=2535` → lebar 1056 px, tinggi 1324 px.

## Catatan

- Koordinat XML dalam **piksel absolut** pada resolusi gambar tersimpan (3072x4096).
- Label YOLO (`labels/`) memakai koordinat ternormalisasi 0-1; keduanya berasal dari deteksi YuNet yang sama.
- `score_mean_image` = rata-rata confidence YuNet untuk gambar tersebut (confidence per kotak tidak disimpan pada ekspor ini).
- `contact_sheets/` memuat wajah asli siswa — **jangan dipublikasikan tanpa izin/blur**.
