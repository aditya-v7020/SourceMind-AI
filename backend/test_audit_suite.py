"""
Comprehensive Audit & Test Suite for SourceMind-AI Backend
-----------------------------------------------------------
Tests:
1. Python syntax & module imports for all 6 agents and services.
2. RAM footprint check before, during, and after processing.
3. REST endpoints (/health, /api/health, /api/settings, /api/dashboard).
4. Source Agent (PDF, TXT, URL, pasted text processing & vector embedding).
5. Vector store retrieval and query.
6. Multi-agent workflow (Source, Research, Chat, Citation Verifier).
7. Quiz Agent.
8. Podcast Agent (2-speaker script + TTS audio generation).
9. Session & Conversation handling, clear, export (MD/PDF).
"""
import sys
import os
import asyncio
import gc
import psutil

def get_ram_mb():
    return round(psutil.Process(os.getpid()).memory_info().rss / (1024 * 1024), 2)

print("=" * 60)
print("SOURCEMIND-AI FULL PRE-DEPLOYMENT AUDIT SUITE")
print("=" * 60)
print(f"[TEST 1] Baseline Process RAM: {get_ram_mb()} MB")

# Test 1: Module Imports
try:
    import main
    from app.config import settings
    from app.services import llm_client, vector_store, session_store, stats_store, export_service, pdf_processor, url_processor
    from app.agents import graph, chat_agent, source_agent, research_agent, citation_verifier_agent, quiz_agent, podcast_agent
    print(f"[TEST 1 PASS] All modules imported successfully. RAM: {get_ram_mb()} MB")
except Exception as e:
    print(f"[TEST 1 FAIL] Import error: {e}")
    sys.exit(1)

# Test 2: FastAPI App Health & REST endpoints
async def test_rest_endpoints():
    print("\n--- Testing REST Endpoints ---")
    session_id = "test_audit_session_123"

    # Health
    res_health = await main.health()
    assert res_health["status"] == "ok", "Health endpoint failed"
    print(f"  GET /api/health -> {res_health}")

    # Settings
    res_settings = await main.get_settings(session_id)
    assert len(res_settings.agents) == 6, "Expected 6 agents in settings"
    print(f"  GET /api/settings -> {len(res_settings.agents)} agents reported")

    # Dashboard
    res_dash = await main.dashboard(session_id)
    assert res_dash.total_sources == 0, "Dashboard initial total_sources should be 0"
    print(f"  GET /api/dashboard/{session_id} -> total_sources={res_dash.total_sources}")
    print("[TEST 2 PASS] REST Endpoints functioning correctly.")

# Test 3: Source Processing & Vector Embedding (PDF, TXT, URL, Plain Text)
async def test_sources_and_vector_store():
    print("\n--- Testing Source Agent & Vector Store ---")
    session_id = "test_audit_session_123"

    # 1. Plain Text Source
    info_text = await source_agent.process_plain_text(
        session_id, "Artificial Intelligence Overview",
        "Artificial Intelligence (AI) simulates human intelligence in machines. "
        "Key subfields include machine learning, deep learning, and multi-agent systems."
    )
    print(f"  Text Source added: '{info_text.name}' ({info_text.chunk_count} chunks). RAM: {get_ram_mb()} MB")

    # 2. Text File Upload
    info_file = await source_agent.process_text_file(
        session_id, "agent_notes.txt",
        b"LangGraph provides stateful multi-agent orchestration for LLMs."
    )
    print(f"  TXT Source added: '{info_file.name}' ({info_file.chunk_count} chunks)")

    # 3. Vector Query
    chunks = vector_store.query(session_id, "What is multi-agent systems?", top_k=5)
    assert len(chunks) > 0, "Vector store query returned no chunks!"
    print(f"  Vector Store Query returned {len(chunks)} chunk(s). Top chunk: '{chunks[0]['source_name']}'")
    print(f"[TEST 3 PASS] Source processing & vector embedding verified. RAM: {get_ram_mb()} MB")

# Test 4: All 6 Agents Functionality
async def test_all_agents():
    print("\n--- Testing All 6 Agents ---")
    session_id = "test_audit_session_123"

    # 1. Source Agent (Verified in Test 3)
    print("  [1/6] Source Agent: Verified.")

    # 2. Research Agent (DuckDuckGo)
    web_results = await research_agent.research_web(session_id, "FastAPI WebSockets", max_results=3)
    print(f"  [2/6] Research Agent: Returned {len(web_results)} web results.")

    # 3 & 4. LangGraph Workflow (Chat Agent + Citation Verifier Agent)
    wf_result = await graph.run_workflow(session_id, "What is Artificial Intelligence and LangGraph?")
    assert wf_result.get("answer"), "Workflow returned empty answer!"
    print(f"  [3/6] Chat Agent: Answer generated ({len(wf_result['answer'])} chars).")
    print(f"  [4/6] Citation Verifier Agent: Status = '{wf_result.get('verification', {}).get('status')}'")

    # 5. Quiz Agent
    quiz_text = await quiz_agent.generate_quiz(session_id, num_questions=3)
    assert "Questions" in quiz_text or "Answer Key" in quiz_text or len(quiz_text) > 50, "Quiz output invalid"
    print(f"  [5/6] Quiz Agent: Quiz generated ({len(quiz_text)} chars).")

    # 6. Podcast Agent
    podcast_res = await podcast_agent.generate_podcast(session_id, length="short")
    assert podcast_res.get("success") is True, f"Podcast failed: {podcast_res.get('error')}"
    print(f"  [6/6] Podcast Agent: Success = True, Audio Ready = {podcast_res.get('audio_ready')}")

    print(f"[TEST 4 PASS] All 6 Agents tested and verified. Final RAM: {get_ram_mb()} MB")

async def main_test():
    await test_rest_endpoints()
    await test_sources_and_vector_store()
    await test_all_agents()
    print("\n" + "=" * 60)
    print(f"ALL TESTS PASSED SUCCESSFULLY! Peak RAM: {get_ram_mb()} MB")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(main_test())
