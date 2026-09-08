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
import { Plus, Search, Trash2, Pencil } from "lucide-react";

export default function ClassesPage() {
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", grade: "", academic_year: "" });
  const [formLoading, setFormLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: "", grade: "", academic_year: "", status: "active" });
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.get("/admin/classes", { params: { search } })
      .then((res) => { if (!cancelled) setClasses(res.data.data.data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [search, refresh]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    try {
      await api.post("/admin/classes", form);
      setShowForm(false);
      setForm({ name: "", grade: "", academic_year: "" });
      setRefresh((r) => r + 1);
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
      setRefresh((r) => r + 1);
    } catch {
      // handle error
    }
  };

  const startEdit = (cls: ClassRoom) => {
    setEditingId(cls.id);
    setEditForm({ name: cls.name, grade: cls.grade, academic_year: cls.academic_year, status: cls.status });
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    setFormLoading(true);
    try {
      await api.put(`/admin/classes/${editingId}`, editForm);
      setEditingId(null);
      setRefresh((r) => r + 1);
    } catch {
      // handle error
    } finally {
      setFormLoading(false);
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

        {editingId && (
          <Card>
            <CardHeader><h2 className="text-lg font-semibold">Edit Kelas</h2></CardHeader>
            <CardContent>
              <form onSubmit={handleUpdate} className="grid gap-4 md:grid-cols-3">
                <Input placeholder="Nama Kelas" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required />
                <Input placeholder="Grade" value={editForm.grade} onChange={(e) => setEditForm({ ...editForm, grade: e.target.value })} required />
                <Input placeholder="Tahun Ajaran" value={editForm.academic_year} onChange={(e) => setEditForm({ ...editForm, academic_year: e.target.value })} required />
                <select className="rounded-md border bg-white px-3 py-2 text-sm" value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                  <option value="active">Aktif</option>
                  <option value="inactive">Nonaktif</option>
                </select>
                <div className="flex gap-2">
                  <Button type="submit" disabled={formLoading}>{formLoading ? "Menyimpan..." : "Simpan"}</Button>
                  <Button type="button" variant="outline" onClick={() => setEditingId(null)}>Batal</Button>
                </div>
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
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" onClick={() => startEdit(cls)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => handleDelete(cls.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
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
