<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\AttendanceSession;
use App\Models\Schedule;
use App\Models\Student;
use Carbon\Carbon;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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
        if ($request->user()->role !== 'ADMIN' && ! $teacher) {
            return response()->json([
                'success' => false,
                'message' => 'Data guru tidak ditemukan.',
            ], 400);
        }

        $schedule = Schedule::find($validated['schedule_id']);
        if ($request->user()->role !== 'ADMIN' && $schedule->teacher_id !== $teacher->id) {
            return response()->json([
                'success' => false,
                'message' => 'Anda hanya dapat membuat sesi untuk jadwal Anda sendiri.',
            ], 403);
        }

        $session = DB::transaction(function () use ($validated, $teacher, $schedule) {
            return AttendanceSession::where('schedule_id', $validated['schedule_id'])
                ->where('date', $validated['date'])
                ->where('status', 'active')
                ->lockForUpdate()
                ->first()
                ?? AttendanceSession::create([
                    'schedule_id' => $validated['schedule_id'],
                    'teacher_id' => $teacher?->id ?? $schedule->teacher_id,
                    'date' => $validated['date'],
                    'start_time' => $validated['start_time'],
                    'status' => 'active',
                ]);
        });

        $message = $session->wasRecentlyCreated
            ? 'Sesi absensi berhasil dibuat.'
            : 'Sesi absensi sudah aktif.';

        return response()->json([
            'success' => true,
            'data' => $session->load(['schedule.class', 'schedule.subject', 'teacher']),
            'message' => $message,
        ], $session->wasRecentlyCreated ? 201 : 200);
    }

    public function getSessions(Request $request): JsonResponse
    {
        $query = AttendanceSession::with(['schedule.class', 'schedule.subject', 'teacher'])
            ->orderByDesc('date')
            ->orderByDesc('created_at');

        if ($request->user()->role !== 'ADMIN') {
            $query->where('teacher_id', $request->user()->teacher?->id ?? 0);
        }

        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        $sessions = $query->paginate($request->get('per_page', 15));

        return response()->json([
            'success' => true,
            'data' => $sessions,
        ]);
    }

    public function getSession(Request $request, AttendanceSession $session): JsonResponse
    {
        if (! $this->authorizeSession($request, $session)) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak memiliki akses ke sesi ini.',
            ], 403);
        }

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

    public function closeSession(Request $request, AttendanceSession $session): JsonResponse
    {
        if (! $this->authorizeSession($request, $session)) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak memiliki akses ke sesi ini.',
            ], 403);
        }

        $session->update([
            'status' => 'closed',
            'end_time' => now()->format('H:i'),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Sesi absensi berhasil ditutup.',
        ]);
    }

    /**
     * Admin may access every session; a teacher only their own sessions.
     */
    private function authorizeSession(Request $request, AttendanceSession $session): bool
    {
        if ($request->user()->role === 'ADMIN') {
            return true;
        }

        return $session->teacher_id === $request->user()->teacher?->id;
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
        if (! $this->authorizeSession($request, $session)) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak memiliki akses ke sesi ini.',
            ], 403);
        }

        if ($session->status !== 'active') {
            return response()->json([
                'success' => false,
                'message' => 'Sesi absensi sudah ditutup.',
            ], 400);
        }

        $inSessionClass = Student::where('id', $validated['student_id'])
            ->where('class_id', $session->schedule->class_id)
            ->where('status', 'active')
            ->exists();
        if (! $inSessionClass) {
            return response()->json([
                'success' => false,
                'message' => 'Siswa bukan anggota kelas pada sesi ini.',
            ], 422);
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

        try {
            $attendance = Attendance::create([
                'attendance_session_id' => $validated['attendance_session_id'],
                'student_id' => $validated['student_id'],
                'status' => $validated['status'],
                'distance' => $validated['distance'],
                'recognition_confidence' => $validated['recognition_confidence'] ?? null,
                'detected_at' => now(),
            ]);
        } catch (UniqueConstraintViolationException) {
            $attendance = Attendance::where('attendance_session_id', $validated['attendance_session_id'])
                ->where('student_id', $validated['student_id'])
                ->first();

            return response()->json([
                'success' => true,
                'data' => $attendance,
                'message' => 'Sudah tercatat. Data diperbarui.',
            ]);
        }

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
            'image' => 'required|image|mimes:jpeg,jpg,png|max:8192',
        ]);

        $session = AttendanceSession::find($request->attendance_session_id);
        if (! $this->authorizeSession($request, $session)) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak memiliki akses ke sesi ini.',
            ], 403);
        }

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
            $response = Http::timeout(30)
                ->attach('image',
                    file_get_contents($request->file('image')->getRealPath()),
                    $request->file('image')->getClientOriginalName())
                ->attach('embeddings_json', json_encode($allEmbeddings), 'embeddings.json')
                ->post("{$aiServiceUrl}/recognize");

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
                    try {
                        Attendance::create([
                            'attendance_session_id' => $session->id,
                            'student_id' => $face['student_id'],
                            'status' => $attendanceStatus,
                            'distance' => $face['distance'],
                            'recognition_confidence' => $face['detection_confidence'],
                            'detected_at' => now(),
                        ]);
                        $record['status'] = 'recorded';
                    } catch (UniqueConstraintViolationException) {
                        // A concurrent request recorded the same student first.
                        $record['status'] = 'already_recorded';
                    }
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
        // Raw DB values: the model casts turn `date`/`start_time` into full
        // datetimes, so concatenating the accessors produces an unparseable string.
        $startTime = Carbon::parse(
            $session->getRawOriginal('date').' '.$session->schedule->getRawOriginal('start_time'),
            config('app.timezone')
        );
        $lateThreshold = $startTime->copy()->addMinutes(15);

        if (now(config('app.timezone'))->greaterThan($lateThreshold)) {
            return 'TERLAMBAT';
        }

        return 'HADIR';
    }
}
