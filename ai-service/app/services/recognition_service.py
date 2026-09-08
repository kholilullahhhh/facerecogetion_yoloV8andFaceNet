import time
import numpy as np
from typing import Optional

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from config import FACE_MATCH_THRESHOLD, EMBEDDING_DIMENSION
from app.services.yolo_service import YOLOService
from app.services.facenet_service import FaceNetService
from app.preprocessing.face_preprocessing import preprocess_face, augment_face
from app.utils.distance import find_best_match, euclidean_distance


class RecognitionService:
    def __init__(self):
        self.yolo = YOLOService()
        self.facenet = FaceNetService()
        self.threshold = FACE_MATCH_THRESHOLD

    def load_models(self):
        self.yolo.load_model()
        self.facenet.load_model()

    def update_threshold(self, threshold: float):
        self.threshold = threshold

    def recognize_faces(
        self,
        image: np.ndarray,
        registered_embeddings: list[dict],
    ) -> dict:
        start_time = time.time()
        timing = {}

        detect_start = time.time()
        detections = self.yolo.detect_faces(image)
        timing["detection_ms"] = round((time.time() - detect_start) * 1000, 2)

        results = []
        embed_start = time.time()
        for det in detections:
            face_crop = preprocess_face(image, det["bbox"])
            embedding = self.facenet.generate_embedding(face_crop)
            timing["embedding_ms"] = round((time.time() - embed_start) * 1000, 2)

            match_start = time.time()
            match_result = find_best_match(
                query_embedding=embedding,
                registered_embeddings=registered_embeddings,
                threshold=self.threshold,
            )
            timing["matching_ms"] = round((time.time() - match_start) * 1000, 2)

            results.append({
                "bbox": det["bbox"],
                "detection_confidence": det["confidence"],
                "student_id": match_result["student_id"],
                "student_name": match_result["student_name"],
                "distance": match_result["distance"],
                "matched": match_result["matched"],
            })

        total_ms = round((time.time() - start_time) * 1000, 2)

        return {
            "success": True,
            "processing_time_ms": total_ms,
            "faces": results,
            "timing": timing,
        }

    def generate_face_embedding(self, face_image: np.ndarray) -> Optional[np.ndarray]:
        if not self.facenet.loaded:
            return None
        return self.facenet.generate_embedding(face_image)

    def register_face(
        self,
        face_image: np.ndarray,
        augment: bool = True,
    ) -> list[np.ndarray]:
        embeddings = []

        embedding = self.generate_face_embedding(face_image)
        if embedding is not None:
            embeddings.append(embedding.tolist())

        if augment:
            augmented_faces = augment_face(face_image)
            for aug_face in augmented_faces[1:]:
                aug_embedding = self.generate_face_embedding(aug_face)
                if aug_embedding is not None:
                    embeddings.append(aug_embedding.tolist())

        return embeddings
