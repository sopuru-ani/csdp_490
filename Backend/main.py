import os
from dotenv import load_dotenv

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from supabase import create_client, Client

load_dotenv()


supabase_url=os.getenv("SUPABASE_URL")
supabase_anon_key=os.getenv("SUPABASE_ANON_KEY")
frontend_url=os.getenv("FRONTEND_URL")

if not supabase_url or not supabase_anon_key:
    raise ValueError("SUPABASE_URL and SUPABASE_ANON_KEY must be set in the .env file. Missing!")

supabase: Client = create_client(supabase_url, supabase_anon_key)

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
        response = supabase.auth.sign_up(
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
        return {"message": "Signup successful. Please check your email to confirm your account.", 
                "data": response.user.email if response.user else None, 
                "session": response.session is not None
                }
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    
@app.post("/auth/login")
def login(payload: LoginRequest):
    try:
        response = supabase.auth.sign_in_with_password(
            {
                "email": payload.email,
                "password": payload.password
            }
        )

        return {
            "message": "Login successful",
            "access_token": response.session.access_token if response.session else None,
            "refresh_token": response.session.refresh_token if response.session else None,
            "user": response.user.email if response.user else None
        }

    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))