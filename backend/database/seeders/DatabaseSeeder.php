<?php

namespace Database\Seeders;

use App\Models\ClassModel;
use App\Models\Schedule;
use App\Models\Student;
use App\Models\Subject;
use App\Models\Teacher;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        User::create([
            'name' => 'Admin',
            'email' => 'admin@smpaisyiyah.sch.id',
            'password' => Hash::make('password'),
            'role' => 'ADMIN',
        ]);

        $guru1User = User::create([
            'name' => 'Pak Budi Santoso',
            'email' => 'budi@smpaisyiyah.sch.id',
            'password' => Hash::make('password'),
            'role' => 'GURU',
        ]);

        $guru2User = User::create([
            'name' => 'Ibu Siti Rahmawati',
            'email' => 'siti@smpaisyiyah.sch.id',
            'password' => Hash::make('password'),
            'role' => 'GURU',
        ]);

        $teacher1 = Teacher::create([
            'user_id' => $guru1User->id,
            'nip' => '198501012010011001',
            'name' => 'Pak Budi Santoso',
            'phone' => '081234567890',
            'status' => 'active',
        ]);

        $teacher2 = Teacher::create([
            'user_id' => $guru2User->id,
            'nip' => '198703152012012002',
            'name' => 'Ibu Siti Rahmawati',
            'phone' => '081234567891',
            'status' => 'active',
        ]);

        $classes = [];
        foreach (['VII-A', 'VII-B', 'VIII-A', 'VIII-B', 'IX-A', 'IX-B'] as $className) {
            $classes[] = ClassModel::create([
                'name' => $className,
                'grade' => explode('-', $className)[0],
                'academic_year' => '2025/2026',
                'status' => 'active',
            ]);
        }

        $subjects = [];
        $subjectData = [
            ['name' => 'Matematika', 'code' => 'MTK'],
            ['name' => 'Bahasa Indonesia', 'code' => 'BIN'],
            ['name' => 'Bahasa Inggris', 'code' => 'BIG'],
            ['name' => 'IPA', 'code' => 'IPA'],
            ['name' => 'IPS', 'code' => 'IPS'],
            ['name' => 'PJOK', 'code' => 'PJOK'],
        ];

        foreach ($subjectData as $s) {
            $subjects[] = Subject::create([
                'name' => $s['name'],
                'code' => $s['code'],
                'status' => 'active',
            ]);
        }

        $days = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'];
        $times = [
            ['07:00', '08:30'],
            ['08:30', '10:00'],
            ['10:15', '11:45'],
            ['12:30', '14:00'],
        ];

        foreach ($classes as $class) {
            foreach ($subjects as $index => $subject) {
                if ($index < count($days)) {
                    Schedule::create([
                        'class_id' => $class->id,
                        'subject_id' => $subject->id,
                        'teacher_id' => $teacher1->id,
                        'day' => $days[$index],
                        'start_time' => $times[$index % count($times)][0],
                        'end_time' => $times[$index % count($times)][1],
                        'status' => 'active',
                    ]);
                }
            }
        }

        $studentNames = [
            ['name' => 'Ahmad Rizki Pratama', 'gender' => 'L'],
            ['name' => 'Siti Nurhaliza', 'gender' => 'P'],
            ['name' => 'Muhammad Fadilah', 'gender' => 'L'],
            ['name' => 'Aisyah Putri Ramadhani', 'gender' => 'P'],
            ['name' => 'Budi Setiawan', 'gender' => 'L'],
            ['name' => 'Dewi Kartika Sari', 'gender' => 'P'],
            ['name' => 'Eko Prasetyo', 'gender' => 'L'],
            ['name' => 'Fitri Handayani', 'gender' => 'P'],
            ['name' => 'Gunawan Wibisono', 'gender' => 'L'],
            ['name' => 'Hana Permata Sari', 'gender' => 'P'],
        ];

        $nis = 1001;
        foreach ($studentNames as $index => $data) {
            Student::create([
                'nis' => (string) $nis++,
                'nisn' => '00'.str_pad($index + 1, 8, '0', STR_PAD_LEFT),
                'name' => $data['name'],
                'gender' => $data['gender'],
                'class_id' => $classes[$index % count($classes)]->id,
                'birth_date' => now()->subYears(13)->subMonths($index),
                'status' => 'active',
            ]);
        }
    }
}
