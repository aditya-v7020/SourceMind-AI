import { Moon, Sun, Menu } from "lucide-react";
import { useApp } from "../context/AppContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";

const FRONTEND_BUILD = "v4.2 · 6 agents";

export default function TopBar({ title, subtitle }) {
  const { connected, backendVersion, toggleMobileSidebar } = useApp();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="flex items-center justify-between border-b border-line dark:border-dline bg-panel/80 dark:bg-dpanel/80 backdrop-blur-md px-3 sm:px-6 py-2.5 sm:py-3.5 gap-2">
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          onClick={toggleMobileSidebar}
          className="lg:hidden flex h-8 w-8 items-center justify-center rounded-lg border border-line dark:border-dline text-subink dark:text-dsubink hover:bg-canvas dark:hover:bg-dline/40 shrink-0"
          title="Open Menu"
        >
          <Menu size={16} />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-sm sm:text-base font-semibold leading-none tracking-tight truncate">{title}</h2>
            <span className="hidden xs:inline-block rounded-full bg-source-soft dark:bg-source/20 px-1.5 py-0.5 text-[10px] font-semibold text-source shrink-0">
              {FRONTEND_BUILD}
            </span>
          </div>
          {subtitle && <p className="mt-0.5 sm:mt-1 text-[11px] sm:text-xs text-subink dark:text-dsubink truncate">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs font-medium text-subink dark:text-dsubink">
        {backendVersion && <span className="hidden sm:inline text-subink/70 dark:text-dsubink/70">backend v{backendVersion}</span>}
        <span className="flex items-center gap-1.5">
          <span
            className={`h-2 w-2 rounded-full ${connected ? "bg-chat animate-pulse-slow" : "bg-research"}`}
            aria-hidden="true"
          />
          {connected ? "Live" : "Reconnecting..."}
        </span>
        <button
          onClick={toggleTheme}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-line dark:border-dline text-subink dark:text-dsubink transition-colors hover:bg-canvas dark:hover:bg-dline/40"
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>
    </header>
  );
}
