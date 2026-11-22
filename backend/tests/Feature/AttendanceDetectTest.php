<?php

namespace Tests\Feature;

use App\Models\AttendanceSession;
use App\Models\ClassModel;
use App\Models\Schedule;
use App\Models\Subject;
use App\Models\Teacher;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AttendanceDetectTest extends TestCase
{
    use RefreshDatabase;

    public function test_detect_proxies_boxes_without_recording_attendance(): void
    {
        Http::fake([
            '*/detect' => Http::response([
                'success' => true,
                'processing_time_ms' => 12.5,
                'faces_detected' => 1,
                'faces' => [[
                    'bbox' => ['x1' => 10, 'y1' => 20, 'x2' => 110, 'y2' => 140],
                    'confidence' => 0.93,
                    'class' => 0,
                ]],
            ]),
        ]);

        [$admin, $session] = $this->createActiveSession();
        Sanctum::actingAs($admin);

        $response = $this->post('/api/attendance/detect', [
            'attendance_session_id' => $session->id,
            'image' => UploadedFile::fake()->image('frame.jpg', 640, 480),
        ]);

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('processing_time_ms', 12.5)
            ->assertJsonPath('faces.0.detection_confidence', 0.93)
            ->assertJsonPath('faces.0.bbox.x1', 10)
            ->assertJsonMissingPath('faces.0.landmarks');

        $this->assertDatabaseCount('attendances', 0);
        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/detect'));
    }

    public function test_detect_rejects_a_closed_session(): void
    {
        Http::fake();

        [$admin, $session] = $this->createActiveSession();
        $session->update(['status' => 'closed']);
        Sanctum::actingAs($admin);

        $this->post('/api/attendance/detect', [
            'attendance_session_id' => $session->id,
            'image' => UploadedFile::fake()->image('frame.jpg', 640, 480),
        ])->assertStatus(400);

        Http::assertNothingSent();
    }

    /**
     * @return array{0: User, 1: AttendanceSession}
     */
    private function createActiveSession(): array
    {
        $admin = User::factory()->create(['role' => 'ADMIN']);
        $teacherUser = User::factory()->create(['role' => 'GURU']);
        $teacher = Teacher::create([
            'user_id' => $teacherUser->id,
            'nip' => '198001012005011001',
            'name' => 'Guru Uji',
            'status' => 'active',
        ]);
        $class = ClassModel::create([
            'name' => 'XII IPA 1',
            'grade' => 'XII',
            'academic_year' => '2026/2027',
            'status' => 'active',
        ]);
        $subject = Subject::create([
            'name' => 'Matematika',
            'code' => 'MTK-01',
            'status' => 'active',
        ]);
        $schedule = Schedule::create([
            'class_id' => $class->id,
            'subject_id' => $subject->id,
            'teacher_id' => $teacher->id,
            'day' => 'Senin',
            'start_time' => '08:00',
            'end_time' => '09:30',
            'status' => 'active',
        ]);
        $session = AttendanceSession::create([
            'schedule_id' => $schedule->id,
            'teacher_id' => $teacher->id,
            'date' => '2026-11-22',
            'start_time' => '08:00',
            'status' => 'active',
        ]);

        return [$admin, $session];
    }
}
