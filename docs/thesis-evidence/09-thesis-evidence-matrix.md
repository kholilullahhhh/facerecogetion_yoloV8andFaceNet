# 09 — Matriks Bukti Terhadap Draft BAB III (3.1.1–3.3)

**⚠ Limitasi pemetaan:** file draft "Pasted text(20261104-174148).txt" **tidak ditemukan di repo** (dicari: `glob **/Pasted*`, seluruh `*.txt` rekursif) → pemetaan di dokumen ini memakai struktur subbab 3.1.1–3.3 persis seperti dikutip di prompt audit. Ketika Anda menempelkan draft asli, tabel ini disesuaikan baris-per-baris.

**Skala status:** READY (bukti lengkap) · PARTIAL (ada tapi belum lengkap) · MISSING (belum ada bukti) · INVALID (draft bertentangan dengan implementasi aktual).

---

## 1. Matriks

| Subbab | Bukti yang dibutuhkan | Bukti tersedia | Kekurangan | Status |
|---|---|---|---|---|
| 3.1.1 Pengumpulan & pembagian dataset | jumlah foto per siswa, resolusi, valid/gagal, anotasi YOLO, split bebas leakage | `dataset_scan.json` (247 foto→ 243 valid 1-wajah, 4 background; 160×160 ×243; train 196/val 51; 1 kelas; split foto-level), charts 01/02, `tables/dataset_per_student.csv` | foto multi-wajah 0/247; TIDAK ada test set independen; metadata kondisi belum terannotasi | **PARTIAL** |
| 3.1.2 Implementasi model face detection | arsitektur pipeline, bobot, threshold, landmark, alignment, penanganan gagal | **Implementasi YuNet ONNX utama + YOLOv8s fallback** — kode + 232,589 B onnx + cv2 5.0.0 + 960px/0.5 + landmark mata + align + grid bukti (chart 14), layout `11_system_pipeline_diagram.png` | draft menulis detector YOLO sebagai utama → **harus direvisi** | **INVALID terhadap draft** (bukti teknis READY) |
| 3.1.3 Implementasi model FaceNet | model, sumber bobot, dimensi, preprocessing, fine-tune vs pretrained, matching | InceptionResnetV1/VGGFace2 **512-D**, L2-norm, (x−127.5)/128, **fine-tune ep07 aktif sejak 03-11** (loss CE 9-kelas, BUKAN Triplet), Euclidean-min | draft (versi lama) "pretrained tanpa fine-tune"/"128-D"/Triplet → koreksi | **INVALID terhadap draft** (bukti teknis READY) |
| 3.1.4 Penentuan threshold | metrik jarak, cara kandidat, threshold aktif, kalibrasi EER | threshold **1.0** aktif (runtime verify), Euclidean-min, empat metode EER konvergen (0.85 pretrained / ~1.16–1.18 tuned), FAR/FRR @1.0 = 1.30%/13.98% | bug polarity `calculate_eer` (dok 06); uji EER pada data independen; re-enroll dulu utk data lapangan | **PARTIAL** |
| 3.1.5 Implementasi aplikasi | arsitektur 3-lapis, autentikasi, flow absensi, skema DB | audit lengkap dok 01/07 dgn baris kode; skema migrasi; flow diagram (chart 11) | screenshot UI (kategori D); halaman settings/model rusak (F6) | **READY** (kode) |
| 3.2.1 Pengujian deteksi wajah | metrik deteksi uji nyata | YOLO fallback: P 0.9956 / R 0.9608 / mAP50 0.9935 / mAP50-95 0.8602 (51 val); YuNet scan 243/247 foto; curve & PR plots native | deteksi dinyatakan pada frame kamera nyata yang belum pernah dibench, error analysis formal | **PARTIAL** |
| 3.2.2 Pengujian pengenalan identitas | akurasi, EER, FAR/FRR, confusion, open-set | LOO closed-set + confusion (chart 10), FAR/TAR/FRR sweep (charts 04–07), AUC 0.9975/EER 1.82% (ep07), kompetisi 4 model (chart 03), negatif 400 (bukti) | bukan foto independen (LOO di crop enrollment); akurasi end-to-end nyata menunggu DB + re-enroll | **PARTIAL** (interna READY) |
| 3.2.3 Pengujian variasi kondisi wajah | akurasi per kondisi: gelap/terang, sudut, kacamata, jilbab, gerakan | **hanya distribusi**: 2 gelap/161 normal/84 terang; roll |room: −120.6°…29.4°, \|>5°\| :92 foto; jilbab ada di dataset | uji stratified per kondisi + foto kondisi ekstrem | **MISSING** (data distribusi tersedia, uji conditional belum) |
| 3.2.4 Pengujian latency | waktu per stage/end-point | benchmark n=27: detect 619 / embedding 1066 / recognize 1059 ms; breakdown 428/428/2.3 ms; YOLO fallback 1220 ms | multi-wajah & galeri besar; kapasitas concurrent | **READY** (dgn limitasi dinyatakan) |
| 3.2.5 Pengujian fungsionalitas | uji seluruh alur aplikasi + hasil PASS/FAIL | audit kode; uji API AI (7 skenario ✔); negative-case ✔; tabel dok 08 | runtime aplikasi (login/CRUD/sesi) menunggu MySQL; screenshot | **PARTIAL** |
| 3.3 Pembahasan | interpretistory hasil + identifikasi implikasi | sumber instular: dok 04–08 + semua chart | butuh draft aslinya; isu validitas (LOO vs lapangan) harus dibahas jujur | **PARTIAL** |

