# -*- coding: utf-8 -*-
"""Full-scale identification test against the REAL database (558 embeddings).

- Queries: all ORIGINAL photos from ai-service/datasets/foto N-*/
- Gallery: embeddings dumped from MySQL (all_embeddings.json, see dump_all_embeddings.php)
- Enrolled set  : folders 1-7, 9, 10  -> closed-set identification
- Unknown set   : folders 11-26       -> open-set impostor test (FAR)
- Threshold sweep 0.60 .. 1.00

Requires the AI service running (AI_PORT=8001). Outputs fullscale_results.json
next to this file.
"""
import json, os, time, uuid
from concurrent.futures import ThreadPoolExecutor
from urllib import request as urlreq
from urllib.error import HTTPError, URLError

HERE = os.path.dirname(os.path.abspath(__file__))
DATASETS = os.path.join(os.path.dirname(HERE), "datasets")
AI_BASE = "http://localhost:8001"
DUMP = os.path.join(HERE, "all_embeddings.json")
OUT = os.path.join(HERE, "fullscale_results.json")

ENROLLED = [1, 2, 3, 4, 5, 6, 7, 9, 10]   # students with DB embeddings
UNKNOWN = list(range(11, 27))             # folders never enrolled

def d(x):
    return float(x)

def dist(a, b):
    return sum((x - y) ** 2 for x, y in zip(a, b)) ** 0.5

# ---------- load gallery ----------
with open(DUMP, "r", encoding="utf-8") as f:
    rows = json.load(f)
gallery = {}  # sid -> [emb, ...]
for r in rows:
    gallery.setdefault(int(r["student_id"]), []).append([d(v) for v in r["embedding"]])
n_cand = sum(len(v) for v in gallery.values())
print(f"[gallery] students={len(gallery)} candidates={n_cand}", flush=True)

flat = [(sid, e) for sid, es in gallery.items() for e in es]

