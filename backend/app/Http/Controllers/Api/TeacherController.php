<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Teacher;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class TeacherController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Teacher::with('user');

        if ($request->has('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'LIKE', "%{$search}%")
                    ->orWhere('nip', 'LIKE', "%{$search}%");
            });
        }

        $teachers = $query->orderBy('name')->paginate($request->get('per_page', 15));

        return response()->json([
            'success' => true,
            'data' => $teachers,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'nip' => 'required|string|unique:teachers,nip',
            'name' => 'required|string|max:255',
            'phone' => 'nullable|string',
            'email' => 'required|email|unique:users,email',
            'password' => 'required|string|min:6',
        ]);

        $teacher = DB::transaction(function () use ($validated) {
            $user = User::create([
                'name' => $validated['name'],
                'email' => $validated['email'],
                'password' => Hash::make($validated['password']),
                'role' => 'GURU',
            ]);

            return Teacher::create([
                'user_id' => $user->id,
                'nip' => $validated['nip'],
                'name' => $validated['name'],
                'phone' => $validated['phone'] ?? null,
            ]);
        });

        return response()->json([
            'success' => true,
            'data' => $teacher->load('user'),
            'message' => 'Guru berhasil ditambahkan.',
        ], 201);
    }

    public function show(Teacher $teacher): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $teacher->load('user', 'schedules'),
        ]);
    }

    public function update(Request $request, Teacher $teacher): JsonResponse
    {
        $validated = $request->validate([
            'nip' => 'required|string|unique:teachers,nip,'.$teacher->id,
            'name' => 'required|string|max:255',
            'phone' => 'nullable|string',
            'status' => 'nullable|in:active,inactive',
        ]);

        $teacher->update($validated);
        $teacher->user->update(['name' => $validated['name']]);

        return response()->json([
            'success' => true,
            'data' => $teacher->load('user'),
            'message' => 'Data guru berhasil diperbarui.',
        ]);
    }

    public function destroy(Teacher $teacher): JsonResponse
    {
        DB::transaction(function () use ($teacher) {
            $teacher->user->delete();
            $teacher->delete();
        });

        return response()->json([
            'success' => true,
            'message' => 'Guru berhasil dihapus.',
        ]);
    }
}
