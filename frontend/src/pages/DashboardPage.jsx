import { useEffect, useState } from "react";
import {
  MessageSquare,
  FileStack,
  Bot,
  Clock,
  Activity,
  TrendingUp,
  Library,
  Radar,
  MessagesSquare,
  ShieldCheck,
  HelpCircle,
  Radio,
} from "lucide-react";
import TopBar from "../components/TopBar.jsx";
import { useApp } from "../context/AppContext.jsx";
import { fetchDashboard } from "../utils/api.js";

const AGENT_META = {
  source: { label: "Source Agent", icon: Library, cls: "text-source bg-source-soft dark:bg-source/20" },
  research: { label: "Research Agent", icon: Radar, cls: "text-research bg-research-soft dark:bg-research/20" },
  chat: { label: "Chat Agent", icon: MessagesSquare, cls: "text-chat bg-chat-soft dark:bg-chat/20" },
  verifier: { label: "Citation Verifier", icon: ShieldCheck, cls: "text-verifier bg-verifier-soft dark:bg-verifier/20" },
  quiz: { label: "Quiz Agent", icon: HelpCircle, cls: "text-quiz bg-quiz-soft dark:bg-quiz/20" },
  podcast: { label: "Podcast Agent", icon: Radio, cls: "text-podcast bg-podcast-soft dark:bg-podcast/20" },
};

