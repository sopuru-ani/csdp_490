"""
routers/admin.py

Audit logs and abuse report management.

ENDPOINTS:
  GET  /admin/audit-logs              — paginated audit log (admin only)
  POST /report                        — submit an abuse report
  GET  /admin/reports                 — list pending abuse reports (admin only)
  PUT  /admin/reports/{report_id}/review — mark a report reviewed/dismissed (admin only)
"""

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

router = APIRouter(tags=["admin"])


# ── Request models ────────────────────────────────────────────────────────────

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

        return {
            "message":   "Report submitted. Our team will review it shortly.",
            "report_id": result.data[0]["id"],
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
