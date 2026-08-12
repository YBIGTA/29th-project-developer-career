from pydantic import BaseModel


class TechGap(BaseModel):
    technology: str
    demand_score: float
    ecosystem_score: float
    gap_score: float


class GapResponse(BaseModel):
    job_category: str
    gaps: list[TechGap]


class TechDetail(BaseModel):
    name: str
    category: str | None = None
    ecosystem_score: float | None = None
