import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent

AI_PORT = int(os.getenv("AI_PORT", "8000"))
YOLO_MODEL_PATH = os.getenv("YOLO_MODEL_PATH", str(BASE_DIR / "yolov8s.pt"))
FACENET_MODEL_PATH = os.getenv("FACENET_MODEL_PATH", str(BASE_DIR / "weights" / "facenet_model.pth"))
FACE_MATCH_THRESHOLD = float(os.getenv("FACE_MATCH_THRESHOLD", "0.8"))
DEVICE = os.getenv("DEVICE", "cpu")
CORS_ORIGINS = os.getenv('CORS_ORIGINS', '["http://localhost:3000"]')

FACE_CROP_SIZE = 160
FACE_CONFIDENCE_THRESHOLD = 0.5
MAX_FACES_PER_IMAGE = 10
EMBEDDING_DIMENSION = 128
