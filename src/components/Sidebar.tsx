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
        className={`fixed inset-0 z-30 bg-slate-950/35 transition-opacity duration-200 lg:hidden ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 transform border-r border-slate-200/90 bg-white/95 shadow-soft backdrop-blur transition-transform duration-300 lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-200/90 px-5">
          <div>
            <p className="font-heading text-lg font-semibold text-slate-900">
              IT Operations
            </p>
            <p className="text-xs text-slate-500">Internal Dashboard</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 lg:hidden"
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
                      ? "bg-gradient-to-r from-teal-600 to-cyan-600 text-white shadow-md"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`
                }
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="absolute inset-x-4 bottom-4 rounded-xl border border-teal-100 bg-teal-50/70 p-3 text-xs text-teal-900">
          Live operational metrics and trends for workforce and network health.
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
