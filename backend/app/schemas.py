from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class EmployeeOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    floor_level: str
    function_title: str
    rank_level: str
    shift: str
    active: bool


class SearchRequest(BaseModel):
    query: str = Field(min_length=2, max_length=2000)
    asset_code: Optional[str] = None
    top_k: Optional[int] = None


class WorkOrderHit(BaseModel):
    id: int
    external_id: str
    asset_code: str
    fault_code: str
    symptom: str
    cause: str
    fix: str
    parts_used: str
    minutes_down: int
    score: float
    useful_votes: int = 0


class SearchResponse(BaseModel):
    query: str
    found: bool
    summary: str
    citations: list[str]
    hits: list[WorkOrderHit]
    refusal: bool = False
    ai_mode: str


class CloseOutRequest(BaseModel):
    asset_code: str = Field(min_length=1, max_length=64)
    fault_code: str = Field(default="", max_length=128)
    symptom: str = Field(min_length=2, max_length=4000)
    cause: str = Field(min_length=1, max_length=4000)
    fix: str = Field(min_length=1, max_length=4000)
    parts_used: str = Field(default="", max_length=2000)
    minutes_down: int = Field(ge=0, le=10080, default=0)


class CloseOutResponse(BaseModel):
    id: int
    external_id: str
    message: str


class AssetOut(BaseModel):
    id: int
    code: str
    name: str
    area: str


class AssetHistoryItem(BaseModel):
    external_id: str
    fault_code: str
    symptom: str
    fix: str
    minutes_down: int
    created_at: datetime


class RecurringFaultRow(BaseModel):
    asset_code: str
    fault_key: str
    occurrences: int
    total_minutes_down: int


class FeedbackRequest(BaseModel):
    query_text: str = Field(min_length=1, max_length=2000)
    work_order_id: int
    useful: bool = True
    score: float = 0.0


class FeedbackResponse(BaseModel):
    ok: bool
    useful_votes: int
    message: str


class DowntimeRow(BaseModel):
    asset_code: str
    asset_name: str
    work_order_count: int
    total_minutes_down: int


class PartsStockRow(BaseModel):
    part_name: str
    times_used: int
    assets: list[str]
    related_minutes_down: int
    stock_priority: str  # high | medium | watch


class CauseDowntimeRow(BaseModel):
    cause: str
    occurrences: int
    total_minutes_down: int
    sample_assets: list[str]


class UsefulCaseRow(BaseModel):
    external_id: str
    asset_code: str
    fault_code: str
    symptom: str
    useful_votes: int
    minutes_down: int


class PlannerAction(BaseModel):
    priority: str  # high | medium | info
    title: str
    detail: str
    asset_code: str = ""
    fault_key: str = ""


class SupervisorOverview(BaseModel):
    total_work_orders: int
    total_minutes_down: int
    total_useful_votes: int
    assets_tracked: int
    top_asset_code: str
    top_asset_minutes: int
    recurring: list[RecurringFaultRow]
    downtime_by_asset: list[DowntimeRow]
    downtime_by_cause: list[CauseDowntimeRow]
    parts_to_stock: list[PartsStockRow]
    useful_cases: list[UsefulCaseRow]
    actions: list[PlannerAction]
    meeting_brief: str
