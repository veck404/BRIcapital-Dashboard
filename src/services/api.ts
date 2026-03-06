import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from "axios";

export interface OverviewStats {
  presentToday: number;
  absentToday: number;
  lateArrivals: number;
  totalBandwidthGb: number;
  activeDevices: number;
}

export interface DailyAttendancePoint {
  day: string;
  present: number;
  absent: number;
}

export interface AttendanceTrendPoint {
  date: string;
  presentRate: number;
}

export interface PunctualityPoint {
  name: "On Time" | "Late";
  value: number;
}

export interface AttendanceRecord {
  employeeName: string;
  checkIn: string;
  checkOut: string;
  status: "On Time" | "Late";
}

export interface AttendanceAnalytics {
  dailyComparison: DailyAttendancePoint[];
  trend: AttendanceTrendPoint[];
  punctuality: PunctualityPoint[];
  records: AttendanceRecord[];
}

export interface TopDeviceUsage {
  device: string;
  bandwidthGb: number;
}

export interface UsageOverTimePoint {
  time: string;
  bandwidthGb: number;
}

export interface TrafficDistributionPoint {
  name: string;
  value: number;
}

export interface DeviceRecord {
  deviceName: string;
  ipAddress: string;
  bandwidthGb: number;
  status: "Online" | "Offline";
}

export interface NetworkAnalytics {
  topDevices: TopDeviceUsage[];
  usageOverTime: UsageOverTimePoint[];
  trafficDistribution: TrafficDistributionPoint[];
  devices: DeviceRecord[];
}

export interface RouterSnapshot {
  timestamp: string;
  source: "router" | "mock";
  connected: boolean;
  overview?: Partial<OverviewStats>;
  network?: NetworkAnalytics;
  router?: {
    hostname?: string | null;
    model?: string | null;
    firmware?: string | null;
  };
  error?: string | null;
}

const employeeRecords: AttendanceRecord[] = [
  { employeeName: "Emma Johnson", checkIn: "08:41", checkOut: "17:39", status: "On Time" },
  { employeeName: "Liam Smith", checkIn: "09:08", checkOut: "18:05", status: "Late" },
  { employeeName: "Olivia Brown", checkIn: "08:49", checkOut: "17:47", status: "On Time" },
  { employeeName: "Noah Davis", checkIn: "09:11", checkOut: "18:22", status: "Late" },
  { employeeName: "Sophia Wilson", checkIn: "08:55", checkOut: "17:51", status: "On Time" },
  { employeeName: "Mason Taylor", checkIn: "08:58", checkOut: "17:56", status: "On Time" },
  { employeeName: "Isabella Moore", checkIn: "09:13", checkOut: "18:09", status: "Late" },
  { employeeName: "Ethan Anderson", checkIn: "08:47", checkOut: "17:38", status: "On Time" },
  { employeeName: "Mia Thomas", checkIn: "08:53", checkOut: "17:49", status: "On Time" },
  { employeeName: "James Martinez", checkIn: "09:05", checkOut: "18:02", status: "Late" },
  { employeeName: "Amelia Jackson", checkIn: "08:46", checkOut: "17:42", status: "On Time" },
  { employeeName: "Benjamin White", checkIn: "08:59", checkOut: "17:55", status: "On Time" },
  { employeeName: "Harper Harris", checkIn: "09:10", checkOut: "18:18", status: "Late" },
  { employeeName: "Lucas Thompson", checkIn: "08:44", checkOut: "17:35", status: "On Time" },
  { employeeName: "Evelyn Garcia", checkIn: "09:06", checkOut: "18:01", status: "Late" },
];

