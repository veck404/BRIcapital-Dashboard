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
    <header className="sticky top-0 z-20 border-b border-[#e7d5e9]/90 bg-gradient-to-r from-white via-[#fcf8fd]/95 to-[#fff8e3]/90 backdrop-blur dark:border-slate-700/80 dark:bg-slate-900/85">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="rounded-lg p-2 text-[#8b5a8e] transition hover:bg-[#f3e8f5] hover:text-[#591a5b] dark:text-slate-300 dark:hover:bg-slate-800 lg:hidden"
            aria-label="Open navigation menu"
          >
            <Menu size={20} />
          </button>
          <div>
            <p className="font-heading text-lg font-semibold tracking-tight text-[#591a5b]">
              {pageTitles[location.pathname] ?? "IT Operations"}
            </p>
            <p className="text-xs text-[#8b5a8e]">{today}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="relative rounded-xl border border-[#e4c3e7] bg-white p-2 text-[#7b277d] transition hover:border-[#d39ad8] hover:bg-[#f9f2fa] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800"
            aria-label="Notifications"
          >
            <Bell size={18} />
            <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-[#f5bf1b]" />
          </button>
          <div className="hidden rounded-xl border border-[#e4c3e7] bg-[#fcf8fd] px-3 py-2 text-right sm:block dark:border-slate-700 dark:bg-slate-900">
            <p className="text-sm font-semibold text-[#591a5b]">Ops Control</p>
            <p className="text-xs text-[#8b5a8e]">Management View</p>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Topbar;
