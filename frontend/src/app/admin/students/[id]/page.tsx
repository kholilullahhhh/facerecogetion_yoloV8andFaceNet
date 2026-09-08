"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import api from "@/lib/api";
import type { Student } from "@/types";
import { ArrowLeft, Scan, Trash2, Pencil } from "lucide-react";
import Link from "next/link";

export default function StudentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/admin/students/${params.id}`)
      .then((res) => setStudent(res.data.data))
      .catch(() => router.push("/admin/students"))
      .finally(() => setLoading(false));
  }, [params.id, router]);

  const handleDeleteEmbedding = async (embeddingId: number) => {
    if (!confirm("Yakin ingin menghapus embedding ini?")) return;
    try {
      await api.delete(`/admin/students/${params.id}/embeddings/${embeddingId}`);
      setStudent((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          face_embeddings: prev.face_embeddings?.filter((e) => e.id !== embeddingId) ?? [],
        };
      });
    } catch {
      // handle error
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </DashboardLayout>
    );
  }

  if (!student) return null;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/admin/students"><Button variant="outline" size="sm"><ArrowLeft className="mr-2 h-4 w-4" />Kembali</Button></Link>
          <h1 className="text-2xl font-bold">{student.name}</h1>
          <Link href={`/admin/students/${student.id}/edit`}>
            <Button variant="outline" size="sm"><Pencil className="mr-2 h-4 w-4" />Edit</Button>
          </Link>
          <Link href={`/admin/students/${student.id}/face-registration`}>
            <Button size="sm"><Scan className="mr-2 h-4 w-4" />Daftarkan Wajah</Button>
          </Link>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Data Siswa</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between"><span className="text-muted-foreground">NIS</span><span className="font-mono">{student.nis}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">NISN</span><span className="font-mono">{student.nisn || "-"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Jenis Kelamin</span><span>{student.gender === "L" ? "Laki-laki" : "Perempuan"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Kelas</span><span>{student.class?.name}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Status</span>
                <Badge variant={student.status === "active" ? "default" : "secondary"}>
                  {student.status === "active" ? "Aktif" : "Nonaktif"}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Embedding Wajah ({student.face_embeddings?.length ?? 0})</CardTitle>
            </CardHeader>
            <CardContent>
              {!student.face_embeddings || student.face_embeddings.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada embedding wajah terdaftar.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Dimensi</TableHead>
                      <TableHead>Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {student.face_embeddings.map((emb) => (
                      <TableRow key={emb.id}>
                        <TableCell className="font-mono">{emb.id}</TableCell>
                        <TableCell>{emb.model_name}</TableCell>
                        <TableCell>{emb.embedding?.length ?? 0}D</TableCell>
                        <TableCell>
                          <Button variant="destructive" size="sm" onClick={() => handleDeleteEmbedding(emb.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
