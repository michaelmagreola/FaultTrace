"""Answer generation — local template now; Bedrock Claude later."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.config import settings
from app.models import WorkOrder


def summarize_hits(
    db: Session,
    query: str,
    hits: list[tuple[WorkOrder, float]],
) -> tuple[str, list[str], bool]:
    """
    Returns (summary, citation_external_ids, refusal).
    Refusal when no hit clears retrieval_min_score.
    """
    strong = [(wo, score) for wo, score in hits if score >= settings.retrieval_min_score]
    if not strong:
        return (
            "No sufficiently similar work orders were found in the maintenance history. "
            "Do not invent a procedure. Escalate to a senior technician or OEM documentation, "
            "and link controlled safety procedures from the document library.",
            [],
            True,
        )

    citations = [wo.external_id for wo, _ in strong]
    if settings.ai_mode == "bedrock":
        # Placeholder for Bedrock Converse API with citation-forcing system prompt.
        summary = _local_summary(query, strong)
        summary = "[bedrock-pending] " + summary
        return summary, citations, False

    return _local_summary(query, strong), citations, False


def _local_summary(query: str, strong: list[tuple[WorkOrder, float]]) -> str:
    lines = [
        f"Based on {len(strong)} similar prior work order(s) for query “{query.strip()}”:",
        "",
    ]
    for wo, score in strong[:3]:
        lines.append(
            f"- {wo.external_id} (score {score:.2f}): Cause “{wo.cause or 'n/a'}”. "
            f"Fix “{wo.fix or 'n/a'}”. Parts: {wo.parts_used or 'n/a'}."
        )
    lines.append("")
    lines.append(
        "Technician decision required. Safety procedures must be opened from the controlled "
        "document set — this assistant never generates safety steps."
    )
    return "\n".join(lines)
