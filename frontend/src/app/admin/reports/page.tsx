"use client";

import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import api from "@/lib/api";
import { STATUS_META } from "@/lib/attendance-status";
import type { ClassRoom, ReportSummary } from "@/types";
import { Download, Search } from "lucide-react";

type Period = "daily" | "weekly" | "monthly";

const PERIOD_OPTIONS: Array<{ value: Period; label: string }> = [
  { value: "daily", label: "Harian" },
  { value: "weekly", label: "Mingguan" },
  { value: "monthly", label: "Bulanan" },
];

function firstDayOfMonth(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AdminReportsPage() {
  const [period, setPeriod] = useState<Period>("daily");
  const [filters, setFilters] = useState({
    start_date: firstDayOfMonth(),
    end_date: today(),
    class_id: "",
  });
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [csv, setCsv] = useState("");
  const [exporting, setExporting] = useState(false);
  const [studentQuery, setStudentQuery] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const params = useMemo(() => {
    const next: Record<string, string> = {
      period,
      start_date: filters.start_date,
      end_date: filters.end_date,
    };
    if (filters.class_id) next.class_id = filters.class_id;
    return next;
  }, [period, filters]);

  const updateFilter = (key: "start_date" | "end_date" | "class_id", value: string) => {
    setLoading(true);
    setFilters((previous) => ({ ...previous, [key]: value }));
  };

  const applyFilters = () => {
    setLoading(true);
    setError(null);
    setReloadKey((value) => value + 1);
  };

  useEffect(() => {
    api.get("/admin/classes", { params: { per_page: 100 } })
      .then((res) => {
        const data = res.data.data.data || res.data.data;
        setClasses(Array.isArray(data) ? data : []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;

    api.get("/reports/summary", { params })
      .then((res) => {
        if (cancelled) return;
        setSummary(res.data.data as ReportSummary);
        setError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setSummary(null);
        setError("Gagal memuat rekap absensi. Periksa filter tanggal lalu coba lagi.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [params, reloadKey]);

  const handleExport = async () => {
    setExporting(true);
    setError(null);

    try {
      const res = await api.get("/reports/attendance/export", { params });
      setCsv(res.data.data.csv);
    } catch {
      setError("Gagal menyiapkan file export.");
    } finally {
      setExporting(false);
    }
  };

  const downloadCsv = () => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `laporan-absensi-${filters.start_date}-${filters.end_date}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const totals = summary?.totals;
  const visibleStudents = useMemo(() => {
    const query = studentQuery.trim().toLowerCase();
    const rows = summary?.by_student ?? [];
    if (!query) return rows;

    return rows.filter((student) => (
      student.name.toLowerCase().includes(query)
      || student.nis.toLowerCase().includes(query)
      || (student.nisn ?? "").toLowerCase().includes(query)
    ));
  }, [summary, studentQuery]);

  const summaryCards = [
    { label: "Total Record", value: totals?.total ?? 0, className: "border-slate-200 bg-slate-50 text-slate-800" },
    { label: "Hadir", value: totals?.hadir ?? 0, className: STATUS_META.HADIR.badgeClass },
    { label: "Alpa", value: totals?.alpa ?? 0, className: STATUS_META.ALPA.badgeClass },
    { label: "Izin", value: totals?.izin ?? 0, className: STATUS_META.IZIN.badgeClass },
    { label: "Sakit", value: totals?.sakit ?? 0, className: STATUS_META.SAKIT.badgeClass },
    { label: "Kehadiran", value: `${totals?.attendance_rate ?? 0}%`, className: "border-slate-200 bg-white text-slate-700" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Laporan Absensi</h1>
          <p className="text-sm text-muted-foreground">
            Rekap harian, mingguan, dan bulanan. Persentase kehadiran dihitung dari jumlah Hadir dibagi seluruh record status.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filter Laporan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {PERIOD_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={period === option.value ? "default" : "outline"}
                  className="h-7 px-2.5 text-xs"
                  onClick={() => {
                    setLoading(true);
                    setPeriod(option.value);
                  }}
                >
                  {option.label}
                </Button>
              ))}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="report-start">Dari Tanggal</label>
                <Input
                  id="report-start"
                  type="date"
                  value={filters.start_date}
                  onChange={(event) => updateFilter("start_date", event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="report-end">Sampai Tanggal</label>
                <Input
                  id="report-end"
                  type="date"
                  value={filters.end_date}
                  onChange={(event) => updateFilter("end_date", event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="report-class">Kelas</label>
                <select
                  id="report-class"
                  value={filters.class_id}
                  onChange={(event) => updateFilter("class_id", event.target.value)}
                  className="h-9 min-w-40 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="">Semua kelas</option>
                  {classes.map((classRoom) => (
                    <option key={classRoom.id} value={classRoom.id}>{classRoom.name}</option>
                  ))}
                </select>
              </div>
              <Button variant="outline" onClick={applyFilters} disabled={loading}>
                {loading ? "Memuat..." : "Terapkan"}
              </Button>
              <Button variant="outline" onClick={() => void handleExport()} disabled={exporting}>
                <Download className="mr-2 h-4 w-4" />
                {exporting ? "Menyiapkan..." : "Export CSV"}
              </Button>
            </div>

            {error && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </p>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {summaryCards.map((card) => (
            <div key={card.label} className={`rounded-lg border px-3 py-2 ${card.className}`}>
              <p className="text-lg font-bold leading-tight">{card.value}</p>
              <p className="text-[11px] font-medium">{card.label}</p>
            </div>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Rekap per Periode</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Periode</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Hadir</TableHead>
                    <TableHead className="text-right">Alpa</TableHead>
                    <TableHead className="text-right">Izin</TableHead>
                    <TableHead className="text-right">Sakit</TableHead>
                    <TableHead className="text-right">Kehadiran</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                        Memuat rekap...
                      </TableCell>
                    </TableRow>
                  ) : !summary || summary.periods.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                        Belum ada data absensi pada periode ini.
                      </TableCell>
                    </TableRow>
                  ) : (
                    summary.periods.map((row) => (
                      <TableRow key={row.key}>
                        <TableCell className="text-sm font-medium">{row.label}</TableCell>
                        <TableCell className="text-right text-sm">{row.total}</TableCell>
                        <TableCell className="text-right text-sm text-emerald-700">{row.hadir}</TableCell>
                        <TableCell className="text-right text-sm text-red-700">{row.alpa}</TableCell>
                        <TableCell className="text-right text-sm text-blue-700">{row.izin}</TableCell>
                        <TableCell className="text-right text-sm text-orange-700">{row.sakit}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{row.attendance_rate}%</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Rekap per Kelas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kelas</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Hadir</TableHead>
                      <TableHead className="text-right">Alpa</TableHead>
                      <TableHead className="text-right">Izin</TableHead>
                      <TableHead className="text-right">Sakit</TableHead>
                      <TableHead className="text-right">Kehadiran</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!summary || summary.by_class.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                          Belum ada data kelas.
                        </TableCell>
                      </TableRow>
                    ) : (
                      summary.by_class.map((row) => (
                        <TableRow key={row.class_id ?? row.class_name}>
                          <TableCell className="text-sm font-medium">{row.class_name}</TableCell>
                          <TableCell className="text-right text-sm">{row.total}</TableCell>
                          <TableCell className="text-right text-sm text-emerald-700">{row.hadir}</TableCell>
                          <TableCell className="text-right text-sm text-red-700">{row.alpa}</TableCell>
                          <TableCell className="text-right text-sm text-blue-700">{row.izin}</TableCell>
                          <TableCell className="text-right text-sm text-orange-700">{row.sakit}</TableCell>
                          <TableCell className="text-right text-sm font-medium">{row.attendance_rate}%</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="gap-3">
              <CardTitle>Rekap per Siswa</CardTitle>
              <div className="relative max-w-xs">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={studentQuery}
                  onChange={(event) => setStudentQuery(event.target.value)}
                  placeholder="Cari nama atau NIS..."
                  className="pl-8"
                />
              </div>
            </CardHeader>
            <CardContent>
              <div className="max-h-[420px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Siswa</TableHead>
                      <TableHead>Kelas</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Hadir</TableHead>
                      <TableHead className="text-right">Alpa</TableHead>
                      <TableHead className="text-right">Izin</TableHead>
                      <TableHead className="text-right">Sakit</TableHead>
                      <TableHead className="text-right">Kehadiran</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleStudents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                          {summary && summary.by_student.length > 0
                            ? "Tidak ada siswa yang cocok dengan pencarian."
                            : "Belum ada data siswa."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      visibleStudents.map((row) => (
                        <TableRow key={row.student_id}>
                          <TableCell>
                            <p className="text-sm font-medium">{row.name}</p>
                            <p className="text-[11px] text-muted-foreground">
                              NIS {row.nis} · NISN {row.nisn || "-"}
                            </p>
                          </TableCell>
                          <TableCell className="text-xs">{row.class_name ?? "-"}</TableCell>
                          <TableCell className="text-right text-sm">{row.total}</TableCell>
                          <TableCell className="text-right text-sm text-emerald-700">{row.hadir}</TableCell>
                          <TableCell className="text-right text-sm text-red-700">{row.alpa}</TableCell>
                          <TableCell className="text-right text-sm text-blue-700">{row.izin}</TableCell>
                          <TableCell className="text-right text-sm text-orange-700">{row.sakit}</TableCell>
                          <TableCell className="text-right text-sm font-medium">{row.attendance_rate}%</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        {csv && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Hasil Export</CardTitle>
              <Button size="sm" onClick={downloadCsv}>
                <Download className="mr-2 h-4 w-4" />Download CSV
              </Button>
            </CardHeader>
            <CardContent>
              <pre className="max-h-96 overflow-auto rounded-lg bg-gray-50 p-4 text-xs">{csv}</pre>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
