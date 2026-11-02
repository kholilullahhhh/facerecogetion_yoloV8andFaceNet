<?php

// Dump all face embeddings from MySQL to all_embeddings.json next to this file.
// Run from backend/: php artisan tinker --execute "require '../ai-service/scripts/dump_all_embeddings.php';"

$rows = App\Models\FaceEmbedding::get(['student_id', 'embedding'])
    ->map(fn ($e) => ['student_id' => $e->student_id, 'embedding' => $e->embedding])
    ->toArray();

$out = __DIR__ . '/all_embeddings.json';
file_put_contents($out, json_encode($rows));
echo 'rows=' . count($rows) . ' bytes=' . filesize($out);
