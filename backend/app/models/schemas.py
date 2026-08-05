"""Pydantic models used across the API for requests and responses."""
from typing import Literal, Optional
from pydantic import BaseModel, Field


class SourceInfo(BaseModel):
    id: str
    name: str
    type: Literal["pdf", "text_file", "url", "plain_text"]
    chunk_count: int
    char_count: int
    preview: str


class UploadResponse(BaseModel):
    success: bool
    source: Optional[SourceInfo] = None
    message: str


class UrlSourceRequest(BaseModel):
    session_id: str
    url: str = Field(..., min_length=1)


class TextSourceRequest(BaseModel):
    session_id: str
    text: str = Field(..., min_length=1)
    title: Optional[str] = "Pasted text"


class SourceListResponse(BaseModel):
    sources: list[SourceInfo]


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ConversationInfo(BaseModel):
    id: str
    title: str
    created_at: float
    updated_at: float
    message_count: int


class ConversationListResponse(BaseModel):
    conversations: list[ConversationInfo]


class ConversationDetail(BaseModel):
    id: str
    title: str
    created_at: float
    updated_at: float
    messages: list[dict]


class RenameConversationRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)


class CreateConversationRequest(BaseModel):
    title: Optional[str] = None


class AgentStatus(BaseModel):
    name: str
    configured: bool
    has_own_key: bool
    invocation_count: int = 0


class SettingsResponse(BaseModel):
    agents: list[AgentStatus]
    available_models: list[str]
    default_model: str
    features: dict[str, bool]


class DashboardResponse(BaseModel):
    total_sources: int
    total_chunks: int
    total_conversations: int
    total_messages: int
    uploads_count: int
    agent_invocations: dict[str, int]
    recent_activity: list[dict]
    sources_by_type: dict[str, int]
    session_age_seconds: Optional[float] = None
    last_active: Optional[float] = None
