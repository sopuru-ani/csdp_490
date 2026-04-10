"""
routers/users.py

Handles all user-facing Settings page routes:
  PUT  /users/update-profile      — update display name and/or email
  PUT  /users/change-password     — change password (requires current password)
  PUT  /users/privacy-settings    — save privacy preferences to the DB
  DELETE /users/delete-account    — permanently delete the account

HOW ROUTERS WORK (quick explainer):
  Instead of putting every endpoint in main.py, we create an APIRouter here.
  The router collects routes exactly like app does in main.py — same decorators,
  same Depends(), same everything.  In main.py you just do:
      from routers import users
      app.include_router(users.router)
  FastAPI merges the router's routes into the app at startup.
  The prefix="/users" set below means every route here automatically starts with /users.
"""

import os
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel, EmailStr
from typing import Optional
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

# ── Supabase clients ──────────────────────────────────────────────────────────
# auth_supabase  → uses the anon key, handles Supabase Auth operations
# db_supabase    → uses the service role key, can read/write any table freely
_supabase_url = os.getenv("SUPABASE_URL")
auth_supabase: Client = create_client(_supabase_url, os.getenv("SUPABASE_ANON_KEY"))
db_supabase:   Client = create_client(_supabase_url, os.getenv("SUPABASE_SERVICE_ROLE_KEY"))

# ── Router ────────────────────────────────────────────────────────────────────
# prefix="/users"  → all routes below are automatically under /users/...
# tags=["users"]   → groups these endpoints together in the /docs page
router = APIRouter(prefix="/users", tags=["users"])


# ── Shared auth dependency ────────────────────────────────────────────────────
# This mirrors get_current_user from main.py so this router is self-contained.
# It reads the session cookie (or a Bearer token as fallback) and returns the
# user's row from your users table.  Every route that needs auth uses:
#   current_user = Depends(get_current_user)
def get_current_user(request: Request):
    access_token = request.cookies.get("access_token")

    # Bearer fallback — supports clients that can't send cookies
    if not access_token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            access_token = auth_header[len("Bearer "):]

    if not access_token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        user_response = auth_supabase.auth.get_user(access_token)
        if not user_response.user:
            raise HTTPException(status_code=401, detail="Invalid token")

        user_id = user_response.user.id

        db_user = db_supabase.table("users") \
            .select("*") \
            .eq("id", user_id) \
            .single() \
            .execute()

        if not db_user.data:
            raise HTTPException(status_code=404, detail="User record not found")

        return db_user.data

    except HTTPException:
        raise
    except Exception as e:
        print("GET CURRENT USER ERROR:", repr(e))
        raise HTTPException(status_code=401, detail="Invalid session")


# ── Request body models ───────────────────────────────────────────────────────

class UpdateProfileBody(BaseModel):
    name: str                        # full name string from the frontend e.g. "Jane Doe"
    email: Optional[EmailStr] = None # if omitted, email stays unchanged


class ChangePasswordBody(BaseModel):
    current_password: str
    new_password: str


class PrivacySettingsBody(BaseModel):
    showReportsPublicly: bool
    allowMessages: bool


# ── Routes ────────────────────────────────────────────────────────────────────

@router.put("/update-profile")
def update_profile(
    body: UpdateProfileBody,
    current_user=Depends(get_current_user)
):
    """
    Update the user's display name and optionally their email.
    The frontend sends a single 'name' string, so we split it here.
    Email changes are applied to both Supabase Auth and your users table.
    """
    # Split "Jane Doe" → first_name="Jane", last_name="Doe"
    parts = body.name.strip().split(" ", 1)
    first_name = parts[0]
    last_name = parts[1] if len(parts) > 1 else ""

    user_id = current_user["id"]

    try:
        # 1. Update your users table (name fields)
        updates = {
            "first_name": first_name,
            "last_name": last_name,
        }

        # 2. If email changed, update Supabase Auth too
        if body.email and body.email != current_user["email"]:
            try:
                auth_supabase.auth.update_user({"email": body.email})
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Email update failed: {str(e)}")
            updates["email"] = body.email

        db_supabase.table("users") \
            .update(updates) \
            .eq("id", user_id) \
            .execute()

        return {"message": "Profile updated successfully."}

    except HTTPException:
        raise
    except Exception as e:
        print("UPDATE PROFILE ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/change-password")
