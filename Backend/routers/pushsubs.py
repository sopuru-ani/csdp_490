from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import os
import httpx
from supabase import create_client, Client, ClientOptions
from dotenv import load_dotenv
from routers.dependencies import get_current_user

load_dotenv()

router = APIRouter(prefix="/push", tags=["push"])

# Uses the service role key so it can bypass RLS when saving subscriptions
# Windows socket fix: disable HTTP/2 which causes WinError 10035 under concurrent load
_supabase: Client = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_SERVICE_ROLE_KEY"),
    options=ClientOptions(httpx_client=httpx.Client(http2=False))
)


class PushKeys(BaseModel):
    p256dh: str
    auth: str


class SubscriptionObject(BaseModel):
    endpoint: str
    keys: PushKeys


class SaveSubscriptionRequest(BaseModel):
    userId: str
    subscription: SubscriptionObject


class RemoveSubscriptionRequest(BaseModel):
    userId: str
    endpoint: str


@router.post("/save-subscription")
def save_subscription(data: SaveSubscriptionRequest):
    """
    Save or update a browser push subscription for a user.
    Uses upsert so re-subscribing (e.g. after browser refresh) doesn't duplicate rows.
    """
    try:
        _supabase.table("push_subscriptions").upsert(
            {
                "user_id": data.userId,
                "endpoint": data.subscription.endpoint,
                "p256dh": data.subscription.keys.p256dh,
                "auth": data.subscription.keys.auth,
            },
            on_conflict="user_id,endpoint"
        ).execute()

        print(f"[PUSH] Saved subscription for user {data.userId} at {data.subscription.endpoint}")
        return {"message": "Subscription saved."}

    except Exception as e:
        print("PUSH SUBSCRIPTION ERROR:", repr(e))
        raise HTTPException(status_code=500, detail="Failed to save push subscription.")


@router.delete("/remove-subscription")
def remove_subscription(data: RemoveSubscriptionRequest):
    """
    Remove a push subscription — called when a user opts out or logs out.
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
    Helper used internally (e.g. from notification logic) to fetch all active
    push subscriptions for a user so we can send them a push notification.
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


@router.post("/clear-all-subscriptions")
def clear_all_subscriptions(request):
    """
    DEBUG ENDPOINT: Clear all push subscriptions for the current user.
    Used when VAPID keys change to force re-subscription with new keys.
    """
    try:
        user_id = request.get("user_id") or request.get("userId")
        if not user_id:
            raise HTTPException(status_code=400, detail="user_id is required")
        
        result = _supabase.table("push_subscriptions") \
            .delete() \
            .eq("user_id", user_id) \
            .execute()
        
        print(f"[PUSH] Cleared all subscriptions for user {user_id}")
        return {"message": f"Cleared all subscriptions for {user_id}. Please re-subscribe in the app."}
    
    except Exception as e:
        print(f"[PUSH] Error clearing subscriptions:", repr(e))
        raise HTTPException(status_code=500, detail="Failed to clear subscriptions.")
