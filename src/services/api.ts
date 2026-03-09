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
  date: string;
  employeeId?: string;
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

export type BandwidthHistoryInterval = "daily" | "weekly" | "monthly" | "custom";

export interface NetworkUsageHistoryResponse {
  interval: BandwidthHistoryInterval;
  rangeStart: string;
  rangeEnd: string;
  points: UsageOverTimePoint[];
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
  totalBandwidthTodayGb?: number;
  perDeviceMode?: string;
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

const sampleAttendanceDate = new Date().toISOString().slice(0, 10);

const employeeRecords: AttendanceRecord[] = [
  { date: sampleAttendanceDate, employeeName: "Emma Johnson", checkIn: "08:41", checkOut: "17:39", status: "On Time" },
  { date: sampleAttendanceDate, employeeName: "Liam Smith", checkIn: "09:08", checkOut: "18:05", status: "Late" },
  { date: sampleAttendanceDate, employeeName: "Olivia Brown", checkIn: "08:49", checkOut: "17:47", status: "On Time" },
  { date: sampleAttendanceDate, employeeName: "Noah Davis", checkIn: "09:11", checkOut: "18:22", status: "Late" },
  { date: sampleAttendanceDate, employeeName: "Sophia Wilson", checkIn: "08:55", checkOut: "17:51", status: "On Time" },
  { date: sampleAttendanceDate, employeeName: "Mason Taylor", checkIn: "08:58", checkOut: "17:56", status: "On Time" },
  { date: sampleAttendanceDate, employeeName: "Isabella Moore", checkIn: "09:13", checkOut: "18:09", status: "Late" },
  { date: sampleAttendanceDate, employeeName: "Ethan Anderson", checkIn: "08:47", checkOut: "17:38", status: "On Time" },
  { date: sampleAttendanceDate, employeeName: "Mia Thomas", checkIn: "08:53", checkOut: "17:49", status: "On Time" },
  { date: sampleAttendanceDate, employeeName: "James Martinez", checkIn: "09:05", checkOut: "18:02", status: "Late" },
  { date: sampleAttendanceDate, employeeName: "Amelia Jackson", checkIn: "08:46", checkOut: "17:42", status: "On Time" },
  { date: sampleAttendanceDate, employeeName: "Benjamin White", checkIn: "08:59", checkOut: "17:55", status: "On Time" },
  { date: sampleAttendanceDate, employeeName: "Harper Harris", checkIn: "09:10", checkOut: "18:18", status: "Late" },
  { date: sampleAttendanceDate, employeeName: "Lucas Thompson", checkIn: "08:44", checkOut: "17:35", status: "On Time" },
  { date: sampleAttendanceDate, employeeName: "Evelyn Garcia", checkIn: "09:06", checkOut: "18:01", status: "Late" },
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

interface MockHourlyUsageRecord {
  timestamp: string;
  bandwidthGb: number;
}

interface UsageHistoryRange {
  start: Date;
  end: Date;
}

export interface NetworkUsageHistoryQuery {
  interval: BandwidthHistoryInterval;
  start?: string;
  end?: string;
}

const HISTORY_RETENTION_DAYS = 183;
const DAILY_WINDOW_DAYS = 30;
const WEEKLY_WINDOW_WEEKS = 26;
const MONTHLY_WINDOW_MONTHS = 6;

const dailyLabelFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
});

const monthlyLabelFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
});

const pad2 = (value: number) => value.toString().padStart(2, "0");

