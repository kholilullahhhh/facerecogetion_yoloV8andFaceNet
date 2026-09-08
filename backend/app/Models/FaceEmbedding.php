<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class FaceEmbedding extends Model
{
    use HasFactory;

    protected $fillable = [
        'student_id',
        'embedding',
        'model_name',
        'model_version',
        'source_image',
    ];

    protected function casts(): array
    {
        return [
            'embedding' => 'array',
        ];
    }

    public function student()
    {
        return $this->belongsTo(Student::class);
    }
}
