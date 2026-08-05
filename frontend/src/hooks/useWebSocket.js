import { useCallback, useEffect, useRef, useState } from "react";
import { getWsBaseUrl } from "../utils/api.js";

/**
 * Connects to the backend's per-session WebSocket and exposes:
 *  - connected: boolean connection status
 *  - sendChat(message): send a chat message to be processed by the agent graph
 *  - sendSummarize(): ask the chat agent to summarize all sources
 *
 * Reconnects automatically with a short backoff if the connection drops.
 */
export function useWebSocket(sessionId, onEvent) {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);
  const onEventRef = useRef(onEvent);
  const reconnectTimer = useRef(null);

  onEventRef.current = onEvent;

  useEffect(() => {
    if (!sessionId) return undefined;

    let cancelled = false;
    let pingTimer = null;

    function connect() {
      if (cancelled) return;
      const wsBase = getWsBaseUrl();
      const socket = new WebSocket(`${wsBase}/ws/${sessionId}`);
      socketRef.current = socket;

      socket.onopen = () => {
        setConnected(true);
        pingTimer = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "ping" }));
          }
        }, 25000);
      };

      socket.onclose = () => {
        setConnected(false);
        if (pingTimer) clearInterval(pingTimer);
        if (!cancelled) {
          reconnectTimer.current = setTimeout(connect, 1500);
        }
      };

      socket.onerror = () => {
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "pong") return;
          onEventRef.current?.(data);
        } catch {
          // ignore malformed frames
        }
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (pingTimer) clearInterval(pingTimer);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      socketRef.current?.close();
    };
  }, [sessionId]);

  const send = useCallback((payload) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }, []);

  const sendChat = useCallback((message, convId) => send({ type: "chat", message, conv_id: convId }), [send]);
  const sendSummarize = useCallback((convId) => send({ type: "summarize", conv_id: convId }), [send]);
  const sendQuiz = useCallback(
    (convId, numQuestions) => send({ type: "quiz", conv_id: convId, num_questions: numQuestions || 5 }),
    [send]
  );
  const sendPodcast = useCallback(
    (convId, length, sourceIds) =>
      send({ type: "podcast", conv_id: convId, length: length || "medium", source_ids: sourceIds }),
    [send]
  );

  return { connected, sendChat, sendSummarize, sendQuiz, sendPodcast };
}
