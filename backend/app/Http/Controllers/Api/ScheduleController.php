<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Schedule;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ScheduleController extends Controller
{
    public function mySchedules(Request $request): JsonResponse
    {
        $teacher = $request->user()->teacher;
        if (! $teacher) {
            return response()->json([
                'success' => false,
                'message' => 'Data guru tidak ditemukan.',
            ], 400);
        }

        $schedules = Schedule::with(['class', 'subject'])
            ->where('teacher_id', $teacher->id)
            ->orderBy('day')
            ->orderBy('start_time')
            ->paginate($request->get('per_page', 100));

        return response()->json([
            'success' => true,
            'data' => $schedules,
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $query = Schedule::with(['class', 'subject', 'teacher']);

        if ($request->has('class_id')) {
            $query->where('class_id', $request->class_id);
        }

        if ($request->has('teacher_id')) {
            $query->where('teacher_id', $request->teacher_id);
        }

        if ($request->has('day')) {
            $query->where('day', $request->day);
        }

        $schedules = $query->orderBy('day')->orderBy('start_time')->paginate($request->get('per_page', 15));

        return response()->json([
            'success' => true,
            'data' => $schedules,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'class_id' => 'required|exists:classes,id',
            'subject_id' => 'required|exists:subjects,id',
            'teacher_id' => 'required|exists:teachers,id',
            'day' => 'required|in:Senin,Selasa,Rabu,Kamis,Jumat,Sabtu',
            'start_time' => 'required|date_format:H:i',
            'end_time' => 'required|date_format:H:i|after:start_time',
        ]);

        $schedule = Schedule::create($validated);

        return response()->json([
            'success' => true,
            'data' => $schedule->load(['class', 'subject', 'teacher']),
            'message' => 'Jadwal berhasil ditambahkan.',
        ], 201);
    }

    public function show(Schedule $schedule): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $schedule->load(['class', 'subject', 'teacher', 'attendanceSessions']),
        ]);
    }

    public function update(Request $request, Schedule $schedule): JsonResponse
    {
        $validated = $request->validate([
            'class_id' => 'required|exists:classes,id',
            'subject_id' => 'required|exists:subjects,id',
            'teacher_id' => 'required|exists:teachers,id',
            'day' => 'required|in:Senin,Selasa,Rabu,Kamis,Jumat,Sabtu',
            'start_time' => 'required|date_format:H:i',
            'end_time' => 'required|date_format:H:i|after:start_time',
            'status' => 'nullable|in:active,inactive',
        ]);

        $schedule->update($validated);

        return response()->json([
            'success' => true,
            'data' => $schedule->load(['class', 'subject', 'teacher']),
            'message' => 'Jadwal berhasil diperbarui.',
        ]);
    }

    public function destroy(Schedule $schedule): JsonResponse
    {
        $schedule->delete();

        return response()->json([
            'success' => true,
            'message' => 'Jadwal berhasil dihapus.',
        ]);
    }
}
