"""
routers/messaging.py

WebSocket-based real-time messaging for matched users.

ENDPOINTS:
  WS   /ws/conversations/{conversation_id}   — real-time message stream
  GET  /conversations                         — list all conversations for the current user
  GET  /conversations/{id}/messages           — load message history
  POST /conversations/{id}/messages           — send a message (REST fallback)
  GET  /conversations/unread                  — unread count badge

HOW THE WEBSOCKET WORKS:
  1. Frontend connects:  new WebSocket("wss://your-backend/ws/conversations/{id}?token=...")
  2. Backend verifies the token from the query param (cookies don't travel with WS handshakes)
  3. The socket is registered in `room_manager` under the conversation_id
  4. When a user sends a message over the socket, it is:
       a) saved to the DB
       b) broadcast to every other open socket in that conversation room
  5. On disconnect the socket is cleanly removed from the room

WHY QUERY PARAM FOR AUTH:
  Browser WebSocket API does not support custom headers, so we can't send
  "Authorization: Bearer ..." the usual way.  Passing the token as a query
  param (?token=...) is the standard workaround for WS authentication.
  The frontend should read the token from wherever it stores it after login.

SCALING NOTE:
  `room_manager` is in-memory, which is fine for a single Render instance
  (capstone / soft-deploy scale).  If you ever horizontally scale,
  replace it with a Redis Pub/Sub broker.
"""

import os
import json
from typing import Optional
from datetime import datetime

import routers.notifications as notifications

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, Depends, Request
from pydantic import BaseModel
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

# ── Supabase ──────────────────────────────────────────────────────────────────
_url = os.getenv("SUPABASE_URL")
auth_supabase: Client = create_client(_url, os.getenv("SUPABASE_ANON_KEY"))
db_supabase:   Client = create_client(_url, os.getenv("SUPABASE_SERVICE_ROLE_KEY"))

# ── Router ────────────────────────────────────────────────────────────────────
router = APIRouter(tags=["messaging"])


# ── Room manager ──────────────────────────────────────────────────────────────
class RoomManager:
    """
    Tracks open WebSocket connections grouped by conversation_id.

    Structure:
        rooms = {
            "conv-uuid-1": {
                "user-uuid-A": <WebSocket>,
                "user-uuid-B": <WebSocket>,
            },
            ...
        }
    """

    def __init__(self):
        self.rooms: dict[str, dict[str, WebSocket]] = {}

    async def connect(self, conversation_id: str, user_id: str, websocket: WebSocket):
        # NOTE: websocket.accept() is called at the endpoint level before this,
        # so we just register the connection here
        if conversation_id not in self.rooms:
            self.rooms[conversation_id] = {}
        self.rooms[conversation_id][user_id] = websocket
        print(f"[WS] {user_id} connected to room {conversation_id}")

    def disconnect(self, conversation_id: str, user_id: str):
        room = self.rooms.get(conversation_id, {})
        room.pop(user_id, None)
        if not room:
            self.rooms.pop(conversation_id, None)
        print(f"[WS] {user_id} disconnected from room {conversation_id}")

    async def broadcast(self, conversation_id: str, payload: dict, exclude_user_id: str = None):
        """Send a message to everyone in the room except the sender."""
        room = self.rooms.get(conversation_id, {})
        dead = []
        for uid, ws in room.items():
            if uid == exclude_user_id:
                continue
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(uid)
        # Clean up any broken connections found during broadcast
        for uid in dead:
            room.pop(uid, None)


room_manager = RoomManager()


# ── Auth helper (token from query param for WS) ───────────────────────────────
def verify_token(token: str) -> dict:
    """
    Verifies a Supabase access token and returns the users-table row.
    Used for WebSocket connections where cookies can't be sent.
    """
    try:
        user_response = auth_supabase.auth.get_user(token)
        if not user_response.user:
            return None

        user_id = user_response.user.id
        db_user = db_supabase.table("users") \
            .select("*") \
            .eq("id", user_id) \
            .single() \
            .execute()

        return db_user.data or None
    except Exception as e:
        print("WS TOKEN VERIFY ERROR:", repr(e))
        return None


