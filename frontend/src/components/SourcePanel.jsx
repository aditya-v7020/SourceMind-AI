import { useMemo, useRef, useState } from "react";
import {
  FileText,
  Globe,
  Type,
  Upload,
  Link as LinkIcon,
  Search,
  X,
  Trash2,
  Eye,
  Plus,
  Loader2,
  FileUp,
} from "lucide-react";
import { addTextSource, addUrlSource, deleteSource, uploadFileWithProgress } from "../utils/api.js";
import { useApp } from "../context/AppContext.jsx";

const TYPE_META = {
  pdf: { icon: FileText, label: "PDF", cls: "text-source bg-source-soft dark:bg-source/20" },
  text_file: { icon: FileText, label: "Text file", cls: "text-chat bg-chat-soft dark:bg-chat/20" },
  url: { icon: Globe, label: "URL", cls: "text-research bg-research-soft dark:bg-research/20" },
  plain_text: { icon: Type, label: "Pasted text", cls: "text-quiz bg-quiz-soft dark:bg-quiz/20" },
};
const TYPE_FILTERS = [
  { id: "all", label: "All" },
  { id: "pdf", label: "PDFs" },
  { id: "text_file", label: "Text files" },
  { id: "url", label: "URLs" },
  { id: "plain_text", label: "Pasted" },
];

