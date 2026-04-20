"""
routers/auth.py

Authentication endpoints.

ENDPOINTS:
  POST /auth/signup      — register a new user
  POST /auth/login       — sign in, sets httpOnly cookies
  POST /auth/logout      — clears auth cookies
  POST /auth/refresh     — silently refresh access token via refresh_token cookie
  GET  /auth/token       — return the raw access token (used by WS auth)
  GET  /auth/userchecker — return the current user's profile
"""

import os
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException, Request, Response, Depends
from pydantic import BaseModel, EmailStr

from routers.dependencies import (
    auth_supabase,
    db_supabase,
    limiter,
    COOKIE_SECURE,
    COOKIE_SAMESITE,
    get_current_user,
)

_FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# ── Login attempt limiting ────────────────────────────────────────────────────

_MAX_ATTEMPTS    = 5
_LOCK_MINUTES    = 10


def _get_attempt_row(email: str):
    try:
        res = db_supabase.table("login_attempts") \
            .select("*").eq("email", email).limit(1).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        print("[AUTH] _get_attempt_row error:", repr(e))
        return None


def _is_locked(row) -> tuple[bool, str | None]:
    """Returns (locked, locked_until_iso). Treats expired locks as unlocked."""
    if not row or not row.get("locked_until"):
        return False, None
    lu = datetime.fromisoformat(row["locked_until"].replace("Z", "+00:00"))
    if lu > datetime.now(timezone.utc):
        return True, row["locked_until"]
    return False, None


def _effective_count(row) -> int:
    """Current failed count; resets to 0 if a previous lock has expired."""
    if not row:
        return 0
    if row.get("locked_until"):
        lu = datetime.fromisoformat(row["locked_until"].replace("Z", "+00:00"))
        if lu <= datetime.now(timezone.utc):
            return 0
    return row.get("failed_count", 0)


def _record_failure(email: str, current_count: int):
    new_count = current_count + 1
    locked_until = None
    if new_count >= _MAX_ATTEMPTS:
        locked_until = (
            datetime.now(timezone.utc) + timedelta(minutes=_LOCK_MINUTES)
        ).isoformat()

    data = {"email": email, "failed_count": new_count}
    if locked_until:
        data["locked_until"] = locked_until

    try:
        res = db_supabase.table("login_attempts").upsert(data).execute()
        print(f"[AUTH] recorded failure for {email}: count={new_count} locked_until={locked_until} res={res.data}")
    except Exception as e:
        print("[AUTH] login_attempts upsert error:", repr(e))
    return new_count, locked_until


def _clear_attempts(email: str):
    try:
        db_supabase.table("login_attempts") \
            .update({"failed_count": 0, "locked_until": None}) \
            .eq("email", email) \
            .execute()
    except Exception as e:
        print("[AUTH] login_attempts clear error:", repr(e))

router = APIRouter(prefix="/auth", tags=["auth"])


# ── Request models ────────────────────────────────────────────────────────────

class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    first_name: str
    last_name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/signup")
