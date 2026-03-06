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
import type { AttendanceAnalytics } from "../services/api";

interface AttendanceChartProps {
  data: AttendanceAnalytics;
}

const pieColors = ["#14b8a6", "#f59e0b"];

const AttendanceChart = ({ data }: AttendanceChartProps) => {
  return (
    <div className="grid gap-5 xl:grid-cols-3">
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
      </section>

      <section className="card-surface p-4 sm:p-5">
        <h3 className="section-title">30-Day Attendance Trend</h3>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fill: "#475569", fontSize: 12 }} />
              <YAxis
                tick={{ fill: "#475569", fontSize: 12 }}
                domain={[70, 100]}
                unit="%"
              />
              <Tooltip formatter={(value: number) => `${value}%`} />
              <Line
                type="monotone"
                dataKey="presentRate"
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
        <h3 className="section-title">Late vs On-Time Staff</h3>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data.punctuality}
                dataKey="value"
                nameKey="name"
                innerRadius={60}
                outerRadius={95}
                paddingAngle={4}
              >
                {data.punctuality.map((entry, index) => (
                  <Cell
                    key={`${entry.name}-${entry.value}`}
                    fill={pieColors[index % pieColors.length]}
                  />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
};

export default AttendanceChart;
