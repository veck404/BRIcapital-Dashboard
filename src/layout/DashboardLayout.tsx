import { Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";

const DashboardLayout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("dark");
    root.style.colorScheme = "light";
  }, []);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-slate-100 transition-colors dark:bg-slate-950">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-52 bg-gradient-to-r from-cyan-100 via-teal-50 to-sky-100 blur-3xl dark:from-sky-900/40 dark:via-teal-900/30 dark:to-indigo-900/35" />
      <div className="relative z-10 flex">
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />
        <div className="flex min-h-screen w-full flex-col lg:pl-72">
          <Topbar onToggleSidebar={() => setIsSidebarOpen((open) => !open)} />
          <main className="flex-1 p-4 sm:p-6 lg:p-8">
            <div className="page-enter">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default DashboardLayout;
