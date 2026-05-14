import { NavLink, Outlet } from "react-router-dom";
import clsx from "clsx";
import { useStore } from "@/lib/store";

const NAV = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/tasks", label: "Tasks" },
  { to: "/review", label: "Review" },
  { to: "/calendar", label: "Calendar" },
  { to: "/trends", label: "Trends" },
  { to: "/archive", label: "Archive" },
];

export default function Layout() {
  const darkMode = useStore((s) => s.darkMode);
  const toggleDarkMode = useStore((s) => s.toggleDarkMode);

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-40 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight">Stride</span>
            <span className="hidden sm:inline text-xs text-slate-500">
              Daily Task Scoring
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-1 text-sm">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  clsx(
                    "rounded-md px-3 py-1.5 transition",
                    isActive
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  )
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleDarkMode}
              className="btn-ghost"
              aria-label="Toggle dark mode"
            >
              {darkMode ? "☀" : "☾"}
            </button>
            <NavLink to="/settings" className="btn-ghost">
              ⚙
            </NavLink>
          </div>
        </div>
        <nav className="md:hidden border-t border-slate-200 dark:border-slate-800 overflow-x-auto">
          <div className="flex gap-1 px-3 py-2 text-sm">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  clsx(
                    "shrink-0 rounded-md px-3 py-1.5",
                    isActive
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                      : "text-slate-600 dark:text-slate-300"
                  )
                }
              >
                {n.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-10">
        <Outlet />
      </main>
    </div>
  );
}
