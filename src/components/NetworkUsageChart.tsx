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
import type { NetworkAnalytics } from "../services/api";

interface NetworkUsageChartProps {
  data: NetworkAnalytics;
}

const pieColors = ["#0ea5e9", "#14b8a6", "#f59e0b", "#6366f1", "#f97316"];

const NetworkUsageChart = ({ data }: NetworkUsageChartProps) => {
  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <section className="card-surface p-4 sm:p-5">
        <h3 className="section-title">Top 10 Devices by Bandwidth</h3>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.topDevices} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" tick={{ fill: "#475569", fontSize: 12 }} />
              <YAxis
                type="category"
                dataKey="device"
                width={120}
                tick={{ fill: "#475569", fontSize: 12 }}
              />
              <Tooltip formatter={(value: number) => `${value} GB`} />
              <Bar dataKey="bandwidthGb" fill="#0ea5e9" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="card-surface p-4 sm:p-5">
        <h3 className="section-title">Bandwidth Usage Over Time</h3>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.usageOverTime}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="time" tick={{ fill: "#475569", fontSize: 12 }} />
              <YAxis tick={{ fill: "#475569", fontSize: 12 }} unit=" GB" />
              <Tooltip formatter={(value: number) => `${value} GB`} />
              <Line
                type="monotone"
                dataKey="bandwidthGb"
                stroke="#0f766e"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="card-surface p-4 sm:p-5">
        <h3 className="section-title">Traffic Distribution</h3>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
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
              <Tooltip formatter={(value: number) => `${value}%`} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
};

export default NetworkUsageChart;
