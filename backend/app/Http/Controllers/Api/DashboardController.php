<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\ClassModel;
use App\Models\Student;
use App\Models\Subject;
use App\Models\Teacher;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function summary(): JsonResponse
    {
        $today = Carbon::today();

        $totalStudents = Student::where('status', 'active')->count();
        $totalTeachers = Teacher::where('status', 'active')->count();
        $totalClasses = ClassModel::where('status', 'active')->count();
        $totalSubjects = Subject::where('status', 'active')->count();

        $todayAttendances = Attendance::whereDate('detected_at', $today)->get();
        $present = $todayAttendances->where('status', 'HADIR')->count();
        $late = $todayAttendances->where('status', 'TERLAMBAT')->count();
        $excused = $todayAttendances->where('status', 'IZIN')->count();
        $sick = $todayAttendances->where('status', 'SAKIT')->count();
        $absent = $totalStudents - $present - $late - $excused - $sick;
        if ($absent < 0) {
            $absent = 0;
        }

        return response()->json([
            'success' => true,
            'data' => [
                'students' => $totalStudents,
                'teachers' => $totalTeachers,
                'classes' => $totalClasses,
                'subjects' => $totalSubjects,
                'today_attendance' => $todayAttendances->count(),
                'present' => $present,
                'late' => $late,
                'excused' => $excused,
                'sick' => $sick,
                'absent' => $absent,
            ],
        ]);
    }

    public function attendanceChart(Request $request): JsonResponse
    {
        $days = $request->get('days', 7);
        $startDate = Carbon::now()->subDays($days);

        $data = Attendance::where('detected_at', '>=', $startDate)
            ->selectRaw('date(detected_at) as date, status, count(*) as count')
            ->groupBy('date', 'status')
            ->get()
            ->groupBy('date')
            ->map(function ($dayData) {
                return [
                    'HADIR' => $dayData->where('status', 'HADIR')->sum('count'),
                    'TERLAMBAT' => $dayData->where('status', 'TERLAMBAT')->sum('count'),
                    'IZIN' => $dayData->where('status', 'IZIN')->sum('count'),
                    'SAKIT' => $dayData->where('status', 'SAKIT')->sum('count'),
                    'ALPA' => $dayData->where('status', 'ALPA')->sum('count'),
                ];
            });

        return response()->json([
            'success' => true,
            'data' => $data,
        ]);
    }

    public function classSummary(): JsonResponse
    {
        $today = Carbon::today();

        $classes = ClassModel::withCount('students')
            ->where('status', 'active')
            ->get()
            ->map(function ($class) use ($today) {
                $totalStudents = $class->students_count;
                $presentToday = Attendance::whereHas('student', function ($q) use ($class) {
                    $q->where('class_id', $class->id);
                })->whereDate('detected_at', $today)
                    ->where('status', 'HADIR')
                    ->count();

                return [
                    'class_id' => $class->id,
                    'class_name' => $class->name,
                    'total_students' => $totalStudents,
                    'present_today' => $presentToday,
                    'attendance_rate' => $totalStudents > 0
                        ? round(($presentToday / $totalStudents) * 100, 1)
                        : 0,
                ];
            });

        return response()->json([
            'success' => true,
            'data' => $classes,
        ]);
    }

    public function recentAttendance(Request $request): JsonResponse
    {
        $attendances = Attendance::with(['student.class', 'attendanceSession.schedule.subject'])
            ->orderByDesc('detected_at')
            ->limit($request->get('limit', 20))
            ->get();

        return response()->json([
            'success' => true,
            'data' => $attendances,
        ]);
    }
}
