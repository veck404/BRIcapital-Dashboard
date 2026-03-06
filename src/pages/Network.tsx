import { useEffect, useState } from "react";
import DeviceTable from "../components/DeviceTable";
import NetworkUsageChart from "../components/NetworkUsageChart";
import { fetchNetworkAnalytics, type NetworkAnalytics } from "../services/api";

const Network = () => {
  const [networkData, setNetworkData] = useState<NetworkAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      <NetworkUsageChart data={networkData} />
      <DeviceTable devices={networkData.devices} />
    </section>
  );
};

export default Network;
