import { useEffect, useState } from "react";
import DeviceTable from "../components/DeviceTable";
import NetworkUsageChart from "../components/NetworkUsageChart";
import {
  fetchNetworkAnalytics,
  isCollectorEnabled,
  subscribeToRouterStream,
  type NetworkAnalytics,
} from "../services/api";

const Network = () => {
  const collectorEnabled = isCollectorEnabled();
  const [networkData, setNetworkData] = useState<NetworkAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState<
    "disabled" | "connecting" | "live" | "offline"
  >(collectorEnabled ? "connecting" : "disabled");

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetchNetworkAnalytics();
        setNetworkData(response);
      } catch (requestError) {
        setError("Failed to load network analytics.");
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

  if (loading) {
    return (
      <section className="space-y-6">
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

      <NetworkUsageChart data={networkData} />
      <DeviceTable devices={networkData.devices} />
    </section>
  );
};

export default Network;
