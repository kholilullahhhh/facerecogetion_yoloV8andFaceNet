"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import api from "@/lib/api";
import type { AttendanceSession } from "@/types";

export default function TeacherAttendanceHistoryPage() {
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    api.get("/attendance/sessions", { params: { per_page: 10, page } })
      .then((res) => {
        if (!cancelled) {
          const data = res.data.data;
          setSessions(data.data || []);
          setLastPage(data.last_page);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [page]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Riwayat Absensi</h1>

        <Card>
          <CardHeader>
            <CardTitle>Sesi Absensi</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Mata Pelajaran</TableHead>
                  <TableHead>Kelas</TableHead>
                  <TableHead>Jam Mulai</TableHead>
                  <TableHead>Jam Selesai</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Jumlah Absen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="text-center">Memuat data...</TableCell></TableRow>
                ) : sessions.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center">Tidak ada riwayat absensi</TableCell></TableRow>
                ) : (
                  sessions.map((session) => (
                    <TableRow key={session.id}>
                      <TableCell>{new Date(session.date).toLocaleDateString("id-ID", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</TableCell>
                      <TableCell>{session.schedule?.subject?.name ?? "-"}</TableCell>
                      <TableCell>{session.schedule?.class?.name ?? "-"}</TableCell>
                      <TableCell>{session.start_time}</TableCell>
                      <TableCell>{session.end_time ?? "-"}</TableCell>
                      <TableCell>
                        <Badge variant={session.status === "active" ? "default" : "secondary"}>
                          {session.status === "active" ? "Aktif" : "Selesai"}
                        </Badge>
                      </TableCell>
                      <TableCell>{session.attendances?.length ?? 0}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            {lastPage > 1 && (
              <div className="mt-4 flex justify-between">
                <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Sebelumnya</Button>
                <span className="text-sm text-muted-foreground">Halaman {page} dari {lastPage}</span>
                <Button variant="outline" disabled={page >= lastPage} onClick={() => setPage(page + 1)}>Selanjutnya</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
