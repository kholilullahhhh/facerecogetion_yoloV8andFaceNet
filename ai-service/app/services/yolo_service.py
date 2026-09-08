import numpy as np
import cv2
from ultralytics import YOLO
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
from config import YOLO_MODEL_PATH, FACE_CONFIDENCE_THRESHOLD, DEVICE


class YOLOService:
    def __init__(self):
        self.model = None
        self.loaded = False

    def load_model(self):
        model_path = Path(YOLO_MODEL_PATH)
        if not model_path.exists():
            print(f"[WARNING] YOLO model not found at {model_path}. Using pretrained yolov8s.")
            self.model = YOLO("yolov8s.pt")
        else:
            self.model = YOLO(str(model_path))
        self.loaded = True
        print(f"[INFO] YOLO model loaded on {DEVICE}")

    def detect_faces(self, image: np.ndarray) -> list[dict]:
        if not self.loaded:
            raise RuntimeError("YOLO model not loaded")

        results = self.model.predict(
            source=image,
            conf=FACE_CONFIDENCE_THRESHOLD,
            device=DEVICE,
            verbose=False,
        )

        detections = []
        for result in results:
            if result.boxes is None:
                continue
            for box in result.boxes:
                cls = int(box.cls[0])
                conf = float(box.conf[0])
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                detections.append({
                    "bbox": {
                        "x1": int(max(0, x1)),
                        "y1": int(max(0, y1)),
                        "x2": int(x2),
                        "y2": int(y2),
                    },
                    "confidence": round(conf, 4),
                    "class": cls,
                })

        return detections

    def detect_faces_from_bytes(self, image_bytes: bytes) -> tuple[np.ndarray, list[dict]]:
        nparr = np.frombuffer(image_bytes, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError("Invalid image data")

        detections = self.detect_faces(image)
        return image, detections
