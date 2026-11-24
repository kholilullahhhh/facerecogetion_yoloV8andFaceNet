<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Attendance extends Model
{
    use HasFactory;

    protected $fillable = [
        'attendance_session_id',
        'student_id',
        'status',
        'notes',
        'status_changed_by',
        'status_changed_at',
        'distance',
        'recognition_confidence',
        'detected_at',
        'captured_image',
    ];

    protected function casts(): array
    {
        return [
            'detected_at' => 'datetime',
            'status_changed_at' => 'datetime',
        ];
    }

    public function attendanceSession()
    {
        return $this->belongsTo(AttendanceSession::class);
    }

    public function student()
    {
        return $this->belongsTo(Student::class);
    }

    public function statusChanger()
    {
        return $this->belongsTo(User::class, 'status_changed_by');
    }

    public function statusHistories()
    {
        return $this->hasMany(AttendanceStatusHistory::class)->orderBy('changed_at');
    }
}
