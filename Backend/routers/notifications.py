"""
routers/notifications.py

Central push-notification dispatcher for LostLink.

All public functions are fire-and-forget: they log errors but never raise,
so a push failure never interrupts the request that triggered it.

Notification events
-------------------
User-facing:
  ai_matches_found(user_id, item_name)
  match_request_approved(user_id, item_name)
  match_request_rejected(user_id, item_name)
  someone_requested_your_item(owner_id, requester_name, item_name)
  new_message(recipient_id, sender_name, conversation_id, *, is_first_message)
  item_closed(user_id, item_name)
  password_changed(user_id)

Admin-only:
  admin_match_pending(match_id)
  admin_report_pending(report_id)
  admin_new_item(item_name, item_type)          # optional — new item posted on campus
"""

import os
import json

from pywebpush import webpush, WebPushException
from dotenv import load_dotenv

from routers.pushsubs import get_subscriptions_for_user
from routers.dependencies import db_supabase

load_dotenv()

_VAPID_PRIVATE_KEY  = os.getenv("VAPID_PRIVATE_KEY")
_VAPID_CLAIMS_EMAIL = os.getenv("VAPID_CLAIMS_EMAIL")


# ── Core sender ───────────────────────────────────────────────────────────────

def send_push(
    user_id: str,
    title: str,
    body: str,
    url: str = "/dashboard",
    tag: str = "lostlink-default",
) -> None:
    """
    Send a push notification to every registered device for `user_id`.

    Silently removes stale subscriptions that return HTTP 404/410 (browser
    has unsubscribed or the endpoint expired).  Never raises — safe to call
    from any route without a try/except wrapper.
    """
    if not _VAPID_PRIVATE_KEY or not _VAPID_CLAIMS_EMAIL:
        print("[PUSH] VAPID not configured — skipping notification")
        return

    subscriptions = get_subscriptions_for_user(user_id)
    dead_endpoints = []

    for sub in subscriptions:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub["endpoint"],
                    "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
                },
                data=json.dumps({
                    "title": title,
                    "body":  body,
                    "icon":  "/cat.jpeg",
                    "tag":   tag,
                    "data":  {"url": url},
                }),
                vapid_private_key=_VAPID_PRIVATE_KEY,
                vapid_claims={"sub": _VAPID_CLAIMS_EMAIL},
            )
        except WebPushException as e:
            print(f"[PUSH] WebPushException for {user_id}:", repr(e))
            if e.response is not None and e.response.status_code in (404, 410):
                dead_endpoints.append(sub["endpoint"])
        except Exception as e:
            print(f"[PUSH] Error for {user_id}:", repr(e))

    # Prune expired subscriptions so we don't keep hitting dead endpoints
    for endpoint in dead_endpoints:
        try:
            db_supabase.table("push_subscriptions") \
                .delete() \
                .eq("user_id", user_id) \
                .eq("endpoint", endpoint) \
                .execute()
        except Exception:
            pass


def _get_admin_ids() -> list[str]:
    """Return the IDs of all users with is_admin = true."""
    try:
        result = db_supabase.table("users").select("id").eq("is_admin", True).execute()
        return [row["id"] for row in (result.data or [])]
    except Exception as e:
        print("[PUSH] _get_admin_ids error:", repr(e))
        return []


def notify_admins(title: str, body: str, url: str = "/dashboard", tag: str = "lostlink-admin") -> None:
    """Send a push notification to every admin user."""
    for admin_id in _get_admin_ids():
        send_push(admin_id, title, body, url=url, tag=tag)


# ── User-facing events ────────────────────────────────────────────────────────

def ai_matches_found(user_id: str, item_name: str) -> None:
    """Fired after AI matching returns ≥1 result for the user's item."""
    send_push(
        user_id,
        title="Potential matches found!",
        body=f"The AI found possible matches for your item: \"{item_name}\". Tap to review.",
        url="/my-reports",
        tag="lostlink-ai-matches",
    )


def match_request_approved(user_id: str, item_name: str) -> None:
    """Fired when an admin approves the user's match request."""
    send_push(
        user_id,
        title="Match approved! \U0001f389",
        body=f"Your match request for \"{item_name}\" was approved. A conversation has been opened.",
        url="/messages",
        tag="lostlink-match-approved",
    )


def match_request_rejected(user_id: str, item_name: str) -> None:
    """Fired when an admin rejects the user's match request."""
    send_push(
        user_id,
        title="Match request not approved",
        body=f"Your match request for \"{item_name}\" was reviewed and not approved.",
        url="/my-reports",
        tag="lostlink-match-rejected",
    )


def someone_requested_your_item(owner_id: str, requester_name: str, item_name: str) -> None:
    """Fired when another user submits a match request involving the owner's item."""
    send_push(
        owner_id,
        title="Someone matched your item",
        body=f"{requester_name} submitted a match request involving your item \"{item_name}\".",
        url="/my-reports",
        tag="lostlink-match-request",
    )


def new_message(
    recipient_id: str,
    sender_name: str,
    conversation_id: str,
    *,
    is_first_message: bool = False,
) -> None:
    """
    Fired when a message is sent and the recipient is not actively in the WS room.

    `is_first_message=True` changes the copy to "opened a conversation with you"
    so the first ping feels different from subsequent message pings.
    """
    if is_first_message:
        title = f"{sender_name} started a conversation"
        body  = "You have a new conversation waiting in LostLink."
    else:
        title = f"New message from {sender_name}"
        body  = "You have an unread message in LostLink."

    send_push(
        recipient_id,
        title=title,
        body=body,
        url=f"/messages/{conversation_id}",
        tag=f"lostlink-msg-{conversation_id}",
    )


def item_closed(user_id: str, item_name: str) -> None:
    """Fired for the non-requesting party when a match is approved and their item is closed."""
    send_push(
        user_id,
        title="Your item has been closed",
        body=f"Your item \"{item_name}\" was marked as recovered/closed after a successful match.",
        url="/my-reports",
        tag="lostlink-item-closed",
    )


def password_changed(user_id: str) -> None:
    """Security notice fired after a successful password change."""
    send_push(
        user_id,
        title="Password changed",
        body="Your LostLink password was just updated. If this wasn't you, contact support immediately.",
        url="/settings",
        tag="lostlink-password-changed",
    )


# ── Admin-only events ─────────────────────────────────────────────────────────

def admin_match_pending(match_id: str) -> None:
    """Fired when a user submits a new match request that needs admin review."""
    notify_admins(
        title="New match request",
        body="A match request is waiting for your review.",
        url="/admin/matches",
        tag=f"lostlink-admin-match-{match_id}",
    )


def admin_report_pending(report_id: str) -> None:
    """Fired when a user submits an abuse report."""
    notify_admins(
        title="New abuse report",
        body="An abuse report has been submitted and needs review.",
        url="/admin/reports",
        tag=f"lostlink-admin-report-{report_id}",
    )


def admin_new_item(item_name: str, item_type: str) -> None:
    """Optional: fired when a new lost or found item is posted on campus."""
    notify_admins(
        title=f"New {item_type} item posted",
        body=f"\"{item_name}\" was just reported as {item_type} on campus.",
        url="/dashboard",
        tag="lostlink-admin-new-item",
    )

