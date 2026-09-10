"""
Centralized application configuration.

All values are read from environment variables (loaded from a `.env` file
in the backend/ directory). See `.env.example` for the full list of
variables and sane defaults.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- Gemini: one independent API key per agent ---
    # Each of the three agents (Chat, Research, Source) is configured with
    # its own separate key so they can be managed/rotated independently
    # without touching code. Only the Chat Agent currently calls Gemini
    # (Research uses DuckDuckGo search; Source uses local embeddings), but
    # all three are wired with their own dedicated client - see
    # app/services/llm_client.py.
    CHAT_AGENT_API_KEY: str = ""
    RESEARCH_AGENT_API_KEY: str = ""
    SOURCE_AGENT_API_KEY: str = ""
    # Two more agents, each with their own independent key. If left blank,
    # they transparently fall back to CHAT_AGENT_API_KEY (see
    # app/services/llm_client.py) so the app still works with just one key.
    QUIZ_AGENT_API_KEY: str = ""
    VERIFIER_AGENT_API_KEY: str = ""
    PODCAST_AGENT_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-3.6-flash"
    # Models selectable from the Settings page (purely a UI convenience -
    # the backend will happily use whatever value the client sends).
    AVAILABLE_MODELS: str = "gemini-3.6-flash,gemini-3.7-flash,gemini-flash-latest"

    # Enables the Citation Verifier's confidence badge on every answer.
    # Does not change how the Chat Agent's core answer is generated.
    ENABLE_CITATION_VERIFIER: bool = True

    # --- Vector store ---
    CHROMA_PERSIST_DIR: str = "./chroma_data"

    # --- CORS ---
    CORS_ORIGINS: str = (
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000,https://source-mind-ai.vercel.app"
    )

    # --- Document processing ---
    CHUNK_SIZE: int = 1000
    CHUNK_OVERLAP: int = 150

    # --- Retrieval / agent behaviour ---
    RETRIEVAL_TOP_K: int = 5
    RESEARCH_TRIGGER_DISTANCE: float = 0.7

    @property
    def cors_origins_list(self) -> list[str]:
        origins = [origin.strip().rstrip("/") for origin in self.CORS_ORIGINS.split(",") if origin.strip()]
        prod_origin = "https://source-mind-ai.vercel.app"
        if prod_origin not in origins:
            origins.append(prod_origin)
        return origins

    @property
    def available_models_list(self) -> list[str]:
        return [m.strip() for m in self.AVAILABLE_MODELS.split(",") if m.strip()]


settings = Settings()
