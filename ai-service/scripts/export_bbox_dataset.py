# -*- coding: utf-8 -*-
"""Ekspor dataset bounding box wajah (format YOLO) ke folder baru.

Sumber : ai-service/datasets/foto N-*  (25 folder, 247 foto mentah)
Deteksi: YuNet (FaceDetectorService) — detektor yang sama dengan produksi
         dan dengan pembuat dataset YOLO sebelumnya.
Output : datasets/bbox_export_<timestamp>/ (folder BARU, sumber tidak diubah)

Struktur output:
  images/train/*.jpg   labels/train/*.txt
  images/val/*.jpg     labels/val/*.txt
  preview/*.jpg        (contoh kotak digambar untuk verifikasi visual)
  data.yaml            README.md
  dataset_summary.csv  dataset_summary.json

Format label: "0 cx cy w h" (0-1, kelas 0 = face), satu baris per wajah.
Foto tanpa wajah -> label kosong (background/negatif) kecuali --exclude-background.

Usage (dari ai-service/):
  python scripts/export_bbox_dataset.py
  python scripts/export_bbox_dataset.py --letterbox 0      # simpan resolusi asli
  python scripts/export_bbox_dataset.py --val-frac 0.2 --preview 16
"""
import argparse
import csv
import json
import shutil
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
BASE = HERE.parent                       # ai-service/
REPO = BASE.parent
sys.path.insert(0, str(BASE))

import cv2
import numpy as np

from app.services.face_detector_service import FaceDetectorService
import config


def parse_args():
    ap = argparse.ArgumentParser(description="Export face bounding-box dataset (YOLO format)")
    ap.add_argument("--src", default=str(BASE / "datasets"),
                    help="folder induk berisi folder 'foto N-*' (default ai-service/datasets)")
    ap.add_argument("--out", default=str(REPO / "datasets" / ("bbox_export_" + time.strftime("%Y%m%d_%H%M%S"))),
                    help="folder output baru")
    ap.add_argument("--val-frac", type=float, default=0.2, help="proporsi val (per folder/split-by group)")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--split-by", choices=["group", "image"], default="group",
                    help="group=split per folder foto (anti leakage), image=per gambar")
    ap.add_argument("--letterbox", type=int, default=640,
                    help="ukuran letterbox persegi (default 640, mirip pipeline lama); 0 = simpan asli")
    ap.add_argument("--exclude-background", action="store_true", help="buang foto tanpa wajah")
    ap.add_argument("--xml", action="store_true",
                    help="tulis anotasi Pascal VOC (annotations_xml/{train,val}/*.xml)")
    ap.add_argument("--preview", type=int, default=12, help="jumlah gambar preview kotak")
    return ap.parse_args()


def folder_id(name: str) -> int:
    """'foto 12-2026...' -> 12 ; 'foto 1' -> 1."""
    digits = ""
    for ch in name.replace("foto", "").strip():
        if ch.isdigit():
            digits += ch
        else:
            break
    return int(digits) if digits else 999


def letterbox(img, size):
    """Resize + pad ke persegi (abu-abu 114). Kembalikan (img, ratio, dx, dy)."""
    h, w = img.shape[:2]
    r = min(size / w, size / h)
    nw, nh = int(round(w * r)), int(round(h * r))
    resized = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_AREA)
    dx, dy = (size - nw) // 2, (size - nh) // 2
    out = np.full((size, size, 3), 114, dtype=np.uint8)
    out[dy:dy + nh, dx:dx + nw] = resized
    return out, r, dx, dy


def write_voc_xml(path, filename, folder, w, h, boxes):
    """Tulis anotasi Pascal VOC (koordinat piksel absolut)."""
    objs = []
    for (x1, y1, x2, y2) in boxes:
        objs.append(
            "  <object>\n"
            "    <name>face</name>\n"
            "    <pose>Unspecified</pose>\n"
            "    <truncated>0</truncated>\n"
            "    <difficult>0</difficult>\n"
            "    <bndbox>\n"
            f"      <xmin>{int(round(x1))}</xmin>\n"
            f"      <ymin>{int(round(y1))}</ymin>\n"
            f"      <xmax>{int(round(x2))}</xmax>\n"
            f"      <ymax>{int(round(y2))}</ymax>\n"
            "    </bndbox>\n"
            "  </object>\n")
    xml = (
        "<annotation>\n"
        f"  <folder>{folder}</folder>\n"
        f"  <filename>{filename}</filename>\n"
        "  <size>\n"
        f"    <width>{w}</width>\n"
        f"    <height>{h}</height>\n"
        "    <depth>3</depth>\n"
        "  </size>\n"
        + "".join(objs) +
        "</annotation>\n")
    path.write_text(xml, encoding="utf-8")


