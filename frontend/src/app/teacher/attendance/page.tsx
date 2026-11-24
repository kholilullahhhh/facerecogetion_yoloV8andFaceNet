"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import axios from "axios";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import api from "@/lib/api";
import {
  ATTENDANCE_STATUSES, STATUS_META, formatDate, formatDateTime,
} from "@/lib/attendance-status";
import type {
  AttendanceHistoryEntry, AttendanceStatus, BBox, RecognitionResult, Schedule, SessionStudent,
} from "@/types";
import type { FaceDetector } from "@mediapipe/tasks-vision";
import {
  Camera, CameraOff, AlertCircle, Plus, X, MoreHorizontal, Pencil, Eye, History,
  LockKeyhole, Search,
} from "lucide-react";

// MediaPipe tracks faces in the browser at camera framerate; the server's
// YOLO+FaceNet pass only supplies identity/attendance every couple of seconds.
// If MediaPipe cannot load, the browser falls back to the lightweight server
// detector, with interpolation between its slower results.
const MEDIAPIPE_WASM_PATH = "/mediapipe/wasm";
const MEDIAPIPE_MODEL_PATH = "/mediapipe/blaze_face_short_range.tflite";
const MEDIAPIPE_MIN_SCORE = 0.5;
const CLIENT_SMOOTHING_TAU_MS = 35;
const CLIENT_TRACK_TTL_MS = 350;
const CLIENT_TRACK_FADE_MS = 120;
const CAPTURE_MAX_SIDE = 640;
const DETECT_INTERVAL_MS = 180;
const RECOGNIZE_INTERVAL_MS = 2000;
const DETECT_JPEG_QUALITY = 0.6;
const RECOGNIZE_JPEG_QUALITY = 0.8;
const TRACK_TTL_MS = 1500;
const TRACK_FADE_MS = 220;
const SMOOTHING_TAU_MS = 90;
const IDENTITY_TTL_MS = 6000;
const MATCH_IOU = 0.15;
const MATCH_CENTER_DISTANCE = 0.2;
const TRACK_CENTER_DISTANCE = 0.22;

const MANUAL_STATUS_OPTIONS = ATTENDANCE_STATUSES;

const SOURCE_LABEL: Record<string, string> = {
  MANUAL: "Perubahan manual guru",
  FACE_RECOGNITION: "Pengenalan wajah",
  SESSION_CLOSE: "Otomatis saat sesi ditutup",
  TEACHER_BULK: "Tindakan guru",
  SYSTEM: "Sistem",
};

type StatusFilter = AttendanceStatus | "ALL" | "BELUM";

const STATUS_FILTER_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "ALL", label: "Semua" },
  { value: "HADIR", label: "Hadir" },
  { value: "ALPA", label: "Alpa" },
  { value: "IZIN", label: "Izin" },
  { value: "SAKIT", label: "Sakit" },
  { value: "BELUM", label: "Belum" },
];

interface Session {
  id: number;
  date: string;
  start_time: string;
  end_time?: string | null;
  status: string;
  schedule?: { id: number; subject?: { name: string }; class?: { name: string } };
}

interface NormalizedBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface CapturedFrame {
  blob: Blob;
  width: number;
  height: number;
}

interface TrackedFace {
  box: NormalizedBox;
  target: NormalizedBox;
  opacity: number;
  lastSeen: number;
  matched: boolean | null;
  studentName: string | null;
  status: RecognitionResult["status"] | null;
  distance: number | null;
}

interface IdentityAnchor {
  box: NormalizedBox;
  matched: boolean;
  studentName: string | null;
  status: RecognitionResult["status"];
  distance: number | null;
  capturedAt: number;
}

function normalizeBox(bbox: BBox, width: number, height: number): NormalizedBox {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  return {
    x1: bbox.x1 / w,
    y1: bbox.y1 / h,
    x2: bbox.x2 / w,
    y2: bbox.y2 / h,
  };
}

function boxIoU(a: NormalizedBox, b: NormalizedBox): number {
  const intersectionWidth = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
  const intersectionHeight = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  const intersection = intersectionWidth * intersectionHeight;
  if (intersection <= 0) return 0;

  const areaA = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1);
  const areaB = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
  const union = areaA + areaB - intersection;
  return union > 0 ? intersection / union : 0;
}

function boxCenterDistance(a: NormalizedBox, b: NormalizedBox): number {
  const dx = (a.x1 + a.x2 - b.x1 - b.x2) / 2;
  const dy = (a.y1 + a.y2 - b.y1 - b.y2) / 2;
  return Math.hypot(dx, dy);
}

function isCanceledError(error: unknown): boolean {
  return axios.isCancel(error) || (error instanceof DOMException && error.name === "AbortError");
}

function InfoItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="text-sm">{value || "-"}</div>
    </div>
  );
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
  const [detectStats, setDetectStats] = useState({ fps: 0, aiMs: 0 });
  const [clientDetectorStatus, setClientDetectorStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [roster, setRoster] = useState<SessionStudent[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [rosterNotice, setRosterNotice] = useState<string | null>(null);
  const [markingAbsent, setMarkingAbsent] = useState(false);
  const [closingSession, setClosingSession] = useState(false);
  const [rosterRefresh, setRosterRefresh] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [statusStudent, setStatusStudent] = useState<SessionStudent | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<AttendanceStatus>("HADIR");
  const [statusNotes, setStatusNotes] = useState("");
  const [statusError, setStatusError] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);
  const [detailStudent, setDetailStudent] = useState<SessionStudent | null>(null);
  const [historyStudent, setHistoryStudent] = useState<SessionStudent | null>(null);
  const [historyEntries, setHistoryEntries] = useState<AttendanceHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectCanvasRef = useRef<HTMLCanvasElement>(null);
  const recognizeCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const faceDetectorRef = useRef<FaceDetector | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const detectBusyRef = useRef(false);
  const recognizeBusyRef = useRef(false);
  const detectAbortRef = useRef<AbortController | null>(null);
  const recognizeAbortRef = useRef<AbortController | null>(null);
  const tracksRef = useRef<TrackedFace[]>([]);
  const identitiesRef = useRef<IdentityAnchor[]>([]);
  const captureSizeRef = useRef({ width: 0, height: 0 });
  const cameraActiveRef = useRef(false);
  const detectWindowRef = useRef({ responses: 0, startedAt: 0, aiMs: 0 });
  const clientWindowRef = useRef({ frames: 0, startedAt: 0, ms: 0 });
  const smoothingTauRef = useRef(SMOOTHING_TAU_MS);
  const trackTtlRef = useRef(TRACK_TTL_MS);
  const trackFadeRef = useRef(TRACK_FADE_MS);

  const fetchSessions = () => {
    api.get("/attendance/sessions", { params: { per_page: 50 } })
      .then((res) => {
        const data = res.data.data.data || res.data.data;
        const list = Array.isArray(data) ? data as Session[] : [];
        setSessions(list);
        setLoadError(null);

        const requestedId = Number(new URLSearchParams(window.location.search).get("session"));
        if (Number.isFinite(requestedId) && list.some((session) => session.id === requestedId)) {
          setSelectedSessionId((current) => current ?? requestedId);
          setRosterLoading(true);
        }
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

  // Roster for the manual attendance panel: every active student in the
  // session's class, whether or not they already have an attendance row.
  useEffect(() => {
    if (selectedSessionId === null) return;

    let cancelled = false;

    api.get(`/attendance/sessions/${selectedSessionId}/students`)
      .then((res) => {
        if (cancelled) return;
        const data = res.data.data;
        setRoster(Array.isArray(data?.students) ? data.students : []);
        setRosterError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        const message = axios.isAxiosError(error) ? error.response?.data?.message : null;
        setRosterError(message || "Gagal memuat daftar siswa sesi ini.");
      })
      .finally(() => {
        if (!cancelled) setRosterLoading(false);
      });

    return () => { cancelled = true; };
  }, [selectedSessionId, rosterRefresh]);

  const rosterCounts = useMemo(() => {
    const counts = { hadir: 0, izin: 0, sakit: 0, alpa: 0, belum: 0 };
    for (const student of roster) {
      switch (student.attendance?.status) {
        case "HADIR": counts.hadir += 1; break;
        case "IZIN": counts.izin += 1; break;
        case "SAKIT": counts.sakit += 1; break;
        case "ALPA": counts.alpa += 1; break;
        default: counts.belum += 1;
      }
    }
    return counts;
  }, [roster]);

  const visibleRoster = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return roster.filter((student) => {
      const status = student.attendance?.status ?? null;
      const matchesStatus = statusFilter === "ALL"
        || (statusFilter === "BELUM" ? status === null : status === statusFilter);
      const matchesSearch = query === ""
        || student.name.toLowerCase().includes(query)
        || student.nis.toLowerCase().includes(query)
        || (student.nisn ?? "").toLowerCase().includes(query);

      return matchesStatus && matchesSearch;
    });
  }, [roster, searchQuery, statusFilter]);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) ?? null,
    [sessions, selectedSessionId]
  );
  const sessionIsActive = selectedSession?.status === "active";

  // Load the browser-side face detector once. The WASM runtime and model are
  // served locally from /public/mediapipe (no CDN at runtime).
  useEffect(() => {
    let cancelled = false;

    const loadDetector = async () => {
      try {
        const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
        const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_PATH);

        const createDetector = (delegate: "GPU" | "CPU") =>
          FaceDetector.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MEDIAPIPE_MODEL_PATH, delegate },
            runningMode: "VIDEO",
            minDetectionConfidence: MEDIAPIPE_MIN_SCORE,
          });

        let detector: FaceDetector;
        try {
          detector = await createDetector("GPU");
        } catch {
          detector = await createDetector("CPU");
        }

        if (cancelled) {
          detector.close();
          return;
        }

        faceDetectorRef.current = detector;
        setClientDetectorStatus("ready");
      } catch {
        if (!cancelled) {
          setClientDetectorStatus("failed");
        }
      }
    };

    void loadDetector();

    return () => {
      cancelled = true;
      faceDetectorRef.current?.close();
      faceDetectorRef.current = null;
    };
  }, []);

  // Per-frame boxes need almost no smoothing and a short trail; the slower
  // server fallback keeps the longer interpolation used before.
  useEffect(() => {
    const ready = clientDetectorStatus === "ready";
    smoothingTauRef.current = ready ? CLIENT_SMOOTHING_TAU_MS : SMOOTHING_TAU_MS;
    trackTtlRef.current = ready ? CLIENT_TRACK_TTL_MS : TRACK_TTL_MS;
    trackFadeRef.current = ready ? CLIENT_TRACK_FADE_MS : TRACK_FADE_MS;
  }, [clientDetectorStatus]);

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await api.post("/attendance/sessions", createForm);
      const newSession = res.data.data;
      setSessions((prev) => [newSession, ...prev]);
      setSelectedSessionId(newSession.id);
      setRoster([]);
      setRosterLoading(true);
      setShowCreateForm(false);
      setCreateForm({ schedule_id: "", date: "", start_time: "" });
    } catch {
      alert("Gagal membuat sesi absensi.");
    } finally {
      setCreating(false);
    }
  };

  const openStatusModal = (student: SessionStudent) => {
    setStatusStudent(student);
    setSelectedStatus(student.attendance?.status ?? "HADIR");
    setStatusNotes(student.attendance?.notes ?? "");
    setStatusError(null);
    setRosterError(null);
    setRosterNotice(null);
  };

  const openDetailModal = (student: SessionStudent) => {
    setDetailStudent(student);
  };

  const openHistoryModal = (student: SessionStudent) => {
    setHistoryStudent(student);
    setHistoryEntries([]);
    setHistoryError(null);
    setHistoryLoading(true);
  };

  const submitStatusChange = async () => {
    if (selectedSessionId === null || statusStudent === null || savingStatus) return;

    if ((selectedStatus === "IZIN" || selectedStatus === "SAKIT") && statusNotes.trim() === "") {
      setStatusError(`Alasan ${STATUS_META[selectedStatus].label.toLowerCase()} wajib diisi.`);
      return;
    }

    setSavingStatus(true);
    setStatusError(null);

    try {
      const res = await api.put(
        `/attendance/sessions/${selectedSessionId}/students/${statusStudent.id}`,
        {
          status: selectedStatus,
          notes: statusNotes.trim() === "" ? null : statusNotes.trim(),
        }
      );
      const attendance = res.data.data as SessionStudent["attendance"];

      setRoster((previous) => previous.map((row) => (
        row.id === statusStudent.id ? { ...row, attendance } : row
      )));
      setRosterNotice(`${statusStudent.name} diperbarui menjadi ${STATUS_META[selectedStatus].label}.`);
      setStatusStudent(null);
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message ?? error.response?.data?.errors?.notes?.[0]
        : null;
      setStatusError(message || "Gagal menyimpan status kehadiran.");
    } finally {
      setSavingStatus(false);
    }
  };

  const closeSelectedSession = async () => {
    if (selectedSession === null || closingSession) return;
    if (!window.confirm(
      `Tutup sesi ${selectedSession.schedule?.subject?.name ?? ""} - ${selectedSession.schedule?.class?.name ?? ""}? Semua siswa yang belum memiliki catatan akan otomatis ditandai Alpa.`
    )) return;

    setClosingSession(true);
    setRosterError(null);
    setRosterNotice(null);

    try {
      const res = await api.put(`/attendance/sessions/${selectedSession.id}/close`);
      if (isCameraActive) stopCamera();

      setSessions((previous) => previous.map((session) => (
        session.id === selectedSession.id ? { ...session, status: "closed" } : session
      )));
      setRosterNotice(res.data.message || "Sesi absensi berhasil ditutup.");
      setRosterLoading(true);
      setRosterRefresh((value) => value + 1);
    } catch (error) {
      const message = axios.isAxiosError(error) ? error.response?.data?.message : null;
      setRosterError(message || "Gagal menutup sesi absensi.");
    } finally {
      setClosingSession(false);
    }
  };

  useEffect(() => {
    if (historyStudent === null || selectedSessionId === null) return;

    let cancelled = false;

    api.get(`/attendance/sessions/${selectedSessionId}/students/${historyStudent.id}/history`)
      .then((res) => {
        if (cancelled) return;
        setHistoryEntries(Array.isArray(res.data.data?.history) ? res.data.data.history : []);
      })
      .catch((error) => {
        if (cancelled) return;
        const message = axios.isAxiosError(error) ? error.response?.data?.message : null;
        setHistoryError(message || "Gagal memuat riwayat perubahan.");
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });

    return () => { cancelled = true; };
  }, [historyStudent, selectedSessionId]);

  const markRemainingAbsent = async () => {
    if (selectedSessionId === null || rosterCounts.belum === 0 || markingAbsent) return;
    if (!window.confirm(
      `Tandai ${rosterCounts.belum} siswa yang belum absen sebagai Alpa?`
    )) return;

    setMarkingAbsent(true);
    setRosterError(null);
    setRosterNotice(null);

    try {
      const res = await api.post(
        `/attendance/sessions/${selectedSessionId}/mark-remaining-absent`
      );
      setRosterNotice(res.data.message || "Siswa yang belum absen ditandai Alpa.");
      setRosterRefresh((value) => value + 1);
    } catch (error) {
      const message = axios.isAxiosError(error) ? error.response?.data?.message : null;
      setRosterError(message || "Gagal menandai siswa yang belum absen.");
    } finally {
      setMarkingAbsent(false);
    }
  };

  const captureFrame = useCallback(async (captureCanvas: HTMLCanvasElement | null, quality: number): Promise<CapturedFrame | null> => {
    const video = videoRef.current;
    if (!video || !captureCanvas || video.readyState < 2) return null;
    if (!video.videoWidth || !video.videoHeight) return null;

    // Capture at a bounded resolution. The overlay maps detections with these
    // exact dimensions, so boxes stay aligned even when the camera negotiates
    // a larger frame than the preview.
    const scale = Math.min(1, CAPTURE_MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
    const width = Math.max(1, Math.round(video.videoWidth * scale));
    const height = Math.max(1, Math.round(video.videoHeight * scale));
    if (captureCanvas.width !== width || captureCanvas.height !== height) {
      captureCanvas.width = width;
      captureCanvas.height = height;
    }

    const ctx = captureCanvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      captureCanvas.toBlob(resolve, "image/jpeg", quality);
    });
    if (!blob) return null;

    captureSizeRef.current = { width, height };
    return { blob, width, height };
  }, []);

  const applyDetections = useCallback((faces: Array<{ bbox: BBox }>, width: number, height: number) => {
    const now = performance.now();
    const detections = faces.map((face) => normalizeBox(face.bbox, width, height));
    const tracks = tracksRef.current;
    const used = new Array<boolean>(tracks.length).fill(false);
    const nextTracks: TrackedFace[] = [];

    for (const box of detections) {
      let bestIndex = -1;
      let bestOverlap = MATCH_IOU;

      for (let index = 0; index < tracks.length; index += 1) {
        if (used[index]) continue;
        const overlap = boxIoU(box, tracks[index].target);
        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          bestIndex = index;
        }
      }

      // A fast-moving face can lose IoU overlap between two frames; keep the
      // same track when the new box is still close to the previous center.
      if (bestIndex < 0) {
        let bestDistance = TRACK_CENTER_DISTANCE;
        for (let index = 0; index < tracks.length; index += 1) {
          if (used[index]) continue;
          const distance = boxCenterDistance(box, tracks[index].target);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = index;
          }
        }
      }

      if (bestIndex >= 0) {
        used[bestIndex] = true;
        nextTracks.push({
          ...tracks[bestIndex],
          target: box,
          lastSeen: now,
          opacity: 1,
        });
      } else {
        nextTracks.push({
          box: { ...box },
          target: box,
          opacity: 1,
          lastSeen: now,
          matched: null,
          studentName: null,
          status: null,
          distance: null,
        });
      }
    }

    // Keep faces that were not detected in this frame: they fade out in
    // stepTracks if they do not come back.
    for (let index = 0; index < tracks.length; index += 1) {
      if (!used[index]) nextTracks.push({ ...tracks[index] });
    }

    // Attach the identity from the latest recognition pass by overlap first,
    // then by center proximity (the face may move between recognition passes).
    const anchors = identitiesRef.current.filter(
      (anchor) => now - anchor.capturedAt <= IDENTITY_TTL_MS
    );

    tracksRef.current = nextTracks.map((track) => {
      let overlapMatch: IdentityAnchor | null = null;
      let bestOverlap = MATCH_IOU;
      let proximityMatch: IdentityAnchor | null = null;
      let bestDistance = MATCH_CENTER_DISTANCE;

      for (const anchor of anchors) {
        const overlap = boxIoU(anchor.box, track.target);
        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          overlapMatch = anchor;
        }

        const distance = boxCenterDistance(anchor.box, track.target);
        if (distance < bestDistance) {
          bestDistance = distance;
          proximityMatch = anchor;
        }
      }

      const anchor = overlapMatch ?? proximityMatch;
      if (!anchor) {
        // Keep the last known identity while the track is alive; recognition
        // refreshes it every couple of seconds and corrects mistakes.
        return track;
      }
      return {
        ...track,
        matched: anchor.matched,
        studentName: anchor.studentName,
        status: anchor.status,
        distance: anchor.distance,
      };
    });
  }, []);

  const detectWithClient = useCallback((timestamp: number) => {
    const detector = faceDetectorRef.current;
    const video = videoRef.current;
    if (!detector || !video || video.readyState < 2) return;
    if (!video.videoWidth || !video.videoHeight) return;

    // A 60 Hz display would otherwise run the detector twice per camera frame.
    if (video.currentTime === lastVideoTimeRef.current) return;
    lastVideoTimeRef.current = video.currentTime;

    const startedAt = performance.now();
    const result = detector.detectForVideo(video, timestamp);
    const elapsed = performance.now() - startedAt;
    const width = video.videoWidth;
    const height = video.videoHeight;
    captureSizeRef.current = { width, height };

    const faces = result.detections.flatMap((detection) => {
      const box = detection.boundingBox;
      if (!box) return [];
      const score = detection.categories[0]?.score ?? 0;
      if (score < MEDIAPIPE_MIN_SCORE) return [];

      return [{
        bbox: {
          x1: box.originX,
          y1: box.originY,
          x2: box.originX + box.width,
          y2: box.originY + box.height,
        },
      }];
    });

    applyDetections(faces, width, height);

    const now = performance.now();
    const window = clientWindowRef.current;
    const windowStartedAt = window.startedAt || now;
    const frames = window.frames + 1;
    const totalMs = window.ms + elapsed;

    if (now - windowStartedAt >= 1000) {
      setDetectStats({ fps: (frames * 1000) / (now - windowStartedAt), aiMs: totalMs / frames });
      clientWindowRef.current = { frames: 0, startedAt: now, ms: 0 };
    } else {
      clientWindowRef.current = { frames, startedAt: windowStartedAt, ms: totalMs };
    }
  }, [applyDetections]);

  const stepTracks = useCallback((deltaMs: number) => {
    const now = performance.now();
    const damping = 1 - Math.exp(-deltaMs / smoothingTauRef.current);

    tracksRef.current = tracksRef.current
      .map((track) => {
        const box = {
          x1: track.box.x1 + (track.target.x1 - track.box.x1) * damping,
          y1: track.box.y1 + (track.target.y1 - track.box.y1) * damping,
          x2: track.box.x2 + (track.target.x2 - track.box.x2) * damping,
          y2: track.box.y2 + (track.target.y2 - track.box.y2) * damping,
        };
        const fading = now - track.lastSeen > trackTtlRef.current;

        return {
          ...track,
          box,
          opacity: fading ? Math.max(0, track.opacity - deltaMs / trackFadeRef.current) : track.opacity,
        };
      })
      .filter((track) => track.opacity > 0);
  }, []);

  const drawOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Raster the overlay at the element's displayed size (device-pixel aware),
    // so 1 bitmap px maps to 1 screen px regardless of the camera resolution.
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.clearRect(0, 0, width, height);

    const tracks = tracksRef.current;
    const source = captureSizeRef.current;
    if (!source.width || !source.height || tracks.length === 0) return;

    // Replicate the <video> object-fit: cover mapping (scale to cover the box,
    // crop centered) so bbox coords land exactly on the face in the preview.
    const scale = Math.max(width / source.width, height / source.height);
    const offsetX = (width - source.width * scale) / 2;
    const offsetY = (height - source.height * scale) / 2;

    for (const track of tracks) {
      if (track.opacity <= 0) continue;

      const x1 = offsetX + track.box.x1 * source.width * scale;
      const y1 = offsetY + track.box.y1 * source.height * scale;
      const x2 = offsetX + track.box.x2 * source.width * scale;
      const y2 = offsetY + track.box.y2 * source.height * scale;
      const color = track.matched === null ? "#38bdf8" : track.matched ? "#22c55e" : "#ef4444";

      ctx.globalAlpha = Math.min(1, track.opacity);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.5, 2 * dpr);
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

      const label = track.matched === null ? "" : track.studentName || "Tidak Dikenali";
      if (label) {
        const fontSize = Math.round(Math.max(11, Math.min(16, (y2 - y1) * 0.22)) * dpr);
        const padding = 4 * dpr;
        const barHeight = fontSize + padding * 2;
        const barY = y1 - barHeight >= 0 ? y1 - barHeight : y1;

        ctx.font = `600 ${fontSize}px sans-serif`;
        const labelWidth = Math.max(x2 - x1, ctx.measureText(label).width + padding * 2);
        ctx.fillStyle = color;
        ctx.fillRect(x1, barY, labelWidth, barHeight);
        ctx.fillStyle = "#fff";
        ctx.textBaseline = "middle";
        ctx.fillText(label, x1 + padding, barY + barHeight / 2);
      }
    }

    ctx.globalAlpha = 1;
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30, max: 30 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      cameraActiveRef.current = true;
      lastVideoTimeRef.current = -1;
      setRecognizeError(null);
      setIsCameraActive(true);
    } catch (err) {
      const msg = err instanceof DOMException && err.name === "NotAllowedError"
        ? "Izin kamera ditolak. Berikan izin kamera di browser."
        : "Kamera tidak dapat diakses. Pastikan kamera tersedia.";
      alert(msg);
    }
  }, []);

  const stopCamera = useCallback(() => {
    cameraActiveRef.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    detectAbortRef.current?.abort();
    detectAbortRef.current = null;
    recognizeAbortRef.current?.abort();
    recognizeAbortRef.current = null;
    tracksRef.current = [];
    identitiesRef.current = [];
    captureSizeRef.current = { width: 0, height: 0 };
    detectWindowRef.current = { responses: 0, startedAt: 0, aiMs: 0 };
    clientWindowRef.current = { frames: 0, startedAt: 0, ms: 0 };
    lastVideoTimeRef.current = -1;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setResults([]);
    setDetectStats({ fps: 0, aiMs: 0 });
    setIsCameraActive(false);
  }, []);

  // Server detection fallback: used only while MediaPipe is loading or when it
  // could not start. It runs at a bounded cadence and skips ticks while the
  // previous request is in flight.
  useEffect(() => {
    if (!isCameraActive || selectedSessionId === null) return;
    if (clientDetectorStatus === "ready") return;

    let cancelled = false;
    let timer = 0;

    const tick = async () => {
      if (!cameraActiveRef.current) return;

      const startedAt = performance.now();
      detectBusyRef.current = true;
      try {
        const frame = await captureFrame(detectCanvasRef.current, DETECT_JPEG_QUALITY);
        if (!frame || !cameraActiveRef.current) return;

        const controller = new AbortController();
        detectAbortRef.current = controller;

        const formData = new FormData();
        formData.append("image", frame.blob, "frame.jpg");
        formData.append("attendance_session_id", String(selectedSessionId));

        const res = await api.post("/attendance/detect", formData, {
          headers: { "Content-Type": "multipart/form-data" },
          signal: controller.signal,
          timeout: 8000,
        });

        if (cameraActiveRef.current) {
          applyDetections(res.data.faces || [], frame.width, frame.height);

          const now = performance.now();
          const window = detectWindowRef.current;
          const windowStartedAt = window.startedAt || now;
          const responses = window.responses + 1;
          const aiMs = Number(res.data.processing_time_ms) || 0;

          if (now - windowStartedAt >= 1000) {
            setDetectStats({
              fps: (responses * 1000) / (now - windowStartedAt),
              aiMs,
            });
            detectWindowRef.current = { responses: 0, startedAt: now, aiMs };
          } else {
            detectWindowRef.current = { responses, startedAt: windowStartedAt, aiMs };
          }
        }
      } catch {
        // Detection is best-effort; the recognition loop reports real errors.
      } finally {
        detectBusyRef.current = false;
        if (!cancelled) {
          const elapsed = performance.now() - startedAt;
          timer = window.setTimeout(() => {
            void tick();
          }, Math.max(0, DETECT_INTERVAL_MS - elapsed));
        }
      }
    };

    void tick();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      detectAbortRef.current?.abort();
      detectAbortRef.current = null;
      detectBusyRef.current = false;
    };
  }, [applyDetections, captureFrame, clientDetectorStatus, isCameraActive, selectedSessionId]);

  // Expensive recognition loop: identities, attendance records and stats.
  useEffect(() => {
    if (!isCameraActive || selectedSessionId === null) return;

    let active = true;

    const tick = async () => {
      if (!cameraActiveRef.current || recognizeBusyRef.current) return;

      recognizeBusyRef.current = true;
      try {
        const frame = await captureFrame(recognizeCanvasRef.current, RECOGNIZE_JPEG_QUALITY);
        if (!frame || !active) return;

        const controller = new AbortController();
        recognizeAbortRef.current = controller;

        const formData = new FormData();
        formData.append("image", frame.blob, "frame.jpg");
        formData.append("attendance_session_id", String(selectedSessionId));

        const res = await api.post("/attendance/recognize", formData, {
          headers: { "Content-Type": "multipart/form-data" },
          signal: controller.signal,
          timeout: 30000,
        });

        if (!active) return;

        const faces: RecognitionResult[] = res.data.faces || [];
        setResults(faces);
        setStats({
          detected: faces.length,
          recorded: faces.filter((face) => face.status === "recorded").length,
          alreadyRecorded: faces.filter((face) => face.status === "already_recorded").length,
          unknown: faces.filter((face) => face.status === "unknown").length,
        });
        setRecognizeError(null);

        // A new student was recorded (or an ALPA was upgraded): pull the
        // roster again so the manual panel reflects it.
        if (faces.some((face) => face.status === "recorded")) {
          setRosterRefresh((value) => value + 1);
        }

        const capturedAt = performance.now();
        identitiesRef.current = faces.map((face) => ({
          box: normalizeBox(face.bbox, frame.width, frame.height),
          matched: face.matched,
          studentName: face.student_name,
          status: face.status,
          distance: face.distance,
          capturedAt,
        }));
      } catch (error) {
        if (!isCanceledError(error) && active) {
          setRecognizeError("Gagal memproses frame. Periksa koneksi ke server / layanan AI.");
        }
      } finally {
        recognizeBusyRef.current = false;
      }
    };

    const timer = window.setInterval(() => {
      void tick();
    }, RECOGNIZE_INTERVAL_MS);
    void tick();

    return () => {
      active = false;
      window.clearInterval(timer);
      recognizeAbortRef.current?.abort();
      recognizeAbortRef.current = null;
      recognizeBusyRef.current = false;
      identitiesRef.current = [];
    };
  }, [captureFrame, isCameraActive, selectedSessionId]);

  // Draw every animation frame; boxes glide toward the latest detection and
  // fade out when a face leaves the frame, instead of freezing between results.
  useEffect(() => {
    if (!isCameraActive) {
      drawOverlay();
      return;
    }

    let frameId = 0;
    let lastTimestamp = performance.now();

    const render = (timestamp: number) => {
      const delta = Math.min(120, timestamp - lastTimestamp);
      lastTimestamp = timestamp;

      if (faceDetectorRef.current) {
        try {
          detectWithClient(timestamp);
        } catch {
          // Keep drawing the last boxes if a detector frame fails.
        }
      }

      stepTracks(delta);
      drawOverlay();
      frameId = window.requestAnimationFrame(render);
    };

    frameId = window.requestAnimationFrame(render);

    return () => window.cancelAnimationFrame(frameId);
  }, [detectWithClient, drawOverlay, isCameraActive, stepTracks]);

  // Keep boxes aligned when the preview box resizes (window resize/zoom).
  useEffect(() => {
    window.addEventListener("resize", drawOverlay);
    return () => window.removeEventListener("resize", drawOverlay);
  }, [drawOverlay]);

  useEffect(() => {
    return () => {
      cameraActiveRef.current = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      detectAbortRef.current?.abort();
      recognizeAbortRef.current?.abort();
    };
  }, []);

  const canStartCamera = selectedSessionId !== null && sessionIsActive;

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
                  setRoster([]);
                  setRosterLoading(val !== null);
                  setRosterError(null);
                  setRosterNotice(null);
                }}
              >
                <option value="">-- Pilih Sesi --</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.schedule?.subject?.name} - {s.schedule?.class?.name} ({s.date})
                    {s.status === "closed" ? " · Selesai" : " · Aktif"}
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
                  <canvas ref={detectCanvasRef} className="hidden" />
                  <canvas ref={recognizeCanvasRef} className="hidden" />
                  {!isCameraActive && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center text-white">
                        <Camera className="mx-auto h-10 w-10 opacity-40 sm:h-12 sm:w-12" />
                        <p className="mt-2 text-sm">
                          {selectedSessionId === null
                            ? "Pilih sesi absensi terlebih dahulu"
                            : "Sesi sudah ditutup. Absensi kamera tidak dapat dimulai."}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                {recognizeError && (
                  <p className="mt-2 text-xs text-red-600">{recognizeError}</p>
                )}
                {isCameraActive && (
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      Deteksi: {detectStats.fps.toFixed(1)} fps · {Math.round(detectStats.aiMs)} ms
                      {clientDetectorStatus === "ready"
                        ? " · MediaPipe"
                        : clientDetectorStatus === "loading"
                        ? " · memuat model..."
                        : " · server"}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="inline-block h-2 w-2 rounded-full bg-sky-400" /> mendeteksi
                      <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> dikenali
                      <span className="inline-block h-2 w-2 rounded-full bg-red-500" /> tidak dikenal
                    </span>
                  </div>
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

        <Card>
          <CardHeader className="gap-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="text-sm">Daftar Kehadiran Siswa</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Hadir otomatis lewat kamera. Izin dan sakit diisi manual oleh guru.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedSession && sessionIsActive && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void closeSelectedSession()}
                    disabled={closingSession}
                  >
                    <LockKeyhole className="mr-1.5 h-3.5 w-3.5" />
                    {closingSession ? "Menutup..." : "Tutup Sesi"}
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void markRemainingAbsent()}
                  disabled={
                    selectedSessionId === null
                    || rosterCounts.belum === 0
                    || markingAbsent
                    || !sessionIsActive
                  }
                >
                  {markingAbsent
                    ? "Menyimpan..."
                    : rosterCounts.belum === 0
                    ? "Semua siswa sudah tercatat"
                    : `Tandai ${rosterCounts.belum} belum absen · Alpa`}
                </Button>
              </div>
            </div>

            {selectedSession && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
                <span className="font-medium">
                  {selectedSession.schedule?.subject?.name ?? "-"} · {selectedSession.schedule?.class?.name ?? "-"}
                </span>
                <span className="text-muted-foreground">{formatDate(selectedSession.date)}</span>
                <span className="text-muted-foreground">Mulai {selectedSession.start_time}</span>
                <Badge variant={sessionIsActive ? "default" : "secondary"}>
                  {sessionIsActive ? "Sesi aktif" : "Sesi selesai"}
                </Badge>
              </div>
            )}

            {roster.length > 0 && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  {
                    label: "Total Siswa",
                    value: roster.length,
                    className: "border-slate-200 bg-slate-50 text-slate-800",
                  },
                  {
                    label: "Hadir",
                    value: rosterCounts.hadir,
                    className: STATUS_META.HADIR.badgeClass,
                  },
                  {
                    label: "Alpa",
                    value: rosterCounts.alpa,
                    className: STATUS_META.ALPA.badgeClass,
                  },
                  {
                    label: "Izin",
                    value: rosterCounts.izin,
                    className: STATUS_META.IZIN.badgeClass,
                  },
                  {
                    label: "Sakit",
                    value: rosterCounts.sakit,
                    className: STATUS_META.SAKIT.badgeClass,
                  },
                  {
                    label: "Belum Tercatat",
                    value: rosterCounts.belum,
                    className: "border-slate-200 bg-white text-slate-600",
                  },
                ].map((card) => (
                  <div key={card.label} className={`rounded-lg border px-3 py-2 ${card.className}`}>
                    <p className="text-lg font-bold leading-tight">{card.value}</p>
                    <p className="text-[11px] font-medium">{card.label}</p>
                  </div>
                ))}
              </div>
            )}
          </CardHeader>
          <CardContent>
            {rosterNotice && (
              <p className="mb-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                {rosterNotice}
              </p>
            )}
            {rosterError && (
              <p className="mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {rosterError}
              </p>
            )}
            {selectedSession && !sessionIsActive && (
              <p className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Sesi sudah ditutup. Status tetap dapat dikoreksi dan setiap perubahan tercatat di riwayat.
              </p>
            )}

            {selectedSessionId === null ? (
              <p className="text-sm text-muted-foreground">
                Pilih sesi absensi untuk melihat daftar siswa.
              </p>
            ) : rosterLoading && roster.length === 0 ? (
              <p className="text-sm text-muted-foreground">Memuat daftar siswa...</p>
            ) : roster.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Belum ada siswa aktif di kelas ini.
              </p>
            ) : (
              <>
                <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <div className="relative w-full lg:max-w-xs">
                    <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Cari nama, NIS, atau NISN..."
                      className="pl-8"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {STATUS_FILTER_OPTIONS.map((option) => (
                      <Button
                        key={option.value}
                        type="button"
                        size="sm"
                        variant={statusFilter === option.value ? "default" : "outline"}
                        className="h-7 px-2.5 text-xs"
                        onClick={() => setStatusFilter(option.value)}
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <Table className="min-w-[860px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>NIS</TableHead>
                        <TableHead>Nama Siswa</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Keterangan</TableHead>
                        <TableHead>Perubahan Terakhir</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleRoster.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                            Tidak ada siswa yang cocok dengan filter atau pencarian.
                          </TableCell>
                        </TableRow>
                      ) : (
                        visibleRoster.map((student) => {
                          const attendance = student.attendance;
                          const meta = attendance ? STATUS_META[attendance.status] : null;

                          return (
                            <TableRow key={student.id}>
                              <TableCell className="font-mono text-xs">{student.nis}</TableCell>
                              <TableCell>
                                <p className="font-medium">{student.name}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  NISN {student.nisn || "-"}
                                </p>
                              </TableCell>
                              <TableCell>
                                {attendance && meta ? (
                                  <div className="flex flex-col gap-1">
                                    <Badge variant="outline" className={`w-fit ${meta.badgeClass}`}>
                                      {meta.label}
                                    </Badge>
                                    <span className="text-[10px] text-muted-foreground">
                                      {attendance.source === "FACE_RECOGNITION"
                                        ? "via kamera"
                                        : attendance.source === "MANUAL"
                                        ? "input manual guru"
                                        : "otomatis sistem"}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">Belum absen</span>
                                )}
                              </TableCell>
                              <TableCell className="max-w-[220px]">
                                <span className="line-clamp-2 text-xs text-muted-foreground">
                                  {attendance?.notes || "-"}
                                </span>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {attendance?.status_changed_at ? (
                                  <div className="space-y-0.5">
                                    <p className="font-medium text-foreground">
                                      {attendance.status_changed_by_name || "Sistem"}
                                    </p>
                                    <p>{formatDateTime(attendance.status_changed_at)}</p>
                                  </div>
                                ) : (
                                  attendance ? "Otomatis" : "-"
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <DropdownMenu>
                                  <DropdownMenuTrigger
                                    render={
                                      <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label={`Aksi untuk ${student.name}`}
                                      />
                                    }
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-56">
                                    <DropdownMenuItem onClick={() => openStatusModal(student)}>
                                      <Pencil className="h-4 w-4" />
                                      Ubah Status Kehadiran
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => openDetailModal(student)}>
                                      <Eye className="h-4 w-4" />
                                      Lihat Detail Absensi
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => openHistoryModal(student)}>
                                      <History className="h-4 w-4" />
                                      Lihat Riwayat Perubahan
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    Menampilkan {visibleRoster.length} dari {roster.length} siswa
                  </span>
                  {rosterLoading && <span>Memperbarui daftar...</span>}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Dialog
          open={statusStudent !== null}
          onOpenChange={(open) => { if (!open) setStatusStudent(null); }}
        >
          <DialogContent className="sm:max-w-lg">
            {statusStudent && (
              <>
                <DialogHeader>
                  <DialogTitle>Ubah Status Kehadiran</DialogTitle>
                  <DialogDescription>
                    Perubahan manual akan mencatat alasan, identitas guru, dan waktu perubahan.
                  </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-1 gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2">
                  <InfoItem label="Nama Siswa" value={statusStudent.name} />
                  <InfoItem label="NIS / NISN" value={`${statusStudent.nis} / ${statusStudent.nisn || "-"}`} />
                  <InfoItem label="Kelas" value={selectedSession?.schedule?.class?.name} />
                  <InfoItem label="Tanggal Absensi" value={formatDate(selectedSession?.date)} />
                  <InfoItem
                    label="Sesi Jadwal"
                    value={`${selectedSession?.schedule?.subject?.name ?? "-"} · ${selectedSession?.start_time ?? "-"}`}
                  />
                  <InfoItem
                    label="Status Saat Ini"
                    value={
                      statusStudent.attendance ? (
                        <Badge
                          variant="outline"
                          className={STATUS_META[statusStudent.attendance.status].badgeClass}
                        >
                          {STATUS_META[statusStudent.attendance.status].label}
                        </Badge>
                      ) : "Belum absen"
                    }
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Pilihan Status Baru</p>
                  <div className="grid grid-cols-2 gap-2">
                    {MANUAL_STATUS_OPTIONS.map((option) => {
                      const meta = STATUS_META[option];
                      const selected = selectedStatus === option;

                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => {
                            setSelectedStatus(option);
                            setStatusError(null);
                          }}
                          className={`flex items-center gap-2 rounded-lg border p-2.5 text-left text-sm transition ${
                            selected
                              ? meta.selectedClass
                              : "border-border bg-background hover:bg-muted/50"
                          }`}
                        >
                          <span className={`h-2.5 w-2.5 rounded-full ${meta.dotClass}`} />
                          <span className="font-medium">{meta.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="status-notes" className="text-sm font-medium">
                    Keterangan / Alasan
                    {(selectedStatus === "IZIN" || selectedStatus === "SAKIT") && (
                      <span className="ml-1 text-red-500">*</span>
                    )}
                  </label>
                  <textarea
                    id="status-notes"
                    rows={3}
                    maxLength={1000}
                    value={statusNotes}
                    onChange={(event) => {
                      setStatusNotes(event.target.value);
                      setStatusError(null);
                    }}
                    placeholder={
                      selectedStatus === "IZIN"
                        ? "Contoh: Acara keluarga, surat izin orang tua..."
                        : selectedStatus === "SAKIT"
                        ? "Contoh: Demam, surat keterangan dokter..."
                        : "Opsional. Tambahkan catatan bila diperlukan."
                    }
                    className="w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  />
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Wajib diisi untuk status Izin atau Sakit.</span>
                    <span>{statusNotes.length}/1000</span>
                  </div>
                </div>

                {statusError && (
                  <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {statusError}
                  </p>
                )}
                {selectedSession && !sessionIsActive && (
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    Sesi sudah ditutup. Perubahan ini akan dicatat sebagai koreksi.
                  </p>
                )}

                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setStatusStudent(null)}
                    disabled={savingStatus}
                  >
                    Batal
                  </Button>
                  <Button onClick={() => void submitStatusChange()} disabled={savingStatus}>
                    {savingStatus ? "Menyimpan..." : "Simpan"}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        <Dialog
          open={detailStudent !== null}
          onOpenChange={(open) => { if (!open) setDetailStudent(null); }}
        >
          <DialogContent className="sm:max-w-lg">
            {detailStudent && (
              <>
                <DialogHeader>
                  <DialogTitle>Detail Absensi</DialogTitle>
                  <DialogDescription>
                    Informasi lengkap status kehadiran siswa pada sesi ini.
                  </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-1 gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2">
                  <InfoItem label="Nama Siswa" value={detailStudent.name} />
                  <InfoItem label="NIS / NISN" value={`${detailStudent.nis} / ${detailStudent.nisn || "-"}`} />
                  <InfoItem label="Kelas" value={selectedSession?.schedule?.class?.name} />
                  <InfoItem label="Tanggal Absensi" value={formatDate(selectedSession?.date)} />
                  <InfoItem
                    label="Sesi Jadwal"
                    value={`${selectedSession?.schedule?.subject?.name ?? "-"} · ${selectedSession?.start_time ?? "-"}`}
                  />
                  <InfoItem
                    label="Status Kehadiran"
                    value={
                      detailStudent.attendance ? (
                        <Badge
                          variant="outline"
                          className={STATUS_META[detailStudent.attendance.status].badgeClass}
                        >
                          {STATUS_META[detailStudent.attendance.status].label}
                        </Badge>
                      ) : "Belum absen"
                    }
                  />
                </div>

                <div className="space-y-3 rounded-lg border p-3">
                  <InfoItem label="Keterangan / Alasan" value={detailStudent.attendance?.notes || "-"} />
                  <InfoItem
                    label="Sumber Pencatatan"
                    value={
                      detailStudent.attendance
                        ? SOURCE_LABEL[detailStudent.attendance.source] ?? detailStudent.attendance.source
                        : "-"
                    }
                  />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <InfoItem
                      label="Diubah Oleh"
                      value={detailStudent.attendance?.status_changed_by_name || "Sistem"}
                    />
                    <InfoItem
                      label="Waktu Perubahan"
                      value={formatDateTime(detailStudent.attendance?.status_changed_at)}
                    />
                    <InfoItem
                      label="Waktu Deteksi"
                      value={formatDateTime(detailStudent.attendance?.detected_at)}
                    />
                    <InfoItem
                      label="Kecocokan Wajah"
                      value={
                        detailStudent.attendance?.distance != null
                          ? `Distance ${detailStudent.attendance.distance.toFixed(4)} · ${
                              detailStudent.attendance.recognition_confidence != null
                                ? `${(detailStudent.attendance.recognition_confidence * 100).toFixed(0)}%`
                                : "-"
                            }`
                          : "-"
                      }
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setDetailStudent(null)}>
                    Tutup
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        <Dialog
          open={historyStudent !== null}
          onOpenChange={(open) => { if (!open) setHistoryStudent(null); }}
        >
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
            {historyStudent && (
              <>
                <DialogHeader>
                  <DialogTitle>Riwayat Perubahan Status</DialogTitle>
                  <DialogDescription>
                    {historyStudent.name} · {selectedSession?.schedule?.subject?.name ?? "-"} ·{" "}
                    {formatDate(selectedSession?.date)}
                  </DialogDescription>
                </DialogHeader>

                {historyLoading ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Memuat riwayat...</p>
                ) : historyError ? (
                  <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {historyError}
                  </p>
                ) : historyEntries.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Belum ada riwayat perubahan untuk siswa ini.
                  </p>
                ) : (
                  <ol className="space-y-4 border-l border-border pl-4">
                    {historyEntries.map((entry) => (
                      <li key={entry.id} className="relative">
                        <span
                          className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ${STATUS_META[entry.status].dotClass}`}
                        />
                        <div className="flex flex-wrap items-center gap-1.5">
                          {entry.previous_status && (
                            <>
                              <Badge
                                variant="outline"
                                className={STATUS_META[entry.previous_status].badgeClass}
                              >
                                {STATUS_META[entry.previous_status].label}
                              </Badge>
                              <span className="text-xs text-muted-foreground">→</span>
                            </>
                          )}
                          <Badge
                            variant="outline"
                            className={STATUS_META[entry.status].badgeClass}
                          >
                            {STATUS_META[entry.status].label}
                          </Badge>
                        </div>
                        {entry.notes && (
                          <p className="mt-1 text-sm">{entry.notes}</p>
                        )}
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {SOURCE_LABEL[entry.source] ?? entry.source} ·{" "}
                          {entry.changed_by_name || "Sistem"} · {formatDateTime(entry.changed_at)}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}

                <DialogFooter>
                  <Button variant="outline" onClick={() => setHistoryStudent(null)}>
                    Tutup
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
