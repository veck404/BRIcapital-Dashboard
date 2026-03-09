import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AttendanceAnalytics } from "../services/api";
import type { EmployeeAttendanceSummary } from "../services/attendanceImport";

interface AttendanceChartProps {
  data: AttendanceAnalytics;
  employeeSummary: EmployeeAttendanceSummary[];
}

const pieColors = ["#10b981", "#f59e0b", "#f97316"];

const AttendanceChart = ({ data, employeeSummary }: AttendanceChartProps) => {
  const employeeBreakdown = [...employeeSummary]
    .map((row) => ({
      employeeName: row.employeeName,
      onTime: Math.max(row.daysPresent - row.lateClockIns, 0),
      late: row.lateClockIns,
      absent: row.daysAbsent,
    }))
    .sort(
      (first, second) =>
        second.absent - first.absent
        || second.late - first.late
        || first.employeeName.localeCompare(second.employeeName),
    );

  const statusMix = (() => {
    if (employeeBreakdown.length === 0) {
      return [
        { name: "On Time", value: data.punctuality.find((item) => item.name === "On Time")?.value ?? 0 },
        { name: "Late", value: data.punctuality.find((item) => item.name === "Late")?.value ?? 0 },
        { name: "Absent", value: 0 },
      ];
    }

    const onTime = employeeBreakdown.reduce((sum, row) => sum + row.onTime, 0);
    const late = employeeBreakdown.reduce((sum, row) => sum + row.late, 0);
    const absent = employeeBreakdown.reduce((sum, row) => sum + row.absent, 0);
    return [
      { name: "On Time", value: onTime },
      { name: "Late", value: late },
      { name: "Absent", value: absent },
    ];
  })();

  const breakdownChartHeight = Math.max(280, employeeBreakdown.length * 34);

  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <section className="card-surface p-4 sm:p-5">
        <h3 className="section-title">Per-Employee Attendance Breakdown</h3>
        <div className="mt-4" style={{ height: breakdownChartHeight }}>
          <ResponsiveContainer width="100%" height={breakdownChartHeight}>
            <BarChart
              data={employeeBreakdown}
              layout="vertical"
              margin={{ left: 120, right: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" allowDecimals={false} tick={{ fill: "#475569", fontSize: 12 }} />
              <YAxis
                type="category"
                dataKey="employeeName"
                width={110}
                tick={{ fill: "#475569", fontSize: 11 }}
              />
              <Tooltip formatter={(value: number) => `${value} day(s)`} />
              <Legend />
              <Bar dataKey="onTime" name="On Time" stackId="days" fill="#10b981" radius={[0, 0, 0, 0]} />
              <Bar dataKey="late" name="Late" stackId="days" fill="#f59e0b" radius={[0, 0, 0, 0]} />
              <Bar dataKey="absent" name="Absent" stackId="days" fill="#f97316" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-3 text-xs text-slate-600">
          Stacked totals per employee for on-time, late, and absent workdays.
        </p>
      </section>

      <section className="card-surface p-4 sm:p-5">
        <h3 className="section-title">Daily Attendance (Present vs Absent)</h3>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.dailyComparison}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="day" tick={{ fill: "#475569", fontSize: 12 }} />
              <YAxis tick={{ fill: "#475569", fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="present" name="Present" fill="#14b8a6" radius={[8, 8, 0, 0]} />
              <Bar dataKey="absent" name="Absent" fill="#f97316" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-3 text-xs text-slate-600">
          Attendance volume by date across the selected import period.
        </p>
      </section>

      <section className="card-surface p-4 sm:p-5">
        <h3 className="section-title">Workday Status Mix</h3>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={statusMix}
                dataKey="value"
                nameKey="name"
                innerRadius={60}
                outerRadius={95}
                paddingAngle={4}
              >
                {statusMix.map((entry, index) => (
                  <Cell
                    key={`${entry.name}-${entry.value}`}
                    fill={pieColors[index % pieColors.length]}
                  />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => `${value} day(s)`} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-3 text-xs text-slate-600">
          Overall distribution of on-time, late, and absent workdays.
        </p>
      </section>
    </div>
  );
};

export default AttendanceChart;
