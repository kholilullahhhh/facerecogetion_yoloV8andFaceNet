"use client";

import { useEffect, useState, useCallback } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import type { DashboardSummary } from "@/types";
import { AlertTriangle, RefreshCw } from "lucide-react";
import DashboardHeader from "@/components/admin/dashboard/dashboard-header";
import DashboardStats from "@/components/admin/dashboard/dashboard-stats";
import AttendanceOverview from "@/components/admin/dashboard/attendance-overview";
import AttendanceChart from "@/components/admin/dashboard/attendance-chart";
import RecentAttendance from "@/components/admin/dashboard/recent-attendance";
import QuickActions from "@/components/admin/dashboard/quick-actions";
import SystemStatus from "@/components/admin/dashboard/system-status";

function StatsSkeleton() {
  return (
    <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-card p-4 sm:p-6 space-y-3">
          <div className="h-3 w-20 animate-pulse rounded bg-muted" />
          <div className="h-8 w-16 animate-pulse rounded bg-muted" />
          <div className="h-2.5 w-24 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-4 sm:p-6">
      <div className="mb-4 h-4 w-32 animate-pulse rounded bg-muted" />
      <div className="flex items-end gap-2 h-40">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex-1 animate-pulse rounded bg-muted" style={{ height: `${40 + (i * 13) % 60}%` }} />
        ))}
      </div>
    </div>
  );
}

function RecentSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-4 sm:p-6">
      <div className="mb-4 h-4 w-32 animate-pulse rounded bg-muted" />
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
    </div>
  );
}

function DashboardContent({ summary }: { summary: DashboardSummary }) {
  return (
    <>
      <DashboardStats summary={summary} />

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <AttendanceChart />
          <QuickActions />
        </div>
        <div className="space-y-4 lg:col-span-2">
          <AttendanceOverview
            present={summary.present}
            late={summary.late}
            excused={summary.excused}
            sick={summary.sick}
            absent={summary.absent}
          />
          <RecentAttendance />
        </div>
      </div>

      <SystemStatus />
    </>
  );
}

export default function AdminDashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(false);
    api.get("/dashboard/summary")
      .then((res) => setSummary(res.data.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.get("/dashboard/summary")
      .then((res) => { if (!cancelled) setSummary(res.data.data); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6">
        <DashboardHeader />

        {error ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <AlertTriangle className="mb-3 h-10 w-10 text-muted-foreground" />
              <p className="mb-1 text-sm font-medium">Data dashboard tidak dapat dimuat</p>
              <p className="mb-4 text-xs text-muted-foreground">Periksa koneksi ke server backend</p>
              <Button variant="outline" size="sm" onClick={fetchData}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Coba Lagi
              </Button>
            </CardContent>
          </Card>
        ) : loading ? (
          <div className="space-y-4 sm:space-y-6">
            <StatsSkeleton />
            <div className="grid gap-4 lg:grid-cols-5">
              <div className="lg:col-span-3"><ChartSkeleton /></div>
              <div className="lg:col-span-2"><RecentSkeleton /></div>
            </div>
          </div>
        ) : summary ? (
          <DashboardContent summary={summary} />
        ) : null}
      </div>
    </DashboardLayout>
  );
}
