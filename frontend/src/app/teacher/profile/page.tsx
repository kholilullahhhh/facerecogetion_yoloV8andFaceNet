"use client";

import { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import api from "@/lib/api";

export default function TeacherProfilePage() {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: user?.teacher?.name ?? "", phone: user?.teacher?.phone ?? "" });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const teacher = user?.teacher;

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await api.put("/teacher/profile", form);
      setMessage("Profil berhasil diperbarui.");
      setEditing(false);
      const updated = { ...user, name: form.name, teacher: { ...teacher, name: form.name, phone: form.phone } };
      localStorage.setItem("user", JSON.stringify(updated));
      window.location.reload();
    } catch {
      setMessage("Gagal memperbarui profil.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-2xl font-bold">Profil Saya</h1>

        {!teacher ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">Data profil tidak ditemukan.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Data Guru</span>
                {!editing && (
                  <Button variant="outline" size="sm" onClick={() => { setForm({ name: teacher.name, phone: teacher.phone || "" }); setEditing(true); }}>Edit</Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {editing ? (
                <form onSubmit={handleUpdate} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Nama</label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Telepon</label>
                    <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </div>
                  {message && (
                    <p className={`text-sm ${message.includes("berhasil") ? "text-green-600" : "text-red-600"}`}>
                      {message}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button type="submit" disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
                    <Button type="button" variant="outline" onClick={() => { setEditing(false); setMessage(""); }}>Batal</Button>
                  </div>
                </form>
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-between border-b py-2">
                    <span className="text-muted-foreground">NIP</span>
                    <span className="font-mono">{teacher.nip}</span>
                  </div>
                  <div className="flex justify-between border-b py-2">
                    <span className="text-muted-foreground">Nama</span>
                    <span>{teacher.name}</span>
                  </div>
                  <div className="flex justify-between border-b py-2">
                    <span className="text-muted-foreground">Email</span>
                    <span>{teacher.user?.email}</span>
                  </div>
                  <div className="flex justify-between border-b py-2">
                    <span className="text-muted-foreground">Telepon</span>
                    <span>{teacher.phone || "-"}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-muted-foreground">Status</span>
                    <span>{teacher.status === "active" ? "Aktif" : "Nonaktif"}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