@limiter.limit("5/minute")
def signup(request: Request, request_data: SignupRequest):
    try:
        auth_response = auth_supabase.auth.sign_up({
            "email": request_data.email,
            "password": request_data.password,
            "options": {
                "data": {
                    "firstName": request_data.first_name,
                    "lastName":  request_data.last_name,
                }
            },
        })

        if not auth_response.user:
            raise HTTPException(status_code=400, detail="Signup failed: no user returned")

        user_id = auth_response.user.id

        db_supabase.table("users").insert({
            "id":         user_id,
            "first_name": request_data.first_name,
            "last_name":  request_data.last_name,
            "email":      request_data.email,
            "is_admin":   False,
        }).execute()

        return {
            "message": "Signup successful. Please check your email to confirm your account.",
            "user_id": user_id,
            "email":   auth_response.user.email,
        }

    except HTTPException:
        raise
    except Exception as e:
        print("SIGNUP ERROR:", repr(e))
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/login")
@limiter.limit("10/minute")
def login(request: Request, request_data: LoginRequest, response: Response):
    email = request_data.email.lower()

    # ── 1. Lockout check — must happen before Supabase Auth ──────────────────
    row = _get_attempt_row(email)
    locked, locked_until_iso = _is_locked(row)
    if locked:
        raise HTTPException(
            status_code=423,
            detail={"locked_until": locked_until_iso},
        )

    # ── 2. Attempt sign-in ────────────────────────────────────────────────────
    try:
        auth_response = auth_supabase.auth.sign_in_with_password({
            "email":    email,
            "password": request_data.password,
        })

        if not auth_response.user or not auth_response.session:
            raise Exception("Invalid credentials")

        # ── 3. Success — clear attempt counter ────────────────────────────────
        _clear_attempts(email)

        response.set_cookie(
            key="access_token",
            value=auth_response.session.access_token,
            httponly=True,
            secure=COOKIE_SECURE,
            samesite=COOKIE_SAMESITE,
            max_age=60 * 60,
        )
        response.set_cookie(
            key="refresh_token",
            value=auth_response.session.refresh_token,
            httponly=True,
            secure=COOKIE_SECURE,
            samesite=COOKIE_SAMESITE,
            max_age=60 * 60 * 24 * 7,
        )
        return {"message": "Login successful", "user": auth_response.user.email}

    except HTTPException:
        raise
    except Exception as e:
        print("LOGIN ERROR:", repr(e))

        # ── 4. Failure — record attempt, maybe lock ───────────────────────────
        count_before = _effective_count(row)
        new_count, new_locked_until = _record_failure(email, count_before)

        if new_locked_until:
            raise HTTPException(
                status_code=423,
                detail={"locked_until": new_locked_until},
            )

        remaining = _MAX_ATTEMPTS - new_count
        raise HTTPException(
            status_code=401,
            detail={"message": "Invalid credentials", "attempts_remaining": remaining},
        )


@router.post("/forgot-password")
@limiter.limit("3/minute")
def forgot_password(request: Request, request_data: ForgotPasswordRequest):
    print("REDIRECT TO:", _FRONTEND_URL + "/reset-password")
    try:
        auth_supabase.auth.reset_password_for_email(
            request_data.email,
            {"redirect_to": f"{_FRONTEND_URL}/reset-password"},
        )
    except Exception as e:
        print("FORGOT PASSWORD ERROR:", repr(e))
    # Always return the same message to avoid leaking which emails are registered
    return {"message": "If that email is registered, you'll receive a reset link shortly."}


@router.post("/reset-password")
def reset_password(request_data: ResetPasswordRequest):
    if len(request_data.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    try:
        user_resp = auth_supabase.auth.get_user(request_data.token)
        if not user_resp.user:
            raise HTTPException(status_code=401, detail="Invalid or expired reset link")

        db_supabase.auth.admin.update_user_by_id(
            user_resp.user.id,
            {"password": request_data.new_password},
        )
        return {"message": "Password updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        print("RESET PASSWORD ERROR:", repr(e))
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(key="access_token",  httponly=True, secure=COOKIE_SECURE, samesite=COOKIE_SAMESITE)
    response.delete_cookie(key="refresh_token", httponly=True, secure=COOKIE_SECURE, samesite=COOKIE_SAMESITE)
    return {"message": "Logout successful"}


@router.post("/refresh")
def refresh(request: Request, response: Response):
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        auth_response = auth_supabase.auth.refresh_session(refresh_token)
        if not auth_response.session:
            raise HTTPException(status_code=401, detail="Invalid refresh token")
        response.set_cookie(
            key="access_token",
            value=auth_response.session.access_token,
            httponly=True,
            secure=COOKIE_SECURE,
            samesite=COOKIE_SAMESITE,
            max_age=60 * 60,
        )
        response.set_cookie(
            key="refresh_token",
            value=auth_response.session.refresh_token,
            httponly=True,
            secure=COOKIE_SECURE,
            samesite=COOKIE_SAMESITE,
            max_age=60 * 60 * 24 * 7,
        )
        return {"message": "Token refreshed"}
    except HTTPException:
        raise
    except Exception as e:
        print("REFRESH ERROR:", repr(e))
        raise HTTPException(status_code=401, detail="Token refresh failed")


@router.get("/token")
def get_token(request: Request, current_user=Depends(get_current_user)):
    # User is already verified; safe to hand back the cookie value for WS auth
    return {"access_token": request.cookies.get("access_token")}


@router.get("/userchecker")
def auth_me(current_user=Depends(get_current_user)):
    return {
        "id":         current_user["id"],
        "email":      current_user["email"],
        "first_name": current_user["first_name"],
        "last_name":  current_user["last_name"],
        "is_admin":   current_user["is_admin"],
    }
