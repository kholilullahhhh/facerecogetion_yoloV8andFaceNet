# -*- coding: utf-8 -*-
"""Evaluate fine-tuned FaceNet checkpoints vs baseline (VGGFace2 pretrained).

Protocol mirrors production matching (find_best_match): minimal Euclidean
distance over ALL stored embeddings, threshold FACE_MATCH_THRESHOLD (0.8).

Sets (from datasets/facenet, 160x160 crops):
- Enrolled   : student_001..010  (identities that exist in the DB)
- Impostors  : student_011..026  (identities never enrolled) -> open-set FAR test

Usage:
  python scripts/evaluate_facenet.py                       # baseline vs weights/facenet_model.pth
  python scripts/evaluate_facenet.py ck1.pth ck2.pth ...   # extra fine-tuned checkpoints

Outputs (training_runs/facenet_eval_<ts>/):
- facenet_metrics.json, facenet_distance_hist.png, facenet_roc.png,
  facenet_tsne.png (first fine-tuned model), facenet_confusion.png (same),
  facenet_gallery.png
"""
import sys
import json
import time
from itertools import combinations
from pathlib import Path

import cv2
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import torch
import torch.nn.functional as F
from facenet_pytorch import InceptionResnetV1
from sklearn.manifold import TSNE
from sklearn.metrics import auc as sk_auc, roc_curve

HERE = Path(__file__).resolve().parent
BASE = HERE.parent
DATA = BASE.parent / "datasets" / "facenet"
OUT = BASE / "training_runs" / ("facenet_eval_" + time.strftime("%Y%m%d_%H%M%S"))
OUT.mkdir(parents=True, exist_ok=True)

ENROLLED_LIMIT = 10
THRESHOLD = 0.8
COLORS = ["#e67e22", "#2ecc71", "#3498db", "#9b59b6", "#e74c3c"]
rng = np.random.default_rng(42)


def embed_all(model, items):
    model.eval()
    embs = []
    with torch.no_grad():
        for i in range(0, len(items), 32):
            batch = []
            for p, _ in items[i:i + 32]:
                img = cv2.imread(str(p))
                if img is None:
                    img = np.zeros((160, 160, 3), np.uint8)
                if img.shape[:2] != (160, 160):
                    img = cv2.resize(img, (160, 160), interpolation=cv2.INTER_LANCZOS4)
                x = (img.astype(np.float32) - 127.5) / 128.0
                batch.append(x)
            t = torch.from_numpy(np.stack(batch)).permute(0, 3, 1, 2)
            e = F.normalize(model(t), dim=1)
            embs.append(e.numpy())
    return np.vstack(embs)


