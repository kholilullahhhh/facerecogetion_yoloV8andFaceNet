"use client";

import { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import api from "@/lib/api";
import { Download } from "lucide-react";

export default function AdminReportsPage() {
  const [csv, setCsv] = useState("");
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ start_date: "", end_date: "", class_id: "" });

  const fetchReport = () => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (filters.start_date) params.start_date = filters.start_date;
    if (filters.end_date) params.end_date = filters.end_date;
    if (filters.class_id) params.class_id = filters.class_id;

    api.get("/reports/attendance", { params: { ...params, per_page: 9999 } })
      .then((res) => {
        setTotal(res.data.data.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const handleExport = async () => {
    const params: Record<string, string> = {};
    if (filters.start_date) params.start_date = filters.start_date;
    if (filters.end_date) params.end_date = filters.end_date;
    if (filters.class_id) params.class_id = filters.class_id;

    try {
      const res = await api.get("/reports/attendance/export", { params });
      setCsv(res.data.data.csv);
      setTotal(res.data.data.total_records);
    } catch {
      // handle error
    }
  };

  const downloadCsv = () => {
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `laporan-absensi-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Laporan Absensi</h1>
        <Card>
          <CardHeader>
            <CardTitle>Filter Laporan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1">
                <label className="text-sm">Dari Tanggal</label>
                <Input type="date" value={filters.start_date} onChange={(e) => setFilters({ ...filters, start_date: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-sm">Sampai Tanggal</label>
                <Input type="date" value={filters.end_date} onChange={(e) => setFilters({ ...filters, end_date: e.target.value })} />
              </div>
              <Button onClick={fetchReport} disabled={loading}>{loading ? "Memuat..." : "Tampilkan"}</Button>
              <Button variant="outline" onClick={handleExport}>
                <Download className="mr-2 h-4 w-4" />Export CSV
              </Button>
            </div>
            {total > 0 && <p className="mt-4 text-sm text-muted-foreground">Total: {total} record</p>}
          </CardContent>
        </Card>

        {csv && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Hasil Export</CardTitle>
              <Button size="sm" onClick={downloadCsv}>
                <Download className="mr-2 h-4 w-4" />Download CSV
              </Button>
            </CardHeader>
            <CardContent>
              <pre className="max-h-96 overflow-auto rounded-lg bg-gray-50 p-4 text-xs">{csv}</pre>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
