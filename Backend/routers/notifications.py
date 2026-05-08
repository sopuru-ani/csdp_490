"""
routers/notifications.py

Central notification dispatcher for LostLink.
Handles both web-push and email delivery for every event type.

All public functions are fire-and-forget: they log errors but never raise,
so a notification failure never interrupts the request that triggered it.

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
  admin_new_item(item_name, item_type)
"""

import html
import os
import json

import resend
from pywebpush import webpush, WebPushException
from dotenv import load_dotenv

from routers.pushsubs import get_subscriptions_for_user
from routers.dependencies import db_supabase

load_dotenv()

# ── VAPID (web push) ──────────────────────────────────────────────────────────

_VAPID_PRIVATE_KEY_B64 = os.getenv("VAPID_PRIVATE_KEY")
def decode_vapid_key(key_b64):
    if not key_b64:
        return None
    padding = 4 - (len(key_b64) % 4)
    if padding != 4:
        key_b64 += "=" * padding
    return key_b64

_VAPID_PRIVATE_KEY   = decode_vapid_key(_VAPID_PRIVATE_KEY_B64)
_VAPID_CLAIMS_EMAIL  = os.getenv("VAPID_CLAIMS_EMAIL")

# ── Resend ────────────────────────────────────────────────────────────────────

_RESEND_API_KEY = os.getenv("RESEND_API_KEY")
_GMAIL_ADDRESS  = os.getenv("GMAIL_ADDRESS")   # used as display "from" address
_FRONTEND_URL   = os.getenv("FRONTEND_URL", "http://localhost:5173")

if _RESEND_API_KEY:
    resend.api_key = _RESEND_API_KEY


# ── Email helpers ─────────────────────────────────────────────────────────────

def _send_email(to_addr: str, subject: str, html_body: str) -> None:
    """Send a single HTML email via Resend. Never raises."""
    if not _RESEND_API_KEY:
        print("[EMAIL] Resend not configured — skipping")
        return
    try:
        from_addr = f"LostLink <{_GMAIL_ADDRESS}>" if _GMAIL_ADDRESS else "LostLink <onboarding@resend.dev>"
        resend.Emails.send({
            "from":    from_addr,
            "to":      [to_addr],
            "subject": subject,
            "html":    html_body,
        })
        print(f"[EMAIL] Sent '{subject}' to {to_addr}")
    except Exception as e:
        print(f"[EMAIL] send error: {repr(e)}")


def _get_user_email(user_id: str) -> str | None:
    """Return the email address stored in the users table, or None on error."""
    try:
        res = db_supabase.table("users").select("email").eq("id", user_id).execute()
        return res.data[0]["email"] if res.data else None
    except Exception as e:
        print(f"[EMAIL] _get_user_email error for {user_id}: {repr(e)}")
        return None


def _email_pref_enabled(user_id: str, pref_key: str) -> bool:
    """
    Return the user's email preference for `pref_key`.
    Defaults to True when no row exists (consistent with table DEFAULT true).
    """
    try:
        res = (
            db_supabase.table("email_preferences")
            .select(pref_key)
            .eq("user_id", user_id)
            .execute()
        )
        if res.data:
            return bool(res.data[0].get(pref_key, True))
    except Exception as e:
        print(f"[EMAIL] _email_pref_enabled error for {user_id}/{pref_key}: {repr(e)}")
    return True


def _email_if_enabled(user_id: str, pref_key: str, subject: str, html_body: str) -> None:
    """Check preference then send — the standard path for user-facing email events."""
    if not _email_pref_enabled(user_id, pref_key):
        return
    addr = _get_user_email(user_id)
    if addr:
        _send_email(addr, subject, html_body)


def _wrap_email(content_html: str, cta_url: str = "") -> str:
    """Minimal responsive HTML wrapper for outbound emails."""
    cta = (
        f'<p style="margin-top:20px">'
        f'<a href="{_FRONTEND_URL}{cta_url}" '
        f'style="background:#6366f1;color:#fff;padding:10px 20px;'
        f'border-radius:8px;text-decoration:none;font-size:14px">Open LostLink</a>'
        f"</p>"
        if cta_url else ""
    )
    return f"""
    <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px;color:#1f2937">
      <p style="font-size:20px;font-weight:700;margin-bottom:4px">LostLink</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin-bottom:20px">
      {content_html}
      {cta}
      <p style="margin-top:24px;font-size:12px;color:#9ca3af">
        You can manage email notification preferences in
        <a href="{_FRONTEND_URL}/settings" style="color:#6366f1">Settings</a>.
      </p>
    </div>
    """


