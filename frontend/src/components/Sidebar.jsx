import { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  Download,
  FileText,
  LayoutDashboard,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Settings as SettingsIcon,
  Trash2,
  X,
} from "lucide-react";
import { useApp } from "../context/AppContext.jsx";
import { downloadConversationExport } from "../utils/api.js";

function ConversationRow({ conv, active, onSelect }) {
  const { sessionId, renameConversationById, deleteConversationById, clearActiveConversation } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(conv.title);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleRenameSubmit(e) {
    e.preventDefault();
    if (draftTitle.trim()) await renameConversationById(conv.id, draftTitle.trim());
    setRenaming(false);
    setMenuOpen(false);
  }

  if (renaming) {
    return (
      <form onSubmit={handleRenameSubmit} className="px-2 py-1">
        <input
          autoFocus
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          onBlur={handleRenameSubmit}
          onKeyDown={(e) => e.key === "Escape" && setRenaming(false)}
          className="w-full rounded-lg border border-line dark:border-dline bg-panel dark:bg-dpanel2 px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ink/10"
        />
      </form>
    );
  }

  return (
    <div
      className={`group relative flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs transition-colors cursor-pointer ${
        active
          ? "bg-ink text-white dark:bg-dink dark:text-dcanvas"
          : "text-subink dark:text-dsubink hover:bg-canvas dark:hover:bg-dline/40"
      }`}
      onClick={() => onSelect(conv.id)}
    >
      <MessageSquare size={14} className="shrink-0 opacity-70" />
      <span className="flex-1 truncate">{conv.title}</span>

      <div className="relative">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          className={`rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity ${
            active ? "hover:bg-white/20" : "hover:bg-line dark:hover:bg-dline"
          } ${menuOpen ? "opacity-100" : ""}`}
        >
          <MoreHorizontal size={13} />
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} />
            <div
              className="absolute right-0 top-7 z-20 w-44 animate-scale-in rounded-xl border border-line dark:border-dline bg-panel dark:bg-dpanel py-1 shadow-floating"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => { setRenaming(true); setMenuOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ink dark:text-dink hover:bg-canvas dark:hover:bg-dline/40"
              >
                <Pencil size={12} /> Rename
              </button>
              <button
                onClick={() => {
                  if (active) clearActiveConversation();
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ink dark:text-dink hover:bg-canvas dark:hover:bg-dline/40"
              >
                <X size={12} /> Clear messages
              </button>
              <button
                onClick={() => downloadConversationExport(sessionId, conv.id, "md", `${conv.title}.md`)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ink dark:text-dink hover:bg-canvas dark:hover:bg-dline/40"
              >
                <Download size={12} /> Export Markdown
              </button>
              <button
                onClick={() => downloadConversationExport(sessionId, conv.id, "pdf", `${conv.title}.pdf`)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ink dark:text-dink hover:bg-canvas dark:hover:bg-dline/40"
              >
                <FileText size={12} /> Export PDF
              </button>
              <div className="my-1 h-px bg-line dark:bg-dline" />
              {confirmDelete ? (
                <button
                  onClick={() => { deleteConversationById(conv.id); setMenuOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
                >
                  <Trash2 size={12} /> Confirm delete
                </button>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
                >
                  <Trash2 size={12} /> Delete chat
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const NAV_ITEMS = [
  { to: "/", label: "Chat", icon: MessageSquare, end: true },
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

export default function Sidebar() {
  const {
    conversations,
    activeConvId,
    selectConversation,
    startNewConversation,
    isMobileSidebarOpen,
    closeMobileSidebar,
  } = useApp();

  function handleSelectConv(id) {
    selectConversation(id);
    closeMobileSidebar();
  }

  function handleNavClick() {
    closeMobileSidebar();
  }

  const sidebarContent = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-4 border-b border-line/60 dark:border-dline/60 lg:border-b-0">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink dark:bg-dink font-display text-sm font-bold text-white dark:text-dcanvas">
            SM
          </div>
          <div>
            <h1 className="font-display text-base font-semibold leading-none tracking-tight">SourceMind</h1>
            <p className="mt-0.5 text-[11px] text-subink dark:text-dsubink">Multi-agent research assistant</p>
          </div>
        </div>
        <button
          onClick={closeMobileSidebar}
          className="lg:hidden rounded-lg p-1 text-subink hover:bg-canvas dark:hover:bg-dline/40"
          title="Close Menu"
        >
          <X size={18} />
        </button>
      </div>

      <nav className="flex flex-col gap-1 px-3 pb-2 pt-2">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={handleNavClick}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-canvas dark:bg-dline/40 text-ink dark:text-dink"
                  : "text-subink dark:text-dsubink hover:bg-canvas dark:hover:bg-dline/30 hover:text-ink dark:hover:text-dink"
              }`
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mx-3 h-px bg-line dark:bg-dline" />

      <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-subink dark:text-dsubink">
          Chats
        </span>
        <button
          onClick={() => {
            startNewConversation();
            closeMobileSidebar();
          }}
          className="btn-ghost !px-1.5 !py-1"
          title="New chat"
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {conversations.length === 0 && (
          <p className="px-2.5 py-2 text-xs text-subink dark:text-dsubink">
            No chats yet. Start one below.
          </p>
        )}
        {conversations.map((conv) => (
          <ConversationRow
            key={conv.id}
            conv={conv}
            active={conv.id === activeConvId}
            onSelect={handleSelectConv}
          />
        ))}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar (unaltered layout on lg: 1024px+) */}
      <aside className="hidden lg:flex h-full w-64 shrink-0 flex-col border-r border-line dark:border-dline bg-panel dark:bg-dpanel">
        {sidebarContent}
      </aside>

      {/* Mobile / Tablet Drawer (<1024px) */}
      {isMobileSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs animate-fade-in"
            onClick={closeMobileSidebar}
          />
          {/* Drawer panel */}
          <aside className="relative z-10 flex h-full w-72 flex-col border-r border-line dark:border-dline bg-panel dark:bg-dpanel shadow-floating animate-slide-in">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}

