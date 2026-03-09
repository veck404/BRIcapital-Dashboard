import { RotateCcw, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import AttendanceChart from "../components/AttendanceChart";
import {
  fetchAttendanceAnalytics,
  type AttendanceAnalytics,
} from "../services/api";
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
    void loadDefaultAttendance();
  }, [loadDefaultAttendance]);

  const fallbackSummary = useMemo(() => {
    if (!attendanceData) {
      return [];
    }

    const summaryMap = new Map<string, EmployeeAttendanceSummary>();
    attendanceData.records.forEach((record) => {
      const key = record.employeeName.toLowerCase().trim();
      const current = summaryMap.get(key) ?? {
        employeeId: "",
        employeeName: record.employeeName,
        daysPresent: 0,
        lateClockIns: 0,
        daysAbsent: 0,
      };
      current.daysPresent += 1;
      if (record.status === "Late") {
        current.lateClockIns += 1;
      }
      summaryMap.set(key, current);
    });

    return Array.from(summaryMap.values()).sort((first, second) =>
      first.employeeName.localeCompare(second.employeeName),
    );
  }, [attendanceData]);

  const visibleSummary = employeeSummary.length > 0 ? employeeSummary : fallbackSummary;

  const handleFileImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    if (files.length === 0) {
      return;
    }

    try {
      setImporting(true);
      setError(null);
      const imported = await importAttendanceFromExcel(files);
      setAttendanceData(imported.analytics);
      setEmployeeSummary(imported.employeeSummary);
      setHeatmapData(imported.heatmap);
      setImportInfo(
        `Imported ${imported.filesProcessed} file(s), ${imported.uniqueDays} day(s), ${imported.totalEmployees} employee(s).`,
      );
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
    setEmployeeSummary([]);
    setHeatmapData(null);
    setImportInfo(null);
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

      <AttendanceChart data={attendanceData} employeeSummary={visibleSummary} />

      <section className="card-surface overflow-hidden">
        <div className="border-b border-slate-200/80 px-5 py-4">
          <h3 className="section-title">Employee-Day Attendance Heatmap</h3>
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
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200/80 text-sm">
            <thead className="bg-slate-50/70">
              <tr>
                <th className="px-5 py-3 text-left font-semibold text-slate-600">
                  Employee Name
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
                <tr key={`${row.employeeId}-${row.employeeName}`}>
                  <td className="px-5 py-3 text-slate-700">{row.employeeName}</td>
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
    </section>
  );
};

export default Attendance;
