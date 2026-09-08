from pydantic import BaseModel
from typing import Optional


class BBox(BaseModel):
    x1: int
    y1: int
    x2: int
    y2: int


class DetectedFace(BaseModel):
    bbox: BBox
    detection_confidence: float
    student_id: Optional[int] = None
    student_name: Optional[str] = None
    distance: Optional[float] = None
    matched: bool = False


class RecognizeResponse(BaseModel):
    success: bool
    processing_time_ms: float
    faces: list[DetectedFace]


class EmbeddingRequest(BaseModel):
    student_id: int
    embeddings: list[list[float]]


class HealthResponse(BaseModel):
    status: str
    yolo_loaded: bool
    facenet_loaded: bool
    device: str
    threshold: float


class ThresholdUpdateRequest(BaseModel):
    threshold: float


class CalibrationResult(BaseModel):
    optimal_threshold: float
    eer: float
    far_at_eer: float
    frr_at_eer: float
