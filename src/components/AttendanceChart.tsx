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

export type AttendanceChartMode = "trend" | "distribution";

export interface LeaderboardPoint {
  employeeName: string;
  value: number;
  delta: number;
}

interface AttendanceChartProps {
  mode: AttendanceChartMode;
  data: AttendanceAnalytics;
  employeeSummary: EmployeeAttendanceSummary[];
  heatmapData?: AttendanceHeatmapData | null;
  lateLeaderboard: LeaderboardPoint[];
  punctualLeaderboard: LeaderboardPoint[];
  hasPreviousWindow: boolean;
}

interface TimeDistributionPoint {
  label: string;
  minutes: number;
  checkInCount: number;
  checkOutCount: number;
}

const CHECK_IN_CUTOFF_MINUTES = 12 * 60;
const CHECK_OUT_START_MINUTES = 12 * 60;

const pad2 = (value: number) => value.toString().padStart(2, "0");

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

const deltaLabel = (value: number) => {
  if (value > 0) {
    return `+${value}`;
  }
  return `${value}`;
};

interface LeaderboardPanelProps {
  title: string;
  data: LeaderboardPoint[];
  barColor: string;
  valueLabel: string;
  hasPreviousWindow: boolean;
  emptyText: string;
}

const LeaderboardPanel = ({
  title,
  data,
  barColor,
  valueLabel,
  hasPreviousWindow,
  emptyText,
}: LeaderboardPanelProps) => {
  const chartHeight = Math.max(230, data.length * 34);

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
        {hasPreviousWindow ? (
          <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
            Delta vs previous period
          </span>
        ) : null}
      </div>

      {data.length > 0 ? (
        <>
          <div className="mt-3" style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height={chartHeight}>
              <BarChart data={data} layout="vertical" margin={{ left: 100, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fill: "#475569", fontSize: 12 }}
                />
                <YAxis
                  type="category"
                  dataKey="employeeName"
                  width={95}
                  tick={{ fill: "#475569", fontSize: 11 }}
                />
                <Tooltip
                  formatter={(value: number, name: string, item) => {
                    const payload = item.payload as LeaderboardPoint;
                    if (!hasPreviousWindow) {
                      return [`${value} ${valueLabel}`, name];
                    }
                    return [
                      `${value} ${valueLabel} (${deltaLabel(payload.delta)} vs prev)`,
                      name,
                    ];
                  }}
                />
                <Bar dataKey="value" name={valueLabel} fill={barColor} radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

        </>
      ) : (
        <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{emptyText}</p>
      )}
    </section>
  );
};

const AttendanceChart = ({
  mode,
  data,
  employeeSummary,
  heatmapData,
  lateLeaderboard,
  punctualLeaderboard,
  hasPreviousWindow,
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
    )
    .slice(0, 12);

  const dailyTrend = heatmapData
    ? buildDailyTrendFromHeatmap(heatmapData)
    : buildDailyTrendFallback(data);

  const timeDistribution = buildTimeDistribution(data.records);
  const breakdownChartHeight = Math.max(260, employeeBreakdown.length * 34);

  if (mode === "distribution") {
    return (
      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5">
        <h3 className="text-base font-semibold text-slate-900">Clock-In / Check-Out Distribution</h3>
        <p className="mt-1 text-xs text-slate-500">
          Clock-ins after 12:00 are excluded. Check-outs are grouped from 12:00 onward.
        </p>

        <div className="mt-4 h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={timeDistribution} barCategoryGap="8%" barGap={2}>
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
                label={{
                  value: "Late Cutoff 08:00",
                  position: "insideTopRight",
                  fill: "#b91c1c",
                  fontSize: 11,
                }}
              />
              <ReferenceLine
                x="12:00"
                stroke="#94a3b8"
                strokeDasharray="3 3"
                label={{
                  value: "Noon Split",
                  position: "insideTopLeft",
                  fill: "#64748b",
                  fontSize: 11,
                }}
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
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 xl:col-span-2">
        <h3 className="text-base font-semibold text-slate-900">Daily Trend</h3>
        <p className="mt-1 text-xs text-slate-500">
          Present and absent counts are plotted against a smoothed late-rate line.
        </p>
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
                type="monotone"
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

      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5">
        <h3 className="text-base font-semibold text-slate-900">Per-Employee Attendance Mix</h3>
        <p className="mt-1 text-xs text-slate-500">
          Top employees by attendance volume, segmented by on-time, late and absent days.
        </p>
        <div className="mt-4" style={{ height: breakdownChartHeight }}>
          <ResponsiveContainer width="100%" height={breakdownChartHeight}>
            <BarChart data={employeeBreakdown} layout="vertical" margin={{ left: 115, right: 8 }}>
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
              <Bar dataKey="onTime" name="On Time" stackId="days" fill="#10b981" />
              <Bar dataKey="late" name="Late" stackId="days" fill="#f59e0b" />
              <Bar dataKey="absent" name="Absent" stackId="days" fill="#f97316" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="space-y-4">
        <LeaderboardPanel
          title="Late Clock-In Leaderboard"
          data={lateLeaderboard}
          barColor="#f59e0b"
          valueLabel="Late Clock-Ins"
          hasPreviousWindow={hasPreviousWindow}
          emptyText="No late clock-ins in this period."
        />

        <LeaderboardPanel
          title="Punctual Clock-In Leaderboard"
          data={punctualLeaderboard}
          barColor="#10b981"
          valueLabel="On-Time Clock-Ins"
          hasPreviousWindow={hasPreviousWindow}
          emptyText="No on-time clock-ins in this period."
        />
      </div>
    </div>
  );
};

export default AttendanceChart;
