<?php

echo "== Students (id | nis | name | class) ==\n";
$students = App\Models\Student::with(['class'])->orderBy('id')->get(['id', 'nis', 'name', 'class_id']);
foreach ($students as $s) {
    echo "$s->id | {$s->nis} | {$s->name} | class={$s->class_id} ({$s->class?->name})\n";
}
echo "student_count=" . $students->count() . "\n";

echo "\n== Embedding count per student ==\n";
$per = App\Models\FaceEmbedding::with('student:id,name')->selectRaw('student_id, COUNT(*) as cnt')->groupBy('student_id')->get();
foreach ($per as $p) {
    echo "student={$p->student_id} ({$p->student?->name}) embeddings={$p->cnt}\n";
}
echo "students_with_embeddings=" . $per->count() . "\n";

echo "\n== Students without embeddings ==\n";
foreach ($students as $s) {
    if (! $s->faceEmbeddings->isNotEmpty()) {
        echo "id={$s->id} name={$s->name} class_id={$s->class_id}\n";
    }
}

echo "\n== Attendance count ==\n";
echo App\Models\Attendance::count() . "\n";
