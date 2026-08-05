export function getApiBaseUrl() {
  const envApi = import.meta.env.VITE_API_BASE_URL;
  if (envApi && envApi.trim()) {
    return envApi.trim().replace(/\/+$/, "");
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
    return await response.json();
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
        resolve(JSON.parse(xhr.responseText));
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
  const response = await fetch(`${API_BASE_URL}/api/sources/url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, url }),
  });
  return asJson(response);
}

export async function addTextSource(sessionId, text, title) {
  const response = await fetch(`${API_BASE_URL}/api/sources/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, text, title }),
  });
  return asJson(response);
}

export async function fetchSources(sessionId) {
  const response = await fetch(`${API_BASE_URL}/api/sources/${encodeURIComponent(sessionId)}`);
  return asJson(response);
}

export async function deleteSource(sessionId, sourceId) {
  const response = await fetch(
    `${API_BASE_URL}/api/sources/${encodeURIComponent(sessionId)}/${encodeURIComponent(sourceId)}`,
    { method: "DELETE" }
  );
  return asJson(response);
}

export async function fetchHealth() {
  const response = await fetch(`${API_BASE_URL}/api/health`);
  return asJson(response);
}

export async function fetchSettings(sessionId) {
  const response = await fetch(
    `${API_BASE_URL}/api/settings${sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : ""}`
  );
  return asJson(response);
}

// --- Conversations (chat management) ---

export async function fetchConversations(sessionId) {
  const response = await fetch(`${API_BASE_URL}/api/conversations/${encodeURIComponent(sessionId)}`);
  return asJson(response);
}

export async function createConversation(sessionId, title) {
  const response = await fetch(`${API_BASE_URL}/api/conversations/${encodeURIComponent(sessionId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: title || null }),
  });
  return asJson(response);
}

export async function fetchConversation(sessionId, convId) {
  const response = await fetch(
    `${API_BASE_URL}/api/conversations/${encodeURIComponent(sessionId)}/${encodeURIComponent(convId)}`
  );
  return asJson(response);
}

export async function renameConversation(sessionId, convId, title) {
  const response = await fetch(
    `${API_BASE_URL}/api/conversations/${encodeURIComponent(sessionId)}/${encodeURIComponent(convId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }
  );
  return asJson(response);
}

export async function deleteConversation(sessionId, convId) {
  const response = await fetch(
    `${API_BASE_URL}/api/conversations/${encodeURIComponent(sessionId)}/${encodeURIComponent(convId)}`,
    { method: "DELETE" }
  );
  return asJson(response);
}

export async function clearConversation(sessionId, convId) {
  const response = await fetch(
    `${API_BASE_URL}/api/conversations/${encodeURIComponent(sessionId)}/${encodeURIComponent(convId)}/clear`,
    { method: "POST" }
  );
  return asJson(response);
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
  const response = await fetch(`${API_BASE_URL}/api/dashboard/${encodeURIComponent(sessionId)}`);
  return asJson(response);
}
