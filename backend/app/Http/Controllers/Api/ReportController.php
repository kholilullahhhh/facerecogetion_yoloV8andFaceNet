<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ReportController extends Controller
{
    private const STATUSES = ['HADIR', 'IZIN', 'SAKIT', 'ALPA'];

    public function attendance(Request $request): JsonResponse
    {
        $query = $this->filteredQuery($request)->with([
            'student.class',
            'attendanceSession.schedule.subject',
            'attendanceSession.teacher',
            'statusChanger:id,name',
        ]);

        $summary = (clone $query)
            ->reorder()
            ->selectRaw('attendances.status as status, COUNT(*) as total')
            ->groupBy('attendances.status')
            ->pluck('total', 'status');

        $attendances = $query
            ->orderByDesc('attendances.detected_at')
            ->paginate(min(1000, max(1, (int) $request->get('per_page', 20))));

        return response()->json([
            'success' => true,
            'data' => $attendances,
            'summary' => [
                'total' => $summary->sum(),
                'hadir' => (int) ($summary['HADIR'] ?? 0),
                'izin' => (int) ($summary['IZIN'] ?? 0),
                'sakit' => (int) ($summary['SAKIT'] ?? 0),
                'alpa' => (int) ($summary['ALPA'] ?? 0),
            ],
        ]);
    }

    /**
     * Aggregated report for daily, weekly and monthly recap. Every bucket uses
     * the same four statuses and attendance rate only counts HADIR.
     */
    public function summary(Request $request): JsonResponse
    {
        $period = $request->get('period', 'monthly');
        if (! in_array($period, ['daily', 'weekly', 'monthly'], true)) {
            $period = 'monthly';
        }

        $attendances = $this->filteredQuery($request)
            ->with(['student.class', 'attendanceSession'])
            ->get(['id', 'attendance_session_id', 'student_id', 'status']);

        $totals = $this->emptyBucket();
        $periods = [];
        $classes = [];
        $students = [];

        foreach ($attendances as $attendance) {
            $sessionDate = $attendance->attendanceSession?->date;
            if (! $sessionDate) {
                continue;
            }

            $date = $sessionDate->toDateString();
            $key = match ($period) {
                'daily' => $date,
                'weekly' => Carbon::parse($date)->startOfWeek(Carbon::MONDAY)->toDateString(),
                default => substr($date, 0, 7),
            };

            $this->addStatus($totals, $attendance->status);

            if (! isset($periods[$key])) {
                $periods[$key] = $this->emptyBucket() + [
                    'key' => $key,
                    'label' => $this->periodLabel($key, $period),
                ];
            }
            $this->addStatus($periods[$key], $attendance->status);

            $student = $attendance->student;
            $class = $student?->class;
            $classId = $class?->id;
            $classKey = $classId ?? 'none';

            if (! isset($classes[$classKey])) {
                $classes[$classKey] = $this->emptyBucket() + [
                    'class_id' => $classId,
                    'class_name' => $class?->name ?? 'Tanpa Kelas',
                ];
            }
            $this->addStatus($classes[$classKey], $attendance->status);

            if ($student) {
                if (! isset($students[$student->id])) {
                    $students[$student->id] = $this->emptyBucket() + [
                        'student_id' => $student->id,
                        'nis' => $student->nis,
                        'nisn' => $student->nisn,
                        'name' => $student->name,
                        'class_name' => $class?->name,
                    ];
                }
                $this->addStatus($students[$student->id], $attendance->status);
            }
        }

        $periods = collect($periods)
            ->sortKeys()
            ->map(fn (array $row) => $this->withRate($row))
            ->values();

        $classes = collect($classes)
            ->map(fn (array $row) => $this->withRate($row))
            ->sortBy('class_name')
            ->values();

        $students = collect($students)
            ->map(fn (array $row) => $this->withRate($row))
            ->sortBy('name')
            ->values();

        return response()->json([
            'success' => true,
            'data' => [
                'period' => $period,
                'start_date' => $request->get('start_date'),
                'end_date' => $request->get('end_date'),
                'totals' => $this->withRate($totals),
                'periods' => $periods,
                'by_class' => $classes,
                'by_student' => $students,
            ],
        ]);
    }

    public function export(Request $request): JsonResponse
    {
        $attendances = $this->filteredQuery($request)
            ->with([
                'student.class',
                'attendanceSession.schedule.subject',
                'statusChanger:id,name',
            ])
            ->orderBy('attendances.detected_at')
            ->get();

        $lines = [
            $this->csv([
                'Tanggal Sesi',
                'NIS',
                'NISN',
                'Nama Siswa',
                'Kelas',
                'Mata Pelajaran',
                'Status',
                'Keterangan',
                'Diubah Oleh',
                'Waktu Perubahan',
                'Distance',
                'Waktu Deteksi',
            ]),
        ];

        foreach ($attendances as $attendance) {
            $lines[] = $this->csv([
                $attendance->attendanceSession?->date?->toDateString() ?? '',
                $attendance->student?->nis ?? '',
                $attendance->student?->nisn ?? '',
                $attendance->student?->name ?? '',
                $attendance->student?->class?->name ?? '',
                $attendance->attendanceSession?->schedule?->subject?->name ?? '',
                $attendance->status,
                $attendance->notes ?? '',
                $attendance->statusChanger?->name ?? '',
                $attendance->status_changed_at?->format('Y-m-d H:i:s') ?? '',
                $attendance->distance ?? '',
                $attendance->detected_at?->format('Y-m-d H:i:s') ?? '',
            ]);
        }

        return response()->json([
            'success' => true,
            'data' => [
                'csv' => implode("\n", $lines)."\n",
                'total_records' => $attendances->count(),
            ],
        ]);
    }

    private function filteredQuery(Request $request): Builder
    {
        $request->validate([
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date|after_or_equal:start_date',
            'class_id' => 'nullable|integer',
            'student_id' => 'nullable|integer',
            'subject_id' => 'nullable|integer',
            'status' => ['nullable', Rule::in(self::STATUSES)],
        ]);

        $query = Attendance::query();

        if (! $request->user()->isAdmin()) {
            $query->whereHas('attendanceSession', function (Builder $q) use ($request) {
                $q->where('teacher_id', $request->user()->teacher?->id ?? 0);
            });
        }

        if ($request->filled('start_date')) {
            $query->whereHas('attendanceSession', function (Builder $q) use ($request) {
                $q->whereDate('date', '>=', $request->get('start_date'));
            });
        }

        if ($request->filled('end_date')) {
            $query->whereHas('attendanceSession', function (Builder $q) use ($request) {
                $q->whereDate('date', '<=', $request->get('end_date'));
            });
        }

        if ($request->filled('class_id')) {
            $query->whereHas('student', function (Builder $q) use ($request) {
                $q->where('class_id', $request->get('class_id'));
            });
        }

        if ($request->filled('student_id')) {
            $query->where('student_id', $request->get('student_id'));
        }

        if ($request->filled('subject_id')) {
            $query->whereHas('attendanceSession.schedule', function (Builder $q) use ($request) {
                $q->where('subject_id', $request->get('subject_id'));
            });
        }

        if ($request->filled('status')) {
            $query->where('status', $request->get('status'));
        }

        return $query;
    }

    /**
     * @return array{total: int, hadir: int, izin: int, sakit: int, alpa: int, attendance_rate: float}
     */
    private function emptyBucket(): array
    {
        return [
            'total' => 0,
            'hadir' => 0,
            'izin' => 0,
            'sakit' => 0,
            'alpa' => 0,
            'attendance_rate' => 0.0,
        ];
    }

    /**
     * @param  array<string, mixed>  $bucket
     */
    private function addStatus(array &$bucket, string $status): void
    {
        $bucket['total']++;

        $key = strtolower($status);
        if (array_key_exists($key, $bucket)) {
            $bucket[$key]++;
        }
    }

    /**
     * @param  array<string, mixed>  $bucket
     * @return array<string, mixed>
     */
    private function withRate(array $bucket): array
    {
        $bucket['attendance_rate'] = $bucket['total'] > 0
            ? round(($bucket['hadir'] / $bucket['total']) * 100, 1)
            : 0.0;

        return $bucket;
    }

    private function periodLabel(string $key, string $period): string
    {
        return match ($period) {
            'daily' => Carbon::parse($key)->locale('id')->translatedFormat('d M Y'),
            'weekly' => 'Minggu '.Carbon::parse($key)->locale('id')->translatedFormat('d M Y'),
            default => Carbon::createFromFormat('Y-m', $key)->locale('id')->translatedFormat('F Y'),
        };
    }

    /**
     * @param  array<int, mixed>  $values
     */
    private function csv(array $values): string
    {
        return implode(',', array_map(
            fn ($value): string => '"'.str_replace('"', '""', (string) $value).'"',
            $values
        ));
    }
}
