# -*- coding: utf-8 -*-
"""Read-only runtime check: GET /health on the running AI service (no writes)."""
import json
import time
from pathlib import Path

import httpx

OUT = Path(__file__).resolve().parent.parent / "runtime_check.json"
r = httpx.get("http://127.0.0.1:8001/health", timeout=10)
data = {
    "checked_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    "status_code": r.status_code,
    "body": r.json(),
}
OUT.write_text(json.dumps(data, indent=2), encoding="utf-8")
print(json.dumps(data, indent=2))
