# -*- coding: utf-8 -*-
"""Laporan lengkap hasil ekspor bounding box (semua gambar + semua kotak).

Input : folder datasets/bbox_export_<timestamp>/ (hasil export_bbox_dataset.py)
Output (di dalam folder input, subfolder reports/):
  boxes_pixels.csv      -> 1 baris per wajah: koordinat piksel absolut + normalisasi
  images_manifest.csv   -> 1 baris per gambar (247): split, jumlah wajah, dimensi
  summary_by_folder.csv -> 1 baris per folder sumber (25)
  ringkasan.md          -> laporan ringkas siap dibaca
  contact_sheets/*.jpg  -> SEMUA gambar (247) dalam grid + kotak, 25 per lembar

Usage (dari ai-service/):
  python scripts/make_bbox_report.py
  python scripts/make_bbox_report.py --export-dir ../datasets/bbox_export_20261121_140558
"""
import argparse
import csv
import math
import time
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
BASE = HERE.parent
REPO = BASE.parent

FONT = cv2.FONT_HERSHEY_SIMPLEX
C_TRAIN = (60, 140, 60)
C_VAL = (40, 110, 180)
C_BOX = (40, 180, 60)
C_NOFACE = (30, 120, 220)
C_TEXT = (35, 35, 35)


def parse_args():
    ap = argparse.ArgumentParser(description="Buat laporan lengkap hasil ekspor bbox")
    ap.add_argument("--export-dir", default=None,
                    help="folder hasil ekspor (default: bbox_export_* terbaru di datasets/)")
    ap.add_argument("--per-sheet", type=int, default=25, help="gambar per contact sheet")
    ap.add_argument("--thumb-width", type=int, default=320, help="lebar thumbnail (px)")
    return ap.parse_args()


def find_export_dir():
    cands = sorted((REPO / "datasets").glob("bbox_export_*"))
    cands = [c for c in cands if (c / "annotations_xml").is_dir()]
    if not cands:
        raise SystemExit("[STOP] tidak ada folder bbox_export_* dengan annotations_xml/")
    return cands[-1]


