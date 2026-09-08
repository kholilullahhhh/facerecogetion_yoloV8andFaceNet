import numpy as np


def euclidean_distance(embedding1: np.ndarray, embedding2: np.ndarray) -> float:
    if embedding1.shape != embedding2.shape:
        raise ValueError(f"Embedding shapes mismatch: {embedding1.shape} vs {embedding2.shape}")
    return float(np.linalg.norm(embedding1 - embedding2))


def cosine_similarity(embedding1: np.ndarray, embedding2: np.ndarray) -> float:
    dot_product = np.dot(embedding1, embedding2)
    norm1 = np.linalg.norm(embedding1)
    norm2 = np.linalg.norm(embedding2)
    if norm1 == 0 or norm2 == 0:
        return 0.0
    return float(dot_product / (norm1 * norm2))


def batch_euclidean_distance(query: np.ndarray, database: np.ndarray) -> np.ndarray:
    if database.shape[1] != query.shape[0]:
        raise ValueError("Embedding dimensions mismatch")
    distances = np.linalg.norm(database - query, axis=1)
    return distances


def find_best_match(
    query_embedding: np.ndarray,
    registered_embeddings: list[dict],
    threshold: float,
) -> dict:
    if not registered_embeddings:
        return {
            "matched": False,
            "student_id": None,
            "student_name": None,
            "distance": None,
        }

    best_distance = float("inf")
    best_match = None

    for entry in registered_embeddings:
        reg_emb = np.array(entry["embedding"], dtype=np.float32)
        dist = euclidean_distance(query_embedding, reg_emb)
        if dist < best_distance:
            best_distance = dist
            best_match = entry

    if best_distance <= threshold:
        return {
            "matched": True,
            "student_id": best_match["student_id"],
            "student_name": best_match["student_name"],
            "distance": round(best_distance, 4),
        }
    else:
        return {
            "matched": False,
            "student_id": None,
            "student_name": None,
            "distance": round(best_distance, 4),
        }
