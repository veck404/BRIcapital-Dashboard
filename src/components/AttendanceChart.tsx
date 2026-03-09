import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AttendanceAnalytics } from "../services/api";
import type {
  AttendanceHeatmapData,
  EmployeeAttendanceSummary,
} from "../services/attendanceImport";

interface AttendanceChartProps {
  data: AttendanceAnalytics;
  employeeSummary: EmployeeAttendanceSummary[];
  heatmapData?: AttendanceHeatmapData | null;
}

interface TimeDistributionPoint {
  label: string;
  minutes: number;
  checkInCount: number;
  checkOutCount: number;
}

const pad2 = (value: number) => value.toString().padStart(2, "0");
const CHECK_IN_CUTOFF_MINUTES = 12 * 60;
const CHECK_OUT_START_MINUTES = 12 * 60;

const parseTimeToMinutes = (value: string) => {
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

const minutesToLabel = (minutes: number) =>
  `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;

const lateRateFromPunctuality = (data: AttendanceAnalytics) => {
  const late = data.punctuality.find((item) => item.name === "Late")?.value ?? 0;
  const onTime = data.punctuality.find((item) => item.name === "On Time")?.value ?? 0;
  const present = onTime + late;
  if (present <= 0) {
    return 0;
  }
  return Number(((late / present) * 100).toFixed(1));
};

const buildDailyTrendFromHeatmap = (heatmapData: AttendanceHeatmapData) =>
  heatmapData.dates
    .map((date, dateIndex) => {
      if (date.weekend) {
        return null;
      }

      let present = 0;
      let late = 0;
      let absent = 0;
      heatmapData.rows.forEach((employeeRow) => {
        const cell = employeeRow.cells[dateIndex];
        if (!cell) {
          return;
        }
        if (cell.status === "present") {
          present += 1;
          return;
        }
        if (cell.status === "late") {
          present += 1;
          late += 1;
          return;
        }
        if (cell.status === "absent") {
          absent += 1;
        }
      });

      return {
        date: date.label,
        present,
        absent,
        late,
        lateRate: present > 0 ? Number(((late / present) * 100).toFixed(1)) : 0,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

const buildDailyTrendFallback = (data: AttendanceAnalytics) => {
  const fallbackLateRate = lateRateFromPunctuality(data);
  return data.dailyComparison.map((point) => ({
    date: point.day,
    present: point.present,
    absent: point.absent,
    late: Math.round((point.present * fallbackLateRate) / 100),
    lateRate: fallbackLateRate,
  }));
};

const buildTimeDistribution = (records: AttendanceAnalytics["records"]) => {
  const bucketSizeMinutes = 30;
  const checkInBuckets = new Map<number, number>();
  const checkOutBuckets = new Map<number, number>();

  records.forEach((record) => {
    const checkInMinutes = parseTimeToMinutes(record.checkIn);
    if (checkInMinutes !== null && checkInMinutes <= CHECK_IN_CUTOFF_MINUTES) {
      const bucket =
        Math.floor(checkInMinutes / bucketSizeMinutes) * bucketSizeMinutes;
      checkInBuckets.set(bucket, (checkInBuckets.get(bucket) ?? 0) + 1);
    }

    const checkOutMinutes = parseTimeToMinutes(record.checkOut);
    if (checkOutMinutes !== null && checkOutMinutes >= CHECK_OUT_START_MINUTES) {
      const bucket =
        Math.floor(checkOutMinutes / bucketSizeMinutes) * bucketSizeMinutes;
      checkOutBuckets.set(bucket, (checkOutBuckets.get(bucket) ?? 0) + 1);
    }
  });

  if (checkInBuckets.size === 0 && checkOutBuckets.size === 0) {
    return [] as TimeDistributionPoint[];
  }

  const allBucketKeys = [
    ...checkInBuckets.keys(),
    ...checkOutBuckets.keys(),
  ].sort((first, second) => first - second);
  const first = Math.min(allBucketKeys[0], 8 * 60);
  const last = Math.max(allBucketKeys[allBucketKeys.length - 1], 8 * 60);

  const points: TimeDistributionPoint[] = [];
  for (let current = first; current <= last; current += bucketSizeMinutes) {
    points.push({
      label: minutesToLabel(current),
      minutes: current,
      checkInCount: checkInBuckets.get(current) ?? 0,
      checkOutCount: checkOutBuckets.get(current) ?? 0,
    });
  }

  return points;
};

const AttendanceChart = ({
  data,
  employeeSummary,
  heatmapData,
}: AttendanceChartProps) => {
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

  const lateLeaderboard = [...employeeSummary]
    .map((row) => ({
      employeeName: row.employeeName,
      lateClockIns: row.lateClockIns,
    }))
    .sort(
      (first, second) =>
        second.lateClockIns - first.lateClockIns
        || first.employeeName.localeCompare(second.employeeName),
    )
    .slice(0, 10);

  const punctualLeaderboard = [...employeeSummary]
    .map((row) => ({
      employeeName: row.employeeName,
      onTimeClockIns: Math.max(row.daysPresent - row.lateClockIns, 0),
    }))
    .sort(
      (first, second) =>
        second.onTimeClockIns - first.onTimeClockIns
        || first.employeeName.localeCompare(second.employeeName),
    )
    .slice(0, 10);

  const dailyTrend = heatmapData
    ? buildDailyTrendFromHeatmap(heatmapData)
    : buildDailyTrendFallback(data);

  const timeDistribution = buildTimeDistribution(data.records);
  const breakdownChartHeight = Math.max(280, employeeBreakdown.length * 34);
  const leaderboardHeight = Math.max(280, lateLeaderboard.length * 34);
  const punctualLeaderboardHeight = Math.max(280, punctualLeaderboard.length * 34);

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="card-surface p-4 sm:p-5">
        <h3 className="section-title">1) Per-Employee Stacked Attendance</h3>
        <div className="mt-4" style={{ height: breakdownChartHeight }}>
          <ResponsiveContainer width="100%" height={breakdownChartHeight}>
            <BarChart
              data={employeeBreakdown}
              layout="vertical"
              margin={{ left: 120, right: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fill: "#475569", fontSize: 12 }}
              />
              <YAxis
                type="category"
                dataKey="employeeName"
                width={110}
                tick={{ fill: "#475569", fontSize: 11 }}
              />
              <Tooltip formatter={(value: number) => `${value} day(s)`} />
              <Legend />
              <Bar
                dataKey="onTime"
                name="On Time"
                stackId="days"
                fill="#10b981"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="late"
                name="Late"
                stackId="days"
                fill="#f59e0b"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="absent"
                name="Absent"
                stackId="days"
                fill="#f97316"
                radius={[0, 8, 8, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="card-surface p-4 sm:p-5">
        <h3 className="section-title">2) Late Clock-In Leaderboard</h3>
        <div className="mt-4" style={{ height: leaderboardHeight }}>
          <ResponsiveContainer width="100%" height={leaderboardHeight}>
            <BarChart
              data={lateLeaderboard}
              layout="vertical"
              margin={{ left: 120, right: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fill: "#475569", fontSize: 12 }}
              />
              <YAxis
                type="category"
                dataKey="employeeName"
                width={110}
                tick={{ fill: "#475569", fontSize: 11 }}
              />
              <Tooltip formatter={(value: number) => `${value} late day(s)`} />
              <Bar
                dataKey="lateClockIns"
                name="Late Clock-Ins"
                fill="#f59e0b"
                radius={[0, 8, 8, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-2">
          <h4 className="text-sm font-semibold text-slate-700">
            Punctual Clock-In Leaderboard
          </h4>
          <div className="mt-3" style={{ height: punctualLeaderboardHeight }}>
            <ResponsiveContainer width="100%" height={punctualLeaderboardHeight}>
              <BarChart
                data={punctualLeaderboard}
                layout="vertical"
                margin={{ left: 120, right: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fill: "#475569", fontSize: 12 }}
                />
                <YAxis
                  type="category"
                  dataKey="employeeName"
                  width={110}
                  tick={{ fill: "#475569", fontSize: 11 }}
                />
                <Tooltip formatter={(value: number) => `${value} on-time day(s)`} />
                <Bar
                  dataKey="onTimeClockIns"
                  name="On-Time Clock-Ins"
                  fill="#10b981"
                  radius={[0, 8, 8, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="card-surface p-4 sm:p-5">
        <h3 className="section-title">3) Daily Trend (Present/Absent + Late %)</h3>
        <div className="mt-4 h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={dailyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fill: "#475569", fontSize: 12 }} />
              <YAxis
                yAxisId="count"
                allowDecimals={false}
                tick={{ fill: "#475569", fontSize: 12 }}
              />
              <YAxis
                yAxisId="rate"
                orientation="right"
                domain={[0, 100]}
                tick={{ fill: "#475569", fontSize: 12 }}
                unit="%"
              />
              <Tooltip
                formatter={(value: number, name: string) => {
                  if (name === "Late Rate") {
                    return `${value}%`;
                  }
                  return `${value} day(s)`;
                }}
              />
              <Legend />
              <Bar
                yAxisId="count"
                dataKey="present"
                name="Present"
                fill="#14b8a6"
                radius={[8, 8, 0, 0]}
              />
              <Bar
                yAxisId="count"
                dataKey="absent"
                name="Absent"
                fill="#f97316"
                radius={[8, 8, 0, 0]}
              />
              <Line
                yAxisId="rate"
                dataKey="lateRate"
                name="Late Rate"
                stroke="#b45309"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="card-surface p-4 sm:p-5">
        <h3 className="section-title">5) Check-In / Check-Out Time Distribution</h3>
        <p className="mt-1 text-xs text-slate-500">
          Clock-ins after 12:00 are excluded. Check-outs are shown from 12:00 onward.
        </p>
        <div className="mt-4 h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={timeDistribution}
              barCategoryGap="8%"
              barGap={2}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fill: "#475569", fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fill: "#475569", fontSize: 12 }} />
              <Tooltip
                formatter={(value: number, name: string) =>
                  `${value} ${name === "Check-Out Count" ? "check-out(s)" : "check-in(s)"}`
                }
              />
              <Legend />
              <ReferenceLine
                x="08:00"
                stroke="#dc2626"
                strokeDasharray="4 4"
                label={{ value: "Late Cutoff 08:00", position: "insideTopRight", fill: "#b91c1c", fontSize: 11 }}
              />
              <ReferenceLine
                x="12:00"
                stroke="#94a3b8"
                strokeDasharray="3 3"
                label={{ value: "Noon Split", position: "insideTopLeft", fill: "#64748b", fontSize: 11 }}
              />
              <Bar
                dataKey="checkInCount"
                name="Check-In Count"
                fill="#0ea5e9"
                radius={[8, 8, 0, 0]}
                barSize={18}
              />
              <Bar
                dataKey="checkOutCount"
                name="Check-Out Count"
                fill="#7c3aed"
                radius={[8, 8, 0, 0]}
                barSize={18}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

      </section>
    </div>
  );
};

export default AttendanceChart;
