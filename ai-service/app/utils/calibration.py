import json
import numpy as np
from sklearn.metrics import roc_curve

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from app.utils.distance import euclidean_distance


def calculate_eer(
    genuine_distances: list[float],
    impostor_distances: list[float],
) -> dict:
    all_distances = np.array(genuine_distances + impostor_distances)
    labels = np.array([1] * len(genuine_distances) + [0] * len(impostor_distances))

    fpr, tpr, thresholds = roc_curve(labels, all_distances, pos_label=1)

    fnr = 1 - tpr
    eer_index = np.nanargmin(np.abs(fpr - fnr))
    eer = float((fpr[eer_index] + fnr[eer_index]) / 2)
    optimal_threshold = float(thresholds[eer_index])

    return {
        "optimal_threshold": round(optimal_threshold, 4),
        "eer": round(eer, 4),
        "far_at_eer": round(float(fpr[eer_index]), 4),
        "frr_at_eer": round(float(fnr[eer_index]), 4),
    }


def generate_calibration_pairs(
    embeddings_by_student: dict[int, list[list[float]]],
) -> tuple[list[float], list[float]]:
    genuine_distances = []
    impostor_distances = []

    student_ids = list(embeddings_by_student.keys())

    for student_id in student_ids:
        embeddings = embeddings_by_student[student_id]
        for i in range(len(embeddings)):
            for j in range(i + 1, len(embeddings)):
                emb1 = np.array(embeddings[i], dtype=np.float32)
                emb2 = np.array(embeddings[j], dtype=np.float32)
                dist = euclidean_distance(emb1, emb2)
                genuine_distances.append(dist)

    for i in range(len(student_ids)):
        for j in range(i + 1, len(student_ids)):
            embs_i = embeddings_by_student[student_ids[i]]
            embs_j = embeddings_by_student[student_ids[j]]
            for ei in embs_i:
                for ej in embs_j:
                    emb1 = np.array(ei, dtype=np.float32)
                    emb2 = np.array(ej, dtype=np.float32)
                    dist = euclidean_distance(emb1, emb2)
                    impostor_distances.append(dist)

    return genuine_distances, impostor_distances
