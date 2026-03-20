import os
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Response, Request, Depends, File, UploadFile
from typing import List, Optional
import uuid
from datetime import date
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from supabase import create_client, Client

load_dotenv()

supabase_url=os.getenv("SUPABASE_URL")
supabase_anon_key=os.getenv("SUPABASE_ANON_KEY")
supabase_service_role_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY")
frontend_url=os.getenv("FRONTEND_URL", "http://localhost:5173")

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],)

class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    first_name: str
    last_name: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

# root endpoint
@app.get("/")
def read_root():
    return {"message": "AI Lost and Found API is running"}

# test endpoint
@app.get("/test")
def test():
    return {"status": "working"}

@app.post("/auth/signup")
def signup(request: SignupRequest):
    try:
        auth_response = auth_supabase.auth.sign_up(
            {
                "email": request.email,
                "password": request.password,
                "options": {
                    "data": {
                        "firstName": request.first_name,
                        "lastName": request.last_name
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
                "first_name": request.first_name,
                "last_name": request.last_name,
                "email": request.email,
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
def login(request_data: LoginRequest, response: Response):
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
            secure=False,      # change to True in production with HTTPS
            samesite="lax",
            max_age=60 * 60
        )

        response.set_cookie(
            key="refresh_token",
            value=refresh_token,
            httponly=True,
            secure=False,      # change to True in production with HTTPS
            samesite="lax",
            max_age=60 * 60 * 24 * 7
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
    response.delete_cookie(key="access_token")
    response.delete_cookie(key="refresh_token")
    return {"message": "Logout successful"}

def get_current_user(request: Request):
    access_token = request.cookies.get("access_token")

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
    access_token = request.cookies.get("access_token")

    if not access_token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        # Get the user associated with this token
        user_response = auth_supabase.auth.get_user(access_token)

        if not user_response.user:
            raise HTTPException(status_code=401, detail="Invalid token")

        user_id = user_response.user.id
        email = user_response.user.email

        # Query your users table
        db_user = db_supabase.table("users") \
            .select("*") \
            .eq("id", user_id) \
            .single() \
            .execute()

        user_data = db_user.data

        return {
            "id": user_id,
            "email": email,
            "first_name": user_data["first_name"],
            "last_name": user_data["last_name"],
            "is_admin": user_data["is_admin"]
        }

    except Exception as e:
        print("AUTH ME ERROR:", repr(e))
        raise HTTPException(status_code=401, detail="Invalid session")

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

@app.post("/items/lost")
def create_lost_item(
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


@app.post("/items/found")
def create_found_item(
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
    
    
@app.get("/items/mine")
def get_my_items(current_user=Depends(get_current_user)):
    try:
        response = db_supabase.table("items") \
            .select("*") \
            .eq("user_id", current_user["id"]) \
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

def require_admin(current_user=Depends(get_current_user)):
    if not current_user["is_admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user
