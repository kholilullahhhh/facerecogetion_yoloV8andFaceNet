# -*- coding: utf-8 -*-
"""Fine-tune FaceNet (InceptionResnetV1 vggface2) on datasets/facenet.

- Trained classes: enrolled students student_001..student_010 only.
  (student_011..026 = impostor set, never trained on)
- Split: per student, last 2 images -> val, rest -> train.
- Augmentation mirrors production augment_face(): rotate +-10, brightness x1.15/x0.85, flip LR.
- Image pipeline mirrors production generate_embedding(): uint8 BGR crop -> (x-127.5)/128.
- Unfreezes only the last Inception block (block8) + a new 10-way head;
  everything else stays frozen to preserve VGGFace2 identity features.
- Saves best-backbone state_dict (head excluded) to ../weights/facenet_model.pth
  (production path, loader = torch.load(...) into InceptionResnetV1.load_state_dict).

Run:  python scripts/train_facenet.py   (from ai-service/)
"""
import json
import random
import time
from pathlib import Path

import cv2
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import torch
import torch.nn as nn
from facenet_pytorch import InceptionResnetV1
from torch.utils.data import DataLoader, Dataset

HERE = Path(__file__).resolve().parent
BASE = HERE.parent                      # ai-service/
DATA = BASE.parent / "datasets" / "facenet"
OUT = BASE / "training_runs" / ("facenet_" + time.strftime("%Y%m%d_%H%M%S"))
OUT.mkdir(parents=True, exist_ok=True)

torch.manual_seed(42)
random.seed(42)
np.random.seed(42)

FACE_SIZE = 160
ENROLLED_LIMIT = 10          # student_001..010
VAL_PER_STUDENT = 2
EPOCHS = 30
BATCH = 16
LR_HEAD = 1e-3
LR_BACKBONE = 5e-5
WEIGHT_DECAY = 1e-4


def load_students():
    students = {}
    for d in sorted(DATA.iterdir()):
        if not d.is_dir() or not d.name.startswith("student_"):
            continue
        sid = int(d.name.replace("student_", ""))
        if sid > ENROLLED_LIMIT:
            continue
        imgs = sorted(list(d.glob("*.jpg")) + list(d.glob("*.jpeg")) + list(d.glob("*.png")))
        if not imgs:
            continue
        students[d.name] = imgs
    return students


