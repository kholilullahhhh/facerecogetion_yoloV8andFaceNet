# 03 — Konfigurasi Model AI (Implementasi Aktual, Bukan Klaim)

**Tanggal:** 5 November 2026 · **Metode:** pembacaan kode layanan AI (`ai-service/app/**`, `config.py`, `.env` kunci non-rugi) + verifikasi runtime `/health` (GET, aman) + ukuran file bobot.
**Rumus kunci:** dokumen skripsi harus mendeskripsikan **inventori biarkan yang senyang, bukan nama di "dokumentasi"** (AGENTS/README lambat diperbarui).

---

## 1. Tabel konfigurasi aktual tiap komponen

### 1.1 Face Detection — **YuNet ONNX = detektor utama produksi**

| Aspek | Nilai aktual | Bukti |
|---|---|---|
| Arsitektur efektif | **YuNet (cv2.FaceDetectorYN)** | `face_detector_service.py` — di `recognition_service.py:31` YuNet dipilih duluan |
| File model | `weights/face_detection_yunet_2023mar.onnx` — **232,589 byte** | verifikasi filesystem 05-11-2026 |
| Framework/library | OpenCV DNN — **cv2 5.0.0** | log runtime |
| Input/downscale | gambar discale ke sisi maks **960 px** (`MAX_DETECT_SIDE`) | `face_detector_service.py:12,51-55` |
| Preprocessing | resize INTER_AREA, `setInputSize` per gambar | `:53,58` |
| Confidence threshold | **0.5** (`FACE_CONFIDENCE_THRESHOLD`) | `config.py:18` |
| Landmark | **mata kanan & kiri** (kolom 4–7 deteksi YuNet), dibalas ke koordinat full-res | `:16-17,65-80` |
| Face alignment | **rotasi sejaimkan kedua mata** (`align_face`, warpAffine bila \|sudut\|>0.5°) — via landmark YuNet; fallback Haar mata **nonaktif** (cv2≥5 menghapus CascadeClassifier) | `face_preprocessing.py:21-66` |
| Cropping | bbox clamp → crop → **resize 160×160 LANCZOS4** | `preprocess_face()` `:92-110` |
| Penanganan tdk terdeteksi | daftar kosong → `/embedding` & `/register-face` beri **HTTP 400 "No face detected"** (verifikasi: `eer_validation.txt`) | `routes.py:68-72` |
| Cap wajah | maks **10** per gambar, urut confidence | `:84-88` |
| Fallback | bila YuNet gagal termuat → **YOLOv8s dipakai** (`detect_faces` caller memilih YOLO, dengan warning) | `recognition_service.py:29-34` |

> **Poin untuk skripsi:** YuNet dipilih karena memberi bbox + landmark mata dalam satu deteksi (dipakai untuk alignment), murah (ONNX 231 KB), tidak butuh GPU. YOLOv8s **tetap dilatih & dideploy** sebagai fallback — angka metriknya valid, tapi perannya harus ditulis sebagai *fallback*, bukan detektor utama.

### 1.2 YOLOv8s — fallback detector (fine-tuned, dideploy)

| Aspek | Nilai | Bukti |
|---|---|---|
| Arsitektur | YOLOv8 **s** (ultralytics) | `yolo_service.py` |
| Basis | `yolov8s.pt` COCO, head rebuild 1 kelas "face" | `REPORT_2026-11-03.md` §1 |
| Bobot aktif | `weights/yolov8s.pt` = **22,516,202 byte** (hasil fine-tune 03-11-2026) | filesystem; `REPORT` |
| Fallback kedua | bila bobot fine-tuned hilang → pretrained COCO (`YOLO("yolov8s.pt")`) | `yolo_service.py:18-22` |
| Conf threshold | 0.5 | `config.py:18` |
| Input | apa yang diberikan (letterbox 640) | training ulang 640 |

### 1.3 Face Recognition — FaceNet (InceptionResnetV1)

