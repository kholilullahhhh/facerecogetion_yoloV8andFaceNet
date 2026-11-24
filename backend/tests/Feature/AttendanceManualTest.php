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

    public function test_roster_lists_every_active_student_and_summarizes_four_statuses(): void
    {
        [$teacherUser, $class, $session] = $this->createSessionContext();
        $present = $this->createStudent($class, '1001', 'Ahmad');
        $excused = $this->createStudent($class, '1002', 'Budi');
        $this->createStudent($class, '1003', 'Cici');
        $this->createStudent($class, '1004', 'Dedi')->update(['status' => 'inactive']);

        $otherClass = $this->createClass('XII IPA 2');
        $this->createStudent($otherClass, '2001', 'Eka');

        $this->recordAttendance($session, $present, 'HADIR', null, 0.31, 0.92);
        $this->recordAttendance($session, $excused, 'IZIN', 'Surat izin orang tua');

        Sanctum::actingAs($teacherUser);

        $response = $this->getJson("/api/attendance/sessions/{$session->id}/students");

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(3, 'data.students')
            ->assertJsonPath('data.summary.total', 3)
            ->assertJsonPath('data.summary.hadir', 1)
            ->assertJsonPath('data.summary.izin', 1)
            ->assertJsonPath('data.summary.sakit', 0)
            ->assertJsonPath('data.summary.alpa', 0)
            ->assertJsonPath('data.summary.belum', 1)
            ->assertJsonPath('data.students.0.name', 'Ahmad')
            ->assertJsonPath('data.students.0.attendance.status', 'HADIR')
            ->assertJsonPath('data.students.0.attendance.source', 'FACE_RECOGNITION')
            ->assertJsonPath('data.students.1.name', 'Budi')
            ->assertJsonPath('data.students.1.attendance.status', 'IZIN')
            ->assertJsonPath('data.students.1.attendance.notes', 'Surat izin orang tua')
            ->assertJsonPath('data.students.2.name', 'Cici')
            ->assertJsonPath('data.students.2.attendance', null);
    }

    public function test_teacher_can_set_izin_and_sakit_with_reason_and_audit_trail(): void
    {
        [$teacherUser, $class, $session] = $this->createSessionContext();
        $student = $this->createStudent($class, '1001', 'Ahmad');

        Sanctum::actingAs($teacherUser);

        $this->putJson("/api/attendance/sessions/{$session->id}/students/{$student->id}", [
            'status' => 'IZIN',
        ])->assertStatus(422)
            ->assertJsonValidationErrors('notes');

        $this->putJson("/api/attendance/sessions/{$session->id}/students/{$student->id}", [
            'status' => 'IZIN',
            'notes' => 'Acara keluarga',
        ])->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'IZIN')
            ->assertJsonPath('data.notes', 'Acara keluarga')
            ->assertJsonPath('data.status_changed_by_name', $teacherUser->name)
            ->assertJsonPath('data.source', 'MANUAL');

        $attendance = Attendance::where('attendance_session_id', $session->id)
            ->where('student_id', $student->id)
            ->firstOrFail();

        $this->assertSame('IZIN', $attendance->status);
        $this->assertSame('Acara keluarga', $attendance->notes);
        $this->assertSame($teacherUser->id, $attendance->status_changed_by);
        $this->assertNotNull($attendance->status_changed_at);
        $this->assertDatabaseHas('attendance_status_histories', [
            'attendance_id' => $attendance->id,
            'previous_status' => null,
            'status' => 'IZIN',
            'notes' => 'Acara keluarga',
            'source' => 'MANUAL',
            'changed_by' => $teacherUser->id,
        ]);

        $this->putJson("/api/attendance/sessions/{$session->id}/students/{$student->id}", [
            'status' => 'SAKIT',
            'notes' => 'Demam',
        ])->assertOk()
            ->assertJsonPath('data.status', 'SAKIT')
            ->assertJsonPath('data.notes', 'Demam');

        $this->assertSame(1, Attendance::where('attendance_session_id', $session->id)
            ->where('student_id', $student->id)
            ->count());
        $this->assertSame(2, $attendance->statusHistories()->count());
        $this->assertDatabaseHas('attendance_status_histories', [
            'attendance_id' => $attendance->id,
            'previous_status' => 'IZIN',
            'status' => 'SAKIT',
            'notes' => 'Demam',
        ]);
    }

    public function test_manual_status_rejects_terlambat_and_students_outside_the_session_class(): void
    {
        [$teacherUser, , $session] = $this->createSessionContext();
        $outsider = $this->createStudent($this->createClass('XII IPA 2'), '2001', 'Eka');

        Sanctum::actingAs($teacherUser);

        $this->putJson("/api/attendance/sessions/{$session->id}/students/{$outsider->id}", [
            'status' => 'ALPA',
        ])->assertStatus(422);

        $insider = $this->createStudent($session->schedule->class, '1001', 'Ahmad');
        $this->putJson("/api/attendance/sessions/{$session->id}/students/{$insider->id}", [
            'status' => 'TERLAMBAT',
        ])->assertStatus(422)
            ->assertJsonValidationErrors('status');
    }

    public function test_closed_session_allows_status_correction_but_not_bulk_alpa(): void
    {
        [$teacherUser, $class, $session] = $this->createSessionContext();
        $student = $this->createStudent($class, '1001', 'Ahmad');
        $session->update(['status' => 'closed']);

        Sanctum::actingAs($teacherUser);

        $this->putJson("/api/attendance/sessions/{$session->id}/students/{$student->id}", [
            'status' => 'IZIN',
            'notes' => 'Koreksi setelah sesi ditutup',
        ])->assertOk()
            ->assertJsonPath('data.status', 'IZIN');

        $this->postJson("/api/attendance/sessions/{$session->id}/mark-remaining-absent")
            ->assertStatus(400);
    }

    public function test_another_teacher_cannot_read_change_or_view_history(): void
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
        $this->getJson("/api/attendance/sessions/{$session->id}/students/{$student->id}/history")->assertStatus(403);
        $this->putJson("/api/attendance/sessions/{$session->id}/students/{$student->id}", [
            'status' => 'IZIN',
            'notes' => 'Tidak boleh',
        ])->assertStatus(403);
        $this->postJson("/api/attendance/sessions/{$session->id}/mark-remaining-absent")
            ->assertStatus(403);
    }

    public function test_mark_remaining_absent_fills_unrecorded_students_without_duplicates(): void
    {
        [$teacherUser, $class, $session] = $this->createSessionContext();
        $present = $this->createStudent($class, '1001', 'Ahmad');
        $this->createStudent($class, '1002', 'Budi');
        $this->createStudent($class, '1003', 'Cici');

        $this->recordAttendance($session, $present, 'HADIR', null, 0.40, 0.88);

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

        $this->postJson("/api/attendance/sessions/{$session->id}/mark-remaining-absent")
            ->assertOk()
            ->assertJsonPath('data.marked', 0);

        $this->assertSame(3, Attendance::where('attendance_session_id', $session->id)->count());
    }

    public function test_closing_session_marks_only_unrecorded_students_alpa_and_is_idempotent(): void
    {
        [$teacherUser, $class, $session] = $this->createSessionContext();
        $present = $this->createStudent($class, '1001', 'Ahmad');
        $excused = $this->createStudent($class, '1002', 'Budi');
        $sick = $this->createStudent($class, '1003', 'Cici');
        $unrecorded = $this->createStudent($class, '1004', 'Dedi');

        $this->recordAttendance($session, $present, 'HADIR', null, 0.35, 0.9);
        $this->recordAttendance($session, $excused, 'IZIN', 'Surat izin');
        $this->recordAttendance($session, $sick, 'SAKIT', 'Demam');

        Sanctum::actingAs($teacherUser);

        $this->putJson("/api/attendance/sessions/{$session->id}/close")
            ->assertOk()
            ->assertJsonPath('data.marked', 1)
            ->assertJsonPath('data.already_closed', false);

        $this->assertDatabaseHas('attendances', [
            'attendance_session_id' => $session->id,
            'student_id' => $unrecorded->id,
            'status' => 'ALPA',
        ]);
        $this->assertDatabaseHas('attendances', [
            'attendance_session_id' => $session->id,
            'student_id' => $excused->id,
            'status' => 'IZIN',
        ]);
        $this->assertDatabaseHas('attendances', [
            'attendance_session_id' => $session->id,
            'student_id' => $sick->id,
            'status' => 'SAKIT',
        ]);
        $this->assertDatabaseHas('attendance_status_histories', [
            'status' => 'ALPA',
            'source' => 'SESSION_CLOSE',
        ]);

        $this->assertSame('closed', $session->refresh()->status);
        $this->assertSame(4, Attendance::where('attendance_session_id', $session->id)->count());

        $this->putJson("/api/attendance/sessions/{$session->id}/close")
            ->assertOk()
            ->assertJsonPath('data.marked', 0)
            ->assertJsonPath('data.already_closed', true);

        $this->assertSame(4, Attendance::where('attendance_session_id', $session->id)->count());
    }

    public function test_recognition_upgrades_alpa_but_never_overwrites_izin_or_sakit(): void
    {
        [$teacherUser, $class, $session] = $this->createSessionContext();
        $student = $this->createStudent($class, '1001', 'Ahmad');

        $this->recordAttendance($session, $student, 'ALPA', 'Belum absen');

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

        $attendance = Attendance::where('attendance_session_id', $session->id)
            ->where('student_id', $student->id)
            ->firstOrFail();
        $this->assertSame('HADIR', $attendance->status);
        $this->assertNotNull($attendance->distance);
        $this->assertDatabaseHas('attendance_status_histories', [
            'attendance_id' => $attendance->id,
            'previous_status' => 'ALPA',
            'status' => 'HADIR',
            'source' => 'FACE_RECOGNITION',
        ]);

        $attendance->update(['status' => 'IZIN', 'notes' => 'Surat izin']);

        $this->post('/api/attendance/recognize', [
            'attendance_session_id' => $session->id,
            'image' => UploadedFile::fake()->image('frame2.jpg', 640, 480),
        ])->assertOk()
            ->assertJsonPath('faces.0.status', 'already_recorded');

        $this->assertDatabaseHas('attendances', [
            'id' => $attendance->id,
            'status' => 'IZIN',
            'notes' => 'Surat izin',
        ]);
    }

    public function test_status_history_endpoint_returns_teacher_and_reason(): void
    {
        [$teacherUser, $class, $session] = $this->createSessionContext();
        $student = $this->createStudent($class, '1001', 'Ahmad');

        Sanctum::actingAs($teacherUser);

        $this->putJson("/api/attendance/sessions/{$session->id}/students/{$student->id}", [
            'status' => 'ALPA',
            'notes' => 'Tidak hadir tanpa keterangan',
        ])->assertOk();

        $this->putJson("/api/attendance/sessions/{$session->id}/students/{$student->id}", [
            'status' => 'IZIN',
            'notes' => 'Orang tua mengirim surat',
        ])->assertOk();

        $this->getJson("/api/attendance/sessions/{$session->id}/students/{$student->id}/history")
            ->assertOk()
            ->assertJsonCount(2, 'data.history')
            ->assertJsonPath('data.history.0.status', 'IZIN')
            ->assertJsonPath('data.history.0.previous_status', 'ALPA')
            ->assertJsonPath('data.history.0.notes', 'Orang tua mengirim surat')
            ->assertJsonPath('data.history.0.changed_by_name', $teacherUser->name)
            ->assertJsonPath('data.history.1.status', 'ALPA');
    }

    /**
     * @return array{0: User, 1: ClassModel, 2: AttendanceSession}
     */
    private function createSessionContext(?string $date = null): array
    {
        $teacherUser = User::factory()->create(['role' => 'GURU']);
        $teacher = Teacher::create([
            'user_id' => $teacherUser->id,
            'nip' => '198001012005011001',
            'name' => 'Guru Uji',
            'status' => 'active',
        ]);
        $class = $this->createClass('XII IPA 1');
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
            'date' => $date ?? now()->toDateString(),
            'start_time' => '08:00',
            'status' => 'active',
        ]);

        return [$teacherUser, $class, $session];
    }

    private function createClass(string $name): ClassModel
    {
        return ClassModel::create([
            'name' => $name,
            'grade' => 'XII',
            'academic_year' => '2026/2027',
            'status' => 'active',
        ]);
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

    private function recordAttendance(
        AttendanceSession $session,
        Student $student,
        string $status,
        ?string $notes = null,
        ?float $distance = null,
        ?float $confidence = null
    ): Attendance {
        return Attendance::create([
            'attendance_session_id' => $session->id,
            'student_id' => $student->id,
            'status' => $status,
            'notes' => $notes,
            'distance' => $distance,
            'recognition_confidence' => $confidence,
            'detected_at' => now(),
            'status_changed_at' => $status === 'HADIR' ? null : now(),
        ]);
    }
}
