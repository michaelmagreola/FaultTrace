import logging
import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from app.api import admin, assets, auth, employees, feedback, health, issues, search, work_orders
from app.config import settings
from app.db import Base, ensure_sqlite_columns, engine, migrate_plaintext_passwords
from app.errors import register_exception_handlers

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

# Ensure tables exist on boot (SQLite local / first run)
Base.metadata.create_all(bind=engine)
ensure_sqlite_columns()
migrate_plaintext_passwords()

app = FastAPI(
    title="FaultTrace API",
    description="Retrieval-grounded maintenance knowledge for plant technicians",
    version="0.1.0",
)

register_exception_handlers(app)

_cors_origins = settings.cors_origins
_allow_cred = True
if _cors_origins == ["*"]:
    # Browsers forbid credentialed CORS with wildcard; same-origin App Runner deploy does not need it.
    _allow_cred = False

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins if _cors_origins else ["*"],
    allow_credentials=_allow_cred,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "X-FaultTrace-Session",
    ],
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        # API responses should not be cached by shared browsers/proxies
        if request.url.path.startswith("/api") or request.url.path == "/health":
            response.headers["Cache-Control"] = "no-store"
        return response


app.add_middleware(SecurityHeadersMiddleware)

app.include_router(health.router)
app.include_router(search.router, prefix="/api")
app.include_router(work_orders.router, prefix="/api")
app.include_router(assets.router, prefix="/api")
app.include_router(feedback.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(employees.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(issues.router, prefix="/api")

# Production / App Runner: serve the Vite build from the same origin as the API.
_static_dir = Path(os.environ.get("STATIC_DIR", "")).resolve()
if _static_dir.is_dir() and (_static_dir / "index.html").is_file():
    assets_dir = _static_dir / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/")
    def spa_index() -> FileResponse:
        return FileResponse(_static_dir / "index.html")

    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str) -> FileResponse:
        candidate = _static_dir / full_path
        if candidate.is_file() and _static_dir in candidate.resolve().parents:
            return FileResponse(candidate)
        return FileResponse(_static_dir / "index.html")
