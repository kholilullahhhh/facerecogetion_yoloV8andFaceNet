# AGENTS.md

## Project Structure

Three independently runnable services:

```
backend/     → Laravel 13, PHP 8.3, MySQL (REST API, Bearer/Sanctum auth)
ai-service/  → Python 3.11, FastAPI, YOLOv8s (detect) + FaceNet (128-D embedding)
frontend/    → Next.js 16 App Router, React 19, Tailwind 4, shadcn/ui
datasets/    → training data (yolo: images/labels train+val, facenet)
```

No root package.json — always `cd` into the service dir before running commands.

## DB Config: Three Sources Disagree

Trust none of the docs; verified state:

- **Local dev** (`backend/.env`): `DB_CONNECTION=mysql`, db `attendance_face_recognition` — this is what runs.
- **Tests** (`phpunit.xml`): forced SQLite `:memory:` — `php artisan test` never touches MySQL.
- **docker-compose.yml**: forces `pgsql`. `backend/.env.example` ships sqlite defaults + README says PostgreSQL — both stale.

Consequence: controllers always use `LIKE`, never `ilike` (PostgreSQL-only). Applies to all search logic.

## Commands

### Backend (`cd backend`)
```bash
composer install
cp .env.example .env && php artisan key:generate
php artisan migrate && php artisan db:seed   # sessions + Sanctum tables are in committed migrations
php artisan serve                            # http://localhost:8000  (or: composer run dev)
vendor/bin/pint --dirty --format agent       # REQUIRED after any PHP edit
php artisan test                             # 2 trivial ExampleTests; runs on SQLite, no MySQL needed
```

### AI Service (`cd ai-service`)
```bash
pip install -r requirements.txt
python main.py                               # http://localhost:8000 (uvicorn reload, port = AI_PORT)
curl http://localhost:8000/health            # "healthy" vs "degraded" (models missing)
```

### Frontend (`cd frontend`)
```bash
npm install
npm run dev                                  # http://localhost:3000
npm run lint                                 # 0 errors required before commit
```
**Windows PowerShell**: `npm` may be blocked by execution policy — use `cmd /c "npm ..."`.

### Ports
Backend and AI service both default to :8000 (same port, same machine). For Docker, ai-service maps to host **:8001**; inside compose they talk on `http://ai-service:8000`.

## Critical Gotchas

### Roles & Middleware
`users.role` is an enum `'ADMIN'|'GURU'` (uppercase, default GURU; AdminMiddleware compares `!== 'ADMIN'`). All CRUD resources are grouped under `Route::middleware('admin')` in `routes/api.php`.

### 419 on Login (if it reappears)
Caused by `$middleware->statefulApi()` in `bootstrap/app.php`. This app uses Bearer tokens, not cookies — do not add `statefulApi()`. (It is absent today.)

### AI Service Weights
`ai-service/weights/` is **empty** while `.env` points `YOLO_MODEL_PATH`/`FACENET_MODEL_PATH` there. Loaders fall back silently: YOLO → root `ai-service/yolov8s.pt` (pretrained), FaceNet → torchvision VGGFace2 pretrained. The service still runs ("degraded" health). Don't "fix" this by editing paths; custom weights are optional.

### AI Service Model Lifecycle
Models load once at startup via `lifespan` in `main.py`. Do NOT use deprecated `@router.on_event("startup")`. Match threshold = Euclidean distance, `FACE_MATCH_THRESHOLD=0.8` (tunable via `PUT /threshold`, calibrated via `/calibrate`).

## Frontend Patterns

All API calls go through `src/lib/api.ts` (axios): Bearer token from `localStorage['token']`; on 401 it clears token+user and hard-redirects to `/login`.
- Paginated endpoints: triple-nested `res.data.data.data` (`{ success, data: { data: [...], current_page, last_page } }`).
- Non-paginated endpoints: `res.data.data` (teacher attendance pages use `res.data.data.data || res.data.data`).
- After mutations, re-fetch via refresh counter: `const [refresh, setRefresh] = useState(0)` + `setRefresh(r => r + 1)`.
- Route areas per role: `src/app/admin/*` and `src/app/teacher/*`; login at `/login`.

## API Response Conventions

Success: `{ "success": true, "data": ... }` / Error: `{ "success": false, "message": "..." }`.

## Routes Worth Knowing

- `POST /api/login` — public, returns token; `GET /api/me` — token validation
- `POST /api/attendance/sessions` — create session for a schedule (then `PUT .../{session}/close`)
- `POST /api/attendance/recognize` — backend multipart-posts `image` + `embeddings_json` (all class embeddings) to AI `/recognize`, records attendance; returns 503 if AI service is down
- `POST /api/admin/students/{id}/embeddings` — face registration (multipart `images[]`)

## Existing Instruction Files

- `backend/AGENTS.md` (= `backend/CLAUDE.md`) — Laravel Boost guidelines: prefer Boost MCP tools (`backend/opencode.json` wires `php artisan boost:mcp`), skills under `backend/.agents/skills/`, PHPUnit × Pint rules.
- `frontend/AGENTS.md` — auto-generated Next.js 16 warning: this Next differs from training data; read guides in `frontend/node_modules/next/dist/docs/` before writing frontend code.
- `README.md` — pipeline/endpoints overview, but its PostgreSQL instructions are stale.

## Testing Checklist

After any change:
1. `npm run lint` (frontend) — 0 errors
2. `php artisan test` (backend) — pass
3. `vendor/bin/pint --dirty --format agent` (backend) — after PHP edits
