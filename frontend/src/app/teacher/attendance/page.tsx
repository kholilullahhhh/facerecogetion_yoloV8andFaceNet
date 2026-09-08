"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import type { RecognitionResult } from "@/types";
import { Camera, CameraOff, AlertCircle } from "lucide-react";

export default function TeacherAttendancePage() {
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [results, setResults] = useState<RecognitionResult[]>([]);
  const [stats, setStats] = useState({
    detected: 0,
    recorded: 0,
    alreadyRecorded: 0,
    unknown: 0,
  });
  const [sessions, setSessions] = useState<Array<{ id: number; date: string; schedule?: { subject?: { name: string }; class?: { name: string } } }>>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    api.get("/attendance/sessions", { params: { status: "active" } })
      .then((res) => {
        const data = res.data.data.data || res.data.data;
        setSessions(Array.isArray(data) ? data : []);
      })
      .catch(() => {});
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsCameraActive(true);
    } catch {
      alert("Kamera tidak dapat diakses.");
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
    setIsCameraActive(false);
  };

  const captureAndRecognize = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !selectedSessionId) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    canvas.toBlob(async (blob) => {
      if (!blob) return;

      const formData = new FormData();
      formData.append("image", blob, "frame.jpg");
      formData.append("attendance_session_id", String(selectedSessionId));

      try {
        const res = await api.post("/attendance/recognize", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });

        const data = res.data;
        setResults(data.faces || []);

        const newStats = {
          detected: data.faces?.length || 0,
          recorded: data.faces?.filter((f: RecognitionResult) => f.status === "recorded").length || 0,
          alreadyRecorded: data.faces?.filter((f: RecognitionResult) => f.status === "already_recorded").length || 0,
          unknown: data.faces?.filter((f: RecognitionResult) => f.status === "unknown").length || 0,
        };
        setStats(newStats);
      } catch {
        // AI service error
      }
    }, "image/jpeg", 0.8);
  }, [selectedSessionId]);

  useEffect(() => {
    if (isCameraActive) {
      intervalRef.current = setInterval(captureAndRecognize, 2000);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isCameraActive, captureAndRecognize]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const drawBoundingBoxes = useCallback(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    results.forEach((face) => {
      const { bbox } = face;
      ctx.strokeStyle = face.matched ? "#22c55e" : "#ef4444";
      ctx.lineWidth = 2;
      ctx.strokeRect(bbox.x1, bbox.y1, bbox.x2 - bbox.x1, bbox.y2 - bbox.y1);

      ctx.fillStyle = face.matched ? "#22c55e" : "#ef4444";
      ctx.fillRect(bbox.x1, bbox.y1 - 24, bbox.x2 - bbox.x1, 24);

      ctx.fillStyle = "#fff";
      ctx.font = "12px sans-serif";
      const label = face.matched ? face.student_name : "Unknown";
      ctx.fillText(label || "Unknown", bbox.x1 + 4, bbox.y1 - 6);
    });
  }, [results]);

  useEffect(() => {
    drawBoundingBoxes();
  }, [drawBoundingBoxes]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Absensi Face Recognition</h1>

        <Card>
          <CardHeader>
            <CardTitle>Pilih Sesi Absensi</CardTitle>
          </CardHeader>
          <CardContent>
            {sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Tidak ada sesi absensi aktif. Buat sesi terlebih dahulu.</p>
            ) : (
              <select
                className="w-full rounded-md border bg-white px-3 py-2 text-sm"
                value={selectedSessionId ?? ""}
                onChange={(e) => setSelectedSessionId(Number(e.target.value) || null)}
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

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Camera Preview</span>
                  <div className="flex gap-2">
                    {!isCameraActive ? (
                      <Button onClick={startCamera} disabled={!selectedSessionId}>
                        <Camera className="mr-2 h-4 w-4" />
                        Mulai Kamera
                      </Button>
                    ) : (
                      <Button onClick={stopCamera} variant="destructive">
                        <CameraOff className="mr-2 h-4 w-4" />
                        Hentikan
                      </Button>
                    )}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="h-full w-full object-cover"
                  />
                  <canvas
                    ref={canvasRef}
                    className="absolute inset-0 h-full w-full"
                  />
                  {!isCameraActive && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center text-white">
                        <Camera className="mx-auto h-12 w-12 opacity-50" />
                        <p className="mt-2">Klik &quot;Mulai Kamera&quot; untuk memulai</p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Statistik</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span>Terdeteksi:</span>
                  <span className="font-bold">{stats.detected}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-green-600">Tercatat:</span>
                  <span className="font-bold text-green-600">{stats.recorded}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-yellow-600">Sudah Tercatat:</span>
                  <span className="font-bold text-yellow-600">{stats.alreadyRecorded}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-red-600">Tidak Dikenali:</span>
                  <span className="font-bold text-red-600">{stats.unknown}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Hasil Recognition</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-96 space-y-2 overflow-y-auto">
                  {results.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Belum ada hasil recognition
                    </p>
                  ) : (
                    results.map((face, i) => (
                      <div
                        key={i}
                        className={`rounded-lg p-3 text-sm ${
                          face.status === "recorded"
                            ? "bg-green-50 text-green-800"
                            : face.status === "already_recorded"
                            ? "bg-yellow-50 text-yellow-800"
                            : "bg-red-50 text-red-800"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {face.status === "unknown" && (
                            <AlertCircle className="h-4 w-4" />
                          )}
                          <span className="font-medium">
                            {face.student_name || "Tidak Dikenali"}
                          </span>
                        </div>
                        {face.distance && (
                          <div className="mt-1 text-xs opacity-75">
                            Distance: {face.distance.toFixed(4)}
                          </div>
                        )}
                        <div className="mt-1 text-xs opacity-75">
                          Status:{" "}
                          {face.status === "recorded"
                            ? "Hadir"
                            : face.status === "already_recorded"
                            ? "Sudah Tercatat"
                            : "Tidak Dikenali"}
                        </div>
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
