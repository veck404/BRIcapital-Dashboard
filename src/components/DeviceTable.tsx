import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { DeviceRecord } from "../services/api";

interface DeviceTableProps {
  devices: DeviceRecord[];
}

const CCTV_DEVICE_KEYWORDS = ["hikvision", "cctv", "camera", "nvr", "dvr"];

const isCctvDevice = (deviceName: string) => {
  const normalized = deviceName.toLowerCase();
  return CCTV_DEVICE_KEYWORDS.some((keyword) => normalized.includes(keyword));
};

const DeviceTable = ({ devices }: DeviceTableProps) => {
  const [showCctvDevices, setShowCctvDevices] = useState(false);

  const visibleDevices = showCctvDevices
    ? devices
    : devices.filter((device) => !isCctvDevice(device.deviceName));

  const cctvDeviceCount = devices.filter((device) =>
    isCctvDevice(device.deviceName),
  ).length;

  const totalBandwidth = visibleDevices.reduce(
    (sum, device) => sum + parseFloat(device.bandwidthGb.toString()),
    0,
  );

  const sortedDevices = [...visibleDevices].sort((a, b) => {
    const aBandwidth = parseFloat(a.bandwidthGb.toString());
    const bBandwidth = parseFloat(b.bandwidthGb.toString());
    return bBandwidth - aBandwidth;
  });

  return (
    <div className="card-surface overflow-hidden">
      <div className="border-b border-slate-200/80 px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="section-title">Device Status and Usage</h3>
            <p className="mt-1 text-xs text-slate-500">
              {visibleDevices.length} device
              {visibleDevices.length !== 1 ? "s" : ""} •{" "}
              {totalBandwidth.toFixed(2)} GB total
            </p>
          </div>
          {cctvDeviceCount > 0 ? (
            <button
              type="button"
              onClick={() => setShowCctvDevices(!showCctvDevices)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              aria-pressed={showCctvDevices}
              aria-label={
                showCctvDevices
                  ? "Hide CCTV and surveillance devices"
                  : "Show CCTV and surveillance devices"
              }
            >
              {showCctvDevices ? (
                <>
                  <EyeOff size={16} />
                  Hide CCTV ({cctvDeviceCount})
                </>
              ) : (
                <>
                  <Eye size={16} />
                  Show CCTV ({cctvDeviceCount})
                </>
              )}
            </button>
          ) : null}
        </div>
      </div>

      {sortedDevices.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <p className="text-sm text-slate-500">No devices to display</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table
            className="min-w-full divide-y divide-slate-200/80 text-sm"
            role="grid"
            aria-label="Network devices"
          >
            <thead className="bg-slate-50/80">
              <tr role="row">
                <th
                  className="px-4 py-3 text-left font-semibold text-slate-600 sm:px-5"
                  role="columnheader"
                  scope="col"
                >
                  Device Name
                </th>
                <th
                  className="px-4 py-3 text-left font-semibold text-slate-600 sm:px-5"
                  role="columnheader"
                  scope="col"
                >
                  IP Address
                </th>
                <th
                  className="px-4 py-3 text-right font-semibold text-slate-600 sm:px-5"
                  role="columnheader"
                  scope="col"
                  aria-sort="descending"
                >
                  Bandwidth
                </th>
                <th
                  className="px-4 py-3 text-left font-semibold text-slate-600 sm:px-5"
                  role="columnheader"
                  scope="col"
                >
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70" role="rowgroup">
              {sortedDevices.map((device) => {
                const bandwidth = parseFloat(device.bandwidthGb.toString());
                const percentageOfTotal =
                  totalBandwidth > 0
                    ? ((bandwidth / totalBandwidth) * 100).toFixed(1)
                    : "0";
                const truncatedName =
                  device.deviceName.length > 25
                    ? `${device.deviceName.substring(0, 22)}...`
                    : device.deviceName;

                return (
                  <tr
                    key={`${device.ipAddress}-${device.deviceName}`}
                    role="row"
                    className="hover:bg-slate-50/50 transition"
                  >
                    <td
                      className="px-4 py-3 text-slate-700 sm:px-5"
                      role="gridcell"
                      title={device.deviceName}
                    >
                      <div>
                        <div className="font-medium">{truncatedName}</div>
                        {device.deviceName.length > 25 ? (
                          <div className="text-xs text-slate-500">
                            {device.deviceName}
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td
                      className="px-4 py-3 font-mono text-slate-600 sm:px-5"
                      role="gridcell"
                      title={`IP Address: ${device.ipAddress}`}
                    >
                      {device.ipAddress}
                    </td>
                    <td className="px-4 py-3 sm:px-5" role="gridcell">
                      <div className="flex flex-col items-end gap-1">
                        <span className="font-semibold text-slate-800">
                          {bandwidth.toFixed(2)} GB
                        </span>
                        <div className="flex items-center gap-1.5">
                          <div className="h-1.5 w-24 rounded-full bg-slate-200">
                            <div
                              className="h-full rounded-full bg-sky-500 transition-all"
                              style={{
                                width: `${Math.min(parseFloat(percentageOfTotal), 100)}%`,
                              }}
                              role="progressbar"
                              aria-valuenow={parseFloat(percentageOfTotal)}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-label={`${percentageOfTotal}% of total bandwidth`}
                            />
                          </div>
                          <span className="text-xs font-medium text-slate-500">
                            {percentageOfTotal}%
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 sm:px-5" role="gridcell">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                          device.status === "Online"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-200 text-slate-600"
                        }`}
                        aria-label={`Device status: ${device.status}`}
                      >
                        <span className="mr-1.5 inline-block">
                          <span
                            className={`inline-block h-1.5 w-1.5 rounded-full ${
                              device.status === "Online"
                                ? "bg-emerald-500"
                                : "bg-slate-400"
                            }`}
                          />
                        </span>
                        {device.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {cctvDeviceCount > 0 && !showCctvDevices ? (
        <div className="border-t border-slate-200/80 bg-slate-50/50 px-5 py-3 text-xs text-slate-600">
          {cctvDeviceCount} CCTV/surveillance device
          {cctvDeviceCount !== 1 ? "s" : ""} hidden. Click &quot;Show CCTV&quot;
          to include them in the view.
        </div>
      ) : null}
    </div>
  );
};

export default DeviceTable;
