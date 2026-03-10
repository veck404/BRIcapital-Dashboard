import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { createPortal } from "react-dom";
import type { EmployeeAttendanceSummary } from "../../../services/attendanceImport";
import type { EmployeeModalRecord } from "../helpers";
import { modalStatusPillClass, timelineStatusClass } from "../helpers";

interface EmployeeRecordModalProps {
  selectedEmployeeSummary: EmployeeAttendanceSummary | null;
  rangeLabel: string | null;
  selectedEmployeeIndex: number;
  modalEmployeeCount: number;
  selectedTimeline: EmployeeModalRecord[];
  selectedEmployeeRecords: EmployeeModalRecord[];
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

const EmployeeRecordModal = ({
  selectedEmployeeSummary,
  rangeLabel,
  selectedEmployeeIndex,
  modalEmployeeCount,
  selectedTimeline,
  selectedEmployeeRecords,
  onPrev,
  onNext,
  onClose,
}: EmployeeRecordModalProps) => {
  if (!selectedEmployeeSummary) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-950/50 px-4 py-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="employee-record-modal-title"
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl sm:max-h-none sm:rounded-2xl"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="flex flex-col items-start justify-between gap-3 border-b border-slate-200/80 px-4 py-3 sm:flex-row sm:px-5 sm:py-4">
          <div className="min-w-0 flex-1">
            <h4
              id="employee-record-modal-title"
              className="font-heading truncate text-base font-semibold text-slate-900 sm:text-lg"
            >
              {selectedEmployeeSummary.employeeName}
            </h4>
            <p className="mt-1 truncate text-xs text-slate-500">
              Individual attendance record{" "}
              {rangeLabel ? `(${rangeLabel})` : ""}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onPrev}
              disabled={selectedEmployeeIndex < 0 || modalEmployeeCount <= 1}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeft size={14} />
              Prev
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={selectedEmployeeIndex < 0 || modalEmployeeCount <= 1}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
              <ChevronRight size={14} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close attendance record"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="border-b border-slate-200/80 px-5 py-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Present
              </p>
              <p className="mt-1 text-lg font-semibold text-emerald-700">
                {selectedEmployeeSummary.daysPresent}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                On-Time
              </p>
              <p className="mt-1 text-lg font-semibold text-emerald-700">
                {Math.max(
                  selectedEmployeeSummary.daysPresent
                    - selectedEmployeeSummary.lateClockIns,
                  0,
                )}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Late
              </p>
              <p className="mt-1 text-lg font-semibold text-amber-700">
                {selectedEmployeeSummary.lateClockIns}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Absent
              </p>
              <p className="mt-1 text-lg font-semibold text-rose-700">
                {selectedEmployeeSummary.daysAbsent}
              </p>
            </div>
          </div>

          <div className="mt-4">
            <p className="text-xs font-semibold text-slate-600">
              Recent Attendance Timeline ({selectedTimeline.length} day(s))
            </p>
            <div className="mt-3 grid gap-2">
              <div className="flex flex-wrap gap-2">
                {selectedTimeline.map((entry) => (
                  <div
                    key={`${selectedEmployeeSummary.employeeName}-timeline-${entry.dateKey}`}
                    className="group relative"
                    title={`${entry.dateLabel}: ${entry.status}`}
                  >
                    <span
                      className={`block h-6 w-6 cursor-help rounded-md transition-transform hover:scale-110 ${timelineStatusClass[entry.status]}`}
                    />
                    <span className="absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-xs text-white group-hover:block">
                      {entry.dateLabel}
                      <br />
                      {entry.status}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 text-xs">
                <div className="flex items-center gap-1">
                  <span className="h-3 w-3 rounded bg-emerald-500/90" />
                  <span className="text-slate-600">On Time</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="h-3 w-3 rounded bg-amber-400/95" />
                  <span className="text-slate-600">Late</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="h-3 w-3 rounded bg-rose-500/90" />
                  <span className="text-slate-600">Absent</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="h-3 w-3 rounded bg-slate-200" />
                  <span className="text-slate-600">Weekend</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="max-h-[40vh] flex-1 overflow-auto sm:max-h-[52vh]">
          {selectedEmployeeRecords.length > 0 ? (
            <table className="min-w-full divide-y divide-slate-200/80 text-xs sm:text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50/80">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600 sm:px-5 sm:py-3">
                    Date
                  </th>
                  <th className="px-2 py-2 text-right font-semibold text-slate-600 sm:px-5 sm:py-3">
                    Check-In
                  </th>
                  <th className="px-2 py-2 text-right font-semibold text-slate-600 sm:px-5 sm:py-3">
                    Check-Out
                  </th>
                  <th className="px-2 py-2 text-right font-semibold text-slate-600 sm:px-5 sm:py-3">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70">
                {selectedEmployeeRecords.map((record) => (
                  <tr
                    key={`${selectedEmployeeSummary.employeeName}-${record.dateKey}`}
                  >
                    <td className="px-3 py-2 text-xs text-slate-700 sm:px-5 sm:py-3 sm:text-sm">
                      {record.dateLabel}
                    </td>
                    <td className="px-2 py-2 text-right text-xs font-semibold text-slate-700 sm:px-5 sm:py-3 sm:text-sm">
                      {record.checkIn}
                    </td>
                    <td className="px-2 py-2 text-right text-xs font-semibold text-slate-700 sm:px-5 sm:py-3 sm:text-sm">
                      {record.checkOut}
                    </td>
                    <td className="px-2 py-2 text-right sm:px-5 sm:py-3">
                      <span
                        className={`inline-block whitespace-nowrap rounded-full px-2 py-1 text-xs font-semibold sm:px-2.5 ${modalStatusPillClass[record.status]}`}
                      >
                        {record.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-5 py-8 text-sm text-slate-500">
              No attendance rows found for this employee in the current data
              set.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default EmployeeRecordModal;
