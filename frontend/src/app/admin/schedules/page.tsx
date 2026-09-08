"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import api from "@/lib/api";
import type { Schedule, ClassRoom, Subject, Teacher } from "@/types";
import { Plus, Trash2 } from "lucide-react";

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ class_id: "", subject_id: "", teacher_id: "", day: "Senin", start_time: "", end_time: "" });
  const [formLoading, setFormLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get("/admin/schedules"),
      api.get("/admin/classes"),
      api.get("/admin/subjects"),
      api.get("/admin/teachers"),
    ]).then(([schRes, clsRes, subRes, teaRes]) => {
      if (!cancelled) {
        setSchedules(schRes.data.data.data);
        setClasses(clsRes.data.data.data);
        setSubjects(subRes.data.data.data);
        setTeachers(teaRes.data.data.data);
      }
    }).catch(() => {}).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refresh]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    try {
      await api.post("/admin/schedules", form);
      setShowForm(false);
      setForm({ class_id: "", subject_id: "", teacher_id: "", day: "Senin", start_time: "", end_time: "" });
      setRefresh((r) => r + 1);
    } catch {
      // handle error
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Yakin ingin menghapus jadwal ini?")) return;
    try {
      await api.delete(`/admin/schedules/${id}`);
      setRefresh((r) => r + 1);
    } catch {
      // handle error
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Manajemen Jadwal</h1>
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus className="mr-2 h-4 w-4" />
            {showForm ? "Batal" : "Tambah Jadwal"}
          </Button>
        </div>

        {showForm && (
          <Card>
            <CardHeader><h2 className="text-lg font-semibold">Tambah Jadwal Baru</h2></CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-3">
                <select className="rounded-md border bg-white px-3 py-2 text-sm" value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })} required>
                  <option value="">Pilih Kelas</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select className="rounded-md border bg-white px-3 py-2 text-sm" value={form.subject_id} onChange={(e) => setForm({ ...form, subject_id: e.target.value })} required>
                  <option value="">Pilih Mata Pelajaran</option>
                  {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select className="rounded-md border bg-white px-3 py-2 text-sm" value={form.teacher_id} onChange={(e) => setForm({ ...form, teacher_id: e.target.value })} required>
                  <option value="">Pilih Guru</option>
                  {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <select className="rounded-md border bg-white px-3 py-2 text-sm" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} required>
                  {["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"].map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                <Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} required />
                <Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} required />
                <Button type="submit" disabled={formLoading}>{formLoading ? "Menyimpan..." : "Simpan"}</Button>
              </form>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hari</TableHead>
                  <TableHead>Jam</TableHead>
                  <TableHead>Kelas</TableHead>
                  <TableHead>Mata Pelajaran</TableHead>
                  <TableHead>Guru</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="text-center">Memuat data...</TableCell></TableRow>
                ) : schedules.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center">Tidak ada data jadwal</TableCell></TableRow>
                ) : (
                  schedules.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{s.day}</TableCell>
                      <TableCell>{s.start_time} - {s.end_time}</TableCell>
                      <TableCell>{s.class?.name}</TableCell>
                      <TableCell>{s.subject?.name}</TableCell>
                      <TableCell>{s.teacher?.name}</TableCell>
                      <TableCell>
                        <Badge variant={s.status === "active" ? "default" : "secondary"}>
                          {s.status === "active" ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="destructive" size="sm" onClick={() => handleDelete(s.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
