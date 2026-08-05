import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Moon, Sun, Trash2, RotateCcw, KeyRound, Cpu, Palette } from "lucide-react";
import TopBar from "../components/TopBar.jsx";
import { useApp } from "../context/AppContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { useSettings } from "../context/SettingsContext.jsx";
import { fetchSettings } from "../utils/api.js";

function SectionCard({ icon: Icon, title, description, children }) {
  return (
    <div className="card p-5 animate-fade-up">
      <div className="mb-1 flex items-center gap-2">
        <Icon size={16} className="text-ink dark:text-dink" />
        <h3 className="font-display text-sm font-semibold">{title}</h3>
      </div>
      {description && <p className="mb-4 text-xs text-subink dark:text-dsubink">{description}</p>}
      <div className={description ? "" : "mt-4"}>{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const { sessionId, sources } = useApp();
  const { theme, setTheme } = useTheme();
  const { settings, updateSettings, resetSettings } = useSettings();
  const [info, setInfo] = useState(null);
  const [clearedNote, setClearedNote] = useState("");

  useEffect(() => {
    fetchSettings(sessionId).then(setInfo);
  }, [sessionId]);

  function handleClearLocalData() {
    localStorage.removeItem("sourcemind_settings");
    localStorage.removeItem("sourcemind_theme");
    resetSettings();
    setClearedNote("Local preferences cleared. (Your sources and chats on the server are untouched.)");
    setTimeout(() => setClearedNote(""), 4000);
  }

  return (
    <div className="flex h-full flex-col">
      <TopBar title="Settings" subtitle="Model, agents, appearance, and cache controls" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-3xl space-y-4 sm:space-y-5">

          <SectionCard icon={Palette} title="Appearance" description="Choose how SourceMind looks on this device.">
            <div className="flex gap-2">
              <button
                onClick={() => setTheme("light")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors ${
                  theme === "light"
                    ? "border-ink bg-canvas text-ink"
                    : "border-line dark:border-dline text-subink dark:text-dsubink hover:bg-canvas dark:hover:bg-dline/30"
                }`}
              >
                <Sun size={15} /> Light
              </button>
              <button
                onClick={() => setTheme("dark")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors ${
                  theme === "dark"
                    ? "border-dink bg-dline/40 text-dink"
                    : "border-line dark:border-dline text-subink dark:text-dsubink hover:bg-canvas dark:hover:bg-dline/30"
                }`}
              >
                <Moon size={15} /> Dark
              </button>
            </div>
          </SectionCard>

          <SectionCard
            icon={Cpu}
            title="Model"
            description="Applies to new messages you send from the Chat page."
          >
            <div>
              <label className="mb-1.5 block text-xs font-medium text-subink dark:text-dsubink">
                Gemini model
              </label>
              <select
                value={settings.model}
                onChange={(e) => updateSettings({ model: e.target.value })}
                className="input-field"
              >
                <option value="">
                  Default {info?.default_model ? `(${info.default_model})` : ""}
                </option>
                {(info?.available_models || []).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-[11px] text-subink dark:text-dsubink">
                Model selection is stored locally for a future request - the current backend always
                answers with its configured default model per agent.
              </p>
            </div>
          </SectionCard>

          <SectionCard
            icon={KeyRound}
            title="Agents & API keys"
            description="Each agent uses its own Gemini API key, configured in the backend's .env file."
          >
            {!info ? (
              <div className="space-y-2">
                <div className="skeleton h-9 w-full" />
                <div className="skeleton h-9 w-full" />
              </div>
            ) : (
              <ul className="divide-y divide-line dark:divide-dline">
                {info.agents.map((agent) => (
                  <li key={agent.name} className="flex items-center justify-between py-2.5 text-sm">
                    <div>
                      <p className="font-medium capitalize text-ink dark:text-dink">{agent.name} agent</p>
                      <p className="text-[11px] text-subink dark:text-dsubink">
                        {agent.has_own_key
                          ? "Using its own dedicated key"
                          : agent.configured
                          ? "Falling back to the Chat Agent's key"
                          : "No key configured"}
                        {" · "}
                        {agent.invocation_count} run{agent.invocation_count === 1 ? "" : "s"} this session
                      </p>
                    </div>
                    {agent.configured ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 size={14} /> Ready
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-medium text-subink dark:text-dsubink">
                        <XCircle size={14} /> Not set
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[11px] text-subink dark:text-dsubink">
              For security, API key values are never sent to or editable from the browser - manage them
              in <code className="rounded bg-canvas dark:bg-dpanel2 px-1 py-0.5 font-mono">backend/.env</code>.
            </p>
          </SectionCard>

          <SectionCard icon={Trash2} title="Data & cache" description="This session's data, stored locally in your browser and on this backend.">
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-line dark:border-dline px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-ink dark:text-dink">Local preferences</p>
                  <p className="text-[11px] text-subink dark:text-dsubink">Theme, model, and language choices stored in this browser.</p>
                </div>
                <button onClick={handleClearLocalData} className="btn-secondary !py-1.5 !text-xs">
                  <RotateCcw size={12} /> Reset
                </button>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-line dark:border-dline px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-ink dark:text-dink">Session ID</p>
                  <p className="text-[11px] text-subink dark:text-dsubink font-mono">{sessionId}</p>
                </div>
                <span className="text-[11px] text-subink dark:text-dsubink">{sources.length} sources</span>
              </div>
              {clearedNote && (
                <p className="animate-fade-up text-xs text-chat">{clearedNote}</p>
              )}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