def read_summary(export):
    """dataset_summary.csv -> {nama_file: row}"""
    p = export / "dataset_summary.csv"
    out = {}
    if not p.exists():
        return out
    with open(p, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            out[row["image"]] = row
    return out


def read_xml(xml_path):
    root = ET.parse(xml_path).getroot()
    w = int(root.findtext("size/width"))
    h = int(root.findtext("size/height"))
    boxes = []
    for o in root.findall("object"):
        bb = o.find("bndbox")
        boxes.append(tuple(int(bb.findtext(k)) for k in ("xmin", "ymin", "xmax", "ymax")))
    return root.findtext("filename"), w, h, boxes


def collect(export):
    summary = read_summary(export)
    items = []
    for split in ("train", "val"):
        xml_dir = export / "annotations_xml" / split
        for xp in sorted(xml_dir.glob("*.xml")):
            fn, w, h, boxes = read_xml(xp)
            img_path = export / "images" / split / fn
            if not img_path.exists():
                raise SystemExit(f"[STOP] gambar hilang: {img_path}")
            lp = export / "labels" / split / (xp.stem + ".txt")
            n_lbl = 0
            if lp.exists():
                n_lbl = len([l for l in lp.read_text(encoding="utf-8").splitlines() if l.strip()])
            s = summary.get(fn, {})
            items.append({
                "split": split, "image": fn, "image_path": img_path,
                "xml": xp.relative_to(export).as_posix(),
                "label": lp.relative_to(export).as_posix() if lp.exists() else "",
                "src_folder": s.get("src_folder", ""),
                "score_mean": s.get("scores_mean", ""),
                "width": w, "height": h, "boxes": boxes, "n_label": n_lbl,
                "n_faces": len(boxes),
            })
    return items


def write_csvs(export, items, reports):
    box_fields = ["split", "image", "source_folder", "image_width", "image_height",
                  "face_index", "xmin", "ymin", "xmax", "ymax", "box_width", "box_height",
                  "box_area_pct", "cx_norm", "cy_norm", "w_norm", "h_norm",
                  "score_mean_image", "xml_file"]
    with open(reports / "boxes_pixels.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=box_fields)
        w.writeheader()
        for it in items:
            for k, (x1, y1, x2, y2) in enumerate(it["boxes"], 1):
                bw, bh = x2 - x1, y2 - y1
                w.writerow({
                    "split": it["split"], "image": it["image"],
                    "source_folder": it["src_folder"],
                    "image_width": it["width"], "image_height": it["height"],
                    "face_index": k,
                    "xmin": x1, "ymin": y1, "xmax": x2, "ymax": y2,
                    "box_width": bw, "box_height": bh,
                    "box_area_pct": round(100.0 * bw * bh / (it["width"] * it["height"]), 3),
                    "cx_norm": round((x1 + x2) / 2 / it["width"], 6),
                    "cy_norm": round((y1 + y2) / 2 / it["height"], 6),
                    "w_norm": round(bw / it["width"], 6),
                    "h_norm": round(bh / it["height"], 6),
                    "score_mean_image": it["score_mean"],
                    "xml_file": it["xml"],
                })

    man_fields = ["split", "image", "source_folder", "n_faces", "image_width",
                  "image_height", "score_mean", "has_label", "has_xml", "xml_file", "label_file"]
    with open(reports / "images_manifest.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=man_fields)
        w.writeheader()
        for it in items:
            w.writerow({
                "split": it["split"], "image": it["image"],
                "source_folder": it["src_folder"], "n_faces": it["n_faces"],
                "image_width": it["width"], "image_height": it["height"],
                "score_mean": it["score_mean"],
                "has_label": int(bool(it["label"])), "has_xml": int(bool(it["xml"])),
                "xml_file": it["xml"], "label_file": it["label"],
            })

    agg = defaultdict(lambda: {"n_img": 0, "n_faces": 0, "n_bg": 0, "split": set()})
    for it in items:
        a = agg[it["src_folder"]]
        a["n_img"] += 1
        a["n_faces"] += it["n_faces"]
        a["n_bg"] += 1 if it["n_faces"] == 0 else 0
        a["split"].add(it["split"])
    with open(reports / "summary_by_folder.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["source_folder", "split", "n_images",
                                          "n_faces", "background_images",
                                          "mean_faces_per_image"])
        w.writeheader()
        for name in sorted(agg, key=lambda s: (s == "", s)):
            a = agg[name]
            w.writerow({
                "source_folder": name,
                "split": "/".join(sorted(a["split"])),
                "n_images": a["n_img"], "n_faces": a["n_faces"],
                "background_images": a["n_bg"],
                "mean_faces_per_image": round(a["n_faces"] / a["n_img"], 2),
            })
    return agg


def draw_cell(canvas, x0, y0, cell_w, cell_h, it, scale_cache):
    img = cv2.imread(str(it["image_path"]))
    if img is None:
        cv2.rectangle(canvas, (x0, y0), (x0 + cell_w, y0 + cell_h), (0, 0, 200), 2)
        return
    # letterbox ke cell
    h, w = img.shape[:2]
    r = min(cell_w / w, cell_h / h)
    nw, nh = int(round(w * r)), int(round(h * r))
    thumb = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_AREA)
    ox, oy = (cell_w - nw) // 2, (cell_h - nh) // 2
    canvas[y0 + oy:y0 + oy + nh, x0 + ox:x0 + ox + nw] = thumb
    for (x1, y1, x2, y2) in it["boxes"]:
        p1 = (x0 + ox + int(x1 * r), y0 + oy + int(y1 * r))
        p2 = (x0 + ox + int(x2 * r), y0 + oy + int(y2 * r))
        cv2.rectangle(canvas, p1, p2, C_BOX, 2)
    # badge split
    badge = it["split"].upper()
    col = C_TRAIN if it["split"] == "train" else C_VAL
    tw = cv2.getTextSize(badge, FONT, 0.4, 1)[0][0]
    cv2.rectangle(canvas, (x0 + 4, y0 + 4), (x0 + 12 + tw, y0 + 24), col, -1)
    cv2.putText(canvas, badge, (x0 + 8, y0 + 19), FONT, 0.4, (255, 255, 255), 1, cv2.LINE_AA)
    # caption
    label = it["image"] if len(it["image"]) <= 27 else it["image"][:24] + "..."
    cv2.putText(canvas, label, (x0, y0 + cell_h + 17), FONT, 0.45, C_TEXT, 1, cv2.LINE_AA)
    if it["n_faces"]:
        cap2 = f"{it['n_faces']} face | score {it['score_mean']}"
        col2 = C_BOX
    else:
        cap2 = "no face detected (background)"
        col2 = C_NOFACE
    cv2.putText(canvas, cap2, (x0, y0 + cell_h + 36), FONT, 0.42, col2, 1, cv2.LINE_AA)


def make_contact_sheets(export, items, reports, per_sheet, thumb_w):
    out_dir = reports / "contact_sheets"
    out_dir.mkdir(parents=True, exist_ok=True)
    by_split = {s: [it for it in items if it["split"] == s] for s in ("train", "val")}

    cols = 5
    rows = math.ceil(per_sheet / cols)
    pad, cap_h, header_h = 12, 44, 60
    cell_w, cell_h = thumb_w, int(round(thumb_w * 4 / 3))
    sheet_w = cols * cell_w + (cols + 1) * pad
    sheet_h = header_h + rows * (cell_h + cap_h + pad) + pad

    made = []
    for split, arr in by_split.items():
        chunks = [arr[i:i + per_sheet] for i in range(0, len(arr), per_sheet)]
        for si, chunk in enumerate(chunks, 1):
            canvas = np.full((sheet_h, sheet_w, 3), 246, np.uint8)
            local_rows = math.ceil(len(chunk) / cols)
            h_use = header_h + local_rows * (cell_h + cap_h + pad) + pad
            canvas = canvas[:h_use]
            title = (f"{export.name} — {split.upper()} "
                     f"{si}/{len(chunks)} (gambar {1 + (si - 1) * per_sheet}-"
                     f"{min(si * per_sheet, len(arr))} dari {len(arr)})")
            cv2.putText(canvas, title, (pad, 38), FONT, 0.85, C_TEXT, 2, cv2.LINE_AA)
            for idx, it in enumerate(chunk):
                r, c = divmod(idx, cols)
                x0 = pad + c * (cell_w + pad)
                y0 = header_h + r * (cell_h + cap_h + pad)
                draw_cell(canvas, x0, y0, cell_w, cell_h, it, None)
            name = f"sheet_{si:02d}_{split}_{1 + (si - 1) * per_sheet:03d}-{min(si * per_sheet, len(arr)):03d}.jpg"
            cv2.imwrite(str(out_dir / name), canvas, [cv2.IMWRITE_JPEG_QUALITY, 90])
            made.append(name)
            print(f"[sheet] {name}")
    return made


def write_report(export, items, agg, sheets, n_boxes, reports):
    n_train = sum(1 for it in items if it["split"] == "train")
    n_val = len(items) - n_train
    n_faces = sum(it["n_faces"] for it in items)
    n_bg = sum(1 for it in items if it["n_faces"] == 0)
    n_multi = sum(1 for it in items if it["n_faces"] > 1)
    scores = [float(it["score_mean"]) for it in items if it["score_mean"] not in ("", None)]
    dims = sorted({(it["width"], it["height"]) for it in items})
    mismatch = sum(1 for it in items if it["n_faces"] != it["n_label"])

    lines = []
    lines.append(f"# Laporan Ekspor Bounding Box — `{export.name}`\n")
    lines.append(f"Dibuat: {time.strftime('%Y-%m-%d %H:%M:%S')}  ")
    lines.append(f"Sumber: `{REPO / 'ai-service' / 'datasets'}` (247 foto mentah, tidak diubah)\n")
    lines.append("## Ringkasan\n")
    lines.append("| Item | Nilai |")
    lines.append("|---|---|")
    lines.append(f"| Total gambar | **{len(items)}** |")
    lines.append(f"| Train / Val | **{n_train} / {n_val}** |")
    lines.append(f"| Total kotak wajah | **{n_faces}** |")
    lines.append(f"| Foto background (0 wajah) | {n_bg} |")
    lines.append(f"| Foto multi-wajah | {n_multi} |")
    lines.append(f"| Rata-rata wajah/gambar | {n_faces / len(items):.2f} |")
    lines.append(f"| Skor deteksi mean / min | {np.mean(scores):.4f} / {np.min(scores):.4f} |")
    lines.append(f"| Dimensi gambar | {', '.join(f'{w}x{h}' for w, h in dims)} (resolusi asli) |")
    lines.append(f"| XML vs label mismatch | {mismatch} |")
    lines.append("")
    lines.append("## Berkas laporan\n")
    lines.append("| Berkas | Isi |")
    lines.append("|---|---|")
    lines.append(f"| `boxes_pixels.csv` | **{n_boxes} baris** — semua kotak wajah, koordinat piksel absolut + normalisasi |")
    lines.append(f"| `images_manifest.csv` | **{len(items)} baris** — semua gambar + split + jumlah wajah |")
    lines.append(f"| `summary_by_folder.csv` | **{len(agg)} baris** — rekap per folder sumber |")
    lines.append(f"| `contact_sheets/` | **{len(sheets)} lembar** berisi seluruh {len(items)} gambar + kotak |")
    lines.append("")
    lines.append("## Rekap per folder sumber\n")
    lines.append("| Folder sumber | Split | Gambar | Wajah | Background |")
    lines.append("|---|---|---|---|---|")
    for name in sorted(agg, key=lambda s: (s == "", s)):
        a = agg[name]
        lines.append(f"| {name} | {'/'.join(sorted(a['split']))} | {a['n_img']} | "
                     f"{a['n_faces']} | {a['n_bg']} |")
    lines.append("")
    lines.append("## Contoh pembacaan koordinat\n")
    it = next((x for x in items if x["boxes"]), None)
    if it:
        x1, y1, x2, y2 = it["boxes"][0]
        lines.append(f"`{it['image']}` (gambar {it['width']}x{it['height']}): "
                     f"`xmin={x1}, ymin={y1}, xmax={x2}, ymax={y2}` → "
                     f"lebar {x2 - x1} px, tinggi {y2 - y1} px.")
    lines.append("")
    lines.append("## Catatan\n")
    lines.append("- Koordinat XML dalam **piksel absolut** pada resolusi gambar tersimpan (3072x4096).")
    lines.append("- Label YOLO (`labels/`) memakai koordinat ternormalisasi 0-1; "
                 "keduanya berasal dari deteksi YuNet yang sama.")
    lines.append("- `score_mean_image` = rata-rata confidence YuNet untuk gambar tersebut "
                 "(confidence per kotak tidak disimpan pada ekspor ini).")
    lines.append("- `contact_sheets/` memuat wajah asli siswa — **jangan dipublikasikan tanpa izin/blur**.")
    (reports / "ringkasan.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    args = parse_args()
    export = Path(args.export_dir) if args.export_dir else find_export_dir()
    export = export.resolve()
    if not (export / "annotations_xml").is_dir():
        raise SystemExit(f"[STOP] bukan folder ekspor XML: {export}")
    reports = export / "reports"
    reports.mkdir(parents=True, exist_ok=True)

    print(f"[input] {export}")
    items = collect(export)
    print(f"[data] {len(items)} gambar | {sum(i['n_faces'] for i in items)} kotak")

    agg = write_csvs(export, items, reports)
    print("[csv] boxes_pixels.csv, images_manifest.csv, summary_by_folder.csv")

    sheets = make_contact_sheets(export, items, reports, args.per_sheet, args.thumb_width)
    write_report(export, items, agg, sheets, sum(i["n_faces"] for i in items), reports)

    print("\n[done] laporan di:", reports)
    print(f"  ringkasan.md | contact_sheets/ ({len(sheets)} lembar)")


if __name__ == "__main__":
    main()
