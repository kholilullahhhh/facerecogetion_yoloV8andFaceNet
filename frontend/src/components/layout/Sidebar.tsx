"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  BookOpen,
  Calendar,
  Camera,
  ClipboardList,
  BarChart3,
  LogOut,
  Settings,
  UserCircle,
  Menu,
  X,
} from "lucide-react";

const adminLinks = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/students", label: "Siswa", icon: Users },
  { href: "/admin/teachers", label: "Guru", icon: GraduationCap },
  { href: "/admin/classes", label: "Kelas", icon: BookOpen },
  { href: "/admin/subjects", label: "Mata Pelajaran", icon: BookOpen },
  { href: "/admin/schedules", label: "Jadwal", icon: Calendar },
  { href: "/admin/attendance", label: "Absensi", icon: ClipboardList },
  { href: "/admin/reports", label: "Laporan", icon: BarChart3 },
  { href: "/admin/settings/model", label: "Pengaturan Model", icon: Settings },
];

const teacherLinks = [
  { href: "/teacher/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/teacher/attendance", label: "Absensi", icon: Camera },
  { href: "/teacher/attendance/history", label: "Riwayat", icon: ClipboardList },
  { href: "/teacher/profile", label: "Profil", icon: UserCircle },
];

export function Sidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const links = user?.role === "ADMIN" ? adminLinks : teacherLinks;

  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 border-r bg-white lg:block">
      <div className="flex h-16 items-center border-b px-6">
        <Link href="/" className="text-lg font-bold text-primary">
          FACE REC
        </Link>
        <span className="ml-2 text-xs text-muted-foreground">v1.0</span>
      </div>

      <nav className="mt-4 space-y-1 px-3">
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="absolute bottom-0 left-0 right-0 border-t p-4">
        <div className="mb-3 text-sm">
          <p className="font-medium">{user?.name}</p>
          <p className="text-xs text-muted-foreground">{user?.role}</p>
        </div>
        <button
          onClick={logout}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>
    </aside>
  );
}

export function MobileSidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const links = user?.role === "ADMIN" ? adminLinks : teacherLinks;
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="lg:hidden">
      <button
        onClick={() => setIsOpen(true)}
        className="fixed left-3 top-3 z-50 rounded-lg bg-white p-2 shadow-md"
        aria-label="Buka menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/50 transition-opacity"
            onClick={() => setIsOpen(false)}
          />
          <div className="fixed left-0 top-0 z-50 h-full w-64 animate-in slide-in-from-left bg-white shadow-xl">
            <div className="flex h-16 items-center justify-between border-b px-6">
              <span className="text-lg font-bold text-primary">FACE REC</span>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-md p-1 hover:bg-muted"
                aria-label="Tutup menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="mt-4 space-y-1 px-3">
              {links.map((link) => {
                const Icon = link.icon;
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setIsOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {link.label}
                  </Link>
                );
              })}
            </nav>
            <div className="absolute bottom-0 left-0 right-0 border-t p-4">
              <div className="mb-2 text-sm">
                <p className="font-medium">{user?.name}</p>
                <p className="text-xs text-muted-foreground">{user?.role}</p>
              </div>
              <button
                onClick={logout}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
