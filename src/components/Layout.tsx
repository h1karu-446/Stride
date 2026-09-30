import { NavLink, Outlet } from "react-router-dom";
import UndoToasts from "@/components/common/UndoToasts";
import clsx from "clsx";
import { useUiStore } from "@/lib/uiStore";
import { useAuth } from "@/lib/auth";

const NAV = [
  { to: "/", label: "Today", end: true },
  { to: "/plans", label: "Plans" },
  { to: "/journey", label: "Journey" },
];

export default function Layout() {
  const darkMode = useUiStore((s) => s.darkMode);
  const toggleDarkMode = useUiStore((s) => s.toggleDarkMode);
  const { signOut } = useAuth();

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-40 border-b border-slate-200 dark:border-notion-border bg-white/80 dark:bg-notion-bg/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight">Stride</span>
            <span className="hidden sm:inline text-xs muted">
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
                      ? "bg-slate-900 text-white dark:bg-notion-panel-hover dark:text-notion-fg"
                      : "text-slate-600 dark:text-notion-muted hover:bg-slate-100 dark:hover:bg-notion-panel-hover/60 dark:hover:text-notion-fg"
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
            <NavLink to="/settings" className="btn-ghost" aria-label="Settings">
              ⚙
            </NavLink>
            <button
              type="button"
              onClick={() => signOut()}
              className="btn-ghost text-xs"
              aria-label="Sign out"
            >
              ログアウト
            </button>
          </div>
        </div>
        <nav className="md:hidden border-t border-slate-200 dark:border-notion-border overflow-x-auto">
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
                      ? "bg-slate-900 text-white dark:bg-notion-panel-hover dark:text-notion-fg"
                      : "text-slate-600 dark:text-notion-muted"
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
        <UndoToasts />
      </main>
    </div>
  );
}
