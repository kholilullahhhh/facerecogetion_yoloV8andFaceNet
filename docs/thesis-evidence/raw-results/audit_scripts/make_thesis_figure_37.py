# -*- coding: utf-8 -*-
"""Gambar 3.7 — Grafik FAR dan FRR untuk Penentuan EER (FaceNet fine-tuned ep07).

Sumber data (tidak ada angka karangan):
  ai-service/training_runs/facenet_eval_20261103_025239/facenet_metrics.json
  array asli evaluasi 03-11-2026:
    genuine_d        93 pasangan genuin (LOO, 9 siswa terdaftar)
    impostor_d       3.836 pasangan impostor antar siswa terdaftar
    unknown_min_dist 150 wajah siswa tidak terdaftar (s011-s026, open-set)

Definisi kurva (konsisten dgn Tabel 3.6 & dok 05/06):
  FRR(thr)      = % pasangan genuin dengan jarak > thr
  FAR(thr)      = % pasangan impostor dengan jarak <= thr
  EER           = titik perpotongan kedua kurva (resmi: 1.82% @ threshold 1.1578)

Output: docs/thesis-evidence/charts/18_far_frr_eer_finetuned.png (300 DPI)
Usage: python make_thesis_figure_37.py
"""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

REPO = Path(__file__).resolve().parents[4]
SRC = REPO / "ai-service" / "training_runs" / "facenet_eval_20261103_025239" / "facenet_metrics.json"
OUT = REPO / "docs" / "thesis-evidence" / "charts" / "18_far_frr_eer_finetuned.png"
OUT.parent.mkdir(parents=True, exist_ok=True)

e = json.loads(SRC.read_text(encoding="utf-8"))["facenet_ep07"]
g = np.array(e["genuine_d"], dtype=float).ravel()
imp = np.array(e["impostor_d"], dtype=float).ravel()
unk = np.array(e["unknown_min_dist"], dtype=float).ravel()
s = e["summary"]
eer_pct = float(s["EER"]) * 100.0            # 1.8182
eer_thr = float(s["EER_threshold"])          # 1.1578
auc = float(s["AUC"])                        # 0.99747

assert (len(g), len(imp), len(unk)) == (93, 3836, 150), "ukuran array tidak sesuai protokol"

thr = np.linspace(0.40, 2.00, 1601)
frr = (g[None, :] > thr[:, None]).mean(axis=1) * 100.0
far_enr = (imp[None, :] <= thr[:, None]).mean(axis=1) * 100.0
far_open = (np.concatenate([imp, unk])[None, :] <= thr[:, None]).mean(axis=1) * 100.0

# nilai eksak pada threshold EER dan threshold produksi
frr_at_eer = float((g > eer_thr).mean()) * 100.0        # 2.15
far_at_eer = float((imp <= eer_thr).mean()) * 100.0     # 1.49
far_open_at_eer = float((np.concatenate([imp, unk]) <= eer_thr).mean()) * 100.0  # 4.97
frr_10 = float((g > 1.0).mean()) * 100.0                # 13.98
far_open_10 = float((np.concatenate([imp, unk]) <= 1.0).mean()) * 100.0          # 1.30

# perpotongan kurva open-set dgn FRR (definisi konservatif)
i_cross = int(np.argmin(np.abs(far_open - frr)))
cross_thr, cross_pct = float(thr[i_cross]), float((frr[i_cross] + far_open[i_cross]) / 2.0)

fig, ax = plt.subplots(figsize=(9.4, 6.3))
ax.plot(thr, frr, color="#4C72B0", lw=2.2, label="FRR — pasangan genuin yang ditolak")
ax.plot(thr, far_enr, color="#C44E52", lw=2.2,
        label="FAR — pasangan impostor terdaftar yang diterima")
ax.plot(thr, far_open, color="#8C8C8C", lw=1.6, ls="--",
        label="FAR open-set (+150 wajah tidak terdaftar)")
ax.axvline(1.0, color="#555555", ls=":", lw=1.4, label="threshold produksi = 1.0")

ax.set_xlim(0.4, 2.0)
ax.set_ylim(0, 100)
ax.set_xlabel("Threshold jarak Euclidean antar embedding")
ax.set_ylabel("Rate (%)")
ax.set_title("Grafik FAR dan FRR untuk Penentuan EER — FaceNet fine-tuned (epoch-7)")
ax.grid(alpha=.3)
ax.legend(fontsize=8, loc="lower left", framealpha=0.95)

# ------- inset: perbesaran daerah EER -------
axi = ax.inset_axes([0.33, 0.50, 0.43, 0.46])
axi.plot(thr, frr, color="#4C72B0", lw=2)
axi.plot(thr, far_enr, color="#C44E52", lw=2)
axi.plot(thr, far_open, color="#8C8C8C", lw=1.4, ls="--")
axi.set_xlim(0.85, 1.45)
axi.set_ylim(0, 25)
axi.axvline(eer_thr, color="k", ls="-.", lw=1)
axi.axhline(eer_pct, color="gray", ls=":", lw=1)
axi.plot([eer_thr], [frr_at_eer], "o", color="#4C72B0", ms=5)
axi.plot([eer_thr], [far_at_eer], "o", color="#C44E52", ms=5)
axi.annotate(f"EER = {eer_pct:.2f}%\n(FAR {far_at_eer:.2f}% / FRR {frr_at_eer:.2f}%)\n"
             f"@ threshold {eer_thr:.4f} ≈ 1.16",
             xy=(eer_thr, eer_pct), xytext=(0.865, 10.5), fontsize=8,
             bbox=dict(facecolor="white", edgecolor="none", alpha=0.9),
             arrowprops=dict(arrowstyle="->", color="k", lw=0.8))
axi.set_title("Perbesaran daerah EER", fontsize=8.5)
axi.tick_params(labelsize=7)
axi.grid(alpha=.3)
ax.indicate_inset_zoom(axi, edgecolor="#333333", alpha=0.6)

fig.text(0.5, 0.004,
         f"Sumber: facenet_eval_20261103_025239/facenet_metrics.json (evaluasi 03-11-2026) — 93 pasangan genuin (LOO) vs "
         f"3.836 impostor terdaftar, +150 wajah tidak terdaftar; FRR(thr) = %genuin > thr, FAR(thr) = %impostor ≤ thr. "
         f"EER resmi {eer_pct:.2f}% @ {eer_thr:.4f} (AUC {auc:.4f}); definisi open-set berpotongan ~{cross_pct:.2f}% @ ~{cross_thr:.4f}; "
         f"threshold produksi 1.0 → FAR {far_open_10:.2f}%, FRR {frr_10:.2f}%.",
         ha="center", fontsize=6.5, color="#555555")

fig.savefig(OUT, dpi=300, bbox_inches="tight")
plt.close(fig)
print("chart ->", OUT.name)
print(f"EER = {eer_pct:.4f}% @ thr {eer_thr:.4f} | FAR@EER(enr)={far_at_eer:.2f}% "
      f"FAR@EER(open)={far_open_at_eer:.2f}% FRR@EER={frr_at_eer:.2f}%")
print(f"open-set crossing ~{cross_pct:.2f}% @ {cross_thr:.4f} | produksi 1.0: FAR {far_open_10:.2f}% FRR {frr_10:.2f}%")
print("DONE")
