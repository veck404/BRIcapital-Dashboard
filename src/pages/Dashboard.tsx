import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, Clock4, Network, UserCheck, UserX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ChartExportButtons from "../components/ChartExportButtons";
import StatCard from "../components/StatCard";
import DeviceTable from "../components/DeviceTable";
import {
  fetchAttendanceAnalytics,
  fetchNetworkAnalytics,
  fetchOverviewStats,
  formatBandwidth,
  isCollectorEnabled,
  subscribeToRouterStream,
  type AttendanceAnalytics,
  type NetworkAnalytics,
  type OverviewStats,
} from "../services/api";

const Dashboard = () => {
  const collectorEnabled = isCollectorEnabled();
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [attendance, setAttendance] = useState<AttendanceAnalytics | null>(null);
  const [network, setNetwork] = useState<NetworkAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState<
    "disabled" | "connecting" | "live" | "offline"
  >(collectorEnabled ? "connecting" : "disabled");
  const attendanceSnapshotRef = useRef<HTMLDivElement>(null);
  const bandwidthPulseRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        const [overviewData, attendanceData, networkData] = await Promise.all([
          fetchOverviewStats(),
          fetchAttendanceAnalytics(),
          fetchNetworkAnalytics(),
        ]);
        setOverview(overviewData);
        setAttendance(attendanceData);
        setNetwork(networkData);
      } catch (requestError) {
        setError("Failed to load dashboard data.");
      } finally {
        setLoading(false);
      }
    };

    void loadData();
  }, []);

  useEffect(() => {
    if (!collectorEnabled) {
      return () => undefined;
    }

    const unsubscribe = subscribeToRouterStream(
      (snapshot) => {
        setStreamStatus(snapshot.connected ? "live" : "offline");
        if (snapshot.overview) {
          setOverview((current) =>
            current ? { ...current, ...snapshot.overview } : current,
          );
        }
        if (snapshot.network) {
          setNetwork(snapshot.network);
        }
      },
      () => {
        setStreamStatus("offline");
      },
    );

    return unsubscribe;
  }, [collectorEnabled]);

  if (loading) {
    return (
      <section className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={`overview-skeleton-${index}`}
              className="card-surface h-36 animate-pulse bg-slate-100/80"
            />
          ))}
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="card-surface h-80 animate-pulse bg-slate-100/80" />
          <div className="card-surface h-80 animate-pulse bg-slate-100/80" />
        </div>
        <div className="card-surface h-96 animate-pulse bg-slate-100/80" />
      </section>
    );
  }

  if (error || !overview || !attendance || !network) {
    return (
      <section className="card-surface p-6">
        <p className="text-sm font-medium text-rose-600">
          {error ?? "Unable to render dashboard right now."}
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      {collectorEnabled ? (
        <section className="card-surface flex items-center justify-between gap-3 px-4 py-3 text-sm">
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                streamStatus === "live"
                  ? "bg-emerald-500"
                  : streamStatus === "connecting"
                    ? "bg-amber-500"
                    : "bg-rose-500"
              }`}
            />
            <p className="font-medium text-slate-700">
              Router Collector:{" "}
              {streamStatus === "live"
                ? "Live feed connected"
                : streamStatus === "connecting"
                  ? "Connecting..."
                  : "Unavailable (fallback data active)"}
            </p>
          </div>
          <p className="hidden text-xs text-slate-500 sm:block">
            Updates stream from collector WebSocket.
          </p>
        </section>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Employees Present Today"
          value={overview.presentToday}
          icon={UserCheck}
          tone="teal"
          helperText="Workforce on-site and active"
        />
        <StatCard
          label="Employees Absent"
          value={overview.absentToday}
          icon={UserX}
          tone="amber"
          helperText="Includes approved leave"
        />
        <StatCard
          label="Late Arrivals"
          value={overview.lateArrivals}
          icon={Clock4}
          tone="slate"
          helperText="Detected after 9:00 AM"
        />
        <StatCard
          label="Bandwidth Usage Today"
          value={formatBandwidth(overview.totalBandwidthGb)}
          icon={Activity}
          tone="blue"
          helperText="Total across all departments"
        />
        <StatCard
          label="Active Devices"
          value={overview.activeDevices}
          icon={Network}
          tone="teal"
          helperText="Online in the last 5 minutes"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card-surface p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="section-title">Attendance Rate Snapshot</h3>
            <ChartExportButtons
              targetRef={attendanceSnapshotRef}
              fileName="dashboard-attendance-rate-snapshot"
              disabled={attendance.trend.length === 0}
            />
          </div>
          <div ref={attendanceSnapshotRef} className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={attendance.trend}>
                <defs>
                  <linearGradient id="attendanceGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#14b8a6" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fill: "#475569", fontSize: 12 }} />
                <YAxis domain={[70, 100]} unit="%" tick={{ fill: "#475569", fontSize: 12 }} />
                <Tooltip formatter={(value: number) => `${value}%`} />
                <Area
                  type="monotone"
                  dataKey="presentRate"
                  stroke="#0f766e"
                  fill="url(#attendanceGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card-surface p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="section-title">Bandwidth Pulse by Time</h3>
            <ChartExportButtons
              targetRef={bandwidthPulseRef}
              fileName="dashboard-bandwidth-pulse-by-time"
              disabled={network.usageOverTime.length === 0}
            />
          </div>
          <div ref={bandwidthPulseRef} className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={network.usageOverTime}>
                <defs>
                  <linearGradient id="networkGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="time" tick={{ fill: "#475569", fontSize: 12 }} />
                <YAxis tick={{ fill: "#475569", fontSize: 12 }} />
                <Tooltip formatter={(value: number) => `${value} GB`} />
                <Area
                  type="monotone"
                  dataKey="bandwidthGb"
                  stroke="#0284c7"
                  fill="url(#networkGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <DeviceTable devices={network.devices} />
    </section>
  );
};

export default Dashboard;
