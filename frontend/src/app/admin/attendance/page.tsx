"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import api from "@/lib/api";
import type { Attendance } from "@/types";

export default function AdminAttendancePage() {
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    api.get("/reports/attendance", { params: { per_page: 20, page } })
      .then((res) => {
        if (!cancelled) {
          setAttendances(res.data.data.data);
          setLastPage(res.data.data.last_page);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [page]);

  const statusColor = (status: string) => {
    switch (status) {
      case "HADIR": return "default";
      case "TERLAMBAT": return "secondary";
      case "IZIN": return "outline";
      case "SAKIT": return "destructive";
      case "ALPA": return "destructive";
      default: return "secondary";
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Data Absensi</h1>
        <Card>
          <CardHeader>
            <CardTitle>Semua Data Kehadiran</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>NIS</TableHead>
                  <TableHead>Nama Siswa</TableHead>
                  <TableHead>Mata Pelajaran</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Distance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center">Memuat data...</TableCell></TableRow>
                ) : attendances.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center">Tidak ada data absensi</TableCell></TableRow>
                ) : (
                  attendances.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>{a.detected_at ? new Date(a.detected_at).toLocaleDateString("id-ID") : "-"}</TableCell>
                      <TableCell className="font-mono">{a.student?.nis}</TableCell>
                      <TableCell>{a.student?.name}</TableCell>
                      <TableCell>{a.attendance_session?.schedule?.subject?.name ?? "-"}</TableCell>
                      <TableCell>
                        <Badge variant={statusColor(a.status) as "default" | "secondary" | "destructive" | "outline"}>{a.status}</Badge>
                      </TableCell>
                      <TableCell>{a.distance?.toFixed(4) ?? "-"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            </div>
            <div className="mt-4 flex justify-between">
              <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Sebelumnya</Button>
              <span className="text-sm text-muted-foreground">Halaman {page} dari {lastPage}</span>
              <Button variant="outline" disabled={page >= lastPage} onClick={() => setPage(page + 1)}>Selanjutnya</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
