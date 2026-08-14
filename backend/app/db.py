from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    pass


_connect_args = {}
if settings.database_url.startswith("sqlite"):
    _connect_args = {"check_same_thread": False}

engine = create_engine(
    settings.database_url,
    pool_pre_ping=not settings.database_url.startswith("sqlite"),
    connect_args=_connect_args,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def ensure_sqlite_columns() -> None:
    """Add demo columns that create_all will not alter on existing SQLite tables."""
    if not settings.database_url.startswith("sqlite"):
        return
    with engine.begin() as conn:
        cols = {
            row[1]
            for row in conn.execute(text("PRAGMA table_info(employees)")).fetchall()
        }
        if cols and "password" not in cols:
            conn.execute(
                text("ALTER TABLE employees ADD COLUMN password VARCHAR(255) DEFAULT ''")
            )


def migrate_plaintext_passwords() -> None:
    """Hash any legacy plaintext employee passwords (idempotent)."""
    from app.models import Employee
    from app.security import hash_password

    db = SessionLocal()
    try:
        changed = 0
        for emp in db.query(Employee).all():
            pw = emp.password or ""
            if not pw.startswith("pbkdf2_sha256$"):
                emp.password = hash_password(pw or "ADMIN")
                changed += 1
        if changed:
            db.commit()
    finally:
        db.close()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
