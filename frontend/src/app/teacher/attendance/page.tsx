"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import api from "@/lib/api";
import type { RecognitionResult, Schedule } from "@/types";
import { Camera, CameraOff, AlertCircle, Plus, X } from "lucide-react";

interface Session {
  id: number;
  date: string;
  start_time: string;
  status: string;
  schedule?: { id: number; subject?: { name: string }; class?: { name: string } };
}

export default function TeacherAttendancePage() {
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [results, setResults] = useState<RecognitionResult[]>([]);
  const [stats, setStats] = useState({ detected: 0, recorded: 0, alreadyRecorded: 0, unknown: 0 });
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [createForm, setCreateForm] = useState({ schedule_id: "", date: "", start_time: "" });
  const [creating, setCreating] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [recognizeError, setRecognizeError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const recognizingRef = useRef(false);

  const fetchSessions = () => {
    api.get("/attendance/sessions", { params: { status: "active", per_page: 50 } })
      .then((res) => {
        const data = res.data.data.data || res.data.data;
        setSessions(Array.isArray(data) ? data : []);
        setLoadError(null);
      })
      .catch(() => {
        setLoadError("Gagal memuat sesi absensi. Coba muat ulang halaman.");
      });
  };

  useEffect(() => {
    fetchSessions();
    api.get("/schedules", { params: { per_page: 100 } })
      .then((res) => {
        const data = res.data.data.data || res.data.data;
        setSchedules(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        setLoadError("Gagal memuat daftar jadwal.");
      });
  }, []);

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await api.post("/attendance/sessions", createForm);
      const newSession = res.data.data;
      setSessions((prev) => [newSession, ...prev]);
      setSelectedSessionId(newSession.id);
      setShowCreateForm(false);
      setCreateForm({ schedule_id: "", date: "", start_time: "" });
    } catch {
      alert("Gagal membuat sesi absensi.");
    } finally {
      setCreating(false);
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsCameraActive(true);
    } catch (err) {
      const msg = err instanceof DOMException && err.name === "NotAllowedError"
        ? "Izin kamera ditolak. Berikan izin kamera di browser."
        : "Kamera tidak dapat diakses. Pastikan kamera tersedia.";
      alert(msg);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setResults([]);
    setIsCameraActive(false);
  };

  const captureAndRecognize = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !selectedSessionId) return;
    if (recognizingRef.current) return;

    const video = videoRef.current;
    if (video.readyState < 2) return;

    // Capture on an offscreen canvas: the visible overlay canvas must never
    // hold a video snapshot, otherwise the live preview freezes for the whole
    // duration of the recognition request (the reported "lagging frames").
    const captureCanvas = captureCanvasRef.current;
    if (!captureCanvas) return;
    captureCanvas.width = video.videoWidth;
    captureCanvas.height = video.videoHeight;
    const ctx = captureCanvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    captureCanvas.toBlob(async (blob) => {
      if (!blob) return;
      recognizingRef.current = true;

      const formData = new FormData();
      formData.append("image", blob, "frame.jpg");
      formData.append("attendance_session_id", String(selectedSessionId));

      try {
        const res = await api.post("/attendance/recognize", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });

        const data = res.data;
        setResults(data.faces || []);
        setRecognizeError(null);

        const newStats = {
          detected: data.faces?.length || 0,
          recorded: data.faces?.filter((f: RecognitionResult) => f.status === "recorded").length || 0,
          alreadyRecorded: data.faces?.filter((f: RecognitionResult) => f.status === "already_recorded").length || 0,
          unknown: data.faces?.filter((f: RecognitionResult) => f.status === "unknown").length || 0,
        };
        setStats(newStats);
      } catch {
        setRecognizeError("Gagal memproses frame. Periksa koneksi ke server / layanan AI.");
      } finally {
        recognizingRef.current = false;
      }
    }, "image/jpeg", 0.8);
  }, [selectedSessionId]);

  useEffect(() => {
    if (isCameraActive && selectedSessionId) {
      intervalRef.current = setInterval(captureAndRecognize, 2000);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isCameraActive, captureAndRecognize, selectedSessionId]);

  useEffect(() => {
    return () => { stopCamera(); };
  }, []);

  const drawBoundingBoxes = useCallback(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Raster the overlay at the element's displayed size (device-pixel aware),
    // so 1 bitmap px maps to 1 screen px regardless of the camera resolution.
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.clearRect(0, 0, w, h);

    const video = videoRef.current;
    if (!video || !video.videoWidth || results.length === 0) return;

    // Replicate the <video> object-fit: cover mapping (scale to cover the box,
    // crop centered) so bbox coords land exactly on the face in the preview.
    const scale = Math.max(w / video.videoWidth, h / video.videoHeight);
    const ox = (w - video.videoWidth * scale) / 2;
    const oy = (h - video.videoHeight * scale) / 2;

    results.forEach((face) => {
      const { bbox } = face;
      const x1 = bbox.x1 * scale + ox;
      const y1 = bbox.y1 * scale + oy;
      const x2 = bbox.x2 * scale + ox;
      const y2 = bbox.y2 * scale + oy;
      const k = scale * dpr;

      ctx.strokeStyle = face.matched ? "#22c55e" : "#ef4444";
      ctx.lineWidth = Math.max(1.5, 2 * k);
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

      ctx.fillStyle = face.matched ? "#22c55e" : "#ef4444";
      ctx.fillRect(x1, y1 - 24 * k, x2 - x1, 24 * k);

      ctx.fillStyle = "#fff";
      ctx.font = `${12 * k}px sans-serif`;
      ctx.fillText(face.matched ? face.student_name || "Unknown" : "Unknown", x1 + 4 * k, y1 - 6 * k);
    });
  }, [results]);

  useEffect(() => { drawBoundingBoxes(); }, [drawBoundingBoxes]);

  // Keep boxes aligned when the preview box resizes (window resize/zoom).
  useEffect(() => {
    window.addEventListener("resize", drawBoundingBoxes);
    return () => window.removeEventListener("resize", drawBoundingBoxes);
  }, [drawBoundingBoxes]);

  const canStartCamera = selectedSessionId !== null;

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Absensi Face Recognition</h1>
          <Button size="sm" onClick={() => setShowCreateForm(!showCreateForm)}>
            {showCreateForm ? <X className="mr-1.5 h-4 w-4" /> : <Plus className="mr-1.5 h-4 w-4" />}
            {showCreateForm ? "Batal" : "Buat Sesi"}
          </Button>
        </div>

        {loadError && (
          <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle className="h-4 w-4" />
            {loadError}
          </div>
        )}

        {showCreateForm && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Buat Sesi Absensi Baru</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateSession} className="grid gap-3 sm:grid-cols-3">
                <select
                  className="rounded-md border bg-white px-3 py-2 text-sm"
                  value={createForm.schedule_id}
                  onChange={(e) => setCreateForm({ ...createForm, schedule_id: e.target.value })}
                  required
                >
                  <option value="">Pilih Jadwal</option>
                  {schedules.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.subject?.name} - {s.class?.name} ({s.day} {s.start_time})
                    </option>
                  ))}
                </select>
                <Input
                  type="date"
                  value={createForm.date}
                  onChange={(e) => setCreateForm({ ...createForm, date: e.target.value })}
                  required
                />
                <div className="flex gap-2">
                  <Input
                    type="time"
                    value={createForm.start_time}
                    onChange={(e) => setCreateForm({ ...createForm, start_time: e.target.value })}
                    required
                  />
                  <Button type="submit" disabled={creating}>
                    {creating ? "Membuat..." : "Simpan"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Pilih Sesi Absensi</CardTitle>
          </CardHeader>
          <CardContent>
            {sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <Camera className="mb-2 h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Tidak ada sesi absensi aktif.</p>
                <p className="text-xs text-muted-foreground">Klik &quot;Buat Sesi&quot; untuk memulai.</p>
              </div>
            ) : (
              <select
                className="w-full rounded-md border bg-white px-3 py-2 text-sm"
                value={selectedSessionId ?? ""}
                onChange={(e) => {
                  const val = Number(e.target.value) || null;
                  if (isCameraActive && val !== selectedSessionId) stopCamera();
                  setSelectedSessionId(val);
                  setResults([]);
                  setStats({ detected: 0, recorded: 0, alreadyRecorded: 0, unknown: 0 });
                }}
              >
                <option value="">-- Pilih Sesi --</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.schedule?.subject?.name} - {s.schedule?.class?.name} ({s.date})
                  </option>
                ))}
              </select>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm">Camera Preview</CardTitle>
                <div className="flex gap-2">
                  {!isCameraActive ? (
                    <Button onClick={startCamera} disabled={!canStartCamera} size="sm">
                      <Camera className="mr-1.5 h-4 w-4" />
                      Mulai Kamera
                    </Button>
                  ) : (
                    <Button onClick={stopCamera} variant="destructive" size="sm">
                      <CameraOff className="mr-1.5 h-4 w-4" />
                      Hentikan
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
                  <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
                  <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
                  <canvas ref={captureCanvasRef} className="hidden" />
                  {!isCameraActive && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center text-white">
                        <Camera className="mx-auto h-10 w-10 opacity-40 sm:h-12 sm:w-12" />
                        <p className="mt-2 text-sm">
                          {!canStartCamera ? "Pilih sesi absensi terlebih dahulu" : "Klik Mulai Kamera"}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                {recognizeError && (
                  <p className="mt-2 text-xs text-red-600">{recognizeError}</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Statistik</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Terdeteksi</span>
                  <span className="font-bold">{stats.detected}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-emerald-600">Tercatat</span>
                  <span className="font-bold text-emerald-600">{stats.recorded}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-amber-600">Sudah Tercatat</span>
                  <span className="font-bold text-amber-600">{stats.alreadyRecorded}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-red-600">Tidak Dikenali</span>
                  <span className="font-bold text-red-600">{stats.unknown}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Hasil Recognition</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-64 space-y-2 overflow-y-auto sm:max-h-96">
                  {results.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Belum ada hasil</p>
                  ) : (
                    results.map((face, i) => (
                      <div
                        key={i}
                        className={`rounded-lg p-2 text-xs ${
                          face.status === "recorded"
                            ? "bg-emerald-50 text-emerald-800"
                            : face.status === "already_recorded"
                            ? "bg-amber-50 text-amber-800"
                            : "bg-red-50 text-red-800"
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          {face.status === "unknown" && <AlertCircle className="h-3 w-3" />}
                          <span className="font-medium">{face.student_name || "Tidak Dikenali"}</span>
                        </div>
                        {face.distance != null && (
                          <div className="mt-0.5 opacity-75">Distance: {face.distance.toFixed(4)}</div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
