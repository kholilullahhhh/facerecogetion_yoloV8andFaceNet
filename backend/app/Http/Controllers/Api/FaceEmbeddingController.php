<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\FaceEmbedding;
use App\Models\Student;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class FaceEmbeddingController extends Controller
{
    public function index(Student $student): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $student->faceEmbeddings,
        ]);
    }

    public function store(Request $request, Student $student): JsonResponse
    {
        $request->validate([
            'images.*' => 'required|image|mimes:jpeg,jpg,png|max:2048',
        ]);

        if (! $request->hasFile('images')) {
            return response()->json([
                'success' => false,
                'message' => 'Minimal satu gambar harus diunggah.',
            ], 400);
        }

        $aiServiceUrl = config('services.ai.url', 'http://localhost:8000');
        $embeddings = [];
        $errors = [];

        foreach ($request->file('images') as $index => $image) {
            try {
                $response = Http::attach(
                    'image',
                    file_get_contents($image->getRealPath()),
                    $image->getClientOriginalName()
                )->post("{$aiServiceUrl}/register-face");

                if ($response->successful()) {
                    $data = $response->json();
                    if ($data['success'] && ! empty($data['embeddings'])) {
                        foreach ($data['embeddings'] as $embedding) {
                            $embeddings[] = $embedding;
                        }
                    } else {
                        $errors[] = 'Gambar '.($index + 1).': '.($data['detail'] ?? 'Gagal memproses');
                    }
                } else {
                    $errors[] = 'Gambar '.($index + 1).': AI Service error';
                }
            } catch (\Exception $e) {
                $errors[] = 'Gambar '.($index + 1).': '.$e->getMessage();
            }
        }

        $savedCount = 0;
        foreach ($embeddings as $embedding) {
            FaceEmbedding::create([
                'student_id' => $student->id,
                'embedding' => $embedding,
                'model_name' => 'facenet',
                'model_version' => '1.0',
            ]);
            $savedCount++;
        }

        return response()->json([
            'success' => true,
            'data' => [
                'student_id' => $student->id,
                'embeddings_saved' => $savedCount,
                'total_processed' => count($embeddings),
                'errors' => $errors,
            ],
            'message' => "{$savedCount} embedding berhasil disimpan.",
        ]);
    }

    public function destroy(Student $student, FaceEmbedding $embedding): JsonResponse
    {
        if ($embedding->student_id !== $student->id) {
            return response()->json([
                'success' => false,
                'message' => 'Embedding tidak ditemukan untuk siswa ini.',
            ], 404);
        }

        $embedding->delete();

        return response()->json([
            'success' => true,
            'message' => 'Embedding berhasil dihapus.',
        ]);
    }
}
