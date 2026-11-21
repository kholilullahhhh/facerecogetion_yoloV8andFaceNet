# Report Training YOLOv8s — Metrik per Epoch

Run: `yolo_20261121_134718`  
Sumber: `ai-service/training_runs/yolo_20261121_134718/run/results.csv`  
Jumlah epoch tercatat: **5** dari **20** yang dikonfigurasi · kelas: `face` (1 kelas) · validasi: 51 gambar (split val dataset)

> **Status: run tidak selesai** — berhenti di epoch 5 dari 20. Metrik belum konvergen dan belum bisa dianggap sebagai hasil akhir training.

| Epoch | Precision | Recall | mAP50 | mAP50-95 |
|---:|---:|---:|---:|---:|
| 1 | 74,32% | 92,16% | 95,87% | 60,11% |
| 2 | 51,47% | 33,33% | 39,61% | 24,94% |
| 3 | 55,56% | 29,41% | 55,87% | 18,46% |
| 4 | 87,08% | 86,28% | 91,05% | 58,62% |
| 5 | 77,48% | 72,55% | 80,92% | 53,72% |

**Epoch terbaik (mAP50-95 tertinggi): epoch 1** — Precision 74,32% · Recall 92,16% · mAP50 95,87% · mAP50-95 60,11%.

## Catatan

- Nilai diambil langsung dari `results.csv`: kolom `metrics/precision(B)`, `metrics/recall(B)`, `metrics/mAP50(B)`, `metrics/mAP50-95(B)`.
- Persentase dibulatkan 2 desimal dengan koma desimal (format Indonesia).
- Metrik dihitung pada validation set (51 gambar) setiap akhir epoch.
- `mAP50-95` = rata-rata mAP pada IoU 0,50–0,95 (0,05); `mAP50` = mAP pada IoU 0,50.
- Run dihentikan pada epoch 5/20: tidak ada `yolo_train_metrics.json` dan bobot produksi tidak diperbarui. `run/weights/best.pt` ada, tetapi bukan model hasil training penuh.
