# SourceMind — A Multi-Agent, NotebookLM-Inspired Research Assistant

SourceMind lets you upload sources (PDFs, text files, web pages, or pasted
text), then chat with an AI about them. Behind the scenes, a small team of
independent agents work together — and you can watch them work, live, in
the **Agent Workflow** panel.

## What's new in v4.1

This build adds a full redesign and several new features on top of the
original 3-agent core, while keeping every original feature working
exactly as before. The agent roster is intentionally kept at **5 agents**:
Chat, Research, Source, Quiz, and Citation Verifier.

- **Dashboard** — live stats on sources, conversations, messages, agent
  activity, and a recent-activity feed (`/dashboard`).
- **Chat management** — multiple named conversations per session, with
  rename, delete, clear, and export to Markdown or PDF, plus copy and
  regenerate on individual answers.
- **A new Quiz Agent** with its own dedicated API key
  (`QUIZ_AGENT_API_KEY`) — turns your sources into a short practice quiz.
- **A Citation Verifier Agent** (`VERIFIER_AGENT_API_KEY`) attaches a
  confidence badge (Fully/Partially/Not supported) to every answer. (This
  agent, along with the Quiz Agent, existed in the original codebase but
  had a bug that silently prevented it from ever running — see "Bugs
  fixed" below.)
- **Document management** — drag-and-drop upload with progress bars,
  search/filter, preview, and delete.
- **A full UI/UX redesign** — dark/light mode, glassmorphism accents,
  animations, a Settings page (theme, model, per-agent key status, local
  cache controls), and markdown rendering with syntax highlighting for
  code blocks.

**Bugs fixed:** the Quiz and Citation Verifier agents were already
written in the original code but called the shared Gemini helper with
the wrong arguments, so every call would raise an error before it could
get an API key — they were dead code with no way to actually run. They're
fixed and fully wired in now. (An earlier iteration of this build also
added Query Rewriter, Comparison, and Translation agents; those were
removed by request to keep the roster at 5 agents — the code paths they
used were also affected by the same bug and are documented here for
context, but no longer ship.)

## How the agents work together


```
                    User's question
                          │
                          ▼
              ┌───────────────────────┐
              │      Source Agent     │  searches the vector store (ChromaDB)
              │     (retrieval)       │  for the most relevant chunks
              └───────────┬───────────┘
                          ▼
                 not enough local info?
                    │             │
                   yes            no
                    ▼              │
        ┌───────────────────┐     │
        │  Research Agent    │     │
        │  (live web search) │     │
        └─────────┬──────────┘     │
                   └───────┬───────┘
                           ▼
              ┌───────────────────────┐
              │       Chat Agent      │  writes the grounded, cited answer
              │   (Google Gemini)     │  using everything gathered above
              └───────────┬───────────┘
                          ▼
              ┌───────────────────────┐
              │  Citation Verifier    │  checks the answer against the
              │       Agent           │  gathered context, attaches a
              └───────────┬───────────┘  confidence badge
                          ▼
                     Answer to user
```

The **Quiz Agent** sits outside this per-message pipeline - it runs on
demand (via the "Quiz me" button) and pulls a broad sample of chunks from
your sources to generate a short practice quiz, rather than answering a
specific question.

- **Source Agent**: On upload, extracts text (PyPDF for PDFs, BeautifulSoup
  for web pages), splits it into overlapping chunks, and embeds it into a
  per-session ChromaDB collection (local embeddings via
  `sentence-transformers`, no API key needed). On each question, it
  retrieves the most relevant chunks and also manages source references
  (name, type, chunk/character counts) shown in the Sources panel.
- **Research Agent**: If the retrieved chunks are missing or too weakly
  related to the question (measured by vector distance), it automatically
  searches the live web (DuckDuckGo via `ddgs`, no API key required) for
  more context.
- **Chat Agent**: Combines whatever the Source Agent retrieved and
  whatever the Research Agent found, plus the recent conversation
  history, then asks Google Gemini to write a grounded answer — citing
  which source each fact came from.
- **Citation Verifier Agent**: Re-checks the Chat Agent's answer against
  the same gathered context and attaches a confidence badge (Fully
  supported / Partially supported / Not supported) shown next to the
  answer in the chat. Can be turned off globally with
  `ENABLE_CITATION_VERIFIER=false`.
- **Quiz Agent**: On request, samples a broad cross-section of your
  sources and asks Gemini to generate a short practice quiz - useful for
  reviewing material rather than asking a specific question.

These agents are wired together with **LangGraph**: each node's output is
merged into one shared state object, so the retrieval step's output
automatically becomes part of the Research/Chat steps' input — exactly
matching "output of one agent becomes input of the next."

Every step emits a WebSocket event the moment it happens, so the frontend
workflow panel and activity log update in real time — you'll see things
like *"Searching your uploaded sources..."*, *"Searching the web for:
..."*, and *"Generating answer from gathered context..."* as they occur.

## Independent API key per agent

Each agent is configured with its **own, independent Gemini API key**,
loaded from its own environment variable — so keys can be managed or
rotated per-agent without touching any code:

| Agent               | Environment variable        | Currently calls Gemini? |
|---------------------|------------------------------|--------------------------|
| Chat Agent          | `CHAT_AGENT_API_KEY`        | Yes — every answer and summary |
| Research Agent      | `RESEARCH_AGENT_API_KEY`    | Not yet (uses DuckDuckGo search) |
| Source Agent        | `SOURCE_AGENT_API_KEY`      | Not yet (uses local embeddings) |
| Quiz Agent          | `QUIZ_AGENT_API_KEY`        | Yes — generating quizzes |
| Citation Verifier   | `VERIFIER_AGENT_API_KEY`    | Yes — confidence scoring |

Only `CHAT_AGENT_API_KEY` is required for the app to work today. The Quiz
and Citation Verifier agents each fall back to `CHAT_AGENT_API_KEY` if
their own key is left blank, so you don't need five separate keys to try
them out — but you can give either its own key/quota by setting its
variable. All five keys are still loaded independently at startup (see
`app/services/llm_client.py`), so each agent already has its own ready
client the moment it needs one.

## Tech stack

| Layer          | Choice                                             |
|----------------|-----------------------------------------------------|
| Frontend       | React + Vite + Tailwind CSS                        |
| Backend        | FastAPI + WebSockets                               |
| Agent framework| LangGraph                                          |
| LLM            | Google Gemini (`gemini-flash-latest` by default, via the `google-genai` SDK) |
| Vector DB      | ChromaDB (local, persistent, on-disk)              |
| Embeddings     | `sentence-transformers` (`all-MiniLM-L6-v2`, local)|
| Document parsing | PyPDF, BeautifulSoup4, LangChain text splitter   |
| Web search     | DuckDuckGo (`ddgs`, no API key)                    |

## Project structure

```
notebooklm-clone/
├── backend/
│   ├── main.py                     # FastAPI app: REST + WebSocket routes
│   ├── requirements.txt
│   ├── .env.example
│   └── app/
│       ├── config.py                # Settings (reads .env) - 5 separate API keys + feature flag
│       ├── websocket_manager.py      # Broadcasts live agent events, feeds the stats store
│       ├── models/schemas.py         # Pydantic request/response models
│       ├── services/
│       │   ├── session_store.py      # In-memory sources + multi-conversation chat history
│       │   ├── stats_store.py        # Dashboard analytics (agent counts, activity feed)
│       │   ├── export_service.py     # Markdown/PDF chat export
│       │   ├── pdf_processor.py      # PDF text extraction + chunking
│       │   ├── url_processor.py      # Web page fetch + text cleanup
│       │   ├── vector_store.py       # ChromaDB wrapper (per-session)
│       │   └── llm_client.py         # Per-agent Gemini client factory (with key fallback)
│       └── agents/
│           ├── source_agent.py       # Ingests PDFs/text/URLs into Chroma
│           ├── research_agent.py     # Live web search
│           ├── chat_agent.py         # Gemini prompt + generation
│           ├── quiz_agent.py         # Generates a quiz from your sources
│           ├── citation_verifier_agent.py # Confidence scoring
│           └── graph.py              # LangGraph pipeline (the "brain")
└── frontend/
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── index.html
    ├── .env.example
    └── src/
        ├── main.jsx
        ├── App.jsx                   # Router shell: Sidebar + Chat/Dashboard/Settings
        ├── index.css
        ├── context/
        │   ├── AppContext.jsx        # Session, sources, conversations, chat, live agent state
        │   ├── ThemeContext.jsx      # Dark/light mode
        │   └── SettingsContext.jsx   # Model preference (localStorage)
        ├── hooks/useWebSocket.js     # Live agent events + chat/summarize/quiz send
        ├── utils/
        │   ├── api.js                # REST calls (sources, conversations, dashboard, export)
        │   └── markdown.jsx          # Markdown renderer incl. syntax-highlighted code blocks
        ├── pages/
        │   ├── ChatPage.jsx
        │   ├── DashboardPage.jsx
        │   └── SettingsPage.jsx
        └── components/
            ├── Sidebar.jsx           # Nav + conversation management
            ├── TopBar.jsx            # Connection status + theme toggle
            ├── SourcePanel.jsx       # Drag-drop upload, search, filter, preview, delete
            ├── WorkflowPanel.jsx     # Live pipeline (5 agents) + activity log
            ├── ChatPanel.jsx         # Conversation UI: citations, confidence badge, copy/regenerate
            └── TypingReveal.jsx      # Client-side typing animation
```

## Prerequisites

- Python 3.10+
- Node.js 18+
- A free Gemini API key from https://aistudio.google.com/app/apikey
  (the same key can be reused for all three `_API_KEY` variables, or you
  can create separate keys per agent if you want independent usage
  tracking/quotas)

## Setup

### 1. Backend

```bash
cd backend
python -m venv venv
```

Activate it:

```bash
# macOS / Linux
source venv/bin/activate

# Windows (PowerShell)
venv\Scripts\Activate.ps1
```

```bash
pip install -r requirements.txt
cp .env.example .env
```

Open `backend/.env` and paste your Gemini API key into `CHAT_AGENT_API_KEY`.
That's the only key required — the other four (Research, Source, Quiz,
Citation Verifier) can each be left blank; Quiz and Citation Verifier
automatically fall back to using the Chat Agent's key. Set either
explicitly if you'd rather give that agent its own quota.

