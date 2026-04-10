import os
import re
from click import prompt
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Response, Request, Depends, File, UploadFile
from typing import List, Optional
import uuid
from datetime import date
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from supabase import create_client, Client
from google.generativeai import types
from routers import notifications, pushsubs
import httpx


# Rate limiting imports (optional, can be configured as needed)
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Initialize the rate limiter (e.g., 100 requests per hour per IP)
import google.generativeai as genai

limiter = Limiter(key_func=get_remote_address)

load_dotenv()

# Load Gemini API key and configure the client

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel("gemini-2.5-flash-lite")

# Load Supabase configuration from environment variables
supabase_url=os.getenv("SUPABASE_URL")
supabase_anon_key=os.getenv("SUPABASE_ANON_KEY")
supabase_service_role_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY")
frontend_url=os.getenv("FRONTEND_URL", "http://localhost:5173")
frontend_urls_raw = os.getenv("FRONTEND_URLS", "")
vercel_project_slug = os.getenv("VERCEL_PROJECT_SLUG", "csdp-490")

def env_flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "t", "yes", "y", "on"}

allowed_origins = {
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://csdp490.qr-manager.net"
}

if frontend_url:
    allowed_origins.add(frontend_url.rstrip("/"))

for origin in frontend_urls_raw.split(","):
    cleaned_origin = origin.strip().rstrip("/")
    if cleaned_origin:
        allowed_origins.add(cleaned_origin)

vercel_origin_regex = rf"^https://{re.escape(vercel_project_slug)}(?:-[a-z0-9-]+)?\.vercel\.app$"

is_production = env_flag("PRODUCTION", False) or os.getenv("ENV", "").lower() == "production" or os.getenv("RENDER") is not None
cookie_secure = env_flag("COOKIE_SECURE", is_production)
cookie_samesite = (os.getenv("COOKIE_SAMESITE") or ("none" if cookie_secure else "lax")).strip().lower()
if cookie_samesite == "none":
    cookie_secure = True
if cookie_samesite not in {"lax", "strict", "none"}:
    raise ValueError("COOKIE_SAMESITE must be one of: lax, strict, none")
cookie_domain = (os.getenv("COOKIE_DOMAIN") or "").strip() or None

# Ensure all required environment variables are set
if not supabase_url or not supabase_anon_key:
    raise ValueError("SUPABASE_URL and SUPABASE_ANON_KEY must be set in the .env file. Missing!")

auth_supabase: Client = create_client(supabase_url, supabase_anon_key)
db_supabase: Client = create_client(supabase_url, supabase_service_role_key)

# create the API object
app = FastAPI(
    title="UMES AI Lost & Found API",
    description="Backend for the campus lost and found system",
    version="1.0.0"
)
# Attach the rate limiter to the app and set up the exception handler for when the rate limit is exceeded. 
# This will help protect the API from abuse by limiting the number of requests a client can make in a given time period.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(allowed_origins),
    allow_origin_regex=vercel_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# app.include_router(notifications.router)
app.include_router(pushsubs.router)

class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    first_name: str
    last_name: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


# This function logs user actions to an "audit_logs" table in the database.

def log_action(actor_id: str, action: str, target_type: str = None, target_id: str = None, details: dict = None):
    try:
        db_supabase.table("audit_logs").insert({
            "actor_id": actor_id,
            "action": action,
            "target_type": target_type,
            "target_id": target_id,
            "details": details or {}
        }).execute()
    except Exception as e:
        print("AUDIT LOG ERROR:", repr(e))

# root endpoint
@app.get("/")
def read_root():
    return {"message": "AI Lost and Found API is running"}

@app.post("/auth/signup")
@limiter.limit("5/minute")
def signup(request: Request, request_data: SignupRequest):
    try:
        auth_response = auth_supabase.auth.sign_up(
            {
                "email": request_data.email,
                "password": request_data.password,
                "options": {
                    "data": {
                        "firstName": request_data.first_name,
                        "lastName": request_data.last_name
                    }
                }
            }
        )
        if not auth_response.user:
            raise HTTPException(status_code=400, detail="Signup failed: no user returned")

        user_id = auth_response.user.id

        insert_response = db_supabase.table("users").insert(
            {
                "id": user_id,
                "first_name": request_data.first_name,
                "last_name": request_data.last_name,
                "email": request_data.email,
                "is_admin": False
            }
        ).execute()

        print("INSERT RESPONSE:", insert_response)

        return {
            "message": "Signup successful. Please check your email to confirm your account.",
            "user_id": user_id,
            "email": auth_response.user.email
        }

    except Exception as e:
        print("SIGNUP ERROR:", repr(e))
        raise HTTPException(status_code=400, detail=str(e))
    
