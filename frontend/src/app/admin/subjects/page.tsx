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
import type { Subject } from "@/types";
import { Plus, Search, Trash2, Pencil } from "lucide-react";

export default function SubjectsPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", code: "" });
  const [formLoading, setFormLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: "", code: "", status: "active" });
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.get("/admin/subjects", { params: { search } })
      .then((res) => { if (!cancelled) setSubjects(res.data.data.data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [search, refresh]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    try {
      await api.post("/admin/subjects", form);
      setShowForm(false);
      setForm({ name: "", code: "" });
      setRefresh((r) => r + 1);
    } catch {
      // handle error
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Yakin ingin menghapus mata pelajaran ini?")) return;
    try {
      await api.delete(`/admin/subjects/${id}`);
      setRefresh((r) => r + 1);
    } catch {
      // handle error
    }
  };

  const startEdit = (subject: Subject) => {
    setEditingId(subject.id);
    setEditForm({ name: subject.name, code: subject.code, status: subject.status });
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    setFormLoading(true);
    try {
      await api.put(`/admin/subjects/${editingId}`, editForm);
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
          <h1 className="text-2xl font-bold">Manajemen Mata Pelajaran</h1>
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus className="mr-2 h-4 w-4" />
            {showForm ? "Batal" : "Tambah Mata Pelajaran"}
          </Button>
        </div>

        {showForm && (
          <Card>
            <CardHeader><h2 className="text-lg font-semibold">Tambah Mata Pelajaran Baru</h2></CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-2">
                <Input placeholder="Nama Mata Pelajaran" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                <Input placeholder="Kode (contoh: MTK)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
                <Button type="submit" disabled={formLoading}>{formLoading ? "Menyimpan..." : "Simpan"}</Button>
              </form>
            </CardContent>
          </Card>
        )}

        {editingId && (
          <Card>
            <CardHeader><h2 className="text-lg font-semibold">Edit Mata Pelajaran</h2></CardHeader>
            <CardContent>
              <form onSubmit={handleUpdate} className="grid gap-4 md:grid-cols-2">
                <Input placeholder="Nama Mata Pelajaran" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required />
                <Input placeholder="Kode" value={editForm.code} onChange={(e) => setEditForm({ ...editForm, code: e.target.value })} required />
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
              <Input placeholder="Cari mata pelajaran..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kode</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={4} className="text-center">Memuat data...</TableCell></TableRow>
                ) : subjects.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center">Tidak ada data mata pelajaran</TableCell></TableRow>
                ) : (
                  subjects.map((subject) => (
                    <TableRow key={subject.id}>
                      <TableCell className="font-mono">{subject.code}</TableCell>
                      <TableCell>{subject.name}</TableCell>
                      <TableCell>
                        <Badge variant={subject.status === "active" ? "default" : "secondary"}>
                          {subject.status === "active" ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" onClick={() => startEdit(subject)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => handleDelete(subject.id)}>
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