## 2. Koreksi prinsipal (dari draft → bukti)

| No | Klaim draft (per kutipan) | Implementasi terverifikasi | Apa yang harus ditulis |
|---|---|---|---|
| K1 | Pipeline deteksi berbasis **YOLOv8** (detektor utama, hasil deteksi system memakai YOLO) | **YuNet ONNX utama**; YOLO dipakai hanya kalau YuNet gagal termuat (`recognition_service.py:29-34`) | YuNet sebagai detektor utama + YOLOv8s sebagai fallback ideal; eksperimen YOLO (mAP) tetap dilaporkan sebagai eksperimen fallback |
| K2 | **FaceNet pretrained tanpa fine-tune** (dan/atau) Triplet Loss | Fine-tune ep07 (cross-entropy head 512→9) **dideploy**, matang di `weights/facenet_model.pth` 03-11-2026; baseline pretrained tetap tersedia untuk perbandingan | Fine-tune **sudah dibuktikan** (AUC 0.9850→0.9975; EER 6.85%→1.82%; impostor mean 1.10→1.43) — perdalam; BUKAN triplet |
| K3 | Embedding **128-D** | **512-D** (assert kode + 27/27 API) | 512-D |
| K4 | (ops) PostgreSQL | MySQL lokal (`backend/.env`) | MySQL |

## 3. Klaim day-1 yang kini TERS.Treein bukti (duplikat untuk quote malas)

- Fine-tune mengubah ruang embedding: mean genuin 0.52 → 0.78; max impostor1.10 → 1.43 — *re-attendance* embedding DB harus di-regen (FIGL dept 04 menyacila).
- timezero tentang FRR 60% @0.8 di model baru (39.78%) menjelaskan kenapa threshold 0.8 tidak cocok pas fine-tune.

## 4. Pertanyaan untuk draft final (isi setelah Anda tempel draft)

1. Berapa persen deteksi yang klaim-draft merujuk (YuNet? YOLO?). Koreksi secara eksplisit.
2. Laporan angka mAP hanya untuk fallback; jangan dianggap dussiedet dalam pipeline absensi tamu waktu.
3. Laporan akurasi pengenalan: gunakan "LOO" term; kalau menyatakan "lapangan", ambil daftar dari C1 (dok 10).
