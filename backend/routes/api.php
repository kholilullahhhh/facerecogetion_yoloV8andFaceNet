<?php

use App\Http\Controllers\Api\AttendanceController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ClassController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\FaceEmbeddingController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\ScheduleController;
use App\Http\Controllers\Api\StudentController;
use App\Http\Controllers\Api\SubjectController;
use App\Http\Controllers\Api\TeacherController;
use Illuminate\Support\Facades\Route;

Route::post('/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);

    Route::middleware('admin')->prefix('admin')->group(function () {
        Route::apiResource('students', StudentController::class);
        Route::apiResource('students/{student}/embeddings', FaceEmbeddingController::class)->only(['index', 'store', 'destroy']);
        Route::apiResource('teachers', TeacherController::class);
        Route::apiResource('classes', ClassController::class);
        Route::apiResource('subjects', SubjectController::class);
        Route::apiResource('schedules', ScheduleController::class);
    });

    Route::get('/dashboard/summary', [DashboardController::class, 'summary']);
    Route::get('/dashboard/chart', [DashboardController::class, 'attendanceChart']);
    Route::get('/dashboard/class-summary', [DashboardController::class, 'classSummary']);
    Route::get('/dashboard/recent', [DashboardController::class, 'recentAttendance']);

    Route::prefix('attendance')->group(function () {
        Route::post('/sessions', [AttendanceController::class, 'storeSession']);
        Route::get('/sessions', [AttendanceController::class, 'getSessions']);
        Route::get('/sessions/{session}', [AttendanceController::class, 'getSession']);
        Route::put('/sessions/{session}/close', [AttendanceController::class, 'closeSession']);
        Route::post('/record', [AttendanceController::class, 'recordAttendance']);
        Route::post('/recognize', [AttendanceController::class, 'recognizeAndRecord']);
    });

    Route::prefix('reports')->group(function () {
        Route::get('/attendance', [ReportController::class, 'attendance']);
        Route::get('/attendance/export', [ReportController::class, 'export']);
    });
});
