# -*- coding: utf-8 -*-
"""
Resize seluruh dataset mentah (ai-service/datasets/foto N-...) ke struktur
datasets/ siap pakai:

  datasets/yolo/images/{train,val}/  -> 640x640 letterbox (pad 114), klasifikasi riser YOLOv8
  datasets/yolo/labels/{train,val}/  -> label YOLO (class 0 'face') dari bbox YuNet
  datasets/yolo/data.yaml
  datasets/facenet/student_NNN/      -> crop wajah + align mata + resize 160x160 (pipeline produksi)

Catatan:
- Label YOLO dibuat otomatis dari YuNet (pretrained) -> review sebelum training ulang.
- Folder foto 11-26 = siswa tidak terdaftar (impostor) untuk testing/kalibrasi.
"""
import sys
import zlib
import cv2
import numpy as np
from pathlib import Path
from PIL import Image, ImageOps

BASE = Path(__file__).resolve().parent.parent          # ai-service/
sys.path.insert(0, str(BASE))                          # agar bisa import app/ + config.py
from app.services.face_detector_service import FaceDetectorService
from app.preprocessing.face_preprocessing import preprocess_face  # noqa: E402

SRC_ROOT = BASE / "datasets"                           # foto mentah (Google Drive download)
OUT_ROOT = BASE.parent / "datasets"                    # hasil resize
YOLO_SIZE = 640
PAD_VALUE = (114, 114, 114)                            # letterbox gray khas ultralytics
JPEG_Q = 92
TRAIN_RATIO = 0.8
EXTS = (".jpg", ".jpeg", ".png")

import re
FOLD = re.compile(r"foto\s+(\d+)", re.IGNORECASE)

def student_id(rel: Path) -> int | None:
    for part in rel.parts:
        m = FOLD.search(part)
        if m:
            return int(m.group(1))
    return None

def load_bgr(path: Path) -> np.ndarray | None:
    try:
        pil = Image.open(path)
        pil = ImageOps.exif_transpose(pil)             # hormati orientasi EXIF ponsel
        rgb = np.array(pil.convert("RGB"))
        return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    except Exception as e:
        print(f"  [SKIP] gagal baca {path.name}: {e}")
        return None

def letterbox(img: np.ndarray, size: int = YOLO_SIZE):
    h, w = img.shape[:2]
    scale = min(size / h, size / w)
    nw, nh = int(round(w * scale)), int(round(h * scale))
    resized = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_AREA)
    canvas = np.full((size, size, 3), PAD_VALUE, dtype=np.uint8)
    ox, oy = (size - nw) // 2, (size - nh) // 2
    canvas[oy:oy + nh, ox:ox + nw] = resized
    return canvas, scale, ox, oy

def yolo_line(bbox: dict, scale: float, ox: int, oy: int, size: int = YOLO_SIZE) -> str:
    x1 = bbox["x1"] * scale + ox
    y1 = bbox["y1"] * scale + oy
    x2 = bbox["x2"] * scale + ox
    y2 = bbox["y2"] * scale + oy
    cx = (x1 + x2) / 2 / size
    cy = (y1 + y2) / 2 / size
    bw = (x2 - x1) / size
    bh = (y2 - y1) / size
    return f"0 {cx:.6f} {cy:.6f} {bw:.6f} {bh:.6f}"

def split_of(rel: str) -> str:
    return "train" if (zlib.crc32(rel.encode()) % 100) < TRAIN_RATIO * 100 else "val"

