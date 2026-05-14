import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from datetime import datetime, timezone, timedelta

# Import the functions we're testing
from routers.auth import _is_locked, _effective_count

# ── _is_locked ────────────────────────────────────────────────

def test_is_locked_when_no_row():
    """No attempt row at all — should not be locked"""
    locked, until = _is_locked(None)
    assert locked == False
    assert until is None

def test_is_locked_when_locked_until_in_future():
    """locked_until is 5 minutes from now — should be locked"""
    future = datetime.now(timezone.utc) + timedelta(minutes=5)
    row = {"locked_until": future.isoformat(), "failed_count": 5}
    locked, until = _is_locked(row)
    assert locked == True
    assert until is not None

def test_is_locked_when_lock_expired():
    """locked_until was 5 minutes ago — should NOT be locked"""
    past = datetime.now(timezone.utc) - timedelta(minutes=5)
    row = {"locked_until": past.isoformat(), "failed_count": 5}
    locked, until = _is_locked(row)
    assert locked == False
    assert until is None

def test_is_locked_when_locked_until_is_none():
    """Row exists but locked_until is null — not locked"""
    row = {"locked_until": None, "failed_count": 2}
    locked, until = _is_locked(row)
    assert locked == False
    assert until is None

# ── _effective_count ──────────────────────────────────────────

def test_effective_count_no_row():
    """No row — count should be 0"""
    assert _effective_count(None) == 0

def test_effective_count_normal():
    """3 failures, not locked — should return 3"""
    row = {"failed_count": 3, "locked_until": None}
    assert _effective_count(row) == 3

def test_effective_count_resets_after_expired_lock():
    """Lock window expired — count should reset to 0"""
    past = datetime.now(timezone.utc) - timedelta(minutes=15)
    row = {"failed_count": 5, "locked_until": past.isoformat()}
    assert _effective_count(row) == 0

def test_effective_count_still_locked():
    """Still within lock window — count stays as is"""
    future = datetime.now(timezone.utc) + timedelta(minutes=5)
    row = {"failed_count": 5, "locked_until": future.isoformat()}
    assert _effective_count(row) == 5