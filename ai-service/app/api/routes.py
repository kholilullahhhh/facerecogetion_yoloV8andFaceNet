import io
import json
import time
import numpy as np
import cv2
from fastapi import APIRouter, UploadFile, File, HTTPException
from typing import Optional

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from app.models.schemas import (
    RecognizeResponse,
    HealthResponse,
    ThresholdUpdateRequest,
    CalibrationResult,
)
from app.services.recognition_service import RecognitionService
from app.preprocessing.face_preprocessing import preprocess_face, validate_face_image
from app.utils.calibration import calculate_eer, generate_calibration_pairs

router = APIRouter()

recognition_service = RecognitionService()


@router.get("/health", response_model=HealthResponse)
async def health_check():
    return HealthResponse(
        status="healthy" if recognition_service.yolo.loaded and recognition_service.facenet.loaded else "degraded",
        yolo_loaded=recognition_service.yolo.loaded,
        facenet_loaded=recognition_service.facenet.loaded,
        device=sys.modules["config"].DEVICE,
        threshold=recognition_service.threshold,
    )


@router.post("/detect")
async def detect_faces(image: UploadFile = File(...)):
    start = time.time()
    image_bytes = await image.read()
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="Invalid image")

    detections = recognition_service.yolo.detect_faces(img)
    elapsed = round((time.time() - start) * 1000, 2)

    return {
        "success": True,
        "processing_time_ms": elapsed,
        "faces_detected": len(detections),
        "faces": detections,
    }


@router.post("/embedding")
async def generate_embedding(image: UploadFile = File(...)):
    start = time.time()
    image_bytes = await image.read()
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="Invalid image")

    detections = recognition_service.yolo.detect_faces(img)
    if len(detections) == 0:
        raise HTTPException(status_code=400, detail="No face detected in image")
    if len(detections) > 1:
        raise HTTPException(status_code=400, detail="Multiple faces detected. Upload image with single face.")

    face = preprocess_face(img, detections[0]["bbox"])
    validation = validate_face_image(face)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=f"Face validation failed: {validation['issues']}")

    embedding = recognition_service.generate_face_embedding(face)
    elapsed = round((time.time() - start) * 1000, 2)

    return {
        "success": True,
        "processing_time_ms": elapsed,
        "embedding": embedding.tolist() if embedding is not None else None,
        "dimension": len(embedding) if embedding is not None else 0,
    }


@router.post("/register-face")
async def register_face(image: UploadFile = File(...), augment: bool = True):
    start = time.time()
    image_bytes = await image.read()
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="Invalid image")

    detections = recognition_service.yolo.detect_faces(img)
    if len(detections) == 0:
        raise HTTPException(status_code=400, detail="No face detected")
    if len(detections) > 1:
        raise HTTPException(status_code=400, detail="Multiple faces detected")

    face = preprocess_face(img, detections[0]["bbox"])
    embeddings = recognition_service.register_face(face, augment=augment)
    elapsed = round((time.time() - start) * 1000, 2)

    return {
        "success": True,
        "processing_time_ms": elapsed,
        "embeddings_count": len(embeddings),
        "embeddings": embeddings,
    }


@router.post("/recognize")
async def recognize_faces(
    image: UploadFile = File(...),
    embeddings_json: Optional[str] = None,
):
    start = time.time()
    image_bytes = await image.read()
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="Invalid image")

    registered_embeddings = []
    if embeddings_json:
        try:
            registered_embeddings = json.loads(embeddings_json)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid embeddings JSON")

    result = recognition_service.recognize_faces(img, registered_embeddings)
    elapsed = round((time.time() - start) * 1000, 2)
    result["processing_time_ms"] = elapsed

    return result


@router.put("/threshold")
async def update_threshold(request: ThresholdUpdateRequest):
    if not 0.0 <= request.threshold <= 2.0:
        raise HTTPException(status_code=400, detail="Threshold must be between 0.0 and 2.0")

    recognition_service.update_threshold(request.threshold)
    return {
        "success": True,
        "threshold": recognition_service.threshold,
    }


@router.post("/calibrate")
async def calibrate_threshold(data: dict):
    embeddings_by_student = data.get("embeddings_by_student", {})
    if not embeddings_by_student:
        raise HTTPException(status_code=400, detail="No embedding data provided")

    try:
        genuine_distances, impostor_distances = generate_calibration_pairs(embeddings_by_student)
        if not genuine_distances or not impostor_distances:
            raise HTTPException(status_code=400, detail="Insufficient data for calibration")

        result = calculate_eer(genuine_distances, impostor_distances)
        recognition_service.update_threshold(result["optimal_threshold"])

        return {
            "success": True,
            "result": result,
            "genuine_pairs_count": len(genuine_distances),
            "impostor_pairs_count": len(impostor_distances),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Calibration failed: {str(e)}")