def main():
    cli = sys.argv[1:]

    enrolled, impostors = [], []
    for d in sorted(DATA.iterdir()):
        if not d.is_dir():
            continue
        sid = d.name.replace("student_", "")
        items = [(p, d.name) for p in
                 sorted(list(d.glob("*.jpg")) + list(d.glob("*.jpeg")) + list(d.glob("*.png")))]
        if int(sid) <= ENROLLED_LIMIT:
            enrolled += items
        else:
            impostors += items

    candidates = cli or [str(BASE / "weights" / "facenet_model.pth")]
    models = {"baseline": InceptionResnetV1(pretrained="vggface2", device="cpu")}
    ft_names = []
    for p in candidates:
        nm = Path(p).stem
        m = InceptionResnetV1(pretrained="vggface2", device="cpu")
        m.load_state_dict(torch.load(p, map_location="cpu"))
        models[nm] = m
        ft_names.append(nm)
    print(f"[data] enrolled={len(enrolled)} crops, impostors={len(impostors)} crops")
    print(f"[model] comparing: baseline + {ft_names}")

    all_items = enrolled + impostors
    ne = len(enrolled)
    E_by = {}
    for nm, m in models.items():
        E_by[nm] = embed_all(m, all_items)

    results = {}
    for nm, E in E_by.items():
        r = evaluate(E[:ne], E[ne:], enrolled, impostors)
        results[nm] = r

    # ---- console + json ----
    for nm, r in results.items():
        print(f"\n===== {nm} =====")
        for k, v in r["summary"].items():
            print(f"  {k}: {v}")
    with open(OUT / "facenet_metrics.json", "w") as f:
        json.dump(results, f, indent=2, default=float)

    order = ["baseline"] + ft_names

    # 1. distance histograms
    fig, axes = plt.subplots(1, len(order), figsize=(6.5 * len(order), 5), sharey=True, squeeze=False)
    for ax, nm in zip(axes[0], order):
        r = results[nm]
        g = r["genuine_d"]
        imp = np.concatenate([np.array(r["impostor_d"]), np.array(r["unknown_min_dist"])])
        bins = np.linspace(0, 1.8, 60)
        ax.hist(g, bins=bins, alpha=.6, label=f"genuine (n={len(g)})", color="#2ecc71")
        ax.hist(imp, bins=bins, alpha=.6, label=f"impostor (n={len(imp)})", color="#e74c3c")
        ax.axvline(THRESHOLD, color="k", ls="--", lw=1.5, label=f"production thr={THRESHOLD}")
        ax.set_title(nm); ax.set_xlabel("Euclidean distance")
        ax.legend(); ax.grid(alpha=.3)
    fig.suptitle("Jarak embedding: pasangan genuin vs impostor")
    fig.tight_layout(); fig.savefig(OUT / "facenet_distance_hist.png", dpi=120)

    # 2. ROC curves
    fig, ax = plt.subplots(figsize=(7.5, 6))
    for i, nm in enumerate(order):
        r = results[nm]
        A = sk_auc(r["roc"]["fpr"], r["roc"]["tpr"])
        ax.plot(r["roc"]["fpr"], r["roc"]["tpr"], lw=2, color=COLORS[i % len(COLORS)],
                label=f"{nm}  AUC={A:.4f}  EER={r['summary']['EER']:.3f}")
        ax.scatter([r["roc"]["eer_fpr"]], [r["roc"]["eer_tpr"]], color=COLORS[i % len(COLORS)], marker="o")
    ax.plot([0, 1], [0, 1], "k--", lw=.8)
    ax.set_xlabel("False Accept Rate"); ax.set_ylabel("True Accept Rate")
    ax.set_title("ROC — genuine vs impostor pairs")
    ax.legend(); ax.grid(alpha=.3)
    fig.tight_layout(); fig.savefig(OUT / "facenet_roc.png", dpi=120)

    # ---- visuals for the first fine-tuned model ----
    ft = ft_names[0] if ft_names else "baseline"
    Ef = E_by[ft]

    # 3. t-SNE
    perp = min(30, (len(all_items) - 1) // 3)
    P = TSNE(n_components=2, perplexity=perp, random_state=42, init="pca").fit_transform(Ef)
    fig, ax = plt.subplots(figsize=(10, 8))
    cmap = plt.get_cmap("tab20")
    enrolled_names = sorted({s for _, s in enrolled})
    for i, nm in enumerate(enrolled_names):
        idx = [j for j, (_, s) in enumerate(enrolled) if s == nm]
        ax.scatter(P[idx, 0], P[idx, 1], s=42, color=cmap(i / 10), label=nm, marker="o")
    imp_labeled = False
    for nm in sorted({s for _, s in impostors}):
        idx = [ne + j for j, (_, s) in enumerate(impostors) if s == nm]
        ax.scatter(P[idx, 0], P[idx, 1], s=30, color="#bbbbbb", marker="x",
                   label=None if imp_labeled else "impostor")
        imp_labeled = True
    ax.set_title(f"t-SNE 512-D embeddings ({ft}) — warna = mahasiswa terdaftar, x = impostor")
    ax.legend(fontsize=7, ncol=3); ax.grid(alpha=.3)
    fig.tight_layout(); fig.savefig(OUT / "facenet_tsne.png", dpi=120)

    # 4. confusion matrix (nearest-ID, leave-one-out)
    r = results[ft]
    ids = list(r["confusion"]["labels"])
    cm = np.zeros((len(ids), len(ids)))
    for pp, tt in zip(r["confusion"]["pred"], r["confusion"]["true"]):
        cm[tt, pp] += 1
    acc = r["summary"]["closed_set_ID_acc"]
    fig, ax = plt.subplots(figsize=(8.5, 7.5))
    im = ax.imshow(cm, cmap="Greens")
    ax.set_xticks(range(len(ids)), ids, rotation=90)
    ax.set_yticks(range(len(ids)), ids)
    for r_ in range(len(ids)):
        for c in range(len(ids)):
            if cm[r_, c]:
                ax.text(c, r_, int(cm[r_, c]), ha="center", va="center", fontsize=8,
                        color="white" if cm[r_, c] > cm.max() * .6 else "black")
    ax.set_xlabel("Prediksi (tetangga terdekat 1:N)"); ax.set_ylabel("Identitas sebenarnya")
    ax.set_title(f"Confusion matrix — identifikasi closed-set ({ft})\naccuracy={acc:.3f}")
    fig.colorbar(im, ax=ax, fraction=.046)
    fig.tight_layout(); fig.savefig(OUT / "facenet_confusion.png", dpi=120)

    # 5. gallery sample (6 students, 2 crops each)
    pick_ids = np.linspace(0, len(enrolled_names) - 1, 6).round().astype(int)
    keys = [enrolled_names[i] for i in pick_ids]
    picks, seen = [], []
    for p, s in enrolled:
        if s in keys and s not in seen[-2:]:
            picks.append((p, s)); seen.append(s)
        if len(picks) >= 12:
            break
    fig, axs = plt.subplots(2, max(4, len(picks) // 2), figsize=(14, 5.4))
    axs = axs.flatten()
    for ax in axs[len(picks):]: ax.axis("off")
    for ax, (p, s) in zip(axs, picks):
        ax.imshow(cv2.imread(str(p))[:, :, ::-1]); ax.set_title(s, fontsize=9); ax.axis("off")
    fig.suptitle("Contoh crop wajah 160x160 (RGB) per mahasiswa")
    fig.tight_layout(); fig.savefig(OUT / "facenet_gallery.png", dpi=120)

    print(f"\n[done] eval outputs -> {OUT}")


def evaluate(Ee, Ei, enrolled, impostors):
    labels_e = np.array([s for _, s in enrolled])

    # genuine pairs (leave-one-out)
    g_idx, g_d = [], []
    for i in range(len(Ee)):
        same = np.where(labels_e == labels_e[i])[0]
        diff = [j for j in same if j != i]
        if not diff:
            continue
        g_d.append(np.linalg.norm(Ee[diff] - Ee[i], axis=1).min())
        g_idx.append(i)
    g_d = np.array(g_d); g_idx = np.array(g_idx)

    # imposter pairs among enrolled (sampled)
    imp_d = []
    for a, b in combinations(range(len(Ee)), 2):
        if labels_e[a] != labels_e[b]:
            imp_d.append(np.linalg.norm(Ee[a] - Ee[b]))
    imp_d = np.array(imp_d)
    if len(imp_d) > 8000:
        imp_d = imp_d[np.sort(rng.integers(0, len(imp_d), 8000))]

    # unknown impostors: min distance to every enrolled embedding (open-set)
    u_grad = np.linalg.norm(Ei[:, None, :] - Ee[None, :, :], axis=2) if len(Ei) else np.zeros((0, len(Ee)))
    u_min = u_grad.min(axis=1) if len(Ei) else np.array([])

    # ROC on enrolled-pairs
    y = np.concatenate([np.ones(len(g_d)), np.zeros(len(imp_d))])
    d_all = np.concatenate([-g_d, -imp_d])
    fpr, tpr, thr = roc_curve(y, d_all)
    fnr = 1 - tpr
    eer_i = int(np.nanargmin(np.abs(fpr - fnr)))
    b_i = int(np.argmax(tpr - fpr))
    best_thr = float(-thr[b_i])
    eer = float((fpr[eer_i] + fnr[eer_i]) / 2)

    # closed-set nearest-id accuracy (leave-one-out)
    D = np.linalg.norm(Ee[:, None, :] - Ee[None, :, :], axis=2)
    np.fill_diagonal(D, np.inf)
    pred_ids = labels_e[D.argmin(axis=1)]
    id_closed = float((pred_ids == labels_e).mean())
    cm_labels = sorted(set(labels_e))
    cm_pred = [cm_labels.index(p) for p in pred_ids]
    cm_true = [cm_labels.index(t) for t in labels_e]

    summary = {
        "genuine_pairs": int(len(g_d)),
        "impostor_pairs": int(len(imp_d)),
        "unknown_crops": int(len(Ei)),
        "genuine_mean_dist": float(g_d.mean()),
        "genuine_max_dist": float(g_d.max()),
        "impostor_mean_dist": float(imp_d.mean()),
        "unknown_min_mean_dist": float(u_min.mean()) if len(u_min) else None,
        "AUC": float(sk_auc(fpr, tpr)),
        "EER": eer,
        "EER_threshold": float(-thr[eer_i]),
        "best_threshold": best_thr,
        "GAR@best_thr": float((g_d <= best_thr).mean()),
        "FAR@best_thr": float((np.concatenate([imp_d, u_min]) <= best_thr).mean()),
        "closed_set_ID_acc": float(id_closed),
        "production_threshold": THRESHOLD,
        "GAR@thr": float((g_d <= THRESHOLD).mean()),
        "FAR_unknown@thr": float((u_min <= THRESHOLD).mean()) if len(u_min) else None,
        "FAR_all@thr": float((np.concatenate([imp_d, u_min]) <= THRESHOLD).mean()),
    }
    return {
        "genuine_idx": g_idx.tolist(),
        "genuine_d": g_d.tolist(),
        "impostor_d": imp_d.tolist(),
        "unknown_min_dist": u_min.tolist(),
        "confusion": {"labels": cm_labels, "pred": cm_pred, "true": cm_true},
        "pred_ids": pred_ids.tolist(),
        "true_ids": labels_e.tolist(),
        "roc": {"fpr": fpr.tolist(), "tpr": tpr.tolist(),
                "eer_fpr": float(fpr[eer_i]), "eer_tpr": float(tpr[eer_i])},
        "summary": summary,
    }


if __name__ == "__main__":
    main()