@app.post("/auth/login")
@limiter.limit("10/minute")
def login(request: Request, request_data: LoginRequest, response: Response):
    try:
        auth_response = auth_supabase.auth.sign_in_with_password(
            {
                "email": request_data.email,
                "password": request_data.password
            }
        )

        if not auth_response.user or not auth_response.session:
            raise HTTPException(status_code=401, detail="Invalid login credentials")

        access_token = auth_response.session.access_token
        refresh_token = auth_response.session.refresh_token

        response.set_cookie(
            key="access_token",
            value=access_token,
            httponly=True,
            secure=cookie_secure,
            samesite=cookie_samesite,
            max_age=60 * 60,
            path="/",
            domain=cookie_domain,
        )

        response.set_cookie(
            key="refresh_token",
            value=refresh_token,
            httponly=True,
            secure=cookie_secure,
            samesite=cookie_samesite,
            max_age=60 * 60 * 24 * 7,
            path="/",
            domain=cookie_domain,
        )

        return {
            "message": "Login successful",
            "user": auth_response.user.email
        }

    except Exception as e:
        print("LOGIN ERROR:", repr(e))
        raise HTTPException(status_code=401, detail=str(e))
    
@app.post("/auth/logout")
def logout(response: Response):
    response.delete_cookie(key="access_token", path="/", domain=cookie_domain)
    response.delete_cookie(key="refresh_token", path="/", domain=cookie_domain)
    return {"message": "Logout successful"}

def get_current_user(request: Request):
    access_token = request.cookies.get("access_token")
    authorization = request.headers.get("authorization")

    if not access_token and authorization and authorization.lower().startswith("bearer "):
        access_token = authorization.split(" ", 1)[1].strip()

    if not access_token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        # Verify token with Supabase Auth
        user_response = auth_supabase.auth.get_user(access_token)

        if not user_response.user:
            raise HTTPException(status_code=401, detail="Invalid token")

        auth_user = user_response.user
        user_id = auth_user.id

        # Pull the app user from your users table
        db_user_response = db_supabase.table("users") \
            .select("*") \
            .eq("id", user_id) \
            .single() \
            .execute()

        if not db_user_response.data:
            raise HTTPException(status_code=404, detail="User record not found")

        return db_user_response.data

    except HTTPException:
        raise
    except Exception as e:
        print("GET CURRENT USER ERROR:", repr(e))
        raise HTTPException(status_code=401, detail="Invalid session")

@app.get("/auth/userchecker")
def auth_me(current_user=Depends(get_current_user)):
    return {
        "id": current_user["id"],
        "email": current_user["email"],
        "first_name": current_user["first_name"],
        "last_name": current_user["last_name"],
        "is_admin": current_user["is_admin"]
    }

class LostItemCreate(BaseModel):
    item_name: str
    description: str
    location: str
    category: str
    date_lost_from: Optional[str] = None
    date_lost_to: Optional[str] = None
    image_paths: List[str] = []

class FoundItemCreate(BaseModel):
    item_name: str
    description: str
    location: str
    category: str
    date_found: Optional[str] = None
    image_paths: List[str] = []

class ItemUpdate(BaseModel):
    item_name: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    category: Optional[str] = None
    date_lost_from: Optional[str] = None
    date_lost_to: Optional[str] = None
    date_found: Optional[str] = None


