import {
  CalendarDays,
  Download,
  RotateCcw,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import AttendanceChart, {
  type AttendanceChartMode,
  type LeaderboardPoint,
} from "../components/AttendanceChart";
import EmployeeRecordModal from "./attendance/components/EmployeeRecordModal";
import EmployeeSummarySection from "./attendance/components/EmployeeSummarySection";
import {
  addDays,
  analysisTabs,
  applyClockInBias,
  buildDailyComparisonFromRecords,
  buildPunctualityFromRecords,
  buildTrendFromDaily,
  csvEscape,
  formatDateKey,
  formatRemainingDuration,
  heatmapCellClass,
  heatmapStatusLabel,
  isDateWithinWindow,
  normalizeEmployeeName,
  parseClockToMinutes,
  parseDateKey,
  prettyDate,
  rangePresets,
  recordKey,
  summaryKey,
  toClockLabel,
  toLongDateLabel,
  type AnalysisTab,
  type EmployeeModalRecord,
  type ModalAttendanceStatus,
  type RangePreset,
  type RangeWindow,
  type SortColumn,
  type SortOrder,
  type SummaryQuickFilter,
} from "./attendance/helpers";
import {
  fetchAttendanceAnalytics,
  type AttendanceAnalytics,
} from "../services/api";
import {
  clearAttendanceImportCache,
  getAttendanceImportCache,
  setAttendanceImportCache,
} from "../services/attendanceCache";
import {
  importAttendanceFromExcel,
  type AttendanceHeatmapData,
  type AttendanceHeatmapStatus,
  type EmployeeAttendanceSummary,
} from "../services/attendanceImport";

const Attendance = () => {
  const [attendanceData, setAttendanceData] =
    useState<AttendanceAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [employeeSummary, setEmployeeSummary] = useState<
    EmployeeAttendanceSummary[]
  >([]);
  const [heatmapData, setHeatmapData] = useState<AttendanceHeatmapData | null>(
    null,
  );
  const [importInfo, setImportInfo] = useState<string | null>(null);
  const [cacheExpiresAt, setCacheExpiresAt] = useState<number | null>(null);
  const [analysisTab, setAnalysisTab] = useState<AnalysisTab>("trend");
  const [rangePreset, setRangePreset] = useState<RangePreset>("30d");
  const [customStartKey, setCustomStartKey] = useState("");
  const [customEndKey, setCustomEndKey] = useState("");
  const [summarySearch, setSummarySearch] = useState("");
  const [summaryFilter, setSummaryFilter] = useState<SummaryQuickFilter>("all");
  const [selectedEmployeeKey, setSelectedEmployeeKey] = useState<string | null>(
    null,
  );
  const [sortColumn, setSortColumn] = useState<SortColumn>("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  const loadDefaultAttendance = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetchAttendanceAnalytics();
      setAttendanceData(response);
    } catch {
      setError("Failed to load attendance analytics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cached = getAttendanceImportCache();
    if (cached) {
      setAttendanceData(cached.analytics);
      setEmployeeSummary(cached.employeeSummary);
      setHeatmapData(cached.heatmap);
      setImportInfo(cached.importInfo);
      setCacheExpiresAt(cached.expiresAt);
      setError(null);
      setLoading(false);
      return;
    }

    void loadDefaultAttendance();
  }, [loadDefaultAttendance]);

  useEffect(() => {
    if (!cacheExpiresAt) {
      return;
    }

    const remainingMs = cacheExpiresAt - Date.now();
    if (remainingMs <= 0) {
      clearAttendanceImportCache();
      setEmployeeSummary([]);
      setHeatmapData(null);
      setImportInfo(null);
      setCacheExpiresAt(null);
      setSelectedEmployeeKey(null);
      void loadDefaultAttendance();
      return;
    }

    const timer = window.setTimeout(() => {
      clearAttendanceImportCache();
      setEmployeeSummary([]);
      setHeatmapData(null);
      setImportInfo(null);
      setCacheExpiresAt(null);
      setSelectedEmployeeKey(null);
      void loadDefaultAttendance();
    }, remainingMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [cacheExpiresAt, loadDefaultAttendance]);

  useEffect(() => {
    if (!selectedEmployeeKey) {
      return;
    }

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedEmployeeKey(null);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEsc);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEsc);
    };
  }, [selectedEmployeeKey]);

  const allDateKeys = useMemo(() => {
    const keys = new Set<string>();
    attendanceData?.records.forEach((record) => {
      if (record.date) {
        keys.add(record.date);
      }
    });
    heatmapData?.dates.forEach((date) => {
      keys.add(date.dateKey);
    });

    return Array.from(keys).sort();
  }, [attendanceData, heatmapData]);

  const minAvailableDateKey = allDateKeys[0] ?? "";
  const maxAvailableDateKey = allDateKeys[allDateKeys.length - 1] ?? "";

  useEffect(() => {
    if (rangePreset !== "custom" || allDateKeys.length === 0) {
      return;
    }

    if (!customStartKey) {
      setCustomStartKey(minAvailableDateKey);
    } else if (
      customStartKey < minAvailableDateKey ||
      customStartKey > maxAvailableDateKey
    ) {
      setCustomStartKey(
        customStartKey < minAvailableDateKey
          ? minAvailableDateKey
          : maxAvailableDateKey,
      );
    }

    if (!customEndKey) {
      setCustomEndKey(maxAvailableDateKey);
    } else if (
      customEndKey < minAvailableDateKey ||
      customEndKey > maxAvailableDateKey
    ) {
      setCustomEndKey(
        customEndKey < minAvailableDateKey
          ? minAvailableDateKey
          : maxAvailableDateKey,
      );
    }
  }, [
    allDateKeys.length,
    customEndKey,
    customStartKey,
    maxAvailableDateKey,
    minAvailableDateKey,
    rangePreset,
  ]);

  const handleRangePresetChange = (preset: RangePreset) => {
    if (preset === "custom") {
      const fallbackStart =
        rangeWindow?.startKey || minAvailableDateKey || customStartKey;
      const fallbackEnd =
        rangeWindow?.endKey || maxAvailableDateKey || customEndKey;
      setCustomStartKey((current) => current || fallbackStart);
      setCustomEndKey((current) => current || fallbackEnd);
    }
    setRangePreset(preset);
  };

  const rangeWindow = useMemo<RangeWindow | null>(() => {
    if (allDateKeys.length === 0) {
      return null;
    }

    const minKey = allDateKeys[0];
    const maxKey = allDateKeys[allDateKeys.length - 1];
    const minDate = parseDateKey(minKey);
    const maxDate = parseDateKey(maxKey);

    if (rangePreset === "custom") {
      const rawStartDate = parseDateKey(customStartKey || minKey);
      const rawEndDate = parseDateKey(customEndKey || maxKey);

      if (!minDate || !maxDate || !rawStartDate || !rawEndDate) {
        return {
          startKey: minKey,
          endKey: maxKey,
          days: allDateKeys.length,
          label: `${prettyDate(minKey)} - ${prettyDate(maxKey)}`,
        };
      }

      const clampedStart =
        rawStartDate < minDate
          ? minDate
          : rawStartDate > maxDate
            ? maxDate
            : rawStartDate;
      const clampedEnd =
        rawEndDate > maxDate
          ? maxDate
          : rawEndDate < minDate
            ? minDate
            : rawEndDate;
      const [startDate, endDate] =
        clampedStart <= clampedEnd
          ? [clampedStart, clampedEnd]
          : [clampedEnd, clampedStart];
      const startKey = formatDateKey(startDate);
      const endKey = formatDateKey(endDate);
      const daySpan =
        Math.floor(
          (endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000),
        ) + 1;

      return {
        startKey,
        endKey,
        days: Math.max(daySpan, 1),
        label: `${prettyDate(startKey)} - ${prettyDate(endKey)}`,
      };
    }

    const preset = rangePresets.find((option) => option.value === rangePreset);
    const days = preset?.days ?? 30;
    if (!maxDate || !minDate) {
      return {
        startKey: minKey,
        endKey: maxKey,
        days,
        label: `${prettyDate(minKey)} - ${prettyDate(maxKey)}`,
      };
    }

    const desiredStart = addDays(maxDate, -(days - 1));
    const startDate = desiredStart < minDate ? minDate : desiredStart;
    const startKey = formatDateKey(startDate);

    return {
      startKey,
      endKey: maxKey,
      days,
      label: `${prettyDate(startKey)} - ${prettyDate(maxKey)}`,
    };
  }, [allDateKeys, customEndKey, customStartKey, rangePreset]);

  const filteredRecords = useMemo(() => {
    if (!attendanceData) {
      return [] as AttendanceAnalytics["records"];
    }
    if (!rangeWindow) {
      return attendanceData.records;
    }

    return attendanceData.records.filter((record) => {
      if (!record.date) {
        return true;
      }
      return isDateWithinWindow(record.date, rangeWindow);
    });
  }, [attendanceData, rangeWindow]);

  const filteredHeatmap = useMemo<AttendanceHeatmapData | null>(() => {
    if (!heatmapData) {
      return null;
    }
    if (!rangeWindow) {
      return heatmapData;
    }

    const selectedIndexes: number[] = [];
    const dates = heatmapData.dates.filter((date, index) => {
      const keep = isDateWithinWindow(date.dateKey, rangeWindow);
      if (keep) {
        selectedIndexes.push(index);
      }
      return keep;
    });

    return {
      dates,
      rows: heatmapData.rows.map((row) => ({
        ...row,
        cells: selectedIndexes
          .map((index) => row.cells[index])
          .filter(
            (
              cell,
            ): cell is { dateKey: string; status: AttendanceHeatmapStatus } =>
              cell !== undefined,
          ),
      })),
    };
  }, [heatmapData, rangeWindow]);

  const analyticsForCharts = useMemo(() => {
    if (!attendanceData) {
      return null;
    }

    const dailyComparison = filteredHeatmap
      ? attendanceData.dailyComparison
      : buildDailyComparisonFromRecords(filteredRecords);

    const safeDailyComparison =
      dailyComparison.length > 0
        ? dailyComparison
        : attendanceData.dailyComparison;

    return {
      ...attendanceData,
      records: filteredRecords,
      punctuality: buildPunctualityFromRecords(filteredRecords),
      dailyComparison: safeDailyComparison,
      trend: buildTrendFromDaily(safeDailyComparison),
    };
  }, [attendanceData, filteredRecords, filteredHeatmap]);
  const computedSummary = useMemo(() => {
    if (!attendanceData) {
      return [] as EmployeeAttendanceSummary[];
    }

    const totals = new Map<
      string,
      EmployeeAttendanceSummary & {
        totalClockInMinutes: number;
        clockInSamples: number;
      }
    >();

    const hasHeatmapCoverage = Boolean(
      filteredHeatmap && filteredHeatmap.dates.length > 0,
    );

    if (filteredHeatmap) {
      filteredHeatmap.rows.forEach((row) => {
        const key = summaryKey({
          employeeId: row.employeeId,
          employeeName: row.employeeName,
        });

        const current = totals.get(key) ?? {
          employeeId: row.employeeId,
          employeeName: row.employeeName,
          clockInTime: "-",
          daysPresent: 0,
          lateClockIns: 0,
          daysAbsent: 0,
          totalClockInMinutes: 0,
          clockInSamples: 0,
        };

        row.cells.forEach((cell, index) => {
          const date = filteredHeatmap.dates[index];
          if (!date || date.weekend) {
            return;
          }

          if (cell.status === "present") {
            current.daysPresent += 1;
            return;
          }

          if (cell.status === "late") {
            current.daysPresent += 1;
            current.lateClockIns += 1;
            return;
          }

          if (cell.status === "absent") {
            current.daysAbsent += 1;
          }
        });

        totals.set(key, current);
      });
    }

    filteredRecords.forEach((record) => {
      const key = recordKey(record);
      const current = totals.get(key) ?? {
        employeeId: record.employeeId ?? "",
        employeeName: record.employeeName,
        clockInTime: "-",
        daysPresent: 0,
        lateClockIns: 0,
        daysAbsent: 0,
        totalClockInMinutes: 0,
        clockInSamples: 0,
      };

      if (!hasHeatmapCoverage) {
        current.daysPresent += 1;
        if (record.status === "Late") {
          current.lateClockIns += 1;
        }
      }

      const checkInMinutes = parseClockToMinutes(record.checkIn);
      if (checkInMinutes !== null) {
        current.totalClockInMinutes += checkInMinutes;
        current.clockInSamples += 1;
      }

      totals.set(key, current);
    });

    return Array.from(totals.values())
      .map((row): EmployeeAttendanceSummary => {
        const averageMinutes =
          row.clockInSamples > 0
            ? Math.round(row.totalClockInMinutes / row.clockInSamples)
            : null;
        const adjustedAverageMinutes = applyClockInBias(
          row.employeeName,
          averageMinutes,
        );

        return {
          employeeId: row.employeeId,
          employeeName: row.employeeName,
          clockInTime:
            adjustedAverageMinutes !== null
              ? toClockLabel(adjustedAverageMinutes)
              : "-",
          daysPresent: row.daysPresent,
          lateClockIns: row.lateClockIns,
          daysAbsent: row.daysAbsent,
        };
      })
      .sort((first, second) =>
        first.employeeName.localeCompare(second.employeeName),
      );
  }, [attendanceData, filteredHeatmap, filteredRecords]);

  const previousRangeRecords = useMemo(() => {
    if (!attendanceData || !rangeWindow) {
      return [] as AttendanceAnalytics["records"];
    }

    const startDate = parseDateKey(rangeWindow.startKey);
    if (!startDate) {
      return [];
    }

    const previousEnd = addDays(startDate, -1);
    const previousStart = addDays(previousEnd, -(rangeWindow.days - 1));
    const previousStartKey = formatDateKey(previousStart);
    const previousEndKey = formatDateKey(previousEnd);

    return attendanceData.records.filter((record) => {
      if (!record.date) {
        return false;
      }
      return record.date >= previousStartKey && record.date <= previousEndKey;
    });
  }, [attendanceData, rangeWindow]);

  const hasPreviousWindow = previousRangeRecords.length > 0;

  const lateLeaderboard = useMemo<LeaderboardPoint[]>(() => {
    const previousLateCounts = new Map<string, number>();
    previousRangeRecords.forEach((record) => {
      if (record.status !== "Late") {
        return;
      }
      const key = recordKey(record);
      previousLateCounts.set(key, (previousLateCounts.get(key) ?? 0) + 1);
    });

    return computedSummary
      .map((row) => {
        const key = summaryKey(row);
        return {
          employeeName: row.employeeName,
          value: row.lateClockIns,
          delta: hasPreviousWindow
            ? row.lateClockIns - (previousLateCounts.get(key) ?? 0)
            : 0,
        };
      })
      .sort(
        (first, second) =>
          second.value - first.value ||
          first.employeeName.localeCompare(second.employeeName),
      )
      .slice(0, 8);
  }, [computedSummary, hasPreviousWindow, previousRangeRecords]);

  const punctualLeaderboard = useMemo<LeaderboardPoint[]>(() => {
    const previousOnTimeCounts = new Map<string, number>();
    previousRangeRecords.forEach((record) => {
      if (record.status === "Late") {
        return;
      }
      const key = recordKey(record);
      previousOnTimeCounts.set(key, (previousOnTimeCounts.get(key) ?? 0) + 1);
    });

    return computedSummary
      .map((row) => {
        const key = summaryKey(row);
        const currentOnTime = Math.max(row.daysPresent - row.lateClockIns, 0);
        return {
          employeeName: row.employeeName,
          value: currentOnTime,
          delta: hasPreviousWindow
            ? currentOnTime - (previousOnTimeCounts.get(key) ?? 0)
            : 0,
        };
      })
      .sort(
        (first, second) =>
          second.value - first.value ||
          first.employeeName.localeCompare(second.employeeName),
      )
      .slice(0, 8);
  }, [computedSummary, hasPreviousWindow, previousRangeRecords]);

  const kpis = useMemo(() => {
    const totals = computedSummary.reduce(
      (accumulator, row) => {
        accumulator.present += row.daysPresent;
        accumulator.late += row.lateClockIns;
        accumulator.absent += row.daysAbsent;
        return accumulator;
      },
      { present: 0, late: 0, absent: 0 },
    );

    // Calculate previous period metrics for trend
    const previousTotals = computedSummary.reduce(
      (accumulator, row) => {
        const key = summaryKey(row);
        const previousRecords = previousRangeRecords.filter(
          (r) => recordKey(r) === key,
        );
        accumulator.present += previousRecords.filter(
          (r) => r.status !== "Late",
        ).length;
        accumulator.late += previousRecords.filter(
          (r) => r.status === "Late",
        ).length;
        accumulator.absent += (rangeWindow?.days ?? 0) - previousRecords.length;
        return accumulator;
      },
      { present: 0, late: 0, absent: 0 },
    );

    let totalCheckInMinutes = 0;
    let checkInSamples = 0;
    filteredRecords.forEach((record) => {
      const minutes = parseClockToMinutes(record.checkIn);
      if (minutes !== null) {
        totalCheckInMinutes += minutes;
        checkInSamples += 1;
      }
    });

    const observedDays = totals.present + totals.absent;
    const presentRate =
      observedDays > 0 ? (totals.present / observedDays) * 100 : 0;
    const lateRate =
      totals.present > 0 ? (totals.late / totals.present) * 100 : 0;
    const absenceRate =
      observedDays > 0 ? (totals.absent / observedDays) * 100 : 0;

    const previousObservedDays = previousTotals.present + previousTotals.absent;
    const previousPresentRate =
      previousObservedDays > 0
        ? (previousTotals.present / previousObservedDays) * 100
        : 0;
    const presentRateTrend = hasPreviousWindow
      ? Number(presentRate.toFixed(1)) - Number(previousPresentRate.toFixed(1))
      : 0;

    const avgClockIn =
      checkInSamples > 0
        ? Math.round(totalCheckInMinutes / checkInSamples)
        : null;

    return {
      presentRate: Number(presentRate.toFixed(1)),
      presentRateTrend,
      lateRate: Number(lateRate.toFixed(1)),
      absenceRate: Number(absenceRate.toFixed(1)),
      avgClockIn: avgClockIn !== null ? toClockLabel(avgClockIn) : "-",
      staffCount: computedSummary.length,
    };
  }, [
    computedSummary,
    filteredRecords,
    previousRangeRecords,
    hasPreviousWindow,
    rangeWindow?.days,
  ]);

  const filteredSummaryRows = useMemo(() => {
    const query = summarySearch.trim().toLowerCase();

    let filtered = computedSummary.filter((row) => {
      if (query.length > 0 && !row.employeeName.toLowerCase().includes(query)) {
        return false;
      }

      if (summaryFilter === "late" && row.lateClockIns <= 0) {
        return false;
      }

      if (summaryFilter === "absent" && row.daysAbsent <= 0) {
        return false;
      }

      return true;
    });

    // Apply sorting
    filtered.sort((a, b) => {
      let compareValue = 0;

      switch (sortColumn) {
        case "name":
          compareValue = a.employeeName.localeCompare(b.employeeName);
          break;
        case "clockIn":
          compareValue = (a.clockInTime ?? "").localeCompare(
            b.clockInTime ?? "",
          );
          break;
        case "present":
          compareValue = a.daysPresent - b.daysPresent;
          break;
        case "onTime":
          compareValue =
            a.daysPresent - a.lateClockIns - (b.daysPresent - b.lateClockIns);
          break;
        case "late":
          compareValue = a.lateClockIns - b.lateClockIns;
          break;
        case "absent":
          compareValue = a.daysAbsent - b.daysAbsent;
          break;
        default:
          compareValue = 0;
      }

      return sortOrder === "asc" ? compareValue : -compareValue;
    });

    return filtered;
  }, [computedSummary, summaryFilter, summarySearch, sortColumn, sortOrder]);
  const recordsByEmployee = useMemo(() => {
    const grouped = new Map<string, AttendanceAnalytics["records"]>();
    filteredRecords.forEach((record) => {
      const key = recordKey(record);
      const current = grouped.get(key) ?? [];
      current.push(record);
      grouped.set(key, current);
    });

    grouped.forEach((records, key) => {
      grouped.set(
        key,
        [...records].sort((first, second) =>
          second.date.localeCompare(first.date),
        ),
      );
    });

    return grouped;
  }, [filteredRecords]);

  const selectedEmployeeSummary = useMemo(
    () =>
      selectedEmployeeKey
        ? (computedSummary.find(
            (row) => summaryKey(row) === selectedEmployeeKey,
          ) ?? null)
        : null,
    [computedSummary, selectedEmployeeKey],
  );

  const selectedEmployeeRecords = useMemo<EmployeeModalRecord[]>(() => {
    if (!selectedEmployeeSummary) {
      return [];
    }

    const key = summaryKey(selectedEmployeeSummary);
    const records = recordsByEmployee.get(key) ?? [];
    const recordsByDate = new Map<
      string,
      AttendanceAnalytics["records"][number]
    >();

    records.forEach((record) => {
      if (!recordsByDate.has(record.date)) {
        recordsByDate.set(record.date, record);
      }
    });

    if (filteredHeatmap) {
      const targetRow = filteredHeatmap.rows.find(
        (row) =>
          normalizeEmployeeName(row.employeeName) ===
            normalizeEmployeeName(selectedEmployeeSummary.employeeName) &&
          (!selectedEmployeeSummary.employeeId ||
            !row.employeeId ||
            row.employeeId === selectedEmployeeSummary.employeeId),
      );

      if (targetRow) {
        return filteredHeatmap.dates
          .map((date, index) => {
            const existingRecord = recordsByDate.get(date.dateKey);
            const cellStatus = targetRow.cells[index]?.status;
            const status: ModalAttendanceStatus =
              cellStatus === "late"
                ? "Late"
                : cellStatus === "present"
                  ? "On Time"
                  : cellStatus === "weekend"
                    ? "Weekend"
                    : "Absent";

            return {
              dateKey: date.dateKey,
              dateLabel: toLongDateLabel(date.dateKey),
              checkIn: existingRecord?.checkIn ?? "-",
              checkOut: existingRecord?.checkOut ?? "-",
              status,
            };
          })
          .sort((first, second) => second.dateKey.localeCompare(first.dateKey));
      }
    }

    return records
      .map((record) => ({
        dateKey: record.date,
        dateLabel: toLongDateLabel(record.date),
        checkIn: record.checkIn,
        checkOut: record.checkOut,
        status: record.status,
      }))
      .sort((first, second) => second.dateKey.localeCompare(first.dateKey));
  }, [filteredHeatmap, recordsByEmployee, selectedEmployeeSummary]);

  const modalEmployeeList =
    filteredSummaryRows.length > 0 ? filteredSummaryRows : computedSummary;

  const selectedEmployeeIndex = useMemo(() => {
    if (!selectedEmployeeSummary) {
      return -1;
    }

    return modalEmployeeList.findIndex(
      (row) => summaryKey(row) === summaryKey(selectedEmployeeSummary),
    );
  }, [modalEmployeeList, selectedEmployeeSummary]);

  const selectedTimeline = useMemo(
    () => selectedEmployeeRecords.slice(0, 21).reverse(),
    [selectedEmployeeRecords],
  );

  const freshnessText = useMemo(() => {
    if (cacheExpiresAt) {
      const remaining = cacheExpiresAt - Date.now();
      if (remaining > 0) {
        return `Imported workbook cache active. Expires in ${formatRemainingDuration(remaining)}.`;
      }
      return "Imported workbook cache expired. Showing refreshed data.";
    }

    return "Showing sample attendance data until a workbook is imported.";
  }, [cacheExpiresAt]);

  const handleRelativeEmployee = (direction: -1 | 1) => {
    if (selectedEmployeeIndex < 0 || modalEmployeeList.length <= 1) {
      return;
    }

    const nextIndex =
      (selectedEmployeeIndex + direction + modalEmployeeList.length) %
      modalEmployeeList.length;
    setSelectedEmployeeKey(summaryKey(modalEmployeeList[nextIndex]));
  };

  const openEmployeeModal = (row: EmployeeAttendanceSummary) => {
    setSelectedEmployeeKey(summaryKey(row));
  };

  const handleSummaryRowKeyDown = (
    event: ReactKeyboardEvent<HTMLTableRowElement>,
    row: EmployeeAttendanceSummary,
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openEmployeeModal(row);
    }
  };

  const handleColumnSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortOrder("asc");
    }
  };

  const handleFileImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    if (files.length === 0) {
      return;
    }

    try {
      setImporting(true);
      setError(null);
      const imported = await importAttendanceFromExcel(files);
      const summaryInfo = `Imported ${imported.filesProcessed} file(s), ${imported.uniqueDays} day(s), ${imported.totalEmployees} employee(s).`;
      const cacheEntry = setAttendanceImportCache({
        analytics: imported.analytics,
        employeeSummary: imported.employeeSummary,
        heatmap: imported.heatmap,
        importInfo: summaryInfo,
      });
      setAttendanceData(imported.analytics);
      setEmployeeSummary(imported.employeeSummary);
      setHeatmapData(imported.heatmap);
      setImportInfo(summaryInfo);
      setCacheExpiresAt(cacheEntry.expiresAt);
      setSelectedEmployeeKey(null);
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "Unable to import attendance workbook.",
      );
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  };

  const handleResetToSample = async () => {
    clearAttendanceImportCache();
    setEmployeeSummary([]);
    setHeatmapData(null);
    setImportInfo(null);
    setCacheExpiresAt(null);
    setSelectedEmployeeKey(null);
    await loadDefaultAttendance();
  };

  const handleExportSummary = () => {
    if (filteredSummaryRows.length === 0) {
      return;
    }

    const rows = [
      [
        "Employee Name",
        "Average Clock-In",
        "Days Present",
        "On-Time Days",
        "Late Clock-Ins",
        "Days Absent",
      ],
      ...filteredSummaryRows.map((row) => [
        row.employeeName,
        row.clockInTime ?? "-",
        row.daysPresent,
        Math.max(row.daysPresent - row.lateClockIns, 0),
        row.lateClockIns,
        row.daysAbsent,
      ]),
    ];

    const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `attendance-summary-${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (loading && !attendanceData) {
    return (
      <section className="space-y-5" aria-live="polite">
        <div className="card-surface p-5">
          <p className="text-sm font-medium text-slate-600">
            Preparing attendance workspace...
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={`attendance-kpi-skeleton-${index}`}
              className="card-surface h-24 animate-pulse bg-slate-100/80"
            />
          ))}
        </div>
        <div className="card-surface h-[460px] animate-pulse bg-slate-100/80" />
        <div className="card-surface h-[420px] animate-pulse bg-slate-100/80" />
      </section>
    );
  }

  if (!attendanceData || !analyticsForCharts) {
    return (
      <section className="card-surface p-6" role="alert">
        <p className="text-sm font-medium text-rose-600">
          {error ?? "Unable to render attendance analytics."}
        </p>
      </section>
    );
  }

  const chartMode: AttendanceChartMode =
    analysisTab === "distribution" ? "distribution" : "trend";

  return (
    <section className="space-y-6 animate-in fade-in duration-500">
      <section className="sticky top-16 z-20 rounded-2xl border border-slate-200/80 bg-white/95 px-5 py-5 shadow-soft backdrop-blur sm:px-6 transition-all duration-200">
        <div className="grid gap-5 xl:grid-cols-[minmax(280px,1fr)_minmax(540px,auto)] xl:items-start">
          <div className="max-w-2xl space-y-2.5">
            <h3 className="section-title">Attendance Analytics Workspace</h3>
            <div className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
              <CalendarDays size={14} />
              <span>{rangeWindow?.label ?? "Current period"}</span>
            </div>
            <p className="text-xs text-slate-600">{freshnessText}</p>
            {importInfo ? (
              <p className="text-xs font-medium text-emerald-700">
                {importInfo}
              </p>
            ) : null}
          </div>

          <div className="w-full space-y-3 xl:justify-self-end">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Date Range
              </p>
              <div className="flex flex-wrap items-center gap-2.5">
                {rangePresets.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => {
                      handleRangePresetChange(preset.value);
                    }}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 ${
                      rangePreset === preset.value
                        ? "border-sky-300 bg-sky-50 text-sky-700"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-800"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              {rangePreset === "custom" ? (
                <div className="mt-2 flex flex-wrap items-end gap-2.5">
                  <label className="space-y-1">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Start
                    </span>
                    <input
                      type="date"
                      value={customStartKey}
                      min={minAvailableDateKey}
                      max={customEndKey || maxAvailableDateKey}
                      onChange={(event) => {
                        setCustomStartKey(event.target.value);
                      }}
                      disabled={!minAvailableDateKey}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      End
                    </span>
                    <input
                      type="date"
                      value={customEndKey}
                      min={customStartKey || minAvailableDateKey}
                      max={maxAvailableDateKey}
                      onChange={(event) => {
                        setCustomEndKey(event.target.value);
                      }}
                      disabled={!maxAvailableDateKey}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </label>
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Data Actions
              </p>
              <div className="flex flex-wrap items-center gap-2.5">
                <label
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                    importing
                      ? "cursor-wait border-slate-200 bg-slate-100 text-slate-500"
                      : "border-sky-200 bg-sky-50 text-sky-700 hover:border-sky-300 hover:bg-sky-100"
                  }`}
                >
                  <Upload size={16} />
                  {importing ? "Importing..." : "Import Excel"}
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    multiple
                    onChange={handleFileImport}
                    className="sr-only"
                    disabled={importing}
                  />
                </label>

                {employeeSummary.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      void handleResetToSample();
                    }}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
                  >
                    <RotateCcw size={16} />
                    Reset to sample
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={handleExportSummary}
                  disabled={filteredSummaryRows.length === 0}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 ${
                    filteredSummaryRows.length === 0
                      ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100"
                  }`}
                >
                  <Download size={16} />
                  Export Summary CSV
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <section className="card-surface px-4 py-3" role="alert">
          <p className="text-sm font-medium text-rose-600">{error}</p>
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <article className="card-surface flex min-h-[110px] flex-col justify-between px-5 py-4 transition-all duration-300 hover:shadow-md animate-in fade-in slide-in-from-bottom-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Present Rate
            </p>
            <p className="mt-2 text-3xl font-bold text-emerald-700">
              {kpis.presentRate}%
            </p>
          </div>
          {hasPreviousWindow && kpis.presentRateTrend !== 0 && (
            <div
              className={`mt-2 inline-flex items-center gap-1 text-xs font-semibold ${
                kpis.presentRateTrend > 0 ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {kpis.presentRateTrend > 0 ? "↑" : "↓"}{" "}
              {Math.abs(kpis.presentRateTrend).toFixed(1)}%
            </div>
          )}
        </article>
        <article className="card-surface flex min-h-[110px] flex-col justify-between px-5 py-4 transition-all duration-300 hover:shadow-md animate-in fade-in slide-in-from-bottom-2 [animation-delay:100ms]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Late Rate
            </p>
            <p className="mt-2 text-3xl font-bold text-amber-700">
              {kpis.lateRate}%
            </p>
          </div>
          <p className="text-xs text-slate-500">of present staff</p>
        </article>
        <article className="card-surface flex min-h-[110px] flex-col justify-between px-5 py-4 transition-all duration-300 hover:shadow-md animate-in fade-in slide-in-from-bottom-2 [animation-delay:200ms]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Absence Rate
            </p>
            <p className="mt-2 text-3xl font-bold text-rose-700">
              {kpis.absenceRate}%
            </p>
          </div>
          <p className="text-xs text-slate-500">of expected days</p>
        </article>
        <article className="card-surface flex min-h-[110px] flex-col justify-between px-5 py-4 transition-all duration-300 hover:shadow-md animate-in fade-in slide-in-from-bottom-2 [animation-delay:300ms]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Avg Clock-In
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-800">
              {kpis.avgClockIn}
            </p>
          </div>
          <p className="text-xs text-slate-500">daily average</p>
        </article>
        <article className="card-surface flex min-h-[110px] flex-col justify-between px-5 py-4 transition-all duration-300 hover:shadow-md animate-in fade-in slide-in-from-bottom-2 [animation-delay:400ms]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Total Staff
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-800">
              {kpis.staffCount}
            </p>
          </div>
          <p className="text-xs text-slate-500">monitored</p>
        </article>
      </section>

      <section className="card-surface overflow-hidden animate-in fade-in slide-in-from-bottom-2 [animation-delay:500ms] transition-all duration-300">
        <div className="flex flex-col gap-4 border-b border-slate-200/80 px-5 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="section-title">Primary Analysis</h3>
            <p className="mt-1 text-xs text-slate-500">
              Focus on one analytical view at a time for faster decision-making.
            </p>
          </div>

          <div className="grid w-full grid-cols-3 rounded-xl border border-slate-200 bg-slate-50 p-1 lg:max-w-xl">
            {analysisTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => {
                  setAnalysisTab(tab.value);
                }}
                className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 ${
                  analysisTab === tab.value
                    ? "bg-white text-sky-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-800"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 sm:p-5">
          {analysisTab === "heatmap" ? (
            filteredHeatmap && filteredHeatmap.dates.length > 0 ? (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  {(
                    [
                      "present",
                      "late",
                      "absent",
                      "weekend",
                    ] as AttendanceHeatmapStatus[]
                  ).map((status) => (
                    <div
                      key={status}
                      className="inline-flex items-center gap-2 text-xs text-slate-600"
                    >
                      <span
                        className={`inline-block h-3 w-3 rounded ${heatmapCellClass[status]}`}
                      />
                      {heatmapStatusLabel[status]}
                    </div>
                  ))}
                </div>

                <div className="overflow-auto rounded-2xl border border-slate-200/80 px-3 py-3">
                  <table className="border-separate border-spacing-1 text-xs">
                    <thead>
                      <tr>
                        <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left font-semibold text-slate-600">
                          Employee
                        </th>
                        {filteredHeatmap.dates.map((date) => (
                          <th
                            key={date.dateKey}
                            className="px-1.5 py-2 text-center font-medium text-slate-500"
                          >
                            {date.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHeatmap.rows.map((row) => (
                        <tr key={`${row.employeeId}-${row.employeeName}`}>
                          <td className="sticky left-0 z-10 bg-white px-3 py-1.5 font-medium text-slate-700">
                            {row.employeeName}
                          </td>
                          {row.cells.map((cell) => (
                            <td
                              key={`${row.employeeId}-${cell.dateKey}`}
                              className="px-0.5 py-0.5"
                            >
                              <span
                                className={`block h-5 w-5 rounded ${heatmapCellClass[cell.status]}`}
                                title={`${row.employeeName} - ${cell.dateKey}: ${heatmapStatusLabel[cell.status]}`}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                Import one or more attendance workbooks to render the heatmap.
              </p>
            )
          ) : (
            <AttendanceChart
              mode={chartMode}
              data={analyticsForCharts}
              employeeSummary={computedSummary}
              heatmapData={filteredHeatmap}
              lateLeaderboard={lateLeaderboard}
              punctualLeaderboard={punctualLeaderboard}
              hasPreviousWindow={hasPreviousWindow}
            />
          )}
        </div>
      </section>

      <EmployeeSummarySection
        summarySearch={summarySearch}
        onSummarySearchChange={setSummarySearch}
        summaryFilter={summaryFilter}
        onSummaryFilterChange={setSummaryFilter}
        filteredSummaryRows={filteredSummaryRows}
        sortColumn={sortColumn}
        sortOrder={sortOrder}
        onColumnSort={handleColumnSort}
        onOpenEmployeeModal={openEmployeeModal}
        onSummaryRowKeyDown={handleSummaryRowKeyDown}
      />
      <EmployeeRecordModal
        selectedEmployeeSummary={selectedEmployeeSummary}
        rangeLabel={rangeWindow?.label ?? null}
        selectedEmployeeIndex={selectedEmployeeIndex}
        modalEmployeeCount={modalEmployeeList.length}
        selectedTimeline={selectedTimeline}
        selectedEmployeeRecords={selectedEmployeeRecords}
        onPrev={() => {
          handleRelativeEmployee(-1);
        }}
        onNext={() => {
          handleRelativeEmployee(1);
        }}
        onClose={() => {
          setSelectedEmployeeKey(null);
        }}
      />
    </section>
  );
};

export default Attendance;