const devices: DeviceRecord[] = [
  { deviceName: "Core-Switch-01", ipAddress: "10.1.0.10", bandwidthGb: 124.3, status: "Online" },
  { deviceName: "Finance-Laptop-12", ipAddress: "10.1.1.44", bandwidthGb: 87.5, status: "Online" },
  { deviceName: "Engineering-PC-08", ipAddress: "10.1.2.88", bandwidthGb: 93.2, status: "Online" },
  { deviceName: "HR-Desktop-03", ipAddress: "10.1.3.19", bandwidthGb: 38.6, status: "Offline" },
  { deviceName: "DB-Server-02", ipAddress: "10.1.4.7", bandwidthGb: 141.8, status: "Online" },
  { deviceName: "Security-Cam-14", ipAddress: "10.1.5.23", bandwidthGb: 28.1, status: "Online" },
  { deviceName: "Executive-Tablet-05", ipAddress: "10.1.6.57", bandwidthGb: 45.4, status: "Online" },
  { deviceName: "Dev-Laptop-27", ipAddress: "10.1.2.133", bandwidthGb: 81.6, status: "Online" },
  { deviceName: "Support-PC-11", ipAddress: "10.1.7.76", bandwidthGb: 52.8, status: "Offline" },
  { deviceName: "Backup-Server-01", ipAddress: "10.1.4.21", bandwidthGb: 112.7, status: "Online" },
  { deviceName: "QA-Laptop-09", ipAddress: "10.1.2.101", bandwidthGb: 64.9, status: "Online" },
  { deviceName: "Warehouse-Scanner-03", ipAddress: "10.1.8.31", bandwidthGb: 22.6, status: "Online" },
];

const attendanceTrend: AttendanceTrendPoint[] = Array.from(
  { length: 30 },
  (_, index) => {
    const current = new Date();
    current.setDate(current.getDate() - (29 - index));
    const formatted = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    }).format(current);
    const presentRate = Number(
      (83 + ((index * 11) % 13) + Math.sin(index / 4) * 2.8).toFixed(1),
    );

    return {
      date: formatted,
      presentRate: Math.min(98.8, Math.max(79.2, presentRate)),
    };
  },
);

const dailyComparison: DailyAttendancePoint[] = attendanceTrend
  .slice(-7)
  .map((entry) => {
    const totalEmployees = 120;
    const present = Math.round((entry.presentRate / 100) * totalEmployees);
    return {
      day: entry.date.split(" ")[0],
      present,
      absent: totalEmployees - present,
    };
  });

const onTimeCount = employeeRecords.filter(
  (record) => record.status === "On Time",
).length;
const lateCount = employeeRecords.length - onTimeCount;

const attendancePayload: AttendanceAnalytics = {
  dailyComparison,
  trend: attendanceTrend,
  punctuality: [
    { name: "On Time", value: onTimeCount },
    { name: "Late", value: lateCount },
  ],
  records: employeeRecords,
};

const usageOverTime: UsageOverTimePoint[] = [
  { time: "00:00", bandwidthGb: 12.4 },
  { time: "02:00", bandwidthGb: 9.1 },
  { time: "04:00", bandwidthGb: 7.6 },
  { time: "06:00", bandwidthGb: 14.3 },
  { time: "08:00", bandwidthGb: 28.9 },
  { time: "10:00", bandwidthGb: 42.5 },
  { time: "12:00", bandwidthGb: 47.8 },
  { time: "14:00", bandwidthGb: 44.6 },
  { time: "16:00", bandwidthGb: 39.1 },
  { time: "18:00", bandwidthGb: 35.4 },
  { time: "20:00", bandwidthGb: 27.7 },
  { time: "22:00", bandwidthGb: 19.2 },
];

const networkPayload: NetworkAnalytics = {
  topDevices: [...devices]
    .sort((first, second) => second.bandwidthGb - first.bandwidthGb)
    .slice(0, 10)
    .map((device) => ({
      device: device.deviceName,
      bandwidthGb: device.bandwidthGb,
    })),
  usageOverTime,
  trafficDistribution: [
    { name: "Workstations", value: 38 },
    { name: "Servers", value: 31 },
    { name: "Mobile", value: 15 },
    { name: "IoT", value: 9 },
    { name: "Other", value: 7 },
  ],
  devices,
};

