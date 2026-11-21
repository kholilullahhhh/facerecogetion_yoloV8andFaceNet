# -*- coding: utf-8 -*-
"""Baca history training FaceNet (read-only) -> loss train/val per epoch."""
import json

P = r"D:\unhas\facerecogetion_yoloV8andFaceNet\ai-service\training_runs\facenet_20261103_024517\facenet_train_metrics.json"
d = json.load(open(P, encoding="utf-8"))
h = d["history"]
n = len(h["train_loss"])
print("epochs:", n, "| students:", len(d["students"]), "| train_items:", d["train_items"], "| val_items:", d["val_items"])
print("train_loss:", [round(v, 4) for v in h["train_loss"]])
print("val_loss  :", [round(v, 4) for v in h["val_loss"]])
print("val_acc   :", [round(v, 2) for v in h["val_acc"]])
best = int(max(h["val_acc"]), ), round(float(max(h["val_acc"])), 3)
print("best val_acc:", best)
i7 = h["val_acc"].index(1.0) if 1.0 in h["val_acc"] else None
print("first val_acc==1.0 at epoch:", (i7 + 1) if i7 is not None else None)
