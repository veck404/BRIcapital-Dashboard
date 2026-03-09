import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { NetworkAnalytics, UsageOverTimePoint } from "../services/api";

interface NetworkUsageChartProps {
  data: NetworkAnalytics;
  usagePoints: UsageOverTimePoint[];
  usageTitle: string;
  usageRangeLabel?: string;
  loading?: boolean;
}

const pieColors = ["#0ea5e9", "#14b8a6", "#f59e0b", "#6366f1", "#f97316"];
const formatVolumeGb = (value: number) =>
  `${value.toLocaleString(undefined, { maximumFractionDigits: 3 })} GB`;

const NetworkUsageChart = ({
  data,
  usagePoints,
  usageTitle,
  usageRangeLabel,
  loading = false,
}: NetworkUsageChartProps) => {
  const topDevicesChartId = "top-devices-chart";
  const usageChartId = "bandwidth-chart";
  const trafficChartId = "traffic-chart";

  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <section className="card-surface p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="section-title">Top 10 Devices by Bandwidth</h3>
          <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700">
            {data.topDevices.length} devices
          </span>
        </div>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data.topDevices}
              layout="vertical"
              margin={{ left: 120 }}
              aria-label={topDevicesChartId}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                type="number"
                tick={{ fill: "#475569", fontSize: 12 }}
                label={{
                  value: "GB",
                  position: "right",
                  offset: -10,
                  fill: "#475569",
                }}
              />
              <YAxis
                type="category"
                dataKey="device"
                width={110}
                tick={{ fill: "#475569", fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(255, 255, 255, 0.95)",
                  border: "1px solid #e2e8f0",
                  borderRadius: "0.5rem",
                }}
                formatter={(value: number) => `${value} GB`}
                cursor={{ fill: "rgba(15, 118, 110, 0.05)" }}
              />
              <Bar dataKey="bandwidthGb" fill="#0ea5e9" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-3 text-xs text-slate-600">
          Shows the top bandwidth consumers on your network
        </p>
      </section>

      <section className="card-surface p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="section-title">{usageTitle}</h3>
            {usageRangeLabel ? (
              <p className="mt-1 text-xs font-medium text-slate-500">
                {usageRangeLabel}
              </p>
            ) : null}
          </div>
          {loading ? (
            <span
              className="animate-pulse rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600"
              role="status"
              aria-live="polite"
            >
              Updating...
            </span>
          ) : null}
        </div>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={usagePoints}
              aria-label={usageChartId}
              margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="time"
                tick={{ fill: "#475569", fontSize: 12 }}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis
                tick={{ fill: "#475569", fontSize: 12 }}
                unit=" GB"
                label={{
                  value: "Bandwidth (GB)",
                  angle: -90,
                  position: "insideLeft",
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(255, 255, 255, 0.95)",
                  border: "1px solid #e2e8f0",
                  borderRadius: "0.5rem",
                }}
                formatter={(value: number) => [`${value} GB`, "Bandwidth"]}
                labelFormatter={(label) => `Time: ${label}`}
                cursor={{ stroke: "#0f766e", strokeWidth: 1 }}
              />
              <Line
                type="monotone"
                dataKey="bandwidthGb"
                stroke="#0f766e"
                strokeWidth={2.5}
                dot={false}
                activeDot={{
                  r: 6,
                  fill: "#0f766e",
                  strokeWidth: 2,
                  stroke: "#fff",
                }}
                name="Bandwidth"
                isAnimationActive={!loading}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-3 text-xs text-slate-600">
          {usageRangeLabel
            ? "Historical bandwidth usage over the selected period"
            : "Real-time bandwidth consumption throughout the day"}
        </p>
      </section>

      <section className="card-surface p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="section-title">Traffic Distribution</h3>
          <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-700">
            {data.trafficDistribution.length} categories
          </span>
        </div>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart aria-label={trafficChartId}>
              <Pie
                data={data.trafficDistribution}
                dataKey="value"
                nameKey="name"
                innerRadius={58}
                outerRadius={95}
                paddingAngle={3}
              >
                {data.trafficDistribution.map((entry, index) => (
                  <Cell
                    key={`${entry.name}-${entry.value}`}
                    fill={pieColors[index % pieColors.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(255, 255, 255, 0.95)",
                  border: "1px solid #e2e8f0",
                  borderRadius: "0.5rem",
                }}
                formatter={(value: number) => formatVolumeGb(value)}
                labelFormatter={(label) => `${label}`}
              />
              <Legend
                verticalAlign="bottom"
                height={36}
                wrapperStyle={{ paddingTop: "1rem" }}
                formatter={(value: string) => (
                  <span className="text-xs font-medium text-slate-700">
                    {value}
                  </span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-3 text-xs text-slate-600">
          Breakdown of network traffic by category
        </p>
      </section>
    </div>
  );
};

export default NetworkUsageChart;
