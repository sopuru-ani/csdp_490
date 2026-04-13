"""
main.py

Application entry point. Wires together FastAPI, middleware, and all routers.
Business logic lives in routers/ — nothing should be added here.

Routers:
  auth        — /auth/*            signup, login, logout, token, userchecker
  items       — /items/*           lost/found CRUD, image upload
  matches     — /items/*/matches   AI matching + request/review workflow
  admin       — /admin/*, /report  audit logs, abuse reports
  messaging   — /ws/*, /conversations/*   WebSocket + REST messaging
  users       — /users/*           profile, password, privacy settings
  pushsubs    — /push/*            web push subscriptions
"""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler
from dotenv import load_dotenv

from routers.dependencies import limiter
from routers import auth, items, matches, admin, messaging, users, pushsubs

load_dotenv()

# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="UMES AI Lost & Found API",
    description="Backend for the campus lost and found system",
    version="1.0.0",
)

# ── Rate limiting ─────────────────────────────────────────────────────────────

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── CORS ──────────────────────────────────────────────────────────────────────

frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url, "http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(auth.router)
app.include_router(items.router)
app.include_router(matches.router)
app.include_router(admin.router)
app.include_router(messaging.router)
app.include_router(users.router)
app.include_router(pushsubs.router)

# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/")
def read_root():
    return {"message": "AI Lost and Found API is running"}
