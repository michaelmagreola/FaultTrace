"""Supervisor issue trend charts — daily / weekly / monthly."""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import Principal, get_principal
from app.db import get_db
from app.models import WorkOrder

router = APIRouter(tags=["supervisor-charts"])


class IssueBucket(BaseModel):
    label: str
    period_start: str
    issue_count: int
    minutes_down: int
    top_fault: str
    top_asset: str


class IssuesTrend(BaseModel):
    period: str
    buckets: list[IssueBucket]
    peak_label: str
    peak_count: int
    total_issues: int


def _require_planner(principal: Principal) -> None:
    if principal.role not in {"planner", "admin"}:
        raise HTTPException(status_code=403, detail="Planner or admin role required")


def _as_utc_date(dt: datetime | None) -> date | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.date()
    return dt.astimezone(timezone.utc).date()


def _week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())  # Monday


def _month_start(d: date) -> date:
    return date(d.year, d.month, 1)


@router.get("/supervisor/issues-trend", response_model=IssuesTrend)
def issues_trend(
    period: str = Query(default="daily", pattern="^(daily|weekly|monthly)$"),
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> IssuesTrend:
    _require_planner(principal)
    today = datetime.now(timezone.utc).date()
    rows = db.query(WorkOrder).all()

    if period == "daily":
        starts = [today - timedelta(days=i) for i in range(13, -1, -1)]
        labels = [s.strftime("%b %d") for s in starts]

        def key_fn(d: date) -> date:
            return d

        bucket_keys = starts
    elif period == "weekly":
        this_week = _week_start(today)
        starts = [this_week - timedelta(weeks=i) for i in range(7, -1, -1)]
        labels = [f"Wk {s.strftime('%b %d')}" for s in starts]

        def key_fn(d: date) -> date:
            return _week_start(d)

        bucket_keys = starts
    else:
        y, m = today.year, today.month
        starts = []
        for i in range(5, -1, -1):
            mm = m - i
            yy = y
            while mm <= 0:
                mm += 12
                yy -= 1
            starts.append(date(yy, mm, 1))
        labels = [s.strftime("%b %Y") for s in starts]

        def key_fn(d: date) -> date:
            return _month_start(d)

        bucket_keys = starts

    counts: dict[date, int] = defaultdict(int)
    minutes: dict[date, int] = defaultdict(int)
    faults: dict[date, list[str]] = defaultdict(list)
    assets: dict[date, list[str]] = defaultdict(list)
    allowed = set(bucket_keys)

    for wo in rows:
        d = _as_utc_date(wo.created_at)
        if d is None:
            continue
        key = key_fn(d)
        if key not in allowed:
            continue
        counts[key] += 1
        minutes[key] += wo.minutes_down or 0
        faults[key].append((wo.fault_code or "UNSPEC").upper())
        assets[key].append(wo.asset.code if wo.asset else "UNKNOWN")

    buckets: list[IssueBucket] = []
    for start, label in zip(bucket_keys, labels):
        flist = faults.get(start, [])
        alist = assets.get(start, [])
        top_fault = Counter(flist).most_common(1)[0][0] if flist else "—"
        top_asset = Counter(alist).most_common(1)[0][0] if alist else "—"
        buckets.append(
            IssueBucket(
                label=label,
                period_start=start.isoformat(),
                issue_count=counts.get(start, 0),
                minutes_down=minutes.get(start, 0),
                top_fault=top_fault,
                top_asset=top_asset,
            )
        )

    peak = max(buckets, key=lambda b: b.issue_count) if buckets else None
    return IssuesTrend(
        period=period,
        buckets=buckets,
        peak_label=peak.label if peak and peak.issue_count else "—",
        peak_count=peak.issue_count if peak else 0,
        total_issues=sum(b.issue_count for b in buckets),
    )
