from fastapi import APIRouter

from app.config import settings

router = APIRouter(tags=["health"])


@router.get("/health")
def health():
    return {
        "status": "ok",
        "app": settings.app_name,
        "auth_mode": settings.auth_mode,
        "ai_mode": settings.ai_mode,
    }
