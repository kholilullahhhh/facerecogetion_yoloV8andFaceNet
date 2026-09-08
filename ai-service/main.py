import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from config import AI_PORT, CORS_ORIGINS
from app.api.routes import router
from app.api.routes import recognition_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[INFO] Starting AI Service...")
    recognition_service.load_models()
    yield
    print("[INFO] Shutting down AI Service...")


app = FastAPI(
    title="Face Recognition AI Service",
    description="YOLOv8s + FaceNet for attendance system",
    version="1.0.0",
    lifespan=lifespan,
)

try:
    origins = json.loads(CORS_ORIGINS) if isinstance(CORS_ORIGINS, str) else CORS_ORIGINS
except Exception:
    origins = ["http://localhost:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="")


@app.get("/")
async def root():
    return {
        "service": "Face Recognition AI Service",
        "status": "running",
        "version": "1.0.0",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=AI_PORT, reload=True)
