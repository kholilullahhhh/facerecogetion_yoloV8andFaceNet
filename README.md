****# Sistem Absensi Face Recognition

## Absensi Facerecognation yoloV8 and FaceNet

Implementasi Face Recognition menggunakan **YOLOv8s** + **FaceNet** untuk sistem absensi siswa.

## Arsitektur

```
Smartphone/Laptop Camera
        ↓
    Next.js Frontend
        ↓ REST API
    Laravel Backend
        ↓            ↓
   PostgreSQL    Python FastAPI (AI Service)
                      ↓
                 YOLOv8s (Face Detection)
                      ↓
                 Face Crop + Alignment
                      ↓
                 FaceNet (128-D Embedding)
                      ↓
                 Euclidean Distance
                      ↓
                 Threshold (EER)
                      ↓
              MATCH / UNKNOWN
```

## Tech Stack

- **Frontend**: Next.js 16, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Laravel 13, PHP 8.3, PostgreSQL
- **AI Service**: Python 3.11, FastAPI, PyTorch, Ultralytics, FaceNet
- **Models**: YOLOv8s (detection), FaceNet/InceptionResNetV1 (recognition)

## Installation

### Prerequisites

- PHP 8.3+
- Composer
- Node.js 20+
- PostgreSQL 16+
- Python 3.11+

### 1. Clone & Setup

```bash
git clone <repo-url>
cd attendance-face-recognition
```

### 2. Backend (Laravel)

```bash
cd backend
composer install
cp .env.example .env
php artisan key:generate
# Edit .env for PostgreSQL connection
php artisan migrate
php artisan db:seed
php artisan serve
```

### 3. AI Service (Python)

```bash
cd ai-service
pip install -r requirements.txt
cp .env.example .env
python main.py
```

### 4. Frontend (Next.js)

```bash
cd frontend
npm install
npm run dev
```

### 5. Docker (Optional)

```bash
docker-compose up -d
```

## Default Credentials

| Role  | Email                        | Password  |
|-------|------------------------------|-----------|
| Admin | admin@smpaisyiyah.sch.id    | password  |
| Guru  | budi@smpaisyiyah.sch.id     | password  |

## API Endpoints

### Auth
- `POST /api/login`
- `POST /api/logout`
- `GET /api/me`

### Students (Admin)
- `GET /api/admin/students`
- `POST /api/admin/students`
- `GET /api/admin/students/{id}`
- `PUT /api/admin/students/{id}`
- `DELETE /api/admin/students/{id}`

### Face Registration
- `GET /api/admin/students/{id}/embeddings`
- `POST /api/admin/students/{id}/embeddings`
- `DELETE /api/admin/students/{id}/embeddings/{embedding_id}`

### Attendance
- `POST /api/attendance/sessions`
- `GET /api/attendance/sessions`
- `POST /api/attendance/recognize`

### Dashboard
- `GET /api/dashboard/summary`
- `GET /api/dashboard/chart`

## Face Recognition Pipeline

1. **Camera** → Capture frame
2. **YOLOv8s** → Detect face bounding boxes
3. **Face Cropping** → Crop each detected face
4. **Face Alignment** → Align using landmarks/affine transform
5. **Resize** → 160×160 pixels
6. **Normalization** → Normalize pixel values
7. **FaceNet** → Generate 128-D embedding
8. **Euclidean Distance** → Compare with registered embeddings
9. **Threshold** → Match/Unknown decision
10. **Record Attendance** → Save to database

## Dataset Structure

```
datasets/
├── yolo/
│   ├── images/{train,val}/
│   ├── labels/{train,val}/
│   └── data.yaml
└── facenet/
    ├── student_001/
    ├── student_002/
    └── ...
```

## Training

### YOLOv8s Fine-Tuning

```bash
cd ai-service/training/yolo
python train.py --data ../../datasets/yolo/data.yaml --model yolov8s --epochs 50
```

### FaceNet Fine-Tuning

```bash
cd ai-service/training/facenet
python train.py --dataset ../../datasets/facenet --epochs 20
```

## License

luluuu.
