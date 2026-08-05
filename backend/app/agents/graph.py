"""
Multi-agent workflow, built with LangGraph.

Flow for every chat message:

    retrieve (Source Agent searches the vector store)
        |
        v
    decide: are the retrieved chunks relevant enough?
        |               |
       yes              no
        |               |
        v               v
    chat <----------  research (Research Agent searches the web)
   (Chat Agent writes the grounded answer)
        |
        v
    verify (Citation Verifier Agent - optional, confidence badge)
        |
        v
      END

The output of each node is merged into a shared state dict, so each
node's output automatically becomes part of the next node's input.
The verification stage degrades gracefully: if it's disabled or fails,
the pipeline still returns a normal answer.
"""
from __future__ import annotations

from typing import Any, TypedDict

from langgraph.graph import END, StateGraph

from app.agents import chat_agent, citation_verifier_agent, research_agent
from app.config import settings
from app.services import session_store as session_store_module
from app.services import vector_store
from app.websocket_manager import manager


class GraphState(TypedDict, total=False):
    session_id: str
    conv_id: str
    query: str
    history: list[dict[str, str]]
    local_chunks: list[dict[str, Any]]
    needs_research: bool
    web_results: list[dict[str, Any]]
    answer: str
    model: str | None
    verification: dict[str, str]


async def retrieve_node(state: GraphState) -> GraphState:
    session_id = state["session_id"]
    query = state["query"]

    await manager.send_agent_status(
        session_id, "source", "start", "Searching your uploaded sources..."
    )
    chunks = vector_store.query(session_id, query, top_k=settings.RETRIEVAL_TOP_K)

    if chunks:
        best_distance = min(c["distance"] for c in chunks)
        await manager.send_agent_status(
            session_id,
            "source",
            "done",
            f"Found {len(chunks)} relevant chunk(s) in your sources.",
        )
    else:
        best_distance = None
        await manager.send_agent_status(
            session_id, "source", "done", "No relevant content found in your uploaded sources."
        )

    needs_research = best_distance is None or best_distance > settings.RESEARCH_TRIGGER_DISTANCE

    return {"local_chunks": chunks, "needs_research": needs_research}


def route_after_retrieve(state: GraphState) -> str:
    return "research" if state.get("needs_research") else "chat"


async def research_node(state: GraphState) -> GraphState:
    results = await research_agent.research_web(state["session_id"], state["query"])
    return {"web_results": results}


async def chat_node(state: GraphState) -> GraphState:
    answer = await chat_agent.generate_answer(
        session_id=state["session_id"],
        query=state["query"],
        local_chunks=state.get("local_chunks", []),
        web_results=state.get("web_results", []),
        history=state.get("history", []),
    )
    return {"answer": answer}


async def verify_node(state: GraphState) -> GraphState:
    if not settings.ENABLE_CITATION_VERIFIER:
        return {"verification": {"status": "Unverified", "note": "Verification is disabled."}}
    verification = await citation_verifier_agent.verify_answer(
        state["session_id"],
        state["query"],
        state.get("answer", ""),
        state.get("local_chunks", []),
        state.get("web_results", []),
    )
    return {"verification": verification}


def _build_graph():
    graph = StateGraph(GraphState)
    graph.add_node("retrieve", retrieve_node)
    graph.add_node("research", research_node)
    graph.add_node("chat", chat_node)
    graph.add_node("verify", verify_node)

    graph.set_entry_point("retrieve")
    graph.add_conditional_edges(
        "retrieve", route_after_retrieve, {"research": "research", "chat": "chat"}
    )
    graph.add_edge("research", "chat")
    graph.add_edge("chat", "verify")
    graph.add_edge("verify", END)

    return graph.compile()


_compiled_graph = _build_graph()


async def run_workflow(
    session_id: str,
    query: str,
    conv_id: str = session_store_module.DEFAULT_CONVERSATION_ID,
) -> dict[str, Any]:
    """Runs the full pipeline for one user message and returns a dict with
    the answer plus metadata (citations/sources used and the
    verification/confidence result). Also records the turn in the
    conversation's chat history."""
    history = session_store_module.session_store.get_history(session_id, conv_id)

    final_state = await _compiled_graph.ainvoke(
        {
            "session_id": session_id,
            "conv_id": conv_id,
            "query": query,
            "history": history,
        }
    )

    answer = final_state.get("answer", "Something went wrong generating a response.")
    verification = final_state.get("verification") or {}
    local_chunks = final_state.get("local_chunks", [])
    web_results = final_state.get("web_results", [])

    citations = sorted({c["source_name"] for c in local_chunks})
    web_citations = [{"title": r["title"], "url": r["url"]} for r in web_results]

    session_store_module.session_store.append_message(session_id, conv_id, "user", query)
    session_store_module.session_store.append_message(
        session_id,
        conv_id,
        "assistant",
        answer,
        meta={
            "citations": citations,
            "web_citations": web_citations,
            "verification": verification,
        },
    )

    return {
        "answer": answer,
        "citations": citations,
        "web_citations": web_citations,
        "verification": verification,
    }
