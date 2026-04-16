"""
routers/matches.py

AI-powered item matching and match request/review workflow.

ENDPOINTS:
  GET  /items/{item_id}/matches          — run AI matching for an item
  POST /items/{item_id}/matches/request  — submit a match request
  GET  /items/my-matches                 — current user's match requests
  GET  /admin/matches                    — all pending matches (admin)
  PUT  /admin/matches/{match_id}/review  — approve or reject a match (admin)
  GET  /admin/matches/completed          — approved matches (admin)
"""

import os
import json
import asyncio
from datetime import datetime
from typing import Optional

import httpx
import google.generativeai as genai
from google.generativeai import types
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from dotenv import load_dotenv

from routers.dependencies import (
    db_supabase,
    limiter,
    get_current_user,
    require_admin,
    log_action,
)
import routers.notifications as notifications

load_dotenv()

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
_gemini = genai.GenerativeModel("gemini-2.5-flash-lite")

router = APIRouter(tags=["matches"])


# ── Request models ────────────────────────────────────────────────────────────

class MatchReviewBody(BaseModel):
    decision: str  # "approved" or "rejected"


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/items/my-matches")
def get_my_matches(current_user=Depends(get_current_user)):
    try:
        response = db_supabase.table("matches") \
            .select("*, source_item:items!matches_source_item_id_fkey(*), matched_item:items!matches_matched_item_id_fkey(*)") \
            .eq("requested_by", current_user["id"]) \
            .order("created_at", desc=True) \
            .execute()

        return {"matches": response.data}

    except Exception as e:
        print("GET MY MATCHES ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/matches/completed")
def get_completed_matches(current_user=Depends(require_admin)):
    try:
        response = db_supabase.table("matches") \
            .select("*, source_item:items!matches_source_item_id_fkey(*), matched_item:items!matches_matched_item_id_fkey(*), requester:users!matches_requested_by_fkey(first_name, last_name, email)") \
            .eq("status", "approved") \
            .order("reviewed_at", desc=True) \
            .execute()

        return {"matches": response.data}

    except Exception as e:
        print("GET COMPLETED MATCHES ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/matches")
def get_all_matches(current_user=Depends(require_admin)):
    try:
        response = db_supabase.table("matches") \
            .select("*, source_item:items!matches_source_item_id_fkey(*), matched_item:items!matches_matched_item_id_fkey(*), requester:users!matches_requested_by_fkey(first_name, last_name, email)") \
            .eq("status", "pending") \
            .order("created_at", desc=True) \
            .execute()

        return {"matches": response.data}

    except Exception as e:
        print("GET ALL MATCHES ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/admin/matches/{match_id}/review")
def review_match(
    match_id: str,
    body: MatchReviewBody,
    current_user=Depends(require_admin),
):
    if body.decision not in ["approved", "rejected"]:
        raise HTTPException(status_code=400, detail="Decision must be 'approved' or 'rejected'")

    try:
        match_response = db_supabase.table("matches") \
            .select("*") \
            .eq("id", match_id) \
            .single() \
            .execute()

        if not match_response.data:
            raise HTTPException(status_code=404, detail="Match not found")

        match = match_response.data

        db_supabase.table("matches").update({
            "status":      body.decision,
            "reviewed_by": current_user["id"],
            "reviewed_at": datetime.utcnow().isoformat(),
        }).eq("id", match_id).execute()

        log_action(
            actor_id=current_user["id"],
            action=f"match_{body.decision}",
            target_type="match",
            target_id=match_id,
            details={"decision": body.decision, "similarity_score": match.get("similarity_score")},
        )

        if body.decision == "approved":
            db_supabase.table("items").update({"status": "closed"}).eq("id", match["source_item_id"]).execute()
            db_supabase.table("items").update({"status": "closed"}).eq("id", match["matched_item_id"]).execute()

            source  = db_supabase.table("items").select("user_id, item_name").eq("id", match["source_item_id"]).single().execute()
            matched = db_supabase.table("items").select("user_id, item_name").eq("id", match["matched_item_id"]).single().execute()

            db_supabase.table("conversations").insert({
                "match_id":     match_id,
                "user_one_id":  source.data["user_id"],
                "user_two_id":  matched.data["user_id"],
            }).execute()

            # Notify requester their match was approved
            notifications.match_request_approved(
                match["requested_by"],
                source.data["item_name"],
            )
            # Notify the matched-item owner their item was closed
            if matched.data["user_id"] != match["requested_by"]:
                notifications.item_closed(
                    matched.data["user_id"],
                    matched.data["item_name"],
                )

        elif body.decision == "rejected":
            source = db_supabase.table("items").select("item_name").eq("id", match["source_item_id"]).single().execute()
            notifications.match_request_rejected(
                match["requested_by"],
                source.data["item_name"],
            )

        return {"message": f"Match {body.decision} successfully.", "match_id": match_id}

    except HTTPException:
        raise
    except Exception as e:
        print("REVIEW MATCH ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/items/{item_id}/matches")