def main():
    args = parse_args()
    src = Path(args.src)
    out = Path(args.out)
    if out.exists():
        raise SystemExit(f"[STOP] folder output sudah ada: {out}")
    rng = np.random.RandomState(args.seed)

    # ---------- kumpulkan sumber ----------
    folders = sorted([d for d in src.iterdir() if d.is_dir() and d.name.lower().startswith("foto")],
                     key=lambda d: folder_id(d.name))
    if not folders:
        raise SystemExit(f"[STOP] tidak ada folder 'foto *' di {src}")
    items = []
    for d in folders:
        nid = folder_id(d.name)
        for p in sorted(list(d.rglob("*.jpg")) + list(d.rglob("*.jpeg")) + list(d.rglob("*.png"))):
            items.append((nid, p))
    print(f"[data] {len(items)} foto dari {len(folders)} folder")
    total_img = len(items)

    # ---------- split (group = per folder) ----------
    split_of_folder = {}
    if args.split_by == "group":
        ids = sorted({nid for nid, _ in items})
        rng.shuffle(ids)
        counts = {nid: sum(1 for n, _ in items if n == nid) for nid in ids}
        target = int(round(total_img * args.val_frac))
        acc = 0
        for nid in ids:
            if acc < target:
                split_of_folder[nid] = "val"
                acc += counts[nid]
        for nid in ids:
            split_of_folder.setdefault(nid, "train")
    print(f"[split] val-frac={args.val_frac} seed={args.seed} strategy={args.split_by}")
    if args.split_by == "group":
        print("        val folders:", sorted(k for k, v in split_of_folder.items() if v == "val"))

    # ---------- siapkan folder output ----------
    dirs = ["images/train", "images/val", "labels/train", "labels/val", "preview"]
    if args.xml:
        dirs += ["annotations_xml/train", "annotations_xml/val"]
    for sub in dirs:
        (out / sub).mkdir(parents=True, exist_ok=True)

    detector = FaceDetectorService()
    detector.load_model()
    if not detector.loaded:
        raise SystemExit("[STOP] YuNet tidak termuat — cek weights/face_detection_yunet_2023mar.onnx")
    print(f"[detector] YuNet | conf>={config.FACE_CONFIDENCE_THRESHOLD} | max_faces={config.MAX_FACES_PER_IMAGE}")

    rows, used_names = [], set()
    n_faces_total = n_bg = 0
    scores_all = []
    preview_budget = args.preview

    for i, (nid, p) in enumerate(items):
        img = cv2.imread(str(p))
        if img is None:
            print(f"[warn] gagal baca: {p}")
            continue
        split = split_of_folder.get(nid) if args.split_by == "group" else \
            ("val" if rng.rand() < args.val_frac else "train")

        dets = detector.detect_faces(img)
        boxes, scores = [], []
        for d in dets:
            b = d["bbox"]
            w = b["x2"] - b["x1"]
            h = b["y2"] - b["y1"]
            if w >= 4 and h >= 4:
                boxes.append((b["x1"], b["y1"], b["x2"], b["y2"]))
                scores.append(float(d["confidence"]))

        h0, w0 = img.shape[:2]
        if args.letterbox > 0:
            img_lb, r, dx, dy = letterbox(img, args.letterbox)
            boxes = [(x1 * r + dx, y1 * r + dy, x2 * r + dx, y2 * r + dy) for x1, y1, x2, y2 in boxes]
            out_img, bw, bh = img_lb, args.letterbox, args.letterbox
        else:
            out_img, bw, bh = img, w0, h0

        name = f"s{nid:02d}_{p.name}"
        stem = Path(name).stem
        k = 1
        while name in used_names:
            name = f"{stem}_{k}{p.suffix}"
            k += 1
        used_names.add(name)

        cv2.imwrite(str(out / "images" / split / name), out_img)
        lines = []
        for (x1, y1, x2, y2) in boxes:
            cx = (x1 + x2) / 2.0 / bw
            cy = (y1 + y2) / 2.0 / bh
            ww = (x2 - x1) / bw
            hh = (y2 - y1) / bh
            lines.append(f"0 {cx:.6f} {cy:.6f} {ww:.6f} {hh:.6f}")
        (out / "labels" / split / (Path(name).stem + ".txt")).write_text(
            "\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")

        if args.xml:
            write_voc_xml(out / "annotations_xml" / split / (Path(name).stem + ".xml"),
                          name, f"images/{split}", bw, bh, boxes)

        n_faces_total += len(boxes)
        scores_all += scores
        if not boxes:
            n_bg += 1

        rows.append({
            "split": split,
            "image": name,
            "src_folder": p.parent.name,
            "n_faces": len(boxes),
            "scores_mean": round(float(np.mean(scores)), 4) if scores else "",
        })

        # preview dengan kotak (hanya sebagian, seimbang train/val bila mungkin)
        if preview_budget > 0:
            pv = out_img.copy()
            for (x1, y1, x2, y2), sc in zip(boxes, scores):
                cv2.rectangle(pv, (int(x1), int(y1)), (int(x2), int(y2)), (36, 160, 60), 3)
                cv2.putText(pv, f"face {sc:.2f}", (int(x1), max(14, int(y1) - 6)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (36, 160, 60), 2, cv2.LINE_AA)
            cv2.imwrite(str(out / "preview" / f"{split}_{len(rows):03d}_{name}"), pv)
            preview_budget -= 1

        if (i + 1) % 25 == 0:
            print(f"[progress] {i + 1}/{len(items)}")

    n_train = sum(1 for r in rows if r["split"] == "train")
    n_val = sum(1 for r in rows if r["split"] == "val")

    # ---------- data.yaml + README + ringkasan ----------
    (out / "data.yaml").write_text(
        f"path: {out.as_posix()}\ntrain: images/train\nval: images/val\nnames:\n  0: face\n",
        encoding="utf-8")

    (out / "README.md").write_text(
        "# Dataset Bounding Box Wajah (format YOLO)\n\n"
        f"Dibuat: {time.strftime('%Y-%m-%d %H:%M:%S')}\n\n"
        f"- Sumber: `{src}` (folder foto mentah, TIDAK diubah)\n"
        f"- Detektor label: YuNet (conf >= {config.FACE_CONFIDENCE_THRESHOLD}), 1 kelas: `face`\n"
        f"- Gambar: {'letterbox ' + str(args.letterbox) + 'x' + str(args.letterbox) if args.letterbox else 'resolusi asli'}\n"
        f"- Split: {n_train} train / {n_val} val ({args.split_by}, seed {args.seed})\n"
        f"- Total wajah: {n_faces_total} | foto background (tanpa wajah): {n_bg}\n\n"
        "## Struktur\n```\nimages/{train,val}\nlabels/{train,val}   # '0 cx cy w h' (0-1)\n"
        + ("annotations_xml/{train,val}  # Pascal VOC, piksel absolut\n" if args.xml else "")
        + "preview/             # contoh kotak untuk verifikasi\ndata.yaml\n```\n\n"
        + ("## Anotasi XML (Pascal VOC)\n"
           "Satu file `.xml` per gambar, koordinat `<bndbox>` dalam piksel absolut "
           "pada resolusi gambar tersimpan; `annotations_xml/` sejajar dengan "
           "`images/` (nama file sama, ekstensi .xml).\n\n" if args.xml else "")
        + "## Pakai untuk training (Ultralytics)\n```powershell\n"
        f"cd {BASE.as_posix()}\npython -c \"from ultralytics import YOLO; "
        f"YOLO('yolov8s.pt').train(data=r'{ (out / 'data.yaml').as_posix() }', epochs=20, batch=4, imgsz=640, device='cpu')\"\n```\n",
        encoding="utf-8")

    with open(out / "dataset_summary.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["split", "image", "src_folder", "n_faces", "scores_mean"])
        w.writeheader()
        w.writerows(rows)
    summary = {
        "created": time.strftime("%Y-%m-%d %H:%M:%S"),
        "source": str(src),
        "images_total": len(rows),
        "train": n_train, "val": n_val,
        "faces_total": n_faces_total,
        "background_images": n_bg,
        "mean_faces_per_image": round(n_faces_total / max(1, len(rows)), 2),
        "score_mean": round(float(np.mean(scores_all)), 4) if scores_all else None,
        "score_min": round(float(np.min(scores_all)), 4) if scores_all else None,
        "letterbox": args.letterbox,
        "xml_voc": bool(args.xml),
        "split_by": args.split_by, "seed": args.seed,
        "detector": "YuNet", "conf_threshold": config.FACE_CONFIDENCE_THRESHOLD,
    }
    (out / "dataset_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print("\n[done] output:", out)
    print(f"  images: {len(rows)} ({n_train} train / {n_val} val)")
    print(f"  wajah : {n_faces_total} | background: {n_bg}")
    print(f"  data.yaml, README.md, dataset_summary.csv/.json, preview/ siap"
          + (f", annotations_xml/ ({len(rows)} file)" if args.xml else ""))


if __name__ == "__main__":
    main()
