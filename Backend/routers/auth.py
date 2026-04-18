"""
routers/auth.py

Authentication endpoints.

ENDPOINTS:
  POST /auth/signup      — register a new user
  POST /auth/login       — sign in, sets httpOnly cookies
  POST /auth/logout      — clears auth cookies
  GET  /auth/token       — return the raw access token (used by WS auth)
  GET  /auth/userchecker — return the current user's profile
"""

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
    try:
        auth_response = auth_supabase.auth.sign_in_with_password({
            "email":    request_data.email,
            "password": request_data.password,
        })

        if not auth_response.user or not auth_response.session:
            raise HTTPException(status_code=401, detail="Invalid login credentials")

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
        raise HTTPException(status_code=401, detail=str(e))


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
