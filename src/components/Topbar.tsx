import { Bell, Menu } from "lucide-react";
import { useMemo } from "react";
import { useLocation } from "react-router-dom";

interface TopbarProps {
  onToggleSidebar: () => void;
}

const pageTitles: Record<string, string> = {
  "/": "Overview",
  "/attendance": "Attendance Analytics",
  "/network": "Network Usage",
};

const Topbar = ({ onToggleSidebar }: TopbarProps) => {
  const location = useLocation();

  const today = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date()),
    [],
  );

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 lg:hidden"
            aria-label="Open navigation menu"
          >
            <Menu size={20} />
          </button>
          <div>
            <p className="font-heading text-lg font-semibold tracking-tight text-slate-900">
              {pageTitles[location.pathname] ?? "IT Operations"}
            </p>
            <p className="text-xs text-slate-500">{today}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="relative rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
            aria-label="Notifications"
          >
            <Bell size={18} />
            <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-teal-500" />
          </button>
          <div className="hidden rounded-xl border border-slate-200 bg-white px-3 py-2 text-right sm:block">
            <p className="text-sm font-semibold text-slate-900">Ops Control</p>
            <p className="text-xs text-slate-500">Management View</p>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Topbar;
