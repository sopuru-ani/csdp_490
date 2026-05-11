"""
routers/issues.py

Support issue reporting.

ENDPOINTS:
  POST /issues/           — submit an issue report (authenticated)
  GET  /issues/           — current user's submitted issues
  GET  /issues/{issue_id} — full detail of a single issue (owned by current user)
"""

import json
import uuid
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, Request, Depends, UploadFile

from routers.dependencies import (
    db_supabase,
    limiter,
    get_current_user,
    log_action,
)

router = APIRouter(tags=["issues"])

_VALID_ISSUE_TYPES = {"bug", "abuse_harassment", "inappropriate_content", "account_issue", "other"}


@router.post("/")
@limiter.limit("5/minute")
async def create_issue(
    request: Request,
    issue_type: str = Form(...),
    description: str = Form(...),
    is_anonymous: bool = Form(False),
    referenced_conversation_id: Optional[str] = Form(None),
    referenced_user_id: Optional[str] = Form(None),
    referenced_item_id: Optional[str] = Form(None),
    misleading_reasons: Optional[str] = Form(None),  # JSON-encoded string array
    affected_page: Optional[str] = Form(None),
    account_issue_subtype: Optional[str] = Form(None),
    files: List[UploadFile] = File(default=[]),
    current_user=Depends(get_current_user),
):
    if issue_type not in _VALID_ISSUE_TYPES:
        raise HTTPException(status_code=400, detail="Invalid issue_type")
    if len(description.strip()) < 20:
        raise HTTPException(status_code=400, detail="Description must be at least 20 characters")

    parsed_misleading_reasons = None
    if misleading_reasons:
        try:
            parsed = json.loads(misleading_reasons)
            if isinstance(parsed, list):
                parsed_misleading_reasons = parsed
        except Exception:
            pass

    try:
        result = db_supabase.table("issue_reports").insert({
            "reporter_id":                current_user["id"],
            "is_anonymous":               is_anonymous,
            "issue_type":                 issue_type,
            "description":                description.strip(),
            "referenced_conversation_id": referenced_conversation_id or None,
            "referenced_user_id":         referenced_user_id or None,
            "referenced_item_id":         referenced_item_id or None,
            "misleading_reasons":         parsed_misleading_reasons,
            "affected_page":              affected_page or None,
            "account_issue_subtype":      account_issue_subtype or None,
            "status":                     "open",
        }).execute()

        issue    = result.data[0]
        issue_id = issue["id"]

        # Upload attachments
        user_id = current_user["id"]
        today   = date.today().isoformat()

        attachment_rows = []
        for file in files:
            if not file.filename:
                continue
            storage_path = f"{user_id}/{today}/{uuid.uuid4()}_{file.filename}"
            file_bytes   = await file.read()
            try:
                db_supabase.storage.from_("issue-attachments").upload(
                    path=storage_path,
                    file=file_bytes,
                    file_options={"content-type": file.content_type or "application/octet-stream"},
                )
                attachment_rows.append({"issue_report_id": issue_id, "storage_path": storage_path})
            except Exception as e:
                print(f"ISSUE ATTACHMENT UPLOAD ERROR: {repr(e)}")

        if attachment_rows:
            db_supabase.table("issue_report_attachments").insert(attachment_rows).execute()

        log_action(
            actor_id=current_user["id"],
            action="issue_submitted",
            target_type="issue_report",
            target_id=issue_id,
            details={"issue_type": issue_type},
        )

        return {
            "message":       "Issue submitted. Our team will review your report.",
            "ticket_number": issue.get("ticket_number"),
            "issue_id":      issue_id,
        }

    except HTTPException:
        raise
    except Exception as e:
        print("CREATE ISSUE ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/")
def get_my_issues(current_user=Depends(get_current_user)):
    try:
        response = db_supabase.table("issue_reports") \
            .select("id, ticket_number, issue_type, status, created_at") \
            .eq("reporter_id", current_user["id"]) \
            .order("created_at", desc=True) \
            .execute()

        return {"issues": response.data}

    except Exception as e:
        print("GET MY ISSUES ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{issue_id}")
def get_issue_detail(issue_id: str, current_user=Depends(get_current_user)):
    try:
        response = db_supabase.table("issue_reports") \
            .select("*, attachments:issue_report_attachments(id, storage_path, created_at)") \
            .eq("id", issue_id) \
            .eq("reporter_id", current_user["id"]) \
            .single() \
            .execute()

        if not response.data:
            raise HTTPException(status_code=404, detail="Issue not found")

        return {"issue": response.data}

    except HTTPException:
        raise
    except Exception as e:
        print("GET ISSUE DETAIL ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))
