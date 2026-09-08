"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import api from "@/lib/api";

interface HealthStatus {
  status: string;
  yolo_loaded: boolean;
  facenet_loaded: boolean;
  device: string;
  threshold: number;
}

export default function ModelSettingsPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [threshold, setThreshold] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    api.get("/health")
      .then((res) => {
        if (!cancelled) {
          setHealth(res.data);
          setThreshold(String(res.data.threshold));
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleUpdateThreshold = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await api.put("/threshold", { threshold: parseFloat(threshold) });
      setMessage("Threshold berhasil diperbarui.");
      const res = await api.get("/health");
      setHealth(res.data);
      setThreshold(String(res.data.threshold));
    } catch {
      setMessage("Gagal memperbarui threshold.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Pengaturan Model AI</h1>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : !health ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">
                AI Service tidak tersedia. Pastikan layanan AI sudah berjalan.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Status Model</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Overall Status</span>
                    <Badge variant={health.status === "healthy" ? "default" : "destructive"}>
                      {health.status === "healthy" ? "Sehat" : "Degraded"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">YOLOv8 (Deteksi Wajah)</span>
                    <Badge variant={health.yolo_loaded ? "default" : "destructive"}>
                      {health.yolo_loaded ? "Loaded" : "Not Loaded"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">FaceNet (Embedding)</span>
                    <Badge variant={health.facenet_loaded ? "default" : "destructive"}>
                      {health.facenet_loaded ? "Loaded" : "Not Loaded"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Device</span>
                    <span className="font-mono text-sm">{health.device}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Pengaturan Threshold</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleUpdateThreshold} className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-sm font-medium">Face Match Threshold</label>
                      <p className="text-xs text-muted-foreground">
                        Jarak euclidean minimum untuk menganggap dua wajah cocok. Rentang: 0.0 - 2.0 (default: 0.8)
                      </p>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max="2"
                        value={threshold}
                        onChange={(e) => setThreshold(e.target.value)}
                        required
                      />
                    </div>
                    {message && (
                      <p className={`text-sm ${message.includes("berhasil") ? "text-green-600" : "text-red-600"}`}>
                        {message}
                      </p>
                    )}
                    <Button type="submit" disabled={saving}>
                      {saving ? "Menyimpan..." : "Simpan Threshold"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Informasi Model</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">YOLO Model</span>
                  <span className="font-mono text-sm">yolov8s.pt (YOLOv8 Small)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">FaceNet Model</span>
                  <span className="font-mono text-sm">VGGFace2 (Pretrained)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Face Crop Size</span>
                  <span className="font-mono text-sm">160x160</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Embedding Dimension</span>
                  <span className="font-mono text-sm">128D</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Face Confidence Threshold</span>
                  <span className="font-mono text-sm">0.5</span>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