const toDateKey = (value: Date) =>
  `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;

const parseDateInput = (value?: string) => {
  if (!value) {
    return null;
  }

  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year
    || parsed.getMonth() !== month - 1
    || parsed.getDate() !== day
  ) {
    return null;
  }

  parsed.setHours(0, 0, 0, 0);
  return parsed;
};

const addDays = (value: Date, amount: number) => {
  const next = new Date(value);
  next.setDate(next.getDate() + amount);
  return next;
};

const startOfWeekMonday = (value: Date) => {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  const day = next.getDay();
  const shift = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + shift);
  return next;
};

const startOfMonth = (value: Date) => new Date(value.getFullYear(), value.getMonth(), 1);

const shiftMonthStart = (value: Date, offset: number) =>
  new Date(value.getFullYear(), value.getMonth() + offset, 1);

const normalizeRange = ({ interval, start, end }: NetworkUsageHistoryQuery): UsageHistoryRange => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const earliest = addDays(today, -(HISTORY_RETENTION_DAYS - 1));

  if (interval === "weekly") {
    const currentWeekStart = startOfWeekMonday(today);
    let rangeStart = addDays(currentWeekStart, -((WEEKLY_WINDOW_WEEKS - 1) * 7));
    while (rangeStart < earliest) {
      rangeStart = addDays(rangeStart, 7);
    }
    return { start: rangeStart, end: today };
  }

  if (interval === "monthly") {
    const currentMonthStart = startOfMonth(today);
    const rangeStart = shiftMonthStart(currentMonthStart, -(MONTHLY_WINDOW_MONTHS - 1));
    return { start: rangeStart, end: today };
  }

  if (interval === "custom") {
    const parsedStart = parseDateInput(start) ?? addDays(today, -(DAILY_WINDOW_DAYS - 1));
    const parsedEnd = parseDateInput(end) ?? today;
    const orderedStart = parsedStart <= parsedEnd ? parsedStart : parsedEnd;
    const orderedEnd = parsedStart <= parsedEnd ? parsedEnd : parsedStart;
    const clampedStart = orderedStart < earliest ? earliest : orderedStart;
    const clampedEnd = orderedEnd > today ? today : orderedEnd;
    return { start: clampedStart <= clampedEnd ? clampedStart : clampedEnd, end: clampedEnd };
  }

  const rangeStart = addDays(today, -(DAILY_WINDOW_DAYS - 1));
  return { start: rangeStart < earliest ? earliest : rangeStart, end: today };
};

const buildMockHourlyUsageHistory = () => {
  const now = new Date();
  now.setSeconds(0, 0);
  now.setMinutes(now.getMinutes() >= 30 ? 30 : 0);

  const totalSlots = HISTORY_RETENTION_DAYS * 48;
  const rows: MockHourlyUsageRecord[] = [];

  for (let offset = totalSlots - 1; offset >= 0; offset -= 1) {
    const pointTime = new Date(now);
    pointTime.setMinutes(pointTime.getMinutes() - (offset * 30));

    const hour = pointTime.getHours();
    const weekDay = pointTime.getDay();
    const isWeekend = weekDay === 0 || weekDay === 6;

    const officeLoad =
      hour >= 8 && hour <= 18 ? 1.45 : hour >= 6 && hour <= 22 ? 0.85 : 0.35;
    const weekendFactor = isWeekend ? 0.58 : 1;
    const seasonalPulse = 1 + Math.sin((offset / 48) / 9) * 0.12;
    const deterministicNoise = (((offset * 37) % 17) + 5) / 200;

    const bandwidthGb = Number(
      ((1.3 * officeLoad * weekendFactor * seasonalPulse + deterministicNoise) * 0.5).toFixed(3),
    );

    rows.push({
      timestamp: pointTime.toISOString(),
      bandwidthGb: Math.max(0.025, bandwidthGb),
    });
  }

  return rows;
};

const aggregateMockUsageHistory = (
  rows: MockHourlyUsageRecord[],
  query: NetworkUsageHistoryQuery,
): NetworkUsageHistoryResponse => {
  const normalizedRange = normalizeRange(query);
  const rangeStartKey = toDateKey(normalizedRange.start);
  const rangeEndKey = toDateKey(normalizedRange.end);

  const dailyTotals = new Map<string, number>();
  rows.forEach((row) => {
    const timestamp = new Date(row.timestamp);
    if (Number.isNaN(timestamp.getTime())) {
      return;
    }

    const day = new Date(timestamp.getFullYear(), timestamp.getMonth(), timestamp.getDate());
    if (day < normalizedRange.start || day > normalizedRange.end) {
      return;
    }

    const key = toDateKey(day);
    dailyTotals.set(key, (dailyTotals.get(key) ?? 0) + row.bandwidthGb);
  });

  if (query.interval === "weekly") {
    const points: UsageOverTimePoint[] = [];
    let cursor = startOfWeekMonday(normalizedRange.start);
    const endWeek = startOfWeekMonday(normalizedRange.end);
    while (cursor <= endWeek) {
      let total = 0;
      for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
        const day = addDays(cursor, dayOffset);
        const key = toDateKey(day);
        total += dailyTotals.get(key) ?? 0;
      }

      const isoWeek = getIsoWeek(cursor);
      points.push({
        time: `W${isoWeek.week} ${isoWeek.year}`,
        bandwidthGb: Number(total.toFixed(3)),
      });
      cursor = addDays(cursor, 7);
    }

    return {
      interval: "weekly",
      rangeStart: rangeStartKey,
      rangeEnd: rangeEndKey,
      points,
    };
  }

  if (query.interval === "monthly") {
    const points: UsageOverTimePoint[] = [];
    const monthStart = startOfMonth(normalizedRange.start);
    for (let index = 0; index < MONTHLY_WINDOW_MONTHS; index += 1) {
      const currentMonth = shiftMonthStart(monthStart, index);
      let total = 0;
      dailyTotals.forEach((value, key) => {
        const day = parseDateInput(key);
        if (!day) {
          return;
        }

        if (day.getFullYear() === currentMonth.getFullYear() && day.getMonth() === currentMonth.getMonth()) {
          total += value;
        }
      });

      points.push({
        time: monthlyLabelFormatter.format(currentMonth),
        bandwidthGb: Number(total.toFixed(3)),
      });
    }

    return {
      interval: "monthly",
      rangeStart: rangeStartKey,
      rangeEnd: rangeEndKey,
      points,
    };
  }

  const points: UsageOverTimePoint[] = [];
  let cursor = new Date(normalizedRange.start);
  while (cursor <= normalizedRange.end) {
    const key = toDateKey(cursor);
    points.push({
      time: dailyLabelFormatter.format(cursor),
      bandwidthGb: Number((dailyTotals.get(key) ?? 0).toFixed(3)),
    });
    cursor = addDays(cursor, 1);
  }

  return {
    interval: query.interval === "custom" ? "custom" : "daily",
    rangeStart: rangeStartKey,
    rangeEnd: rangeEndKey,
    points,
  };
};

const getIsoWeek = (value: Date) => {
  const utcDate = new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  const dayNum = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { year: utcDate.getUTCFullYear(), week };
};

const mockHourlyUsageHistory = buildMockHourlyUsageHistory();
const mockDailyHistory = aggregateMockUsageHistory(mockHourlyUsageHistory, { interval: "daily" });

const todayDateKey = toDateKey(new Date());
const mockIntradayUsageHistory: UsageOverTimePoint[] = [];
mockHourlyUsageHistory.forEach((row) => {
  const timestamp = new Date(row.timestamp);
  if (Number.isNaN(timestamp.getTime())) {
    return;
  }

  if (toDateKey(timestamp) !== todayDateKey) {
    return;
  }

  mockIntradayUsageHistory.push({
    time: `${pad2(timestamp.getHours())}:${pad2(timestamp.getMinutes())}`,
    bandwidthGb: Number(row.bandwidthGb.toFixed(3)),
  });
});

const mockTotalBandwidthTodayGb = Number(
  mockHourlyUsageHistory
    .reduce((sum, row) => {
      const timestamp = new Date(row.timestamp);
      return toDateKey(timestamp) === todayDateKey ? sum + row.bandwidthGb : sum;
    }, 0)
    .toFixed(3),
);

const usageOverTime: UsageOverTimePoint[] =
  mockIntradayUsageHistory.length > 0 ? mockIntradayUsageHistory : mockDailyHistory.points;

const mockTrafficDistributionRatios: Array<{ name: string; ratio: number }> = [
  { name: "Workstations", ratio: 0.38 },
  { name: "Servers", ratio: 0.31 },
  { name: "Mobile", ratio: 0.15 },
  { name: "IoT", ratio: 0.09 },
  { name: "Other", ratio: 0.07 },
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
  trafficDistribution: mockTrafficDistributionRatios.map(({ name, ratio }) => ({
    name,
    value: Number((mockTotalBandwidthTodayGb * ratio).toFixed(3)),
  })),
  totalBandwidthTodayGb: mockTotalBandwidthTodayGb,
  devices,
};

const overviewPayload: OverviewStats = {
  presentToday: dailyComparison[dailyComparison.length - 1].present,
  absentToday: dailyComparison[dailyComparison.length - 1].absent,
  lateArrivals: lateCount,
  totalBandwidthGb: Number(
    mockTotalBandwidthTodayGb.toFixed(1),
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
      const payload = response.data;
      return {
        ...networkPayload,
        ...payload,
        totalBandwidthTodayGb:
          payload.totalBandwidthTodayGb
          ?? Number(
            (payload.usageOverTime ?? []).reduce((sum, point) => sum + point.bandwidthGb, 0).toFixed(3),
          ),
      };
    } catch {
      // fall back to local mock data
    }
  }

  return getMockData<NetworkAnalytics>("/network");
};

export const fetchNetworkUsageHistory = async ({
  interval,
  start,
  end,
}: NetworkUsageHistoryQuery) => {
  if (collectorEnabled) {
    try {
      const response = await collectorApiClient.get<NetworkUsageHistoryResponse>(
        "/network/usage-history",
        {
          params: {
            interval,
            ...(start ? { start } : {}),
            ...(end ? { end } : {}),
          },
        },
      );
      return response.data;
    } catch {
      // fall back to local mock data
    }
  }

  return aggregateMockUsageHistory(mockHourlyUsageHistory, { interval, start, end });
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
