# -*- coding: utf-8 -*-
"""Ekspor hasil bounding box PER FOTO (satu file gambar beranotasi per foto).

Input : folder datasets/bbox_export_<timestamp>/ (images + annotations_xml)
Output: <export>/hasil_per_foto/
          <nama_foto>.jpg        247 gambar, kotak + label digambar (resolusi asli)
          koordinat/<nama>.txt    koordinat piksel + normalisasi per foto
          index.csv               rekap semua foto
          README.md               keterangan folder

Usage (dari ai-service/):
  python scripts/export_bbox_visuals.py
  python scripts/export_bbox_visuals.py --max-width 1600     # versi lebih kecil
  python scripts/export_bbox_visuals.py --skip-existing      # lanjutkan yang belum
"""
import argparse
import csv
import json
import time
import xml.etree.ElementTree as ET
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
BASE = HERE.parent
REPO = BASE.parent

FONT = cv2.FONT_HERSHEY_SIMPLEX
C_BOX = (40, 180, 60)
C_TRAIN = (60, 140, 60)
C_VAL = (40, 110, 180)
C_NOFACE = (30, 120, 220)
C_WHITE = (255, 255, 255)


def parse_args():
    ap = argparse.ArgumentParser(description="Ekspor visual bounding box per foto")
    ap.add_argument("--export-dir", default=None,
                    help="folder hasil ekspor (default: bbox_export_* terbaru)")
    ap.add_argument("--out", default=None, help="folder output (default: <export>/hasil_per_foto)")
    ap.add_argument("--max-width", type=int, default=0,
                    help="lebar maksimum output px (0 = resolusi asli)")
    ap.add_argument("--quality", type=int, default=92, help="kualitas JPEG 1-100")
    ap.add_argument("--skip-existing", action="store_true", help="lewati file yang sudah ada")
    return ap.parse_args()


def find_export_dir():
    cands = sorted((REPO / "datasets").glob("bbox_export_*"))
    cands = [c for c in cands if (c / "annotations_xml").is_dir()]
    if not cands:
        raise SystemExit("[STOP] tidak ada folder bbox_export_* dengan annotations_xml/")
    return cands[-1]


