# Dataset Anotasi Bounding Box Wajah (Tanpa Foto)

Paket ini berisi **anotasi** hasil ekspor bounding box wajah dari 247 foto siswa.
**Gambar/foto asli tidak disertakan** untuk melindungi privasi siswa. Yang dibagikan
hanya koordinat, label, dan laporan turunannya.

> Dataset lengkap (foto asli) disimpan privat — lihat
> [PRIVATE_DATASETS.md](PRIVATE_DATASETS.md).

## Ringkasan

| Item | Nilai |
|---|---|
| Total gambar sumber | **247** (196 train / 51 val) |
| Total kotak wajah | **243** |
| Foto background (0 wajah) | 4 |
| Kelas | `face` (1 kelas) |
| Resolusi sumber | 3072 x 4096 (potret) |
| Detektor anotasi | YuNet, confidence >= 0,5, maks. 10 wajah/gambar |
| Skor deteksi | mean 0,9172 · min 0,5519 |
| Split | group per folder foto, seed 42 |
| Folder val | foto 1, 10, 13, 18, 25 |
| Format label | YOLO `0 cx cy w h` (0–1) |
| Format XML | Pascal VOC, piksel absolut |

## Struktur

```
dataset_annotations/
├── labels/
│   ├── train/            196 .txt  (YOLO, ternormalisasi)
│   └── val/               51 .txt
├── annotations_xml/
│   ├── train/            196 .xml  (Pascal VOC, piksel absolut)
│   └── val/               51 .xml
├── coordinates/          247 .txt  (ringkasan koordinat per foto)
├── reports/
│   ├── boxes_pixels.csv          243 baris: semua kotak (piksel + normalisasi)
│   ├── images_manifest.csv       247 baris: semua gambar + split + jumlah wajah
│   ├── summary_by_folder.csv      25 baris: rekap per folder sumber
│   ├── per_image_index.csv      247 baris: indeks hasil per foto
│   ├── visual_export_summary.json
│   └── ringkasan.md
├── dataset_summary.csv
├── dataset_summary.json
├── data.yaml.example
└── README.md
```

Nama file memakai label anonim `sNN` (contoh `s02_IMG_20260930_100136.jpg`) —
tidak ada nama siswa di paket ini.

## Cara memakai

- **labelImg / CVAT**: buka `annotations_xml/` sebagai anotasi Pascal VOC.
- **YOLO**: pasangkan `labels/` dengan gambar asli di struktur
  `images/{train,val}` + `labels/{train,val}`.
- **Analisis koordinat**: gunakan `reports/boxes_pixels.csv`
  (kolom `xmin, ymin, xmax, ymax` dalam piksel; `cx_norm, cy_norm, w_norm, h_norm` 0–1).

## Cara mereproduksi (di mesin lokal, dengan foto asli)

Foto sumber berada di `ai-service/datasets/foto N-*` dan **tidak** di repo ini.
Dari folder `ai-service/`:

```powershell
# 1) buat dataset gambar + label YOLO + XML VOC
python scripts\export_bbox_dataset.py --letterbox 0 --xml

# 2) laporan lengkap (CSV + ringkasan + contact sheet)
python scripts\make_bbox_report.py

# 3) visual per foto + koordinat
python scripts\export_bbox_visuals.py
```

Hasil ekspor selalu masuk folder baru `datasets/bbox_export_<timestamp>/`;
foto sumber tidak diubah.

## Privasi

- Foto asli siswa **tidak** disertakan dalam repo publik ini.
- Jangan menambahkan foto wajah siswa ke repo publik tanpa izin tertulis
  dari siswa/orang tua dan sekolah.
- Untuk data lengkap, simpan di penyimpanan privat (bukan repo publik).

## Sumber

Dibuat dari ekspor `datasets/bbox_export_20261121_140558/` pada 21-11-2026.
Skrip: `ai-service/scripts/export_bbox_dataset.py`,
`make_bbox_report.py`, `export_bbox_visuals.py`.
