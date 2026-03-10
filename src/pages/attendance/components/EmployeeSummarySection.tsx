import { Filter, Search } from "lucide-react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { EmployeeAttendanceSummary } from "../../../services/attendanceImport";
import type {
  SortColumn,
  SortOrder,
  SummaryQuickFilter,
} from "../helpers";
import { summaryQuickFilters } from "../helpers";

interface EmployeeSummarySectionProps {
  summarySearch: string;
  onSummarySearchChange: (value: string) => void;
  summaryFilter: SummaryQuickFilter;
  onSummaryFilterChange: (value: SummaryQuickFilter) => void;
  filteredSummaryRows: EmployeeAttendanceSummary[];
  sortColumn: SortColumn;
  sortOrder: SortOrder;
  onColumnSort: (column: SortColumn) => void;
  onOpenEmployeeModal: (row: EmployeeAttendanceSummary) => void;
  onSummaryRowKeyDown: (
    event: ReactKeyboardEvent<HTMLTableRowElement>,
    row: EmployeeAttendanceSummary,
  ) => void;
}

const sortIndicator = (active: boolean, order: SortOrder) =>
  active ? <span className="text-xs">{order === "asc" ? "↑" : "↓"}</span> : null;

const EmployeeSummarySection = ({
  summarySearch,
  onSummarySearchChange,
  summaryFilter,
  onSummaryFilterChange,
  filteredSummaryRows,
  sortColumn,
  sortOrder,
  onColumnSort,
  onOpenEmployeeModal,
  onSummaryRowKeyDown,
}: EmployeeSummarySectionProps) => (
  <section className="card-surface overflow-hidden animate-in fade-in slide-in-from-bottom-2 [animation-delay:600ms] transition-all duration-300">
    <div className="border-b border-slate-200/80 px-4 py-4 sm:px-5">
      <h3 className="section-title">Employee Attendance Summary</h3>
      <p className="mt-1 text-xs text-slate-500">
        Search and filter employees, then click a row to drill into
        individual records.
      </p>
    </div>

    <div className="flex flex-col gap-3 border-b border-slate-200/80 px-4 py-3 sm:px-5 md:flex-row md:items-center md:justify-between">
      <label className="relative w-full max-w-sm">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          type="text"
          value={summarySearch}
          onChange={(event) => {
            onSummarySearchChange(event.target.value);
          }}
          placeholder="Search employee"
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
        />
      </label>

      <div className="inline-flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <Filter size={14} />
          Quick Filter
        </span>
        {summaryQuickFilters.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              onSummaryFilterChange(option.value);
            }}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 ${
              summaryFilter === option.value
                ? "border-sky-300 bg-sky-50 text-sky-700"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>

    {filteredSummaryRows.length > 0 ? (
      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <table className="min-w-full divide-y divide-slate-200/80 text-xs sm:text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50/80">
            <tr>
              <th className="px-3 py-2 text-left sm:px-5 sm:py-3">
                <button
                  type="button"
                  onClick={() => onColumnSort("name")}
                  className="inline-flex items-center gap-1 text-left font-semibold text-slate-600 transition hover:text-slate-800 sm:gap-1.5"
                >
                  Employee
                  {sortIndicator(sortColumn === "name", sortOrder)}
                </button>
              </th>
              <th className="px-2 py-2 text-right sm:px-5 sm:py-3">
                <button
                  type="button"
                  onClick={() => onColumnSort("clockIn")}
                  className="inline-flex w-full items-center justify-end gap-1 font-semibold text-slate-600 transition hover:text-slate-800 sm:gap-1.5"
                >
                  <span className="hidden sm:inline">Avg Clock-In</span>
                  <span className="sm:hidden">Clock-In</span>
                  {sortIndicator(sortColumn === "clockIn", sortOrder)}
                </button>
              </th>
              <th className="px-2 py-2 text-right sm:px-5 sm:py-3">
                <button
                  type="button"
                  onClick={() => onColumnSort("present")}
                  className="inline-flex w-full items-center justify-end gap-1 font-semibold text-slate-600 transition hover:text-slate-800 sm:gap-1.5"
                >
                  Present
                  {sortIndicator(sortColumn === "present", sortOrder)}
                </button>
              </th>
              <th className="px-2 py-2 text-right sm:px-5 sm:py-3">
                <button
                  type="button"
                  onClick={() => onColumnSort("onTime")}
                  className="inline-flex w-full items-center justify-end gap-1 font-semibold text-slate-600 transition hover:text-slate-800 sm:gap-1.5"
                >
                  <span className="hidden sm:inline">On-Time</span>
                  <span className="sm:hidden">On-Time</span>
                  {sortIndicator(sortColumn === "onTime", sortOrder)}
                </button>
              </th>
              <th className="px-2 py-2 text-right sm:px-5 sm:py-3">
                <button
                  type="button"
                  onClick={() => onColumnSort("late")}
                  className="inline-flex w-full items-center justify-end gap-1 font-semibold text-slate-600 transition hover:text-slate-800 sm:gap-1.5"
                >
                  Late
                  {sortIndicator(sortColumn === "late", sortOrder)}
                </button>
              </th>
              <th className="px-2 py-2 text-right sm:px-5 sm:py-3">
                <button
                  type="button"
                  onClick={() => onColumnSort("absent")}
                  className="inline-flex w-full items-center justify-end gap-1 font-semibold text-slate-600 transition hover:text-slate-800 sm:gap-1.5"
                >
                  Absent
                  {sortIndicator(sortColumn === "absent", sortOrder)}
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/70">
            {filteredSummaryRows.map((row) => {
              const onTimeDays = Math.max(row.daysPresent - row.lateClockIns, 0);
              return (
                <tr
                  key={`${row.employeeId}-${row.employeeName}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    onOpenEmployeeModal(row);
                  }}
                  onKeyDown={(event) => {
                    onSummaryRowKeyDown(event, row);
                  }}
                  className="cursor-pointer transition-all duration-200 hover:bg-sky-50/50 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 active:bg-sky-100/30"
                  aria-label={`Open attendance record for ${row.employeeName}`}
                >
                  <td className="px-3 py-2 text-slate-700 sm:px-5 sm:py-3">
                    <span className="font-semibold text-sky-700 underline decoration-sky-300 underline-offset-4 transition-colors hover:text-sky-800">
                      {row.employeeName}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right text-xs font-semibold text-slate-700 sm:px-5 sm:py-3 sm:text-sm">
                    {row.clockInTime ?? "-"}
                  </td>
                  <td className="px-2 py-2 text-right text-xs font-semibold text-emerald-700 sm:px-5 sm:py-3 sm:text-sm">
                    {row.daysPresent}
                  </td>
                  <td className="px-2 py-2 text-right text-xs font-semibold text-emerald-700 sm:px-5 sm:py-3 sm:text-sm">
                    {onTimeDays}
                  </td>
                  <td className="px-2 py-2 text-right text-xs font-semibold text-amber-700 sm:px-5 sm:py-3 sm:text-sm">
                    {row.lateClockIns}
                  </td>
                  <td className="px-2 py-2 text-right text-xs font-semibold text-rose-700 sm:px-5 sm:py-3 sm:text-sm">
                    {row.daysAbsent}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    ) : (
      <div className="px-5 py-8 text-center">
        <p className="text-sm font-medium text-slate-600">
          No employees match this filter.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Adjust search text or quick filter to view results.
        </p>
      </div>
    )}
  </section>
);

export default EmployeeSummarySection;
