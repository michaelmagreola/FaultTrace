from collections import Counter, defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import Principal, get_principal
from app.db import get_db
from app.models import Asset, WorkOrder
from app.schemas import (
    AssetHistoryItem,
    AssetOut,
    CauseDowntimeRow,
    DowntimeRow,
    PartsStockRow,
    PlannerAction,
    RecurringFaultRow,
    SupervisorOverview,
    UsefulCaseRow,
)

router = APIRouter(tags=["assets"])


def _require_planner(principal: Principal) -> None:
    if principal.role not in {"planner", "admin"}:
        raise HTTPException(status_code=403, detail="Planner or admin role required")


@router.get("/assets", response_model=list[AssetOut])
def list_assets(
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> list[AssetOut]:
    _ = principal
    assets = db.query(Asset).order_by(Asset.code).all()
    return [AssetOut(id=a.id, code=a.code, name=a.name, area=a.area) for a in assets]


@router.get("/assets/{code}/history", response_model=list[AssetHistoryItem])
def asset_history(
    code: str,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> list[AssetHistoryItem]:
    _ = principal
    asset = db.query(Asset).filter(Asset.code == code).one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    rows = (
        db.query(WorkOrder)
        .filter(WorkOrder.asset_id == asset.id)
        .order_by(WorkOrder.created_at.desc())
        .limit(100)
        .all()
    )
    return [
        AssetHistoryItem(
            external_id=r.external_id,
            fault_code=r.fault_code,
            symptom=r.symptom,
            fix=r.fix,
            minutes_down=r.minutes_down,
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.get("/supervisor/recurring", response_model=list[RecurringFaultRow])
def recurring_faults(
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> list[RecurringFaultRow]:
    _require_planner(principal)
    return _build_recurring(db.query(WorkOrder).all())


@router.get("/supervisor/downtime", response_model=list[DowntimeRow])
def downtime_by_asset(
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> list[DowntimeRow]:
    _require_planner(principal)
    return _build_downtime(db)


@router.get("/supervisor/overview", response_model=SupervisorOverview)
def supervisor_overview(
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> SupervisorOverview:
    """Planner / plant-manager dashboard for the weekly production meeting."""
    _require_planner(principal)

    try:
        work_orders = db.query(WorkOrder).all()
        assets = db.query(Asset).all()
        recurring = _build_recurring(work_orders)
        downtime = _build_downtime(db)
        by_cause = _build_causes(work_orders)
        parts = _build_parts(work_orders)
    except Exception:
        db.rollback()
        raise
    useful = _build_useful(work_orders)
    actions = _build_actions(recurring, downtime, parts, by_cause)

    total_minutes = sum(w.minutes_down for w in work_orders)
    total_useful = sum(w.useful_votes for w in work_orders)
    top = downtime[0] if downtime else None

    brief_lines = [
        f"Weekly maintenance brief — {len(work_orders)} closed work orders, "
        f"{total_minutes} total minutes down across {len(assets)} assets.",
    ]
    if top:
        brief_lines.append(
            f"Highest downtime asset: {top.asset_code} ({top.asset_name}) at "
            f"{top.total_minutes_down} minutes across {top.work_order_count} work orders."
        )
    if recurring:
        r0 = recurring[0]
        brief_lines.append(
            f"Top recurring fault: {r0.fault_key} on {r0.asset_code} "
            f"({r0.occurrences}x, {r0.total_minutes_down} min)."
        )
    if parts:
        brief_lines.append(
            "Parts to review for stock: " + ", ".join(p.part_name for p in parts[:3]) + "."
        )
    if by_cause:
        brief_lines.append(
            f"Leading cause theme: “{by_cause[0].cause}” "
            f"({by_cause[0].total_minutes_down} min)."
        )
    brief_lines.append(
        f"Technician useful votes on suggested prior cases: {total_useful}."
    )

    return SupervisorOverview(
        total_work_orders=len(work_orders),
        total_minutes_down=total_minutes,
        total_useful_votes=total_useful,
        assets_tracked=len(assets),
        top_asset_code=top.asset_code if top else "",
        top_asset_minutes=top.total_minutes_down if top else 0,
        recurring=recurring,
        downtime_by_asset=downtime,
        downtime_by_cause=by_cause,
        parts_to_stock=parts,
        useful_cases=useful,
        actions=actions,
        meeting_brief="\n".join(brief_lines),
    )


def _build_recurring(rows: list[WorkOrder]) -> list[RecurringFaultRow]:
    bucket: dict[tuple[str, str], list[WorkOrder]] = defaultdict(list)
    for wo in rows:
        key = (wo.asset.code if wo.asset else "UNKNOWN", (wo.fault_code or "UNSPEC").upper())
        bucket[key].append(wo)

    out: list[RecurringFaultRow] = []
    for (asset_code, fault_key), items in bucket.items():
        out.append(
            RecurringFaultRow(
                asset_code=asset_code,
                fault_key=fault_key,
                occurrences=len(items),
                total_minutes_down=sum(i.minutes_down for i in items),
            )
        )
    out.sort(key=lambda r: (r.total_minutes_down, r.occurrences), reverse=True)
    return out[:50]


def _build_downtime(db: Session) -> list[DowntimeRow]:
    assets = db.query(Asset).order_by(Asset.code).all()
    rows: list[DowntimeRow] = []
    for asset in assets:
        wos = db.query(WorkOrder).filter(WorkOrder.asset_id == asset.id).all()
        rows.append(
            DowntimeRow(
                asset_code=asset.code,
                asset_name=asset.name,
                work_order_count=len(wos),
                total_minutes_down=sum(w.minutes_down for w in wos),
            )
        )
    rows.sort(key=lambda r: r.total_minutes_down, reverse=True)
    return rows


def _build_causes(rows: list[WorkOrder]) -> list[CauseDowntimeRow]:
    bucket: dict[str, list[WorkOrder]] = defaultdict(list)
    for wo in rows:
        cause = (wo.cause or "unspecified").strip().lower()
        bucket[cause].append(wo)
    out: list[CauseDowntimeRow] = []
    for cause, items in bucket.items():
        assets = sorted({i.asset.code for i in items if i.asset})
        out.append(
            CauseDowntimeRow(
                cause=cause,
                occurrences=len(items),
                total_minutes_down=sum(i.minutes_down for i in items),
                sample_assets=assets[:4],
            )
        )
    out.sort(key=lambda r: r.total_minutes_down, reverse=True)
    return out[:20]


def _build_parts(rows: list[WorkOrder]) -> list[PartsStockRow]:
    # part_name -> (count, assets set, minutes)
    stats: dict[str, dict] = {}
    for wo in rows:
        raw = (wo.parts_used or "").strip()
        if not raw:
            continue
        # Split on commas / semicolons for multi-part close-outs
        pieces = [p.strip() for p in raw.replace(";", ",").split(",") if p.strip()]
        for part in pieces:
            key = part.lower()
            if key not in stats:
                stats[key] = {"name": part, "count": 0, "assets": set(), "minutes": 0}
            stats[key]["count"] += 1
            if wo.asset:
                stats[key]["assets"].add(wo.asset.code)
            stats[key]["minutes"] += wo.minutes_down

    out: list[PartsStockRow] = []
    for item in stats.values():
        count = item["count"]
        minutes = item["minutes"]
        if count >= 2 or minutes >= 100:
            priority = "high"
        elif count >= 1 and minutes >= 45:
            priority = "medium"
        else:
            priority = "watch"
        out.append(
            PartsStockRow(
                part_name=item["name"],
                times_used=count,
                assets=sorted(item["assets"]),
                related_minutes_down=minutes,
                stock_priority=priority,
            )
        )
    out.sort(key=lambda r: (r.stock_priority != "high", -r.related_minutes_down, -r.times_used))
    return out[:25]


def _build_useful(rows: list[WorkOrder]) -> list[UsefulCaseRow]:
    ranked = sorted(rows, key=lambda w: (w.useful_votes, w.minutes_down), reverse=True)
    out: list[UsefulCaseRow] = []
    for wo in ranked[:10]:
        if wo.useful_votes <= 0 and len(out) >= 3:
            continue
        out.append(
            UsefulCaseRow(
                external_id=wo.external_id,
                asset_code=wo.asset.code if wo.asset else "",
                fault_code=wo.fault_code,
                symptom=wo.symptom,
                useful_votes=wo.useful_votes,
                minutes_down=wo.minutes_down,
            )
        )
    return out[:8]


def _build_actions(
    recurring: list[RecurringFaultRow],
    downtime: list[DowntimeRow],
    parts: list[PartsStockRow],
    causes: list[CauseDowntimeRow],
) -> list[PlannerAction]:
    actions: list[PlannerAction] = []
    for r in recurring[:3]:
        if r.occurrences >= 2 or r.total_minutes_down >= 100:
            actions.append(
                PlannerAction(
                    priority="high",
                    title=f"Investigate recurring {r.fault_key} on {r.asset_code}",
                    detail=(
                        f"{r.occurrences} occurrences, {r.total_minutes_down} minutes down. "
                        "Open asset history and schedule a root-cause review with the cell lead."
                    ),
                    asset_code=r.asset_code,
                    fault_key=r.fault_key,
                )
            )
    for p in parts:
        if p.stock_priority == "high":
            actions.append(
                PlannerAction(
                    priority="high",
                    title=f"Stock check: {p.part_name}",
                    detail=(
                        f"Used {p.times_used} time(s) on {', '.join(p.assets)}; "
                        f"linked to {p.related_minutes_down} minutes of downtime."
                    ),
                )
            )
    if downtime:
        top = downtime[0]
        actions.append(
            PlannerAction(
                priority="medium",
                title=f"Production meeting focus: {top.asset_code}",
                detail=(
                    f"{top.asset_name} leads downtime at {top.total_minutes_down} minutes "
                    f"across {top.work_order_count} work orders."
                ),
                asset_code=top.asset_code,
            )
        )
    if causes:
        c0 = causes[0]
        actions.append(
            PlannerAction(
                priority="info",
                title=f"Cause theme: {c0.cause}",
                detail=(
                    f"{c0.occurrences} work orders / {c0.total_minutes_down} min. "
                    f"Assets: {', '.join(c0.sample_assets) or 'n/a'}."
                ),
            )
        )
    # Deduplicate by title while preserving order
    seen: set[str] = set()
    unique: list[PlannerAction] = []
    for a in actions:
        if a.title in seen:
            continue
        seen.add(a.title)
        unique.append(a)
    return unique[:8]
