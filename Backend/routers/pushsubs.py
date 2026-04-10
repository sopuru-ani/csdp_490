from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

router = APIRouter(prefix="/push", tags=["push"])

# Uses the service role key so it can bypass RLS when saving subscriptions
_supabase: Client = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
)


class PushSubscription(BaseModel):
    userId: str
    endpoint: str
    p256dh: str
    auth: str


@router.post("/save-subscription")
def save_subscription(data: PushSubscription):
    """
    Save or update a browser push subscription for a user.
    Uses upsert so re-subscribing (e.g. after browser refresh) doesn't duplicate rows.
    """
    try:
        _supabase.table("push_subscriptions").upsert(
            {
                "user_id": data.userId,
                "endpoint": data.endpoint,
                "p256dh": data.p256dh,
                "auth": data.auth,
            },
            on_conflict="user_id,endpoint"   # matches the UNIQUE constraint
        ).execute()

        return {"message": "Subscription saved."}

    except Exception as e:
        print("PUSH SUBSCRIPTION ERROR:", repr(e))
        raise HTTPException(status_code=500, detail="Failed to save push subscription.")


@router.delete("/remove-subscription")
def remove_subscription(data: PushSubscription):
    """
    Remove a push subscription — called when a user denies notifications
    or logs out and you want to stop sending pushes to that device.
    """
    try:
        _supabase.table("push_subscriptions") \
            .delete() \
            .eq("user_id", data.userId) \
            .eq("endpoint", data.endpoint) \
            .execute()

        return {"message": "Subscription removed."}

    except Exception as e:
        print("PUSH UNSUBSCRIBE ERROR:", repr(e))
        raise HTTPException(status_code=500, detail="Failed to remove push subscription.")


def get_subscriptions_for_user(user_id: str) -> list[dict]:
    """
    Helper used internally (e.g. from your email/notification logic) to
    fetch all active push subscriptions for a given user so you can
    send them a push notification.
    """
    try:
        result = _supabase.table("push_subscriptions") \
            .select("endpoint, p256dh, auth") \
            .eq("user_id", user_id) \
            .execute()

        return result.data or []

    except Exception as e:
        print("GET SUBSCRIPTIONS ERROR:", repr(e))
        return []