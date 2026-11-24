"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import api from "@/lib/api";
import { ATTENDANCE_STATUSES, STATUS_META, formatDate, formatDateTime } from "@/lib/attendance-status";
import type { Attendance, AttendanceStatus } from "@/types";

interface Summary {
  total: number;
  hadir: number;
  izin: number;
  sakit: number;
  alpa: number;
}

const EMPTY_SUMMARY: Summary = { total: 0, hadir: 0, izin: 0, sakit: 0, alpa: 0 };

export default function AdminAttendancePage() {
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [filters, setFilters] = useState({ start_date: "", end_date: "", status: "" });

  const buildParams = () => {
    const params: Record<string, string | number> = { per_page: 20, page };
    if (filters.start_date) params.start_date = filters.start_date;
    if (filters.end_date) params.end_date = filters.end_date;
    if (filters.status) params.status = filters.status;
    return params;
  };

  useEffect(() => {
    let cancelled = false;

    api.get("/reports/attendance", { params: buildParams() })
      .then((res) => {
        if (cancelled) return;
        setAttendances(res.data.data.data ?? []);
        setLastPage(res.data.data.last_page ?? 1);
        setSummary(res.data.summary ?? EMPTY_SUMMARY);
      })
      .catch(() => {
        if (!cancelled) {
          setAttendances([]);
          setSummary(EMPTY_SUMMARY);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filters.start_date, filters.end_date, filters.status]);

  const rate = summary.total > 0 ? Math.round((summary.hadir / summary.total) * 1000) / 10 : 0;

  const updateFilter = (key: keyof typeof filters, value: string) => {
    setLoading(true);
    setFilters((previous) => ({ ...previous, [key]: value }));
    setPage(1);
  };

  const goToPage = (nextPage: number) => {
    setLoading(true);
    setPage(nextPage);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Data Absensi</h1>
          <p className="text-sm text-muted-foreground">
            Rekap seluruh catatan kehadiran. Status berasal dari pengenalan wajah, input guru, atau penutupan sesi.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Total Record", value: summary.total, className: "border-slate-200 bg-slate-50 text-slate-800" },
            { label: "Hadir", value: summary.hadir, className: STATUS_META.HADIR.badgeClass },
            { label: "Alpa", value: summary.alpa, className: STATUS_META.ALPA.badgeClass },
            { label: "Izin", value: summary.izin, className: STATUS_META.IZIN.badgeClass },
            { label: "Sakit", value: summary.sakit, className: STATUS_META.SAKIT.badgeClass },
            { label: "Kehadiran", value: `${rate}%`, className: "border-slate-200 bg-white text-slate-700" },
          ].map((item) => (
            <div key={item.label} className={`rounded-lg border px-3 py-2 ${item.className}`}>
              <p className="text-lg font-bold leading-tight">{item.value}</p>
              <p className="text-[11px] font-medium">{item.label}</p>
            </div>
          ))}
        </div>

        <Card>
          <CardHeader className="gap-3">
            <CardTitle>Semua Data Kehadiran</CardTitle>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="start-date">Dari Tanggal</label>
                <Input
                  id="start-date"
                  type="date"
                  value={filters.start_date}
                  onChange={(event) => updateFilter("start_date", event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="end-date">Sampai Tanggal</label>
                <Input
                  id="end-date"
                  type="date"
                  value={filters.end_date}
                  onChange={(event) => updateFilter("end_date", event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="status-filter">Status</label>
                <select
                  id="status-filter"
                  value={filters.status}
                  onChange={(event) => updateFilter("status", event.target.value)}
                  className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="">Semua status</option>
                  {ATTENDANCE_STATUSES.map((status) => (
                    <option key={status} value={status}>{STATUS_META[status].label}</option>
                  ))}
                </select>
              </div>
              {(filters.start_date || filters.end_date || filters.status) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setLoading(true);
                    setFilters({ start_date: "", end_date: "", status: "" });
                    setPage(1);
                  }}
                >
                  Reset Filter
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table className="min-w-[900px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Tanggal Sesi</TableHead>
                    <TableHead>NIS</TableHead>
                    <TableHead>Nama Siswa</TableHead>
                    <TableHead>Kelas</TableHead>
                    <TableHead>Mata Pelajaran</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Keterangan</TableHead>
                    <TableHead>Diubah Oleh</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                        Memuat data...
                      </TableCell>
                    </TableRow>
                  ) : attendances.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                        Tidak ada data absensi pada filter ini.
                      </TableCell>
                    </TableRow>
                  ) : (
                    attendances.map((attendance) => {
                      const meta = STATUS_META[attendance.status as AttendanceStatus] ?? STATUS_META.HADIR;

                      return (
                        <TableRow key={attendance.id}>
                          <TableCell className="whitespace-nowrap text-xs">
                            {attendance.attendance_session?.date
                              ? formatDate(attendance.attendance_session.date)
                              : attendance.detected_at
                              ? formatDate(attendance.detected_at)
                              : "-"}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{attendance.student?.nis ?? "-"}</TableCell>
                          <TableCell>
                            <p className="font-medium">{attendance.student?.name ?? "-"}</p>
                            <p className="text-[11px] text-muted-foreground">
                              NISN {attendance.student?.nisn || "-"}
                            </p>
                          </TableCell>
                          <TableCell className="text-xs">{attendance.student?.class?.name ?? "-"}</TableCell>
                          <TableCell className="text-xs">
                            {attendance.attendance_session?.schedule?.subject?.name ?? "-"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={meta.badgeClass}>{meta.label}</Badge>
                          </TableCell>
                          <TableCell className="max-w-[220px]">
                            <span className="line-clamp-2 text-xs text-muted-foreground">
                              {attendance.notes || "-"}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs">
                            {attendance.status_changed_at ? (
                              <div className="space-y-0.5">
                                <p className="font-medium">{attendance.status_changed_by_name || "Sistem"}</p>
                                <p className="text-muted-foreground">{formatDateTime(attendance.status_changed_at)}</p>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">
                                {attendance.distance != null ? "Kamera" : "Sistem"}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <Button variant="outline" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
                Sebelumnya
              </Button>
              <span className="text-sm text-muted-foreground">Halaman {page} dari {lastPage}</span>
              <Button variant="outline" disabled={page >= lastPage} onClick={() => goToPage(page + 1)}>
                Selanjutnya
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
