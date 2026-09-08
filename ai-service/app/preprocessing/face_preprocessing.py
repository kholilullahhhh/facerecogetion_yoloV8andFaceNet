import cv2
import numpy as np
from PIL import Image

FACE_CROP_SIZE = 160


def align_face(image: np.ndarray, landmarks: np.ndarray | None = None) -> np.ndarray:
    h, w = image.shape[:2]
    if h == 0 or w == 0:
        return image

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
    face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    faces = face_cascade.detectMultiScale(gray, 1.1, 4)

    if len(faces) == 0:
        return image

    x, y, fw, fh = faces[0]
    center_x = x + fw // 2
    center_y = y + fh // 2

    eyes_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_eye.xml")
    eyes = eyes_cascade.detectMultiScale(gray[y:y+fh, x:x+fw])

    angle = 0.0
    if len(eyes) >= 2:
        eye1 = (eyes[0][0] + eyes[0][2] // 2, eyes[0][1] + eyes[0][3] // 2)
        eye2 = (eyes[1][0] + eyes[1][2] // 2, eyes[1][1] + eyes[1][3] // 2)
        if eye1[0] > eye2[0]:
            eye1, eye2 = eye2, eye1
        angle = np.degrees(np.arctan2(eye2[1] - eye1[1], eye2[0] - eye1[0]))

    if abs(angle) > 0.5:
        M = cv2.getRotationMatrix2D((center_x, center_y), angle, 1.0)
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


def preprocess_face(image: np.ndarray, bbox: dict) -> np.ndarray:
    face = crop_face(image, bbox)
    face = align_face(face)
    face = resize_face(face, FACE_CROP_SIZE)
    face = normalize_face(face)
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
    laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    if laplacian_var < 50:
        result["issues"].append("blurry")

    return result


def augment_face(face: np.ndarray) -> list[np.ndarray]:
    augmented = [face]

    h, w = face.shape[:2]
    center = (w // 2, h // 2)

    M_pos = cv2.getRotationMatrix2D(center, 10, 1.0)
    augmented.append(cv2.warpAffine(face, M_pos, (w, h)))

    M_neg = cv2.getRotationMatrix2D(center, -10, 1.0)
    augmented.append(cv2.warpAffine(face, M_neg, (w, h)))

    bright = cv2.convertScaleAbs(face, alpha=1.15, beta=15)
    augmented.append(bright)

    dark = cv2.convertScaleAbs(face, alpha=0.85, beta=-15)
    augmented.append(dark)

    flipped = cv2.flip(face, 1)
    augmented.append(flipped)

    return augmented
