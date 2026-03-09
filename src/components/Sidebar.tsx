import { ClipboardCheck, LayoutDashboard, Wifi, X } from "lucide-react";
import { NavLink } from "react-router-dom";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const navigation = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  { label: "Attendance Analytics", path: "/attendance", icon: ClipboardCheck },
  { label: "Network Usage", path: "/network", icon: Wifi },
];

const Sidebar = ({ isOpen, onClose }: SidebarProps) => {
  return (
    <>
      <div
        className={`fixed inset-0 z-30 bg-slate-950/35 transition-opacity duration-200 dark:bg-slate-950/65 lg:hidden ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 transform border-r border-[#e7d5e9] bg-gradient-to-b from-white via-[#fcf8fd] to-[#f7f1f8] shadow-[0_10px_30px_-14px_rgba(89,26,91,0.35)] backdrop-blur transition-transform duration-300 dark:border-slate-700/80 dark:bg-slate-900/95 lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-[#e7d5e9] px-5 dark:border-slate-700/80">
          <div>
            <p className="font-heading text-lg font-semibold text-[#591a5b]">
              IT Operations
            </p>
            <p className="text-xs text-[#8b5a8e]">Internal Dashboard</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-[#8b5a8e] transition hover:bg-[#f3e8f5] hover:text-[#591a5b] dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100 lg:hidden"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="space-y-2 px-4 py-5">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    isActive
                      ? "bg-gradient-to-r from-[#7b277d] to-[#591a5b] text-white shadow-md shadow-[#7b277d]/30"
                      : "text-[#5d4a67] hover:bg-[#f3e8f5] hover:text-[#591a5b] dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                  }`
                }
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="absolute inset-x-4 bottom-4 rounded-xl border border-[#e4c3e7] bg-gradient-to-r from-[#faf2fb] to-[#fff8e2] p-3 text-xs text-[#591a5b] dark:border-teal-700/40 dark:bg-teal-900/20 dark:text-teal-200">
          Live operational metrics and trends for workforce and network health.
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
