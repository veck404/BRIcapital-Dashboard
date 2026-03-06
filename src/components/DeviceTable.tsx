import type { DeviceRecord } from "../services/api";

interface DeviceTableProps {
  devices: DeviceRecord[];
}

const CCTV_DEVICE_KEYWORDS = [
  "hikvision",
  "cctv",
  "camera",
  "nvr",
  "dvr",
];

const isCctvDevice = (deviceName: string) => {
  const normalized = deviceName.toLowerCase();
  return CCTV_DEVICE_KEYWORDS.some((keyword) => normalized.includes(keyword));
};

const DeviceTable = ({ devices }: DeviceTableProps) => {
  const visibleDevices = devices.filter(
    (device) => !isCctvDevice(device.deviceName),
  );

  return (
    <div className="card-surface overflow-hidden">
      <div className="border-b border-slate-200/80 px-5 py-4">
        <h3 className="section-title">Device Status and Usage</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200/80 text-sm">
          <thead className="bg-slate-50/80">
            <tr>
              <th className="px-5 py-3 text-left font-semibold text-slate-600">
                Device Name
              </th>
              <th className="px-5 py-3 text-left font-semibold text-slate-600">
                IP Address
              </th>
              <th className="px-5 py-3 text-left font-semibold text-slate-600">
                Bandwidth Consumed
              </th>
              <th className="px-5 py-3 text-left font-semibold text-slate-600">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/70">
            {visibleDevices.map((device) => (
              <tr key={`${device.ipAddress}-${device.deviceName}`}>
                <td className="px-5 py-3 text-slate-700">{device.deviceName}</td>
                <td className="px-5 py-3 text-slate-600">{device.ipAddress}</td>
                <td className="px-5 py-3 font-medium text-slate-800">
                  {device.bandwidthGb} GB
                </td>
                <td className="px-5 py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                      device.status === "Online"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {device.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DeviceTable;