```bash
uvicorn main:app --reload
```

The backend runs at `http://localhost:8000`. On startup, it logs which
agents have a working API key configured. The first time you upload a
source, `sentence-transformers` will download its embedding model
(~90 MB) — this needs an internet connection once, then it's cached
locally.

### 2. Frontend

In a new terminal:

```bash
cd frontend
npm install
cp .env.example .env # Run this during setup only - re-running it later would overwrite any custom values
npm run dev
```

The frontend runs at `http://localhost:5173`. Open it in your browser.

### 3. Use it

1. Add a source: upload a PDF/`.txt` file (or drag-and-drop it), paste a
   URL, or paste raw text.
2. Watch the **Agent workflow** panel — you'll see the Source Agent read
   and index it.
3. Ask a question in the chat. Watch the pipeline light up: the Source
   Agent retrieves context, the Research Agent kicks in automatically if
   your sources don't cover it, the Chat Agent writes the final cited
   answer, and the Citation Verifier attaches a confidence badge.
4. Try **Summarize** for a quick overview, or **Quiz me** to turn your
   sources into a short practice quiz.
5. Manage chats from the sidebar: start a new one, rename, clear, delete,
   or export any conversation to Markdown or PDF.
6. Check the **Dashboard** page for usage stats and live agent activity,
   and the **Settings** page for theme, model, and per-agent API key
   status.

