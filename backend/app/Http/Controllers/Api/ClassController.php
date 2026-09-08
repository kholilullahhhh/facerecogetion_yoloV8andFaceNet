<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ClassModel;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ClassController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = ClassModel::withCount('students');

        if ($request->has('search')) {
            $query->where('name', 'LIKE', "%{$request->search}%");
        }

        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        $classes = $query->orderBy('name')->paginate($request->get('per_page', 15));

        return response()->json([
            'success' => true,
            'data' => $classes,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'grade' => 'required|string|max:50',
            'academic_year' => 'required|string|max:20',
        ]);

        $class = ClassModel::create($validated);

        return response()->json([
            'success' => true,
            'data' => $class,
            'message' => 'Kelas berhasil ditambahkan.',
        ], 201);
    }

    public function show(ClassModel $class): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $class->load('students', 'schedules'),
        ]);
    }

    public function update(Request $request, ClassModel $class): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'grade' => 'required|string|max:50',
            'academic_year' => 'required|string|max:20',
            'status' => 'nullable|in:active,inactive',
        ]);

        $class->update($validated);

        return response()->json([
            'success' => true,
            'data' => $class,
            'message' => 'Kelas berhasil diperbarui.',
        ]);
    }

    public function destroy(ClassModel $class): JsonResponse
    {
        $class->delete();

        return response()->json([
            'success' => true,
            'message' => 'Kelas berhasil dihapus.',
        ]);
    }
}
