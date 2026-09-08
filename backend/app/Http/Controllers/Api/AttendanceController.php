<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\AttendanceSession;
use App\Models\Student;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class AttendanceController extends Controller
{
    public function storeSession(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'schedule_id' => 'required|exists:schedules,id',
            'date' => 'required|date',
            'start_time' => 'required|date_format:H:i',
        ]);

        $teacher = $request->user()->teacher;
        if (! $teacher) {
            return response()->json([
                'success' => false,
                'message' => 'Data guru tidak ditemukan.',
            ], 400);
        }

        $existingSession = AttendanceSession::where('schedule_id', $validated['schedule_id'])
            ->where('date', $validated['date'])
            ->where('status', 'active')
            ->first();

        if ($existingSession) {
            return response()->json([
                'success' => true,
                'data' => $existingSession->load(['schedule.class', 'schedule.subject', 'teacher']),
                'message' => 'Sesi absensi sudah aktif.',
            ]);
        }

        $session = AttendanceSession::create([
            'schedule_id' => $validated['schedule_id'],
            'teacher_id' => $teacher->id,
            'date' => $validated['date'],
            'start_time' => $validated['start_time'],
            'status' => 'active',
        ]);

        return response()->json([
            'success' => true,
            'data' => $session->load(['schedule.class', 'schedule.subject', 'teacher']),
            'message' => 'Sesi absensi berhasil dibuat.',
        ], 201);
    }

    public function getSessions(Request $request): JsonResponse
    {
        $query = AttendanceSession::with(['schedule.class', 'schedule.subject', 'teacher'])
            ->orderByDesc('date')
            ->orderByDesc('created_at');

        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        $sessions = $query->paginate($request->get('per_page', 15));

        return response()->json([
            'success' => true,
            'data' => $sessions,
        ]);
    }

    public function getSession(AttendanceSession $session): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $session->load([
                'schedule.class',
                'schedule.subject',
                'teacher',
                'attendances.student',
            ]),
        ]);
    }

    public function closeSession(AttendanceSession $session): JsonResponse
    {
        $session->update([
            'status' => 'closed',
            'end_time' => now()->format('H:i'),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Sesi absensi berhasil ditutup.',
        ]);
    }

    public function recordAttendance(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'attendance_session_id' => 'required|exists:attendance_sessions,id',
            'student_id' => 'required|exists:students,id',
            'distance' => 'required|numeric',
            'recognition_confidence' => 'nullable|numeric',
            'status' => 'required|in:HADIR,TERLAMBAT',
        ]);

        $session = AttendanceSession::find($validated['attendance_session_id']);
        if ($session->status !== 'active') {
            return response()->json([
                'success' => false,
                'message' => 'Sesi absensi sudah ditutup.',
            ], 400);
        }

        $existing = Attendance::where('attendance_session_id', $validated['attendance_session_id'])
            ->where('student_id', $validated['student_id'])
            ->first();

        if ($existing) {
            $existing->update([
                'distance' => $validated['distance'],
                'recognition_confidence' => $validated['recognition_confidence'] ?? null,
                'detected_at' => now(),
            ]);

            return response()->json([
                'success' => true,
                'data' => $existing,
                'message' => 'Sudah tercatat. Data diperbarui.',
            ]);
        }

        $attendance = Attendance::create([
            'attendance_session_id' => $validated['attendance_session_id'],
            'student_id' => $validated['student_id'],
            'status' => $validated['status'],
            'distance' => $validated['distance'],
            'recognition_confidence' => $validated['recognition_confidence'] ?? null,
            'detected_at' => now(),
        ]);

        return response()->json([
            'success' => true,
            'data' => $attendance,
            'message' => 'Kehadiran berhasil dicatat.',
        ], 201);
    }

    public function recognizeAndRecord(Request $request): JsonResponse
    {
        $request->validate([
            'attendance_session_id' => 'required|exists:attendance_sessions,id',
            'image' => 'required|image|mimes:jpeg,jpg,png|max:4096',
        ]);

        $session = AttendanceSession::find($request->attendance_session_id);
        if ($session->status !== 'active') {
            return response()->json([
                'success' => false,
                'message' => 'Sesi absensi sudah ditutup.',
            ], 400);
        }

        $aiServiceUrl = config('services.ai.url', 'http://localhost:8000');

        $students = Student::whereHas('class', function ($q) use ($session) {
            $q->where('id', $session->schedule->class_id);
        })->where('status', 'active')->with('faceEmbeddings')->get();

        $allEmbeddings = [];
        $studentMap = [];
        foreach ($students as $student) {
            foreach ($student->faceEmbeddings as $embedding) {
                $key = $student->id.'_'.$embedding->id;
                $allEmbeddings[] = [
                    'student_id' => $student->id,
                    'student_name' => $student->name,
                    'embedding' => $embedding->embedding,
                ];
                $studentMap[$student->id] = $student->name;
            }
        }

        try {
            $response = Http::attach(
                'image',
                file_get_contents($request->file('image')->getRealPath()),
                $request->file('image')->getClientOriginalName()
            )->post("{$aiServiceUrl}/recognize", [
                'embeddings_json' => json_encode($allEmbeddings),
            ]);

            if (! $response->successful()) {
                return response()->json([
                    'success' => false,
                    'message' => 'AI Service tidak merespons.',
                ], 503);
            }

            $aiResult = $response->json();
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'AI Service tidak tersedia: '.$e->getMessage(),
            ], 503);
        }

        $results = [];
        foreach ($aiResult['faces'] as $face) {
            $record = [
                'bbox' => $face['bbox'],
                'detection_confidence' => $face['detection_confidence'],
                'matched' => $face['matched'],
                'student_id' => $face['student_id'],
                'student_name' => $face['student_name'],
                'distance' => $face['distance'],
                'status' => 'unknown',
            ];

            if ($face['matched'] && $face['student_id']) {
                $existing = Attendance::where('attendance_session_id', $session->id)
                    ->where('student_id', $face['student_id'])
                    ->first();

                if ($existing) {
                    $record['status'] = 'already_recorded';
                } else {
                    $attendanceStatus = $this->determineAttendanceStatus($session);
                    Attendance::create([
                        'attendance_session_id' => $session->id,
                        'student_id' => $face['student_id'],
                        'status' => $attendanceStatus,
                        'distance' => $face['distance'],
                        'recognition_confidence' => $face['detection_confidence'],
                        'detected_at' => now(),
                    ]);
                    $record['status'] = 'recorded';
                }
            }

            $results[] = $record;
        }

        return response()->json([
            'success' => true,
            'processing_time_ms' => $aiResult['processing_time_ms'] ?? 0,
            'faces' => $results,
        ]);
    }

    private function determineAttendanceStatus(AttendanceSession $session): string
    {
        $schedule = $session->schedule;
        $now = now();
        $startTime = Carbon::parse($session->date.' '.$schedule->start_time);
        $lateThreshold = $startTime->copy()->addMinutes(15);

        if ($now->greaterThan($lateThreshold)) {
            return 'TERLAMBAT';
        }

        return 'HADIR';
    }
}
