"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import api from "@/lib/api";
import { formatDate, STATUS_META } from "@/lib/attendance-status";
import type { Attendance } from "@/types";
import { ArrowRight } from "lucide-react";

const SOURCE_LABEL: Record<string, string> = {
  MANUAL: "Manual guru",
  FACE_RECOGNITION: "Kamera",
  SYSTEM: "Sistem",
};

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

export default function RecentAttendance() {
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.get("/dashboard/recent", { params: { limit: 8 } })
      .then((res) => { if (!cancelled) setAttendances(res.data.data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">Absensi Terbaru</CardTitle>
        <Link href="/admin/attendance">
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
            Lihat Semua <ArrowRight className="h-3 w-3" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-9 w-9 animate-pulse rounded-full bg-muted" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-32 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-20 animate-pulse rounded bg-muted" />
                </div>
                <div className="h-5 w-16 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : attendances.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            Belum ada data absensi terbaru
          </div>
        ) : (
          <div className="space-y-1">
            {attendances.map((a) => {
              const meta = STATUS_META[a.status] ?? STATUS_META.HADIR;
              const sessionDate = a.attendance_session?.date;

              return (
                <div key={a.id} className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                    {a.student ? getInitials(a.student.name) : "?"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.student?.name || "Unknown"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {a.student?.class?.name || "-"}
                      {a.attendance_session?.schedule?.subject?.name && ` — ${a.attendance_session.schedule.subject.name}`}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {sessionDate ? formatDate(sessionDate) : "-"}
                      {a.notes ? ` · ${a.notes}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge variant="outline" className={`px-1.5 py-0 text-[10px] sm:text-xs ${meta.badgeClass}`}>
                      {meta.label}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {SOURCE_LABEL[a.source] ?? a.source}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
