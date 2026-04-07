from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()
subscriptions = []

class PushSubscription(BaseModel):
    subscription: dict
    userId: str

@router.post("/save-subscription")
def save_subscription(request_data: PushSubscription):
    subscriptions.append(request_data)
    print(subscriptions)
    return {"message": "Subscription saved."}