def read_summary(export):
    p = export / "dataset_summary.csv"
    out = {}
    if p.exists():
        with open(p, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                out[row["image"]] = row
    return out


def draw_visual(img, boxes, split, n_faces, score, base_w):
    h, w = img.shape[:2]
    t = max(2, int(round(w / 280)))            # ketebalan kotak
    fs = max(0.6, w / 2400.0)                  # skala font
    ft = max(1, t // 3)
    for k, (x1, y1, x2, y2) in enumerate(boxes, 1):
        cv2.rectangle(img, (x1, y1), (x2, y2), C_BOX, t)
        txt = f"face {score}" if n_faces == 1 else f"face {k} {score}"
        (tw, th), _ = cv2.getTextSize(txt, FONT, fs, ft)
        ty = y1 - int(0.35 * th) - 4
        if ty < th + 4:                        # kotak mepet atas -> taruh di dalam
            ty = y1 + th + 8
        cv2.rectangle(img, (x1, ty - th - 6), (x1 + tw + 12, ty + 6), C_BOX, -1)
        cv2.putText(img, txt, (x1 + 6, ty), FONT, fs, C_WHITE, ft, cv2.LINE_AA)
    # badge split
    bfs = max(0.7, w / 3200.0)
    btw = cv2.getTextSize(split.upper(), FONT, bfs, ft)[0][0]
    cv2.rectangle(img, (int(0.012 * w), int(0.008 * h)),
                  (int(0.012 * w) + btw + 18, int(0.008 * h) + int(38 * bfs)), C_TRAIN if split == "train" else C_VAL, -1)
    cv2.putText(img, split.upper(), (int(0.012 * w) + 9, int(0.008 * h) + int(28 * bfs)),
                FONT, bfs, C_WHITE, ft, cv2.LINE_AA)
    if n_faces == 0:
        cv2.putText(img, "NO FACE DETECTED", (int(0.03 * w), int(0.06 * h)),
                    FONT, 1.1 * bfs, C_NOFACE, 2 * ft, cv2.LINE_AA)
    return img


def main():
    args = parse_args()
    export = Path(args.export_dir).resolve() if args.export_dir else find_export_dir().resolve()
    out = Path(args.out) if args.out else export / "hasil_per_foto"
    out.mkdir(parents=True, exist_ok=True)
    koord = out / "koordinat"
    koord.mkdir(exist_ok=True)

    summary = read_summary(export)
    rows = []
    wrote = skipped = 0
    t0 = time.time()
    total_xml = sum(len(list((export / "annotations_xml" / s).glob("*.xml"))) for s in ("train", "val"))

    for split in ("train", "val"):
        xmls = sorted((export / "annotations_xml" / split).glob("*.xml"))
        for xp in xmls:
            root = ET.parse(xp).getroot()
            fn = root.findtext("filename")
            iw = int(root.findtext("size/width"))
            ih = int(root.findtext("size/height"))
            boxes = []
            for o in root.findall("object"):
                bb = o.find("bndbox")
                boxes.append(tuple(int(bb.findtext(k)) for k in ("xmin", "ymin", "xmax", "ymax")))
            n_faces = len(boxes)
            sc = summary.get(fn, {}).get("scores_mean", "")
            src_folder = summary.get(fn, {}).get("src_folder", "")

            src = export / "images" / split / fn
            dst = out / fn
            txt = koord / (Path(fn).stem + ".txt")

            # --- sidecar koordinat ---
            lines = [
                f"image      : {fn}",
                f"split      : {split}",
                f"source     : {src_folder}",
                f"size       : {iw}x{ih}",
                f"faces      : {n_faces}",
                f"score_mean : {sc}",
                "",
            ]
            for k, (x1, y1, x2, y2) in enumerate(boxes, 1):
                bw, bh = x2 - x1, y2 - y1
                lines.append(
                    f"face {k}: xmin={x1} ymin={y1} xmax={x2} ymax={y2} | "
                    f"w={bw} h={bh} | cx_norm={(x1 + x2) / 2 / iw:.6f} "
                    f"cy_norm={(y1 + y2) / 2 / ih:.6f} "
                    f"w_norm={bw / iw:.6f} h_norm={bh / ih:.6f}")
            if not boxes:
                lines.append("(tidak ada wajah terdeteksi — background)")
            txt.write_text("\n".join(lines) + "\n", encoding="utf-8")

            if args.skip_existing and dst.exists():
                skipped += 1
            else:
                img = cv2.imread(str(src))
                if img is None:
                    print(f"[warn] gagal baca: {src}")
                    continue
                if args.max_width and img.shape[1] > args.max_width:
                    r = args.max_width / img.shape[1]
                    img = cv2.resize(img, (args.max_width, int(round(img.shape[0] * r))),
                                     interpolation=cv2.INTER_AREA)
                    sx, sy = img.shape[1] / iw, img.shape[0] / ih
                    boxes_draw = [(int(x1 * sx), int(y1 * sy), int(x2 * sx), int(y2 * sy))
                                  for x1, y1, x2, y2 in boxes]
                else:
                    boxes_draw = boxes
                vis = draw_visual(img, boxes_draw, split, n_faces, sc, iw)
                cv2.imwrite(str(dst), vis, [cv2.IMWRITE_JPEG_QUALITY, args.quality])
                wrote += 1

            rows.append({
                "split": split, "image": fn, "source_folder": src_folder,
                "annotated_file": fn, "coord_file": f"koordinat/{Path(fn).stem}.txt",
                "width": iw, "height": ih, "n_faces": n_faces,
                "score_mean": sc,
                "boxes_pixels": "; ".join(f"{x1},{y1},{x2},{y2}" for x1, y1, x2, y2 in boxes),
            })
            done = wrote + skipped
            if done % 25 == 0:
                print(f"[progress] {done}/{total_xml} ({time.time() - t0:.0f}s)")

    with open(out / "index.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)

    n_faces = sum(r["n_faces"] for r in rows)
    n_bg = sum(1 for r in rows if r["n_faces"] == 0)
    (out / "summary.json").write_text(json.dumps({
        "created": time.strftime("%Y-%m-%d %H:%M:%S"),
        "source_export": str(export),
        "images": len(rows),
        "train": sum(1 for r in rows if r["split"] == "train"),
        "val": sum(1 for r in rows if r["split"] == "val"),
        "faces": n_faces,
        "background_images": n_bg,
        "output_max_width": args.max_width or "original",
        "jpeg_quality": args.quality,
        "written": wrote, "skipped": skipped,
    }, indent=2), encoding="utf-8")

    (out / "README.md").write_text(
        "# Hasil Bounding Box Per Foto\n\n"
        f"Dibuat: {time.strftime('%Y-%m-%d %H:%M:%S')}\n\n"
        f"- Sumber: `{export}` (tidak diubah)\n"
        f"- Jumlah foto: **{len(rows)}** (train {sum(1 for r in rows if r['split'] == 'train')} / "
        f"val {sum(1 for r in rows if r['split'] == 'val')})\n"
        f"- Total wajah: **{n_faces}** | background: {n_bg}\n"
        f"- Resolusi output: {'asli' if not args.max_width else str(args.max_width) + ' px (lebar)'}\n"
        f"- JPEG quality: {args.quality}\n\n"
        "## Isi\n```\n"
        "<nama_foto>.jpg        # foto + kotak hijau + label confidence\n"
        "koordinat/<nama>.txt   # xmin/ymin/xmax/ymax piksel + normalisasi\n"
        "index.csv              # rekap semua foto\n"
        "summary.json\n```\n\n"
        "Kotak mengikuti anotasi Pascal VOC di `annotations_xml/` (piksel absolut).\n"
        "Foto tanpa wajah tetap diekspor dengan tanda `NO FACE DETECTED`.\n",
        encoding="utf-8")

    print(f"\n[done] {len(rows)} foto | ditulis {wrote} | dilewati {skipped}")
    print(f"  output: {out}")
    print(f"  gambar: {wrote} jpg | koordinat: {len(rows)} txt | index.csv")


if __name__ == "__main__":
    main()
