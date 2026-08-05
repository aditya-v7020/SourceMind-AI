import { useState } from "react";
import { MessageSquare, Library, Activity, Loader2 } from "lucide-react";
import SourcePanel from "../components/SourcePanel.jsx";
import ChatPanel from "../components/ChatPanel.jsx";
import WorkflowPanel from "../components/WorkflowPanel.jsx";
import TopBar from "../components/TopBar.jsx";
import { useApp } from "../context/AppContext.jsx";

export default function ChatPage() {
  const { activeAgent, log, sources } = useApp();
  const [activeTab, setActiveTab] = useState("chat"); // "sources" | "chat" | "workflow"

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TopBar title="Chat" subtitle="Ask questions grounded in your uploaded sources" />

      {/* Mobile View Switcher (<1024px screens) */}
      <div className="flex border-b border-line dark:border-dline bg-panel dark:bg-dpanel px-2 py-1.5 lg:hidden shrink-0">
        <button
          onClick={() => setActiveTab("sources")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-colors ${
            activeTab === "sources"
              ? "bg-canvas dark:bg-dline/40 text-ink dark:text-dink font-semibold"
              : "text-subink dark:text-dsubink hover:text-ink"
          }`}
        >
          <Library size={14} />
          Sources
          {sources.length > 0 && (
            <span className="rounded-full bg-source-soft text-source dark:bg-source/20 px-1.5 py-0.2 text-[10px] font-bold">
              {sources.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("chat")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-colors ${
            activeTab === "chat"
              ? "bg-canvas dark:bg-dline/40 text-ink dark:text-dink font-semibold"
              : "text-subink dark:text-dsubink hover:text-ink"
          }`}
        >
          <MessageSquare size={14} />
          Chat
        </button>

        <button
          onClick={() => setActiveTab("workflow")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-colors relative ${
            activeTab === "workflow"
              ? "bg-canvas dark:bg-dline/40 text-ink dark:text-dink font-semibold"
              : "text-subink dark:text-dsubink hover:text-ink"
          }`}
        >
          <Activity size={14} />
          Workflow
          {activeAgent && (
            <span className="flex h-2 w-2 rounded-full bg-chat animate-ping" />
          )}
        </button>
      </div>

      {/* Main Content Area */}
      <main className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[300px_1fr_320px]">
        {/* Source Panel section */}
        <section
          className={`overflow-hidden border-r border-line dark:border-dline bg-panel dark:bg-dpanel ${
            activeTab === "sources" ? "block" : "hidden"
          } lg:block`}
        >
          <SourcePanel />
        </section>

        {/* Chat Panel section */}
        <section
          className={`overflow-hidden bg-canvas dark:bg-dcanvas ${
            activeTab === "chat" ? "block" : "hidden"
          } lg:block`}
        >
          <ChatPanel />
        </section>

        {/* Workflow Panel section */}
        <section
          className={`overflow-hidden border-l border-line dark:border-dline bg-panel dark:bg-dpanel ${
            activeTab === "workflow" ? "block" : "hidden"
          } lg:block`}
        >
          <WorkflowPanel activeAgent={activeAgent} log={log} />
        </section>
      </main>
    </div>
  );
}