# ── Shared auth dependency for REST routes ────────────────────────────────────
def get_current_user(request: Request):
    access_token = request.cookies.get("access_token")
    if not access_token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            access_token = auth_header[len("Bearer "):]
    if not access_token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user = verify_token(access_token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid session")
    return user


# ── WebSocket endpoint ────────────────────────────────────────────────────────
@router.websocket("/ws/conversations/{conversation_id}")
async def conversation_websocket(
    websocket: WebSocket,
    conversation_id: str,
    token: Optional[str] = None
):
    import asyncio

    # ALWAYS accept first — you cannot send or close a WebSocket that hasn't
    # completed the HTTP upgrade handshake. Closing before accept silently
    # drops the connection on the client side with no useful error.
    await websocket.accept()

    # 1. Authenticate
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return

    # verify_token does synchronous Supabase calls — run in thread pool so
    # we don't block the event loop during auth
    current_user = await asyncio.to_thread(verify_token, token)
    if not current_user:
        await websocket.close(code=4001, reason="Invalid token")
        return

    user_id = current_user["id"]

    # 2. Confirm user belongs to this conversation (run in thread pool)
    def check_convo():
        return db_supabase.table("conversations") \
            .select("id") \
            .eq("id", conversation_id) \
            .or_(f"user_one_id.eq.{user_id},user_two_id.eq.{user_id}") \
            .single() \
            .execute()

    convo = await asyncio.to_thread(check_convo)
    if not convo.data:
        await websocket.close(code=4003, reason="Not your conversation")
        return

    # 3. Register connection
    await room_manager.connect(conversation_id, user_id, websocket)

    try:
        while True:
            # 4. Wait for a message from this client
            raw = await websocket.receive_text()

            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"error": "Invalid JSON"})
                continue

            content = (data.get("content") or "").strip()
            if not content:
                await websocket.send_json({"error": "Empty message"})
                continue

            # 5. Save to DB in thread pool — don't block the event loop
            def save_message():
                return db_supabase.table("messages").insert({
                    "conversation_id": conversation_id,
                    "sender_id": user_id,
                    "content": content,
                }).execute()

            insert = await asyncio.to_thread(save_message)
            saved_message = insert.data[0]

            # 6. Build the payload both sides receive
            payload = {
                "type": "message",
                "data": {
                    **saved_message,
                    "sender": {
                        "id": user_id,
                        "first_name": current_user["first_name"],
                        "last_name": current_user["last_name"],
                    }
                }
            }

            # 7. Echo back to sender so their UI updates immediately
            await websocket.send_json(payload)

            # 8. Broadcast to the other participant
            await room_manager.broadcast(conversation_id, payload, exclude_user_id=user_id)

            # 9. Push notification to the recipient if they are not in the WS room
            def push_to_recipient():
                conv = db_supabase.table("conversations") \
                    .select("user_one_id, user_two_id") \
                    .eq("id", conversation_id) \
                    .single() \
                    .execute()
                if not conv.data:
                    return
                one, two = conv.data["user_one_id"], conv.data["user_two_id"]
                recipient_id = two if one == user_id else one

                # Skip push if recipient is already reading the conversation live
                if recipient_id in room_manager.rooms.get(conversation_id, {}):
                    return

                # Detect first message so copy reads "started a conversation"
                count_res = db_supabase.table("messages") \
                    .select("id", count="exact") \
                    .eq("conversation_id", conversation_id) \
                    .execute()
                is_first = (count_res.count or 0) == 1

                sender_name = f"{current_user['first_name']} {current_user['last_name']}".strip()
                notifications.new_message(
                    recipient_id,
                    sender_name,
                    conversation_id,
                    is_first_message=is_first,
                )

            await asyncio.to_thread(push_to_recipient)

    except WebSocketDisconnect:
        room_manager.disconnect(conversation_id, user_id)
    except Exception as e:
        # Catch unexpected errors so the room is always cleaned up
        print(f"[WS] Unexpected error for {user_id}:", repr(e))
        room_manager.disconnect(conversation_id, user_id)


# ── REST routes ───────────────────────────────────────────────────────────────

@router.get("/conversations")
def get_my_conversations(current_user=Depends(get_current_user)):
    """List all conversations the current user is part of."""
    try:
        user_id = current_user["id"]

        response = db_supabase.table("conversations") \
            .select("""
                *,
                match:matches(
                    similarity_score,
                    source_item:items!matches_source_item_id_fkey(item_name, item_type),
                    matched_item:items!matches_matched_item_id_fkey(item_name, item_type)
                ),
                user_one:users!conversations_user_one_id_fkey(id, first_name, last_name),
                user_two:users!conversations_user_two_id_fkey(id, first_name, last_name)
            """) \
            .or_(f"user_one_id.eq.{user_id},user_two_id.eq.{user_id}") \
            .order("created_at", desc=True) \
            .execute()

        return {"conversations": response.data}

    except Exception as e:
        print("GET CONVERSATIONS ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/conversations/unread")
