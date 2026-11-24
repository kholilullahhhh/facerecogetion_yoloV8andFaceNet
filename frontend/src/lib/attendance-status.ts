import type { AttendanceStatus } from "@/types";

export const ATTENDANCE_STATUSES: AttendanceStatus[] = ["HADIR", "IZIN", "SAKIT", "ALPA"];

export const STATUS_META: Record<
  AttendanceStatus,
  {
    label: string;
    badgeClass: string;
    dotClass: string;
    softClass: string;
    textClass: string;
    borderClass: string;
    selectedClass: string;
    chartClass: string;
  }
> = {
  HADIR: {
    label: "Hadir",
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dotClass: "bg-emerald-500",
    softClass: "bg-emerald-50",
    textClass: "text-emerald-700",
    borderClass: "border-emerald-200",
    selectedClass: "border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/20",
    chartClass: "bg-emerald-500",
  },
  IZIN: {
    label: "Izin",
    badgeClass: "border-blue-200 bg-blue-50 text-blue-700",
    dotClass: "bg-blue-500",
    softClass: "bg-blue-50",
    textClass: "text-blue-700",
    borderClass: "border-blue-200",
    selectedClass: "border-blue-500 bg-blue-50 text-blue-800 ring-2 ring-blue-500/20",
    chartClass: "bg-blue-500",
  },
  SAKIT: {
    label: "Sakit",
    badgeClass: "border-orange-200 bg-orange-50 text-orange-700",
    dotClass: "bg-orange-500",
    softClass: "bg-orange-50",
    textClass: "text-orange-700",
    borderClass: "border-orange-200",
    selectedClass: "border-orange-500 bg-orange-50 text-orange-800 ring-2 ring-orange-500/20",
    chartClass: "bg-orange-500",
  },
  ALPA: {
    label: "Alpa",
    badgeClass: "border-red-200 bg-red-50 text-red-700",
    dotClass: "bg-red-500",
    softClass: "bg-red-50",
    textClass: "text-red-700",
    borderClass: "border-red-200",
    selectedClass: "border-red-500 bg-red-50 text-red-800 ring-2 ring-red-500/20",
    chartClass: "bg-red-500",
  },
};

export const STATUS_ORDER: AttendanceStatus[] = ["HADIR", "ALPA", "IZIN", "SAKIT"];

export function statusLabel(status: AttendanceStatus | null | undefined): string {
  return status ? STATUS_META[status].label : "Belum absen";
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}
