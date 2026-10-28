import cv2
import numpy as np
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
from config import FACE_DETECTOR_YUNET_PATH, FACE_CONFIDENCE_THRESHOLD, MAX_FACES_PER_IMAGE

# Detect on a downscaled copy: full-resolution phone photos put faces beyond
# YuNet's anchor scales, which yields fragmented false positives. 960px keeps
# typical faces inside the detectable range and stays fast.
MAX_DETECT_SIDE = 960

# OpenCV YuNet landmark order (per detection row, 15 values):
# x, y, w, h, re_x, re_y, le_x, le_y, nose_x, nose_y, rm_x, rm_y, lm_x, lm_y, score
_LANDMARK_RIGHT_EYE = (4, 5)
_LANDMARK_LEFT_EYE = (6, 7)


class FaceDetectorService:
    """YuNet (cv2.FaceDetectorYN) face detector — same detection contract as YOLOService:
    list of {"bbox": {x1,y1,x2,y2}, "confidence": float, "landmarks": {...}, "class": 0}.
    Falls back to None when the ONNX model is unavailable; the caller then uses YOLO.
    """

    def __init__(self):
        self.detector = None
        self.loaded = False

    def load_model(self):
        model_path = Path(FACE_DETECTOR_YUNET_PATH)
        if not model_path.exists() or not hasattr(cv2, "FaceDetectorYN"):
            print(f"[WARNING] YuNet face detector not available at {model_path}. Falling back to YOLO detection.")
            self.detector = None
            self.loaded = False
            return
        self.detector = cv2.FaceDetectorYN.create(
            str(model_path),
            "",
            (320, 320),
            score_threshold=FACE_CONFIDENCE_THRESHOLD,
        )
        self.loaded = True
        print(f"[INFO] YuNet face detector loaded from {model_path}")

    def detect_faces(self, image: np.ndarray) -> list[dict]:
        if not self.loaded:
            raise RuntimeError("YuNet face detector not loaded")

        h, w = image.shape[:2]
        scale = min(1.0, MAX_DETECT_SIDE / max(h, w))
        if scale < 1.0:
            small = cv2.resize(image, (int(round(w * scale)), int(round(h * scale))), interpolation=cv2.INTER_AREA)
        else:
            small = image

        sh, sw = small.shape[:2]
        self.detector.setInputSize((sw, sh))
        _, faces = self.detector.detect(small)

        detections = []
        if faces is None:
            return detections

        inv = 1.0 / scale
        for face in faces:
            x, y, fw, fh = face[0], face[1], face[2], face[3]
            confidence = float(face[14])
            detections.append({
                "bbox": {
                    "x1": int(max(0, x * inv)),
                    "y1": int(max(0, y * inv)),
                    "x2": int(min(w, (x + fw) * inv)),
                    "y2": int(min(h, (y + fh) * inv)),
                },
                "confidence": round(confidence, 4),
                "landmarks": {
                    "right_eye": (float(face[4]) * inv, float(face[5]) * inv),
                    "left_eye": (float(face[6]) * inv, float(face[7]) * inv),
                },
                "class": 0,
            })

        detections.sort(key=lambda d: d["confidence"], reverse=True)
        if len(detections) > MAX_FACES_PER_IMAGE:
            print(f"[WARNING] {len(detections)} faces detected, capping to {MAX_FACES_PER_IMAGE}.")
            detections = detections[:MAX_FACES_PER_IMAGE]
        return detections
