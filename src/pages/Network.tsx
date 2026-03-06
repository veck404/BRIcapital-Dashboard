import { Activity } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import DeviceTable from "../components/DeviceTable";
import NetworkUsageChart from "../components/NetworkUsageChart";
import StatCard from "../components/StatCard";
import {
  fetchNetworkUsageHistory,
  fetchNetworkAnalytics,
  formatBandwidth,
  isCollectorEnabled,
  subscribeToRouterStream,
  type BandwidthHistoryInterval,
  type NetworkAnalytics,
  type NetworkUsageHistoryResponse,
} from "../services/api";

const intervalOptions: { value: BandwidthHistoryInterval; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "custom", label: "Custom" },
];

const toInputDate = (value: Date) => {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const prettyDate = (value: string) => {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
};

const Network = () => {
  const collectorEnabled = isCollectorEnabled();
  const [networkData, setNetworkData] = useState<NetworkAnalytics | null>(null);
  const [usageHistory, setUsageHistory] = useState<NetworkUsageHistoryResponse | null>(
    null,
  );
  const [networkLoading, setNetworkLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [interval, setInterval] = useState<BandwidthHistoryInterval>("daily");
  const [customStart, setCustomStart] = useState(() => {
    const base = new Date();
    base.setDate(base.getDate() - 13);
    return toInputDate(base);
  });
  const [customEnd, setCustomEnd] = useState(() => toInputDate(new Date()));
  const [streamStatus, setStreamStatus] = useState<
    "disabled" | "connecting" | "live" | "offline"
  >(collectorEnabled ? "connecting" : "disabled");

  useEffect(() => {
    const loadData = async () => {
      try {
        setNetworkLoading(true);
        setError(null);
        const response = await fetchNetworkAnalytics();
        setNetworkData(response);
      } catch {
        setError("Failed to load network analytics.");
      } finally {
        setNetworkLoading(false);
      }
    };

    void loadData();
  }, []);

  const loadHistory = useCallback(
    async (showLoading: boolean) => {
      if (showLoading) {
        setHistoryLoading(true);
      }
      setHistoryError(null);

      try {
        const payload = await fetchNetworkUsageHistory({
          interval,
          ...(interval === "custom" ? { start: customStart, end: customEnd } : {}),
        });
        setUsageHistory(payload);
      } catch {
        setHistoryError("Unable to load usage history for the selected interval.");
      } finally {
        setHistoryLoading(false);
      }
    },
    [customEnd, customStart, interval],
  );

  useEffect(() => {
    void loadHistory(true);
  }, [loadHistory]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadHistory(false);
    }, collectorEnabled ? 30000 : 60000);

    return () => {
      window.clearInterval(timer);
    };
  }, [collectorEnabled, loadHistory]);

  useEffect(() => {
    if (!collectorEnabled) {
      return () => undefined;
    }

    const unsubscribe = subscribeToRouterStream(
      (snapshot) => {
        setStreamStatus(snapshot.connected ? "live" : "offline");
        if (snapshot.network) {
          setNetworkData(snapshot.network);
        }
      },
      () => {
        setStreamStatus("offline");
      },
    );

    return unsubscribe;
  }, [collectorEnabled]);

  if ((networkLoading && !networkData) || (historyLoading && !usageHistory)) {
    return (
      <section className="space-y-6">
        <div className="card-surface h-32 animate-pulse bg-slate-100/80" />
        <div className="card-surface h-96 animate-pulse bg-slate-100/80" />
        <div className="card-surface h-96 animate-pulse bg-slate-100/80" />
      </section>
    );
  }

  if (error || !networkData) {
    return (
      <section className="card-surface p-6">
        <p className="text-sm font-medium text-rose-600">
          {error ?? "Unable to render network analytics."}
        </p>
      </section>
    );
  }

  const usagePoints = usageHistory?.points ?? networkData.usageOverTime;
  const usageTitle =
    interval === "weekly"
      ? "Bandwidth Usage by Week"
      : interval === "monthly"
        ? "Bandwidth Usage by Month"
        : interval === "custom"
          ? "Bandwidth Usage (Custom Interval)"
          : "Bandwidth Usage by Day";

  const usageRangeLabel = usageHistory
    ? `${prettyDate(usageHistory.rangeStart)} to ${prettyDate(usageHistory.rangeEnd)}`
    : undefined;

  const totalBandwidthTodayGb = networkData.totalBandwidthTodayGb
    ?? Number(
      networkData.usageOverTime.reduce((sum, point) => sum + point.bandwidthGb, 0).toFixed(3),
    );

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
            Device and bandwidth metrics update automatically.
          </p>
        </section>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,300px)_1fr]">
        <StatCard
          label="Total Bandwidth Consumed Today"
          value={formatBandwidth(totalBandwidthTodayGb)}
          icon={Activity}
          tone="blue"
          helperText="Automatically updates from live collector data"
        />

        <section className="card-surface p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-3">
            {intervalOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setInterval(option.value)}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                  interval === option.value
                    ? "border-sky-300 bg-sky-50 text-sky-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {interval === "custom" ? (
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
                Start date
                <input
                  type="date"
                  value={customStart}
                  max={customEnd}
                  onChange={(event) => setCustomStart(event.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-300"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
                End date
                <input
                  type="date"
                  value={customEnd}
                  min={customStart}
                  onChange={(event) => setCustomEnd(event.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-300"
                />
              </label>
            </div>
          ) : null}

          {historyError ? (
            <p className="mt-4 text-sm font-medium text-amber-700">{historyError}</p>
          ) : null}
          {networkData.perDeviceMode ? (
            <p className="mt-4 text-xs text-slate-500">
              Per-device accounting mode:{" "}
              <span className="font-semibold text-slate-700">{networkData.perDeviceMode}</span>
            </p>
          ) : null}
        </section>
      </div>

      <NetworkUsageChart
        data={networkData}
        usagePoints={usagePoints}
        usageTitle={usageTitle}
        usageRangeLabel={usageRangeLabel}
        loading={historyLoading}
      />
      <DeviceTable devices={networkData.devices} />
    </section>
  );
};

export default Network;
