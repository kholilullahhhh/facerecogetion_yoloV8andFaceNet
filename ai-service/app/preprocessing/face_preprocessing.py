import cv2
import numpy as np
from functools import lru_cache

FACE_CROP_SIZE = 160


@lru_cache(maxsize=1)
def _haar_frontal_cascade():
    """Frontal-face cascade, or None when cv2 build lacks it (cv2>=5 removed CascadeClassifier)."""
    if not hasattr(cv2, "CascadeClassifier"):
        print("[WARNING] cv2 build (>=5.0) has no CascadeClassifier; eye alignment disabled.")
        return None
    clf = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    if clf.empty():
        print("[WARNING] Haar frontal-face cascade unavailable; eye alignment disabled.")
        return None
    return clf


def align_face(image: np.ndarray, landmarks: dict | None = None) -> np.ndarray:
    """Level the eyes by rotating the crop. `landmarks` holds eye points in the
    crop's own coordinate space. Without landmarks, falls back to Haar eye
    detection (unavailable on cv2>=5, where cascades were removed).
    """
    h, w = image.shape[:2]
    if h == 0 or w == 0:
        return image

    angle = 0.0
    center = (w / 2.0, h / 2.0)

    right_eye = landmarks.get("right_eye") if landmarks else None
    left_eye = landmarks.get("left_eye") if landmarks else None
    if right_eye and left_eye:
        ea, eb = (right_eye, left_eye) if right_eye[0] <= left_eye[0] else (left_eye, right_eye)
        angle = float(np.degrees(np.arctan2(eb[1] - ea[1], eb[0] - ea[0])))
        center = ((ea[0] + eb[0]) / 2.0, (ea[1] + eb[1]) / 2.0)
    else:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
        face_cascade = _haar_frontal_cascade()
        if face_cascade is None:
            return image
        faces = face_cascade.detectMultiScale(gray, 1.1, 4)
        if len(faces) == 0:
            return image

        x, y, fw, fh = faces[0]
        center = (x + fw // 2, y + fh // 2)

        eyes_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_eye.xml")
        eyes = eyes_cascade.detectMultiScale(gray[y:y+fh, x:x+fw])
        if len(eyes) < 2:
            return image

        eye1 = (eyes[0][0] + eyes[0][2] // 2, eyes[0][1] + eyes[0][3] // 2)
        eye2 = (eyes[1][0] + eyes[1][2] // 2, eyes[1][1] + eyes[1][3] // 2)
        if eye1[0] > eye2[0]:
            eye1, eye2 = eye2, eye1
        angle = np.degrees(np.arctan2(eye2[1] - eye1[1], eye2[0] - eye1[0]))

    if abs(angle) > 0.5:
        M = cv2.getRotationMatrix2D(center, angle, 1.0)
        image = cv2.warpAffine(image, M, (w, h), flags=cv2.INTER_CUBIC)

    return image


def crop_face(image: np.ndarray, bbox: dict) -> np.ndarray:
    x1 = max(0, bbox["x1"])
    y1 = max(0, bbox["y1"])
    x2 = min(image.shape[1], bbox["x2"])
    y2 = min(image.shape[0], bbox["y2"])

    if x2 <= x1 or y2 <= y1:
        return np.zeros((FACE_CROP_SIZE, FACE_CROP_SIZE, 3), dtype=np.uint8)

    face_crop = image[y1:y2, x1:x2]
    return face_crop


def resize_face(face: np.ndarray, size: int = FACE_CROP_SIZE) -> np.ndarray:
    return cv2.resize(face, (size, size), interpolation=cv2.INTER_LANCZOS4)


def normalize_face(face: np.ndarray) -> np.ndarray:
    face = face.astype(np.float32)
    face = (face - 127.5) / 128.0
    return face


def preprocess_face(image: np.ndarray, bbox: dict, landmarks: dict | None = None) -> np.ndarray:
    """Crop -> align -> resize. Returns a uint8 160x160 BGR crop.
    Normalisation to [-1,1] is done once inside FaceNetService.generate_embedding.
    `landmarks` (optional) are detector landmarks in FULL-image coordinates and
    are translated into crop-local coordinates before alignment.
    """
    face = crop_face(image, bbox)
    if landmarks and "right_eye" in landmarks and "left_eye" in landmarks:
        x1 = max(0, bbox["x1"])
        y1 = max(0, bbox["y1"])
        local = {
            "right_eye": (landmarks["right_eye"][0] - x1, landmarks["right_eye"][1] - y1),
            "left_eye": (landmarks["left_eye"][0] - x1, landmarks["left_eye"][1] - y1),
        }
        face = align_face(face, local)
    else:
        face = align_face(face)
    face = resize_face(face, FACE_CROP_SIZE)
    return face


def validate_face_image(face: np.ndarray) -> dict:
    result = {"valid": True, "issues": []}

    if face is None or face.size == 0:
        result["valid"] = False
        result["issues"].append("empty_image")
        return result

    h, w = face.shape[:2]
    if h < 20 or w < 20:
        result["valid"] = False
        result["issues"].append("face_too_small")

    gray = cv2.cvtColor(face, cv2.COLOR_BGR2GRAY) if len(face.shape) == 3 else face
    laplacian_var = cv2.Laplacian(gray.astype(np.float64), cv2.CV_64F).var()
    if laplacian_var < 50:
        result["issues"].append("blurry")

    return result


def augment_face(face: np.ndarray) -> list[np.ndarray]:
    """Augment a uint8 don crop (0..255)."""
    augmented = [face]

    h, w = face.shape[:2]
    center = (w // 2, h // 2)

    M_pos = cv2.getRotationMatrix2D(center, 10, 1.0)
    augmented.append(cv2.warpAffine(face, M_pos, (w, h)))

    M_neg = cv2.getRotationMatrix2D(center, -10, 1.0)
    augmented.append(cv2.warpAffine(face, M_neg, (w, h)))

    f = face.astype(np.float32)
    bright = np.clip(f * 1.15, 0, 255).astype(np.uint8)
    augmented.append(bright)

    dark = np.clip(f * 0.85, 0, 255).astype(np.uint8)
    augmented.append(dark)

    flipped = cv2.flip(face, 1)
    augmented.append(flipped)

    return augmented
