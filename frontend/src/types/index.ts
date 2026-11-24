export interface User {
  id: number;
  name: string;
  email: string;
  role: "ADMIN" | "GURU";
  created_at: string;
  updated_at: string;
  teacher?: Teacher;
}

export interface Teacher {
  id: number;
  user_id: number;
  nip: string;
  name: string;
  phone: string | null;
  status: "active" | "inactive";
  user?: User;
}

export interface ClassRoom {
  id: number;
  name: string;
  grade: string;
  academic_year: string;
  status: "active" | "inactive";
  students_count?: number;
  students?: Student[];
}

export interface Student {
  id: number;
  nis: string;
  nisn: string | null;
  name: string;
  gender: "L" | "P";
  class_id: number;
  birth_date: string | null;
  photo: string | null;
  status: "active" | "inactive";
  class?: ClassRoom;
  face_embeddings?: FaceEmbedding[];
}

export interface Subject {
  id: number;
  name: string;
  code: string;
  status: "active" | "inactive";
}

export interface Schedule {
  id: number;
  class_id: number;
  subject_id: number;
  teacher_id: number;
  day: string;
  start_time: string;
  end_time: string;
  status: "active" | "inactive";
  class?: ClassRoom;
  subject?: Subject;
  teacher?: Teacher;
}

export interface FaceEmbedding {
  id: number;
  student_id: number;
  embedding: number[];
  model_name: string;
  model_version: string;
  source_image: string | null;
  created_at: string;
}

export interface AttendanceSession {
  id: number;
  schedule_id: number;
  teacher_id: number;
  date: string;
  start_time: string;
  end_time: string | null;
  status: "active" | "closed";
  schedule?: Schedule;
  teacher?: Teacher;
  attendances?: Attendance[];
  attendances_count?: number;
}

export type AttendanceStatus = "HADIR" | "IZIN" | "SAKIT" | "ALPA";

export type AttendanceSource = "FACE_RECOGNITION" | "MANUAL" | "SYSTEM";

export interface Attendance {
  id: number;
  attendance_session_id: number;
  student_id: number;
  status: AttendanceStatus;
  notes: string | null;
  distance: number | null;
  recognition_confidence: number | null;
  detected_at: string;
  status_changed_by: number | null;
  status_changed_by_name: string | null;
  status_changed_at: string | null;
  source: AttendanceSource;
  student?: Student;
  attendance_session?: AttendanceSession;
  status_changer?: User;
}

/** Roster row used by the teacher's manual attendance panel. */
export interface SessionStudent {
  id: number;
  nis: string;
  nisn: string | null;
  name: string;
  gender: "L" | "P";
  attendance: {
    id: number;
    status: AttendanceStatus;
    notes: string | null;
    detected_at: string | null;
    distance: number | null;
    recognition_confidence: number | null;
    status_changed_by: number | null;
    status_changed_by_name: string | null;
    status_changed_at: string | null;
    source: AttendanceSource;
  } | null;
}

export interface SessionRosterSummary {
  total: number;
  hadir: number;
  izin: number;
  sakit: number;
  alpa: number;
  belum: number;
}

export interface SessionRosterInfo {
  id: number;
  status: "active" | "closed";
  date: string;
  start_time: string | null;
  end_time: string | null;
  class_id: number;
  class: string | null;
  subject: string | null;
  teacher: string | null;
}

export interface AttendanceHistoryEntry {
  id: number;
  previous_status: AttendanceStatus | null;
  status: AttendanceStatus;
  notes: string | null;
  source: string;
  changed_by: number | null;
  changed_by_name: string | null;
  changed_at: string | null;
}

export interface BBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface RecognitionResult {
  bbox: BBox;
  detection_confidence: number;
  matched: boolean;
  student_id: number | null;
  student_name: string | null;
  distance: number | null;
  status: "recorded" | "already_recorded" | "unknown";
}

export interface DashboardSummary {
  students: number;
  teachers: number;
  classes: number;
  subjects: number;
  today_attendance: number;
  present: number;
  excused: number;
  sick: number;
  absent: number;
  attendance_rate: number;
  status_counts: Record<AttendanceStatus, number>;
}

export interface AttendanceBucket {
  total: number;
  hadir: number;
  izin: number;
  sakit: number;
  alpa: number;
  attendance_rate: number;
}

export interface ReportPeriod extends AttendanceBucket {
  key: string;
  label: string;
}

export interface ReportClass extends AttendanceBucket {
  class_id: number | null;
  class_name: string;
}

export interface ReportStudent extends AttendanceBucket {
  student_id: number;
  nis: string;
  nisn: string | null;
  name: string;
  class_name: string | null;
}

export interface ReportSummary {
  period: "daily" | "weekly" | "monthly";
  start_date: string | null;
  end_date: string | null;
  totals: AttendanceBucket;
  periods: ReportPeriod[];
  by_class: ReportClass[];
  by_student: ReportStudent[];
}

export interface PaginatedResponse<T> {
  data: T[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}
