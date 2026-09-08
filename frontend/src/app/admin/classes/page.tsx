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
import type { ClassRoom } from "@/types";
import { Plus, Search, Trash2 } from "lucide-react";

export default function ClassesPage() {
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", grade: "", academic_year: "" });
  const [formLoading, setFormLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    api.get("/admin/classes", { params: { search }, signal: controller.signal })
      .then((res) => { if (!cancelled) setClasses(res.data.data.data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; controller.abort(); };
  }, [search]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    try {
      await api.post("/admin/classes", form);
      setShowForm(false);
      setForm({ name: "", grade: "", academic_year: "" });
      fetchClasses();
    } catch {
      // handle error
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Yakin ingin menghapus kelas ini?")) return;
    try {
      await api.delete(`/admin/classes/${id}`);
      fetchClasses();
    } catch {
      // handle error
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Manajemen Kelas</h1>
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus className="mr-2 h-4 w-4" />
            {showForm ? "Batal" : "Tambah Kelas"}
          </Button>
        </div>

        {showForm && (
          <Card>
            <CardHeader><h2 className="text-lg font-semibold">Tambah Kelas Baru</h2></CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-3">
                <Input placeholder="Nama Kelas" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                <Input placeholder="Grade (contoh: 7)" value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} required />
                <Input placeholder="Tahun Ajaran (contoh: 2024/2025)" value={form.academic_year} onChange={(e) => setForm({ ...form, academic_year: e.target.value })} required />
                <Button type="submit" disabled={formLoading}>{formLoading ? "Menyimpan..." : "Simpan"}</Button>
              </form>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input placeholder="Cari kelas..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Tahun Ajaran</TableHead>
                  <TableHead>Jumlah Siswa</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center">Memuat data...</TableCell></TableRow>
                ) : classes.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center">Tidak ada data kelas</TableCell></TableRow>
                ) : (
                  classes.map((cls) => (
                    <TableRow key={cls.id}>
                      <TableCell className="font-medium">{cls.name}</TableCell>
                      <TableCell>{cls.grade}</TableCell>
                      <TableCell>{cls.academic_year}</TableCell>
                      <TableCell>{cls.students_count ?? 0}</TableCell>
                      <TableCell>
                        <Badge variant={cls.status === "active" ? "default" : "secondary"}>
                          {cls.status === "active" ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="destructive" size="sm" onClick={() => handleDelete(cls.id)}>
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
