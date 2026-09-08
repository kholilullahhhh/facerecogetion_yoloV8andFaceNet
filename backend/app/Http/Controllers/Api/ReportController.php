<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ReportController extends Controller
{
    public function attendance(Request $request): JsonResponse
    {
        $query = Attendance::with(['student.class', 'attendanceSession.schedule.subject', 'attendanceSession.teacher']);

        if ($request->has('start_date')) {
            $query->whereDate('detected_at', '>=', $request->start_date);
        }

        if ($request->has('end_date')) {
            $query->whereDate('detected_at', '<=', $request->end_date);
        }

        if ($request->has('class_id')) {
            $query->whereHas('student', function ($q) use ($request) {
                $q->where('class_id', $request->class_id);
            });
        }

        if ($request->has('student_id')) {
            $query->where('student_id', $request->student_id);
        }

        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        if ($request->has('subject_id')) {
            $query->whereHas('attendanceSession.schedule', function ($q) use ($request) {
                $q->where('subject_id', $request->subject_id);
            });
        }

        $attendances = $query->orderByDesc('detected_at')
            ->paginate($request->get('per_page', 20));

        return response()->json([
            'success' => true,
            'data' => $attendances,
        ]);
    }

    public function export(Request $request): JsonResponse
    {
        $query = Attendance::with(['student.class', 'attendanceSession.schedule.subject', 'attendanceSession.teacher']);

        if ($request->has('start_date')) {
            $query->whereDate('detected_at', '>=', $request->start_date);
        }

        if ($request->has('end_date')) {
            $query->whereDate('detected_at', '<=', $request->end_date);
        }

        if ($request->has('class_id')) {
            $query->whereHas('student', function ($q) use ($request) {
                $q->where('class_id', $request->class_id);
            });
        }

        $attendances = $query->orderByDesc('detected_at')->get();

        $csv = "Tanggal,NIS,Nama Siswa,Kelas,Mata Pelajaran,Status,Distance,Waktu Deteksi\n";

        foreach ($attendances as $a) {
            $csv .= implode(',', [
                $a->detected_at->format('Y-m-d'),
                $a->student->nis,
                '"'.$a->student->name.'"',
                $a->student->class->name ?? '',
                $a->attendanceSession->schedule->subject->name ?? '',
                $a->status,
                $a->distance,
                $a->detected_at->format('H:i:s'),
            ])."\n";
        }

        return response()->json([
            'success' => true,
            'data' => [
                'csv' => $csv,
                'total_records' => $attendances->count(),
            ],
        ]);
    }
}
