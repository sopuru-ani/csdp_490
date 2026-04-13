"""
routers/dependencies.py

Shared singletons and utilities used across every router.

Exports:
    auth_supabase   — Supabase client with anon key (auth operations)
    db_supabase     — Supabase client with service role key (unrestricted DB)
    limiter         — slowapi rate-limiter instance (attach to app in main.py)
    COOKIE_SECURE   — True in production (ENV=production)
    COOKIE_SAMESITE — "none" in production, "lax" in dev
    get_current_user(request) — FastAPI dependency; returns users-table row
    require_admin(request)    — same but also enforces is_admin = true
    log_action(...)           — write an audit log row
"""

import os
from fastapi import HTTPException, Request
from supabase import create_client, Client
from slowapi import Limiter
from slowapi.util import get_remote_address
from dotenv import load_dotenv

load_dotenv()

# ── Supabase clients ──────────────────────────────────────────────────────────
_url = os.getenv("SUPABASE_URL")
auth_supabase: Client = create_client(_url, os.getenv("SUPABASE_ANON_KEY"))
db_supabase:   Client = create_client(_url, os.getenv("SUPABASE_SERVICE_ROLE_KEY"))

# ── Rate limiter ──────────────────────────────────────────────────────────────
# One shared instance — imported by each router that needs @limiter.limit(...)
# main.py attaches it to app.state and registers the exception handler.
limiter = Limiter(key_func=get_remote_address)

# ── Cookie settings ───────────────────────────────────────────────────────────
# Set ENV=production on the server to enable secure cross-site cookies.
_IS_PRODUCTION = os.getenv("ENV", "").lower() == "production"
COOKIE_SECURE   = _IS_PRODUCTION
COOKIE_SAMESITE = "none" if _IS_PRODUCTION else "lax"


# ── Auth dependencies ─────────────────────────────────────────────────────────

def get_current_user(request: Request):
    """
    Reads the session cookie or Authorization: Bearer header,
    verifies the token with Supabase Auth, and returns the
    user's full row from the users table.
    Raises 401 if the token is missing or invalid.
    """
    access_token = request.cookies.get("access_token")

    if not access_token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            access_token = auth_header[len("Bearer "):]

    if not access_token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        user_response = auth_supabase.auth.get_user(access_token)
        if not user_response.user:
            raise HTTPException(status_code=401, detail="Invalid token")

        user_id = user_response.user.id

        db_user = db_supabase.table("users") \
            .select("*") \
            .eq("id", user_id) \
            .single() \
            .execute()

        if not db_user.data:
            raise HTTPException(status_code=404, detail="User record not found")

        return db_user.data

    except HTTPException:
        raise
    except Exception as e:
        print("GET CURRENT USER ERROR:", repr(e))
        raise HTTPException(status_code=401, detail="Invalid session")


def require_admin(request: Request):
    """
    Same as get_current_user but also enforces is_admin = true.
    Raises 403 if the user is not an admin.
    """
    current_user = get_current_user(request)
    if not current_user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


# ── Audit logging ─────────────────────────────────────────────────────────────

def log_action(
    actor_id: str,
    action: str,
    target_type: str = None,
    target_id: str = None,
    details: dict = None,
):
    """Write one row to audit_logs. Swallows errors so it never breaks a request."""
    try:
        db_supabase.table("audit_logs").insert({
            "actor_id":    actor_id,
            "action":      action,
            "target_type": target_type,
            "target_id":   target_id,
            "details":     details or {},
        }).execute()
    except Exception as e:
        print("AUDIT LOG ERROR:", repr(e))