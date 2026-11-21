# 02 — Analisis Dataset Penelitian

**Tanggal:** 5 November 2026 · **Metode:** scan file asli + inference YuNet in-memory (`raw-results/audit_scripts/scan_dataset.py`) → hasil mentah `raw-results/dataset_scan.json`; CSV per siswa di `tables/dataset_per_student.csv`.

Berasal dari tiga praktik penyimpanan berbeda — semua dari **foto kamera ponsel siswa asli** (perawatan privasi: label anonim `sNNN`; tidak ada nama dalam dokumen ini):

| Kumpulan | Lokasi | Konten | Jumlah |
|---|---|---|---|
| RAW asli | `ai-service/datasets/foto N-*/` | foto asli smartphone | 25 folder (s001–s026, tanpa s008), **247 foto** |
| Dataset YOLO | `datasets/yolo/images/{train,val}` + `labels/` | letterbox 640×640 + label YOLO (auto YuNet) | train 196, val 51 (total **247**) |
| Dataset FaceNet | `datasets/facenet/student_XXX/` | crop wajah ter-align | 25 folder, **243 crop** |

---

## 1. Kualitas & profil RAW (247 foto)

| Properti | Nilai terukur | Keterangan |
|---|---|---|
| Format | JPEG 100% (`.jpg`/`.jpeg`) | 0 file corrupt, 0 gagal-baca |
| Resolusi | **3072×4096 (semua 247)** | kamera ponsel; oleh layanan akan discale ≤960px saat deteksi |
| Baca `cv2.imread` | 247/247 OK | |
| Deteksi YuNet (score ≥ 0.5, sisi ≤ 960) | **243 foto 1 wajah**, 0 foto multi-wajah, **4 foto 0 wajah** | bukti: `dataset_scan.json` |
| Brightness (luminance pixel) | 2 gelap (<120), 161 normal (120–190), 84 terang (>190) | variasi kondisi nyata; proporsi ada di CSV |
| Roll (mata, derajat) | mean −2.29°, std 11.04°, max 29.4°, \|roll\|>5° pada 92/243 foto (37.9%) | align matainya diperlukan & dipakai |

**4 foto tanpa wajah** (juga dilabeli background kosong pada YOLO — konsisten):
`s06_IMG_20260930_100757.jpg`, `s14_IMG_20260930_101417.jpg`, `s19_IMG_20260930_101936.jpg`, `s21_IMG_20260930_102121.jpg` (nama ditulis anonim: folder `foto 6/14/19/21`).

**Anomali statistik nerd:** roll terendah = −120,6° (satu foto) — kemungkinan swap urutan mata kiri/kanan pada landmark YuNet; masuk inisiatif pembersihan data kalau mau, tetap tersimpan & dilaporkan (contoh nyata untuk pembahasan BAB IV).

**Atributske variasi yang terverifikasi dari dataset:** hijab (siswa perempuan berjilbab ada di foto — label anonim, detail visual di grafik grid `charts/14_detection_alignment_grid.png`); kacamata/top/bahasa напомin — **belum di-annotasi terstruktur** (lihat 10 kategori C).

## 2. Distribusi per siswa (ringkas; lengkap di `tables/dataset_per_student.csv`)

| ID | Foto | 1 wajah | 0 wajah | Crop 160×160 |
|---|---|---|---|---|
| s001 | 11 | … | … | 11 |
| s002 | 10 | … | … | 10 |
| … | (25 baris) | (kosongkan 4 di s06/s14/s19/s21) | 4 total | (243 total) |

Rata-rata ± 9,9 foto/siswa; min 9; max 13. Semua foto readable. **83% foto berada di rentang 9–11, sedikit variasi** (distribusi cukup seimbang antar siswa — tidak ada fold dominan).

## 3. Dataset YOLO (anotasi bounding box)

- `data.yaml` ada → **1 kelas: `0` ("face")**.
- **train:** 196 gambar, 196 file label → 192 label berisi 1 bbox + **4 label kosong** (foto tanpa wajah) = background negatif. boxes/image mean 0.98.
- **val:** 51 gambar, 51 label, semua 1 bbox. boxes/image = 1.
- Gambar semua 640×640 (letterbox — aspek rasio dijaga, padding).
- Label diautogenerasi dari YuNet (letterbox + resize) — alur: RAW → `scan` → resize dataset (`ai-service/scripts/resize_dataset.py`) → auto-label.
- **Pembagian (leakage check):** split dilakukan **tingkat foto** (bukan augmentasi/kopan): 196 train + 51 val = 247, setiap foto asli hanya di satu sisi. Tidak ada foto yang sama di kedua split. TIDAK ADA split test terpisah — YOLO diukur di val 51 (bukan independent test). Untuk FaceNet: evaluasi memakai LOO pada crop dataset **sama dengan foto yang dipakai training classification-head (75 train/18 val)** — protocol terkuat yang tersedia; bukti dan limitasi di dok 05.

## 4. Dataset FaceNet (input recognizer)

25 direktori `student_XXX` (tol s001–s026 tanpa s008) = **243 crop, semuanya 160×160** (jauh dari asibёk 0). Crop dihasilkan dari pipeline YuNet+align+resize (sama danah dengan pipeline produksi — bukti visual `charts/14_detection_alignment_grid.png`).

Kolom kelas evaluasi: 9 siswa terdaftar di DB memakai *enrollment birthday* (s001..s010 minus s008); untuk students registers s011..s026 dihabiskan sebagai **"unknown"/open-set impostor crops** (150 crop), tidak pernah dilatih dikenan — prokol menunjukkan kemampuan open-set (dok 05).

## 5. Kesimpulan dataset (BACK-UP untuk 3.1.1)

- Bukti KEMPUH: jumlah foto per siswa, valid/failed (YuNet 243/4), resolusi seragam tinggi, BOJUK eine Label YOLO ada + kelas single + split train/val bebas leak.
- Cahaya KINS: (1) foto multi-wajah tidak ada (0/247) → uji meet-n-face belum diuji; (2) tidak ada test set independen dari shooting baru; (3) metadata kondisi (jam, cuaca, posisi) belum terannotasi → stratified analysis belumungkin; (4) 1 outlier roll min −120,6.

Seluruh angka di dok ini dengan persis disekan dari `dataset_scan.json` (sekali run 05-11-2026) — reproduksi scan_dataset.py.
