"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import api from "@/lib/api";
import type { ClassRoom } from "@/types";

export default function CreateStudentPage() {
  const router = useRouter();
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [form, setForm] = useState({
    nis: "", nisn: "", name: "", gender: "L", class_id: "", birth_date: "",
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/admin/classes").then((res) => setClasses(res.data.data.data));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("nis", form.nis);
      if (form.nisn) formData.append("nisn", form.nisn);
      formData.append("name", form.name);
      formData.append("gender", form.gender);
      formData.append("class_id", form.class_id);
      if (form.birth_date) formData.append("birth_date", form.birth_date);
      if (photo) formData.append("photo", photo);

      await api.post("/admin/students", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      router.push("/admin/students");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Gagal menyimpan siswa";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-2xl font-bold">Tambah Siswa Baru</h1>
        <Card>
          <CardHeader><CardTitle>Data Siswa</CardTitle></CardHeader>
          <CardContent>
            {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-sm font-medium">NIS *</label>
                  <Input value={form.nis} onChange={(e) => setForm({ ...form, nis: e.target.value })} required />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">NISN</label>
                  <Input value={form.nisn} onChange={(e) => setForm({ ...form, nisn: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Nama Lengkap *</label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Jenis Kelamin *</label>
                  <select className="w-full rounded-md border bg-white px-3 py-2 text-sm" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} required>
                    <option value="L">Laki-laki</option>
                    <option value="P">Perempuan</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Kelas *</label>
                  <select className="w-full rounded-md border bg-white px-3 py-2 text-sm" value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })} required>
                    <option value="">Pilih Kelas</option>
                    {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Tanggal Lahir</label>
                <Input type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Foto</label>
                <Input type="file" accept="image/jpeg,image/png" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
              </div>
              <div className="flex gap-4">
                <Button type="submit" disabled={loading}>{loading ? "Menyimpan..." : "Simpan"}</Button>
                <Button type="button" variant="outline" onClick={() => router.back()}>Batal</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
