"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";

interface DayData {
  HADIR: number;
  TERLAMBAT: number;
  IZIN: number;
  SAKIT: number;
  ALPA: number;
}

interface Props {
  data: Record<string, DayData>;
}

const statusColors: Record<string, string> = {
  HADIR: "bg-emerald-500",
  TERLAMBAT: "bg-amber-500",
  IZIN: "bg-blue-500",
  SAKIT: "bg-orange-500",
  ALPA: "bg-red-500",
};

const statusLabels: Record<string, string> = {
  HADIR: "Hadir",
  TERLAMBAT: "Terlambat",
  IZIN: "Izin",
  SAKIT: "Sakit",
  ALPA: "Alpa",
};

function MiniBarChart({ data }: { data: Props["data"] }) {
  const dates = Object.keys(data).sort();
  if (dates.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        Belum ada data grafik
      </div>
    );
  }

  const maxVal = Math.max(
    ...dates.map((d) => {
      const day = data[d];
      return (day.HADIR || 0) + (day.TERLAMBAT || 0) + (day.IZIN || 0) + (day.SAKIT || 0) + (day.ALPA || 0);
    }),
    1
  );

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-1.5 h-32 sm:h-40">
        {dates.map((date) => {
          const day = data[date];
          const total = (day.HADIR || 0) + (day.TERLAMBAT || 0) + (day.IZIN || 0) + (day.SAKIT || 0) + (day.ALPA || 0);

          return (
            <div key={date} className="flex flex-1 flex-col items-center gap-1 group" title={`${date}: ${total} absensi`}>
              <div className="relative w-full flex flex-col-reverse" style={{ height: "100%" }}>
                <div
                  className="w-full rounded-t bg-emerald-500 transition-all"
                  style={{ height: `${(day.HADIR / maxVal) * 100}%` }}
                />
                <div
                  className="w-full bg-amber-500"
                  style={{ height: `${(day.TERLAMBAT / maxVal) * 100}%` }}
                />
                <div
                  className="w-full bg-blue-500"
                  style={{ height: `${(day.IZIN / maxVal) * 100}%` }}
                />
                <div
                  className="w-full bg-orange-500"
                  style={{ height: `${(day.SAKIT / maxVal) * 100}%` }}
                />
                <div
                  className="w-full rounded-b bg-red-500"
                  style={{ height: `${(day.ALPA / maxVal) * 100}%` }}
                />
              </div>
              <span className="text-[9px] text-muted-foreground sm:text-[10px]">
                {new Date(date).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3 justify-center">
        {Object.entries(statusLabels).map(([key, label]) => (
          <div key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className={`h-2 w-2 rounded-full ${statusColors[key]}`} />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AttendanceChart() {
  const [data, setData] = useState<Props["data"]>({});
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  useEffect(() => {
    let cancelled = false;
    api.get("/dashboard/chart", { params: { days } })
      .then((res) => { if (!cancelled) setData(res.data.data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">Tren Kehadiran</CardTitle>
        <div className="flex gap-1">
          {[7, 14, 30].map((d) => (
            <Button
              key={d}
              variant={days === d ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setDays(d)}
            >
              {d}h
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <MiniBarChart data={data} />
        )}
      </CardContent>
    </Card>
  );
}