def change_password(
    body: ChangePasswordBody,
    current_user=Depends(get_current_user)
):
    """
    Change the user's password.
    We verify the current password by re-signing in with it first —
    Supabase Auth doesn't expose a 'verify password' method directly.
    """
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters.")

    try:
        # Step 1: verify the current password by attempting a sign-in
        verify = auth_supabase.auth.sign_in_with_password({
            "email": current_user["email"],
            "password": body.current_password
        })

        if not verify.user:
            raise HTTPException(status_code=401, detail="Current password is incorrect.")

        # Step 2: update to the new password
        auth_supabase.auth.update_user({"password": body.new_password})

        return {"message": "Password updated successfully."}

    except HTTPException:
        raise
    except Exception as e:
        # Supabase throws if sign-in fails — surface it as 401
        if "invalid" in str(e).lower() or "credentials" in str(e).lower():
            raise HTTPException(status_code=401, detail="Current password is incorrect.")
        print("CHANGE PASSWORD ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/privacy-settings")
def update_privacy_settings(
    body: PrivacySettingsBody,
    current_user=Depends(get_current_user)
):
    """
    Persist privacy preferences to the users table.
    Make sure your users table has 'show_reports_publicly' and 'allow_messages' columns.

    SQL to add them if missing:
        ALTER TABLE users ADD COLUMN IF NOT EXISTS show_reports_publicly BOOLEAN NOT NULL DEFAULT true;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS allow_messages BOOLEAN NOT NULL DEFAULT true;
    """
    try:
        db_supabase.table("users") \
            .update({
                "show_reports_publicly": body.showReportsPublicly,
                "allow_messages": body.allowMessages,
            }) \
            .eq("id", current_user["id"]) \
            .execute()

        return {"message": "Privacy settings saved."}

    except Exception as e:
        print("PRIVACY SETTINGS ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/delete-account")
def delete_account(current_user=Depends(get_current_user)):
    """
    Permanently deletes the user's account.
    Order matters — foreign-key constraints require deleting dependent data first.
    Adjust the cleanup order if your schema differs.
    """
    user_id = current_user["id"]

    try:
        # 1. Delete push subscriptions
        db_supabase.table("push_subscriptions").delete().eq("user_id", user_id).execute()

        # 2. Delete messages the user sent
        db_supabase.table("messages").delete().eq("sender_id", user_id).execute()

        # 3. Delete conversations the user is part of
        db_supabase.table("conversations") \
            .delete() \
            .or_(f"user_one_id.eq.{user_id},user_two_id.eq.{user_id}") \
            .execute()

        # 4. Delete match requests made by or involving this user's items
        db_supabase.table("matches").delete().eq("requested_by", user_id).execute()

        # 5. Delete items (storage cleanup handled below)
        items_res = db_supabase.table("items") \
            .select("image_paths") \
            .eq("user_id", user_id) \
            .execute()

        all_paths = []
        for item in (items_res.data or []):
            all_paths.extend(item.get("image_paths") or [])

        db_supabase.table("items").delete().eq("user_id", user_id).execute()

        if all_paths:
            try:
                db_supabase.storage.from_("item-images").remove(all_paths)
            except Exception as e:
                print("STORAGE CLEANUP ERROR on delete:", repr(e))

        # 6. Delete audit logs for this actor
        db_supabase.table("audit_logs").delete().eq("actor_id", user_id).execute()

        # 7. Delete the row from your users table
        db_supabase.table("users").delete().eq("id", user_id).execute()

        # 8. Delete from Supabase Auth (requires service role)
        auth_service: Client = create_client(
            _supabase_url,
            os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        )
        auth_service.auth.admin.delete_user(user_id)

        return {"message": "Account deleted successfully."}

    except HTTPException:
        raise
    except Exception as e:
        print("DELETE ACCOUNT ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))