@limiter.limit("5/minute")
@limiter.limit("30/day")
async def find_matches(
    request: Request,
    item_id: str,
    current_user=Depends(get_current_user),
):
    try:
        # 1. Fetch source item
        item_response = db_supabase.table("items") \
            .select("*") \
            .eq("id", item_id) \
            .eq("user_id", current_user["id"]) \
            .single() \
            .execute()

        if not item_response.data:
            raise HTTPException(status_code=404, detail="Item not found or not yours")

        source_item   = item_response.data
        opposite_type = "found" if source_item["item_type"] == "lost" else "lost"

        # 2. Fetch candidates — category match first, fall back to all
        candidates_response = db_supabase.table("items") \
            .select("*") \
            .eq("item_type", opposite_type) \
            .eq("category", source_item["category"]) \
            .eq("status", "open") \
            .neq("user_id", current_user["id"]) \
            .execute()

        candidates = candidates_response.data

        if not candidates:
            candidates = db_supabase.table("items") \
                .select("*") \
                .eq("item_type", opposite_type) \
                .eq("status", "open") \
                .neq("user_id", current_user["id"]) \
                .execute().data

        if not candidates:
            return {"matches": [], "message": "No items to compare against yet."}

        # 3. Build text prompt
        source_summary = f"""Item type: {source_item['item_type']}
Name: {source_item['item_name']}
Category: {source_item['category']}
Description: {source_item['description']}
Location: {source_item['location']}"""

        candidates_text = ""
        for i, c in enumerate(candidates):
            candidates_text += f"""
Candidate {i + 1}:
ID: {c['id']}
Name: {c['item_name']}
Category: {c['category']}
Description: {c['description']}
Location: {c['location']}
---"""

        image_paths = source_item.get("image_paths") or []
        has_images  = len(image_paths) > 0
        image_note  = "Photos of the target item are attached — use them alongside the text descriptions when scoring candidates." if has_images else ""

        prompt = f"""You are an AI assistant for a university lost and found system.
{image_note}

A student is looking for matches for their {source_item['item_type']} item.

TARGET ITEM:
{source_summary}

CANDIDATE ITEMS ({opposite_type} items to compare against):
{candidates_text}

Identify which candidates are likely matches. Consider item name, category, description, location{', and the attached photos' if has_images else ''}.

Return a JSON array ordered from most to least likely match.
Only include candidates scoring 40 or above. Return at most 5.

Each entry must have:
- "id": the candidate's ID
- "score": 0 to 100
- "reason": 1-2 sentences explaining the match

Respond ONLY with valid JSON. No markdown, no code fences, no extra text.
If no reasonable matches exist, return: []"""

        # 4. Fetch source item images
        contents      = []
        images_added  = 0

        async with httpx.AsyncClient(timeout=10) as http:
            for path in image_paths[:3]:
                try:
                    signed  = db_supabase.storage.from_("item-images").create_signed_url(path=path, expires_in=300)
                    img_res = await http.get(signed["signedURL"])
                    if img_res.status_code == 200:
                        mime = img_res.headers.get("content-type", "image/jpeg").split(";")[0]
                        contents.append(types.Part.from_bytes(data=img_res.content, mime_type=mime))
                        images_added += 1
                except Exception as e:
                    print("IMAGE FETCH ERROR:", repr(e))

        contents.append(prompt)

        # 5. Call Gemini
        response = _gemini.generate_content(contents)
        raw      = response.text.strip()

        # 6. Parse JSON response
        try:
            cleaned = raw.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("```")[1]
                if cleaned.startswith("json"):
                    cleaned = cleaned[4:]
                cleaned = cleaned.strip()
            match_results = json.loads(cleaned)
        except json.JSONDecodeError:
            print("GEMINI RAW RESPONSE:", raw)
            raise HTTPException(status_code=500, detail="AI returned an unexpected response format.")

        # 7. Enrich matches with full item data + signed URLs
        candidates_by_id  = {c["id"]: c for c in candidates}
        enriched_matches  = []

        for match in match_results:
            item_data = candidates_by_id.get(match["id"])
            if item_data:
                matched_paths = item_data.get("image_paths") or []
                matched_urls  = []
                for path in matched_paths:
                    try:
                        result = db_supabase.storage.from_("item-images").create_signed_url(path=path, expires_in=3600)
                        matched_urls.append(result["signedURL"])
                    except Exception:
                        pass
                item_data["signed_urls"] = matched_urls
                enriched_matches.append({
                    "score":  match["score"],
                    "reason": match["reason"],
                    "item":   item_data,
                })

        # Notify the user on their other devices if matches were found
        if enriched_matches:
            asyncio.create_task(
                asyncio.to_thread(
                    notifications.ai_matches_found,
                    current_user["id"],
                    source_item["item_name"],
                )
            )

        return {
            "source_item_id": item_id,
            "matches":        enriched_matches,
            "images_used":    images_added,
        }

    except HTTPException:
        raise
    except Exception as e:
        print("MATCHING ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/items/{item_id}/matches/request")