# ── Core push sender ──────────────────────────────────────────────────────────

def send_push(
    user_id: str,
    title: str,
    body: str,
    url: str = "/dashboard",
    tag: str = "lostlink-default",
) -> None:
    """
    Persist a notification to the DB and push to every registered device for
    `user_id`.  Silently removes stale subscriptions (HTTP 404/410).
    Never raises — safe to call without a try/except wrapper.
    """
    try:
        db_supabase.table("notifications").insert({
            "user_id": user_id,
            "title":   title,
            "body":    body,
            "tag":     tag,
            "url":     url,
        }).execute()
    except Exception as e:
        print("[NOTIF] DB store error:", repr(e))

    if not _VAPID_PRIVATE_KEY or not _VAPID_CLAIMS_EMAIL:
        print("[PUSH] VAPID not configured — skipping notification")
        return

    subscriptions = get_subscriptions_for_user(user_id)
    dead_endpoints = []

    print(f"[PUSH] Sending notification to {user_id}: {len(subscriptions)} subscriptions")

    for sub in subscriptions:
        print(f"[PUSH] Sub keys: p256dh={sub['p256dh']}, auth={sub['auth']}")
        p256dh_padded = sub["p256dh"] + "=" * ((4 - len(sub["p256dh"]) % 4) % 4)
        auth_padded   = sub["auth"]   + "=" * ((4 - len(sub["auth"])   % 4) % 4)
        print(f"[PUSH] Padded: p256dh={p256dh_padded}, auth={auth_padded}")
        try:
            webpush(
                subscription_info={
                    "endpoint": sub["endpoint"],
                    "keys": {"p256dh": p256dh_padded, "auth": auth_padded},
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
            print(f"[PUSH] Successfully sent to {user_id} at {sub['endpoint']}")
        except WebPushException as e:
            print(f"[PUSH] WebPushException for {user_id}:", repr(e))
            status_code   = e.response.status_code if e.response is not None else None
            response_body = ""
            if e.response is not None:
                try:
                    response_body = e.response.text or ""
                except Exception:
                    response_body = ""

            is_vapid_mismatch = (
                status_code == 403
                and "vapid credentials" in response_body.lower()
                and "do not correspond" in response_body.lower()
            )

            if status_code in (404, 410) or is_vapid_mismatch:
                dead_endpoints.append(sub["endpoint"])
                if is_vapid_mismatch:
                    print(f"[PUSH] Removing stale subscription for {user_id} due to VAPID key mismatch")
        except Exception as e:
            print(f"[PUSH] Error for {user_id}:", repr(e))

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
    safe_name = html.escape(item_name)
    send_push(
        user_id,
        title="Potential matches found!",
        body=f"The AI found possible matches for your item: \"{item_name}\". Tap to review.",
        url="/my-reports",
        tag="lostlink-ai-matches",
    )
    _email_if_enabled(
        user_id, "ai_match_found",
        subject=f"Potential matches found for \"{item_name}\"",
        html_body=_wrap_email(
            f"<p>The AI found possible matches for your item <strong>{safe_name}</strong>.</p>"
            f"<p>Log in to review the suggestions and submit a match request if one looks right.</p>",
            cta_url="/my-reports",
        ),
    )


def match_request_approved(user_id: str, item_name: str) -> None:
    """Fired when an admin approves the user's match request."""
    safe_name = html.escape(item_name)
    send_push(
        user_id,
        title="Match approved! 🎉",
        body=f"Your match request for \"{item_name}\" was approved. A conversation has been opened.",
        url="/messages",
        tag="lostlink-match-approved",
    )
    _email_if_enabled(
        user_id, "match_approved",
        subject=f"Your match request for \"{item_name}\" was approved",
        html_body=_wrap_email(
            f"<p>Great news! Your match request for <strong>{safe_name}</strong> was approved.</p>"
            f"<p>A conversation has been opened so you can coordinate the return.</p>",
            cta_url="/messages",
        ),
    )


def match_request_rejected(user_id: str, item_name: str) -> None:
    """Fired when an admin rejects the user's match request."""
    safe_name = html.escape(item_name)
    send_push(
        user_id,
        title="Match request not approved",
        body=f"Your match request for \"{item_name}\" was reviewed and not approved.",
        url="/my-reports",
        tag="lostlink-match-rejected",
    )
    _email_if_enabled(
        user_id, "match_rejected",
        subject=f"Your match request for \"{item_name}\" was not approved",
        html_body=_wrap_email(
            f"<p>Your match request for <strong>{safe_name}</strong> was reviewed and not approved.</p>"
            f"<p>You can view your active reports and try a different match if available.</p>",
            cta_url="/my-reports",
        ),
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
    # No email preference column for this event — push only.


def new_message(
    recipient_id: str,
    sender_name: str,
    conversation_id: str,
    *,
    is_first_message: bool = False,
) -> None:
    """
    Fired when a message is sent and the recipient is not actively in the WS room.
    `is_first_message=True` changes copy to "opened a conversation with you".
    """
    if is_first_message:
        push_title = f"{sender_name} started a conversation"
        push_body  = "You have a new conversation waiting in LostLink."
        email_subj = f"{sender_name} started a conversation on LostLink"
        email_body = (
            f"<p><strong>{html.escape(sender_name)}</strong> opened a conversation with you.</p>"
            f"<p>Log in to reply.</p>"
        )
    else:
        push_title = f"New message from {sender_name}"
        push_body  = "You have an unread message in LostLink."
        email_subj = f"New message from {sender_name} on LostLink"
        email_body = (
            f"<p>You have a new message from <strong>{html.escape(sender_name)}</strong>.</p>"
            f"<p>Log in to read and reply.</p>"
        )

    send_push(
        recipient_id,
        title=push_title,
        body=push_body,
        url=f"/messages/{conversation_id}",
        tag=f"lostlink-msg-{conversation_id}",
    )
    _email_if_enabled(
        recipient_id, "new_message",
        subject=email_subj,
        html_body=_wrap_email(email_body, cta_url=f"/messages/{conversation_id}"),
    )


def item_closed(user_id: str, item_name: str) -> None:
    """Fired for the non-requesting party when a match is approved and their item is closed."""
    safe_name = html.escape(item_name)
    send_push(
        user_id,
        title="Your item has been closed",
        body=f"Your item \"{item_name}\" was marked as recovered/closed after a successful match.",
        url="/my-reports",
        tag="lostlink-item-closed",
    )
    _email_if_enabled(
        user_id, "item_closed",
        subject=f"Your item \"{item_name}\" has been closed",
        html_body=_wrap_email(
            f"<p>Your item <strong>{safe_name}</strong> was marked as recovered and closed "
            f"after a successful match.</p>",
            cta_url="/my-reports",
        ),
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
    # Always send — security event, no opt-out preference.
    addr = _get_user_email(user_id)
    if addr:
        _send_email(
            addr,
            subject="Your LostLink password was changed",
            html_body=_wrap_email(
                "<p>Your LostLink password was just updated.</p>"
                "<p>If this wasn't you, please contact support immediately.</p>",
                cta_url="/settings",
            ),
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
    # No email preference for this admin event — push only.


def admin_report_pending(report_id: str) -> None:
    """Fired when a user submits an abuse report."""
    notify_admins(
        title="New abuse report",
        body="An abuse report has been submitted and needs review.",
        url="/admin/reports",
        tag=f"lostlink-admin-report-{report_id}",
    )
    # No email preference for this admin event — push only.


def admin_new_item(item_name: str, item_type: str) -> None:
    """Fired when a new lost or found item is posted on campus."""
    safe_name = html.escape(item_name)
    safe_type = html.escape(item_type)
    notify_admins(
        title=f"New {item_type} item posted",
        body=f"\"{item_name}\" was just reported as {item_type} on campus.",
        url="/dashboard",
        tag="lostlink-admin-new-item",
    )
    # Email each admin who has new_report enabled
    for admin_id in _get_admin_ids():
        _email_if_enabled(
            admin_id, "new_report",
            subject=f"New {item_type} item reported: \"{item_name}\"",
            html_body=_wrap_email(
                f"<p>A new <strong>{safe_type}</strong> item was just posted on campus: "
                f"<strong>{safe_name}</strong>.</p>",
                cta_url="/dashboard",
            ),
        )