def get_unread_count(current_user=Depends(get_current_user)):
    """Return the total count of unread messages across all conversations."""
    try:
        user_id = current_user["id"]

        convos = db_supabase.table("conversations") \
            .select("id") \
            .or_(f"user_one_id.eq.{user_id},user_two_id.eq.{user_id}") \
            .execute()

        if not convos.data:
            return {"unread": 0}

        convo_ids = [c["id"] for c in convos.data]

        unread = db_supabase.table("messages") \
            .select("id", count="exact") \
            .in_("conversation_id", convo_ids) \
            .eq("read", False) \
            .neq("sender_id", user_id) \
            .execute()

        return {"unread": unread.count or 0}

    except Exception as e:
        print("UNREAD COUNT ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/conversations/{conversation_id}/messages")
def get_messages(
    conversation_id: str,
    current_user=Depends(get_current_user)
):
    """
    Fetch message history for a conversation and mark unread messages as read.
    The frontend calls this once on load to populate the chat window;
    after that, live updates come through the WebSocket.
    """
    try:
        user_id = current_user["id"]

        convo = db_supabase.table("conversations") \
            .select("*") \
            .eq("id", conversation_id) \
            .or_(f"user_one_id.eq.{user_id},user_two_id.eq.{user_id}") \
            .single() \
            .execute()

        if not convo.data:
            raise HTTPException(status_code=403, detail="Not your conversation")

        messages = db_supabase.table("messages") \
            .select("*, sender:users!messages_sender_id_fkey(id, first_name, last_name)") \
            .eq("conversation_id", conversation_id) \
            .order("created_at", desc=False) \
            .execute()

        # Mark unread messages from the other person as read
        unread_check = db_supabase.table("messages") \
            .select("id") \
            .eq("conversation_id", conversation_id) \
            .eq("read", False) \
            .neq("sender_id", user_id) \
            .execute()

        if unread_check.data:
            db_supabase.table("messages") \
                .update({"read": True}) \
                .eq("conversation_id", conversation_id) \
                .neq("sender_id", user_id) \
                .execute()

        return {"messages": messages.data}

    except HTTPException:
        raise
    except Exception as e:
        print("GET MESSAGES ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))


class SendMessageBody(BaseModel):
    content: str


@router.post("/conversations/{conversation_id}/messages")
def send_message_rest(
    conversation_id: str,
    body: SendMessageBody,
    current_user=Depends(get_current_user)
):
    """
    REST fallback for sending messages.
    Prefer the WebSocket endpoint — this exists for environments where
    WebSockets are unavailable (e.g. some automated tests, curl).
    """
    try:
        user_id = current_user["id"]

        if not body.content.strip():
            raise HTTPException(status_code=400, detail="Message cannot be empty")

        convo = db_supabase.table("conversations") \
            .select("*") \
            .eq("id", conversation_id) \
            .or_(f"user_one_id.eq.{user_id},user_two_id.eq.{user_id}") \
            .single() \
            .execute()

        if not convo.data:
            raise HTTPException(status_code=403, detail="Not your conversation")

        result = db_supabase.table("messages").insert({
            "conversation_id": conversation_id,
            "sender_id": user_id,
            "content": body.content.strip()
        }).execute()

        # Push notification — skip if recipient is live in the WS room
        one, two = convo.data["user_one_id"], convo.data["user_two_id"]
        recipient_id = two if one == user_id else one
        if recipient_id not in room_manager.rooms.get(conversation_id, {}):
            count_res = db_supabase.table("messages") \
                .select("id", count="exact") \
                .eq("conversation_id", conversation_id) \
                .execute()
            is_first = (count_res.count or 0) == 1
            sender_name = f"{current_user['first_name']} {current_user['last_name']}".strip()
            notifications.new_message(
                recipient_id,
                sender_name,
                conversation_id,
                is_first_message=is_first,
            )

        return {"message": "Sent", "data": result.data[0]}

    except HTTPException:
        raise
    except Exception as e:
        print("SEND MESSAGE ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))