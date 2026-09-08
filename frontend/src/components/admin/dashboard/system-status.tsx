"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import api from "@/lib/api";
import { Activity } from "lucide-react";

interface Status {
  backend: "online" | "offline" | "checking";
  ai: "online" | "offline" | "checking";
}

export default function SystemStatus() {
  const [status, setStatus] = useState<Status>({ backend: "checking", ai: "checking" });

  useEffect(() => {
    api.get("/me")
      .then(() => setStatus((p) => ({ ...p, backend: "online" })))
      .catch(() => setStatus((p) => ({ ...p, backend: "offline" })));

    const aiUrl = process.env.NEXT_PUBLIC_AI_URL || "http://localhost:8001";
    fetch(`${aiUrl}/health`, { signal: AbortSignal.timeout(5000) })
      .then((r) => r.ok ? setStatus((p) => ({ ...p, ai: "online" })) : setStatus((p) => ({ ...p, ai: "offline" })))
      .catch(() => setStatus((p) => ({ ...p, ai: "offline" })));
  }, []);

  const services = [
    { label: "Backend API", status: status.backend },
    { label: "AI Service", status: status.ai },
  ];

  const colorMap = {
    online: "bg-emerald-500",
    offline: "bg-red-500",
    checking: "bg-muted animate-pulse",
  };

  const labelMap = {
    online: "Online",
    offline: "Offline",
    checking: "Checking...",
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Activity className="h-4 w-4" />
          Status Sistem
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {services.map((s) => (
            <div key={s.label} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
              <span className="text-sm">{s.label}</span>
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${colorMap[s.status]}`} />
                <span className="text-xs text-muted-foreground">{labelMap[s.status]}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
