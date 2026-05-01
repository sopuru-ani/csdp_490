"""
routers/settings.py

Database-backed user settings.

Routes:
  GET  /settings/email-preferences   → current user's row (inserts defaults if missing)
  PATCH /settings/email-preferences  → partial update; returns the updated row
"""

from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from routers.dependencies import db_supabase
from routers.users import get_current_user

router = APIRouter(prefix="/settings", tags=["settings"])

_EMAIL_PREF_DEFAULTS = {
    "new_message":    True,
    "match_approved": True,
    "match_rejected": True,
    "ai_match_found": True,
    "new_report":     True,
    "item_closed":    True,
}


class EmailPrefsUpdate(BaseModel):
    new_message:    Optional[bool] = None
    match_approved: Optional[bool] = None
    match_rejected: Optional[bool] = None
    ai_match_found: Optional[bool] = None
    new_report:     Optional[bool] = None
    item_closed:    Optional[bool] = None


@router.get("/email-preferences")
async def get_email_preferences(request: Request):
    user = get_current_user(request)
    result = (
        db_supabase.table("email_preferences")
        .select("*")
        .eq("user_id", user["id"])
        .execute()
    )
    if result.data:
        return result.data[0]

    # First visit — create a row with all defaults and return it
    row = {"user_id": user["id"], **_EMAIL_PREF_DEFAULTS}
    db_supabase.table("email_preferences").insert(row).execute()
    return row


@router.patch("/email-preferences")
async def patch_email_preferences(request: Request, body: EmailPrefsUpdate):
    user = get_current_user(request)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No preferences provided.")

    # Upsert so a missing row is created rather than silently failing
    db_supabase.table("email_preferences").upsert(
        {"user_id": user["id"], **updates}
    ).execute()

    result = (
        db_supabase.table("email_preferences")
        .select("*")
        .eq("user_id", user["id"])
        .execute()
    )
    return result.data[0] if result.data else {"user_id": user["id"], **_EMAIL_PREF_DEFAULTS, **updates}
