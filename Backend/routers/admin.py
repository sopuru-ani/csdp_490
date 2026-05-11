"""
routers/admin.py

Audit logs, abuse report management, and support issue management.

ENDPOINTS:
  GET   /admin/audit-logs                  — paginated audit log (admin only)
  POST  /report                            — submit an abuse report
  GET   /admin/reports                     — list pending abuse reports (admin only)
  PUT   /admin/reports/{report_id}/review  — mark a report reviewed/dismissed (admin only)
  GET   /admin/issues                      — list all issue reports (admin only)
  PATCH /admin/issues/{issue_id}           — update status / admin_notes (admin only)
  GET   /admin/tickets                     — list all support tickets with counts (admin only)
  GET   /admin/tickets/{ticket_id}         — full ticket detail with signed attachment URLs (admin only)
  PATCH /admin/tickets/{ticket_id}         — update ticket status / admin_notes (admin only)
"""

import html as html_module
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel

from routers.dependencies import (
    db_supabase,
    limiter,
    get_current_user,
    require_admin,
    log_action,
)
import routers.notifications as notifications

router = APIRouter(tags=["admin"])


# ── Request models ────────────────────────────────────────────────────────────

class IssueReviewBody(BaseModel):
    status: Optional[str] = None
    admin_notes: Optional[str] = None


class TicketUpdateBody(BaseModel):
    status: Optional[str] = None
    admin_notes: Optional[str] = None


class AbuseReportCreate(BaseModel):
    target_type: str              # "message", "user", or "item"
    target_id: str
    reported_user_id: Optional[str] = None
    reason: str
    details: Optional[str] = None


class ReportReviewBody(BaseModel):
    decision: str                 # "reviewed" or "dismissed"


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/admin/audit-logs")
def get_audit_logs(current_user=Depends(require_admin)):
    try:
        response = db_supabase.table("audit_logs") \
            .select("*, actor:users!audit_logs_actor_id_fkey(first_name, last_name, email)") \
            .order("created_at", desc=True) \
            .limit(200) \
            .execute()

        return {"logs": response.data}

    except Exception as e:
        print("AUDIT LOGS ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/report")
@limiter.limit("5/minute")
def submit_abuse_report(
    request: Request,
    body: AbuseReportCreate,
    current_user=Depends(get_current_user),
):
    valid_types   = ["message", "user", "item"]
    valid_reasons = ["spam", "harassment", "false_claim", "inappropriate", "other"]

    if body.target_type not in valid_types:
        raise HTTPException(status_code=400, detail="Invalid target type")
    if body.reason not in valid_reasons:
        raise HTTPException(status_code=400, detail="Invalid reason")
    if body.reported_user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="You cannot report yourself")

    try:
        existing = db_supabase.table("abuse_reports") \
            .select("id") \
            .eq("reporter_id", current_user["id"]) \
            .eq("target_id", body.target_id) \
            .eq("status", "pending") \
            .execute()

        if existing.data:
            raise HTTPException(status_code=400, detail="You already have a pending report for this item.")

        result = db_supabase.table("abuse_reports").insert({
            "reporter_id":      current_user["id"],
            "reported_user_id": body.reported_user_id,
            "target_type":      body.target_type,
            "target_id":        body.target_id,
            "reason":           body.reason,
            "details":          body.details,
            "status":           "pending",
        }).execute()

        log_action(
            actor_id=current_user["id"],
            action="report_submitted",
            target_type=body.target_type,
            target_id=body.target_id,
            details={"reason": body.reason, "target_type": body.target_type},
        )

        report_id = result.data[0]["id"]
        notifications.admin_report_pending(report_id)

        return {
            "message":   "Report submitted. Our team will review it shortly.",
            "report_id": report_id,
        }

    except HTTPException:
        raise
    except Exception as e:
        print("SUBMIT REPORT ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/reports")
def get_abuse_reports(current_user=Depends(require_admin)):
    try:
        response = db_supabase.table("abuse_reports") \
            .select("""
                *,
                reporter:users!abuse_reports_reporter_id_fkey(first_name, last_name, email),
                reported_user:users!abuse_reports_reported_user_id_fkey(first_name, last_name, email)
            """) \
            .eq("status", "pending") \
            .order("created_at", desc=True) \
            .execute()

        return {"reports": response.data}

    except Exception as e:
        print("GET REPORTS ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/admin/reports/{report_id}/review")
def review_abuse_report(
    report_id: str,
    body: ReportReviewBody,
    current_user=Depends(require_admin),
):
    if body.decision not in ["reviewed", "dismissed"]:
        raise HTTPException(status_code=400, detail="Decision must be 'reviewed' or 'dismissed'")

    try:
        response = db_supabase.table("abuse_reports") \
            .update({
                "status":      body.decision,
                "reviewed_by": current_user["id"],
                "reviewed_at": datetime.utcnow().isoformat(),
            }) \
            .eq("id", report_id) \
            .execute()

        if not response.data:
            raise HTTPException(status_code=404, detail="Report not found")

        log_action(
            actor_id=current_user["id"],
            action=f"report_{body.decision}",
            target_type="abuse_report",
            target_id=report_id,
            details={"decision": body.decision},
        )

        return {"message": f"Report {body.decision} successfully."}

    except HTTPException:
        raise
    except Exception as e:
        print("REVIEW REPORT ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/issues")
