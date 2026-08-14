from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import Principal, get_principal
from app.db import get_db
from app.models import Asset, WorkOrder
from app.retrieval import embed_text, embedding_to_json
from app.schemas import CloseOutRequest, CloseOutResponse

router = APIRouter(tags=["work_orders"])


@router.post("/work-orders/close-out", response_model=CloseOutResponse)
def close_out(
    body: CloseOutRequest,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> CloseOutResponse:
    if principal.role not in {"technician", "planner", "admin"}:
        raise HTTPException(status_code=403, detail="Insufficient role")

    asset = db.query(Asset).filter(Asset.code == body.asset_code).one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail=f"Unknown asset {body.asset_code}")

    count = db.query(WorkOrder).count() + 1
    external_id = f"WO-{count:05d}"
    blob = " ".join([body.fault_code, body.symptom, body.cause, body.fix, body.parts_used])
    wo = WorkOrder(
        external_id=external_id,
        asset_id=asset.id,
        fault_code=body.fault_code,
        symptom=body.symptom,
        cause=body.cause,
        fix=body.fix,
        parts_used=body.parts_used,
        minutes_down=body.minutes_down,
        embedding_json=embedding_to_json(embed_text(blob)),
    )
    db.add(wo)
    db.commit()
    db.refresh(wo)
    return CloseOutResponse(
        id=wo.id,
        external_id=wo.external_id,
        message="Close-out saved and embedded for future retrieval.",
    )
