"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import api from "@/lib/api";
import type { DashboardSummary } from "@/types";
import {
  Users,
  GraduationCap,
  BookOpen,
  Calendar,
  UserCheck,
  Clock,
  UserX,
  AlertTriangle,
} from "lucide-react";

export default function AdminDashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);

  useEffect(() => {
    api.get("/dashboard/summary").then((res) => {
      setSummary(res.data.data);
    });
  }, []);

  if (!summary) {
    return (
      <DashboardLayout>
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </DashboardLayout>
    );
  }

  const stats = [
    { label: "Total Siswa", value: summary.students, icon: Users, color: "text-blue-600" },
    { label: "Total Guru", value: summary.teachers, icon: GraduationCap, color: "text-green-600" },
    { label: "Total Kelas", value: summary.classes, icon: BookOpen, color: "text-purple-600" },
    { label: "Mata Pelajaran", value: summary.subjects, icon: Calendar, color: "text-orange-600" },
  ];

  const attendanceStats = [
    { label: "Hadir", value: summary.present, icon: UserCheck, color: "text-green-600" },
    { label: "Terlambat", value: summary.late, icon: Clock, color: "text-yellow-600" },
    { label: "Izin", value: summary.excused, icon: AlertTriangle, color: "text-blue-600" },
    { label: "Sakit", value: summary.sick, icon: AlertTriangle, color: "text-orange-600" },
    { label: "Alpa", value: summary.absent, icon: UserX, color: "text-red-600" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Dashboard Admin</h1>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.label}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.label}
                  </CardTitle>
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Rekap Kehadiran Hari Ini</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-5">
              {attendanceStats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <div key={stat.label} className="text-center">
                    <Icon className={`mx-auto h-6 w-6 ${stat.color}`} />
                    <div className="mt-2 text-2xl font-bold">{stat.value}</div>
                    <div className="text-sm text-muted-foreground">{stat.label}</div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
