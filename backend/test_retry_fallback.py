"""
Unit and Integration Test for 503 Exponential Backoff Retries & Model Fallbacks
-------------------------------------------------------------------------------
"""
import sys
import os
import time
import asyncio
from unittest.mock import patch, MagicMock

from app.services import llm_client

def test_transient_503_detection():
    print("\n--- Testing 503 Error Detection ---")
    class Mock503Exc(Exception):
        status_code = 503

    class MockHighDemandExc(Exception):
        pass

    exc1 = Mock503Exc("503 Service Unavailable")
    exc2 = Exception("503 UNAVAILABLE: This model is currently experiencing high demand.")
    exc3 = Exception("400 Bad Request: Invalid arguments.")
    exc4 = Exception("500 INTERNAL: {'error': {'code': 500, 'message': 'Internal error encountered.', 'status': 'INTERNAL'}}")
    exc5 = Exception("429 RESOURCE_EXHAUSTED: Quota exceeded")

    assert llm_client._is_transient_error(exc1) is True, "Failed to identify 503 status code"
    assert llm_client._is_transient_error(exc2) is True, "Failed to identify 503 text indicator"
    assert llm_client._is_transient_error(exc3) is False, "400 error misidentified as transient"
    assert llm_client._is_transient_error(exc4) is True, "Failed to identify 500 INTERNAL"
    assert llm_client._is_transient_error(exc5) is True, "Failed to identify 429 RESOURCE_EXHAUSTED"
    print("[PASS] 500/503/429 transient error detection verified.")

def test_retry_and_fallback_logic():
    print("\n--- Testing Exponential Backoff & Fallback Model Cascade ---")
    attempts = []

    def mock_single_attempt(agent, prompt, model_name):
        attempts.append((model_name, time.time()))
        if model_name == "gemini-3.6-flash":
            raise Exception("503 UNAVAILABLE: High demand")
        elif model_name == "gemini-3.7-flash":
            return "Fallback success!"
        else:
            raise Exception("503 UNAVAILABLE: High demand")

    with patch("app.services.llm_client._generate_single_attempt", side_effect=mock_single_attempt), \
         patch("time.sleep", return_value=None) as mock_sleep:
        res = llm_client._generate_sync("chat", "Test prompt", model="gemini-3.6-flash")
        assert res == "Fallback success!", f"Expected fallback response, got: {res}"
        
        # Verify 3 attempts on primary model (initial + 2 retries with 1s, 2s delays)
        primary_attempts = [a for a in attempts if a[0] == "gemini-3.6-flash"]
        assert len(primary_attempts) == 3, f"Expected 3 attempts on primary model, got {len(primary_attempts)}"
        
        # Verify sleep delays called (1s, 2s)
        sleep_args = [call.args[0] for call in mock_sleep.call_args_list]
        assert sleep_args[:2] == [1, 2], f"Expected delays [1, 2], got {sleep_args}"
        
        print("[PASS] Retried 2 times on primary model (delays: 1s, 2s), then successfully fell back to 'gemini-3.7-flash'.")

def test_permanent_error_no_retry():
    print("\n--- Testing Permanent Error Behavior (No Retries) ---")
    attempts = []

    def mock_single_attempt(agent, prompt, model_name):
        attempts.append(model_name)
        raise Exception("400 INVALID_ARGUMENT: Invalid API key or request.")

    with patch("app.services.llm_client._generate_single_attempt", side_effect=mock_single_attempt), \
         patch("time.sleep") as mock_sleep:
        try:
            llm_client._generate_sync("chat", "Test prompt")
            assert False, "Should have raised Exception"
        except Exception as exc:
            assert "400 INVALID_ARGUMENT" in str(exc)
            assert len(attempts) == 1, "Permanent 400 error should not be retried!"
            assert mock_sleep.call_count == 0, "Sleep should not be called for permanent errors!"
            print("[PASS] Permanent 400 error raised immediately without retries.")

def test_fallback_skips_404_deprecated_model():
    print("\n--- Testing Fallback Skips 404 Deprecated Models ---")
    attempts = []

    def mock_single_attempt(agent, prompt, model_name):
        attempts.append(model_name)
        if model_name == "gemini-3.6-flash":
            raise Exception("503 UNAVAILABLE: High demand")
        elif model_name == "gemini-3.7-flash":
            raise Exception("404 NOT_FOUND: Model is deprecated or not available")
        elif model_name == "gemini-flash-latest":
            return "Next candidate success!"
        raise Exception("503 UNAVAILABLE")

    with patch("app.services.llm_client._generate_single_attempt", side_effect=mock_single_attempt), \
         patch("time.sleep", return_value=None):
        res = llm_client._generate_sync("chat", "Test prompt", model="gemini-3.6-flash")
        assert res == "Next candidate success!", f"Expected fallback response, got: {res}"
        assert "gemini-3.7-flash" in attempts, "404 model was not attempted"
        assert "gemini-flash-latest" in attempts, "Subsequent fallback model was not attempted"
        print("[PASS] Successfully skipped 404 model in cascade and retrieved answer from next candidate.")

def test_500_internal_error_retry_and_fallback():
    print("\n--- Testing 500 INTERNAL Error Retry & Fallback ---")
    attempts = []

    def mock_single_attempt(agent, prompt, model_name):
        attempts.append(model_name)
        if model_name == "gemini-3.6-flash":
            raise Exception("500 INTERNAL: {'error': {'code': 500, 'message': 'Internal error encountered.', 'status': 'INTERNAL'}}")
        elif model_name == "gemini-3.7-flash":
            return "500 fallback success!"
        raise Exception("500 INTERNAL")

    with patch("app.services.llm_client._generate_single_attempt", side_effect=mock_single_attempt), \
         patch("time.sleep", return_value=None) as mock_sleep:
        res = llm_client._generate_sync("verifier", "Check this", model="gemini-3.6-flash")
        assert res == "500 fallback success!", f"Expected fallback response, got: {res}"
        primary_attempts = [a for a in attempts if a == "gemini-3.6-flash"]
        assert len(primary_attempts) == 3, f"Expected 3 attempts on primary model for 500 error, got {len(primary_attempts)}"
        print("[PASS] Retried 500 INTERNAL error and successfully fell back to 'gemini-3.7-flash'.")

if __name__ == "__main__":
    test_transient_503_detection()
    test_retry_and_fallback_logic()
    test_permanent_error_no_retry()
    test_fallback_skips_404_deprecated_model()
    test_500_internal_error_retry_and_fallback()
    print("\n============================================================")
    print("ALL RETRY AND FALLBACK UNIT TESTS PASSED SUCCESSFULLY!")
    print("============================================================")
