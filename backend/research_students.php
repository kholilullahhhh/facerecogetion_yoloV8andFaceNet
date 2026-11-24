<?php

echo "== Students (id, nis, name, class) ==\n";
$students = App\Models\Student::with(['class'])->get(['id', 'nis', 'name', 'class_id']);
foreach ($students as $s) {
    echo "$s->id | $s->nis | $s->name | class_id={$s->class_id} ({$s->class?->name})\n";
}
echo "count=" . $students->count() . "\n";

echo "\n== FaceEmbeddings per student ==\n";
foreach (App\Models\FaceEmbedding::with('student')->orderBy('student_id')->get() as $e) {
    echo "student={$e->student_id} ({$e->student?->name}) | emb_id={$e->id} | dim=" . count($e->embedding) . "\n";
}
echo "\n== Classes ==\n";
App\Models\ClassModel::query()->orderBy('id')->get()->each(function ($c) {
    echo "$c->id | $c->name (grade={$c->grade}) students=" . $c->students()->count() . "\n";
});
echo "\n== Attendance count ==\n";
echo App\Models\Attendance::count() . "\n";
