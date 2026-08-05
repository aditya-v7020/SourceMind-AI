import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, User, Bot, Copy, Check, RotateCcw, Trash2, HelpCircle, ShieldCheck, ShieldAlert, ShieldQuestion, Radio } from "lucide-react";
import Markdown from "../utils/markdown.jsx";
import TypingReveal from "./TypingReveal.jsx";
import PodcastModal from "./PodcastModal.jsx";
import { useApp } from "../context/AppContext.jsx";


function formatTime(ts) {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const VERIFICATION_STYLES = {
  "fully supported": { icon: ShieldCheck, cls: "text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400" },
  "partially supported": { icon: ShieldAlert, cls: "text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400" },
  "not supported": { icon: ShieldAlert, cls: "text-red-600 bg-red-50 dark:bg-red-500/10 dark:text-red-400" },
};

function VerificationBadge({ verification }) {
  if (!verification?.status) return null;
  const key = verification.status.toLowerCase();
  const style = VERIFICATION_STYLES[key] || {
    icon: ShieldQuestion,
    cls: "text-subink bg-canvas dark:bg-dline/30 dark:text-dsubink",
  };
  const Icon = style.icon;
  return (
    <span className={`chip ${style.cls}`} title={verification.note || ""}>
      <Icon size={11} />
      {verification.status}
    </span>
  );
}

function MessageBubble({ msg, isLastAssistant, onRegenerate }) {
  const [copied, setCopied] = useState(false);
  const [typingDone, setTypingDone] = useState(!msg.streaming);
  const isUser = msg.role === "user";
  const citations = msg.meta?.citations || [];
  const webCitations = msg.meta?.web_citations || [];
  const verification = msg.meta?.verification;

  function handleCopy() {
    navigator.clipboard?.writeText(msg.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className={`group flex gap-3 animate-fade-up ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isUser ? "bg-ink text-white dark:bg-dink dark:text-dcanvas" : "bg-chat-soft text-chat dark:bg-chat/20"
        }`}
      >
        {isUser ? <User size={15} /> : <Bot size={15} />}
      </div>
      <div className={`flex flex-col gap-1 ${isUser ? "items-end" : "items-start"} max-w-[85%]`}>
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isUser
              ? "bg-ink text-white dark:bg-dink dark:text-dcanvas"
              : "border border-line dark:border-dline bg-panel dark:bg-dpanel text-ink dark:text-dink"
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{msg.content}</p>
          ) : msg.streaming ? (
            <TypingReveal text={msg.content} enabled={!typingDone} onDone={() => setTypingDone(true)} />
          ) : (
            <Markdown text={msg.content} />
          )}
        </div>

        {!isUser && (citations.length > 0 || webCitations.length > 0 || verification) && typingDone && (
          <div className="flex flex-wrap items-center gap-1.5 px-1">
            <VerificationBadge verification={verification} />
            {citations.map((c) => (
              <span key={c} className="chip bg-source-soft text-source dark:bg-source/20">
                {c}
              </span>
            ))}
            {webCitations.map((w) => (
              <a
                key={w.url}
                href={w.url}
                target="_blank"
                rel="noreferrer"
                className="chip bg-research-soft text-research dark:bg-research/20 hover:opacity-80"
              >
                {w.title?.slice(0, 28) || w.url}
              </a>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 px-1 text-[11px] text-subink dark:text-dsubink opacity-0 transition-opacity group-hover:opacity-100">
          <span>{formatTime(msg.timestamp)}</span>
          {!isUser && typingDone && (
            <>
              <button onClick={handleCopy} className="flex items-center gap-1 hover:text-ink dark:hover:text-dink">
                {copied ? <Check size={11} /> : <Copy size={11} />}
                {copied ? "Copied" : "Copy"}
              </button>
              {isLastAssistant && (
                <button onClick={onRegenerate} className="flex items-center gap-1 hover:text-ink dark:hover:text-dink">
                  <RotateCcw size={11} />
                  Regenerate
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ChatPanel() {
  const {
    connected,
    sources,
    messages,
    messagesLoading,
    thinking,
    handleSend,
    handleRegenerate,
    handleSummarize,
    handleQuiz,
    openPodcastModal,
    closePodcastModal,
    isPodcastModalOpen,
    isGeneratingPodcast,
    podcastData,
    clearActiveConversation,
  } = useApp();
  const [input, setInput] = useState("");
  const scrollRef = useRef(null);
  const sourcesCount = sources.length;

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, thinking]);

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || thinking) return;
    handleSend(trimmed);
    setInput("");
  }

  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line dark:border-dline px-3 sm:px-5 py-2.5 sm:py-3.5">
        <div className="min-w-0">
          <h2 className="font-display text-base sm:text-lg font-semibold tracking-tight truncate">Chat with your sources</h2>
          <p className="mt-0.5 text-xs text-subink dark:text-dsubink">
            {connected ? "Connected" : "Connecting..."} · {sourcesCount} source
            {sourcesCount === 1 ? "" : "s"} loaded
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button
            onClick={openPodcastModal}
            disabled={thinking || sourcesCount === 0}
            className="btn-secondary !px-2.5 sm:!px-3 !py-1.5 sm:!py-2 !text-xs"
          >
            <Radio size={14} className="text-podcast" />
            <span className="hidden xs:inline">Podcast</span>
          </button>
          <button
            onClick={() => handleQuiz(5)}
            disabled={thinking || sourcesCount === 0}
            className="btn-secondary !px-2.5 sm:!px-3 !py-1.5 sm:!py-2 !text-xs"
          >
            <HelpCircle size={14} className="text-quiz" />
            <span className="hidden xs:inline">Quiz</span>
          </button>
          <button
            onClick={handleSummarize}
            disabled={thinking || sourcesCount === 0}
            className="btn-secondary !px-2.5 sm:!px-3 !py-1.5 sm:!py-2 !text-xs"
          >
            <Sparkles size={14} className="text-chat" />
            <span className="hidden xs:inline">Summarize</span>
          </button>
          <button
            onClick={clearActiveConversation}
            disabled={messages.length === 0}
            className="btn-ghost !px-1.5 !py-1.5"
            title="Clear chat"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>


      <div className="flex-1 overflow-y-auto px-5 py-4">
        {messagesLoading ? (
          <div className="flex flex-col gap-4">
            <div className="skeleton h-14 w-2/3" />
            <div className="skeleton h-10 w-1/2 self-end" />
            <div className="skeleton h-20 w-3/4" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-subink dark:text-dsubink">
            <Bot size={28} className="text-chat" />
            <p className="max-w-sm text-sm">
              Add a source on the left, then ask a question here. Watch the workflow panel on the
              right to see the agents work in real time.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                isLastAssistant={msg.id === lastAssistantId}
                onRegenerate={handleRegenerate}
              />
            ))}
            {thinking && (
              <div className="flex gap-3 animate-fade-up">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-chat-soft text-chat dark:bg-chat/20">
                  <Bot size={15} />
                </div>
                <div className="flex items-center gap-1 rounded-2xl border border-line dark:border-dline bg-panel dark:bg-dpanel px-4 py-3">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-subink dark:bg-dsubink [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-subink dark:bg-dsubink [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-subink dark:bg-dsubink" />
                </div>
              </div>
            )}
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-line dark:border-dline px-4 py-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={sourcesCount === 0 ? "Add a source first, or just ask anything..." : "Ask a question about your sources..."}
          disabled={thinking}
          className="input-field flex-1"
        />
        <button
          type="submit"
          disabled={thinking || !input.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-chat text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send size={16} />
        </button>
      </form>

      <PodcastModal
        isOpen={isPodcastModalOpen}
        onClose={closePodcastModal}
        podcastData={podcastData}
        isGenerating={isGeneratingPodcast}
      />
    </div>
  );
}

