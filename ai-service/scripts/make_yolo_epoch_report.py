# -*- coding: utf-8 -*-
"""Report metrik YOLO per epoch (format tabel skripsi, desimal koma).

Sumber: ai-service/training_runs/yolo_<timestamp>/run/results.csv
Output: docs/thesis-evidence/tables/yolo_training_per_epoch.{md,csv}

Usage (dari mana saja):
  python ai-service/scripts/make_yolo_epoch_report.py
  python ai-service/scripts/make_yolo_epoch_report.py --run-dir ai-service/training_runs/yolo_20261103_025549
"""
import argparse
import csv
from pathlib import Path

HERE = Path(__file__).resolve().parent
BASE = HERE.parent
REPO = BASE.parent
OUT_DIR = REPO / "docs" / "thesis-evidence" / "tables"

COLS = {
    "precision": "metrics/precision(B)",
    "recall": "metrics/recall(B)",
    "map50": "metrics/mAP50(B)",
    "map50_95": "metrics/mAP50-95(B)",
}


def parse_args():
    ap = argparse.ArgumentParser(description="Report metrik YOLO per epoch")
    ap.add_argument("--run-dir", default=None,
                    help="folder run YOLO (default: yolo_* terbaru dengan run/results.csv)")
    return ap.parse_args()


def find_run():
    cands = [p.parent.parent for p in (BASE / "training_runs").glob("yolo_*/run/results.csv")]
    if not cands:
        raise SystemExit("[STOP] tidak ada training_runs/yolo_*/run/results.csv")
    return sorted(cands)[-1]


def pct(v):
    """0.09855 -> '9,86' (dua desimal, koma Indonesia)."""
    return f"{v * 100:.2f}".replace(".", ",")


def main():
    args = parse_args()
    run = Path(args.run_dir).resolve() if args.run_dir else find_run().resolve()
    src = run / "run" / "results.csv" if (run / "run" / "results.csv").exists() else run / "results.csv"
    if not src.exists():
        raise SystemExit(f"[STOP] results.csv tidak ditemukan di {run}")

    with open(src, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        raise SystemExit("[STOP] results.csv kosong")

    data = []
    for r in rows:
        data.append({
            "epoch": int(float(r["epoch"])),
            "precision": float(r[COLS["precision"]]),
            "recall": float(r[COLS["recall"]]),
            "map50": float(r[COLS["map50"]]),
            "map50_95": float(r[COLS["map50_95"]]),
        })
    best = max(data, key=lambda d: d["map50_95"])

    # --- status run: bandingkan jumlah epoch aktual vs args.yaml ---
    run_dir = src.parent.parent if src.parent.name == "run" else src.parent
    planned = None
    args_yaml = run_dir / "run" / "args.yaml"
    if not args_yaml.exists():
        args_yaml = run_dir / "args.yaml"
    if args_yaml.exists():
        for line in args_yaml.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("epochs:"):
                try:
                    planned = int(float(line.split(":", 1)[1].strip()))
                except ValueError:
                    planned = None
                break
    complete = planned is None or len(data) >= planned

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    md = OUT_DIR / "yolo_training_per_epoch.md"
    csvp = OUT_DIR / "yolo_training_per_epoch.csv"

    lines = [
        "# Report Training YOLOv8s — Metrik per Epoch",
        "",
        f"Run: `{run_dir.name}`  ",
        f"Sumber: `{src.relative_to(REPO).as_posix()}`  ",
        f"Jumlah epoch tercatat: **{len(data)}**" +
        (f" dari **{planned}** yang dikonfigurasi" if planned else "") +
        " · kelas: `face` (1 kelas) · validasi: 51 gambar (split val dataset)",
        "",
    ]
    if not complete:
        lines += [
            f"> **Status: run tidak selesai** — berhenti di epoch {len(data)} "
            f"dari {planned}. Metrik belum konvergen dan belum bisa dianggap "
            "sebagai hasil akhir training.",
            "",
        ]
    lines += [
        "| Epoch | Precision | Recall | mAP50 | mAP50-95 |",
        "|---:|---:|---:|---:|---:|",
    ]
    for d in data:
        lines.append(
            f"| {d['epoch']} | {pct(d['precision'])}% | {pct(d['recall'])}% | "
            f"{pct(d['map50'])}% | {pct(d['map50_95'])}% |")
    lines += [
        "",
        f"**Epoch terbaik (mAP50-95 tertinggi): epoch {best['epoch']}** — "
        f"Precision {pct(best['precision'])}% · Recall {pct(best['recall'])}% · "
        f"mAP50 {pct(best['map50'])}% · mAP50-95 {pct(best['map50_95'])}%.",
        "",
        "## Catatan",
        "",
        "- Nilai diambil langsung dari `results.csv`: kolom `metrics/precision(B)`, "
        "`metrics/recall(B)`, `metrics/mAP50(B)`, `metrics/mAP50-95(B)`.",
        "- Persentase dibulatkan 2 desimal dengan koma desimal (format Indonesia).",
        "- Metrik dihitung pada validation set (51 gambar) setiap akhir epoch.",
        "- `mAP50-95` = rata-rata mAP pada IoU 0,50–0,95 (0,05); `mAP50` = mAP pada IoU 0,50.",
    ]
    if not complete:
        lines.append(
            f"- Run dihentikan pada epoch {len(data)}/{planned}: tidak ada "
            "`yolo_train_metrics.json` dan bobot produksi tidak diperbarui. "
            "`run/weights/best.pt` ada, tetapi bukan model hasil training penuh.")
    md.write_text("\n".join(lines) + "\n", encoding="utf-8")

    with open(csvp, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["epoch", "precision_pct", "recall_pct", "map50_pct", "map50_95_pct"])
        for d in data:
            w.writerow([
                d["epoch"],
                f"{d['precision'] * 100:.2f}",
                f"{d['recall'] * 100:.2f}",
                f"{d['map50'] * 100:.2f}",
                f"{d['map50_95'] * 100:.2f}",
            ])

    print(f"[source] {src}")
    print(f"[rows] {len(data)} epoch | best epoch {best['epoch']} "
          f"(mAP50-95 {pct(best['map50_95'])}%)")
    print(f"[out] {md}")
    print(f"[out] {csvp}")


if __name__ == "__main__":
    main()
