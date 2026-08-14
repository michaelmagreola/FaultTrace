from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import Principal, get_principal
from app.db import get_db
from app.models import RetrievalFeedback, WorkOrder
from app.schemas import FeedbackRequest, FeedbackResponse

router = APIRouter(tags=["feedback"])


@router.post("/feedback/useful", response_model=FeedbackResponse)
def mark_useful(
    body: FeedbackRequest,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> FeedbackResponse:
    _ = principal
    wo = db.query(WorkOrder).filter(WorkOrder.id == body.work_order_id).one_or_none()
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")

    db.add(
        RetrievalFeedback(
            query_text=body.query_text,
            work_order_id=wo.id,
            useful=body.useful,
            score=body.score,
        )
    )
    if body.useful:
        wo.useful_votes += 1
    db.commit()
    db.refresh(wo)
    return FeedbackResponse(
        ok=True,
        useful_votes=wo.useful_votes,
        message="Thanks — marked useful for retrieval quality tracking.",
    )
