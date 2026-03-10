import { ChevronDown, Menu } from "lucide-react";
import { useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

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
  const navigate = useNavigate();
  const opsControlRef = useRef<HTMLDetailsElement>(null);

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

  const runControlAction = (action: () => void) => {
    action();
    opsControlRef.current?.removeAttribute("open");
  };

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
          <details
            ref={opsControlRef}
            className="relative hidden sm:block"
          >
            <summary className="list-none cursor-pointer rounded-xl border border-[#e4c3e7] bg-[#fcf8fd] px-3 py-2 text-right transition hover:border-[#d39ad8] hover:bg-[#f9f2fa] [&::-webkit-details-marker]:hidden dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600 dark:hover:bg-slate-800">
              <div className="flex items-center gap-2">
                <div>
                  <p className="text-sm font-semibold text-[#591a5b]">Ops Control</p>
                  <p className="text-xs text-[#8b5a8e]">Management View</p>
                </div>
                <ChevronDown size={16} className="text-[#8b5a8e]" />
              </div>
            </summary>

            <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-60 overflow-hidden rounded-xl border border-[#e4c3e7] bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
              <div className="border-b border-slate-200/80 px-3 py-2 dark:border-slate-700">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Quick Navigation
                </p>
              </div>

              <div className="p-1.5">
                <button
                  type="button"
                  onClick={() => {
                    runControlAction(() => {
                      navigate("/");
                    });
                  }}
                  className="w-full rounded-lg px-2.5 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Overview
                </button>
                <button
                  type="button"
                  onClick={() => {
                    runControlAction(() => {
                      navigate("/attendance");
                    });
                  }}
                  className="w-full rounded-lg px-2.5 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Attendance Analytics
                </button>
                <button
                  type="button"
                  onClick={() => {
                    runControlAction(() => {
                      navigate("/network");
                    });
                  }}
                  className="w-full rounded-lg px-2.5 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Network Usage
                </button>
              </div>

              <div className="border-t border-slate-200/80 p-1.5 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => {
                    runControlAction(() => {
                      window.location.reload();
                    });
                  }}
                  className="w-full rounded-lg px-2.5 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Refresh Current View
                </button>
              </div>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
};

export default Topbar;
