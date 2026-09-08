"use client";

import { useAuth } from "@/contexts/AuthContext";

export default function DashboardHeader() {
  const { user } = useAuth();
  const now = new Date();
  const greeting = now.getHours() < 12 ? "Selamat pagi" : now.getHours() < 18 ? "Selamat siang" : "Selamat malam";
  const dateStr = now.toLocaleDateString("id-ID", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="space-y-1">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Dashboard Admin</h1>
      <p className="text-muted-foreground">
        {greeting}, {user?.name}. {dateStr}
      </p>
    </div>
  );
}