const overviewPayload: OverviewStats = {
  presentToday: dailyComparison[dailyComparison.length - 1].present,
  absentToday: dailyComparison[dailyComparison.length - 1].absent,
  lateArrivals: lateCount,
  totalBandwidthGb: Number(
    usageOverTime.reduce((sum, point) => sum + point.bandwidthGb, 0).toFixed(1),
  ),
  activeDevices: devices.filter((device) => device.status === "Online").length,
};

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

type MockEndpoints = "/overview" | "/attendance" | "/network";

const responses: Record<MockEndpoints, unknown> = {
  "/overview": overviewPayload,
  "/attendance": attendancePayload,
  "/network": networkPayload,
};

const mockApiClient = axios.create({
  baseURL: "/api",
  adapter: async (config): Promise<AxiosResponse> => {
    await wait(450 + Math.floor(Math.random() * 450));
    const endpoint = config.url?.startsWith("/") ? config.url : `/${config.url}`;
    const data = endpoint ? responses[endpoint as MockEndpoints] : undefined;
    const status = data ? 200 : 404;

    return {
      data: data ?? { message: `Mock endpoint ${endpoint} does not exist.` },
      status,
      statusText: status === 200 ? "OK" : "Not Found",
      headers: {},
      config: config as InternalAxiosRequestConfig,
    };
  },
});

const collectorBaseUrl = (
  import.meta.env.VITE_COLLECTOR_BASE_URL as string | undefined
)?.replace(/\/$/, "") ?? "http://localhost:8000";

const collectorEnabled = import.meta.env.VITE_USE_ROUTER_COLLECTOR === "true";

const collectorApiClient = axios.create({
  baseURL: `${collectorBaseUrl}/api`,
  timeout: 4000,
});

const getMockData = async <T>(endpoint: MockEndpoints) => {
  const response = await mockApiClient.get<T>(endpoint);
  return response.data;
};

export const isCollectorEnabled = () => collectorEnabled;

export const formatBandwidth = (value: number) =>
  `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} GB`;

export const fetchOverviewStats = async () => {
  if (collectorEnabled) {
    try {
      const response = await collectorApiClient.get<Partial<OverviewStats>>("/overview");
      return {
        ...overviewPayload,
        ...response.data,
      };
    } catch {
      // fall back to local mock data
    }
  }

  return getMockData<OverviewStats>("/overview");
};

export const fetchAttendanceAnalytics = async () => {
  return getMockData<AttendanceAnalytics>("/attendance");
};

export const fetchNetworkAnalytics = async () => {
  if (collectorEnabled) {
    try {
      const response = await collectorApiClient.get<NetworkAnalytics>("/network");
      return response.data;
    } catch {
      // fall back to local mock data
    }
  }

  return getMockData<NetworkAnalytics>("/network");
};

export const fetchRouterSnapshot = async () => {
  if (!collectorEnabled) {
    return null;
  }

  try {
    const response = await collectorApiClient.get<RouterSnapshot>("/router/snapshot");
    return response.data;
  } catch {
    return null;
  }
};

export const subscribeToRouterStream = (
  onSnapshot: (snapshot: RouterSnapshot) => void,
  onError?: (message: string) => void,
) => {
  if (!collectorEnabled) {
    return () => undefined;
  }

  const wsUrl = `${collectorBaseUrl.replace(/^http/, "ws")}/ws/router`;
  let socket: WebSocket | null = null;
  let isDisposed = false;
  let reconnectTimer: number | null = null;

  const connect = () => {
    if (isDisposed) {
      return;
    }

    socket = new WebSocket(wsUrl);

    socket.onmessage = (event) => {
      try {
        onSnapshot(JSON.parse(event.data) as RouterSnapshot);
      } catch {
        onError?.("Received invalid payload from router stream.");
      }
    };

    socket.onerror = () => {
      onError?.("Router stream connection failed.");
    };

    socket.onclose = () => {
      if (!isDisposed) {
        reconnectTimer = window.setTimeout(connect, 1500);
      }
    };
  };

  connect();

  return () => {
    isDisposed = true;
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer);
    }
    socket?.close();
  };
};
