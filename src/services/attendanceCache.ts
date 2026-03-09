import type { AttendanceAnalytics } from "./api";
import type {
  AttendanceHeatmapData,
  EmployeeAttendanceSummary,
} from "./attendanceImport";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export interface AttendanceImportCache {
  analytics: AttendanceAnalytics;
  employeeSummary: EmployeeAttendanceSummary[];
  heatmap: AttendanceHeatmapData;
  importInfo: string;
  importedAt: number;
  expiresAt: number;
}

let attendanceImportCache: AttendanceImportCache | null = null;

export const setAttendanceImportCache = (payload: {
  analytics: AttendanceAnalytics;
  employeeSummary: EmployeeAttendanceSummary[];
  heatmap: AttendanceHeatmapData;
  importInfo: string;
}) => {
  const importedAt = Date.now();
  attendanceImportCache = {
    ...payload,
    importedAt,
    expiresAt: importedAt + SIX_HOURS_MS,
  };
  return attendanceImportCache;
};

export const getAttendanceImportCache = () => {
  if (!attendanceImportCache) {
    return null;
  }

  if (Date.now() >= attendanceImportCache.expiresAt) {
    attendanceImportCache = null;
    return null;
  }

  return attendanceImportCache;
};

export const clearAttendanceImportCache = () => {
  attendanceImportCache = null;
};
