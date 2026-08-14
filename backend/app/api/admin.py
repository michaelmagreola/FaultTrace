"""Admin-only controls — full system access beyond the planner desk."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import Principal, get_principal
from app.config import settings
from app.db import get_db
from app.models import Asset, Employee, LoginEvent, RetrievalFeedback, WorkOrder
from app.retrieval import embed_text, embedding_to_json
from app.schemas import AssetOut, EmployeeOut
from app.security import hash_password

router = APIRouter(tags=["admin"])


def _require_admin(principal: Principal) -> None:
    if principal.role != "admin":
        raise HTTPException(status_code=403, detail="Admin role required")


class AdminStatus(BaseModel):
    app: str
    auth_mode: str
    ai_mode: str
    database_url_safe: str
    retrieval_top_k: int
    retrieval_min_score: float
    asset_count: int
    work_order_count: int
    feedback_count: int
    total_useful_votes: int
    login_count: int = 0
    access: str = "full"


class FeedbackRow(BaseModel):
    id: int
    query_text: str
    work_order_external_id: str
    useful: bool
    score: float


class CreateAssetRequest(BaseModel):
    code: str = Field(min_length=2, max_length=64)
    name: str = Field(min_length=2, max_length=255)
    area: str = Field(default="", max_length=128)


class ReembedResponse(BaseModel):
    ok: bool
    reembedded: int
    message: str


class RoleDirectoryRow(BaseModel):
    role: str
    email: str
    access: str


class LoginEventOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    floor_level: str
    shift: str
    logged_in_at: str  # ISO-8601 UTC with Z
    logged_in_local: str  # human-readable local time for admin UI


class CreateEmployeeRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    full_name: str = Field(min_length=2, max_length=255)
    role: str = Field(pattern="^(technician|planner|admin)$")
    floor_level: str = Field(default="", max_length=64)
    function_title: str = Field(default="", max_length=128)
    rank_level: str = Field(default="", max_length=64)
    shift: str = Field(default="Day", pattern="^(Day|Night)$")
    password: str = Field(default="ADMIN", min_length=1, max_length=128)


class UpdateEmployeeRequest(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=255)
    role: str | None = Field(default=None, pattern="^(technician|planner|admin)$")
    floor_level: str | None = Field(default=None, max_length=64)
    function_title: str | None = Field(default=None, max_length=128)
    rank_level: str | None = Field(default=None, max_length=64)
    shift: str | None = Field(default=None, max_length=64)
    active: bool | None = None


def _employee_out(e: Employee) -> EmployeeOut:
    return EmployeeOut(
        id=e.id,
        email=e.email,
        full_name=e.full_name,
        role=e.role,
        floor_level=e.floor_level,
        function_title=e.function_title,
        rank_level=e.rank_level,
        shift=e.shift,
        active=e.active,
    )


def _format_login_time(dt: datetime | None) -> tuple[str, str]:
    """Return (iso_utc_z, local_display)."""
    if dt is None:
        return "", ""
    if dt.tzinfo is None:
        # Older rows from SQLite func.now() — treat as UTC for consistency
        dt_utc = dt.replace(tzinfo=timezone.utc)
    else:
        dt_utc = dt.astimezone(timezone.utc)
    iso = dt_utc.isoformat().replace("+00:00", "Z")
    local = dt_utc.astimezone().strftime("%b %d, %Y, %I:%M:%S %p")
    return iso, local


@router.get("/admin/status", response_model=AdminStatus)
def admin_status(
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> AdminStatus:
    _require_admin(principal)
    db_url = settings.database_url
    # Never echo passwords
    safe = db_url.split("@")[-1] if "@" in db_url else db_url
    if "://" in db_url:
        scheme = db_url.split("://", 1)[0]
        safe = f"{scheme}://***@{safe}" if "@" in db_url else db_url

    wos = db.query(WorkOrder).all()
    return AdminStatus(
        app=settings.app_name,
        auth_mode=settings.auth_mode,
        ai_mode=settings.ai_mode,
        database_url_safe=safe,
        retrieval_top_k=settings.retrieval_top_k,
        retrieval_min_score=settings.retrieval_min_score,
        asset_count=db.query(Asset).count(),
        work_order_count=len(wos),
        feedback_count=db.query(RetrievalFeedback).count(),
        total_useful_votes=sum(w.useful_votes for w in wos),
        login_count=db.query(LoginEvent).count(),
        access="full",
    )


@router.get("/admin/employees", response_model=list[EmployeeOut])
def list_employees_admin(
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> list[EmployeeOut]:
    _require_admin(principal)
    rows = db.query(Employee).order_by(Employee.role, Employee.full_name).all()
    return [_employee_out(e) for e in rows]


@router.get("/admin/logins", response_model=list[LoginEventOut])
def list_logins(
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> list[LoginEventOut]:
    """Who signed into FaultTrace — newest first."""
    _require_admin(principal)
    rows = (
        db.query(LoginEvent)
        .order_by(LoginEvent.id.desc())
        .limit(200)
        .all()
    )
    out: list[LoginEventOut] = []
    for r in rows:
        iso, local = _format_login_time(r.logged_in_at)
        out.append(
            LoginEventOut(
                id=r.id,
                email=r.email,
                full_name=r.full_name,
                role=r.role,
                floor_level=r.floor_level,
                shift=r.shift,
                logged_in_at=iso,
                logged_in_local=local,
            )
        )
    return out


@router.post("/admin/employees", response_model=EmployeeOut)
def create_employee(
    body: CreateEmployeeRequest,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> EmployeeOut:
    _require_admin(principal)
    email = body.email.strip().lower()
    if "@" not in email:
        raise HTTPException(status_code=400, detail="Valid email required")
    if db.query(Employee).filter(Employee.email == email).one_or_none():
        raise HTTPException(status_code=409, detail=f"Employee {email} already exists")
    emp = Employee(
        email=email,
        full_name=body.full_name.strip(),
        role=body.role,
        floor_level=body.floor_level.strip(),
        function_title=body.function_title.strip(),
        rank_level=body.rank_level.strip(),
        shift=body.shift.strip() or "Day",
        password=hash_password((body.password or "ADMIN").strip()),
        active=True,
    )
    db.add(emp)
    db.commit()
    db.refresh(emp)
    return _employee_out(emp)


@router.patch("/admin/employees/{employee_id}", response_model=EmployeeOut)
def update_employee(
    employee_id: int,
    body: UpdateEmployeeRequest,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> EmployeeOut:
    _require_admin(principal)
    emp = db.query(Employee).filter(Employee.id == employee_id).one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    data = body.model_dump(exclude_unset=True)
    for key, value in data.items():
        if isinstance(value, str):
            value = value.strip()
        setattr(emp, key, value)
    db.commit()
    db.refresh(emp)
    return _employee_out(emp)


@router.delete("/admin/employees/{employee_id}")
def delete_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> dict[str, str | bool]:
    """Permanently remove an account. Login history rows are kept (employee_id cleared)."""
    _require_admin(principal)
    emp = db.query(Employee).filter(Employee.id == employee_id).one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    if emp.email.lower() == principal.email.lower():
        raise HTTPException(status_code=400, detail="You cannot delete your own account.")

    if emp.role == "admin":
        other_admins = (
            db.query(Employee)
            .filter(
                Employee.role == "admin",
                Employee.active.is_(True),
                Employee.id != emp.id,
            )
            .count()
        )
        if other_admins == 0:
            raise HTTPException(
                status_code=400,
                detail="Cannot delete the last active admin account.",
            )

    # Keep sign-in audit trail; detach FK before delete
    db.query(LoginEvent).filter(LoginEvent.employee_id == emp.id).update(
        {LoginEvent.employee_id: None},
        synchronize_session=False,
    )
    name = emp.full_name
    email = emp.email
    db.delete(emp)
    db.commit()
    return {
        "ok": True,
        "message": f"Deleted account {name} ({email}).",
    }


@router.get("/admin/feedback", response_model=list[FeedbackRow])
def admin_feedback(
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> list[FeedbackRow]:
    _require_admin(principal)
    rows = (
        db.query(RetrievalFeedback)
        .order_by(RetrievalFeedback.created_at.desc())
        .limit(50)
        .all()
    )
    out: list[FeedbackRow] = []
    for r in rows:
        wo = db.query(WorkOrder).filter(WorkOrder.id == r.work_order_id).one_or_none()
        out.append(
            FeedbackRow(
                id=r.id,
                query_text=r.query_text,
                work_order_external_id=wo.external_id if wo else f"#{r.work_order_id}",
                useful=r.useful,
                score=r.score,
            )
        )
    return out


@router.get("/admin/roles", response_model=list[RoleDirectoryRow])
def admin_roles(principal: Principal = Depends(get_principal)) -> list[RoleDirectoryRow]:
    _require_admin(principal)
    return [
        RoleDirectoryRow(
            role="technician",
            email="tech@cardinal.local",
            access="Search, close-out, asset history",
        ),
        RoleDirectoryRow(
            role="planner",
            email="planner@cardinal.local",
            access="Supervisor desk (downtime, parts, meeting brief) + technician tools",
        ),
        RoleDirectoryRow(
            role="admin",
            email="admin@cardinal.local",
            access="Full access: all planner tools + system console, assets, corpus, audit",
        ),
    ]


@router.post("/admin/assets", response_model=AssetOut)
def create_asset(
    body: CreateAssetRequest,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> AssetOut:
    _require_admin(principal)
    code = body.code.strip().upper()
    if db.query(Asset).filter(Asset.code == code).one_or_none():
        raise HTTPException(status_code=409, detail=f"Asset {code} already exists")
    asset = Asset(code=code, name=body.name.strip(), area=body.area.strip())
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return AssetOut(id=asset.id, code=asset.code, name=asset.name, area=asset.area)


@router.post("/admin/reembed", response_model=ReembedResponse)
def reembed_corpus(
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> ReembedResponse:
    _require_admin(principal)
    rows = db.query(WorkOrder).all()
    for wo in rows:
        blob = " ".join([wo.fault_code, wo.symptom, wo.cause, wo.fix, wo.parts_used or ""])
        wo.embedding_json = embedding_to_json(embed_text(blob))
    db.commit()
    return ReembedResponse(
        ok=True,
        reembedded=len(rows),
        message=f"Re-embedded {len(rows)} work orders for retrieval.",
    )
