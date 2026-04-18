"""
routers/notiflist.py

In-app notification feed endpoints.

ENDPOINTS:
  GET  /notifications           — list notifications for current user (newest first)
  POST /notifications/read-all  — mark all as read
  POST /notifications/{id}/read — mark one notification as read
"""

from fastapi import APIRouter, Depends

from routers.dependencies import db_supabase, get_current_user

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
def list_notifications(current_user=Depends(get_current_user)):
    result = (
        db_supabase.table("notifications")
        .select("*")
        .eq("user_id", current_user["id"])
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )
    return result.data or []


@router.post("/read-all")
def mark_all_read(current_user=Depends(get_current_user)):
    db_supabase.table("notifications") \
        .update({"read": True}) \
        .eq("user_id", current_user["id"]) \
        .eq("read", False) \
        .execute()
    return {"ok": True}


@router.post("/{notification_id}/read")
def mark_read(notification_id: str, current_user=Depends(get_current_user)):
    db_supabase.table("notifications") \
        .update({"read": True}) \
        .eq("id", notification_id) \
        .eq("user_id", current_user["id"]) \
        .execute()
    return {"ok": True}
