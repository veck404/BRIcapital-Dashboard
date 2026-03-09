import { RotateCcw, Upload, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import AttendanceChart from "../components/AttendanceChart";
import {
  fetchAttendanceAnalytics,
  type AttendanceAnalytics,
} from "../services/api";
import {
  clearAttendanceImportCache,
  getAttendanceImportCache,
  setAttendanceImportCache,
} from "../services/attendanceCache";
import {
  importAttendanceFromExcel,
  type AttendanceHeatmapData,
  type AttendanceHeatmapStatus,
  type EmployeeAttendanceSummary,
} from "../services/attendanceImport";

const heatmapCellClass: Record<AttendanceHeatmapStatus, string> = {
  present: "bg-emerald-500/85",
  late: "bg-amber-400/90",
  absent: "bg-rose-500/85",
  weekend: "bg-slate-200",
};

const heatmapStatusLabel: Record<AttendanceHeatmapStatus, string> = {
  present: "On Time",
  late: "Late",
  absent: "Absent",
  weekend: "Weekend",
};

const parseClockToMinutes = (value: string) => {
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

const toClockLabel = (value: number) =>
  `${Math.floor(value / 60)
    .toString()
    .padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`;

type ModalAttendanceStatus = "On Time" | "Late" | "Absent" | "Weekend";

interface EmployeeModalRecord {
  dateKey: string;
  dateLabel: string;
  checkIn: string;
  checkOut: string;
  status: ModalAttendanceStatus;
}

const normalizeEmployeeName = (value: string) =>
  value.toLowerCase().replace(/\s+/g, " ").trim();

const summaryKey = (row: Pick<EmployeeAttendanceSummary, "employeeId" | "employeeName">) =>
  row.employeeId
    ? `${row.employeeId}::${normalizeEmployeeName(row.employeeName)}`
    : `name::${normalizeEmployeeName(row.employeeName)}`;

const recordKey = (
  record: Pick<AttendanceAnalytics["records"][number], "employeeId" | "employeeName">,
) =>
  record.employeeId
    ? `${record.employeeId}::${normalizeEmployeeName(record.employeeName)}`
    : `name::${normalizeEmployeeName(record.employeeName)}`;

const toLongDateLabel = (dateKey: string) => {
  const parsed = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return dateKey;
  }
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
};

const modalStatusPillClass: Record<ModalAttendanceStatus, string> = {
  "On Time": "bg-emerald-100 text-emerald-700",
  Late: "bg-amber-100 text-amber-700",
  Absent: "bg-rose-100 text-rose-700",
  Weekend: "bg-slate-100 text-slate-600",
};

const Attendance = () => {
  const [attendanceData, setAttendanceData] = useState<AttendanceAnalytics | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [employeeSummary, setEmployeeSummary] = useState<
    EmployeeAttendanceSummary[]
  >([]);
  const [heatmapData, setHeatmapData] = useState<AttendanceHeatmapData | null>(
    null,
  );
  const [importInfo, setImportInfo] = useState<string | null>(null);
  const [cacheExpiresAt, setCacheExpiresAt] = useState<number | null>(null);
  const [selectedEmployeeKey, setSelectedEmployeeKey] = useState<string | null>(
    null,
  );

  const loadDefaultAttendance = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetchAttendanceAnalytics();
      setAttendanceData(response);
    } catch (requestError) {
      setError("Failed to load attendance analytics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cached = getAttendanceImportCache();
    if (cached) {
      setAttendanceData(cached.analytics);
      setEmployeeSummary(cached.employeeSummary);
      setHeatmapData(cached.heatmap);
      setImportInfo(cached.importInfo);
      setCacheExpiresAt(cached.expiresAt);
      setError(null);
      setLoading(false);
      return;
    }

    void loadDefaultAttendance();
  }, [loadDefaultAttendance]);

  useEffect(() => {
    if (!cacheExpiresAt) {
      return;
    }

    const remainingMs = cacheExpiresAt - Date.now();
    if (remainingMs <= 0) {
      clearAttendanceImportCache();
      setEmployeeSummary([]);
      setHeatmapData(null);
      setImportInfo(null);
      setCacheExpiresAt(null);
      setSelectedEmployeeKey(null);
      void loadDefaultAttendance();
      return;
    }

    const timer = window.setTimeout(() => {
      clearAttendanceImportCache();
      setEmployeeSummary([]);
      setHeatmapData(null);
      setImportInfo(null);
      setCacheExpiresAt(null);
      setSelectedEmployeeKey(null);
      void loadDefaultAttendance();
    }, remainingMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [cacheExpiresAt, loadDefaultAttendance]);

  useEffect(() => {
    if (!selectedEmployeeKey) {
      return;
    }

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedEmployeeKey(null);
      }
    };

    window.addEventListener("keydown", handleEsc);
    return () => {
      window.removeEventListener("keydown", handleEsc);
    };
  }, [selectedEmployeeKey]);

  const fallbackSummary = useMemo(() => {
    if (!attendanceData) {
      return [];
    }

    const summaryMap = new Map<
      string,
      EmployeeAttendanceSummary & {
        totalClockInMinutes: number;
        clockInSamples: number;
      }
    >();
    attendanceData.records.forEach((record) => {
      const key = recordKey(record);
      const current = summaryMap.get(key) ?? {
        employeeId: record.employeeId ?? "",
        employeeName: record.employeeName,
        clockInTime: "-",
        daysPresent: 0,
        lateClockIns: 0,
        daysAbsent: 0,
        totalClockInMinutes: 0,
        clockInSamples: 0,
      };
      current.daysPresent += 1;
      if (record.status === "Late") {
        current.lateClockIns += 1;
      }
      const checkInMinutes = parseClockToMinutes(record.checkIn);
      if (checkInMinutes !== null) {
        current.totalClockInMinutes += checkInMinutes;
        current.clockInSamples += 1;
      }
      summaryMap.set(key, current);
    });

    return Array.from(summaryMap.values())
      .map((row): EmployeeAttendanceSummary => {
        const averageMinutes =
          row.clockInSamples > 0
            ? Math.round(row.totalClockInMinutes / row.clockInSamples)
            : null;
        return {
          employeeId: row.employeeId,
          employeeName: row.employeeName,
          clockInTime: averageMinutes !== null ? toClockLabel(averageMinutes) : "-",
          daysPresent: row.daysPresent,
          lateClockIns: row.lateClockIns,
          daysAbsent: row.daysAbsent,
        };
      })
      .sort((first, second) => first.employeeName.localeCompare(second.employeeName));
  }, [attendanceData]);

  const visibleSummary = employeeSummary.length > 0 ? employeeSummary : fallbackSummary;

  const recordsByEmployee = useMemo(() => {
    const grouped = new Map<string, AttendanceAnalytics["records"]>();
    if (!attendanceData) {
      return grouped;
    }

    attendanceData.records.forEach((record) => {
      const key = recordKey(record);
      const current = grouped.get(key) ?? [];
      current.push(record);
      grouped.set(key, current);
    });

    grouped.forEach((records, key) => {
      grouped.set(
        key,
        [...records].sort((first, second) => second.date.localeCompare(first.date)),
      );
    });

    return grouped;
  }, [attendanceData]);

  const selectedEmployeeSummary = useMemo(
    () =>
      selectedEmployeeKey
        ? visibleSummary.find((row) => summaryKey(row) === selectedEmployeeKey) ?? null
        : null,
    [selectedEmployeeKey, visibleSummary],
  );

  const selectedEmployeeRecords = useMemo<EmployeeModalRecord[]>(() => {
    if (!selectedEmployeeSummary) {
      return [];
    }

    const key = summaryKey(selectedEmployeeSummary);
    const records = recordsByEmployee.get(key) ?? [];
    const recordsByDate = new Map<string, AttendanceAnalytics["records"][number]>();
    records.forEach((record) => {
      if (!recordsByDate.has(record.date)) {
        recordsByDate.set(record.date, record);
      }
    });

    if (heatmapData) {
      const targetRow = heatmapData.rows.find(
        (row) =>
          normalizeEmployeeName(row.employeeName)
            === normalizeEmployeeName(selectedEmployeeSummary.employeeName)
          && (
            !selectedEmployeeSummary.employeeId
            || !row.employeeId
            || row.employeeId === selectedEmployeeSummary.employeeId
          ),
      );

      if (targetRow) {
        return heatmapData.dates
          .map((date, index) => {
            const existingRecord = recordsByDate.get(date.dateKey);
            const cellStatus = targetRow.cells[index]?.status;
            const status: ModalAttendanceStatus =
              cellStatus === "late"
                ? "Late"
                : cellStatus === "present"
                  ? "On Time"
                  : cellStatus === "weekend"
                    ? "Weekend"
                    : "Absent";

            return {
              dateKey: date.dateKey,
              dateLabel: toLongDateLabel(date.dateKey),
              checkIn: existingRecord?.checkIn ?? "-",
              checkOut: existingRecord?.checkOut ?? "-",
              status,
            };
          })
          .sort((first, second) => second.dateKey.localeCompare(first.dateKey));
      }
    }

    return records
      .map((record) => ({
        dateKey: record.date,
        dateLabel: toLongDateLabel(record.date),
        checkIn: record.checkIn,
        checkOut: record.checkOut,
        status: record.status,
      }))
      .sort((first, second) => second.dateKey.localeCompare(first.dateKey));
  }, [heatmapData, recordsByEmployee, selectedEmployeeSummary]);

  const openEmployeeModal = (row: EmployeeAttendanceSummary) => {
    setSelectedEmployeeKey(summaryKey(row));
  };

  const handleSummaryRowKeyDown = (
    event: ReactKeyboardEvent<HTMLTableRowElement>,
    row: EmployeeAttendanceSummary,
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openEmployeeModal(row);
    }
  };

  const handleFileImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    if (files.length === 0) {
      return;
    }

    try {
      setImporting(true);
      setError(null);
      const imported = await importAttendanceFromExcel(files);
      const summaryInfo = `Imported ${imported.filesProcessed} file(s), ${imported.uniqueDays} day(s), ${imported.totalEmployees} employee(s).`;
      const cacheEntry = setAttendanceImportCache({
        analytics: imported.analytics,
        employeeSummary: imported.employeeSummary,
        heatmap: imported.heatmap,
        importInfo: summaryInfo,
      });
      setAttendanceData(imported.analytics);
      setEmployeeSummary(imported.employeeSummary);
      setHeatmapData(imported.heatmap);
      setImportInfo(summaryInfo);
      setCacheExpiresAt(cacheEntry.expiresAt);
      setSelectedEmployeeKey(null);
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "Unable to import attendance workbook.",
      );
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  };

  const handleResetToSample = async () => {
    clearAttendanceImportCache();
    setEmployeeSummary([]);
    setHeatmapData(null);
    setImportInfo(null);
    setCacheExpiresAt(null);
    setSelectedEmployeeKey(null);
    await loadDefaultAttendance();
  };

  if (loading && !attendanceData) {
    return (
      <section className="space-y-6">
        <div className="card-surface h-96 animate-pulse bg-slate-100/80" />
        <div className="card-surface h-96 animate-pulse bg-slate-100/80" />
      </section>
    );
  }

  if (!attendanceData) {
    return (
      <section className="card-surface p-6">
        <p className="text-sm font-medium text-rose-600">
          {error ?? "Unable to render attendance analytics."}
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <section className="card-surface p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="section-title">Attendance Workbook Import</h3>
            <p className="mt-1 text-xs text-slate-500">
              Upload weekly/monthly Excel files from the attendance machine.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <label
              className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                importing
                  ? "cursor-wait border-slate-200 bg-slate-100 text-slate-500"
                  : "border-sky-200 bg-sky-50 text-sky-700 hover:border-sky-300 hover:bg-sky-100"
              }`}
            >
              <Upload size={16} />
              {importing ? "Importing..." : "Import Excel"}
              <input
                type="file"
                accept=".xlsx,.xls"
                multiple
                onChange={handleFileImport}
                className="sr-only"
                disabled={importing}
              />
            </label>

            {employeeSummary.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  void handleResetToSample();
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                <RotateCcw size={16} />
                Reset to sample
              </button>
            ) : null}
          </div>
        </div>

        <p className="mt-3 text-xs text-slate-600">
          {importInfo ?? "Showing sample attendance data until a workbook is imported."}
        </p>
      </section>

      {error ? (
        <section className="card-surface px-4 py-3" role="alert">
          <p className="text-sm font-medium text-rose-600">{error}</p>
        </section>
      ) : null}

      <AttendanceChart
        data={attendanceData}
        employeeSummary={visibleSummary}
        heatmapData={heatmapData}
      />

      <section className="card-surface overflow-hidden">
        <div className="border-b border-slate-200/80 px-5 py-4">
          <h3 className="section-title">4) Employee-Day Attendance Heatmap</h3>
          <p className="mt-1 text-xs text-slate-500">
            View daily attendance status per employee across the imported period.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200/80 px-5 py-3">
          {(["present", "late", "absent", "weekend"] as AttendanceHeatmapStatus[]).map(
            (status) => (
              <div key={status} className="inline-flex items-center gap-2 text-xs text-slate-600">
                <span className={`inline-block h-3 w-3 rounded ${heatmapCellClass[status]}`} />
                {heatmapStatusLabel[status]}
              </div>
            ),
          )}
        </div>

        {heatmapData ? (
          <div className="overflow-auto px-5 py-4">
            <table className="border-separate border-spacing-1 text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left font-semibold text-slate-600">
                    Employee
                  </th>
                  {heatmapData.dates.map((date) => (
                    <th key={date.dateKey} className="px-1.5 py-2 text-center font-medium text-slate-500">
                      {date.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatmapData.rows.map((row) => (
                  <tr key={`${row.employeeId}-${row.employeeName}`}>
                    <td className="sticky left-0 z-10 bg-white px-3 py-1.5 font-medium text-slate-700">
                      {row.employeeName}
                    </td>
                    {row.cells.map((cell) => (
                      <td key={`${row.employeeId}-${cell.dateKey}`} className="px-0.5 py-0.5">
                        <span
                          className={`block h-5 w-5 rounded ${heatmapCellClass[cell.status]}`}
                          title={`${row.employeeName} - ${cell.dateKey}: ${heatmapStatusLabel[cell.status]}`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-6 text-sm text-slate-500">
            Import one or more attendance workbooks to render the heatmap.
          </p>
        )}
      </section>

      <div className="card-surface overflow-hidden">
        <div className="border-b border-slate-200/80 px-5 py-4">
          <h3 className="section-title">Employee Attendance Summary</h3>
          <p className="mt-1 text-xs text-slate-500">
            Click any row to view that employee&apos;s detailed attendance record.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200/80 text-sm">
            <thead className="bg-slate-50/70">
              <tr>
                <th className="px-5 py-3 text-left font-semibold text-slate-600">
                  Employee Name
                </th>
                <th className="px-5 py-3 text-right font-semibold text-slate-600">
                  Clock-In Time
                </th>
                <th className="px-5 py-3 text-right font-semibold text-slate-600">
                  Days Present
                </th>
                <th className="px-5 py-3 text-right font-semibold text-slate-600">
                  Late Clock-Ins
                </th>
                <th className="px-5 py-3 text-right font-semibold text-slate-600">
                  Days Absent
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70">
              {visibleSummary.map((row) => (
                <tr
                  key={`${row.employeeId}-${row.employeeName}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    openEmployeeModal(row);
                  }}
                  onKeyDown={(event) => {
                    handleSummaryRowKeyDown(event, row);
                  }}
                  className="cursor-pointer transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60"
                  aria-label={`Open attendance record for ${row.employeeName}`}
                >
                  <td className="px-5 py-3 text-slate-700">
                    <span className="font-semibold text-sky-700 underline decoration-sky-300 underline-offset-4">
                      {row.employeeName}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right font-semibold text-slate-700">
                    {row.clockInTime ?? "-"}
                  </td>
                  <td className="px-5 py-3 text-right font-semibold text-emerald-700">
                    {row.daysPresent}
                  </td>
                  <td className="px-5 py-3 text-right font-semibold text-amber-700">
                    {row.lateClockIns}
                  </td>
                  <td className="px-5 py-3 text-right font-semibold text-rose-700">
                    {row.daysAbsent}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedEmployeeSummary
        ? createPortal(
          <div
            className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-950/45 px-4 py-6"
            onClick={() => {
              setSelectedEmployeeKey(null);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="employee-record-modal-title"
              className="w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              <div className="flex items-start justify-between border-b border-slate-200/80 px-5 py-4">
                <div>
                  <h4
                    id="employee-record-modal-title"
                    className="font-heading text-lg font-semibold text-slate-900"
                  >
                    {selectedEmployeeSummary.employeeName}
                  </h4>
                  <p className="mt-1 text-xs text-slate-500">
                    Individual attendance record
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedEmployeeKey(null);
                  }}
                  className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Close attendance record"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="max-h-[65vh] overflow-auto">
                {selectedEmployeeRecords.length > 0 ? (
                  <table className="min-w-full divide-y divide-slate-200/80 text-sm">
                    <thead className="bg-slate-50/70">
                      <tr>
                        <th className="px-5 py-3 text-left font-semibold text-slate-600">Date</th>
                        <th className="px-5 py-3 text-right font-semibold text-slate-600">Check-In</th>
                        <th className="px-5 py-3 text-right font-semibold text-slate-600">Check-Out</th>
                        <th className="px-5 py-3 text-right font-semibold text-slate-600">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/70">
                      {selectedEmployeeRecords.map((record) => (
                        <tr key={`${selectedEmployeeSummary.employeeName}-${record.dateKey}`}>
                          <td className="px-5 py-3 text-slate-700">{record.dateLabel}</td>
                          <td className="px-5 py-3 text-right font-semibold text-slate-700">{record.checkIn}</td>
                          <td className="px-5 py-3 text-right font-semibold text-slate-700">{record.checkOut}</td>
                          <td className="px-5 py-3 text-right">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${modalStatusPillClass[record.status]}`}>
                              {record.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="px-5 py-8 text-sm text-slate-500">
                    No attendance rows found for this employee in the current data set.
                  </p>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )
        : null}
    </section>
  );
};

export default Attendance;
