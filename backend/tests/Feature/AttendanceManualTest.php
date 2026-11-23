<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\AttendanceSession;
use App\Models\ClassModel;
use App\Models\Schedule;
use App\Models\Student;
use App\Models\Subject;
use App\Models\Teacher;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AttendanceManualTest extends TestCase
{
    use RefreshDatabase;

    public function test_roster_lists_every_active_student_in_the_session_class(): void
    {
        [$teacherUser, $class, $session] = $this->createSessionContext();
        $present = $this->createStudent($class, '1001', 'Ahmad');
        $excused = $this->createStudent($class, '1002', 'Budi');
        $this->createStudent($class, '1003', 'Cici');
        $this->createStudent($class, '1004', 'Dedi')->update(['status' => 'inactive']);

        $otherClass = ClassModel::create([
            'name' => 'XII IPA 2',
            'grade' => 'XII',
            'academic_year' => '2026/2027',
            'status' => 'active',
        ]);
        $this->createStudent($otherClass, '2001', 'Eka');

        Attendance::create([
            'attendance_session_id' => $session->id,
            'student_id' => $present->id,
            'status' => 'HADIR',
            'distance' => 0.31,
            'recognition_confidence' => 0.92,
            'detected_at' => now(),
        ]);
        Attendance::create([
            'attendance_session_id' => $session->id,
            'student_id' => $excused->id,
            'status' => 'IZIN',
            'distance' => null,
            'recognition_confidence' => null,
            'detected_at' => now(),
        ]);

        Sanctum::actingAs($teacherUser);

        $response = $this->getJson("/api/attendance/sessions/{$session->id}/students");

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(3, 'data.students')
            ->assertJsonPath('data.students.0.name', 'Ahmad')
            ->assertJsonPath('data.students.0.attendance.status', 'HADIR')
            ->assertJsonPath('data.students.1.name', 'Budi')
            ->assertJsonPath('data.students.1.attendance.status', 'IZIN')
            ->assertJsonPath('data.students.2.name', 'Cici')
            ->assertJsonPath('data.students.2.attendance', null);
    }

    public function test_teacher_can_set_izin_and_sakit_manually(): void
    {
        [$teacherUser, $class, $session] = $this->createSessionContext();
        $student = $this->createStudent($class, '1001', 'Ahmad');

        Sanctum::actingAs($teacherUser);

        $this->putJson("/api/attendance/sessions/{$session->id}/students/{$student->id}", [
            'status' => 'IZIN',
        ])->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'IZIN')
            ->assertJsonPath('data.distance', null);

        $this->assertDatabaseHas('attendances', [
            'attendance_session_id' => $session->id,
            'student_id' => $student->id,
            'status' => 'IZIN',
        ]);

        $this->putJson("/api/attendance/sessions/{$session->id}/students/{$student->id}", [
            'status' => 'SAKIT',
        ])->assertOk();

        $this->assertSame(1, Attendance::where('attendance_session_id', $session->id)
            ->where('student_id', $student->id)
            ->count());
        $this->assertDatabaseHas('attendances', [
            'attendance_session_id' => $session->id,
            'student_id' => $student->id,
            'status' => 'SAKIT',
        ]);
    }

    public function test_manual_status_rejects_students_outside_the_session_class(): void
    {
        [$teacherUser, , $session] = $this->createSessionContext();
        $otherClass = ClassModel::create([
            'name' => 'XII IPA 2',
            'grade' => 'XII',
            'academic_year' => '2026/2027',
            'status' => 'active',
        ]);
        $outsider = $this->createStudent($otherClass, '2001', 'Eka');

        Sanctum::actingAs($teacherUser);

        $this->putJson("/api/attendance/sessions/{$session->id}/students/{$outsider->id}", [
            'status' => 'ALPA',
        ])->assertStatus(422);
    }

    public function test_closed_session_rejects_manual_changes(): void
    {
        [$teacherUser, $class, $session] = $this->createSessionContext();
        $student = $this->createStudent($class, '1001', 'Ahmad');
        $session->update(['status' => 'closed']);

        Sanctum::actingAs($teacherUser);

        $this->putJson("/api/attendance/sessions/{$session->id}/students/{$student->id}", [
            'status' => 'IZIN',
        ])->assertStatus(400);

        $this->postJson("/api/attendance/sessions/{$session->id}/mark-remaining-absent")
            ->assertStatus(400);
    }

    public function test_another_teacher_cannot_read_or_change_the_session(): void
    {
        [, $class, $session] = $this->createSessionContext();
        $student = $this->createStudent($class, '1001', 'Ahmad');

        $otherUser = User::factory()->create(['role' => 'GURU']);
        Teacher::create([
            'user_id' => $otherUser->id,
            'nip' => '198001012005011002',
            'name' => 'Guru Lain',
            'status' => 'active',
        ]);

        Sanctum::actingAs($otherUser);

        $this->getJson("/api/attendance/sessions/{$session->id}/students")->assertStatus(403);
        $this->putJson("/api/attendance/sessions/{$session->id}/students/{$student->id}", [
            'status' => 'IZIN',
        ])->assertStatus(403);
        $this->postJson("/api/attendance/sessions/{$session->id}/mark-remaining-absent")
            ->assertStatus(403);
    }

    public function test_mark_remaining_absent_fills_unrecorded_students_as_alpa(): void
    {
        [$teacherUser, $class, $session] = $this->createSessionContext();
        $present = $this->createStudent($class, '1001', 'Ahmad');
        $this->createStudent($class, '1002', 'Budi');
        $this->createStudent($class, '1003', 'Cici');

        Attendance::create([
            'attendance_session_id' => $session->id,
            'student_id' => $present->id,
            'status' => 'HADIR',
            'detected_at' => now(),
        ]);

        Sanctum::actingAs($teacherUser);

        $this->postJson("/api/attendance/sessions/{$session->id}/mark-remaining-absent")
            ->assertOk()
            ->assertJsonPath('data.marked', 2);

        $this->assertSame(2, Attendance::where('attendance_session_id', $session->id)
            ->where('status', 'ALPA')
            ->count());
        $this->assertDatabaseHas('attendances', [
            'attendance_session_id' => $session->id,
            'student_id' => $present->id,
            'status' => 'HADIR',
        ]);

        // Running it again must not duplicate or overwrite anything.
        $this->postJson("/api/attendance/sessions/{$session->id}/mark-remaining-absent")
            ->assertOk()
            ->assertJsonPath('data.marked', 0);
    }

    public function test_recognition_upgrades_an_alpa_record_when_the_student_appears(): void
    {
        [$teacherUser, $class, $session] = $this->createSessionContext();
        $student = $this->createStudent($class, '1001', 'Ahmad');

        // Keep the schedule start in the current minute so the record is HADIR,
        // not TERLAMBAT (the late threshold is 15 minutes).
        $session->schedule->update([
            'start_time' => now()->format('H:i'),
            'end_time' => now()->addHour()->format('H:i'),
        ]);

        Attendance::create([
            'attendance_session_id' => $session->id,
            'student_id' => $student->id,
            'status' => 'ALPA',
            'distance' => null,
            'recognition_confidence' => null,
            'detected_at' => now(),
        ]);

        Http::fake([
            '*/recognize' => Http::response([
                'success' => true,
                'processing_time_ms' => 42.0,
                'faces' => [[
                    'bbox' => ['x1' => 10, 'y1' => 10, 'x2' => 90, 'y2' => 90],
                    'detection_confidence' => 0.94,
                    'matched' => true,
                    'student_id' => $student->id,
                    'student_name' => $student->name,
                    'distance' => 0.28,
                ]],
            ]),
        ]);

        Sanctum::actingAs($teacherUser);

        $this->post('/api/attendance/recognize', [
            'attendance_session_id' => $session->id,
            'image' => UploadedFile::fake()->image('frame.jpg', 640, 480),
        ])->assertOk()
            ->assertJsonPath('faces.0.status', 'recorded');

        $this->assertDatabaseHas('attendances', [
            'attendance_session_id' => $session->id,
            'student_id' => $student->id,
            'status' => 'HADIR',
        ]);
    }

    /**
     * @return array{0: User, 1: ClassModel, 2: AttendanceSession}
     */
    private function createSessionContext(): array
    {
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
            'date' => now()->toDateString(),
            'start_time' => '08:00',
            'status' => 'active',
        ]);

        return [$teacherUser, $class, $session];
    }

    private function createStudent(ClassModel $class, string $nis, string $name): Student
    {
        return Student::create([
            'nis' => $nis,
            'name' => $name,
            'gender' => 'L',
            'class_id' => $class->id,
            'status' => 'active',
        ]);
    }
}