def request_match(
    item_id: str,
    body: dict,
    current_user=Depends(get_current_user),
):
    matched_item_id  = body.get("matched_item_id")
    similarity_score = body.get("similarity_score")
    reason           = body.get("reason")

    if not matched_item_id:
        raise HTTPException(status_code=400, detail="matched_item_id is required")

    try:
        source = db_supabase.table("items") \
            .select("*") \
            .eq("id", item_id) \
            .eq("user_id", current_user["id"]) \
            .single() \
            .execute()

        if not source.data:
            raise HTTPException(status_code=404, detail="Item not found or not yours")

        existing = db_supabase.table("matches") \
            .select("id") \
            .eq("source_item_id", item_id) \
            .eq("matched_item_id", matched_item_id) \
            .eq("status", "pending") \
            .execute()

        if existing.data:
            raise HTTPException(status_code=400, detail="A match request for this pair already exists.")

        insert = db_supabase.table("matches").insert({
            "source_item_id":  item_id,
            "matched_item_id": matched_item_id,
            "similarity_score": similarity_score,
            "reason":          reason,
            "status":          "pending",
            "requested_by":    current_user["id"],
        }).execute()

        match_id = insert.data[0]["id"]

        log_action(
            actor_id=current_user["id"],
            action="match_requested",
            target_type="match",
            target_id=match_id,
            details={
                "source_item_id":  item_id,
                "matched_item_id": matched_item_id,
                "score":           similarity_score,
            },
        )

        # Notify the owner of the matched item
        matched_item = db_supabase.table("items").select("user_id, item_name").eq("id", matched_item_id).single().execute()
        if matched_item.data and matched_item.data["user_id"] != current_user["id"]:
            requester_name = f"{current_user['first_name']} {current_user['last_name']}".strip()
            notifications.someone_requested_your_item(
                matched_item.data["user_id"],
                requester_name,
                matched_item.data["item_name"],
            )

        # Notify admins a new match is pending review
        notifications.admin_match_pending(match_id)

        return {
            "message": "Match requested. An admin will review it shortly.",
            "match":   insert.data[0],
        }

    except HTTPException:
        raise
    except Exception as e:
        print("REQUEST MATCH ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))
