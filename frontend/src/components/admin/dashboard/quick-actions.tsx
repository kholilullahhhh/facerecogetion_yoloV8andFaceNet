"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserPlus, Scan, ClipboardList, BarChart3, Calendar } from "lucide-react";

const actions = [
  { label: "Tambah Siswa", href: "/admin/students/create", icon: UserPlus, iconBg: "bg-blue-50 text-blue-600" },
  { label: "Registrasi Wajah", href: "/admin/students", icon: Scan, iconBg: "bg-violet-50 text-violet-600" },
  { label: "Kelola Jadwal", href: "/admin/schedules", icon: Calendar, iconBg: "bg-amber-50 text-amber-600" },
  { label: "Lihat Absensi", href: "/admin/attendance", icon: ClipboardList, iconBg: "bg-emerald-50 text-emerald-600" },
  { label: "Lihat Laporan", href: "/admin/reports", icon: BarChart3, iconBg: "bg-rose-50 text-rose-600" },
];

export default function QuickActions() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Aksi Cepat</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-5 gap-2">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.label}
                href={action.href}
                className="group flex flex-col items-center gap-1.5 rounded-lg p-2 transition-colors hover:bg-muted/50 sm:p-3"
              >
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${action.iconBg} transition-transform group-hover:scale-105 sm:h-10 sm:w-10`}>
                  <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
                <span className="text-center text-[10px] font-medium leading-tight text-muted-foreground group-hover:text-foreground sm:text-xs">
                  {action.label}
                </span>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
