"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { Camera, Clock, BookOpen } from "lucide-react";

export default function TeacherDashboard() {
  const [schedules, setSchedules] = useState([]);

  useEffect(() => {
    api.get("/attendance/sessions").then((res) => {
      setSchedules(res.data.data.data || []);
    });
  }, []);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Dashboard Guru</h1>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Hari Ini</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {new Date().toLocaleDateString("id-ID", { weekday: "long" })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Sesi Aktif</CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {schedules.filter((s: { status: string }) => s.status === "active").length}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Mulai Absensi</CardTitle>
              <Camera className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <Link href="/teacher/attendance">
                <Button className="w-full">
                  <Camera className="mr-2 h-4 w-4" />
                  Buka Kamera
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sesi Absensi Hari Ini</CardTitle>
          </CardHeader>
          <CardContent>
            {schedules.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Tidak ada sesi absensi hari ini
              </p>
            ) : (
              <div className="space-y-3">
                {schedules.map((session: { id: number; date: string; status: string; schedule?: { class?: { name: string }; subject?: { name: string } } }) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between rounded-lg border p-4"
                  >
                    <div>
                      <p className="font-medium">
                        {session.schedule?.subject?.name} - {session.schedule?.class?.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {session.date} • {session.status}
                      </p>
                    </div>
                    <Link href={`/teacher/attendance?session=${session.id}`}>
                      <Button variant="outline" size="sm">
                        Mulai
                      </Button>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
