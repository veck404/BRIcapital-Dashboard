import { useEffect, useState } from "react";
import AttendanceChart from "../components/AttendanceChart";
import {
  fetchAttendanceAnalytics,
  type AttendanceAnalytics,
} from "../services/api";

const Attendance = () => {
  const [attendanceData, setAttendanceData] = useState<AttendanceAnalytics | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetchAttendanceAnalytics();
        setAttendanceData(response);
      } catch (requestError) {
        setError("Failed to load attendance analytics.");
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

  if (error || !attendanceData) {
    return (
      <section className="card-surface p-6">
        <p className="text-sm font-medium text-rose-600">
          {error ?? "Unable to render attendance analytics."}
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <AttendanceChart data={attendanceData} />

      <div className="card-surface overflow-hidden">
        <div className="border-b border-slate-200/80 px-5 py-4">
          <h3 className="section-title">Employee Attendance Log</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200/80 text-sm">
            <thead className="bg-slate-50/70">
              <tr>
                <th className="px-5 py-3 text-left font-semibold text-slate-600">
                  Employee Name
                </th>
                <th className="px-5 py-3 text-left font-semibold text-slate-600">
                  Check-in Time
                </th>
                <th className="px-5 py-3 text-left font-semibold text-slate-600">
                  Check-out Time
                </th>
                <th className="px-5 py-3 text-left font-semibold text-slate-600">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70">
              {attendanceData.records.map((record) => (
                <tr key={`${record.employeeName}-${record.checkIn}`}>
                  <td className="px-5 py-3 text-slate-700">{record.employeeName}</td>
                  <td className="px-5 py-3 text-slate-600">{record.checkIn}</td>
                  <td className="px-5 py-3 text-slate-600">{record.checkOut}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                        record.status === "On Time"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {record.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};

export default Attendance;