def augment(img):
    """Random single augmentation, same family as production augment_face()."""
    choices = ["none", None]      # none twice = random.none probability 2/6
    op = random.choice(choices + ["rot+", "rot-", "bright+", "bright-", "flip"])
    if op is None:
        return img
    if op == "none":
        return img
    if op == "flip":
        return cv2.flip(img, 1)
    if op in ("rot+", "rot-"):
        angle = 10 if op == "rot+" else -10
        h, w = img.shape[:2]
        M = cv2.getRotationMatrix2D((w // 2, h // 2), angle, 1.0)
        return cv2.warpAffine(img, M, (w, h))
    f = img.astype(np.float32)
    if op == "bright+":
        return np.clip(f * 1.15, 0, 255).astype(np.uint8)
    return np.clip(f * 0.85, 0, 255).astype(np.uint8)


class FaceDataset(Dataset):
    def __init__(self, items, train: bool):
        self.items = items
        self.train = train

    def __len__(self):
        return len(self.items)

    def __getitem__(self, idx):
        path, label = self.items[idx]
        img = cv2.imread(str(path))
        if img is None:
            img = np.zeros((FACE_SIZE, FACE_SIZE, 3), dtype=np.uint8)
        if self.train:
            img = augment(img)
        x = img.astype(np.float32)
        x = (x - 127.5) / 128.0
        t = torch.from_numpy(x).permute(2, 0, 1)
        return t, label


def main():
    students = load_students()
    names = sorted(students.keys())
    label_of = {n: i for i, n in enumerate(names)}
    print(f"[data] students: {len(names)} -> {names}")
    for n, imgs in students.items():
        print(f"[data] {n}: {len(imgs)} images")

    train_items, val_items = [], []
    for n, imgs in students.items():
        imgs = list(imgs)
        v = imgs[-VAL_PER_STUDENT:] if len(imgs) > VAL_PER_STUDENT else imgs[-1:]
        t = imgs[:-len(v)]
        val_items += [(p, label_of[n]) for p in v]
        train_items += [(p, label_of[n]) for p in t]
    print(f"[data] train={len(train_items)} val={len(val_items)}")

    base = InceptionResnetV1(pretrained="vggface2", device="cpu")
    base.eval()

    for name, p in base.named_parameters():
        p.requires_grad = ("block8" in name) or ("last_bn" in name)
    n_tr = sum(p.numel() for p in base.parameters() if p.requires_grad)
    head = nn.Sequential(nn.Dropout(0.2), nn.Linear(512, len(names)))
    n_tr += sum(p.numel() for p in head.parameters())
    print(f"[model] trainable params (block8 + last_bn + head): {n_tr:,}")

    back_params = [p for p in base.parameters() if p.requires_grad]
    opt = torch.optim.AdamW(
        [
            {"params": back_params, "lr": LR_BACKBONE},
            {"params": list(head.parameters()), "lr": LR_HEAD},
        ],
        weight_decay=WEIGHT_DECAY,
    )
    sched = torch.optim.lr_scheduler.LinearLR(opt, start_factor=0.5, total_iters=3)
    crit = nn.CrossEntropyLoss(label_smoothing=0.1)

    train_ds = FaceDataset(train_items, train=True)
    val_ds = FaceDataset(val_items, train=False)
    g = torch.Generator().manual_seed(42)
    train_dl = DataLoader(train_ds, batch_size=BATCH, shuffle=True, num_workers=0, generator=g)
    val_dl = DataLoader(val_ds, batch_size=BATCH, shuffle=False, num_workers=0)

    history = {"train_loss": [], "train_acc": [], "val_loss": [], "val_acc": [], "lr": []}
    best_val_acc = -1.0
    best_path = OUT / "facenet_best.pth"
    checkpoints = {}

    for epoch in range(1, EPOCHS + 1):
        base.train()
        head.train()
        tl, tc, tn = 0.0, 0, 0
        for x, y in train_dl:
            with torch.no_grad():
                emb = base(x)
            emb = nn.functional.normalize(emb, dim=1)
            logits = head(emb)
            loss = crit(logits, y)
            opt.zero_grad()
            loss.backward()
            opt.step()
            tl += loss.item() * len(y)
            tc += (logits.argmax(1) == y).sum().item()
            tn += len(y)
            history["lr"].append(opt.param_groups[0]["lr"])
        sched.step()
        tr_loss, tr_acc = tl / tn, tc / tn

        base.eval()
        vl, vc, vn = 0.0, 0, 0
        with torch.no_grad():
            for x, y in val_dl:
                emb = nn.functional.normalize(base(x), dim=1)
                lg = head(emb)
                loss = crit(lg, y)
                vl += loss.item() * len(y)
                vc += (lg.argmax(1) == y).sum().item()
                vn += len(y)
        va_loss, va_acc = vl / vn, vc / vn

        history["train_loss"].append(tr_loss)
        history["train_acc"].append(tr_acc)
        history["val_loss"].append(va_loss)
        history["val_acc"].append(va_acc)
        marker = ""
        if va_acc > best_val_acc:
            best_val_acc = va_acc
            torch.save(base.state_dict(), best_path)
            marker = "  <- best"
        if epoch in (7, 15, 30):
            p = OUT / f"facenet_ep{epoch:02d}.pth"
            torch.save(base.state_dict(), p)
            checkpoints[f"ep{epoch:02d}"] = str(p)
        print(f"[epoch {epoch:02d}] train_loss={tr_loss:.4f} acc={tr_acc:.3f} "
              f"| val_loss={va_loss:.4f} acc={va_acc:.3f}{marker}", flush=True)

    # ---- save production weight (backbone only) ----
    base.load_state_dict(torch.load(best_path, map_location="cpu"))
    prod_path = BASE / "weights" / "facenet_model.pth"
    torch.save(base.state_dict(), prod_path)
    print(f"[save] production backbone (best epoch) -> {prod_path}")

    metrics = {
        "students": names,
        "train_items": len(train_items),
        "val_items": len(val_items),
        "epochs": EPOCHS,
        "batch": BATCH,
        "lr_head": LR_HEAD,
        "lr_backbone": LR_BACKBONE,
        "best_val_acc": best_val_acc,
        "checkpoints": checkpoints,
        "history": history,
    }
    with open(OUT / "facenet_train_metrics.json", "w") as f:
        json.dump(metrics, f, indent=2)

    # ---- curves ----
    fig, ax = plt.subplots(1, 3, figsize=(15, 4))
    ax[0].plot(history["train_loss"], label="train")
    ax[0].plot(history["val_loss"], label="val")
    ax[0].set_title("Loss"); ax[0].legend()
    ax[1].plot(history["train_acc"], label="train")
    ax[1].plot(history["val_acc"], label="val")
    ax[1].set_title("Accuracy (10-way classification)"); ax[1].legend()
    ax[1].axhline(best_val_acc, ls="--", c="gray", label=f"best={best_val_acc:.3f}")
    ax[2].plot(history["lr"]); ax[2].set_title("LR (per step)")
    for a in ax: a.grid(alpha=.3)
    fig.suptitle("FaceNet fine-tune — training curves")
    fig.tight_layout()
    fig.savefig(OUT / "facenet_curves.png", dpi=120)
    print(f"[done] results in {OUT}  (best val acc = {best_val_acc:.3f})")


if __name__ == "__main__":
    main()
