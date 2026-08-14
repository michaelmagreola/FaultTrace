from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import Principal, get_principal
from app.config import settings
from app.db import get_db
from app.generation import summarize_hits
from app.retrieval import retrieve
from app.schemas import SearchRequest, SearchResponse, WorkOrderHit

router = APIRouter(tags=["search"])


@router.post("/search", response_model=SearchResponse)
def search(
    body: SearchRequest,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> SearchResponse:
    _ = principal  # role available for future audit logging
    try:
        hits = retrieve(db, body.query, asset_code=body.asset_code, top_k=body.top_k)
        summary, citations, refusal = summarize_hits(db, body.query, hits)
    except Exception:
        # Surface as 500 via global handler, but keep db session clean
        db.rollback()
        raise

    payload_hits: list[WorkOrderHit] = []
    for wo, score in hits:
        payload_hits.append(
            WorkOrderHit(
                id=wo.id,
                external_id=wo.external_id,
                asset_code=wo.asset.code if wo.asset else "",
                fault_code=wo.fault_code or "",
                symptom=wo.symptom or "",
                cause=wo.cause or "",
                fix=wo.fix or "",
                parts_used=wo.parts_used or "",
                minutes_down=int(wo.minutes_down or 0),
                score=round(float(score), 4),
                useful_votes=int(wo.useful_votes or 0),
            )
        )

    return SearchResponse(
        query=body.query,
        found=not refusal,
        summary=summary or "",
        citations=citations or [],
        hits=payload_hits,
        refusal=refusal,
        ai_mode=settings.ai_mode,
    )
