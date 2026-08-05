import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useWebSocket } from "../hooks/useWebSocket.js";
import {
  clearConversation as apiClearConversation,
  createConversation as apiCreateConversation,
  deleteConversation as apiDeleteConversation,
  fetchConversation,
  fetchConversations,
  fetchHealth,
  fetchSources,
  renameConversation as apiRenameConversation,
} from "../utils/api.js";

const AppContext = createContext(null);

function getOrCreateSessionId() {
  const key = "sourcemind_session_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

let logCounter = 0;
let msgCounter = 0;

export function AppProvider({ children }) {
  const [sessionId] = useState(getOrCreateSessionId);

  const [sources, setSources] = useState([]);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [backendVersion, setBackendVersion] = useState(null);

  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const [activeAgent, setActiveAgent] = useState(null);
  const [log, setLog] = useState([]);
  const [thinking, setThinking] = useState(false);

  // Podcast Agent modal state
  const [isPodcastModalOpen, setIsPodcastModalOpen] = useState(false);
  const [isGeneratingPodcast, setIsGeneratingPodcast] = useState(false);
  const [podcastData, setPodcastData] = useState(null);

  // Mobile sidebar drawer state
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const toggleMobileSidebar = useCallback(() => setIsMobileSidebarOpen((v) => !v), []);
  const closeMobileSidebar = useCallback(() => setIsMobileSidebarOpen(false), []);
  const openMobileSidebar = useCallback(() => setIsMobileSidebarOpen(true), []);

  // Bumping this tells the Dashboard page to refetch its stats - simpler
  // than wiring a full pub/sub system for a lightweight in-memory backend.
  const [statsVersion, setStatsVersion] = useState(0);
  const bumpStats = useCallback(() => setStatsVersion((v) => v + 1), []);

  const activeConvIdRef = useRef(activeConvId);
  activeConvIdRef.current = activeConvId;

  const refreshConversations = useCallback(async () => {
    const res = await fetchConversations(sessionId);
    if (res?.conversations) {
      setConversations(res.conversations);
      return res.conversations;
    }
    return [];
  }, [sessionId]);

  const refreshSources = useCallback(async () => {
    setSourcesLoading(true);
    const res = await fetchSources(sessionId);
    if (res?.sources) setSources(res.sources);
    setSourcesLoading(false);
  }, [sessionId]);

  const loadConversation = useCallback(
    async (convId) => {
      setMessagesLoading(true);
      const res = await fetchConversation(sessionId, convId);
      if (res?.messages) {
        setMessages(
          res.messages.map((m) => ({
            id: `${convId}-${msgCounter++}`,
            role: m.role,
            content: m.content,
            timestamp: m.timestamp,
            meta: m.meta,
          }))
        );
      } else {
        setMessages([]);
      }
      setMessagesLoading(false);
    },
    [sessionId]
  );

  const selectConversation = useCallback(
    async (convId) => {
      setActiveConvId(convId);
      await loadConversation(convId);
    },
    [loadConversation]
  );

  const startNewConversation = useCallback(async () => {
    const conv = await apiCreateConversation(sessionId);
    await refreshConversations();
    setActiveConvId(conv.id);
    setMessages([]);
    return conv.id;
  }, [sessionId, refreshConversations]);

  const ensureActiveConversation = useCallback(async () => {
    if (activeConvIdRef.current) return activeConvIdRef.current;
    const existing = await refreshConversations();
    if (existing.length > 0) {
      await selectConversation(existing[0].id);
      return existing[0].id;
    }
    return startNewConversation();
  }, [refreshConversations, selectConversation, startNewConversation]);

  const renameConversationById = useCallback(
    async (convId, title) => {
      await apiRenameConversation(sessionId, convId, title);
      await refreshConversations();
    },
    [sessionId, refreshConversations]
  );

  const deleteConversationById = useCallback(
    async (convId) => {
      await apiDeleteConversation(sessionId, convId);
      const remaining = await refreshConversations();
      if (activeConvIdRef.current === convId) {
        if (remaining.length > 0) {
          await selectConversation(remaining[0].id);
        } else {
          setActiveConvId(null);
          setMessages([]);
        }
      }
      bumpStats();
    },
    [sessionId, refreshConversations, selectConversation, bumpStats]
  );

  const clearActiveConversation = useCallback(async () => {
    if (!activeConvIdRef.current) return;
    await apiClearConversation(sessionId, activeConvIdRef.current);
    setMessages([]);
    await refreshConversations();
    bumpStats();
  }, [sessionId, refreshConversations, bumpStats]);

  const handleEvent = useCallback(
    (data) => {
      if (data.type === "agent_status") {
        const time = new Date((data.timestamp || Date.now() / 1000) * 1000).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
        logCounter += 1;
        setLog((prev) => [
          ...prev.slice(-79),
          { id: logCounter, agent: data.agent, message: data.message, time, stage: data.stage },
        ]);

        if (data.stage === "start" || data.stage === "progress") {
          setActiveAgent(data.agent);
        } else if (data.stage === "done" || data.stage === "error") {
          setActiveAgent((current) => (current === data.agent ? null : current));
        }
      } else if (data.type === "answer") {
        msgCounter += 1;
        setThinking(false);
        setActiveAgent(null);
        if (!data.conv_id || data.conv_id === activeConvIdRef.current) {
          setMessages((prev) => [
            ...prev,
            {
              id: msgCounter,
              role: "assistant",
              content: data.content,
              timestamp: Date.now() / 1000,
              meta: {
                citations: data.citations,
                web_citations: data.web_citations,
                verification: data.verification,
              },
              streaming: true,
            },
          ]);
        }
        refreshConversations();
        bumpStats();
      } else if (data.type === "podcast_generated") {
        msgCounter += 1;
        setThinking(false);
        setActiveAgent(null);
        setIsGeneratingPodcast(false);
        if (data.podcast) {
          setPodcastData(data.podcast);
        }
        setIsPodcastModalOpen(true);
        if (!data.conv_id || data.conv_id === activeConvIdRef.current) {
          setMessages((prev) => [
            ...prev,
            {
              id: msgCounter,
              role: "assistant",
              content: data.content || data.podcast?.transcript || "Podcast generated.",
              timestamp: Date.now() / 1000,
              meta: { podcast: data.podcast },
              streaming: false,
            },
          ]);
        }
        refreshConversations();
        bumpStats();
      }
    },
    [refreshConversations, bumpStats]
  );

  const { connected, sendChat, sendSummarize, sendQuiz, sendPodcast } = useWebSocket(sessionId, handleEvent);

  useEffect(() => {
    refreshSources();
    refreshConversations().then((convs) => {
      if (convs.length > 0) selectConversation(convs[0].id);
    });
    fetchHealth()
      .then((res) => setBackendVersion(res?.version || null))
      .catch(() => setBackendVersion(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSourceAdded(source) {
    setSources((prev) => [...prev, source]);
    bumpStats();
  }

  function handleSourceDeleted(sourceId) {
    setSources((prev) => prev.filter((s) => s.id !== sourceId));
    bumpStats();
  }

  async function handleSend(text) {
    const convId = await ensureActiveConversation();
    msgCounter += 1;
    setMessages((prev) => [
      ...prev,
      { id: msgCounter, role: "user", content: text, timestamp: Date.now() / 1000 },
    ]);
    setThinking(true);
    sendChat(text, convId);
  }

  async function handleRegenerate() {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    const convId = await ensureActiveConversation();
    setThinking(true);
    sendChat(lastUser.content, convId);
  }

  async function handleSummarize() {
    const convId = await ensureActiveConversation();
    msgCounter += 1;
    setMessages((prev) => [
      ...prev,
      { id: msgCounter, role: "user", content: "Summarize all my sources.", timestamp: Date.now() / 1000 },
    ]);
    setThinking(true);
    sendSummarize(convId);
  }

  async function handleQuiz(numQuestions) {
    const convId = await ensureActiveConversation();
    msgCounter += 1;
    setMessages((prev) => [
      ...prev,
      {
        id: msgCounter,
        role: "user",
        content: `Generate a ${numQuestions}-question quiz from my sources.`,
        timestamp: Date.now() / 1000,
      },
    ]);
    setThinking(true);
    sendQuiz(convId, numQuestions);
  }

  function openPodcastModal() {
    setIsPodcastModalOpen(true);
  }

  function closePodcastModal() {
    setIsPodcastModalOpen(false);
  }

  async function handlePodcast(length = "medium", sourceIds = null) {
    const convId = await ensureActiveConversation();
    setIsGeneratingPodcast(true);
    setIsPodcastModalOpen(true);
    setThinking(true);
    sendPodcast(convId, length, sourceIds);
  }

  const value = {
    sessionId,
    backendVersion,
    connected,

    sources,
    sourcesLoading,
    refreshSources,
    handleSourceAdded,
    handleSourceDeleted,

    conversations,
    activeConvId,
    selectConversation,
    startNewConversation,
    renameConversationById,
    deleteConversationById,
    clearActiveConversation,
    refreshConversations,

    messages,
    messagesLoading,
    thinking,
    handleSend,
    handleRegenerate,
    handleSummarize,
    handleQuiz,

    isPodcastModalOpen,
    isGeneratingPodcast,
    podcastData,
    openPodcastModal,
    closePodcastModal,
    handlePodcast,

    isMobileSidebarOpen,
    toggleMobileSidebar,
    closeMobileSidebar,
    openMobileSidebar,

    activeAgent,
    log,

    statsVersion,
    bumpStats,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within an AppProvider");
  return ctx;
}
