"""Login against the employee directory — issues signed session tokens."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Employee, LoginEvent
from app.schemas import EmployeeOut
from app.security import (
    check_login_rate_limit,
    clear_login_failures,
    create_session_token,
    record_login_failure,
    verify_password,
)

router = APIRouter(tags=["auth"])

# Demo-friendly aliases (UI says "Supervisor" but seed email is planner@…).
_EMAIL_ALIASES: dict[tuple[str, str], str] = {
    ("planner", "supervisor@cardinal.local"): "planner@cardinal.local",
    ("planner", "supervisor@cardinal.com"): "planner@cardinal.local",
    ("admin", "administrator@cardinal.local"): "admin@cardinal.local",
}


def _normalize_login_email(role: str, email: str) -> str:
    cleaned = email.strip().lower()
    return _EMAIL_ALIASES.get((role, cleaned), cleaned)


class LoginRequest(BaseModel):
    role: str = Field(pattern="^(technician|planner|admin)$")
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=1, max_length=128)


class LoginResponse(BaseModel):
    ok: bool
    employee: EmployeeOut
    first_name: str
    welcome: str
    session_token: str
    token_type: str = "bearer"


def _client_key(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host or "unknown"
    return "unknown"


@router.post("/auth/login", response_model=LoginResponse)
def login(
    body: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> LoginResponse:
    key = _client_key(request)
    try:
        check_login_rate_limit(key)
    except ValueError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc

    email = _normalize_login_email(body.role, body.email)
    emp = (
        db.query(Employee)
        .filter(Employee.email == email, Employee.role == body.role)
        .one_or_none()
    )
    if not emp or not emp.active or not verify_password(body.password, emp.password):
        record_login_failure(key)
        # Generic message — avoid account enumeration
        raise HTTPException(
            status_code=401,
            detail="Invalid email, role, or password.",
        )

    clear_login_failures(key)

    event = LoginEvent(
        employee_id=emp.id,
        email=emp.email,
        full_name=emp.full_name,
        role=emp.role,
        floor_level=emp.floor_level or "",
        shift=emp.shift or "",
        logged_in_at=datetime.now(timezone.utc),
    )
    db.add(event)
    db.commit()

    first = (emp.full_name or "").strip().split()[0] or emp.full_name
    token = create_session_token(emp.email, emp.role)
    return LoginResponse(
        ok=True,
        employee=EmployeeOut(
            id=emp.id,
            email=emp.email,
            full_name=emp.full_name,
            role=emp.role,
            floor_level=emp.floor_level,
            function_title=emp.function_title,
            rank_level=emp.rank_level,
            shift=emp.shift,
            active=emp.active,
        ),
        first_name=first,
        welcome=f"Welcome {first}",
        session_token=token,
    )


@router.get("/auth/resolve")
def resolve_employee(role: str, email: str, db: Session = Depends(get_db)):
    """Resolve email + role to a display name (for the login form)."""
    if role not in {"technician", "planner", "admin"}:
        raise HTTPException(status_code=400, detail="Invalid role")
    email = _normalize_login_email(role, email)
    emp = (
        db.query(Employee)
        .filter(
            Employee.email == email,
            Employee.role == role,
            Employee.active.is_(True),
        )
        .one_or_none()
    )
    if not emp:
        return {"found": False, "full_name": "", "first_name": ""}
    first = (emp.full_name or "").strip().split()[0] or emp.full_name
    return {"found": True, "full_name": emp.full_name, "first_name": first}