# ---------- multipart POST ----------
def post_embedding(img_path, timeout=180):
    boundary = "----eval" + uuid.uuid4().hex
    with open(img_path, "rb") as f:
        data = f.read()
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="image"; filename="{os.path.basename(img_path)}"\r\n'
        f"Content-Type: application/octet-stream\r\n\r\n"
    ).encode("utf-8") + data + f"\r\n--{boundary}--\r\n".encode("utf-8")
    req = urlreq.Request(
        AI_BASE + "/embedding",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    try:
        with urlreq.urlopen(req, timeout=timeout) as res:
            js = json.loads(res.read().decode("utf-8"))
            return ("ok", js["embedding"])
    except HTTPError as e:
        try:
            detail = json.loads(e.read().decode("utf-8")).get("detail", "")
        except Exception:
            detail = e.code
        return (f"http{e.code}:{detail}", None)
    except (URLError, OSError, TimeoutError) as e:
        return (f"net:{e}", None)

# ---------- collect files (recursive: Drive layout foto N-xxx/foto N/*.jpg) ----------
def folder_files(sid):
    root = os.path.join(DATASETS, f"foto {sid}")
    if not os.path.isdir(root):
        for name in os.listdir(DATASETS):
            if name.startswith(f"foto {sid}-"):
                root = os.path.join(DATASETS, name)
                break
    if not os.path.isdir(root):
        return []
    exts = (".jpg", ".jpeg", ".png", ".webp")
    out = []
    for dirpath, _dirs, files in os.walk(root):
        for x in sorted(files):
            if x.lower().endswith(exts):
                out.append(os.path.join(dirpath, x))
    return out

queries = []  # (sid, path)
for sid in ENROLLED + UNKNOWN:
    for p in folder_files(sid):
        queries.append((sid, p))
print(f"[queries] {len(queries)} photos", flush=True)

# ---------- embed all (parallel, 6 workers) ----------
results = [None] * len(queries)
t0 = time.time()

def work(i):
    sid, p = queries[i]
    tag, emb = post_embedding(p)
    return i, sid, p, tag, emb

with ThreadPoolExecutor(max_workers=6) as ex:
    for i, sid, p, tag, emb in ex.map(work, range(len(queries))):
        results[i] = (sid, p, tag, emb)
        done = i + 1
        if done % 25 == 0:
            print(f"  embedded {done}/{len(queries)} ({time.time()-t0:.0f}s)", flush=True)

fails = [(sid, p, tag) for sid, p, tag, emb in results if emb is None]
ok = [(sid, p, emb) for sid, p, tag, emb in results if emb is not None]
print(f"[embed] ok={len(ok)} fail={len(fails)} in {time.time()-t0:.0f}s", flush=True)
for sid, p, tag in fails:
    print(f"  FAIL s{sid} {os.path.basename(p)}: {tag[:110]}")

# ---------- per-query match ----------
def match(emb):
    best = (1e9, None)
    for sid, e in flat:
        dd = dist(emb, e)
        if dd < best[0]:
            best = (dd, sid)
    return best

# enrolled: correct-match + distances; unknown: best impostor distance
enr, unk = [], []
for sid, p, emb in ok:
    dmin, smin = match(emb)
    rec = {"sid": sid, "file": os.path.basename(p), "dmin": round(dmin, 4), "pred": smin}
    if sid in ENROLLED:
        ds = [dist(emb, e) for e in gallery[sid]]
        do = [dist(emb, e) for s2, e in flat if s2 != sid]
        rec.update(d_same=round(min(ds), 4), d_other=round(min(do), 4),
                   correct=(smin == sid), pred_ok=(smin == sid))
        enr.append(rec)
    else:
        unk.append(rec)

# ---------- threshold sweep ----------
sweep = []
t = 0.60
while t <= 1.001:
    acc_enr = sum(1 for r in enr if r["dmin"] <= t and r["correct"])
    acc_unk = sum(1 for r in unk if r["dmin"] <= t)
    sweep.append({
        "thr": round(t, 2),
        "enr_accept": acc_enr, "enr_total": len(enr),
        "tar": round(100 * acc_enr / max(len(enr), 1), 2),
        "far": round(100 * acc_unk / max(len(unk), 1), 2),
        "unk_accept": acc_unk, "unk_total": len(unk),
    })
    t += 0.05

# ---------- per-student summary (enrolled) ----------
per_enr = {}
for sid in ENROLLED:
    rs = [r for r in enr if r["sid"] == sid]
    if not rs:
        per_enr[sid] = {"n": 0}
        continue
    per_enr[sid] = {
        "n": len(rs),
        "correct": sum(1 for r in rs if r["correct"]),
        "top1_pct": round(100 * sum(1 for r in rs if r["correct"]) / len(rs), 1),
        "accept@0.8": sum(1 for r in rs if r["dmin"] <= 0.8),
        "d_same_mean": round(sum(r["d_same"] for r in rs) / len(rs), 3),
        "d_other_mean": round(sum(r["d_other"] for r in rs) / len(rs), 3),
        "worst_dmin": round(max(r["dmin"] for r in rs), 3),
    }

per_unk = {}
for sid in UNKNOWN:
    rs = [r for r in unk if r["sid"] == sid]
    if rs:
        per_unk[sid] = {
            "n": len(rs),
            "min_dmin": round(min(r["dmin"] for r in rs), 3),
            "max_dmin": round(max(r["dmin"] for r in rs), 3),
            "accept@0.8": sum(1 for r in rs if r["dmin"] <= 0.8),
        }

out = {
    "gallery": {"students": len(gallery), "candidates": n_cand},
    "queries": {"total": len(queries), "ok": len(ok), "failed": len(fails), "fail_detail": [
        {"sid": s, "file": os.path.basename(p), "reason": tag[:200]} for s, p, tag in fails]},
    "enrolled": {
        "n": len(enr),
        "top1_correct": sum(1 for r in enr if r["correct"]),
        "top1_pct": round(100 * sum(1 for r in enr if r["correct"]) / max(len(enr), 1), 2),
        "accept@0.8": sum(1 for r in enr if r["dmin"] <= 0.8),
        "d_same_mean": round(sum(r["d_same"] for r in enr) / max(len(enr), 1), 3),
        "d_other_mean": round(sum(r["d_other"] for r in enr) / max(len(enr), 1), 3),
        "per_student": per_enr,
        "misclassified": [r for r in enr if not r["correct"]],
    },
    "unknown": {
        "n": len(unk),
        "accept@0.8": sum(1 for r in unk if r["dmin"] <= 0.8),
        "far@0.8_pct": round(100 * sum(1 for r in unk if r["dmin"] <= 0.8) / max(len(unk), 1), 2),
        "dmin_mean": round(sum(r["dmin"] for r in unk) / max(len(unk), 1), 3),
        "dmin_min": round(min(r["dmin"] for r in unk), 3) if unk else None,
        "per_folder": per_unk,
        "false_accepts@0.8": [r for r in unk if r["dmin"] <= 0.8],
    },
    "sweep": sweep,
}
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(out, f, indent=1)

print(json.dumps(out["enrolled"]["per_student"], indent=1))
print("unknown:", json.dumps({k: v for k, v in out["unknown"].items() if k != "per_folder"}))
print("sweep:")
for s in sweep:
    print(f"  thr={s['thr']:.2f} TAR={s['tar']:6.2f}% ({s['enr_accept']}/{s['enr_total']})  FAR={s['far']:5.2f}% ({s['unk_accept']}/{s['unk_total']})")
print(f"[done] results -> {OUT}", flush=True)