## Notes & limitations (by design, to keep this focused)

- Source metadata, conversations, and dashboard stats are stored in memory
  and reset when the backend restarts. The actual vector embeddings persist
  on disk in `backend/chroma_data/` regardless.
- Only PDF, `.txt`, URL, and pasted-text sources are supported (no video,
  audio, or Google Docs import — those are deliberately out of scope).
- There's no user-account system; each browser gets its own session ID
  stored in `localStorage`.
- If `CHAT_AGENT_API_KEY` is missing or invalid, the Chat Agent will report
  the error clearly in the chat and in the activity log rather than
  crashing the app.
- The Research and Source agents don't currently call Gemini at all (see
  the API key table above), so their keys have no visible effect yet -
  they're simply ready and independently configurable for if/when those
  agents grow to need one.
- The Settings page's model picker is stored per-browser for future use;
  every agent currently answers using its configured `GEMINI_MODEL`
  regardless of that selection, and API keys are only ever configured
  server-side in `backend/.env` (never sent to or editable from the
  browser, for security).

## Troubleshooting

- **"CHAT_AGENT_API_KEY is not set"**: make sure you copied `.env.example`
  to `.env` in `backend/` and filled in a real key, then restart `uvicorn`.
- **CORS errors in the browser console**: confirm `CORS_ORIGINS` in
  `backend/.env` includes `http://localhost:5173`.
- **WebSocket shows "Reconnecting..."**: make sure the backend is running
  on port 8000 and `VITE_WS_BASE_URL` in `frontend/.env` matches.
- **Slow first upload**: the local embedding model downloads once on first
  use; subsequent uploads are fast.
- **"model not found" / model shut down errors from Gemini**: Google
  regularly retires older Gemini model IDs. If `GEMINI_MODEL` in your `.env`
  stops working, check https://ai.google.dev/gemini-api/docs/models for the
  current list and update the value (no code changes needed).

## Quick reference

```bash
# Backend — Terminal 1
cd backend
venv\Scripts\Activate.ps1 
uvicorn main:app --reload

# Frontend — Terminal 2 (new terminal)
cd frontend
npm run dev
```

# Website Link
https://source-mind-ai.vercel.app?utm_source=chatgpt.com