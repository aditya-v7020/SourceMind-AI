export function getApiBaseUrl() {
  const envApi = import.meta.env.VITE_API_BASE_URL;
  if (envApi && envApi.trim()) {
    let url = envApi.trim().replace(/\/+$/, "");
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      const isHttps = typeof window !== "undefined" && window.location && window.location.protocol === "https:";
      return isHttps ? `https://${url}` : `http://${url}`;
    }
    return url;
  }
  if (typeof window !== "undefined" && window.location && window.location.protocol === "https:") {
    return "https://sourcemind-ai-9a1p.onrender.com";
  }
  return "http://localhost:8000";
}

export function getWsBaseUrl() {
  const envWs = import.meta.env.VITE_WS_BASE_URL;
  if (envWs && envWs.trim()) {
    let url = envWs.trim().replace(/\/+$/, "");
    if (url.startsWith("https://")) return url.replace(/^https:\/\//i, "wss://");
    if (url.startsWith("http://")) return url.replace(/^http:\/\//i, "ws://");
    if (!url.startsWith("ws://") && !url.startsWith("wss://")) {
      const isHttps = typeof window !== "undefined" && window.location && window.location.protocol === "https:";
      return isHttps ? `wss://${url}` : `ws://${url}`;
    }
    return url;
  }

  const apiBase = getApiBaseUrl();
  if (apiBase.startsWith("https://")) {
    return apiBase.replace(/^https:\/\//i, "wss://");
  }
  if (apiBase.startsWith("http://")) {
    return apiBase.replace(/^http:\/\//i, "ws://");
  }

  if (typeof window !== "undefined" && window.location && window.location.protocol === "https:") {
    return "wss://sourcemind-ai-9a1p.onrender.com";
  }

  return "ws://localhost:8000";
}

export const API_BASE_URL = getApiBaseUrl();

async function asJson(response) {
  try {
    const data = await response.json();
    if (!response.ok && data && typeof data === "object") {
      if (!data.message && data.detail) {
        data.message = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
      }
    }
    return data;
  } catch {
    return { success: false, message: `Unexpected response (${response.status}).` };
  }
}

// --- Sources ---

/** Uploads a file with real progress events (XHR, since fetch() doesn't
 * expose upload progress) - powers the Document Management progress bar. */
export function uploadFileWithProgress(sessionId, file, onProgress) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `${API_BASE_URL}/api/sources/upload?session_id=${encodeURIComponent(sessionId)}`
    );

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 400 && data && typeof data === "object") {
          if (!data.message && data.detail) {
            data.message = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
          }
        }
        resolve(data);
      } catch {
        resolve({ success: false, message: `Upload failed (${xhr.status}).` });
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.send(formData);
  });
}

export async function uploadFile(sessionId, file) {
  return uploadFileWithProgress(sessionId, file, null);
}

export async function addUrlSource(sessionId, url) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/sources/url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, url }),
    });
    return await asJson(response);
  } catch (err) {
    return { success: false, message: err.message || "Network error adding URL." };
  }
}

export async function addTextSource(sessionId, text, title) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/sources/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, text, title }),
    });
    return await asJson(response);
  } catch (err) {
    return { success: false, message: err.message || "Network error adding text." };
  }
}

export async function fetchSources(sessionId) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/sources/${encodeURIComponent(sessionId)}`);
    return await asJson(response);
  } catch {
    return { sources: [] };
  }
}

export async function deleteSource(sessionId, sourceId) {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/sources/${encodeURIComponent(sessionId)}/${encodeURIComponent(sourceId)}`,
      { method: "DELETE" }
    );
    return await asJson(response);
  } catch (err) {
    return { success: false, message: err.message || "Network error deleting source." };
  }
}

export async function fetchHealth() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/health`);
    return await asJson(response);
  } catch {
    return { status: "offline", version: null };
  }
}

export async function fetchSettings(sessionId) {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/settings${sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : ""}`
    );
    return await asJson(response);
  } catch (err) {
    return {
      agents: [],
      available_models: ["gemini-3.6-flash", "gemini-3.7-flash", "gemini-flash-latest"],
      default_model: "gemini-3.6-flash",
      features: { citation_verifier: true },
      error: err.message,
    };
  }
}

// --- Conversations (chat management) ---

export async function fetchConversations(sessionId) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/conversations/${encodeURIComponent(sessionId)}`);
    return await asJson(response);
  } catch {
    return { conversations: [] };
  }
}

export async function createConversation(sessionId, title) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/conversations/${encodeURIComponent(sessionId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title || null }),
    });
    return await asJson(response);
  } catch {
    return { id: "conv_fallback", title: "New chat", created_at: Date.now() / 1000, updated_at: Date.now() / 1000, message_count: 0 };
  }
}

export async function fetchConversation(sessionId, convId) {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/conversations/${encodeURIComponent(sessionId)}/${encodeURIComponent(convId)}`
    );
    return await asJson(response);
  } catch {
    return { messages: [] };
  }
}

export async function renameConversation(sessionId, convId, title) {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/conversations/${encodeURIComponent(sessionId)}/${encodeURIComponent(convId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      }
    );
    return await asJson(response);
  } catch {
    return { success: false };
  }
}

export async function deleteConversation(sessionId, convId) {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/conversations/${encodeURIComponent(sessionId)}/${encodeURIComponent(convId)}`,
      { method: "DELETE" }
    );
    return await asJson(response);
  } catch {
    return { success: false };
  }
}

export async function clearConversation(sessionId, convId) {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/conversations/${encodeURIComponent(sessionId)}/${encodeURIComponent(convId)}/clear`,
      { method: "POST" }
    );
    return await asJson(response);
  } catch {
    return { success: false };
  }
}

export function exportConversationUrl(sessionId, convId, format) {
  return `${API_BASE_URL}/api/conversations/${encodeURIComponent(sessionId)}/${encodeURIComponent(
    convId
  )}/export?format=${format}`;
}

export async function downloadConversationExport(sessionId, convId, format, filenameFallback) {
  const response = await fetch(exportConversationUrl(sessionId, convId, format));
  if (!response.ok) throw new Error("Export failed.");
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  const match = /filename="(.+?)"/.exec(disposition);
  const filename = match ? match[1] : filenameFallback;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// --- Dashboard ---

export async function fetchDashboard(sessionId) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/dashboard/${encodeURIComponent(sessionId)}`);
    return await asJson(response);
  } catch (err) {
    return {
      total_sources: 0,
      total_chunks: 0,
      total_conversations: 0,
      total_messages: 0,
      uploads_count: 0,
      agent_invocations: {},
      recent_activity: [],
      sources_by_type: {},
      session_age_seconds: 0,
      last_active: null,
      error: err.message,
    };
  }
}

