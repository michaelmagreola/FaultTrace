"""Login directory — minimal public fields only (no floor/rank internals)."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Employee

router = APIRouter(tags=["employees"])


class LoginDirectoryRow(BaseModel):
    """Fields needed for the demo login email picker only."""

    id: int
    email: str
    full_name: str
    role: str
    active: bool


@router.get("/employees", response_model=list[LoginDirectoryRow])
def list_active_employees(db: Session = Depends(get_db)) -> list[LoginDirectoryRow]:
    rows = (
        db.query(Employee)
        .filter(Employee.active.is_(True))
        .order_by(Employee.role, Employee.full_name)
        .all()
    )
    return [
        LoginDirectoryRow(
            id=e.id,
            email=e.email,
            full_name=e.full_name,
            role=e.role,
            active=e.active,
        )
        for e in rows
    ]