function AddSourceMenu({ sessionId, onSourceAdded, onUploadStart, onUploadProgress, onUploadEnd }) {
  const [mode, setMode] = useState(null); // null | "url" | "text"
  const [url, setUrl] = useState("");
  const [textTitle, setTextTitle] = useState("");
  const [textBody, setTextBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  async function handleFiles(files) {
    setError("");
    for (const file of Array.from(files)) {
      onUploadStart(file.name);
      try {
        const res = await uploadFileWithProgress(sessionId, file, (pct) => onUploadProgress(file.name, pct));
        if (res.success) {
          onSourceAdded(res.source);
        } else {
          setError(res.message || res.detail || `Failed to add '${file.name}'.`);
        }
      } catch {
        setError(`Failed to upload '${file.name}'.`);
      } finally {
        onUploadEnd(file.name);
      }
    }
  }

  async function handleUrlSubmit(e) {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setError("");
    const res = await addUrlSource(sessionId, url.trim());
    setBusy(false);
    if (res.success) {
      onSourceAdded(res.source);
      setUrl("");
      setMode(null);
    } else {
      setError(res.message || "Failed to add URL.");
    }
  }

  async function handleTextSubmit(e) {
    e.preventDefault();
    if (!textBody.trim()) return;
    setBusy(true);
    setError("");
    const res = await addTextSource(sessionId, textBody.trim(), textTitle.trim() || "Pasted text");
    setBusy(false);
    if (res.success) {
      onSourceAdded(res.source);
      setTextBody("");
      setTextTitle("");
      setMode(null);
    } else {
      setError(res.message || "Failed to add text.");
    }
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        className="flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-line dark:border-dline bg-canvas/50 dark:bg-dpanel2/50 px-4 py-6 text-center transition-colors hover:border-ink/30 dark:hover:border-dink/30 hover:bg-canvas dark:hover:bg-dline/20"
      >
        <FileUp size={20} className="text-subink dark:text-dsubink" />
        <p className="text-xs font-medium text-ink dark:text-dink">Drag & drop, or click to upload</p>
        <p className="text-[11px] text-subink dark:text-dsubink">PDF or .txt files</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,text/plain,application/pdf"
          multiple
          className="hidden"
          onChange={(e) => e.target.files?.length && handleFiles(e.target.files)}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setMode(mode === "url" ? null : "url")}
          className={`btn-secondary !justify-start !text-xs ${mode === "url" ? "ring-2 ring-ink/10" : ""}`}
        >
          <LinkIcon size={13} /> Add URL
        </button>
        <button
          onClick={() => setMode(mode === "text" ? null : "text")}
          className={`btn-secondary !justify-start !text-xs ${mode === "text" ? "ring-2 ring-ink/10" : ""}`}
        >
          <Type size={13} /> Paste text
        </button>
      </div>

      {mode === "url" && (
        <form onSubmit={handleUrlSubmit} className="animate-fade-up space-y-1.5 rounded-xl border border-line dark:border-dline p-2.5">
          <input
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/article"
            className="input-field !py-2 !text-xs"
          />
          <button type="submit" disabled={busy || !url.trim()} className="btn-primary w-full !py-1.5 !text-xs">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add source
          </button>
        </form>
      )}

      {mode === "text" && (
        <form onSubmit={handleTextSubmit} className="animate-fade-up space-y-1.5 rounded-xl border border-line dark:border-dline p-2.5">
          <input
            autoFocus
            value={textTitle}
            onChange={(e) => setTextTitle(e.target.value)}
            placeholder="Title (optional)"
            className="input-field !py-2 !text-xs"
          />
          <textarea
            value={textBody}
            onChange={(e) => setTextBody(e.target.value)}
            placeholder="Paste your text here..."
            rows={4}
            className="input-field !py-2 !text-xs resize-none"
          />
          <button type="submit" disabled={busy || !textBody.trim()} className="btn-primary w-full !py-1.5 !text-xs">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add source
          </button>
        </form>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

function PreviewModal({ source, onClose }) {
  if (!source) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6 animate-fade-in" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-lg animate-scale-in overflow-y-auto rounded-2xl border border-line dark:border-dline bg-panel dark:bg-dpanel p-5 shadow-floating"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="font-display text-sm font-semibold">{source.name}</h3>
          <button onClick={onClose} className="btn-ghost !px-1.5 !py-1">
            <X size={14} />
          </button>
        </div>
        <p className="mb-3 text-[11px] text-subink dark:text-dsubink">
          {source.chunk_count} chunks · {source.char_count.toLocaleString()} characters
        </p>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink dark:text-dink">{source.preview}...</p>
      </div>
    </div>
  );
}

export default function SourcePanel() {
  const { sessionId, sources, sourcesLoading, handleSourceAdded, handleSourceDeleted } = useApp();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [uploads, setUploads] = useState({}); // filename -> progress percent
  const [previewSource, setPreviewSource] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  function onUploadStart(name) {
    setUploads((prev) => ({ ...prev, [name]: 0 }));
  }
  function onUploadProgress(name, pct) {
    setUploads((prev) => ({ ...prev, [name]: pct }));
  }
  function onUploadEnd(name) {
    setUploads((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  async function confirmDelete(source) {
    const res = await deleteSource(sessionId, source.id);
    if (res.success) handleSourceDeleted(source.id);
    setPendingDelete(null);
  }

  const filteredSources = useMemo(() => {
    return sources.filter((s) => {
      if (typeFilter !== "all" && s.type !== typeFilter) return false;
      if (search.trim() && !s.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    });
  }, [sources, typeFilter, search]);

  const uploadEntries = Object.entries(uploads);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line dark:border-dline px-5 py-4">
        <h2 className="font-display text-lg font-semibold tracking-tight">Sources</h2>
        <p className="mt-0.5 text-sm text-subink dark:text-dsubink">
          {sources.length} document{sources.length === 1 ? "" : "s"} loaded
        </p>
      </div>

      <div className="border-b border-line dark:border-dline px-4 py-4">
        <AddSourceMenu
          sessionId={sessionId}
          onSourceAdded={handleSourceAdded}
          onUploadStart={onUploadStart}
          onUploadProgress={onUploadProgress}
          onUploadEnd={onUploadEnd}
        />
      </div>

      {uploadEntries.length > 0 && (
        <div className="space-y-1.5 border-b border-line dark:border-dline px-4 py-3">
          {uploadEntries.map(([name, pct]) => (
            <div key={name} className="animate-fade-up">
              <div className="mb-1 flex items-center justify-between text-[11px] text-subink dark:text-dsubink">
                <span className="flex items-center gap-1 truncate">
                  <Upload size={10} /> {name}
                </span>
                <span>{pct}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-line dark:bg-dline">
                <div className="h-full rounded-full bg-chat transition-all duration-200" style={{ width: `${pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {sources.length > 0 && (
        <div className="space-y-2 border-b border-line dark:border-dline px-4 py-3">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-subink dark:text-dsubink" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search sources..."
              className="input-field !py-1.5 !pl-8 !text-xs"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TYPE_FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setTypeFilter(f.id)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  typeFilter === f.id
                    ? "bg-ink text-white dark:bg-dink dark:text-dcanvas"
                    : "bg-canvas dark:bg-dline/30 text-subink dark:text-dsubink hover:text-ink dark:hover:text-dink"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {sourcesLoading ? (
          <div className="space-y-2">
            <div className="skeleton h-16 w-full" />
            <div className="skeleton h-16 w-full" />
          </div>
        ) : sources.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-subink dark:text-dsubink">
            No sources yet. Upload a file, add a URL, or paste text above to get started.
          </p>
        ) : filteredSources.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-subink dark:text-dsubink">
            No sources match your search.
          </p>
        ) : (
          <ul className="space-y-2">
            {filteredSources.map((s) => {
              const meta = TYPE_META[s.type] || TYPE_META.plain_text;
              const Icon = meta.icon;
              return (
                <li
                  key={s.id}
                  className="card card-hover group flex items-start gap-2.5 p-3 animate-fade-up"
                >
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${meta.cls}`}>
                    <Icon size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-ink dark:text-dink">{s.name}</p>
                    <p className="mt-0.5 text-[11px] text-subink dark:text-dsubink">
                      {meta.label} · {s.chunk_count} chunks
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button onClick={() => setPreviewSource(s)} className="btn-ghost !px-1.5 !py-1.5" title="Preview">
                      <Eye size={13} />
                    </button>
                    {pendingDelete === s.id ? (
                      <button
                        onClick={() => confirmDelete(s)}
                        className="btn-ghost !px-1.5 !py-1.5 !text-red-500"
                        title="Confirm delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    ) : (
                      <button
                        onClick={() => setPendingDelete(s.id)}
                        onBlur={() => setTimeout(() => setPendingDelete(null), 200)}
                        className="btn-ghost !px-1.5 !py-1.5"
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <PreviewModal source={previewSource} onClose={() => setPreviewSource(null)} />
    </div>
  );
}
