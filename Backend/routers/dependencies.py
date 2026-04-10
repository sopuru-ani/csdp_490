"""
routers/dependencies.py

Shared FastAPI dependencies used across routers.
Import get_current_user from here instead of redefining it in each router.

Usage:
    from routers.dependencies import get_current_user, require_admin
"""

import os
from fastapi import HTTPException, Request
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

auth_supabase: Client = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_ANON_KEY")
)

db_supabase: Client = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
)


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