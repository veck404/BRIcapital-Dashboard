import { Activity, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useReducer } from "react";
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

type NetworkInterval = "today" | "daily" | "custom";

const intervalOptions: { value: NetworkInterval; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "daily", label: "Daily" },
  { value: "custom", label: "Custom" },
];

const toInputDate = (value: Date) => {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const filterBusinessHours = (
  points: Array<{ time: string; bandwidthGb: number }>,
) => {
  return points.filter((point) => {
    const timeStr = point.time.toString().trim();
    const timeParts = timeStr.split(":");
    if (timeParts.length >= 2) {
      const hour = parseInt(timeParts[0], 10);
      const minute = parseInt(timeParts[1], 10);
      if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
        return true;
      }

      const totalMinutes = hour * 60 + minute;
      return totalMinutes >= 8 * 60 && totalMinutes <= 17 * 60;
    }
    return true;
  });
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

interface NetworkState {
  networkData: NetworkAnalytics | null;
  usageHistory: NetworkUsageHistoryResponse | null;
  networkLoading: boolean;
  historyLoading: boolean;
  error: string | null;
  historyError: string | null;
  interval: NetworkInterval;
  customStart: string;
  customEnd: string;
  streamStatus: "disabled" | "connecting" | "live" | "offline";
  retryCount: number;
}

type NetworkAction =
  | { type: "SET_NETWORK_DATA"; payload: NetworkAnalytics }
  | { type: "SET_USAGE_HISTORY"; payload: NetworkUsageHistoryResponse }
  | { type: "SET_NETWORK_LOADING"; payload: boolean }
  | { type: "SET_HISTORY_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SET_HISTORY_ERROR"; payload: string | null }
  | { type: "SET_INTERVAL"; payload: NetworkInterval }
  | { type: "SET_CUSTOM_START"; payload: string }
  | { type: "SET_CUSTOM_END"; payload: string }
  | { type: "SET_STREAM_STATUS"; payload: NetworkState["streamStatus"] }
  | { type: "INCREMENT_RETRY_COUNT" }
  | { type: "RESET_RETRY_COUNT" };

const initialState = (collectorEnabled: boolean): NetworkState => ({
  networkData: null,
  usageHistory: null,
  networkLoading: true,
  historyLoading: true,
  error: null,
  historyError: null,
  interval: "today",
  customStart: (() => {
    const base = new Date();
    base.setDate(base.getDate() - 13);
    return toInputDate(base);
  })(),
  customEnd: toInputDate(new Date()),
  streamStatus: collectorEnabled ? "connecting" : "disabled",
  retryCount: 0,
});

const networkReducer = (
  state: NetworkState,
  action: NetworkAction,
): NetworkState => {
  switch (action.type) {
    case "SET_NETWORK_DATA":
      return { ...state, networkData: action.payload };
    case "SET_USAGE_HISTORY":
      return { ...state, usageHistory: action.payload };
    case "SET_NETWORK_LOADING":
      return { ...state, networkLoading: action.payload };
    case "SET_HISTORY_LOADING":
      return { ...state, historyLoading: action.payload };
    case "SET_ERROR":
      return { ...state, error: action.payload };
    case "SET_HISTORY_ERROR":
      return { ...state, historyError: action.payload };
    case "SET_INTERVAL":
      return { ...state, interval: action.payload, historyError: null };
    case "SET_CUSTOM_START":
      return { ...state, customStart: action.payload };
    case "SET_CUSTOM_END":
      return { ...state, customEnd: action.payload };
    case "SET_STREAM_STATUS":
      return { ...state, streamStatus: action.payload };
    case "INCREMENT_RETRY_COUNT":
      return { ...state, retryCount: state.retryCount + 1 };
    case "RESET_RETRY_COUNT":
      return { ...state, retryCount: 0 };
    default:
      return state;
  }
};

const Network = () => {
  const collectorEnabled = isCollectorEnabled();
  const [state, dispatch] = useReducer(
    networkReducer,
    collectorEnabled,
    initialState,
  );

  // Validate custom date range
  const isDateRangeValid = state.customStart < state.customEnd;
  const today = toInputDate(new Date());
  const isCustomDateFuture =
    state.interval === "custom" && state.customEnd > today;

  const loadData = useCallback(
    async (retrying = false) => {
      try {
        if (!retrying) {
          dispatch({ type: "SET_NETWORK_LOADING", payload: true });
        }
        dispatch({ type: "SET_ERROR", payload: null });
        const response = await fetchNetworkAnalytics();
        dispatch({ type: "SET_NETWORK_DATA", payload: response });
        dispatch({ type: "RESET_RETRY_COUNT" });
      } catch (err) {
        dispatch({
          type: "SET_ERROR",
          payload:
            "Failed to load network analytics. " +
            (state.retryCount < 3
              ? "Retrying automatically..."
              : "Please try again."),
        });
        if (state.retryCount < 3) {
          dispatch({ type: "INCREMENT_RETRY_COUNT" });
          setTimeout(() => loadData(true), 2000 * (state.retryCount + 1));
        }
      } finally {
        dispatch({ type: "SET_NETWORK_LOADING", payload: false });
      }
    },
    [state.retryCount],
  );

  const loadHistory = useCallback(
    async (showLoading: boolean) => {
      if (showLoading) {
        dispatch({ type: "SET_HISTORY_LOADING", payload: true });
      }
      dispatch({ type: "SET_HISTORY_ERROR", payload: null });

      try {
        if (state.interval === "today") {
          dispatch({ type: "SET_HISTORY_LOADING", payload: false });
          return;
        }

        if (isCustomDateFuture && state.interval === "custom") {
          dispatch({
            type: "SET_HISTORY_ERROR",
            payload: "End date cannot be in the future.",
          });
          dispatch({ type: "SET_HISTORY_LOADING", payload: false });
          return;
        }

        if (!isDateRangeValid && state.interval === "custom") {
          dispatch({
            type: "SET_HISTORY_ERROR",
            payload: "Start date must be before end date.",
          });
          dispatch({ type: "SET_HISTORY_LOADING", payload: false });
          return;
        }

        const interval: BandwidthHistoryInterval =
          state.interval === "daily" ? "daily" : "custom";
        const payload = await fetchNetworkUsageHistory({
          interval,
          ...(state.interval === "custom"
            ? { start: state.customStart, end: state.customEnd }
            : {}),
        });
        dispatch({ type: "SET_USAGE_HISTORY", payload });
      } catch (err) {
        dispatch({
          type: "SET_HISTORY_ERROR",
          payload: "Unable to load usage history for the selected interval.",
        });
      } finally {
        dispatch({ type: "SET_HISTORY_LOADING", payload: false });
      }
    },
    [
      state.customEnd,
      state.customStart,
      state.interval,
      isDateRangeValid,
      isCustomDateFuture,
    ],
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    void loadHistory(true);
  }, [loadHistory]);

  useEffect(() => {
    const timer = window.setInterval(
      () => {
        void loadHistory(false);
      },
      collectorEnabled ? 30000 : 60000,
    );

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
        dispatch({
          type: "SET_STREAM_STATUS",
          payload: snapshot.connected ? "live" : "offline",
        });
        if (snapshot.network) {
          dispatch({ type: "SET_NETWORK_DATA", payload: snapshot.network });
        }
      },
      () => {
        dispatch({ type: "SET_STREAM_STATUS", payload: "offline" });
      },
    );

    return unsubscribe;
  }, [collectorEnabled]);

  if (
    (state.networkLoading && !state.networkData) ||
    (state.historyLoading && !state.usageHistory)
  ) {
    return (
      <section className="space-y-6" aria-label="Network analytics loading">
        <div className="card-surface h-32 animate-pulse bg-slate-100/80" />
        <div className="space-y-4">
          <div className="card-surface h-16 animate-pulse bg-slate-100/80" />
          <div className="card-surface h-96 animate-pulse bg-slate-100/80" />
          <div className="card-surface h-96 animate-pulse bg-slate-100/80" />
        </div>
      </section>
    );
  }

  if (state.error || !state.networkData) {
    return (
      <section className="card-surface p-6" role="alert">
        <div className="flex flex-col gap-4">
          <p className="text-sm font-medium text-rose-600">
            {state.error ?? "Unable to render network analytics."}
          </p>
          <button
            type="button"
            onClick={() => loadData()}
            className="inline-flex items-center gap-2 rounded-lg bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
            aria-label="Retry loading network analytics"
          >
            <RotateCcw size={16} />
            Retry
          </button>
        </div>
      </section>
    );
  }

  const usagePoints =
    state.interval === "today"
      ? filterBusinessHours(state.networkData.usageOverTime)
      : (state.usageHistory?.points ?? []);
  const usageTitle =
    state.interval === "custom"
      ? "Bandwidth Usage (Custom Interval)"
      : state.interval === "daily"
        ? "Daily Bandwidth Usage (Last 30 Days)"
        : "Bandwidth Usage Today (8:00 AM - 5:00 PM)";

  const usageRangeLabel =
    state.interval !== "today" && state.usageHistory
      ? `${prettyDate(state.usageHistory.rangeStart)} to ${prettyDate(state.usageHistory.rangeEnd)}`
      : undefined;

  const totalBandwidthTodayGb =
    state.networkData.totalBandwidthTodayGb ??
    Number(
      state.networkData.usageOverTime
        .reduce((sum, point) => sum + point.bandwidthGb, 0)
        .toFixed(3),
    );

  return (
    <section className="space-y-6" aria-label="Network analytics dashboard">
      {collectorEnabled ? (
        <section
          className="card-surface flex flex-col items-start justify-between gap-3 px-4 py-3 text-sm sm:flex-row sm:items-center"
          aria-live="polite"
          aria-label="Router collector status"
        >
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full transition-all ${
                state.streamStatus === "live"
                  ? "bg-emerald-500"
                  : state.streamStatus === "connecting"
                    ? "animate-pulse bg-amber-500"
                    : "bg-rose-500"
              }`}
              role="status"
              aria-label={
                state.streamStatus === "live"
                  ? "Live feed connected"
                  : state.streamStatus === "connecting"
                    ? "Connecting to router"
                    : "Offline"
              }
            />
            <p className="font-medium text-slate-700">
              Router Collector:{" "}
              <span className="font-semibold">
                {state.streamStatus === "live"
                  ? "Live feed connected"
                  : state.streamStatus === "connecting"
                    ? "Connecting..."
                    : "Unavailable (fallback data active)"}
              </span>
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
          <fieldset>
            <legend className="mb-3 text-sm font-semibold text-slate-700">
              Time Interval
            </legend>
            <div className="flex flex-wrap items-center gap-3">
              {intervalOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    dispatch({ type: "SET_INTERVAL", payload: option.value });
                  }}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                    state.interval === option.value
                      ? "border-sky-300 bg-sky-50 text-sky-700"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                  aria-pressed={state.interval === option.value}
                  aria-label={`Select ${option.label.toLowerCase()} interval`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          {state.interval === "custom" ? (
            <fieldset className="mt-4 border-t border-slate-200 pt-4">
              <legend className="mb-3 text-sm font-semibold text-slate-700">
                Custom Date Range
              </legend>
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
                  Start date
                  <input
                    type="date"
                    value={state.customStart}
                    max={state.customEnd}
                    onChange={(event) =>
                      dispatch({
                        type: "SET_CUSTOM_START",
                        payload: event.target.value,
                      })
                    }
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                    aria-label="Start date for custom range"
                    aria-describedby="date-range-hint"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
                  End date
                  <input
                    type="date"
                    value={state.customEnd}
                    min={state.customStart}
                    onChange={(event) =>
                      dispatch({
                        type: "SET_CUSTOM_END",
                        payload: event.target.value,
                      })
                    }
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                    aria-label="End date for custom range"
                    aria-describedby="date-range-hint"
                  />
                </label>
              </div>
              <p id="date-range-hint" className="mt-2 text-xs text-slate-500">
                Select a date range up to today to view historical data.
              </p>
            </fieldset>
          ) : null}

          {state.historyError ? (
            <div
              className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3"
              role="alert"
              aria-live="assertive"
            >
              <p className="text-sm font-medium text-amber-700">
                {state.historyError}
              </p>
              {!isDateRangeValid || isCustomDateFuture ? (
                <button
                  type="button"
                  onClick={() => {
                    const base = new Date();
                    base.setDate(base.getDate() - 13);
                    dispatch({
                      type: "SET_CUSTOM_START",
                      payload: toInputDate(base),
                    });
                    dispatch({
                      type: "SET_CUSTOM_END",
                      payload: toInputDate(new Date()),
                    });
                  }}
                  className="ml-auto whitespace-nowrap rounded bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-200"
                  aria-label="Reset date range to default"
                >
                  Reset
                </button>
              ) : null}
            </div>
          ) : null}
          {state.networkData.perDeviceMode ? (
            <p className="mt-4 text-xs text-slate-500">
              Per-device accounting mode:{" "}
              <span className="font-semibold text-slate-700">
                {state.networkData.perDeviceMode}
              </span>
            </p>
          ) : null}
        </section>
      </div>

      <NetworkUsageChart
        data={state.networkData}
        usagePoints={usagePoints}
        usageTitle={usageTitle}
        usageRangeLabel={usageRangeLabel}
        loading={state.historyLoading}
      />
      <DeviceTable devices={state.networkData.devices} />
    </section>
  );
};

export default Network;
