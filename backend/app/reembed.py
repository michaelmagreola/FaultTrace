"""Re-embed all work orders (run after changing retrieval.py)."""

from __future__ import annotations

from app.db import SessionLocal
from app.models import WorkOrder
from app.retrieval import embed_text, embedding_to_json


def reembed() -> None:
    db = SessionLocal()
    try:
        rows = db.query(WorkOrder).all()
        for wo in rows:
            blob = " ".join([wo.fault_code, wo.symptom, wo.cause, wo.fix, wo.parts_used or ""])
            wo.embedding_json = embedding_to_json(embed_text(blob))
        db.commit()
        print(f"Re-embedded {len(rows)} work orders.")
    finally:
        db.close()


if __name__ == "__main__":
    reembed()