function StatCard({ icon: Icon, label, value, accent }) {
  return (
    <div className="card p-4 animate-fade-up">
      <div className="flex items-center gap-2.5">
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${accent}`}>
          <Icon size={16} />
        </span>
        <div>
          <p className="text-2xl font-display font-semibold leading-none">{value}</p>
          <p className="mt-1 text-xs text-subink dark:text-dsubink">{label}</p>
        </div>
      </div>
    </div>
  );
}

function timeAgo(ts) {
  if (!ts) return "";
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatDuration(seconds) {
  if (!seconds) return "just started";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

export default function DashboardPage() {
  const { sessionId, statsVersion, sources, conversations } = useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchDashboard(sessionId).then((res) => {
      setData(res);
      setLoading(false);
    });
  }, [sessionId, statsVersion]);

  const maxAgentCount = data ? Math.max(1, ...Object.values(data.agent_invocations || {})) : 1;
  const maxTypeCount = data ? Math.max(1, ...Object.values(data.sources_by_type || {})) : 1;

  return (
    <div className="flex h-full flex-col">
      <TopBar title="Dashboard" subtitle="Live usage analytics for this session" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {loading || !data ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="skeleton h-20" />
            ))}
          </div>
        ) : (
          <div className="mx-auto max-w-6xl space-y-4 sm:space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
              <StatCard icon={FileStack} label="Sources" value={data.total_sources} accent="bg-source-soft text-source dark:bg-source/20" />
              <StatCard icon={MessageSquare} label="Conversations" value={data.total_conversations} accent="bg-chat-soft text-chat dark:bg-chat/20" />
              <StatCard icon={Activity} label="Messages sent" value={data.total_messages} accent="bg-research-soft text-research dark:bg-research/20" />
              <StatCard icon={Bot} label="Chunks embedded" value={data.total_chunks} accent="bg-quiz-soft text-quiz dark:bg-quiz/20" />
            </div>


            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              {/* Agent activity */}
              <div className="card p-5 lg:col-span-2">
                <div className="mb-4 flex items-center gap-2">
                  <TrendingUp size={16} className="text-ink dark:text-dink" />
                  <h3 className="font-display text-sm font-semibold">Agent activity</h3>
                </div>
                {Object.keys(data.agent_invocations || {}).length === 0 ? (
                  <p className="text-xs text-subink dark:text-dsubink">
                    No agent runs yet - ask a question in Chat to see activity here.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(AGENT_META).map(([key, meta]) => {
                      const count = data.agent_invocations?.[key] || 0;
                      if (count === 0 && !data.agent_invocations?.[key]) {
                        // still show the row for context, but skip animation weirdness
                      }
                      const Icon = meta.icon;
                      const pct = Math.round((count / maxAgentCount) * 100);
                      return (
                        <div key={key} className="flex items-center gap-3">
                          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${meta.cls}`}>
                            <Icon size={13} />
                          </span>
                          <span className="w-32 shrink-0 text-xs text-ink dark:text-dink">{meta.label}</span>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-canvas dark:bg-dline/30">
                            <div
                              className={`h-full rounded-full ${meta.cls.split(" ")[0].replace("text-", "bg-")} transition-all duration-500`}
                              style={{ width: `${count ? Math.max(pct, 4) : 0}%` }}
                            />
                          </div>
                          <span className="w-6 shrink-0 text-right text-xs font-medium text-subink dark:text-dsubink">
                            {count}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Session info */}
              <div className="card p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Clock size={16} className="text-ink dark:text-dink" />
                  <h3 className="font-display text-sm font-semibold">Session</h3>
                </div>
                <dl className="space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <dt className="text-subink dark:text-dsubink">Session age</dt>
                    <dd className="font-medium text-ink dark:text-dink">
                      {formatDuration(data.session_age_seconds)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-subink dark:text-dsubink">Last active</dt>
                    <dd className="font-medium text-ink dark:text-dink">{timeAgo(data.last_active) || "now"}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-subink dark:text-dsubink">Uploads</dt>
                    <dd className="font-medium text-ink dark:text-dink">{data.uploads_count}</dd>
                  </div>
                </dl>

                <div className="mt-5 border-t border-line dark:border-dline pt-4">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-subink dark:text-dsubink">
                    Documents by type
                  </p>
                  {Object.keys(data.sources_by_type || {}).length === 0 ? (
                    <p className="text-xs text-subink dark:text-dsubink">No sources yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {Object.entries(data.sources_by_type).map(([type, count]) => (
                        <div key={type} className="flex items-center gap-2">
                          <span className="w-16 shrink-0 text-[11px] capitalize text-ink dark:text-dink">
                            {type.replace("_", " ")}
                          </span>
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-canvas dark:bg-dline/30">
                            <div
                              className="h-full rounded-full bg-source transition-all duration-500"
                              style={{ width: `${Math.max((count / maxTypeCount) * 100, 8)}%` }}
                            />
                          </div>
                          <span className="w-4 text-right text-[11px] text-subink dark:text-dsubink">{count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              {/* Recent activity */}
              <div className="card p-5 lg:col-span-2">
                <h3 className="mb-4 font-display text-sm font-semibold">Recent activity</h3>
                {(data.recent_activity || []).length === 0 ? (
                  <p className="text-xs text-subink dark:text-dsubink">Nothing yet - start a chat to see live agent events here.</p>
                ) : (
                  <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {data.recent_activity.map((event, i) => {
                      const meta = AGENT_META[event.agent] || AGENT_META.chat;
                      const Icon = meta.icon;
                      return (
                        <li key={i} className="flex items-start gap-2.5 text-xs animate-fade-up">
                          <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded ${meta.cls}`}>
                            <Icon size={10} />
                          </span>
                          <span className="flex-1 text-ink dark:text-dink">{event.message}</span>
                          <span className="shrink-0 text-subink dark:text-dsubink">{timeAgo(event.timestamp)}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Uploaded documents */}
              <div className="card p-5">
                <h3 className="mb-4 font-display text-sm font-semibold">Documents</h3>
                {sources.length === 0 ? (
                  <p className="text-xs text-subink dark:text-dsubink">No documents uploaded yet.</p>
                ) : (
                  <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {sources.slice(0, 8).map((s) => (
                      <li key={s.id} className="truncate text-xs text-ink dark:text-dink">
                        {s.name}
                        <span className="ml-1.5 text-subink dark:text-dsubink">· {s.chunk_count} chunks</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {conversations.length > 0 && (
              <div className="card p-5">
                <h3 className="mb-3 font-display text-sm font-semibold">Conversations</h3>
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {conversations.map((c) => (
                    <li key={c.id} className="rounded-lg border border-line dark:border-dline p-3 text-xs">
                      <p className="truncate font-medium text-ink dark:text-dink">{c.title}</p>
                      <p className="mt-1 text-subink dark:text-dsubink">
                        {c.message_count} messages · {timeAgo(c.updated_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