def get_all_issues(
    status: Optional[str] = None,
    issue_type: Optional[str] = None,
    current_user=Depends(require_admin),
):
    try:
        query = db_supabase.table("issue_reports") \
            .select("""
                *,
                reporter:users!issue_reports_reporter_id_fkey(first_name, last_name, email),
                attachments:issue_report_attachments(id, storage_path)
            """) \
            .order("created_at", desc=True)

        if status:
            query = query.eq("status", status)
        if issue_type:
            query = query.eq("issue_type", issue_type)

        issues = query.execute().data or []

        for issue in issues:
            if issue.get("is_anonymous"):
                issue["reporter"] = None

        return {"issues": issues}

    except Exception as e:
        print("GET ALL ISSUES ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/admin/issues/{issue_id}")
def review_issue(
    issue_id: str,
    body: IssueReviewBody,
    current_user=Depends(require_admin),
):
    valid_statuses = {"open", "in_progress", "resolved", "closed"}
    if body.status and body.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"status must be one of: {sorted(valid_statuses)}")

    try:
        updates = {}
        if body.status is not None:
            updates["status"] = body.status
        if body.admin_notes is not None:
            updates["admin_notes"] = body.admin_notes
        if body.status == "resolved":
            updates["resolved_at"] = datetime.utcnow().isoformat()
            updates["resolved_by"] = current_user["id"]

        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")

        response = db_supabase.table("issue_reports") \
            .update(updates) \
            .eq("id", issue_id) \
            .execute()

        if not response.data:
            raise HTTPException(status_code=404, detail="Issue not found")

        log_action(
            actor_id=current_user["id"],
            action="issue_reviewed",
            target_type="issue_report",
            target_id=issue_id,
            details={"status": body.status},
        )

        return {"message": "Issue updated.", "issue_id": issue_id}

    except HTTPException:
        raise
    except Exception as e:
        print("REVIEW ISSUE ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))


# ── Ticket endpoints (full-featured admin view) ───────────────────────────────

_TICKET_STATUSES = {"open", "under_review", "resolved", "dismissed"}


@router.get("/admin/tickets")
def get_all_tickets(
    status: Optional[str] = None,
    issue_type: Optional[str] = None,
    current_user=Depends(require_admin),
):
    try:
        query = db_supabase.table("issue_reports") \
            .select("""
                id, ticket_number, issue_type, status, is_anonymous, created_at,
                reporter:users!issue_reports_reporter_id_fkey(first_name, last_name, email)
            """) \
            .order("created_at", desc=True)

        if status:
            query = query.eq("status", status)
        if issue_type:
            query = query.eq("issue_type", issue_type)

        tickets = query.execute().data or []

        # Attachment counts via issue_attachments polymorphic table
        if tickets:
            ticket_ids = [t["id"] for t in tickets]
            att_resp = db_supabase.table("issue_attachments") \
                .select("source_id") \
                .in_("source_id", ticket_ids) \
                .eq("source_type", "issue_report") \
                .execute()
            att_counts = {}
            for row in (att_resp.data or []):
                att_counts[row["source_id"]] = att_counts.get(row["source_id"], 0) + 1
            for t in tickets:
                t["attachment_count"] = att_counts.get(t["id"], 0)

        # Global status counts (unaffected by current filter)
        all_statuses = db_supabase.table("issue_reports").select("status").execute().data or []
        counts = {s: 0 for s in _TICKET_STATUSES}
        for row in all_statuses:
            s = row.get("status")
            if s in counts:
                counts[s] += 1

        return {"tickets": tickets, "counts": counts}

    except Exception as e:
        print("GET ALL TICKETS ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/tickets/{ticket_id}")
def get_ticket_detail(ticket_id: str, current_user=Depends(require_admin)):
    try:
        response = db_supabase.table("issue_reports") \
            .select("*, reporter:users!issue_reports_reporter_id_fkey(first_name, last_name, email)") \
            .eq("id", ticket_id) \
            .single() \
            .execute()

        if not response.data:
            raise HTTPException(status_code=404, detail="Ticket not found")

        ticket = response.data

        # Fetch resolver name separately to avoid FK name uncertainty
        if ticket.get("resolved_by"):
            try:
                res = db_supabase.table("users") \
                    .select("first_name, last_name, email") \
                    .eq("id", ticket["resolved_by"]) \
                    .single() \
                    .execute()
                ticket["resolver"] = res.data
            except Exception:
                ticket["resolver"] = None

        # Attachments with signed URLs
        att_resp = db_supabase.table("issue_attachments") \
            .select("id, storage_path, created_at") \
            .eq("source_id", ticket_id) \
            .eq("source_type", "issue_report") \
            .execute()

        attachments = []
        for att in (att_resp.data or []):
            try:
                result = db_supabase.storage.from_("issue-attachments").create_signed_url(
                    path=att["storage_path"], expires_in=3600
                )
                att["signed_url"] = result["signedURL"]
            except Exception:
                att["signed_url"] = None
            attachments.append(att)
        ticket["attachments"] = attachments

        # Resolve referenced user
        if ticket.get("referenced_user_id"):
            try:
                res = db_supabase.table("users") \
                    .select("first_name, last_name, email") \
                    .eq("id", ticket["referenced_user_id"]) \
                    .single() \
                    .execute()
                ticket["referenced_user"] = res.data
            except Exception:
                ticket["referenced_user"] = None

        # Resolve referenced item
        if ticket.get("referenced_item_id"):
            try:
                res = db_supabase.table("items") \
                    .select("item_name, item_type") \
                    .eq("id", ticket["referenced_item_id"]) \
                    .single() \
                    .execute()
                ticket["referenced_item"] = res.data
            except Exception:
                ticket["referenced_item"] = None

        return {"ticket": ticket}

    except HTTPException:
        raise
    except Exception as e:
        print("GET TICKET DETAIL ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/admin/tickets/{ticket_id}")
def update_ticket(
    ticket_id: str,
    body: TicketUpdateBody,
    current_user=Depends(require_admin),
):
    if body.status and body.status not in _TICKET_STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of: {sorted(_TICKET_STATUSES)}")

    try:
        # Fetch existing row — need status, admin_notes, ticket_number, reporter_id
        old_resp = db_supabase.table("issue_reports") \
            .select("status, admin_notes, ticket_number, reporter_id") \
            .eq("id", ticket_id) \
            .single() \
            .execute()

        if not old_resp.data:
            raise HTTPException(status_code=404, detail="Ticket not found")

        old             = old_resp.data
        old_status      = old["status"]
        old_admin_notes = old.get("admin_notes")
        ticket_number   = old.get("ticket_number") or ticket_id[:8].upper()
        reporter_id     = old.get("reporter_id")

        # Change detection — skip write and email if nothing actually changed
        status_changed = body.status      is not None and body.status      != old_status
        notes_changed  = body.admin_notes is not None and body.admin_notes != old_admin_notes

        if not status_changed and not notes_changed:
            return {"message": "No changes detected", "ticket_id": ticket_id, "email_sent": False}

        # Build update payload
        updates = {}
        if status_changed:
            updates["status"] = body.status
        if notes_changed:
            updates["admin_notes"] = body.admin_notes
        if body.status in ("resolved", "dismissed"):
            updates["resolved_at"] = datetime.utcnow().isoformat()
            updates["resolved_by"] = current_user["id"]

        response = db_supabase.table("issue_reports") \
            .update(updates) \
            .eq("id", ticket_id) \
            .execute()

        if not response.data:
            raise HTTPException(status_code=404, detail="Ticket not found")

        updated_ticket = response.data[0]

        log_action(
            actor_id=current_user["id"],
            action="ticket_status_update",
            target_type="issue_report",
            target_id=ticket_id,
            details={
                "old_status":  old_status,
                "new_status":  body.status,
                "admin_notes": body.admin_notes,
            },
        )

        # ── Email notification ─────────────────────────────────────────────────
        email_sent = False
        if reporter_id:
            try:
                if notifications._email_pref_enabled(reporter_id, "ticket_update"):
                    reporter_email = notifications._get_user_email(reporter_id)
                    if reporter_email:
                        display_status = body.status.replace("_", " ").title() if body.status else ""
                        safe_notes     = html_module.escape(body.admin_notes or "")

                        if status_changed and notes_changed:
                            body_html = (
                                f"<p>Your support ticket <strong>{ticket_number}</strong> has been updated.</p>"
                                f"<p><strong>Status:</strong> {display_status}</p>"
                                f"<p><strong>Message from our team:</strong><br>{safe_notes}</p>"
                            )
                        elif status_changed:
                            body_html = (
                                f"<p>Your support ticket <strong>{ticket_number}</strong> has been updated.</p>"
                                f"<p><strong>Status:</strong> {display_status}</p>"
                            )
                        else:
                            body_html = (
                                f"<p>Your support ticket <strong>{ticket_number}</strong> "
                                f"has a new message from our team.</p>"
                                f"<p>{safe_notes}</p>"
                            )

                        notifications._send_email(
                            reporter_email,
                            subject=f"Update on your support ticket {ticket_number}",
                            html_body=notifications._wrap_email(body_html, cta_url="/report-issue"),
                        )
                        email_sent = True
            except Exception as e:
                print(f"TICKET EMAIL ERROR: {repr(e)}")

        return {
            "message":    "Ticket updated.",
            "ticket_id":  ticket_id,
            "ticket":     updated_ticket,
            "email_sent": email_sent,
        }

    except HTTPException:
        raise
    except Exception as e:
        print("UPDATE TICKET ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))
