import { useEffect, useRef } from "react";
import { Library, Radar, MessagesSquare, Loader2, ShieldCheck, HelpCircle, Radio } from "lucide-react";

const AGENTS = [
  { id: "source", label: "Source Agent", sub: "Reads & retrieves your sources", icon: Library, color: "source" },
  { id: "research", label: "Research Agent", sub: "Searches the live web", icon: Radar, color: "research" },
  { id: "chat", label: "Chat Agent", sub: "Writes the grounded answer", icon: MessagesSquare, color: "chat" },
  { id: "verifier", label: "Citation Verifier", sub: "Fact-checks the answer", icon: ShieldCheck, color: "verifier" },
  { id: "quiz", label: "Quiz Agent", sub: "Turns sources into practice questions", icon: HelpCircle, color: "quiz" },
  { id: "podcast", label: "Podcast Agent", sub: "Generates 2-speaker audio podcasts", icon: Radio, color: "podcast" },
];

const COLOR_CLASSES = {
  source: { text: "text-source", bg: "bg-source", soft: "bg-source-soft", ring: "ring-source" },
  research: { text: "text-research", bg: "bg-research", soft: "bg-research-soft", ring: "ring-research" },
  chat: { text: "text-chat", bg: "bg-chat", soft: "bg-chat-soft", ring: "ring-chat" },
  quiz: { text: "text-quiz", bg: "bg-quiz", soft: "bg-quiz-soft", ring: "ring-quiz" },
  verifier: { text: "text-verifier", bg: "bg-verifier", soft: "bg-verifier-soft", ring: "ring-verifier" },
  podcast: { text: "text-podcast", bg: "bg-podcast", soft: "bg-podcast-soft", ring: "ring-podcast" },
};

export default function WorkflowPanel({ activeAgent, log }) {
  const logEndRef = useRef(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [log]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line dark:border-dline px-5 py-4">
        <h2 className="font-display text-lg font-semibold tracking-tight">Agent workflow</h2>
        <p className="mt-0.5 text-sm text-subink dark:text-dsubink">6 independent agents, own API keys, hybrid pipeline.</p>
      </div>

      {/* Signature element: the pipeline rail */}
      <div className="overflow-y-auto px-5 py-6" style={{ maxHeight: "52%" }}>
        <div className="relative flex flex-col gap-5 pl-2">
          <div className="absolute left-[19px] top-2 bottom-2 w-px bg-line dark:bg-dline" aria-hidden="true" />
          {AGENTS.map((agent, idx) => {
            const isActive = activeAgent === agent.id;
            const c = COLOR_CLASSES[agent.color];
            const Icon = agent.icon;
            return (
              <div key={agent.id} className="relative flex items-center gap-3">
                <div
                  className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 bg-panel dark:bg-dpanel transition-all ${
                    isActive ? `${c.ring} border-transparent ring-2` : "border-line dark:border-dline"
                  }`}
                >
                  {isActive && (
                    <span
                      className={`absolute h-full w-full rounded-full ${c.bg} opacity-20 animate-ping`}
                      aria-hidden="true"
                    />
                  )}
                  <Icon size={15} className={isActive ? c.text : "text-subink dark:text-dsubink"} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-[13px] font-semibold ${isActive ? c.text : "text-ink dark:text-dink"}`}>
                      {agent.label}
                    </p>
                    {isActive && <Loader2 size={12} className={`animate-spin ${c.text}`} />}
                  </div>
                  <p className="truncate text-[11px] text-subink dark:text-dsubink">{agent.sub}</p>
                </div>
                {idx < AGENTS.length - 1 && (
                  <div className="absolute left-[19px] top-9 h-5 w-px overflow-hidden">
                    {isActive && (
                      <span className={`block h-2 w-2 -translate-x-1/2 rounded-full ${c.bg} animate-travel`} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Live activity log */}
      <div className="flex-1 overflow-y-auto border-t border-line dark:border-dline bg-canvas/60 dark:bg-dcanvas/40 px-5 py-4">
        <h3 className="mb-3 font-mono text-[11px] uppercase tracking-wider text-subink dark:text-dsubink">
          Activity log
        </h3>
        {log.length === 0 ? (
          <p className="text-sm text-subink dark:text-dsubink">Agent activity will appear here as it happens.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {log.map((entry) => {
              const c = COLOR_CLASSES[entry.agent] || COLOR_CLASSES.chat;
              return (
                <li key={entry.id} className="flex gap-2 text-sm animate-fade-up">
                  <span className="mt-0.5 shrink-0 font-mono text-[10px] text-subink dark:text-dsubink">
                    {entry.time}
                  </span>
                  <span className={`shrink-0 font-mono text-[10px] font-medium uppercase ${c.text}`}>
                    {entry.agent}
                  </span>
                  <span className={`text-ink dark:text-dink ${entry.stage === "error" ? "text-red-500" : ""}`}>
                    {entry.message}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <div ref={logEndRef} />
      </div>
    </div>
  );
}
