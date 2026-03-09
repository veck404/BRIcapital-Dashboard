import type { WorkSheet } from "xlsx";
import type {
  AttendanceAnalytics,
  AttendanceRecord,
  DailyAttendancePoint,
  PunctualityPoint,
  AttendanceTrendPoint,
} from "./api";

type XlsxModule = typeof import("xlsx");

const pad2 = (value: number) => value.toString().padStart(2, "0");
const LATE_CUTOFF_MINUTES = 8 * 60;

const normalizeHeader = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();

const hasValue = (value: unknown) => {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  return true;
};

const parseDurationMinutes = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return null;
    }
    return Math.round(value * 24 * 60);
  }

  if (typeof value === "string") {
    const text = value.trim();
    if (text.length === 0) {
      return null;
    }

    const timeMatch = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (timeMatch) {
      const hours = Number(timeMatch[1]);
      const minutes = Number(timeMatch[2]);
      const seconds = Number(timeMatch[3] ?? "0");
      return (hours * 60) + minutes + Math.round(seconds / 60);
    }

    const numeric = Number(text);
    if (Number.isFinite(numeric)) {
      return Math.round(numeric * 24 * 60);
    }
  }

  return null;
};

const toTimeLabel = (value: unknown) => {
  const minutes = parseDurationMinutes(value);
  if (minutes === null) {
    return "-";
  }

  const dayMinutes = ((minutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hour = Math.floor(dayMinutes / 60);
  const minute = dayMinutes % 60;
  return `${pad2(hour)}:${pad2(minute)}`;
};

const parseTimeToMinutes = (value: string) => {
  const text = value.trim();
  const parsed = text.match(/^(\d{1,2}):(\d{2})$/);
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

const minutesToClockLabel = (value: number) =>
  `${pad2(Math.floor(value / 60))}:${pad2(value % 60)}`;

const toDateKey = (value: unknown, xlsx: XlsxModule): string | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  }

  if (typeof value === "number") {
    const parsed = xlsx.SSF.parse_date_code(value);
    if (!parsed) {
      return null;
    }
    return `${parsed.y}-${pad2(parsed.m)}-${pad2(parsed.d)}`;
  }

  if (typeof value === "string") {
    const text = value.trim();
    if (text.length === 0) {
      return null;
    }

    const numeric = Number(text);
    if (Number.isFinite(numeric)) {
      const parsed = xlsx.SSF.parse_date_code(numeric);
      if (!parsed) {
        return null;
      }
      return `${parsed.y}-${pad2(parsed.m)}-${pad2(parsed.d)}`;
    }

    const isoMatch = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (isoMatch) {
      const year = Number(isoMatch[1]);
      const month = Number(isoMatch[2]);
      const day = Number(isoMatch[3]);
      if (
        Number.isInteger(year)
        && Number.isInteger(month)
        && Number.isInteger(day)
      ) {
        return `${year}-${pad2(month)}-${pad2(day)}`;
      }
    }

    // Machine exports often use DD/MM/YYYY. Parse explicitly so all days
    // (including > 12) are counted correctly.
    const slashMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (slashMatch) {
      const first = Number(slashMatch[1]);
      const second = Number(slashMatch[2]);
      const year = Number(slashMatch[3]);
      if (
        Number.isInteger(first)
        && Number.isInteger(second)
        && Number.isInteger(year)
      ) {
        // Default to D/M/Y for this attendance export format.
        const day = first;
        const month = second;
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          return `${year}-${pad2(month)}-${pad2(day)}`;
        }
      }
    }

    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) {
      return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`;
    }
  }

  return null;
};

const dateLabel = (dateKey: string) => {
  const parsed = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return dateKey;
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(parsed);
};

const pickCell = (row: Record<string, unknown>, aliases: string[]) => {
  const aliasSet = new Set(aliases.map((entry) => normalizeHeader(entry)));
  for (const [key, value] of Object.entries(row)) {
    if (aliasSet.has(normalizeHeader(key))) {
      return value;
    }
  }
  return null;
};

const employeeKeyOf = (employeeId: string, employeeName: string) => {
  const normalizedName = employeeName.toLowerCase().replace(/\s+/g, " ").trim();
  return employeeId ? `${employeeId}::${normalizedName}` : `name::${normalizedName}`;
};

const isWeekendDateKey = (dateKey: string) => {
  const [yearRaw, monthRaw, dayRaw] = dateKey.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }

  const date = new Date(year, month - 1, day);
  const weekday = date.getDay();
  return weekday === 0 || weekday === 6;
};

interface AttendanceDayRow {
  employeeId: string;
  employeeName: string;
  dateKey: string;
  checkIn: string;
  checkOut: string;
  present: boolean;
  late: boolean;
}

export interface EmployeeAttendanceSummary {
  employeeId: string;
  employeeName: string;
  clockInTime: string;
  daysPresent: number;
  lateClockIns: number;
  daysAbsent: number;
}

export type AttendanceHeatmapStatus = "present" | "late" | "absent" | "weekend";

export interface AttendanceHeatmapDate {
  dateKey: string;
  label: string;
  weekend: boolean;
}

export interface AttendanceHeatmapRow {
  employeeId: string;
  employeeName: string;
  cells: Array<{
    dateKey: string;
    status: AttendanceHeatmapStatus;
  }>;
}

export interface AttendanceHeatmapData {
  dates: AttendanceHeatmapDate[];
  rows: AttendanceHeatmapRow[];
}

export interface AttendanceImportResult {
  analytics: AttendanceAnalytics;
  employeeSummary: EmployeeAttendanceSummary[];
  heatmap: AttendanceHeatmapData;
  filesProcessed: number;
  uniqueDays: number;
  totalEmployees: number;
}

const rowQuality = (row: AttendanceDayRow) => {
  let score = 0;
  if (row.present) {
    score += 3;
  }
  if (row.late) {
    score += 2;
  }
  if (row.checkIn !== "-") {
    score += 1;
  }
  if (row.checkOut !== "-") {
    score += 1;
  }
  return score;
};

const parseSheetRows = (
  sheet: WorkSheet,
  xlsx: XlsxModule,
): AttendanceDayRow[] => {
  const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: true,
  });

  const parsedRows: AttendanceDayRow[] = [];

  rows.forEach((row) => {
    const employeeIdRaw = pickCell(row, ["Emp ID", "Employee ID", "ID"]);
    const employeeNameRaw = pickCell(row, ["Name", "Employee Name", "Staff Name"]);
    const dateRaw = pickCell(row, ["Date", "Work Date", "Attendance Date"]);
    const actualWorkRaw = pickCell(row, ["Actual Work", "ActualWork", "Work Duration"]);
    const lateInRaw = pickCell(row, ["Late-In", "Late In", "Late"]);
    const checkInRaw = pickCell(row, ["Check-In", "Check In", "Clock-In", "Clock In"]);
    const checkOutRaw = pickCell(row, ["Check-Out", "Check Out", "Clock-Out", "Clock Out"]);

    const employeeName = String(employeeNameRaw ?? "").trim();
    const employeeId = String(employeeIdRaw ?? "").trim().replace(/\.0$/, "");
    const dateKey = toDateKey(dateRaw, xlsx);

    if (!employeeName || !dateKey) {
      return;
    }

    const actualWorkMinutes = parseDurationMinutes(actualWorkRaw) ?? 0;
    const lateInMinutes = parseDurationMinutes(lateInRaw) ?? 0;
    const checkInMinutes = parseDurationMinutes(checkInRaw);
    const checkInLabel = toTimeLabel(checkInRaw);
    const checkOutLabel = toTimeLabel(checkOutRaw);

    const present =
      actualWorkMinutes > 0
      || hasValue(checkInRaw)
      || hasValue(checkOutRaw);
    const late = present
      && (
        (checkInMinutes !== null && checkInMinutes > LATE_CUTOFF_MINUTES)
        || (checkInMinutes === null && lateInMinutes > 0)
      );

    parsedRows.push({
      employeeId,
      employeeName,
      dateKey,
      checkIn: checkInLabel,
      checkOut: checkOutLabel,
      present,
      late,
    });
  });

  return parsedRows;
};

const mergeRows = (rows: AttendanceDayRow[]) => {
  const deduped = new Map<string, AttendanceDayRow>();

  rows.forEach((row) => {
    const identity = employeeKeyOf(row.employeeId, row.employeeName);
    const key = `${identity}::${row.dateKey}`;
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, row);
      return;
    }

    const winner =
      rowQuality(row) >= rowQuality(existing) ? row : existing;
    deduped.set(key, {
      ...winner,
      present: existing.present || row.present,
      late: existing.late || row.late,
    });
  });

  return Array.from(deduped.values());
};

const buildEmployeeSummary = (rows: AttendanceDayRow[]) => {
  const employeeTotals = new Map<
    string,
    {
      employeeId: string;
      employeeName: string;
      daysPresent: number;
      lateClockIns: number;
      daysAbsent: number;
      totalCheckInMinutes: number;
      checkInSamples: number;
    }
  >();

  rows.forEach((row) => {
    const key = employeeKeyOf(row.employeeId, row.employeeName);
    const current = employeeTotals.get(key) ?? {
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      daysPresent: 0,
      lateClockIns: 0,
      daysAbsent: 0,
      totalCheckInMinutes: 0,
      checkInSamples: 0,
    };

    if (row.present) {
      current.daysPresent += 1;
      if (row.late) {
        current.lateClockIns += 1;
      }
      const checkInMinutes = parseTimeToMinutes(row.checkIn);
      if (checkInMinutes !== null) {
        current.totalCheckInMinutes += checkInMinutes;
        current.checkInSamples += 1;
      }
    } else if (!isWeekendDateKey(row.dateKey)) {
      current.daysAbsent += 1;
    }

    employeeTotals.set(key, current);
  });

  return Array.from(employeeTotals.values())
    .map((entry): EmployeeAttendanceSummary => {
      const averageCheckIn =
        entry.checkInSamples > 0
          ? Math.round(entry.totalCheckInMinutes / entry.checkInSamples)
          : null;
      return {
        employeeId: entry.employeeId,
        employeeName: entry.employeeName,
        clockInTime:
          averageCheckIn !== null ? minutesToClockLabel(averageCheckIn) : "-",
        daysPresent: entry.daysPresent,
        lateClockIns: entry.lateClockIns,
        daysAbsent: entry.daysAbsent,
      };
    })
    .sort((first, second) => first.employeeName.localeCompare(second.employeeName));
};

const buildDailyComparison = (rows: AttendanceDayRow[]): DailyAttendancePoint[] => {
  const dailyMap = new Map<string, { present: number; absent: number }>();

  rows.forEach((row) => {
    const current = dailyMap.get(row.dateKey) ?? { present: 0, absent: 0 };
    if (row.present) {
      current.present += 1;
    } else {
      current.absent += 1;
    }
    dailyMap.set(row.dateKey, current);
  });

  return Array.from(dailyMap.entries())
    .sort(([firstDate], [secondDate]) => firstDate.localeCompare(secondDate))
    .map(([dateKey, values]) => ({
      day: dateLabel(dateKey),
      present: values.present,
      absent: values.absent,
    }));
};

const buildTrend = (
  dailyComparison: DailyAttendancePoint[],
): AttendanceTrendPoint[] =>
  dailyComparison.map((point) => {
    const denominator = point.present + point.absent;
    const presentRate =
      denominator > 0 ? Number(((point.present / denominator) * 100).toFixed(1)) : 0;
    return {
      date: point.day,
      presentRate,
    };
  });

const buildPunctuality = (rows: AttendanceDayRow[]): PunctualityPoint[] => {
  let late = 0;
  let onTime = 0;

  rows.forEach((row) => {
    if (!row.present) {
      return;
    }
    if (row.late) {
      late += 1;
    } else {
      onTime += 1;
    }
  });

  return [
    { name: "On Time", value: onTime },
    { name: "Late", value: late },
  ];
};

const buildRecords = (rows: AttendanceDayRow[]): AttendanceRecord[] =>
  rows
    .filter((row) => row.present)
    .sort((first, second) =>
      `${second.dateKey}-${second.employeeName}`.localeCompare(
        `${first.dateKey}-${first.employeeName}`,
      ),
    )
    .map((row) => ({
      employeeName: row.employeeName,
      checkIn: row.checkIn,
      checkOut: row.checkOut,
      status: row.late ? "Late" : "On Time",
    }));

const buildAnalytics = (rows: AttendanceDayRow[]): AttendanceAnalytics => {
  const dailyComparison = buildDailyComparison(rows);
  return {
    dailyComparison,
    trend: buildTrend(dailyComparison),
    punctuality: buildPunctuality(rows),
    records: buildRecords(rows),
  };
};

const parseDateKey = (dateKey: string) => {
  const [yearRaw, monthRaw, dayRaw] = dateKey.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null;
  }

  date.setHours(0, 0, 0, 0);
  return date;
};

const formatDateKey = (value: Date) =>
  `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;

const addDays = (value: Date, amount: number) => {
  const next = new Date(value);
  next.setDate(next.getDate() + amount);
  return next;
};

const buildHeatmapDates = (rows: AttendanceDayRow[]): AttendanceHeatmapDate[] => {
  const keys = Array.from(new Set(rows.map((row) => row.dateKey))).sort();
  if (keys.length === 0) {
    return [];
  }

  const min = parseDateKey(keys[0]);
  const max = parseDateKey(keys[keys.length - 1]);
  if (!min || !max) {
    return keys.map((key) => ({
      dateKey: key,
      label: key,
      weekend: isWeekendDateKey(key),
    }));
  }

  const dates: AttendanceHeatmapDate[] = [];
  let cursor = new Date(min);
  while (cursor <= max) {
    const dateKey = formatDateKey(cursor);
    const weekend = cursor.getDay() === 0 || cursor.getDay() === 6;
    dates.push({
      dateKey,
      label: new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit" }).format(cursor),
      weekend,
    });
    cursor = addDays(cursor, 1);
  }
  return dates;
};

const buildHeatmap = (rows: AttendanceDayRow[]): AttendanceHeatmapData => {
  const dates = buildHeatmapDates(rows);
  const employeeMap = new Map<
    string,
    { employeeId: string; employeeName: string }
  >();
  const rowMap = new Map<string, AttendanceDayRow>();

  rows.forEach((row) => {
    const identity = employeeKeyOf(row.employeeId, row.employeeName);
    employeeMap.set(identity, {
      employeeId: row.employeeId,
      employeeName: row.employeeName,
    });
    rowMap.set(`${identity}::${row.dateKey}`, row);
  });

  const sortedEmployees = Array.from(employeeMap.entries()).sort((first, second) =>
    first[1].employeeName.localeCompare(second[1].employeeName),
  );

  const heatmapRows: AttendanceHeatmapRow[] = sortedEmployees.map(
    ([identity, employee]) => ({
      employeeId: employee.employeeId,
      employeeName: employee.employeeName,
      cells: dates.map((date) => {
        if (date.weekend) {
          return { dateKey: date.dateKey, status: "weekend" as const };
        }

        const row = rowMap.get(`${identity}::${date.dateKey}`);
        if (!row || !row.present) {
          return { dateKey: date.dateKey, status: "absent" as const };
        }
        if (row.late) {
          return { dateKey: date.dateKey, status: "late" as const };
        }
        return { dateKey: date.dateKey, status: "present" as const };
      }),
    }),
  );

  return { dates, rows: heatmapRows };
};

export const importAttendanceFromExcel = async (
  files: File[],
): Promise<AttendanceImportResult> => {
  const xlsx = await import("xlsx");
  const excelFiles = files.filter((file) => /\.(xlsx|xls)$/i.test(file.name));
  if (excelFiles.length === 0) {
    throw new Error("Please select at least one Excel file (.xlsx or .xls).");
  }

  const extractedRows: AttendanceDayRow[] = [];

  for (const file of excelFiles) {
    const buffer = await file.arrayBuffer();
    const workbook = xlsx.read(buffer, { type: "array", cellDates: true });
    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) {
        return;
      }
      extractedRows.push(...parseSheetRows(sheet, xlsx));
    });
  }

  const mergedRows = mergeRows(extractedRows);
  if (mergedRows.length === 0) {
    throw new Error(
      "No valid attendance rows were found. Ensure the sheet has Name and Date columns.",
    );
  }

  const uniqueDays = new Set(mergedRows.map((row) => row.dateKey)).size;
  const employeeSummary = buildEmployeeSummary(mergedRows);

  return {
    analytics: buildAnalytics(mergedRows),
    employeeSummary,
    heatmap: buildHeatmap(mergedRows),
    filesProcessed: excelFiles.length,
    uniqueDays,
    totalEmployees: employeeSummary.length,
  };
};
