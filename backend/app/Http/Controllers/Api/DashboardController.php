<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\ClassModel;
use App\Models\Schedule;
use App\Models\Student;
use App\Models\Subject;
use App\Models\Teacher;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function summary(Request $request): JsonResponse
    {
        $today = Carbon::today();
        $user = $request->user();

        $attendance = Attendance::query()
            ->join('attendance_sessions', 'attendance_sessions.id', '=', 'attendances.attendance_session_id')
            ->whereDate('attendance_sessions.date', $today);

        if (! $user->isAdmin()) {
            $attendance->where('attendance_sessions.teacher_id', $user->teacher?->id ?? 0);
        }

        $counts = $attendance
            ->selectRaw('attendances.status as status, COUNT(*) as total')
            ->groupBy('attendances.status')
            ->pluck('total', 'status');

        $present = (int) ($counts['HADIR'] ?? 0);
        $excused = (int) ($counts['IZIN'] ?? 0);
        $sick = (int) ($counts['SAKIT'] ?? 0);
        $absent = (int) ($counts['ALPA'] ?? 0);
        $totalRecords = $present + $excused + $sick + $absent;

        if ($user->isAdmin()) {
            $totalStudents = Student::where('status', 'active')->count();
            $totalTeachers = Teacher::where('status', 'active')->count();
            $totalClasses = ClassModel::where('status', 'active')->count();
            $totalSubjects = Subject::where('status', 'active')->count();
        } else {
            $teacherId = $user->teacher?->id ?? 0;
            $scheduleQuery = Schedule::where('teacher_id', $teacherId);
            $classIds = (clone $scheduleQuery)->pluck('class_id')->unique()->values();

            $totalStudents = Student::whereIn('class_id', $classIds)
                ->where('status', 'active')
                ->count();
            $totalTeachers = 1;
            $totalClasses = $classIds->count();
            $totalSubjects = (clone $scheduleQuery)->pluck('subject_id')->unique()->count();
        }

        return response()->json([
            'success' => true,
            'data' => [
                'students' => $totalStudents,
                'teachers' => $totalTeachers,
                'classes' => $totalClasses,
                'subjects' => $totalSubjects,
                'today_attendance' => $totalRecords,
                'present' => $present,
                'excused' => $excused,
                'sick' => $sick,
                'absent' => $absent,
                'attendance_rate' => $totalRecords > 0
                    ? round(($present / $totalRecords) * 100, 1)
                    : 0.0,
                'status_counts' => [
                    'HADIR' => $present,
                    'IZIN' => $excused,
                    'SAKIT' => $sick,
                    'ALPA' => $absent,
                ],
            ],
        ]);
    }

    public function attendanceChart(Request $request): JsonResponse
    {
        $days = max(1, min(90, (int) $request->get('days', 7)));
        $startDate = Carbon::today()->subDays($days - 1);
        $endDate = Carbon::today();

        $query = Attendance::query()
            ->join('attendance_sessions', 'attendance_sessions.id', '=', 'attendances.attendance_session_id')
            ->whereDate('attendance_sessions.date', '>=', $startDate)
            ->whereDate('attendance_sessions.date', '<=', $endDate);

        if (! $request->user()->isAdmin()) {
            $query->where('attendance_sessions.teacher_id', $request->user()->teacher?->id ?? 0);
        }

        $rows = $query
            ->selectRaw('attendance_sessions.date as session_date, attendances.status as status, COUNT(*) as total')
            ->groupBy('session_date', 'attendances.status')
            ->get();

        $data = [];
        for ($i = 0; $i < $days; $i++) {
            $date = $startDate->copy()->addDays($i)->toDateString();
            $data[$date] = [
                'HADIR' => 0,
                'IZIN' => 0,
                'SAKIT' => 0,
                'ALPA' => 0,
            ];
        }

        foreach ($rows as $row) {
            $date = Carbon::parse($row->session_date)->toDateString();
            if (! isset($data[$date])) {
                continue;
            }

            $status = $row->status;
            if (array_key_exists($status, $data[$date])) {
                $data[$date][$status] += (int) $row->total;
            }
        }

        return response()->json([
            'success' => true,
            'data' => $data,
        ]);
    }

    public function classSummary(Request $request): JsonResponse
    {
        $today = Carbon::today();

        $classes = ClassModel::withCount('students')
            ->where('status', 'active');

        if (! $request->user()->isAdmin()) {
            $classes->whereIn('id', Schedule::where('teacher_id', $request->user()->teacher?->id ?? 0)
                ->pluck('class_id')
                ->unique()
                ->values());
        }

        $classes = $classes->get();

        $query = DB::table('attendances')
            ->join('students', 'students.id', '=', 'attendances.student_id')
            ->join('attendance_sessions', 'attendance_sessions.id', '=', 'attendances.attendance_session_id')
            ->whereDate('attendance_sessions.date', $today)
            ->whereIn('students.class_id', $classes->modelKeys());

        if (! $request->user()->isAdmin()) {
            $query->where('attendance_sessions.teacher_id', $request->user()->teacher?->id ?? 0);
        }

        $rows = $query
            ->selectRaw('students.class_id as class_id, attendances.status as status, COUNT(*) as total')
            ->groupBy('students.class_id', 'attendances.status')
            ->get()
            ->groupBy('class_id');

        $data = $classes->map(function ($class) use ($rows) {
            $counts = $rows->get($class->id, collect())->pluck('total', 'status');
            $hadir = (int) ($counts['HADIR'] ?? 0);
            $izin = (int) ($counts['IZIN'] ?? 0);
            $sakit = (int) ($counts['SAKIT'] ?? 0);
            $alpa = (int) ($counts['ALPA'] ?? 0);
            $totalRecords = $hadir + $izin + $sakit + $alpa;

            return [
                'class_id' => $class->id,
                'class_name' => $class->name,
                'total_students' => $class->students_count,
                'present_today' => $hadir,
                'excused_today' => $izin,
                'sick_today' => $sakit,
                'absent_today' => $alpa,
                'total_records' => $totalRecords,
                'attendance_rate' => $totalRecords > 0
                    ? round(($hadir / $totalRecords) * 100, 1)
                    : 0,
            ];
        });

        return response()->json([
            'success' => true,
            'data' => $data,
        ]);
    }

    public function recentAttendance(Request $request): JsonResponse
    {
        $query = Attendance::with([
            'student.class',
            'attendanceSession.schedule.subject',
            'statusChanger:id,name',
        ])->orderByDesc('detected_at');

        if (! $request->user()->isAdmin()) {
            $query->whereHas('attendanceSession', function ($q) use ($request) {
                $q->where('teacher_id', $request->user()->teacher?->id ?? 0);
            });
        }

        $attendances = $query
            ->limit(min(50, max(1, (int) $request->get('limit', 20))))
            ->get();

        return response()->json([
            'success' => true,
            'data' => $attendances,
        ]);
    }
}
