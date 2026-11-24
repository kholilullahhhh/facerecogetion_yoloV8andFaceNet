<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The product now has exactly four statuses. Existing late records keep
        // their attendance but become HADIR instead of being dropped.
        DB::table('attendances')
            ->where('status', 'TERLAMBAT')
            ->update(['status' => 'HADIR']);

        Schema::table('attendances', function (Blueprint $table) {
            $table->enum('status', ['HADIR', 'IZIN', 'SAKIT', 'ALPA'])
                ->default('ALPA')
                ->change();
            $table->text('notes')->nullable()->after('status');
            $table->foreignId('status_changed_by')
                ->nullable()
                ->after('notes')
                ->constrained('users')
                ->nullOnDelete();
            $table->timestamp('status_changed_at')->nullable()->after('status_changed_by');
        });

        Schema::create('attendance_status_histories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('attendance_id')->constrained()->cascadeOnDelete();
            $table->string('previous_status')->nullable();
            $table->string('status');
            $table->text('notes')->nullable();
            $table->string('source', 30)->default('MANUAL');
            $table->foreignId('changed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('changed_at');
            $table->timestamps();

            $table->index(['attendance_id', 'changed_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attendance_status_histories');

        Schema::table('attendances', function (Blueprint $table) {
            $table->dropConstrainedForeignId('status_changed_by');
            $table->dropColumn(['notes', 'status_changed_at']);
            $table->enum('status', ['HADIR', 'TERLAMBAT', 'IZIN', 'SAKIT', 'ALPA'])
                ->default('HADIR')
                ->change();
        });
    }
};
