import numpy as np
import torch
from pathlib import Path
from facenet_pytorch import InceptionResnetV1

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
from config import FACENET_MODEL_PATH, DEVICE, FACE_CROP_SIZE, EMBEDDING_DIMENSION


class FaceNetService:
    def __init__(self):
        self.model = None
        self.loaded = False

    def load_model(self):
        model_path = Path(FACENET_MODEL_PATH)

        self.model = InceptionResnetV1(
            pretrained="vggface2",
            device=DEVICE,
        ).eval()

        if model_path.exists():
            state_dict = torch.load(model_path, map_location=DEVICE)
            self.model.load_state_dict(state_dict)
            print(f"[INFO] FaceNet model loaded from {model_path}")
        else:
            print(f"[WARNING] FaceNet custom model not found at {model_path}. Using pretrained VGGFace2.")

        self.loaded = True
        print(f"[INFO] FaceNet model ready on {DEVICE}")

    def generate_embedding(self, face_image: np.ndarray) -> np.ndarray:
        if not self.loaded:
            raise RuntimeError("FaceNet model not loaded")

        if face_image.shape[:2] != (FACE_CROP_SIZE, FACE_CROP_SIZE):
            import cv2
            face_image = cv2.resize(face_image, (FACE_CROP_SIZE, FACE_CROP_SIZE))

        if face_image.dtype != np.float32:
            face_image = face_image.astype(np.float32)

        if face_image.max() > 1.0:
            face_image = (face_image - 127.5) / 128.0

        if len(face_image.shape) == 3:
            if face_image.shape[2] == 3:
                face_tensor = torch.from_numpy(face_image).permute(2, 0, 1).unsqueeze(0)
            elif face_image.shape[0] == 3:
                face_tensor = torch.from_numpy(face_image).unsqueeze(0)
            else:
                face_tensor = torch.from_numpy(face_image).permute(2, 0, 1).unsqueeze(0)
        else:
            face_tensor = torch.from_numpy(face_image).unsqueeze(0).unsqueeze(0)

        face_tensor = face_tensor.to(DEVICE)

        with torch.no_grad():
            embedding = self.model(face_tensor)

        embedding = embedding.cpu().numpy().flatten()

        norm = np.linalg.norm(embedding)
        if norm > 0:
            embedding = embedding / norm

        assert embedding.shape[0] == EMBEDDING_DIMENSION, \
            f"Expected {EMBEDDING_DIMENSION}-D embedding, got {embedding.shape[0]}-D"

        return embedding

    def generate_embeddings_batch(self, face_images: list[np.ndarray]) -> list[np.ndarray]:
        return [self.generate_embedding(img) for img in face_images]
