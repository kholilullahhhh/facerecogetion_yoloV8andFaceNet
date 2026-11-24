"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import api from "@/lib/api";
import { STATUS_META, formatDate } from "@/lib/attendance-status";
import type { AttendanceSession, DashboardSummary } from "@/types";
import { Camera, Clock, BookOpen, UserCheck, UserX, FileText, HeartPulse } from "lucide-react";

export default function TeacherDashboard() {
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    Promise.allSettled([
      api.get("/attendance/sessions", { params: { per_page: 50 } }),
      api.get("/dashboard/summary"),
    ]).then(([sessionResult, summaryResult]) => {
      if (cancelled) return;

      if (sessionResult.status === "fulfilled") {
        const data = sessionResult.value.data.data.data || sessionResult.value.data.data;
        setSessions(Array.isArray(data) ? data : []);
      }

      if (summaryResult.status === "fulfilled") {
        setSummary(summaryResult.value.data.data as DashboardSummary);
      }

      setLoading(false);
    });

    return () => { cancelled = true; };
  }, []);

  const activeSessions = useMemo(
    () => sessions.filter((session) => session.status === "active"),
    [sessions]
  );

  const statusCards = [
    { label: "Hadir", value: summary?.present ?? 0, icon: UserCheck, className: STATUS_META.HADIR.badgeClass },
    { label: "Alpa", value: summary?.absent ?? 0, icon: UserX, className: STATUS_META.ALPA.badgeClass },
    { label: "Izin", value: summary?.excused ?? 0, icon: FileText, className: STATUS_META.IZIN.badgeClass },
    { label: "Sakit", value: summary?.sick ?? 0, icon: HeartPulse, className: STATUS_META.SAKIT.badgeClass },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Dashboard Guru</h1>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Hari Ini</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {new Date().toLocaleDateString("id-ID", { weekday: "long" })}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date().toLocaleDateString("id-ID", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Sesi Aktif</CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeSessions.length}</div>
              <p className="mt-1 text-xs text-muted-foreground">
                {loading ? "Memuat sesi..." : `${sessions.length} sesi terbaru`}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Mulai Absensi</CardTitle>
              <Camera className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <Link href="/teacher/attendance">
                <Button className="w-full">
                  <Camera className="mr-2 h-4 w-4" />
                  Buka Kamera
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="gap-1">
            <CardTitle className="text-sm">Ringkasan Kehadiran Hari Ini</CardTitle>
            <p className="text-xs text-muted-foreground">
              Hanya sesi absensi milik Anda. Persentase kehadiran = Hadir dibagi seluruh record status.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {statusCards.map((card) => {
                const Icon = card.icon;
                return (
                  <div key={card.label} className={`rounded-lg border px-3 py-2 ${card.className}`}>
                    <div className="flex items-center justify-between">
                      <p className="text-xl font-bold leading-tight">{card.value}</p>
                      <Icon className="h-4 w-4 opacity-70" />
                    </div>
                    <p className="text-[11px] font-medium">{card.label}</p>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
              <span className="text-muted-foreground">
                Total record hari ini: <span className="font-semibold text-foreground">{summary?.today_attendance ?? 0}</span>
              </span>
              <span className="text-muted-foreground">
                Tingkat kehadiran: <span className="font-semibold text-foreground">{summary?.attendance_rate ?? 0}%</span>
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Sesi Absensi Terbaru</CardTitle>
            <Link href="/teacher/attendance">
              <Button variant="ghost" size="sm" className="h-7 text-xs">
                Kelola Absensi
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Memuat sesi absensi...</p>
            ) : sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Belum ada sesi absensi. Mulai absensi dari halaman Absensi.
              </p>
            ) : (
              <div className="space-y-3">
                {sessions.slice(0, 6).map((session) => {
                  const isActive = session.status === "active";

                  return (
                    <div
                      key={session.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-4"
                    >
                      <div>
                        <p className="font-medium">
                          {session.schedule?.subject?.name} - {session.schedule?.class?.name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(session.date)} · {session.start_time}
                          {session.end_time ? ` - ${session.end_time}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={isActive ? "default" : "secondary"}>
                          {isActive ? "Aktif" : "Selesai"}
                        </Badge>
                        <Link href={`/teacher/attendance?session=${session.id}`}>
                          <Button variant="outline" size="sm">
                            {isActive ? "Mulai" : "Lihat"}
                          </Button>
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
