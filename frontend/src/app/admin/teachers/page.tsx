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
import type { Teacher } from "@/types";
import { Plus, Search, Trash2, Pencil } from "lucide-react";

export default function TeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nip: "", name: "", phone: "", email: "", password: "" });
  const [formLoading, setFormLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ nip: "", name: "", phone: "", status: "active" });
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.get("/admin/teachers", { params: { search } })
      .then((res) => { if (!cancelled) setTeachers(res.data.data.data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [search, refresh]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    try {
      await api.post("/admin/teachers", form);
      setShowForm(false);
      setForm({ nip: "", name: "", phone: "", email: "", password: "" });
      setRefresh((r) => r + 1);
    } catch {
      // handle error
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Yakin ingin menghapus guru ini?")) return;
    try {
      await api.delete(`/admin/teachers/${id}`);
      setRefresh((r) => r + 1);
    } catch {
      // handle error
    }
  };

  const startEdit = (teacher: Teacher) => {
    setEditingId(teacher.id);
    setEditForm({ nip: teacher.nip, name: teacher.name, phone: teacher.phone || "", status: teacher.status });
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    setFormLoading(true);
    try {
      await api.put(`/admin/teachers/${editingId}`, editForm);
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold">Manajemen Guru</h1>
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus className="mr-2 h-4 w-4" />
            {showForm ? "Batal" : "Tambah Guru"}
          </Button>
        </div>

        {showForm && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Tambah Guru Baru</h2>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                <Input placeholder="NIP" value={form.nip} onChange={(e) => setForm({ ...form, nip: e.target.value })} required />
                <Input placeholder="Nama Lengkap" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                <Input placeholder="Telepon" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                <Input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                <Input placeholder="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
                <Button type="submit" disabled={formLoading}>{formLoading ? "Menyimpan..." : "Simpan"}</Button>
              </form>
            </CardContent>
          </Card>
        )}

        {editingId && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Edit Guru</h2>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdate} className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                <Input placeholder="NIP" value={editForm.nip} onChange={(e) => setEditForm({ ...editForm, nip: e.target.value })} required />
                <Input placeholder="Nama Lengkap" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required />
                <Input placeholder="Telepon" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
                <select className="rounded-md border bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100" value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
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
              <Input placeholder="Cari guru..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>NIP</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Telepon</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center">Memuat data...</TableCell></TableRow>
                ) : teachers.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center">Tidak ada data guru</TableCell></TableRow>
                ) : (
                  teachers.map((teacher) => (
                    <TableRow key={teacher.id}>
                      <TableCell className="font-mono">{teacher.nip}</TableCell>
                      <TableCell>{teacher.name}</TableCell>
                      <TableCell>{teacher.user?.email}</TableCell>
                      <TableCell>{teacher.phone || "-"}</TableCell>
                      <TableCell>
                        <Badge variant={teacher.status === "active" ? "default" : "secondary"}>
                          {teacher.status === "active" ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" onClick={() => startEdit(teacher)} aria-label="Edit guru">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => handleDelete(teacher.id)} aria-label="Hapus guru">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
