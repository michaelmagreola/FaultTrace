"""Spread work-order created_at across recent days so supervisor charts have data."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.db import SessionLocal
from app.models import WorkOrder

# Offsets in days before "now" — cycles across seed WOs
DAY_OFFSETS = [0, 1, 1, 2, 3, 5, 7, 9, 12, 14, 18, 21, 25, 30, 35, 40, 45, 55, 70, 90]


def backdate_work_orders() -> None:
    db = SessionLocal()
    try:
        rows = db.query(WorkOrder).order_by(WorkOrder.id).all()
        if not rows:
            print("No work orders to backdate.")
            return
        now = datetime.now(timezone.utc)
        for i, wo in enumerate(rows):
            offset = DAY_OFFSETS[i % len(DAY_OFFSETS)]
            # Stagger hours so same-day WOs aren't identical
            wo.created_at = now - timedelta(days=offset, hours=(i % 8) + 1)
        db.commit()
        print(f"Backdated {len(rows)} work orders across ~{max(DAY_OFFSETS)} days.")
    finally:
        db.close()


if __name__ == "__main__":
    backdate_work_orders()
