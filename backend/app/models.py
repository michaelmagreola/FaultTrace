from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Employee(Base):
    """Plant directory — admin-managed users for floor / rank / function access."""

    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(32), index=True)  # technician | planner | admin
    floor_level: Mapped[str] = mapped_column(String(64), default="")  # e.g. Floor 1, Cell 12
    function_title: Mapped[str] = mapped_column(String(128), default="")  # job function
    rank_level: Mapped[str] = mapped_column(String(64), default="")  # e.g. Tech II, Lead, Supervisor
    shift: Mapped[str] = mapped_column(String(64), default="")  # Day / Night only
    # PBKDF2 hash (or legacy plaintext until migrate_passwords runs). Cognito replaces this in prod.
    password: Mapped[str] = mapped_column(String(255), default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class LoginEvent(Base):
    """Audit trail of successful app sign-ins (admin visibility)."""

    __tablename__ = "login_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[Optional[int]] = mapped_column(ForeignKey("employees.id"), nullable=True)
    email: Mapped[str] = mapped_column(String(255), index=True)
    full_name: Mapped[str] = mapped_column(String(255), default="")
    role: Mapped[str] = mapped_column(String(32), index=True)
    floor_level: Mapped[str] = mapped_column(String(64), default="")
    shift: Mapped[str] = mapped_column(String(64), default="")
    logged_in_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    area: Mapped[str] = mapped_column(String(128), default="")

    work_orders: Mapped[list[WorkOrder]] = relationship(back_populates="asset")


class WorkOrder(Base):
    __tablename__ = "work_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    external_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"), index=True)
    fault_code: Mapped[str] = mapped_column(String(64), default="", index=True)
    symptom: Mapped[str] = mapped_column(Text)
    cause: Mapped[str] = mapped_column(Text, default="")
    fix: Mapped[str] = mapped_column(Text, default="")
    parts_used: Mapped[str] = mapped_column(Text, default="")
    minutes_down: Mapped[int] = mapped_column(Integer, default=0)
    useful_votes: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Stored as JSON string of floats for local mode; migrate to Vector(dim) with pgvector in prod
    embedding_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    asset: Mapped[Asset] = relationship(back_populates="work_orders")


class RetrievalFeedback(Base):
    __tablename__ = "retrieval_feedback"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    query_text: Mapped[str] = mapped_column(Text)
    work_order_id: Mapped[int] = mapped_column(ForeignKey("work_orders.id"))
    useful: Mapped[bool] = mapped_column(default=True)
    score: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
