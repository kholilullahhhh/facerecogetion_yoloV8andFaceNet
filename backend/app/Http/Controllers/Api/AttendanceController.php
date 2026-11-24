<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\AttendanceSession;
use App\Models\Schedule;
use App\Models\Student;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\Rule;

class AttendanceController extends Controller
{
    private const STATUSES = ['HADIR', 'IZIN', 'SAKIT', 'ALPA'];

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
            ->withCount('attendances')
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
                'attendances.statusChanger',
            ]),
        ]);
    }

    /**
     * Full class roster for a session, including students who have no
     * attendance yet. The teacher uses it to record IZIN/SAKIT/ALPA manually.
     */
    public function getSessionStudents(Request $request, AttendanceSession $session): JsonResponse
    {
        if (! $this->authorizeSession($request, $session)) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak memiliki akses ke sesi ini.',
            ], 403);
        }

        $session->loadMissing(['schedule.class', 'schedule.subject', 'teacher']);

        $students = Student::query()
            ->where('class_id', $session->schedule->class_id)
            ->where('status', 'active')
            ->with([
                'attendances' => fn ($query) => $query->where('attendance_session_id', $session->id),
                'attendances.statusChanger',
            ])
            ->orderBy('name')
            ->get()
            ->map(function (Student $student): array {
                $attendance = $student->attendances->first();

                return [
                    'id' => $student->id,
                    'nis' => $student->nis,
                    'nisn' => $student->nisn,
                    'name' => $student->name,
                    'gender' => $student->gender,
                    'attendance' => $attendance ? $this->attendancePayload($attendance) : null,
                ];
            });

        $summary = [
            'total' => $students->count(),
            'hadir' => $students->filter(fn (array $row) => ($row['attendance']['status'] ?? null) === 'HADIR')->count(),
            'izin' => $students->filter(fn (array $row) => ($row['attendance']['status'] ?? null) === 'IZIN')->count(),
            'sakit' => $students->filter(fn (array $row) => ($row['attendance']['status'] ?? null) === 'SAKIT')->count(),
            'alpa' => $students->filter(fn (array $row) => ($row['attendance']['status'] ?? null) === 'ALPA')->count(),
            'belum' => $students->filter(fn (array $row) => $row['attendance'] === null)->count(),
        ];

        return response()->json([
            'success' => true,
            'data' => [
                'session' => [
                    'id' => $session->id,
                    'status' => $session->status,
                    'date' => $session->date?->toDateString(),
                    'start_time' => $session->start_time?->format('H:i'),
                    'end_time' => $session->end_time?->format('H:i'),
                    'class_id' => $session->schedule->class_id,
                    'class' => $session->schedule->class?->name,
                    'subject' => $session->schedule->subject?->name,
                    'teacher' => $session->teacher?->name,
                ],
                'summary' => $summary,
                'students' => $students,
            ],
        ]);
    }

    /**
     * Manual status set by the teacher. IZIN/SAKIT cannot be inferred from a
     * face, so they always come through here. Face data is left untouched when
     * the student was already recognized.
     *
     * Manual changes stay possible after a session is closed so a teacher can
     * correct a mistake. Each change is written to the audit history.
     */
    public function setManualStatus(Request $request, AttendanceSession $session, Student $student): JsonResponse
    {
        if (! $this->authorizeSession($request, $session)) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak memiliki akses ke sesi ini.',
            ], 403);
        }

        $session->loadMissing('schedule');

        $validated = $request->validate([
            'status' => ['required', 'string', Rule::in(self::STATUSES)],
            'notes' => [
                'nullable',
                'string',
                'max:1000',
                Rule::requiredIf(fn () => in_array($request->input('status'), ['IZIN', 'SAKIT'], true)),
            ],
        ]);

        $inSessionClass = $student->class_id === $session->schedule->class_id
            && $student->status === 'active';
        if (! $inSessionClass) {
            return response()->json([
                'success' => false,
                'message' => 'Siswa bukan anggota kelas pada sesi ini.',
            ], 422);
        }

        $userId = $request->user()->id;
        $notes = isset($validated['notes']) ? trim((string) $validated['notes']) : null;
        $notes = $notes === '' ? null : $notes;

        [$attendance, $changed] = DB::transaction(function () use ($session, $student, $validated, $notes, $userId): array {
            $attendance = Attendance::where('attendance_session_id', $session->id)
                ->where('student_id', $student->id)
                ->lockForUpdate()
                ->first();

            if (! $attendance) {
                $attendance = new Attendance([
                    'attendance_session_id' => $session->id,
                    'student_id' => $student->id,
                    'detected_at' => $this->sessionStartAt($session),
                ]);
                $attendance->distance = null;
                $attendance->recognition_confidence = null;
                $previousStatus = null;
            } else {
                $previousStatus = $attendance->status;
            }

            $changed = $previousStatus !== $validated['status'] || $attendance->notes !== $notes;

            if ($changed) {
                $attendance->status = $validated['status'];
                $attendance->notes = $notes;
                $attendance->status_changed_by = $userId;
                $attendance->status_changed_at = now();
                $attendance->save();

                $attendance->statusHistories()->create([
                    'previous_status' => $previousStatus,
                    'status' => $attendance->status,
                    'notes' => $notes,
                    'source' => 'MANUAL',
                    'changed_by' => $userId,
                    'changed_at' => now(),
                ]);
            } else {
                $attendance->save();
            }

            return [$attendance, $changed];
        });

        $attendance->load('statusChanger');

        return response()->json([
            'success' => true,
            'data' => $this->attendancePayload($attendance),
            'message' => $changed
                ? 'Status kehadiran berhasil disimpan.'
                : 'Tidak ada perubahan status kehadiran.',
        ]);
    }

    /**
     * Convenience action while the session is still open: every active student
     * in the class without an attendance row is marked ALPA.
     */
    public function markRemainingAbsent(Request $request, AttendanceSession $session): JsonResponse
    {
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

        $session->loadMissing('schedule');

        $marked = DB::transaction(fn (): int => $this->markUnrecordedAsAbsent(
            $session,
            'TEACHER_BULK',
            $request->user()->id,
            'Ditandai Alpa oleh guru karena belum memiliki catatan kehadiran.'
        ));

        return response()->json([
            'success' => true,
            'data' => ['marked' => $marked],
            'message' => $marked > 0
                ? "{$marked} siswa ditandai Alpa."
                : 'Semua siswa sudah memiliki status kehadiran.',
        ]);
    }

    /**
     * Closing a session finalizes attendance: students without any record are
     * marked ALPA, while existing HADIR/IZIN/SAKIT records are never touched.
     */
    public function closeSession(Request $request, AttendanceSession $session): JsonResponse
    {
        if (! $this->authorizeSession($request, $session)) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak memiliki akses ke sesi ini.',
            ], 403);
        }

        $session->loadMissing('schedule');

        $result = DB::transaction(function () use ($session): array {
            $locked = AttendanceSession::whereKey($session->id)->lockForUpdate()->firstOrFail();

            if ($locked->status === 'closed') {
                return ['marked' => 0, 'already_closed' => true];
            }

            $marked = $this->markUnrecordedAsAbsent(
                $locked,
                'SESSION_CLOSE',
                null,
                'Ditandai otomatis sebagai Alpa karena tidak melakukan absensi hingga sesi berakhir.'
            );

            $locked->update([
                'status' => 'closed',
                'end_time' => $locked->end_time?->format('H:i') ?: now()->format('H:i'),
            ]);

            return ['marked' => $marked, 'already_closed' => false];
        });

        return response()->json([
            'success' => true,
            'data' => $result,
            'message' => $result['already_closed']
                ? 'Sesi absensi sudah ditutup sebelumnya.'
                : "Sesi absensi berhasil ditutup. {$result['marked']} siswa tanpa catatan ditandai Alpa.",
        ]);
    }

    /**
     * Status history for one student in one session.
     */
    public function getStudentHistory(Request $request, AttendanceSession $session, Student $student): JsonResponse
    {
        if (! $this->authorizeSession($request, $session)) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak memiliki akses ke sesi ini.',
            ], 403);
        }

        $attendance = Attendance::where('attendance_session_id', $session->id)
            ->where('student_id', $student->id)
            ->first();

        $history = $attendance
            ? $attendance->statusHistories()
                ->with('changedBy:id,name')
                ->orderByDesc('changed_at')
                ->orderByDesc('id')
                ->get()
                ->map(fn ($entry): array => [
                    'id' => $entry->id,
                    'previous_status' => $entry->previous_status,
                    'status' => $entry->status,
                    'notes' => $entry->notes,
                    'source' => $entry->source,
                    'changed_by' => $entry->changed_by,
                    'changed_by_name' => $entry->changedBy?->name,
                    'changed_at' => $entry->changed_at?->toIso8601String(),
                ])
            : collect();

        return response()->json([
            'success' => true,
            'data' => [
                'attendance' => $attendance ? $this->attendancePayload($attendance) : null,
                'history' => $history,
            ],
        ]);
    }

    public function recordAttendance(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'attendance_session_id' => 'required|exists:attendance_sessions,id',
            'student_id' => 'required|exists:students,id',
            'distance' => 'required|numeric',
            'recognition_confidence' => 'nullable|numeric',
            'status' => ['nullable', 'in:HADIR'],
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

        $result = $this->recordFaceAttendance(
            $session,
            (int) $validated['student_id'],
            (float) $validated['distance'],
            isset($validated['recognition_confidence']) ? (float) $validated['recognition_confidence'] : null,
        );

        return response()->json([
            'success' => true,
            'data' => $this->attendancePayload($result['attendance']),
            'message' => $result['status'] === 'recorded'
                ? 'Kehadiran berhasil dicatat.'
                : 'Sudah tercatat. Data diperbarui.',
        ], $result['status'] === 'recorded' ? 201 : 200);
    }

    /**
     * Lightweight bounding-box endpoint for the live camera overlay.
     *
     * It only proxies the AI service's YuNet detector: no student/embedding
     * query and no attendance write, so it can run several times per second
     * while recognition keeps running on its own slower cadence.
     */
    public function detectFaces(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'attendance_session_id' => 'required|exists:attendance_sessions,id',
            'image' => 'required|image|mimes:jpeg,jpg,png|max:8192',
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

        $aiServiceUrl = config('services.ai.url', 'http://localhost:8000');
        $image = $request->file('image');

        try {
            $response = Http::timeout(10)
                ->attach('image', file_get_contents($image->getRealPath()), $image->getClientOriginalName())
                ->post("{$aiServiceUrl}/detect");

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

        $faces = array_map(fn (array $face): array => [
            'bbox' => $face['bbox'],
            'detection_confidence' => $face['confidence'] ?? 0,
        ], $aiResult['faces'] ?? []);

        return response()->json([
            'success' => true,
            'processing_time_ms' => $aiResult['processing_time_ms'] ?? 0,
            'faces' => $faces,
        ]);
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
        foreach ($students as $student) {
            foreach ($student->faceEmbeddings as $embedding) {
                $allEmbeddings[] = [
                    'student_id' => $student->id,
                    'student_name' => $student->name,
                    'embedding' => $embedding->embedding,
                ];
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
                $result = $this->recordFaceAttendance(
                    $session,
                    (int) $face['student_id'],
                    (float) $face['distance'],
                    isset($face['detection_confidence']) ? (float) $face['detection_confidence'] : null,
                );
                $record['status'] = $result['status'];
            }

            $results[] = $record;
        }

        return response()->json([
            'success' => true,
            'processing_time_ms' => $aiResult['processing_time_ms'] ?? 0,
            'faces' => $results,
        ]);
    }

    /**
     * Record a face recognition hit. IZIN/SAKIT are manual decisions and are
     * never overwritten by the camera; an ALPA placeholder is upgraded HADIR.
     *
     * @return array{status: string, attendance: Attendance}
     */
    private function recordFaceAttendance(
        AttendanceSession $session,
        int $studentId,
        float $distance,
        ?float $confidence
    ): array {
        return DB::transaction(function () use ($session, $studentId, $distance, $confidence): array {
            $attendance = Attendance::where('attendance_session_id', $session->id)
                ->where('student_id', $studentId)
                ->lockForUpdate()
                ->first();

            if (! $attendance) {
                $attendance = Attendance::create([
                    'attendance_session_id' => $session->id,
                    'student_id' => $studentId,
                    'status' => 'HADIR',
                    'distance' => $distance,
                    'recognition_confidence' => $confidence,
                    'detected_at' => now(),
                    'status_changed_at' => now(),
                ]);

                $attendance->statusHistories()->create([
                    'previous_status' => null,
                    'status' => 'HADIR',
                    'notes' => 'Tercatat otomatis melalui pengenalan wajah.',
                    'source' => 'FACE_RECOGNITION',
                    'changed_by' => null,
                    'changed_at' => now(),
                ]);

                return ['status' => 'recorded', 'attendance' => $attendance];
            }

            if (in_array($attendance->status, ['IZIN', 'SAKIT'], true)) {
                return ['status' => 'already_recorded', 'attendance' => $attendance];
            }

            $previousStatus = $attendance->status;
            $attendance->status = 'HADIR';
            $attendance->distance = $distance;
            $attendance->recognition_confidence = $confidence;
            $attendance->detected_at = now();
            if ($previousStatus !== 'HADIR') {
                $attendance->status_changed_by = null;
                $attendance->status_changed_at = now();
            }
            $attendance->save();

            if ($previousStatus !== 'HADIR') {
                $attendance->statusHistories()->create([
                    'previous_status' => $previousStatus,
                    'status' => 'HADIR',
                    'notes' => 'Diperbarui otomatis melalui pengenalan wajah.',
                    'source' => 'FACE_RECOGNITION',
                    'changed_by' => null,
                    'changed_at' => now(),
                ]);
            }

            return [
                'status' => $previousStatus === 'HADIR' ? 'already_recorded' : 'recorded',
                'attendance' => $attendance,
            ];
        });
    }

    /**
     * Insert ALPA for every active student in the session class that has no
     * attendance row. Existing IZIN/SAKIT/HADIR rows are untouched, and the
     * unique session+student constraint prevents duplicates.
     */
    private function markUnrecordedAsAbsent(
        AttendanceSession $session,
        string $source,
        ?int $changedBy,
        string $notes
    ): int {
        $recordedStudentIds = Attendance::where('attendance_session_id', $session->id)
            ->pluck('student_id');

        $students = Student::query()
            ->where('class_id', $session->schedule->class_id)
            ->where('status', 'active')
            ->whereNotIn('id', $recordedStudentIds)
            ->get(['id']);

        $marked = 0;

        foreach ($students as $student) {
            $attendance = Attendance::firstOrCreate(
                [
                    'attendance_session_id' => $session->id,
                    'student_id' => $student->id,
                ],
                [
                    'status' => 'ALPA',
                    'distance' => null,
                    'recognition_confidence' => null,
                    'detected_at' => now(),
                    'notes' => null,
                ]
            );

            if (! $attendance->wasRecentlyCreated) {
                continue;
            }

            $attendance->statusHistories()->create([
                'previous_status' => null,
                'status' => 'ALPA',
                'notes' => $notes,
                'source' => $source,
                'changed_by' => $changedBy,
                'changed_at' => now(),
            ]);

            $marked++;
        }

        return $marked;
    }

    /**
     * @return array<string, mixed>
     */
    private function attendancePayload(Attendance $attendance): array
    {
        $attendance->loadMissing('statusChanger:id,name');

        return [
            'id' => $attendance->id,
            'status' => $attendance->status,
            'notes' => $attendance->notes,
            'detected_at' => $attendance->detected_at?->toIso8601String(),
            'distance' => $attendance->distance,
            'recognition_confidence' => $attendance->recognition_confidence,
            'status_changed_by' => $attendance->status_changed_by,
            'status_changed_by_name' => $attendance->statusChanger?->name,
            'status_changed_at' => $attendance->status_changed_at?->toIso8601String(),
            'source' => $attendance->distance !== null
                ? 'FACE_RECOGNITION'
                : ($attendance->status_changed_by !== null ? 'MANUAL' : 'SYSTEM'),
        ];
    }

    private function sessionStartAt(AttendanceSession $session): Carbon
    {
        $date = Carbon::parse($session->getRawOriginal('date'))->toDateString();
        $time = Carbon::parse($session->schedule->getRawOriginal('start_time'))->format('H:i:s');

        return Carbon::parse("{$date} {$time}", config('app.timezone'));
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
}