# This endpoint allows users to create a new lost item report. 
# It requires authentication and associates the new item with the current user.
@app.post("/items/lost")
@limiter.limit("20/minute")
def create_lost_item(
    request: Request,
    item: LostItemCreate,
    current_user=Depends(get_current_user)
):
    try:
        insert_response = db_supabase.table("items").insert({
            "user_id": current_user["id"],
            "item_type": "lost",
            "item_name": item.item_name,
            "description": item.description,
            "location": item.location,
            "category": item.category,
            "date_lost_from": item.date_lost_from,
            "date_lost_to": item.date_lost_to,
            "image_paths": item.image_paths
        }).execute()

        return {
            "message": "Lost item reported successfully",
            "item": insert_response.data[0]
        }
    except Exception as e:
        print("CREATE LOST ITEM ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))

# This endpoint allows users to create a new found item report. 
# Like the lost item endpoint, it requires authentication and associates the new item with the current user
@app.post("/items/found")
@limiter.limit("20/minute")
def create_found_item(
    request: Request,
    item: FoundItemCreate,
    current_user=Depends(get_current_user)
):
    try:
        insert_response = db_supabase.table("items").insert({
            "user_id": current_user["id"],
            "item_type": "found",
            "item_name": item.item_name,
            "description": item.description,
            "location": item.location,
            "category": item.category,
            "date_found": item.date_found,
            "image_paths": item.image_paths
        }).execute()

        return {
            "message": "Found item reported successfully",
            "item": insert_response.data[0]
        }
    except Exception as e:
        print("CREATE FOUND ITEM ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))
    
# This endpoint retrieves all items reported by the currently authenticated user.    
@app.get("/items/mine")
def get_my_items(current_user=Depends(get_current_user)):
    try:
        response = db_supabase.table("items") \
            .select("*") \
            .eq("user_id", current_user["id"]) \
            .eq("status", "open") \
            .order("created_at", desc=True) \
            .execute()

        items = response.data

        # For each item, generate signed URLs for its images
        for item in items:
            paths = item.get("image_paths") or []
            signed_urls = []
            for path in paths:
                try:
                    result = db_supabase.storage.from_("item-images").create_signed_url(
                        path=path,
                        expires_in=3600  # URL valid for 1 hour
                    )
                    signed_urls.append(result["signedURL"])
                except Exception as e:
                    print("SIGNED URL ERROR:", repr(e))
                    signed_urls.append(None)
            item["signed_urls"] = signed_urls

        return {"items": items}

    except Exception as e:
        print("GET MY ITEMS ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))

# This endpoint allows users to upload multiple images for an item. 
# It generates a unique storage path for each image based on the user ID, current date, and a UUID. 
# The images are stored in the "item-images" bucket in Supabase Storage.
@app.post("/items/upload")
async def upload_item_images(
    files: List[UploadFile] = File(...),
    current_user=Depends(get_current_user)
):
    user_id = current_user["id"]
    today = date.today().isoformat()   # e.g. "2025-03-16"
    uploaded_paths = []

    for file in files:
        # Build a unique path: user_id/date/uuid_originalname
        unique_filename = f"{uuid.uuid4()}_{file.filename}"
        storage_path = f"{user_id}/{today}/{unique_filename}"

        file_bytes = await file.read()

        try:
            db_supabase.storage.from_("item-images").upload(
                path=storage_path,
                file=file_bytes,
                file_options={"content-type": file.content_type}
            )
            uploaded_paths.append(storage_path)
        except Exception as e:
            print("UPLOAD ERROR:", repr(e))
            raise HTTPException(status_code=500, detail=f"Failed to upload {file.filename}: {str(e)}")

    return {
        "message": f"{len(uploaded_paths)} file(s) uploaded successfully",
        "paths": uploaded_paths
    }

#This endpoint checks if the current user is an admin. If not, it raises a 403 error.
def require_admin(current_user=Depends(get_current_user)):
    if not current_user["is_admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

# This endpoint retrieves all lost and found items in the system. 
# It is protected by the require_admin dependency, so only admin users can access it.
@app.get("/items/all")
def get_all_items(current_user=Depends(require_admin)):
    try:
        response = db_supabase.table("items") \
            .select("*, users(first_name, last_name, email)") \
            .eq("status", "open") \
            .order("created_at", desc=True) \
            .execute()

        items = response.data

        for item in items:
            paths = item.get("image_paths") or []
            signed_urls = []
            for path in paths:
                try:
                    result = db_supabase.storage.from_("item-images").create_signed_url(
                        path=path,
                        expires_in=3600
                    )
                    signed_urls.append(result["signedURL"])
                except Exception as e:
                    print("SIGNED URL ERROR:", repr(e))
                    signed_urls.append(None)
            item["signed_urls"] = signed_urls

        return {"items": items}

    except Exception as e:
        print("GET ALL ITEMS ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))
    

# This endpoint allows users to update their own items. 
# It first checks if the item belongs to the current user, then applies any provided updates.
# Note: For simplicity, this endpoint allows updating both lost and found items. 
# In a real application, you might want to separate these or add additional validation.
@app.put("/items/{item_id}")
def update_item(
    item_id: str,
    item: ItemUpdate,
    current_user=Depends(get_current_user)
):
    try:
        # First confirm this item belongs to the current user
        existing = db_supabase.table("items") \
            .select("*") \
            .eq("id", item_id) \
            .eq("user_id", current_user["id"]) \
            .single() \
            .execute()

        if not existing.data:
            raise HTTPException(status_code=404, detail="Item not found or not yours")

        # Only update fields that were actually provided
        updates = {k: v for k, v in item.dict().items() if v is not None}

        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")

        response = db_supabase.table("items") \
            .update(updates) \
            .eq("id", item_id) \
            .execute()

        return {
            "message": "Item updated successfully",
            "item": response.data[0]
        }

    except HTTPException:
        raise
    except Exception as e:
        print("UPDATE ITEM ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/items/{item_id}/matches")
@limiter.limit("5/minute")
@limiter.limit("30/day")
async def find_matches(request: Request, item_id: str, current_user=Depends(get_current_user)):
    try:
        # Step 1: fetch source item
        item_response = db_supabase.table("items") \
            .select("*") \
            .eq("id", item_id) \
            .eq("user_id", current_user["id"]) \
            .single() \
            .execute()

        if not item_response.data:
            raise HTTPException(status_code=404, detail="Item not found or not yours")

        source_item = item_response.data
        opposite_type = "found" if source_item["item_type"] == "lost" else "lost"

        # Step 2: fetch candidates — category filter first, fallback to all
        candidates_response = db_supabase.table("items") \
            .select("*") \
            .eq("item_type", opposite_type) \
            .eq("category", source_item["category"]) \
            .eq("status", "open") \
            .neq("user_id", current_user["id"]) \
            .execute()

        candidates = candidates_response.data

        if not candidates:
            candidates_response = db_supabase.table("items") \
                .select("*") \
                .eq("item_type", opposite_type) \
                .eq("status", "open") \
                .neq("user_id", current_user["id"]) \
                .execute()
            candidates = candidates_response.data

        if not candidates:
            return {"matches": [], "message": "No items to compare against yet."}

        # Step 3: build text prompt
        source_summary = f"""
Item type: {source_item['item_type']}
Name: {source_item['item_name']}
Category: {source_item['category']}
Description: {source_item['description']}
Location: {source_item['location']}
"""

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
        has_images = len(image_paths) > 0
        image_note = "Photos of the target item are attached — use them alongside the text descriptions when scoring candidates." if has_images else ""

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

        # Step 4: fetch source item images and build contents list

        contents = []
        images_added = 0

        async with httpx.AsyncClient(timeout=10) as http:
            for path in image_paths[:3]:  # max 3 images
                try:
                    signed = db_supabase.storage.from_("item-images").create_signed_url(
                        path=path,
                        expires_in=300
                    )
                    img_res = await http.get(signed["signedURL"])
                    if img_res.status_code == 200:
                        mime = img_res.headers.get("content-type", "image/jpeg").split(";")[0]
                        contents.append(
                            types.Part.from_bytes(
                                data=img_res.content,
                                mime_type=mime
                            )
                        )
                        images_added += 1
                except Exception as e:
                    print("IMAGE FETCH ERROR:", repr(e))

        # Always add the text prompt last
        contents.append(prompt)

        # Step 5: call Gemini
        response = model.generate_content(contents)
        raw = response.text.strip() 

        # Step 6: parse JSON response
        import json
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

        # Step 7: enrich matches with full item data and signed URLs
        candidates_by_id = {c["id"]: c for c in candidates}
        enriched_matches = []

        for match in match_results:
            item_data = candidates_by_id.get(match["id"])
            if item_data:
                matched_paths = item_data.get("image_paths") or []
                matched_urls = []
                for path in matched_paths:
                    try:
                        result = db_supabase.storage.from_("item-images").create_signed_url(
                            path=path,
                            expires_in=3600
                        )
                        matched_urls.append(result["signedURL"])
                    except Exception:
                        pass
                item_data["signed_urls"] = matched_urls

                enriched_matches.append({
                    "score": match["score"],
                    "reason": match["reason"],
                    "item": item_data
                })

        return {
            "source_item_id": item_id,
            "matches": enriched_matches,
            "images_used": images_added
        }

    except HTTPException:
        raise
    except Exception as e:
        print("MATCHING ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e)) 


# This endpoint allows users to request a match between their item and a candidate item.
@app.post("/items/{item_id}/matches/request")
def request_match(
    item_id: str,
    body: dict,
    current_user=Depends(get_current_user)
):
    matched_item_id = body.get("matched_item_id")
    similarity_score = body.get("similarity_score")
    reason = body.get("reason")

    if not matched_item_id:
        raise HTTPException(status_code=400, detail="matched_item_id is required")

    try:
        # Confirm source item belongs to this user
        source = db_supabase.table("items") \
            .select("*") \
            .eq("id", item_id) \
            .eq("user_id", current_user["id"]) \
            .single() \
            .execute()

        if not source.data:
            raise HTTPException(status_code=404, detail="Item not found or not yours")

        # Check if this match pair already exists and is pending
        existing = db_supabase.table("matches") \
            .select("id") \
            .eq("source_item_id", item_id) \
            .eq("matched_item_id", matched_item_id) \
            .eq("status", "pending") \
            .execute()

        if existing.data:
            raise HTTPException(status_code=400, detail="A match request for this pair already exists.")

        insert = db_supabase.table("matches").insert({
            "source_item_id": item_id,
            "matched_item_id": matched_item_id,
            "similarity_score": similarity_score,
            "reason": reason,
            "status": "pending",
            "requested_by": current_user["id"]
        }).execute()

        log_action(
            actor_id=current_user["id"],
            action="match_requested",
            target_type="match",
            target_id=insert.data[0]["id"],
            details={"source_item_id": item_id, "matched_item_id": matched_item_id, "score": similarity_score}
        )

        return {
            "message": "Match requested. An admin will review it shortly.",
            "match": insert.data[0]
        }

    except HTTPException:
        raise
    except Exception as e:
        print("REQUEST MATCH ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))


# This endpoint allows users to view all their match requests, including the status and details of each match.
@app.get("/items/my-matches")
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

# This endpoint allows admin users to view all pending match requests in the system,
# along with details about the source and matched items and the user who requested the match.
@app.get("/admin/matches")
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


# This endpoint allows admin users to review a specific match request by approving or rejecting it.
##########################################################################################
class MatchReviewBody(BaseModel):
    decision: str  # "approved" or "rejected"

@app.put("/admin/matches/{match_id}/review")
def review_match(
    match_id: str,
    body: MatchReviewBody,
    current_user=Depends(require_admin)
):
    if body.decision not in ["approved", "rejected"]:
        raise HTTPException(status_code=400, detail="Decision must be 'approved' or 'rejected'")

    try:
        from datetime import datetime

        # Fetch the match first so we know which items to close
        match_response = db_supabase.table("matches") \
            .select("*") \
            .eq("id", match_id) \
            .single() \
            .execute()

        if not match_response.data:
            raise HTTPException(status_code=404, detail="Match not found")

        match = match_response.data

        # Update match status
        db_supabase.table("matches").update({
            "status": body.decision,
            "reviewed_by": current_user["id"],
            "reviewed_at": datetime.utcnow().isoformat()
        }).eq("id", match_id).execute()

#This function logs the admin's review action to the audit_logs table, 
# recording who made the decision, 
# what the decision was, 
# and details about the match that was reviewed.
        log_action(
            actor_id=current_user["id"],
            action=f"match_{body.decision}",
            target_type="match",
            target_id=match_id,
            details={"decision": body.decision, "similarity_score": match.get("similarity_score")}
        )

        # If approved, close both items
        if body.decision == "approved":
            # Close both items
            db_supabase.table("items").update({"status": "closed"}) \
                .eq("id", match["source_item_id"]).execute()
            db_supabase.table("items").update({"status": "closed"}) \
                .eq("id", match["matched_item_id"]).execute()

            # Fetch both items to get their owner IDs
            source = db_supabase.table("items").select("user_id") \
                .eq("id", match["source_item_id"]).single().execute()
            matched = db_supabase.table("items").select("user_id") \
                .eq("id", match["matched_item_id"]).single().execute()

            # Create conversation between the two owners
            db_supabase.table("conversations").insert({
                "match_id": match_id,
                "user_one_id": source.data["user_id"],
                "user_two_id": matched.data["user_id"]
            }).execute()

        return {
            "message": f"Match {body.decision} successfully.",
            "match_id": match_id
        }

    except HTTPException:
        raise
    except Exception as e:
        print("REVIEW MATCH ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))
###########################################################################

# This endpoint allows admin users to view all completed match requests (approved or rejected), 
# along with details about the source and matched items and the user who requested the match.
@app.get("/admin/matches/completed")
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

# This endpoint allows users to delete their own items, but only if the item is still open and has no pending matches.
@app.delete("/items/{item_id}")
def delete_item(
    item_id: str,
    current_user=Depends(get_current_user)
):
    try:
        # Confirm item belongs to this user and is still open
        existing = db_supabase.table("items") \
            .select("*") \
            .eq("id", item_id) \
            .eq("user_id", current_user["id"]) \
            .single() \
            .execute()

        if not existing.data:
            raise HTTPException(status_code=404, detail="Item not found or not yours")

        if existing.data.get("status") == "closed":
            raise HTTPException(status_code=400, detail="Closed items cannot be deleted")

        # Delete any pending matches involving this item first
        db_supabase.table("matches") \
            .delete() \
            .eq("source_item_id", item_id) \
            .eq("status", "pending") \
            .execute()

        # Delete the item
        db_supabase.table("items") \
            .delete() \
            .eq("id", item_id) \
            .execute()

        # Clean up storage images
        paths = existing.data.get("image_paths") or []
        if paths:
            try:
                db_supabase.storage.from_("item-images").remove(paths)
            except Exception as e:
                print("STORAGE CLEANUP ERROR:", repr(e))


        log_action(
            actor_id=current_user["id"],
            action="item_deleted",
            target_type="item",
            target_id=item_id,
            details={"item_name": existing.data.get("item_name"), "item_type": existing.data.get("item_type")}
        )

        return {"message": "Item deleted successfully"}
    

    except HTTPException:
        raise
    except Exception as e:
        print("DELETE ITEM ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))


# This endpoint retrieves all conversations that the current user is a part of, along with the latest message and match details for each conversation.
@app.get("/conversations")
def get_my_conversations(current_user=Depends(get_current_user)):
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

# This endpoint retrieves all messages for a specific conversation, but only if the current user is a participant in that conversation.    
@app.get("/conversations/{conversation_id}/messages")
def get_messages(
    conversation_id: str,
    current_user=Depends(get_current_user)
):
    try:
        user_id = current_user["id"]

        # Verify user belongs to this conversation
        convo = db_supabase.table("conversations") \
            .select("*") \
            .eq("id", conversation_id) \
            .or_(f"user_one_id.eq.{user_id},user_two_id.eq.{user_id}") \
            .single() \
            .execute()

        if not convo.data:
            raise HTTPException(status_code=403, detail="Not your conversation")

# Fetch messages with sender info
        messages = db_supabase.table("messages") \
            .select("*, sender:users!messages_sender_id_fkey(id, first_name, last_name)") \
            .eq("conversation_id", conversation_id) \
            .order("created_at", desc=False) \
            .execute()

        # Mark messages as read
        # Only mark as read if there are unread messages
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


# This endpoint allows a user to send a message in a specific conversation, but only if they are a participant in that conversation.
# It validates that the message content is not empty and then inserts the new message into the database, associating it with the conversation and the sender.
@app.post("/conversations/{conversation_id}/messages")
@limiter.limit("30/minute")
def send_message(
    request: Request,
    conversation_id: str,
    body: SendMessageBody,
    current_user=Depends(get_current_user)
):
    try:
        user_id = current_user["id"]

        if not body.content.strip():
            raise HTTPException(status_code=400, detail="Message cannot be empty")

        # Verify user belongs to this conversation
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

        log_action(
            actor_id=current_user["id"],
            action="message_sent",
            target_type="conversation",
            target_id=conversation_id,
            details={}
        )

        return {
            "message": "Sent",
            "data": result.data[0]
        }

    except HTTPException:
        raise
    except Exception as e:
        print("SEND MESSAGE ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))
    

# This endpoint retrieves the count of unread messages across all conversations for the current user.
@app.get("/conversations/unread")
def get_unread_count(current_user=Depends(get_current_user)):
    try:
        user_id = current_user["id"]

        # Get all conversation IDs for this user
        convos = db_supabase.table("conversations") \
            .select("id") \
            .or_(f"user_one_id.eq.{user_id},user_two_id.eq.{user_id}") \
            .execute()

        if not convos.data:
            return {"unread": 0}

        convo_ids = [c["id"] for c in convos.data]

        # Count unread messages not sent by this user
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

#Admin endoint to view audit logs with pagination and filtering options.
@app.get("/admin/audit-logs")
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


class AbuseReportCreate(BaseModel):
    target_type: str   # 'message', 'user', or 'item'
    target_id: str
    reported_user_id: Optional[str] = None
    reason: str
    details: Optional[str] = None

# This endpoint allows users to report abuse related to messages, users, or items.
@app.post("/report")
@limiter.limit("5/minute")
def submit_abuse_report(
    request: Request,
    body: AbuseReportCreate,
    current_user=Depends(get_current_user)
):
    valid_types = ["message", "user", "item"]
    valid_reasons = ["spam", "harassment", "false_claim", "inappropriate", "other"]

    if body.target_type not in valid_types:
        raise HTTPException(status_code=400, detail="Invalid target type")
    if body.reason not in valid_reasons:
        raise HTTPException(status_code=400, detail="Invalid reason")

    # Prevent self-reporting
    if body.reported_user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="You cannot report yourself")

    try:
        # Check for duplicate pending report from same user
        existing = db_supabase.table("abuse_reports") \
            .select("id") \
            .eq("reporter_id", current_user["id"]) \
            .eq("target_id", body.target_id) \
            .eq("status", "pending") \
            .execute()

        if existing.data:
            raise HTTPException(
                status_code=400,
                detail="You already have a pending report for this item."
            )

        result = db_supabase.table("abuse_reports").insert({
            "reporter_id": current_user["id"],
            "reported_user_id": body.reported_user_id,
            "target_type": body.target_type,
            "target_id": body.target_id,
            "reason": body.reason,
            "details": body.details,
            "status": "pending"
        }).execute()

        log_action(
            actor_id=current_user["id"],
            action="report_submitted",
            target_type=body.target_type,
            target_id=body.target_id,
            details={"reason": body.reason, "target_type": body.target_type}
        )

        return {
            "message": "Report submitted. Our team will review it shortly.",
            "report_id": result.data[0]["id"]
        }

    except HTTPException:
        raise
    except Exception as e:
        print("SUBMIT REPORT ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))
    

# This endpoint allows admin users to view all pending abuse reports, along with details about the reporter, 
# the reported user, and the content being reported.
@app.get("/admin/reports")
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


# This endpoint allows admin users to review a specific abuse report by marking it as "reviewed" or "dismissed".
class ReportReviewBody(BaseModel):
    decision: str  # 'reviewed' or 'dismissed'

@app.put("/admin/reports/{report_id}/review")
def review_abuse_report(
    report_id: str,
    body: ReportReviewBody,
    current_user=Depends(require_admin)
):
    if body.decision not in ["reviewed", "dismissed"]:
        raise HTTPException(status_code=400, detail="Decision must be 'reviewed' or 'dismissed'")

    try:
        from datetime import datetime

        response = db_supabase.table("abuse_reports") \
            .update({
                "status": body.decision,
                "reviewed_by": current_user["id"],
                "reviewed_at": datetime.utcnow().isoformat()
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
            details={"decision": body.decision}
        )

        return {"message": f"Report {body.decision} successfully."}

    except HTTPException:
        raise
    except Exception as e:
        print("REVIEW REPORT ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))