def main() -> None:
    photos = sorted(
        p for p in SRC_ROOT.rglob("*")
        if p.is_file() and p.suffix.lower() in EXTS
    )
    n = len(photos)
    print(f"Dataset mentah: {n} foto dari {SRC_ROOT.name}/")

    for sub in ["yolo/images/train", "yolo/images/val", "yolo/labels/train", "yolo/labels/val", "facenet"]:
        (OUT_ROOT / sub).mkdir(parents=True, exist_ok=True)

    det = FaceDetectorService()
    det.load_model()

    stats: dict[int, dict] = {}
    failed: list[str] = []
    t_total = 0.0

    for i, path in enumerate(photos, 1):
        rel = path.relative_to(SRC_ROOT)
        sid = student_id(rel)
        sid = sid if sid is not None else 0
        row = stats.setdefault(sid, {"raw": 0, "train": 0, "val": 0, "face_ok": 0, "no_face": 0})
        row["raw"] += 1

        img = load_bgr(path)
        if img is None:
            failed.append(f"student {sid:02d} | {rel.name} | baca gagal")
            row["no_face"] += 1
            continue

        import time
        t0 = time.time()
        dets = det.detect_faces(img)
        t_total += time.time() - t0

        tag = f"s{sid:02d}_{path.stem}"
        split = split_of(str(rel))
        row[split] += 1

        # ---- YOLO: letterbox 640x640 + label semua wajah terdeteksi
        yimg, scale, ox, oy = letterbox(img)
        yline = "\n".join(yolo_line(d["bbox"], scale, ox, oy) for d in dets if d["class"] == 0)
        cv2.imwrite(str(OUT_ROOT / "yolo" / "images" / split / f"{tag}.jpg"), yimg,
                    [cv2.IMWRITE_JPEG_QUALITY, JPEG_Q])
        (OUT_ROOT / "yolo" / "labels" / split / f"{tag}.txt").write_text(yline + ("\n" if yline else ""))

        # ---- FaceNet: crop->align->160
        if dets:
            best = dets[0]
            face = preprocess_face(img, best["bbox"], best["landmarks"])
            sdir = OUT_ROOT / "facenet" / f"student_{sid:03d}"
            sdir.mkdir(exist_ok=True)
            cv2.imwrite(str(sdir / f"{tag}.jpg"), face, [cv2.IMWRITE_JPEG_QUALITY, 95])
            row["face_ok"] += 1
        else:
            failed.append(f"student {sid:02d} | {rel.name} | wajah tidak terdeteksi")
            row["no_face"] += 1

        if i % 25 == 0 or i == n:
            print(f"  {i:3d}/{n} foto diproses (YuNet rata² {t_total / i:.2f}s/foto)")

    # ---------------------------------------------------------------- data.yaml
    yaml = (
        "# Auto-generated oleh scripts/resize_dataset.py\n"
        f"path: {OUT_ROOT / 'yolo'}\n"
        "train: images/train\n"
        "val: images/val\n"
        "nc: 1\n"
        "names: ['face']\n"
    )
    (OUT_ROOT / "yolo" / "data.yaml").write_text(yaml, encoding="utf-8")

    # ---------------------------------------------------------------- report
    lines = ["# Laporan Resize Dataset", "",
             f"Sumber: `ai-service/datasets/` — {n} foto mentah (folder foto N = student_id N).",
             f"Output: `datasets/yolo` (640x640 letterbox + label YuNet) & `datasets/facenet` (160x160).", "",
             "| Student | Foto | YOLO train | YOLO val | FaceNet OK | FaceNet gagal |",
             "|---:|---:|---:|---:|---:|---:|"]
    for sid in sorted(stats):
        r = stats[sid]
        lines.append(f"| {sid:03d} | {r['raw']} | {r['train']} | {r['val']} | {r['face_ok']} | {r['no_face']} |")
    tot = {k: sum(r[k] for r in stats.values()) for k in next(iter(stats.values()))}
    lines.append(f"| **Total** | {tot['raw']} | {tot['train']} | {tot['val']} | {tot['face_ok']} | {tot['no_face']} |")
    lines += ["",
              "## Catatan penting", "",
              "- `student_011`–`student_026` = siswa TIDAK terdaftar (impostor) — untuk testing/kalibrasi, jangan ikut Enroll.",
              "- `student_008`: folder tidak ada di dataset mentah (sesuai laporan training).",
              "- Label YOLO otomatis dari YuNet pretrained — lakukan review/verifikasi sebelum training ulang.",
              "- Foto FaceNet memakai pipeline produksi (`preprocess_face`): crop YuNet -> align sudut mata -> Lanczos -> 160x160.", ""]
    if failed:
        lines += ["## Foto tanpa wajah terdeteksi", ""] + [f"- {f}" for f in failed] + [""]
    (OUT_ROOT / "RESIZE_REPORT.md").write_text("\n".join(lines), encoding="utf-8")

    print(f"\nSelesai. YOLO: images {tot['train']} train / {tot['val']} val; "
          f"FaceNet: {tot['face_ok']} crop | gagal/no-face: {len(failed)}")
    print(f"Output  : {OUT_ROOT}")
    print(f"Report  : {OUT_ROOT / 'RESIZE_REPORT.md'}")

if __name__ == "__main__":
    main()
