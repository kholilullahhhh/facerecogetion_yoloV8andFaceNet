"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserCheck, Clock, FileText, HeartPulse, UserX } from "lucide-react";

interface Props {
  present: number;
  late: number;
  excused: number;
  sick: number;
  absent: number;
}

const items = (p: Props) => [
  { label: "Hadir", value: p.present, icon: UserCheck, color: "text-emerald-600", bg: "bg-emerald-50" },
  { label: "Terlambat", value: p.late, icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
  { label: "Izin", value: p.excused, icon: FileText, color: "text-blue-600", bg: "bg-blue-50" },
  { label: "Sakit", value: p.sick, icon: HeartPulse, color: "text-orange-600", bg: "bg-orange-50" },
  { label: "Alpa", value: p.absent, icon: UserX, color: "text-red-600", bg: "bg-red-50" },
];

export default function AttendanceOverview({ present, late, excused, sick, absent }: Props) {
  const total = present + late + excused + sick + absent;
  const data = items({ present, late, excused, sick, absent });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Rekap Kehadiran Hari Ini</CardTitle>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            Belum ada data absensi hari ini
          </div>
        ) : (
          <>
            <div className="mb-4 h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="flex h-full">
                {data.map((d) => {
                  const pct = total > 0 ? (d.value / total) * 100 : 0;
                  if (pct === 0) return null;
                  return (
                    <div
                      key={d.label}
                      className={`${d.bg} h-full transition-all`}
                      style={{ width: `${pct}%` }}
                      title={`${d.label}: ${d.value} (${pct.toFixed(1)}%)`}
                    />
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {data.map((d) => {
                const Icon = d.icon;
                return (
                  <div key={d.label} className="text-center">
                    <div className={`mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-lg ${d.bg} sm:h-9 sm:w-9`}>
                      <Icon className={`h-4 w-4 ${d.color}`} />
                    </div>
                    <p className="text-base font-bold sm:text-lg">{d.value}</p>
                    <p className="text-[10px] text-muted-foreground sm:text-xs">{d.label}</p>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
