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
}

export interface Attendance {
  id: number;
  attendance_session_id: number;
  student_id: number;
  status: "HADIR" | "TERLAMBAT" | "IZIN" | "SAKIT" | "ALPA";
  distance: number | null;
  recognition_confidence: number | null;
  detected_at: string;
  student?: Student;
  attendance_session?: AttendanceSession;
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
  late: number;
  excused: number;
  sick: number;
  absent: number;
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
