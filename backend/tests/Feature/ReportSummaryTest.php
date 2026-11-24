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
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReportSummaryTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_report_summary_uses_four_statuses_and_consistent_rates(): void
    {
        $admin = User::factory()->create(['role' => 'ADMIN']);
        [$teacherA, $classA, $sessionA1] = $this->createSession('Kelas A', 'MTK-01', '2026-11-02');
        $sessionA2 = $this->createSessionFor($classA, $teacherA, '2026-11-03', 'MTK-01');
        [$teacherB, $classB, $sessionB1] = $this->createSession('Kelas B', 'IPA-01', '2026-11-02');

        $ahmad = $this->createStudent($classA, 'A001', 'Ahmad');
        $budi = $this->createStudent($classA, 'A002', 'Budi');
        $cici = $this->createStudent($classA, 'A003', 'Cici');
        $this->createStudent($classA, 'A004', 'Dedi');
        $this->createStudent($classA, 'A005', 'Eka');
        $fajar = $this->createStudent($classB, 'B001', 'Fajar');

        $this->record($sessionA1, $ahmad, 'HADIR');
        $this->record($sessionA1, $budi, 'IZIN', 'Surat izin');
        $this->record($sessionA1, $cici, 'ALPA');
        $this->record($sessionA2, $ahmad, 'HADIR');
        $this->record($sessionA2, $budi, 'SAKIT', 'Demam');
        $this->record($sessionB1, $fajar, 'HADIR');

        Sanctum::actingAs($admin);

        $this->getJson('/api/reports/summary?period=daily&start_date=2026-11-01&end_date=2026-11-30')
            ->assertOk()
            ->assertJsonPath('data.totals.total', 6)
            ->assertJsonPath('data.totals.hadir', 3)
            ->assertJsonPath('data.totals.izin', 1)
            ->assertJsonPath('data.totals.sakit', 1)
            ->assertJsonPath('data.totals.alpa', 1)
            ->assertJsonPath('data.totals.attendance_rate', 50)
            ->assertJsonPath('data.periods.0.key', '2026-11-02')
            ->assertJsonPath('data.periods.0.total', 4)
            ->assertJsonPath('data.periods.0.hadir', 2)
            ->assertJsonPath('data.periods.0.attendance_rate', 50)
            ->assertJsonPath('data.periods.1.key', '2026-11-03')
            ->assertJsonPath('data.periods.1.sakit', 1)
            ->assertJsonPath('data.by_class.0.class_name', 'Kelas A')
            ->assertJsonPath('data.by_class.0.total', 5)
            ->assertJsonPath('data.by_class.0.hadir', 2)
            ->assertJsonPath('data.by_class.0.attendance_rate', 40)
            ->assertJsonPath('data.by_class.1.class_name', 'Kelas B')
            ->assertJsonPath('data.by_class.1.attendance_rate', 100)
            ->assertJsonPath('data.by_student.0.name', 'Ahmad')
            ->assertJsonPath('data.by_student.0.hadir', 2)
            ->assertJsonPath('data.by_student.0.attendance_rate', 100)
            ->assertJsonPath('data.by_student.1.name', 'Budi')
            ->assertJsonPath('data.by_student.1.izin', 1)
            ->assertJsonPath('data.by_student.1.sakit', 1)
            ->assertJsonPath('data.by_student.1.attendance_rate', 0);

        $this->getJson('/api/reports/summary?period=weekly&start_date=2026-11-01&end_date=2026-11-30')
            ->assertOk()
            ->assertJsonPath('data.periods.0.key', '2026-11-02')
            ->assertJsonPath('data.periods.0.total', 6);

        $this->getJson('/api/reports/summary?period=monthly&start_date=2026-01-01&end_date=2026-12-31')
            ->assertOk()
            ->assertJsonPath('data.periods.0.key', '2026-11')
            ->assertJsonPath('data.periods.0.total', 6);

        $this->getJson('/api/reports/summary?period=daily&status=IZIN&start_date=2026-11-01&end_date=2026-11-30')
            ->assertOk()
            ->assertJsonPath('data.totals.total', 1)
            ->assertJsonPath('data.totals.izin', 1)
            ->assertJsonPath('data.totals.hadir', 0);

        $this->assertNotSame($teacherA->id, $teacherB->id);
    }

    public function test_teacher_only_sees_their_own_classes_in_reports_and_export(): void
    {
        [$teacher, , $sessionA] = $this->createSession('Kelas A', 'MTK-01', '2026-11-02');
        [, , $sessionB] = $this->createSession('Kelas B', 'IPA-01', '2026-11-02');

        $ahmad = $this->createStudent($sessionA->schedule->class, 'A001', 'Ahmad');
        $budi = $this->createStudent($sessionA->schedule->class, 'A002', 'Budi');
        $fajar = $this->createStudent($sessionB->schedule->class, 'B001', 'Fajar');

        $this->record($sessionA, $ahmad, 'HADIR');
        $this->record($sessionA, $budi, 'IZIN', 'Surat izin');
        $this->record($sessionB, $fajar, 'HADIR');

        Sanctum::actingAs($teacher->user);

        $this->getJson('/api/reports/summary?period=daily&start_date=2026-11-01&end_date=2026-11-30')
            ->assertOk()
            ->assertJsonPath('data.totals.total', 2)
            ->assertJsonPath('data.totals.hadir', 1)
            ->assertJsonPath('data.totals.izin', 1)
            ->assertJsonCount(1, 'data.by_class')
            ->assertJsonCount(2, 'data.by_student');

        $this->getJson('/api/reports/attendance?start_date=2026-11-01&end_date=2026-11-30')
            ->assertOk()
            ->assertJsonPath('summary.total', 2)
            ->assertJsonPath('summary.hadir', 1)
            ->assertJsonPath('summary.izin', 1)
            ->assertJsonPath('data.total', 2)
            ->assertJsonMissing(['nis' => 'B001']);

        $export = $this->getJson('/api/reports/attendance/export?start_date=2026-11-01&end_date=2026-11-30')
            ->assertOk()
            ->assertJsonPath('data.total_records', 2);

        $csv = $export->json('data.csv');
        $this->assertStringContainsString('Keterangan', $csv);
        $this->assertStringContainsString('Surat izin', $csv);
        $this->assertStringContainsString('Ahmad', $csv);
        $this->assertStringNotContainsString('Fajar', $csv);
    }

    public function test_dashboard_summary_chart_and_class_summary_are_role_aware(): void
    {
        $admin = User::factory()->create(['role' => 'ADMIN']);
        [$teacherA, $classA, $sessionA] = $this->createSession('Kelas A', 'MTK-01', now()->toDateString());
        [, $classB, $sessionB] = $this->createSession('Kelas B', 'IPA-01', now()->toDateString());

        $ahmad = $this->createStudent($classA, 'A001', 'Ahmad');
        $budi = $this->createStudent($classA, 'A002', 'Budi');
        $cici = $this->createStudent($classA, 'A003', 'Cici');
        $dedi = $this->createStudent($classA, 'A004', 'Dedi');
        $fajar = $this->createStudent($classB, 'B001', 'Fajar');

        $this->record($sessionA, $ahmad, 'HADIR');
        $this->record($sessionA, $budi, 'IZIN', 'Izin');
        $this->record($sessionA, $cici, 'SAKIT', 'Sakit');
        $this->record($sessionA, $dedi, 'ALPA');
        $this->record($sessionB, $fajar, 'HADIR');

        Sanctum::actingAs($admin);

        $this->getJson('/api/dashboard/summary')
            ->assertOk()
            ->assertJsonPath('data.today_attendance', 5)
            ->assertJsonPath('data.present', 2)
            ->assertJsonPath('data.excused', 1)
            ->assertJsonPath('data.sick', 1)
            ->assertJsonPath('data.absent', 1)
            ->assertJsonPath('data.attendance_rate', 40)
            ->assertJsonPath('data.status_counts.HADIR', 2)
            ->assertJsonPath('data.status_counts.ALPA', 1);

        $today = now()->toDateString();
        $this->getJson('/api/dashboard/chart?days=7')
            ->assertOk()
            ->assertJsonPath("data.{$today}.HADIR", 2)
            ->assertJsonPath("data.{$today}.IZIN", 1)
            ->assertJsonPath("data.{$today}.SAKIT", 1)
            ->assertJsonPath("data.{$today}.ALPA", 1);

        $this->getJson('/api/dashboard/class-summary')
            ->assertOk()
            ->assertJsonPath('data.0.class_name', 'Kelas A')
            ->assertJsonPath('data.0.present_today', 1)
            ->assertJsonPath('data.0.total_records', 4)
            ->assertJsonPath('data.0.attendance_rate', 25);

        Sanctum::actingAs($teacherA->user);

        $this->getJson('/api/dashboard/summary')
            ->assertOk()
            ->assertJsonPath('data.today_attendance', 4)
            ->assertJsonPath('data.present', 1)
            ->assertJsonPath('data.attendance_rate', 25);

        $this->getJson('/api/dashboard/class-summary')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.class_name', 'Kelas A');

        Sanctum::actingAs($admin);
        $this->getJson("/api/reports/attendance?class_id={$classB->id}")
            ->assertOk()
            ->assertJsonPath('summary.total', 1)
            ->assertJsonPath('data.data.0.student.name', 'Fajar');
    }

    /**
     * @return array{0: Teacher, 1: ClassModel, 2: AttendanceSession}
     */
    private function createSession(string $className, string $subjectCode, string $date): array
    {
        $user = User::factory()->create(['role' => 'GURU']);
        $teacher = Teacher::create([
            'user_id' => $user->id,
            'nip' => '19800101200501'.random_int(1000, 9999),
            'name' => 'Guru '.$className,
            'status' => 'active',
        ]);
        $class = ClassModel::create([
            'name' => $className,
            'grade' => 'XII',
            'academic_year' => '2026/2027',
            'status' => 'active',
        ]);
        $session = $this->createSessionFor($class, $teacher, $date, $subjectCode);

        return [$teacher, $class, $session];
    }

    private function createSessionFor(ClassModel $class, Teacher $teacher, string $date, string $subjectCode): AttendanceSession
    {
        $subject = Subject::firstOrCreate(
            ['code' => $subjectCode],
            ['name' => 'Mapel '.$subjectCode, 'status' => 'active']
        );
        $schedule = Schedule::create([
            'class_id' => $class->id,
            'subject_id' => $subject->id,
            'teacher_id' => $teacher->id,
            'day' => 'Senin',
            'start_time' => '08:00',
            'end_time' => '09:30',
            'status' => 'active',
        ]);

        return AttendanceSession::create([
            'schedule_id' => $schedule->id,
            'teacher_id' => $teacher->id,
            'date' => $date,
            'start_time' => '08:00',
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

    private function record(
        AttendanceSession $session,
        Student $student,
        string $status,
        ?string $notes = null
    ): Attendance {
        return Attendance::create([
            'attendance_session_id' => $session->id,
            'student_id' => $student->id,
            'status' => $status,
            'notes' => $notes,
            'detected_at' => now(),
        ]);
    }
}
