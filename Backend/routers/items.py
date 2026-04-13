"""
routers/items.py

Lost & found item CRUD and image upload.

ENDPOINTS:
  POST   /items/lost          — report a lost item
  POST   /items/found         — report a found item
  GET    /items/mine          — list the current user's open items
  POST   /items/upload        — upload images to Supabase Storage
  GET    /items/all           — list all open items (admin only)
  PUT    /items/{item_id}     — update an item (owner only)
  DELETE /items/{item_id}     — delete an item and its images (owner only)
"""

import uuid
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Request, Depends, File, UploadFile
from pydantic import BaseModel

from routers.dependencies import (
    db_supabase,
    limiter,
    get_current_user,
    require_admin,
    log_action,
)

router = APIRouter(prefix="/items", tags=["items"])


# ── Request models ────────────────────────────────────────────────────────────

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


# ── Helper ────────────────────────────────────────────────────────────────────

def _attach_signed_urls(items: list) -> list:
    """Generate signed storage URLs for each item's image_paths in-place."""
    for item in items:
        paths = item.get("image_paths") or []
        signed = []
        for path in paths:
            try:
                result = db_supabase.storage.from_("item-images").create_signed_url(
                    path=path, expires_in=3600
                )
                signed.append(result["signedURL"])
            except Exception as e:
                print("SIGNED URL ERROR:", repr(e))
                signed.append(None)
        item["signed_urls"] = signed
    return items


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/lost")
@limiter.limit("20/minute")
def create_lost_item(
    request: Request,
    item: LostItemCreate,
    current_user=Depends(get_current_user),
):
    try:
        result = db_supabase.table("items").insert({
            "user_id":       current_user["id"],
            "item_type":     "lost",
            "item_name":     item.item_name,
            "description":   item.description,
            "location":      item.location,
            "category":      item.category,
            "date_lost_from": item.date_lost_from,
            "date_lost_to":  item.date_lost_to,
            "image_paths":   item.image_paths,
        }).execute()

        return {"message": "Lost item reported successfully", "item": result.data[0]}

    except Exception as e:
        print("CREATE LOST ITEM ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/found")
@limiter.limit("20/minute")
def create_found_item(
    request: Request,
    item: FoundItemCreate,
    current_user=Depends(get_current_user),
):
    try:
        result = db_supabase.table("items").insert({
            "user_id":     current_user["id"],
            "item_type":   "found",
            "item_name":   item.item_name,
            "description": item.description,
            "location":    item.location,
            "category":    item.category,
            "date_found":  item.date_found,
            "image_paths": item.image_paths,
        }).execute()

        return {"message": "Found item reported successfully", "item": result.data[0]}

    except Exception as e:
        print("CREATE FOUND ITEM ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/mine")
def get_my_items(current_user=Depends(get_current_user)):
    try:
        response = db_supabase.table("items") \
            .select("*") \
            .eq("user_id", current_user["id"]) \
            .eq("status", "open") \
            .order("created_at", desc=True) \
            .execute()

        return {"items": _attach_signed_urls(response.data)}

    except Exception as e:
        print("GET MY ITEMS ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload")
async def upload_item_images(
    files: List[UploadFile] = File(...),
    current_user=Depends(get_current_user),
):
    user_id = current_user["id"]
    today   = date.today().isoformat()
    uploaded_paths = []

    for file in files:
        storage_path = f"{user_id}/{today}/{uuid.uuid4()}_{file.filename}"
        file_bytes   = await file.read()
        try:
            db_supabase.storage.from_("item-images").upload(
                path=storage_path,
                file=file_bytes,
                file_options={"content-type": file.content_type},
            )
            uploaded_paths.append(storage_path)
        except Exception as e:
            print("UPLOAD ERROR:", repr(e))
            raise HTTPException(status_code=500, detail=f"Failed to upload {file.filename}: {str(e)}")

    return {
        "message": f"{len(uploaded_paths)} file(s) uploaded successfully",
        "paths":   uploaded_paths,
    }


@router.get("/all")
def get_all_items(current_user=Depends(require_admin)):
    try:
        response = db_supabase.table("items") \
            .select("*, users(first_name, last_name, email)") \
            .eq("status", "open") \
            .order("created_at", desc=True) \
            .execute()

        return {"items": _attach_signed_urls(response.data)}

    except Exception as e:
        print("GET ALL ITEMS ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{item_id}")
def update_item(
    item_id: str,
    item: ItemUpdate,
    current_user=Depends(get_current_user),
):
    try:
        existing = db_supabase.table("items") \
            .select("*") \
            .eq("id", item_id) \
            .eq("user_id", current_user["id"]) \
            .single() \
            .execute()

        if not existing.data:
            raise HTTPException(status_code=404, detail="Item not found or not yours")

        updates = {k: v for k, v in item.dict().items() if v is not None}
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")

        response = db_supabase.table("items") \
            .update(updates) \
            .eq("id", item_id) \
            .execute()

        return {"message": "Item updated successfully", "item": response.data[0]}

    except HTTPException:
        raise
    except Exception as e:
        print("UPDATE ITEM ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{item_id}")
def delete_item(item_id: str, current_user=Depends(get_current_user)):
    try:
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

        # Remove pending matches first to satisfy FK constraints
        db_supabase.table("matches") \
            .delete() \
            .eq("source_item_id", item_id) \
            .eq("status", "pending") \
            .execute()

        db_supabase.table("items").delete().eq("id", item_id).execute()

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
            details={
                "item_name": existing.data.get("item_name"),
                "item_type": existing.data.get("item_type"),
            },
        )

        return {"message": "Item deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        print("DELETE ITEM ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))