| Aspek | Nilai | Bukti |
|---|---|---|
| Model | **InceptionResnetV1** (`facenet-pytorch`) | `facenet_service.py:19-22` |
| Pretraining | **VGGFace2** (`pretrained="vggface2"`) | `:20` |
| **Status bobot saat ini** | **fine-tuned epoch-7" (ep07), di-deploy 03-11-2026** sebagai `weights/facenet_model.pth` (**112,007,507 byte**) | filesystem; `facenet_service.py:24-27`; `REPORT_2026-11-03.md` §2 |
| Metode fine-tune | ** klasifikasi cross-entropy** dengan head baru `Dropout(0.2)→Linear(512→9)` + unfreeze `block8`+`last_bn` (±1.6 M param); **BUKAN Triplet Loss** | `REPORT_2026-11-03.md` §2 |
| Data fine-tune | 9 siswa terdaftar (s001–s010 tanpa s008): 75 train / 18 val, augmentasi mirror produksi | idem |
| Input | **160×160** (assert/resize), uint8→float32, **(x−127.5)/128 → [−1,1]** satu-satunya titik normalisasi | `facenet_service.py:42-49` |
| Output | **512-D**, **L2-normalized** (norm=0 guard), assert dimensi | `:66-73` |
| Perangkat | CPU (`DEVICE=cpu`) | `.env:5` |
| Augmentasi saat enrollment | rotasi ±10°, brightening ×1.15/×0.85, flip horizontal → **maks 6 embedding/foto** (1 asli + 5 augment) | `face_preprocessing.py:134-157`, `routes.py:106` |

### 1.4 Face Matching

| Aspek | Nilai | Bukti |
|---|---|---|
| Metrik | **Euclidean distance** (`np.linalg.norm(a−b)`), query vs SEMUA embedding galeri, ambil **minimum** | `distance.py:4-7,42-47` |
| Keputusan | matched ⇔ `min_distance ≤ threshold` | `distance.py:49-55` |
| Threshold aktif | **1.0** (`ai-service/.env` `FACE_MATCH_THRESHOLD=1.0`) — verifikasi runtime `/health` threshold=1.0 (05-11-2026, `runtime_check.json`) | dok 06 |
| Kandidat tidak dikenal | `student_id=null, matched=false`, distance tetap dilaporkan | `distance.py:57-62` |

## 2. Bobot on disk (audit 05-11-2026)

| File | Ukuran | Peran |
|---|---|---|
| `weights/face_detection_yunet_2023mar.onnx` | 232,589 B | detektor utama |
| `weights/yolov8s.pt` | 22,516,202 B | detektor fallback (fine-tuned 1 kelas) |
| `weights/facenet_model.pth` | 112,007,507 B | **fine-tuned ep07 (aktif)** |
| `weights/facenet_last_epoch.pth` + checkpoint ep07/ep15/ep30 di `training_runs/facenet_20261103_024517/` | — | backup eksperimen (`REPORT` §4) |

## 3. Verifikasi runtime (GET `/health`, 05-11-2026 02:13, aman)

```json
{"status":"healthy","yolo_loaded":true,"facenet_loaded":true,"device":"cpu","threshold":1.0}
```
→ `raw-results/runtime_check.json` (dibuat `check_runtime.py`).

## 4. Timeline "era" model FaceNet (penting agar skripsi tidak mencampur eras)

| Periode | Bobot aktif | EER (evaluasi sama, LOO) | Catatan |
|---|---|---|---|
| s.d. 02-11-2026 | pretrained VGGFace2 (baseline) | 6.85% (±) | era yang dilaporkan "pretrained tanpa fine-tune" |
| sejak 03-11-2026 | **fine-tuned ep07 (aktif)** | **1.82%** | threshold 0.8 → 1.0 |

Baseline pada `facenet_metrics.json` **adalah model pretrained** yang dievaluasi dengan protokol sama → perbandingan fine-tune vs non-fine-tune BOJUKLANG valid secara adil (dok 05).

## 5. Klaim lawas yang TERBUKTI salah (reformat ke skripsi)

| Sumber klaim | Klaim | Fakta terverifikasi |
|---|---|---|
| `AGENTS.md` repo | "FaceNet (128-D embedding)" | **512-D** (`EMBEDDING_DIMENSION` kode + assert + respons `/embedding` dimension=512, 27/27 sampel) |
| UI `/admin/settings/model` | "VGGFace2 (Pretrained)", "128D" | fine-tuned; 512-D |
| Draft training Triplet Loss (bila ada) | Triplet Loss | cross-entropy head 9-kelas (IN ada bukti loss CE di fine-tune) |
| Draft BAB III | "YOLO sebagai detektor utama pipeline" | YuNet utama; YOLO fallback |
