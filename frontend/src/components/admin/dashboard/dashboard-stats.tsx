"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Users, GraduationCap, BookOpen, ClipboardCheck } from "lucide-react";
import type { DashboardSummary } from "@/types";

interface Props {
  summary: DashboardSummary;
}

const stats = (s: DashboardSummary) => [
  { label: "Total Siswa", value: s.students, suffix: "siswa aktif", icon: Users, href: "/admin/students", iconBg: "bg-blue-50 text-blue-600" },
  { label: "Total Guru", value: s.teachers, suffix: "guru aktif", icon: GraduationCap, href: "/admin/teachers", iconBg: "bg-emerald-50 text-emerald-600" },
  { label: "Kelas Aktif", value: s.classes, suffix: "kelas", icon: BookOpen, href: "/admin/classes", iconBg: "bg-violet-50 text-violet-600" },
  { label: "Kehadiran Hari Ini", value: s.today_attendance, suffix: "absensi tercatat", icon: ClipboardCheck, href: "/admin/attendance", iconBg: "bg-amber-50 text-amber-600" },
];

export default function DashboardStats({ summary }: Props) {
  return (
    <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
      {stats(summary).map((stat) => {
        const Icon = stat.icon;
        return (
          <Link key={stat.label} href={stat.href}>
            <Card className="transition-colors hover:border-primary/30 cursor-pointer group">
              <CardContent className="pt-4 sm:pt-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground sm:text-sm">{stat.label}</p>
                    <p className="text-2xl font-bold tracking-tight sm:text-3xl">{stat.value.toLocaleString("id-ID")}</p>
                    <p className="text-xs text-muted-foreground">{stat.suffix}</p>
                  </div>
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${stat.iconBg} sm:h-10 sm:w-10`}>
                    <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
