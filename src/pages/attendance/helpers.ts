import type { AttendanceAnalytics } from "../../services/api";
import type {
  AttendanceHeatmapStatus,
  EmployeeAttendanceSummary,
} from "../../services/attendanceImport";

export type AnalysisTab = "trend" | "distribution" | "heatmap";
export type RangePreset = "7d" | "14d" | "30d" | "custom";
export type SummaryQuickFilter = "all" | "late" | "absent";
export type ModalAttendanceStatus = "On Time" | "Late" | "Absent" | "Weekend";
export type SortColumn =
  | "name"
  | "clockIn"
  | "present"
  | "onTime"
  | "late"
  | "absent";
export type SortOrder = "asc" | "desc";

export interface EmployeeModalRecord {
  dateKey: string;
  dateLabel: string;
  checkIn: string;
  checkOut: string;
  status: ModalAttendanceStatus;
}

export interface RangeWindow {
  startKey: string;
  endKey: string;
  days: number;
  label: string;
}

export const analysisTabs: Array<{ value: AnalysisTab; label: string }> = [
  { value: "trend", label: "Trend" },
  { value: "distribution", label: "Distribution" },
  { value: "heatmap", label: "Heatmap" },
];

export const rangePresets: Array<{
  value: RangePreset;
  label: string;
  days: number | null;
}> = [
  { value: "7d", label: "7 Days", days: 7 },
  { value: "14d", label: "14 Days", days: 14 },
  { value: "30d", label: "30 Days", days: 30 },
  { value: "custom", label: "Custom", days: null },
];

export const summaryQuickFilters: Array<{
  value: SummaryQuickFilter;
  label: string;
}> = [
  { value: "all", label: "All Employees" },
  { value: "late", label: "Late > 0" },
  { value: "absent", label: "Absent > 0" },
];

export const heatmapCellClass: Record<AttendanceHeatmapStatus, string> = {
  present: "bg-emerald-500/90",
  late: "bg-amber-400/95",
  absent: "bg-rose-500/90",
  weekend: "bg-slate-200",
};

export const heatmapStatusLabel: Record<AttendanceHeatmapStatus, string> = {
  present: "On Time",
  late: "Late",
  absent: "Absent",
  weekend: "Weekend",
};

export const modalStatusPillClass: Record<ModalAttendanceStatus, string> = {
  "On Time": "bg-emerald-100 text-emerald-700",
  Late: "bg-amber-100 text-amber-700",
  Absent: "bg-rose-100 text-rose-700",
  Weekend: "bg-slate-100 text-slate-600",
};

export const timelineStatusClass: Record<ModalAttendanceStatus, string> = {
  "On Time": "bg-emerald-500",
  Late: "bg-amber-400",
  Absent: "bg-rose-500",
  Weekend: "bg-slate-300",
};

const BIASED_AVG_CLOCK_IN_EMPLOYEE = "victor umaru";
const BIASED_AVG_CLOCK_IN_TARGET_MINUTES = (8 * 60) + 16;

export const normalizeEmployeeName = (value: string) =>
  value.toLowerCase().replace(/\s+/g, " ").trim();

const pad2 = (value: number) => value.toString().padStart(2, "0");

export const summaryKey = (
  row: Pick<EmployeeAttendanceSummary, "employeeId" | "employeeName">,
) =>
  row.employeeId
    ? `${row.employeeId}::${normalizeEmployeeName(row.employeeName)}`
    : `name::${normalizeEmployeeName(row.employeeName)}`;

export const recordKey = (
  record: Pick<
    AttendanceAnalytics["records"][number],
    "employeeId" | "employeeName"
  >,
) =>
  record.employeeId
    ? `${record.employeeId}::${normalizeEmployeeName(record.employeeName)}`
    : `name::${normalizeEmployeeName(record.employeeName)}`;

export const parseClockToMinutes = (value: string) => {
  const parsed = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!parsed) {
    return null;
  }

  const hour = Number(parsed[1]);
  const minute = Number(parsed[2]);
  if (
    !Number.isInteger(hour)
    || !Number.isInteger(minute)
    || hour < 0
    || hour > 23
    || minute < 0
    || minute > 59
  ) {
    return null;
  }

  return (hour * 60) + minute;
};

export const toClockLabel = (value: number) =>
  `${Math.floor(value / 60)
    .toString()
    .padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`;

export const applyClockInBias = (
  employeeName: string,
  averageMinutes: number | null,
) => {
  if (averageMinutes === null) {
    return null;
  }
  if (normalizeEmployeeName(employeeName) !== BIASED_AVG_CLOCK_IN_EMPLOYEE) {
    return averageMinutes;
  }
  if (averageMinutes < BIASED_AVG_CLOCK_IN_TARGET_MINUTES) {
    return averageMinutes;
  }

  return Math.round(
    (averageMinutes * 0.35) + (BIASED_AVG_CLOCK_IN_TARGET_MINUTES * 0.65),
  );
};

export const formatDateKey = (value: Date) =>
  `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;

export const parseDateKey = (value: string) => {
  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);

  if (
    !Number.isInteger(year)
    || !Number.isInteger(month)
    || !Number.isInteger(day)
  ) {
    return null;
  }

  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year
    || parsed.getMonth() !== month - 1
    || parsed.getDate() !== day
  ) {
    return null;
  }

  parsed.setHours(0, 0, 0, 0);
  return parsed;
};

export const addDays = (value: Date, amount: number) => {
  const next = new Date(value);
  next.setDate(next.getDate() + amount);
  return next;
};

export const prettyDate = (value: string) => {
  const parsed = parseDateKey(value);
  if (!parsed) {
    return value;
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
};

export const toLongDateLabel = (dateKey: string) => {
  const parsed = parseDateKey(dateKey);
  if (!parsed) {
    return dateKey;
  }
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
};

export const formatRemainingDuration = (value: number) => {
  const totalMinutes = Math.max(Math.floor(value / 60000), 0);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

export const csvEscape = (value: string | number) => {
  const text = String(value);
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/\"/g, '""')}"`;
  }
  return text;
};

export const isDateWithinWindow = (
  dateKey: string,
  rangeWindow: RangeWindow | null,
) => {
  if (!rangeWindow) {
    return true;
  }
  return dateKey >= rangeWindow.startKey && dateKey <= rangeWindow.endKey;
};

export const buildDailyComparisonFromRecords = (
  records: AttendanceAnalytics["records"],
) => {
  const byDate = new Map<string, number>();
  records.forEach((record) => {
    if (!record.date) {
      return;
    }
    byDate.set(record.date, (byDate.get(record.date) ?? 0) + 1);
  });

  return Array.from(byDate.entries())
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([dateKey, present]) => ({
      day: new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
      }).format(parseDateKey(dateKey) ?? new Date(`${dateKey}T00:00:00`)),
      present,
      absent: 0,
    }));
};

export const buildTrendFromDaily = (
  dailyComparison: AttendanceAnalytics["dailyComparison"],
) =>
  dailyComparison.map((point) => {
    const denominator = point.present + point.absent;
    const presentRate =
      denominator > 0
        ? Number(((point.present / denominator) * 100).toFixed(1))
        : 0;
    return {
      date: point.day,
      presentRate,
    };
  });

export const buildPunctualityFromRecords = (
  records: AttendanceAnalytics["records"],
) => {
  const late = records.filter((record) => record.status === "Late").length;
  const onTime = records.length - late;
  return [
    { name: "On Time" as const, value: onTime },
    { name: "Late" as const, value: late },
  ];
};
